# MCP Node 示例：电商销售数据服务 + MCP 服务 + 演示

演示一条完整链路（全部使用 **TypeScript**，以 `tsx` 直接运行，无需构建步骤）：

1. **数据服务（data-server）** — Node.js + Express，内存种子数据，提供 5 个 REST 查询接口。
2. **MCP 服务（mcp-server）** — 基于 `@modelcontextprotocol/sdk`，**stdio + Streamable HTTP 双传输**，把上面 5 个接口封装成 5 个 MCP 工具。默认以 Streamable HTTP（路线 A）启动，可对外提供地址给其它用户。
3. **演示（两者都做）**
   - **Web 看板（demo-dashboard）**：后端作为 MCP 客户端（Streamable HTTP）接入 MCP 服务取数，前端 Chart.js 展示排行榜 / 年度汇总 / 品类占比 / 月度趋势 / 活跃用户，并提供“工具试玩面板”。
   - **LLM Agent（demo-agent）**：MCP 客户端 + OpenAI 兼容接口做工具调用循环；未配置 `LLM_API_KEY` 时跑脚本化降级演示，编排 5 个工具回答预设分析问题。

---

## 目录结构

```
mcp_node/
├── data-server/      # 数据服务（5 个 REST 接口，端口 3000）
│   ├── src/{types.ts, data.ts, server.ts}
│   └── Dockerfile
├── mcp-server/       # MCP 服务（stdio + Streamable HTTP，5 个工具）
│   ├── src/{index.ts, tools.ts}
│   ├── deploy/{nginx.conf.example, docker-compose.yml}
│   └── Dockerfile
├── demo-dashboard/   # Web 看板（端口 4000，作为 MCP 客户端）
│   ├── server.ts
│   └── public/index.html
├── demo-agent/       # LLM Agent 脚本（含脚本化降级）
│   └── src/index.ts
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

> 需要 Node.js ≥ 18（推荐 20+，依赖全局 `fetch`；运行用 `tsx`）。

### 1) 安装依赖（四个项目各自安装）

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

### 3) 启动 MCP 服务（终端 B，默认 Streamable HTTP / 路线 A）

```bash
cd mcp-server && npm start
# → http://localhost:8089/mcp
```

> 如需本地 stdio 调试：`TRANSPORT=stdio npm start`。

### 4) 方式 A：Web 看板（终端 C）

```bash
cd demo-dashboard && npm start
# 浏览器打开 http://localhost:4000
```

### 4) 方式 B：LLM Agent 脚本（终端 C）

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

### 把 MCP 服务接进其他客户端（远程 URL / 本地 stdio）

- **远程地址（路线 A）**：在 WorkBuddy / Claude Desktop 的远程 MCP 配置里填入 `http(s)://你的域名/mcp`（及 `Authorization: Bearer <token>`，若设了 `MCP_TOKEN`）。详见 `mcp-server/README.md` 第 4、6 节。
- **本地 stdio**：填入 `node mcp-server/src/index.ts` 的绝对路径。
- 启动 MCP 客户端前，请先确保 `data-server` 与 `mcp-server`（HTTP 模式）已在运行。

---

## 远程部署（路线 A）：把能力提供给其它用户

把 `mcp-server` 以 `TRANSPORT=http` 部署，经 nginx/Caddy 反代 + HTTPS + Bearer 鉴权，对外暴露 `https://你的域名/mcp`。具体步骤、nginx 示例、Docker / compose 编排见 **`mcp-server/README.md` 第 6 节** 与 `mcp-server/deploy/` 目录。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATA_SERVER_PORT` | 3000 | 数据服务端口 |
| `DATA_SERVER_URL` | http://localhost:3000 | MCP 服务 / 看板 连接数据服务的地址 |
| `TRANSPORT` | http | mcp-server 传输：`http`（Streamable HTTP）或 `stdio` |
| `PORT` | 8089 | mcp-server HTTP 模式端口（端点 `/mcp`） |
| `MCP_TOKEN` | 空 | mcp-server HTTP 模式可选 Bearer 鉴权 |
| `MCP_HTTP_URL` | http://localhost:8089/mcp | demo-dashboard / demo-agent 连接 MCP 服务的地址 |
| `DASHBOARD_PORT` | 4000 | 看板端口 |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | — | Agent 真实模式配置 |
