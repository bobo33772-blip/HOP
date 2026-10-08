// 카페24 Admin API 호출기. 토큰 자동 갱신, 429 재시도(백오프), 호출 한도 선제 대기를 담당한다.
// 한도(문서): 몰 단위 버킷 40칸·초당 2칸 회복, 별도로 10분 3,000회. 수요 레이더 같은 대량 조회는 배치에서 속도를 조절할 것.

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
      // 429(한도 초과)는 요청이 처리되지 않은 것이라 어떤 요청이든 다시 보낸다.
      // 503은 처리됐을 수도 있어 조회(GET)만 다시 보낸다 → 문자 발송·쿠폰 발급이 두 번 일어나지 않게
      if (res.status === 429 || (res.status === 503 && method === "GET")) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      // 문서: 버킷 40칸, 초당 2칸씩 비워진다. 'X-Api-Call-Limit: 사용/최대'가 3/4을 넘으면 미리 쉬어 429를 피한다
      const [used, max] = String(res.headers.get("X-Api-Call-Limit") ?? "").split("/").map(Number);
      if (max > 0 && used / max >= 0.75) await this.sleep(Math.ceil((used - max / 2) / 2) * 1000);
      const text = await res.text();
      if (!res.ok) throw new Cafe24Error(res.status, text, path);
      return (text ? JSON.parse(text) : {}) as T;
    }
    throw new Cafe24Error(429, "retry limit exceeded", path);
  }
}
