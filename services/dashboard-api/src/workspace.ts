import {
  PLAN_CATALOG,
  ShopIdSchema,
  type MerchantRole,
  type PlanId,
  type ShopWorkspace,
} from "@pathminty/contracts";
import {
  readShopHealth,
  readSubscription,
  readUsage,
  resolveCaptureHealth,
  writeSubscription,
  writeUsage,
  type BillingStore,
} from "@pathminty/db/worker";

export async function buildWorkspace(
  store: BillingStore,
  shopId: string,
  role: MerchantRole,
): Promise<ShopWorkspace> {
  const [subscription, usage, healthRecord] = await Promise.all([
    readSubscription(store, shopId),
    readUsage(store, shopId),
    readShopHealth(store, shopId),
  ]);
  const plan = PLAN_CATALOG[subscription.planId];
  const connected = true;
  const health = resolveCaptureHealth({
    connected,
    lastReplayAt: healthRecord.lastReplayAt,
    lastPixelAt: healthRecord.lastPixelAt,
    lastErrorCode: healthRecord.lastErrorCode,
    lastErrorAt: healthRecord.lastErrorAt,
    usage,
  });

  return {
    shopId,
    role,
    plan: {
      id: plan.id,
      name: plan.name,
      priceUsd: plan.priceUsd,
      monthlySessions: plan.monthlySessions,
      retentionDays: plan.retentionDays,
    },
    usage,
    health,
    members: [
      {
        email: "shop-admin",
        role,
        lastSeenAt: new Date().toISOString(),
      },
    ],
  };
}

export async function applyPlanChange(
  store: BillingStore,
  shopId: string,
  planId: PlanId,
  shopifySubscriptionId?: string,
) {
  const now = new Date().toISOString();
  await writeSubscription(store, shopId, {
    planId,
    status: "active",
    ...(shopifySubscriptionId ? { shopifySubscriptionId } : {}),
    updatedAt: now,
  });
  const usage = await readUsage(store, shopId);
  await writeUsage(store, shopId, {
    ...usage,
    planId,
    limit: PLAN_CATALOG[planId].monthlySessions,
    updatedAt: now,
  });
}

export function parseShopDomain(value: string) {
  return ShopIdSchema.safeParse(value);
}
