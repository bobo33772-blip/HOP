// 카페24 OAuth 2.0 (Authorization Code). 문서: https://apidocs.cafe24.com/docs/guide/oauth2-authentication
// Access Token 2시간, Refresh Token 14일.

import { scopeString } from "./scopes";

export const apiHost = (mallId: string) => `https://${mallId}.cafe24api.com`;

export function authorizeUrl(opts: { mallId: string; clientId: string; redirectUri: string; state: string; scope?: string }): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    state: opts.state,
    redirect_uri: opts.redirectUri,
    scope: opts.scope ?? scopeString(),
  });
  return `${apiHost(opts.mallId)}/api/v2/oauth/authorize?${q}`;
}

export interface TokenSet {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  scopes: string[];
}

interface TokenResponse {
  access_token: string;
  expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string;
  scopes: string[];
}

/** 토큰 발급·갱신 실패. 4xx면 토큰 자체가 무효(앱 삭제 등), 5xx·네트워크는 일시 오류 */
export class TokenError extends Error {
  constructor(readonly status: number, body: string) {
    super(`cafe24 token ${status}: ${body}`);
  }
}

// 카페24 응답 시각은 타임존 표기 없는 KST("2021-03-01T14:00:00.000")
const parseKst = (s: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}+09:00`);

async function tokenRequest(mallId: string, clientId: string, clientSecret: string, body: Record<string, string>, fetchImpl = fetch): Promise<TokenSet> {
  const res = await fetchImpl(`${apiHost(mallId)}/api/v2/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new TokenError(res.status, await res.text());
  const j = (await res.json()) as TokenResponse;
  return {
    accessToken: j.access_token,
    accessExpiresAt: parseKst(j.expires_at),
    refreshToken: j.refresh_token,
    refreshExpiresAt: parseKst(j.refresh_token_expires_at),
    scopes: j.scopes ?? [],
  };
}

export const exchangeCode = (mallId: string, clientId: string, clientSecret: string, code: string, redirectUri: string, fetchImpl?: typeof fetch) =>
  tokenRequest(mallId, clientId, clientSecret, { grant_type: "authorization_code", code, redirect_uri: redirectUri }, fetchImpl);

export const refreshTokens = (mallId: string, clientId: string, clientSecret: string, refreshToken: string, fetchImpl?: typeof fetch) =>
  tokenRequest(mallId, clientId, clientSecret, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
