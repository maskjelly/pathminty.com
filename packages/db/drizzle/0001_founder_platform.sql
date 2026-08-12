CREATE TYPE "public"."shop_status" AS ENUM('connected', 'disconnected', 'uninstalled');--> statement-breakpoint
CREATE TYPE "public"."session_quality" AS ENUM('human', 'short', 'likely_bot');--> statement-breakpoint
CREATE TYPE "public"."plan_id" AS ENUM('free', 'launch', 'growth');--> statement-breakpoint
CREATE TYPE "public"."merchant_role" AS ENUM('owner', 'analyst', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('viewer', 'oncall', 'admin');--> statement-breakpoint
ALTER TABLE "shops" ALTER COLUMN "currency" SET DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE "shops" ALTER COLUMN "time_zone" SET DEFAULT 'UTC';--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "status" "shop_status" DEFAULT 'connected' NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "plan_id" "plan_id" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "pixel_id" varchar(255);--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "connected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "last_replay_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "last_pixel_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "last_error_code" varchar(64);--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "last_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "quality" "session_quality" DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "device" varchar(16) DEFAULT 'desktop' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "source" varchar(16) DEFAULT 'storefront' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "routes" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "click_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "event_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "duration_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "rage_click_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "has_full_snapshot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "billable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "sessions_shop_last_seen_idx" ON "sessions" USING btree ("shop_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "sessions_shop_quality_idx" ON "sessions" USING btree ("shop_id","quality");--> statement-breakpoint
CREATE TABLE "usage_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"plan_id" "plan_id" NOT NULL,
	"billable_sessions" integer DEFAULT 0 NOT NULL,
	"raw_sessions" integer DEFAULT 0 NOT NULL,
	"bot_sessions" integer DEFAULT 0 NOT NULL,
	"replay_bytes" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"plan_id" "plan_id" NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"shopify_subscription_id" varchar(255),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "shop_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "merchant_role" DEFAULT 'viewer' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(80) NOT NULL,
	"role" "staff_role" DEFAULT 'viewer' NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "pipeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_domain" varchar(255),
	"service" varchar(32) NOT NULL,
	"level" varchar(8) NOT NULL,
	"code" varchar(64) NOT NULL,
	"message" varchar(300) NOT NULL,
	"request_id" varchar(64),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"acked_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "usage_periods" ADD CONSTRAINT "usage_periods_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_id_staff_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_shop_period_uq" ON "usage_periods" USING btree ("shop_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_shop_uq" ON "subscriptions" USING btree ("shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_members_shop_email_uq" ON "shop_members" USING btree ("shop_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_email_uq" ON "staff_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "staff_sessions_staff_idx" ON "staff_sessions" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "pipeline_events_at_idx" ON "pipeline_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "pipeline_events_shop_at_idx" ON "pipeline_events" USING btree ("shop_domain","at");--> statement-breakpoint
CREATE INDEX "pipeline_events_code_idx" ON "pipeline_events" USING btree ("code","at");
