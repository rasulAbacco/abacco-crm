#!/usr/bin/env bash
# Creates the primary account from the terminal (alternative to the /setup page).
# Usage:  bash deploy/scripts/create-admin.sh "Abacco Technology" "Admin" admin@abaccotech.com
set -euo pipefail
cd "$(dirname "$0")/../.."
[ $# -eq 3 ] || { echo 'Usage: create-admin.sh "<account name>" "<your name>" <email>'; exit 1; }
docker compose run --rm -it api node scripts/createAdmin.js --account "$1" --name "$2" --email "$3"
