# mcp-server/Dockerfile
# 以 Streamable HTTP 模式运行 MCP 服务（路线 A）
FROM node:22-alpine

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src

ENV TRANSPORT=http
ENV PORT=8089
# DATA_SERVER_URL / MCP_TOKEN 由运行环境（docker-compose / k8s）注入
EXPOSE 8089

# 用 tsx 直接运行 TS，无需构建步骤
CMD ["npx", "tsx", "src/index.ts"]
