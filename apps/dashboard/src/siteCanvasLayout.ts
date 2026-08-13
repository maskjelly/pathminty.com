import type {
  AcquisitionStat,
  JourneyGraphResponse,
  JourneyNode,
  RouteStat,
} from "@pathminty/contracts";

export type StationKind =
  "home" | "collection" | "product" | "cart" | "checkout" | "other";

export type PageFrame = {
  route: string;
  x: number;
  y: number;
  column: number;
  kind: StationKind;
  label: string;
  sessionCount: number;
  checkoutRate: number | null;
};

export type SourceFrame = {
  key: string;
  label: string;
  detail: string;
  x: number;
  y: number;
  sessionCount: number;
  landingRoute: string;
};

export type FlowEdge = {
  from: string;
  to: string;
  sessionCount: number;
  shareOfFrom: number;
  isPrimary: boolean;
  kind: "page" | "source";
};

export const FRAME_W = 960;
export const FRAME_H = 700;
export const FRAME_GAP_X = 160;
export const FRAME_GAP_Y = 72;
export const FRAME_PAD = 72;
export const SOURCE_W = 176;
export const SOURCE_H = 64;
export const SOURCE_X = 40;
export const PAGE_COL_X = [280, 1400, 2520, 3640] as const;
export const MAX_FRAMES = 16;
export const MAX_EDGES = 24;
export const COLUMN_TITLES = ["Home", "Browse", "Product", "Checkout"] as const;

export function classifyRoute(route: string): {
  kind: StationKind;
  label: string;
  column: number;
} {
  const r = route.toLowerCase();
  if (r === "/" || r === "") {
    return { kind: "home", label: "Home", column: 0 };
  }
  if (r === "/cart" || r.startsWith("/cart/")) {
    return { kind: "cart", label: "Cart", column: 3 };
  }
  if (r.includes("/checkouts") || r.startsWith("/checkout")) {
    return { kind: "checkout", label: "Checkout", column: 3 };
  }
  if (r.startsWith("/products/") || r.includes("/products/")) {
    const handle = route.split("/").filter(Boolean).pop() ?? "Product";
    return { kind: "product", label: prettyHandle(handle), column: 2 };
  }
  if (r.startsWith("/collections/")) {
    const handle = route.split("/").filter(Boolean).pop() ?? "Collection";
    const name = handle === "all" ? "All products" : prettyHandle(handle);
    return { kind: "collection", label: name, column: 1 };
  }
  if (r.startsWith("/search")) {
    return { kind: "other", label: "Search", column: 1 };
  }
  if (r.startsWith("/pages/")) {
    const handle = route.split("/").filter(Boolean).pop() ?? "Page";
    return { kind: "other", label: prettyHandle(handle), column: 1 };
  }
  if (r.startsWith("/blogs/") || r.startsWith("/articles/")) {
    return { kind: "other", label: "Journal", column: 1 };
  }
  return { kind: "other", label: shortPath(route), column: 1 };
}

export function prettyHandle(handle: string) {
  return handle
    .replace(/^the-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function shortPath(route: string) {
  if (route === "/") return "/";
  if (route.length <= 32) return route;
  const parts = route.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1] ?? "";
    const head = parts[0] ?? "";
    const clipped = last.length > 16 ? `${last.slice(0, 7)}…${last.slice(-5)}` : last;
    return `/${head}/…/${clipped}`;
  }
  return `${route.slice(0, 14)}…${route.slice(-10)}`;
}

export function pickFrameRoutes(
  routes: readonly RouteStat[],
  journey: JourneyGraphResponse | null,
): string[] {
  const scores = new Map<string, number>();
  for (const route of routes) scores.set(route.route, route.sessionCount);
  for (const node of journey?.nodes ?? []) {
    scores.set(node.route, Math.max(scores.get(node.route) ?? 0, node.sessionCount));
  }
  const required: string[] = [];
  const rest: Array<[string, number]> = [];
  for (const [route, score] of scores) {
    const kind = classifyRoute(route).kind;
    if (kind === "home" || kind === "cart" || kind === "checkout") required.push(route);
    else rest.push([route, score]);
  }
  rest.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const picked = [...required];
  for (const [route] of rest) {
    if (picked.length >= MAX_FRAMES) break;
    picked.push(route);
  }
  return picked;
}

