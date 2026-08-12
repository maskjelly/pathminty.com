import type {
  HeatmapClick,
  HeatmapHover,
  HeatmapMode,
  HeatmapPoint,
  HeatmapResponse,
  ReplayBatch,
  RrwebEvent,
  SessionSummary,
} from "@pathminty/contracts";
import { SESSION_IDLE_TIMEOUT_MS } from "@pathminty/contracts";

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

const HOVER_SAMPLE_MS = 250;
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
  | { reconstruction: "ready" }
  | { reconstruction: "incomplete"; incompleteReason: string };

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

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (!previous || !current) continue;
    if (current.sequence > previous.sequence + 1) {
      return {
        reconstruction: "incomplete",
        incompleteReason: `Recording incomplete: missing batch sequence ${
          previous.sequence + 1
        } (gap before ${current.sequence}).`,
      };
    }
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
}): HeatmapResponse {
  const routeFiltered = input.sessions.filter((session) => {
    if (session.source === "test") return false;
    if (input.device !== "all" && session.device !== input.device) return false;
    return session.routes.includes(input.route) || session.entryRoute === input.route;
  });

  const rawPoints: { x: number; y: number; weight: number }[] = [];
  for (const session of routeFiltered) {
    if (input.mode === "click") {
      for (const click of session.clicks) {
        if (click.route !== input.route) continue;
        rawPoints.push({ x: click.x, y: click.y, weight: 1 });
      }
    } else {
      for (const hover of session.hovers) {
        if (hover.route !== input.route) continue;
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
