# Shopify App Store readiness

Last reviewed: 2026-08-11

This is a code and configuration preflight, not Shopify approval. Do not submit until
every blocking item below is closed and the install flow is tested end to end.

## Snapshot

| Result                   | Count |
| ------------------------ | ----: |
| Likely pass / not used   |    26 |
| Needs live review/choice |     7 |
| Likely fail today        |     1 |

## Likely failures

1. **3.1.1 — production TLS:** the development configuration now uses a verified stable
   HTTPS Worker URL, but `shopify.app.toml` deliberately retains `https://example.com`.
   Replace it with the production custom domain and re-run every redirect and webhook
   test before submission.

## Needs review or a product decision

- **1.1.1:** run the embedded app with third-party cookies blocked and verify App Bridge
  session-token authentication.
- **1.2.1–1.2.3:** choose a free beta or implement Shopify Managed Pricing/Billing.
  Off-platform billing is not allowed.
- **2.3.2–2.3.4:** stable development install and authentication pass; record uninstall
  and reinstall tests after the production URL exists.

## Likely passing

| Requirements                             | Evidence                                                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.2–1.1.3, 1.1.6–1.1.10, 1.1.13–1.1.16 | No checkout, payment, theme download, marketplace, POS, lending, agency, or refund-processing behavior.                                      |
| 1.1.4                                    | Sample analytics are labelled. Test sessions are marked `source: test`; normal mode authenticates the merchant and reads tenant-scoped data. |
| 2.2.1                                    | Official OAuth, Web Pixel, webhook, and Admin GraphQL APIs are used.                                                                         |
| 2.2.3                                    | The official Shopify React Router/App Bridge integration injects current App Bridge.                                                         |
| 2.2.4                                    | Admin operations use GraphQL; no legacy Admin REST calls were found.                                                                         |
| 2.2.6–2.2.7                              | No promotional admin extension or automatic Max modal exists.                                                                                |
| 2.3.1                                    | Manual shop-domain entry was removed; installation starts from Shopify.                                                                      |
| 3.2.1–3.2.5                              | None of the specially restricted scopes are requested.                                                                                       |
| 5.1.1                                    | Storefront recording uses a theme app extension; no theme-file edits or ScriptTag API.                                                       |
| 5.1.3                                    | The app provides a theme-editor deep link and explicit enable/save instructions.                                                             |
| 5.1.5                                    | The authenticated dashboard returns collected session summaries, heatmaps, journeys, audiences, and interaction recordings to the merchant.  |

## Category groups skipped

Payment, payment facilitator, purchase options, product sourcing, checkout
customization, sales channel, post-purchase, mobile app builder, and donation do not
apply to the current extensions or requested scopes.

## Soft-launch scope (current)

Ship heatmaps, site canvas / journeys, and session recordings without order revenue.
Order join code exists but is paused until Level 1 protected-customer-data is approved.

## Submission blockers outside the code review

- Deploy staging and production Workers behind final custom domains when leaving dev.
- Publish privacy policy, terms, and support pages using the real legal entity and
  email.
- Choose free beta or Shopify Billing and match the App Store pricing section.
- Configure emergency developer contact, reviewer credentials, listing media, and a
  narrated review screencast.
- Run install, consent, event capture, disconnect, uninstall, data deletion, and
  reinstall tests on the demo store.
- Later: PCD Level 1, then enable order/refund webhooks for revenue join.

## Verified development evidence

On 2026-08-11 the stable development version passed embedded-app authentication, Web
Pixel creation, one-time dashboard handoff, tenant-token event ingestion, R2
persistence, completed-session Queue processing, and authenticated replay/heatmap
rendering. The test session is explicitly labelled and contains no customer data.

## Official resources

- <https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements>
- <https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review>
- <https://shopify.dev/docs/apps/launch/protected-customer-data>
- <https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance>
