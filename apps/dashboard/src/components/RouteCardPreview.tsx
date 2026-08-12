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
 * Site-map card preview: real rrweb page thumbnail + topographic heat overlay.
 * Falls back to MiniHeatmap when no snapshot is available.
 */
export function RouteCardPreview({
  heatmap,
  active,
}: {
  heatmap: HeatmapResponse | undefined;
  /** When false, skip expensive rrweb mount (off-screen). */
  active: boolean;
}) {
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
    const host = hostRef.current;
    const heat = heatRef.current;
    if (!host) return;

    while (host.firstChild) host.removeChild(host.firstChild);
    let replayer: Replayer | null = null;

    try {
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

      const pageW = heatmap.document?.width || heatmap.viewport?.width || 1_280;
      const pageH = Math.min(
        heatmap.document?.height || heatmap.viewport?.height || 900,
        pageW * 1.4,
      );
      const displayW = host.clientWidth || 320;
      const scale = displayW / pageW;
      const displayH = Math.max(120, Math.round(pageH * scale));

      const wrapper = host.querySelector(".replayer-wrapper");
      if (wrapper instanceof HTMLElement) {
        wrapper.style.transform = `scale(${scale})`;
        wrapper.style.transformOrigin = "top left";
        wrapper.style.left = "0";
        wrapper.style.top = "0";
        wrapper.style.position = "absolute";
      }
      const iframe = host.querySelector("iframe");
      if (iframe instanceof HTMLIFrameElement) {
        iframe.style.border = "0";
        iframe.style.width = `${pageW}px`;
        iframe.style.height = `${pageH}px`;
      }
      host.style.height = `${displayH}px`;

      if (heat) {
        drawExactHeatCompact(heat, heatmap.points, displayW, displayH);
        heat.style.width = "100%";
        heat.style.height = "100%";
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
    <div className="route-card-live-preview">
      <div className="route-card-rrweb" ref={hostRef} />
      <canvas className="route-card-heat" ref={heatRef} aria-hidden />
    </div>
  );
}
