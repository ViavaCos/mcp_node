// demo-admin/server.ts
// API key 管理台（方案 B）：提供「创建 / 列出 / 吊销」API key 的 Web 界面。
// 浏览器只与本服务通信；本服务作为代理把管理请求转发到 auth-server 的 /admin/apikeys，
// admin token 留在服务端，既不暴露给浏览器，也避免浏览器跨域（auth-server 的 CORS 不涵盖本管理台来源）。
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.ADMIN_PORT || 4100);
const AUTH_BASE = (process.env.AUTH_SERVER_URL || 'http://localhost:9000').replace(/\/$/, '');
const ADMIN_TOKEN = process.env.AUTH_ADMIN_TOKEN || 'admin-secret';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 代理：把管理请求转发到 auth-server，附带 admin token（服务端持有，不落浏览器）
async function proxy(
  method: string,
  targetPath: string,
  req: express.Request,
  res: express.Response
): Promise<void> {
  const r = await fetch(AUTH_BASE + targetPath, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
  });
  const text = await r.text();
  res.status(r.status);
  res.setHeader('Content-Type', 'application/json');
  res.send(text);
}

// 列出 key（支持 ?owner= 过滤，原样透传 query）
app.get('/api/admin/apikeys', (req, res) => {
  const suffix = req.url.replace('/api/admin/apikeys', '') || '';
  void proxy('GET', `/admin/apikeys${suffix}`, req, res);
});

// 创建 key
app.post('/api/admin/apikeys', (req, res) => {
  void proxy('POST', '/admin/apikeys', req, res);
});

// 吊销 key
app.delete('/api/admin/apikeys/:keyId', (req, res) => {
  void proxy('DELETE', `/admin/apikeys/${req.params.keyId}`, req, res);
});

app.listen(PORT, () => {
  console.log(`[demo-admin] API key 管理台已启动: http://localhost:${PORT}`);
  console.log(`[demo-admin]   转发到 auth-server: ${AUTH_BASE}`);
  if (ADMIN_TOKEN === 'admin-secret') {
    console.warn('[demo-admin] 警告：AUTH_ADMIN_TOKEN 使用默认值 admin-secret，生产请设置强令牌');
  }
});
