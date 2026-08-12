import { and, desc, eq, gte, sql } from "drizzle-orm";

import type { PlanId, SessionQuality } from "@pathminty/contracts";

import type { WorkerDatabase } from "./worker-client";
import {
  pipelineEvents,
  sessions,
  shopMembers,
  shops,
  staffSessions,
  staffUsers,
  subscriptions,
  usagePeriods,
} from "./schema";

export async function ensureShop(
  db: WorkerDatabase,
  input: {
    shopifyDomain: string;
    pixelId?: string | null;
    status?: "connected" | "disconnected" | "uninstalled";
  },
) {
  const existing = await db
    .select()
    .from(shops)
    .where(eq(shops.shopifyDomain, input.shopifyDomain))
    .limit(1);
  const row = existing[0];
  if (row) {
    await db
      .update(shops)
      .set({
        ...(input.pixelId !== undefined ? { pixelId: input.pixelId } : {}),
        ...(input.status ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(shops.id, row.id));
    return row;
  }
  const inserted = await db
    .insert(shops)
    .values({
      shopifyDomain: input.shopifyDomain,
      pixelId: input.pixelId ?? null,
      status: input.status ?? "connected",
      connectedAt: new Date(),
    })
    .returning();
  const created = inserted[0];
  if (!created) throw new Error("Failed to create shop");
  return created;
}

export async function touchShopActivity(
  db: WorkerDatabase,
  shopifyDomain: string,
  field: "lastReplayAt" | "lastPixelAt",
  at: Date,
  error?: { code: string } | null,
) {
  const shop = await ensureShop(db, { shopifyDomain });
  await db
    .update(shops)
    .set({
      [field]: at,
      ...(error ? { lastErrorCode: error.code, lastErrorAt: at } : {}),
      updatedAt: at,
    })
    .where(eq(shops.id, shop.id));
  return shop;
}

export async function upsertSessionFact(
  db: WorkerDatabase,
  input: {
    shopifyDomain: string;
    sessionId: string;
    visitorId: string;
    status: "active" | "completed" | "abandoned";
    quality: SessionQuality;
    device: string;
    source: string;
    entryRoute: string;
    lastRoute: string;
    routes: string[];
    chunkCount: number;
    replayBytes: number;
    clickCount: number;
    eventCount: number;
    durationMs: number;
    rageClickCount: number;
    hasFullSnapshot: boolean;
    billable: boolean;
    startedAt: Date;
    lastSeenAt: Date;
    endedAt: Date | null;
  },
) {
  const shop = await ensureShop(db, { shopifyDomain: input.shopifyDomain });
  const status =
    input.status === "active"
      ? "active"
      : input.status === "abandoned"
        ? "abandoned"
        : "completed";
  await db
    .insert(sessions)
    .values({
      id: input.sessionId,
      shopId: shop.id,
      visitorId: input.visitorId,
      status,
      quality: input.quality,
      device: input.device,
      source: input.source,
      entryRoute: input.entryRoute,
      lastRoute: input.lastRoute,
      routes: JSON.stringify(input.routes),
      chunkCount: input.chunkCount,
      replayBytes: BigInt(input.replayBytes),
      clickCount: input.clickCount,
      eventCount: input.eventCount,
      durationMs: input.durationMs,
      rageClickCount: input.rageClickCount,
      hasFullSnapshot: input.hasFullSnapshot,
      billable: input.billable,
      startedAt: input.startedAt,
      lastSeenAt: input.lastSeenAt,
      endedAt: input.endedAt,
    })
    .onConflictDoUpdate({
      target: sessions.id,
      set: {
        status,
        quality: input.quality,
        device: input.device,
        lastRoute: input.lastRoute,
        routes: JSON.stringify(input.routes),
        chunkCount: input.chunkCount,
        replayBytes: BigInt(input.replayBytes),
        clickCount: input.clickCount,
        eventCount: input.eventCount,
        durationMs: input.durationMs,
        rageClickCount: input.rageClickCount,
        hasFullSnapshot: input.hasFullSnapshot,
        billable: input.billable,
        lastSeenAt: input.lastSeenAt,
        endedAt: input.endedAt,
      },
    });
  return shop;
}

export async function upsertUsagePeriod(
  db: WorkerDatabase,
  shopifyDomain: string,
  period: string,
  planId: PlanId,
  delta: { billable: number; raw: number; bot: number; bytes: number },
) {
  const shop = await ensureShop(db, { shopifyDomain });
  await db
    .insert(usagePeriods)
    .values({
      shopId: shop.id,
      period,
      planId,
      billableSessions: delta.billable,
      rawSessions: delta.raw,
      botSessions: delta.bot,
      replayBytes: BigInt(delta.bytes),
    })
    .onConflictDoUpdate({
      target: [usagePeriods.shopId, usagePeriods.period],
      set: {
        planId,
        billableSessions: sql`${usagePeriods.billableSessions} + ${delta.billable}`,
        rawSessions: sql`${usagePeriods.rawSessions} + ${delta.raw}`,
        botSessions: sql`${usagePeriods.botSessions} + ${delta.bot}`,
        replayBytes: sql`${usagePeriods.replayBytes} + ${delta.bytes}`,
        updatedAt: new Date(),
      },
    });
}

export async function upsertSubscription(
  db: WorkerDatabase,
  shopifyDomain: string,
  planId: PlanId,
  status: string,
  shopifySubscriptionId?: string,
) {
  const shop = await ensureShop(db, { shopifyDomain });
  await db
    .update(shops)
    .set({ planId, updatedAt: new Date() })
    .where(eq(shops.id, shop.id));
  await db
    .insert(subscriptions)
    .values({
      shopId: shop.id,
      planId,
      status,
      shopifySubscriptionId: shopifySubscriptionId ?? null,
    })
    .onConflictDoUpdate({
      target: subscriptions.shopId,
      set: {
        planId,
        status,
        shopifySubscriptionId: shopifySubscriptionId ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function upsertShopMember(
  db: WorkerDatabase,
  shopifyDomain: string,
  email: string,
  role: "owner" | "analyst" | "viewer",
) {
  const shop = await ensureShop(db, { shopifyDomain });
  await db
    .insert(shopMembers)
    .values({
      shopId: shop.id,
      email,
      role,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [shopMembers.shopId, shopMembers.email],
      set: { lastSeenAt: new Date() },
    });
}

export async function listShopMembers(db: WorkerDatabase, shopifyDomain: string) {
  const shop = await db
    .select()
    .from(shops)
    .where(eq(shops.shopifyDomain, shopifyDomain))
    .limit(1);
  const row = shop[0];
  if (!row) return [];
  return db.select().from(shopMembers).where(eq(shopMembers.shopId, row.id));
}

export async function updateMemberRole(
  db: WorkerDatabase,
  shopifyDomain: string,
  email: string,
  role: "owner" | "analyst" | "viewer",
) {
  const shop = await ensureShop(db, { shopifyDomain });
  await db
    .update(shopMembers)
    .set({ role })
    .where(and(eq(shopMembers.shopId, shop.id), eq(shopMembers.email, email)));
}

export async function insertPipelineEvent(
  db: WorkerDatabase,
  event: {
    shopDomain?: string | null;
    service: string;
    level: string;
    code: string;
    message: string;
    requestId?: string | null;
  },
) {
  await db.insert(pipelineEvents).values({
    shopDomain: event.shopDomain ?? null,
    service: event.service,
    level: event.level,
    code: event.code,
    message: event.message.slice(0, 300),
    requestId: event.requestId ?? null,
  });
}

export async function listRecentPipelineEvents(db: WorkerDatabase, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1_000);
  return db
    .select()
    .from(pipelineEvents)
    .where(gte(pipelineEvents.at, since))
    .orderBy(desc(pipelineEvents.at))
    .limit(80);
}

export async function listStaff(db: WorkerDatabase) {
  return db.select().from(staffUsers).orderBy(staffUsers.email);
}

export async function findStaffByEmail(db: WorkerDatabase, email: string) {
  const rows = await db
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function createStaffUser(
  db: WorkerDatabase,
  input: {
    email: string;
    name: string;
    role: "viewer" | "oncall" | "admin";
    passwordHash: string;
  },
) {
  const rows = await db
    .insert(staffUsers)
    .values({
      email: input.email.toLowerCase(),
      name: input.name,
      role: input.role,
      passwordHash: input.passwordHash,
    })
    .returning();
  return rows[0];
}

export async function putStaffSession(
  db: WorkerDatabase,
  input: { id: string; staffId: string; expiresAt: Date },
) {
  await db.insert(staffSessions).values(input);
}

export async function getStaffSession(db: WorkerDatabase, id: string) {
  const rows = await db
    .select({
      session: staffSessions,
      staff: staffUsers,
    })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffSessions.staffId, staffUsers.id))
    .where(eq(staffSessions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listShopsForOps(db: WorkerDatabase) {
  return db.select().from(shops).orderBy(desc(shops.updatedAt)).limit(500);
}
