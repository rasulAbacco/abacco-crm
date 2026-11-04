# Abacco CRM API (v1)

Base URL: `/api/v1`. Every response uses one envelope:

```json
{ "success": true, "data": { }, "meta": { "page": 1, "pageSize": 25, "total": 3, "totalPages": 1 } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Some fields are invalid.", "details": [ { "path": "email", "message": "Invalid email" } ], "requestId": "…" } }
```

## Conventions

| Item | Rule |
|---|---|
| Auth | `Authorization: Bearer <accessToken>` (15 min). Refresh token is an httpOnly cookie `abacco_rt`, path `/api/v1/auth`. |
| Sales ID scope | `X-Sales-Id: all` (default) or a Sales ID uuid. Unknown or foreign Sales IDs → `403 SALES_ID_FORBIDDEN`. |
| Cookie endpoints | `POST /auth/refresh`, `/auth/logout`, `/auth/change-password` need `X-Requested-With: XMLHttpRequest`. |
| Lists | `?page=1&pageSize=25` (max 100), `?sort=-createdAt`, `?q=text`. |
| Money | Integer minor units as a **string** (`"1250000"` = ₹12,500.00) plus a 3-letter `currency`. Different currencies are never summed. |
| Time | ISO-8601 UTC (`2026-11-04T09:30:00.000Z`). Convert for display with the user's / Sales ID's timezone. |
| Not yours | Records outside your scope answer `404`, so their existence is not revealed. |
| Request id | Every response has `X-Request-Id`; quote it when reporting a problem. |

Common error codes: `UNAUTHORIZED`, `TOKEN_EXPIRED` (refresh and retry), `VALIDATION_ERROR` (422), `NOT_FOUND`, `DUPLICATE` (409), `READ_ONLY_SHARE`, `NOT_OWNER`, `SALES_ID_INACTIVE`, `RATE_LIMITED` (429).

---

## Auth

### POST /auth/setup — first run only
Enabled only while `SETUP_TOKEN` is set and no user exists.
```json
// request
{ "setupToken": "…", "accountName": "Abacco Technology", "name": "Admin", "email": "admin@abacco.com", "password": "Str0ngPassword" }
// 201
{ "success": true, "data": { "accessToken": "eyJ…", "user": { "id": "…", "email": "admin@abacco.com", "name": "Admin" } } }
```
Creates the account, the user, Sales ID **SID-001** (default) with a 7-stage pipeline, and editable country profiles.

### POST /auth/login
```json
{ "email": "admin@abacco.com", "password": "Str0ngPassword" }
```
`200` → `{ accessToken, user }` + `Set-Cookie: abacco_rt=…; HttpOnly; SameSite=Strict`.
`401 INVALID_CREDENTIALS` (same message for unknown email or wrong password). `423 ACCOUNT_LOCKED` after 5 failures (15 min).

### POST /auth/refresh
Cookie only. Rotates the refresh token. Replaying an old token after the 10-second grace window ends every session in that login (`401 REFRESH_REUSED`).

### POST /auth/logout
Body `{ "allSessions": true }` optional. `204`.

### POST /auth/forgot-password
`{ "email": "…" }` → always `200` with the same message. Sends a link valid for 30 minutes.

### POST /auth/reset-password
`{ "token": "<from link>", "password": "NewPassw0rd" }` → `200`. Signs out all sessions.

### POST /auth/change-password
`{ "currentPassword": "…", "newPassword": "…" }` → `200` with a fresh session; other sessions end.

### GET /auth/me · PATCH /auth/me
`PATCH` body: `{ "name"?, "timezone"?: "Asia/Kolkata", "locale"?: "en-IN" }`.

Password rule: at least 10 characters with letters and a number.

---

## Account settings

