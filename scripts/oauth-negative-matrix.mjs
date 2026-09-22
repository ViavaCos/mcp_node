#!/usr/bin/env node
// scripts/oauth_negative_matrix.mjs
// MCP OAuth 2.1 鉴权边界验证矩阵：正例 + 负数（过期/错 aud/错 iss/alg=none/签名篡改/缺 scope）
//
// 用法（cwd 需在含 jose v6 的项目内，或由脚本自动到相邻子项目解析）：
//   node scripts/oauth-negative-matrix.mjs \
//     --keys auth-server/keys.json \
//     --client-id demo-client --client-secret demo-secret --scope mcp:tools
//
// issuer / resource 默认从服务端的 RFC 9728 受保护资源元数据自动发现，
// 避免「脚本用 127.0.0.1、服务端配 localhost」导致的 audience 不匹配。
//
// 退出码：0 = 全部通过；1 = 存在失败项；2 = 参数/环境错误

import fs from 'node:fs';
import path from 'node:path';

// ---------- 参数解析 ----------
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};

const MCP_URL = arg('mcp-url', 'http://localhost:8089/mcp');
const KEYS_PATH = arg('keys', '');
const CLIENT_ID = arg('client-id', 'demo-client');
const CLIENT_SECRET = arg('client-secret', 'demo-secret');
const SCOPE = arg('scope', 'mcp:tools');
const JOSE_SPEC = arg('jose', 'jose');

if (!KEYS_PATH) {
  console.error('缺少 --keys（授权服务器的 keys.json 路径），无法签发负数令牌。');
  process.exit(2);
}

