// auth-server/src/apikeys.ts
// 方案 B 的核心：每个调用方（用户 / 集成方）申请的「API key」。
// 设计要点：
//   - API key 是稳定、可吊销、绑定 owner 身份的密钥；调用方用它兑换短命 JWT（见 server.ts 的 /token）。
//   - 线上跑的仍是 RS256 短命 JWT（资源服务器无状态校验不变），API key 只是「可申请 / 可吊销」的长期凭证。
//   - 仅存储 key 的 sha256 哈希，原始 key 只在创建时返回一次，降低存储泄露风险。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { API_KEY_PREFIX, AUTH_APIKEYS_PATH, SUPPORTED_SCOPES } from './config.js';

export interface ApiKeyRecord {
  keyId: string;
  /** 原始 key 的 sha256 十六进制，永不存储原始 key */
  keyHash: string;
  /** 拥有者身份（用户 / 集成方标识），兑换出的 JWT 的 sub 即为该值 —— 由此区分不同调用方 */
  owner: string;
  name: string;
  scopes: string[];
  createdAt: number;
  /** 过期时间戳（毫秒）；null 表示永不过期 */
  expiresAt: number | null;
  revoked: boolean;
}

export interface CreateApiKeyInput {
  owner: string;
  name: string;
  scopes?: string[];
  /** 有效期（秒）；<=0 或省略表示永不过期 */
  ttlSeconds?: number | null;
}

export interface CreatedApiKey extends ApiKeyRecord {
  /** 原始 key，仅创建时返回一次，务必立即保存 */
  rawKey: string;
}

let cache: ApiKeyRecord[] | null = null;

function load(): ApiKeyRecord[] {
  if (cache) return cache;
  if (fs.existsSync(AUTH_APIKEYS_PATH)) {
    cache = JSON.parse(fs.readFileSync(AUTH_APIKEYS_PATH, 'utf8')) as ApiKeyRecord[];
  } else {
    cache = [];
    persist();
  }
  return cache;
}

function persist(): void {
  fs.mkdirSync(path.dirname(AUTH_APIKEYS_PATH), { recursive: true });
  fs.writeFileSync(AUTH_APIKEYS_PATH, JSON.stringify(cache ?? [], null, 2), { mode: 0o600 });
}

function hash(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** 生成一个原始 API key（前缀 + 24 字节随机 base64url） */
export function generateRawKey(): string {
  return API_KEY_PREFIX + crypto.randomBytes(24).toString('base64url');
}

/** 创建 API key（写入文件并返回原始 key 一次） */
export function createApiKey(input: CreateApiKeyInput): CreatedApiKey {
  const scopes =
    input.scopes && input.scopes.length
      ? input.scopes.filter((s) => SUPPORTED_SCOPES.includes(s))
      : [...SUPPORTED_SCOPES];
  const raw = generateRawKey();
  const now = Date.now();
  const record: ApiKeyRecord = {
    keyId: crypto.randomUUID(),
    keyHash: hash(raw),
    owner: input.owner,
    name: input.name,
    scopes,
    createdAt: now,
    expiresAt: input.ttlSeconds && input.ttlSeconds > 0 ? now + input.ttlSeconds * 1000 : null,
    revoked: false,
  };
  load().push(record);
  persist();
  return { ...record, rawKey: raw };
}

/** 校验 API key：有效（存在、未吊销、未过期）返回记录，否则返回 null */
export function lookupApiKey(raw: string): ApiKeyRecord | null {
  const target = hash(raw);
  const record = load().find((r) => r.keyHash === target);
  if (!record) return null;
  if (record.revoked) return null;
  if (record.expiresAt && record.expiresAt < Date.now()) return null;
  return record;
}

/** 列出 key（不含 keyHash）；可按 owner 过滤，供管理台展示 */
export function listApiKeys(owner?: string): Omit<ApiKeyRecord, 'keyHash'>[] {
  return load()
    .filter((r) => !owner || r.owner === owner)
    .map(({ keyHash, ...rest }) => rest);
}

/** 吊销 key（按 keyId）；返回是否找到并吊销 */
export function revokeApiKey(keyId: string): boolean {
  const record = load().find((r) => r.keyId === keyId);
  if (!record) return false;
  record.revoked = true;
  persist();
  return true;
}
