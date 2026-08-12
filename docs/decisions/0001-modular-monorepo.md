# ADR 0001: Modular monorepo

**Status:** accepted  
**Date:** 2026-08-11

## Decision

Use one TypeScript pnpm/Turborepo repository with explicit apps, services, and packages.
Deploy only the few workload-specific processes that need independent scaling.

## Consequences

- contracts and privacy logic remain consistent;
- local development and refactoring stay simple;
- collector failures remain isolated from the dashboard and Shopify gateway;
- modules can become services later without beginning with a microservice fleet.
