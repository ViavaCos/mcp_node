// auth-server/src/config.ts
// 授权服务器配置：issuer、受保护资源、注册客户端、支持的 scope
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const AUTH_PORT = Number(process.env.AUTH_PORT || 9000);
/** OIDC issuer，需与发现文档、令牌 iss 声明完全一致 */
export const ISSUER = (process.env.AUTH_ISSUER || `http://localhost:${AUTH_PORT}`).replace(/\/$/, '');
/** 受保护的 MCP 资源地址：令牌的默认 audience（RFC 8707 的 resource） */
export const RESOURCE_URL = (process.env.RESOURCE_URL || 'http://localhost:8089/mcp').replace(/\/$/, '');
/** 访问令牌有效期（秒） */
export const ACCESS_TOKEN_TTL = Number(process.env.AUTH_TOKEN_TTL || 300);
/** RS256 密钥对持久化路径（首次启动生成，勿提交版本库） */
export const KEYS_PATH = process.env.AUTH_KEYS_PATH || path.join(__dirname, '..', 'keys.json');
/** API key 存储路径（方案 B：每个调用方申请的稳定、可吊销 key，持久化到文件，勿提交版本库） */
export const AUTH_APIKEYS_PATH = process.env.AUTH_APIKEYS_PATH || path.join(__dirname, '..', 'apikeys.json');
/** 管理端点保护令牌：demo-admin 调用 /admin/apikeys 时携带 `Authorization: Bearer <token>`。生产请改用真实鉴权。 */
export const AUTH_ADMIN_TOKEN = process.env.AUTH_ADMIN_TOKEN || 'admin-secret';
/** API key 兑换时使用的哨兵 client_id：演示客户端以 `client_id=__apikey__` + `client_secret=<apiKey>` 走 client_credentials。 */
export const API_KEY_SENTINEL_CLIENT = '__apikey__';
/** API key 原始字符串前缀（仅用于可读性，不参与校验） */
export const API_KEY_PREFIX = 'mcp_';
/** 资源服务器支持的 scope 集合 */
export const SUPPORTED_SCOPES = (process.env.AUTH_SCOPES || 'mcp:tools mcp:admin').split(/\s+/).filter(Boolean);

export interface RegisteredClient {
  clientId: string;
  /** 无 clientSecret 视为公共客户端，仅允许 PKCE 授权码流程 */
  clientSecret?: string;
  name: string;
  allowedScopes: string[];
  redirectUris: string[];
}

export const CLIENTS: RegisteredClient[] = [
  {
    clientId: process.env.AUTH_CLIENT_ID || 'demo-client',
    clientSecret: process.env.AUTH_CLIENT_SECRET || 'demo-secret',
    name: '演示客户端（M2M + 授权码）',
    allowedScopes: SUPPORTED_SCOPES,
    redirectUris: [
      'http://localhost:5173/callback',
      'http://127.0.0.1:5173/callback',
    ],
  },
  {
    clientId: 'public-spa',
    name: '公共客户端（仅 PKCE）',
    allowedScopes: SUPPORTED_SCOPES,
    redirectUris: [
      'http://localhost:5173/callback',
      'http://127.0.0.1:5173/callback',
    ],
  },
];

export function findClient(clientId: string): RegisteredClient | undefined {
  return CLIENTS.find((c) => c.clientId === clientId);
}

/**
 * 允许跨域访问授权端点 / 发现文档 / JWKS 的来源白名单。
 * 默认由已注册客户端的 redirect_uri 派生（浏览器 SPA 必须跨域调用 /token 与发现端点，
 * 否则预检失败、无法取令牌）；可用 AUTH_CORS_ORIGINS 显式覆盖（空格或逗号分隔）。
 */
export const CORS_ORIGINS: string[] = (
  process.env.AUTH_CORS_ORIGINS
    ? process.env.AUTH_CORS_ORIGINS.split(/[\s,]+/).filter(Boolean)
    : Array.from(
        new Set(
          CLIENTS.flatMap((c) =>
            c.redirectUris
              .map((u) => {
                try {
                  return new URL(u).origin;
                } catch {
                  return '';
                }
              })
              .filter(Boolean)
          )
        )
      )
).map((o) => o.replace(/\/$/, ''));
