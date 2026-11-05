# Abacco CRM web image: builds the React app, then serves it with Caddy, which
# also terminates HTTPS (automatic Let's Encrypt certificates) and forwards
# /api, /t, /u and /webhooks to the API container.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM caddy:2.10-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
