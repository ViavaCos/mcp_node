# mcp-server — 电商销售 MCP 服务

基于官方 [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) 实现的 MCP 服务（TypeScript）。它把上游 `data-server`（电商销售 REST 服务）的 5 个查询接口封装为 5 个 MCP 工具，使任意 MCP 客户端都能基于这些接口「做任意事情」——查询排行榜、生成年度汇总、看板取数等。

**双传输支持**：通过 `TRANSPORT` 环境变量切换
- `stdio`（本地调试）：标准输入输出，供本地 MCP 客户端直接 spawn 子进程。
- `http`（**路线 A 默认**，远程部署）：**Streamable HTTP**，暴露 `http://<host>:<PORT>/mcp`，可被远程客户端通过 URL 接入、并提供地址给其它用户。

> 架构关系（路线 A）：`MCP 客户端` ⇄（Streamable HTTP）⇄ `mcp-server:8089/mcp` ⇢（HTTP）⇢ `data-server:3000`
> mcp-server 自身无状态，所有数据均实时取自 data-server。

---

## 1. 前置条件

mcp-server 通过 HTTP 调用 `data-server`（端口 `3000`）。**启动 mcp-server 之前，必须先启动 data-server**，否则工具调用会报错。

```bash
# 终端 A：先启动数据服务（详见 ../data-server）
cd ../data-server
npm install
npm start          # 监听 http://localhost:3000
```

---

## 2. 安装与启动

```bash
# 终端 B
cd mcp-server
npm install
npm start          # 默认以 Streamable HTTP 启动（TRANSPORT=http）
```

默认以 **Streamable HTTP** 方式启动（路线 A）。启动日志：

```
[mcp-server] ecommerce-mcp 已通过 Streamable HTTP 启动: http://localhost:8089/mcp
```

如需本地 stdio 调试，可显式指定：

```bash
TRANSPORT=stdio npm start
# → [mcp-server] ecommerce-mcp 已通过 stdio 启动，等待客户端连接
```

---

## 3. 环境变量

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `TRANSPORT` | `http` | 传输方式：`http`（Streamable HTTP，路线 A）或 `stdio`（本地调试）。 |
| `PORT` | `8089` | HTTP 模式监听端口，端点为 `http://<host>:<PORT>/mcp`。 |
| `DATA_SERVER_URL` | `http://localhost:3000` | 上游 data-server 的基址。 |
| `MCP_TOKEN` | 空（不鉴权） | 可选 Bearer 鉴权。设置后，所有 `/mcp` 请求必须带 `Authorization: Bearer <token>`，否则返回 401。 |

示例：

```bash
TRANSPORT=http PORT=8089 DATA_SERVER_URL=http://127.0.0.1:3000 MCP_TOKEN=secret123 npm start
```

---

## 4. 接入 MCP 客户端

### 4.1 远程接入（路线 A，推荐给「提供地址给其它用户」）

启动时用 `TRANSPORT=http`，对外暴露 `http(s)://你的域名/mcp`。客户端在远程 MCP 配置里填入该 URL 即可：

```json
{
  "mcpServers": {
    "ecommerce-mcp": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer secret123" }
    }
  }
}
```

> 生产环境请把 `mcp.example.com/mcp` 放在反向代理（nginx/Caddy）之后，做 HTTPS 终止 + 鉴权（见第 6 节）。

### 4.2 本地 stdio 接入

```json
{
  "mcpServers": {
    "ecommerce-mcp": {
      "command": "node",
      "args": ["/绝对路径/mcp_node/mcp-server/src/index.ts"],
      "env": { "DATA_SERVER_URL": "http://localhost:3000" }
    }
  }
}
```

> ⚠️ `args` 路径必须是 **mcp-server/src/index.ts** 的绝对路径（或已 `npm install` 过的副本）。建议先 `cd mcp-server && npm install` 再填写。stdio 模式需本地已装 Node 与依赖。

### 4.3 接入 WorkBuddy / Claude Desktop

- **WorkBuddy**：左侧栏 **连接器 / Connectors** → 自定义 MCP → 新增一条远程（URL）或 stdio 配置（按 4.1 / 4.2）→ 点击 **信任 / Trust** 启用。
- **Claude Desktop**：编辑 `claude_desktop_config.json`（macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`），加入 4.1 / 4.2 的 JSON 片段后重启。

### 4.4 在自定义脚本中接入

本项目 `demo-dashboard/server.ts` 与 `demo-agent/src/index.ts` 已内置 MCP 客户端逻辑（使用 `@modelcontextprotocol/sdk` 的 `Client` + `StreamableHTTPClientTransport`），连接 `http://localhost:8089/mcp`，可直接参考。

---

## 5. 提供的工具（Tools）

