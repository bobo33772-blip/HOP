import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // hookTimeout: 테스트 파일을 동시에 돌리면 데모 컨텍스트를 만드는 beforeAll이 기본 10초를 넘길 때가 있다 (tests/routes.test.ts)
  test: { include: ["tests/**/*.test.ts"], testTimeout: 20_000, hookTimeout: 30_000 },
});
