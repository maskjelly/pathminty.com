# Dashboard V1 plan (site map · time · quieter live)

**Baseline snapshot:** git tag `v0.1.0-pre-insights` on `main`  
**Restore:** `git checkout v0.1.0-pre-insights` (or `git switch -c restore/v0.1.0 v0.1.0-pre-insights`)

This checklist is the agreed V1 after the live demo store work. Check items off as they land.

---

## Product decisions (locked)

| Topic | Decision |
| ----- | -------- |
| Multi-page view | **Site map grid** first (ranked route cards + mini heatmaps → drill-in) |
| Time | **Presets** (`1h` / `24h` / `7d` / `30d`) **+ 24h timeline scrubber** |
| Auto-refresh | **Live poll only on Recordings** (Heatmaps: manual / filter-driven only) |

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

- [ ] Stop 15s polling on Heatmaps / site map
- [ ] Poll sessions only while **Recordings** tab is active
- [ ] Pause poll when `document.visibilityState !== "visible"`
- [ ] Manual refresh control remains for all views
- [ ] Heatmap fetch must **not** re-run solely because session list refreshed

## Phase 2 — Time filter

- [ ] Global time presets: `1h` · `24h` (default) · `7d` · `30d`
- [ ] Filter sessions / heatmap points by range (`startedAt` / `lastSeenAt` / event `at`)
- [ ] API: `from` / `to` (or preset) on sessions + heatmaps
- [ ] Insights and ranks always use the selected range

## Phase 3 — Route index

- [ ] Aggregate per-route stats in range: sessions, events, last activity
- [ ] Rank: most active, least active (floor ≥ 3 sessions), most sessions
- [ ] Search / filter routes by path text
- [ ] Cap list (e.g. top 24–48) + “Show more”
- [ ] API sketch: `GET .../routes?from=&to=&device=&sort=&limit=`

## Phase 4 — Site map UI

- [ ] Heatmaps home = **site map grid** (not single-route-first)
- [ ] Route cards: mini snapshot or placeholder, mini heatmap, path, stats
- [ ] Insight strip: most active · least active · session volume
- [ ] Click card → full `HeatmapSurface` drill-in + back navigation
- [ ] Retire primary route `<select>`; optional searchable jump-to-route secondary

## Phase 5 — 24h timeline

- [ ] Bottom activity density bar when preset is 24h (reference-aligned)
- [ ] Hourly (or ~15m) buckets for selected scope
- [ ] Scrubber focuses drill-in heatmap slice; grid ranks stay on full window
- [ ] API sketch: `GET .../activity?from=&to=&route?&device=`

## Phase 6 — Mini heatmaps / performance

- [ ] Batch or limited parallel heatmaps for visible top-N cards only
- [ ] Prefer points-only (or light snapshot) for thumbnails
- [ ] Hard caps on points, routes, and concurrent R2 reads

---

## Explicit non-goals (this V1)

- [ ] ~~True freeform infinite zoom “whole site” canvas~~ (grid is the default)
- [ ] ~~Revenue / SKU conversion copy without order truth~~
- [ ] ~~Cloaking / defeating user ad blockers~~
- [ ] ~~Staging/production deploy of this slice unless asked~~

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
