// data-server/src/data.ts
// 5 个聚合查询函数（基于 SQLite，经 db.ts 接入）
// 返回结构与内存版本完全一致，仅数据源由 SQLite 提供
import { db } from './db.js';
import type {
  RankType,
  Period,
  RankingResult,
  RankItem,
  AnnualSummary,
  MonthlyPoint,
  CategoryBreakdownItem,
  RegionAmount,
  ProductAmount,
  Yoy,
  Product,
  ProductQueryResult,
  OrderListItem,
  OrderQueryResult,
  ActiveUserItem,
  ActiveUserResult,
  SalesRankingParams,
  AnnualSummaryParams,
  QueryProductsParams,
  QueryOrdersParams,
  ActiveUsersParams,
} from './types.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---- 1) 销售额排行榜：按 商品 / 品类 / 地区 ----
function salesRanking({ type = 'product', period = 'all', limit = 10 }: SalesRankingParams = {}): RankingResult {
  const dim =
    type === 'product'
      ? { key: 'product_id', name: 'product_name' }
      : type === 'category'
        ? { key: 'category_id', name: 'category_name' }
        : { key: 'region', name: 'region' };

  const params: unknown[] = [];
  let where = "status = 'completed'";
  if (period !== 'all') {
    where += ' AND year = ?';
    params.push(Number(period));
  }
  const sql = `SELECT ${dim.key} AS key, ${dim.name} AS name, SUM(amount) AS totalAmount, SUM(quantity) AS totalQuantity
    FROM orders WHERE ${where} GROUP BY key, name ORDER BY totalAmount DESC LIMIT ?`;
  params.push(Math.max(1, Math.min(50, limit)));

  const rows = db
    .prepare(sql)
    .all(...params) as Array<{ key: string; name: string; totalAmount: number | null; totalQuantity: number | null }>;
  const items: RankItem[] = rows.map((r) => ({
    key: r.key,
    name: r.name,
    totalAmount: round2(r.totalAmount || 0),
    totalQuantity: r.totalQuantity || 0,
  }));
  return { type: type as RankType, period: period as Period, metric: 'amount', items };
}

// ---- 2) 年度汇总 ----
function annualSummary({ year = '2025' }: AnnualSummaryParams = {}): AnnualSummary {
  const y = String(year);
  const yNum = Number(y);
  const cond = "status = 'completed' AND year = ?";

  const totals = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS totalAmount, COUNT(*) AS totalOrders, COALESCE(SUM(quantity), 0) AS totalQuantity
      FROM orders WHERE ${cond}`)
    .get(yNum) as { totalAmount: number; totalOrders: number; totalQuantity: number };
  const totalAmount = round2(totals.totalAmount);
  const totalOrders = totals.totalOrders;
  const totalQuantity = totals.totalQuantity;
  const avgOrderValue = totalOrders ? round2(totalAmount / totalOrders) : 0;

  const monthlyRows = db
    .prepare(`SELECT month, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS orders FROM orders WHERE ${cond} GROUP BY month`)
    .all(yNum) as Array<{ month: number; amount: number; orders: number }>;
  const mMap = new Map(monthlyRows.map((r) => [r.month, { amount: round2(r.amount), orders: r.orders }]));
  const monthlyTrend: MonthlyPoint[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    amount: mMap.get(i + 1)?.amount || 0,
    orders: mMap.get(i + 1)?.orders || 0,
  }));

  const catRows = db
    .prepare(`SELECT category_id AS categoryId, category_name AS name, COALESCE(SUM(amount), 0) AS amount, COALESCE(SUM(quantity), 0) AS quantity
      FROM orders WHERE ${cond} GROUP BY category_id, category_name ORDER BY amount DESC`)
    .all(yNum) as Array<{ categoryId: string; name: string; amount: number; quantity: number }>;
  const categoryBreakdown: CategoryBreakdownItem[] = catRows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name,
    amount: round2(r.amount),
    quantity: r.quantity,
  }));

  const topRegionRow = db
    .prepare(`SELECT region, COALESCE(SUM(amount), 0) AS amount FROM orders WHERE ${cond} GROUP BY region ORDER BY amount DESC LIMIT 1`)
    .get(yNum) as { region: string; amount: number } | undefined;
  const topProductRow = db
    .prepare(`SELECT product_id AS productId, product_name AS name, COALESCE(SUM(amount), 0) AS amount FROM orders WHERE ${cond} GROUP BY product_id, product_name ORDER BY amount DESC LIMIT 1`)
    .get(yNum) as { productId: string; name: string; amount: number } | undefined;
  const topRegion: RegionAmount | null = topRegionRow
    ? { region: topRegionRow.region, amount: round2(topRegionRow.amount) }
    : null;
  const topProduct: ProductAmount | null = topProductRow
    ? { productId: topProductRow.productId, name: topProductRow.name, amount: round2(topProductRow.amount) }
    : null;

  // 同比
  const prevYear = String(yNum - 1);
  const prevTotals = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS totalAmount FROM orders WHERE status = 'completed' AND year = ?`)
    .get(Number(prevYear)) as { totalAmount: number };
  const prevAmount = round2(prevTotals.totalAmount);
  // 本年无数据（totalAmount === 0）时不计算同比，避免出现误导性的 -100%
  const yoy: Yoy | null =
    totalAmount > 0 && prevAmount > 0
      ? { prevYear, prevAmount, growth: round2(((totalAmount - prevAmount) / prevAmount) * 100) }
      : null;

  return {
    year: y,
    totalAmount,
    totalOrders,
    totalQuantity,
    avgOrderValue,
    monthlyTrend,
    categoryBreakdown,
    topRegion,
    topProduct,
    yoy,
  };
}

