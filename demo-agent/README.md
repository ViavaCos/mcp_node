# demo-agent — LLM Agent 演示

演示「使用者可以通过 MCP 服务基于那 5 个接口做任意事情」。

脚本以 **MCP 客户端** 身份通过 **Streamable HTTP** 接入 `mcp-server`，并用两种方式调用其工具：

1. **真实 Agent 模式**（配置 `LLM_API_KEY` 后）：把 5 个 MCP 工具作为 function calling 工具交给大模型，由模型自主决定调用哪些工具、传什么参数，回答问题。
2. **脚本化降级模式**（未配置密钥）：无需任何 LLM 密钥，直接编排 5 个工具回答 5 个预设分析问题，证明「基于接口可以做任意分析」。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MCP_HTTP_URL` | `http://localhost:8089/mcp` | MCP 服务（Streamable HTTP）地址 |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容接口地址（可指向任意兼容服务） |
| `LLM_API_KEY` | 空 | 设置后走真实 Agent 模式；空则走脚本化降级 |
| `LLM_MODEL` | `gpt-4o-mini` | 大模型名称 |

## 安装与启动

```bash
cd demo-agent
npm install
npm start            # tsx 运行 src/index.ts
npm run typecheck    # 类型校验
```

启动前请确保 **data-server** 与 **mcp-server(HTTP 模式)** 已运行。

### 脚本化降级（默认，无需密钥）

```bash
npm start
```

会依次用 5 个工具回答 5 个问题（品类排行 / 年度汇总 / 商品筛选 / 活跃用户 / 年度对比），并以条形图文本展示。

### 真实 Agent 模式（配置密钥）

```bash
export LLM_API_KEY=sk-xxxx
export LLM_BASE_URL=https://your-compatible-endpoint/v1   # 可选
npm start -- "2025 年哪个品类最畅销，和 2024 比如何？"
```

脚本把工具列表交给模型，模型自动发起 `tool_calls`，脚本再调用对应 MCP 工具并回传结果，循环最多 6 轮直至模型给出最终回答。

## 5 个预设分析问题（降级模式）

| # | 问题 | 使用工具 |
|---|---|---|
| 1 | 2025 年哪些品类最畅销？ | `get_sales_ranking`（category/2025） |
| 2 | 2025 年度整体表现如何？ | `get_annual_summary`（2025） |
| 3 | 想上架「手机」类新品，现有商品有哪些？ | `query_products`（c1/手机） |
| 4 | 华南地区 2025 的头部客户是谁？ | `get_active_users`（2025/华南） |
| 5 | 2024 vs 2025，华东地区订单量变化？ | `query_orders`（华东/2024 + 2025） |

## 依赖

- 运行时：`@modelcontextprotocol/sdk`
- 开发：`@types/node`、`tsx`、`typescript`

## 目录结构

```
demo-agent/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts    # MCP 客户端 + LLM 工具调用循环 / 脚本化降级
```
