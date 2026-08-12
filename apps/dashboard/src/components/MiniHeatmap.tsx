import type { HeatmapPoint } from "@pathminty/contracts";
import { useEffect, useRef } from "react";

import { drawTopographicHeat } from "../topographicHeat";

/** Fallback card heat when no DOM snapshot is available. */
export function MiniHeatmap({
  points,
  className,
}: {
  points: readonly HeatmapPoint[];
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = 320;
    const height = 180;
    // Soft page underlay
    const context = canvas.getContext("2d");
    if (context) {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#f3efe6";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#e7e2d6";
      context.fillRect(0, 0, width, 22);
      context.fillStyle = "#ddd7c8";
      context.fillRect(16, 40, width - 32, 14);
      context.fillRect(16, 64, (width - 32) * 0.62, 10);
    }
    // Draw heat on top into a second pass by using destination-over... 
    // Simpler: draw topo then composite underlay is hard; draw underlay then topo with clear.
    // Re-draw underlay after topo would wipe heat. Instead draw underlay then topo with globalAlpha.
    if (context && points.length > 0) {
      const heat = document.createElement("canvas");
      drawTopographicHeat(heat, points, width, height, {
        gridWidth: 64,
        blurPasses: 2,
        contours: false,
      });
      context.drawImage(heat, 0, 0);
    }
  }, [points]);

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
