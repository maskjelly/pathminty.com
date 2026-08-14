import { describe, expect, it } from "vitest";

import type { JourneyGraphResponse, RouteStat } from "@pathminty/contracts";

import {
  buildDemoFunnelSteps,
  buildFunnelSteps,
  buildInsightRecs,
  buildProductInsights,
} from "./funnelModel";

function route(
  path: string,
  sessionCount: number,
  clickCount = sessionCount,
): RouteStat {
  return {
    route: path,
    sessionCount,
    eventCount: clickCount,
    clickCount,
    hoverWeight: 0,
    lastSeenAt: "2026-08-14T00:00:00.000Z",
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
      sessionCount: 100,
      checkoutReachCount: 10,
      checkoutRate: 0.1,
      orderCount: 0,
      netRevenueMinor: 0,
      isLanding: true,
      isCheckout: false,
      layer: 0,
    },
    {
      route: "/products/tee",
      sessionCount: 40,
      checkoutReachCount: 8,
      checkoutRate: 0.2,
      orderCount: 0,
      netRevenueMinor: 0,
      isLanding: false,
      isCheckout: false,
      layer: 2,
    },
  ],
  edges: [],
  acquisitions: [],
  totalSessions: 100,
  checkoutSessions: 10,
  orderCount: 0,
  totalNetRevenueMinor: 0,
  currency: null,
  from: "2026-08-14T00:00:00.000Z",
  to: "2026-08-14T01:00:00.000Z",
  conversionBasis: "reached_checkout",
};

describe("funnel concept model", () => {
  it("builds landing → product drop-off from journey nodes", () => {
    const steps = buildFunnelSteps(
      [route("/", 100), route("/products/tee", 40), route("/cart", 8)],
      journey,
    );
    const home = steps.find((step) => step.id === "home");
    const product = steps.find((step) => step.id === "product");
    expect(home?.sessions).toBe(100);
    expect(product?.sessions).toBe(40);
    expect(product?.fromPrevious).toBeCloseTo(0.4);
    expect(product?.dropOffCount).toBe(60);
  });

  it("lists product pages with click intensity", () => {
    const products = buildProductInsights(
      [route("/products/tee", 40, 12), route("/collections/all", 20, 4)],
      journey,
    );
    expect(products).toHaveLength(1);
    expect(products[0]?.label).toBe("Tee");
    expect(products[0]?.clicksPerVisit).toBeCloseTo(0.3);
    expect(products[0]?.checkoutRate).toBe(0.2);
  });

  it("flags a large drop-off as a recommendation", () => {
    const steps = buildFunnelSteps(
      [route("/", 100), route("/products/tee", 20)],
      journey,
    );
    const recs = buildInsightRecs(steps, []);
    expect(recs.some((rec) => /leave|checkout/i.test(rec.title))).toBe(true);
  });

  it("ships a Heavenly-scale sample funnel for brand pitches", () => {
    const demo = buildDemoFunnelSteps();
    expect(demo.map((step) => step.sessions)).toEqual([
      125_430, 53_620, 23_410, 8_945, 5_234,
    ]);
    expect(demo[1]?.fromPrevious).toBeCloseTo(0.427, 2);
  });
});
