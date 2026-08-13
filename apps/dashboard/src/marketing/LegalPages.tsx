import type { ReactNode } from "react";

import { BrandMark } from "../BrandMark";

const SUPPORT_EMAIL = "jurius.law@gmail.com";
const SITE = "https://pathminty-dashboard-dev.pathminty-collector.workers.dev";

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="marketing legal-page">
      <header className="marketing-nav">
        <a className="marketing-brand" href="/">
          <BrandMark size={32} />
          PathMinty
        </a>
        <nav>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/support">Support</a>
        </nav>
      </header>
      <article className="legal-body">
        <p className="marketing-kicker">PathMinty</p>
        <h1>{title}</h1>
        {children}
      </article>
      <footer className="marketing-footer">
        <p>PathMinty · Shopify behavior intelligence</p>
        <span>
          <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> ·{" "}
          <a href="/support">Support</a>
        </span>
      </footer>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy policy">
      <p>Last updated 13 August 2026.</p>
      <p>
        PathMinty helps Shopify merchants understand consented storefront behavior. This
        policy describes what we collect, why, and how to ask us to delete it.
      </p>
      <h2>Who we are</h2>
      <p>
        PathMinty is operated by the PathMinty team. Contact{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Merchant account data:</strong> Shopify shop domain, installation
          state, plan, and usage counts.
        </li>
        <li>
          <strong>Storefront behavior (after analytics consent):</strong> page routes,
          clicks, hover/scroll samples, viewport size, and privacy-masked session
          recordings. Form values, keystrokes, and checkout DOM are not recorded.
        </li>
        <li>
          <strong>Shopify customer events</strong> from the official Web Pixel (page,
          product, cart, checkout started/completed). Search terms have obvious emails
          and phone numbers masked.
        </li>
        <li>
          We do not collect customer names, emails, phone numbers, addresses, or payment
          details as product features.
        </li>
      </ul>
      <h2>Where it lives</h2>
      <p>
        Replay files are stored in Cloudflare R2. Shop, usage, and operational facts may
        be stored in Cloudflare KV and Neon Postgres (United States). We do not put raw
        replay events in Postgres.
      </p>
      <h2>Retention</h2>
      <p>
        Replay retention follows the subscribed plan (14 / 30 / 60 days). Human-session
        usage counters reset each UTC month. Uninstall or Shopify shop/redact queues
        deletion of that shop’s replay objects and usage keys.
      </p>
      <h2>Consent</h2>
      <p>
        Recording starts only when Shopify reports that analytics processing is allowed.
        Ad blockers and strict browsers can prevent capture.
      </p>
      <h2>Requests</h2>
      <p>
        Shopify compliance webhooks handle customer data requests and redactions.
        Because sessions are anonymous, we cannot map a recording to a customer name or
        email. Shop-level deletion is executed on uninstall and on{" "}
        <code>shop/redact</code>. Email {SUPPORT_EMAIL} for operator questions.
      </p>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of use">
      <p>Last updated 13 August 2026.</p>
      <p>
        By installing PathMinty you agree to these terms. If you do not agree, uninstall
        the app.
      </p>
      <h2>The service</h2>
      <p>
        PathMinty provides heatmaps, journeys, and privacy-masked session recordings for
        Shopify stores. Insights are observational. They are not sales guarantees.
      </p>
      <h2>Your responsibilities</h2>
      <ul>
        <li>Enable the theme app embed and honor your storefront consent banner.</li>
        <li>Use recordings only for legitimate store optimization.</li>
        <li>Do not attempt to recover masked form values or identify shoppers.</li>
      </ul>
      <h2>Billing</h2>
      <p>
        Plans are billed on human sessions after bot/short filtering. Free includes
        1,000 sessions / 14-day retain. Launch is $19 / 10,000 / 30 days. Growth is $49
        / 50,000 / 60 days. Recording pauses at the cap. Paid plans confirm through
        Shopify Billing.
      </p>
      <h2>Availability</h2>
      <p>
        The current live surface is hosted on Cloudflare Workers. We may change
        features, pause capture for abuse, or discontinue the service with notice via
        the app or email.
      </p>
      <h2>Limitation</h2>
      <p>
        The service is provided as-is. We are not liable for lost profits, lost data
        beyond our deletion obligations, or third-party (Shopify, browser, ad-blocker)
        failures.
      </p>
      <h2>Contact</h2>
      <p>
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> ·{" "}
        <a href={`${SITE}/support`}>Support</a>
      </p>
    </LegalShell>
  );
}

export function SupportPage() {
  return (
    <LegalShell title="Support">
      <p>
        Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We read every
        merchant note.
      </p>
      <h2>Get data flowing</h2>
      <ol>
        <li>Install PathMinty from Shopify Admin.</li>
        <li>Open the app. Storefront connection starts automatically.</li>
        <li>Theme editor → App embeds → enable PathMinty Recorder → Save.</li>
        <li>Visit the storefront and accept analytics cookies if asked.</li>
        <li>Open the dashboard. Sessions appear within about 15 seconds.</li>
      </ol>
      <h2>Nothing showing?</h2>
      <ul>
        <li>The health banner tells you if the embed is silent or quota is paused.</li>
        <li>Ad blockers can hide the recorder. Try a normal window.</li>
        <li>
          Checkout pages are not DOM-recorded. That is a Shopify limit, not a bug.
        </li>
      </ul>
      <h2>Billing</h2>
      <p>
        Change plans in Shopify Admin → PathMinty → Plan. Usage on the dashboard always
        matches the subscribed cap.
      </p>
      <p>
        <a className="marketing-cta" href={`mailto:${SUPPORT_EMAIL}`}>
          Email support
        </a>
      </p>
    </LegalShell>
  );
}

export const LIVE_ORIGIN = SITE;
export const LIVE_SUPPORT_EMAIL = SUPPORT_EMAIL;
