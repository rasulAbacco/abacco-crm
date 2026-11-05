# Abacco Sales CRM + Email Marketing CRM

One primary account, many **Sales IDs** (independent sales workspaces) with isolated data, controlled sharing and transfers, a full Sales CRM, and an email-marketing system with a background sending engine.

## What is included

| Area | Features |
|---|---|
| Sales IDs | Create, edit, activate/deactivate, default, delete (with record transfer), switcher (persists), per-Sales-ID statistics, consolidated view |
| Sharing & transfer | Share records view-only or editable, revoke, bulk share; transfer with history, notes kept, optional cascade (tasks, deals, contacts), concurrent-safe |
| Leads | CRUD, search, filters, sort, paging, bulk status/delete/share/transfer, CSV/Excel import & export, duplicate detection, scoring, tags, convert to contact + company + deal, timeline |
| Contacts / Companies | CRUD, import/export (contacts), company links, consent records, GDPR/DPDP erasure, email history, list memberships |
| Deals | Kanban board with drag & drop, list view, custom stages (add/rename/reorder/delete), multi-currency amounts entered manually |
| Tasks | Follow-ups linked to any record, list + calendar view, reminders (in-app notifications), overdue view, bulk complete |
| Dashboard & reports | All figures from the database; date / source filters; charts; Sales ID comparison; CSV/Excel export |
| SMTP accounts | Gmail, Zoho, Yahoo, Rediffmail, Amazon SES, custom; AES-256-GCM encrypted credentials; connection test; per-hour/day rolling limits; Sales ID assignment; sending logs |
| Email lists | Lists per Sales ID, add people, add by segment (country / tags), import/export, suppression list, unsubscribe history |
| Templates | Visual + HTML editor, personalisation (`{{firstName\|there}}`), sandboxed preview, shared or per-Sales-ID |
| Campaigns | 6-step builder, segments, test send, immediate / fixed time / **recipient local time**, business hours & holidays per country, pitch price (manual), pause / resume / cancel / unschedule / retry failed / duplicate, live progress, analytics |
| Sending engine | BullMQ + Redis workers, Postgres as source of truth, atomic claim (no double send), rate limits, retries with backoff, SMTP failover, auto-pause when no usable account, crash recovery, graceful shutdown |
| Tracking | Opens (estimated), clicks (no open redirect), RFC 8058 one-click unsubscribe, SMTP hard bounces, Amazon SES bounce/complaint/delivery via SNS (signature-verified), event de-duplication |
| Automations | Triggers: lead created, lead status changed, contact created, list joined, manual. Steps: send email, wait, create task, update lead field. Idempotent step runs, execution log |
| Compliance | Legal footer + unsubscribe in every email, consent required per country (EU/UK, Canada, India, Australia by default), account-wide suppression, erasure keeps a hashed block |
| Security | argon2id passwords, 15-min JWT + rotating httpOnly refresh cookie with reuse detection, lockout, CSRF header check, Zod validation, Helmet, rate limits, audit log, secrets redacted from logs |

## Layout

```
abacco-crm/
├── backend/                 Node 22 · Express 5 · Prisma 7 · PostgreSQL 16 · Redis/BullMQ
│   ├── prisma/              schema.prisma (45 tables), migrations/, seed.js
│   ├── src/modules/         auth, account, sales-ids, sharing, audit, leads, contacts, companies,
│   │                        deals, tasks, notes-activities, tags, notifications, dashboard, reports,
│   │                        smtp-accounts, email-lists, templates, suppressions, campaign, tracking, automations
│   ├── src/queues/          queueRegistry.js, workerManager.js
│   ├── src/workers/         workerBootstrap.js  (separate process)
│   ├── src/services/        audit, cache, email, encryption, events, files, records
│   ├── tests/               integration + unit (51 tests)
│   └── Dockerfile           one image for the API, the worker and the migration job
├── frontend/                React 18 · Vite · Tailwind · Zustand · Axios · React Router · React Icons · Recharts
│   ├── src/pages/<module>/  each module keeps its pages, components/ and services/
│   ├── Caddyfile            web server: HTTPS, serves the app, forwards /api /t /u /webhooks to the API
│   └── Dockerfile           builds the app and packages it with Caddy
├── deploy/scripts/          setup-vps.sh, generate-env.sh, deploy.sh, create-admin.sh, backup.sh, restore.sh
├── docs/                    API.md, DEPLOYMENT.md (Hostinger VPS guide)
├── e2e/smoke.cjs            browser smoke test (Playwright)
├── docker-compose.yml       PRODUCTION stack: web, api, worker, migrate, postgres, redis
├── docker-compose.dev.yml   LOCAL DEVELOPMENT: postgres, redis, mailpit
└── .env.example             production settings (copy to .env on the server)
```

