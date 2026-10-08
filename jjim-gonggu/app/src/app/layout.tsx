import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "찜꽁", description: "찜·장바구니 고객과 함께 여는 결제 없는 예약 공동구매 — 카페24 판매자 앱" };
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f5f2" }, { media: "(prefers-color-scheme: dark)", color: "#111114" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