// ---------- 自动发现 RFC 9728 元数据（无需鉴权），用于推导 issuer / resource ----------
async function discoverPrm(mcpUrl) {
  const u = new URL(mcpUrl);
  const suffix = u.pathname === '/' ? '' : u.pathname;
  const prm = `${u.origin}/.well-known/oauth-protected-resource${suffix}`;
  try {
    const res = await fetch(prm);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const prm = await discoverPrm(MCP_URL);
const discoveredResource = prm?.resource;
const discoveredIssuer = prm?.authorization_servers?.[0];

const RESOURCE = arg('resource', discoveredResource) || MCP_URL;
const ISSUER = arg('issuer', discoveredIssuer) || 'http://localhost:9000';
const TOKEN_ENDPOINT = arg('token-endpoint', `${ISSUER}/token`);

console.log('=== 生效配置 ===');
console.log(`  mcp-url   : ${MCP_URL}`);
console.log(`  issuer    : ${ISSUER}${discoveredIssuer ? '  (由 PRM 发现)' : '  (默认值)'}`);
console.log(`  resource  : ${RESOURCE}${discoveredResource ? '  (由 PRM 发现)' : '  (默认值)'}`);
console.log(`  client    : ${CLIENT_ID}  scope=${SCOPE}`);
if (!prm) {
  console.log('  ⚠ 未能获取 PRM 元数据，issuer/resource 回退到默认值 —— 若服务端配置不同会导致 aud 不匹配');
}

const reqBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

/** 发一次 JSON-RPC 调用，返回 {status, error, wwwAuthenticate} */
async function callMcp(token) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(MCP_URL, { method: 'POST', headers, body: reqBody });
  const text = await res.text();
  let error = '';
  try {
    error = JSON.parse(text).error ?? '';
  } catch {
    error = res.ok ? '(mcp-ok)' : '(non-json)';
  }
  return { status: res.status, error, wwwAuthenticate: res.headers.get('www-authenticate') || '' };
}

const results = [];
function record(name, got, want, extra = '') {
  const ok = got.status === want.status && (want.error === undefined || got.error === want.error);
  results.push({ name, ok, got, want, extra });
  const tag = ok ? 'PASS' : 'FAIL';
  const gotDesc = `${got.status}${got.error ? ' ' + got.error : ''}`;
  const wantDesc = `${want.status}${want.error ? ' ' + want.error : ''}`;
  console.log(`${tag}  ${name.padEnd(24)} 实际=${gotDesc.padEnd(28)} 期望=${wantDesc}`);
  if (!ok && extra) console.log(`      ↳ ${extra}`);
  return ok;
}

// ---------- 1) 无令牌：应 401 且带 WWW-Authenticate 挑战 ----------
console.log('\n=== 1. 未认证请求 ===');
const anon = await callMcp(null);
{
  const ok = anon.status === 401 && /resource_metadata=/.test(anon.wwwAuthenticate);
  results.push({ name: '无令牌→401+挑战', ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  无令牌 → ${anon.status}`);
  if (!ok) {
    console.log(`      ↳ 期望 401 且 WWW-Authenticate 含 resource_metadata，实际: ${anon.status} | ${anon.wwwAuthenticate || '(无头)'}`);
  } else {
    console.log(`      WWW-Authenticate: ${anon.wwwAuthenticate}`);
  }
  if (!anon.wwwAuthenticate.includes('scope=')) {
    console.log('      ⚠ 挑战头未声明 scope=，客户端可能无法获知所需权限');
  }
}

// ---------- 2) client_credentials 取令牌 ----------
console.log('\n=== 2. client_credentials 取令牌 ===');
let token = '';
try {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: SCOPE,
      resource: RESOURCE,
    }),
  });
  const j = await res.json();
  token = j.access_token || '';
  const ok = res.status === 200 && !!token;
  results.push({ name: '取令牌', ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  POST /token → ${res.status} ${ok ? `(len=${token.length}, scope=${j.scope})` : JSON.stringify(j)}`);
} catch (e) {
  console.log('FAIL  取令牌 →', e.message);
  results.push({ name: '取令牌', ok: false });
}

// 校验令牌声明
if (token) {
  const [, payloadB64] = token.split('.');
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  const checks = [
    ['iss', payload.iss === ISSUER],
    ['aud(RFC 8707)', payload.aud === RESOURCE],
    ['exp', typeof payload.exp === 'number' && payload.exp * 1000 > Date.now()],
  ];
  for (const [k, v] of checks) console.log(`${v ? 'PASS' : 'FAIL'}  令牌声明 ${k}${v ? '' : ` → 实际 ${JSON.stringify(payload[k === 'aud(RFC 8707)' ? 'aud' : k])}`}`);
  results.push({ name: '令牌声明', ok: checks.every((c) => c[1]) });
}

// ---------- 3) 合法令牌：应 200 ----------
console.log('\n=== 3. 合法令牌调用 ===');
if (token) record('合法令牌→200', await callMcp(token), { status: 200 });

// ---------- 4) 负数令牌（用 AS 私钥签发） ----------
console.log('\n=== 4. 负数令牌矩阵 ===');
let SignJWT, importJWK;
// jose 的解析必须基于 **cwd**（ESM 默认按脚本自身位置解析，会找不到调用方项目的依赖）。
// 依次尝试：显式路径 → 当前目录 → 脚本所在目录的相邻子项目（适配 <repo>/scripts/ 布局）。
async function loadJose(spec) {
  const { createRequire } = await import('node:module');
  const { pathToFileURL, fileURLToPath } = await import('node:url');
  if (spec.startsWith('.') || spec.startsWith('/')) {
    return import(pathToFileURL(path.resolve(spec)).href);
  }
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), 'noop.cjs'),
    ...['mcp-server', 'auth-server', 'data-server'].map((p) =>
      path.join(scriptDir, '..', p, 'noop.cjs')
    ),
  ];
  let lastErr;
  for (const c of candidates) {
    try {
      const require = createRequire(c);
      return await import(pathToFileURL(require.resolve(spec)).href);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
try {
  ({ SignJWT, importJWK } = await loadJose(JOSE_SPEC));
} catch (e) {
  console.error(`无法加载 jose（尝试 "${JOSE_SPEC}"，cwd=${process.cwd()}）：${e.message}`);
  console.error('请在含 jose v6 的项目目录下运行，或用 --jose <绝对路径> 指定其入口文件。');
  process.exit(2);
}

const keys = JSON.parse(fs.readFileSync(path.resolve(KEYS_PATH), 'utf8'));
const signKey = await importJWK(keys.privateKey, 'RS256');
const now = Math.floor(Date.now() / 1000);

/** 签发一枚测试令牌；claims 可覆盖默认声明 */
const mint = (claims = {}, { ttl = 300, header } = {}) =>
  new SignJWT({ client_id: CLIENT_ID, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: keys.kid, typ: 'JWT', ...(header || {}) })
    .setIssuer(claims.iss ?? ISSUER)
    .setSubject('probe')
    .setAudience(claims.aud ?? RESOURCE)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + ttl)
    .sign(signKey);

// 过期令牌（iat/exp 均在过去）
const expired = await new SignJWT({ scope: SCOPE })
  .setProtectedHeader({ alg: 'RS256', kid: keys.kid, typ: 'JWT' })
  .setIssuer(ISSUER)
  .setAudience(RESOURCE)
  .setIssuedAt(now - 600)
  .setExpirationTime(now - 300)
  .sign(signKey);

const wrongAud = await mint({ scope: SCOPE, aud: 'http://other-resource.invalid/mcp' });
const wrongIss = await mint({ scope: SCOPE, iss: 'http://other-issuer.invalid' });

// alg=none 降级攻击：无签名
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const algNone = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
  iss: ISSUER,
  sub: 'attacker',
  aud: RESOURCE,
  scope: SCOPE,
  exp: now + 300,
})}.`;

// 签名篡改：改**中段**字符（末位含填充位，改了可能解出同一字节 → 假阳性）
const signed = await mint({ scope: `${SCOPE} extra:unused` });
const parts = signed.split('.');
const mid = Math.floor(parts[2].length / 2);
const midChar = parts[2][mid] === 'A' ? 'B' : 'A';
parts[2] = parts[2].slice(0, mid) + midChar + parts[2].slice(mid + 1);
const tampered = parts.join('.');

const missingScope = await mint({ scope: 'scope:not-required' });
const noScope = await mint({});
const compositeScope = await mint({ scope: `${SCOPE} extra:read` });

record('过期令牌', await callMcp(expired), { status: 401, error: 'invalid_token' });
record('错误 audience', await callMcp(wrongAud), { status: 401, error: 'invalid_token' });
record('错误 issuer', await callMcp(wrongIss), { status: 401, error: 'invalid_token' });
record('alg=none 降级', await callMcp(algNone), { status: 401, error: 'invalid_token' });
record('签名篡改', await callMcp(tampered), { status: 401, error: 'invalid_token' });
record('缺必需 scope', await callMcp(missingScope), { status: 403, error: 'insufficient_scope' });
record('无 scope 声明', await callMcp(noScope), { status: 403, error: 'insufficient_scope' });
record('复合 scope 含必需项', await callMcp(compositeScope), { status: 200 });

// ---------- 汇总 ----------
const failed = results.filter((r) => !r.ok);
console.log(`\n=== 汇总：${results.length - failed.length}/${results.length} 通过 ===`);
if (failed.length) {
  console.log('失败项：' + failed.map((f) => f.name).join('、'));
  process.exit(1);
}
console.log('全部通过。');
