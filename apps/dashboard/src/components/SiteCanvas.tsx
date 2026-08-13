import type {
  HeatmapResponse,
  JourneyGraphResponse,
  RouteStat,
} from "@pathminty/contracts";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

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
  TOOLBAR_ZOOM_IN,
  TOOLBAR_ZOOM_OUT,
  wheelZoomFactor,
  worldSize,
} from "../siteCanvasLayout";
import { RouteCardPreview } from "./RouteCardPreview";

export type SiteCanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  fitAll: () => void;
  scale: number;
};

export const SiteCanvas = forwardRef<
  SiteCanvasHandle,
  {
    routes: readonly RouteStat[];
    heatmaps: Record<string, HeatmapResponse>;
    journey: JourneyGraphResponse | null;
    onOpenRoute: (route: string) => void;
    onScaleChange?: (scale: number) => void;
  }
>(function SiteCanvas({ routes, heatmaps, journey, onOpenRoute, onScaleChange }, ref) {
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

  const zoomFromCenter = useCallback(
    (factor: number) => {
      const viewport = viewportRef.current?.getBoundingClientRect();
      if (!viewport) return;
      zoomAt(
        viewport.left + viewport.width / 2,
        viewport.top + viewport.height / 2,
        factor,
      );
    },
    [zoomAt],
  );

  const fitAll = useCallback(() => {
    fitRect(0, 0, worldW, worldH);
  }, [fitRect, worldH, worldW]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => zoomFromCenter(TOOLBAR_ZOOM_IN),
      zoomOut: () => zoomFromCenter(TOOLBAR_ZOOM_OUT),
      fitAll,
      scale,
    }),
    [fitAll, scale, zoomFromCenter],
  );

  useEffect(() => {
    onScaleChange?.(scale);
  }, [onScaleChange, scale]);

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
      zoomAt(
        event.clientX,
        event.clientY,
        wheelZoomFactor(event.deltaY, event.deltaMode),
      );
      return;
    }
    setTx((current) => current - event.deltaX);
    setTy((current) => current - event.deltaY);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".site-page") || target.closest(".figma-source")) return;
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
        <span>Store pages will show here as live website views.</span>
      </div>
    );
  }

  return (
    <div className="site-canvas-shell figma-shell">
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
                height="20"
                id="figma-dots"
                patternUnits="userSpaceOnUse"
                width="20"
              >
                <circle cx="1" cy="1" fill="#3a3a3a" r="0.7" />
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
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              return (
                <g className="figma-edge" key={`${edge.from}->${edge.to}`}>
                  <title>
                    {edge.sessionCount} shoppers · {edge.from.replace(/^src:/u, "")} →{" "}
                    {edge.to}
                  </title>
                  <path d={d} fill="none" stroke="transparent" strokeWidth={22} />
                  <path
                    d={d}
                    fill="none"
                    stroke={edge.kind === "source" ? "#8b98a5" : "#1d9bf0"}
                    strokeWidth={edge.isPrimary ? 2.6 : 1.6}
                  />
                  <rect
                    fill="#111"
                    height="20"
                    rx="10"
                    width={Math.max(64, 32 + String(edge.sessionCount).length * 8)}
                    x={midX - 32}
                    y={midY - 10}
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
              <em>Source</em>
              <strong>{source.label}</strong>
              <small>
                {source.sessionCount} shoppers · {source.detail}
              </small>
            </article>
          ))}

          {frames.map((frame) => {
            const heat = heatmaps[frame.route];
            return (
              <article
                className="site-page"
                key={frame.route}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onOpenRoute(frame.route);
                }}
                style={{
                  left: frame.x,
                  top: frame.y - 22,
                  width: FRAME_W,
                  height: FRAME_H + 22,
                }}
              >
                <p className="site-page-caption">
                  {frame.label}
                  <span>
                    {shortPath(frame.route)} · {frame.sessionCount}
                  </span>
                </p>
                <div className="site-page-stage">
                  <div className="site-page-view">
                    <RouteCardPreview active={Boolean(heat)} heatmap={heat} />
                  </div>
                  <span className="site-page-ring" aria-hidden />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
});
