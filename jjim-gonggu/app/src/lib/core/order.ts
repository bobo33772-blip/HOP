// 발주 결정 보조 1단계 (#133): 공구가 끝난 뒤 확정 수량을 최소 생산 수량 · 생산 메모와 맞춰 읽어 주고, 발주 선택지를 준다.
// AI가 아니라 정해진 규칙이다. 숫자는 새로 만들지 않고 이미 있는 값(확정 수량 · 미결제 · 최소 생산 수량 · 원가)만 쓴다.
// 기록은 결제 기간이 끝나 확정된 공구만 할 수 있다(recordProductionDecision). 결제 기간 중에는 상황만 알려 준다.

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

export interface OrderInput {
  state: string; // reached(결제 기간 중) · settled(확정)
  confirmedQty: number; // 결제 완료 수량
  unpaidMembers: number; // 쿠폰을 받고 아직 결제하지 않은 손님
  payUntilText: string | null; // 결제 마감 (화면 표기 그대로)
  moq: number | null; // 최소 생산 수량
  costPrice: number | null; // 원가 (1개당)
  dealPrice: number;
  listPrice: number;
  note: string | null; // 공구 열 때 적은 생산 메모
}

export interface OrderOption {
  key: "confirmed" | "moq";
  label: string;
  qty: number;
  note: string; // 생산 결정 기록의 '확인 근거'로 채울 글
  detail: string[]; // 버튼 아래 작은 글 (남는 재고 · 예상 이익)
}

export interface OrderAdvice { lines: string[]; options: OrderOption[] }

/** 이 수량으로 만들 때 이익 = 확정 수량 × 공구가 − 만드는 수량 × 원가 (남는 재고를 정가로 팔면 더 생기는 돈은 따로) */
function profitLines(i: OrderInput, qty: number): string[] {
  if (i.costPrice == null) return [];
  const profit = i.confirmedQty * i.dealPrice - qty * i.costPrice;
  const left = qty - i.confirmedQty;
  const out = [`공구 이익 ${profit < 0 ? `손해 ${won(-profit)}` : `약 ${won(profit)}`}`];
  if (left > 0) out.push(`남는 ${left}개를 정가로 다 팔면 +${won(left * i.listPrice)}`);
  return out;
}

export function orderAdvice(i: OrderInput): OrderAdvice | null {
  const n = i.confirmedQty, moq = i.moq && i.moq > 0 ? i.moq : null;
  const memo = i.note?.trim() || null;
  const memoLine = memo ? `적어 두신 생산 메모: “${memo}”` : null;
  const withMemo = (s: string) => (memo ? `${s} · 메모: ${memo}` : s);

  if (i.state === "reached") {
    const lines = [`결제 기간 중이에요. 지금까지 결제 ${n}개${i.unpaidMembers > 0 ? `, 결제를 기다리는 손님 ${i.unpaidMembers}명` : ""}이에요${i.payUntilText ? `(결제 마감 ${i.payUntilText})` : ""}.`];
    if (moq) lines.push(n >= moq ? `최소 생산 ${moq}개를 이미 채웠어요.` : `최소 생산 ${moq}개까지 ${moq - n}개 남았어요.`);
    if (memoLine) lines.push(memoLine);
    lines.push("결제 마감이 지나면 확정 수량으로 발주를 정해요.");
    return { lines, options: [] };
  }
  if (i.state !== "settled") return null;

  if (n <= 0) return { lines: ["확정된 주문이 없어요. 이번 공구로 발주할 수량은 없어요.", ...(memoLine ? [memoLine] : [])], options: [] };

  const lines = [`확정 ${n}개예요.${i.unpaidMembers > 0 ? ` 결제하지 않은 손님 ${i.unpaidMembers}명은 결제 기간이 끝나 이번 공구에서 빠졌어요.` : ""}`];
  if (moq) lines.push(n < moq ? `최소 생산 ${moq}개에서 ${moq - n}개 모자라요.` : n === moq ? `최소 생산 ${moq}개에 딱 맞아요.` : `최소 생산 ${moq}개를 넘었어요.`);
  if (memoLine) lines.push(memoLine);

  const options: OrderOption[] = [{
    key: "confirmed",
    label: moq && n < moq ? `확정 ${n}개로 발주 (최소 생산보다 적어요)` : `확정 ${n}개로 발주`,
    qty: n,
    note: withMemo(`확정 ${n}개 그대로`),
    detail: profitLines(i, n),
  }];
  if (moq && n < moq) {
    const left = moq - n;
    options.push({
      key: "moq",
      label: `최소 생산 ${moq}개로 발주 · 남는 ${left}개는 정가로 판매`,
      qty: moq,
      note: withMemo(`최소 생산 ${moq}개 · 확정 ${n}개, 남는 ${left}개는 정가 판매`),
      detail: [`${left}개 남음${i.costPrice != null ? ` · 원가 ${won(left * i.costPrice)}` : ""}`, ...profitLines(i, moq)],
    });
  }
  return { lines, options };
}