## Deploy on Hostinger (VPS)

```bash
ssh root@YOUR_VPS_IP
git clone https://github.com/rasulAbacco/abacco-crm.git /opt/abacco-crm && cd /opt/abacco-crm
bash deploy/scripts/setup-vps.sh      # Docker + firewall (once)
bash deploy/scripts/generate-env.sh   # asks your domain, creates .env with secrets (once)
bash deploy/scripts/deploy.sh         # build + start; run again for every update
```

Then open `https://YOUR_DOMAIN/setup`. Full step-by-step guide: `docs/DEPLOYMENT.md`.

## Run locally

Requirements: Node 22+, Docker.

```bash
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL, Redis, Mailpit (mail UI: http://localhost:8025)

cd backend
cp .env.example .env                       # fill JWT_ACCESS_SECRET and ENCRYPTION_KEYS (commands are in the file)
npm install
npm run migrate:deploy
npm run create-admin -- --account "Abacco Technology" --name "Admin" --email admin@gmail.com
npm run dev                                # API  → http://localhost:4000
npm run worker:dev                         # in a second terminal: sending engine, automations, reminders

cd ../frontend
npm install
npm run dev                                # app → http://localhost:5173
```

For safe local testing, add an SMTP account pointing at Mailpit: host `localhost`, port `1025`, encryption **None**, any username/password. Nothing leaves your machine. Do not send real bulk email while testing.

### Tests

```bash
cd backend && npm test        # 51 tests against abacco_crm_test (runner refuses DBs without "test" in the name)
cd frontend && npm run build  # production build
node e2e/smoke.cjs            # with API + web running; see the header of the file
```

The campaign tests run a real SMTP conversation against a local fake server and cover: each recipient sent exactly once under concurrent workers, no resend after a crash, pause/resume/cancel, rate-limit waiting, auth-failure pause, hard bounce + suppression, one-click unsubscribe, SES complaint de-duplication, timezone scheduling and automation runs.

### Database changes

```bash
npm run migrate:dev -- --name describe_change   # development
npm run migrate:deploy                          # production (runs automatically in the migrate container)
```

## Known limitations (honest list)

- **Design:** your original CRM design was never received (the uploaded HTML was only the Gemini page wrapper), so the UI uses a clean enterprise design of its own. Colours and spacing are Tailwind tokens in `frontend/tailwind.config.js` and `src/index.css`, so restyling is straightforward once the design files arrive.
- **Bounces:** detected from SMTP rejections and Amazon SES events. Reading bounce emails from a mailbox (IMAP) is not implemented, so asynchronous bounces from Gmail/Zoho/Yahoo/Rediffmail are not captured.
- **Gmail OAuth2:** supported for sending, but you paste the client ID, secret and refresh token; there is no in-app "Sign in with Google" flow. App passwords work out of the box.
- **Automations:** no date-based trigger yet; leads/contacts created by CSV import do not trigger automations.
- **Holidays and custom fields** exist in the database and are used by scheduling / accepted by the API, but there is no screen to manage them yet.
- **Not yet verified** against real Gmail, Zoho, Yahoo, Rediffmail or SES accounts, or on a Hostinger VPS itself (the production setup was run locally without Docker Hub access: same commands, Caddy config and production dependencies) — everything was run locally (Postgres 16, Redis 7, fake SMTP, headless Chrome). Do a small real-world pilot before the first large campaign.
- Request rate limiting uses in-memory storage: fine for one API instance; switch to a Redis store before running several.

See `docs/API.md` for endpoints and `docs/DEPLOYMENT.md` for hosting on Hostinger.
