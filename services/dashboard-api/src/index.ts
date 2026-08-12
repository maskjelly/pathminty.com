import {
  assessReplayReconstruction,
  buildActivityTimeline,
  buildHeatmap,
  buildRouteIndex,
  extractSnapshotEvents,
  resolveSessionStatus,
  resolveTimePreset,
} from "@pathminty/analytics";
import { R2ReplayObjectStore } from "@pathminty/cloudflare";
import {
  HeatmapModeSchema,
  RouteSortSchema,
  ShopIdSchema,
  TimeRangePresetSchema,
  type SessionSummary,
  type TimeRangePreset,
} from "@pathminty/contracts";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";

type Variables = { authorizedShopId: string };

const app = new Hono<{ Bindings: Cloudflare.Env; Variables: Variables }>();

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  const prefix = `${name}=`;
  const part = header.split(";").find((item) => item.trim().startsWith(prefix));
  return part?.trim().slice(prefix.length);
}

function parseDevice(raw: string | undefined) {
  const device = raw ?? "all";
  return device === "all" ||
    device === "desktop" ||
    device === "tablet" ||
    device === "mobile"
    ? device
    : null;
}

function parseTimeWindow(
  request: { query: (key: string) => string | undefined },
): { fromMs: number; toMs: number } | { error: string } {
  const toRaw = request.query("to");
  const fromRaw = request.query("from");
  const presetRaw = request.query("preset");
  const toMs = toRaw ? Date.parse(toRaw) : Date.now();
  if (!Number.isFinite(toMs)) return { error: "Invalid to timestamp" };

  if (fromRaw) {
    const fromMs = Date.parse(fromRaw);
    if (!Number.isFinite(fromMs)) return { error: "Invalid from timestamp" };
    if (fromMs > toMs) return { error: "from must be before to" };
    // Cap range at 31 days to bound work.
    if (toMs - fromMs > 31 * 24 * 60 * 60 * 1_000) {
      return { error: "Range cannot exceed 31 days" };
    }
    return { fromMs, toMs };
  }

  const preset = TimeRangePresetSchema.safeParse(presetRaw ?? "24h");
  if (!preset.success) return { error: "Invalid time preset" };
  return resolveTimePreset(preset.data as TimeRangePreset, toMs);
}

app.use("*", secureHeaders());
app.use("/v1/*", async (context, next) => {
  const origin = context.req.header("origin");
  if (origin !== undefined && origin !== context.env.DASHBOARD_ORIGIN) {
    return context.body(null, 403);
  }

  context.header("Access-Control-Allow-Origin", context.env.DASHBOARD_ORIGIN);
  context.header("Access-Control-Allow-Credentials", "true");
  context.header("Vary", "Origin");

  if (context.req.method === "OPTIONS") {
    context.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    context.header("Access-Control-Allow-Headers", "Content-Type");
    context.header("Access-Control-Max-Age", "86400");
    return context.body(null, 204);
  }

  await next();
});

app.use("/v1/shops/*", async (context, next) => {
  const sessionId = readCookie(context.req.header("cookie"), "pathminty_session");
  if (!sessionId || !/^[a-f0-9]{64}$/u.test(sessionId)) {
    return context.json({ error: "Authentication required" }, 401);
  }

  const stored = await context.env.SHOPIFY_INSTALLATIONS.get<unknown>(
    `dashboard-session:${sessionId}`,
    "json",
  );
  const shopId =
    typeof stored === "object" && stored !== null
      ? ShopIdSchema.safeParse((stored as Record<string, unknown>).shopId)
      : { success: false as const };
  if (!shopId.success) return context.json({ error: "Session expired" }, 401);

  context.set("authorizedShopId", shopId.data);
  context.header("Cache-Control", "private, no-store");
  await next();
});

function createSessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function refreshSessionStatus(summary: SessionSummary): SessionSummary {
  const status = resolveSessionStatus(summary.lastSeenAt, summary.status === "ended");
  if (status === summary.status) return summary;
  return { ...summary, status };
}

async function loadShopSessions(
  bucket: R2Bucket,
  shopId: string,
  options: { includeTest?: boolean; limit?: number } = {},
) {
  const objectStore = new R2ReplayObjectStore(bucket);
  const limit = options.limit ?? 100;
  return (await objectStore.listSessionSummaries(shopId, limit))
    .filter((session) => options.includeTest || session.source !== "test")
    .map(refreshSessionStatus);
}

