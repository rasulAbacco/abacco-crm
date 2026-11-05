# Deploying on Hostinger

## Which Hostinger product

Use a **Hostinger VPS** (KVM plan, Ubuntu 22.04 or 24.04).

This CRM needs PostgreSQL, Redis and an always-running background worker that sends the campaign emails. A VPS gives you root access to run all of them. Shared / web hosting plans are made for websites, not for these services.

| VPS size | Fits |
|---|---|
| KVM 2 (2 vCPU, 8 GB RAM) | **Recommended** — comfortable for 2,000+ emails/day and growth |
| KVM 1 (1 vCPU, 4 GB RAM) | Works for one user and light use; builds are slower |

Everything runs in Docker with one command. HTTPS certificates are automatic.

```
Internet ──443──▶  web (Caddy: HTTPS + React app)
                     ├── /api, /t, /u, /webhooks ──▶ api (Express)
                     │                                  │
                  worker (sends emails, automations) ───┤
                                                        ├── postgres (data, volume pgdata)
                                                        └── redis (queues, volume redisdata)
```

Only ports 22 (SSH), 80 and 443 are open. PostgreSQL and Redis are not reachable from the internet.

---

## 1. Point your domain to the VPS

In your DNS (Hostinger hPanel → Domains → DNS, or wherever the domain is managed):

| Type | Name | Value |
|---|---|---|
| A | `crm` (for crm.yourdomain.com) | your VPS IP address |

Wait until `ping crm.yourdomain.com` shows the VPS IP (usually minutes, up to a few hours).

## 2. Prepare the server (once)

```bash
ssh root@YOUR_VPS_IP
git clone https://github.com/rasulAbacco/abacco-crm.git /opt/abacco-crm
cd /opt/abacco-crm
bash deploy/scripts/setup-vps.sh
```

This installs Docker, enables the firewall (SSH, HTTP, HTTPS only) and adds swap on small plans.

> Private repository? Create a GitHub *deploy key* or *fine-grained token* with read access and use it for `git clone`.

## 3. Create the settings file (once)

```bash
bash deploy/scripts/generate-env.sh
```

It asks for your domain and an email (for HTTPS certificate notices). It then writes `.env` with strong random passwords and keys, and prints a one-time **SETUP_TOKEN**.

**Back up `ENCRYPTION_KEYS` from `.env`** (password manager). Without it, saved SMTP passwords cannot be decrypted.

Optional — password-reset emails: edit `.env` and fill `SYSTEM_SMTP_HOST`, `SYSTEM_SMTP_USER`, `SYSTEM_SMTP_PASS`, `SYSTEM_MAIL_FROM` (for example a Gmail app password or Zoho mailbox).

```bash
nano .env
```

## 4. Deploy

```bash
bash deploy/scripts/deploy.sh
```

The first build takes a few minutes. It:
1. builds the images,
2. runs database migrations (the `migrate` container),
3. starts the API, the worker and the web server,
4. gets the HTTPS certificate automatically.

Open `https://crm.yourdomain.com`.

## 5. Create your account (once)

Either open `https://crm.yourdomain.com/setup` and enter the SETUP_TOKEN, or:

```bash
bash deploy/scripts/create-admin.sh "Abacco Technology" "Admin" admin@abaccotech.com
```

Then remove the token: set `SETUP_TOKEN=` (empty) in `.env` and run `docker compose up -d`.

## 6. First steps in the app

1. **Sales IDs** → open SID-001 → **Edit** → add *Sender legal name* and *Sender postal address* (required before sending).
2. **SMTP accounts** → add your mailboxes → tick the Sales IDs → **Test**.
3. **Settings → Countries & compliance** → review consent rules and business hours.
4. **Email lists** → add or import contacts.
5. **Campaigns** → New campaign → **Send test** → Review → Send.

---

## Updating to a new version

Push your changes to GitHub, then on the server:

```bash
cd /opt/abacco-crm
bash deploy/scripts/deploy.sh
```

Migrations run automatically. The worker finishes the emails it is sending before it restarts.

## Backups

```bash
bash deploy/scripts/backup.sh                     # writes backups/abacco_crm_<date>.sql.gz, keeps 14
```

Daily automatic backup at 02:30 (server time):

```bash
crontab -e
# add this line:
30 2 * * * cd /opt/abacco-crm && bash deploy/scripts/backup.sh >> backups/backup.log 2>&1
```

Also download backups regularly (e.g. `scp root@VPS:/opt/abacco-crm/backups/*.sql.gz .`) and enable Hostinger's VPS snapshots.

Restore (replaces all data):

```bash
bash deploy/scripts/restore.sh backups/abacco_crm_20261105_023000.sql.gz
```

## Everyday commands

| What | Command (in `/opt/abacco-crm`) |
|---|---|
| Status | `docker compose ps` |
| API logs | `docker compose logs -f api` |
| Sending logs | `docker compose logs -f worker` |
| Restart everything | `docker compose restart` |
| Stop / start | `docker compose down` / `docker compose up -d` |
| Health | `curl https://crm.yourdomain.com/ready` |
| Database shell | `docker compose exec postgres psql -U abacco abacco_crm` |
| Reset a password | `docker compose run --rm -it api node scripts/resetPassword.js --email you@x.com` |

`docker compose down -v` **deletes all data** (volumes). Never use `-v` unless you mean it.

## Troubleshooting

| Problem | Fix |
|---|---|
| Browser shows a certificate error | DNS not pointing to the VPS yet, or port 80/443 blocked. Check `docker compose logs web`. |
| `deploy.sh` says API not healthy | `docker compose logs migrate api` — usually a wrong value in `.env`. |
| Campaign stays at "Sending", nothing sent | `docker compose logs worker`; check the SMTP account status (Test it). |
| Build stops with "killed" | Not enough RAM — `setup-vps.sh` adds swap; or use a bigger plan. |
| Changed `.env` | `docker compose up -d` (recreates containers with the new values). |

## Email deliverability (important at 2,000/day)

- Gmail personal ≈ 500 recipients/day, Google Workspace ≈ 2,000/day per mailbox. Set each SMTP account's limits to your real plan; the system never exceeds them and never rotates accounts to get around limits.
- For your own domain: publish **SPF**, **DKIM** and **DMARC** records (your mail provider shows the values). Gmail and Yahoo require them for bulk senders, plus one-click unsubscribe (built in) and a spam-complaint rate below 0.3%.
- Amazon SES: subscribe an SNS topic to `https://crm.yourdomain.com/webhooks/ses` for bounces/complaints (see README).

## Security notes

- `.env` is created with permission 600 and is git-ignored. Never commit it.
- Keep Ubuntu updated: `apt update && apt upgrade` monthly.
- Use SSH keys for root login and disable password SSH login in Hostinger's VPS panel when possible.
- Encryption key rotation: add `2:<new key>` to `ENCRYPTION_KEYS`, set `ENCRYPTION_ACTIVE_KEY_VERSION=2`, run `docker compose up -d`, then re-enter each SMTP password (Edit → new password). Remove the old key only afterwards.
