import type { HeatmapPoint } from "@pathminty/contracts";

/** Bloom only when several clicks land in the same spot. */
export function clickShouldBloom(weight: number, maxWeight: number) {
  return weight >= 4 || (maxWeight >= 8 && weight >= maxWeight * 0.4);
}

function paintClicks(
  context: CanvasRenderingContext2D,
  points: readonly HeatmapPoint[],
  width: number,
  height: number,
  compact: boolean,
) {
  const maxWeight = Math.max(...points.map((point) => point.weight), 1);
  const pin = compact ? 3.4 : 5.2;

  for (const point of points) {
    const x = point.x * width;
    const y = point.y * height;
    const bloom = clickShouldBloom(point.weight, maxWeight);
    if (!bloom) {
      context.beginPath();
      context.fillStyle = "rgba(220, 38, 38, 0.92)";
      context.arc(x, y, pin, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.strokeStyle = "rgba(255, 255, 255, 0.85)";
      context.lineWidth = compact ? 1 : 1.25;
      context.arc(x, y, pin, 0, Math.PI * 2);
      context.stroke();
      continue;
    }

    const t = point.weight / maxWeight;
    const radius = (compact ? 10 : 16) + t * (compact ? 18 : 34);
    const alpha = 0.28 + t * 0.45;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.7})`);
    gradient.addColorStop(0.16, `rgba(220, 38, 38, ${alpha})`);
    gradient.addColorStop(0.5, `rgba(249, 115, 22, ${alpha * 0.65})`);
    gradient.addColorStop(1, "rgba(250, 204, 21, 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.fillStyle = "rgba(185, 28, 28, 0.95)";
    context.arc(x, y, pin * 0.85, 0, Math.PI * 2);
    context.fill();
  }
}

/**
 * Precise click marks. Isolated clicks stay tight; volume blooms.
 */
export function drawExactHeat(
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
  paintClicks(context, points, w, h, false);
}

/** Smaller marks for site-canvas frames. */
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
  paintClicks(context, points, w, h, true);
}
