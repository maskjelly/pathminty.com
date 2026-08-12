import type { HeatmapPoint } from "@pathminty/contracts";
import { useEffect, useRef } from "react";

/** Lightweight points-only canvas for site-map route cards. */
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
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#f3efe6";
    context.fillRect(0, 0, width, height);

    // Soft page chrome so empty cards still look like storefront thumbnails.
    context.fillStyle = "#e7e2d6";
    context.fillRect(0, 0, width, 22);
    context.fillStyle = "#ddd7c8";
    context.fillRect(16, 40, width - 32, 14);
    context.fillRect(16, 64, (width - 32) * 0.62, 10);

    if (points.length === 0) return;
    const maxWeight = Math.max(...points.map((point) => point.weight), 1);
    for (const point of points) {
      const x = point.x * width;
      const y = point.y * height;
      const radius = 10 + (point.weight / maxWeight) * 18;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      const alpha = 0.28 + (point.weight / maxWeight) * 0.55;
      gradient.addColorStop(0, `rgba(222, 34, 21, ${alpha})`);
      gradient.addColorStop(0.4, `rgba(255, 129, 23, ${alpha * 0.7})`);
      gradient.addColorStop(1, "rgba(255, 221, 53, 0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
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
