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
  Sparkle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RouteCardPreview } from "./RouteCardPreview";

/** Designer mock proportions: compact browser cards, wide horizontal flow. */
const CARD_W = 248;
const CARD_H = 210;
const GAP_X = 110;
const GAP_Y = 28;
const COL_PAD = 56;
const ROW_PAD = 56;

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
  isPrimary: boolean;
};

function classifyRoute(route: string): {
  kind: "home" | "collection" | "product" | "cart" | "checkout" | "other";
  label: string;
} {
  const r = route.toLowerCase();
  if (r === "/" || r === "") return { kind: "home", label: "Landing page" };
  if (r === "/cart" || r.startsWith("/cart/")) return { kind: "cart", label: "Cart" };
  if (r.includes("/checkouts") || r.startsWith("/checkout")) {
    return { kind: "checkout", label: "Checkout" };
  }
  if (r.startsWith("/products/") || r.includes("/products/")) {
    const handle = route.split("/").filter(Boolean).pop() ?? "Product";
    const name = handle
      .replace(/^the-/, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return { kind: "product", label: `Product: ${name}` };
  }
  if (r.startsWith("/collections/")) {
    const handle = route.split("/").filter(Boolean).pop() ?? "Collection";
    const name =
      handle === "all"
        ? "All Products"
        : handle.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { kind: "collection", label: `Collection: ${name}` };
  }
  if (r.startsWith("/pages/")) return { kind: "other", label: "Page" };
  if (r.startsWith("/search")) return { kind: "other", label: "Search" };
  return { kind: "other", label: "Page" };
}

function shortPath(route: string) {
  if (route === "/") return "/";
  if (route.length <= 28) return route;
  const parts = route.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1] ?? "";
    const head = parts[0] ?? "";
    const clipped =
      last.length > 14 ? `${last.slice(0, 6)}…${last.slice(-6)}` : last;
    return `/${head}/…${clipped}`;
  }
  return `${route.slice(0, 12)}…${route.slice(-10)}`;
}

function placeRoutes(
  routes: readonly RouteStat[],
  journey: JourneyGraphResponse | null,
): Placed[] {
  const byRoute = new Map(routes.map((r) => [r.route, r]));
  const nodeByRoute = new Map(journey?.nodes.map((n) => [n.route, n]) ?? []);
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
    for (const stat of routes) {
      const { kind } = classifyRoute(stat.route);
      const layer =
        kind === "home"
          ? 0
          : kind === "cart" || kind === "checkout"
            ? 3
            : kind === "product"
              ? 2
              : 1;
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
    // Vertically center the stack for each column (like the design).
    const stackH = group.length * CARD_H + Math.max(0, group.length - 1) * GAP_Y;
    const startY = ROW_PAD + Math.max(0, (420 - stackH) / 2);
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
        y: startY + index * (CARD_H + GAP_Y),
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
      isPrimary: false,
    }))
    .sort((a, b) => b.sessionCount - a.sessionCount);

  const maxEdges = Math.min(20, Math.max(6, Math.ceil(pos.size * 1.4)));
  const minSessions = connected[0]
    ? Math.max(1, Math.floor(connected[0].sessionCount * 0.06))
    : 1;
  return connected
    .filter((e) => e.sessionCount >= minSessions)
    .slice(0, maxEdges)
    .map((e, index) => ({ ...e, isPrimary: index === 0 }));
}

