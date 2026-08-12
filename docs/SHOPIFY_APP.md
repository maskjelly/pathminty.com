# Shopify app

PathMinty is registered as an embedded Shopify app. The embedded surface exists only for
installation and setup; merchants use the standalone PathMinty dashboard for analytics.

## Data collection

Two official Shopify extensions split the work by capability:

1. `pathminty-events` is a Web Pixel. It receives Shopify's standardized page, product,
   search, cart, checkout, and purchase events inside Shopify's strict sandbox.
2. `pathminty-recorder` is a theme app embed with a consent-gated two-stage JS bundle
   (tiny loader under Shopify’s theme-JS size budget + full rrweb runtime via
   `asset_url`). It observes consented pointer, click, scroll, visibility, and route
   activity because Web Pixels cannot access the DOM. Session batches post same-origin
   through the Shopify app proxy (`/apps/pathminty/capture` → gateway → collector
   service binding); the browser never holds the storefront site token (ADR 0007).

Shopify order and refund webhooks are queued separately. They are the source of truth
for gross sales, refunds, and net revenue. Pixel purchase events only correlate a
storefront journey with commerce data.

## Local setup

```bash
pnpm install
pnpm --filter @pathminty/shopify-gateway cf:types
shopify app dev --config development --store pathminty-demo-store.myshopify.com
```

The Shopify CLI opens the app in `pathminty-demo-store.myshopify.com`. Use **Install
tracking**, then **Open theme editor**, enable the PathMinty app embed, and select
**Save**.

Local configuration belongs in `apps/shopify-gateway/.dev.vars` and must never be
committed:

```dotenv
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=
SCOPES=read_orders,read_customer_events,read_pixels,write_pixels
```

Cloudflare provides `SHOPIFY_SESSIONS`, `SHOPIFY_INSTALLATIONS`, and `SHOPIFY_WEBHOOKS`
as bindings. No database credentials are used by the gateway.

`shopify.app.development.toml` excludes order/refund subscriptions until Shopify grants
protected-customer-data access. It is released only to the development app and must
never replace the production configuration.

## Deployed development slice

The Shopify gateway, collector, standalone dashboard, dashboard API, and replay Queue
consumer are deployed on stable Cloudflare `workers.dev` URLs. The Shopify app secret is
an encrypted Worker secret; it is not present in the generated bundle or repository.

The demo store Web Pixel is connected. The theme app embed is the merchant-controlled
switch for DOM interaction recording and is enabled in the active demo theme. The
recorder loads Shopify's Customer Privacy API before checking whether analytics
processing is allowed.

## Privacy invariants

- Recording starts only after Shopify reports that analytics processing is allowed.
- The session recorder excludes form values, keystrokes, visible text, URL queries, and
  URL fragments.
- Search terms come from Shopify's standardized customer events; obvious email and phone
  patterns are masked before ingestion.
- The DOM recorder uses structural element paths only.
- Raw webhook bodies and storefront tokens are never logged.
- Replay data is scoped by shop and stored outside Postgres.
- Shopify compliance webhooks cover data access and deletion requests.

## Next implementation slice

The app embed currently provides the low-overhead interaction stream required for
heatmaps and journey timing. Full visual session replay adds a versioned, first-party
DOM snapshot driver with the same masking policy; it should not be loaded from a
third-party CDN.
