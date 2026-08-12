# PathMinty: implement the two real core features

You are the primary implementation agent inside `/Users/smol/dev/pathminty.com`.
Work directly in this repository. Read `AGENTS.md` first and obey it. Inspect the full
relevant implementation before editing. Do not deploy anything; the supervising agent
will review and deploy after your work passes locally.

## Product truth

The current implementation is not acceptable. It records a few coordinates, draws them
on an empty canvas, mixes in seeded test data, and calls that a replay/heatmap. Replace
that thin demo with a real first-party MVP focused on exactly two merchant features:

1. Heatmaps rendered over the actual captured storefront page.
2. Visual session replays that reconstruct the storefront and play customer behavior in
   a screen-recording-like timeline.

Do not work on journeys, revenue paths, audiences, AI insights, or other product areas.
Hide/remove those unfinished navigation surfaces from the merchant UI for now.

## Non-negotiable behavior

- Never display fabricated fallback routes, metrics, page mockups, sessions, clicks,
  screenshots, or replay frames.
- Remove seeded/test sessions from the default merchant experience. A dev-only seed
  endpoint may remain for automated tests, but the live UI must never silently call it
  and must hide test data by default.
- When real data is absent, show a crisp honest empty state explaining how to create the
  first recording.
- When a capture cannot be reconstructed, show `Recording incomplete` with the concrete
  reason. Never fall back to a blank canvas with fake values.
- Every record, object key, query, and API response remains strictly scoped by `shopId`.
- Never capture or log input values, textarea values, select values, passwords, payment
  data, customer account pages, checkout DOM, cookies, tokens, raw query strings, raw
  webhook bodies, or PII.

## Required implementation

### A. Real storefront recorder

Replace/upgrade the theme app embed recorder with a bundled first-party rrweb-based
recorder (or an equally capable, locally bundled open-source DOM recorder if rrweb proves
incompatible). Do not load runtime code from a third-party CDN.

Capture:

- initial full DOM snapshot;
- incremental DOM mutations;
- styles needed for reconstruction;
- mouse/pointer movement;
- clicks/taps;
- scroll positions;
- viewport resizes;
- page/route changes and timestamps.

Privacy configuration must include at minimum:

- mask every input, textarea, select, password, search, email, phone, and contenteditable
  value;
- block `[data-pathminty-private]` and common sensitive/customer selectors;
- do not record cross-origin iframe contents;
- do not record `/account`, `/checkout`, `/checkouts`, `/orders`, password, or authentication
  pages; capture only a coarse route event where Shopify's Web Pixel legally provides it;
- strip query strings and fragments from recorded routes;
- start/stop strictly from Shopify Customer Privacy API's
  `analyticsProcessingAllowed()` after loading `consent-tracking-api` with
  `Shopify.loadFeatures`;
- preserve the current non-sensitive recorder health attribute for debugging.

Bundle the recorder dependency during the Shopify extension build. Keep the extension
asset deterministic and document the build step. Do not manually paste a minified vendor
blob without a reproducible source/build script.

### B. Reliable batching and live appearance

Fix current data-loss/collision problems:

- sequence numbers must be unique and monotonically increasing for the whole browser
  session across page navigations; never reset to zero on each page;
- allocate/increment a sequence before an upload so `pagehide` and the next document
  cannot race and overwrite the same R2 chunk;
- alternatively include a collision-proof batch id in the R2 key while preserving
  deterministic ordering; document the choice;
- flush roughly every 5 seconds, at a bounded event count/byte size, and on pagehide with
  `keepalive`/`sendBeacon`-appropriate limits;
- the collector must validate bounded payload size and contract shape before R2;
- every accepted batch must enqueue summary work, not only a final batch;
- session summaries must update while a session is active so hover-only sessions appear
  in the dashboard within one polling interval;
- infer `active` versus `ended` from last activity/idle timeout rather than depending on a
  perfect final browser request;
- preserve retry/idempotency behavior and avoid duplicate heatmap points.

Do not put raw rrweb/replay events in Postgres. Keep raw chunks in R2 and small derived
summaries/manifests in the existing storage abstraction.

