import {
  PLAN_CATALOG,
  ShopIdSchema,
  StorefrontInstallationSchema,
  type OpsFleetResponse,
  type OpsShopRow,
  type StaffRole,
} from "@pathminty/contracts";
import {
  ackPipelineEvent,
  authenticateStaff,
  createStaffSession,
  ensureBootstrapStaff,
  listPipelineEvents,
  listStaffFromKv,
  readShopHealth,
  readSubscription,
  readUsage,
  readStaffSession,
  resolveCaptureHealth,
  upsertStaffInKv,
  type BillingStore,
} from "@pathminty/db/worker";

type KvStore = BillingStore & {
  list(options: { prefix: string }): Promise<{ keys: Array<{ name: string }> }>;
};

export function staffCanWrite(role: StaffRole) {
  return role === "oncall" || role === "admin";
}

export function staffCanAdmin(role: StaffRole) {
  return role === "admin";
}

export async function bootstrapOps(
  store: KvStore,
  env: {
    OPS_BOOTSTRAP_EMAIL?: string;
    OPS_BOOTSTRAP_PASSWORD?: string;
  },
) {
  await ensureBootstrapStaff(
    store,
    env.OPS_BOOTSTRAP_EMAIL,
    env.OPS_BOOTSTRAP_PASSWORD,
  );
}

export async function loginStaff(store: KvStore, email: string, password: string) {
  return authenticateStaff(store, email, password);
}

export async function issueStaffCookie(
  store: KvStore,
  staff: {
    id: string;
    email: string;
    name: string;
    role: StaffRole;
    active: boolean;
  },
) {
  return createStaffSession(store, staff);
}

export async function staffFromCookie(store: KvStore, sessionId: string | undefined) {
  if (!sessionId) return null;
  return readStaffSession(store, sessionId);
}

export async function listStaff(store: KvStore) {
  return listStaffFromKv(store);
}

export async function createStaff(
  store: KvStore,
  input: { email: string; name: string; role: StaffRole; password: string },
) {
  return upsertStaffInKv(store, input);
}

export async function buildFleet(store: KvStore): Promise<OpsFleetResponse> {
  const listed = await store.list({ prefix: "shop:" });
  const shops: OpsShopRow[] = [];
  let paused = 0;
  let billableSessions = 0;
  let connected = 0;

  for (const key of listed.keys) {
    const shopId = key.name.slice("shop:".length);
    if (!ShopIdSchema.safeParse(shopId).success) continue;
    const raw = await store.get(key.name, "json");
    const installation = StorefrontInstallationSchema.safeParse(raw);
    const [subscription, usage, healthRecord] = await Promise.all([
      readSubscription(store, shopId),
      readUsage(store, shopId),
      readShopHealth(store, shopId),
    ]);
    const health = resolveCaptureHealth({
      connected: installation.success,
      lastReplayAt: healthRecord.lastReplayAt,
      lastPixelAt: healthRecord.lastPixelAt,
      lastErrorCode: healthRecord.lastErrorCode,
      lastErrorAt: healthRecord.lastErrorAt,
      usage,
    });
    if (health.quotaPaused) paused += 1;
    if (installation.success) connected += 1;
    billableSessions += usage.billableSessions;
    shops.push({
      shopId,
      status: installation.success ? "connected" : "disconnected",
      planId: subscription.planId,
      billableSessions: usage.billableSessions,
      limit: PLAN_CATALOG[subscription.planId].monthlySessions,
      lastReplayAt: health.lastReplayAt,
      lastPixelAt: health.lastPixelAt,
      lastErrorCode: health.lastErrorCode,
      health: health.hint,
    });
  }

  const events = await listPipelineEvents(store);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1_000;
  const errors24h = events.filter(
    (event) => event.level === "error" && Date.parse(event.at) >= dayAgo,
  ).length;

  return {
    shops: shops.sort((left, right) => left.shopId.localeCompare(right.shopId)),
    totals: {
      shops: shops.length,
      connected,
      paused,
      errors24h,
      billableSessions,
    },
    events,
  };
}

export async function acknowledgeEvent(store: KvStore, id: string) {
  await ackPipelineEvent(store, id);
}
