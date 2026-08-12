import { describe, expect, it } from "vitest";

import {
  computeHeatmapDisplayLayout,
  heatmapRrwebWrapperPinStyles,
  isHeatmapWrapperPinnedTopLeft,
} from "./heatmapLayout";

describe("computeHeatmapDisplayLayout", () => {
  it("uses document dimensions and scales into available width", () => {
    const layout = computeHeatmapDisplayLayout(
      { width: 1_280, height: 4_000 },
      { width: 1_280, height: 800 },
      640,
    );
    expect(layout.pageWidth).toBe(1_280);
    expect(layout.pageHeight).toBe(4_000);
    expect(layout.scale).toBe(0.5);
    expect(layout.displayWidth).toBe(640);
    expect(layout.displayHeight).toBe(2_000);
  });

  it("falls back to viewport when document is missing", () => {
    const layout = computeHeatmapDisplayLayout(null, { width: 390, height: 844 }, 390);
    expect(layout.pageWidth).toBe(390);
    expect(layout.pageHeight).toBe(844);
    expect(layout.scale).toBe(1);
  });

  it("never scales above 1", () => {
    const layout = computeHeatmapDisplayLayout(
      { width: 800, height: 1_200 },
      null,
      1_600,
    );
    expect(layout.scale).toBe(1);
    expect(layout.displayWidth).toBe(800);
    expect(layout.displayHeight).toBe(1_200);
  });
});

describe("heatmap rrweb wrapper pin (rrweb-player CSS isolation)", () => {
  it("pins wrapper to top:0 left:0 without centering leftovers", () => {
    const pin = heatmapRrwebWrapperPinStyles(1_280, 3_546, 0.904_687);
    expect(isHeatmapWrapperPinnedTopLeft(pin)).toBe(true);
    expect(pin.left).toBe("0px");
    expect(pin.top).toBe("0px");
    expect(pin.float).toBe("none");
    expect(pin.transform).toBe("scale(0.904687)");
    expect(pin.width).toBe("1280px");
    expect(pin.height).toBe("3546px");
  });

  it("fails the pin check when rrweb-player centering is retained", () => {
    // Regression: global rrweb-player CSS uses left:50%; top:50%; float:left.
    const centered = {
      ...heatmapRrwebWrapperPinStyles(1_280, 3_546, 0.9),
      left: "50%",
      top: "50%",
      float: "left",
    };
    expect(isHeatmapWrapperPinnedTopLeft(centered)).toBe(false);
  });
});
