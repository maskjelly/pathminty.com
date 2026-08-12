import type { ReplayBatch, RrwebEvent, SessionSummary } from "@pathminty/contracts";
import { SESSION_IDLE_TIMEOUT_MS } from "@pathminty/contracts";
import { describe, expect, it } from "vitest";

import {
  assessReplayReconstruction,
  buildActivityTimeline,
  buildHeatmap,
  buildRouteIndex,
  calculateNetRevenueMinor,
  computeScrollDepth,
  normalizeClientToDocument,
  normalizeStorefrontRoute,
  orderReplayEvents,
  resolveSessionStatus,
  resolveTimePreset,
  summarizeReplayBatches,
} from "../src/index";

const shopId = "pathminty-demo-store.myshopify.com";
const sessionId = "cb6f58ff-53e1-42d2-8ae3-8f74ac52fb6d";

type JsonReplayBatch = Extract<ReplayBatch, { encoding: "json" }>;
type RrwebReplayBatch = Extract<ReplayBatch, { encoding: "rrweb" }>;

/** Optional fields only; never pass explicit `undefined` (exactOptionalPropertyTypes). */
type JsonBatchOverrides = {
  sequence: number;
  batchId?: string;
  isFinal?: boolean;
  capturedAt?: string;
  route?: string;
  payload?: JsonReplayBatch["payload"];
  source?: JsonReplayBatch["source"];
  document?: JsonReplayBatch["document"];
};

type RrwebBatchOverrides = {
  sequence: number;
  batchId?: string;
  isFinal?: boolean;
  capturedAt?: string;
  route?: string;
  payload?: readonly RrwebEvent[];
  source?: RrwebReplayBatch["source"];
  document?: RrwebReplayBatch["document"];
  viewport?: RrwebReplayBatch["viewport"];
};

function jsonBatch(overrides: JsonBatchOverrides): JsonReplayBatch {
  const batch: JsonReplayBatch = {
    schemaVersion: 1,
    batchId: overrides.batchId ?? "2c907c67-d57f-47aa-ac9d-e275ca730bf2",
    shopId,
    visitorId: "visitor_demo_01",
    sessionId,
    sequence: overrides.sequence,
    capturedAt: overrides.capturedAt ?? "2026-08-11T08:00:02.000Z",
    route: overrides.route ?? "/collections/new",
    viewport: { width: 390, height: 844, devicePixelRatio: 3 },
    document: overrides.document ?? { width: 390, height: 2_400 },
    encoding: "json",
    source: overrides.source ?? "storefront",
    payload: overrides.payload ?? [
      { type: "page_view", at: 1_786_435_200_000 },
      {
        type: "pointer_down",
        at: 1_786_435_201_000,
        x: 0.25,
        y: 0.75,
        pointer: "touch",
        target: "main > button",
      },
      { type: "scroll", at: 1_786_435_202_000, depth: 0.8 },
    ],
    isFinal: overrides.isFinal ?? false,
  };
  return batch;
}

function rrwebBatch(overrides: RrwebBatchOverrides): RrwebReplayBatch {
  const batch: RrwebReplayBatch = {
    schemaVersion: 1,
    batchId: overrides.batchId ?? "3c907c67-d57f-47aa-ac9d-e275ca730bf3",
    shopId,
    visitorId: "visitor_demo_01",
    sessionId,
    sequence: overrides.sequence,
    capturedAt: overrides.capturedAt ?? "2026-08-11T08:00:05.000Z",
    route: overrides.route ?? "/collections/new",
    viewport: overrides.viewport ?? {
      width: 1_280,
      height: 800,
      devicePixelRatio: 2,
    },
    document: overrides.document ?? { width: 1_280, height: 4_000 },
    encoding: "rrweb",
    source: overrides.source ?? "storefront",
    payload: overrides.payload
      ? [...overrides.payload]
      : [
          {
            type: 4,
            data: { href: "https://shop.example/", width: 1_280, height: 800 },
            timestamp: 1_000,
          },
          {
            type: 2,
            data: {
              node: { type: 0, childNodes: [] },
              initialOffset: { top: 0, left: 0 },
            },
            timestamp: 1_010,
          },
          {
            type: 3,
            data: {
              source: 2,
              type: 2,
              id: 1,
              x: 320,
              y: 200,
            },
            timestamp: 1_500,
          },
          {
            type: 3,
            data: {
              source: 1,
              positions: [
                { x: 100, y: 100, id: 1, timeOffset: 0 },
                { x: 110, y: 120, id: 1, timeOffset: 300 },
              ],
            },
            timestamp: 2_000,
          },
        ],
    isFinal: overrides.isFinal ?? false,
  };
  return batch;
}

