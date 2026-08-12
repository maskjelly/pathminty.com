# Dashboard V1 plan (site map · time · quieter live)

**Baseline snapshot:** git tag `v0.1.0-pre-insights` on `main`  
**Restore:** `git checkout v0.1.0-pre-insights` (or
`git switch -c restore/v0.1.0 v0.1.0-pre-insights`)

This checklist is the agreed V1 after the live demo store work. Check items off as they
land.

---

## Product decisions (locked)

| Topic           | Decision                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| Multi-page view | **Site map grid** first (ranked route cards + mini heatmaps → drill-in)  |
| Time            | **Presets** (`1h` / `24h` / `7d` / `30d`) **+ 24h timeline scrubber**    |
| Auto-refresh    | **Live poll only on Recordings** (Heatmaps: manual / filter-driven only) |

---

## Baseline (this snapshot)

- [x] Working Shopify handoff (fresh ticket on open, absolute dashboard URL)
- [x] Same-origin storefront capture via app proxy (`/apps/pathminty/capture`)
- [x] Heatmaps + recordings from real session summaries
- [x] Single-route heatmap surface + device / click-hover controls
- [x] 15s global session poll (known pain — replace in Phase 1)
- [x] Flat route `<select>` (known scale pain — replace in Phase 4)
- [x] Git snapshot tagged `v0.1.0-pre-insights` for safe revert

---

## Phase 1 — Stability (auto-load)

- [x] Stop 15s polling on Heatmaps / site map
- [x] Poll sessions only while **Recordings** tab is active
- [x] Pause poll when `document.visibilityState !== "visible"`
- [x] Manual refresh control remains for all views
- [x] Heatmap fetch must **not** re-run solely because session list refreshed

## Phase 2 — Time filter

- [x] Global time presets: `1h` · `24h` (default) · `7d` · `30d`
- [x] Filter sessions / heatmap points by range (`startedAt` / `lastSeenAt` / event
      `at`)
- [x] API: `from` / `to` (or preset) on sessions + heatmaps
- [x] Insights and ranks always use the selected range

## Phase 3 — Route index

- [x] Aggregate per-route stats in range: sessions, events, last activity
- [x] Rank: most active, least active (floor ≥ 3 sessions), most sessions
- [x] Search / filter routes by path text
- [x] Cap list (e.g. top 24–48) + “Show more”
- [x] API: `GET .../routes?from=&to=&device=&sort=&limit=`

## Phase 4 — Site map UI

- [x] Heatmaps home = **site map grid** (not single-route-first)
- [x] Route cards: mini snapshot or placeholder, mini heatmap, path, stats
- [x] Insight strip: most active · least active · session volume
- [x] Click card → full `HeatmapSurface` drill-in + back navigation
- [x] Retire primary route `<select>`; optional searchable jump-to-route secondary

## Phase 5 — 24h timeline

- [x] Bottom activity density bar (all presets; hourly for 24h)
- [x] Hourly (or adaptive) buckets for selected scope
- [x] Scrubber focuses drill-in heatmap slice; grid ranks stay on full window
- [x] API: `GET .../activity?from=&to=&route?&device=`

## Phase 6 — Mini heatmaps / performance

- [x] Batch heatmaps for visible top-N cards (`/heatmaps/batch`)
- [x] Prefer points-only (no DOM snapshot) for thumbnails
- [x] Hard caps on points, routes, and concurrent R2 reads (batch skips R2 snapshots)

---

## Explicit non-goals (this V1)

- [x] ~~True freeform infinite zoom “whole site” canvas~~ (grid is the default)
- [x] ~~Revenue / SKU conversion copy without order truth~~
- [x] ~~Cloaking / defeating user ad blockers~~
- [x] ~~Staging/production deploy of this slice unless asked~~

---

## Defaults (unless product revises)

- **Least active** floor: ≥ **3** sessions in range
- **Default sort:** most active
- **Product URLs:** keep raw paths in v1 (grouping `/products/*` is a later option)

---

## Success criteria

- Heatmaps tab stays quiet unless filters change or user refreshes
- Catalogs with hundreds of SKU paths stay usable via ranked grid + search
- Most / least active routes are obvious in the selected time range
- 24h view includes bottom activity strip + scrub
- Drill-in full heatmap still works for deep inspection
- `v0.1.0-pre-insights` remains a clean rollback point
