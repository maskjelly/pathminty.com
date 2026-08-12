import type { HeatmapResponse } from "@pathminty/contracts";
import { useEffect, useRef, useState } from "react";
import { Replayer, type eventWithTime } from "rrweb";
import "rrweb/dist/style.css";

import { drawExactHeatCompact } from "../exactHeat";
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

/**
 * Card preview: real page snapshot scaled into a fixed frame, with exact heat
 * drawn in the same coordinate space (so clicks stay on the right elements).
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
      const frameW = Math.max(1, frame.clientWidth || 280);
      const frameH = Math.max(1, frame.clientHeight || 150);
      const pageW = Math.max(
        1,
        heatmap.document?.width || heatmap.viewport?.width || 1_280,
      );
      // Use full document height so heat y-coords match the reconstructed page.
      const pageH = Math.max(
        1,
        heatmap.document?.height || heatmap.viewport?.height || 900,
      );

      // Contain: entire page fits in the frame; letterbox if needed.
      const scale = Math.min(frameW / pageW, frameH / pageH);
      const scaledW = Math.max(1, Math.round(pageW * scale));
      const scaledH = Math.max(1, Math.round(pageH * scale));
      const offsetX = Math.round((frameW - scaledW) / 2);
      const offsetY = Math.round((frameH - scaledH) / 2);

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
      host.style.width = `${frameW}px`;
      host.style.height = `${frameH}px`;
      host.style.overflow = "hidden";
      host.style.margin = "0";

      const wrapper = host.querySelector(".replayer-wrapper");
      if (wrapper instanceof HTMLElement) {
        Object.assign(wrapper.style, {
          position: "absolute",
          left: `${offsetX}px`,
          top: `${offsetY}px`,
          right: "auto",
          bottom: "auto",
          float: "none",
          margin: "0",
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          width: `${pageW}px`,
          height: `${pageH}px`,
        });
      }
      const iframe = host.querySelector("iframe");
      if (iframe instanceof HTMLIFrameElement) {
        Object.assign(iframe.style, {
          position: "absolute",
          left: "0",
          top: "0",
          margin: "0",
          border: "0",
          width: `${pageW}px`,
          height: `${pageH}px`,
        });
      }

      if (heat) {
        drawExactHeatCompact(heat, heatmap.points, scaledW, scaledH);
        Object.assign(heat.style, {
          position: "absolute",
          left: `${offsetX}px`,
          top: `${offsetY}px`,
          width: `${scaledW}px`,
          height: `${scaledH}px`,
          pointerEvents: "none",
        });
      }
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
      <div className="route-card-rrweb" ref={hostRef} />
      <canvas className="route-card-heat" ref={heatRef} aria-hidden />
    </div>
  );
}