describe("calculateNetRevenueMinor", () => {
  it("subtracts discounts, refunds, and cancellations", () => {
    expect(
      calculateNetRevenueMinor({
        grossMerchandiseValueMinor: 10_000n,
        discountsMinor: 1_000n,
        refundsMinor: 2_000n,
        cancellationsMinor: 500n,
      }),
    ).toBe(6_500n);
  });

  it("does not report negative net revenue", () => {
    expect(
      calculateNetRevenueMinor({
        grossMerchandiseValueMinor: 100n,
        discountsMinor: 200n,
        refundsMinor: 0n,
        cancellationsMinor: 0n,
      }),
    ).toBe(0n);
  });
});

describe("normalizeStorefrontRoute", () => {
  it("normalizes product handles while dropping query parameters", () => {
    expect(normalizeStorefrontRoute("/products/red-shirt?variant=1")).toBe(
      "/products/:handle",
    );
  });
});

describe("summarizeReplayBatches", () => {
  it("builds a tenant-scoped interaction summary from json events", () => {
    const summary = summarizeReplayBatches(
      [jsonBatch({ sequence: 0, isFinal: true })],
      {
        isFinal: true,
      },
    );

    expect(summary).toMatchObject({
      shopId,
      device: "mobile",
      clickCount: 1,
      maxScrollDepth: 0.8,
      eventCount: 3,
      status: "ended",
      hasFullSnapshot: false,
    });
    expect(summary.clicks[0]).toMatchObject({ x: 0.25, y: 0.75 });
    expect(summary.hovers.length).toBeGreaterThanOrEqual(0);
  });

  it("marks non-final recent sessions as active", () => {
    const now = Date.parse("2026-08-11T08:00:10.000Z");
    const summary = summarizeReplayBatches(
      [
        jsonBatch({
          sequence: 0,
          isFinal: false,
          capturedAt: "2026-08-11T08:00:02.000Z",
          payload: [{ type: "page_view", at: now - 1_000 }],
        }),
      ],
      { isFinal: false, nowMs: now },
    );
    expect(summary.status).toBe("active");
    expect(summary.lastSeenAt).toBeTruthy();
  });

  it("updates summaries before a final batch so active sessions appear", () => {
    const first = summarizeReplayBatches([jsonBatch({ sequence: 0, isFinal: false })], {
      isFinal: false,
      nowMs: Date.parse("2026-08-11T08:00:03.000Z"),
    });
    expect(first.status).toBe("active");
    expect(first.clickCount).toBe(1);

    const second = summarizeReplayBatches(
      [
        jsonBatch({ sequence: 0, isFinal: false }),
        jsonBatch({
          sequence: 1,
          batchId: "4c907c67-d57f-47aa-ac9d-e275ca730bf4",
          isFinal: false,
          payload: [
            {
              type: "pointer_down",
              at: 1_786_435_210_000,
              x: 0.5,
              y: 0.5,
              pointer: "mouse",
            },
          ],
        }),
      ],
      { isFinal: false, nowMs: Date.parse("2026-08-11T08:00:20.000Z") },
    );
    expect(second.clickCount).toBe(2);
    expect(second.status).toBe("active");
  });

  it("extracts clicks and hover samples from rrweb payloads", () => {
    const summary = summarizeReplayBatches([rrwebBatch({ sequence: 0 })], {
      isFinal: false,
      nowMs: 3_000,
    });
    expect(summary.hasFullSnapshot).toBe(true);
    expect(summary.clickCount).toBe(1);
    expect(summary.pointerMoveCount).toBe(2);
    expect(summary.hovers.length).toBeGreaterThan(0);
    expect(summary.device).toBe("desktop");
    expect(summary.document).toEqual({ width: 1_280, height: 4_000 });
  });

  it("maps scrolled client coordinates into document-normalized page positions", () => {
    // Click at client (100, 150) after scrolling 500px down on a 4000px page.
    const summary = summarizeReplayBatches(
      [
        rrwebBatch({
          sequence: 0,
          document: { width: 1_280, height: 4_000 },
          viewport: { width: 1_280, height: 800, devicePixelRatio: 2 },
          payload: [
            {
              type: 4,
              data: { width: 1_280, height: 800 },
              timestamp: 1_000,
            },
            {
              type: 2,
              data: {
                node: { type: 0, childNodes: [] },
                initialOffset: { top: 0, left: 0 },
              },
              timestamp: 1_010,
            },
            {
              type: 3,
              data: { source: 3, id: 1, x: 0, y: 500 },
              timestamp: 1_200,
            },
            {
              type: 3,
              data: { source: 2, type: 2, id: 1, x: 100, y: 150 },
              timestamp: 1_500,
            },
            {
              type: 3,
              data: {
                source: 1,
                positions: [{ x: 50, y: 80, id: 1, timeOffset: 0 }],
              },
              timestamp: 1_800,
            },
          ],
        }),
      ],
      { isFinal: true },
    );

    // pageY = 150 + 500 = 650 → 650/4000 = 0.1625
    expect(summary.clicks[0]?.x).toBeCloseTo(100 / 1_280, 5);
    expect(summary.clicks[0]?.y).toBeCloseTo(650 / 4_000, 5);
    // pageY = 80 + 500 = 580 → 580/4000
    expect(summary.hovers[0]?.x).toBeCloseTo(50 / 1_280, 5);
    expect(summary.hovers[0]?.y).toBeCloseTo(580 / 4_000, 5);
    // scroll depth = 500 / (4000 - 800) ≈ 0.156, not 1.0
    expect(summary.maxScrollDepth).toBeCloseTo(500 / 3_200, 5);
    expect(summary.maxScrollDepth).toBeLessThan(0.5);
  });

  it("carries scroll position across batch boundaries for later clicks", () => {
    const summary = summarizeReplayBatches(
      [
        rrwebBatch({
          sequence: 0,
          document: { width: 1_000, height: 3_000 },
          viewport: { width: 1_000, height: 800, devicePixelRatio: 1 },
          payload: [
            {
              type: 4,
              data: { width: 1_000, height: 800 },
              timestamp: 1_000,
            },
            {
              type: 2,
              data: {
                node: { type: 0, childNodes: [] },
                initialOffset: { top: 0, left: 0 },
              },
              timestamp: 1_010,
            },
            {
              type: 3,
              data: { source: 3, id: 1, x: 0, y: 900 },
              timestamp: 1_200,
            },
          ],
        }),
        rrwebBatch({
          sequence: 1,
          batchId: "5c907c67-d57f-47aa-ac9d-e275ca730bf5",
          document: { width: 1_000, height: 3_000 },
          viewport: { width: 1_000, height: 800, devicePixelRatio: 1 },
          payload: [
            {
              type: 3,
              data: { source: 2, type: 2, id: 1, x: 50, y: 100 },
              timestamp: 2_000,
            },
          ],
        }),
      ],
      { isFinal: true },
    );

    // Click is in batch N+1; scroll from batch N must still apply.
    // pageY = 100 + 900 = 1000 → 1000/3000
    expect(summary.clicks).toHaveLength(1);
    expect(summary.clicks[0]?.x).toBeCloseTo(50 / 1_000, 5);
    expect(summary.clicks[0]?.y).toBeCloseTo(1_000 / 3_000, 5);
    expect(summary.clicks[0]?.y).not.toBeCloseTo(100 / 3_000, 5);
  });

  it("normalizes early points against pre-scanned max document height", () => {
    const summary = summarizeReplayBatches(
      [
        rrwebBatch({
          sequence: 0,
          document: { width: 1_000, height: 2_000 },
          viewport: { width: 1_000, height: 800, devicePixelRatio: 1 },
          payload: [
            {
              type: 4,
              data: { width: 1_000, height: 800 },
              timestamp: 1_000,
            },
            {
              type: 2,
              data: {
                node: { type: 0, childNodes: [] },
                initialOffset: { top: 0, left: 0 },
              },
              timestamp: 1_010,
            },
            {
              type: 3,
              data: { source: 2, type: 2, id: 1, x: 0, y: 500 },
              timestamp: 1_500,
            },
          ],
        }),
        rrwebBatch({
          sequence: 1,
          batchId: "6c907c67-d57f-47aa-ac9d-e275ca730bf6",
          // Page grew after more content loaded.
          document: { width: 1_000, height: 5_000 },
          viewport: { width: 1_000, height: 800, devicePixelRatio: 1 },
          payload: [
            {
              type: 3,
              data: { source: 2, type: 2, id: 1, x: 0, y: 100 },
              timestamp: 2_500,
            },
          ],
        }),
      ],
      { isFinal: true },
    );

    expect(summary.document).toEqual({ width: 1_000, height: 5_000 });
    // Early click at clientY=500 with scroll 0 → y = 500/5000 (max height), not 500/2000.
    expect(summary.clicks[0]?.y).toBeCloseTo(500 / 5_000, 5);
    expect(summary.clicks[0]?.y).not.toBeCloseTo(500 / 2_000, 5);
    // Later click at clientY=100 → y = 100/5000
    expect(summary.clicks[1]?.y).toBeCloseTo(100 / 5_000, 5);
  });
});

