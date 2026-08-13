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
import {
  isQuotaExceeded,
  pushPipelineEvent,
  readUsage,
  writeShopHealth,
} from "@pathminty/db/worker";
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

async function reportCollectorFailure(
  installations: KVNamespace,
  shopId: string,
  requestId: string,
  code: string,
  message: string,
) {
  const at = new Date().toISOString();
  await Promise.all([
    writeShopHealth(installations, shopId, {
      lastErrorCode: code,
      lastErrorAt: at,
    }),
    pushPipelineEvent(installations, {
      shopId,
      service: "collector",
      level: "error",
      code,
      message,
      requestId,
      at,
    }),
  ]);
}

function errorResponse(
  requestId: string,
  status: 400 | 401 | 402 | 413 | 415 | 500,
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
  let shopId: string | undefined;

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
    if (result.success) shopId = result.data.shopId;
    if (!result.success) {
      log("warn", "replay_batch_rejected", {
        requestId,
        code: "invalid_batch",
      });
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
      log("warn", "replay_batch_rejected", {
        requestId,
        code: "tenant_mismatch",
        shopId: result.data.shopId,
      });
      return errorResponse(requestId, 401, "tenant_mismatch", "Site token is invalid");
    }

    const usage = await readUsage(
      context.env.SHOPIFY_INSTALLATIONS,
      result.data.shopId,
    );
    if (isQuotaExceeded(usage)) {
      log("warn", "replay_batch_quota_paused", {
        requestId,
        shopId: result.data.shopId,
        period: usage.period,
        billableSessions: usage.billableSessions,
        limit: usage.limit,
      });
      context.executionCtx.waitUntil(
        pushPipelineEvent(context.env.SHOPIFY_INSTALLATIONS, {
          shopId: result.data.shopId,
          service: "collector",
          level: "warn",
          code: "quota_exceeded",
          message: `Recording paused — ${usage.billableSessions}/${usage.limit} sessions used this month.`,
          requestId,
          at: new Date().toISOString(),
        }),
      );
      return errorResponse(
        requestId,
        402,
        "quota_exceeded",
        "Monthly session quota reached. Upgrade to keep recording.",
      );
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
      log("warn", "replay_batch_rejected", { requestId, code: "body_too_large" });
      return errorResponse(
        requestId,
        413,
        "body_too_large",
        "Replay batch exceeds the configured limit",
      );
    }

    log("error", "replay_batch_failed", { requestId }, error);
    if (shopId) {
      context.executionCtx.waitUntil(
        reportCollectorFailure(
          context.env.SHOPIFY_INSTALLATIONS,
          shopId,
          requestId,
          "internal_error",
          "Collector failed to accept a replay batch.",
        ),
      );
    }
    return errorResponse(requestId, 500, "internal_error", "Unable to accept batch");
  }
});

app.post("/v1/shopify-events", async (context) => {
  const requestId = crypto.randomUUID();
  let shopId: string | undefined;

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
    if (result.success) shopId = result.data.shopId;
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

    // Index checkout tokens so order webhooks can join without scanning sessions.
    if (result.data.checkoutToken) {
      const now = new Date().toISOString();
      const prior = await objectStore.getCheckoutIndex(
        result.data.shopId,
        result.data.checkoutToken,
      );
      await objectStore.putCheckoutIndex({
        schemaVersion: 1,
        shopId: result.data.shopId,
        checkoutToken: result.data.checkoutToken,
        ...(prior?.sessionId ? { sessionId: prior.sessionId } : {}),
        ...(prior?.shopifyOrderId ? { shopifyOrderId: prior.shopifyOrderId } : {}),
        ...(result.data.clientId
          ? { clientId: result.data.clientId }
          : prior?.clientId
            ? { clientId: prior.clientId }
            : {}),
        occurredAt: prior?.occurredAt ?? result.data.occurredAt,
        updatedAt: now,
      });
    }

    context.executionCtx.waitUntil(
      writeShopHealth(context.env.SHOPIFY_INSTALLATIONS, result.data.shopId, {
        lastPixelAt: result.data.occurredAt,
      }),
    );

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
    if (shopId) {
      context.executionCtx.waitUntil(
        reportCollectorFailure(
          context.env.SHOPIFY_INSTALLATIONS,
          shopId,
          requestId,
          "internal_error",
          "Collector failed to accept a Shopify event.",
        ),
      );
    }
    return errorResponse(requestId, 500, "internal_error", "Unable to accept event");
  }
});

app.notFound(() => new Response("Not found", { status: 404 }));

export default app;
