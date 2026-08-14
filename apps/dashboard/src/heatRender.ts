import type { HeatmapMode, HeatmapPoint } from "@pathminty/contracts";

import { drawExactHeat, drawExactHeatCompact } from "./exactHeat";
import { drawTopographicHeat, type HeatColormap } from "./topographicHeat";

const ATTENTION_MAP: HeatColormap = [
  { t: 0, c: [0, 0, 0, 0] },
  { t: 0.08, c: [56, 189, 248, 0.08] },
  { t: 0.22, c: [99, 102, 241, 0.22] },
  { t: 0.42, c: [168, 85, 247, 0.38] },
  { t: 0.62, c: [236, 72, 153, 0.52] },
  { t: 0.82, c: [251, 146, 60, 0.62] },
  { t: 1, c: [250, 204, 21, 0.72] },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function scrollColor(t: number): readonly [number, number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  // Seen by everyone → green; drop-off → amber; almost nobody → red.
  if (x > 0.75) return [34, 197, 94, 0.38];
  if (x > 0.45) {
    const local = (x - 0.45) / 0.3;
    return [
      Math.round(lerp(250, 34, local)),
      Math.round(lerp(204, 197, local)),
      Math.round(lerp(21, 94, local)),
      lerp(0.42, 0.38, local),
    ];
  }
  if (x > 0.15) {
    const local = (x - 0.15) / 0.3;
    return [
      Math.round(lerp(239, 250, local)),
      Math.round(lerp(68, 204, local)),
      Math.round(lerp(68, 21, local)),
      lerp(0.48, 0.42, local),
    ];
  }
  return [185, 28, 28, 0.5];
}

/** Fold coverage: how much traffic reached each depth. Not dots. */
export function drawScrollHeat(
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

  const rows = Math.max(48, Math.min(h, 360));
  const reach = new Float32Array(rows);
  for (const point of points) {
    const maxRow = Math.min(rows - 1, Math.max(0, Math.round(point.y * (rows - 1))));
    const weight = Math.max(0.001, point.weight);
    for (let row = 0; row <= maxRow; row += 1) {
      reach[row] = (reach[row] ?? 0) + weight;
    }
  }
  const peak = Math.max(reach[0] ?? 0, 1);

  const image = context.createImageData(w, h);
  const data = image.data;
  for (let y = 0; y < h; y += 1) {
    const row = Math.min(rows - 1, Math.round((y / (h - 1 || 1)) * (rows - 1)));
    const t = (reach[row] ?? 0) / peak;
    const [r, g, b, a] = scrollColor(t);
    const alpha = Math.round(a * 255);
    for (let x = 0; x < w; x += 1) {
      const index = (y * w + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = alpha;
    }
  }
  context.putImageData(image, 0, 0);

  // Drop-off marks at 50% and 25% remaining viewers.
  context.save();
  context.setLineDash([8, 6]);
  context.lineWidth = 1.25;
  for (const target of [0.5, 0.25]) {
    let mark = h - 1;
    for (let row = 0; row < rows; row += 1) {
      if ((reach[row] ?? 0) / peak <= target) {
        mark = Math.round((row / (rows - 1)) * (h - 1));
        break;
      }
    }
    context.strokeStyle =
      target === 0.5 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.28)";
    context.beginPath();
    context.moveTo(0, mark);
    context.lineTo(w, mark);
    context.stroke();
  }
  context.restore();
}

export function drawHeatForMode(
  canvas: HTMLCanvasElement,
  points: readonly HeatmapPoint[],
  width: number,
  height: number,
  mode: HeatmapMode,
  options: { compact?: boolean } = {},
) {
  if (mode === "scroll") {
    drawScrollHeat(canvas, points, width, height);
    return;
  }
  if (mode === "hover") {
    drawTopographicHeat(canvas, points, width, height, {
      gridWidth: options.compact ? 72 : 128,
      splatRadius: options.compact ? 8 : 14,
      blurPasses: 4,
      blurRadius: 3,
      contours: false,
      colormap: ATTENTION_MAP,
    });
    return;
  }
  if (options.compact) {
    drawExactHeatCompact(canvas, points, width, height);
    return;
  }
  drawExactHeat(canvas, points, width, height);
}

export function heatBlendMode(mode: HeatmapMode): string {
  if (mode === "hover") return "screen";
  if (mode === "scroll") return "multiply";
  return "multiply";
}

export function heatLegend(mode: HeatmapMode): { from: string; to: string } {
  if (mode === "hover") return { from: "Glance", to: "Dwell" };
  if (mode === "scroll") return { from: "Nobody", to: "Everyone saw" };
  return { from: "Quiet area", to: "Heavy clicks" };
}
