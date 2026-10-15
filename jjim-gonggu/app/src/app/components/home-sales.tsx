"use client";

// 홈의 공구 매출 그래프 (#92): 내 공구 화면의 '공구 매출'(#80)과 같은 부품 · API를 짧게(compact) 보여 준다.
// 홈은 서버 화면이라 판매자 API 틀(ConsoleProvider)과 오류 안내(토스트)를 여기서 감싼다.

import { ConsoleProvider, useToast } from "../console/provider";
import { SalesPanel } from "../console/sales";

// campaigns/seller-console.tsx의 판매자 API 주소와 같다
const SELLER_API = { role: "seller", mallBase: "/api/seller", campaignBase: "/api/seller/campaigns", now: "/api/seller/now", loginUrl: "/" } as const;

export default function HomeSales() {
  const { say, node } = useToast();
  return (
    <ConsoleProvider api={SELLER_API}>
      <SalesPanel say={say} compact />
      {node}
    </ConsoleProvider>
  );
}
