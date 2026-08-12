/**
 * Pure helpers for Shopify app-proxy → collector forwarding.
 * Used by the shopify-gateway capture route; unit-tested here.
 */

import {
  StorefrontInstallationSchema,
  type StorefrontInstallation,
} from "@pathminty/contracts";

/** Storefront posts here (Shopify app proxy subpath). */
export const STOREFRONT_CAPTURE_PATH = "/apps/pathminty/capture";

/** Worker-to-Worker target (service binding; host is arbitrary for Fetcher). */
export const INTERNAL_COLLECTOR_REPLAY_URL =
  "https://collector.internal/v1/replay-batches";

export type CollectorFetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export type InstallationStore = {
  get(key: string, type: "json"): Promise<unknown>;
};

export function rejectUnlessPost(method: string): Response | null {
  if (method.toUpperCase() === "POST") return null;
  return new Response("Method not allowed", { status: 405 });
}

export function installationKey(shop: string): string {
  return `shop:${shop}`;
}

export async function loadStorefrontInstallation(
  store: InstallationStore,
  shop: string,
): Promise<StorefrontInstallation | null> {
  const stored = await store.get(installationKey(shop), "json");
  const parsed = StorefrontInstallationSchema.safeParse(stored);
  if (!parsed.success) return null;
  if (parsed.data.shopId !== shop) return null;
  return parsed.data;
}

/**
 * Build the Worker-to-Worker fetch init that streams the client body to collector.
 * Site token is applied only here — never logged or returned to the storefront.
 */
export function buildCollectorForwardInit(
  request: Request,
  publicToken: string,
): RequestInit {
  const contentType = request.headers.get("content-type") ?? "application/json";
  const mediaType = contentType.split(";", 1)[0]?.trim() || "application/json";

  return {
    method: "POST",
    headers: {
      "content-type": mediaType,
      "x-pathminty-site-token": publicToken,
    },
    body: request.body,
  };
}

export function collectorResponseToClient(response: Response): Response {
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function forwardReplayBatchToCollector(
  collector: CollectorFetcher,
  request: Request,
  publicToken: string,
): Promise<Response> {
  const init = buildCollectorForwardInit(request, publicToken);
  const upstream = await collector.fetch(INTERNAL_COLLECTOR_REPLAY_URL, init);
  return collectorResponseToClient(upstream);
}