| Method | Path | Body |
|---|---|---|
| GET | `/account` | — |
| PUT | `/account` | `{ name?, defaultCurrency?: "INR", defaultTimezone?: "Asia/Kolkata", defaultLocale?: "en-IN", legalName?, postalAddress? }` |
| GET | `/account/countries` | — |
| PUT | `/account/countries/:code` | `{ name, defaultTimezone, legalRegime: GDPR\|UK_GDPR\|CASL\|CAN_SPAM\|DPDP\|SPAM_ACT\|OTHER, requiresPriorConsent, businessHoursStart: "09:00", businessHoursEnd: "18:00", businessDays: [1,2,3,4,5], currency?, notes? }` |
| DELETE | `/account/countries/:code` | — |

---

## Sales IDs

Account-level; not filtered by `X-Sales-Id`.

### GET /sales-ids
Query: `q`, `status=ACTIVE|INACTIVE`, `includeStats=true|false` (default true), `sort=code|-createdAt|name|status`.
```json
{
  "success": true,
  "data": [{
    "id": "a0e1…", "code": "SID-001", "name": "Sales ID 001", "status": "ACTIVE", "isDefault": true,
    "defaultCurrency": null, "defaultTimezone": null,
    "stats": {
      "leads": 120, "contacts": 85, "companies": 40, "openDeals": 12, "wonDeals": 5, "lostDeals": 3, "winRate": 62.5,
      "pipelineValue": [{ "currency": "INR", "amountMinor": "450000000" }, { "currency": "USD", "amountMinor": "1200000" }],
      "wonRevenue": [{ "currency": "INR", "amountMinor": "90000000" }],
      "openTasks": 9, "overdueTasks": 2, "campaigns": 4, "emailLists": 3, "smtpAccounts": 2, "sharedWithMe": 1, "sharedByMe": 6
    }
  }],
  "meta": { "page": 1, "pageSize": 25, "total": 1, "totalPages": 1 }
}
```

### GET /sales-ids/options
Every live Sales ID (id, code, name, status, isDefault, color) for the header switcher.

### POST /sales-ids
```json
{ "name": "USA Outbound", "description": "US enterprise", "defaultCurrency": "USD", "defaultTimezone": "America/New_York",
  "senderLegalName": "Abacco Technology Pvt Ltd", "senderPostalAddress": "…", "color": "#2563eb", "isDefault": false }
```
`201` with the Sales ID. Codes are assigned in order (`SID-002`, `SID-003`, …) and never reused. Names are unique per account (`409 DUPLICATE`).

### GET /sales-ids/:id
Sales ID + `settings` + `stats` + assigned `smtpAccounts`.

### PUT /sales-ids/:id
Any create field, plus `settings: { businessHoursStart, businessHoursEnd, businessDays, emailFooterHtml }`.

### PATCH /sales-ids/:id/status
`{ "status": "ACTIVE" | "INACTIVE" }`. The default Sales ID cannot be deactivated; a Sales ID with scheduled/sending campaigns cannot be deactivated. Inactive Sales IDs stay readable but cannot receive new records, shares or transfers.

### POST /sales-ids/:id/default
Makes it the default (exactly one default per account).

### DELETE /sales-ids/:id
```json
{ "confirmCode": "SID-002", "transferToId": "<Sales ID that receives the records>" }
```
- `400 CONFIRMATION_REQUIRED` if `confirmCode` is not the Sales ID's code.
- `409 TRANSFER_TARGET_REQUIRED` with `details.counts` when it still owns records and no target is given.
- `409 TRANSFER_DUPLICATES` with the clashing contact emails / company names / list names; nothing changes.
- `200 { deleted, transferredTo, moved: { lead, contact, company, deal, task, emailList, emailTemplate, campaign, automation } }`. Transfer history is written for every moved lead, contact, company and deal.

---

## Sharing and transfer

`:entity` is `leads`, `contacts`, `companies` or `deals`. Scoped by `X-Sales-Id`. Only the owning Sales ID (or the All view) may share, revoke or transfer.

### GET /records/:entity/:id/shares
```json
{ "owner": { "id": "…", "code": "SID-001" }, "yourAccess": "OWNER",
  "active": [{ "id": "…", "permission": "READ", "targetWorkspace": { "code": "SID-002" } }], "revoked": [] }
```
`yourAccess`: `ACCOUNT` (All view), `OWNER`, `COLLABORATE` (can edit) or `READ`.

