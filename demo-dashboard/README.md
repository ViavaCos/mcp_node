# demo-dashboard — Web 看板演示

基于 **Node.js + Express + TypeScript + Chart.js** 的看板应用，演示「如何使用 MCP 工具做出一个真实的东西」。

后端的身份是 **MCP 客户端**：通过 **Streamable HTTP** 接入 `mcp-server`，把 5 个 MCP 工具编排成看板所需的聚合数据，再以 HTTP 接口暴露给前端页面；前端用 Chart.js 渲染图表，并附一个「工具试玩面板」可任意调用 5 个工具。

## 工作原理

```
浏览器 ──HTTP──▶ demo-dashboard(server.ts)
                      │ 作为 MCP 客户端
                      ▼ StreamableHTTPClientTransport
                 mcp-server(:8089/mcp) ──HTTP──▶ data-server(:3000)
```

后端在启动时即与 MCP 服务建立连接，之后每个看板请求并行调用多个 MCP 工具取数。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DASHBOARD_PORT` | `4000` | 看板服务监听端口 |
| `MCP_HTTP_URL` | `http://localhost:8089/mcp` | MCP 服务（Streamable HTTP）地址 |

> 若 MCP 服务不是默认 `8089`（如本机 `8089` 被占用），用 `PORT=8090 npm start` 起 MCP 后，这里设 `MCP_HTTP_URL=http://127.0.0.1:8090/mcp`。

## 安装与启动

```bash
cd demo-dashboard
npm install
npm start            # tsx 运行 server.ts，监听 4000
npm run typecheck    # 类型校验
```

启动前请确保 **data-server** 与 **mcp-server(HTTP 模式)** 已运行。

打开浏览器访问 `http://localhost:4000` 即可看到看板。

## 功能

- **销售看板**：商品 TOP10、品类占比、月度销售趋势、地区排行、活跃用户排行（Chart.js 图表）。
- **工具试玩面板**：在前端任意填写工具名与参数，直接调用 5 个 MCP 工具之一，返回原始 JSON，便于验证每个工具的能力。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/` | 看板静态页面 |
| `GET` | `/api/dashboard` | 一次性编排 5 个 MCP 工具，返回完整看板数据 |
| `GET` | `/api/tool/:name` | 试玩接口：`:name` 为工具名，参数走 query string（数字自动转 number） |

`/api/dashboard` 固定编排：
- `get_sales_ranking` × 3（product/all/10、category/all/8、region/all/5）
- `get_annual_summary`（2025）
- `get_active_users`（2025/10）

## 依赖

- 运行时：`@modelcontextprotocol/sdk`、`express`
- 开发：`@types/express`、`@types/node`、`tsx`、`typescript`
- 前端：Chart.js（通过 `public/index.html` 的 CDN 引入，无需安装）

## 目录结构

```
demo-dashboard/
├── package.json
├── tsconfig.json
├── server.ts            # 后端：MCP 客户端 + 聚合接口 + 静态托管
└── public/
    └── index.html       # 看板页面（Chart.js 图表 + 工具试玩面板）
```