服务名：`ecommerce-mcp` / 版本：`1.0.0`

| # | 工具名 | 说明 | 参数 |
|---|---|---|---|
| 1 | `get_sales_ranking` | 销售额排行榜，维度：商品 / 品类 / 地区 | `type`: product\|category\|region<br>`period`: 4 位年份(如 2023/2026)\|all（默认 all）<br>`limit`: 1-50（默认 10） |
| 2 | `get_annual_summary` | 年度汇总：总销售额、订单数、客单价、月度趋势、品类占比、TOP 地区/商品、同比 | `year`: 4 位年份（默认 2025） |
| 3 | `query_products` | 按品类 / 关键字筛选商品 | `category`: 品类 ID（可选，如 c1）<br>`keyword`: 关键字（可选）<br>`limit`: 1-100（默认 20） |
| 4 | `query_orders` | 订单分页查询，可按地区 / 年份 / 品类过滤 | `region` / `year`(4 位年份) / `category`（均可选）<br>`page`: ≥1（默认 1）<br>`pageSize`: 1-100（默认 20） |
| 5 | `get_active_users` | 活跃用户排行（按消费金额），可按年份 / 地区过滤 | `year`: 4 位年份（可选）<br>`region`（可选）<br>`limit`: 1-50（默认 10） |

> 年份字段不再限制具体年份：`year` / `period` 接受任意 4 位年份，查不到数据的年份由数据服务返回空数组 / 0。

每个工具返回标准化 JSON 文本（`json.data` 部分），字段含义见 `../data-server` 源码 `data-server/src/data.ts`。

---

## 6. 远程部署（路线 A）

目标：把 MCP 能力通过**一个公网 URL** 提供给其它用户。核心是「Streamable HTTP + 反向代理 + 鉴权」，data-server 不暴露公网。

### 6.1 进程守护

用 `pm2` / `systemd` / 容器保活 mcp-server（HTTP 模式）。示例：

```bash
TRANSPORT=http PORT=8089 DATA_SERVER_URL=http://data-server:3000 MCP_TOKEN=secret123 pm2 start "npx tsx src/index.ts" --name ecommerce-mcp
```

### 6.2 反向代理 + HTTPS（nginx 示例）

见 `deploy/nginx.conf.example`：在 443 监听，对 `/mcp` 做 Bearer 校验并反代到 `127.0.0.1:8089/mcp`，关闭缓冲以支持 SSE 流式响应。把 `${MCP_TOKEN}` 替换为真实 token，`server_name` 改为你的域名。

### 6.3 容器化部署

- `Dockerfile`：以 `node:22-alpine` 运行 `npx tsx src/index.ts`，默认 `TRANSPORT=http`。
- `deploy/docker-compose.yml`：一键编排 `data-server` + `mcp-server`（mcp-server 经内网连 data-server），对外暴露 `8089`。生产请在前方再叠加 nginx。

```bash
# 在 mcp-server/ 目录
docker compose -f deploy/docker-compose.yml up -d --build
```

### 6.4 把地址交给其它用户

将 `https://你的域名/mcp` 与对应 `Bearer token` 发给协作者，他们在 WorkBuddy / Claude Desktop / 自研客户端填入远程 URL 即可使用，无需安装任何代码。

---

## 7. 调试与排错

- **HTTP 模式健康检查**：`GET /health` 返回 `{"ok":true,"transport":"http"}`。
- **工具调用报错 `数据服务返回 4xx/5xx`**：说明 `DATA_SERVER_URL` 指向的数据服务未启动或地址错误。先确认 `data-server` 在运行且 `GET /health` 返回 `{"code":0}`。
- **401 Unauthorized**：HTTP 模式设置了 `MCP_TOKEN`，但客户端未带正确 `Authorization: Bearer <token>`。
- **405 Method Not Allowed**：无状态（stateless）模式下 `/mcp` 仅接受 POST；客户端若用 GET 建立流会被拒绝（属正常，改用 POST 即可）。
- **想换数据源**：覆盖 `DATA_SERVER_URL` 即可，工具定义零改动。

---

## 8. 目录结构

```
mcp-server/
├── src/
│   ├── index.ts     # 入口：双传输选择（stdio / Streamable HTTP）+ 可选鉴权 + /mcp 路由
│   └── tools.ts     # 5 个 MCP 工具定义（两种传输共用）
├── deploy/
│   ├── nginx.conf.example   # 路线 A 反向代理 + Bearer 鉴权示例
│   └── docker-compose.yml   # data-server + mcp-server 编排
├── Dockerfile       # 路线 A 容器镜像
├── package.json     # 依赖 @modelcontextprotocol/sdk、express、zod；脚本 tsx / tsc
├── tsconfig.json
└── README.md        # 本文档
```
