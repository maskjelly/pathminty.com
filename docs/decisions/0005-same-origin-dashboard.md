# ADR 0005: Keep the merchant dashboard and API same-origin

**Status:** accepted  
**Date:** 2026-08-11

## Context

The merchant dashboard is a static SPA while its API is an independently deployable
Worker. Calling that API on another hostname would make the HttpOnly merchant session
cookie cross-site and dependent on browser third-party-cookie policy.

## Decision

The dashboard Worker serves static assets and forwards `/v1/*` requests to the dashboard
API through a Cloudflare service binding. The browser sees one origin; the API remains a
separate service and owns authentication and tenant authorization.

## Consequences

- merchant sessions use secure, same-origin HttpOnly cookies;
- Worker-to-Worker traffic stays on a service binding instead of the public internet;
- the dashboard facade contains no business logic;
- the dashboard API can still scale and deploy independently;
- a future `app.pathminty.com` domain can replace the temporary `workers.dev` hostname
  without changing the browser authentication model.
