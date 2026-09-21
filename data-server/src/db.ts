// data-server/src/db.ts
// SQLite 数据源：建库建表 + 首次启动种子数据
// 各表种子条数均在 5000 - 20000 区间内（商品 5000 / 用户 6000 / 订单 20000）
// 订单年份跨 2023-2026，用于演示「放开年份限制」后可查任意年份
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 各表种子条数（均在 5000 - 20000 区间）
export const SEED_COUNTS = { products: 5000, users: 6000, orders: 20000 };

// ---- 维度与生成配置 ----
const CATEGORIES: Array<{ id: string; name: string }> = [
  { id: 'c1', name: '手机数码' },
  { id: 'c2', name: '家用电器' },
  { id: 'c3', name: '服饰鞋包' },
  { id: 'c4', name: '美妆个护' },
  { id: 'c5', name: '食品生鲜' },
  { id: 'c6', name: '图书文娱' },
  { id: 'c7', name: '运动户外' },
  { id: 'c8', name: '家居家装' },
];
const REGIONS = ['华东', '华北', '华南', '西部', '中部'];

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

// ---- 确定性随机（mulberry32，可复现）----
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

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE IF NOT EXISTS regions (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT,
      category_id TEXT,
      category_name TEXT,
      brand TEXT,
      price REAL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      region TEXT
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      date TEXT,
      year INTEGER,
      month INTEGER,
      product_id TEXT,
      product_name TEXT,
      category_id TEXT,
      category_name TEXT,
      region TEXT,
      user_id TEXT,
      user_name TEXT,
      quantity INTEGER,
      unit_price REAL,
      amount REAL,
      status TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_orders_year ON orders(year);
    CREATE INDEX IF NOT EXISTS idx_orders_cat ON orders(category_id);
    CREATE INDEX IF NOT EXISTS idx_orders_region ON orders(region);
  `);
}

// 库为空时写入种子数据（单次事务，速度极快）
export function seedIfEmpty(): void {
  const row = db.prepare('SELECT COUNT(*) AS count FROM products').get() as { count: number };
  if (row.count > 0) return;

  const seed = db.transaction(() => {
    const insCat = db.prepare('INSERT OR IGNORE INTO categories VALUES (?, ?)');
    CATEGORIES.forEach((c) => insCat.run(c.id, c.name));
    const insReg = db.prepare('INSERT OR IGNORE INTO regions VALUES (?, ?)');
    REGIONS.forEach((name, i) => insReg.run('r' + (i + 1), name));

    // 商品
    const insProd = db.prepare('INSERT INTO products VALUES (?, ?, ?, ?, ?, ?)');
    const products: Array<{ id: string; categoryId: string; categoryName: string; name: string; price: number }> = [];
    for (let i = 0; i < SEED_COUNTS.products; i++) {
      const c = CATEGORIES[i % CATEGORIES.length];
      const brand = pick(brandByCat[c.id]);
      const noun = pick(nounByCat[c.id]);
      const model = pick(modelSuffix);
      const name = `${brand}${noun}${model}`;
      const [lo, hi] = priceRange[c.id];
      const price = round2(lo + rand() * (hi - lo));
      const id = 'p' + String(i + 1).padStart(4, '0');
      products.push({ id, categoryId: c.id, categoryName: c.name, name, price });
      insProd.run(id, name, c.id, c.name, brand, price);
    }

    // 用户
    const surnames = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
    const givens = ['伟', '芳', '强', '敏', '磊', '洋', '勇', '艳', '杰', '娜', '涛', '静'];
    const insUser = db.prepare('INSERT INTO users VALUES (?, ?, ?)');
    const users: Array<{ id: string; name: string; region: string }> = [];
    for (let i = 0; i < SEED_COUNTS.users; i++) {
      const name = pick(surnames) + pick(givens);
      const region = pick(REGIONS);
      const id = 'u' + String(i + 1).padStart(4, '0');
      users.push({ id, name, region });
      insUser.run(id, name, region);
    }

    // 订单（年份跨 2023-2026）
    const insOrder = db.prepare(
      'INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (let i = 0; i < SEED_COUNTS.orders; i++) {
      const product = products[Math.floor(rand() * products.length)];
      const user = users[Math.floor(rand() * users.length)];
      const year = randInt(2023, 2026);
      const month = randInt(1, 12);
      const day = randInt(1, 28);
      const quantity = randInt(1, 5);
      const discount = 0.85 + rand() * 0.15; // 0.85~1.0
      const unitPrice = round2(product.price * discount);
      const amount = round2(unitPrice * quantity);
      const status = rand() < 0.92 ? 'completed' : 'refunded';
      const region = pick(REGIONS);
      const id = 'o' + String(i + 1).padStart(5, '0');
      insOrder.run(
        id,
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        year,
        month,
        product.id,
        product.name,
        product.categoryId,
        product.categoryName,
        region,
        user.id,
        user.name,
        quantity,
        unitPrice,
        amount,
        status
      );
    }
  });
  seed();
}

// 在 server 启动前调用：建表 + （必要时）种子
export function bootstrapDb(): void {
  initSchema();
  seedIfEmpty();
}
