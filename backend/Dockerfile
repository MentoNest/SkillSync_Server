# syntax=docker/dockerfile:1

# ── Base: install dependencies once and reuse them in every stage ─────────────
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

# ── Development: hot reload via compose volume mounts ─────────────────────────
FROM base AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ── Builder: compile TypeScript into dist/ ────────────────────────────────────
FROM base AS builder
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ── Production: runtime dependencies + compiled output only ──────────────────
FROM base AS production
ENV NODE_ENV=production
RUN npm prune --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Run as the unprivileged user provided by node:alpine.
USER node
CMD ["node", "dist/main"]
