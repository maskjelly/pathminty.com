# ADR 0004: Use Cloudflare for all MVP hosting

**Status:** accepted  
**Date:** 2026-08-11

## Context

PathMinty needs a Shopify application, a standalone dashboard, ingestion APIs, queue
consumers, object storage, and database connectivity. Operating a second application
platform adds credentials, deployment pipelines, logs, and cost before product risk has
been reduced.

## Decision

All MVP compute and web assets run on Cloudflare:

- Shopify React Router app on Workers with Workers Assets;
- dashboard on Workers Assets;
- collector, dashboard API, and consumers on Workers;
- Shopify installation sessions in KV using Shopify's official adapter;
- asynchronous work through Queues;
- replay objects in R2;
- Neon Postgres reached through Hyperdrive.

GCP and Cloud Run are not part of the MVP. `workers.dev` URLs are sufficient until the
product needs its domain.

## Consequences

- one runtime, deploy tool, secrets model, and observability surface;
- no GCP project, container registry, Docker image, or Google secrets setup;
- the Shopify SDK must pass an explicit Workers compatibility spike before feature work;
- webhook handlers remain bounded and queue slow reconciliation work;
- standard Postgres, S3-compatible objects, and package adapters preserve migration
  seams if measured limits later require another host.
