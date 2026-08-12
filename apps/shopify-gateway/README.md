# Shopify gateway — pending app registration

This directory will contain Shopify's official React Router application after a new
PathMinty Shopify app is registered.

Do not copy the Buyan gateway or credentials. The two products need distinct app IDs,
secrets, scopes, webhooks, extensions, billing configuration, and App Store records.

## Planned responsibilities

- OAuth and Shopify session storage;
- mandatory compliance and uninstall webhooks;
- order/refund reconciliation;
- theme app extension and Web Pixel configuration;
- secure one-time handoff into the standalone dashboard;
- Shopify Billing after the private pilot.

## Planned runtime

- Shopify's official React Router package and app conventions;
- Cloudflare Workers with the Cloudflare Vite plugin and `nodejs_compat`;
- Workers Assets for the embedded administration UI;
- Shopify's official Cloudflare KV session adapter;
- Hyperdrive plus `@pathminty/db` for durable merchant and commerce facts;
- Wrangler secrets or Cloudflare Secrets Store for production secrets;
- no Docker, Cloud Run, Prisma engine, or GCP dependency.

The first implementation must prove the Shopify package under the Workers runtime with
an install, OAuth callback, authenticated Admin API call, and signed webhook before any
business features are added.

Generate this app only after the new Shopify application exists. Preserve this README's
boundary notes in the generated application documentation.
