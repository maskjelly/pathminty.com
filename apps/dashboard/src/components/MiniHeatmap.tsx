import type { HeatmapMode, HeatmapPoint } from "@pathminty/contracts";
import { useEffect, useRef } from "react";

import { drawHeatForMode } from "../heatRender";

/** Fallback card heat when no DOM snapshot is available. */
export function MiniHeatmap({
  points,
  mode = "click",
  className,
}: {
  points: readonly HeatmapPoint[];
  mode?: HeatmapMode;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = 320;
    const height = 180;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#f3efe6";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#e7e2d6";
    context.fillRect(0, 0, width, 22);
    context.fillStyle = "#ddd7c8";
    context.fillRect(16, 40, width - 32, 14);
    context.fillRect(16, 64, (width - 32) * 0.62, 10);
    if (points.length > 0) {
      const heat = document.createElement("canvas");
      drawHeatForMode(heat, [...points], width, height, mode, { compact: true });
      context.drawImage(heat, 0, 0);
    }
  }, [mode, points]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden
      width={320}
      height={180}
    />
  );
}
