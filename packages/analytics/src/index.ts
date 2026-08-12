import type {
  ActivityBucket,
  ActivityTimelineResponse,
  HeatmapClick,
  HeatmapHover,
  HeatmapMode,
  HeatmapPoint,
  HeatmapResponse,
  JourneyEdge,
  JourneyGraphResponse,
  JourneyNode,
  ReplayBatch,
  RouteListResponse,
  RouteSort,
  RouteStat,
  RrwebEvent,
  SessionSummary,
  TimeRangePreset,
} from "@pathminty/contracts";
import { SESSION_IDLE_TIMEOUT_MS } from "@pathminty/contracts";

export type TimeWindow = Readonly<{ fromMs: number; toMs: number }>;

const HOVER_SAMPLE_MS = 250;

const PRESET_MS: Record<TimeRangePreset, number> = {
  "1h": 60 * 60 * 1_000,
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

/** Least-active rank ignores sparse routes so one-off SKU hits do not win. */
export const LEAST_ACTIVE_MIN_SESSIONS = 3;

export function resolveTimePreset(
  preset: TimeRangePreset,
  nowMs: number = Date.now(),
): TimeWindow {
  const span = PRESET_MS[preset];
  return { fromMs: nowMs - span, toMs: nowMs };
}

export function sessionOverlapsRange(
  session: SessionSummary,
  fromMs: number,
  toMs: number,
): boolean {
  const started = Date.parse(session.startedAt);
  const lastSeen = Date.parse(session.lastSeenAt);
  if (!Number.isFinite(started) || !Number.isFinite(lastSeen)) return false;
  return lastSeen >= fromMs && started <= toMs;
}

export function filterSessionsInRange(
  sessions: readonly SessionSummary[],
  options: {
    fromMs: number;
    toMs: number;
    device?: HeatmapResponse["device"];
    includeTest?: boolean;
  },
): SessionSummary[] {
  return sessions.filter((session) => {
    if (!options.includeTest && session.source === "test") return false;
    if (
      options.device &&
      options.device !== "all" &&
      session.device !== options.device
    ) {
      return false;
    }
    return sessionOverlapsRange(session, options.fromMs, options.toMs);
  });
}

function eventInRange(at: number, fromMs: number, toMs: number): boolean {
  return Number.isFinite(at) && at >= fromMs && at <= toMs;
}

function routeEventWeight(
  session: SessionSummary,
  route: string,
  mode: HeatmapMode,
  fromMs: number,
  toMs: number,
): { clicks: number; hoverWeight: number; events: number } {
  let clicks = 0;
  let hoverWeight = 0;
  if (mode === "click" || mode === "hover") {
    for (const click of session.clicks) {
      if (click.route !== route) continue;
      if (!eventInRange(click.at, fromMs, toMs)) continue;
      clicks += 1;
    }
    for (const hover of session.hovers) {
      if (hover.route !== route) continue;
      if (!eventInRange(hover.at, fromMs, toMs)) continue;
      hoverWeight += Math.max(1, Math.round(hover.dwellMs / HOVER_SAMPLE_MS));
    }
  }
  const events = mode === "hover" ? hoverWeight : clicks;
  return { clicks, hoverWeight, events };
}

export function buildRouteIndex(input: {
  sessions: readonly SessionSummary[];
  fromMs: number;
  toMs: number;
  device?: HeatmapResponse["device"];
  mode?: HeatmapMode;
  sort?: RouteSort;
  limit?: number;
  query?: string;
}): RouteListResponse {
  const mode = input.mode ?? "click";
  const sort = input.sort ?? "most_active";
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 200);
  const query = input.query?.trim().toLowerCase() ?? "";
  const sessions = filterSessionsInRange(input.sessions, {
    fromMs: input.fromMs,
    toMs: input.toMs,
    device: input.device ?? "all",
  });

  const byRoute = new Map<
    string,
    {
      sessionIds: Set<string>;
      clickCount: number;
      hoverWeight: number;
      eventCount: number;
      lastSeenMs: number;
      hasFullSnapshot: boolean;
      netRevenueMinor: number;
      orderIds: Set<string>;
      currency: string | null;
    }
  >();

  let totalNetRevenueMinor = 0;
  const orderIdsGlobal = new Set<string>();
  let currency: string | null = null;

  for (const session of sessions) {
    const lastSeenMs = Date.parse(session.lastSeenAt);
    const sessionRevenue =
      typeof session.netRevenueMinor === "number" && session.netRevenueMinor > 0
        ? session.netRevenueMinor
        : 0;
    if (sessionRevenue > 0 && session.orderId) {
      if (!orderIdsGlobal.has(session.orderId)) {
        orderIdsGlobal.add(session.orderId);
        totalNetRevenueMinor += sessionRevenue;
      }
      if (session.currency) currency = session.currency;
    }
    for (const route of new Set([
      session.entryRoute,
      ...session.routes,
      session.exitRoute,
    ])) {
      if (query && !route.toLowerCase().includes(query)) continue;
      const weights = routeEventWeight(
        session,
        route,
        mode,
        input.fromMs,
        input.toMs,
      );
      // Include routes visited even without interactions so site map is complete.
      const existing = byRoute.get(route) ?? {
        sessionIds: new Set<string>(),
        clickCount: 0,
        hoverWeight: 0,
        eventCount: 0,
        lastSeenMs: 0,
        hasFullSnapshot: false,
        netRevenueMinor: 0,
        orderIds: new Set<string>(),
        currency: null as string | null,
      };
      existing.sessionIds.add(session.sessionId);
      existing.clickCount += weights.clicks;
      existing.hoverWeight += weights.hoverWeight;
      existing.eventCount += weights.events;
      if (Number.isFinite(lastSeenMs)) {
        existing.lastSeenMs = Math.max(existing.lastSeenMs, lastSeenMs);
      }
      if (session.hasFullSnapshot) existing.hasFullSnapshot = true;
      // Multi-touch: full order net revenue on every route in the purchasing path.
      if (sessionRevenue > 0 && session.orderId && !existing.orderIds.has(session.orderId)) {
        existing.orderIds.add(session.orderId);
        existing.netRevenueMinor += sessionRevenue;
        if (session.currency) existing.currency = session.currency;
      }
      byRoute.set(route, existing);
    }
  }

  const stats: RouteStat[] = [...byRoute.entries()].map(([route, value]) => ({
    route,
    sessionCount: value.sessionIds.size,
    eventCount: value.eventCount,
    clickCount: value.clickCount,
    hoverWeight: value.hoverWeight,
    lastSeenAt: new Date(value.lastSeenMs || input.toMs).toISOString(),
    hasFullSnapshot: value.hasFullSnapshot,
    netRevenueMinor: value.netRevenueMinor,
    orderCount: value.orderIds.size,
    currency: value.currency,
  }));

  const byMostActive = [...stats].sort((left, right) => {
    if (right.eventCount !== left.eventCount) {
      return right.eventCount - left.eventCount;
    }
    if (right.sessionCount !== left.sessionCount) {
      return right.sessionCount - left.sessionCount;
    }
    return left.route.localeCompare(right.route);
  });

  const mostActive = byMostActive[0] ?? null;
  const leastActiveCandidates = byMostActive
    .filter((route) => route.sessionCount >= LEAST_ACTIVE_MIN_SESSIONS)
    .sort((left, right) => {
      if (left.eventCount !== right.eventCount) {
        return left.eventCount - right.eventCount;
      }
      return left.route.localeCompare(right.route);
    });
  const leastActive = leastActiveCandidates[0] ?? null;

  const sorted = [...stats].sort((left, right) => {
    switch (sort) {
      case "least_active":
        return left.eventCount - right.eventCount || left.route.localeCompare(right.route);
      case "sessions":
        return (
          right.sessionCount - left.sessionCount ||
          right.eventCount - left.eventCount ||
          left.route.localeCompare(right.route)
        );
      case "alpha":
        return left.route.localeCompare(right.route);
      case "most_active":
      default:
        return (
          right.eventCount - left.eventCount ||
          right.sessionCount - left.sessionCount ||
          left.route.localeCompare(right.route)
        );
    }
  });

  const totalEvents = stats.reduce((sum, route) => sum + route.eventCount, 0);
  return {
    routes: sorted.slice(0, limit),
    mostActive,
    leastActive,
    totalSessions: sessions.length,
    totalEvents,
    totalRoutes: stats.length,
    totalNetRevenueMinor,
    orderCount: orderIdsGlobal.size,
    currency,
    from: new Date(input.fromMs).toISOString(),
    to: new Date(input.toMs).toISOString(),
  };
}

