import {
  CheckCircle,
  CursorClick,
  House,
  ShoppingBag,
  ShoppingCart,
  Sparkle,
  SquaresFour,
  Storefront,
  TrendDown,
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
  canDrawFunnel,
  drawnFunnelSteps,
  formatPct,
  skippedFunnelLabels,
  type FunnelStep,
  type FunnelStepId,
} from "./funnelModel";

const STEP_ICONS: Record<FunnelStepId, typeof House> = {
  home: House,
  browse: SquaresFour,
  product: ShoppingBag,
  cart: ShoppingCart,
  checkout: Storefront,
  purchase: CheckCircle,
};

function FunnelShape({ steps }: { steps: readonly FunnelStep[] }) {
  const width = 1000;
  const height = 220;
  const mid = height / 2;
  const peak = Math.max(...steps.map((step) => step.sessions), 1);
  const minH = 28;
  const maxH = 176;
  const pad = 8;
  const slice = (width - pad * 2) / Math.max(steps.length, 1);

  // Only taper. Mid-funnel entries must not balloon the shape.
  let prevH = maxH;
  const bands = steps.map((step, index) => {
    const raw = minH + (step.sessions / peak) * (maxH - minH);
    const h = index === 0 ? raw : Math.min(prevH, raw);
    prevH = h;
    return {
      step,
      x0: pad + index * slice,
      x1: pad + (index + 1) * slice,
      h,
    };
  });

  const last = bands[bands.length - 1];
  const first = bands[0];
  const outline =
    first && last
      ? `${first.x0},${mid - first.h / 2} ${bands.map((band) => `${band.x1},${mid - band.h / 2}`).join(" ")} ${last.x1},${mid + last.h / 2} ${[
          ...bands,
        ]
          .reverse()
          .map((band) => `${band.x0},${mid + band.h / 2}`)
          .join(" ")}`
      : "";

  return (
    <svg
      aria-hidden
      className="funnel-svg"
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <linearGradient id="funnelFill" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#8b7cff" />
          <stop offset="55%" stopColor="#6d5efc" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <polygon fill="url(#funnelFill)" opacity="0.95" points={outline} />
      {bands.map((band) => (
        <g key={band.step.id}>
          <line
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1"
            x1={band.x1}
            x2={band.x1}
            y1={mid - band.h / 2}
            y2={mid + band.h / 2}
          />
          <text
            fill="#fff"
            fontSize="22"
            fontWeight="700"
            textAnchor="middle"
            x={(band.x0 + band.x1) / 2}
            y={mid + 8}
          >
            {band.step.fromPrevious === null && band.step.id !== "home"
              ? "—"
              : formatPct(band.step.fromPrevious ?? 1)}
          </text>
        </g>
      ))}
    </svg>
  );
}

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
  const drawn = drawnFunnelSteps(steps);
  const drawable = demo || canDrawFunnel(steps);
  const skipped = skippedFunnelLabels(steps);
  const liveHits = steps.filter((step) => step.sessions > 0);
  const home = steps.find((step) => step.id === "home")?.sessions ?? 0;
  const checkout = steps.find((step) => step.id === "checkout")?.sessions ?? 0;
  const purchase = steps.find((step) => step.id === "purchase")?.sessions ?? 0;
  const reached = home > 0 ? checkout / home : null;
  const cart = steps.find((step) => step.id === "cart")?.sessions ?? 0;
  const abandon = cart > 0 && checkout <= cart ? (cart - checkout) / cart : null;
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
          <p>{demo ? "Sample preview" : "Live shop"}</p>
          <h2>{pane === "funnel" ? "Conversion funnel" : "Product merchandising"}</h2>
          <span>
            {demo
              ? "How Insights look with a full month of storefront traffic."
              : "How shoppers move through your store. Checkout is reached checkout, not a paid order."}
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
        <>
          <section className="funnel-board">
            {drawable ? (
              <>
                <div
                  className="funnel-stage-row"
                  style={{
                    gridTemplateColumns: `repeat(${drawn.length}, minmax(0, 1fr))`,
                  }}
                >
                  {drawn.map((step) => {
                    const Icon = STEP_ICONS[step.id];
                    return (
                      <div className="funnel-stage" key={step.id}>
                        <span className="funnel-stage-icon">
                          <Icon size={18} />
                        </span>
                        <strong>{step.label}</strong>
                        <b>{step.sessions.toLocaleString()}</b>
                      </div>
                    );
                  })}
                </div>

                <FunnelShape steps={drawn} />

                <div
                  className="funnel-drop-row"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(drawn.length - 1, 1)}, minmax(0, 1fr))`,
                    marginInline: `${50 / Math.max(drawn.length, 1)}%`,
                  }}
                >
                  {drawn.slice(1).map((step, index) => {
                    const previous = drawn[index];
                    if (step.dropOffCount !== null && step.dropOffCount > 0) {
                      return (
                        <div className="funnel-drop" key={step.id}>
                          <TrendDown size={14} />
                          <strong>{step.dropOffCount.toLocaleString()}</strong>
                          <span>{formatPct(step.dropOff)} drop-off</span>
                        </div>
                      );
                    }
                    const enteredHere =
                      previous !== undefined && previous.sessions < step.sessions;
                    return (
                      <div className="funnel-drop is-quiet" key={step.id}>
                        <span>
                          {enteredHere
                            ? `Also entered at ${step.label.toLowerCase()}`
                            : `Held through ${step.label.toLowerCase()}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="funnel-legend">
                  {skipped.length > 0
                    ? `No sessions on ${skipped.join(", ")} — omitted so the shape only tapers.`
                    : "Width is traffic. The shape only tapers. Each % is from the previous step shown."}
                </p>
              </>
            ) : (
              <div className="funnel-sparse">
                <p>Not a funnel yet.</p>
                <span>
                  {liveHits.length === 0
                    ? "No journey volume in this range."
                    : `${liveHits
                        .map(
                          (step) =>
                            `${step.sessions.toLocaleString()} on ${step.label}`,
                        )
                        .join(", ")}. Need traffic on at least two steps.`}
                </span>
                <button className="control" onClick={() => setDemo(true)} type="button">
                  Test with sample data
                </button>
                <div className="funnel-stage-row funnel-stage-row-muted">
                  {steps.map((step) => {
                    const Icon = STEP_ICONS[step.id];
                    return (
                      <div
                        className="funnel-stage"
                        data-empty={step.sessions === 0 ? "true" : "false"}
                        key={step.id}
                      >
                        <span className="funnel-stage-icon">
                          <Icon size={16} />
                        </span>
                        <strong>{step.label}</strong>
                        <b>{step.sessions.toLocaleString()}</b>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {drawable ? (
            <>
              <div className="funnel-kpis">
                <article>
                  <p>Reached checkout</p>
                  <strong>{formatPct(reached)}</strong>
                  <small>of landing sessions</small>
                </article>
                <article>
                  <p>Left before checkout</p>
                  <strong>{formatPct(abandon)}</strong>
                  <small>of carts that never checked out</small>
                </article>
                <article>
                  <p>Checkout sessions</p>
                  <strong>{checkout.toLocaleString()}</strong>
                  <small>behavioral checkout, not purchase</small>
                </article>
                <article>
                  <p>Purchases</p>
                  <strong>
                    {demo || purchase > 0 ? purchase.toLocaleString() : "—"}
                  </strong>
                  <small>
                    {demo || purchase > 0
                      ? "orders joined to a session"
                      : "order join is not on yet"}
                  </small>
                </article>
              </div>

              <section className="funnel-recs">
                <h3>
                  <Sparkle size={16} /> What to fix first
                </h3>
                <div className="funnel-rec-grid">
                  {recs.length === 0 ? (
                    <p className="funnel-empty">
                      Need more volume to recommend a next move.
                    </p>
                  ) : (
                    recs.map((rec) => (
                      <article data-impact={rec.impact} key={rec.title}>
                        <em>
                          {rec.impact === "high" ? "High impact" : "Medium impact"}
                        </em>
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
              </section>
            </>
          ) : null}
        </>
      ) : (
        <>
          <div className="funnel-kpis merch-kpis">
            <article>
              <p>Product pages</p>
              <strong>{products.length}</strong>
              <small>with traffic in range</small>
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
            <article>
              <p>Quiet SKUs</p>
              <strong>{quiet.length}</strong>
              <small>visits but few clicks</small>
            </article>
          </div>

          <div className="merch-tables">
            <section className="funnel-board">
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
            <section className="funnel-board">
              <h3>
                <CursorClick size={16} /> Under-clicking
              </h3>
              <table className="insights-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Sessions</th>
                    <th>Clicks / visit</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {quiet.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No quiet product pages yet.</td>
                    </tr>
                  ) : (
                    quiet.map((product) => (
                      <tr key={product.route}>
                        <td>{product.label}</td>
                        <td>{product.sessions.toLocaleString()}</td>
                        <td>{product.clicksPerVisit.toFixed(2)}</td>
                        <td>
                          <button
                            className="control"
                            disabled={demo}
                            onClick={() => onOpenHeatmap(product.route)}
                            type="button"
                          >
                            {demo ? "Sample" : "Heatmap"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
