import {
  ArrowClockwise,
  ArrowLeft,
  CursorClick,
  DeviceMobile,
  DeviceTablet,
  GearSix,
  MapTrifold,
  Monitor,
  Play,
  Record,
  Storefront,
} from "@phosphor-icons/react";
import type {
  ActivityTimelineResponse,
  HeatmapMode,
  HeatmapResponse,
  JourneyGraphResponse,
  PlanId,
  ReplaySessionResponse,
  RouteListResponse,
  RouteSort,
  SessionSummary,
  ShopWorkspace,
  TimeRangePreset,
} from "@pathminty/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  exchangeDashboardTicket,
  getActivity,
  getDashboardShop,
  getHeatmap,
  getHeatmapBatch,
  getJourneys,
  getReplay,
  getRoutes,
  getSessions,
  getWorkspace,
  selectPlan,
  type DashboardDevice,
  type TimeQuery,
} from "./api/sessions";
import { BrandMark } from "./BrandMark";
import { Landing } from "./marketing/Landing";
import { SettingsPage } from "./merchant/SettingsPage";
import { ActivityTimeline } from "./components/ActivityTimeline";
import { HeatmapSurface } from "./components/HeatmapSurface";
import { ReplayViewer } from "./components/ReplayViewer";
import { SiteCanvas } from "./components/SiteCanvas";

type View = "Heatmaps" | "Recordings" | "Settings";
type HeatmapPane = "map" | "route";

const views: Array<{ label: View; icon: typeof MapTrifold }> = [
  { label: "Heatmaps", icon: MapTrifold },
  { label: "Recordings", icon: Record },
  { label: "Settings", icon: GearSix },
];

const TIME_PRESETS: Array<{ id: TimeRangePreset; label: string }> = [
  { id: "1h", label: "1h" },
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
];

const POLL_MS = 15_000;
const SITE_MAP_PAGE = 24;

