# Deploying on Render

Sized for one primary user and about 2,000 emails per day.

## Services

| Render service | Purpose | Plan (starting point) |
|---|---|---|
| `abacco-api` — Web Service (Node) | REST API | Starter |
| `abacco-db` — Render Postgres 16 | Source of truth | Basic-256mb (grow to Basic-1gb if needed) |
| `abacco-redis` — Key Value | BullMQ queues, rate counters, cache | Starter, **maxmemory policy `noeviction`** |
| `abacco-worker` — Background Worker | Campaign dispatch & sending, automations, reminders | Starter |
| `abacco-web` — Static Site | React app, `/api/*` rewritten to the API | Free |

All in **one region** (Singapore is closest to India) so they talk over the private network. Region cannot be changed later.

Why `noeviction`: with an eviction policy such as `allkeys-lru`, Redis may delete queued jobs under memory pressure. Postgres stays the source of truth for campaign recipients, so nothing is lost permanently, but jobs would have to be re-queued.

Why paid Key Value: the free plan does not persist data across restarts.

## First deploy

1. Push the repository to GitHub.
2. Render dashboard → **New → Blueprint** → choose the repo. Render reads `render.yaml`.
3. Fill the `sync: false` variables when prompted:
   - `ENCRYPTION_KEYS` — `1:` + output of `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Store a copy safely; losing it makes saved SMTP passwords unreadable.**
   - `SETUP_TOKEN` — a long random string (remove after setup).
   - `APP_URL` — the frontend URL; `API_PUBLIC_URL` — the API URL (used in tracking and unsubscribe links); `CORS_ORIGINS` — the frontend URL.
   - `SYSTEM_SMTP_*`, `SYSTEM_MAIL_FROM` — a mailbox for password-reset emails.
4. Each deploy runs `npx prisma migrate deploy && node prisma/seed.js` before the new version starts. A failed migration stops the deploy and the old version keeps running.
5. Create the primary account, either:
   - Render Shell on `abacco-api`: `npm run create-admin -- --account "Abacco Technology" --name "Admin" --email you@abacco.com`, or
   - `POST /api/v1/auth/setup` with `SETUP_TOKEN` (or the Setup screen at /setup in the web app).
   Then delete `SETUP_TOKEN` from the environment.
6. Check `https://<api>/ready`.

## Cookies and domains

The refresh cookie is `SameSite=Strict`. `*.onrender.com` subdomains count as **different sites**, so the browser would not send the cookie from `abacco-web.onrender.com` to `abacco-api.onrender.com`. Either:

- **Recommended:** the static site rewrites `/api/*` to the API (already in `render.yaml` — change the destination host if your API URL differs), so the browser only talks to one origin; or
- use custom domains on one site, e.g. `crm.abaccotech.com` and `api.abaccotech.com`.

Only if neither is possible, set `COOKIE_SAMESITE=none` (the `X-Requested-With` header check still blocks CSRF).

## Email sending at 2,000 per day

- Split volume across the Sales IDs' own SMTP accounts within each provider's limits; the engine never rotates accounts to get around a limit.
- Gmail: personal accounts are limited to roughly 500 recipients a day and Workspace accounts to about 2,000, and both need an app password (2-Step Verification) or OAuth.
- Amazon SES is the best fit for bulk campaigns: verify the sending domain, set up SPF, DKIM and DMARC, and leave the SES sandbox before sending to real recipients.
- Gmail and Yahoo require SPF, DKIM and DMARC, one-click unsubscribe, and a spam-complaint rate under 0.3% for bulk senders.

## Operations

- Logs: JSON lines with a request id; passwords, tokens, cookies and SMTP credentials are redacted.
- Backups: Render Postgres paid plans include point-in-time recovery; test a restore once.
- Encryption key rotation: add `2:<new key>`, set `ENCRYPTION_ACTIVE_KEY_VERSION=2`, redeploy both API and worker, then re-enter each SMTP password (Edit → new password) so it is re-encrypted with the new key. Remove the old key only after that.
- Scaling the API beyond one instance: move the rate limiter to the Redis store first.

## After the first deploy

1. Open the web app → **Setup** (or use the Render shell command above) → create the account, then remove `SETUP_TOKEN`.
2. **Sales IDs** → open each one → Edit → add the sender legal name and postal address (campaigns refuse to send without them).
3. **SMTP accounts** → add accounts → assign them to Sales IDs → **Test** each one.
4. **Settings → Countries & compliance** → review the consent rules and business hours per country.
5. Import contacts into an **Email list**, ideally with a consent basis.
6. Send a **test email** from a campaign, then a small real campaign before larger ones.

## Amazon SES events (bounces, complaints, deliveries)

1. In SES, create a configuration set or identity notifications for **Bounce**, **Complaint** and **Delivery** to an SNS topic.
2. Add an HTTPS subscription to the topic: `https://<API_PUBLIC_URL>/webhooks/ses`. The API verifies the SNS signature and confirms the subscription automatically.
3. Optionally set `SES_SNS_TOPIC_ARNS` to the topic ARN so only that topic is accepted.
4. Enable "include original headers" so events match on the `X-Abacco-Recipient` header (Message-ID matching is the fallback).

## Worker behaviour

- The dispatcher runs every 15 seconds: it starts due scheduled campaigns, queues due recipients (500 per campaign per pass), recovers stuck rows and completes finished campaigns.
- Sending concurrency is `WORKER_SEND_CONCURRENCY` (default 4). Throughput is bounded by your SMTP limits, not by the worker.
- If the worker stops during a send, that recipient is marked **FAILED (unknown outcome)** rather than resent; use **Retry failed** if you accept a possible duplicate.
- On deploy, Render sends SIGTERM; the worker finishes current jobs before exiting.
