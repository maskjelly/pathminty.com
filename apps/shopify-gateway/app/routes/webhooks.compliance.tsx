import { env } from "cloudflare:workers";
import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  if (String(topic).toUpperCase() === "SHOP_REDACT") {
    await env.SHOPIFY_INSTALLATIONS.delete(`shop:${shop}`);
  }

  // PathMinty does not collect customer names, email addresses, phone numbers,
  // postal addresses, or form values. Anonymous interaction sessions cannot be
  // mapped back to a Shopify customer, so customer data requests and redactions
  // require no customer-record lookup in the current data model.

  return new Response(null, { status: 204 });
};
