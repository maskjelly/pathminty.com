# Technology stack

## Locked for the technical spike

| Concern        | Choice                              | Reason                                                 |
| -------------- | ----------------------------------- | ------------------------------------------------------ |
| Language       | TypeScript                          | One strict language across browser, edge, and tooling  |
| Workspace      | pnpm + Turborepo                    | Fast, explicit package boundaries                      |
| Dashboard      | React + Vite + TanStack Query       | Interactive SPA without unnecessary SSR                |
| Edge HTTP      | Cloudflare Workers + Hono           | Small, portable handlers near storefront visitors      |
| Replay storage | Cloudflare R2                       | Object workload, S3 compatibility, no egress fee       |
| Async jobs     | Cloudflare Queues                   | Coarse jobs; one message per completed session         |
| Database       | Neon Postgres                       | Standard relational model and easy migration           |
| Worker DB path | Cloudflare Hyperdrive + `pg`        | Free-plan pooling and recommended Neon connection path |
| SQL model      | Drizzle schema and migrations       | Typed schema while preserving normal SQL               |
| Replay engine  | rrweb behind a PathMinty interface  | Proven capture, replaceable implementation             |
| Charts         | Apache ECharts                      | Funnels, Sankey, maps, and dense analytical charts     |
| Tests          | Vitest + Playwright + k6            | Unit, browser fidelity, and ingestion load             |
| Shopify        | Official React Router template      | Supported auth/webhook/session patterns                |
| Shopify host   | Cloudflare Workers + Workers Assets | One edge runtime, secrets model, and deployment path   |
| Shopify auth   | Cloudflare KV adapter               | Official Worker-compatible Shopify session storage     |

## Not yet

- ClickHouse until measured query volume requires it;
- Kafka/Redpanda until queue volume requires it;
- Redis until an observed cache/coordination problem requires it;
- Kubernetes;
- paid auth;
- SSR for the authenticated dashboard;
- a second commerce platform.

## Primary references

- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/)
- [Cloudflare Queues](https://developers.cloudflare.com/queues/)
- [Cloudflare Hyperdrive with Neon](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/)
- [Cloudflare Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/)
- [Cloudflare React Router on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
- [Shopify React Router app package](https://shopify.dev/docs/api/shopify-app-react-router)
- [Shopify Cloudflare KV session adapter](https://www.npmjs.com/package/@shopify/shopify-app-session-storage-kv)
- [Shopify app deployment](https://shopify.dev/docs/apps/launch/deployment)
- [rrweb](https://github.com/rrweb-io/rrweb)
- [Neon serverless Postgres](https://neon.com/docs/introduction)

References are decision context, not copied implementation. Recheck current API types
and limits before changing infrastructure.
