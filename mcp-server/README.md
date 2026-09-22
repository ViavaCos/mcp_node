# mcp-server — 电商销售 MCP 服务

基于官方 [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) 实现的 MCP 服务（TypeScript）。它把上游 `data-server`（电商销售 REST 服务）的 5 个查询接口封装为 5 个 MCP 工具，使任意 MCP 客户端都能基于这些接口「做任意事情」——查询排行榜、生成年度汇总、看板取数等。

**双传输支持**：通过 `TRANSPORT` 环境变量切换

- `stdio`（本地调试）：标准输入输出，供本地 MCP 客户端直接 spawn 子进程。按规范要求，**stdio 传输不走 OAuth**，凭据由本地环境提供。
- `http`（**路线 A 默认**，远程部署）：**Streamable HTTP**，暴露 `http://<host>:<PORT>/mcp`，可被远程客户端通过 URL 接入并提供地址给其它用户。

**鉴权模型（OAuth 2.1）**：HTTP 模式下，本服务扮演 **OAuth 2.1 资源服务器（resource server）**：

- 它**不颁发**令牌，只**校验**令牌（JWKS 验签 + 校验 `iss` / `aud` / `exp` / `scope`）；
- 令牌由独立的 **授权服务器（Authorization Server）** 颁发，见 [`../auth-server`](../auth-server)；
- 通过 RFC 9728 元数据端点向客户端公布授权服务器地址，并在 401/403 中给出 `WWW-Authenticate` 挑战。

> 架构关系（路线 A）：
> ```
> 客户端 ──取令牌──▶ auth-server:9000（颁发）
>    │                      ▲
>    └──Bearer JWT──▶ mcp-server:8089/mcp（校验）──▶ data-server:3000（取数）
> ```
> mcp-server 自身无状态，所有数据均实时取自 data-server。

---

## 1. 前置条件

mcp-server 通过 HTTP 调用 `data-server`（端口 `3000`）；启用鉴权时还需一个可达的授权服务器。

```bash
# 终端 A：先启动数据服务（详见 ../data-server）
cd ../data-server && npm install && npm start      # http://localhost:3000

# 终端 B：启动授权服务器（详见 ../auth-server）
cd ../auth-server && npm install && npm start      # http://localhost:9000
```

> **启动顺序**：data-server / auth-server 就绪后再启动 mcp-server。mcp-server 启动时会尝试发现授权服务器元数据；若发现失败会回退到 `AUTH_JWKS_URL` 并打印告警（不会阻断启动）。

---

## 2. 安装与启动

```bash
# 终端 C
cd mcp-server
npm install
npm start          # 默认 Streamable HTTP（TRANSPORT=http + AUTH_MODE=jwt）
```

启动日志：

```
[mcp-server] OAuth 2.1 资源服务器已启用：issuer=http://localhost:9000 resource=http://localhost:8089/mcp
[mcp-server]   JWKS=http://localhost:9000/jwks；必需 scope=mcp:tools；PRM=http://localhost:8089/.well-known/oauth-protected-resource/mcp
[mcp-server] ecommerce-mcp 已通过 Streamable HTTP 启动: http://0.0.0.0:8089/mcp
```

本地 stdio 调试（不鉴权）：

```bash
TRANSPORT=stdio npm start
```

本地免鉴权调试 HTTP（**仅限本机，切勿对外**）：

```bash
AUTH_MODE=none npm start     # 启动时会打印不安全告警
```

---

## 3. 环境变量

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `TRANSPORT` | `http` | 传输方式：`http`（Streamable HTTP，路线 A）或 `stdio`（本地调试） |
| `PORT` | `8089` | HTTP 模式监听端口，端点为 `http://<host>:<PORT>/mcp` |
| `DATA_SERVER_URL` | `http://localhost:3000` | 上游 data-server 的基址 |
| `AUTH_MODE` | `jwt` | `jwt`（校验 Bearer JWT，规范要求）或 `none`（关闭鉴权，仅本地调试） |
| `AUTH_ISSUER` | `http://localhost:9000` | 授权服务器 issuer，须与令牌 `iss` 一致（RFC 9207） |
| `RESOURCE_URL` | `http://localhost:8089/mcp` | 本服务的对外资源地址，即令牌 `aud`（RFC 8707 的 `resource`） |
| `AUTH_JWKS_URL` | `${AUTH_ISSUER}/jwks` | JWKS 地址；容器内网部署时可指向内网地址 |
| `AUTH_REQUIRED_SCOPES` | `mcp:tools` | 访问工具所需的 scope（空格分隔） |

示例：

```bash
TRANSPORT=http PORT=8089 DATA_SERVER_URL=http://127.0.0.1:3000 \
  AUTH_ISSUER=http://localhost:9000 RESOURCE_URL=http://localhost:8089/mcp npm start
```

---

## 4. 鉴权（OAuth 2.1）详解

### 4.1 本服务对外提供的鉴权端点

