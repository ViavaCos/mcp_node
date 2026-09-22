// mcp-server/src/index.ts
// 电商销售 MCP 服务：支持 stdio 与 Streamable HTTP 双传输（路线 A）
//   - TRANSPORT=stdio（本地调试）：标准输入输出，供本地 MCP 客户端 spawn
//     按规范要求，stdio 传输不走 OAuth，凭据由本地环境提供
//   - TRANSPORT=http（默认，路线 A）：Streamable HTTP，暴露 http://<host>:<PORT>/mcp
//     本服务扮演 OAuth 2.1 资源服务器：公布 RFC 9728 元数据、挑战并校验 Bearer 令牌
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools } from './tools.js';
import {
  AUTH_ISSUER,
  AUTH_MODE,
  AUTH_REQUIRED_SCOPES,
  RESOURCE_URL,
  protectedResourceMetadataUrl,
} from './auth/config.js';
import { protectedResourceMetadata } from './auth/metadata.js';
import { initJwks, resolveJwksUrl, verifyAccessToken } from './auth/verify.js';

const TRANSPORT = (process.env.TRANSPORT || 'http').toLowerCase();
const PORT = Number(process.env.PORT || 8089);

/** 为每个请求/连接创建全新的 McpServer 实例并注册 5 个工具 */
function createServer(): McpServer {
  const server = new McpServer({ name: 'ecommerce-mcp', version: '1.0.0' });
  registerTools(server);
  return server;
}

async function startStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio 模式下 stdout 已被协议占用，调试信息只能走 stderr
  console.error('[mcp-server] ecommerce-mcp 已通过 stdio 启动，等待客户端连接');
}

/** 挂载 OAuth 2.1 鉴权链：PRM 元数据 + 401 挑战 + JWKS 验签 + scope 断言 */
async function mountAuth(app: express.Express): Promise<void> {
  const prmUrl = protectedResourceMetadataUrl();
  const scope = AUTH_REQUIRED_SCOPES.join(' ');

  if (AUTH_MODE === 'none') {
    console.warn(
      '[mcp-server] 警告：AUTH_MODE=none 已关闭 /mcp 鉴权，仅限本地调试，切勿用于对外部署。'
    );
    return;
  }

  const jwksUrl = await resolveJwksUrl();
  initJwks(jwksUrl);

  // RFC 9728 受保护资源元数据（路径感知形式 + 根路径回退）
  app.get(
    ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'],
    (_req: Request, res: Response) => {
      res.json(protectedResourceMetadata());
    }
  );

  // 401/403 挑战头：告知客户端去哪里发现授权服务器、需要哪些 scope
  const challenge = (res: Response, extra = ''): void => {
    res.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${prmUrl}"${extra ? `, ${extra}` : ''}, scope="${scope}"`
    );
  };

  app.use('/mcp', async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      challenge(res);
      res.status(401).json({ error: 'invalid_token', error_description: '缺少 Bearer 访问令牌' });
      return;
    }

    const result = await verifyAccessToken(header.slice(7).trim());
    if (!result.ok) {
      challenge(res, `error="${result.error}"`);
      res.status(result.status).json({ error: result.error, error_description: result.description });
      return;
    }
    // 校验通过：把令牌身份（sub / 调用方）挂到请求上，供后续按用户授权 / 审计使用（非破坏性）。
    (req as typeof req & { authSubject?: string }).authSubject = result.subject;
    next();
  });

  console.log(
    `[mcp-server] OAuth 2.1 资源服务器已启用：issuer=${AUTH_ISSUER} resource=${RESOURCE_URL}`
  );
  console.log(`[mcp-server]   JWKS=${jwksUrl}；必需 scope=${scope}；PRM=${prmUrl}`);
}

async function startHttp(): Promise<void> {
  const app = express();
  app.use(express.json());

  await mountAuth(app);

  // 无状态（stateless）Streamable HTTP：每个 POST 请求使用独立的 server + transport 实例
  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      const err = e as Error;
      if (!res.headersSent) res.status(500).json({ error: err.message });
      else console.error('[mcp-server] 处理 /mcp 请求出错:', err.message);
    }
  });

  // 无状态模式下不支持 GET（建立 SSE 流）/ DELETE（关闭 session）
  app.get('/mcp', (_req: Request, res: Response) => {
    res.status(405).json({ error: 'Method not allowed. Use POST for stateless Streamable HTTP.' });
  });
  app.delete('/mcp', (_req: Request, res: Response) => {
    res.status(405).json({ error: 'Method not allowed.' });
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      transport: 'http',
      authMode: AUTH_MODE,
      issuer: AUTH_MODE === 'jwt' ? AUTH_ISSUER : undefined,
      resource: AUTH_MODE === 'jwt' ? RESOURCE_URL : undefined,
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[mcp-server] ecommerce-mcp 已通过 Streamable HTTP 启动: http://0.0.0.0:${PORT}/mcp`);
  });
}

if (TRANSPORT === 'stdio') {
  await startStdio();
} else {
  await startHttp();
}