/** Behavioral checkout proxy — not verified purchase until order join lands. */
export function isCheckoutRoute(route: string): boolean {
  const path = route.toLowerCase();
  return (
    path === "/cart" ||
    path.startsWith("/cart/") ||
    path === "/checkout" ||
    path.startsWith("/checkout/") ||
    path.startsWith("/checkouts/") ||
    path.includes("/checkouts/")
  );
}

/**
 * Build a layered journey graph from session route sequences.
 * `routes` on summaries are first-seen order from sequential batches.
 */
export function buildJourneyGraph(input: {
  sessions: readonly SessionSummary[];
  fromMs: number;
  toMs: number;
  device?: HeatmapResponse["device"];
  maxNodes?: number;
}): JourneyGraphResponse {
  const maxNodes = Math.min(Math.max(input.maxNodes ?? 24, 4), 80);
  const sessions = filterSessionsInRange(input.sessions, {
    fromMs: input.fromMs,
    toMs: input.toMs,
    device: input.device ?? "all",
  });

  const nodeSessions = new Map<string, Set<string>>();
  const nodeCheckout = new Map<string, Set<string>>();
  const nodeOrders = new Map<string, Set<string>>();
  const nodeRevenue = new Map<string, number>();
  const edgeSessions = new Map<string, Set<string>>();
  const edgeCheckout = new Map<string, Set<string>>();
  const edgeOrders = new Map<string, Set<string>>();
  const edgeRevenue = new Map<string, number>();
  const nodeLayer = new Map<string, number>();
  let checkoutSessions = 0;
  let totalNetRevenueMinor = 0;
  const orderIdsGlobal = new Set<string>();
  let currency: string | null = null;

  for (const session of sessions) {
    const path = uniquePath(session);
    if (path.length === 0) continue;
    const reachedCheckout = path.some((route) => isCheckoutRoute(route));
    if (reachedCheckout) checkoutSessions += 1;
    const sessionRevenue =
      typeof session.netRevenueMinor === "number" && session.netRevenueMinor > 0
        ? session.netRevenueMinor
        : 0;
    const hasOrder = Boolean(session.orderId && sessionRevenue > 0);
    if (hasOrder && session.orderId && !orderIdsGlobal.has(session.orderId)) {
      orderIdsGlobal.add(session.orderId);
      totalNetRevenueMinor += sessionRevenue;
      if (session.currency) currency = session.currency;
    }

    path.forEach((route, index) => {
      const sessionsAt = nodeSessions.get(route) ?? new Set<string>();
      sessionsAt.add(session.sessionId);
      nodeSessions.set(route, sessionsAt);
      if (reachedCheckout) {
        const checkouts = nodeCheckout.get(route) ?? new Set<string>();
        checkouts.add(session.sessionId);
        nodeCheckout.set(route, checkouts);
      }
      if (hasOrder && session.orderId) {
        const orders = nodeOrders.get(route) ?? new Set<string>();
        if (!orders.has(session.orderId)) {
          orders.add(session.orderId);
          nodeOrders.set(route, orders);
          nodeRevenue.set(route, (nodeRevenue.get(route) ?? 0) + sessionRevenue);
        }
      }
      const priorLayer = nodeLayer.get(route);
      if (priorLayer === undefined || index < priorLayer) {
        nodeLayer.set(route, index);
      }
    });

    for (let i = 0; i < path.length - 1; i += 1) {
      const from = path[i];
      const to = path[i + 1];
      if (!from || !to || from === to) continue;
      const key = `${from}\0${to}`;
      const edgeSet = edgeSessions.get(key) ?? new Set<string>();
      edgeSet.add(session.sessionId);
      edgeSessions.set(key, edgeSet);
      if (reachedCheckout) {
        const edgeCheck = edgeCheckout.get(key) ?? new Set<string>();
        edgeCheck.add(session.sessionId);
        edgeCheckout.set(key, edgeCheck);
      }
      if (hasOrder && session.orderId) {
        const edgeOrderSet = edgeOrders.get(key) ?? new Set<string>();
        if (!edgeOrderSet.has(session.orderId)) {
          edgeOrderSet.add(session.orderId);
          edgeOrders.set(key, edgeOrderSet);
          edgeRevenue.set(key, (edgeRevenue.get(key) ?? 0) + sessionRevenue);
        }
      }
    }
  }

  const rankedRoutes = [...nodeSessions.entries()]
    .map(([route, set]) => ({ route, count: set.size }))
    .sort((a, b) => b.count - a.count || a.route.localeCompare(b.route));

  // Keep top nodes by traffic, but always include landing (/) and any checkout routes.
  const keep = new Set<string>();
  for (const item of rankedRoutes) {
    if (keep.size >= maxNodes) break;
    keep.add(item.route);
  }
  for (const route of nodeSessions.keys()) {
    if (route === "/" || isCheckoutRoute(route)) keep.add(route);
  }

  const nodes: JourneyNode[] = [...keep].map((route) => {
    const sessionCount = nodeSessions.get(route)?.size ?? 0;
    const checkoutReachCount = nodeCheckout.get(route)?.size ?? 0;
    const orderCount = nodeOrders.get(route)?.size ?? 0;
    return {
      route,
      sessionCount,
      checkoutReachCount,
      checkoutRate: sessionCount > 0 ? checkoutReachCount / sessionCount : 0,
      orderCount,
      netRevenueMinor: nodeRevenue.get(route) ?? 0,
      isLanding: route === "/",
      isCheckout: isCheckoutRoute(route),
      layer: nodeLayer.get(route) ?? 0,
    };
  });

  // Normalize layers to 0..n among kept nodes for layout.
  const layerValues = [...new Set(nodes.map((n) => n.layer))].sort((a, b) => a - b);
  const layerMap = new Map(layerValues.map((value, index) => [value, index]));
  for (const node of nodes) {
    node.layer = layerMap.get(node.layer) ?? 0;
    if (node.isCheckout) {
      node.layer = Math.max(...[...layerMap.values()], 0) + 1;
    }
  }

  const edges: JourneyEdge[] = [];
  for (const [key, set] of edgeSessions) {
    const [from, to] = key.split("\0");
    if (!from || !to || !keep.has(from) || !keep.has(to)) continue;
    const sessionCount = set.size;
    const checkoutReachCount = edgeCheckout.get(key)?.size ?? 0;
    edges.push({
      from,
      to,
      sessionCount,
      checkoutReachCount,
      checkoutRate: sessionCount > 0 ? checkoutReachCount / sessionCount : 0,
      orderCount: edgeOrders.get(key)?.size ?? 0,
      netRevenueMinor: edgeRevenue.get(key) ?? 0,
    });
  }
  edges.sort((a, b) => b.sessionCount - a.sessionCount);

  return {
    nodes: nodes.sort(
      (a, b) => a.layer - b.layer || b.sessionCount - a.sessionCount,
    ),
    edges: edges.slice(0, 200),
    totalSessions: sessions.length,
    checkoutSessions,
    orderCount: orderIdsGlobal.size,
    totalNetRevenueMinor,
    currency,
    from: new Date(input.fromMs).toISOString(),
    to: new Date(input.toMs).toISOString(),
    conversionBasis:
      orderIdsGlobal.size > 0 ? "verified_purchase" : "reached_checkout",
  };
}

