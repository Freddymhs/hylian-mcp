FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate \
    && addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS production
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 3000
USER appuser
CMD ["node", "dist/main.js"]
