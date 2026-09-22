// auth-server/src/server.ts
// 最小 OIDC 授权服务器：发现文档 + JWKS + 授权码(PKCE) + client_credentials 令牌颁发
// 说明：本服务只负责「颁发」令牌；MCP 资源服务器负责「校验」。
import express, { type Request, type Response } from 'express';
import {
  AUTH_ADMIN_TOKEN,
  AUTH_PORT,
  API_KEY_SENTINEL_CLIENT,
  CLIENTS,
  CORS_ORIGINS,
  ISSUER,
  RESOURCE_URL,
  SUPPORTED_SCOPES,
  findClient,
} from './config.js';
import { getJwks } from './keys.js';
import { randomId, safeEqual, verifyPkce } from './pkce.js';
import { issueAccessToken } from './tokens.js';
import { createApiKey, listApiKeys, lookupApiKey, revokeApiKey } from './apikeys.js';

const app = express();

// ---- CORS：浏览器 SPA 客户端需要跨域访问发现文档 / JWKS / 令牌端点 ----
// 仅回显白名单内的 Origin（不用通配符，避免配合凭据时被滥用）；预检直接 204。
app.use((req: Request, res: Response, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin.replace(/\/$/, ''))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

/** RFC 6749 风格错误响应 */
function oauthError(res: Response, status: number, error: string, description?: string): void {
  res.status(status).json({ error, error_description: description });
}

/** 管理端点鉴权：demo-admin 携带 `Authorization: Bearer <AUTH_ADMIN_TOKEN>`（生产请替换为真实鉴权） */
function requireAdmin(req: Request, res: Response, next: () => void): void {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || token !== AUTH_ADMIN_TOKEN) {
    oauthError(res, 401, 'invalid_token', '管理端点需要有效的 admin token');
    return;
  }
  next();
}

