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
ALTER TABLE "demand_snapshots" ADD COLUMN "run_id" integer NOT NULL;--> statement-breakpoint
CREATE INDEX "run_mall_idx" ON "collection_runs" USING btree ("mall_id","started_at");