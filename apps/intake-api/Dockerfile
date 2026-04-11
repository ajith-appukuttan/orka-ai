FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/draft-schema/package.json ./packages/draft-schema/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/intake-api/package.json ./apps/intake-api/
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Build shared packages
FROM deps AS build
COPY packages/ ./packages/
COPY apps/intake-api/ ./apps/intake-api/
COPY tsconfig.base.json ./
RUN pnpm --filter @orka/shared-types build && \
    pnpm --filter @orka/draft-schema build && \
    pnpm --filter @orka/intake-api build

# Production image
FROM node:22-slim AS runner
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/intake-api ./apps/intake-api
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/package.json ./

EXPOSE 4000
ENV PORT=4000
CMD ["node", "apps/intake-api/dist/server.js"]
