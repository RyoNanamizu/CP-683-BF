FROM node:20-slim
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.option.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN corepack enable && pnpm install --frozen-lockfile

EXPOSE 5173
CMD ["pnpm", "--filter", "@repo/web", "dev", "--host", "0.0.0.0", "--port", "5173"]
