import type { JourneyGraphResponse, RouteStat } from "@pathminty/contracts";

import { classifyRoute } from "../siteCanvasLayout";

export type FunnelStepId = "home" | "browse" | "product" | "cart" | "checkout";

export type FunnelStep = {
  id: FunnelStepId;
  label: string;
  sessions: number;
  fromPrevious: number | null;
  dropOff: number | null;
  dropOffCount: number | null;
};

export type InsightRec = {
  title: string;
  body: string;
  impact: "high" | "medium";
  action: "heatmap" | "recordings";
  route?: string;
};

export type ProductInsight = {
  route: string;
  label: string;
  sessions: number;
  clicks: number;
  clicksPerVisit: number;
  checkoutRate: number | null;
};

const STEP_META: Array<{ id: FunnelStepId; label: string }> = [
  { id: "home", label: "Landing" },
  { id: "browse", label: "Browse" },
  { id: "product", label: "Product" },
  { id: "cart", label: "Cart" },
  { id: "checkout", label: "Checkout" },
];

function kindToStep(kind: string): FunnelStepId | null {
  if (kind === "home") return "home";
  if (kind === "collection" || kind === "other") return "browse";
  if (kind === "product") return "product";
  if (kind === "cart") return "cart";
  if (kind === "checkout") return "checkout";
  return null;
}

export function buildFunnelSteps(
  routes: readonly RouteStat[],
  journey: JourneyGraphResponse | null,
): FunnelStep[] {
  const byStep = new Map<FunnelStepId, number>();
  for (const meta of STEP_META) byStep.set(meta.id, 0);

  const source =
    journey && journey.nodes.length > 0
      ? journey.nodes.map((node) => ({
          route: node.route,
          sessionCount: node.sessionCount,
        }))
      : routes;

  for (const row of source) {
    const step = kindToStep(classifyRoute(row.route).kind);
    if (!step) continue;
    byStep.set(step, Math.max(byStep.get(step) ?? 0, 0) + row.sessionCount);
  }

  return STEP_META.map((meta, index) => {
    const sessions = byStep.get(meta.id) ?? 0;
    let previous: number | null = null;
    for (let look = index - 1; look >= 0; look -= 1) {
      const count = byStep.get(STEP_META[look]?.id ?? "home") ?? 0;
      if (count > 0) {
        previous = count;
        break;
      }
    }
    const fromPrevious =
      index === 0
        ? 1
        : previous && previous > 0
          ? Math.min(1, sessions / previous)
          : null;
    const dropOff = fromPrevious === null ? null : Math.max(0, 1 - fromPrevious);
    const dropOffCount =
      previous && previous > sessions
        ? previous - sessions
        : previous && previous > 0
          ? 0
          : null;
    return {
      id: meta.id,
      label: meta.label,
      sessions,
      fromPrevious,
      dropOff,
      dropOffCount,
    };
  });
}

export function buildProductInsights(
  routes: readonly RouteStat[],
  journey: JourneyGraphResponse | null,
): ProductInsight[] {
  const checkoutByRoute = new Map(
    (journey?.nodes ?? []).map((node) => [node.route, node.checkoutRate]),
  );
  return routes
    .filter((route) => classifyRoute(route.route).kind === "product")
    .map((route) => ({
      route: route.route,
      label: classifyRoute(route.route).label,
      sessions: route.sessionCount,
      clicks: route.clickCount,
      clicksPerVisit:
        route.sessionCount > 0 ? route.clickCount / route.sessionCount : 0,
      checkoutRate: checkoutByRoute.get(route.route) ?? null,
    }))
    .sort(
      (left, right) =>
        right.sessions - left.sessions || left.route.localeCompare(right.route),
    );
}

