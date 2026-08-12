# ADR 0003: Use Hyperdrive for Worker-to-Postgres

**Status:** accepted  
**Date:** 2026-08-11

## Decision

Cloudflare Workers connect to Neon through Hyperdrive and a standard PostgreSQL driver.
Local migration tooling uses Neon's direct PostgreSQL connection.

## Consequences

- Worker connections follow Cloudflare's current production guidance;
- pooling and query caching are available on the free plan;
- the database remains ordinary Postgres;
- local development can use Hyperdrive's local connection string after Neon or local
  Postgres exists.
