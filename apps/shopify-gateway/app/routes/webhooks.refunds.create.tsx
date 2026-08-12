import type { ActionFunctionArgs } from "react-router";

import { queueShopifyWebhook } from "../lib/webhook-queue.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  await queueShopifyWebhook({
    request,
    payload,
    shop,
    topic: String(topic),
  });

  return new Response(null, { status: 204 });
};
