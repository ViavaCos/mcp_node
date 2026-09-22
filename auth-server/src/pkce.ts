// auth-server/src/pkce.ts
// PKCE（RFC 7636，仅 S256）与常量时间比较工具
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const randomId = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** 常量时间字符串比较，避免时序侧信道 */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** 校验 PKCE：仅接受 S256；code_challenge = BASE64URL(SHA256(code_verifier)) */
export function verifyPkce(codeChallenge: string, codeChallengeMethod: string, codeVerifier: string): boolean {
  if (codeChallengeMethod !== 'S256' || !codeVerifier) return false;
  const digest = createHash('sha256').update(codeVerifier).digest('base64url');
  return safeEqual(digest, codeChallenge);
}
