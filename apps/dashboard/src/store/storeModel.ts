import type { JourneyGraphResponse, RouteStat } from "@pathminty/contracts";

import {
  buildDemoFunnelSteps,
  buildFunnelSteps,
  canDrawFunnel,
  drawnFunnelSteps,
  type FunnelStepId,
} from "../insights/funnelModel";
import { classifyRoute, type StationKind } from "../siteCanvasLayout";

export type SpinePage = {
  id: FunnelStepId;
  label: string;
  route: string;
  sessions: number;
  fromPrevious: number | null;
  dropOff: number | null;
  dropOffCount: number | null;
};

function kindsForStep(id: FunnelStepId): StationKind[] {
  if (id === "home") return ["home"];
  if (id === "browse") return ["collection", "other"];
  if (id === "product") return ["product"];
  if (id === "cart") return ["cart"];
  if (id === "checkout") return ["checkout"];
  return [];
}

function demoRouteFor(id: FunnelStepId): string {
  if (id === "home") return "/";
  if (id === "browse") return "/collections/all";
  if (id === "product") return "/products/featured";
  if (id === "cart") return "/cart";
  return "/checkout";
}

export function buildStoreSpine(
  routes: readonly RouteStat[],
  journey: JourneyGraphResponse | null,
): SpinePage[] {
  const steps = drawnFunnelSteps(buildFunnelSteps(routes, journey));
  const pages: SpinePage[] = [];
  for (const step of steps) {
    if (step.id === "purchase") continue;
    const kinds = kindsForStep(step.id);
    const match = [...routes]
      .filter((route) => kinds.includes(classifyRoute(route.route).kind))
      .sort((left, right) => right.sessionCount - left.sessionCount)[0];
    if (!match) continue;
    pages.push({
      id: step.id,
      label: step.id === "home" ? "Home" : step.label,
      route: match.route,
      sessions: step.sessions,
      fromPrevious: step.fromPrevious,
      dropOff: step.dropOff,
      dropOffCount: step.dropOffCount,
    });
  }
  return pages;
}

export function buildDemoSpine(): SpinePage[] {
  return buildDemoFunnelSteps()
    .filter((step) => step.id !== "purchase")
    .map((step) => ({
      id: step.id,
      label: step.id === "home" ? "Home" : step.label,
      route: demoRouteFor(step.id),
      sessions: step.sessions,
      fromPrevious: step.fromPrevious,
      dropOff: step.dropOff,
      dropOffCount: step.dropOffCount,
    }));
}

export function storeCanDraw(
  routes: readonly RouteStat[],
  journey: JourneyGraphResponse | null,
): boolean {
  return canDrawFunnel(buildFunnelSteps(routes, journey));
}
