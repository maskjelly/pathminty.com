# Protected customer data request

PathMinty should initially request **Level 1** access only. Shopify treats order data as
protected customer data even when direct customer fields are excluded.

## Requested data

- Shopify order ID and checkout token for deterministic event correlation;
- timestamps, currency, current totals, discounts, taxes, cancellation state, and
  financial status;
- refund IDs, order IDs, timestamps, transaction amounts/currencies, and refund totals.

## Explicitly excluded

Customer name, email, phone, postal address, precise location, payment credentials,
form-field values, keystrokes, visible page text, URL query strings, and URL fragments.

## Purpose

The minimum order/refund fields are used to calculate net revenue in integer minor units
and attribute it to an anonymous consented storefront journey. They are not used for
advertising, credit decisions, or sale to third parties.

## Controls to state in the Shopify request

- encryption in transit and provider-managed encryption at rest;
- tenant-scoped keys and database rows;
- least-privilege staff access with auditability;
- raw replay stored only in R2, not Postgres;
- no raw payloads, tokens, cookies, or personal data in logs;
- documented retention and deletion jobs;
- incident response and annual access review.

The final answers must match production behavior and must be reviewed after the real
retention/deletion jobs are implemented.
