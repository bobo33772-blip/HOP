import type { Metadata, Viewport } from "next";
import "./globals.css";
import { THEME_BOOT, THEME_COLOR } from "@/lib/theme";

export const metadata: Metadata = { title: "찜꽁", description: "알림 신청·장바구니 고객과 함께 여는 결제 없는 예약 공동구매 — 카페24 판매자 앱" };
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: THEME_COLOR.light, // 기본 밝게. 어둡게를 고르면 화면에서 바꾼다 (#85)
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="light" suppressHydrationWarning>
      <head>
        {/* 화면 밝기 (#85): 저장된 '어둡게'를 첫 그림 전에 적용해 깜빡이지 않게 한다 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
