import { sql } from "drizzle-orm";
import {
  bigint,
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

export const shops = pgTable(
  "shops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopifyDomain: varchar("shopify_domain", { length: 255 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    timeZone: varchar("time_zone", { length: 64 }).notNull(),
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
    entryRoute: text("entry_route").notNull(),
    lastRoute: text("last_route").notNull(),
    chunkCount: integer("chunk_count").notNull().default(0),
    replayBytes: bigint("replay_bytes", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sessions_shop_started_idx").on(table.shopId, table.startedAt),
    index("sessions_shop_visitor_idx").on(table.shopId, table.visitorId),
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
