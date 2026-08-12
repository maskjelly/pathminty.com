# PathMinty engineering rules

- Keep routes and Worker handlers thin. Put business behavior in packages.
- Every merchant-owned record and query must be scoped by `shopId`.
- Never put raw replay events in Postgres; store replay chunks in object storage.
- Never log replay bodies, tokens, cookies, raw Shopify webhooks, or PII.
- Validate external input at the boundary with the shared contracts package.
- Use integer minor units plus ISO currency codes for money.
- Keep Cloudflare, database, and queue operations behind small adapters.
- Do not hand-write Cloudflare binding types; run `pnpm cf:types`.
- Never commit secrets. Use `.dev.vars` locally and Wrangler secrets remotely.
- Add or update an ADR when changing a major architectural decision.
- Run `pnpm check` and `pnpm format:check` before handing off work.
