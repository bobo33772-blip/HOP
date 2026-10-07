CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"mall_id" text,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mall_id" text NOT NULL,
	"product_no" integer NOT NULL,
	"product_name" text NOT NULL,
	"list_price" integer NOT NULL,
	"deal_price" integer NOT NULL,
	"cost_price" integer,
	"target_qty" integer NOT NULL,
	"per_member_limit" integer NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"pay_window_hours" integer NOT NULL,
	"ship_eta" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"coupon_no" text,
	"report_token" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"judged_at" timestamp with time zone,
	"pay_until" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"decision_qty" integer,
	"decision_note" text,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "collection_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"mall_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"total_products" integer DEFAULT 0 NOT NULL,
	"done_products" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "demand_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"mall_id" text NOT NULL,
	"product_no" integer NOT NULL,
	"product_name" text NOT NULL,
	"price" integer NOT NULL,
	"sold_out" boolean DEFAULT false NOT NULL,
	"wishlist_count" integer NOT NULL,
	"cart_count" integer NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"campaign_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "invitations_campaign_id_member_id_pk" PRIMARY KEY("campaign_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"campaign_id" uuid,
	"kind" text NOT NULL,
	"detail" jsonb NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "malls" (
	"mall_id" text PRIMARY KEY NOT NULL,
	"shop_no" integer DEFAULT 1 NOT NULL,
	"brand_name" text,
	"sms_sender" text,
	"opt_out_number" text,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"access_expires_at" timestamp with time zone,
	"refresh_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"plan" text DEFAULT 'trial' NOT NULL,
	"script_tag_no" text,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uninstalled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"recipients" jsonb NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"send_after" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"queue_ref" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"mall_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_links" (
	"order_id" text PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"qty" integer NOT NULL,
	"amount" integer NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pledges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"qty" integer NOT NULL,
	"state" text DEFAULT 'pledged' NOT NULL,
	"idem_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
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
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_mall_id_malls_mall_id_fk" FOREIGN KEY ("mall_id") REFERENCES "public"."malls"("mall_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_links" ADD CONSTRAINT "order_links_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_mall_idx" ON "campaigns" USING btree ("mall_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_report_token_uq" ON "campaigns" USING btree ("report_token");--> statement-breakpoint
CREATE INDEX "run_mall_idx" ON "collection_runs" USING btree ("mall_id","started_at");--> statement-breakpoint
CREATE INDEX "demand_mall_idx" ON "demand_snapshots" USING btree ("mall_id","collected_at");--> statement-breakpoint
CREATE INDEX "message_due_idx" ON "messages" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "order_campaign_idx" ON "order_links" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pledge_campaign_member_uq" ON "pledges" USING btree ("campaign_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_trace_uq" ON "webhook_events" USING btree ("trace_id");