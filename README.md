# MCP Node 示例：电商销售数据服务 + MCP 服务 + 演示

演示一条完整链路：

1. **数据服务（data-server）** — Node.js + Express，内存种子数据，提供 5 个 REST 查询接口。
2. **MCP 服务（mcp-server）** — 基于 `@modelcontextprotocol/sdk`，stdio 传输，把上面 5 个接口封装成 5 个 MCP 工具。
3. **演示（两者都做）**
   - **Web 看板（demo-dashboard）**：后端作为 MCP 客户端接入 MCP 服务取数，前端 Chart.js 展示排行榜 / 年度汇总 / 品类占比 / 月度趋势 / 活跃用户，并提供“工具试玩面板”。
   - **LLM Agent（demo-agent）**：MCP 客户端 + OpenAI 兼容接口做工具调用循环；未配置 `LLM_API_KEY` 时跑脚本化降级演示，编排 5 个工具回答预设分析问题。

---

## 目录结构

```
mcp_node/
├── data-server/      # 数据服务（5 个 REST 接口，端口 3000）
│   └── src/{data.js, server.js}
├── mcp-server/       # MCP 服务（stdio，5 个工具）
│   └── src/index.js
├── demo-dashboard/   # Web 看板（端口 4000，作为 MCP 客户端）
│   ├── server.js
│   └── public/index.html
├── demo-agent/       # LLM Agent 脚本（含脚本化降级）
│   └── src/index.js
└── README.md
```

## 5 个查询接口 / 5 个 MCP 工具对照

| # | REST 接口 | MCP 工具 | 说明 |
|---|-----------|----------|------|
| 1 | `GET /api/sales/ranking` | `get_sales_ranking` | 销售额排行榜（商品/品类/地区，按年或全周期） |
| 2 | `GET /api/sales/summary` | `get_annual_summary` | 年度汇总（总额、订单、客单价、月度趋势、品类占比、同比） |
| 3 | `GET /api/products` | `query_products` | 商品查询/筛选（品类、关键字） |
| 4 | `GET /api/orders` | `query_orders` | 订单分页查询（地区/年/品类过滤） |
| 5 | `GET /api/users/active` | `get_active_users` | 活跃用户排行（按消费金额，年/地区过滤） |

## 快速开始

> 需要 Node.js ≥ 18（依赖顶层 `await` 与全局 `fetch`）。

### 1) 安装依赖

```bash
cd data-server   && npm install
cd ../mcp-server && npm install
cd ../demo-dashboard && npm install
cd ../demo-agent && npm install
```

### 2) 启动数据服务（终端 A）

```bash
cd data-server && npm start
# → http://localhost:3000
```

### 3) 方式 A：Web 看板（终端 B）

```bash
cd demo-dashboard && npm start
# 浏览器打开 http://localhost:4000
```

### 3) 方式 B：LLM Agent 脚本（终端 B）

未配置密钥 → 脚本化演示：

```bash
cd demo-agent && npm start
```

配置 OpenAI 兼容接口 → 真实 Agent（可接你自己的中转站）：

```bash
export LLM_API_KEY=sk-xxx
export LLM_BASE_URL=https://your-endpoint/v1   # 默认 https://api.openai.com/v1
export LLM_MODEL=gpt-4o-mini
cd demo-agent && npm start -- "2025 年哪个品类最畅销？和 2024 年相比如何？"
```

### 把 MCP 服务接进其他客户端（如 WorkBuddy / Claude Desktop）

在客户端的 MCP 配置里加入（stdio 方式）：

```json
{
  "mcpServers": {
    "ecommerce-mcp": {
      "command": "node",
      "args": ["/绝对路径/mcp_node/mcp-server/src/index.js"],
      "env": { "DATA_SERVER_URL": "http://localhost:3000" }
    }
  }
}
```

> 注意：MCP 服务通过 HTTP 调用数据服务，因此启动 MCP 客户端前请先确保 `data-server` 已在运行。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATA_SERVER_PORT` | 3000 | 数据服务端口 |
| `DATA_SERVER_URL` | http://localhost:3000 | MCP 服务 / 看板 连接数据服务的地址 |
| `DASHBOARD_PORT` | 4000 | 看板端口 |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | — | Agent 真实模式配置 |
