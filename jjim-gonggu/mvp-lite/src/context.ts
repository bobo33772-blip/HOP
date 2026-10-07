import type { DB } from './db.ts';
import type { Cafe24Port } from './cafe24/port.ts';
import type { Clock } from './time.ts';

export type Ctx = {
  db: DB;
  cafe24: Cafe24Port;
  clock: Clock;
  /** 고객이 문자 링크로 들어갈 상품 페이지 주소 */
  productUrl: (mallId: string, productNo: number) => string;
  log: (msg: string, extra?: unknown) => void;
};

export class UserError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}

export const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