describe("coordinate helpers", () => {
  it("adds scroll offsets to client coordinates for page position", () => {
    const point = normalizeClientToDocument(100, 150, 0, 500, 1_280, 4_000);
    expect(point.pageX).toBe(100);
    expect(point.pageY).toBe(650);
    expect(point.x).toBeCloseTo(100 / 1_280, 5);
    expect(point.y).toBeCloseTo(650 / 4_000, 5);
  });

  it("does not report 100% scroll depth on the first nonzero scroll", () => {
    expect(computeScrollDepth(100, 4_000, 800)).toBeCloseTo(100 / 3_200, 5);
    expect(computeScrollDepth(0, 4_000, 800)).toBe(0);
  });
});

describe("resolveSessionStatus", () => {
  it("ends sessions after idle timeout without a final browser request", () => {
    const lastSeenAt = "2026-08-11T08:00:00.000Z";
    const now = Date.parse(lastSeenAt) + SESSION_IDLE_TIMEOUT_MS + 1;
    expect(resolveSessionStatus(lastSeenAt, false, now)).toBe("ended");
    expect(
      resolveSessionStatus(lastSeenAt, false, Date.parse(lastSeenAt) + 1_000),
    ).toBe("active");
  });
});

describe("replay ordering and reconstruction", () => {
  it("orders rrweb events chronologically across batches", () => {
    const events = orderReplayEvents([
      rrwebBatch({
        sequence: 1,
        batchId: "5c907c67-d57f-47aa-ac9d-e275ca730bf5",
        payload: [
          {
            type: 3,
            data: { source: 3, id: 1, x: 0, y: 40 },
            timestamp: 3_000,
          },
        ],
      }),
      rrwebBatch({ sequence: 0 }),
    ]);
    expect(events[0]?.timestamp).toBeLessThan(events.at(-1)?.timestamp ?? 0);
    expect(events.some((event) => event.type === 2)).toBe(true);
  });

  it("reports incomplete when the full snapshot is missing", () => {
    const result = assessReplayReconstruction([
      rrwebBatch({
        sequence: 0,
        payload: [{ type: 4, data: { width: 100, height: 100 }, timestamp: 1 }],
      }),
    ]);
    expect(result.reconstruction).toBe("incomplete");
    if (result.reconstruction !== "incomplete") {
      // Narrow ReplayReconstruction before reading incompleteReason.
      throw new Error(
        `expected incomplete reconstruction, got ${result.reconstruction}`,
      );
    }
    expect(result.incompleteReason).toMatch(/full DOM snapshot/i);
  });

  it("reports ready for a continuous rrweb timeline", () => {
    const result = assessReplayReconstruction([rrwebBatch({ sequence: 0 })]);
    expect(result.reconstruction).toBe("ready");
    if (result.reconstruction !== "ready") {
      throw new Error(
        `expected ready reconstruction, got ${result.reconstruction}: ${result.incompleteReason}`,
      );
    }
  });
});

