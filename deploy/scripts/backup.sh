#!/usr/bin/env bash
# Compressed PostgreSQL backup into ./backups (keeps the last 14).
# Daily at 02:30:  crontab -e  →  30 2 * * * cd /opt/abacco-crm && bash deploy/scripts/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p backups
file="backups/abacco_crm_$(date -u +%Y%m%d_%H%M%S).sql.gz"
docker compose exec -T postgres pg_dump -U abacco -d abacco_crm --no-owner | gzip > "$file"
ls -1t backups/abacco_crm_*.sql.gz | tail -n +15 | xargs -r rm --
echo "Backup written: $file ($(du -h "$file" | cut -f1))"
echo "Copy backups off the server too (e.g. download them), and keep .env safe."
