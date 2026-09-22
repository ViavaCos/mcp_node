// auth-server/src/tokens.ts
// 访问令牌颁发：RS256 签名的 JWT，携带 iss / sub / aud / exp / scope
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { ACCESS_TOKEN_TTL, ISSUER, RESOURCE_URL } from './config.js';
import { getKeys, getSigningKey } from './keys.js';

export interface IssueOptions {
  clientId: string;
  subject?: string;
  scopes: string[];
  /** 默认绑定到 RESOURCE_URL（RFC 8707 的 resource） */
  audience?: string;
  ttlSeconds?: number;
}

export interface IssuedToken {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
}

export async function issueAccessToken(opts: IssueOptions): Promise<IssuedToken> {
  const { kid } = await getKeys();
  const key = await getSigningKey();
  const ttl = opts.ttlSeconds ?? ACCESS_TOKEN_TTL;
  const scope = opts.scopes.join(' ');
  const now = Math.floor(Date.now() / 1000);

  const access_token = await new SignJWT({ scope, client_id: opts.clientId, jti: randomUUID() })
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(ISSUER)
    .setSubject(opts.subject ?? opts.clientId)
    .setAudience(opts.audience ?? RESOURCE_URL)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + ttl)
    .sign(key);

  return { access_token, token_type: 'Bearer', expires_in: ttl, scope };
}
