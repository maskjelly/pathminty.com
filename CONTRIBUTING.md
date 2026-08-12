# Contributing

## Workflow

1. Keep changes small and domain-focused.
2. Add tests at the lowest useful boundary.
3. Update docs when behavior or architecture changes.
4. Run `pnpm format`, then `pnpm check`.

## Code shape

- Prefer pure functions for calculations and normalization.
- Prefer dependency injection at infrastructure boundaries.
- Return typed domain errors; translate them to HTTP at the edge.
- Avoid generic `utils` folders. Name modules for the domain concept they own.
- Avoid abstractions until there are at least two real implementations, except at vendor
  boundaries where migration is an explicit product requirement.

## Commits

Use short, imperative subjects. Explain the reason for non-obvious changes in the body.
Never commit generated credentials, personal data, or production payloads.
