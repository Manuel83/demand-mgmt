# syntax=docker/dockerfile:1
# Ein Container: Next.js (Port 3000) + PocketBase (intern, Port 8090)

ARG NODE_VERSION=22
ARG PB_VERSION=0.40.5

# ---------- 1. Abhaengigkeiten ----------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2. Next.js-Build ----------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Der Browser erreicht PocketBase ueber den Rewrite /pb (siehe next.config.mjs)
ENV NEXT_PUBLIC_PB_URL=/pb \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- 3. PocketBase-Binary ----------
FROM alpine:3.20 AS pocketbase
ARG PB_VERSION
ARG TARGETARCH
RUN apk add --no-cache unzip wget \
 && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
 && unzip -q /tmp/pb.zip -d /pb \
 && chmod +x /pb/pocketbase

# ---------- 4. Laufzeit ----------
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    PB_DATA_DIR=/data/pb_data

COPY --from=pocketbase /pb/pocketbase /usr/local/bin/pocketbase
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Seed-Skript + dessen einzige Abhaengigkeit
COPY --from=deps /app/node_modules/pocketbase ./node_modules/pocketbase
COPY scripts/seed.mjs ./scripts/seed.mjs
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /data/pb_data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/login || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
