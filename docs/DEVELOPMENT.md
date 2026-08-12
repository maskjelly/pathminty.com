# Development setup

## Prerequisites

- Node.js 22 LTS;
- pnpm 11;
- an authenticated Wrangler CLI for remote Cloudflare work;
- Shopify CLI when the Shopify gateway is registered.

## First run

```shell
pnpm install
pnpm cf:types
pnpm check
pnpm dev:local-platform
```

In a second terminal:

```shell
pnpm dev:dashboard
```

The local platform runs the collector, session-summary queue consumer, and dashboard API
in one Worker process. R2 and Queue are local; only the Shopify installation KV is
remote so the registered development app and local collector share the same site token.

The live merchant UI never seeds data. A local-only `POST /v1/dev/seed` endpoint remains
for automated tests; it is not called by the dashboard.

### Recorder theme assets

Two-stage first-party build (Shopify hosts both via theme `asset_url` CDN; no remote
third-party scripts):

```shell
pnpm --filter @pathminty/recorder build:extension
```

Writes:

- `apps/shopify-gateway/extensions/pathminty-recorder/assets/pathminty-recorder-loader.js`
  — schema JS (target well under Shopify’s 10 KB compressed theme-JS budget)
- `apps/shopify-gateway/extensions/pathminty-recorder/assets/pathminty-recorder-runtime.js`
  — full rrweb runtime, loaded only after analytics consent

`pnpm --filter @pathminty/recorder build` compiles the library and runs this extension
bundle. Commit loader + runtime after source changes. The old monolith
`pathminty-recorder.js` is removed by the build script.

Batch transport limits (see ADR 0006): hard body **2 MiB** (collector + recorder), soft
packing **~512 KiB**, `fetch` keepalive only when the full body is **≤ 60 KiB**.

### Same-origin capture (app proxy)

Storefront session capture posts to `/apps/pathminty/capture` (Shopify app proxy). The
gateway authenticates the signed proxy request, loads the shop installation token, and
forwards the body to the collector via the `COLLECTOR` service binding (ADR 0007). After
changing that binding, run:

```shell
pnpm --filter @pathminty/shopify-gateway cf:types
```

Reconnect tracking in the embedded app so `recorder_config` gets the relative capture
URL (no publicToken in the theme metafield).

Real storefront capture requires either deployed HTTPS development services or an
explicitly approved temporary tunnel. Never expose a collector that may receive real
customer behavior without confirming the data scope first.

## Local secrets

Each Worker has a committed `.dev.vars.example`. Copy it to `.dev.vars` and use a
development-only value. The ignored `.dev.vars` file may never contain production
credentials.

## Quality loop

```shell
pnpm format
pnpm format:check
pnpm check
```

`pnpm check` runs linting, strict TypeScript, unit tests, and builds through Turborepo.

## Cloudflare configuration changes

After changing any binding in `wrangler.jsonc`:

```shell
pnpm cf:types
```

Commit the regenerated `worker-configuration.d.ts`. CI will eventually run
`wrangler types --check` once all remote bindings exist.

## Database work

Schema changes belong in `packages/db/src/schema.ts`. Generate a migration from that
package. Do not edit an already-applied migration.

```shell
pnpm --filter @pathminty/db db:generate
pnpm --filter @pathminty/db db:migrate
pnpm --filter @pathminty/db db:verify
```

Neon CLI writes pooled `DATABASE_URL` and direct `DATABASE_URL_UNPOOLED` values to the
ignored root `.env.local`. Application traffic uses the pooled URL. Migrations enforce
the direct URL.

Every deployed service, including the Shopify application, uses Workers. Workers reach
Neon through Hyperdrive; only local migration tooling uses the direct Neon URL.

## Safe test data

Use synthetic shops, sessions, orders, and replay events. Never use a production replay
or customer payload as a fixture.