app.post("/v1/auth/exchange", async (context) => {
  if (Number(context.req.header("content-length") ?? "0") > 2_048) {
    return context.json({ error: "Request too large" }, 413);
  }

  let body: unknown;
  try {
    body = await context.req.json<unknown>();
  } catch {
    return context.json({ error: "Invalid request" }, 400);
  }
  const ticket =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).ticket
      : undefined;
  if (typeof ticket !== "string" || !/^[a-f0-9]{48}$/u.test(ticket)) {
    return context.json({ error: "Invalid ticket" }, 400);
  }

  const key = `dashboard-ticket:${ticket}`;
  const stored = await context.env.SHOPIFY_INSTALLATIONS.get<unknown>(key, "json");
  await context.env.SHOPIFY_INSTALLATIONS.delete(key);
  const shopId =
    typeof stored === "object" && stored !== null
      ? ShopIdSchema.safeParse((stored as Record<string, unknown>).shopId)
      : { success: false as const };
  if (!shopId.success) return context.json({ error: "Ticket expired" }, 401);

  const sessionId = createSessionId();
  await context.env.SHOPIFY_INSTALLATIONS.put(
    `dashboard-session:${sessionId}`,
    JSON.stringify({ shopId: shopId.data }),
    { expirationTtl: 43_200 },
  );
  setCookie(context, "pathminty_session", sessionId, {
    httpOnly: true,
    maxAge: 43_200,
    path: "/",
    sameSite: "Lax",
    secure: new URL(context.req.url).protocol === "https:",
  });

  return context.json({ shopId: shopId.data });
});

app.get("/v1/auth/session", async (context) => {
  const sessionId = readCookie(context.req.header("cookie"), "pathminty_session");
  if (!sessionId || !/^[a-f0-9]{64}$/u.test(sessionId)) {
    return context.json({ error: "Authentication required" }, 401);
  }
  const stored = await context.env.SHOPIFY_INSTALLATIONS.get<unknown>(
    `dashboard-session:${sessionId}`,
    "json",
  );
  const shopId =
    typeof stored === "object" && stored !== null
      ? ShopIdSchema.safeParse((stored as Record<string, unknown>).shopId)
      : { success: false as const };
  if (!shopId.success) return context.json({ error: "Session expired" }, 401);
  context.header("Cache-Control", "private, no-store");
  return context.json({ shopId: shopId.data });
});

app.get("/healthz", (context) =>
  context.json({ service: "dashboard-api", status: "ok" }),
);

app.get("/v1/meta", (context) =>
  context.json({
    service: "dashboard-api",
    status: "ok" as const,
    environment: context.env.ENVIRONMENT,
    database: "pending" as const,
  }),
);

app.get("/v1/shops/:shopId/sessions", async (context) => {
  const shop = ShopIdSchema.safeParse(context.req.param("shopId"));
  if (!shop.success) return context.json({ error: "Invalid shop" }, 400);
  if (shop.data !== context.get("authorizedShopId")) {
    return context.json({ error: "Shop access denied" }, 403);
  }

  const rawLimit = Number(context.req.query("limit") ?? "50");
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
  const includeTest = context.req.query("includeTest") === "1";
  const window = parseTimeWindow(context.req);
  if ("error" in window) return context.json({ error: window.error }, 400);

  const device = parseDevice(context.req.query("device") ?? undefined);
  if (!device) return context.json({ error: "Invalid device" }, 400);

  const sessions = (await loadShopSessions(context.env.REPLAY_BUCKET, shop.data, {
    includeTest,
    limit: 100,
  })).filter((session) => {
    if (device !== "all" && session.device !== device) return false;
    const started = Date.parse(session.startedAt);
    const lastSeen = Date.parse(session.lastSeenAt);
    return lastSeen >= window.fromMs && started <= window.toMs;
  });

  return context.json({
    sessions: sessions.slice(0, limit),
    from: new Date(window.fromMs).toISOString(),
    to: new Date(window.toMs).toISOString(),
  });
});

