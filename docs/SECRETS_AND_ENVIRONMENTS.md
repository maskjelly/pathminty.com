# Secrets and environments

## What was reused

The machine's existing Wrangler OAuth login can operate the Cloudflare account. No
Cloudflare access token was copied into this repository.

## What was not copied

The inspected Buyan `.env` contains AWS/DynamoDB credentials and belongs to another
product. PathMinty does not use those resources, so those credentials are neither needed
nor safe to duplicate.

Buyan's Shopify API credentials also belong to a different Shopify app and must not be
reused.

## Environment model

| Environment | Purpose                  | Data                              |
| ----------- | ------------------------ | --------------------------------- |
| local       | everyday development     | synthetic only                    |
| dev         | shared technical spike   | synthetic/dev-store only          |
| staging     | pre-release verification | controlled test merchants         |
| production  | live merchants           | production policies and retention |

Cloudflare bindings are declared separately for each environment because Wrangler does
not inherit every binding into named environments.

## Secret locations

| Runtime                          | Local                | Remote                          |
| -------------------------------- | -------------------- | ------------------------------- |
| Cloudflare Workers + Shopify app | ignored `.dev.vars`  | Wrangler secret / Secrets Store |
| Database migration tooling       | ignored `.env.local` | Neon-managed credentials        |
| GitHub Actions                   | none                 | protected environment secrets   |

Never pass secrets as command arguments, put them in `wrangler.jsonc`, or print them
during diagnostics.

## Connected values

- Neon project and production branch context in `.neon` (IDs only, no secrets);
- pooled and direct Neon URLs in ignored `.env.local`;
- a named Wrangler OAuth profile bound only to this repository;
- isolated Cloudflare binding identifiers in each committed Wrangler configuration;
- the Shopify app secret in the development gateway's encrypted Wrangler secret store.

## Pending values

- rotated Neon role password, then Hyperdrive configuration IDs;
- final staging and production origins after the domain is purchased;
- environment-specific production secrets before either environment is deployed.

No GCP project or Google Secret Manager setup is planned for the MVP.

The current Neon development project is in `aws-us-east-2`. Keep it for the technical
spike; review an India- or Singapore-near region before onboarding live Indian stores.
