// data-server/src/data.ts
// 电商销售内存数据集 + 5 个聚合查询函数（确定性种子，便于复现）
import type {
  Product,
  User,
  Order,
  Category,
  RankItem,
  RankType,
  Period,
  MonthlyPoint,
  CategoryBreakdownItem,
  RegionAmount,
  ProductAmount,
  RankingResult,
  AnnualSummary,
  ProductQueryResult,
  OrderQueryResult,
  ActiveUserItem,
  ActiveUserResult,
  SalesRankingParams,
  AnnualSummaryParams,
  QueryProductsParams,
  QueryOrdersParams,
  ActiveUsersParams,
} from './types.js';

// ---- 确定性随机数（mulberry32）----
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20240921);
const randInt = (min: number, max: number): number => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---- 维度定义 ----
export const regions: string[] = ['华东', '华北', '华南', '西部', '中部'];

export const categories: Category[] = [
  { id: 'c1', name: '手机数码' },
  { id: 'c2', name: '家用电器' },
  { id: 'c3', name: '服饰鞋包' },
  { id: 'c4', name: '美妆个护' },
  { id: 'c5', name: '食品生鲜' },
  { id: 'c6', name: '图书文娱' },
  { id: 'c7', name: '运动户外' },
  { id: 'c8', name: '家居家装' },
];
const categoryMap = new Map<string, Category>(categories.map((c) => [c.id, c]));

const brandByCat: Record<string, string[]> = {
  c1: ['极光', '星睿', '云鲸', '锐界'],
  c2: ['暖阳', '清风', '万家乐', '鼎沸'],
  c3: ['素白', '墨韵', '潮π', '原野'],
  c4: ['花知晓', '本草集', '净颜', '琉光'],
  c5: ['田园牧歌', '鲜直达', '谷味', '山海味'],
  c6: ['知微', '翰墨', '星河', '拾光'],
  c7: ['驰野', '劲风', '岩途', '凌云'],
  c8: ['木言', '栖居', '简物', '筑梦'],
};
const nounByCat: Record<string, string[]> = {
  c1: ['旗舰手机', '蓝牙耳机', '平板电脑', '智能手表'],
  c2: ['变频空调', '滚筒洗衣机', '空气炸锅', '电饭煲'],
  c3: ['风衣', '运动鞋', '真皮背包', '针织衫'],
  c4: ['精华液', '洁面乳', '口红', '面膜'],
  c5: ['有机大米', '冷鲜牛肉', '坚果礼盒', '鲜果篮'],
  c6: ['少儿绘本', '畅销小说', '桌游', '钢笔礼盒'],
  c7: ['跑步机', '冲锋衣', '瑜伽垫', '登山杖'],
  c8: ['实木餐桌', '收纳柜', '乳胶枕', '香薰灯'],
};
const modelSuffix = ['Pro', 'Air', '2024款', 'Max', 'Lite', 'Plus', ''];
const priceRange: Record<string, [number, number]> = {
  c1: [999, 6999],
  c2: [299, 5999],
  c3: [59, 1299],
  c4: [29, 899],
  c5: [9, 399],
  c6: [19, 299],
  c7: [79, 2999],
  c8: [49, 1999],
};

// ---- 商品 ----
export const products: Product[] = [];
{
  let pid = 1;
  for (const c of categories) {
    const count = randInt(7, 10);
    for (let i = 0; i < count; i++) {
      const brand = pick(brandByCat[c.id]);
      const noun = pick(nounByCat[c.id]);
      const model = pick(modelSuffix);
      const name = `${brand}${noun}${model}`;
      const [lo, hi] = priceRange[c.id];
      const price = round2(lo + rand() * (hi - lo));
      products.push({
        id: `p${String(pid).padStart(3, '0')}`,
        name,
        categoryId: c.id,
        categoryName: c.name,
        brand,
        price,
      });
      pid++;
    }
  }
}
const productMap = new Map<string, Product>(products.map((p) => [p.id, p]));