function uniquePath(session: SessionSummary): string[] {
  // Prefer ordered first-seen routes; ensure entry is first.
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (route: string) => {
    if (seen.has(route)) return;
    seen.add(route);
    ordered.push(route);
  };
  push(session.entryRoute);
  for (const route of session.routes) push(route);
  if (session.exitRoute) push(session.exitRoute);
  return ordered;
}

export function buildActivityTimeline(input: {
  sessions: readonly SessionSummary[];
  fromMs: number;
  toMs: number;
  device?: HeatmapResponse["device"];
  route?: string | null;
  mode?: HeatmapMode;
  bucketCount?: number;
}): ActivityTimelineResponse {
  const mode = input.mode ?? "click";
  const device = input.device ?? "all";
  const route = input.route ?? null;
  const span = Math.max(1, input.toMs - input.fromMs);
  // Prefer ~24 buckets for 24h (hourly); cap for other presets.
  const bucketCount = Math.min(
    Math.max(input.bucketCount ?? (span <= 25 * 60 * 60 * 1_000 ? 24 : 28), 4),
    96,
  );
  const bucketMs = span / bucketCount;
  const sessions = filterSessionsInRange(input.sessions, {
    fromMs: input.fromMs,
    toMs: input.toMs,
    device,
  });

  const buckets: ActivityBucket[] = Array.from({ length: bucketCount }, (_, index) => {
    const startMs = input.fromMs + index * bucketMs;
    const endMs = index === bucketCount - 1 ? input.toMs : startMs + bucketMs;
    return {
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs).toISOString(),
      eventCount: 0,
      sessionCount: 0,
    };
  });

  const sessionSeen = buckets.map(() => new Set<string>());

  for (const session of sessions) {
    const events =
      mode === "hover"
        ? session.hovers.map((hover) => ({
            at: hover.at,
            route: hover.route,
            weight: Math.max(1, Math.round(hover.dwellMs / HOVER_SAMPLE_MS)),
          }))
        : session.clicks.map((click) => ({
            at: click.at,
            route: click.route,
            weight: 1,
          }));

    for (const event of events) {
      if (route && event.route !== route) continue;
      if (!eventInRange(event.at, input.fromMs, input.toMs)) continue;
      const index = Math.min(
        bucketCount - 1,
        Math.max(0, Math.floor((event.at - input.fromMs) / bucketMs)),
      );
      const bucket = buckets[index];
      const seen = sessionSeen[index];
      if (!bucket || !seen) continue;
      bucket.eventCount += event.weight;
      if (!seen.has(session.sessionId)) {
        seen.add(session.sessionId);
        bucket.sessionCount += 1;
      }
    }
  }

  return {
    buckets,
    from: new Date(input.fromMs).toISOString(),
    to: new Date(input.toMs).toISOString(),
    route,
    device,
    mode,
  };
}

