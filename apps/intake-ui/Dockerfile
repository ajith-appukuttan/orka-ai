FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/draft-schema/package.json ./packages/draft-schema/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/intake-ui/package.json ./apps/intake-ui/
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Build
FROM deps AS build
COPY packages/ ./packages/
COPY apps/intake-ui/ ./apps/intake-ui/
COPY tsconfig.base.json ./
RUN pnpm --filter @orka/shared-types build && \
    pnpm --filter @orka/draft-schema build && \
    pnpm --filter @orka/intake-ui build

# Serve with nginx
FROM nginx:alpine AS runner
COPY --from=build /app/apps/intake-ui/dist /usr/share/nginx/html
COPY apps/intake-ui/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
