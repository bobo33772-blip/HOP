// 카페24 토큰 저장용 AES-256-GCM 암호화. 형식: base64(iv).base64(tag).base64(ciphertext)

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(hex: string): Buffer {
  const k = Buffer.from(hex, "hex");
  if (k.length !== 32) throw new Error("TOKEN_ENC_KEY must be 32 bytes hex");
  return k;
}

export function encrypt(plain: string, keyHex: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(keyHex), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(token: string, keyHex: string): string {
  const [iv, tag, enc] = token.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(keyHex), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
