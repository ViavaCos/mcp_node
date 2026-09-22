# MCP Node 示例：授权服务器 + 电商销售数据服务 + MCP 服务 + 演示

演示一条完整链路（全部使用 **TypeScript**，以 `tsx` 直接运行，无需构建步骤）：

1. **授权服务器（auth-server）** — Node.js + Express + jose 的**最小 OIDC 授权服务器**，负责**颁发** RS256 签名的 JWT 访问令牌。
2. **数据服务（data-server）** — Node.js + Express + SQLite，内置种子数据（5000 商品 / 6000 用户 / 20000 订单，覆盖 2023–2026），提供 5 个 REST 查询接口（年份不限，查不到返回空）。
3. **MCP 服务（mcp-server）** — 基于 `@modelcontextprotocol/sdk`，**stdio + Streamable HTTP 双传输**，把上面 5 个接口封装成 5 个 MCP 工具。HTTP 模式下扮演 **OAuth 2.1 资源服务器**：只**校验**令牌（JWKS 验签 + `iss`/`aud`/`exp`/`scope`），不颁发。
4. **演示（两者都做）**
   - **Web 看板（demo-dashboard）**：后端作为 MCP 客户端（Streamable HTTP + OAuth）接入 MCP 服务取数，前端 Chart.js 展示排行榜 / 年度汇总 / 品类占比 / 月度趋势 / 活跃用户，并提供“工具试玩面板”。
   - **LLM Agent（demo-agent）**：MCP 客户端 + OpenAI 兼容接口做工具调用循环；未配置 `LLM_API_KEY` 时跑脚本化降级演示，编排 5 个工具回答预设分析问题。

> **OAuth 2.1 角色划分**：`auth-server` 是授权服务器（颁发令牌）；`mcp-server` 是资源服务器（校验令牌）。二者可为不同进程 / 不同域名，角色不可混同。

---

## 目录结构

```
mcp_node/
├── auth-server/      # 最小 OIDC 授权服务器（颁发令牌，端口 9000）
│   ├── src/{config.ts, keys.ts, pkce.ts, tokens.ts, server.ts}
│   ├── keys.json     # 首次启动自动生成（已加入 .gitignore）
│   └── Dockerfile
├── data-server/      # 数据服务（SQLite，5 个 REST 接口，端口 3000）
│   ├── src/{types.ts, db.ts, data.ts, server.ts}
│   ├── data.sqlite   # 首次启动自动生成（含种子数据）
│   └── Dockerfile
├── mcp-server/       # MCP 服务（OAuth 2.1 资源服务器，stdio + Streamable HTTP）
│   ├── src/{index.ts, tools.ts, auth/{config,metadata,verify}.ts}
│   ├── deploy/{nginx.conf.example, docker-compose.yml}
│   └── Dockerfile
├── demo-dashboard/   # Web 看板（端口 4000，作为 MCP 客户端）
│   ├── server.ts
│   └── public/index.html
├── demo-agent/       # LLM Agent 脚本（含脚本化降级）
│   └── src/index.ts
├── demo-admin/       # API key 管理台（方案 B，端口 4100）
│   ├── server.ts
│   └── public/index.html
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

### 1) 安装依赖（各项目各自安装）

```bash
cd auth-server   && npm install
cd ../data-server && npm install
cd ../mcp-server && npm install
cd ../demo-dashboard && npm install
cd ../demo-agent && npm install
```

### 2) 启动授权服务器（终端 A）

```bash
cd auth-server && npm start
# → http://localhost:9000
# 首次启动生成 RS256 密钥对（keys.json）；演示客户端 demo-client / demo-secret
```

### 3) 启动数据服务（终端 B）

```bash
cd data-server && npm start
# → http://localhost:3000
```

### 4) 启动 MCP 服务（终端 C，默认 Streamable HTTP / 路线 A / 鉴权开启）

```bash
cd mcp-server && npm start
# → http://localhost:8089/mcp
```

> 本地 stdio 调试：`TRANSPORT=stdio npm start`；本地免鉴权调试：`AUTH_MODE=none npm start`。

### 5) 方式 A：Web 看板（终端 D）

```bash
cd demo-dashboard && \
AUTH_CLIENT_ID=demo-client AUTH_CLIENT_SECRET=demo-secret AUTH_SCOPE=mcp:tools npm start
# 浏览器打开 http://localhost:4000
```

> 服务端开启鉴权（`AUTH_MODE=jwt`）时需带 `AUTH_*`；未配置 `AUTH_CLIENT_ID` 则不带令牌（对应 `AUTH_MODE=none`）。

### 5) 方式 B：LLM Agent 脚本（终端 D）

未配置密钥 → 脚本化演示：

```bash
cd demo-agent && \
AUTH_CLIENT_ID=demo-client AUTH_CLIENT_SECRET=demo-secret npm start
```

配置 OpenAI 兼容接口 → 真实 Agent（可接你自己的中转站）：

```bash
export LLM_API_KEY=sk-xxx
export LLM_BASE_URL=https://your-endpoint/v1   # 默认 https://api.openai.com/v1
export LLM_MODEL=gpt-4o-mini
cd demo-agent && AUTH_CLIENT_ID=demo-client AUTH_CLIENT_SECRET=demo-secret \
  npm start -- "2025 年哪个品类最畅销？和 2024 年相比如何？"