describe("buildHeatmap", () => {
  it("aggregates by shop, route, device, and mode without test data", () => {
    const storefront = summarizeReplayBatches([rrwebBatch({ sequence: 0 })], {
      isFinal: true,
    });
    const testSession = {
      ...storefront,
      sessionId: "db6f58ff-53e1-42d2-8ae3-8f74ac52fb6e",
      source: "test" as const,
    };

    const snapshotBatch = rrwebBatch({ sequence: 0 });
    const heatmap = buildHeatmap({
      shopId,
      route: "/collections/new",
      device: "desktop",
      mode: "click",
      sessions: [storefront, testSession],
      // rrwebBatch is typed as encoding:"rrweb", so payload is RrwebEvent[].
      snapshotEvents: snapshotBatch.payload,
    });

    expect(heatmap.shopId).toBe(shopId);
    expect(heatmap.sessionCount).toBe(1);
    expect(heatmap.points.length).toBeGreaterThan(0);
    expect(heatmap.status).toBe("ok");
  });

  it("surfaces interactions_without_snapshot when clicks lack DOM", () => {
    const summary = summarizeReplayBatches(
      [jsonBatch({ sequence: 0, isFinal: true })],
      {
        isFinal: true,
      },
    );
    const heatmap = buildHeatmap({
      shopId,
      route: "/collections/new",
      device: "mobile",
      mode: "click",
      sessions: [summary],
      snapshotEvents: null,
    });
    expect(heatmap.status).toBe("interactions_without_snapshot");
    expect(heatmap.points.length).toBeGreaterThan(0);
    expect(heatmap.document).toEqual({ width: 390, height: 2_400 });
  });
});