| 端点 | 说明 |
|---|---|
| `GET /.well-known/oauth-protected-resource` | RFC 9728 受保护资源元数据（根路径回退） |
| `GET /.well-known/oauth-protected-resource/mcp` | 同上，路径感知形式（推荐） |
| `GET /health` | 健康检查（不鉴权） |

元数据内容示例：

```json
{
  "resource": "http://localhost:8089/mcp",
  "authorization_servers": ["http://localhost:9000"],
  "scopes_supported": ["mcp:tools"],
  "bearer_methods_supported": ["header"],
  "resource_name": "ecommerce-mcp"
}
```

### 4.2 挑战与错误语义

| 场景 | 状态码 | `WWW-Authenticate` |
|---|---|---|
| 未携带令牌 | `401` | `Bearer resource_metadata="…", scope="mcp:tools"` |
| 令牌无效/过期/audience 不符 | `401` | `Bearer resource_metadata="…", error="invalid_token", scope="mcp:tools"` |
| 令牌有效但缺少 scope | `403` | `Bearer resource_metadata="…", error="insufficient_scope", scope="mcp:tools"` |

### 4.3 校验项

`jwtVerify` 固定算法 `RS256`，并校验：

1. 签名（从 `jwks_uri` 拉取公钥，自动按 `kid` 缓存与刷新）
2. `iss` = `AUTH_ISSUER`
3. `aud` = `RESOURCE_URL`（拒绝「发给别人的令牌」）
4. `exp` / `nbf`
5. `scope` 覆盖 `AUTH_REQUIRED_SCOPES`

---

## 5. 接入 MCP 客户端

### 5.1 远程接入（路线 A，推荐）

启动时用 `TRANSPORT=http`，对外暴露 `https://你的域名/mcp`。**客户端需先取得令牌**（OAuth 2.1），再带 `Authorization: Bearer <JWT>` 调用。

支持 OAuth 的客户端（含 `@modelcontextprotocol/sdk` ≥1.30）会自动完成：`401` 挑战 → RFC 9728 元数据发现 → 授权服务器发现 → 取令牌 → 重试。手写配置时也可显式带令牌：

```json
{
  "mcpServers": {
    "ecommerce-mcp": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer <用授权服务器换取的 JWT>" }
    }
  }
}
```

> 令牌是**短期**的（默认 300s），手写静态令牌仅适合临时调试；生产应使用支持 OAuth 的客户端自动续期。

### 5.2 本地 stdio 接入

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

> ⚠️ `args` 必须是 `mcp-server/src/index.ts` 的**绝对路径**，且先在 `mcp-server/` 执行过 `npm install`。

### 5.3 接入 WorkBuddy / Claude Desktop

- **WorkBuddy**：左侧栏 **连接器 / Connectors** → 自定义 MCP → 新增远程（URL）或 stdio 配置 → 点击 **信任 / Trust** 启用。
- **Claude Desktop**：编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`，加入 5.1 / 5.2 的片段后重启。

### 5.4 在自定义脚本中接入

`demo-dashboard/server.ts` 与 `demo-agent/src/index.ts` 展示了推荐写法（SDK 内置 OAuth 客户端）：

```ts
import { ClientCredentialsProvider } from '@modelcontextprotocol/sdk/client/auth-extensions.js';

const transport = new StreamableHTTPClientTransport(new URL('http://localhost:8089/mcp'), {
  // 未配置时传 {}，即不带令牌（对应服务端 AUTH_MODE=none）
  authProvider: new ClientCredentialsProvider({
    clientId: 'demo-client',
    clientSecret: 'demo-secret',
    scope: 'mcp:tools',
  }),
});
```

SDK 会自动完成元数据发现、取令牌（携 `resource` + `scope`）、401 重试。

---

## 6. 提供的工具（Tools）

服务名：`ecommerce-mcp` / 版本：`1.0.0`

| # | 工具名 | 说明 | 参数 |
|---|---|---|---|
| 1 | `get_sales_ranking` | 销售额排行榜，维度：商品 / 品类 / 地区 | `type`: product\|category\|region<br>`period`: 4 位年份(如 2023/2026)\|all（默认 all）<br>`limit`: 1-50（默认 10） |
| 2 | `get_annual_summary` | 年度汇总：总销售额、订单数、客单价、月度趋势、品类占比、TOP 地区/商品、同比 | `year`: 4 位年份（默认 2025） |
| 3 | `query_products` | 按品类 / 关键字筛选商品 | `category`: 品类 ID（可选，如 c1）<br>`keyword`: 关键字（可选）<br>`limit`: 1-100（默认 20） |
| 4 | `query_orders` | 订单分页查询，可按地区 / 年份 / 品类过滤 | `region` / `year`(4 位年份) / `category`（均可选）<br>`page`: ≥1（默认 1）<br>`pageSize`: 1-100（默认 20） |
| 5 | `get_active_users` | 活跃用户排行（按消费金额），可按年份 / 地区过滤 | `year`: 4 位年份（可选）<br>`region`（可选）<br>`limit`: 1-50（默认 10） |

> 年份字段不限制具体年份：`year` / `period` 接受任意 4 位年份，查不到数据的年份由数据服务返回空数组 / 0。

每个工具返回标准化 JSON 文本（`json.data` 部分），字段含义见 `../data-server` 源码 `data-server/src/data.ts`。

---

## 7. 远程部署（路线 A）

### 7.1 进程守护

```bash
TRANSPORT=http PORT=8089 DATA_SERVER_URL=http://data-server:3000 \
  AUTH_MODE=jwt AUTH_ISSUER=https://auth.example.com RESOURCE_URL=https://mcp.example.com/mcp \
  AUTH_JWKS_URL=http://auth-server:9000/jwks \
  pm2 start "npx tsx src/index.ts" --name ecommerce-mcp