export type RevenueComponents = Readonly<{
  grossMerchandiseValueMinor: bigint;
  discountsMinor: bigint;
  refundsMinor: bigint;
  cancellationsMinor: bigint;
}>;

export function calculateNetRevenueMinor(components: RevenueComponents): bigint {
  const result =
    components.grossMerchandiseValueMinor -
    components.discountsMinor -
    components.refundsMinor -
    components.cancellationsMinor;

  return result > 0n ? result : 0n;
}

/** Shopify money strings ("199.00") → integer minor units (cents). */
export function shopifyMoneyToMinor(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value * 100);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed * 100);
  }
  return 0;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asIso(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return fallback;
}

function asCurrency(value: unknown): string {
  if (typeof value === "string" && /^[A-Za-z]{3}$/u.test(value)) {
    return value.toUpperCase();
  }
  return "USD";
}

function asOrderId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    // Accept numeric or GraphQL gid://shopify/Order/123
    const gid = value.match(/Order\/(\d+)/u);
    if (gid?.[1]) return gid[1];
    return value.slice(0, 64);
  }
  return null;
}

/**
 * Normalize Shopify orders/create|updated Level-1 include_fields into OrderFact.
 * Never logs payload; returns null when required fields are missing.
 */
export function parseShopifyOrderPayload(
  shopId: string,
  payload: unknown,
  nowIso: string = new Date().toISOString(),
): import("@pathminty/contracts").OrderFact | null {
  const body = readRecord(payload);
  if (!body) return null;
  const shopifyOrderId = asOrderId(body.id);
  if (!shopifyOrderId) return null;

  const discountsMinor = shopifyMoneyToMinor(body.current_total_discounts);
  // current_total_price is post-discount; reconstruct GMV ≈ price + discounts.
  const currentTotalMinor = shopifyMoneyToMinor(body.current_total_price);
  const gmvMinor = currentTotalMinor + discountsMinor;
  const cancelledAtRaw = body.cancelled_at;
  const isCancelled =
    cancelledAtRaw !== null &&
    cancelledAtRaw !== undefined &&
    cancelledAtRaw !== "";
  const cancellationsMinor = isCancelled ? currentTotalMinor : 0;
  const refundsMinor = 0;
  const netRevenueMinor = Number(
    calculateNetRevenueMinor({
      grossMerchandiseValueMinor: BigInt(gmvMinor),
      discountsMinor: BigInt(discountsMinor),
      refundsMinor: BigInt(refundsMinor),
      cancellationsMinor: BigInt(cancellationsMinor),
    }),
  );

  const checkoutToken =
    typeof body.checkout_token === "string" && body.checkout_token.length > 0
      ? body.checkout_token.slice(0, 255)
      : undefined;
  const financialStatus =
    typeof body.financial_status === "string"
      ? body.financial_status.slice(0, 64)
      : undefined;

  return {
    schemaVersion: 1,
    shopId,
    shopifyOrderId,
    ...(checkoutToken ? { checkoutToken } : {}),
    sessionId: null,
    currency: asCurrency(body.currency),
    gmvMinor,
    discountsMinor,
    refundsMinor,
    cancellationsMinor,
    netRevenueMinor,
    orderedAt: asIso(body.created_at, nowIso),
    updatedAt: asIso(body.updated_at, nowIso),
    ...(financialStatus ? { financialStatus } : {}),
    cancelledAt: isCancelled ? asIso(cancelledAtRaw, nowIso) : null,
  };
}

/**
 * Apply a refunds/create payload onto an existing order fact (idempotent max).
 */