### C. Real visual replay

Use rrweb's Replayer/rrweb-player (locally bundled) in the dashboard to reconstruct the
captured DOM in a sandboxed replay surface and play the real event timeline.

The replay view must provide:

- actual reconstructed page content, layout, scrolling, pointer, clicks, and DOM changes;
- play/pause, scrubber, elapsed/total time, playback speed (0.5x/1x/2x), route label, and
  viewport/device metadata;
- route/page transitions in the same session in chronological order;
- a loading state, a real empty state, and a `Recording incomplete` error state;
- no blank-canvas coordinate visualization and no invented page preview;
- safe sandboxing and no execution of captured storefront scripts in the merchant
  dashboard.

If external images/fonts cannot load during reconstruction, the captured DOM must still
be genuine. Surface a non-blocking asset warning; do not replace content with a fake
page.

### D. Heatmap over the captured page

The Heatmaps screen must use a real representative rrweb full snapshot for the selected
shop, normalized route, viewport bucket, and date range. Reconstruct that genuine page
state and overlay an interaction heat layer aligned to it.

Implement:

- route selector sourced only from captured real sessions;
- device/viewport selector;
- date range selector if the existing data can support it honestly; otherwise omit it;
- Click and Hover/Dwell heatmap modes;
- real click/tap coordinates;
- hover/dwell density derived from real pointer movement with sensible sampling so one
  session cannot dominate merely because of event frequency;
- coordinate alignment to the captured viewport and scroll offsets;
- intensity legend and real session/event counts;
- clear status when the selected route has interactions but no usable DOM snapshot.

Use a maintainable heatmap renderer (canvas is fine) layered over the replay iframe/page
surface. Avoid huge DOM grids. Resize accurately and preserve aspect ratio.

### E. Merchant UI simplification

Make the dashboard focused and honest:

- primary navigation: `Heatmaps` and `Recordings` (a minimal Overview is okay only if it
  contains real data and direct links to those two);
- remove/hide Journeys, Revenue paths, Audiences, fake insights, sample metrics, and
  prototype modals;
- default to real storefront data only;
- label active recordings and last-seen time;
- poll for updates at a reasonable interval and provide manual Refresh;
- clean Cloudflare-like PathMinty styling already present, accessible controls, keyboard
  focus, proper labels, responsive layout;
- no `fallback`, `sample`, `demo`, `estimated`, or hard-coded merchant analytics values
  in production components.

### F. Contracts, APIs, storage, tests, and docs

Inspect and update all affected pieces, including at least:

- Shopify recorder extension and its reproducible bundle step;
- shared contracts for bounded recorder batches and real replay events;
- collector ingestion, R2 keying, and queue jobs;
- analytics worker/session summaries;
- R2 storage adapters/manifests;
- dashboard API list/replay/heatmap endpoints;
- dashboard UI and styles;
- tests and operations/docs/ADR for the recorder format and privacy model.

Add meaningful tests for:

- cross-navigation sequence/key collision prevention;
- accepted batch idempotency;
- input/value masking configuration;
- active-session summary updates before a final batch;
- deterministic chronological replay ordering;
- heatmap aggregation by shop, route, viewport, and mode;
- production UI contains no seeded fallback analytics;
- tenant isolation and invalid/oversize input rejection.

Keep handlers thin and business behavior in packages. Use generated Cloudflare binding
types. Use R2/Queue/service bindings rather than Cloudflare REST calls. Do not introduce
secrets. Do not log replay bodies.

## Acceptance checklist

Before finishing, you must:

1. Run the recorder build and prove the theme extension asset contains the real recorder.
2. Run `pnpm check` and `pnpm format:check` successfully.
3. Run any new focused tests explicitly and report their count.
4. Search production dashboard/recorder code for hard-coded sample/fallback analytics and
   remove them.
5. Inspect the complete changed files for privacy, tenant scoping, and Cloudflare promise
   handling.
6. Return a compact final report containing changed architecture, exact files, tests,
   known honest limitations, and deployment steps the supervisor must execute.

Do not stop after planning. Implement the feature completely in the current working tree.
