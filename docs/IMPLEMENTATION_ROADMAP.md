# Implementation roadmap

## Foundation — completed

- strict monorepo and CI;
- authenticated merchant dashboard;
- validated replay contracts;
- tenant storefront tokens;
- R2 collector;
- completed-session queue;
- manifest and session-summary worker;
- database schema foundation;
- architecture and security documentation.

## Spike 1 — capture to interaction replay

Completed: development app/store registration, embedded app rendering, OAuth/Admin API
setup, KV sessions, privacy webhooks, Web Pixel creation/update, theme app embed, strict
event ingestion, queue aggregation, authenticated session lists, normalized click
heatmaps, and pointer/click replay.

Completed in this MVP slice:

1. Privacy-configured rrweb capture behind `@pathminty/recorder` with a reproducible
   esbuild theme-extension bundle.
2. Real DOM timeline replay via locally bundled `rrweb-player`.
3. Heatmaps over a representative captured full snapshot with click and hover modes.
4. Cross-navigation sequence allocation, sequence+batchId R2 keys, and per-batch summary
   jobs for live session appearance.

Remaining validation on a real store:

1. Record one real desktop and one real mobile session through HTTPS ingestion.
2. Confirm masked input values never appear in transport or R2.

## Spike 2 — prove commerce joining

1. Rotate the exposed development database credential.
2. Create Cloudflare Hyperdrive for Worker access.
3. Add Shopify order/refund webhooks.
4. Join one test purchase to the correct behavioral session.
5. Reconcile net revenue.
6. Delete a session and verify every object/index disappears.

The current Neon project is an Ohio development spike. Re-evaluate its region against
measured India latency before production; do not move it based on guesswork alone.

## Private alpha

- session list and replay;
- click/tap and scroll heatmaps;
- route explorer;
- net-revenue filters;
- usage/retention controls;
- recording health and privacy settings.

## Scale triggers—not dates

- add ClickHouse when measured analytical queries miss the latency budget;
- replace/add the queue when completed-session volume exceeds its practical limit;
- move Postgres region/provider when residency or latency requires it;
- add paid infrastructure only after pilot usage proves the need.
