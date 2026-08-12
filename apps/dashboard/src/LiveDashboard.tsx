import {
  ArrowClockwise,
  CursorClick,
  DeviceMobile,
  DeviceTablet,
  MapTrifold,
  Monitor,
  Play,
  Record,
  Storefront,
} from "@phosphor-icons/react";
import type {
  HeatmapMode,
  HeatmapResponse,
  ReplaySessionResponse,
  SessionSummary,
} from "@pathminty/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  exchangeDashboardTicket,
  getDashboardShop,
  getHeatmap,
  getReplay,
  getSessions,
} from "./api/sessions";
import { HeatmapSurface } from "./components/HeatmapSurface";
import { ReplayViewer } from "./components/ReplayViewer";

type View = "Heatmaps" | "Recordings";

const views: Array<{ label: View; icon: typeof MapTrifold }> = [
  { label: "Heatmaps", icon: MapTrifold },
  { label: "Recordings", icon: Record },
];

const POLL_MS = 15_000;

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

function EmptySessions({ onRefresh }: { onRefresh: () => void }) {
  return (
    <section className="live-empty">
      <span className="live-empty-icon">
        <CursorClick size={22} />
      </span>
      <p>No storefront recordings yet</p>
      <h2>Create your first recording</h2>
      <p>
        1. Open Shopify Admin → Online Store → Themes → Customize → App embeds and
        enable PathMinty Recorder.
        <br />
        2. Visit the storefront and accept analytics cookies if your region requires
        consent.
        <br />
        3. Browse a couple of pages, then return here and refresh. Active sessions
        appear within about 15 seconds.
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
  const [route, setRoute] = useState<string>("");
  const [device, setDevice] = useState<"all" | SessionSummary["device"]>("all");
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("click");
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [replay, setReplay] = useState<ReplaySessionResponse | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);

  const loadSessions = useCallback(async (shop: string) => {
    const result = await getSessions(shop);
    setSessions(result);
    setError("");
    return result;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const search = new URLSearchParams(window.location.search);
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        // Prefer query (redirect-safe); keep hash for any older handoff links.
        const ticket = search.get("ticket") ?? fragment.get("ticket");
        // Drop the one-time ticket from the URL before exchange so a refresh
        // cannot re-submit a consumed token.
        if (ticket) history.replaceState(null, "", window.location.pathname);

        let shop: string | null = null;
        if (ticket) {
          try {
            shop = await exchangeDashboardTicket(ticket);
          } catch (exchangeError) {
            // Concurrent exchange or refresh after success may leave a session cookie.
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
        const result = await getSessions(shop);
        if (cancelled) return;
        setShopId(shop);
        setSessions(result);
        setStatus("ready");
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

  // Poll for live session appearance while the dashboard is open.
  useEffect(() => {
    if (!shopId) return;
    const timer = window.setInterval(() => {
      void loadSessions(shopId).catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [shopId, loadSessions]);

  const routes = useMemo(
    () => [...new Set(sessions.flatMap((session) => session.routes))].sort(),
    [sessions],
  );

  useEffect(() => {
    if (routes.length === 0) {
      setRoute("");
      return;
    }
    if (!route || !routes.includes(route)) {
      setRoute(routes[0] ?? "");
    }
  }, [routes, route]);

  useEffect(() => {
    if (!shopId || !route) {
      setHeatmap(null);
      return;
    }
    let cancelled = false;
    setHeatmapLoading(true);
    void (async () => {
      try {
        const result = await getHeatmap(shopId, {
          route,
          device,
          mode: heatmapMode,
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
  }, [shopId, route, device, heatmapMode, sessions]);

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
    return (
      <main className="empty-dashboard">
        <section className="empty-dashboard-card">
          <img src="/assets/pathminty-app-icon.png" alt="" />
          <p className="empty-dashboard-kicker">PathMinty analytics</p>
          <h1>
            {status === "loading" ? "Opening your store…" : "Dashboard access needed"}
          </h1>
          <p>
            {status === "loading" ? "Verifying the secure Shopify handoff." : error}
          </p>
        </section>
      </main>
    );
  }

  const refresh = () =>
    void loadSessions(shopId).catch((caught: unknown) => {
      setError(
        caught instanceof Error ? caught.message : "Unable to refresh sessions.",
      );
    });

  const activeCount = sessions.filter((session) => session.status === "active").length;
  const dataStatus =
    sessions.length === 0
      ? "Awaiting data"
      : activeCount > 0
        ? `${activeCount} active`
        : "Live data";

  return (
    <div className="app-shell live-shell">
      <aside className="rail" aria-label="Primary navigation">
        <button
          className="brand-mark"
          onClick={() => setView("Heatmaps")}
          type="button"
        >
          <img src="/assets/pathminty-app-icon.png" alt="PathMinty" />
        </button>
        <nav className="rail-nav">
          {views.map(({ label, icon: Icon }) => (
            <button
              className="rail-button"
              data-active={view === label}
              key={label}
              onClick={() => setView(label)}
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
            <h1>{view}</h1>
          </div>
          <div className="topbar-actions">
            <span className="demo-chip live-chip">
              <span /> {dataStatus}
            </span>
            <span className="control store-switcher">
              <Storefront size={16} />
              {shopId}
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

        {sessions.length === 0 ? (
          <EmptySessions onRefresh={refresh} />
        ) : (
          <div className="live-content">
            {error && (
              <div className="live-error" role="alert">
                {error}
              </div>
            )}

            {view === "Heatmaps" && (
              <>
                <section className="live-toolbar">
                  <label>
                    Route
                    <select
                      aria-label="Route"
                      value={route}
                      onChange={(event) => setRoute(event.target.value)}
                    >
                      {routes.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
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
                      Hover / Dwell
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
                  <span>
                    {heatmap?.eventCount ?? 0} events · {heatmap?.sessionCount ?? 0}{" "}
                    sessions
                  </span>
                </section>
                <HeatmapSurface heatmap={heatmap} loading={heatmapLoading} />
              </>
            )}

            {view === "Recordings" && (
              <section className="live-panel">
                <div className="panel-heading">
                  <div>
                    <p>Behaviour</p>
                    <h2>Session recordings</h2>
                  </div>
                  <span>
                    {activeCount} active · {sessions.length} total · auto-refresh 15s
                  </span>
                </div>
                <SessionRows sessions={sessions} onOpen={openReplay} />
              </section>
            )}
          </div>
        )}
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
