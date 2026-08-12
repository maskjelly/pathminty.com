import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("production dashboard contains no seeded fallback analytics", () => {
  it("does not import or call the dev seed endpoint from the live UI", () => {
    const live = read("./LiveDashboard.tsx");
    const api = read("./api/sessions.ts");
    const app = read("./App.tsx");

    expect(live).not.toMatch(/seedTestSessions/);
    expect(live).not.toMatch(/\/v1\/dev\/seed/);
    expect(live).not.toMatch(/Generate clearly labelled test sessions/);
    expect(api).not.toMatch(/seedTestSessions/);
    expect(api).not.toMatch(/\/v1\/dev\/seed/);
    expect(app).not.toMatch(/demoMode|sample pageviews|42,806|Heavenly/);
    expect(app).toMatch(/LiveDashboard/);
  });

  it("does not hard-code merchant analytics values in production components", () => {
    const live = read("./LiveDashboard.tsx");
    const heatmap = read("./components/HeatmapSurface.tsx");
    const replay = read("./components/ReplayViewer.tsx");
    const sources = [live, heatmap, replay].join("\n");

    for (const forbidden of [
      "sample pageviews",
      "42,806",
      "Illustrative prototype",
      "demo data",
      "wire-hero",
      "wire-grid",
      "seedTestSessions",
      "/v1/dev/seed",
    ]) {
      expect(sources).not.toContain(forbidden);
    }
  });
});
