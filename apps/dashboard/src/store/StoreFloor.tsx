import type {
  HeatmapMode,
  HeatmapResponse,
  JourneyGraphResponse,
  RouteStat,
} from "@pathminty/contracts";

import { HeatmapSurface } from "../components/HeatmapSurface";
import { RouteCardPreview } from "../components/RouteCardPreview";
import { formatPct, type InsightRec } from "../insights/funnelModel";
import { displayRouteLabel } from "../siteCanvasLayout";
import {
  buildDemoSpine,
  buildStoreSpine,
  pickHomeRoute,
  storeCanDraw,
  type SpinePage,
} from "./storeModel";

function leakTone(page: SpinePage): "high" | "mid" | "none" {
  if ((page.dropOffCount ?? 0) <= 0) return "none";
  if ((page.dropOff ?? 0) >= 0.45) return "high";
  return "mid";
}

function modeLabel(mode: HeatmapMode) {
  if (mode === "hover") return "Hover heatmap";
  if (mode === "scroll") return "Scroll heatmap";
  return "Click heatmap";
}

export function StoreFloor({
  routes,
  journey,
  heatmaps,
  homeHeatmap,
  homeLoading,
  heatmapMode,
  recs,
  demo,
  onOpenPage,
  onSeeAllPages,
  onWatch,
  onUseSample,
}: {
  routes: readonly RouteStat[];
  journey: JourneyGraphResponse | null;
  heatmaps: Record<string, HeatmapResponse>;
  homeHeatmap: HeatmapResponse | null;
  homeLoading: boolean;
  heatmapMode: HeatmapMode;
  recs: readonly InsightRec[];
  demo: boolean;
  onOpenPage: (route: string) => void;
  onSeeAllPages: () => void;
  onWatch: (route?: string) => void;
  onUseSample: () => void;
}) {
  const spine = demo ? buildDemoSpine() : buildStoreSpine(routes, journey);
  const drawable = demo || storeCanDraw(routes, journey);
  const leftover = demo
    ? 0
    : Math.max(0, routes.length - new Set(spine.map((page) => page.route)).size);
  const sources = demo ? [] : (journey?.acquisitions ?? []).slice(0, 3);
  const verdict = recs[0];
  const homeRoute = demo ? "/" : pickHomeRoute(routes, journey);
  const homeStop = spine.find((page) => page.id === "home");
  const homeHeat = homeHeatmap ?? heatmaps[homeRoute] ?? null;
  const liveHits = spine.filter((page) => page.sessions > 0);

  return (
    <section className="store-floor">
      <div className="store-hero">
        <div className="store-verdict">
          <p>{demo ? "Sample preview" : modeLabel(heatmapMode)}</p>
          <h1>
            Home. <em>Where shoppers tap first.</em>
          </h1>
          <span>
            {demo
              ? "Sample heat on a homepage so you can see the product."
              : homeHeat
                ? `${homeHeat.sessionCount.toLocaleString()} sessions · ${homeHeat.eventCount.toLocaleString()} ${
                    heatmapMode === "hover" ? "attention samples" : "clicks"
                  } on ${homeRoute}`
                : homeStop && homeStop.sessions > 0
                  ? `${homeStop.sessions.toLocaleString()} homepage sessions — heat is loading.`
                  : "Homepage heat shows up as soon as someone lands on / with consent."}
          </span>
          <div className="store-hero-actions">
            <button
              className="store-heat-btn"
              onClick={() => onOpenPage(homeRoute)}
              type="button"
            >
              Open Home heatmap
            </button>
            <button
              className="control"
              onClick={() => onWatch(homeRoute)}
              type="button"
            >
              Watch Home sessions
            </button>
          </div>
        </div>
        <button
          className="store-hero-frame"
          onClick={() => onOpenPage(homeRoute)}
          type="button"
        >
          {demo ? (
            <img
              alt="Sample click heatmap on a homepage"
              src="/assets/heavenly-heatmap.png"
            />
          ) : (
            <HeatmapSurface heatmap={homeHeat} loading={homeLoading && !homeHeat} />
          )}
        </button>
      </div>

      {!drawable ? (
        <p className="store-more">
          {liveHits.filter((page) => page.id !== "home").length === 0
            ? "Not a path yet — stay on Home until another step has traffic."
            : `${liveHits
                .map((page) => `${page.sessions.toLocaleString()} on ${page.label}`)
                .join(", ")}. Need two busy steps to draw the rest of the path.`}{" "}
          <button className="store-watch-link" onClick={onUseSample} type="button">
            Test with sample data
          </button>
        </p>
      ) : verdict ? (
        <p className="store-more">
          {verdict.title}. {verdict.body.split(".")[0]}.
        </p>
      ) : null}

      <div className="store-path">
        {spine.map((page, index) => (
          <div className="store-stop" key={page.id}>
            {index > 0 ? (
              <div className="store-edge" data-leak={leakTone(page)}>
                <i />
                <span>
                  {page.dropOffCount && page.dropOffCount > 0
                    ? `−${page.dropOffCount.toLocaleString()} · ${formatPct(page.dropOff)}`
                    : "held"}
                </span>
              </div>
            ) : null}
            <button
              className="store-page"
              onClick={() => onOpenPage(page.route)}
              type="button"
            >
              <span className="store-page-url">{page.route}</span>
              <span className="store-page-preview">
                <RouteCardPreview active={!demo} heatmap={heatmaps[page.route]} />
              </span>
              <span className="store-page-meta">
                <span>
                  <strong>{page.label}</strong>
                  <small>{displayRouteLabel(page.route)}</small>
                </span>
                <b>{page.sessions.toLocaleString()}</b>
              </span>
            </button>
          </div>
        ))}
      </div>

      {sources.length > 0 ? (
        <div className="store-sources">
          {sources.map((source) => (
            <div className="store-src" key={source.key}>
              <b>
                {source.source}
                {source.medium ? ` / ${source.medium}` : ""}
              </b>
              {source.sessionCount.toLocaleString()} landed on{" "}
              {displayRouteLabel(source.landingRoute)}
            </div>
          ))}
        </div>
      ) : null}

      {leftover > 0 ? (
        <button className="store-watch-link" onClick={onSeeAllPages} type="button">
          {leftover} more pages on the map
        </button>
      ) : (
        <button className="store-watch-link" onClick={onSeeAllPages} type="button">
          Open the full page map
        </button>
      )}

      {verdict ? (
        <button className="store-watch-link" onClick={() => onWatch()} type="button">
          Watch matching sessions
        </button>
      ) : null}
    </section>
  );
}
