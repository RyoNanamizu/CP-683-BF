FROM node:20-slim
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.option.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN npm --global install pnpm && pnpm install --frozen-lockfile && pnpm run build

EXPOSE 3000
CMD ["pnpm", "--filter", "@repo/api", "start"]
