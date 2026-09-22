# data-server/Dockerfile
FROM node:22-alpine

WORKDIR /app

# better-sqlite3 是原生模块：alpine 下需要编译工具链（musl 无预编译包时）
RUN apk add --no-cache python3 make g++

# 复制 lock 文件并用 npm ci 安装，保证镜像内依赖版本与本地一致
# （运行期用 tsx 直接执行 TS，故不能省略 devDependencies）
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src

# SQLite 数据文件目录（建议以卷挂载持久化）
RUN mkdir -p /app/data
ENV DATA_SERVER_PORT=3000
ENV SQLITE_PATH=/app/data/data.sqlite
EXPOSE 3000

CMD ["npx", "tsx", "src/server.ts"]
