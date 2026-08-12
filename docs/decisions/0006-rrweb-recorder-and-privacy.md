# ADR 0006 — First-party rrweb recorder and privacy model

## Status

Accepted

## Context

The first PathMinty capture path recorded only normalized pointer coordinates and drew
them on an empty wireframe. Merchants need heatmaps over the real storefront page and
visual session replays that reconstruct DOM, layout, scrolling, and pointer behaviour.

Raw event streams are large and sensitive. They must stay out of Postgres, remain
strictly shop-scoped, and never include form values, account/checkout DOM, or PII.

## Decision

1. **Capture format** — Storefront recording uses a first-party two-stage theme asset
   build from `packages/recorder/scripts/build-extension.mjs` (esbuild IIFE):
   - **Loader** (`pathminty-recorder-loader.js`) — schema JS, consent-gated, ≪ 10 KB
     minified (Shopify theme-JS compressed budget is 10 KB).
   - **Runtime** (`pathminty-recorder-runtime.js`) — full `@rrweb/record` / `rrweb`
     pipeline, URL injected via Liquid `asset_url` (Shopify CDN only). No remote
     third-party CDN and no Admin ScriptTag. The runtime re-checks consent, route
     blocking, and privacy masking before capture.

2. **Transport contract** — Replay batches use `encoding: "rrweb"` with a bounded array
   of rrweb events (`type`, `data`, `timestamp`). Legacy `encoding: "json"` coordinate
   events remain only for automated test seeds.

3. **Object keys** — R2 chunk keys are
   `replays/v1/{shopId}/{sessionId}/chunks/{sequence:08d}_{batchId}.json`. Sequence is
   allocated in `sessionStorage` before upload and never resets on navigation. Including
   `batchId` prevents pagehide races from overwriting a different batch if a sequence
   were ever reused; retries must reuse the same sequence + batchId.

4. **Live summaries** — Every accepted batch enqueues a `SessionSummaryJob`. The
   analytics worker rewrites the session summary so hover-only or still-active sessions
   appear in the dashboard within one poll interval. `active` vs `ended` is inferred
   from last activity and an idle timeout, not only from a perfect final browser
   request.

5. **Privacy defaults**
   - Start only when Shopify Customer Privacy `analyticsProcessingAllowed()` is true
     after loading `consent-tracking-api` via `Shopify.loadFeatures`.
   - Mask all inputs/textareas/selects and block `[data-pathminty-private]` plus common
     payment/password selectors.
   - Do not record cross-origin iframe contents.
   - Do not record `/account`, `/checkout`, `/checkouts`, `/orders`, password, or auth
     routes; those stay as coarse pixel route events only where Shopify allows.
   - Strip query strings and fragments from recorded routes.
   - Never log replay bodies, tokens, cookies, or raw webhook payloads.

6. **Merchant surfaces** — Dashboard primary navigation is Heatmaps and Recordings only.
   Heatmaps reconstruct a representative full snapshot and overlay canvas density.
   Replays use locally bundled `rrweb-player` in a sandboxed surface without executing
   storefront scripts. Test/seed sessions are hidden from the live UI by default.

## Transport limits

- **Hard body limit:** `MAX_REPLAY_BATCH_BYTES = 2 MiB` on collector and recorder.
  Cloudflare Workers safely accept multi-MiB bodies; this admits large Shopify full-DOM
  rrweb snapshots while remaining bounded.
- **Soft packing:** recorder flushes around 512 KiB of event payload / 80 events so the
  JSON envelope still fits under the hard limit.
- **Keepalive:** browser `fetch({ keepalive: true })` is only used when the full body is
  ≤ `KEEPALIVE_MAX_BODY_BYTES` (60 KiB). Larger batches (including most FullSnapshots)
  upload without keepalive so they are not silently truncated or wedged.
- Permanently oversized batches (above the hard limit) are dropped as an explicit
  incomplete recording path and do not poison later sequence uploads. Transient network
  failures still retry with the same sequence + batchId.

## Coordinate model

rrweb 2.1.1 mouse/touch `x`/`y` are **client** coordinates. PathMinty converts to page
space as `page = client + currentScroll` and normalizes against captured **document**
dimensions for full-page heatmaps (not the viewport alone).

## Consequences

- Theme deploy must run `pnpm --filter @pathminty/recorder build:extension` so the
  extension ships both the tiny loader and the rrweb runtime assets.
- Summaries are eventually consistent with queue lag; the UI polls about every 15s.
- External images/fonts may fail to load during reconstruction; the captured DOM remains
  genuine and a non-blocking asset warning is acceptable.
- Legacy coordinate-only sessions surface as `Recording incomplete` rather than a fake
  page preview.
- Heatmap overlays require a genuine full snapshot; interactions without a snapshot show
  an explicit unavailable state (no invented page background).
