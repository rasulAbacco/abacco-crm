# Abacco CRM backend image — used for the API, the background worker and the
# one-off migration job (same image, different command; see docker-compose.yml).
FROM node:22-bookworm-slim

# OpenSSL is required by Prisma's migration engine.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    TZ=UTC \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Dependencies first (better layer caching). `prisma generate` runs in postinstall;
# it needs a syntactically valid URL but never connects at build time.
COPY package.json package-lock.json prisma.config.js ./
COPY prisma ./prisma
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm ci --omit=dev \
 && npm cache clean --force

COPY src ./src
COPY scripts ./scripts

RUN chown -R node:node /app
USER node

EXPOSE 4000
CMD ["node", "src/server.js"]
