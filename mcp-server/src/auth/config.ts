// mcp-server/src/auth/config.ts
// 资源服务器鉴权配置：AUTH_MODE / issuer / resource / JWKS / 必需 scope

export type AuthMode = 'jwt' | 'none';

/** jwt（默认，规范要求）：校验 Bearer JWT；none：关闭鉴权，仅限本地调试 */
export const AUTH_MODE: AuthMode =
  (process.env.AUTH_MODE || 'jwt').toLowerCase() === 'none' ? 'none' : 'jwt';

/** 授权服务器 issuer（须与令牌 iss 声明一致） */
export const AUTH_ISSUER = (process.env.AUTH_ISSUER || 'http://localhost:9000').replace(/\/$/, '');

/** 本 MCP 服务的对外资源地址，即令牌 audience（RFC 8707 的 resource） */
export const RESOURCE_URL = (process.env.RESOURCE_URL || 'http://localhost:8089/mcp').replace(/\/$/, '');

/** JWKS 地址；默认由 issuer 推导，也可显式覆盖 */
export const AUTH_JWKS_URL = process.env.AUTH_JWKS_URL || `${AUTH_ISSUER}/jwks`;

/**
 * 是否**显式**配置了 AUTH_JWKS_URL。
 * 容器部署下发现文档给出的是「对外地址」，容器内通常不可达，故显式配置须优先。
 */
export const AUTH_JWKS_URL_EXPLICIT = Boolean(process.env.AUTH_JWKS_URL);

/**
 * AS 元数据发现文档的**抓取地址**（与 AUTH_ISSUER 解耦）。
 * 容器内可指向内网地址（如 http://auth-server:9000/…），而文档里的 issuer 仍是对外地址，
 * 二者比对即可让 issuer 镜像校验在容器内也真正生效。
 */
export const AUTH_DISCOVERY_URL =
  process.env.AUTH_DISCOVERY_URL || `${AUTH_ISSUER}/.well-known/openid-configuration`;

/** 访问工具所需的 scope（空格分隔） */
export const AUTH_REQUIRED_SCOPES = (process.env.AUTH_REQUIRED_SCOPES || 'mcp:tools')
  .split(/\s+/)
  .filter(Boolean);

/** RFC 9728 的 Protected Resource Metadata 文档地址（路径感知形式） */
export function protectedResourceMetadataUrl(): string {
  const u = new URL(RESOURCE_URL);
  const suffix = u.pathname === '/' ? '' : u.pathname;
  u.pathname = `/.well-known/oauth-protected-resource${suffix}`;
  u.search = '';
  u.hash = '';
  return u.toString();
}
