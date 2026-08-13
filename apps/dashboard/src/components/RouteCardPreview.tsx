import type { HeatmapResponse, RrwebEvent } from "@pathminty/contracts";
import { memo, useEffect, useRef, useState } from "react";
import { Replayer, type eventWithTime } from "rrweb";
import "rrweb/dist/style.css";

import { drawHeatForMode, heatBlendMode } from "../heatRender";
import {
  computeHeatmapDisplayLayout,
  heatmapRrwebWrapperPinStyles,
} from "../heatmapLayout";
import { MiniHeatmap } from "./MiniHeatmap";

function toRrwebEvents(
  events: NonNullable<HeatmapResponse["snapshotEvents"]>,
): eventWithTime[] {
  return events.map((event): eventWithTime => {
    if ("delay" in event && typeof event.delay === "number") {
      return {
        type: event.type,
        data: event.data,
        timestamp: event.timestamp,
        delay: event.delay,
      };
    }
    return {
      type: event.type,
      data: event.data,
      timestamp: event.timestamp,
    };
  });
}

/** Meta (type 4) often has the capture viewport; prefer document size for coords. */
function metaViewport(events: readonly RrwebEvent[]): {
  width: number;
  height: number;
} | null {
  for (const event of events) {
    if (event.type !== 4) continue;
    const data = event.data as { width?: unknown; height?: unknown };
    if (typeof data.width === "number" && typeof data.height === "number") {
      return { width: data.width, height: data.height };
    }
  }
  return null;
}

/**
 * Full-bleed storefront preview. Snapshot + heat share origin/scale; the
 * parent clips to the desktop viewport. Never remount on hover or mode change.
 */
export const RouteCardPreview = memo(function RouteCardPreview({
  heatmap,
  active,
}: {
  heatmap: HeatmapResponse | undefined;
  active: boolean;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const heatRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  const hasSnapshot =
    Boolean(heatmap?.snapshotEvents) &&
    (heatmap?.snapshotEvents?.length ?? 0) >= 2 &&
    !failed;

  useEffect(() => {
    setFailed(false);
  }, [heatmap?.route, heatmap?.snapshotEvents]);

  const layoutRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    if (!active || !hasSnapshot || !heatmap?.snapshotEvents) return;
    const frame = frameRef.current;
    const host = hostRef.current;
    if (!frame || !host) return;

    while (host.firstChild) host.removeChild(host.firstChild);
    let replayer: Replayer | null = null;

    try {
      const frameW = Math.max(1, frame.clientWidth || 960);
      const meta = metaViewport(heatmap.snapshotEvents);
      const documentSize =
        heatmap.document ??
        (meta
          ? {
              width: meta.width,
              height: Math.max(meta.height, heatmap.viewport?.height ?? 0),
            }
          : heatmap.viewport
            ? { width: heatmap.viewport.width, height: heatmap.viewport.height }
            : null);

      const layout = computeHeatmapDisplayLayout(
        documentSize,
        heatmap.viewport ?? meta,
        frameW,
      );
      layoutRef.current = {
        width: layout.displayWidth,
        height: layout.displayHeight,
      };

      replayer = new Replayer(toRrwebEvents(heatmap.snapshotEvents), {
        root: host,
        loadTimeout: 1_500,
        showWarning: false,
        blockClass: "pathminty-block",
        liveMode: false,
        insertStyleRules: [
          "::-webkit-scrollbar{display:none!important}",
          "body{overflow:hidden!important}",
        ],
        mouseTail: false,
        UNSAFE_replayCanvas: false,
        useVirtualDom: false,
      });
      replayer.pause(0);

      host.style.position = "absolute";
      host.style.left = "0";
      host.style.top = "0";
      host.style.width = `${layout.displayWidth}px`;
      host.style.height = `${layout.displayHeight}px`;
      host.style.overflow = "hidden";

      const wrapper = host.querySelector(".replayer-wrapper");
      if (wrapper instanceof HTMLElement) {
        Object.assign(
          wrapper.style,
          heatmapRrwebWrapperPinStyles(
            layout.pageWidth,
            layout.pageHeight,
            layout.scale,
          ),
        );
      }
      const iframe = host.querySelector("iframe");
      if (iframe instanceof HTMLIFrameElement) {
        Object.assign(iframe.style, {
          position: "absolute",
          left: "0px",
          top: "0px",
          margin: "0px",
          border: "0",
          display: "block",
          pointerEvents: "none",
          width: `${layout.pageWidth}px`,
          height: `${layout.pageHeight}px`,
        });
      }
      frame.style.overflow = "hidden";
    } catch {
      setFailed(true);
    }

    return () => {
      try {
        replayer?.destroy();
      } catch {
        // ignore
      }
      while (host.firstChild) host.removeChild(host.firstChild);
    };
  }, [active, hasSnapshot, heatmap?.route, heatmap?.snapshotEvents]);

  useEffect(() => {
    const heat = heatRef.current;
    if (!heat || !heatmap || layoutRef.current.width <= 0) return;
    drawHeatForMode(
      heat,
      [...heatmap.points],
      layoutRef.current.width,
      layoutRef.current.height,
      heatmap.mode,
      { compact: true },
    );
    Object.assign(heat.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: `${layoutRef.current.width}px`,
      height: `${layoutRef.current.height}px`,
      margin: "0",
      pointerEvents: "none",
      zIndex: "2",
      mixBlendMode: heatBlendMode(heatmap.mode),
    });
  }, [heatmap?.mode, heatmap?.points, heatmap]);

  if (!heatmap) {
    return <div className="site-page-skeleton" aria-hidden />;
  }

  if (!hasSnapshot) {
    return (
      <MiniHeatmap
        className="site-page-mini"
        mode={heatmap.mode}
        points={heatmap.points}
      />
    );
  }

  return (
    <div className="site-page-preview" ref={frameRef}>
      <div className="site-page-stack">
        <div className="site-page-rrweb" ref={hostRef} />
        <canvas className="site-page-heat" ref={heatRef} aria-hidden />
      </div>
    </div>
  );
});
