# PathMinty documentation

Read these in order:

1. [Development setup](DEVELOPMENT.md)
2. [System architecture](ARCHITECTURE.md)
3. [Technology stack](STACK.md)
4. [Secrets and environments](SECRETS_AND_ENVIRONMENTS.md)
5. [Implementation roadmap](IMPLEMENTATION_ROADMAP.md)
6. [Shopify app](SHOPIFY_APP.md)
7. [Shopify App Store readiness](SHOPIFY_APP_STORE_READINESS.md)
8. [Protected customer data](PROTECTED_CUSTOMER_DATA.md)
9. [Privacy operations](PRIVACY_OPERATIONS.md)

Major decisions live in [decisions](decisions/README.md). These are short records of why
the system is shaped this way, so future contributors do not accidentally reverse
decisions without understanding their tradeoffs.

## Current external setup

| System      | State                                                                        |
| ----------- | ---------------------------------------------------------------------------- |
| Domain      | Not purchased; `workers.dev` is used for the development slice               |
| Cloudflare  | Repository-scoped `pathminty` Wrangler profile; development Workers deployed |
| R2          | Isolated dev, staging, and production buckets created; dev ingest verified   |
| Queues      | Isolated session, dead-letter, and webhook queues created per environment    |
| Shopify app | Development version released; Web Pixel and session recorder verified live   |
| Neon        | Dev project linked; initial schema migrated                                  |
| Hyperdrive  | Pending credential rotation, then Worker database access                     |

No credential value belongs in this documentation.

## Development deployment

The collector, replay consumer, dashboard API, dashboard, and Shopify gateway are live
on stable development `workers.dev` URLs. The verified smoke path is:

1. tenant-token validation in the collector;
2. raw replay or Shopify event storage in development R2;
3. one completed-session message through the development Queue;
4. manifest and session-summary creation by the analytics worker;
5. authenticated retrieval through the dashboard service binding.

The demo store has also completed the browser-to-dashboard path: the enabled theme app
embed captured a consent-allowed storefront session, uploaded it to the collector, and
the dashboard displayed it as a playable `Storefront session`.

Staging and production storage resources exist but are intentionally empty and their
Workers are not deployed yet.

See [Shopify app](SHOPIFY_APP.md) for the installation, extension, and privacy model.
