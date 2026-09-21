// data-server/src/server.ts
import express, { type Request, type Response } from 'express';
import { queries } from './data.js';
import { bootstrapDb, SEED_COUNTS } from './db.js';
import type { RankType, Period } from './types.js';

const app = express();
const PORT = Number(process.env.DATA_SERVER_PORT || 3000);

const ok = (res: Response, data: unknown): void => {
  res.json({ code: 0, data });
};
const fail = (res: Response, msg: string): void => {
  res.status(400).json({ code: 1, message: msg });
};

// 1) 销售额排行榜：按 商品 / 品类 / 地区
// GET /api/sales/ranking?type=product|category|region&period=<年份|all>&limit=10
app.get('/api/sales/ranking', (req: Request, res: Response) => {
  const type = String(req.query.type || 'product') as RankType;
  const period = String(req.query.period || 'all');
  const limit = Number(req.query.limit || 10);
  if (!['product', 'category', 'region'].includes(type)) return fail(res, 'type 必须是 product/category/region');
  if (period !== 'all' && !/^\d{4}$/.test(period)) return fail(res, 'period 必须是 4 位年份(如 2024) 或 all');
  ok(res, queries.salesRanking({ type, period: period as Period, limit: Number.isFinite(limit) ? limit : 10 }));
});

// 2) 年度汇总
// GET /api/sales/summary?year=<年份>
app.get('/api/sales/summary', (req: Request, res: Response) => {
  const year = String(req.query.year || '2025');
  if (!/^\d{4}$/.test(year)) return fail(res, 'year 必须是 4 位年份(如 2024)');
  ok(res, queries.annualSummary({ year }));
});

// 3) 商品查询 / 筛选
// GET /api/products?category=c1&keyword=手机&limit=20
app.get('/api/products', (req: Request, res: Response) => {
  const category = req.query.category ? String(req.query.category) : undefined;
  const keyword = req.query.keyword ? String(req.query.keyword) : undefined;
  const limit = Number(req.query.limit || 20);
  ok(res, queries.queryProducts({ category, keyword, limit: Number.isFinite(limit) ? limit : 20 }));
});

// 4) 订单分页查询
// GET /api/orders?region=华东&year=2025&category=c1&page=1&pageSize=20
app.get('/api/orders', (req: Request, res: Response) => {
  const region = req.query.region ? String(req.query.region) : undefined;
  const year = req.query.year ? String(req.query.year) : undefined;
  const category = req.query.category ? String(req.query.category) : undefined;
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  ok(
    res,
    queries.queryOrders({
      region,
      year,
      category,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 20,
    })
  );
});

// 5) 活跃用户排行
// GET /api/users/active?year=2025&region=华东&limit=10
app.get('/api/users/active', (req: Request, res: Response) => {
  const year = req.query.year ? String(req.query.year) : undefined;
  const region = req.query.region ? String(req.query.region) : undefined;
  const limit = Number(req.query.limit || 10);
  ok(res, queries.activeUsers({ year, region, limit: Number.isFinite(limit) ? limit : 10 }));
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// 启动前确保 SQLite 表结构就绪、必要时写入种子数据
bootstrapDb();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[data-server] 已启动: http://0.0.0.0:${PORT}`);
});
