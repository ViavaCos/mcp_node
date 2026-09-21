# data-server — 电商销售数据服务

基于 **Node.js + Express + TypeScript** 的内存数据服务，提供 5 个 REST 查询接口（JSON 返回）。
它是整个项目的「数据底座」：MCP 服务、看板、Agent 演示都通过 HTTP 调用这里的接口取数。

## 数据说明

服务启动时在内存中生成一批**种子数据**（无需数据库）：

- 8 个商品品类（手机 / 电脑 / 家电 / 服饰 / 食品 / 美妆 / 图书 / 运动）
- 5 个销售地区（华东 / 华南 / 华北 / 西南 / 东北）
- 300 个用户、若干商品、约 2600 笔订单
- 订单覆盖 **2024、2025** 两个年度，含月份、地区、品类、金额、状态

> 数据为程序化随机生成，仅用于演示，每次启动重新生成（非持久化）。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATA_SERVER_PORT` | `3000` | 服务监听端口 |

服务显式监听 `0.0.0.0`（便于容器 / 反向代理访问）。

## 安装与启动

```bash
cd data-server
npm install
npm start            # tsx 直接运行 src/server.ts，监听 3000
npm run typecheck    # tsc --noEmit 类型校验
```

启动成功日志：`[data-server] 已启动: http://0.0.0.0:3000`

## 接口列表

所有接口统一返回 `{ code: 0, data: ... }`，出错为 `{ code: 1, message: ... }`。

### 1. 销售额排行榜 `GET /api/sales/ranking`

按维度统计销售额排行。

| 参数 | 必填 | 取值 | 说明 |
|---|---|---|---|
| `type` | 否 | `product` / `category` / `region`（默认 `product`） | 排行维度 |
| `period` | 否 | `2024` / `2025` / `all`（默认 `all`） | 统计周期 |
| `limit` | 否 | 数字（默认 `10`） | 返回条数 |

返回：`{ type, period, items: [{ name, totalAmount, orderCount }] }`

### 2. 年度汇总 `GET /api/sales/summary`

| 参数 | 必填 | 取值 | 说明 |
|---|---|---|---|
| `year` | 否 | `2024` / `2025`（默认 `2025`） | 统计年份 |

返回：`{ year, totalAmount, totalOrders, avgOrderValue, topRegion?: { region, totalAmount }, yoy?: { prevYear, prevAmount, growth }, monthlyTrend: [{ month, amount }] }`

### 3. 商品查询 / 筛选 `GET /api/products`

| 参数 | 必填 | 说明 |
|---|---|---|
| `category` | 否 | 品类 ID（如 `c1`） |
| `keyword` | 否 | 名称关键字（支持中文） |
| `limit` | 否 | 返回条数（默认 `20`） |

返回：`{ total, items: [{ id, name, category, categoryName, brand, price, salesCount, salesAmount }] }`

### 4. 订单分页查询 `GET /api/orders`

| 参数 | 必填 | 说明 |
|---|---|---|
| `region` | 否 | 地区名（如 `华东`） |
| `year` | 否 | `2024` / `2025` |
| `category` | 否 | 品类 ID |
| `page` | 否 | 页码（默认 `1`） |
| `pageSize` | 否 | 每页条数（默认 `20`） |

返回：`{ total, page, pageSize, items: [{ id, userId, userName, category, categoryName, region, year, month, amount, status, date }] }`

### 5. 活跃用户排行 `GET /api/users/active`

| 参数 | 必填 | 说明 |
|---|---|---|
| `year` | 否 | `2024` / `2025`（默认 `2025`） |
| `region` | 否 | 地区过滤 |
| `limit` | 否 | 返回条数（默认 `10`） |

返回：`{ year, region?, items: [{ name, region, totalAmount, orderCount }] }`

### 健康检查

`GET /health` → `{ "ok": true }`

## 依赖

- 运行时：`express`
- 开发：`@types/express`、`@types/node`、`tsx`、`typescript`

## 目录结构

```
data-server/
├── package.json
├── tsconfig.json
└── src/
    ├── types.ts      # 领域类型（Product/Order/User/Category/各类查询结果）
    ├── data.ts       # 种子数据生成 + 5 个查询函数（queries）
    └── server.ts     # Express 路由与启动
```

> 其他服务接入：MCP 服务通过 `DATA_SERVER_URL`（默认 `http://localhost:3000`）调用本服务的接口。
