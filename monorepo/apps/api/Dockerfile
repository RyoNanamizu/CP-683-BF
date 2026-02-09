FROM node:20-slim AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.option.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN npm --global install pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm -r build

FROM node:20-slim

WORKDIR /app

COPY --from=builder /app .

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "dist/server.js"]
