import { register } from "@shopify/web-pixels-extension";

type PixelSettings = {
  collectorUrl?: unknown;
  shopId?: unknown;
  publicToken?: unknown;
};

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null;

function readPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const part of path) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function readString(value: unknown, path: readonly string[]) {
  const result = readPath(value, path);
  return typeof result === "string" ? result : undefined;
}

function safePath(url: string | undefined) {
  if (!url) return undefined;
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

function sanitizedSearch(value: string | undefined) {
  if (!value) return undefined;
  return value
    .slice(0, 120)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[phone]");
}

function money(value: unknown) {
  const amount = readString(value, ["amount"]);
  const currency = readString(value, ["currencyCode"]);
  if (!amount || !currency) return undefined;
  const decimal = Number(amount);
  if (!Number.isFinite(decimal)) return undefined;
  return { amountMinor: Math.round(decimal * 100), currency };
}

function normalizedEvent(type: string, event: unknown, shopId: string) {
  const checkout = readPath(event, ["data", "checkout"]);
  const productVariant = readPath(event, ["data", "productVariant"]);
  const searchQuery = readString(event, ["data", "searchResult", "query"]);

  return {
    schemaVersion: 1,
    shopId,
    type,
    eventId: readString(event, ["id"]),
    clientId: readString(event, ["clientId"]),
    occurredAt: readString(event, ["timestamp"]) ?? new Date().toISOString(),
    path: safePath(readString(event, ["context", "document", "location", "href"])),
    searchQuery: type === "search_submitted" ? sanitizedSearch(searchQuery) : undefined,
    productId: readString(productVariant, ["product", "id"]),
    variantId: readString(productVariant, ["id"]),
    checkoutToken: readString(checkout, ["token"]),
    orderId: readString(checkout, ["order", "id"]),
    total: money(readPath(checkout, ["totalPrice"])),
  };
}

register(({ analytics, settings }) => {
  const config = settings as PixelSettings;
  if (
    typeof config.collectorUrl !== "string" ||
    typeof config.shopId !== "string" ||
    typeof config.publicToken !== "string"
  ) {
    return;
  }

  const send = (type: string, event: unknown) => {
    void fetch(config.collectorUrl as string, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pathminty-site-token": config.publicToken as string,
      },
      body: JSON.stringify(normalizedEvent(type, event, config.shopId as string)),
      keepalive: true,
    }).catch(() => undefined);
  };

  analytics.subscribe("page_viewed", (event) => send("page_viewed", event));
  analytics.subscribe("collection_viewed", (event) => send("collection_viewed", event));
  analytics.subscribe("product_viewed", (event) => send("product_viewed", event));
  analytics.subscribe("search_submitted", (event) => send("search_submitted", event));
  analytics.subscribe("product_added_to_cart", (event) =>
    send("product_added_to_cart", event),
  );
  analytics.subscribe("cart_viewed", (event) => send("cart_viewed", event));
  analytics.subscribe("checkout_started", (event) => send("checkout_started", event));
  analytics.subscribe("payment_info_submitted", (event) =>
    send("payment_info_submitted", event),
  );
  analytics.subscribe("checkout_completed", (event) =>
    send("checkout_completed", event),
  );
});
