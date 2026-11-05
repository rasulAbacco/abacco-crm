#!/usr/bin/env bash
# One-time preparation of a fresh Hostinger VPS (Ubuntu 22.04 / 24.04).
# Installs Docker, opens only SSH/HTTP/HTTPS in the firewall and adds swap on small plans.
# Usage (as root):  bash deploy/scripts/setup-vps.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run as root (or with sudo)."; exit 1; fi

echo "==> Updating packages"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
docker compose version >/dev/null || { echo "Docker Compose plugin missing"; exit 1; }

echo "==> Firewall: allow SSH, HTTP, HTTPS only"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# Building the images needs memory; add 2 GB swap on plans with < 4 GB RAM.
if [ "$(free -m | awk '/Mem:/ {print $2}')" -lt 4000 ] && ! swapon --show | grep -q /swapfile; then
  echo "==> Adding 2 GB swap"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Done. Next: cd into the project folder and run  bash deploy/scripts/generate-env.sh"
