# ── Stage 1: Build the React frontend ────────────────────────────────────────
FROM oven/bun:1.3.9 AS web-builder

# Install web dependencies directly (bypass workspace resolution issues)
WORKDIR /app/packages/web
COPY packages/web/package.json ./
RUN bun install

# Copy web source and build (outDir is ../api/public relative to packages/web)
COPY packages/web ./
RUN mkdir -p /app/packages/api/public && bun run build
# Output lands in ../api/public (configured in vite.config.ts outDir)

# ── Stage 2: Production API image ─────────────────────────────────────────────
FROM oven/bun:1.3.9-alpine AS runner

WORKDIR /app/packages/api

# rclone for cloud backup support (S3, SFTP, Proton Drive, Google Drive, etc.)
RUN apk add --no-cache rclone tar

# Install API production dependencies directly (no workspace root needed)
COPY packages/api/package.json ./
RUN bun install --production

# Copy API source and config
COPY packages/api/src ./src
COPY packages/api/drizzle.config.ts ./
COPY packages/api/tsconfig.json ./
COPY packages/api/drizzle ./drizzle

# Copy built web assets from previous stage
COPY --from=web-builder /app/packages/api/public ./public

ENV NODE_ENV=production

EXPOSE 3001

CMD ["sh", "-c", "bun run src/db/migrate.ts && bun run src/index.ts"]