export function placeFrames(
  routes: readonly RouteStat[],
  journey: JourneyGraphResponse | null,
): PageFrame[] {
  const picked = pickFrameRoutes(routes, journey);
  const byRoute = new Map(routes.map((route) => [route.route, route]));
  const nodeByRoute = new Map(journey?.nodes.map((node) => [node.route, node]) ?? []);
  const columns = new Map<number, string[]>();
  for (const route of picked) {
    const { column } = classifyRoute(route);
    const list = columns.get(column) ?? [];
    list.push(route);
    columns.set(column, list);
  }
  const frames: PageFrame[] = [];
  for (const column of [...columns.keys()].sort((left, right) => left - right)) {
    const group = (columns.get(column) ?? []).sort((left, right) => {
      const leftScore =
        byRoute.get(left)?.sessionCount ?? nodeByRoute.get(left)?.sessionCount ?? 0;
      const rightScore =
        byRoute.get(right)?.sessionCount ?? nodeByRoute.get(right)?.sessionCount ?? 0;
      return rightScore - leftScore || left.localeCompare(right);
    });
    group.forEach((route, index) => {
      const meta = classifyRoute(route);
      const node: JourneyNode | undefined = nodeByRoute.get(route);
      frames.push({
        route,
        x: PAGE_COL_X[meta.column] ?? PAGE_COL_X[0],
        y: FRAME_PAD + 36 + index * (FRAME_H + FRAME_GAP_Y),
        column: meta.column,
        kind: meta.kind,
        label: meta.label,
        sessionCount: byRoute.get(route)?.sessionCount ?? node?.sessionCount ?? 0,
        checkoutRate: node ? node.checkoutRate : null,
      });
    });
  }
  return frames;
}

export function placeSources(
  acquisitions: readonly AcquisitionStat[],
  frames: readonly PageFrame[],
): SourceFrame[] {
  const landingSet = new Set(frames.map((frame) => frame.route));
  const home = frames.find((frame) => frame.kind === "home")?.route ?? frames[0]?.route;
  const ranked = [...acquisitions]
    .sort((left, right) => right.sessionCount - left.sessionCount)
    .slice(0, 8);
  return ranked.map((row, index) => {
    const landing = landingSet.has(row.landingRoute)
      ? row.landingRoute
      : (home ?? row.landingRoute);
    return {
      key: row.key,
      label: sourceLabel(row),
      detail: sourceDetail(row),
      x: SOURCE_X,
      y: FRAME_PAD + 36 + index * (SOURCE_H + 20),
      sessionCount: row.sessionCount,
      landingRoute: landing,
    };
  });
}

export function sourceLabel(row: Pick<AcquisitionStat, "source" | "campaign">) {
  if (row.campaign) return prettyHandle(row.campaign);
  if (row.source === "direct") return "Direct";
  if (row.source === "referral") return "Referral";
  return prettyHandle(row.source);
}

export function sourceDetail(
  row: Pick<AcquisitionStat, "source" | "medium" | "referrerHost">,
) {
  if (row.referrerHost) return row.referrerHost;
  if (row.medium && row.medium !== "none") return row.medium;
  if (row.source === "direct") return "typed / bookmark";
  return row.source;
}

export function buildFlowEdges(
  journey: JourneyGraphResponse | null,
  frames: readonly PageFrame[],
  sources: readonly SourceFrame[],
): FlowEdge[] {
  const pageSet = new Set(frames.map((frame) => frame.route));
  const fromSessions = new Map(
    frames.map((frame) => [frame.route, frame.sessionCount]),
  );
  const pageEdges: FlowEdge[] = [];
  if (journey) {
    const ranked = [...journey.edges]
      .filter(
        (edge) =>
          pageSet.has(edge.from) && pageSet.has(edge.to) && edge.sessionCount > 0,
      )
      .sort((left, right) => right.sessionCount - left.sessionCount)
      .slice(0, MAX_EDGES);
    for (const [index, edge] of ranked.entries()) {
      pageEdges.push({
        from: edge.from,
        to: edge.to,
        sessionCount: edge.sessionCount,
        shareOfFrom: edge.sessionCount / Math.max(1, fromSessions.get(edge.from) ?? 1),
        isPrimary: index === 0,
        kind: "page",
      });
    }
  }
  const sourceEdges: FlowEdge[] = sources.map((source) => ({
    from: `src:${source.key}`,
    to: source.landingRoute,
    sessionCount: source.sessionCount,
    shareOfFrom: 1,
    isPrimary: false,
    kind: "source",
  }));
  return [...sourceEdges, ...pageEdges];
}

export function connectorPath(x1: number, y1: number, x2: number, y2: number): string {
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

export function worldSize(
  frames: readonly PageFrame[],
  sources: readonly SourceFrame[],
) {
  const xs = [
    SOURCE_X,
    ...frames.map((frame) => frame.x + FRAME_W),
    ...sources.map((source) => source.x + SOURCE_W),
  ];
  const ys = [
    FRAME_H,
    ...frames.map((frame) => frame.y + FRAME_H),
    ...sources.map((source) => source.y + SOURCE_H),
  ];
  return {
    width: Math.max(...xs) + FRAME_PAD + 80,
    height: Math.max(...ys) + FRAME_PAD,
  };
}

export function clampZoom(value: number) {
  return Math.min(2.4, Math.max(0.12, value));
}