// ---- 用户 ----
const surnames = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
const givens = ['伟', '芳', '强', '敏', '磊', '洋', '勇', '艳', '杰', '娜', '涛', '静'];
export const users: User[] = [];
{
  let uid = 1;
  for (let i = 0; i < 300; i++) {
    users.push({
      id: `u${String(uid).padStart(3, '0')}`,
      name: pick(surnames) + pick(givens),
      region: pick(regions),
    });
    uid++;
  }
}
const userMap = new Map<string, User>(users.map((u) => [u.id, u]));

// ---- 订单（2024 / 2025 两年）----
export const orders: Order[] = [];
{
  let oid = 1;
  const total = 2600;
  for (let i = 0; i < total; i++) {
    const year = rand() < 0.48 ? 2024 : 2025; // 略微偏向 2025
    const month = randInt(1, 12);
    const day = randInt(1, 28);
    const product = pick(products);
    const region = pick(regions);
    const quantity = randInt(1, 5);
    const discount = 0.85 + rand() * 0.15; // 0.85~1.0
    const unitPrice = round2(product.price * discount);
    const amount = round2(unitPrice * quantity);
    const user = pick(users);
    const status = rand() < 0.92 ? 'completed' : 'refunded';
    orders.push({
      id: `o${String(oid).padStart(4, '0')}`,
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      year,
      month,
      productId: product.id,
      productName: product.name,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      region,
      userId: user.id,
      userName: user.name,
      quantity,
      unitPrice,
      amount,
      status,
    });
    oid++;
  }
}

// ---- 查询函数 ----
const isSold = (o: Order): boolean => o.status === 'completed';

function salesRanking({ type = 'product', period = 'all', limit = 10 }: SalesRankingParams = {}): RankingResult {
  const map = new Map<string, RankItem>();
  for (const o of orders) {
    if (!isSold(o)) continue;
    if (period !== 'all' && String(o.year) !== String(period)) continue;
    let key: string;
    let name: string;
    if (type === 'product') {
      key = o.productId;
      name = o.productName;
    } else if (type === 'category') {
      key = o.categoryId;
      name = o.categoryName;
    } else {
      key = o.region;
      name = o.region;
    }
    const cur = map.get(key) || { key, name, totalAmount: 0, totalQuantity: 0 };
    cur.totalAmount += o.amount;
    cur.totalQuantity += o.quantity;
    map.set(key, cur);
  }
  const items = [...map.values()]
    .map((x) => ({ ...x, totalAmount: round2(x.totalAmount) }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, Math.max(1, Math.min(50, limit)));
  return { type, period, metric: 'amount', items };
}

function annualSummary({ year = '2025' }: AnnualSummaryParams = {}): AnnualSummary {
  const y = String(year);
  const list = orders.filter((o) => String(o.year) === y && isSold(o));
  const totalAmount = round2(list.reduce((s, o) => s + o.amount, 0));
  const totalOrders = list.length;
  const totalQuantity = list.reduce((s, o) => s + o.quantity, 0);
  const avgOrderValue = totalOrders ? round2(totalAmount / totalOrders) : 0;

  const monthly: MonthlyPoint[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    amount: 0,
    orders: 0,
  }));
  const catMap = new Map<string, CategoryBreakdownItem>();
  const regionMap = new Map<string, RegionAmount>();
  const prodMap = new Map<string, ProductAmount>();
  for (const o of list) {
    monthly[o.month - 1].amount += o.amount;
    monthly[o.month - 1].orders += 1;
    const c = catMap.get(o.categoryId) || { categoryId: o.categoryId, name: o.categoryName, amount: 0, quantity: 0 };
    c.amount += o.amount;
    c.quantity += o.quantity;
    catMap.set(o.categoryId, c);
    const r = regionMap.get(o.region) || { region: o.region, amount: 0 };
    r.amount += o.amount;
    regionMap.set(o.region, r);
    const p = prodMap.get(o.productId) || { productId: o.productId, name: o.productName, amount: 0 };
    p.amount += o.amount;
    prodMap.set(o.productId, p);
  }
  const categoryBreakdown = [...catMap.values()]
    .map((x) => ({ ...x, amount: round2(x.amount) }))
    .sort((a, b) => b.amount - a.amount);
  const topRegion = [...regionMap.values()].sort((a, b) => b.amount - a.amount)[0] || null;
  const topProduct = [...prodMap.values()].sort((a, b) => b.amount - a.amount)[0] || null;
  const monthlyTrend = monthly.map((m) => ({ ...m, amount: round2(m.amount) }));

  // 同比
  const prevYear = String(Number(y) - 1);
  const prevList = orders.filter((o) => String(o.year) === prevYear && isSold(o));
  const prevAmount = round2(prevList.reduce((s, o) => s + o.amount, 0));
  const yoy: AnnualSummary['yoy'] =
    prevAmount > 0
      ? {
          prevYear,
          prevAmount,
          growth: round2(((totalAmount - prevAmount) / prevAmount) * 100),
        }
      : null;

  return {
    year: y,
    totalAmount,
    totalOrders,
    totalQuantity,
    avgOrderValue,
    monthlyTrend,
    categoryBreakdown,
    topRegion: topRegion ? { ...topRegion, amount: round2(topRegion.amount) } : null,
    topProduct: topProduct ? { ...topProduct, amount: round2(topProduct.amount) } : null,
    yoy,
  };
}

