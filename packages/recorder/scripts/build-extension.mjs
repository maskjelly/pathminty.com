/**
 * Reproducible theme extension asset build (two-stage, first-party only).
 *
 * Emits:
 *   pathminty-recorder-loader.js   — tiny consent-gated loader (theme schema JS)
 *   pathminty-recorder-runtime.js  — full rrweb runtime (Shopify CDN asset_url)
 *
 * Removes the legacy monolith pathminty-recorder.js if present.
 *
 * Run: pnpm --filter @pathminty/recorder build:extension
 */
import * as esbuild from "esbuild";
import { existsSync, unlinkSync } from "node:fs";
import { log } from "node:console";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(
  here,
  "../../../apps/shopify-gateway/extensions/pathminty-recorder/assets",
);

const targets = [
  {
    entry: resolve(here, "../src/storefront-loader.ts"),
    outfile: resolve(assetsDir, "pathminty-recorder-loader.js"),
    label: "loader",
  },
  {
    entry: resolve(here, "../src/storefront-runtime.ts"),
    outfile: resolve(assetsDir, "pathminty-recorder-runtime.js"),
    label: "runtime",
  },
];

const legacyMonolith = resolve(assetsDir, "pathminty-recorder.js");

let failed = false;

for (const target of targets) {
  const result = await esbuild.build({
    entryPoints: [target.entry],
    bundle: true,
    outfile: target.outfile,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    sourcemap: false,
    legalComments: "none",
    logLevel: "info",
    // First-party only — no remote CDN at runtime.
    packages: "bundle",
  });

  if (result.errors.length > 0) {
    failed = true;
    log(`Failed to build ${target.label}`);
  } else {
    log(`Wrote ${target.outfile}`);
  }
}

if (existsSync(legacyMonolith)) {
  unlinkSync(legacyMonolith);
  log(`Removed legacy monolith ${legacyMonolith}`);
}

if (failed) {
  process.exitCode = 1;
} else {
  log(
    "Theme assets: loader (schema JS, target ≪ 10KB minified) + runtime (Shopify asset_url CDN).",
  );
}
