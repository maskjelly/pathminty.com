import type { HeatmapPoint } from "@pathminty/contracts";

/**
 * Topographic density heat: splat → blur → multi-stop colormap.
 * Shared by full HeatmapSurface and route-card previews.
 */

type Rgba = readonly [number, number, number, number];

/** Cool → warm → hot (readable over light storefront pages). */
const COLORMAP: ReadonlyArray<{ t: number; c: Rgba }> = [
  { t: 0, c: [0, 0, 0, 0] },
  { t: 0.08, c: [59, 130, 246, 0.12] },
  { t: 0.22, c: [34, 197, 94, 0.28] },
  { t: 0.4, c: [250, 204, 21, 0.45] },
  { t: 0.58, c: [249, 115, 22, 0.62] },
  { t: 0.75, c: [239, 68, 68, 0.78] },
  { t: 1, c: [127, 29, 29, 0.92] },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function sampleColormap(t: number): Rgba {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < COLORMAP.length; i += 1) {
    const left = COLORMAP[i - 1];
    const right = COLORMAP[i];
    if (!left || !right) continue;
    if (x <= right.t) {
      const local = (x - left.t) / Math.max(1e-6, right.t - left.t);
      return [
        Math.round(lerp(left.c[0], right.c[0], local)),
        Math.round(lerp(left.c[1], right.c[1], local)),
        Math.round(lerp(left.c[2], right.c[2], local)),
        lerp(left.c[3], right.c[3], local),
      ];
    }
  }
  return COLORMAP.at(-1)?.c ?? [0, 0, 0, 0];
}

/** Separable box blur (approx Gaussian when repeated). */
function boxBlur(field: Float32Array, width: number, height: number, radius: number) {
  if (radius <= 0) return;
  const tmp = new Float32Array(field.length);
  const span = radius * 2 + 1;

  // Horizontal
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) {
      const cx = Math.min(width - 1, Math.max(0, x));
      sum += field[y * width + cx] ?? 0;
    }
    for (let x = 0; x < width; x += 1) {
      tmp[y * width + x] = sum / span;
      const leave = Math.min(width - 1, Math.max(0, x - radius));
      const enter = Math.min(width - 1, Math.max(0, x + radius + 1));
      sum += (field[y * width + enter] ?? 0) - (field[y * width + leave] ?? 0);
    }
  }

  // Vertical
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) {
      const cy = Math.min(height - 1, Math.max(0, y));
      sum += tmp[cy * width + x] ?? 0;
    }
    for (let y = 0; y < height; y += 1) {
      field[y * width + x] = sum / span;
      const leave = Math.min(height - 1, Math.max(0, y - radius));
      const enter = Math.min(height - 1, Math.max(0, y + radius + 1));
      sum += (tmp[enter * width + x] ?? 0) - (tmp[leave * width + x] ?? 0);
    }
  }
}

function splat(
  field: Float32Array,
  gridW: number,
  gridH: number,
  points: readonly HeatmapPoint[],
  radius: number,
) {
  for (const point of points) {
    const cx = point.x * (gridW - 1);
    const cy = point.y * (gridH - 1);
    const weight = Math.max(0.001, point.weight);
    const r = radius;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(gridW - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(gridH - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        // Soft kernel
        const falloff = Math.exp((-d2 / r2) * 2.2);
        const index = y * gridW + x;
        field[index] = (field[index] ?? 0) + weight * falloff;
      }
    }
  }
}

export type TopographicHeatOptions = {
  /** Low-res field width (height derived from canvas aspect). */
  gridWidth?: number;
  blurPasses?: number;
  blurRadius?: number;
  splatRadius?: number;
  /** Draw faint iso-lines for topo feel. */
  contours?: boolean;
};

/**
 * Paint topographic heat onto a canvas sized to `width`×`height` CSS/backing pixels.
 */
export function drawTopographicHeat(
  canvas: HTMLCanvasElement,
  points: readonly HeatmapPoint[],
  width: number,
  height: number,
  options: TopographicHeatOptions = {},
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
  if (points.length === 0 || w < 2 || h < 2) return;

  const gridW = Math.min(160, Math.max(48, options.gridWidth ?? 96));
  const gridH = Math.max(32, Math.round(gridW * (h / w)));
  const field = new Float32Array(gridW * gridH);
  const splatRadius = options.splatRadius ?? Math.max(3, gridW * 0.045);
  splat(field, gridW, gridH, points, splatRadius);

  const passes = options.blurPasses ?? 3;
  const blurRadius = options.blurRadius ?? 2;
  for (let i = 0; i < passes; i += 1) {
    boxBlur(field, gridW, gridH, blurRadius);
  }

  let max = 0;
  for (let i = 0; i < field.length; i += 1) {
    max = Math.max(max, field[i] ?? 0);
  }
  if (max <= 0) return;

  // Upscale field to canvas with bilinear sampling into ImageData.
  const image = context.createImageData(w, h);
  const data = image.data;
  for (let y = 0; y < h; y += 1) {
    const gy = (y / (h - 1 || 1)) * (gridH - 1);
    const y0 = Math.floor(gy);
    const y1 = Math.min(gridH - 1, y0 + 1);
    const fy = gy - y0;
    for (let x = 0; x < w; x += 1) {
      const gx = (x / (w - 1 || 1)) * (gridW - 1);
      const x0 = Math.floor(gx);
      const x1 = Math.min(gridW - 1, x0 + 1);
      const fx = gx - x0;
      const v00 = field[y0 * gridW + x0] ?? 0;
      const v10 = field[y0 * gridW + x1] ?? 0;
      const v01 = field[y1 * gridW + x0] ?? 0;
      const v11 = field[y1 * gridW + x1] ?? 0;
      const v0 = lerp(v00, v10, fx);
      const v1 = lerp(v01, v11, fx);
      const value = lerp(v0, v1, fy) / max;
      // Gamma for punchier hot spots
      const t = Math.pow(value, 0.72);
      if (t < 0.02) continue;
      const [r, g, b, a] = sampleColormap(t);
      const index = (y * w + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = Math.round(a * 255);
    }
  }
  context.putImageData(image, 0, 0);

  if (options.contours !== false) {
    // Soft contour strokes on a few iso levels.
    context.save();
    context.globalCompositeOperation = "soft-light";
    context.lineWidth = 1;
    const levels = [0.25, 0.45, 0.65, 0.85];
    for (const level of levels) {
      context.beginPath();
      context.strokeStyle = `rgba(255, 255, 255, ${0.08 + level * 0.1})`;
      for (let y = 1; y < gridH - 1; y += 1) {
        for (let x = 1; x < gridW - 1; x += 1) {
          const v = (field[y * gridW + x] ?? 0) / max;
          const right = (field[y * gridW + x + 1] ?? 0) / max;
          const down = (field[(y + 1) * gridW + x] ?? 0) / max;
          const px = (x / (gridW - 1)) * w;
          const py = (y / (gridH - 1)) * h;
          if ((v - level) * (right - level) < 0) {
            context.moveTo(px, py);
            context.lineTo(((x + 1) / (gridW - 1)) * w, py);
          }
          if ((v - level) * (down - level) < 0) {
            context.moveTo(px, py);
            context.lineTo(px, ((y + 1) / (gridH - 1)) * h);
          }
        }
      }
      context.stroke();
    }
    context.restore();
  }
}
