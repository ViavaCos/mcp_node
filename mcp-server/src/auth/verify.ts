// mcp-server/src/auth/verify.ts
// 令牌校验：JWKS 验签 + iss/aud/exp/nbf 校验 + scope 断言
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import {
  AUTH_DISCOVERY_URL,
  AUTH_ISSUER,
  AUTH_JWKS_URL,
  AUTH_JWKS_URL_EXPLICIT,
  AUTH_REQUIRED_SCOPES,
  RESOURCE_URL,
} from './config.js';

type Jwks = ReturnType<typeof createRemoteJWKSet>;
let jwks: Jwks | null = null;

/**
 * 通过授权服务器元数据发现 jwks_uri，并校验镜像规则
 * （元数据中的 issuer 必须与获取该文档的地址一致）；失败则回退默认地址。
 *
 * 注意优先级：**显式配置的 AUTH_JWKS_URL 永远优先于发现文档里的 jwks_uri**。
 * 容器部署时发现文档给出的是对外地址（如 https://auth.example.com/jwks），容器内不可达；
 * 此时发现仅用于完成 issuer 镜像校验，实际公钥仍从显式配置的内网地址拉取。
 */
export async function resolveJwksUrl(): Promise<string> {
  try {
    const res = await fetch(AUTH_DISCOVERY_URL);
    if (res.ok) {
      const meta = (await res.json()) as { issuer?: string; jwks_uri?: string };
      if (meta.issuer && meta.issuer.replace(/\/$/, '') !== AUTH_ISSUER) {
        throw new Error(`AS 元数据 issuer(${meta.issuer}) 与预期(${AUTH_ISSUER}) 不一致`);
      }
      if (AUTH_JWKS_URL_EXPLICIT) {
        console.log(
          `[mcp-server] AS 元数据发现成功且 issuer 校验通过；按显式配置使用 JWKS=${AUTH_JWKS_URL}`
        );
        return AUTH_JWKS_URL;
      }
      if (meta.jwks_uri) return meta.jwks_uri;
    }
  } catch (e) {
    console.warn(`[mcp-server] AS 元数据发现失败，回退到 ${AUTH_JWKS_URL}：${(e as Error).message}`);
  }
  return AUTH_JWKS_URL;
}

export function initJwks(url: string = AUTH_JWKS_URL): void {
  jwks = createRemoteJWKSet(new URL(url), { cooldownDuration: 30_000 });
}

export interface AuthFailure {
  ok: false;
  /** 401 = 令牌无效（invalid_token）；403 = 权限不足（insufficient_scope） */
  status: 401 | 403;
  error: 'invalid_token' | 'insufficient_scope';
  description: string;
}

export interface AuthSuccess {
  ok: true;
  subject: string;
  scopes: string[];
}

export type AuthResult = AuthSuccess | AuthFailure;

/** 校验访问令牌；算法固定 RS256，audience 必须等于本资源地址 */
export async function verifyAccessToken(token: string): Promise<AuthResult> {
  if (!jwks) throw new Error('JWKS 尚未初始化（应在启动时调用 initJwks）');

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, jwks, {
      issuer: AUTH_ISSUER,
      audience: RESOURCE_URL,
      algorithms: ['RS256'],
    });
    payload = result.payload;
  } catch (e) {
    return { ok: false, status: 401, error: 'invalid_token', description: (e as Error).message };
  }

  const scopes = String(payload.scope ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const missing = AUTH_REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
  if (missing.length) {
    return {
      ok: false,
      status: 403,
      error: 'insufficient_scope',
      description: `缺少必需 scope：${missing.join(', ')}`,
    };
  }

  return { ok: true, subject: String(payload.sub ?? ''), scopes };
}
