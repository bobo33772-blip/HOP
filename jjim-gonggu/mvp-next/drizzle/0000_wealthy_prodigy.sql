CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"mall_id" text,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mall_id" text NOT NULL,
	"product_no" integer NOT NULL,
	"product_name" text NOT NULL,
	"target_qty" integer NOT NULL,
	"deal_price" integer NOT NULL,
	"list_price" integer NOT NULL,
	"cost_price" integer,
	"deadline_at" timestamp with time zone NOT NULL,
	"pay_window_hours" integer DEFAULT 72 NOT NULL,
	"per_member_limit" integer DEFAULT 1 NOT NULL,
	"ship_eta" date NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"cafe24_coupon_no" text,
	"extended" boolean DEFAULT false NOT NULL,
	"extend_reason" text,
	"invited_count" integer DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone,
	"judged_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demand_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"mall_id" text NOT NULL,
	"product_no" integer NOT NULL,
	"product_name" text NOT NULL,
	"price" integer NOT NULL,
	"wishlist_count" integer NOT NULL,
	"cart_count" integer NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "malls" (
	"mall_id" text PRIMARY KEY NOT NULL,
	"shop_no" integer DEFAULT 1 NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"access_expires_at" timestamp with time zone,
	"refresh_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"plan" text DEFAULT 'trial' NOT NULL,
	"sms_sender" text,
	"opt_out_number" text,
	"script_tag_no" text,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uninstalled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "message_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"mall_id" text NOT NULL,
	"campaign_id" uuid,
	"kind" text NOT NULL,
	"member_id" text NOT NULL,
	"is_ad" boolean NOT NULL,
	"status" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"mall_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pledges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"mall_id" text NOT NULL,
	"member_id" text NOT NULL,
	"qty" integer NOT NULL,
	"state" text DEFAULT 'pledged' NOT NULL,
	"idempotency_key" text NOT NULL,
	"order_id" text,
	"paid_amount" integer,
	"coupon_issued_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"event_no" integer NOT NULL,
	"mall_id" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_mall_idx" ON "campaigns" USING btree ("mall_id","state");--> statement-breakpoint
CREATE INDEX "demand_mall_idx" ON "demand_snapshots" USING btree ("mall_id","collected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pledge_idem_uq" ON "pledges" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "pledge_campaign_member_idx" ON "pledges" USING btree ("campaign_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_trace_uq" ON "webhook_events" USING btree ("trace_id");