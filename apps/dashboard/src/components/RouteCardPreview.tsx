import type { HeatmapResponse, RrwebEvent } from "@pathminty/contracts";
import { useEffect, useRef, useState } from "react";
import { Replayer, type eventWithTime } from "rrweb";
import "rrweb/dist/style.css";

import { drawExactHeatCompact } from "../exactHeat";
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
 * Card preview: same scale + origin for DOM snapshot and heat.
 * Heat points are document-normalized (0–1); canvas is full scaled page size.
 * The frame clips both layers equally (top-left laptop fold).
 */
export function RouteCardPreview({
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

  useEffect(() => {
    if (!active || !hasSnapshot || !heatmap?.snapshotEvents) return;
    const frame = frameRef.current;
    const host = hostRef.current;
    const heat = heatRef.current;
    if (!frame || !host) return;

    while (host.firstChild) host.removeChild(host.firstChild);
    let replayer: Replayer | null = null;

    try {
      const frameW = Math.max(1, frame.clientWidth || 360);
      const frameH = Math.max(1, frame.clientHeight || 200);

      const meta = metaViewport(heatmap.snapshotEvents);
      // Document space is what click x/y are normalized against — never invent size.
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

      // Host is the full scaled page (may be taller than the frame).
      // Frame overflow:hidden clips both DOM + heat identically at top-left.
      host.style.position = "absolute";
      host.style.left = "0";
      host.style.top = "0";
      host.style.right = "auto";
      host.style.bottom = "auto";
      host.style.margin = "0";
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
          width: `${layout.pageWidth}px`,
          height: `${layout.pageHeight}px`,
        });
      }

      if (heat) {
        // SAME pixel size as the scaled page — points use full document 0–1.
        drawExactHeatCompact(
          heat,
          heatmap.points,
          layout.displayWidth,
          layout.displayHeight,
        );
        Object.assign(heat.style, {
          position: "absolute",
          left: "0px",
          top: "0px",
          width: `${layout.displayWidth}px`,
          height: `${layout.displayHeight}px`,
          margin: "0",
          pointerEvents: "none",
          zIndex: "2",
        });
      }

      // Keep frame clipping tight to the landscape window.
      frame.style.overflow = "hidden";
      void frameH; // frame height clips vertically via CSS
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
  }, [active, hasSnapshot, heatmap]);

  if (!heatmap) {
    return <div className="route-card-skeleton" aria-hidden />;
  }

  if (!hasSnapshot) {
    return <MiniHeatmap points={heatmap.points} className="route-card-mini" />;
  }

  return (
    <div className="route-card-live-preview" ref={frameRef}>
      {/* Shared layer: DOM + heat share origin and scale; frame crops the fold. */}
      <div className="route-card-stack">
        <div className="route-card-rrweb" ref={hostRef} />
        <canvas className="route-card-heat" ref={heatRef} aria-hidden />
      </div>
    </div>
  );
}
