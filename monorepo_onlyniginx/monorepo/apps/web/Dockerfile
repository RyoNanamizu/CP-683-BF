FROM node:20-slim AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.option.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN corepack enable
RUN pnpm install --frozen-lockfile
RUN pnpm -r build

FROM nginx:alpine

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
