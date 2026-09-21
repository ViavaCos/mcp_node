// demo-agent/src/index.ts
// MCP 客户端 + OpenAI 兼容接口 的 Agent 演示
// 配置了 LLM_API_KEY 时：走真实工具调用循环；未配置时：跑脚本化演示，编排 5 个工具回答预设分析问题
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_HTTP_URL = process.env.MCP_HTTP_URL || 'http://localhost:8089/mcp';

const transport = new StreamableHTTPClientTransport(new URL(MCP_HTTP_URL));
const client = new Client({ name: 'agent-client', version: '1.0.0' });
await client.connect(transport);

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await client.callTool({ name, arguments: args });
  const content = (res.content ?? []) as Array<{ text?: string }>;
  const text = content.map((c) => c.text ?? '').join('\n');
  return JSON.parse(text);
}

// ---------- 真实 LLM Agent ----------
const LLM_BASE = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
const LLM_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

async function runAgent(question: string): Promise<void> {
  const toolsResult = await client.listTools();
  const tools = toolsResult.tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  const messages: any[] = [{ role: 'user', content: question }];
  for (let i = 0; i < 6; i++) {
    const resp = await fetch(`${LLM_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_KEY}` },
      body: JSON.stringify({ model: LLM_MODEL, messages, tools, tool_choice: 'auto' }),
    });
    const json: any = await resp.json();
    const msg = json.choices?.[0]?.message;
    if (!msg) {
      console.log('[LLM 返回异常]', JSON.stringify(json, null, 2));
      break;
    }
    messages.push(msg);
    if (msg.tool_calls && msg.tool_calls.length) {
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments || '{}');
        console.log(`→ 调用工具 ${tc.function.name} 参数=${JSON.stringify(args)}`);
        const result = await callTool(tc.function.name, args);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
    } else {
      console.log('\n[回答]\n' + msg.content);
      return;
    }
  }
}

// ---------- 脚本化降级演示（无需 LLM 密钥）----------
function bar(items: any[], labelKey: string, valueKey: string, unit = ''): string {
  const max = Math.max(...items.map((x) => Number(x[valueKey]) || 0), 1);
  return items
    .map((x) => {
      const len = Math.round((Number(x[valueKey]) / max) * 28);
      return `  ${String(x[labelKey]).padEnd(10)} ${'█'.repeat(len)} ${unit}${Number(x[valueKey]).toLocaleString('zh-CN')}`;
    })
    .join('\n');
}

async function runDemo(): Promise<void> {
  console.log('=== 演示模式（未配置 LLM_API_KEY，使用脚本化工具编排）===\n');

  console.log('【问题 1】2025 年哪些品类最畅销？(get_sales_ranking)');
  const cat = (await callTool('get_sales_ranking', { type: 'category', period: '2025', limit: 8 })) as any;
  console.log(bar(cat.items, 'name', 'totalAmount', '¥'));

  console.log('\n【问题 2】2025 年度整体表现如何？(get_annual_summary)');
  const sum = (await callTool('get_annual_summary', { year: '2025' })) as any;
  console.log(`  总销售额 ¥${sum.totalAmount.toLocaleString('zh-CN')}  订单 ${sum.totalOrders} 笔  客单价 ¥${sum.avgOrderValue}`);
  console.log(`  TOP 地区 ${sum.topRegion?.region}  同比 ${sum.yoy ? sum.yoy.growth + '%' : 'N/A'}`);
  console.log('  月度趋势：' + sum.monthlyTrend.map((m: any) => m.month + '月' + Math.round(m.amount / 1000) + 'k').join(' '));

  console.log('\n【问题 3】想上架“手机”类新品，现有商品有哪些？(query_products)');
  const prod = (await callTool('query_products', { category: 'c1', keyword: '手机', limit: 5 })) as any;
  console.log(`  命中 ${prod.total} 个，样例：`);
  prod.items.slice(0, 5).forEach((p: any) => console.log(`   - ${p.name}  ¥${p.price}  (${p.brand})`));

  console.log('\n【问题 4】华南地区 2025 的头部客户是谁？(get_active_users)');
  const users = (await callTool('get_active_users', { year: '2025', region: '华南', limit: 5 })) as any;
  console.log(bar(users.items, 'name', 'totalAmount', '¥'));

  console.log('\n【问题 5】2024 vs 2025，华东地区订单量变化？(query_orders 两次取 total)');
  const o24 = (await callTool('query_orders', { region: '华东', year: '2024', pageSize: 1 })) as any;
  const o25 = (await callTool('query_orders', { region: '华东', year: '2025', pageSize: 1 })) as any;
  console.log(`  华东 2024 完成订单 ${o24.total} 笔，2025 ${o25.total} 笔，增幅 ${(((o25.total - o24.total) / o24.total) * 100).toFixed(1)}%`);

  console.log('\n✅ 演示结束。以上均由 5 个 MCP 工具组合得出，可替换为任意自然语言问题（配置 LLM_API_KEY 后自动走 Agent）。');
}

const question = process.argv.slice(2).join(' ');
if (LLM_KEY) {
  if (!question) {
    console.log('用法: npm start -- "你的问题，例如：2025 年哪个品类最畅销，和 2024 比如何？"');
    process.exit(0);
  }
  await runAgent(question);
} else {
  await runDemo();
}
