import { PLAN_CATALOG } from "@pathminty/contracts";

import { SHOPIFY_INSTALL_URL } from "../api/sessions";
import { BrandMark } from "../BrandMark";

const reasons = [
  {
    title: "See the page that leaks checkout",
    body: "A site canvas ranked by real sessions. Click in. Watch the heatmap. Stop guessing which collection or PDP is dead.",
  },
  {
    title: "Recordings that respect the shopper",
    body: "Inputs masked. Checkout DOM skipped. Analytics consent first. You get the motion, not the password.",
  },
  {
    title: "Billing that will not ambush you",
    body: "Human sessions only. Bots do not eat the quota. Hit the cap and recording pauses — we never silent-upgrade you to $249.",
  },
];

export function Landing() {
  return (
    <div className="marketing">
      <header className="marketing-nav">
        <a className="marketing-brand" href="/">
          <BrandMark size={32} />
          PathMinty
        </a>
        <nav>
          <a href="#why">Why</a>
          <a href="#pricing">Pricing</a>
          <a className="marketing-cta" href={SHOPIFY_INSTALL_URL}>
            Add to Shopify
          </a>
        </nav>
      </header>

      <section className="marketing-hero">
        <p className="marketing-kicker">Built for DTC. Not another generic heatmap.</p>
        <h1>Watch shoppers move. Fix the pages that lose the sale.</h1>
        <p className="marketing-lead">
          PathMinty is session replay, heatmaps, and journeys for Shopify stores —
          same-origin capture, consent-aware, and billed on human sessions. Microsoft
          Clarity is free and generic. We are the behavior lab that lives next to your
          theme.
        </p>
        <div className="marketing-actions">
          <a className="marketing-cta primary" href={SHOPIFY_INSTALL_URL}>
            Install free — 1,000 sessions
          </a>
          <a className="marketing-ghost" href="#pricing">
            See plans
          </a>
        </div>
        <p className="marketing-fine">
          No credit card to start. Enable the theme embed once. First session in about
          15 seconds.
        </p>
      </section>

      <section className="marketing-grid" id="why">
        {reasons.map((reason) => (
          <article key={reason.title}>
            <h2>{reason.title}</h2>
            <p>{reason.body}</p>
          </article>
        ))}
      </section>

      <section className="marketing-compare">
        <h2>Why merchants leave Clarity and Lucky Orange</h2>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Clarity</th>
              <th>Lucky Orange</th>
              <th>PathMinty</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Shopify-native billing</td>
              <td>No</td>
              <td>Yes, messy</td>
              <td>Yes, honest caps</td>
            </tr>
            <tr>
              <td>Consent + input masking</td>
              <td>Generic</td>
              <td>Varies</td>
              <td>Default on</td>
            </tr>
            <tr>
              <td>Site canvas of every route</td>
              <td>No</td>
              <td>Partial</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td>Bots burn your quota</td>
              <td>N/A (free)</td>
              <td>Often</td>
              <td>Filtered</td>
            </tr>
            <tr>
              <td>Capture health</td>
              <td>Silent fail</td>
              <td>Silent fail</td>
              <td>You see it</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="marketing-pricing" id="pricing">
        <h2>Simple plans. Human sessions.</h2>
        <p>Annual billing is not required. Upgrade or drop back to Free any month.</p>
        <div className="pricing-grid">
          {Object.values(PLAN_CATALOG).map((plan) => (
            <article
              key={plan.id}
              className="pricing-card"
              data-featured={plan.id === "launch"}
            >
              <p>{plan.headline}</p>
              <h3>{plan.name}</h3>
              <strong>
                {plan.priceUsd === 0 ? "Free" : `$${plan.priceUsd}`}
                <span>{plan.priceUsd === 0 ? "" : "/mo"}</span>
              </strong>
              <small>
                {plan.monthlySessions.toLocaleString()} human sessions ·{" "}
                {plan.retentionDays} days stored
              </small>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <a className="marketing-cta" href={SHOPIFY_INSTALL_URL}>
                {plan.priceUsd === 0 ? "Start free" : `Start on ${plan.name}`}
              </a>
            </article>
          ))}
        </div>
      </section>

      <footer className="marketing-footer">
        <p>PathMinty · Shopify behavior intelligence</p>
        <a href="/ops">Staff</a>
      </footer>
    </div>
  );
}
