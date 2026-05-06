# ── Build stage ──────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Runtime stage ───────────────────────────────────────────────
FROM node:22-alpine

RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai
ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /build/.next/standalone ./
COPY --from=builder /build/.next/static ./.next/static
COPY --from=builder /build/public ./public

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
