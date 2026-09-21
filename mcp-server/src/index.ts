// mcp-server/src/index.ts
// 电商销售 MCP 服务：支持 stdio 与 Streamable HTTP 双传输（路线 A）
//   - TRANSPORT=stdio（默认之外的本地调试）：标准输入输出，供本地 MCP 客户端 spawn
//   - TRANSPORT=http（默认，路线 A）：Streamable HTTP，暴露 http://<host>:<PORT>/mcp，可远程接入
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools } from './tools.js';

const TRANSPORT = (process.env.TRANSPORT || 'http').toLowerCase();
const PORT = Number(process.env.PORT || 8089);
const MCP_TOKEN = process.env.MCP_TOKEN; // 可选 Bearer 鉴权；不设置则不做鉴权（便于本地 demo）

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

async function startHttp(): Promise<void> {
  const app = express();
  app.use(express.json());

  // 可选 Bearer 鉴权：设置 MCP_TOKEN 后，所有 /mcp 请求必须带 Authorization: Bearer <token>
  if (MCP_TOKEN) {
    app.use('/mcp', (req: Request, res: Response, next: NextFunction) => {
      const auth = req.headers['authorization'];
      if (auth === `Bearer ${MCP_TOKEN}`) return next();
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({ error: 'Unauthorized' });
    });
  }

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
    res.json({ ok: true, transport: 'http' });
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
