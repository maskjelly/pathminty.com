import type {
  HeatmapResponse,
  JourneyEdge,
  JourneyGraphResponse,
  JourneyNode,
  RouteStat,
} from "@pathminty/contracts";
import {
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  ArrowRight,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RouteCardPreview } from "./RouteCardPreview";

const CARD_W = 300;
const CARD_H = 268;
const GAP_X = 96;
const GAP_Y = 32;
const COL_PAD = 48;
const ROW_PAD = 40;

type Placed = {
  route: string;
  x: number;
  y: number;
  stat: RouteStat;
  node: JourneyNode | null;
  layer: number;
};

type EdgeView = JourneyEdge & {
  shareOfFrom: number;
  shareOfTraffic: number;
};

function classifyRoute(route: string): {
  kind: "home" | "collection" | "product" | "cart" | "checkout" | "other";
  label: string;
} {
  const r = route.toLowerCase();
  if (r === "/" || r === "") return { kind: "home", label: "Home" };
  if (r === "/cart" || r.startsWith("/cart/")) return { kind: "cart", label: "Cart" };
  if (r.includes("/checkouts") || r.startsWith("/checkout")) {
    return { kind: "checkout", label: "Checkout" };
  }
  if (r.startsWith("/products/") || r.includes("/products/")) {
    return { kind: "product", label: "Product" };
  }
  if (r.startsWith("/collections/")) return { kind: "collection", label: "Collection" };
  if (r.startsWith("/pages/")) return { kind: "other", label: "Page" };
  if (r.startsWith("/search")) return { kind: "other", label: "Search" };
  return { kind: "other", label: "Page" };
}

function shortRoute(route: string) {
  if (route === "/") return "/";
  if (route.length <= 36) return route;
  return `${route.slice(0, 16)}…${route.slice(-16)}`;
}

function placeRoutes(
  routes: readonly RouteStat[],
  journey: JourneyGraphResponse | null,
): Placed[] {
  const byRoute = new Map(routes.map((r) => [r.route, r]));
  const nodeByRoute = new Map(journey?.nodes.map((n) => [n.route, n]) ?? []);

  // Prefer journey layers; fall back to simple entry/mid/exit columns.
  const layers = new Map<number, string[]>();

  if (journey && journey.nodes.length > 0) {
    for (const node of journey.nodes) {
      const list = layers.get(node.layer) ?? [];
      if (!list.includes(node.route)) list.push(node.route);
      layers.set(node.layer, list);
    }
    const journeyRoutes = new Set(journey.nodes.map((n) => n.route));
    const orphans = routes.filter((r) => !journeyRoutes.has(r.route)).map((r) => r.route);
    if (orphans.length > 0) {
      const maxLayer = layers.size > 0 ? Math.max(...layers.keys()) + 1 : 0;
      layers.set(maxLayer, orphans);
    }
  } else {
    // Heuristic columns without journey graph.
    for (const stat of routes) {
      const { kind } = classifyRoute(stat.route);
      const layer =
        kind === "home" ? 0 : kind === "cart" || kind === "checkout" ? 3 : kind === "product" ? 2 : 1;
      const list = layers.get(layer) ?? [];
      list.push(stat.route);
      layers.set(layer, list);
    }
  }

  const placed: Placed[] = [];
  const layerKeys = [...layers.keys()].sort((a, b) => a - b);
  layerKeys.forEach((layer, layerIndex) => {
    const group = (layers.get(layer) ?? []).sort((a, b) => {
      const sa = byRoute.get(a)?.sessionCount ?? nodeByRoute.get(a)?.sessionCount ?? 0;
      const sb = byRoute.get(b)?.sessionCount ?? nodeByRoute.get(b)?.sessionCount ?? 0;
      return sb - sa;
    });
    group.forEach((route, index) => {
      const node = nodeByRoute.get(route) ?? null;
      const stat = byRoute.get(route) ?? {
        route,
        sessionCount: node?.sessionCount ?? 0,
        eventCount: 0,
        clickCount: 0,
        hoverWeight: 0,
        lastSeenAt: journey?.to ?? new Date().toISOString(),
        hasFullSnapshot: false,
      };
      placed.push({
        route,
        x: COL_PAD + layerIndex * (CARD_W + GAP_X),
        y: ROW_PAD + index * (CARD_H + GAP_Y),
        stat,
        node,
        layer: layerIndex,
      });
    });
  });
  return placed;
}

