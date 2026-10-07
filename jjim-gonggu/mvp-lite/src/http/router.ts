import type { IncomingMessage, ServerResponse } from 'node:http';
import { UserError } from '../context.ts';

export type Req = IncomingMessage & { params: Record<string, string>; query: URLSearchParams; rawBody: string; body: any; path: string };
export type Handler = (req: Req, res: ServerResponse) => Promise<void> | void;

const MAX_BODY = 64 * 1024;

export class Router {
  private routes: { method: string; re: RegExp; keys: string[]; h: Handler }[] = [];
  add(method: string, pattern: string, h: Handler) {
    const keys: string[] = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_m, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, h });
    return this;
  }
  get(p: string, h: Handler) { return this.add('GET', p, h); }
  post(p: string, h: Handler) { return this.add('POST', p, h); }
  delete(p: string, h: Handler) { return this.add('DELETE', p, h); }

  async handle(req0: IncomingMessage, res: ServerResponse) {
    const req = req0 as Req;
    const url = new URL(req.url ?? '/', 'http://local');
    req.path = url.pathname; req.query = url.searchParams;
    try {
      if (req.method === 'OPTIONS') return cors(res), res.writeHead(204).end();
      const found = this.routes.find(r => r.method === req.method && r.re.test(req.path));
      if (!found) return sendJson(res, 404, { error: 'not_found', message: '없는 주소예요.' });
      const m = found.re.exec(req.path)!;
      req.params = Object.fromEntries(found.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      req.rawBody = await readBody(req);
      req.body = parseBody(req);
      await found.h(req, res);
    } catch (e) {
      if (e instanceof UserError) return sendJson(res, e.status, { error: e.code, message: e.message });
      console.error(e);
      sendJson(res, 500, { error: 'server_error', message: '잠시 후 다시 시도해 주세요.' });
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  if (req.method === 'GET' || req.method === 'HEAD') return Promise.resolve('');
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BODY) { reject(new UserError('too_large', '요청이 너무 커요.', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseBody(req: Req) {
  if (!req.rawBody) return {};
  const ct = String(req.headers['content-type'] ?? '');
  if (ct.includes('application/json')) { try { return JSON.parse(req.rawBody); } catch { throw new UserError('bad_json', 'JSON 형식이 아니에요.'); } }
  if (ct.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(req.rawBody));
  return {};
}

const SEC_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

export function cors(res: ServerResponse) {
  // 공개 API는 쿠키를 쓰지 않으므로 출처를 열어 둔다. 회원 확인은 암호화 회원 ID로만 한다.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
}

export function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS }).end(JSON.stringify(data));
}

export function sendHtml(res: ServerResponse, html: string, status = 200, extra: Record<string, string> = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'",
    ...SEC_HEADERS, ...extra,
  }).end(html);
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** 아주 단순한 IP별 요청 제한 (신청 API 남용 방지) */
export function rateLimiter(perMinute: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: IncomingMessage) => {
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
    const now = Date.now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    const h = hits.get(ip);
    if (!h || h.reset < now) { hits.set(ip, { n: 1, reset: now + 60_000 }); return; }
    if (++h.n > perMinute) throw new UserError('rate_limited', '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', 429);
  };
}