### POST /records/:entity/:id/shares
```json
{ "targetWorkspaceIds": ["…", "…"], "permission": "READ" }
```
Returns one result per target with `outcome`: `shared`, `reshared`, `permission_changed` or `already_shared`. Never creates a duplicate share.

### PATCH /records/:entity/:id/shares/:targetWorkspaceId
`{ "permission": "COLLABORATE" }`

### DELETE /records/:entity/:id/shares/:targetWorkspaceId
Revokes access (kept as history).

### POST /records/:entity/:id/transfer
```json
{ "targetWorkspaceId": "…", "reason": "Territory change",
  "cascade": { "tasks": true, "deals": false, "contacts": false }, "shareBack": "READ" }
```
- Ownership changes in one locked transaction; notes and activities stay attached.
- `cascade.tasks` (default true) moves the record's tasks; `cascade.deals` moves linked deals; `cascade.contacts` (companies only) moves the company's contacts.
- Deals are placed in the same-named stage of the target's pipeline.
- Other shares follow the record; `shareBack` keeps access for the old owner.
- `409 TRANSFER_DUPLICATE` if the target already has the same contact email or company name. `409 OWNER_CHANGED` if another transfer finished first.

### GET /records/:entity/:id/transfers
Transfer history (from, to, reason, who, when, cascaded counts).

### POST /records/:entity/bulk-share · POST /records/:entity/bulk-transfer
Same bodies plus `"ids": [ … ]` (max 200). Returns `{ succeeded: [{ id, result }], failed: [{ id, code, message }] }`.

---

## Sales CRM

All scoped by `X-Sales-Id`. Create endpoints accept `ownerWorkspaceId` when "all" is selected. `GET` lists accept `page`, `pageSize`, `sort`, `q`, `tag`, `ownerWorkspaceId`, `from`, `to` plus the filters shown.

| Resource | Endpoints |
|---|---|
| Leads | `GET/POST /leads` (filters `status`, `priority`, `source`, `countryCode`) · `GET/PUT/DELETE /leads/:id` · `GET /leads/:id/timeline` · `POST /leads/:id/convert` · `POST /leads/:id/share` · `POST /leads/:id/transfer` · `POST /leads/import` (multipart `file`) · `GET /leads/export?format=csv\|xlsx` · `POST /leads/bulk-delete` · `POST /leads/bulk-update` |
| Contacts | same shape as leads (filters `companyId`, `countryCode`, `listId`, `hasEmail`) + `POST /contacts/:id/consent` · `POST /contacts/:id/erase` |
| Companies | same shape (filters `industry`, `countryCode`) |
| Deals | same shape (filters `status`, `pipelineId`, `stageId`, `currency`) + `GET /deals/board?pipelineId=` · `POST /deals/:id/move {stageId}` |
| Pipelines | `GET/POST /pipelines` · `PUT/DELETE /pipelines/:id` · `POST /pipelines/:id/stages` · `PUT /pipelines/:id/stages/order` · `PUT/DELETE /pipelines/:id/stages/:stageId` |
| Tasks | `GET/POST /tasks` (filters `status`, `due=overdue\|today\|upcoming\|none`, `from`/`to`, record ids) · `GET/PUT/DELETE /tasks/:id` · `POST /tasks/:id/complete` · `POST /tasks/bulk-status` |
| Notes & activity | `POST /notes {entityType, entityId, body}` · `PUT/DELETE /notes/:id` · `POST /activities {entityType, entityId, type, subject, body}` · `GET /activities/recent` |
| Tags / notifications | `GET /tags` · `PUT/DELETE /tags/:id` · `GET /notifications` · `POST /notifications/:id/read` · `POST /notifications/read-all` |
| Dashboard / reports | `GET /dashboard?from&to&source&campaignId` · `GET /reports/sales` · `/reports/email` · `/reports/sales-ids` · `/reports/trends` · `/reports/export?report=sales-ids\|campaigns\|leads-by-source\|smtp&format=csv\|xlsx` |

