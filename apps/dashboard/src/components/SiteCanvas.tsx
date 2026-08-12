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

/**
 * Designer flow canvas:
 *   Landing (left) → Collection / mid (center stack) → Product → Checkout (right)
 * Highest-traffic edge is glowing blue with callout; cards match mock chrome.
 */
const CARD_W = 260;
const CARD_H = 228;
const GAP_X = 120;
const GAP_Y = 36;
const COL_PAD = 72;
const ROW_PAD = 64;

type Placed = {
  route: string;
  x: number;
  y: number;
  stat: RouteStat;
  node: JourneyNode | null;
  column: number;
  kind: ReturnType<typeof classifyRoute>["kind"];
  label: string;
};

type EdgeView = JourneyEdge & {
  shareOfFrom: number;
  shareOfTraffic: number;
  isPrimary: boolean;
};

function classifyRoute(route: string): {
  kind: "home" | "collection" | "product" | "cart" | "checkout" | "other";
  label: string;
  column: number;
} {
  const r = route.toLowerCase();
  if (r === "/" || r === "") {
    return { kind: "home", label: "Landing page", column: 0 };
  }
  if (r === "/cart" || r.startsWith("/cart/")) {
    return { kind: "cart", label: "Cart", column: 3 };
  }
  if (r.includes("/checkouts") || r.startsWith("/checkout")) {
    return { kind: "checkout", label: "Checkout", column: 3 };
  }
  if (r.startsWith("/products/") || r.includes("/products/")) {
    const handle = route.split("/").filter(Boolean).pop() ?? "Product";
    const name = prettyHandle(handle);
    return { kind: "product", label: `Product: ${name}`, column: 2 };
  }
  if (r.startsWith("/collections/")) {
    const handle = route.split("/").filter(Boolean).pop() ?? "Collection";
    const name = handle === "all" ? "All Products" : prettyHandle(handle);
    return { kind: "collection", label: `Collection: ${name}`, column: 1 };
  }
  if (r.startsWith("/search")) {
    return { kind: "other", label: "Search", column: 1 };
  }
  return { kind: "other", label: "Page", column: 1 };
}

function prettyHandle(handle: string) {
  return handle
    .replace(/^the-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortPath(route: string) {
  if (route === "/") return "/";
  if (route.length <= 26) return route;
  const parts = route.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1] ?? "";
    const head = parts[0] ?? "";
    const clipped = last.length > 12 ? `${last.slice(0, 5)}…${last.slice(-5)}` : last;
    return `/${head}/…${clipped}`;
  }
  return `${route.slice(0, 11)}…${route.slice(-9)}`;
}

/** Force designer columns — never trust raw journey path index for layout. */
function placeRoutes(
  routes: readonly RouteStat[],
  journey: JourneyGraphResponse | null,
): Placed[] {
  const byRoute = new Map(routes.map((r) => [r.route, r]));
  const nodeByRoute = new Map(journey?.nodes.map((n) => [n.route, n]) ?? []);

  // Union of route stats + journey nodes so the graph is complete.
  const allRoutes = new Set<string>([
    ...routes.map((r) => r.route),
    ...(journey?.nodes.map((n) => n.route) ?? []),
  ]);

  const columns = new Map<number, string[]>();
  for (const route of allRoutes) {
    const { column } = classifyRoute(route);
    const list = columns.get(column) ?? [];
    list.push(route);
    columns.set(column, list);
  }

  // Ensure column order 0..3 even if empty gaps: compact to used columns left-to-right.
  const usedColumns = [...columns.keys()].sort((a, b) => a - b);
  const columnIndex = new Map(usedColumns.map((col, i) => [col, i]));

  const placed: Placed[] = [];
  for (const col of usedColumns) {
    const group = (columns.get(col) ?? []).sort((a, b) => {
      const sa = byRoute.get(a)?.sessionCount ?? nodeByRoute.get(a)?.sessionCount ?? 0;
      const sb = byRoute.get(b)?.sessionCount ?? nodeByRoute.get(b)?.sessionCount ?? 0;
      return sb - sa || a.localeCompare(b);
    });
    const colI = columnIndex.get(col) ?? 0;
    const stackH = group.length * CARD_H + Math.max(0, group.length - 1) * GAP_Y;
    // Center each column stack on a shared midline so Landing sits mid-left.
    const midY = 280;
    const startY = Math.max(ROW_PAD, midY - stackH / 2);

    group.forEach((route, index) => {
      const meta = classifyRoute(route);
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
        x: COL_PAD + colI * (CARD_W + GAP_X),
        y: startY + index * (CARD_H + GAP_Y),
        stat,
        node,
        column: colI,
        kind: meta.kind,
        label: meta.label,
      });
    });
  }
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
    .map((e) => {
      const from = pos.get(e.from);
      const to = pos.get(e.to);
      // Prefer forward edges (left → right). Keep back-edges only if strong.
      const forward = (from?.column ?? 0) <= (to?.column ?? 0);
      return {
        ...e,
        shareOfFrom: e.sessionCount / (nodeSessions.get(e.from) ?? 1),
        shareOfTraffic: e.sessionCount / totalSessions,
        isPrimary: false,
        forward,
      };
    })
    .sort((a, b) => {
      if (a.forward !== b.forward) return a.forward ? -1 : 1;
      return b.sessionCount - a.sessionCount;
    });

  const forward = connected.filter((e) => e.forward);
  const pool = forward.length > 0 ? forward : connected;
  const maxEdges = Math.min(16, Math.max(4, Math.ceil(pos.size * 1.25)));
  const top = pool.slice(0, maxEdges);
  return top.map((e, index) => ({
    from: e.from,
    to: e.to,
    sessionCount: e.sessionCount,
    checkoutReachCount: e.checkoutReachCount,
    checkoutRate: e.checkoutRate,
    shareOfFrom: e.shareOfFrom,
    shareOfTraffic: e.shareOfTraffic,
    isPrimary: index === 0,
  }));
}

