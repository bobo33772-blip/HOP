import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "찜 공구", description: "찜 고객 예약 공동구매 — 판매자 앱" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
