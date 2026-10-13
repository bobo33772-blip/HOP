CREATE TABLE "product_alerts" (
	"mall_id" text NOT NULL,
	"product_no" integer NOT NULL,
	"member_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "product_alerts_mall_id_product_no_member_id_pk" PRIMARY KEY("mall_id","product_no","member_id")
);
--> statement-breakpoint
-- 0001과 같은 이유로 공개 API(anon 키)에서는 막는다
ALTER TABLE "product_alerts" ENABLE ROW LEVEL SECURITY;
