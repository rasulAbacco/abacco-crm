#!/usr/bin/env bash
# First deploy and every update: pull the latest code, rebuild, migrate, restart.
# Usage:  bash deploy/scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

[ -f .env ] || { echo "Missing .env — run deploy/scripts/generate-env.sh first."; exit 1; }

if [ -d .git ]; then
  echo "==> Pulling latest code"
  git pull --ff-only
fi

echo "==> Building images"
docker compose build

echo "==> Starting (migrations run automatically before the API and worker start)"
docker compose up -d --remove-orphans

echo "==> Waiting for the API to become healthy"
for i in $(seq 1 40); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q api)" 2>/dev/null || echo starting)
  [ "$status" = "healthy" ] && break
  sleep 3
done
docker compose ps
[ "${status:-}" = "healthy" ] || { echo "API is not healthy yet. Check: docker compose logs api migrate"; exit 1; }

docker image prune -f >/dev/null
DOMAIN=$(grep ^DOMAIN= .env | cut -d= -f2)
echo
echo "Deployed: https://${DOMAIN}"
echo "First time? Open https://${DOMAIN}/setup (or run deploy/scripts/create-admin.sh)."