```

### 7.2 反向代理 + HTTPS

见 `deploy/nginx.conf.example`：**鉴权已由 mcp-server 自身完成，nginx 只做 TLS 与转发**（不再比对令牌）。
采用两个域名：`mcp.example.com`（资源域，整站转发到 `127.0.0.1:8089`，以便 `/.well-known/…` 可达）与 `auth.example.com`（授权域，转发到 `127.0.0.1:9000`）。

### 7.3 容器化部署

`deploy/docker-compose.yml` 一键编排 `auth-server` + `data-server` + `mcp-server`：

```bash
cd mcp-server
docker compose -f deploy/docker-compose.yml up -d --build
```

- `auth-server`：发布 `9000`，RS256 密钥持久化在 `auth-keys` 卷；
- `data-server`：仅内网 `expose: 3000`，SQLite 持久化在 `data-sqlite` 卷；
- `mcp-server`：发布 `8089`，经内网访问 data-server；经 `AUTH_JWKS_URL` 内网拉取公钥，并经 `AUTH_DISCOVERY_URL` 内网完成 AS 元数据发现（使 issuer 镜像校验生效）。
- **生产加固**：不要用 `ports:` 直接对外暴露 `9000` / `8089`，应改由前置 nginx 终止 TLS 后转发（见 7.2），否则客户端可绕过 TLS 直连授权服务器与资源服务器。

### 7.4 把地址交给其它用户

1. 把 `https://mcp.example.com/mcp` 发给协作者；
2. 协作者用**支持 OAuth 的客户端**接入（自动发现 + 取令牌），或自行向 `https://auth.example.com` 换取令牌；
3. 若使用不支持 OAuth 的客户端，需由你代为发放短期令牌——**不建议**，短期令牌会很快过期。

---

## 8. 调试与排错

- **健康检查**：`GET /health` 返回 `{"ok":true,"transport":"http","authMode":"jwt","issuer":"…","resource":"…"}`。
- **`401 invalid_token`**：令牌缺失、过期、签名不匹配，或 `aud` 不是本服务的 `RESOURCE_URL`。
- **`403 insufficient_scope`**：令牌有效但 `scope` 未覆盖 `AUTH_REQUIRED_SCOPES`（默认 `mcp:tools`）。
- **启动告警「AS 元数据发现失败」**：`AUTH_ISSUER` 在容器内不可达（容器里的 `localhost` 指向容器自身）。会回退到 `AUTH_JWKS_URL`，服务仍能正常验签，但 **issuer 镜像校验被跳过**。建议设置 `AUTH_DISCOVERY_URL` 指向内网发现文档地址（如 `http://auth-server:9000/.well-known/openid-configuration`）以恢复该校验；实际公钥仍走显式配置的 `AUTH_JWKS_URL`（发现文档给出的是对外地址，容器内不可达）。
- **工具调用报错 `数据服务返回 4xx/5xx`**：`DATA_SERVER_URL` 指向的数据服务未启动或地址错误。
- **`405 Method Not Allowed`**：无状态模式下 `/mcp` 仅接受 POST（GET/DELETE 被拒绝属正常）。
- **想换数据源**：覆盖 `DATA_SERVER_URL` 即可，工具定义零改动。

---

## 9. 目录结构

```
mcp-server/
├── src/
│   ├── index.ts          # 入口：双传输选择 + OAuth 2.1 鉴权链 + /mcp 路由
│   ├── tools.ts          # 5 个 MCP 工具定义（两种传输共用）
│   └── auth/
│       ├── config.ts     # AUTH_MODE / issuer / resource / JWKS / 必需 scope
│       ├── metadata.ts   # RFC 9728 受保护资源元数据
│       └── verify.ts     # JWKS 验签 + iss/aud/exp/scope 校验
├── deploy/
│   ├── nginx.conf.example   # TLS 透传示例（鉴权在 mcp-server 内完成）
│   └── docker-compose.yml   # auth-server + data-server + mcp-server 编排
├── Dockerfile            # 路线 A 容器镜像
├── package.json          # 依赖 @modelcontextprotocol/sdk、express、jose、zod
├── tsconfig.json
└── README.md             # 本文档
```
