import { env } from "cloudflare:workers";
import type { ActionFunctionArgs } from "react-router";

import { authenticate, sessionStorage } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);
  const sessions = await sessionStorage.findSessionsByShop(shop);

  if (sessions.length > 0) {
    await sessionStorage.deleteSessions(sessions.map((session) => session.id));
  }
  await env.SHOPIFY_INSTALLATIONS.delete(`shop:${shop}`);

  return new Response(null, { status: 204 });
};
