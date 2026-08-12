import type {
  HeatmapResponse,
  JourneyEdge,
  JourneyGraphResponse,
  RouteStat,
} from "@pathminty/contracts";
import { MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RouteCardPreview } from "./RouteCardPreview";

const CARD_W = 280;
const CARD_H = 220;
const GAP_X = 64;
const GAP_Y = 72;

type Placed = {
  route: string;
  x: number;
  y: number;
  stat: RouteStat;
};

function placeRoutes(
  routes: readonly RouteStat[],
  journey: JourneyGraphResponse | null,
): Placed[] {
  if (journey && journey.nodes.length > 0) {
    // Layered layout from journey graph so traffic flow reads left→right.
    const byRoute = new Map(routes.map((r) => [r.route, r]));
    const layers = new Map<number, string[]>();
    for (const node of journey.nodes) {
      const list = layers.get(node.layer) ?? [];
      if (!list.includes(node.route)) list.push(node.route);
      layers.set(node.layer, list);
    }
    // Routes with heat data but not in the journey graph sit in a final column.
    const journeyRoutes = new Set(journey.nodes.map((n) => n.route));
    const orphans = routes.filter((r) => !journeyRoutes.has(r.route)).map((r) => r.route);
    if (orphans.length > 0) {
      const maxLayer =
        layers.size > 0 ? Math.max(...layers.keys()) + 1 : 0;
      layers.set(maxLayer, orphans);
    }

    const placed: Placed[] = [];
    const layerKeys = [...layers.keys()].sort((a, b) => a - b);
    layerKeys.forEach((layer, layerIndex) => {
      const group = (layers.get(layer) ?? []).sort((a, b) => {
        const sa =
          byRoute.get(a)?.sessionCount ??
          journey.nodes.find((n) => n.route === a)?.sessionCount ??
          0;
        const sb =
          byRoute.get(b)?.sessionCount ??
          journey.nodes.find((n) => n.route === b)?.sessionCount ??
          0;
        return sb - sa;
      });
      group.forEach((route, index) => {
        const journeyNode = journey.nodes.find((n) => n.route === route);
        const stat = byRoute.get(route) ?? {
          route,
          sessionCount: journeyNode?.sessionCount ?? 0,
          eventCount: 0,
          clickCount: 0,
          hoverWeight: 0,
          lastSeenAt: journey.to,
          hasFullSnapshot: false,
        };
        placed.push({
          route,
          x: layerIndex * (CARD_W + GAP_X),
          y: index * (CARD_H + GAP_Y),
          stat,
        });
      });
    });
    return placed;
  }

  // Grid fallback when no journey graph.
  const cols = Math.max(1, Math.ceil(Math.sqrt(routes.length)));
  return routes.map((stat, index) => ({
    route: stat.route,
    x: (index % cols) * (CARD_W + GAP_X),
    y: Math.floor(index / cols) * (CARD_H + GAP_Y),
    stat,
  }));
}

function shortRoute(route: string) {
  if (route.length <= 32) return route;
  return `${route.slice(0, 14)}…${route.slice(-14)}`;
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
  const [scale, setScale] = useState(0.72);
  const [tx, setTx] = useState(48);
  const [ty, setTy] = useState(48);
  const drag = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originTx: number;
    originTy: number;
  }>({ active: false, startX: 0, startY: 0, originTx: 0, originTy: 0 });
  const [hoverEdge, setHoverEdge] = useState<JourneyEdge | null>(null);

  const placed = useMemo(() => placeRoutes(routes, journey), [routes, journey]);
  const pos = useMemo(() => {
    const map = new Map<string, Placed>();
    for (const item of placed) map.set(item.route, item);
    return map;
  }, [placed]);

  const maxEdge = Math.max(1, ...(journey?.edges.map((e) => e.sessionCount) ?? [1]));

  const onWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.92 : 1.08;
    setScale((current) => Math.min(1.6, Math.max(0.25, current * delta)));
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
    // Don't start pan when clicking a card control.
    const target = event.target as HTMLElement;
    if (target.closest(".site-canvas-card")) return;
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
    setScale((current) => Math.min(1.6, Math.max(0.25, current * factor)));
  };

  const fit = () => {
    setScale(0.72);
    setTx(48);
    setTy(48);
  };

  if (routes.length === 0) {
    return (
      <div className="site-canvas-empty">
        <p>No pages in this range</p>
      </div>
    );
  }

  // World bounds for edge SVG
  const worldW =
    Math.max(...placed.map((p) => p.x), 0) + CARD_W + 80;
  const worldH =
    Math.max(...placed.map((p) => p.y), 0) + CARD_H + 80;

  return (
    <div className="site-canvas-shell">
      <div className="site-canvas-chrome">
        <span>Pan · scroll to zoom · double-click a page to open heatmap</span>
        <div className="site-canvas-tools">
          <button type="button" className="icon-button" onClick={() => zoomBy(1.15)} title="Zoom in">
            <MagnifyingGlassPlus size={16} />
          </button>
          <button type="button" className="icon-button" onClick={() => zoomBy(0.87)} title="Zoom out">
            <MagnifyingGlassMinus size={16} />
          </button>
          <button type="button" className="control" onClick={fit}>
            Reset view
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
          {journey && journey.edges.length > 0 && (
            <svg
              className="site-canvas-edges"
              width={worldW}
              height={worldH}
              aria-hidden
            >
              {journey.edges.map((edge) => {
                const from = pos.get(edge.from);
                const to = pos.get(edge.to);
                if (!from || !to) return null;
                const x1 = from.x + CARD_W;
                const y1 = from.y + CARD_H / 2;
                const x2 = to.x;
                const y2 = to.y + CARD_H / 2;
                const mid = (x1 + x2) / 2;
                const weight = edge.sessionCount / maxEdge;
                const stroke = 2 + weight * 10;
                const active =
                  hoverEdge?.from === edge.from && hoverEdge?.to === edge.to;
                return (
                  <path
                    key={`${edge.from}->${edge.to}`}
                    d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke={active ? "#ffb08a" : "#ff6a2b"}
                    strokeWidth={stroke}
                    strokeOpacity={0.35 + weight * 0.5}
                    strokeLinecap="round"
                    onMouseEnter={() => setHoverEdge(edge)}
                    onMouseLeave={() => setHoverEdge(null)}
                  />
                );
              })}
            </svg>
          )}

          {placed.map((item, index) => {
            const heat = heatmaps[item.route];
            return (
              <article
                key={item.route}
                className="site-canvas-card"
                style={{ left: item.x, top: item.y, width: CARD_W }}
                onDoubleClick={() => onOpenRoute(item.route)}
              >
                <header className="site-canvas-card-bar">
                  <span title={item.route}>{shortRoute(item.route)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenRoute(item.route);
                    }}
                  >
                    Open
                  </button>
                </header>
                <div className="site-canvas-card-preview">
                  <RouteCardPreview heatmap={heat} active={index < 12} />
                </div>
                <footer className="site-canvas-card-meta">
                  <span>
                    {item.stat.eventCount} events · {item.stat.sessionCount} sessions
                  </span>
                </footer>
              </article>
            );
          })}
        </div>
      </div>

      {hoverEdge && (
        <div className="site-canvas-edge-tip" role="status">
          <strong>
            {hoverEdge.from} → {hoverEdge.to}
          </strong>
          <span>
            {hoverEdge.sessionCount} sessions ·{" "}
            {Math.round(hoverEdge.checkoutRate * 100)}% reached checkout
          </span>
        </div>
      )}
    </div>
  );
}
