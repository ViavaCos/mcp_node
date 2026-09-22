// auth-server/src/keys.ts
// RS256 密钥对：首次启动生成并持久化到 keys.json（勿提交版本库）
import fs from 'node:fs';
import path from 'node:path';
import { exportJWK, generateKeyPair, importJWK, type JWK } from 'jose';
import { KEYS_PATH } from './config.js';

export interface StoredKeys {
  kid: string;
  publicKey: JWK;
  privateKey: JWK;
}

let cached: StoredKeys | null = null;

async function loadOrCreate(): Promise<StoredKeys> {
  if (fs.existsSync(KEYS_PATH)) {
    return JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8')) as StoredKeys;
  }
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const kid = 'auth-key-1';
  const pub = await exportJWK(publicKey);
  const priv = await exportJWK(privateKey);
  Object.assign(pub, { kid, use: 'sig', alg: 'RS256' });
  Object.assign(priv, { kid, use: 'sig', alg: 'RS256' });
  const stored: StoredKeys = { kid, publicKey: pub, privateKey: priv };
  fs.mkdirSync(path.dirname(KEYS_PATH), { recursive: true });
  fs.writeFileSync(KEYS_PATH, JSON.stringify(stored, null, 2), { mode: 0o600 });
  console.warn(`[auth-server] 已生成 RS256 密钥对并写入 ${KEYS_PATH}（请勿提交版本库）`);
  return stored;
}

export async function getKeys(): Promise<StoredKeys> {
  if (!cached) cached = await loadOrCreate();
  return cached;
}

/** 签名私钥（CryptoKey） */
export async function getSigningKey(): Promise<CryptoKey> {
  const k = await getKeys();
  return (await importJWK(k.privateKey, 'RS256')) as CryptoKey;
}

/** JWKS（公钥集），供资源服务器验签 */
export async function getJwks(): Promise<{ keys: JWK[] }> {
  const k = await getKeys();
  return { keys: [k.publicKey] };
}
