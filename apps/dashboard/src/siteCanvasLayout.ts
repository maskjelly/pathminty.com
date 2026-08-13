import type {
  JourneyGraphResponse,
  JourneyNode,
  RouteStat,
} from "@pathminty/contracts";

export type StationKind =
  "home" | "collection" | "product" | "cart" | "checkout" | "other";

export type Station = {
  route: string;
  x: number;
  y: number;
  column: number;
  kind: StationKind;
  label: string;
  sessionCount: number;
  checkoutRate: number | null;
  isHub: boolean;
};

export type MetroEdge = {
  from: string;
  to: string;
  sessionCount: number;
  checkoutRate: number;
  shareOfFrom: number;
  isPrimary: boolean;
  lane: number;
  color: string;
};

export const LINE_COLOR: Record<StationKind, string> = {
  home: "#00ba7c",
  collection: "#1d9bf0",
  product: "#e8b931",
  cart: "#f4212e",
  checkout: "#f4212e",
  other: "#8b98a5",
};

export const COL_X = [110, 340, 590, 840] as const;
export const ROW_START = 96;
export const ROW_STEP = 92;
export const WORLD_PAD = 88;
export const MAX_STATIONS = 16;
export const MAX_EDGES = 18;

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
  if (route.length <= 28) return route;
  const parts = route.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1] ?? "";
    const head = parts[0] ?? "";
    const clipped = last.length > 14 ? `${last.slice(0, 6)}…${last.slice(-5)}` : last;
    return `/${head}/…/${clipped}`;
  }
  return `${route.slice(0, 12)}…${route.slice(-8)}`;
}

export function pickStationRoutes(
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
    if (kind === "home" || kind === "cart" || kind === "checkout") {
      required.push(route);
    } else {
      rest.push([route, score]);
    }
  }
  rest.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const picked = [...required];
  for (const [route] of rest) {
    if (picked.length >= MAX_STATIONS) break;
    picked.push(route);
  }
  return picked;
}

export function placeStations(
  routes: readonly RouteStat[],
  journey: JourneyGraphResponse | null,
): Station[] {
  const picked = pickStationRoutes(routes, journey);
  const byRoute = new Map(routes.map((route) => [route.route, route]));
  const nodeByRoute = new Map(journey?.nodes.map((node) => [node.route, node]) ?? []);

  const columns = new Map<number, string[]>();
  for (const route of picked) {
    const { column } = classifyRoute(route);
    const list = columns.get(column) ?? [];
    list.push(route);
    columns.set(column, list);
  }

  const stations: Station[] = [];

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
      const stat = byRoute.get(route);
      const sessionCount = stat?.sessionCount ?? node?.sessionCount ?? 0;
      const isHub =
        meta.kind === "home" || meta.kind === "cart" || meta.kind === "checkout";
      stations.push({
        route,
        x: COL_X[meta.column] ?? COL_X[0],
        y: ROW_START + index * ROW_STEP,
        column: meta.column,
        kind: meta.kind,
        label: meta.label,
        sessionCount,
        checkoutRate: node ? node.checkoutRate : null,
        isHub,
      });
    });
  }
  return stations;
}

export function worldSize(stations: readonly Station[]) {
  const maxX = Math.max(COL_X[3], ...stations.map((station) => station.x));
  const maxY = Math.max(ROW_START, ...stations.map((station) => station.y));
  return {
    width: maxX + WORLD_PAD + 180,
    height: maxY + WORLD_PAD + 40,
  };
}

export function buildMetroEdges(
  journey: JourneyGraphResponse | null,
  stations: readonly Station[],
): MetroEdge[] {
  if (!journey) return [];
  const pos = new Map(stations.map((station) => [station.route, station]));
  const nodeSessions = new Map(
    journey.nodes.map((node) => [node.route, Math.max(1, node.sessionCount)]),
  );

  const candidates = journey.edges
    .filter((edge) => pos.has(edge.from) && pos.has(edge.to) && edge.sessionCount > 0)
    .map((edge) => {
      const from = pos.get(edge.from);
      const to = pos.get(edge.to);
      const forward = (from?.column ?? 0) <= (to?.column ?? 0);
      return {
        from: edge.from,
        to: edge.to,
        sessionCount: edge.sessionCount,
        checkoutRate: edge.checkoutRate,
        shareOfFrom: edge.sessionCount / (nodeSessions.get(edge.from) ?? 1),
        forward,
        toKind: to?.kind ?? "other",
      };
    })
    .sort((left, right) => {
      if (left.forward !== right.forward) return left.forward ? -1 : 1;
      return right.sessionCount - left.sessionCount;
    });

  const forward = candidates.filter((edge) => edge.forward);
  const pool = (forward.length > 0 ? forward : candidates).slice(0, MAX_EDGES);

  const lanes = new Map<string, number>();
  const corridorCount = new Map<string, number>();
  for (const edge of pool) {
    const from = pos.get(edge.from);
    const to = pos.get(edge.to);
    const key = `${from?.column ?? 0}:${to?.column ?? 0}`;
    const used = corridorCount.get(key) ?? 0;
    corridorCount.set(key, used + 1);
    lanes.set(`${edge.from}->${edge.to}`, laneIndex(used));
  }

  return pool.map((edge, index) => ({
    from: edge.from,
    to: edge.to,
    sessionCount: edge.sessionCount,
    checkoutRate: edge.checkoutRate,
    shareOfFrom: edge.shareOfFrom,
    isPrimary: index === 0,
    lane: lanes.get(`${edge.from}->${edge.to}`) ?? 0,
    color: LINE_COLOR[edge.toKind],
  }));
}

function laneIndex(order: number) {
  if (order === 0) return 0;
  const step = Math.ceil(order / 2);
  return order % 2 === 1 ? step : -step;
}

/** Octilinear metro stroke: horizontal, 45°, horizontal (or H/V elbow). */
export function metroPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lane = 0,
): string {
  const offset = lane * 10;
  const startY = y1 + offset;
  const endY = y2 + offset;
  if (Math.abs(endY - startY) < 4) {
    return `M ${x1} ${startY} L ${x2} ${endY}`;
  }
  if (Math.abs(x2 - x1) < 4) {
    return `M ${x1 + offset} ${y1} L ${x2 + offset} ${y2}`;
  }

  const lead = 28;
  const xA = x1 + Math.sign(x2 - x1) * lead;
  const xB = x2 - Math.sign(x2 - x1) * lead;
  const dy = endY - startY;
  const absDy = Math.abs(dy);
  const run = xB - xA;

  if (Math.abs(run) >= absDy) {
    const diag = absDy * Math.sign(run || 1);
    const xDiag = xA + (run - diag) / 2;
    return `M ${x1} ${startY} L ${xDiag} ${startY} L ${xDiag + diag} ${endY} L ${x2} ${endY}`;
  }

  const midX = (x1 + x2) / 2 + offset;
  return `M ${x1} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${x2} ${endY}`;
}

export function isOctilinear(d: string): boolean {
  const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  for (let i = 2; i + 1 < nums.length; i += 2) {
    const x0 = nums[i - 2] ?? 0;
    const y0 = nums[i - 1] ?? 0;
    const x1 = nums[i] ?? 0;
    const y1 = nums[i + 1] ?? 0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const straight = dx < 0.6 || dy < 0.6;
    const diagonal = Math.abs(dx - dy) < 0.6;
    if (!straight && !diagonal) return false;
  }
  return nums.length >= 4;
}

export const COLUMN_TITLES = ["Home", "Browse", "Product", "Checkout"] as const;