```

### 6) 方式 C：API key 管理台（demo-admin，方案 B）

为每个调用方（用户 / 集成方）申请稳定、可吊销的 API key；调用方用 key 兑换短命 JWT 后访问 MCP 资源。

```bash
cd demo-admin && AUTH_ADMIN_TOKEN=admin-secret npm start
# 浏览器打开 http://localhost:4100 —— 创建 / 列出 / 吊销 key
```

拿到 key 后，任意 MCP 客户端都可改用「API key 兑换」方式接入（仍是短命 JWT，资源服务器无状态校验不变）：

```bash
# demo 看板改用某用户的 API key 接入
cd demo-dashboard && AUTH_API_KEY=mcp_xxxx npm start

# 或手工：用 API key 兑换 JWT（subject = key 的 owner，由此区分不同调用方）
TOKEN=$(curl -s -X POST http://localhost:9000/token \
  -u '__apikey__:mcp_xxxx' \
  -d 'grant_type=client_credentials&scope=mcp:tools&resource=http://localhost:8089/mcp' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s -X POST http://localhost:8089/mcp -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | head -c 200
```

### 手工验证鉴权链路（可选）

```bash
# 无令牌 → 401 + WWW-Authenticate 挑战
curl -si -X POST http://localhost:8089/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | head -6

# 发现文档（RFC 9728）
curl -s http://localhost:8089/.well-known/oauth-protected-resource/mcp

# 取令牌（client_credentials）
TOKEN=$(curl -s -X POST http://localhost:9000/token \
  -u demo-client:demo-secret \
  -d 'grant_type=client_credentials&scope=mcp:tools&resource=http://localhost:8089/mcp' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

# 带令牌 → 200
curl -s -X POST http://localhost:8089/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | head -c 200
```

### 自动化回归：鉴权负数矩阵（可选）

`scripts/oauth-negative-matrix.mjs` 会跑一遍正向链路 + 8 项边界（过期、错 `aud`、错 `iss`、`alg=none` 降级、签名篡改、缺 scope / 无 scope、复合 scope），逐项比对状态码与错误语义，任一失败即以非零码退出，适合放进 CI。

```bash
# 前提：auth-server(9000) / data-server(3000) / mcp-server(8089, AUTH_MODE=jwt) 均已启动
node scripts/oauth-negative-matrix.mjs \
  --keys auth-server/keys.json \
  --client-id demo-client --client-secret demo-secret --scope mcp:tools
# → 汇总：12/12 通过
```

> 注：该脚本源自我沉淀的 `mcp-oauth21-authorization` 技能；通用版本见该技能 `scripts/oauth_negative_matrix.mjs`。

### 把 MCP 服务接进其他客户端（远程 URL / 本地 stdio）

- **远程地址（路线 A）**：在 WorkBuddy / Claude Desktop 的远程 MCP 配置里填入 `https://你的域名/mcp`。支持 OAuth 的客户端会自动发现授权服务器并取令牌。
- **本地 stdio**：填入 `node mcp-server/src/index.ts` 的绝对路径（stdio 不走 OAuth）。
- 启动 MCP 客户端前，请先确保 `data-server` 正在运行（启用鉴权时还需 `auth-server`）。

---

## 远程部署（路线 A）：把能力提供给其它用户

`auth-server` + `mcp-server` 以容器或进程方式部署，`nginx` 做 TLS 终止与转发（**鉴权在 mcp-server 内完成，nginx 不再比对令牌**），对外暴露 `https://你的域名/mcp`。步骤、nginx 示例、compose 编排见 **`mcp-server/README.md` 第 7 节**、`auth-server/README.md` 与 `mcp-server/deploy/` 目录。

---

## 安全说明（务必阅读）

- `auth-server` 是**演示用的最小实现**，缺少用户登录 / 同意页、refresh token、令牌撤销与 introspection，**不可直接用于生产**。生产请用 Keycloak / Casdoor / Auth0 / Entra ID 等。
- `AUTH_MODE=none` 会**完全关闭** `/mcp` 鉴权，仅限本机调试；启用时服务端会打印不安全告警。
- `keys.json`（RS256 私钥）与 `data.sqlite` 均已加入 `.gitignore`，请勿提交。
- 令牌 audience 绑定到 `RESOURCE_URL`，`mcp-server` 会拒绝「发给别人的令牌」（防重放 / confused deputy）。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AUTH_PORT` | 9000 | 授权服务器端口 |
| `AUTH_ISSUER` | http://localhost:9000 | issuer，须与令牌 `iss` 一致 |
| `RESOURCE_URL` | http://localhost:8089/mcp | 受保护资源地址（令牌 `aud`） |
| `AUTH_CLIENT_ID` / `AUTH_CLIENT_SECRET` | demo-client / demo-secret | 演示客户端凭据（auth-server 注册 / demo 客户端使用） |
| `AUTH_SCOPE` | mcp:tools | demo 客户端请求的 scope |
| `AUTH_KEYS_PATH` | auth-server/keys.json | RS256 密钥持久化路径 |
| `AUTH_TOKEN_TTL` | 300 | 访问令牌有效期（秒） |
| `AUTH_SCOPES` | mcp:tools mcp:admin | 授权服务器支持的 scope 列表 |
| `AUTH_CORS_ORIGINS` | 由注册客户端 `redirect_uri` 派生 | 允许跨域访问授权端点 / 发现文档 / JWKS 的来源（**浏览器 SPA 必须命中，否则预检失败取不到令牌**） |
| `DATA_SERVER_PORT` | 3000 | 数据服务端口 |
| `DATA_SERVER_URL` | http://localhost:3000 | MCP 服务连接数据服务的地址 |
| `TRANSPORT` | http | mcp-server 传输：`http`（Streamable HTTP）或 `stdio` |
| `PORT` | 8089 | mcp-server HTTP 模式端口（端点 `/mcp`） |
| `AUTH_MODE` | jwt | mcp-server 鉴权模式：`jwt` 或 `none`（仅本地调试） |
| `AUTH_JWKS_URL` | `${AUTH_ISSUER}/jwks` | 公钥集地址；**显式配置时优先于发现文档里的 `jwks_uri`**（容器部署指向内网地址） |
| `AUTH_DISCOVERY_URL` | `${AUTH_ISSUER}/.well-known/openid-configuration` | AS 元数据发现文档的抓取地址，与 `AUTH_ISSUER` 解耦；容器内指向内网地址可让 issuer 镜像校验真正生效 |
| `AUTH_REQUIRED_SCOPES` | mcp:tools | 访问工具所需 scope |
| `MCP_HTTP_URL` | http://localhost:8089/mcp | demo-dashboard / demo-agent 连接 MCP 服务的地址 |
| `DASHBOARD_PORT` | 4000 | 看板端口 |
| `ADMIN_PORT` | 4100 | demo-admin 管理台端口 |
| `AUTH_SERVER_URL` | http://localhost:9000 | demo-admin 转发到的 auth-server 地址 |
| `AUTH_ADMIN_TOKEN` | admin-secret | 管理端点保护令牌（demo-admin 与 auth-server 需一致；生产请设强令牌） |
| `AUTH_APIKEYS_PATH` | auth-server/apikeys.json | API key 存储路径（仅存哈希，勿提交版本库） |
| `AUTH_API_KEY` | — | 演示客户端改用「API key 兑换 JWT」接入时设置（替代 AUTH_CLIENT_ID/SECRET） |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | — | Agent 真实模式配置 |
