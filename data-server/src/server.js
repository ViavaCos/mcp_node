// data-server/src/server.js
import express from 'express';
import { queries } from './data.js';

const app = express();
const PORT = process.env.DATA_SERVER_PORT || 3000;

const ok = (res, data) => res.json({ code: 0, data });
const fail = (res, msg) => res.status(400).json({ code: 1, message: msg });

// 1) 销售额排行榜：按 商品 / 品类 / 地区
// GET /api/sales/ranking?type=product|category|region&period=2024|2025|all&limit=10
app.get('/api/sales/ranking', (req, res) => {
  const { type = 'product', period = 'all', limit = 10 } = req.query;
  if (!['product', 'category', 'region'].includes(type)) return fail(res, 'type 必须是 product/category/region');
  if (!['2024', '2025', 'all'].includes(period)) return fail(res, 'period 必须是 2024/2025/all');
  ok(res, queries.salesRanking({ type, period, limit: Number(limit) || 10 }));
});

// 2) 年度汇总
// GET /api/sales/summary?year=2025
app.get('/api/sales/summary', (req, res) => {
  const { year = '2025' } = req.query;
  if (!['2024', '2025'].includes(String(year))) return fail(res, 'year 必须是 2024/2025');
  ok(res, queries.annualSummary({ year: String(year) }));
});

// 3) 商品查询 / 筛选
// GET /api/products?category=c1&keyword=手机&limit=20
app.get('/api/products', (req, res) => {
  const { category, keyword, limit = 20 } = req.query;
  ok(res, queries.queryProducts({ category, keyword, limit: Number(limit) || 20 }));
});

// 4) 订单分页查询
// GET /api/orders?region=华东&year=2025&category=c1&page=1&pageSize=20
app.get('/api/orders', (req, res) => {
  const { region, year, category, page = 1, pageSize = 20 } = req.query;
  ok(res, queries.queryOrders({ region, year, category, page: Number(page) || 1, pageSize: Number(pageSize) || 20 }));
});

// 5) 活跃用户排行
// GET /api/users/active?year=2025&region=华东&limit=10
app.get('/api/users/active', (req, res) => {
  const { year, region, limit = 10 } = req.query;
  ok(res, queries.activeUsers({ year, region, limit: Number(limit) || 10 }));
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[data-server] 已启动: http://localhost:${PORT}`);
});
