// mcp-server/src/index.js
// 基于 @modelcontextprotocol/sdk 的 MCP 服务（stdio）
// 5 个工具分别接入数据服务的 5 个 REST 接口
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = process.env.DATA_SERVER_URL || 'http://localhost:3000';

/** 调用数据服务接口并返回解析后的 JSON */
async function callApi(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`数据服务返回 ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || '数据服务业务错误');
  return json.data;
}

const server = new McpServer({ name: 'ecommerce-mcp', version: '1.0.0' });

// 工具 1：销售额排行榜
server.tool(
  'get_sales_ranking',
  '获取销售额排行榜，可按 商品(product)/品类(category)/地区(region) 维度，按 年份或全周期 统计。',
  {
    type: z.enum(['product', 'category', 'region']).describe('排行维度：product 商品 / category 品类 / region 地区'),
    period: z.enum(['2024', '2025', 'all']).default('all').describe('统计周期：2024 / 2025 / all 全部'),
    limit: z.number().int().min(1).max(50).default(10).describe('返回条数（1-50）'),
  },
  async ({ type, period, limit }) => {
    const data = await callApi('/api/sales/ranking', { type, period, limit });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// 工具 2：年度汇总
server.tool(
  'get_annual_summary',
  '获取某一年度的销售汇总：总销售额、订单数、客单价、按月趋势、品类占比、TOP 地区/商品、同比。',
  {
    year: z.enum(['2024', '2025']).default('2025').describe('统计年份：2024 / 2025'),
  },
  async ({ year }) => {
    const data = await callApi('/api/sales/summary', { year });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// 工具 3：商品查询
server.tool(
  'query_products',
  '按品类或关键字筛选商品列表（支持限量返回）。',
  {
    category: z.string().optional().describe('品类 ID，如 c1 手机数码；留空表示全部'),
    keyword: z.string().optional().describe('商品名关键字，如 “手机”'),
    limit: z.number().int().min(1).max(100).default(20).describe('返回条数（1-100）'),
  },
  async ({ category, keyword, limit }) => {
    const data = await callApi('/api/products', { category, keyword, limit });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// 工具 4：订单分页查询
server.tool(
  'query_orders',
  '分页查询订单，可按 地区/年份/品类 过滤，返回订单明细列表与分页信息。',
  {
    region: z.string().optional().describe('地区，如 华东'),
    year: z.enum(['2024', '2025']).optional().describe('年份：2024 / 2025'),
    category: z.string().optional().describe('品类 ID，如 c1'),
    page: z.number().int().min(1).default(1).describe('页码，从 1 开始'),
    pageSize: z.number().int().min(1).max(100).default(20).describe('每页条数'),
  },
  async ({ region, year, category, page, pageSize }) => {
    const data = await callApi('/api/orders', { region, year, category, page, pageSize });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// 工具 5：活跃用户排行
server.tool(
  'get_active_users',
  '获取活跃用户排行，按 消费金额 排序，可按 年份/地区 过滤。',
  {
    year: z.enum(['2024', '2025']).optional().describe('年份：2024 / 2025；留空表示全部'),
    region: z.string().optional().describe('地区，如 华南'),
    limit: z.number().int().min(1).max(50).default(10).describe('返回条数（1-50）'),
  },
  async ({ year, region, limit }) => {
    const data = await callApi('/api/users/active', { year, region, limit });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
// 注：stdio 模式下不要向 stdout 打印日志，否则会污染协议；调试信息请走 stderr
console.error('[mcp-server] ecommerce-mcp 已通过 stdio 启动，等待客户端连接');
