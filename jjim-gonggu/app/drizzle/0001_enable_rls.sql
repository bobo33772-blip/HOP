-- Supabase는 public 스키마의 테이블을 공개 API(PostgREST, anon 키)로 노출한다.
-- 정책 없이 RLS만 켜 두면 공개 API로는 아무것도 읽고 쓸 수 없고, 서버의 직접 DB 연결(소유자 권한)은 영향을 받지 않는다.
ALTER TABLE "malls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oauth_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "collection_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demand_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pledges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "issues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