app.get("/v1/shops/:shopId/routes", async (context) => {
  const shop = ShopIdSchema.safeParse(context.req.param("shopId"));
  if (!shop.success) return context.json({ error: "Invalid shop" }, 400);
  if (shop.data !== context.get("authorizedShopId")) {
    return context.json({ error: "Shop access denied" }, 403);
  }

  const window = parseTimeWindow(context.req);
  if ("error" in window) return context.json({ error: window.error }, 400);

  const device = parseDevice(context.req.query("device") ?? undefined);
  if (!device) return context.json({ error: "Invalid device" }, 400);

  const mode = HeatmapModeSchema.safeParse(context.req.query("mode") ?? "click");
  if (!mode.success) return context.json({ error: "Invalid mode" }, 400);

  const sort = RouteSortSchema.safeParse(context.req.query("sort") ?? "most_active");
  if (!sort.success) return context.json({ error: "Invalid sort" }, 400);

  const rawLimit = Number(context.req.query("limit") ?? "24");
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 48) : 24;
  const query = context.req.query("q") ?? "";

  const sessions = await loadShopSessions(context.env.REPLAY_BUCKET, shop.data, {
    limit: 100,
  });
  const index = buildRouteIndex({
    sessions,
    fromMs: window.fromMs,
    toMs: window.toMs,
    device,
    mode: mode.data,
    sort: sort.data,
    limit,
    query,
  });
  return context.json(index);
});

app.get("/v1/shops/:shopId/activity", async (context) => {
  const shop = ShopIdSchema.safeParse(context.req.param("shopId"));
  if (!shop.success) return context.json({ error: "Invalid shop" }, 400);
  if (shop.data !== context.get("authorizedShopId")) {
    return context.json({ error: "Shop access denied" }, 403);
  }

  const window = parseTimeWindow(context.req);
  if ("error" in window) return context.json({ error: window.error }, 400);

  const device = parseDevice(context.req.query("device") ?? undefined);
  if (!device) return context.json({ error: "Invalid device" }, 400);

  const mode = HeatmapModeSchema.safeParse(context.req.query("mode") ?? "click");
  if (!mode.success) return context.json({ error: "Invalid mode" }, 400);

  const route = context.req.query("route") ?? null;
  if (route && route.length > 2_048) {
    return context.json({ error: "Invalid route" }, 400);
  }

  const sessions = await loadShopSessions(context.env.REPLAY_BUCKET, shop.data, {
    limit: 100,
  });
  return context.json(
    buildActivityTimeline({
      sessions,
      fromMs: window.fromMs,
      toMs: window.toMs,
      device,
      mode: mode.data,
      route,
    }),
  );
});

app.get("/v1/shops/:shopId/sessions/:sessionId", async (context) => {
  const shop = ShopIdSchema.safeParse(context.req.param("shopId"));
  if (!shop.success) return context.json({ error: "Invalid shop" }, 400);
  if (shop.data !== context.get("authorizedShopId")) {
    return context.json({ error: "Shop access denied" }, 403);
  }

  const sessionId = context.req.param("sessionId");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      sessionId,
    )
  ) {
    return context.json({ error: "Invalid session" }, 400);
  }

  const objectStore = new R2ReplayObjectStore(context.env.REPLAY_BUCKET);
  const summary = await objectStore.getSessionSummary(shop.data, sessionId);
  if (!summary) return context.json({ error: "Session not found" }, 404);
  if (summary.shopId !== shop.data) {
    return context.json({ error: "Shop access denied" }, 403);
  }

  const batches = await objectStore.getBatches(shop.data, sessionId);
  const reconstruction = assessReplayReconstruction(batches);
  return context.json({
    summary: refreshSessionStatus(summary),
    batches,
    reconstruction: reconstruction.reconstruction,
    ...(reconstruction.reconstruction === "incomplete"
      ? { incompleteReason: reconstruction.incompleteReason }
      : {}),
  });
});

async function resolveSnapshotEvents(
  objectStore: R2ReplayObjectStore,
  shopId: string,
  route: string,
  device: "all" | "desktop" | "tablet" | "mobile",
  sessions: SessionSummary[],
) {
  const candidates = sessions.filter(
    (session) =>
      session.hasFullSnapshot &&
      (session.routes.includes(route) || session.entryRoute === route) &&
      (device === "all" || session.device === device),
  );

  for (const candidate of candidates) {
    try {
      const batches = await objectStore.getBatches(shopId, candidate.sessionId);
      const routeBatches = batches.filter((batch) => batch.route === route);
      const snapshotEvents = extractSnapshotEvents(
        routeBatches.length > 0 ? routeBatches : batches,
      );
      if (snapshotEvents) return snapshotEvents;
    } catch {
      // Skip unreadable sessions; never invent a page preview.
    }
  }
  return null;
}

