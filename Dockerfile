# sendm8 in one container: the Worker runs in workerd (Cloudflare's open-source runtime) with D1 and R2
# stored under /data. See docs/self-hosting.md#docker for settings, backups and what's different.
#
#   docker build -t sendm8 .
#   docker run -p 8787:8787 -v sendm8-data:/data --env-file sendm8.env sendm8

ARG NODE_VERSION=22.23.4

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
# Dependencies first, so code changes don't reinstall them.
COPY package.json package-lock.json .npmrc ./
COPY worker/package.json worker/
COPY packages/shared/package.json packages/shared/
COPY packages/react/package.json packages/react/
COPY web/package.json web/package-lock.json web/.npmrc web/
RUN npm ci --no-audit --no-fund && npm ci --prefix web --no-audit --no-fund
COPY . .
RUN npm run build:web

FROM node:${NODE_VERSION}-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8787
# workerd needs CA certificates for outgoing HTTPS (Resend, OAuth, webhooks).
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json /app/wrangler.jsonc ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/worker ./worker
COPY --from=build /app/packages ./packages
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/docker ./docker
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "docker/server.mjs"]
