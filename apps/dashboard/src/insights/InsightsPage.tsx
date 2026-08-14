import {
  CursorClick,
  House,
  ShoppingBag,
  ShoppingCart,
  Sparkle,
  SquaresFour,
  Storefront,
} from "@phosphor-icons/react";
import type { JourneyGraphResponse, RouteStat } from "@pathminty/contracts";
import { useMemo, useState } from "react";

import {
  buildDemoFunnelSteps,
  buildDemoProducts,
  buildDemoRecs,
  buildFunnelSteps,
  buildInsightRecs,
  buildProductInsights,
  formatPct,
  type FunnelStepId,
} from "./funnelModel";

const STEP_ICONS: Record<FunnelStepId, typeof House> = {
  home: House,
  browse: SquaresFour,
  product: ShoppingBag,
  cart: ShoppingCart,
  checkout: Storefront,
};

export function InsightsPage({
  routes,
  journey,
  onOpenHeatmap,
  onOpenRecordings,
}: {
  routes: readonly RouteStat[];
  journey: JourneyGraphResponse | null;
  onOpenHeatmap: (route?: string) => void;
  onOpenRecordings: () => void;
}) {
  const [pane, setPane] = useState<"funnel" | "products">("funnel");
  const [demo, setDemo] = useState(false);
  const liveSteps = useMemo(() => buildFunnelSteps(routes, journey), [routes, journey]);
  const liveProducts = useMemo(
    () => buildProductInsights(routes, journey),
    [routes, journey],
  );
  const liveRecs = useMemo(
    () => buildInsightRecs(liveSteps, liveProducts),
    [liveSteps, liveProducts],
  );
  const steps = demo ? buildDemoFunnelSteps() : liveSteps;
  const products = demo ? buildDemoProducts() : liveProducts;
  const recs = demo ? buildDemoRecs() : liveRecs;
  const home = steps[0]?.sessions ?? 0;
  const checkout = steps.find((step) => step.id === "checkout")?.sessions ?? 0;
  const reached = home > 0 ? checkout / home : null;
  const peak = Math.max(...steps.map((step) => step.sessions), 1);
  const top = products.slice(0, 6);
  const quiet = [...products]
    .filter((product) => product.sessions >= 2)
    .sort((left, right) => left.clicksPerVisit - right.clicksPerVisit)
    .slice(0, 5);

  return (
    <div className="insights" data-demo={demo ? "true" : "false"}>
      {demo ? (
        <p className="insights-demo-banner" role="status">
          Sample brand data for demos. This is not this shop. Click{" "}
          <strong>Show real data</strong> to switch back.
        </p>
      ) : null}
      <header className="insights-head">
        <div>
          <p>{demo ? "Sample preview" : "This shop"}</p>
          <h2>Funnel & merchandising</h2>
          <span>
            {demo
              ? "Sample brand data for pitches. Not this shop. Toggle off to show live PathMinty numbers."
              : "Built from PathMinty journeys. Checkout means reached checkout — not a verified purchase."}
          </span>
        </div>
        <div className="insights-head-actions">
          <button
            className="control"
            data-active={demo ? "true" : "false"}
            onClick={() => setDemo((current) => !current)}
            type="button"
          >
            {demo ? "Show real data" : "Test with sample data"}
          </button>
          <div className="mode-switch" aria-label="Insights pane">
            <button
              data-active={pane === "funnel"}
              onClick={() => setPane("funnel")}
              type="button"
            >
              Funnel
            </button>
            <button
              data-active={pane === "products"}
              onClick={() => setPane("products")}
              type="button"
            >
              Products
            </button>
          </div>
        </div>
      </header>

      {pane === "funnel" ? (
        <div className="insights-grid">
          <section className="insights-card insights-funnel">
            <div className="insights-funnel-steps">
              {steps.map((step) => {
                const Icon = STEP_ICONS[step.id];
                return (
                  <div className="insights-step" key={step.id}>
                    <Icon size={16} />
                    <strong>{step.label}</strong>
                    <b>{step.sessions.toLocaleString()}</b>
                  </div>
                );
              })}
            </div>
            <div className="insights-funnel-viz" aria-hidden>
              {steps.map((step) => (
                <i
                  key={step.id}
                  style={{ height: `${Math.max(8, (step.sessions / peak) * 100)}%` }}
                />
              ))}
            </div>
            <div className="insights-funnel-rates">
              {steps.map((step, index) => (
                <div key={step.id}>
                  {index === 0 ? (
                    <em>100%</em>
                  ) : (
                    <em>{formatPct(step.fromPrevious)}</em>
                  )}
                  {step.dropOffCount !== null && step.dropOffCount > 0 ? (
                    <small>
                      {step.dropOffCount.toLocaleString()} · {formatPct(step.dropOff)}{" "}
                      drop-off
                    </small>
                  ) : (
                    <small>From previous step</small>
                  )}
                </div>
              ))}
            </div>
          </section>

          <aside className="insights-side">
            <article className="insights-kpi">
              <p>Reached checkout</p>
              <strong>{formatPct(reached)}</strong>
              <small>of landing sessions</small>
            </article>
            <article className="insights-kpi">
              <p>Biggest leak</p>
              <strong>
                {recs[0]?.title.replace(/ is where shoppers leave/u, "") ?? "—"}
              </strong>
              <small>Behavioral, not purchase</small>
            </article>
            <div className="insights-recs">
              <p>
                <Sparkle size={14} /> Suggestions
              </p>
              {recs.length === 0 ? (
                <span>Need more journey volume to recommend a next move.</span>
              ) : (
                recs.map((rec) => (
                  <article key={rec.title} data-impact={rec.impact}>
                    <b>{rec.title}</b>
                    <span>{rec.body}</span>
                    <button
                      className="control"
                      disabled={demo}
                      onClick={() =>
                        rec.action === "recordings"
                          ? onOpenRecordings()
                          : onOpenHeatmap(rec.route)
                      }
                      type="button"
                    >
                      {demo
                        ? "Sample only"
                        : rec.action === "recordings"
                          ? "View recordings"
                          : "View heatmap"}
                    </button>
                  </article>
                ))
              )}
            </div>
          </aside>
        </div>
      ) : (
        <div className="insights-grid insights-grid-products">
          <section className="insights-card">
            <div className="insights-kpis">
              <article>
                <p>Product pages</p>
                <strong>{products.length}</strong>
              </article>
              <article>
                <p>Clicks / visit</p>
                <strong>
                  {products[0] ? products[0].clicksPerVisit.toFixed(2) : "—"}
                </strong>
                <small>top product</small>
              </article>
              <article>
                <p>Checkout reach</p>
                <strong>{formatPct(products[0]?.checkoutRate ?? null)}</strong>
                <small>top product</small>
              </article>
            </div>
            <h3>Top products</h3>
            <table className="insights-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Sessions</th>
                  <th>Clicks</th>
                  <th>Clicks / visit</th>
                  <th>Checkout reach</th>
                </tr>
              </thead>
              <tbody>
                {top.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No product pages in this range.</td>
                  </tr>
                ) : (
                  top.map((product) => (
                    <tr key={product.route}>
                      <td>
                        <button
                          className="insights-link"
                          disabled={demo}
                          onClick={() => onOpenHeatmap(product.route)}
                          type="button"
                        >
                          {product.label}
                        </button>
                      </td>
                      <td>{product.sessions.toLocaleString()}</td>
                      <td>{product.clicks.toLocaleString()}</td>
                      <td>{product.clicksPerVisit.toFixed(2)}</td>
                      <td>{formatPct(product.checkoutRate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
          <aside className="insights-side">
            <div className="insights-recs">
              <p>
                <CursorClick size={14} /> Quiet products
              </p>
              {quiet.length === 0 ? (
                <span>No quiet product pages yet.</span>
              ) : (
                quiet.map((product) => (
                  <article key={product.route} data-impact="medium">
                    <b>{product.label}</b>
                    <span>
                      {product.sessions} sessions · {product.clicksPerVisit.toFixed(2)}{" "}
                      clicks / visit
                    </span>
                    <button
                      className="control"
                      disabled={demo}
                      onClick={() => onOpenHeatmap(product.route)}
                      type="button"
                    >
                      {demo ? "Sample only" : "View heatmap"}
                    </button>
                  </article>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
