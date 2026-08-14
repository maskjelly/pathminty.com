import { describe, expect, it } from "vitest";

import type { JourneyGraphResponse, RouteStat } from "@pathminty/contracts";

import {
  buildDemoFunnelSteps,
  buildFunnelSteps,
  buildInsightRecs,
  buildProductInsights,
  canDrawFunnel,
  drawnFunnelSteps,
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
      125_430, 53_620, 23_410, 8_945, 5_234, 3_342,
    ]);
    expect(demo[1]?.fromPrevious).toBeCloseTo(0.427, 2);
  });

  it("does not invent a funnel or 100% leak from two product sessions", () => {
    const steps = buildFunnelSteps([route("/products/tee", 2)], null);
    expect(steps.find((step) => step.id === "product")?.sessions).toBe(2);
    expect(steps.find((step) => step.id === "cart")?.dropOff).toBeNull();
    expect(steps.find((step) => step.id === "checkout")?.dropOff).toBeNull();
    expect(drawnFunnelSteps(steps).map((step) => step.id)).toEqual(["product"]);
    expect(canDrawFunnel(steps)).toBe(false);
    expect(buildInsightRecs(steps, [])).toEqual([]);
  });

  it("omits empty stages so the drawn path only tapers", () => {
    const steps = buildFunnelSteps([route("/", 80), route("/products/tee", 30)], {
      ...journey,
      nodes: [
        { ...journey.nodes[0]!, sessionCount: 80 },
        { ...journey.nodes[1]!, sessionCount: 30 },
      ],
    });
    expect(canDrawFunnel(steps)).toBe(true);
    expect(drawnFunnelSteps(steps).map((step) => step.id)).toEqual(["home", "product"]);
    expect(steps.find((step) => step.id === "browse")?.dropOff).toBeNull();
  });

  it("does not recommend a leak when volume is noise", () => {
    const steps = buildFunnelSteps([route("/", 8), route("/products/tee", 2)], null);
    expect(canDrawFunnel(steps)).toBe(false);
    expect(buildInsightRecs(steps, [])).toEqual([]);
  });
});
