import {
  HeatmapResponseSchema,
  ReplaySessionResponseSchema,
  SessionListResponseSchema,
  ShopIdSchema,
  type HeatmapMode,
  type HeatmapResponse,
  type ReplaySessionResponse,
  type SessionSummary,
} from "@pathminty/contracts";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/u, "") ??
  (import.meta.env.DEV ? "http://localhost:8787" : "");

async function apiRequest(path: string, init?: RequestInit) {
  return fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body === undefined ? {} : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
}

function parseShopIdResponse(body: unknown) {
  const value =
    typeof body === "object" && body !== null && "shopId" in body
      ? body.shopId
      : undefined;
  const shopId = ShopIdSchema.safeParse(value);
  if (!shopId.success) throw new Error("The dashboard session is invalid.");
  return shopId.data;
}

const ticketExchanges = new Map<string, Promise<string>>();

async function exchangeDashboardTicketOnce(ticket: string): Promise<string> {
  // KV handoff can lag briefly across Workers; retry a couple of times.
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await apiRequest("/v1/auth/exchange", {
      method: "POST",
      body: JSON.stringify({ ticket }),
    });
    lastStatus = response.status;
    if (response.ok) {
      return parseShopIdResponse(await response.json());
    }
    // 401: missing/consumed ticket (or not yet visible). Retry those only.
    if (response.status !== 401 || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
  if (lastStatus === 403) {
    throw new Error("This dashboard origin is not allowed. Contact PathMinty support.");
  }
  throw new Error("This dashboard link expired. Reopen PathMinty from Shopify.");
}

/** Dedupes concurrent exchanges of the same one-time ticket (e.g. Strict Mode). */
export async function exchangeDashboardTicket(ticket: string): Promise<string> {
  const existing = ticketExchanges.get(ticket);
  if (existing) return existing;

  const exchange = exchangeDashboardTicketOnce(ticket).finally(() => {
    ticketExchanges.delete(ticket);
  });
  ticketExchanges.set(ticket, exchange);
  return exchange;
}

export async function getDashboardShop(): Promise<string | null> {
  const response = await apiRequest("/v1/auth/session");
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error("Unable to verify the dashboard session.");
  }
  return parseShopIdResponse(await response.json());
}

/** Live merchant UI never requests test sessions. */
export async function getSessions(shopId: string): Promise<SessionSummary[]> {
  const response = await apiRequest(
    `/v1/shops/${encodeURIComponent(shopId)}/sessions?limit=100`,
  );
  if (!response.ok) throw new Error("Unable to load storefront sessions.");
  return SessionListResponseSchema.parse(await response.json()).sessions;
}

export async function getReplay(
  shopId: string,
  sessionId: string,
): Promise<ReplaySessionResponse> {
  const response = await apiRequest(
    `/v1/shops/${encodeURIComponent(shopId)}/sessions/${encodeURIComponent(sessionId)}`,
  );
  if (!response.ok) throw new Error("Unable to load this recording.");
  return ReplaySessionResponseSchema.parse(await response.json());
}

export async function getHeatmap(
  shopId: string,
  params: {
    route: string;
    device: "all" | "desktop" | "tablet" | "mobile";
    mode: HeatmapMode;
  },
): Promise<HeatmapResponse> {
  const query = new URLSearchParams({
    route: params.route,
    device: params.device,
    mode: params.mode,
  });
  const response = await apiRequest(
    `/v1/shops/${encodeURIComponent(shopId)}/heatmaps?${query.toString()}`,
  );
  if (!response.ok) throw new Error("Unable to load heatmap.");
  return HeatmapResponseSchema.parse(await response.json());
}