function durationLabel(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1_000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function relativeTime(iso: string) {
  const delta = Date.now() - Date.parse(iso);
  if (!Number.isFinite(delta) || delta < 0) return "just now";
  if (delta < 60_000) return `${Math.max(1, Math.round(delta / 1_000))}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

function shopLabel(shopId: string) {
  return shopId.replace(/\.myshopify\.com$/u, "");
}

function EmptySessions({ onRefresh }: { onRefresh: () => void }) {
  return (
    <section className="live-empty">
      <span className="live-empty-icon">
        <CursorClick size={22} />
      </span>
      <p>No traffic in this range</p>
      <h2>Waiting for storefront sessions</h2>
      <ol className="live-empty-steps">
        <li>
          In Shopify Admin, open{" "}
          <strong>Online Store → Themes → Customize → App embeds</strong> and enable{" "}
          <strong>PathMinty Recorder</strong>, then save.
        </li>
        <li>
          Visit the storefront and accept analytics cookies if your store requires
          consent.
        </li>
        <li>
          Browse a few pages (home, collection, product). Sessions appear here within
          about 15 seconds.
        </li>
      </ol>
      <p className="live-empty-note">
        Ad blockers and strict privacy browsers can block capture. Try a normal browser
        window if nothing shows up.
      </p>
      <button onClick={onRefresh} type="button">
        <ArrowClockwise size={15} /> Check again
      </button>
    </section>
  );
}

function SessionRows({
  sessions,
  onOpen,
}: {
  sessions: SessionSummary[];
  onOpen: (session: SessionSummary) => void;
}) {
  return (
    <div className="live-table">
      {sessions.map((session) => (
        <button
          className="live-session-row"
          key={session.sessionId}
          onClick={() => onOpen(session)}
          type="button"
        >
          <span className="session-play">
            <Play size={13} weight="fill" />
          </span>
          <span>
            <strong>{session.entryRoute}</strong>
            <small>
              {session.status === "active" ? "Active · " : "Ended · "}
              last seen {relativeTime(session.lastSeenAt)} ·{" "}
              {new Date(session.startedAt).toLocaleString()}
            </small>
          </span>
          <span className="session-status" data-status={session.status}>
            {session.status}
          </span>
          <span>{session.device}</span>
          <span>{session.clickCount} clicks</span>
          <span>
            {session.quality === "likely_bot"
              ? "bot"
              : session.quality === "short"
                ? "short"
                : session.rageClickCount
                  ? `${session.rageClickCount} rage`
                  : "human"}
          </span>
          <span>{durationLabel(session.durationMs)}</span>
        </button>
      ))}
    </div>
  );
}

export function LiveDashboard() {
  const [view, setView] = useState<View>("Heatmaps");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [shopId, setShopId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [routeIndex, setRouteIndex] = useState<RouteListResponse | null>(null);
  const [activity, setActivity] = useState<ActivityTimelineResponse | null>(null);
  const [miniHeatmaps, setMiniHeatmaps] = useState<Record<string, HeatmapResponse>>({});
  const [device, setDevice] = useState<DashboardDevice>("all");
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("click");
  const [timePreset, setTimePreset] = useState<TimeRangePreset>("24h");
  const [routeSort, setRouteSort] = useState<RouteSort>("most_active");
  const [routeQuery, setRouteQuery] = useState("");
  const [routeLimit, setRouteLimit] = useState(SITE_MAP_PAGE);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [journey, setJourney] = useState<JourneyGraphResponse | null>(null);
  const [replay, setReplay] = useState<ReplaySessionResponse | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [workspace, setWorkspace] = useState<ShopWorkspace | null>(null);
  const [hideBots, setHideBots] = useState(true);
  const [sessionQuery, setSessionQuery] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [hasTicket] = useState(() => {
    const search = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    return Boolean(search.get("ticket") ?? fragment.get("ticket"));
  });

  const timeQuery = useMemo<TimeQuery>(() => ({ preset: timePreset }), [timePreset]);
  const heatmapPane: HeatmapPane = selectedRoute ? "route" : "map";

  const loadSessions = useCallback(
    async (shop: string) => {
      const result = await getSessions(shop, {
        time: timeQuery,
        device,
        limit: 100,
        hideBots,
        query: sessionQuery,
      });
      setSessions(result);
      setError("");
      return result;
    },
    [timeQuery, device, hideBots, sessionQuery],
  );

  const loadSiteMap = useCallback(
    async (shop: string) => {
      setMapLoading(true);
      try {
        const routeOptions = {
          time: timeQuery,
          device,
          mode: heatmapMode,
          sort: routeSort,
          limit: routeLimit,
          ...(routeQuery.trim() ? { query: routeQuery.trim() } : {}),
        };
        const [routes, timeline, graph] = await Promise.all([
          getRoutes(shop, routeOptions),
          getActivity(shop, {
            time: timeQuery,
            device,
            mode: heatmapMode,
          }),
          getJourneys(shop, {
            time: timeQuery,
            device,
            maxNodes: 32,
          }).catch(() => null),
        ]);
        setRouteIndex(routes);
        setActivity(timeline);
        setJourney(graph);

        const paths = routes.routes.map((item) => item.route);
        if (paths.length > 0) {
          const batch = await getHeatmapBatch(shop, {
            routes: paths,
            device,
            mode: heatmapMode,
            time: timeQuery,
            snapshot: true,
            snapshotLimit: 12,
          });
          const next: Record<string, HeatmapResponse> = {};
          for (const item of batch) next[item.route] = item;
          setMiniHeatmaps(next);
        } else {
          setMiniHeatmaps({});
        }
        setError("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load site map.");
      } finally {
        setMapLoading(false);
      }
    },
    [timeQuery, device, heatmapMode, routeSort, routeLimit, routeQuery],
  );

  // Route-scoped timeline while drilling into a page heatmap.
  useEffect(() => {
    if (!shopId || view !== "Heatmaps" || !selectedRoute) return;
    let cancelled = false;
    void getActivity(shopId, {
      time: timeQuery,
      device,
      mode: heatmapMode,
      route: selectedRoute,
    })
      .then((timeline) => {
        if (!cancelled) setActivity(timeline);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [shopId, view, selectedRoute, timeQuery, device, heatmapMode]);

  // Auth bootstrap once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const search = new URLSearchParams(window.location.search);
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        const ticket = search.get("ticket") ?? fragment.get("ticket");
        if (ticket) history.replaceState(null, "", window.location.pathname);

        let shop: string | null = null;
        if (ticket) {
          try {
            shop = await exchangeDashboardTicket(ticket);
          } catch (exchangeError) {
            shop = await getDashboardShop();
            if (!shop) {
              throw exchangeError instanceof Error
                ? exchangeError
                : new Error(
                    "This dashboard link expired. Reopen PathMinty from Shopify.",
                  );
            }
          }
        } else {
          shop = await getDashboardShop();
        }
        if (!shop) throw new Error("Open PathMinty from your Shopify Admin.");
        if (cancelled) return;
        setShopId(shop);
        setStatus("ready");
        void getWorkspace(shop)
          .then(setWorkspace)
          .catch(() => undefined);
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof Error ? caught.message : "Unable to open PathMinty.",
        );
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Initial + filter-driven loads for heatmaps site map (no auto-poll).
  useEffect(() => {
    if (!shopId || view !== "Heatmaps") return;
    void loadSiteMap(shopId);
  }, [shopId, view, loadSiteMap]);

  // Sessions for recordings tab (and manual refresh).
  useEffect(() => {
    if (!shopId || view !== "Recordings") return;
    void loadSessions(shopId).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Unable to load sessions.");
    });
  }, [shopId, view, loadSessions]);

  // Live poll only on Recordings while the tab is visible.
  useEffect(() => {
    if (!shopId || view !== "Recordings") return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void loadSessions(shopId).catch(() => undefined);
    };
    const timer = window.setInterval(tick, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [shopId, view, loadSessions]);

  // Drill-in full heatmap — depends on route + scrub, not session list refreshes.
  useEffect(() => {
    if (!shopId || !selectedRoute || view !== "Heatmaps") {
      setHeatmap(null);
      return;
    }
    let cancelled = false;
    setHeatmapLoading(true);
    const scrubBucket =
      scrubIndex !== null && activity ? activity.buckets[scrubIndex] : null;
    void (async () => {
      try {
        const result = await getHeatmap(shopId, {
          route: selectedRoute,
          device,
          mode: heatmapMode,
          time: timeQuery,
          snapshot: true,
          ...(scrubBucket
            ? { scrubFrom: scrubBucket.startAt, scrubTo: scrubBucket.endAt }
            : {}),
        });
        if (!cancelled) setHeatmap(result);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Unable to load heatmap.",
          );
          setHeatmap(null);
        }
      } finally {
        if (!cancelled) setHeatmapLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    shopId,
    selectedRoute,
    device,
    heatmapMode,
    timeQuery,
    scrubIndex,
    activity,
    view,
  ]);

  // Reset scrub when leaving 24h or changing route.
  useEffect(() => {
    setScrubIndex(null);
  }, [timePreset, selectedRoute]);

  const openReplay = (session: SessionSummary) => {
    if (!shopId) return;
    setReplayOpen(true);
    setReplayLoading(true);
    setReplay(null);
    void (async () => {
      try {
        setReplay(await getReplay(shopId, session.sessionId));
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Unable to load recording.",
        );
        setReplayOpen(false);
      } finally {
        setReplayLoading(false);
      }
    })();
  };

  if (status !== "ready" || !shopId) {
    if (status !== "loading" && !hasTicket) {
      return <Landing />;
    }
    return (
      <main className="empty-dashboard">
        <section className="empty-dashboard-card">
          <BrandMark size={40} />
          <p className="empty-dashboard-kicker">PathMinty</p>
          <h1>
            {status === "loading" ? "Opening your dashboard…" : "Open from Shopify"}
          </h1>
          <p>
            {status === "loading"
              ? "Verifying the secure handoff from your store admin."
              : error || "Reopen PathMinty from Shopify Admin to continue."}
          </p>
        </section>
      </main>
    );
  }

  const changePlan = (planId: PlanId) => {
    setPlanBusy(true);
    void selectPlan(shopId, planId)
      .then(setWorkspace)
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Unable to change plan.");
      })
      .finally(() => setPlanBusy(false));
  };

  const refresh = () => {
    if (view === "Settings") {
      void getWorkspace(shopId)
        .then(setWorkspace)
        .catch(() => undefined);
      return;
    }
    if (view === "Recordings") {
      void loadSessions(shopId).catch((caught: unknown) => {
        setError(
          caught instanceof Error ? caught.message : "Unable to refresh sessions.",
        );
      });
      return;
    }
    void loadSiteMap(shopId);
  };

  const activeCount = sessions.filter((session) => session.status === "active").length;
  const dataStatus =
    view === "Recordings"
      ? sessions.length === 0
        ? "Awaiting data"
        : activeCount > 0
          ? `${activeCount} active · live`
          : "Live when tab open"
      : mapLoading
        ? "Loading canvas…"
        : routeIndex
          ? `${routeIndex.totalRoutes} pages · ${timePreset}`
          : "Canvas";

  const showTimeline = Boolean(activity && activity.buckets.length > 0);

  return (
    <div className="app-shell live-shell">
      <aside className="rail" aria-label="Primary navigation">
        <button
          className="brand-mark"
          onClick={() => {
            setView("Heatmaps");
            setSelectedRoute(null);
          }}
          title="PathMinty"
          type="button"
          aria-label="PathMinty home"
        >
          <BrandMark size={36} />
        </button>
        <nav className="rail-nav">
          {views.map(({ label, icon: Icon }) => (
            <button
              className="rail-button"
              data-active={view === label}
              key={label}
              onClick={() => {
                setView(label);
                if (label === "Heatmaps") setSelectedRoute(null);
              }}
              title={label}
              type="button"
            >
              <Icon size={20} weight={view === label ? "fill" : "regular"} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="workspace live-workspace">
        <header className="topbar">
          <div className="title-lockup">
            <p>PathMinty</p>
            <h1>
              {view === "Heatmaps"
                ? heatmapPane === "route"
                  ? "Route heatmap"
                  : "Site canvas"
                : view}
            </h1>
          </div>
          <div className="topbar-actions">
            {workspace ? (
              <button
                className="quota-chip"
                onClick={() => setView("Settings")}
                title="Plan and usage"
                type="button"
              >
                <span className="quota-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.min(
                        100,
                        (workspace.usage.billableSessions /
                          Math.max(1, workspace.usage.limit)) *
                          100,
                      )}%`,
                    }}
                  />
                </span>
                {workspace.usage.billableSessions}/{workspace.usage.limit} ·{" "}
                {workspace.plan.name}
              </button>
            ) : null}
            <span className="demo-chip live-chip">
              <span /> {dataStatus}
            </span>
            <span className="control store-switcher" title={shopId}>
              <Storefront size={16} />
              {shopLabel(shopId)}
            </span>
            <button
              className="icon-button"
              onClick={refresh}
              title="Refresh"
              type="button"
            >
              <ArrowClockwise size={17} />
            </button>
          </div>
        </header>

        {error && (
          <div className="live-error" role="alert">
            {error}
          </div>
        )}

        {workspace && workspace.health.hint !== "ok" && view !== "Settings" ? (
          <div className="health-banner" data-hint={workspace.health.hint}>
            {workspace.health.hint === "awaiting_traffic"
              ? "Connected. Browse the storefront with analytics consent to see the first session."
              : workspace.health.hint === "quota_paused"
                ? "Recording is paused — you hit this month’s human-session cap. Upgrade to keep capturing."
                : workspace.health.hint === "embed_silent"
                  ? "Pixel events are arriving but no recordings. Enable PathMinty Recorder in the theme editor and save."
                  : workspace.health.hint === "recent_errors"
                    ? "Capture hit errors in the last hour. Check the recorder embed and ad blockers."
                    : "Tracking is disconnected. Reconnect from Shopify Admin."}
          </div>
        ) : null}

        {view === "Settings" && workspace ? (
          <SettingsPage
            busy={planBusy}
            onBack={() => setView("Heatmaps")}
            onSelectPlan={changePlan}
            workspace={workspace}
          />
        ) : null}

        {view === "Heatmaps" && (
          <>
            <section className="live-toolbar site-toolbar">
              {selectedRoute ? (
                <button
                  className="control back-control"
                  onClick={() => setSelectedRoute(null)}
                  type="button"
                >
                  <ArrowLeft size={14} /> Canvas
                </button>
              ) : null}
              <div className="mode-switch" aria-label="Time range">
                {TIME_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    data-active={timePreset === preset.id}
                    onClick={() => setTimePreset(preset.id)}
                    type="button"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="mode-switch" aria-label="Heatmap mode">
                <button
                  data-active={heatmapMode === "click"}
                  onClick={() => setHeatmapMode("click")}
                  type="button"
                >
                  Click
                </button>
                <button
                  data-active={heatmapMode === "hover"}
                  onClick={() => setHeatmapMode("hover")}
                  type="button"
                >
                  Hover
                </button>
                <button
                  data-active={heatmapMode === "scroll"}
                  onClick={() => setHeatmapMode("scroll")}
                  type="button"
                >
                  Scroll
                </button>
              </div>
              <div className="device-switch" aria-label="Device">
                <button
                  data-active={device === "all"}
                  onClick={() => setDevice("all")}
                  type="button"
                >
                  All
                </button>
                <button
                  data-active={device === "desktop"}
                  onClick={() => setDevice("desktop")}
                  title="Desktop"
                  type="button"
                >
                  <Monitor size={16} />
                </button>
                <button
                  data-active={device === "tablet"}
                  onClick={() => setDevice("tablet")}
                  title="Tablet"
                  type="button"
                >
                  <DeviceTablet size={16} />
                </button>
                <button
                  data-active={device === "mobile"}
                  onClick={() => setDevice("mobile")}
                  title="Mobile"
                  type="button"
                >
                  <DeviceMobile size={16} />
                </button>
              </div>
              {!selectedRoute && (
                <>
                  <label className="route-search">
                    Search routes
                    <input
                      value={routeQuery}
                      onChange={(event) => {
                        setRouteQuery(event.target.value);
                        setRouteLimit(SITE_MAP_PAGE);
                      }}
                      placeholder="/products/…"
                      type="search"
                    />
                  </label>
                  <label className="route-sort">
                    Sort
                    <select
                      value={routeSort}
                      onChange={(event) =>
                        setRouteSort(event.target.value as RouteSort)
                      }
                    >
                      <option value="most_active">Most active</option>
                      <option value="least_active">Least active</option>
                      <option value="sessions">Most sessions</option>
                      <option value="alpha">A–Z</option>
                    </select>
                  </label>
                </>
              )}
              {selectedRoute && (
                <span className="route-pill" title={selectedRoute}>
                  {selectedRoute}
                </span>
              )}
            </section>

            {routeIndex && (
              <section className="insight-strip" aria-label="Route insights">
                <article>
                  <p>Most active</p>
                  <strong title={routeIndex.mostActive?.route}>
                    {routeIndex.mostActive?.route ?? "—"}
                  </strong>
                  <span>
                    {routeIndex.mostActive
                      ? `${routeIndex.mostActive.eventCount} ${heatmapMode === "hover" ? "dwell samples" : "clicks"} · ${routeIndex.mostActive.sessionCount} sessions`
                      : "No traffic in this range"}
                  </span>
                </article>
                <article>
                  <p>Least active</p>
                  <strong title={routeIndex.leastActive?.route}>
                    {routeIndex.leastActive?.route ?? "—"}
                  </strong>
                  <span>
                    {routeIndex.leastActive
                      ? `${routeIndex.leastActive.eventCount} events · at least 3 sessions`
                      : "Needs 3+ sessions on a quieter page"}
                  </span>
                </article>
                <article>
                  <p>Watch this first</p>
                  <strong>
                    {sessions.some((session) => (session.rageClickCount ?? 0) > 0)
                      ? "Rage clicks"
                      : journey && journey.checkoutSessions === 0
                        ? "No checkout reach"
                        : "Quiet leaks"}
                  </strong>
                  <span>
                    {sessions.some((session) => (session.rageClickCount ?? 0) > 0)
                      ? "Open recordings filtered to frustrated taps"
                      : "Least-active pages with traffic still waste attention"}
                  </span>
                </article>
                <article>
                  <p>Reached checkout</p>
                  <strong>
                    {journey
                      ? `${journey.checkoutSessions}/${journey.totalSessions}`
                      : "—"}
                  </strong>
                  <span>
                    {journey
                      ? `${Math.round(
                          (journey.checkoutSessions /
                            Math.max(1, journey.totalSessions)) *
                            100,
                        )}% of sessions hit cart or checkout`
                      : "Builds from multi-page journeys"}
                  </span>
                </article>
                <article>
                  <p>In range</p>
                  <strong>
                    {routeIndex.totalSessions} sessions · {routeIndex.totalRoutes} pages
                  </strong>
                  <span>
                    {routeIndex.totalEvents}{" "}
                    {heatmapMode === "hover" ? "dwell" : "click"} events · {timePreset}
                  </span>
                </article>
              </section>
            )}

            {selectedRoute ? (
              <div className="heatmap-drill">
                <div className="heatmap-drill-meta">
                  <span>
                    {heatmap?.eventCount ?? 0} events · {heatmap?.sessionCount ?? 0}{" "}
                    sessions
                    {scrubIndex !== null ? " · scrubbed" : ""}
                  </span>
                </div>
                <HeatmapSurface heatmap={heatmap} loading={heatmapLoading} />
              </div>
            ) : (
              <section className="site-canvas-section" aria-label="Site canvas">
                {mapLoading && !routeIndex ? (
                  <p className="site-map-status">Building canvas…</p>
                ) : routeIndex && routeIndex.routes.length === 0 ? (
                  <EmptySessions onRefresh={refresh} />
                ) : (
                  <>
                    <SiteCanvas
                      routes={routeIndex?.routes ?? []}
                      heatmaps={miniHeatmaps}
                      journey={journey}
                      onOpenRoute={setSelectedRoute}
                    />
                    {routeIndex && routeIndex.totalRoutes > routeLimit && (
                      <button
                        className="control show-more"
                        onClick={() => setRouteLimit((value) => value + SITE_MAP_PAGE)}
                        type="button"
                      >
                        Load more pages ({routeIndex.totalRoutes - routeLimit} left)
                      </button>
                    )}
                  </>
                )}
              </section>
            )}

            {showTimeline && activity && heatmapPane === "route" && (
              <ActivityTimeline
                buckets={activity.buckets}
                selectedIndex={scrubIndex}
                onSelect={setScrubIndex}
              />
            )}
          </>
        )}

        {view === "Recordings" &&
          (sessions.length === 0 ? (
            <EmptySessions onRefresh={refresh} />
          ) : (
            <div className="live-content">
              <section className="live-panel">
                <div className="panel-heading">
                  <div>
                    <p>Behaviour</p>
                    <h2>Session recordings</h2>
                  </div>
                  <span>
                    {activeCount} active · {sessions.length} in {timePreset} · live poll
                    on this tab
                  </span>
                </div>
                <section className="live-toolbar recordings-toolbar">
                  <div className="mode-switch" aria-label="Time range">
                    {TIME_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        data-active={timePreset === preset.id}
                        onClick={() => setTimePreset(preset.id)}
                        type="button"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="device-switch" aria-label="Device">
                    <button
                      data-active={device === "all"}
                      onClick={() => setDevice("all")}
                      type="button"
                    >
                      All
                    </button>
                    <button
                      data-active={device === "desktop"}
                      onClick={() => setDevice("desktop")}
                      type="button"
                    >
                      <Monitor size={16} />
                    </button>
                    <button
                      data-active={device === "mobile"}
                      onClick={() => setDevice("mobile")}
                      type="button"
                    >
                      <DeviceMobile size={16} />
                    </button>
                  </div>
                  <label className="route-search">
                    Route
                    <input
                      onChange={(event) => setSessionQuery(event.target.value)}
                      placeholder="/products…"
                      type="search"
                      value={sessionQuery}
                    />
                  </label>
                  <label className="bot-toggle">
                    <input
                      checked={hideBots}
                      onChange={(event) => setHideBots(event.target.checked)}
                      type="checkbox"
                    />
                    Hide bots
                  </label>
                </section>
                <SessionRows sessions={sessions} onOpen={openReplay} />
              </section>
            </div>
          ))}
      </main>
      {replayOpen && (
        <ReplayViewer
          replay={replay}
          loading={replayLoading}
          onClose={() => setReplayOpen(false)}
        />
      )}
    </div>
  );
}