// ---- 3) 商品查询 / 筛选 ----
function queryProducts({ category, keyword, limit = 20 }: QueryProductsParams = {}): ProductQueryResult {
  const where: string[] = [];
  const params: unknown[] = [];
  if (category) {
    where.push('category_id = ?');
    params.push(category);
  }
  if (keyword) {
    where.push('name LIKE ?');
    params.push(`%${keyword}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM products ${whereSql}`).get(...params) as { c: number }).c;
  params.push(Math.max(1, Math.min(100, limit)));
  const items = db
    .prepare(`SELECT id, name, category_id AS categoryId, category_name AS categoryName, brand, price FROM products ${whereSql} LIMIT ?`)
    .all(...params) as Product[];
  return { total, items };
}

// ---- 4) 订单分页查询 ----
function queryOrders({ region, year, category, page = 1, pageSize = 20 }: QueryOrdersParams = {}): OrderQueryResult {
  const where: string[] = ["status = 'completed'"];
  const params: unknown[] = [];
  if (region) {
    where.push('region = ?');
    params.push(region);
  }
  if (year) {
    where.push('year = ?');
    params.push(Number(year));
  }
  if (category) {
    where.push('category_id = ?');
    params.push(category);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM orders ${whereSql}`).get(...params) as { c: number }).c;
  const p = Math.max(1, page);
  const ps = Math.max(1, Math.min(100, pageSize));
  const items = db
    .prepare(`SELECT id, date, product_name AS productName, category_name AS categoryName, region, quantity, amount
      FROM orders ${whereSql} ORDER BY date DESC LIMIT ? OFFSET ?`)
    .all(...params, ps, (p - 1) * ps) as OrderListItem[];
  return { total, page: p, pageSize: ps, totalPages: Math.ceil(total / ps), items };
}

// ---- 5) 活跃用户排行 ----
function activeUsers({ year, region, limit = 10 }: ActiveUsersParams = {}): ActiveUserResult {
  const where: string[] = ["status = 'completed'"];
  const params: unknown[] = [];
  if (year) {
    where.push('year = ?');
    params.push(Number(year));
  }
  if (region) {
    where.push('region = ?');
    params.push(region);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  params.push(Math.max(1, Math.min(50, limit)));
  const rows = db
    .prepare(`SELECT user_id AS userId, user_name AS name, region, COUNT(*) AS orderCount, COALESCE(SUM(amount), 0) AS totalAmount
      FROM orders ${whereSql} GROUP BY user_id, name, region ORDER BY totalAmount DESC LIMIT ?`)
    .all(...params) as Array<{ userId: string; name: string; region: string; orderCount: number; totalAmount: number }>;
  const items: ActiveUserItem[] = rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    region: r.region,
    orderCount: r.orderCount,
    totalAmount: round2(r.totalAmount),
  }));
  return { year: year || 'all', region: region || 'all', items };
}

export const queries = {
  salesRanking,
  annualSummary,
  queryProducts,
  queryOrders,
  activeUsers,
};
