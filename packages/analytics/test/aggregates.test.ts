import type { SessionSummary } from "@pathminty/contracts";
import { describe, expect, it } from "vitest";

import {
  applyInboxToDaily,
  buildAggregateInboxItem,
  emptyDailyAggregate,
  heatmapFromAggregate,
  mergeDailyAggregates,
  shouldKeepReplay,
} from "../src/aggregates";

const shopId = "pathminty-demo-store.myshopify.com";

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    schemaVersion: 1,
    shopId,
    visitorId: "visitor_demo_01",
    sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    startedAt: "2026-08-14T10:00:00.000Z",
    endedAt: "2026-08-14T10:02:00.000Z",
    lastSeenAt: "2026-08-14T10:02:00.000Z",
    durationMs: 120_000,
    status: "ended",
    entryRoute: "/",
    exitRoute: "/",
    routes: ["/"],
    viewport: { width: 1280, height: 800, devicePixelRatio: 2 },
    document: { width: 1280, height: 2000 },
    device: "desktop",
    source: "storefront",
    eventCount: 4,
    pointerMoveCount: 10,
    clickCount: 2,
    maxScrollDepth: 0.4,
    hasFullSnapshot: true,
    clicks: [
      { at: 1_723_632_000_000, route: "/", x: 0.4, y: 0.3 },
      { at: 1_723_632_001_000, route: "/", x: 0.4, y: 0.3 },
    ],
    hovers: [],
    ...overrides,
  };
}

describe("shouldKeepReplay", () => {
  it("keeps about one in twenty sessions and all rage sessions", () => {
    expect(shouldKeepReplay("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 2)).toBe(true);
    const kept = Array.from({ length: 200 }, (_, index) => {
      const hex = index.toString(16).padStart(8, "0");
      return shouldKeepReplay(`${hex.slice(0, 8)}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
    }).filter(Boolean).length;
    expect(kept).toBeGreaterThan(5);
    expect(kept).toBeLessThan(20);
  });
});

describe("daily aggregates", () => {
  it("counts a session once and folds many clicks into one cell", () => {
    const first = buildAggregateInboxItem({
      id: "job-1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      previous: null,
      next: summary(),
      keepReplay: true,
    });
    let daily = applyInboxToDaily(emptyDailyAggregate(shopId, "2026-08-14"), first);
    daily = applyInboxToDaily(daily, first);
    expect(daily.totalSessions).toBe(1);
    expect(daily.routes["/"]?.sessionCount).toBe(1);
    expect(daily.routes["/"]?.clickCount).toBe(2);
    expect(daily.routes["/"]?.clickCells).toHaveLength(1);
    expect(daily.routes["/"]?.clickCells[0]?.weight).toBe(2);
    expect(daily.recentReplayIds).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
  });

  it("adds only new clicks when the same session is summarized again", () => {
    const previous = summary();
    const next = summary({
      clicks: [
        ...previous.clicks,
        { at: 1_723_632_002_000, route: "/", x: 0.8, y: 0.2 },
      ],
      clickCount: 3,
    });
    const inbox = buildAggregateInboxItem({
      id: "job-2-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      previous,
      next,
      keepReplay: false,
    });
    expect(inbox.isNewSession).toBe(false);
    expect(inbox.clicks).toHaveLength(1);
    const daily = applyInboxToDaily(emptyDailyAggregate(shopId, "2026-08-14"), inbox);
    expect(daily.totalSessions).toBe(0);
    expect(daily.routes["/"]?.clickCount).toBe(1);
  });

  it("merges two days without dropping weights", () => {
    const left = applyInboxToDaily(
      emptyDailyAggregate(shopId, "2026-08-13"),
      buildAggregateInboxItem({
        id: "job-a-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        previous: null,
        next: summary({ lastSeenAt: "2026-08-13T10:00:00.000Z" }),
        keepReplay: false,
      }),
    );
    const right = applyInboxToDaily(
      emptyDailyAggregate(shopId, "2026-08-14"),
      buildAggregateInboxItem({
        id: "job-b-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        previous: null,
        next: summary({
          sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          lastSeenAt: "2026-08-14T10:00:00.000Z",
        }),
        keepReplay: false,
      }),
    );
    const merged = mergeDailyAggregates([left, right]);
    expect(merged?.totalSessions).toBe(2);
    expect(merged?.routes["/"]?.clickCount).toBe(4);
    const heat = heatmapFromAggregate({
      shopId,
      route: "/",
      device: "all",
      mode: "click",
      aggregate: merged!,
      snapshotEvents: null,
      fromIso: "2026-08-13T00:00:00.000Z",
      toIso: "2026-08-14T23:59:59.000Z",
    });
    expect(heat.sessionCount).toBe(2);
    expect(heat.points[0]?.weight).toBe(4);
  });
});
