#!/bin/sh
# Container entry point: builds DATABASE_URL / REDIS_URL / public URLs from
# DOMAIN + passwords (so a GUI compose file only needs each secret once),
# then starts the requested role.   Usage: container-start.sh migrate|api|worker
set -e
: "${DATABASE_URL:=postgresql://abacco:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-postgres}:5432/abacco_crm}"
: "${REDIS_URL:=redis://:${REDIS_PASSWORD}@${REDIS_HOST:-redis}:6379}"
if [ -n "$DOMAIN" ]; then
  : "${APP_URL:=https://$DOMAIN}"
  : "${API_PUBLIC_URL:=https://$DOMAIN}"
  : "${CORS_ORIGINS:=https://$DOMAIN}"
fi
export DATABASE_URL REDIS_URL APP_URL API_PUBLIC_URL CORS_ORIGINS

case "$1" in
  migrate) npx prisma migrate deploy && exec node prisma/seed.js ;;
  api)     export SERVICE_NAME=abacco-api;    exec node src/server.js ;;
  worker)  export SERVICE_NAME=abacco-worker; exec node src/workers/workerBootstrap.js ;;
  *) echo "usage: container-start.sh migrate|api|worker"; exit 1 ;;
esac