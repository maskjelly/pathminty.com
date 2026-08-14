import type { HeatmapPoint } from "@pathminty/contracts";

import { drawTopographicHeat, type HeatColormap } from "./topographicHeat";

const CLICK_DENSITY_MAP: HeatColormap = [
  { t: 0, c: [0, 0, 0, 0] },
  { t: 0.08, c: [254, 215, 170, 0.1] },
  { t: 0.22, c: [253, 186, 116, 0.22] },
  { t: 0.4, c: [251, 146, 60, 0.38] },
  { t: 0.58, c: [249, 115, 22, 0.52] },
  { t: 0.76, c: [220, 38, 38, 0.66] },
  { t: 1, c: [127, 29, 29, 0.8] },
];

/** Only the heaviest cells get a hotspot mark. Never one mark per visitor. */
export function clickShouldBloom(weight: number, maxWeight: number) {
  return weight >= 4 || (maxWeight >= 8 && weight >= maxWeight * 0.4);
}

export function pickClickHotspots(
  points: readonly HeatmapPoint[],
  limit = 6,
): HeatmapPoint[] {
  if (points.length === 0) return [];
  const maxWeight = Math.max(...points.map((point) => point.weight), 1);
  return [...points]
    .sort((left, right) => right.weight - left.weight)
    .filter((point) => clickShouldBloom(point.weight, maxWeight))
    .slice(0, limit);
}

function paintHotspots(
  context: CanvasRenderingContext2D,
  points: readonly HeatmapPoint[],
  width: number,
  height: number,
  compact: boolean,
) {
  const hotspots = pickClickHotspots(points);
  if (hotspots.length === 0) return;
  const maxWeight = Math.max(...hotspots.map((point) => point.weight), 1);
  const pin = compact ? 3.2 : 4.6;

  for (const point of hotspots) {
    const x = point.x * width;
    const y = point.y * height;
    const t = point.weight / maxWeight;
    const radius = (compact ? 12 : 18) + t * (compact ? 16 : 28);
    const alpha = 0.3 + t * 0.4;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.65})`);
    gradient.addColorStop(0.18, `rgba(220, 38, 38, ${alpha})`);
    gradient.addColorStop(0.55, `rgba(249, 115, 22, ${alpha * 0.55})`);
    gradient.addColorStop(1, "rgba(250, 204, 21, 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.fillStyle = "rgba(185, 28, 28, 0.92)";
    context.arc(x, y, pin, 0, Math.PI * 2);
    context.fill();
  }
}

/**
 * Weighted click density. Isolated visits fade into the field; volume blooms.
 */
export function drawExactHeat(
  canvas: HTMLCanvasElement,
  points: readonly HeatmapPoint[],
  width: number,
  height: number,
) {
  drawTopographicHeat(canvas, points, width, height, {
    gridWidth: 112,
    splatRadius: 10,
    blurPasses: 3,
    blurRadius: 2,
    contours: false,
    colormap: CLICK_DENSITY_MAP,
  });
  const context = canvas.getContext("2d");
  if (!context || points.length === 0) return;
  paintHotspots(context, points, canvas.width, canvas.height, false);
}

/** Smaller density field for site-canvas frames. */
export function drawExactHeatCompact(
  canvas: HTMLCanvasElement,
  points: readonly HeatmapPoint[],
  width: number,
  height: number,
) {
  drawTopographicHeat(canvas, points, width, height, {
    gridWidth: 64,
    splatRadius: 7,
    blurPasses: 3,
    blurRadius: 2,
    contours: false,
    colormap: CLICK_DENSITY_MAP,
  });
  const context = canvas.getContext("2d");
  if (!context || points.length === 0) return;
  paintHotspots(context, points, canvas.width, canvas.height, true);
}
