#!/usr/bin/env bash
# Restores a backup made by backup.sh. THIS REPLACES ALL CURRENT DATA.
# Usage:  bash deploy/scripts/restore.sh backups/abacco_crm_YYYYMMDD_HHMMSS.sql.gz
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f "${1:-}" ] || { echo "Usage: restore.sh <backup file>"; exit 1; }
read -rp "This deletes all current CRM data and restores $1. Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || exit 1
docker compose stop api worker
docker compose exec -T postgres psql -U abacco -d postgres -c "DROP DATABASE IF EXISTS abacco_crm WITH (FORCE);" -c "CREATE DATABASE abacco_crm OWNER abacco;"
gunzip -c "$1" | docker compose exec -T postgres psql -U abacco -d abacco_crm -q
docker compose up -d
echo "Restored."
