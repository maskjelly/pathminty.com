import type { DocumentSize, HeatmapResponse, RrwebEvent } from "@pathminty/contracts";
import { useEffect, useRef } from "react";
import { Replayer, type eventWithTime } from "rrweb";
import "rrweb/dist/style.css";

import { drawHeatForMode, heatBlendMode, heatLegend } from "../heatRender";
import {
  computeHeatmapDisplayLayout,
  heatmapRrwebWrapperPinStyles,
} from "../heatmapLayout";

function drawHeatLayer(
  canvas: HTMLCanvasElement,
  heatmap: HeatmapResponse,
  width: number,
  height: number,
) {
  drawHeatForMode(canvas, [...heatmap.points], width, height, heatmap.mode);
  canvas.style.mixBlendMode = heatBlendMode(heatmap.mode);
}

function toRrwebEvents(events: readonly RrwebEvent[]): eventWithTime[] {
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

function sizeRrwebSurface(
  host: HTMLElement,
  pageWidth: number,
  pageHeight: number,
  scale: number,
  displayWidth: number,
  displayHeight: number,
): void {
  const wrapper = host.querySelector(".replayer-wrapper");
  if (wrapper instanceof HTMLElement) {
    // Neutralize global rrweb-player centering (left/top 50%, float:left) so the
    // reconstructed DOM is pinned to the heatmap stage top-left.
    Object.assign(
      wrapper.style,
      heatmapRrwebWrapperPinStyles(pageWidth, pageHeight, scale),
    );
  }
  const iframe = host.querySelector("iframe");
  if (iframe instanceof HTMLIFrameElement) {
    iframe.style.position = "absolute";
    iframe.style.left = "0px";
    iframe.style.top = "0px";
    iframe.style.margin = "0px";
    iframe.style.border = "0";
    iframe.style.display = "block";
    iframe.style.width = `${pageWidth}px`;
    iframe.style.height = `${pageHeight}px`;
  }
  host.style.position = "relative";
  host.style.width = `${displayWidth}px`;
  host.style.height = `${displayHeight}px`;
  host.style.overflow = "hidden";
}

function SnapshotStage({
  events,
  documentSize,
  viewport,
  onLayout,
}: {
  events: RrwebEvent[];
  documentSize: DocumentSize | null;
  viewport: HeatmapResponse["viewport"];
  onLayout: (size: { width: number; height: number }) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;

  useEffect(() => {
    const host = rootRef.current;
    if (!host || events.length < 2) return;

    while (host.firstChild) {
      host.removeChild(host.firstChild);
    }

    let replayer: Replayer | null = null;
    try {
      replayer = new Replayer(toRrwebEvents(events), {
        root: host,
        loadTimeout: 2_000,
        showWarning: false,
        blockClass: "pathminty-block",
        liveMode: false,
        insertStyleRules: [],
        mouseTail: false,
        UNSAFE_replayCanvas: false,
        useVirtualDom: false,
      });
      replayer.pause(0);

      const layout = computeHeatmapDisplayLayout(
        documentSize,
        viewport,
        Math.max(1, host.clientWidth || documentSize?.width || 1_280),
      );
      sizeRrwebSurface(
        host,
        layout.pageWidth,
        layout.pageHeight,
        layout.scale,
        layout.displayWidth,
        layout.displayHeight,
      );
      onLayoutRef.current({
        width: layout.displayWidth,
        height: layout.displayHeight,
      });
    } catch {
      while (host.firstChild) {
        host.removeChild(host.firstChild);
      }
      const notice = document.createElement("div");
      notice.className = "heatmap-snapshot-error";
      notice.textContent = "Unable to reconstruct the captured page snapshot.";
      host.appendChild(notice);
      onLayoutRef.current({ width: 0, height: 0 });
    }

    return () => {
      try {
        replayer?.destroy();
      } catch {
        // ignore
      }
      while (host.firstChild) {
        host.removeChild(host.firstChild);
      }
    };
  }, [events, documentSize, viewport]);

  return <div className="heatmap-snapshot-root" ref={rootRef} />;
}

export function HeatmapSurface({
  heatmap,
  loading,
}: {
  heatmap: HeatmapResponse | null;
  loading: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmap || heatmap.status !== "ok") return;
    if (layoutRef.current.width <= 0 || layoutRef.current.height <= 0) return;

    drawHeatLayer(canvas, heatmap, layoutRef.current.width, layoutRef.current.height);
  }, [heatmap]);

  if (loading) {
    return (
      <section className="live-heatmap">
        <div className="replay-loading" role="status">
          Loading heatmap…
        </div>
      </section>
    );
  }

  if (!heatmap || heatmap.status === "empty") {
    return (
      <section className="live-heatmap live-heatmap-empty">
        <div className="live-empty embedded-empty">
          <p>No interactions yet</p>
          <h2>No heatmap data for this selection</h2>
          <p>
            Heatmaps appear after real storefront sessions record clicks or pointer
            movement on the selected route.
          </p>
        </div>
      </section>
    );
  }

  if (
    heatmap.status === "interactions_without_snapshot" ||
    !heatmap.snapshotEvents ||
    heatmap.snapshotEvents.length < 2
  ) {
    return (
      <section className="live-heatmap">
        <div className="live-browser-bar">
          <i />
          <i />
          <i />
          <span>{heatmap.route}</span>
        </div>
        <div className="heatmap-no-snapshot" role="status">
          <strong>Full-page reconstruction unavailable</strong>
          <p>
            {heatmap.eventCount} real interactions were recorded for this route, but no
            genuine full-page DOM snapshot is available to anchor the heat layer. No
            background is invented.
          </p>
        </div>
        <div className="heatmap-footer">
          <p>
            {heatmap.eventCount}{" "}
            {heatmap.mode === "click"
              ? "clicks"
              : heatmap.mode === "scroll"
                ? "scroll samples"
                : "attention samples"}{" "}
            · {heatmap.sessionCount} sessions
            {heatmap.document
              ? ` · document ${heatmap.document.width}×${heatmap.document.height}`
              : ""}
          </p>
        </div>
      </section>
    );
  }

  const maxWeight = Math.max(...heatmap.points.map((point) => point.weight), 1);

  return (
    <section className="live-heatmap">
      <div className="live-browser-bar">
        <i />
        <i />
        <i />
        <span>{heatmap.route}</span>
      </div>
      <div className="heatmap-stage" ref={stageRef}>
        <SnapshotStage
          events={heatmap.snapshotEvents}
          documentSize={heatmap.document}
          viewport={heatmap.viewport}
          onLayout={(size) => {
            layoutRef.current = size;
            const canvas = canvasRef.current;
            if (!canvas || size.width <= 0 || size.height <= 0) return;
            drawHeatLayer(canvas, heatmap, size.width, size.height);
          }}
        />
        <canvas aria-hidden="true" className="heatmap-canvas" ref={canvasRef} />
      </div>
      <div className="heatmap-footer">
        <div className="heatmap-legend" aria-label="Intensity" data-mode={heatmap.mode}>
          <span>{heatLegend(heatmap.mode).from}</span>
          <i />
          <span>{heatLegend(heatmap.mode).to}</span>
        </div>
        <p>
          {heatmap.eventCount}{" "}
          {heatmap.mode === "click"
            ? "clicks"
            : heatmap.mode === "scroll"
              ? "scroll samples"
              : "attention samples"}{" "}
          · {heatmap.sessionCount} sessions
          {heatmap.document
            ? ` · page ${heatmap.document.width}×${heatmap.document.height}`
            : ""}
          {maxWeight > 1 ? ` · peak weight ${maxWeight}` : ""}
        </p>
      </div>
    </section>
  );
}
