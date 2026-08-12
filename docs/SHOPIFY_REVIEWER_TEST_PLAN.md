# Shopify reviewer test plan

Development store: `pathminty-demo-store.myshopify.com`

Reviewer credentials must be created immediately before submission and stored only in
Shopify's review form, never in this repository.

## Happy path

1. Install PathMinty from the Shopify-owned review link.
2. Confirm OAuth returns to **Connect PathMinty** inside Shopify Admin.
3. Select **Install tracking**.
4. Select **Open theme editor**, enable the PathMinty app embed, and select **Save**.
5. Open the storefront, grant analytics consent, visit a collection and product, scroll,
   click, search, add an item, and complete a test checkout.
6. Return to PathMinty and confirm only real events from this store appear.
7. Open a real session and verify clicks, scroll depth, route timing, and order linkage.
8. Select **Disconnect tracking** and confirm new events stop.

## Lifecycle and privacy

1. Uninstall, verify Shopify sessions and installation configuration are deleted, then
   reinstall and verify OAuth runs again.
2. Send all three mandatory privacy webhook topics and verify expected deletion/no-op
   behavior.
3. Verify URL query strings, fragments, form values, keystrokes, visible text, and raw
   IP addresses do not appear in replay storage or logs.
4. Verify non-consenting visitors do not produce recorder batches.
5. Verify tenant isolation by attempting to use one store's publishable token with a
   different `shopId`; the collector must return 401.

## Evidence to attach

- Narrated screencast covering install, setup, storefront consent, a real session,
  purchase linkage, disconnect, uninstall, and reinstall.
- Exact reviewer navigation steps and time needed for data to appear.
- Test order/refund instructions and any store password.
