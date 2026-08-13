import { env } from "cloudflare:workers";

const allowedTopics = new Set([
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "REFUNDS_CREATE",
  "CUSTOMERS_DATA_REQUEST",
  "CUSTOMERS_REDACT",
  "SHOP_REDACT",
]);

export async function queueShopifyWebhook(input: {
  request: Request;
  shop: string;
  topic: string;
  payload: unknown;
}) {
  const topic = input.topic.toUpperCase();
  if (!allowedTopics.has(topic)) {
    // React Router uses thrown responses for HTTP boundary errors.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw new Response("Unsupported webhook topic", { status: 400 });
  }

  const webhookId = input.request.headers.get("x-shopify-webhook-id");
  if (!webhookId) {
    // React Router uses thrown responses for HTTP boundary errors.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw new Response("Missing webhook ID", { status: 400 });
  }

  await env.SHOPIFY_WEBHOOKS.send({
    schemaVersion: 1,
    webhookId,
    shop: input.shop,
    topic,
    receivedAt: new Date().toISOString(),
    payload: input.payload,
  });
}

/** Queue R2 + usage wipe. Safe to call after uninstall or shop/redact. */
export async function enqueueShopWipe(shop: string, reason: string) {
  await env.SHOPIFY_WEBHOOKS.send({
    schemaVersion: 1,
    webhookId: `wipe-${reason}-${Date.now()}`,
    shop,
    topic: "SHOP_REDACT",
    receivedAt: new Date().toISOString(),
    payload: { reason },
  });
}
