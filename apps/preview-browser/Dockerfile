FROM node:22-slim AS base

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Install dependencies
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/preview-browser/package.json ./apps/preview-browser/
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Install Playwright browsers
RUN npx playwright install chromium

# Build
COPY apps/preview-browser/ ./apps/preview-browser/
COPY tsconfig.base.json ./
RUN pnpm --filter @orka/preview-browser build

EXPOSE 4002
ENV PORT=4002
CMD ["node", "apps/preview-browser/dist/server.js"]