export function applyShopifyRefundToOrder(
  order: import("@pathminty/contracts").OrderFact,
  payload: unknown,
  nowIso: string = new Date().toISOString(),
): import("@pathminty/contracts").OrderFact {
  const body = readRecord(payload);
  if (!body) return order;

  let refundAdd = 0;
  const transactions = body.transactions;
  if (Array.isArray(transactions)) {
    for (const tx of transactions) {
      const record = readRecord(tx);
      if (!record) continue;
      refundAdd += shopifyMoneyToMinor(record.amount);
    }
  }
  if (refundAdd === 0) {
    const lineItems = body.refund_line_items;
    if (Array.isArray(lineItems)) {
      for (const item of lineItems) {
        const record = readRecord(item);
        if (!record) continue;
        refundAdd +=
          shopifyMoneyToMinor(record.subtotal) + shopifyMoneyToMinor(record.total_tax);
      }
    }
  }

  // Consumer is idempotent per webhookId; partial refunds accumulate here.
  const refunds = Math.min(order.gmvMinor, order.refundsMinor + refundAdd);
  const netRevenueMinor = Number(
    calculateNetRevenueMinor({
      grossMerchandiseValueMinor: BigInt(order.gmvMinor),
      discountsMinor: BigInt(order.discountsMinor),
      refundsMinor: BigInt(refunds),
      cancellationsMinor: BigInt(order.cancellationsMinor),
    }),
  );

  return {
    ...order,
    refundsMinor: refunds,
    netRevenueMinor,
    updatedAt: nowIso,
  };
}

/** Prefer checkout-token match; else nearest checkout session before the order. */
export function findSessionForOrder(
  sessions: readonly SessionSummary[],
  options: {
    orderedAtMs: number;
    checkoutToken?: string | null;
    indexedSessionId?: string | null;
  },
): SessionSummary | null {
  if (options.indexedSessionId) {
    const exact = sessions.find((s) => s.sessionId === options.indexedSessionId);
    if (exact) return exact;
  }

  const token = options.checkoutToken?.trim();
  if (token) {
    const byToken = sessions.find((session) =>
      session.checkoutTokens?.includes(token),
    );
    if (byToken) return byToken;
  }

  const windowMs = 6 * 60 * 60 * 1_000;
  let best: SessionSummary | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const session of sessions) {
    const path = uniquePath(session);
    if (!path.some((route) => isCheckoutRoute(route))) continue;
    const started = Date.parse(session.startedAt);
    const lastSeen = Date.parse(session.lastSeenAt);
    if (!Number.isFinite(started) || !Number.isFinite(lastSeen)) continue;
    if (started > options.orderedAtMs + 5 * 60_000) continue;
    if (lastSeen > options.orderedAtMs + 15 * 60_000) continue;
    if (options.orderedAtMs - lastSeen > windowMs) continue;
    const delta = Math.abs(options.orderedAtMs - lastSeen);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = session;
    }
  }
  return best;
}

/** Merge verified order revenue onto a session summary (preserves existing tokens). */
export function attachOrderToSession(
  session: SessionSummary,
  order: import("@pathminty/contracts").OrderFact,
): SessionSummary {
  const tokens = new Set(session.checkoutTokens ?? []);
  if (order.checkoutToken) tokens.add(order.checkoutToken);
  return {
    ...session,
    ...(tokens.size > 0 ? { checkoutTokens: [...tokens].slice(0, 16) } : {}),
    orderId: order.shopifyOrderId,
    netRevenueMinor: order.netRevenueMinor,
    currency: order.currency,
    purchasedAt: order.orderedAt,
  };
}

export function formatMoneyMinor(amountMinor: number, currency: string | null): string {
  const code = currency && /^[A-Z]{3}$/u.test(currency) ? currency : "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${code}`;
  }
}

