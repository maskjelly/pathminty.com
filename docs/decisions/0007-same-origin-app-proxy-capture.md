# ADR 0007 — Same-origin Shopify app proxy for session capture

## Status

Accepted

## Context

Normal browser visitors produced zero sessions while an in-app browser reached the
public collector. The recorder posted to a third-party-looking Workers URL
(`pathminty-collector-dev…workers.dev/v1/replay-batches`) and waited up to 5s before
flushing a large FullSnapshot without `keepalive`. Privacy/ad blockers and quick
navigation made that path unreliable. Falling back to the public collector is not
acceptable.

## Decision

1. **Shopify app proxy** — Configure `[app_proxy]` with `url = "/pathminty-proxy"`,
   `prefix = "apps"`, `subpath = "pathminty"`, and add the `write_app_proxy` access
   scope. Storefronts POST to **same-origin** `/apps/pathminty/capture`.

2. **Signed proxy auth** — Gateway route `pathminty-proxy.capture` uses
   `authenticate.public.appProxy(request)` so Shopify’s HMAC-signed `shop` / timestamp /
   signature are validated. Missing offline session means the app is not installed
   → 401.

3. **Private service binding** — Gateway forwards to the collector over Cloudflare
   `COLLECTOR` service binding (`env.COLLECTOR.fetch`), not REST. The site token is
   loaded from `SHOPIFY_INSTALLATIONS` for the signed shop and set as
   `x-pathminty-site-token` server-side only. Tokens are never logged or returned to the
   browser.

4. **Recorder config** — Theme metafield `recorder_config` uses
   `collectorUrl: "/apps/pathminty/capture"` and **no** `publicToken`. Web Pixel
   settings still use the public collector URL + token for Shopify customer events only.

5. **Immediate FullSnapshot flush** — When rrweb emits `type === 2` (FullSnapshot), the
   runtime flushes immediately so a session appears without waiting for the 5s interval.

6. **No third-party fallback** — The runtime rejects configs that mention
   `pathminty-collector` or `/v1/replay-batches`.

## Consequences

- Merchants must re-connect tracking (or re-save embed config) so the metafield gets the
  relative capture URL.
- App reinstall / scope grant must include `write_app_proxy`.
- After adding the `COLLECTOR` binding, run
  `pnpm --filter @pathminty/shopify-gateway cf:types`.
- Deploy gateway + redeploy Shopify app config (app proxy + scopes).
