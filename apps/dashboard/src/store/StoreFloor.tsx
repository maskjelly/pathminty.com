import type {
  HeatmapResponse,
  JourneyGraphResponse,
  RouteStat,
} from "@pathminty/contracts";

import { RouteCardPreview } from "../components/RouteCardPreview";
import { formatPct, type InsightRec } from "../insights/funnelModel";
import { displayRouteLabel } from "../siteCanvasLayout";
import {
  buildDemoSpine,
  buildStoreSpine,
  storeCanDraw,
  type SpinePage,
} from "./storeModel";

function leakTone(page: SpinePage): "high" | "mid" | "none" {
  if ((page.dropOffCount ?? 0) <= 0) return "none";
  if ((page.dropOff ?? 0) >= 0.45) return "high";
  return "mid";
}

export function StoreFloor({
  routes,
  journey,
  heatmaps,
  recs,
  demo,
  onOpenPage,
  onWatch,
  onUseSample,
}: {
  routes: readonly RouteStat[];
  journey: JourneyGraphResponse | null;
  heatmaps: Record<string, HeatmapResponse>;
  recs: readonly InsightRec[];
  demo: boolean;
  onOpenPage: (route: string) => void;
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
  const liveHits = spine.filter((page) => page.sessions > 0);

  if (!drawable) {
    const lonely = liveHits[0];
    return (
      <section className="store-sparse">
        {lonely ? (
          <button
            className="store-page is-lonely"
            onClick={() => onOpenPage(lonely.route)}
            type="button"
          >
            <span className="store-page-url">{lonely.route}</span>
            <span className="store-page-preview">
              <RouteCardPreview active heatmap={heatmaps[lonely.route]} />
            </span>
            <span className="store-page-meta">
              <strong>{lonely.label}</strong>
              <b>{lonely.sessions.toLocaleString()}</b>
            </span>
          </button>
        ) : null}
        <h1>Not a path yet.</h1>
        <p>
          {liveHits.length === 0
            ? "No journey volume in this range."
            : `${liveHits
                .map((page) => `${page.sessions.toLocaleString()} on ${page.label}`)
                .join(", ")}. Need traffic on at least two steps.`}
        </p>
        <button className="store-heat-btn" onClick={onUseSample} type="button">
          Test with sample data
        </button>
      </section>
    );
  }

  return (
    <section className="store-floor">
      <div className="store-verdict">
        <p>{demo ? "Sample preview" : "What to fix first"}</p>
        <h1>
          {verdict ? (
            <>
              {verdict.title}. <em>{verdict.body.split(".")[0]}.</em>
            </>
          ) : (
            <>{spine[0]?.sessions.toLocaleString() ?? "0"} shoppers on this path.</>
          )}
        </h1>
        {spine[0] ? (
          <button
            className="store-heat-btn"
            onClick={() => onOpenPage(spine[0]!.route)}
            type="button"
          >
            Open {spine[0].label}
          </button>
        ) : null}
      </div>

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
        <p className="store-more">
          {leftover} more pages in range — open a step to inspect one.
        </p>
      ) : null}

      {verdict ? (
        <button className="store-watch-link" onClick={() => onWatch()} type="button">
          Watch matching sessions
        </button>
      ) : null}
    </section>
  );
}