function discoveryDocument(): Record<string, unknown> {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    jwks_uri: `${ISSUER}/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'client_credentials'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    scopes_supported: SUPPORTED_SCOPES,
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
  };
}

// ---- 发现文档（OIDC Discovery 与 RFC 8414 两个路径，内容一致）----
app.get('/.well-known/openid-configuration', (_req: Request, res: Response) => {
  res.json(discoveryDocument());
});
app.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
  res.json(discoveryDocument());
});

// ---- JWKS：公钥集 ----
app.get('/jwks', async (_req: Request, res: Response) => {
  res.json(await getJwks());
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, issuer: ISSUER, resource: RESOURCE_URL });
});

// ---- API key 管理（方案 B：每个调用方申请的稳定、可吊销凭证；demo-admin 调用）----
app.post('/admin/apikeys', requireAdmin, (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const owner = String(body.owner || '').trim();
  const name = String(body.name || '').trim();
  if (!owner || !name) return oauthError(res, 400, 'invalid_request', 'owner 与 name 必填');
  const scopes = body.scopes ? String(body.scopes).split(/\s+/).filter(Boolean) : undefined;
  const ttlSeconds = body.ttlSeconds != null ? Number(body.ttlSeconds) : undefined;
  const created = createApiKey({ owner, name, scopes, ttlSeconds });
  const { keyHash: _omit, ...safe } = created;
  res.status(201).json({
    ...safe,
    note: 'rawKey 仅此一次展示，请立即保存；遗失需吊销后重新申请',
  });
});

app.get('/admin/apikeys', requireAdmin, (req: Request, res: Response) => {
  const owner = req.query.owner ? String(req.query.owner) : undefined;
  res.json(listApiKeys(owner));
});

app.delete('/admin/apikeys/:keyId', requireAdmin, (req: Request, res: Response) => {
  const ok = revokeApiKey(req.params.keyId);
  if (!ok) return oauthError(res, 404, 'not_found', '未找到该 keyId');
  res.json({ ok: true });
});

// ---- 授权码 + PKCE（S256）----
interface PendingCode {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  subject: string;
  expiresAt: number;
}
const pendingCodes = new Map<string, PendingCode>();

app.get('/authorize', (req: Request, res: Response) => {
  const q = req.query;
  const clientId = String(q.client_id || '');
  const redirectUri = String(q.redirect_uri || '');
  const responseType = String(q.response_type || '');
  const scope = String(q.scope || '');
  const state = q.state === undefined ? undefined : String(q.state);
  const codeChallenge = String(q.code_challenge || '');
  const codeChallengeMethod = String(q.code_challenge_method || '');

  const client = findClient(clientId);
  if (!client) return oauthError(res, 400, 'invalid_client', `未知客户端 ${clientId}`);
  if (!client.redirectUris.includes(redirectUri)) {
    return oauthError(res, 400, 'invalid_request', 'redirect_uri 不在该客户端的注册列表中');
  }
  if (responseType !== 'code') {
    return oauthError(res, 400, 'unsupported_response_type', '仅支持 response_type=code');
  }
  // PKCE 强制（OAuth 2.1）：必须 S256
  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return oauthError(res, 400, 'invalid_request', '必须提供 code_challenge 且 code_challenge_method=S256');
  }

  const scopes = scope ? scope.split(/\s+/).filter(Boolean) : client.allowedScopes;
  const invalid = scopes.filter((s) => !client.allowedScopes.includes(s));
  if (invalid.length) return oauthError(res, 400, 'invalid_scope', `不允许的 scope: ${invalid.join(', ')}`);

  // 清理已过期但从未被兑换的授权码，避免 Map 无界增长（内存泄漏）
  const now = Date.now();
  for (const [k, v] of pendingCodes) if (v.expiresAt < now) pendingCodes.delete(k);

  const code = randomId(32);
  pendingCodes.set(code, {
    clientId,
    redirectUri,
    scopes,
    codeChallenge,
    subject: 'demo-user',
    expiresAt: Date.now() + 60_000,
  });

  const target = new URL(redirectUri);
  target.searchParams.set('code', code);
  if (state !== undefined) target.searchParams.set('state', state);
  // RFC 9207：授权响应携带 iss，客户端须校验
  target.searchParams.set('iss', ISSUER);
  res.redirect(302, target.toString());
});

// ---- 令牌端点 ----
function authenticateClient(req: Request): { clientId: string; clientSecret?: string } | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    return { clientId: decoded.slice(0, idx), clientSecret: decoded.slice(idx + 1) };
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.client_id) {
    return {
      clientId: String(body.client_id),
      clientSecret: body.client_secret ? String(body.client_secret) : undefined,
    };
  }
  return null;
}

app.post('/token', async (req: Request, res: Response) => {
  // RFC 6749 §5.1：令牌响应必须禁止缓存
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');

  const body = (req.body ?? {}) as Record<string, unknown>;
  const grantType = String(body.grant_type || '');

  const creds = authenticateClient(req);
  if (!creds) return oauthError(res, 401, 'invalid_client', '缺少客户端凭据');

  // ===== 方案 B：API key 兑换短命 JWT（subject = key.owner，由此区分不同调用方）=====
  // 调用方可用 `client_id=__apikey__&client_secret=<apiKey>`（Basic/POST，兼容 SDK 的 ClientCredentialsProvider）
  // 或 `grant_type=client_credentials&api_key=<apiKey>` 两种形式。
  const apiKeyValue =
    creds.clientId === API_KEY_SENTINEL_CLIENT && creds.clientSecret
      ? creds.clientSecret
      : body.api_key
        ? String(body.api_key)
        : undefined;
  if (apiKeyValue) {
    if (grantType && grantType !== 'client_credentials') {
      return oauthError(res, 400, 'unsupported_grant_type', 'API key 仅支持 client_credentials');
    }
    const key = lookupApiKey(apiKeyValue);
    if (!key) return oauthError(res, 401, 'invalid_client', 'API key 无效 / 已吊销 / 已过期');
    const requested = body.scope
      ? String(body.scope).split(/\s+/).filter(Boolean)
      : key.scopes;
    const invalid = requested.filter((s) => !key.scopes.includes(s));
    if (invalid.length) {
      return oauthError(res, 400, 'invalid_scope', `该 key 无权申请 scope: ${invalid.join(', ')}`);
    }
    const resource = body.resource ? String(body.resource).replace(/\/$/, '') : undefined;
    if (resource && resource !== RESOURCE_URL) {
      return oauthError(res, 400, 'invalid_target', `resource 必须是 ${RESOURCE_URL}`);
    }
    return res.json(
      await issueAccessToken({
        clientId: `apikey:${key.owner}`,
        subject: key.owner,
        scopes: requested,
        audience: resource,
      })
    );
  }

  const client = findClient(creds.clientId);
  if (!client) return oauthError(res, 401, 'invalid_client', `未知客户端 ${creds.clientId}`);

  // 机密客户端必须校验 client_secret（支持 Basic 与 post 两种传递方式）
  if (client.clientSecret) {
    if (!creds.clientSecret || !safeEqual(creds.clientSecret, client.clientSecret)) {
      return oauthError(res, 401, 'invalid_client', 'client_secret 校验失败');
    }
  }

  // resource 参数（RFC 8707）：绑定令牌 audience
  const resource = body.resource ? String(body.resource).replace(/\/$/, '') : undefined;
  if (resource && resource !== RESOURCE_URL) {
    return oauthError(res, 400, 'invalid_target', `resource 必须是 ${RESOURCE_URL}`);
  }

  if (grantType === 'client_credentials') {
    if (!client.clientSecret) {
      return oauthError(res, 400, 'unauthorized_client', '公共客户端不允许使用 client_credentials');
    }
    const scopes = body.scope ? String(body.scope).split(/\s+/).filter(Boolean) : client.allowedScopes;
    const invalid = scopes.filter((s) => !client.allowedScopes.includes(s) || !SUPPORTED_SCOPES.includes(s));
    if (invalid.length) return oauthError(res, 400, 'invalid_scope', `不允许的 scope: ${invalid.join(', ')}`);

    return res.json(
      await issueAccessToken({
        clientId: client.clientId,
        subject: client.clientId,
        scopes,
        audience: resource,
      })
    );
  }

  if (grantType === 'authorization_code') {
    const code = String(body.code || '');
    const verifier = String(body.code_verifier || '');
    const redirectUri = body.redirect_uri ? String(body.redirect_uri) : '';

    const pending = pendingCodes.get(code);
    if (!pending) return oauthError(res, 400, 'invalid_grant', '授权码无效');
    if (pending.expiresAt < Date.now()) {
      pendingCodes.delete(code);
      return oauthError(res, 400, 'invalid_grant', '授权码已过期');
    }
    if (pending.clientId !== client.clientId) {
      return oauthError(res, 400, 'invalid_grant', '授权码与客户端不匹配');
    }
    if (pending.redirectUri !== redirectUri) {
      return oauthError(res, 400, 'invalid_grant', 'redirect_uri 不一致');
    }
    if (!verifyPkce(pending.codeChallenge, 'S256', verifier)) {
      return oauthError(res, 400, 'invalid_grant', 'PKCE 校验失败');
    }
    // 仅在全部校验通过后消费授权码，保证「单次使用」的同时，
    // 避免任一次失败尝试即作废合法客户端的授权码（可用性 / 抗 DoS）。
    // 码的抢跑风险由 60 秒 TTL 与 client_id + redirect_uri + PKCE 三重绑定覆盖。
    pendingCodes.delete(code);

    return res.json(
      await issueAccessToken({
        clientId: client.clientId,
        subject: pending.subject,
        scopes: pending.scopes,
        audience: resource,
      })
    );
  }

  return oauthError(res, 400, 'unsupported_grant_type', `不支持的 grant_type: ${grantType}`);
});

app.listen(AUTH_PORT, '0.0.0.0', () => {
  console.log(`[auth-server] 最小 OIDC 授权服务器已启动: ${ISSUER}`);
  console.log(`[auth-server]   issuer    : ${ISSUER}`);
  console.log(`[auth-server]   resource  : ${RESOURCE_URL}`);
  console.log(`[auth-server]   发现文档  : ${ISSUER}/.well-known/openid-configuration`);
  console.log(`[auth-server]   客户端    : ${CLIENTS.map((c) => c.clientId).join(', ')}`);
  console.log(`[auth-server]   scope     : ${SUPPORTED_SCOPES.join(', ')}`);
  console.log(`[auth-server]   API key 管理: POST ${ISSUER}/admin/apikeys（需 admin token）`);
  if (AUTH_ADMIN_TOKEN === 'admin-secret') {
    console.warn('[auth-server] 警告：AUTH_ADMIN_TOKEN 使用默认值 admin-secret，生产请通过环境变量设置强令牌');
  }
});
