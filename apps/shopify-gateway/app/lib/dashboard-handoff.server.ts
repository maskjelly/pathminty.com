import { env } from "cloudflare:workers";

function createPublicToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Mint a short-lived one-time ticket and return an absolute dashboard URL.
 * Tickets are created at click-time (not page-load) so they are not stale.
 */
export async function createDashboardHandoffUrl(shop: string) {
  const url = new URL(env.PATHMINTY_DASHBOARD_URL);
  const ticket = createPublicToken();
  await env.SHOPIFY_INSTALLATIONS.put(
    `dashboard-ticket:${ticket}`,
    JSON.stringify({ shopId: shop }),
    // Long enough for KV propagation + the new tab to load.
    { expirationTtl: 900 },
  );
  // Query param survives navigation better than a hash fragment.
  url.searchParams.set("ticket", ticket);
  return url.toString();
}
