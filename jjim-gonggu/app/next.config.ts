import type { NextConfig } from "next";

// 개발 중 ngrok 같은 외부 주소로 열 때 Next 개발 리소스(HMR)를 허용한다
const appHost = (() => {
  try { return new URL(process.env.APP_BASE_URL ?? "").hostname; } catch { return ""; }
})();

const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  allowedDevOrigins: appHost && appHost !== "localhost" ? [appHost] : [],
  async headers() {
    return [
      {
        // 카페24 스크립트태그 등록 조건: src 스크립트가 "Access-Control-Allow-Origin: *"로 응답해야 한다
        source: "/widget.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default config;