describe("time range and route index", () => {
  const now = Date.parse("2026-08-12T12:00:00.000Z");

  function summaryWith(
    overrides: Partial<ReturnType<typeof summarizeReplayBatches>> & {
      clicks?: SessionSummary["clicks"];
      routes?: string[];
      entryRoute?: string;
    },
  ): SessionSummary {
    const base = summarizeReplayBatches([rrwebBatch({ sequence: 0 })], {
      isFinal: true,
    });
    return { ...base, ...overrides } as SessionSummary;
  }

  it("resolveTimePreset spans the expected window", () => {
    const window = resolveTimePreset("24h", now);
    expect(window.toMs).toBe(now);
    expect(window.fromMs).toBe(now - 24 * 60 * 60 * 1_000);
  });

  it("ranks most and least active routes with session floor", () => {
    const busy = summaryWith({
      sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      routes: ["/hot"],
      entryRoute: "/hot",
      clicks: [
        { at: now - 1_000, route: "/hot", x: 0.2, y: 0.2 },
        { at: now - 2_000, route: "/hot", x: 0.3, y: 0.3 },
        { at: now - 3_000, route: "/hot", x: 0.4, y: 0.4 },
        { at: now - 4_000, route: "/hot", x: 0.5, y: 0.5 },
        { at: now - 5_000, route: "/hot", x: 0.6, y: 0.6 },
        { at: now - 6_000, route: "/hot", x: 0.7, y: 0.7 },
      ],
      startedAt: new Date(now - 10_000).toISOString(),
      lastSeenAt: new Date(now - 1_000).toISOString(),
      endedAt: new Date(now - 1_000).toISOString(),
    });
    const quietSessions = [0, 1, 2].map((index) =>
      summaryWith({
        sessionId: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${index}`,
        visitorId: `visitor_quiet_${index}`,
        routes: ["/quiet"],
        entryRoute: "/quiet",
        clicks: [{ at: now - 5_000, route: "/quiet", x: 0.5, y: 0.5 }],
        startedAt: new Date(now - 20_000).toISOString(),
        lastSeenAt: new Date(now - 4_000).toISOString(),
        endedAt: new Date(now - 4_000).toISOString(),
      }),
    );
    const sparse = summaryWith({
      sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      routes: ["/once"],
      entryRoute: "/once",
      clicks: [],
      startedAt: new Date(now - 8_000).toISOString(),
      lastSeenAt: new Date(now - 2_000).toISOString(),
      endedAt: new Date(now - 2_000).toISOString(),
    });

    const index = buildRouteIndex({
      sessions: [busy, ...quietSessions, sparse],
      fromMs: now - 60_000,
      toMs: now,
      mode: "click",
      sort: "most_active",
      limit: 10,
    });

    expect(index.mostActive?.route).toBe("/hot");
    expect(index.leastActive?.route).toBe("/quiet");
    expect(index.totalRoutes).toBe(3);
    expect(index.routes[0]?.route).toBe("/hot");
  });

  it("buildActivityTimeline buckets events", () => {
    const session = summaryWith({
      routes: ["/"],
      entryRoute: "/",
      clicks: [
        { at: now - 2 * 60 * 60 * 1_000, route: "/", x: 0.1, y: 0.1 },
        { at: now - 30 * 60 * 1_000, route: "/", x: 0.2, y: 0.2 },
      ],
      startedAt: new Date(now - 3 * 60 * 60 * 1_000).toISOString(),
      lastSeenAt: new Date(now - 10_000).toISOString(),
      endedAt: new Date(now - 10_000).toISOString(),
    });
    const timeline = buildActivityTimeline({
      sessions: [session],
      fromMs: now - 24 * 60 * 60 * 1_000,
      toMs: now,
      mode: "click",
      bucketCount: 24,
    });
    expect(timeline.buckets).toHaveLength(24);
    expect(timeline.buckets.reduce((sum, b) => sum + b.eventCount, 0)).toBe(2);
  });
});
