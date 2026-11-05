#!/usr/bin/env bash
# Creates the production .env with strong random secrets.
# Usage:  bash deploy/scripts/generate-env.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ -f .env ]; then echo ".env already exists — edit it instead (or delete it first)."; exit 1; fi

read -rp "Domain for the CRM (e.g. crm.abaccotech.com): " DOMAIN
read -rp "Email for HTTPS certificate notices: " ACME_EMAIL

hex() { openssl rand -hex "$1"; }
cat > .env <<ENV
DOMAIN=${DOMAIN}
ACME_EMAIL=${ACME_EMAIL}
POSTGRES_PASSWORD=$(hex 24)
REDIS_PASSWORD=$(hex 24)
JWT_ACCESS_SECRET=$(hex 48)
ENCRYPTION_KEYS=1:$(openssl rand -base64 32)
ENCRYPTION_ACTIVE_KEY_VERSION=1
SETUP_TOKEN=$(hex 24)
SYSTEM_SMTP_HOST=
SYSTEM_SMTP_PORT=587
SYSTEM_SMTP_SECURE=false
SYSTEM_SMTP_USER=
SYSTEM_SMTP_PASS=
SYSTEM_MAIL_FROM="Abacco CRM <no-reply@${DOMAIN}>"
LOG_LEVEL=info
WORKER_SEND_CONCURRENCY=4
SES_SNS_TOPIC_ARNS=
ENV
chmod 600 .env

echo
echo "Created .env (readable only by you)."
echo "IMPORTANT: copy ENCRYPTION_KEYS somewhere safe — without it saved SMTP passwords cannot be read."
echo "Your one-time SETUP_TOKEN is: $(grep ^SETUP_TOKEN= .env | cut -d= -f2)"
echo "Optional: fill SYSTEM_SMTP_* in .env so password-reset emails work."
echo "Next: bash deploy/scripts/deploy.sh"
