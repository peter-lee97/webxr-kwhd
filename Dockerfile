# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: production runner ─────────────────────────────────────────────────
FROM node:24-alpine3.22 AS runner

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled bundle and runtime files
COPY --from=builder /app/dist ./dist
COPY dashboard.html ./
COPY server.js ./

# Captures directory – mount a host volume here to persist screenshots
VOLUME ["/app/captures"]

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
