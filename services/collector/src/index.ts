import { R2ReplayObjectStore } from "@pathminty/cloudflare";
import {
  MAX_REPLAY_BATCH_BYTES,
  MAX_SHOPIFY_EVENT_BYTES,
  ReplayBatchSchema,
  ShopifyPixelEventSchema,
  StorefrontInstallationSchema,
  type ErrorResponse,
  type SessionSummaryJob,
} from "@pathminty/contracts";
import { log } from "@pathminty/observability";
import { constantTimeEqual } from "@pathminty/security";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

import { BodyTooLargeError, readCappedBody } from "./body";

const app = new Hono<{ Bindings: Cloudflare.Env }>();
const decoder = new TextDecoder();

app.use("*", secureHeaders());
app.use(
  "/v1/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "X-PathMinty-Site-Token"],
    allowMethods: ["POST", "OPTIONS"],
    maxAge: 86_400,
  }),
);

async function authorizedInstallation(
  shopId: string,
  providedToken: string | undefined,
  installations: KVNamespace,
) {
  if (!providedToken) return false;

  const stored = await installations.get<unknown>(`shop:${shopId}`, "json");
  const parsed = StorefrontInstallationSchema.safeParse(stored);
  if (!parsed.success) return false;

  return constantTimeEqual(providedToken, parsed.data.publicToken);
}

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(decoder.decode(bytes)) as unknown;
}

function errorResponse(
  requestId: string,
  status: 400 | 401 | 413 | 415 | 500,
  code: string,
  message: string,
): Response {
  const body: ErrorResponse = { error: { code, message, requestId } };
  return Response.json(body, { status });
}

app.get("/healthz", (context) =>
  context.json({
    service: "collector",
    status: "ok",
    environment: context.env.ENVIRONMENT,
  }),
);

app.post("/v1/replay-batches", async (context) => {
  const requestId = crypto.randomUUID();

  try {
    const contentType = context.req.header("content-type")?.split(";", 1)[0];
    if (contentType !== "application/json") {
      return errorResponse(
        requestId,
        415,
        "unsupported_media_type",
        "Content-Type must be application/json",
      );
    }

    const bytes = await readCappedBody(context.req.raw, MAX_REPLAY_BATCH_BYTES);
    let input: unknown;
    try {
      input = parseJson(bytes);
    } catch {
      return errorResponse(requestId, 400, "invalid_json", "Body is not valid JSON");
    }

    const result = ReplayBatchSchema.safeParse(input);
    if (!result.success) {
      return errorResponse(
        requestId,
        400,
        "invalid_batch",
        "Replay batch does not match the current contract",
      );
    }

    const authorized = await authorizedInstallation(
      result.data.shopId,
      context.req.header("x-pathminty-site-token"),
      context.env.SHOPIFY_INSTALLATIONS,
    );
    if (!authorized) {
      return errorResponse(requestId, 401, "tenant_mismatch", "Site token is invalid");
    }

    const objectStore = new R2ReplayObjectStore(context.env.REPLAY_BUCKET);
    // Deterministic key includes sequence + batchId; retries with the same pair are
    // idempotent and concurrent pagehide races cannot clobber a different batch.
    await objectStore.putChunk(result.data, bytes);

    // Every accepted batch enqueues summary work so active/hover-only sessions
    // appear in the dashboard within one polling interval.
    const job: SessionSummaryJob = {
      schemaVersion: 1,
      jobId: crypto.randomUUID(),
      shopId: result.data.shopId,
      sessionId: result.data.sessionId,
      sequence: result.data.sequence,
      isFinal: result.data.isFinal,
      enqueuedAt: new Date().toISOString(),
    };
    await context.env.SESSION_JOBS.send(job, { contentType: "json" });

    log("info", "replay_batch_accepted", {
      requestId,
      batchId: result.data.batchId,
      shopId: result.data.shopId,
      sessionId: result.data.sessionId,
      sequence: result.data.sequence,
      isFinal: result.data.isFinal,
      encoding: result.data.encoding,
      bytes: bytes.byteLength,
    });

    return context.json({ accepted: true as const, batchId: result.data.batchId }, 202);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return errorResponse(
        requestId,
        413,
        "body_too_large",
        "Replay batch exceeds the configured limit",
      );
    }

    log("error", "replay_batch_failed", { requestId }, error);
    return errorResponse(requestId, 500, "internal_error", "Unable to accept batch");
  }
});

app.post("/v1/shopify-events", async (context) => {
  const requestId = crypto.randomUUID();

  try {
    const contentType = context.req.header("content-type")?.split(";", 1)[0];
    if (contentType !== "application/json") {
      return errorResponse(
        requestId,
        415,
        "unsupported_media_type",
        "Content-Type must be application/json",
      );
    }

    const bytes = await readCappedBody(context.req.raw, MAX_SHOPIFY_EVENT_BYTES);
    let input: unknown;
    try {
      input = parseJson(bytes);
    } catch {
      return errorResponse(requestId, 400, "invalid_json", "Body is not valid JSON");
    }

    const result = ShopifyPixelEventSchema.safeParse(input);
    if (!result.success) {
      return errorResponse(
        requestId,
        400,
        "invalid_event",
        "Event does not match the current contract",
      );
    }

    const authorized = await authorizedInstallation(
      result.data.shopId,
      context.req.header("x-pathminty-site-token"),
      context.env.SHOPIFY_INSTALLATIONS,
    );
    if (!authorized) {
      return errorResponse(requestId, 401, "tenant_mismatch", "Site token is invalid");
    }

    const objectStore = new R2ReplayObjectStore(context.env.REPLAY_BUCKET);
    const objectId = encodeURIComponent(result.data.eventId ?? crypto.randomUUID());
    await objectStore.putShopifyEvent(result.data, objectId, bytes);

    log("info", "shopify_event_accepted", {
      requestId,
      shopId: result.data.shopId,
      eventType: result.data.type,
    });

    return context.json({ accepted: true as const }, 202);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return errorResponse(
        requestId,
        413,
        "body_too_large",
        "Event exceeds the configured limit",
      );
    }

    log("error", "shopify_event_failed", { requestId }, error);
    return errorResponse(requestId, 500, "internal_error", "Unable to accept event");
  }
});

app.notFound(() => new Response("Not found", { status: 404 }));

export default app;
