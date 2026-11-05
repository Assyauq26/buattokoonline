FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
FROM base AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && node node_modules/@prisma/engines/scripts/postinstall.js
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=1024" UV_THREADPOOL_SIZE=2 MALLOC_ARENA_MAX=2
RUN npm run build

# Migration/bootstrap tools are never exposed as a network service.
FROM build AS tools
USER node
ENTRYPOINT []
CMD ["npm", "run", "db:migrate"]

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=512" UV_THREADPOOL_SIZE=2 MALLOC_ARENA_MAX=2
COPY --from=build --chown=node:node /app ./
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
