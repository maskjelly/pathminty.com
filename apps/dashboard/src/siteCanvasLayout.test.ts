import { describe, expect, it } from "vitest";

import type { JourneyGraphResponse, RouteStat } from "@pathminty/contracts";

import {
  buildFlowEdges,
  classifyRoute,
  placeFrames,
  pickFrameRoutes,
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
  acquisitions: [],
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

describe("figma frame layout", () => {
  it("keeps hubs and drops low-traffic extras", () => {
    const routes = [
      stat("/", 20),
      stat("/cart", 4),
      ...Array.from({ length: 20 }, (_, index) =>
        stat(`/products/item-${index}`, 20 - index),
      ),
    ];
    const picked = pickFrameRoutes(routes, null);
    expect(picked).toContain("/");
    expect(picked).toContain("/cart");
    expect(picked.length).toBeLessThanOrEqual(16);
  });

  it("lays page frames left to right through the store", () => {
    const frames = placeFrames(
      [
        stat("/", 10),
        stat("/collections/shirts", 6),
        stat("/products/tee", 5),
        stat("/cart", 3),
      ],
      journey,
    );
    const x = Object.fromEntries(frames.map((frame) => [frame.route, frame.x]));
    expect(x["/"] ?? 0).toBeLessThan(x["/collections/shirts"] ?? 0);
    expect(x["/collections/shirts"] ?? 0).toBeLessThan(x["/products/tee"] ?? 0);
    expect(x["/products/tee"] ?? 0).toBeLessThan(x["/cart"] ?? 0);
  });

  it("builds a primary path from the heaviest page-to-page step", () => {
    const frames = placeFrames(
      [
        stat("/", 10),
        stat("/collections/shirts", 6),
        stat("/products/tee", 5),
        stat("/cart", 3),
      ],
      journey,
    );
    const edges = buildFlowEdges(journey, frames, []);
    const primary = edges.find((edge) => edge.isPrimary);
    expect(primary?.from).toBe("/");
    expect(primary?.to).toBe("/collections/shirts");
  });
});
