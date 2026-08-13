import { describe, expect, it } from "vitest";

import type { JourneyGraphResponse, RouteStat } from "@pathminty/contracts";

import {
  buildMetroEdges,
  classifyRoute,
  isOctilinear,
  metroPath,
  pickStationRoutes,
  placeStations,
} from "./siteCanvasLayout";

function stat(route: string, sessionCount: number): RouteStat {
  return {
    route,
    sessionCount,
    eventCount: sessionCount,
    clickCount: sessionCount,
    hoverWeight: 0,
    lastSeenAt: "2026-08-13T00:00:00.000Z",
    hasFullSnapshot: false,
    netRevenueMinor: 0,
    orderCount: 0,
    currency: null,
  };
}

const journey: JourneyGraphResponse = {
  nodes: [
    {
      route: "/",
      sessionCount: 10,
      checkoutReachCount: 4,
      checkoutRate: 0.4,
      orderCount: 0,
      netRevenueMinor: 0,
      isLanding: true,
      isCheckout: false,
      layer: 0,
    },
    {
      route: "/collections/shirts",
      sessionCount: 6,
      checkoutReachCount: 3,
      checkoutRate: 0.5,
      orderCount: 0,
      netRevenueMinor: 0,
      isLanding: false,
      isCheckout: false,
      layer: 1,
    },
    {
      route: "/products/tee",
      sessionCount: 5,
      checkoutReachCount: 3,
      checkoutRate: 0.6,
      orderCount: 0,
      netRevenueMinor: 0,
      isLanding: false,
      isCheckout: false,
      layer: 2,
    },
    {
      route: "/cart",
      sessionCount: 3,
      checkoutReachCount: 3,
      checkoutRate: 1,
      orderCount: 0,
      netRevenueMinor: 0,
      isLanding: false,
      isCheckout: true,
      layer: 3,
    },
  ],
  edges: [
    {
      from: "/",
      to: "/collections/shirts",
      sessionCount: 6,
      checkoutReachCount: 3,
      checkoutRate: 0.5,
      orderCount: 0,
      netRevenueMinor: 0,
    },
    {
      from: "/collections/shirts",
      to: "/products/tee",
      sessionCount: 5,
      checkoutReachCount: 3,
      checkoutRate: 0.6,
      orderCount: 0,
      netRevenueMinor: 0,
    },
    {
      from: "/products/tee",
      to: "/cart",
      sessionCount: 3,
      checkoutReachCount: 3,
      checkoutRate: 1,
      orderCount: 0,
      netRevenueMinor: 0,
    },
  ],
  totalSessions: 10,
  checkoutSessions: 3,
  orderCount: 0,
  totalNetRevenueMinor: 0,
  currency: null,
  from: "2026-08-13T00:00:00.000Z",
  to: "2026-08-13T01:00:00.000Z",
  conversionBasis: "reached_checkout",
};

describe("classifyRoute", () => {
  it("puts the store funnel on four metro lines", () => {
    expect(classifyRoute("/")).toMatchObject({ kind: "home", column: 0 });
    expect(classifyRoute("/collections/all")).toMatchObject({
      kind: "collection",
      column: 1,
    });
    expect(classifyRoute("/products/tee")).toMatchObject({
      kind: "product",
      column: 2,
    });
    expect(classifyRoute("/cart")).toMatchObject({ kind: "cart", column: 3 });
    expect(classifyRoute("/checkouts/cn/1")).toMatchObject({
      kind: "checkout",
      column: 3,
    });
  });
});

describe("metro layout", () => {
  it("keeps hubs and drops low-traffic extras", () => {
    const routes = [
      stat("/", 20),
      stat("/cart", 4),
      ...Array.from({ length: 20 }, (_, index) =>
        stat(`/products/item-${index}`, 20 - index),
      ),
    ];
    const picked = pickStationRoutes(routes, null);
    expect(picked).toContain("/");
    expect(picked).toContain("/cart");
    expect(picked.length).toBeLessThanOrEqual(16);
  });

  it("lays stations left to right like a tube map", () => {
    const stations = placeStations(
      [
        stat("/", 10),
        stat("/collections/shirts", 6),
        stat("/products/tee", 5),
        stat("/cart", 3),
      ],
      journey,
    );
    const x = Object.fromEntries(stations.map((station) => [station.route, station.x]));
    expect(x["/"] ?? 0).toBeLessThan(x["/collections/shirts"] ?? 0);
    expect(x["/collections/shirts"] ?? 0).toBeLessThan(x["/products/tee"] ?? 0);
    expect(x["/products/tee"] ?? 0).toBeLessThan(x["/cart"] ?? 0);
  });

  it("draws octilinear traffic lines", () => {
    expect(isOctilinear(metroPath(0, 0, 200, 0, 0))).toBe(true);
    expect(isOctilinear(metroPath(0, 40, 240, 120, 0))).toBe(true);
    expect(isOctilinear(metroPath(0, 0, 80, 200, 1))).toBe(true);
  });

  it("builds a primary trunk from the heaviest forward step", () => {
    const stations = placeStations(
      [
        stat("/", 10),
        stat("/collections/shirts", 6),
        stat("/products/tee", 5),
        stat("/cart", 3),
      ],
      journey,
    );
    const edges = buildMetroEdges(journey, stations);
    expect(edges[0]?.isPrimary).toBe(true);
    expect(edges[0]?.from).toBe("/");
    expect(edges[0]?.to).toBe("/collections/shirts");
  });
});
