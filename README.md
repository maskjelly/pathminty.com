# PathMinty

PathMinty helps Shopify merchants understand how storefront behavior connects to net
revenue: session replay, heatmaps, journeys, and revenue-linked routes.

The domain is intentionally not required yet. Local development and Cloudflare
`workers.dev` URLs are enough for the technical spike.

## Status

This repository now contains a working local and Cloudflare-hosted Shopify-to-analytics
vertical slice. It currently includes:

- a registered embedded Shopify app and development store;
- idempotent Web Pixel installation plus a consent-aware theme app embed;
- a secure, one-time Shopify-to-standalone-dashboard handoff;
- a tenant-scoped dashboard with overview, heatmaps, interaction recordings, journeys,
  audiences, and an explicit protected-data gate for revenue paths;
- a Cloudflare replay collector with validated, tenant-scoped batches;
- R2 replay storage and one queue message per completed session;
- an analytics worker that builds replay manifests and session summaries;
- shared contracts, security, storage, logging, and database packages;
- a linked Neon development database with versioned Drizzle migrations;
- tests, strict TypeScript, linting, formatting, CI, and architecture docs.

The development data plane is deployed and verified with a clearly labelled end-to-end
test session. Full DOM reconstruction, real revenue reconciliation, a production custom
domain, protected-customer-data approval, and legal/listing material remain before App
Store submission. GCP is intentionally not part of the MVP.

## Start here

1. Read [docs/README.md](docs/README.md).
2. Install Node 22 and pnpm 11.
3. Run `pnpm install`.
4. Run `pnpm cf:types`.
5. Run `pnpm check` and `pnpm format:check`.
6. Start the combined local data plane with `pnpm dev:local-platform`.
7. Start the dashboard with `pnpm dev:dashboard`.

Local Cloudflare storage is simulated by Wrangler. Remote development resources are
isolated from the empty staging and production resources.

## Repository map

```text
apps/       Merchant-facing dashboard and Shopify gateway
services/   Independently deployable edge ingestion/API/job processes
packages/   Pure domain logic, contracts, adapters, and shared UI
docs/       Architecture, setup, decisions, and operational notes
```

## Important commands

| Command                                         | Purpose                                                  |
| ----------------------------------------------- | -------------------------------------------------------- |
| `pnpm dev`                                      | Run persistent development tasks                         |
| `pnpm dev:local-platform`                       | Run collector, queue consumer, and dashboard API locally |
| `pnpm check`                                    | Lint, typecheck, test, and build the workspace           |
| `pnpm cf:types`                                 | Regenerate Cloudflare binding types                      |
| `pnpm format`                                   | Format source and documentation                          |
| `pnpm --filter @pathminty/db db:verify`         | Verify the local Neon connection                         |
| `pnpm --filter @pathminty/db db:migrate`        | Apply versioned migrations over the direct URL           |
| `pnpm --filter @pathminty/collector deploy:dry` | Validate collector deployment                            |

## Security

Report security issues privately. See [SECURITY.md](SECURITY.md). Never place
credentials in an issue, log, replay, screenshot, or commit.
