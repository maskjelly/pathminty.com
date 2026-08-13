import { describe, expect, it } from "vitest";

import { drawHeatForMode, heatLegend } from "./heatRender";

describe("heatRender", () => {
  it("labels each mode distinctly", () => {
    expect(heatLegend("hover").to).toBe("Dwell");
    expect(heatLegend("scroll").from).toBe("Nobody");
    expect(heatLegend("click").to).toMatch(/clicks/i);
  });

  it("draws without throwing when canvas is unavailable", () => {
    const canvas = {
      width: 0,
      height: 0,
      style: { width: "", height: "", mixBlendMode: "" },
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
    expect(() =>
      drawHeatForMode(canvas, [{ x: 0.4, y: 0.6, weight: 2 }], 120, 80, "hover"),
    ).not.toThrow();
    expect(() =>
      drawHeatForMode(canvas, [{ x: 0.5, y: 0.8, weight: 1 }], 120, 80, "scroll"),
    ).not.toThrow();
  });
});
