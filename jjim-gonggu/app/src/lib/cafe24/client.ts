// 카페24 Admin API 호출기. 토큰 자동 갱신, 429 재시도(백오프)를 담당한다.
// 한도: 몰 단위 버킷 — 초과 시 429. 수요 레이더 같은 대량 조회는 반드시 배치(워커)에서 호출할 것.

import { apiHost } from "./oauth";

export const API_VERSION = "2026-09-01";

export interface TokenProvider {
  /** 유효한 access token. force=true면 갱신 후 반환 */
  get(force?: boolean): Promise<string>;
}

export class Cafe24Error extends Error {
  constructor(public status: number, public body: string, public path: string) {
    super(`cafe24 ${status} ${path}: ${body.slice(0, 300)}`);
  }
}

export class Cafe24Client {
  constructor(
    public readonly mallId: string,
    private tokens: TokenProvider,
    private fetchImpl: typeof fetch = fetch,
    private sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async request<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {}): Promise<T> {
    const url = new URL(`${apiHost(this.mallId)}/api/v2/admin${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

    let refreshed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = await this.tokens.get(false);
      const res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Cafe24-Api-Version": API_VERSION,
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        await this.tokens.get(true);
        continue;
      }
      if (res.status === 429 || res.status === 503) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
        continue;
      }
      const text = await res.text();
      if (!res.ok) throw new Cafe24Error(res.status, text, path);
      return (text ? JSON.parse(text) : {}) as T;
    }
    throw new Cafe24Error(429, "retry limit exceeded", path);
  }
}
