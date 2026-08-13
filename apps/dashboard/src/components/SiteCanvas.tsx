import type { JourneyGraphResponse, RouteStat } from "@pathminty/contracts";
import { MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  COL_X,
  COLUMN_TITLES,
  LINE_COLOR,
  buildMetroEdges,
  metroPath,
  placeStations,
  shortPath,
  worldSize,
  type MetroEdge,
  type Station,
} from "../siteCanvasLayout";

export function SiteCanvas({
  routes,
  journey,
  onOpenRoute,
}: {
  routes: readonly RouteStat[];
  journey: JourneyGraphResponse | null;
  onOpenRoute: (route: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(24);
  const [ty, setTy] = useState(12);
  const drag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    originTx: 0,
    originTy: 0,
  });
  const [hoverEdge, setHoverEdge] = useState<MetroEdge | null>(null);
  const [hoverRoute, setHoverRoute] = useState<string | null>(null);
  const fittedFor = useRef("");

  const stations = useMemo(() => placeStations(routes, journey), [routes, journey]);
  const pos = useMemo(() => {
    const map = new Map<string, Station>();
    for (const station of stations) map.set(station.route, station);
    return map;
  }, [stations]);
  const edges = useMemo(() => buildMetroEdges(journey, stations), [journey, stations]);
  const maxEdge = Math.max(1, ...edges.map((edge) => edge.sessionCount));
  const { width: worldW, height: worldH } = worldSize(stations);

  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || stations.length === 0) {
      setScale(1);
      setTx(24);
      setTy(12);
      return;
    }
    const next = Math.min(
      1.05,
      Math.max(
        0.55,
        Math.min(
          (viewport.clientWidth - 48) / worldW,
          (viewport.clientHeight - 36) / worldH,
        ),
      ),
    );
    setScale(next);
    setTx(24);
    setTy(16);
  }, [stations.length, worldH, worldW]);

  useEffect(() => {
    const key = stations.map((station) => station.route).join("|");
    if (key === fittedFor.current) return;
    fittedFor.current = key;
    fit();
  }, [fit, stations]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const prevent = (event: WheelEvent) => {
      if (el.contains(event.target as Node)) event.preventDefault();
    };
    el.addEventListener("wheel", prevent, { passive: false });
    return () => el.removeEventListener("wheel", prevent);
  }, []);

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.92 : 1.08;
    setScale((current) => Math.min(1.4, Math.max(0.45, current * delta)));
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".metro-station") || target.closest(".metro-edge-hit")) return;
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

  if (stations.length === 0) {
    return (
      <div className="site-canvas-empty">
        <p>No page traffic in this range</p>
        <span>Pages shoppers visit will show up here as stations on the map.</span>
      </div>
    );
  }

  return (
    <div className="site-canvas-shell metro-shell">
      <div className="site-canvas-chrome">
        <div className="site-canvas-legend">
          <span className="site-canvas-eyebrow">Store map</span>
          <span className="site-canvas-hint">
            Stations are pages. Lines are how shoppers move. Thicker = more traffic.
            {journey
              ? ` ${journey.checkoutSessions}/${journey.totalSessions} sessions reached cart or checkout.`
              : ""}
          </span>
          <div className="metro-swatches">
            {(
              [
                ["home", "Home"],
                ["collection", "Browse"],
                ["product", "Product"],
                ["checkout", "Checkout"],
              ] as const
            ).map(([kind, title]) => (
              <span key={kind}>
                <i style={{ background: LINE_COLOR[kind] }} />
                {title}
              </span>
            ))}
          </div>
        </div>
        <div className="site-canvas-tools">
          <button
            className="icon-button"
            onClick={() => setScale((current) => Math.min(1.4, current * 1.1))}
            title="Zoom in"
            type="button"
          >
            <MagnifyingGlassPlus size={16} />
          </button>
          <button
            className="icon-button"
            onClick={() => setScale((current) => Math.max(0.45, current * 0.9))}
            title="Zoom out"
            type="button"
          >
            <MagnifyingGlassMinus size={16} />
          </button>
          <button className="control" onClick={fit} type="button">
            Fit
          </button>
          <span className="site-canvas-zoom">{Math.round(scale * 100)}%</span>
        </div>
      </div>

      <div
        className="site-canvas-viewport metro-viewport"
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        ref={viewportRef}
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
            aria-label="Traffic between pages"
            className="site-canvas-edges metro-map"
            height={worldH}
            width={worldW}
          >
            <defs>
              <pattern
                height="24"
                id="metro-dots"
                patternUnits="userSpaceOnUse"
                width="24"
              >
                <circle cx="1" cy="1" fill="#1a1d21" r="1" />
              </pattern>
            </defs>
            <rect fill="url(#metro-dots)" height={worldH} width={worldW} />

            {COLUMN_TITLES.map((title, column) => (
              <text className="metro-col-title" key={title} x={COL_X[column]} y={36}>
                {title}
              </text>
            ))}

            {[...edges]
              .sort((left, right) => Number(left.isPrimary) - Number(right.isPrimary))
              .map((edge) => {
                const from = pos.get(edge.from);
                const to = pos.get(edge.to);
                if (!from || !to) return null;
                const d = metroPath(from.x, from.y, to.x, to.y, edge.lane);
                const weight = edge.sessionCount / maxEdge;
                const active =
                  hoverEdge?.from === edge.from && hoverEdge?.to === edge.to;
                const linked = hoverRoute === edge.from || hoverRoute === edge.to;
                const dimmed =
                  (hoverEdge && !active) || (hoverRoute && !linked && !active);
                const stroke = edge.isPrimary ? 7 : 2.2 + weight * 5;
                return (
                  <g
                    className="metro-edge-group"
                    key={`${edge.from}->${edge.to}`}
                    onMouseEnter={() => setHoverEdge(edge)}
                    onMouseLeave={() => setHoverEdge(null)}
                    opacity={dimmed ? 0.14 : 1}
                  >
                    <path
                      className="metro-edge-hit"
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={22}
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke={edge.color}
                      strokeLinecap="square"
                      strokeLinejoin="miter"
                      strokeWidth={active ? stroke + 1.5 : stroke}
                    />
                  </g>
                );
              })}

            {stations.map((station) => {
              const color = LINE_COLOR[station.kind];
              const highlighted =
                hoverRoute === station.route ||
                hoverEdge?.from === station.route ||
                hoverEdge?.to === station.route;
              const dimmed =
                (hoverEdge &&
                  hoverEdge.from !== station.route &&
                  hoverEdge.to !== station.route) ||
                (hoverRoute && hoverRoute !== station.route && !highlighted);
              const r = station.isHub ? 11 : 7.5;
              return (
                <g
                  className="metro-station"
                  data-hub={station.isHub ? "true" : "false"}
                  key={station.route}
                  onClick={() => onOpenRoute(station.route)}
                  onMouseEnter={() => setHoverRoute(station.route)}
                  onMouseLeave={() => setHoverRoute(null)}
                  opacity={dimmed ? 0.28 : 1}
                  transform={`translate(${station.x} ${station.y})`}
                >
                  {station.isHub ? (
                    <circle
                      cx={0}
                      cy={0}
                      fill="#050607"
                      r={r + 5}
                      stroke={color}
                      strokeWidth={3}
                    />
                  ) : null}
                  <circle
                    cx={0}
                    cy={0}
                    fill={highlighted ? color : "#050607"}
                    r={r}
                    stroke={color}
                    strokeWidth={3}
                  />
                </g>
              );
            })}
          </svg>

          {stations.map((station) => {
            const highlighted =
              hoverRoute === station.route ||
              hoverEdge?.from === station.route ||
              hoverEdge?.to === station.route;
            return (
              <button
                className="metro-label"
                data-hub={station.isHub ? "true" : "false"}
                data-on={highlighted ? "true" : "false"}
                key={`label-${station.route}`}
                onClick={() => onOpenRoute(station.route)}
                onMouseEnter={() => setHoverRoute(station.route)}
                onMouseLeave={() => setHoverRoute(null)}
                style={{ left: station.x + 16, top: station.y - 18 }}
                title={station.route}
                type="button"
              >
                <strong>{station.label}</strong>
                <small>
                  {shortPath(station.route)} · {station.sessionCount}{" "}
                  {station.sessionCount === 1 ? "session" : "sessions"}
                </small>
              </button>
            );
          })}
        </div>
      </div>

      {hoverEdge ? (
        <div className="site-canvas-edge-tip" role="status">
          <div className="site-canvas-edge-tip-path">
            <code>{hoverEdge.from}</code>
            <span>→</span>
            <code>{hoverEdge.to}</code>
          </div>
          {hoverEdge.isPrimary ? (
            <p className="site-canvas-edge-tip-primary">Busiest route</p>
          ) : null}
          <p>
            <strong>{hoverEdge.sessionCount}</strong> sessions took this step
          </p>
          <p>
            <strong>{Math.round(hoverEdge.shareOfFrom * 100)}%</strong> of people on the
            first page continued here
          </p>
        </div>
      ) : hoverRoute ? (
        <div className="site-canvas-edge-tip" role="status">
          <div className="site-canvas-edge-tip-path">
            <code>{hoverRoute}</code>
          </div>
          <p>Click the station to open its heatmap.</p>
        </div>
      ) : null}
    </div>
  );
}
