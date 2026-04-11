FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/mcp-gateway/package.json ./apps/mcp-gateway/
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Build
FROM deps AS build
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/mcp-gateway/ ./apps/mcp-gateway/
COPY tsconfig.base.json ./
RUN pnpm --filter @orka/shared-types build && \
    pnpm --filter @orka/mcp-gateway build

# Production image
FROM node:22-slim AS runner
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/mcp-gateway ./apps/mcp-gateway
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/package.json ./

EXPOSE 4001
ENV PORT=4001
CMD ["node", "apps/mcp-gateway/dist/server.js"]
