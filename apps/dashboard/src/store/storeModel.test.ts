import { describe, expect, it } from "vitest";

import type { JourneyGraphResponse, RouteStat } from "@pathminty/contracts";

import { buildStoreSpine, storeCanDraw } from "./storeModel";

function route(path: string, sessionCount: number): RouteStat {
  return {
    route: path,
    sessionCount,
    eventCount: sessionCount,
    clickCount: sessionCount,
    hoverWeight: 0,
    lastSeenAt: "2026-08-14T00:00:00.000Z",
    hasFullSnapshot: false,
    netRevenueMinor: 0,
    orderCount: 0,
    currency: null,
  };
}

const journey: JourneyGraphResponse = {
  nodes: [],
  edges: [],
  acquisitions: [],
  totalSessions: 0,
  checkoutSessions: 0,
  orderCount: 0,
  totalNetRevenueMinor: 0,
  currency: null,
  from: "2026-08-14T00:00:00.000Z",
  to: "2026-08-14T01:00:00.000Z",
  conversionBasis: "reached_checkout",
};

describe("store spine", () => {
  it("does not draw a path from two product sessions", () => {
    const routes = [route("/products/tee", 2)];
    expect(storeCanDraw(routes, null)).toBe(false);
    expect(buildStoreSpine(routes, null).map((page) => page.id)).toEqual(["product"]);
  });

  it("builds home → product and skips empty collection", () => {
    const routes = [route("/", 80), route("/products/tee", 30)];
    expect(storeCanDraw(routes, journey)).toBe(true);
    expect(buildStoreSpine(routes, journey).map((page) => page.route)).toEqual([
      "/",
      "/products/tee",
    ]);
  });
});
