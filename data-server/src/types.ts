// data-server/src/types.ts
// 电商销售领域模型与查询结果的 TypeScript 类型定义

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  brand: string;
  price: number;
}

export interface User {
  id: string;
  name: string;
  region: string;
}

export type OrderStatus = 'completed' | 'refunded';

export interface Order {
  id: string;
  date: string;
  year: number;
  month: number;
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  region: string;
  userId: string;
  userName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  status: OrderStatus;
}

export interface Category {
  id: string;
  name: string;
}

export type RankType = 'product' | 'category' | 'region';
export type Period = '2024' | '2025' | 'all';

export interface RankItem {
  key: string;
  name: string;
  totalAmount: number;
  totalQuantity: number;
}

export interface RankingResult {
  type: RankType;
  period: Period;
  metric: 'amount';
  items: RankItem[];
}

export interface MonthlyPoint {
  month: number;
  amount: number;
  orders: number;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  name: string;
  amount: number;
  quantity: number;
}

export interface RegionAmount {
  region: string;
  amount: number;
}

export interface ProductAmount {
  productId: string;
  name: string;
  amount: number;
}

export interface Yoy {
  prevYear: string;
  prevAmount: number;
  growth: number;
}

export interface AnnualSummary {
  year: string;
  totalAmount: number;
  totalOrders: number;
  totalQuantity: number;
  avgOrderValue: number;
  monthlyTrend: MonthlyPoint[];
  categoryBreakdown: CategoryBreakdownItem[];
  topRegion: RegionAmount | null;
  topProduct: ProductAmount | null;
  yoy: Yoy | null;
}

export interface ProductQueryResult {
  total: number;
  items: Product[];
}

export interface OrderListItem {
  id: string;
  date: string;
  productName: string;
  categoryName: string;
  region: string;
  quantity: number;
  amount: number;
}

export interface OrderQueryResult {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  items: OrderListItem[];
}

export interface ActiveUserItem {
  userId: string;
  name: string;
  region: string;
  orderCount: number;
  totalAmount: number;
}

export interface ActiveUserResult {
  year: string;
  region: string;
  items: ActiveUserItem[];
}

export interface SalesRankingParams {
  type?: RankType;
  period?: Period;
  limit?: number;
}

export interface AnnualSummaryParams {
  year?: string;
}

export interface QueryProductsParams {
  category?: string;
  keyword?: string;
  limit?: number;
}

export interface QueryOrdersParams {
  region?: string;
  year?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

export interface ActiveUsersParams {
  year?: string;
  region?: string;
  limit?: number;
}

export interface ApiEnvelope<T> {
  code: number;
  data: T;
  message?: string;
}
