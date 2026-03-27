# Crawler Worker for ARM64 (OCI Ampere A1)
FROM node:20-slim

# System deps for curl + Playwright Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    # Playwright Chromium dependencies
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libatspi2.0-0 libwayland-client0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.3 --activate

# Dependencies (cache layer) - need devDeps for prisma + tsx
COPY package.json pnpm-lock.yaml .npmrc* ./
COPY prisma ./prisma/
ENV NODE_ENV=development
RUN pnpm install --frozen-lockfile --ignore-scripts \
    && pnpm exec prisma generate \
    && pnpm exec playwright install chromium
ENV NODE_ENV=production

# Source code
COPY src ./src/
COPY tsconfig.json tsconfig.worker.json ./

EXPOSE 3001
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["pnpm", "run", "worker:crawler"]
