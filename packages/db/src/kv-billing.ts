import {
  PLAN_CATALOG,
  ShopSubscriptionSchema,
  UsageSnapshotSchema,
  planById,
  sessionCountedKvKey,
  subscriptionKvKey,
  usageKvKey,
  usagePeriodUtc,
  type PlanId,
  type ShopSubscription,
  type UsageSnapshot,
} from "@pathminty/contracts";

export type BillingStore = {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

export async function readSubscription(
  store: BillingStore,
  shopId: string,
): Promise<ShopSubscription> {
  const stored = await store.get(subscriptionKvKey(shopId), "json");
  const parsed = ShopSubscriptionSchema.safeParse(stored);
  if (parsed.success) return parsed.data;
  return {
    planId: "free",
    status: "active",
    updatedAt: new Date().toISOString(),
  };
}

export async function writeSubscription(
  store: BillingStore,
  shopId: string,
  subscription: ShopSubscription,
): Promise<void> {
  await store.put(subscriptionKvKey(shopId), JSON.stringify(subscription), {
    expirationTtl: 60 * 60 * 24 * 400,
  });
}

export async function readUsage(
  store: BillingStore,
  shopId: string,
  now: Date = new Date(),
): Promise<UsageSnapshot> {
  const period = usagePeriodUtc(now);
  const subscription = await readSubscription(store, shopId);
  const plan = planById(subscription.planId);
  const stored = await store.get(usageKvKey(shopId, period), "json");
  const parsed = UsageSnapshotSchema.safeParse(stored);
  if (parsed.success) {
    return { ...parsed.data, planId: subscription.planId, limit: plan.monthlySessions };
  }
  return {
    planId: subscription.planId,
    period,
    billableSessions: 0,
    rawSessions: 0,
    botSessions: 0,
    limit: plan.monthlySessions,
    updatedAt: now.toISOString(),
  };
}

export async function writeUsage(
  store: BillingStore,
  shopId: string,
  usage: UsageSnapshot,
): Promise<void> {
  await store.put(usageKvKey(shopId, usage.period), JSON.stringify(usage), {
    expirationTtl: 60 * 60 * 24 * 45,
  });
}

export function isQuotaExceeded(usage: UsageSnapshot): boolean {
  return usage.billableSessions >= usage.limit;
}

export async function markSessionCounted(
  store: BillingStore,
  shopId: string,
  sessionId: string,
  period: string,
): Promise<boolean> {
  const key = sessionCountedKvKey(shopId, period, sessionId);
  const existing = await store.get(key, "json");
  if (existing) return false;
  await store.put(key, JSON.stringify({ at: new Date().toISOString() }), {
    expirationTtl: 60 * 60 * 24 * 40,
  });
  return true;
}

export async function recordBillableSession(
  store: BillingStore,
  shopId: string,
  input: {
    sessionId: string;
    quality: "human" | "short" | "likely_bot";
    replayBytes?: number;
  },
  now: Date = new Date(),
): Promise<UsageSnapshot> {
  const usage = await readUsage(store, shopId, now);
  const first = await markSessionCounted(store, shopId, input.sessionId, usage.period);
  if (!first) return usage;

  const bot = input.quality === "likely_bot";
  const billable = input.quality === "human";
  const next: UsageSnapshot = {
    ...usage,
    rawSessions: usage.rawSessions + 1,
    botSessions: usage.botSessions + (bot ? 1 : 0),
    billableSessions: usage.billableSessions + (billable ? 1 : 0),
    updatedAt: now.toISOString(),
  };
  await writeUsage(store, shopId, next);
  return next;
}

export function planLimit(planId: PlanId): number {
  return PLAN_CATALOG[planId].monthlySessions;
}

export type ShopHealthRecord = {
  lastReplayAt: string | null;
  lastPixelAt: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
};

export function healthKvKey(shopId: string): string {
  return `health:${shopId}`;
}

export async function readShopHealth(
  store: BillingStore,
  shopId: string,
): Promise<ShopHealthRecord> {
  const stored = await store.get(healthKvKey(shopId), "json");
  if (!stored || typeof stored !== "object") {
    return {
      lastReplayAt: null,
      lastPixelAt: null,
      lastErrorCode: null,
      lastErrorAt: null,
    };
  }
  const row = stored as Partial<ShopHealthRecord>;
  return {
    lastReplayAt: typeof row.lastReplayAt === "string" ? row.lastReplayAt : null,
    lastPixelAt: typeof row.lastPixelAt === "string" ? row.lastPixelAt : null,
    lastErrorCode: typeof row.lastErrorCode === "string" ? row.lastErrorCode : null,
    lastErrorAt: typeof row.lastErrorAt === "string" ? row.lastErrorAt : null,
  };
}

export async function writeShopHealth(
  store: BillingStore,
  shopId: string,
  patch: Partial<ShopHealthRecord>,
): Promise<ShopHealthRecord> {
  const current = await readShopHealth(store, shopId);
  const next = { ...current, ...patch };
  await store.put(healthKvKey(shopId), JSON.stringify(next), {
    expirationTtl: 60 * 60 * 24 * 400,
  });
  return next;
}
