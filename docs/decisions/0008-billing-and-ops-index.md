# ADR 0008: Human-session billing and an operator index

**Status:** accepted  
**Date:** 2026-08-13

## Decision

- Bill merchants on **human sessions** after bot/short classification. Pause capture at
  the plan cap. Never silent-upgrade.
- Keep replay blobs in R2. Put shop, usage, staff, and pipeline facts in Neon when a
  `DATABASE_URL` is present. Use KV as the hot cache so ingest still works if Neon is
  down.
- Staff roles (`viewer`, `oncall`, `admin`) are PathMinty operators, separate from
  merchant Shopify sessions. Merchant roles (`owner`, `analyst`, `viewer`) are
  shop-scoped.
- Order/refund webhooks stay paused. Revenue join is not part of this slice.

## Consequences

- Collector checks KV usage before accepting a replay batch.
- Analytics worker increments usage and writes session facts.
- The merchant dashboard always shows the plan they are on and remaining quota.
- Ops can list shops and failures without decoding replay bodies.
