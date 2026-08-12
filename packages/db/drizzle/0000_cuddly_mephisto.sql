CREATE TYPE "public"."session_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"shopify_order_id" varchar(64) NOT NULL,
	"session_id" uuid,
	"currency" varchar(3) NOT NULL,
	"gmv_minor" bigint NOT NULL,
	"discounts_minor" bigint NOT NULL,
	"refunds_minor" bigint NOT NULL,
	"cancellations_minor" bigint NOT NULL,
	"net_revenue_minor" bigint NOT NULL,
	"ordered_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"visitor_id" varchar(128) NOT NULL,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"entry_route" text NOT NULL,
	"last_route" text NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"replay_bytes" bigint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shopify_domain" varchar(255) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"time_zone" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_shop_shopify_id_uq" ON "orders" USING btree ("shop_id","shopify_order_id");--> statement-breakpoint
CREATE INDEX "orders_shop_ordered_idx" ON "orders" USING btree ("shop_id","ordered_at");--> statement-breakpoint
CREATE INDEX "orders_shop_session_idx" ON "orders" USING btree ("shop_id","session_id");--> statement-breakpoint
CREATE INDEX "sessions_shop_started_idx" ON "sessions" USING btree ("shop_id","started_at");--> statement-breakpoint
CREATE INDEX "sessions_shop_visitor_idx" ON "sessions" USING btree ("shop_id","visitor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shops_shopify_domain_uq" ON "shops" USING btree ("shopify_domain");