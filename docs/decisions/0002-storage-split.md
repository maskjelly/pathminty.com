# ADR 0002: Split replay blobs from queryable facts

**Status:** accepted  
**Date:** 2026-08-11

## Decision

Store immutable replay chunks in S3-compatible object storage. Store merchant, commerce,
session-index, and aggregate facts in Postgres.

## Consequences

- Postgres does not grow by one row per replay event;
- replay retention uses object lifecycle rules;
- analytics remain queryable without decoding replay blobs;
- object storage and Postgres can migrate independently.