Money in requests is a decimal string (`"125000.50"`) plus `currency`; responses return `amountMinor` (string) and `currency`.

## Email marketing

| Resource | Endpoints |
|---|---|
| SMTP accounts | `GET /smtp-accounts/providers` · `GET/POST /smtp-accounts` · `GET/PUT/DELETE /smtp-accounts/:id` · `PUT /smtp-accounts/:id/workspaces` · `POST /smtp-accounts/:id/test {sendTo?}` · `GET /smtp-accounts/:id/logs`. Passwords/OAuth secrets are write-only. |
| Email lists | `GET/POST /email-lists` · `GET/PUT/DELETE /email-lists/:id` · `GET /email-lists/:id/members` · `POST /email-lists/:id/members {contactIds?, emails?}` · `POST /email-lists/:id/members/segment {countryCodes, tags, sources}` · `POST /email-lists/:id/members/remove` · `POST /email-lists/:id/import` · `GET /email-lists/:id/export` |
| Templates | `GET/POST /templates` · `GET/PUT/DELETE /templates/:id` · `POST /templates/:id/duplicate` · `POST /templates/preview` |
| Suppressions | `GET /suppressions?reason=` · `GET /suppressions/summary` · `POST /suppressions {emails}` · `DELETE /suppressions/:id` (not for unsubscribes/complaints/erasure) · `GET /suppressions/unsubscribes` |
| Campaigns | `GET/POST /campaigns` · `GET/PUT/DELETE /campaigns/:id` · `GET /campaigns/:id/preview` (dry run) · `POST /campaigns/:id/send` · `/pause` · `/resume` · `/cancel` · `/unschedule` · `/retry-failed` · `/duplicate` · `GET /campaigns/:id/statistics` · `GET /campaigns/:id/recipients` · `POST /campaigns/:id/test {to[]}` · `GET /campaigns/eligible-smtp?workspaceId=` |
| Automations | `GET/POST /automations` · `GET/PUT/DELETE /automations/:id` · `POST /automations/:id/activate` · `/pause` · `POST /automations/:id/enroll {contactIds, leadIds}` · `GET /automations/:id/enrollments` · `GET /automations/:id/executions` |

Campaign scheduling fields: `scheduleMode` = `IMMEDIATE` | `FIXED_TIME` (`scheduledAt` ISO) | `RECIPIENT_LOCAL` (`localSendDate` YYYY-MM-DD, `localSendTime` HH:mm, `fallbackTimezone`, `pastTimeBehaviour` = `NEXT_DAY` | `SEND_NOW` | `SKIP`), `respectBusinessHours`. `POST /send` returns `422 CAMPAIGN_NOT_READY` with `details.issues[]` when something is missing.

Recipient statuses: `PENDING → QUEUED → SENDING → SENT`, or `FAILED`, `BOUNCED`, `SUPPRESSED`, `SKIPPED` (with `skipReason`, e.g. `NO_CONSENT_UK_GDPR`, `PAST_LOCAL_TIME`, `INVALID_EMAIL`), `CANCELLED`.

## Public endpoints (no login, on the API host)

| Endpoint | Purpose |
|---|---|
| `GET /t/o/:token.gif` | open pixel (estimated opens; scanner/prefetch opens flagged) |
| `GET /t/c/:token/:linkId` | click redirect — only to URLs stored for that campaign |
| `GET /u/:token` | unsubscribe confirmation page (button, so link scanners cannot unsubscribe people) |
| `POST /u/:token` | unsubscribe; also RFC 8058 one-click (`List-Unsubscribe=One-Click`) |
| `POST /webhooks/ses` | Amazon SNS notifications for SES (signature verified; subscription auto-confirmed) |

## Audit log

### GET /audit-logs
Query: `entityType`, `entityId`, `action` (prefix, e.g. `record.`), `from`, `to`, paging. With a Sales ID selected, only that Sales ID's entries. Secrets are never stored in `before` / `after`.

## Health

`GET /health` (process up) · `GET /ready` (database and Redis reachable; `503` otherwise).
