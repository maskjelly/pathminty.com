# Security policy

PathMinty records sensitive browsing context. Privacy failures are product failures, not
optional hardening work.

## Never collect

- passwords or payment fields;
- raw authentication tokens or cookies;
- unmasked form values by default;
- full IP addresses in application storage;
- replay payloads in logs or error trackers.

## Secrets

- local: ignored `.dev.vars` and `.env` files;
- Cloudflare: `wrangler secret put` or Secrets Store;
- CI: protected repository/environment secrets.

Do not copy credentials from another product. Existing local Wrangler OAuth can
authenticate the CLI without putting its token inside this repository.