export function normalizeStorefrontRoute(rawPath: string): string {
  const withoutQuery = rawPath.split(/[?#]/u, 1)[0] ?? "/";
  const normalized = withoutQuery.replace(/\/+$/u, "") || "/";

  if (/^\/products\/[^/]+$/u.test(normalized)) return "/products/:handle";
  if (/^\/collections\/[^/]+$/u.test(normalized)) return "/collections/:handle";
  if (/^\/collections\/[^/]+\/products\/[^/]+$/u.test(normalized)) {
    return "/collections/:handle/products/:handle";
  }

  return normalized;
}

function deviceForWidth(width: number): SessionSummary["device"] {
  if (width < 768) return "mobile";
  if (width < 1_024) return "tablet";
  return "desktop";
}

/** rrweb EventType / IncrementalSource / MouseInteractions numeric constants. */
const RRWEB = {
  FullSnapshot: 2,
  IncrementalSnapshot: 3,
  Meta: 4,
  MouseMove: 1,
  MouseInteraction: 2,
  Scroll: 3,
  ViewportResize: 4,
  TouchMove: 6,
  Click: 2,
  TouchEnd: 9,
  TouchStart: 7,
} as const;

const MAX_HOVERS_PER_SESSION = 400;
const MAX_CLICKS = 2_000;

type MutableSummary = {
  timestamps: number[];
  clicks: HeatmapClick[];
  hovers: HeatmapHover[];
  eventCount: number;
  pointerMoveCount: number;
  clickCount: number;
  maxScrollDepth: number;
  hasFullSnapshot: boolean;
  viewportWidth: number;
  viewportHeight: number;
  documentWidth: number;
  documentHeight: number;
  /** Session-scoped document scroll (carries across batch boundaries). */
  scrollX: number;
  scrollY: number;
  /** Session-scoped hover sampling clock (ms timestamps). */
  lastHoverSampleAt: number;
};

function emptyMutable(viewport: ReplayBatch["viewport"]): MutableSummary {
  return {
    timestamps: [],
    clicks: [],
    hovers: [],
    eventCount: 0,
    pointerMoveCount: 0,
    clickCount: 0,
    maxScrollDepth: 0,
    hasFullSnapshot: false,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    documentWidth: viewport.width,
    documentHeight: viewport.height,
    scrollX: 0,
    scrollY: 0,
    lastHoverSampleAt: 0,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Convert rrweb 2.1.1 mouse coordinates to document-normalized positions.
 *
 * rrweb records clientX/clientY (viewport-relative). Page position is:
 *   pageX = clientX + currentScrollX
 *   pageY = clientY + currentScrollY
 * Heatmaps normalize against the full scrollable document, not the viewport.
 */
export function normalizeClientToDocument(
  clientX: number,
  clientY: number,
  scrollX: number,
  scrollY: number,
  documentWidth: number,
  documentHeight: number,
): { x: number; y: number; pageX: number; pageY: number } {
  const pageX = clientX + scrollX;
  const pageY = clientY + scrollY;
  return {
    pageX,
    pageY,
    x: clamp01(pageX / Math.max(1, documentWidth)),
    y: clamp01(pageY / Math.max(1, documentHeight)),
  };
}

/**
 * Scroll depth as a fraction of the scrollable range (document − viewport).
 * Using document height from the recorder avoids the false 100% depth that
 * occurs when document height is estimated as scrollY + viewportHeight.
 */
export function computeScrollDepth(
  scrollY: number,
  documentHeight: number,
  viewportHeight: number,
): number {
  const scrollable = Math.max(1, documentHeight - viewportHeight);
  return clamp01(scrollY / scrollable);
}

function processJsonPayload(
  batch: Extract<ReplayBatch, { encoding: "json" }>,
  state: MutableSummary,
): void {
  state.eventCount += batch.payload.length;
  for (const event of batch.payload) {
    state.timestamps.push(event.at);
    if (event.type === "pointer_move") {
      state.pointerMoveCount += 1;
      if (state.hovers.length >= MAX_HOVERS_PER_SESSION) continue;
      state.hovers.push({
        at: event.at,
        route: batch.route,
        x: event.x,
        y: event.y,
        dwellMs: HOVER_SAMPLE_MS,
      });
    }
    if (event.type === "scroll") {
      state.maxScrollDepth = Math.max(state.maxScrollDepth, event.depth);
    }
    if (event.type !== "pointer_down") continue;
    state.clickCount += 1;
    if (state.clicks.length < MAX_CLICKS) {
      state.clicks.push({
        at: event.at,
        route: batch.route,
        x: event.x,
        y: event.y,
        ...(event.target === undefined ? {} : { target: event.target }),
      });
    }
  }
}

function processRrwebPayload(
  batch: Extract<ReplayBatch, { encoding: "rrweb" }>,
  state: MutableSummary,
): void {
  state.eventCount += batch.payload.length;

  for (const event of batch.payload) {
    state.timestamps.push(event.timestamp);
    const data = event.data as Record<string, unknown> | null;

    if (event.type === RRWEB.Meta && data && typeof data === "object") {
      if (typeof data.width === "number" && data.width > 0) {
        state.viewportWidth = data.width;
      }
      if (typeof data.height === "number" && data.height > 0) {
        state.viewportHeight = data.height;
      }
      continue;
    }

    if (event.type === RRWEB.FullSnapshot) {
      state.hasFullSnapshot = true;
      continue;
    }

    if (event.type !== RRWEB.IncrementalSnapshot || !data || typeof data !== "object") {
      continue;
    }

    const source = data.source;
    if (source === RRWEB.Scroll) {
      if (typeof data.x === "number") state.scrollX = data.x;
      if (typeof data.y === "number") state.scrollY = data.y;
      const depth = computeScrollDepth(
        state.scrollY,
        state.documentHeight,
        state.viewportHeight,
      );
      state.maxScrollDepth = Math.max(state.maxScrollDepth, depth);
      continue;
    }

    if (source === RRWEB.ViewportResize) {
      if (typeof data.width === "number" && data.width > 0) {
        state.viewportWidth = data.width;
      }
      if (typeof data.height === "number" && data.height > 0) {
        state.viewportHeight = data.height;
      }
      continue;
    }

    if (source === RRWEB.MouseMove || source === RRWEB.TouchMove) {
      const positions = Array.isArray(data.positions) ? data.positions : [];
      state.pointerMoveCount += positions.length;
      for (const position of positions) {
        if (state.hovers.length >= MAX_HOVERS_PER_SESSION) break;
        if (!position || typeof position !== "object") continue;
        const point = position as Record<string, unknown>;
        if (typeof point.x !== "number" || typeof point.y !== "number") continue;
        const timeOffset = typeof point.timeOffset === "number" ? point.timeOffset : 0;
        const at = event.timestamp + timeOffset;
        if (at - state.lastHoverSampleAt < HOVER_SAMPLE_MS) continue;
        state.lastHoverSampleAt = at;
        const normalized = normalizeClientToDocument(
          point.x,
          point.y,
          state.scrollX,
          state.scrollY,
          state.documentWidth,
          state.documentHeight,
        );
        state.hovers.push({
          at,
          route: batch.route,
          x: normalized.x,
          y: normalized.y,
          dwellMs: HOVER_SAMPLE_MS,
        });
      }
      continue;
    }

    if (source === RRWEB.MouseInteraction) {
      const interaction = data.type;
      const isClick =
        interaction === RRWEB.Click ||
        interaction === RRWEB.TouchEnd ||
        interaction === RRWEB.TouchStart;
      if (!isClick) continue;
      if (typeof data.x !== "number" || typeof data.y !== "number") continue;
      // Prefer click/touchend; skip touchstart if we will also get touchend.
      if (interaction === RRWEB.TouchStart) continue;
      state.clickCount += 1;
      if (state.clicks.length >= MAX_CLICKS) continue;
      // rrweb 2.1.1: data.x/data.y are clientX/clientY (six args only).
      const normalized = normalizeClientToDocument(
        data.x,
        data.y,
        state.scrollX,
        state.scrollY,
        state.documentWidth,
        state.documentHeight,
      );
      state.clicks.push({
        at: event.timestamp,
        route: batch.route,
        x: normalized.x,
        y: normalized.y,
      });
    }
  }
}

/** Pre-scan every batch for the max document size before mapping points. */
export function maxDocumentFromBatches(
  batches: readonly ReplayBatch[],
  fallbackViewport: ReplayBatch["viewport"],
): { width: number; height: number } {
  let width = fallbackViewport.width;
  let height = fallbackViewport.height;
  for (const batch of batches) {
    if (!batch.document) continue;
    if (batch.document.width > width) width = batch.document.width;
    if (batch.document.height > height) height = batch.document.height;
  }
  return { width, height };
}

export function resolveSessionStatus(
  lastSeenAt: string,
  isFinal: boolean,
  nowMs: number = Date.now(),
): SessionSummary["status"] {
  if (isFinal) return "ended";
  const lastSeen = Date.parse(lastSeenAt);
  if (!Number.isFinite(lastSeen)) return "ended";
  if (nowMs - lastSeen >= SESSION_IDLE_TIMEOUT_MS) return "ended";
  return "active";
}

export function summarizeReplayBatches(
  input: readonly ReplayBatch[],
  options: { isFinal?: boolean; nowMs?: number } = {},
): SessionSummary {
  if (input.length === 0) {
    throw new Error("At least one replay batch is required");
  }

  const batches = [...input].sort((left, right) => left.sequence - right.sequence);
  const first = batches[0];
  const last = batches.at(-1);
  if (!first || !last) throw new Error("Replay batches are missing");

  if (
    batches.some(
      (batch) => batch.shopId !== first.shopId || batch.sessionId !== first.sessionId,
    )
  ) {
    throw new Error("Replay batches must belong to one shop and session");
  }

  const routes = [...new Set(batches.map((batch) => batch.route))].slice(0, 64);
  const state = emptyMutable(last.viewport);
  // Stable full-session document space: pre-scan max dimensions so early clicks
  // normalize against the final page size when the document grows mid-session.
  const maxDocument = maxDocumentFromBatches(batches, last.viewport);
  state.documentWidth = maxDocument.width;
  state.documentHeight = maxDocument.height;
  let sawFinal = options.isFinal === true;

  for (const batch of batches) {
    if (batch.isFinal) sawFinal = true;
    if (batch.encoding === "json") {
      processJsonPayload(batch, state);
    } else {
      processRrwebPayload(batch, state);
    }
  }

  const capturedTimes = batches.map((batch) => Date.parse(batch.capturedAt));
  const startedMs =
    state.timestamps.length > 0 ? Math.min(...state.timestamps) : capturedTimes[0];
  const endedMs = Math.max(...state.timestamps, ...capturedTimes);
  if (
    startedMs === undefined ||
    !Number.isFinite(startedMs) ||
    !Number.isFinite(endedMs)
  ) {
    throw new Error("Replay batch timestamps are invalid");
  }

  const lastSeenAt = new Date(endedMs).toISOString();
  const status = resolveSessionStatus(
    lastSeenAt,
    sawFinal,
    options.nowMs ?? Date.now(),
  );

  return {
    schemaVersion: 1,
    shopId: first.shopId,
    visitorId: first.visitorId,
    sessionId: first.sessionId,
    startedAt: new Date(startedMs).toISOString(),
    endedAt: lastSeenAt,
    lastSeenAt,
    durationMs: Math.max(0, endedMs - startedMs),
    status,
    entryRoute: first.route,
    exitRoute: last.route,
    routes,
    viewport: {
      width: state.viewportWidth,
      height: state.viewportHeight,
      devicePixelRatio: last.viewport.devicePixelRatio,
    },
    document: {
      width: state.documentWidth,
      height: state.documentHeight,
    },
    device: deviceForWidth(state.viewportWidth),
    source: batches.some((batch) => batch.source === "test") ? "test" : "storefront",
    eventCount: state.eventCount,
    pointerMoveCount: state.pointerMoveCount,
    clickCount: state.clickCount,
    maxScrollDepth: state.maxScrollDepth,
    hasFullSnapshot: state.hasFullSnapshot,
    clicks: state.clicks,
    hovers: state.hovers,
  };
}

export function orderReplayEvents(batches: readonly ReplayBatch[]): RrwebEvent[] {
  const ordered = [...batches].sort((left, right) => left.sequence - right.sequence);
  const events: RrwebEvent[] = [];
  for (const batch of ordered) {
    if (batch.encoding !== "rrweb") continue;
    for (const event of batch.payload) {
      events.push(event);
    }
  }
  return events.sort((left, right) => left.timestamp - right.timestamp);
}

export type ReplayReconstruction =
  | { reconstruction: "ready"; reconstructionWarning?: string }
  | { reconstruction: "incomplete"; incompleteReason: string };

/**
 * Decide whether a stored session can be played in rrweb-player.
 *
 * Sequence gaps (lost pagehide flushes, checkout navigations, adblock) must not
 * block playback when Meta + FullSnapshot are present — the timeline is partial
 * but still useful. Gaps surface as a soft warning for the merchant UI.
 */
export function assessReplayReconstruction(
  batches: readonly ReplayBatch[],
): ReplayReconstruction {
  if (batches.length === 0) {
    return {
      reconstruction: "incomplete",
      incompleteReason: "No replay batches were stored for this session.",
    };
  }

  const ordered = [...batches].sort((left, right) => left.sequence - right.sequence);
  const hasRrweb = ordered.some((batch) => batch.encoding === "rrweb");
  if (!hasRrweb) {
    return {
      reconstruction: "incomplete",
      incompleteReason:
        "This session was captured without DOM snapshots (legacy coordinate encoding).",
    };
  }

  const events = orderReplayEvents(ordered);
  const hasMeta = events.some((event) => event.type === RRWEB.Meta);
  const hasFull = events.some((event) => event.type === RRWEB.FullSnapshot);
  if (!hasMeta || !hasFull) {
    return {
      reconstruction: "incomplete",
      incompleteReason:
        "Recording incomplete: missing the initial full DOM snapshot needed for reconstruction.",
    };
  }

  const missingSequences: number[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (!previous || !current) continue;
    for (let seq = previous.sequence + 1; seq < current.sequence; seq += 1) {
      missingSequences.push(seq);
    }
  }

  if (missingSequences.length > 0) {
    const preview = missingSequences.slice(0, 6).join(", ");
    const more =
      missingSequences.length > 6 ? ` (+${missingSequences.length - 6} more)` : "";
    return {
      reconstruction: "ready",
      reconstructionWarning: `Some moments were not uploaded (missing batch ${preview}${more}). Playback continues with the segments we have — gaps are common when shoppers leave for checkout or a network flush is interrupted.`,
    };
  }

  return { reconstruction: "ready" };
}

/** Extract a short representative snapshot sequence for heatmap backgrounds. */
export function extractSnapshotEvents(
  batches: readonly ReplayBatch[],
): RrwebEvent[] | null {
  const events = orderReplayEvents(batches);
  if (events.length === 0) return null;

  const metaIndex = events.findIndex((event) => event.type === RRWEB.Meta);
  const fullIndex = events.findIndex((event) => event.type === RRWEB.FullSnapshot);
  if (metaIndex < 0 || fullIndex < 0) return null;

  const start = Math.min(metaIndex, fullIndex);
  const slice = events.slice(start, Math.min(events.length, fullIndex + 5));
  return slice.length >= 2 ? slice : null;
}

function quantize(value: number, bins = 80): number {
  return Math.round(clamp01(value) * bins) / bins;
}

export function aggregateHeatmapPoints(
  items: readonly { x: number; y: number; weight?: number }[],
): HeatmapPoint[] {
  const buckets = new Map<string, HeatmapPoint>();
  for (const item of items) {
    const x = quantize(item.x);
    const y = quantize(item.y);
    const key = `${x}:${y}`;
    const existing = buckets.get(key);
    const weight = item.weight ?? 1;
    if (existing) {
      buckets.set(key, { x, y, weight: existing.weight + weight });
    } else {
      buckets.set(key, { x, y, weight });
    }
  }
  return [...buckets.values()].sort((left, right) => right.weight - left.weight);
}

export function buildHeatmap(input: {
  shopId: string;
  route: string;
  device: HeatmapResponse["device"];
  mode: HeatmapMode;
  sessions: readonly SessionSummary[];
  snapshotEvents: RrwebEvent[] | null;
  /** Inclusive event time window (epoch ms). Omit for all events on matching sessions. */
  fromMs?: number;
  toMs?: number;
}): HeatmapResponse {
  const fromMs = input.fromMs ?? Number.NEGATIVE_INFINITY;
  const toMs = input.toMs ?? Number.POSITIVE_INFINITY;

  const routeFiltered = input.sessions.filter((session) => {
    if (session.source === "test") return false;
    if (input.device !== "all" && session.device !== input.device) return false;
    if (
      Number.isFinite(fromMs) &&
      Number.isFinite(toMs) &&
      !sessionOverlapsRange(session, fromMs, toMs)
    ) {
      return false;
    }
    return session.routes.includes(input.route) || session.entryRoute === input.route;
  });

  const rawPoints: { x: number; y: number; weight: number }[] = [];
  for (const session of routeFiltered) {
    if (input.mode === "click") {
      for (const click of session.clicks) {
        if (click.route !== input.route) continue;
        if (!eventInRange(click.at, fromMs, toMs)) continue;
        rawPoints.push({ x: click.x, y: click.y, weight: 1 });
      }
    } else {
      for (const hover of session.hovers) {
        if (hover.route !== input.route) continue;
        if (!eventInRange(hover.at, fromMs, toMs)) continue;
        rawPoints.push({
          x: hover.x,
          y: hover.y,
          weight: Math.max(1, Math.round(hover.dwellMs / HOVER_SAMPLE_MS)),
        });
      }
    }
  }

  const points = aggregateHeatmapPoints(rawPoints);
  const representative =
    routeFiltered.find((session) => session.routes.includes(input.route)) ??
    routeFiltered[0];
  const viewport = representative?.viewport ?? null;
  const document = representative?.document ?? null;

  let status: HeatmapResponse["status"] = "empty";
  if (points.length > 0 && input.snapshotEvents) status = "ok";
  else if (points.length > 0) status = "interactions_without_snapshot";
  else status = "empty";

  return {
    shopId: input.shopId,
    route: input.route,
    device: input.device,
    mode: input.mode,
    sessionCount: routeFiltered.length,
    eventCount: points.reduce((sum, point) => sum + point.weight, 0),
    viewport,
    document,
    points,
    snapshotEvents: input.snapshotEvents,
    status,
  };
}

export function dedupeClicks(clicks: readonly HeatmapClick[]): HeatmapClick[] {
  const seen = new Set<string>();
  const output: HeatmapClick[] = [];
  for (const click of clicks) {
    const key = `${click.at}|${click.route}|${click.x}|${click.y}|${click.target ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(click);
  }
  return output;
}
