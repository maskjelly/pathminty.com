import {
  ArrowClockwise,
  ArrowLeft,
  CursorClick,
  DeviceMobile,
  GearSix,
  Monitor,
  Play,
  SquaresFour,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import {
  buildDemoRecs,
  buildFunnelSteps,
  buildInsightRecs,
  buildProductInsights,
} from "./insights/funnelModel";
import { displayRouteLabel, isHomeRoute, pinHomePath } from "./siteCanvasLayout";
import { StoreFloor } from "./store/StoreFloor";

type Surface = "store" | "settings";

const TIME_PRESETS: Array<{ id: TimeRangePreset; label: string }> = [
  { id: "1h", label: "1h" },
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
];

const POLL_MS = 15_000;
const SITE_MAP_PAGE = 24;

function mergeHeatmaps(
  previous: Record<string, HeatmapResponse>,
  batch: HeatmapResponse[],
  replaceSnapshots: boolean,
): Record<string, HeatmapResponse> {
  const next = { ...previous };
  for (const item of batch) {
    const existing = previous[item.route];
    if (!replaceSnapshots && existing?.snapshotEvents) {
      next[item.route] = {
        ...item,
        snapshotEvents: existing.snapshotEvents,
        document: existing.document,
        viewport: existing.viewport,
        status: existing.snapshotEvents.length >= 2 ? "ok" : item.status,
      };
    } else {
      next[item.route] = item;
    }
  }
  return next;
}

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

function sessionTouchesHome(session: SessionSummary) {
  return (
    isHomeRoute(session.entryRoute) ||
    (session.routes ?? []).some((route) => isHomeRoute(route))
  );
}

function EmptySessions({ onRefresh }: { onRefresh: () => void }) {
  return (
    <section className="live-empty">
      <span className="live-empty-icon">
        <CursorClick size={22} />
      </span>
      <p>You’re almost there</p>
      <h2>Let’s get your first session</h2>
      <ol className="live-empty-steps">
        <li>
          In Shopify: <strong>Online Store → Themes → Customize → App embeds</strong>.
          Turn on <strong>PathMinty Recorder</strong> and save.
        </li>
        <li>Open your store. Accept analytics cookies if asked.</li>
        <li>
          Click around (home, a collection, a product). We’ll show it here in ~15s.
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
            <strong>{displayRouteLabel(session.entryRoute)}</strong>
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
  const [surface, setSurface] = useState<Surface>("store");
  const [demo, setDemo] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [shopId, setShopId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [routeIndex, setRouteIndex] = useState<RouteListResponse | null>(null);
  const [activity, setActivity] = useState<ActivityTimelineResponse | null>(null);
  const [miniHeatmaps, setMiniHeatmaps] = useState<Record<string, HeatmapResponse>>({});
  const [device, setDevice] = useState<DashboardDevice>("all");
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("click");
  useEffect(() => {
    if (heatmapMode === "scroll") setHeatmapMode("click");
  }, [heatmapMode]);
  const [timePreset, setTimePreset] = useState<TimeRangePreset>("24h");
  const routeSort: RouteSort = "most_active";
  const routeQuery = "";
  const routeLimit = SITE_MAP_PAGE;
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
  const sessionQuery = "";
  const pageFilter = "all";
  const [planBusy, setPlanBusy] = useState(false);
  const lastHeatMode = useRef<HeatmapMode>(heatmapMode);
  const [hasTicket] = useState(() => {
    const search = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    return Boolean(search.get("ticket") ?? fragment.get("ticket"));
  });

  const timeQuery = useMemo<TimeQuery>(() => ({ preset: timePreset }), [timePreset]);
  const recordingSessions = useMemo(() => {
    const matched = sessions.filter((session) => {
      if (pageFilter === "all") return true;
      if (pageFilter === "home") return sessionTouchesHome(session);
      return (
        session.entryRoute === pageFilter || (session.routes ?? []).includes(pageFilter)
      );
    });
    return [...matched].sort((left, right) => {
      const leftHome = sessionTouchesHome(left);
      const rightHome = sessionTouchesHome(right);
      if (leftHome !== rightHome) return leftHome ? -1 : 1;
      return 0;
    });
  }, [pageFilter, sessions]);

  const liveSteps = useMemo(
    () => buildFunnelSteps(routeIndex?.routes ?? [], journey),
    [journey, routeIndex],
  );
  const liveProducts = useMemo(
    () => buildProductInsights(routeIndex?.routes ?? [], journey),
    [journey, routeIndex],
  );
  const recs = useMemo(
    () => (demo ? buildDemoRecs() : buildInsightRecs(liveSteps, liveProducts)),
    [demo, liveProducts, liveSteps],
  );

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
        const paths = pinHomePath(
          routes.routes.map((item) => item.route),
          (graph?.nodes ?? []).map((node) => node.route),
        );
        const batch = await getHeatmapBatch(shop, {
          routes: paths,
          device,
          mode: heatmapMode,
          time: timeQuery,
          snapshot: true,
          snapshotLimit: 12,
        });
        setMiniHeatmaps((previous) => mergeHeatmaps(previous, batch, true));
        setError("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load site map.");
      } finally {
        setMapLoading(false);
      }
    },
    [timeQuery, device, routeSort, routeLimit, routeQuery],
  );

  const loadHeatMode = useCallback(
    async (shop: string, mode: HeatmapMode) => {
      const paths = pinHomePath(
        routeIndex?.routes.map((item) => item.route) ?? [],
        (journey?.nodes ?? []).map((node) => node.route),
      );
      if (paths.length === 0) return;
      try {
        const batch = await getHeatmapBatch(shop, {
          routes: paths,
          device,
          mode,
          time: timeQuery,
          snapshot: false,
        });
        setMiniHeatmaps((previous) => mergeHeatmaps(previous, batch, false));
      } catch {
        // Keep the last overlay if a mode refresh fails.
      }
    },
    [device, journey?.nodes, routeIndex?.routes, timeQuery],
  );

  // Route-scoped timeline while drilling into a page heatmap.
  useEffect(() => {
    if (!shopId || surface !== "store" || !selectedRoute) return;
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
  }, [shopId, surface, selectedRoute, timeQuery, device, heatmapMode]);

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
    if (!shopId || surface !== "store") return;
    void loadSiteMap(shopId);
  }, [shopId, surface, loadSiteMap]);

  useEffect(() => {
    if (!shopId || surface !== "store") return;
    if (lastHeatMode.current === heatmapMode) return;
    lastHeatMode.current = heatmapMode;
    void loadHeatMode(shopId, heatmapMode);
  }, [heatmapMode, loadHeatMode, shopId, surface]);

  // Sessions for recordings tab (and manual refresh).
  useEffect(() => {
    if (!shopId || (!watchOpen && !selectedRoute)) return;
    void loadSessions(shopId).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Unable to load sessions.");
    });
  }, [shopId, watchOpen, selectedRoute, loadSessions]);

  // Live poll only on Recordings while the tab is visible.
  useEffect(() => {
    if (!shopId || (!watchOpen && !selectedRoute)) return;
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
  }, [shopId, watchOpen, selectedRoute, loadSessions]);

  // Drill-in full heatmap — depends on route + scrub, not session list refreshes.
  useEffect(() => {
    if (!shopId || !selectedRoute || surface !== "store") {
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
    surface,
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
    if (surface === "settings") {
      void getWorkspace(shopId)
        .then(setWorkspace)
        .catch(() => undefined);
      return;
    }
    if (watchOpen || selectedRoute) {
      void loadSessions(shopId).catch((caught: unknown) => {
        setError(
          caught instanceof Error ? caught.message : "Unable to refresh sessions.",
        );
      });
    }
    void loadSiteMap(shopId);
  };

  const openPage = (route: string) => {
    setSurface("store");
    setSelectedRoute(route);
    setWatchOpen(false);
  };

  const openWatch = (route?: string) => {
    if (route) setSelectedRoute(route);
    setWatchOpen(true);
    setSurface("store");
  };

  const activeCount = sessions.filter((session) => session.status === "active").length;
  const pageSessions = selectedRoute
    ? sessions.filter(
        (session) =>
          session.entryRoute === selectedRoute ||
          (session.routes ?? []).includes(selectedRoute),
      )
    : recordingSessions;
  const showTimeline = Boolean(
    selectedRoute && activity && activity.buckets.length > 0,
  );
  const sessionTotal = routeIndex?.totalSessions ?? 0;

  return (
    <div className="app-shell live-shell" data-demo={demo ? "true" : "false"}>
      <aside className="rail" aria-label="Primary navigation">
        <button
          className="brand-mark"
          onClick={() => {
            setSurface("store");
            setSelectedRoute(null);
            setWatchOpen(false);
          }}
          title="PathMinty"
          type="button"
          aria-label="PathMinty store"
        >
          <BrandMark size={36} />
        </button>
        <nav className="rail-nav">
          <button
            className="rail-button"
            data-active={surface === "store" && !selectedRoute}
            onClick={() => {
              setSurface("store");
              setSelectedRoute(null);
            }}
            title="Store"
            type="button"
          >
            <SquaresFour size={20} weight={!selectedRoute ? "fill" : "regular"} />
            <span>Store</span>
          </button>
          <button
            className="rail-button"
            data-active={surface === "settings"}
            onClick={() => setSurface("settings")}
            title="Settings"
            type="button"
          >
            <GearSix size={20} weight={surface === "settings" ? "fill" : "regular"} />
            <span>Plan</span>
          </button>
        </nav>
      </aside>
      <main className="workspace live-workspace" data-store="true">
        <header className="topbar store-topbar">
          <div className="title-lockup">
            <p>{shopLabel(shopId)}</p>
            <h1>
              {surface === "settings"
                ? "Plan & privacy"
                : selectedRoute
                  ? displayRouteLabel(selectedRoute)
                  : "The store"}
            </h1>
          </div>
          <div className="topbar-actions">
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
            {selectedRoute ? (
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
              </div>
            ) : null}
            <button
              className="control"
              data-active={demo ? "true" : "false"}
              onClick={() => setDemo((current) => !current)}
              type="button"
            >
              {demo ? "Show real data" : "Sample"}
            </button>
            {workspace ? (
              <button
                className="quota-chip"
                onClick={() => setSurface("settings")}
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
                {workspace.usage.billableSessions}/{workspace.usage.limit}
              </button>
            ) : null}
            <span className="sessions-count">
              {mapLoading ? "Loading…" : `${sessionTotal.toLocaleString()} sessions`}
              {activeCount > 0 ? ` · ${activeCount} live` : ""}
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

        {workspace && workspace.health.hint !== "ok" && surface !== "settings" ? (
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

        {surface === "settings" && workspace ? (
          <SettingsPage
            busy={planBusy}
            onBack={() => setSurface("store")}
            onSelectPlan={changePlan}
            workspace={workspace}
          />
        ) : null}

        {surface === "store" && selectedRoute ? (
          <section className="store-inspect">
            <div className="store-inspect-bar">
              <button
                className="control back-control"
                onClick={() => {
                  setSelectedRoute(null);
                  setWatchOpen(false);
                }}
                type="button"
              >
                <ArrowLeft size={14} /> Store
              </button>
              <span className="route-pill" title={selectedRoute}>
                {selectedRoute}
              </span>
              <span>
                {heatmap?.eventCount ?? 0} events · {heatmap?.sessionCount ?? 0}{" "}
                sessions
                {scrubIndex !== null ? " · scrubbed" : ""}
              </span>
            </div>
            <div className="store-inspect-stage">
              <HeatmapSurface heatmap={heatmap} loading={heatmapLoading} />
              {recs[0] && !demo ? (
                <aside className="store-insight">
                  <em>{recs[0].impact === "high" ? "Fix first" : "Worth a look"}</em>
                  <p>{recs[0].title}</p>
                  <span>{recs[0].body}</span>
                  <button
                    className="store-heat-btn"
                    onClick={() => openWatch(selectedRoute)}
                    type="button"
                  >
                    Watch matching sessions
                  </button>
                </aside>
              ) : (
                <aside className="store-insight">
                  <em>On this page</em>
                  <p>
                    {heatmap?.sessionCount ?? 0} sessions in {timePreset}. Heatmaps
                    count every visit.
                  </p>
                  <button
                    className="store-heat-btn"
                    onClick={() => openWatch(selectedRoute)}
                    type="button"
                  >
                    Watch matching sessions
                  </button>
                </aside>
              )}
            </div>
            {showTimeline && activity ? (
              <ActivityTimeline
                buckets={activity.buckets}
                selectedIndex={scrubIndex}
                onSelect={setScrubIndex}
              />
            ) : null}
          </section>
        ) : null}

        {surface === "store" && !selectedRoute ? (
          <div className="store-stage">
            {mapLoading && !routeIndex ? (
              <p className="site-map-status">Opening the store…</p>
            ) : routeIndex && routeIndex.routes.length === 0 && !demo ? (
              <EmptySessions onRefresh={refresh} />
            ) : (
              <StoreFloor
                demo={demo}
                heatmaps={miniHeatmaps}
                journey={journey}
                onOpenPage={openPage}
                onUseSample={() => setDemo(true)}
                onWatch={openWatch}
                recs={recs}
                routes={routeIndex?.routes ?? []}
              />
            )}
          </div>
        ) : null}

        {watchOpen ? (
          <aside className="watch-drawer" aria-label="Recordings">
            <header>
              <div>
                <p>Recordings</p>
                <h2>
                  {selectedRoute ? displayRouteLabel(selectedRoute) : "This range"}
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setWatchOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <p className="settings-note">
              Heatmaps count every visit. Full recordings keep about 1 in 20, plus
              rage-clicks.
            </p>
            <label className="bot-toggle">
              <input
                checked={hideBots}
                onChange={(event) => setHideBots(event.target.checked)}
                type="checkbox"
              />
              Hide bots
            </label>
            {pageSessions.length === 0 ? (
              <p className="site-map-status">No playable recordings here yet.</p>
            ) : (
              <SessionRows sessions={pageSessions} onOpen={openReplay} />
            )}
          </aside>
        ) : null}
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