function queryProducts({ category, keyword, limit = 20 }: QueryProductsParams = {}): ProductQueryResult {
  let list = products.slice();
  if (category) list = list.filter((p) => p.categoryId === category);
  if (keyword) {
    const k = String(keyword).toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(k));
  }
  const total = list.length;
  const items = list.slice(0, Math.max(1, Math.min(100, limit)));
  return { total, items };
}

function queryOrders({ region, year, category, page = 1, pageSize = 20 }: QueryOrdersParams = {}): OrderQueryResult {
  let list = orders.filter(isSold);
  if (region) list = list.filter((o) => o.region === region);
  if (year) list = list.filter((o) => String(o.year) === String(year));
  if (category) list = list.filter((o) => o.categoryId === category);
  list.sort((a, b) => (a.date < b.date ? 1 : -1)); // 新订单在前
  const total = list.length;
  const p = Math.max(1, page);
  const ps = Math.max(1, Math.min(100, pageSize));
  const items = list.slice((p - 1) * ps, p * ps).map((o) => ({
    id: o.id,
    date: o.date,
    productName: o.productName,
    categoryName: o.categoryName,
    region: o.region,
    quantity: o.quantity,
    amount: o.amount,
  }));
  return { total, page: p, pageSize: ps, totalPages: Math.ceil(total / ps), items };
}

function activeUsers({ year, region, limit = 10 }: ActiveUsersParams = {}): ActiveUserResult {
  const map = new Map<string, ActiveUserItem>();
  for (const o of orders) {
    if (!isSold(o)) continue;
    if (year && String(o.year) !== String(year)) continue;
    if (region && o.region !== region) continue;
    const cur =
      map.get(o.userId) || { userId: o.userId, name: o.userName, region: o.region, orderCount: 0, totalAmount: 0 };
    cur.orderCount += 1;
    cur.totalAmount += o.amount;
    map.set(o.userId, cur);
  }
  const items = [...map.values()]
    .map((x) => ({ ...x, totalAmount: round2(x.totalAmount) }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, Math.max(1, Math.min(50, limit)));
  return { year: year || 'all', region: region || 'all', items };
}

void categoryMap;
void productMap;
void userMap;

export const queries = {
  salesRanking,
  annualSummary,
  queryProducts,
  queryOrders,
  activeUsers,
};