app.get("/v1/shops/:shopId/heatmaps", async (context) => {
  const shop = ShopIdSchema.safeParse(context.req.param("shopId"));
  if (!shop.success) return context.json({ error: "Invalid shop" }, 400);
  if (shop.data !== context.get("authorizedShopId")) {
    return context.json({ error: "Shop access denied" }, 403);
  }

  const route = context.req.query("route");
  if (!route || route.length > 2_048) {
    return context.json({ error: "Route is required" }, 400);
  }

  const device = parseDevice(context.req.query("device") ?? undefined);
  if (!device) return context.json({ error: "Invalid device" }, 400);

  const mode = HeatmapModeSchema.safeParse(context.req.query("mode") ?? "click");
  if (!mode.success) return context.json({ error: "Invalid mode" }, 400);

  const window = parseTimeWindow(context.req);
  if ("error" in window) return context.json({ error: window.error }, 400);

  // Optional scrub window inside the selected range (timeline focus).
  const scrubFrom = context.req.query("scrubFrom");
  const scrubTo = context.req.query("scrubTo");
  let fromMs = window.fromMs;
  let toMs = window.toMs;
  if (scrubFrom || scrubTo) {
    const scrubFromMs = scrubFrom ? Date.parse(scrubFrom) : window.fromMs;
    const scrubToMs = scrubTo ? Date.parse(scrubTo) : window.toMs;
    if (!Number.isFinite(scrubFromMs) || !Number.isFinite(scrubToMs)) {
      return context.json({ error: "Invalid scrub range" }, 400);
    }
    fromMs = Math.max(window.fromMs, scrubFromMs);
    toMs = Math.min(window.toMs, scrubToMs);
  }

  const includeSnapshot = context.req.query("snapshot") !== "0";
  const objectStore = new R2ReplayObjectStore(context.env.REPLAY_BUCKET);
  const sessions = await loadShopSessions(context.env.REPLAY_BUCKET, shop.data, {
    limit: 100,
  });

  const snapshotEvents = includeSnapshot
    ? await resolveSnapshotEvents(objectStore, shop.data, route, device, sessions)
    : null;

  const heatmap = buildHeatmap({
    shopId: shop.data,
    route,
    device,
    mode: mode.data,
    sessions,
    snapshotEvents,
    fromMs,
    toMs,
  });

  return context.json(heatmap);
});

/** Points-only heatmaps for site-map cards (no DOM snapshots). */
app.get("/v1/shops/:shopId/heatmaps/batch", async (context) => {
  const shop = ShopIdSchema.safeParse(context.req.param("shopId"));
  if (!shop.success) return context.json({ error: "Invalid shop" }, 400);
  if (shop.data !== context.get("authorizedShopId")) {
    return context.json({ error: "Shop access denied" }, 403);
  }

  const routesRaw = context.req.query("routes") ?? "";
  const routes = [
    ...new Set(
      routesRaw
        .split("|")
        .map((route) => route.trim())
        .filter((route) => route.length > 0 && route.length <= 2_048),
    ),
  ].slice(0, 24);
  if (routes.length === 0) {
    return context.json({ error: "routes is required" }, 400);
  }

  const device = parseDevice(context.req.query("device") ?? undefined);
  if (!device) return context.json({ error: "Invalid device" }, 400);

  const mode = HeatmapModeSchema.safeParse(context.req.query("mode") ?? "click");
  if (!mode.success) return context.json({ error: "Invalid mode" }, 400);

  const window = parseTimeWindow(context.req);
  if ("error" in window) return context.json({ error: window.error }, 400);

  const sessions = await loadShopSessions(context.env.REPLAY_BUCKET, shop.data, {
    limit: 100,
  });

  const heatmaps = routes.map((route) =>
    buildHeatmap({
      shopId: shop.data,
      route,
      device,
      mode: mode.data,
      sessions,
      snapshotEvents: null,
      fromMs: window.fromMs,
      toMs: window.toMs,
    }),
  );

  return context.json({ heatmaps });
});

app.notFound(() => new Response("Not found", { status: 404 }));

export default app;
