// demo-dashboard/server.js
// 后端：作为 MCP 客户端接入 MCP 服务（stdio），把工具调用包装成本地 HTTP 接口，并托管静态看板
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mcpServerPath = path.join(__dirname, '../mcp-server/src/index.js');
const PORT = process.env.DASHBOARD_PORT || 4000;
const DATA_URL = process.env.DATA_SERVER_URL || 'http://localhost:3000';

const transport = new StdioClientTransport({
  command: process.env.NODE || 'node',
  args: [mcpServerPath],
  env: { ...process.env, DATA_SERVER_URL: DATA_URL },
});
const mcpClient = new Client({ name: 'dashboard-client', version: '1.0.0' });
await mcpClient.connect(transport);

/** 调用 MCP 工具并解析其文本结果（JSON） */
async function callTool(name, args) {
  const res = await mcpClient.callTool({ name, arguments: args });
  const text = (res.content || []).map((c) => c.text || '').join('\n');
  return JSON.parse(text);
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// 看板聚合数据：一次性编排多个 MCP 工具，得到完整看板所需数据
app.get('/api/dashboard', async (_req, res) => {
  try {
    const [productRank, catRank, regionRank, summary, users] = await Promise.all([
      callTool('get_sales_ranking', { type: 'product', period: 'all', limit: 10 }),
      callTool('get_sales_ranking', { type: 'category', period: 'all', limit: 8 }),
      callTool('get_sales_ranking', { type: 'region', period: 'all', limit: 5 }),
      callTool('get_annual_summary', { year: '2025' }),
      callTool('get_active_users', { year: '2025', limit: 10 }),
    ]);
    res.json({ productRank, catRank, regionRank, summary, users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 工具试玩面板：前端任意调用 5 个 MCP 工具之一，参数走 query string
app.get('/api/tool/:name', async (req, res) => {
  try {
    const args = {};
    for (const [k, v] of Object.entries(req.query)) {
      const n = Number(v);
      args[k] = v !== '' && !Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(v) ? n : v;
    }
    const data = await callTool(req.params.name, args);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`[demo-dashboard] 看板已启动: http://localhost:${PORT}`);
});
