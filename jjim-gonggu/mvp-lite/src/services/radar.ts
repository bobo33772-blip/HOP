import type { Ctx } from '../context.ts';

// 4주 MVP 범위: 화면 대신 '찜 많은 상위 20개 상품' 목록만 만든다. 운영팀이 판매자에게 공유한다.
const cache = new Map<string, { at: number; rows: RadarRow[] }>();
const TTL = 6 * 3600 * 1000;

export type RadarRow = { product_no: number; product_name: string; price: number; sold_out: boolean; wishlist: number; cart: number };

export async function topWishedProducts(ctx: Ctx, mallId: string, n = 20, fresh = false): Promise<RadarRow[]> {
  const hit = cache.get(mallId);
  const now = ctx.clock.now().getTime();
  if (!fresh && hit && now - hit.at < TTL) return hit.rows.slice(0, n);
  const products = await ctx.cafe24.listProducts(mallId);
  const rows: RadarRow[] = [];
  // 카페24 호출 한도(몰별 초당 2회 회복)를 지키도록 순서대로 조회한다
  for (const p of products) {
    const wishlist = await ctx.cafe24.wishlistCount(mallId, p.product_no);
    const cart = await ctx.cafe24.cartCount(mallId, p.product_no);
    rows.push({ ...p, wishlist, cart });
  }
  rows.sort((a, b) => b.wishlist - a.wishlist || b.cart - a.cart);
  cache.set(mallId, { at: now, rows });
  return rows.slice(0, n);
}