function buildEdgeViews(
  journey: JourneyGraphResponse | null,
  pos: Map<string, Placed>,
): EdgeView[] {
  if (!journey) return [];
  const totalSessions = Math.max(1, journey.totalSessions);
  const nodeSessions = new Map(
    journey.nodes.map((n) => [n.route, Math.max(1, n.sessionCount)]),
  );

  const connected = journey.edges
    .filter((e) => pos.has(e.from) && pos.has(e.to) && e.sessionCount > 0)
    .map((e) => ({
      ...e,
      shareOfFrom: e.sessionCount / (nodeSessions.get(e.from) ?? 1),
      shareOfTraffic: e.sessionCount / totalSessions,
    }))
    .sort((a, b) => b.sessionCount - a.sessionCount);

  // Keep the strongest transitions so the canvas stays readable.
  const maxEdges = Math.min(24, Math.max(8, Math.ceil(pos.size * 1.5)));
  const minSessions = connected[0] ? Math.max(1, Math.floor(connected[0].sessionCount * 0.08)) : 1;
  return connected.filter((e) => e.sessionCount >= minSessions).slice(0, maxEdges);
}

function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(40, (x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function layerTitle(index: number, total: number) {
  if (total <= 1) return "Pages";
  if (index === 0) return "Entry";
  if (index === total - 1) return "Exit / checkout";
  if (index === 1) return "Browse";
  return `Step ${index + 1}`;
}

export function SiteCanvas({
  routes,
  heatmaps,
  journey,
  onOpenRoute,
}: {
  routes: readonly RouteStat[];
  heatmaps: Record<string, HeatmapResponse>;
  journey: JourneyGraphResponse | null;
  onOpenRoute: (route: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.85);
  const [tx, setTx] = useState(24);
  const [ty, setTy] = useState(24);
  const drag = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originTx: number;
    originTy: number;
  }>({ active: false, startX: 0, startY: 0, originTx: 0, originTy: 0 });
  const [hoverEdge, setHoverEdge] = useState<EdgeView | null>(null);
  const [hoverRoute, setHoverRoute] = useState<string | null>(null);

  const placed = useMemo(() => placeRoutes(routes, journey), [routes, journey]);
  const pos = useMemo(() => {
    const map = new Map<string, Placed>();
    for (const item of placed) map.set(item.route, item);
    return map;
  }, [placed]);

  const edges = useMemo(() => buildEdgeViews(journey, pos), [journey, pos]);
  const maxEdge = Math.max(1, ...edges.map((e) => e.sessionCount));
  const maxSessions = Math.max(1, ...placed.map((p) => p.stat.sessionCount));
  const layerCount = useMemo(
    () => new Set(placed.map((p) => p.layer)).size,
    [placed],
  );

  const onWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.92 : 1.08;
    setScale((current) => Math.min(1.5, Math.max(0.35, current * delta)));
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const prevent = (e: WheelEvent) => {
      if (el.contains(e.target as Node)) e.preventDefault();
    };
    el.addEventListener("wheel", prevent, { passive: false });
    return () => el.removeEventListener("wheel", prevent);
  }, []);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".site-canvas-card") || target.closest(".site-canvas-edge-hit")) {
      return;
    }
    drag.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originTx: tx,
      originTy: ty,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current.active) return;
    setTx(drag.current.originTx + (event.clientX - drag.current.startX));
    setTy(drag.current.originTy + (event.clientY - drag.current.startY));
  };

  const onPointerUp = () => {
    drag.current.active = false;
  };

  const zoomBy = (factor: number) => {
    setScale((current) => Math.min(1.5, Math.max(0.35, current * factor)));
  };

  const fit = () => {
    setScale(0.85);
    setTx(24);
    setTy(24);
  };

  if (routes.length === 0 && (!journey || journey.nodes.length === 0)) {
    return (
      <div className="site-canvas-empty">
        <p>No page traffic in this range</p>
        <span>Sessions that visit storefront routes will appear here as a flow.</span>
      </div>
    );
  }

  const worldW = Math.max(...placed.map((p) => p.x), 0) + CARD_W + COL_PAD * 2;
  const worldH = Math.max(...placed.map((p) => p.y), 0) + CARD_H + ROW_PAD * 2;

  const relatedRoutes = useMemo(() => {
    if (!hoverEdge) return new Set<string>();
    return new Set([hoverEdge.from, hoverEdge.to]);
  }, [hoverEdge]);

  return (
    <div className="site-canvas-shell">
      <div className="site-canvas-chrome">
        <div className="site-canvas-legend">
          <span className="site-canvas-eyebrow">Page flow</span>
          <span className="site-canvas-hint">
            Lines = shoppers moving page → page · thickness = volume · % = share leaving
            the source page
          </span>
        </div>
        <div className="site-canvas-tools">
          <button
            type="button"
            className="icon-button"
            onClick={() => zoomBy(1.12)}
            title="Zoom in"
          >
            <MagnifyingGlassPlus size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => zoomBy(0.9)}
            title="Zoom out"
          >
            <MagnifyingGlassMinus size={16} />
          </button>
          <button type="button" className="control" onClick={fit}>
            Reset
          </button>
          <span className="site-canvas-zoom">{Math.round(scale * 100)}%</span>
        </div>
      </div>

      {journey && (
        <div className="site-canvas-stats">
          <span>
            <strong>{journey.totalSessions}</strong> sessions
          </span>
          <span>
            <strong>{placed.length}</strong> pages
          </span>
          <span>
            <strong>{edges.length}</strong> transitions shown
          </span>
          <span>
            <strong>{journey.checkoutSessions}</strong> reached checkout (
            {journey.totalSessions > 0
              ? Math.round((journey.checkoutSessions / journey.totalSessions) * 100)
              : 0}
            %)
          </span>
        </div>
      )}

      <div
        className="site-canvas-viewport"
        ref={viewportRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="site-canvas-world"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            width: worldW,
            height: worldH,
          }}
        >
          {/* Column labels */}
          {[...new Set(placed.map((p) => p.layer))]
            .sort((a, b) => a - b)
            .map((layer) => (
              <div
                key={`col-${layer}`}
                className="site-canvas-col-label"
                style={{ left: COL_PAD + layer * (CARD_W + GAP_X), top: 8 }}
              >
                {layerTitle(layer, layerCount)}
              </div>
            ))}

          <svg
            className="site-canvas-edges"
            width={worldW}
            height={worldH}
            aria-label="Traffic between pages"
          >
            <defs>
              <marker
                id="flow-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#71767b" />
              </marker>
              <marker
                id="flow-arrow-active"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#1d9bf0" />
              </marker>
            </defs>

            {edges.map((edge) => {
              const from = pos.get(edge.from);
              const to = pos.get(edge.to);
              if (!from || !to) return null;
              const x1 = from.x + CARD_W;
              const y1 = from.y + CARD_H / 2;
              const x2 = to.x;
              const y2 = to.y + CARD_H / 2;
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              const weight = edge.sessionCount / maxEdge;
              const stroke = 1.5 + weight * 12;
              const active =
                hoverEdge?.from === edge.from && hoverEdge?.to === edge.to;
              const dimmed =
                (hoverEdge && !active) ||
                (hoverRoute &&
                  hoverRoute !== edge.from &&
                  hoverRoute !== edge.to);
              const d = edgePath(x1, y1, x2, y2);
              const pct = Math.round(edge.shareOfFrom * 100);

              return (
                <g
                  key={`${edge.from}->${edge.to}`}
                  className="site-canvas-edge-group"
                  opacity={dimmed ? 0.15 : 1}
                  onMouseEnter={() => setHoverEdge(edge)}
                  onMouseLeave={() => setHoverEdge(null)}
                >
                  {/* Wide invisible hit target */}
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(16, stroke + 10)}
                    className="site-canvas-edge-hit"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={active ? "#1d9bf0" : "#536471"}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    markerEnd={active ? "url(#flow-arrow-active)" : "url(#flow-arrow)"}
                  />
                  {/* Data label on the connector */}
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x={-34}
                      y={-11}
                      width={68}
                      height={22}
                      rx={2}
                      className={
                        active ? "site-canvas-edge-label active" : "site-canvas-edge-label"
                      }
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      className={
                        active
                          ? "site-canvas-edge-label-text active"
                          : "site-canvas-edge-label-text"
                      }
                    >
                      {edge.sessionCount} · {pct}%
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>

          {placed.map((item, index) => {
            const heat = heatmaps[item.route];
            const { kind, label } = classifyRoute(item.route);
            const share = Math.round((item.stat.sessionCount / maxSessions) * 100);
            const checkoutPct = item.node
              ? Math.round(item.node.checkoutRate * 100)
              : null;
            const outbound = edges
              .filter((e) => e.from === item.route)
              .reduce((sum, e) => sum + e.sessionCount, 0);
            const inbound = edges
              .filter((e) => e.to === item.route)
              .reduce((sum, e) => sum + e.sessionCount, 0);
            const highlighted =
              relatedRoutes.has(item.route) || hoverRoute === item.route;
            const dimmed =
              (hoverEdge && !relatedRoutes.has(item.route)) ||
              (hoverRoute && hoverRoute !== item.route && !relatedRoutes.has(item.route));

            return (
              <article
                key={item.route}
                className="site-canvas-card"
                data-kind={kind}
                data-highlight={highlighted ? "true" : "false"}
                data-dimmed={dimmed ? "true" : "false"}
                style={{ left: item.x, top: item.y, width: CARD_W }}
                onMouseEnter={() => setHoverRoute(item.route)}
                onMouseLeave={() => setHoverRoute(null)}
                onDoubleClick={() => onOpenRoute(item.route)}
              >
                <header className="site-canvas-card-bar">
                  <span className="site-canvas-kind" data-kind={kind}>
                    {label}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenRoute(item.route);
                    }}
                  >
                    Heatmap
                  </button>
                </header>

                <div className="site-canvas-card-title" title={item.route}>
                  {shortRoute(item.route)}
                </div>

                <div className="site-canvas-card-preview">
                  <RouteCardPreview heatmap={heat} active={index < 12} />
                </div>

                <div className="site-canvas-card-metrics">
                  <div>
                    <strong>{item.stat.sessionCount}</strong>
                    <span>sessions</span>
                  </div>
                  <div>
                    <strong>{item.stat.eventCount}</strong>
                    <span>events</span>
                  </div>
                  <div>
                    <strong>{share}%</strong>
                    <span>of top page</span>
                  </div>
                  {checkoutPct !== null && (
                    <div>
                      <strong>{checkoutPct}%</strong>
                      <span>→ checkout</span>
                    </div>
                  )}
                </div>

                <div className="site-canvas-card-flow">
                  <span title="Sessions arriving from another page">
                    in {inbound}
                  </span>
                  <ArrowRight size={12} />
                  <span title="Sessions leaving to another page">out {outbound}</span>
                </div>

                <div className="site-canvas-card-bar-track" aria-hidden>
                  <i style={{ width: `${share}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {hoverEdge && (
        <div className="site-canvas-edge-tip" role="status">
          <div className="site-canvas-edge-tip-path">
            <code>{hoverEdge.from}</code>
            <ArrowRight size={14} />
            <code>{hoverEdge.to}</code>
          </div>
          <p>
            <strong>{hoverEdge.sessionCount}</strong> sessions took this path
          </p>
          <p>
            <strong>{Math.round(hoverEdge.shareOfFrom * 100)}%</strong> of people on{" "}
            <code>{hoverEdge.from}</code> went next to <code>{hoverEdge.to}</code>
          </p>
          <p>
            <strong>{Math.round(hoverEdge.checkoutRate * 100)}%</strong> of those later
            reached checkout (behavior, not purchase)
          </p>
          <p className="site-canvas-edge-tip-share">
            {Math.round(hoverEdge.shareOfTraffic * 100)}% of all sessions in range
          </p>
        </div>
      )}
    </div>
  );
}
