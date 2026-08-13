import type {
  HeatmapResponse,
  JourneyGraphResponse,
  RouteStat,
} from "@pathminty/contracts";
import { MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  COLUMN_TITLES,
  FRAME_H,
  FRAME_W,
  PAGE_COL_X,
  SOURCE_H,
  SOURCE_W,
  SOURCE_X,
  buildFlowEdges,
  clampZoom,
  connectorPath,
  placeFrames,
  placeSources,
  shortPath,
  worldSize,
  type FlowEdge,
  type PageFrame,
} from "../siteCanvasLayout";
import { RouteCardPreview } from "./RouteCardPreview";

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
  const [scale, setScale] = useState(0.35);
  const [tx, setTx] = useState(32);
  const [ty, setTy] = useState(24);
  const drag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    originTx: 0,
    originTy: 0,
  });
  const [hoverEdge, setHoverEdge] = useState<FlowEdge | null>(null);
  const [hoverRoute, setHoverRoute] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const fittedFor = useRef("");

  const frames = useMemo(() => placeFrames(routes, journey), [routes, journey]);
  const sources = useMemo(
    () => placeSources(journey?.acquisitions ?? [], frames),
    [journey, frames],
  );
  const pos = useMemo(() => {
    const map = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const frame of frames) {
      map.set(frame.route, { x: frame.x, y: frame.y, w: FRAME_W, h: FRAME_H });
    }
    for (const source of sources) {
      map.set(`src:${source.key}`, {
        x: source.x,
        y: source.y,
        w: SOURCE_W,
        h: SOURCE_H,
      });
    }
    return map;
  }, [frames, sources]);
  const edges = useMemo(
    () => buildFlowEdges(journey, frames, sources),
    [journey, frames, sources],
  );
  const { width: worldW, height: worldH } = worldSize(frames, sources);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      setScale((current) => {
        const next = clampZoom(current * factor);
        const wx = (px - tx) / current;
        const wy = (py - ty) / current;
        setTx(px - wx * next);
        setTy(py - wy * next);
        return next;
      });
    },
    [tx, ty],
  );

  const fitRect = useCallback((x: number, y: number, w: number, h: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const pad = 48;
    const next = clampZoom(
      Math.min(
        (viewport.clientWidth - pad * 2) / w,
        (viewport.clientHeight - pad * 2) / h,
      ),
    );
    setScale(next);
    setTx((viewport.clientWidth - w * next) / 2 - x * next);
    setTy((viewport.clientHeight - h * next) / 2 - y * next);
  }, []);

  const fitAll = useCallback(() => {
    fitRect(0, 0, worldW, worldH);
  }, [fitRect, worldH, worldW]);

  const zoomToFrame = useCallback(
    (frame: PageFrame) => {
      fitRect(frame.x - 24, frame.y - 48, FRAME_W + 48, FRAME_H + 72);
      setSelectedRoute(frame.route);
    },
    [fitRect],
  );

  useEffect(() => {
    const key = frames.map((frame) => frame.route).join("|");
    if (key === fittedFor.current) return;
    fittedFor.current = key;
    fitAll();
  }, [fitAll, frames]);

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
    if (event.ctrlKey || event.metaKey) {
      zoomAt(event.clientX, event.clientY, event.deltaY > 0 ? 0.9 : 1.11);
      return;
    }
    setTx((current) => current - event.deltaX);
    setTy((current) => current - event.deltaY);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".figma-frame") || target.closest(".figma-source")) return;
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

  if (frames.length === 0) {
    return (
      <div className="site-canvas-empty">
        <p>No pages in this range</p>
        <span>Store pages will land here as frames you can zoom like Figma.</span>
      </div>
    );
  }

  return (
    <div className="site-canvas-shell figma-shell">
      <div className="site-canvas-chrome">
        <div className="site-canvas-legend">
          <span className="site-canvas-eyebrow">Store canvas</span>
          <span className="site-canvas-hint">
            Scroll to pan · pinch / ⌘+scroll to zoom · double-click a page to zoom in ·
            lines are shoppers moving between pages
            {journey
              ? ` · ${journey.checkoutSessions}/${journey.totalSessions} reached cart or checkout`
              : ""}
          </span>
        </div>
        <div className="site-canvas-tools">
          <button
            className="icon-button"
            onClick={() => {
              const viewport = viewportRef.current?.getBoundingClientRect();
              if (!viewport) return;
              zoomAt(
                viewport.left + viewport.width / 2,
                viewport.top + viewport.height / 2,
                1.15,
              );
            }}
            title="Zoom in"
            type="button"
          >
            <MagnifyingGlassPlus size={16} />
          </button>
          <button
            className="icon-button"
            onClick={() => {
              const viewport = viewportRef.current?.getBoundingClientRect();
              if (!viewport) return;
              zoomAt(
                viewport.left + viewport.width / 2,
                viewport.top + viewport.height / 2,
                0.87,
              );
            }}
            title="Zoom out"
            type="button"
          >
            <MagnifyingGlassMinus size={16} />
          </button>
          <button className="control" onClick={fitAll} type="button">
            Fit all
          </button>
          <span className="site-canvas-zoom">{Math.round(scale * 100)}%</span>
        </div>
      </div>

      <div
        className="site-canvas-viewport figma-viewport"
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
            aria-label="Customer flow"
            className="site-canvas-edges"
            height={worldH}
            width={worldW}
          >
            <defs>
              <pattern
                height="32"
                id="figma-dots"
                patternUnits="userSpaceOnUse"
                width="32"
              >
                <circle cx="1" cy="1" fill="#2a2e33" r="1" />
              </pattern>
            </defs>
            <rect fill="url(#figma-dots)" height={worldH} width={worldW} />
            {COLUMN_TITLES.map((title, column) => (
              <text
                className="figma-col-title"
                key={title}
                x={PAGE_COL_X[column]}
                y={36}
              >
                {title}
              </text>
            ))}
            <text className="figma-col-title" x={SOURCE_X} y={36}>
              Traffic in
            </text>

            {edges.map((edge) => {
              const from = pos.get(edge.from);
              const to = pos.get(edge.to);
              if (!from || !to) return null;
              const x1 = from.x + from.w;
              const y1 = from.y + from.h / 2;
              const x2 = to.x;
              const y2 = to.y + to.h / 2;
              const d = connectorPath(x1, y1, x2, y2);
              const active = hoverEdge?.from === edge.from && hoverEdge?.to === edge.to;
              const related =
                hoverRoute === edge.from ||
                hoverRoute === edge.to ||
                selectedRoute === edge.from ||
                selectedRoute === edge.to;
              const dimmed =
                (hoverEdge && !active) ||
                ((hoverRoute || selectedRoute) && !related && !active);
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              return (
                <g
                  className="figma-edge"
                  key={`${edge.from}->${edge.to}`}
                  onMouseEnter={() => setHoverEdge(edge)}
                  onMouseLeave={() => setHoverEdge(null)}
                  opacity={dimmed ? 0.16 : 1}
                >
                  <path d={d} fill="none" stroke="transparent" strokeWidth={28} />
                  <path
                    d={d}
                    fill="none"
                    stroke={edge.kind === "source" ? "#8b98a5" : "#1d9bf0"}
                    strokeWidth={active || edge.isPrimary ? 3.2 : 1.8}
                  />
                  <rect
                    fill="#0b0d10"
                    height="22"
                    rx="11"
                    width={Math.max(46, 18 + String(edge.sessionCount).length * 10)}
                    x={midX - 23}
                    y={midY - 11}
                  />
                  <text
                    className="figma-edge-count"
                    textAnchor="middle"
                    x={midX}
                    y={midY + 4}
                  >
                    {edge.sessionCount}
                  </text>
                </g>
              );
            })}
          </svg>

          {sources.map((source) => (
            <article
              className="figma-source"
              key={source.key}
              style={{
                left: source.x,
                top: source.y,
                width: SOURCE_W,
                height: SOURCE_H,
              }}
            >
              <strong>{source.label}</strong>
              <small>
                {source.sessionCount} in · {source.detail}
              </small>
            </article>
          ))}

          {frames.map((frame) => {
            const heat = heatmaps[frame.route];
            const selected = selectedRoute === frame.route;
            const highlighted =
              selected ||
              hoverRoute === frame.route ||
              hoverEdge?.from === frame.route ||
              hoverEdge?.to === frame.route;
            return (
              <article
                className="figma-frame"
                data-on={highlighted ? "true" : "false"}
                key={frame.route}
                onClick={() => setSelectedRoute(frame.route)}
                onDoubleClick={() => zoomToFrame(frame)}
                onMouseEnter={() => setHoverRoute(frame.route)}
                onMouseLeave={() => setHoverRoute(null)}
                style={{ left: frame.x, top: frame.y, width: FRAME_W, height: FRAME_H }}
              >
                <header className="figma-frame-bar">
                  <span title={frame.route}>
                    <strong>{frame.label}</strong>
                    <small>{shortPath(frame.route)}</small>
                  </span>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenRoute(frame.route);
                    }}
                    type="button"
                  >
                    Open
                  </button>
                </header>
                <div className="figma-frame-stage">
                  <RouteCardPreview active={Boolean(heat)} heatmap={heat} />
                </div>
                <footer className="figma-frame-meta">
                  {frame.sessionCount}{" "}
                  {frame.sessionCount === 1 ? "session" : "sessions"}
                  {frame.checkoutRate !== null
                    ? ` · ${Math.round(frame.checkoutRate * 100)}% reached checkout`
                    : ""}
                </footer>
              </article>
            );
          })}
        </div>
      </div>

      {hoverEdge ? (
        <div className="site-canvas-edge-tip" role="status">
          <div className="site-canvas-edge-tip-path">
            <code>{hoverEdge.from.replace(/^src:/u, "")}</code>
            <span>→</span>
            <code>{hoverEdge.to}</code>
          </div>
          <p>
            <strong>{hoverEdge.sessionCount}</strong> shoppers took this path
          </p>
          {hoverEdge.kind === "page" ? (
            <p>
              <strong>{Math.round(hoverEdge.shareOfFrom * 100)}%</strong> of people on
              the first page continued here
            </p>
          ) : (
            <p>This is a traffic source into the store.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
