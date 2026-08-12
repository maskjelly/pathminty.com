import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const sessionStatus = pgEnum("session_status", [
  "active",
  "completed",
  "abandoned",
]);

export const shopStatus = pgEnum("shop_status", [
  "connected",
  "disconnected",
  "uninstalled",
]);

export const sessionQuality = pgEnum("session_quality", [
  "human",
  "short",
  "likely_bot",
]);

export const planId = pgEnum("plan_id", ["free", "launch", "growth"]);

export const merchantRole = pgEnum("merchant_role", ["owner", "analyst", "viewer"]);

export const staffRole = pgEnum("staff_role", ["viewer", "oncall", "admin"]);

export const shops = pgTable(
  "shops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopifyDomain: varchar("shopify_domain", { length: 255 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    timeZone: varchar("time_zone", { length: 64 }).notNull().default("UTC"),
    status: shopStatus("status").notNull().default("connected"),
    planId: planId("plan_id").notNull().default("free"),
    pixelId: varchar("pixel_id", { length: 255 }),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastReplayAt: timestamp("last_replay_at", { withTimezone: true }),
    lastPixelAt: timestamp("last_pixel_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 64 }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("shops_shopify_domain_uq").on(table.shopifyDomain)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    visitorId: varchar("visitor_id", { length: 128 }).notNull(),
    status: sessionStatus("status").notNull().default("active"),
    quality: sessionQuality("quality").notNull().default("human"),
    device: varchar("device", { length: 16 }).notNull().default("desktop"),
    source: varchar("source", { length: 16 }).notNull().default("storefront"),
    entryRoute: text("entry_route").notNull(),
    lastRoute: text("last_route").notNull(),
    routes: text("routes").notNull().default("[]"),
    chunkCount: integer("chunk_count").notNull().default(0),
    replayBytes: bigint("replay_bytes", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    clickCount: integer("click_count").notNull().default(0),
    eventCount: integer("event_count").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    rageClickCount: integer("rage_click_count").notNull().default(0),
    hasFullSnapshot: boolean("has_full_snapshot").notNull().default(false),
    billable: boolean("billable").notNull().default(true),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sessions_shop_started_idx").on(table.shopId, table.startedAt),
    index("sessions_shop_visitor_idx").on(table.shopId, table.visitorId),
    index("sessions_shop_last_seen_idx").on(table.shopId, table.lastSeenAt),
    index("sessions_shop_quality_idx").on(table.shopId, table.quality),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    shopifyOrderId: varchar("shopify_order_id", { length: 64 }).notNull(),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    currency: varchar("currency", { length: 3 }).notNull(),
    grossMerchandiseValueMinor: bigint("gmv_minor", { mode: "bigint" }).notNull(),
    discountsMinor: bigint("discounts_minor", { mode: "bigint" }).notNull(),
    refundsMinor: bigint("refunds_minor", { mode: "bigint" }).notNull(),
    cancellationsMinor: bigint("cancellations_minor", { mode: "bigint" }).notNull(),
    netRevenueMinor: bigint("net_revenue_minor", { mode: "bigint" }).notNull(),
    orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_shop_shopify_id_uq").on(table.shopId, table.shopifyOrderId),
    index("orders_shop_ordered_idx").on(table.shopId, table.orderedAt),
    index("orders_shop_session_idx").on(table.shopId, table.sessionId),
  ],
);

export const usagePeriods = pgTable(
  "usage_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    period: varchar("period", { length: 7 }).notNull(),
    planId: planId("plan_id").notNull(),
    billableSessions: integer("billable_sessions").notNull().default(0),
    rawSessions: integer("raw_sessions").notNull().default(0),
    botSessions: integer("bot_sessions").notNull().default(0),
    replayBytes: bigint("replay_bytes", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("usage_shop_period_uq").on(table.shopId, table.period)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    planId: planId("plan_id").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    shopifySubscriptionId: varchar("shopify_subscription_id", { length: 255 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("subscriptions_shop_uq").on(table.shopId)],
);

export const shopMembers = pgTable(
  "shop_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: merchantRole("role").notNull().default("viewer"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("shop_members_shop_email_uq").on(table.shopId, table.email)],
);

export const staffUsers = pgTable(
  "staff_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    role: staffRole("role").notNull().default("viewer"),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("staff_users_email_uq").on(table.email)],
);

export const staffSessions = pgTable(
  "staff_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("staff_sessions_staff_idx").on(table.staffId)],
);

export const pipelineEvents = pgTable(
  "pipeline_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopDomain: varchar("shop_domain", { length: 255 }),
    service: varchar("service", { length: 32 }).notNull(),
    level: varchar("level", { length: 8 }).notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    message: varchar("message", { length: 300 }).notNull(),
    requestId: varchar("request_id", { length: 64 }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    ackedAt: timestamp("acked_at", { withTimezone: true }),
  },
  (table) => [
    index("pipeline_events_at_idx").on(table.at),
    index("pipeline_events_shop_at_idx").on(table.shopDomain, table.at),
    index("pipeline_events_code_idx").on(table.code, table.at),
  ],
);
