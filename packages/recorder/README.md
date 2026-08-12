# @pathminty/recorder

Storefront recording policy, sequence allocation, batching, privacy defaults, and the
theme app embed (consent-gated two-stage bundle with `@rrweb/record`).

## Library

```shell
pnpm --filter @pathminty/recorder build
pnpm --filter @pathminty/recorder test
```

## Theme extension assets (reproducible)

```shell
pnpm --filter @pathminty/recorder build:extension
```

esbuild emits two first-party IIFEs into the theme extension (Shopify hosts both on its
CDN via `asset_url` — no remote third-party CDN, no ScriptTag):

| Asset                           | Source                      | Role                                                                                                           |
| ------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pathminty-recorder-loader.js`  | `src/storefront-loader.ts`  | Schema `javascript` (~1–3 KB minified target; must stay well under Shopify’s 10 KB compressed theme-JS budget) |
| `pathminty-recorder-runtime.js` | `src/storefront-runtime.ts` | Full rrweb runtime; loaded only after consent                                                                  |

The app embed Liquid sets
`data-runtime-src="{{ 'pathminty-recorder-runtime.js' | asset_url }}"`. The loader
injects that URL only when `analyticsProcessingAllowed()` is true, never twice, and
exposes honest `data-pathminty-recorder-status` values. The runtime re-checks consent,
route blocking, and privacy masking before capture.

The legacy monolith `pathminty-recorder.js` is no longer generated and is deleted by the
build script if present. Commit the generated loader + runtime after source changes.

## Privacy

See `src/privacy.ts`, `src/loader-logic.ts`, and ADR 0006. Recording starts only after
Shopify Customer Privacy `analyticsProcessingAllowed()` is true.
