import type { HeatmapMode, HeatmapPoint } from "@pathminty/contracts";
import { useEffect, useRef } from "react";

import { drawHeatForMode } from "../heatRender";

/** Fallback storefront when no DOM snapshot is available. */
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
    const width = 960;
    const height = 700;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#111111";
    context.fillRect(0, 0, width, 56);
    context.fillStyle = "#2a2a2a";
    context.fillRect(28, 18, 92, 18);
    context.fillStyle = "#3a3a3a";
    for (let i = 0; i < 4; i += 1) {
      context.fillRect(width - 280 + i * 64, 22, 40, 12);
    }
    context.fillStyle = "#f4f4f4";
    context.fillRect(0, 56, width, 280);
    context.fillStyle = "#e8e8e8";
    context.fillRect(80, 120, width - 160, 28);
    context.fillRect(180, 164, width - 360, 16);
    context.fillStyle = "#eeeeee";
    const cardW = (width - 160) / 3;
    for (let i = 0; i < 3; i += 1) {
      context.fillRect(48 + i * (cardW + 16), 380, cardW, 220);
    }
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
