# auth-server — 最小 OIDC 授权服务器

基于 **Node.js + Express + TypeScript + jose** 的最小 OIDC / OAuth 2.1 授权服务器。
它只做一件事：**颁发**访问令牌（JWT，RS256 签名）。校验令牌是 mcp-server 的职责——两者是分离的 OAuth 角色。

> ⚠️ 定位说明：这是为演示与本地联调而写的「最小」实现，**不是生产级 AS**。
> 它省略了用户登录页、同意页、refresh token、令牌撤销（`/revoke`）、introspection、持久化客户端注册等。
> 生产请使用 Keycloak / Casdoor / Auth0 / Entra ID 等成熟实现。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `AUTH_PORT` | `9000` | 监听端口 |
| `AUTH_ISSUER` | `http://localhost:9000` | **issuer**，须与令牌 `iss`、客户端发现到的地址完全一致 |
| `RESOURCE_URL` | `http://localhost:8089/mcp` | 受保护的 MCP 资源地址，令牌默认 `aud`（RFC 8707 的 resource） |
| `AUTH_TOKEN_TTL` | `300` | 访问令牌有效期（秒） |
| `AUTH_KEYS_PATH` | `auth-server/keys.json` | RS256 密钥对持久化路径（首次启动生成，勿提交版本库） |
| `AUTH_SCOPES` | `mcp:tools mcp:admin` | 支持的 scope 列表 |
| `AUTH_CLIENT_ID` / `AUTH_CLIENT_SECRET` | `demo-client` / `demo-secret` | 演示机密客户端凭据 |
| `AUTH_APIKEYS_PATH` | `auth-server/apikeys.json` | API key 存储路径（仅存哈希，勿提交版本库） |
| `AUTH_ADMIN_TOKEN` | `admin-secret` | 管理端点（`/admin/apikeys`）保护令牌；demo-admin 与 auth-server 须一致，生产请设强令牌 |

服务显式监听 `0.0.0.0`（便于容器 / 反向代理访问）。

## 安装与启动

```bash
cd auth-server
npm install
npm start            # tsx 直接运行 src/server.ts，监听 9000
npm run typecheck    # tsc --noEmit
```

首次启动会生成 RS256 密钥对并写入 `keys.json`（权限 0600）。
启动成功日志：`[auth-server] 最小 OIDC 授权服务器已启动: http://localhost:9000`

## 端点

| 端点 | 说明 |
|---|---|
| `GET /.well-known/openid-configuration` | OIDC 发现文档（`issuer` / `jwks_uri` / `token_endpoint` / `code_challenge_methods_supported: ["S256"]`） |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 授权服务器元数据（内容同上） |
| `GET /jwks` | RS256 公钥集，供资源服务器验签 |
| `GET /authorize` | 授权码端点（**强制 PKCE S256**），授权响应携带 RFC 9207 的 `iss` |
| `POST /token` | 令牌端点：`client_credentials` 与 `authorization_code`；**方案 B 额外支持用 API key 兑换 JWT**（见下） |
| `POST /admin/apikeys` | 管理：创建 API key（返回原始 key 一次，需 admin token） |
| `GET /admin/apikeys` | 管理：列出 API key（可按 `?owner=` 过滤，需 admin token） |
| `DELETE /admin/apikeys/:keyId` | 管理：吊销 API key（需 admin token） |
| `GET /health` | 健康检查，返回 `issuer` 与 `resource` |

行为要点：

- **CORS**：对白名单内的 `Origin` 回显 `Access-Control-Allow-Origin`（不使用通配符）并附 `Vary: Origin`；`OPTIONS` 预检直接返回 `204`。白名单默认由已注册客户端的 `redirect_uri` 来源派生，可用 `AUTH_CORS_ORIGINS` 覆盖。
- **禁缓存**：`/token` 响应带 `Cache-Control: no-store` 与 `Pragma: no-cache`（RFC 6749 §5.1）。
- **授权码**：单次使用（仅在全部校验通过后才消费），60 秒过期，且写入新码前会清理过期条目，避免内存无界增长。

## 客户端与 scope

| client_id | 类型 | 可用流程 | 默认 scope |
|---|---|---|---|
| `demo-client`（默认） | 机密（`client_secret_basic` / `post`） | `client_credentials` + `authorization_code` | 全部 |
| `public-spa` | 公共（无 secret） | 仅 `authorization_code` + PKCE | 全部 |

支持的 scope：`mcp:tools`（MCP 工具访问必需）、`mcp:admin`。

## 取令牌示例

**① client_credentials（M2M，演示默认走这条）**