/** Smooth cubic like the design — slight vertical bend. */
function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(48, (x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function pointOnCubic(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
): { x: number; y: number } {
  const dx = Math.max(48, (x2 - x1) * 0.5);
  const c1x = x1 + dx;
  const c1y = y1;
  const c2x = x2 - dx;
  const c2y = y2;
  const u = 1 - t;
  return {
    x: u * u * u * x1 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x2,
    y: u * u * u * y1 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y2,
  };
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
  const [scale, setScale] = useState(0.92);
  const [tx, setTx] = useState(32);
  const [ty, setTy] = useState(16);
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
  const entrySessions = Math.max(
    1,
    placed.find((p) => p.layer === 0)?.stat.sessionCount ??
      journey?.totalSessions ??
      1,
  );
  const primaryEdge = edges.find((e) => e.isPrimary) ?? null;

  const onWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.92 : 1.08;
    setScale((current) => Math.min(1.4, Math.max(0.4, current * delta)));
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
    if (target.closest(".flow-card") || target.closest(".site-canvas-edge-hit")) return;
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
    setScale((current) => Math.min(1.4, Math.max(0.4, current * factor)));
  };

  const fit = () => {
    setScale(0.92);
    setTx(32);
    setTy(16);
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

  // Annotation position for primary path
  let primaryCallout: { x: number; y: number } | null = null;
  if (primaryEdge) {
    const from = pos.get(primaryEdge.from);
    const to = pos.get(primaryEdge.to);
    if (from && to) {
      const x1 = from.x + CARD_W;
      const y1 = from.y + CARD_H / 2;
      const x2 = to.x;
      const y2 = to.y + CARD_H / 2;
      primaryCallout = pointOnCubic(x1, y1, x2, y2, 0.35);
      primaryCallout = { x: primaryCallout.x - 20, y: primaryCallout.y - 48 };
    }
  }

  return (
    <div className="site-canvas-shell">
      <div className="site-canvas-chrome">
        <div className="site-canvas-legend">
          <span className="site-canvas-eyebrow">Customer journey</span>
          <span className="site-canvas-hint">
            Blue path = highest traffic · % under each page = share of entry sessions ·
            green % = reached checkout
          </span>
        </div>
        <div className="site-canvas-tools">
          <button type="button" className="icon-button" onClick={() => zoomBy(1.1)} title="Zoom in">
            <MagnifyingGlassPlus size={16} />
          </button>
          <button type="button" className="icon-button" onClick={() => zoomBy(0.9)} title="Zoom out">
            <MagnifyingGlassMinus size={16} />
          </button>
          <button type="button" className="control" onClick={fit}>
            Reset
          </button>
          <span className="site-canvas-zoom">{Math.round(scale * 100)}%</span>
        </div>
      </div>

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
          <svg
            className="site-canvas-edges"
            width={worldW}
            height={worldH}
            aria-label="Traffic between pages"
          >
            <defs>
              <linearGradient id="primary-flow" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1d9bf0" stopOpacity="0.35" />
                <stop offset="50%" stopColor="#1d9bf0" stopOpacity="1" />
                <stop offset="100%" stopColor="#00ba7c" stopOpacity="0.95" />
              </linearGradient>
              <filter id="glow-primary" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <marker
                id="arrow-muted"
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <path d="M0,0 L7,3.5 L0,7 Z" fill="#6e767d" />
              </marker>
              <marker
                id="arrow-primary"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="#1d9bf0" />
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
              const d = edgePath(x1, y1, x2, y2);
              const weight = edge.sessionCount / maxEdge;
              const active =
                hoverEdge?.from === edge.from && hoverEdge?.to === edge.to;
              const dimmed =
                (hoverEdge && !active) ||
                (hoverRoute &&
                  hoverRoute !== edge.from &&
                  hoverRoute !== edge.to);
              const isPrimary = edge.isPrimary;
              const stroke = isPrimary ? 5 + weight * 4 : 1.25 + weight * 5;
              const dashed = !isPrimary && edge.shareOfFrom < 0.25;

              // Beads on the primary path (designer mock).
              const beads = isPrimary
                ? [0.2, 0.4, 0.6, 0.8].map((t) => pointOnCubic(x1, y1, x2, y2, t))
                : [];

              return (
                <g
                  key={`${edge.from}->${edge.to}`}
                  className="site-canvas-edge-group"
                  opacity={dimmed ? 0.12 : 1}
                  onMouseEnter={() => setHoverEdge(edge)}
                  onMouseLeave={() => setHoverEdge(null)}
                >
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={20}
                    className="site-canvas-edge-hit"
                  />
                  {isPrimary && (
                    <path
                      d={d}
                      fill="none"
                      stroke="url(#primary-flow)"
                      strokeWidth={stroke + 6}
                      strokeLinecap="round"
                      opacity={0.35}
                      filter="url(#glow-primary)"
                    />
                  )}
                  <path
                    d={d}
                    fill="none"
                    stroke={
                      isPrimary || active
                        ? isPrimary
                          ? "url(#primary-flow)"
                          : "#1d9bf0"
                        : "#6e767d"
                    }
                    strokeWidth={active && !isPrimary ? stroke + 1.5 : stroke}
                    strokeLinecap="round"
                    strokeDasharray={dashed ? "6 6" : undefined}
                    markerEnd={
                      isPrimary || active ? "url(#arrow-primary)" : "url(#arrow-muted)"
                    }
                    filter={isPrimary ? "url(#glow-primary)" : undefined}
                  />
                  {beads.map((bead, i) => (
                    <circle
                      key={i}
                      cx={bead.x}
                      cy={bead.y}
                      r={i === beads.length - 1 ? 5 : 4}
                      className="flow-bead"
                      fill={i === beads.length - 1 ? "#00ba7c" : "#1d9bf0"}
                      stroke="#000"
                      strokeWidth={1.5}
                    />
                  ))}
                </g>
              );
            })}
          </svg>

          {primaryCallout && primaryEdge && (
            <div
              className="flow-callout"
              style={{ left: primaryCallout.x, top: primaryCallout.y }}
            >
              <Sparkle size={12} weight="fill" />
              This is the highest-traffic path
            </div>
          )}

          {placed.map((item, index) => {
            const heat = heatmaps[item.route];
            const { kind, label } = classifyRoute(item.route);
            const shareOfEntry = Math.round(
              (item.stat.sessionCount / entrySessions) * 100,
            );
            const checkoutPct = item.node
              ? Math.round(item.node.checkoutRate * 100)
              : null;
            const isCheckout = kind === "checkout" || kind === "cart";
            const highlighted =
              relatedRoutes.has(item.route) || hoverRoute === item.route;
            const onPrimaryPath =
              primaryEdge &&
              (primaryEdge.from === item.route || primaryEdge.to === item.route);
            const dimmed =
              (hoverEdge && !relatedRoutes.has(item.route)) ||
              (hoverRoute &&
                hoverRoute !== item.route &&
                !relatedRoutes.has(item.route));

            return (
              <article
                key={item.route}
                className="flow-card"
                data-kind={kind}
                data-highlight={highlighted || onPrimaryPath ? "true" : "false"}
                data-dimmed={dimmed ? "true" : "false"}
                style={{ left: item.x, top: item.y, width: CARD_W, height: CARD_H }}
                onMouseEnter={() => setHoverRoute(item.route)}
                onMouseLeave={() => setHoverRoute(null)}
                onDoubleClick={() => onOpenRoute(item.route)}
              >
                <header className="flow-card-chrome">
                  <span className="flow-card-url" title={item.route}>
                    {shortPath(item.route)}
                  </span>
                  <button
                    type="button"
                    className="flow-card-open"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenRoute(item.route);
                    }}
                  >
                    Open
                  </button>
                </header>

                <div className="flow-card-preview">
                  <RouteCardPreview heatmap={heat} active={index < 14} />
                </div>

                <footer className="flow-card-footer">
                  <div className="flow-card-footer-title">{label}</div>
                  <div className="flow-card-footer-stats">
                    <span>
                      {item.stat.sessionCount}{" "}
                      {item.stat.sessionCount === 1 ? "session" : "sessions"}
                      {kind === "home" ? "" : ` · ${shareOfEntry}%`}
                    </span>
                    {kind === "home" && (
                      <span className="flow-card-entry">100%</span>
                    )}
                    {isCheckout && checkoutPct !== null && (
                      <span className="flow-card-conversion">{checkoutPct}% conversion</span>
                    )}
                    {!isCheckout && kind !== "home" && checkoutPct !== null && (
                      <span className="flow-card-conversion muted">
                        {checkoutPct}% → checkout
                      </span>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      </div>

      {hoverEdge && (
        <div className="site-canvas-edge-tip" role="status">
          <div className="site-canvas-edge-tip-path">
            <code>{hoverEdge.from}</code>
            <span>→</span>
            <code>{hoverEdge.to}</code>
          </div>
          {hoverEdge.isPrimary && (
            <p className="site-canvas-edge-tip-primary">Highest-traffic path</p>
          )}
          <p>
            <strong>{hoverEdge.sessionCount}</strong> sessions took this step
          </p>
          <p>
            <strong>{Math.round(hoverEdge.shareOfFrom * 100)}%</strong> of visitors on
            the source page continued here
          </p>
          <p>
            <strong>{Math.round(hoverEdge.checkoutRate * 100)}%</strong> later reached
            checkout
            <span className="site-canvas-edge-tip-share"> (behavior, not purchase)</span>
          </p>
        </div>
      )}
    </div>
  );
}