function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(56, (x2 - x1) * 0.48);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function pointOnCubic(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
): { x: number; y: number } {
  const dx = Math.max(56, (x2 - x1) * 0.48);
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
  const [scale, setScale] = useState(0.95);
  const [tx, setTx] = useState(40);
  const [ty, setTy] = useState(20);
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
    placed.find((p) => p.kind === "home")?.stat.sessionCount ??
      journey?.totalSessions ??
      1,
  );
  const primaryEdge = edges.find((e) => e.isPrimary) ?? null;

  const onWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.92 : 1.08;
    setScale((current) => Math.min(1.35, Math.max(0.45, current * delta)));
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
    setScale((current) => Math.min(1.35, Math.max(0.45, current * factor)));
  };

  const fit = () => {
    setScale(0.95);
    setTx(40);
    setTy(20);
  };

  if (placed.length === 0) {
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

  // Callout sits ABOVE the primary edge midpoint — never on a card.
  let primaryCallout: { x: number; y: number } | null = null;
  if (primaryEdge) {
    const from = pos.get(primaryEdge.from);
    const to = pos.get(primaryEdge.to);
    if (from && to) {
      const x1 = from.x + CARD_W;
      const y1 = from.y + CARD_H / 2;
      const x2 = to.x;
      const y2 = to.y + CARD_H / 2;
      const mid = pointOnCubic(x1, y1, x2, y2, 0.45);
      primaryCallout = { x: mid.x - 110, y: Math.min(mid.y, y1, y2) - 52 };
    }
  }

  return (
    <div className="site-canvas-shell">
      <div className="site-canvas-chrome">
        <div className="site-canvas-legend">
          <span className="site-canvas-eyebrow">Customer journey</span>
          <span className="site-canvas-hint">
            Left → right = path through the store · Blue glow = busiest step · % = share
            of entry sessions · Green = reached checkout
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
                <stop offset="0%" stopColor="#1d9bf0" />
                <stop offset="100%" stopColor="#00c2ff" />
              </linearGradient>
              <filter id="glow-primary" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <marker
                id="arrow-muted"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="#5b636a" />
              </marker>
              <marker
                id="arrow-primary"
                markerWidth="9"
                markerHeight="9"
                refX="8"
                refY="4.5"
                orient="auto"
              >
                <path d="M0,0 L9,4.5 L0,9 Z" fill="#1d9bf0" />
              </marker>
            </defs>

            {/* Draw non-primary first so primary sits on top */}
            {[...edges].sort((a, b) => Number(a.isPrimary) - Number(b.isPrimary)).map((edge) => {
              const from = pos.get(edge.from);
              const to = pos.get(edge.to);
              if (!from || !to) return null;

              // Connect mid-right of source → mid-left of target (never through card body mid).
              const x1 = from.x + CARD_W;
              const y1 = from.y + CARD_H * 0.42;
              const x2 = to.x;
              const y2 = to.y + CARD_H * 0.42;
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
              const stroke = isPrimary ? 6 : 1.5 + weight * 4;
              const beads = isPrimary
                ? [0.22, 0.45, 0.68].map((t) => pointOnCubic(x1, y1, x2, y2, t))
                : [];

              return (
                <g
                  key={`${edge.from}->${edge.to}`}
                  className="site-canvas-edge-group"
                  opacity={dimmed ? 0.1 : 1}
                  onMouseEnter={() => setHoverEdge(edge)}
                  onMouseLeave={() => setHoverEdge(null)}
                >
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={22}
                    className="site-canvas-edge-hit"
                  />
                  {isPrimary && (
                    <path
                      d={d}
                      fill="none"
                      stroke="#1d9bf0"
                      strokeWidth={stroke + 10}
                      strokeLinecap="round"
                      opacity={0.22}
                      filter="url(#glow-primary)"
                    />
                  )}
                  <path
                    d={d}
                    fill="none"
                    stroke={isPrimary || active ? "#1d9bf0" : "#5b636a"}
                    strokeWidth={active && !isPrimary ? stroke + 1 : stroke}
                    strokeLinecap="round"
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
                      r={4.5}
                      fill="#1d9bf0"
                      stroke="#000"
                      strokeWidth={1.5}
                      className="flow-bead"
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
            const shareOfEntry = Math.round(
              (item.stat.sessionCount / entrySessions) * 100,
            );
            const checkoutPct = item.node
              ? Math.round(item.node.checkoutRate * 100)
              : null;
            const isCheckout = item.kind === "checkout" || item.kind === "cart";
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
                data-kind={item.kind}
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
                  <RouteCardPreview heatmap={heat} active={index < 16} />
                </div>

                <footer className="flow-card-footer">
                  <div className="flow-card-footer-title">{item.label}</div>
                  <div className="flow-card-footer-stats">
                    <span>
                      {item.stat.sessionCount}{" "}
                      {item.stat.sessionCount === 1 ? "session" : "sessions"}
                    </span>
                    {item.kind === "home" ? (
                      <span className="flow-card-entry">100%</span>
                    ) : (
                      <span>{shareOfEntry}%</span>
                    )}
                    {isCheckout && checkoutPct !== null ? (
                      <span className="flow-card-conversion">
                        {checkoutPct}% conversion
                      </span>
                    ) : (
                      checkoutPct !== null &&
                      item.kind !== "home" && (
                        <span className="flow-card-conversion muted">
                          {checkoutPct}% → checkout
                        </span>
                      )
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
