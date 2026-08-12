# Privacy operations

This is an engineering runbook, not legal advice. Public policies require the actual
legal entity, jurisdiction, support contact, subprocessors, retention schedule, and
legal review.

## Data map

| Data                             | Store                              | Tenant key             | Planned retention                               |
| -------------------------------- | ---------------------------------- | ---------------------- | ----------------------------------------------- |
| OAuth sessions                   | Cloudflare KV                      | Shopify shop domain    | installation lifetime                           |
| Recorder configuration           | Cloudflare KV + app metafield      | Shopify shop domain    | installation lifetime                           |
| Raw interaction chunks/manifests | Cloudflare R2                      | shop/session path      | 30 days                                         |
| Standardized customer events     | Cloudflare R2 before normalization | shop/event path        | 30 days maximum                                 |
| Session/order/refund facts       | Postgres                           | internal shop ID       | merchant account lifetime, then deletion window |
| Operational logs                 | Cloudflare logs                    | request/event IDs only | shortest supported operational window           |

## Privacy webhook behavior

- `customers/data_request`: no-op while PathMinty stores no direct customer identifiers
  and cannot map anonymous sessions to a customer.
- `customers/redact`: same no-op under the current anonymous model. Reassess before any
  customer identifier is stored.
- `shop/redact`: delete installation KV immediately and enqueue deletion of all R2 and
  Postgres objects for that shop within Shopify's required period.

The current code deletes installation KV for `shop/redact`; the R2/Postgres deletion
consumer is a release blocker.

## Session-recording invariants

- Start only after Shopify analytics consent (`analyticsProcessingAllowed()` via
  Customer Privacy API / `consent-tracking-api`).
- Stop collecting when consent is withdrawn or the embed is disabled.
- Bundle the recorder with the theme extension build; never load recorder code from a
  CDN.
- Mask every input, textarea, select, password, search, email, phone, and
  contenteditable value; block `[data-pathminty-private]` and common payment selectors.
- Do not record cross-origin iframe contents.
- Do not record `/account`, `/checkout`, `/checkouts`, `/orders`, password, or
  authentication pages in the DOM recorder (coarse pixel route events only where
  allowed).
- Strip query strings and fragments from recorded routes.
- Never record form values, keystrokes intended as content capture, password/payment
  fields, cookies, tokens, raw IP addresses, or raw webhook bodies.
- Treat search terms as customer-event data; mask obvious contact details and disclose
  collection.
- Keep all raw replay data out of Postgres and application logs.
- Merchant UI must never silently seed or display fabricated fallback analytics.

## Incident response

1. Disable the collector or affected installation token.
2. Preserve non-sensitive request IDs and deployment metadata.
3. Identify affected shops, data classes, and time window without copying raw replay
   into tickets or chat.
4. Rotate affected credentials and revoke unnecessary access.
5. Follow legal notification duties and document corrective action.
