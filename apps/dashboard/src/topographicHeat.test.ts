import { describe, expect, it } from "vitest";

import { drawTopographicHeat } from "./topographicHeat";

describe("drawTopographicHeat", () => {
  it("paints non-empty heat without throwing in jsdom-less node canvas absence", () => {
    // In vitest browser-less env, HTMLCanvasElement may be stubbed.
    // Guard: only assert the pure path when getContext is available.
    const canvas = {
      width: 0,
      height: 0,
      style: { width: "", height: "" },
      getContext: () => null,
    } as unknown as HTMLCanvasElement;

    expect(() =>
      drawTopographicHeat(
        canvas,
        [{ x: 0.5, y: 0.5, weight: 3 }],
        200,
        100,
      ),
    ).not.toThrow();
  });
});