```bash
curl -s -X POST http://localhost:9000/token \
  -u demo-client:demo-secret \
  -d 'grant_type=client_credentials' \
  -d 'scope=mcp:tools' \
  -d 'resource=http://localhost:8089/mcp'
```

**② authorization_code + PKCE（S256）**

```bash
verifier=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
challenge=$(printf '%s' "$verifier" | openssl dgst -binary -sha256 | openssl base64 | tr '+/' '-_' | tr -d '=')

# 授权请求（302 重定向到 redirect_uri，Location 中带 code 与 iss）
curl -si "http://localhost:9000/authorize?client_id=demo-client&redirect_uri=http://localhost:5173/callback&response_type=code&scope=mcp:tools&code_challenge=$challenge&code_challenge_method=S256"

# 用授权码换令牌
curl -s -X POST http://localhost:9000/token \
  -u demo-client:demo-secret \
  -d 'grant_type=authorization_code' \
  -d "code=<上一步的 code>" \
  -d 'redirect_uri=http://localhost:5173/callback' \
  -d "code_verifier=$verifier"
```

令牌响应：`{ "access_token": "...", "token_type": "Bearer", "expires_in": 300, "scope": "mcp:tools" }`
令牌载荷（JWT claims）：`iss` / `sub` / `aud`（= `RESOURCE_URL`）/ `exp` / `nbf` / `iat` / `scope` / `client_id` / `jti`。

## 方案 B：API key（每个调用方一个稳定、可吊销的凭证）

为「多用户 / 多集成方」场景设计：每个调用方（用户 / 团队）向管理员申请一个 API key，用它**兑换**短命 JWT 后访问 MCP 资源。线上跑的仍是 RS256 短命 JWT（资源服务器无状态校验不变），API key 只是「可申请 / 可吊销」的长期凭证——兼顾 Open API 式的「申请 key 即用」体验与 JWT 的安全属性（短 TTL、自描述 scope、无状态校验）。

- 管理：由 `demo-admin`（端口 4100）调用本服务的 `/admin/apikeys`，或手工：
  ```bash
  # 创建（owner=alice，scope=mcp:tools，30 天有效）。rawKey 仅返回一次！
  curl -s -X POST http://localhost:9000/admin/apikeys \
    -H 'Authorization: Bearer admin-secret' -H 'Content-Type: application/json' \
    -d '{"owner":"alice","name":"数据看板","scopes":"mcp:tools","ttlSeconds":2592000}'
  # 列出 / 吊销
  curl -s http://localhost:9000/admin/apikeys -H 'Authorization: Bearer admin-secret'
  curl -s -X DELETE http://localhost:9000/admin/apikeys/<keyId> -H 'Authorization: Bearer admin-secret'
  ```
- 调用方用 key 兑换 JWT（两种方式等价）：
  ```bash
  # 方式一：client_id=__apikey__ + client_secret=key（兼容 SDK 的 ClientCredentialsProvider）
  curl -s -X POST http://localhost:9000/token \
    -u '__apikey__:mcp_xxxx' \
    -d 'grant_type=client_credentials&scope=mcp:tools&resource=http://localhost:8089/mcp'

  # 方式二：body 中直接带 api_key
  curl -s -X POST http://localhost:9000/token \
    -d 'grant_type=client_credentials&api_key=mcp_xxxx&scope=mcp:tools&resource=http://localhost:8089/mcp'
  ```
  兑换出的 JWT 其 `sub` = key 的 `owner`（如 `alice`），以此在资源服务器端区分不同调用方。
- 安全要点：存储仅保存 key 的 sha256 哈希，原始 key 不在服务端落库；key 可随时吊销；scope 受该 key 自身权限约束（不能申请超出自身范围的 scope）。

## 目录结构

```
auth-server/
├── package.json
├── tsconfig.json
├── keys.json          # 首次启动自动生成（已加入 .gitignore）
├── Dockerfile
└── src/
    ├── config.ts      # issuer / resource / 注册客户端 / scope / API key 变量
    ├── keys.ts        # RS256 密钥对生成、持久化、JWKS
    ├── pkce.ts        # PKCE(S256) 校验与常量时间比较
    ├── tokens.ts      # JWT 访问令牌颁发
    ├── apikeys.ts     # 方案 B：API key 存储（创建 / 查找 / 列出 / 吊销，仅存哈希）
    └── server.ts      # 发现文档 / JWKS / authorize / token / API key 兑换 + 管理端点
```

## 与其它服务的关系

```
demo-dashboard / demo-agent  ──取令牌──▶  auth-server:9000（颁发）
        │                                        ▲
        └──Bearer JWT──▶ mcp-server:8089（校验，JWKS 拉公钥）
                                  │
                                  └──▶ data-server:3000（取数）
```
