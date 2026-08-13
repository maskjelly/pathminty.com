import type { HeatmapPoint } from "@pathminty/contracts";

/**
 * Exact click/hover heat: one radial blob per point at its normalized (x,y).
 * Does not smear density across the page — merchants see where people actually clicked.
 */
export function drawExactHeat(
  canvas: HTMLCanvasElement,
  points: readonly HeatmapPoint[],
  width: number,
  height: number,
  options: { additive?: boolean; scale?: number } = {},
) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (!options.additive) {
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    context.clearRect(0, 0, w, h);
  }
  if (points.length === 0) return;

  const scale = options.scale ?? 1;
  const maxWeight = Math.max(...points.map((point) => point.weight), 1);
  if (options.additive) context.globalCompositeOperation = "lighter";
  for (const point of points) {
    const x = point.x * w;
    const y = point.y * h;
    const radius = (16 + (point.weight / maxWeight) * 26) * scale;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    const alpha =
      (0.22 + (point.weight / maxWeight) * 0.5) * (options.additive ? 0.55 : 1);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.85})`);
    gradient.addColorStop(0.18, `rgba(222, 34, 21, ${alpha})`);
    gradient.addColorStop(0.48, `rgba(255, 129, 23, ${alpha * 0.7})`);
    gradient.addColorStop(1, "rgba(255, 221, 53, 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  if (options.additive) context.globalCompositeOperation = "source-over";
}

/** Smaller radius for site-canvas card previews. */
export function drawExactHeatCompact(
  canvas: HTMLCanvasElement,
  points: readonly HeatmapPoint[],
  width: number,
  height: number,
) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  context.clearRect(0, 0, w, h);
  if (points.length === 0) return;

  const maxWeight = Math.max(...points.map((point) => point.weight), 1);
  for (const point of points) {
    const x = point.x * w;
    const y = point.y * h;
    const radius = 8 + (point.weight / maxWeight) * 14;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    const alpha = 0.3 + (point.weight / maxWeight) * 0.55;
    gradient.addColorStop(0, `rgba(222, 34, 21, ${alpha})`);
    gradient.addColorStop(0.4, `rgba(255, 129, 23, ${alpha * 0.7})`);
    gradient.addColorStop(1, "rgba(255, 221, 53, 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}