export function buildInsightRecs(
  steps: readonly FunnelStep[],
  products: readonly ProductInsight[],
): InsightRec[] {
  const recs: InsightRec[] = [];
  let worst: FunnelStep | null = null;
  for (const step of steps) {
    if (step.dropOff === null) continue;
    if (!worst || (step.dropOff ?? 0) > (worst.dropOff ?? 0)) worst = step;
  }
  if (worst && (worst.dropOff ?? 0) >= 0.4 && worst.dropOffCount) {
    recs.push({
      title: `${worst.label} is where shoppers leave`,
      body: `${formatPct(worst.dropOff)} drop off before this step (${worst.dropOffCount.toLocaleString()} sessions). Open the heatmap on the page before it.`,
      impact: worst.dropOff && worst.dropOff >= 0.55 ? "high" : "medium",
      action: "heatmap",
    });
  }
  const checkout = steps.find((step) => step.id === "checkout");
  const home = steps.find((step) => step.id === "home");
  if (
    home &&
    checkout &&
    home.sessions > 0 &&
    checkout.sessions / home.sessions < 0.08
  ) {
    recs.push({
      title: "Few shoppers reach checkout",
      body: "Reached-checkout is the conversion we can prove today (purchases are not joined yet). Watch a few recordings that die on product or cart.",
      impact: "high",
      action: "recordings",
    });
  }
  const quietProduct = [...products]
    .filter((product) => product.sessions >= 3)
    .sort((left, right) => left.clicksPerVisit - right.clicksPerVisit)[0];
  if (quietProduct && quietProduct.clicksPerVisit < 1) {
    recs.push({
      title: `${quietProduct.label} gets visits, not clicks`,
      body: "Traffic is landing but almost nobody clicks. Check the product heatmap for a buried CTA.",
      impact: "medium",
      action: "heatmap",
      route: quietProduct.route,
    });
  }
  return recs.slice(0, 3);
}

export function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

/** Sample brand pitch — not live shop traffic. Numbers match the Heavenly funnel mock. */
export function buildDemoFunnelSteps(): FunnelStep[] {
  const counts: Record<FunnelStepId, number> = {
    home: 125_430,
    browse: 53_620,
    product: 23_410,
    cart: 8_945,
    checkout: 5_234,
  };
  return STEP_META.map((meta, index) => {
    const sessions = counts[meta.id];
    const previousId = STEP_META[index - 1]?.id;
    const previous = previousId ? counts[previousId] : null;
    const fromPrevious =
      index === 0 ? 1 : previous && previous > 0 ? sessions / previous : null;
    const dropOff = fromPrevious === null ? null : 1 - fromPrevious;
    const dropOffCount =
      previous && previous > sessions ? previous - sessions : previous ? 0 : null;
    return {
      id: meta.id,
      label: meta.label,
      sessions,
      fromPrevious,
      dropOff,
      dropOffCount,
    };
  });
}

export function buildDemoProducts(): ProductInsight[] {
  return [
    {
      route: "/products/tailored-linen-blazer",
      label: "Tailored Linen Blazer",
      sessions: 8_420,
      clicks: 28_810,
      clicksPerVisit: 3.42,
      checkoutRate: 0.039,
    },
    {
      route: "/products/column-maxi-dress",
      label: "Column Maxi Dress",
      sessions: 7_110,
      clicks: 22_820,
      clicksPerVisit: 3.21,
      checkoutRate: 0.0345,
    },
    {
      route: "/products/pleated-midi-dress",
      label: "Pleated Midi Dress",
      sessions: 6_040,
      clicks: 18_600,
      clicksPerVisit: 3.08,
      checkoutRate: 0.0328,
    },
    {
      route: "/products/silk-draped-blouse",
      label: "Silk Draped Blouse",
      sessions: 5_280,
      clicks: 15_520,
      clicksPerVisit: 2.94,
      checkoutRate: 0.0305,
    },
    {
      route: "/products/leather-top-handle-bag",
      label: "Leather Top Handle Bag",
      sessions: 4_910,
      clicks: 14_090,
      clicksPerVisit: 2.87,
      checkoutRate: 0.0291,
    },
    {
      route: "/products/satin-slip-dress",
      label: "Satin Slip Dress",
      sessions: 3_200,
      clicks: 3_840,
      clicksPerVisit: 1.2,
      checkoutRate: 0.0098,
    },
  ];
}

export function buildDemoRecs(): InsightRec[] {
  return [
    {
      title: "Browse is where shoppers leave",
      body: "57.3% drop off after landing before a collection click (71,810 sessions). Filters and nav are the first leak to show a brand.",
      impact: "high",
      action: "heatmap",
    },
    {
      title: "Product pages lose more than half",
      body: "56.4% leave after a product view. In a live shop this is where we open the heatmap on ATC and size selectors.",
      impact: "high",
      action: "heatmap",
    },
    {
      title: "Cart to checkout still leaks",
      body: "41.4% of carts never reach checkout. Recordings of that step are what we play in a pitch.",
      impact: "medium",
      action: "recordings",
    },
  ];
}
