# auth-server/Dockerfile
# 最小 OIDC 授权服务器（颁发访问令牌）
FROM node:22-alpine

WORKDIR /app

# 复制 lock 文件并用 npm ci 安装，保证镜像内依赖版本与本地一致
# （运行期用 tsx 直接执行 TS，故不能省略 devDependencies）
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src

ENV AUTH_PORT=9000
# RS256 密钥持久化目录（建议以卷挂载，避免每次重建都换密钥）
RUN mkdir -p /app/data
ENV AUTH_KEYS_PATH=/app/data/keys.json
EXPOSE 9000

# 用 tsx 直接运行 TS，无需构建步骤
CMD ["npx", "tsx", "src/server.ts"]
