# ADR 0009: Incremental daily aggregates and sampled replay

**Status:** accepted  
**Date:** 2026-08-14

## Decision

Heatmaps, journeys, and route counts are built from **daily shop aggregates** written as
sessions land. Full rrweb blobs are kept for a **sample** of sessions (about 1 in 20,
plus every rage-click session). Every human visit still increments the heat grid.

Dashboard reads merge at most 31 daily objects. It no longer treats “latest 100 R2
summaries” as the month’s traffic.

## Consequences

- Growth plan quota is 1,000,000 human sessions / month so capture does not 402 at 50k.
- Recordings list is sampled; the UI must say so. Heatmaps include all counted visits.
- Inbox + daily compact on the analytics worker is the write path. KV lock reduces
  double-apply. `appliedInboxIds` skips duplicates.
- Non-sampled chunks are deleted after the session is final so R2 stays bounded.
- Existing shops without daily files fall back to the previous 100-session scan.
