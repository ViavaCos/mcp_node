# mcp-server — 电商销售 MCP 服务

基于官方 [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) 实现的 MCP 服务，采用 **stdio 传输**。它将上游 `data-server`（电商销售 REST 服务）的 5 个查询接口封装为 5 个 MCP 工具，使任意 MCP 客户端（WorkBuddy、Claude Desktop、自定义脚本等）都能基于这些接口「做任意事情」——查询排行榜、生成年度汇总、看板取数等。

> 架构关系：`MCP 客户端` ⇄（stdio）⇄ `mcp-server` ⇢（HTTP）⇢ `data-server:3000`
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
npm start          # 以 stdio 方式启动，等待 MCP 客户端连接
```

启动成功后会在 **stderr** 输出一行提示（stdio 模式下 stdout 已被协议占用，调试信息只能走 stderr）：

```
[mcp-server] ecommerce-mcp 已通过 stdio 启动，等待客户端连接
```

---

## 3. 环境变量

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `DATA_SERVER_URL` | `http://localhost:3000` | 上游 data-server 的基址。若数据服务部署在别的地址/端口，请覆盖此变量。 |

示例：

```bash
DATA_SERVER_URL=http://127.0.0.1:3000 npm start
```

---

## 4. 接入 MCP 客户端

mcp-server 使用 stdio 传输，因此所有客户端都通过「启动本地 Node 进程」的方式接入。核心配置字段（JSON）如下，各客户端只是把这串配置放到自己的配置文件里：

```json
{
  "mcpServers": {
    "ecommerce-mcp": {
      "command": "node",
      "args": ["/绝对路径/mcp_node/mcp-server/src/index.js"],
      "env": {
        "DATA_SERVER_URL": "http://localhost:3000"
      }
    }
  }
}
```

> ⚠️ `args` 中的路径必须是 **mcp-server/src/index.js** 的绝对路径（或你机器上已 `npm install` 过的副本），否则客户端找不到入口脚本。建议先 `cd mcp-server && npm install` 再把真实路径填入。

### 4.1 接入 WorkBuddy

1. 打开左侧栏 **连接器 / Connectors** → 自定义 MCP。
2. 新增一条 stdio 配置，填入上面的 JSON（命令 `node`，参数为 `src/index.js` 绝对路径）。
3. 点击 **信任 / Trust** 启用该服务。
4. 之后在对话中即可直接调用下列 5 个工具。

### 4.2 接入 Claude Desktop

编辑配置文件 `claude_desktop_config.json`（macOS 路径：`~/Library/Application Support/Claude/claude_desktop_config.json`），加入上面的 JSON 片段后重启 Claude Desktop。

### 4.3 在自定义脚本中接入

本项目 `demo-dashboard/server.js` 与 `demo-agent/src/index.js` 已内置 MCP 客户端逻辑（使用 `@modelcontextprotocol/sdk` 的 `Client` + `StdioClientTransport`），可直接参考：启动本 mcp-server 子进程 → 列出工具 → 调用工具。

---

## 5. 提供的工具（Tools）

服务名：`ecommerce-mcp` / 版本：`1.0.0`

| # | 工具名 | 说明 | 参数 |
|---|---|---|---|
| 1 | `get_sales_ranking` | 销售额排行榜，维度：商品 / 品类 / 地区 | `type`: product\|category\|region<br>`period`: 2024\|2025\|all（默认 all）<br>`limit`: 1-50（默认 10） |
| 2 | `get_annual_summary` | 年度汇总：总销售额、订单数、客单价、月度趋势、品类占比、TOP 地区/商品、同比 | `year`: 2024\|2025（默认 2025） |
| 3 | `query_products` | 按品类 / 关键字筛选商品 | `category`: 品类 ID（可选，如 c1）<br>`keyword`: 关键字（可选）<br>`limit`: 1-100（默认 20） |
| 4 | `query_orders` | 订单分页查询，可按地区 / 年份 / 品类过滤 | `region` / `year`: 2024\|2025 / `category`（均可选）<br>`page`: ≥1（默认 1）<br>`pageSize`: 1-100（默认 20） |
| 5 | `get_active_users` | 活跃用户排行（按消费金额），可按年份 / 地区过滤 | `year`: 2024\|2025（可选）<br>`region`（可选）<br>`limit`: 1-50（默认 10） |

每个工具返回标准化 JSON 文本（`json.data` 部分），字段含义见 `../data-server` 对应的接口文档 / 源码 `data-server/src/data.js`。

---

## 6. 调试与排错

- **日志位置**：stdio 模式下 stdout 专用于协议消息，所有日志打印到 **stderr**。调试时请观察 stderr（客户端通常以「服务日志」形式展示）。
- **工具调用报错 `数据服务返回 4xx/5xx`**：说明 `DATA_SERVER_URL` 指向的数据服务未启动或地址错误。先确认 `data-server` 在运行且 `GET /health` 返回 `{"code":0}`。
- **客户端找不到脚本**：检查 JSON 配置里 `args` 路径是否为绝对路径，且对应目录已执行 `npm install`。
- **想换数据源**：覆盖 `DATA_SERVER_URL` 即可，无需改动本服务代码。只要目标服务保持相同的 5 个 REST 接口契约，mcp-server 可无缝切换。

---

## 7. 目录结构

```
mcp-server/
├── src/index.js     # MCP 服务入口：5 个工具定义 + stdio 连接
├── package.json     # 依赖 @modelcontextprotocol/sdk、zod
└── README.md        # 本文档
```
