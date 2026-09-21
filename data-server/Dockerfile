# data-server/Dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src

ENV DATA_SERVER_PORT=3000
EXPOSE 3000

CMD ["npx", "tsx", "src/server.ts"]
