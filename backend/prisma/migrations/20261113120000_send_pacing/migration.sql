-- Exact send pacing and sending hours per SMTP account.
ALTER TABLE "smtp_accounts"
  ADD COLUMN IF NOT EXISTS "nextSendAt"        TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "pacingEnabled"     BOOLEAN   NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "paceJitterPercent" INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sendWindowStart"   TEXT,
  ADD COLUMN IF NOT EXISTS "sendWindowEnd"     TEXT,
  ADD COLUMN IF NOT EXISTS "sendDays"          INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::INTEGER[],
  ADD COLUMN IF NOT EXISTS "sendTimezone"      TEXT;

-- New defaults: Gmail / Google Workspace 100 per hour, Zoho 50 per hour.
-- Only accounts still on the old default (80) are moved; values you changed are kept.
UPDATE "smtp_accounts" SET "hourlyLimit" = 100 WHERE "provider" = 'GMAIL' AND "hourlyLimit" = 80;