import { env } from "cloudflare:workers";
import type { ActionFunctionArgs } from "react-router";

import { enqueueShopWipe } from "../lib/webhook-queue.server";
import { authenticate, sessionStorage } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);
  const sessions = await sessionStorage.findSessionsByShop(shop);

  if (sessions.length > 0) {
    await sessionStorage.deleteSessions(sessions.map((session) => session.id));
  }
  await env.SHOPIFY_INSTALLATIONS.delete(`shop:${shop}`);
  await enqueueShopWipe(shop, "app_uninstalled");

  return new Response(null, { status: 204 });
};
