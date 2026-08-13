import {
  ActivityTimelineResponseSchema,
  HeatmapBatchResponseSchema,
  HeatmapResponseSchema,
  JourneyGraphResponseSchema,
  OpsFleetResponseSchema,
  ReplaySessionResponseSchema,
  RouteListResponseSchema,
  SessionListResponseSchema,
  ShopIdSchema,
  ShopWorkspaceSchema,
  StaffUserSchema,
  type ActivityTimelineResponse,
  type HeatmapMode,
  type HeatmapResponse,
  type JourneyGraphResponse,
  type OpsFleetResponse,
  type PlanId,
  type ReplaySessionResponse,
  type RouteListResponse,
  type RouteSort,
  type SessionQuality,
  type SessionSummary,
  type ShopWorkspace,
  type StaffUser,
  type TimeRangePreset,
} from "@pathminty/contracts";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/u, "") ??
  (import.meta.env.DEV ? "http://localhost:8787" : "");

export type DashboardDevice = "all" | "desktop" | "tablet" | "mobile";

export type TimeQuery = {
  preset: TimeRangePreset;
  from?: string;
  to?: string;
};

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

function readNamedField(body: unknown, name: string): unknown {
  if (typeof body === "object" && body !== null && name in body) {
    return (body as Record<string, unknown>)[name];
  }
  return undefined;
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

function timeSearchParams(time: TimeQuery): URLSearchParams {
  const query = new URLSearchParams({ preset: time.preset });
  if (time.from) query.set("from", time.from);
  if (time.to) query.set("to", time.to);
  return query;
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
export async function getSessions(
  shopId: string,
  options: {
    time: TimeQuery;
    device?: DashboardDevice;
    limit?: number;
    hideBots?: boolean;
    minDuration?: number;
    minClicks?: number;
    query?: string;
    quality?: SessionQuality;
  },
): Promise<SessionSummary[]> {
  const query = timeSearchParams(options.time);
  query.set("limit", String(options.limit ?? 100));
  if (options.device) query.set("device", options.device);
  if (options.hideBots === false) query.set("hideBots", "0");
  if (options.minDuration) query.set("minDuration", String(options.minDuration));
  if (options.minClicks) query.set("minClicks", String(options.minClicks));
  if (options.query) query.set("q", options.query);
  if (options.quality) query.set("quality", options.quality);
  const response = await apiRequest(
    `/v1/shops/${encodeURIComponent(shopId)}/sessions?${query.toString()}`,
  );
  if (!response.ok) throw new Error("Unable to load storefront sessions.");
  return SessionListResponseSchema.parse(await response.json()).sessions;
}

export async function getRoutes(
  shopId: string,
  options: {
    time: TimeQuery;
    device: DashboardDevice;
    mode: HeatmapMode;
    sort: RouteSort;
    limit: number;
    query?: string;
  },
): Promise<RouteListResponse> {
  const params = timeSearchParams(options.time);
  params.set("device", options.device);
  params.set("mode", options.mode);
  params.set("sort", options.sort);
  params.set("limit", String(options.limit));
  if (options.query) params.set("q", options.query);
  const response = await apiRequest(
    `/v1/shops/${encodeURIComponent(shopId)}/routes?${params.toString()}`,
  );
  if (!response.ok) throw new Error("Unable to load route map.");
  return RouteListResponseSchema.parse(await response.json());
}

export async function getActivity(
  shopId: string,
  options: {
    time: TimeQuery;
    device: DashboardDevice;
    mode: HeatmapMode;
    route?: string | null;
  },
): Promise<ActivityTimelineResponse> {
  const params = timeSearchParams(options.time);
  params.set("device", options.device);
  params.set("mode", options.mode);
  if (options.route) params.set("route", options.route);
  const response = await apiRequest(
    `/v1/shops/${encodeURIComponent(shopId)}/activity?${params.toString()}`,
  );
  if (!response.ok) throw new Error("Unable to load activity timeline.");
  return ActivityTimelineResponseSchema.parse(await response.json());
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
    device: DashboardDevice;
    mode: HeatmapMode;
    time: TimeQuery;
    scrubFrom?: string;
    scrubTo?: string;
    snapshot?: boolean;
  },
): Promise<HeatmapResponse> {
  const query = timeSearchParams(params.time);
  query.set("route", params.route);
  query.set("device", params.device);
  query.set("mode", params.mode);
  if (params.scrubFrom) query.set("scrubFrom", params.scrubFrom);
  if (params.scrubTo) query.set("scrubTo", params.scrubTo);
  if (params.snapshot === false) query.set("snapshot", "0");
  const response = await apiRequest(
    `/v1/shops/${encodeURIComponent(shopId)}/heatmaps?${query.toString()}`,
  );
  if (!response.ok) throw new Error("Unable to load heatmap.");
  return HeatmapResponseSchema.parse(await response.json());
}

export async function getHeatmapBatch(
  shopId: string,
  params: {
    routes: string[];
    device: DashboardDevice;
    mode: HeatmapMode;
    time: TimeQuery;
    /** Include rrweb snapshots for the first N routes (capped server-side at 8). */
    snapshot?: boolean;
    snapshotLimit?: number;
  },
): Promise<HeatmapResponse[]> {
  if (params.routes.length === 0) return [];
  const query = timeSearchParams(params.time);
  query.set("routes", params.routes.join("|"));
  query.set("device", params.device);
  query.set("mode", params.mode);
  if (params.snapshot) {
    query.set("snapshot", "1");
    query.set("snapshotLimit", String(params.snapshotLimit ?? 8));
  }
  const response = await apiRequest(
    `/v1/shops/${encodeURIComponent(shopId)}/heatmaps/batch?${query.toString()}`,
  );
  if (!response.ok) throw new Error("Unable to load site map heatmaps.");
  return HeatmapBatchResponseSchema.parse(await response.json()).heatmaps;
}

export async function getJourneys(
  shopId: string,
  options: {
    time: TimeQuery;
    device: DashboardDevice;
    maxNodes?: number;
  },
): Promise<JourneyGraphResponse> {
  const params = timeSearchParams(options.time);
  params.set("device", options.device);
  if (options.maxNodes) params.set("maxNodes", String(options.maxNodes));
  const response = await apiRequest(
    `/v1/shops/${encodeURIComponent(shopId)}/journeys?${params.toString()}`,
  );
  if (!response.ok) throw new Error("Unable to load journeys.");
  return JourneyGraphResponseSchema.parse(await response.json());
}

export async function getWorkspace(shopId: string): Promise<ShopWorkspace> {
  const response = await apiRequest(
    `/v1/shops/${encodeURIComponent(shopId)}/workspace`,
  );
  if (!response.ok) throw new Error("Unable to load your plan and capture health.");
  return ShopWorkspaceSchema.parse(await response.json());
}

export async function selectPlan(
  shopId: string,
  planId: PlanId,
): Promise<ShopWorkspace> {
  const response = await apiRequest(`/v1/shops/${encodeURIComponent(shopId)}/billing`, {
    method: "POST",
    body: JSON.stringify({ planId }),
  });
  if (response.status === 402) {
    throw new Error("Confirm this plan from PathMinty inside Shopify Admin.");
  }
  if (!response.ok) throw new Error("Unable to update the plan.");
  return ShopWorkspaceSchema.parse(await response.json());
}

export async function opsLogin(email: string, password: string): Promise<StaffUser> {
  const response = await apiRequest("/v1/ops/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = readNamedField(body, "error");
    throw new Error(
      typeof detail === "string" && detail.length > 0
        ? detail
        : "Staff sign-in failed.",
    );
  }
  const staff = StaffUserSchema.safeParse(readNamedField(body, "staff"));
  if (!staff.success) throw new Error("Staff sign-in failed.");
  return staff.data;
}

export async function opsLogout(): Promise<void> {
  await apiRequest("/v1/ops/logout", { method: "POST" });
}

export async function getOpsSession(): Promise<StaffUser | null> {
  const response = await apiRequest("/v1/ops/session");
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Unable to verify staff session.");
  const staff = StaffUserSchema.safeParse(
    readNamedField(await response.json(), "staff"),
  );
  return staff.success ? staff.data : null;
}

export async function getOpsFleet(): Promise<OpsFleetResponse> {
  const response = await apiRequest("/v1/ops/fleet");
  if (!response.ok) throw new Error("Unable to load the fleet.");
  return OpsFleetResponseSchema.parse(await response.json());
}

export async function ackOpsEvent(id: string): Promise<void> {
  const response = await apiRequest(`/v1/ops/events/${encodeURIComponent(id)}/ack`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Unable to acknowledge this event.");
}

export async function createOpsStaff(input: {
  email: string;
  name: string;
  role: "viewer" | "oncall";
  password: string;
}): Promise<StaffUser> {
  const response = await apiRequest("/v1/ops/staff", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Unable to create staff.");
  const body: unknown = await response.json();
  return StaffUserSchema.parse(readNamedField(body, "staff") ?? body);
}

export async function listOpsStaff(): Promise<StaffUser[]> {
  const response = await apiRequest("/v1/ops/staff");
  if (!response.ok) throw new Error("Unable to list staff.");
  const staff = readNamedField(await response.json(), "staff");
  if (!Array.isArray(staff)) return [];
  return staff.map((item) => StaffUserSchema.parse(item));
}

export async function opsOverridePlan(shopId: string, planId: PlanId): Promise<void> {
  const response = await apiRequest(
    `/v1/ops/shops/${encodeURIComponent(shopId)}/plan`,
    { method: "POST", body: JSON.stringify({ planId }) },
  );
  if (!response.ok) throw new Error("Unable to override the plan.");
}

export const SHOPIFY_INSTALL_URL =
  "https://admin.shopify.com/oauth/install?client_id=62b97c0201c60add657038e08ce9ba95";
