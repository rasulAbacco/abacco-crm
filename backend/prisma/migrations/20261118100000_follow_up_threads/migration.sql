-- Follow-ups that reply to the previous email (Outlook / Gmail style).
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "followUpMode" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "campaign_recipients"
  ADD COLUMN IF NOT EXISTS "sentSubject" TEXT,
  ADD COLUMN IF NOT EXISTS "sentHtml"    TEXT,
  ADD COLUMN IF NOT EXISTS "sentText"    TEXT,
  ADD COLUMN IF NOT EXISTS "sentCc"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "inReplyTo"   TEXT,
  ADD COLUMN IF NOT EXISTS "threadRefs"  TEXT;
CREATE INDEX IF NOT EXISTS "campaign_recipients_emailNormalized_sentAt_idx"
  ON "campaign_recipients" ("emailNormalized", "sentAt");

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "previousPitch" TEXT,
  ADD COLUMN IF NOT EXISTS "followUpPitch" TEXT;

-- Bring the pitches of leads already turned into contacts across.
UPDATE "contacts" c
   SET "previousPitch" = COALESCE(c."previousPitch", l."previousPitch"),
       "followUpPitch" = COALESCE(c."followUpPitch", l."followUpPitch")
  FROM "leads" l
 WHERE l."deletedAt" IS NULL
   AND l."emailNormalized" IS NOT NULL
   AND l."emailNormalized" = c."emailNormalized"
   AND l."ownerWorkspaceId" = c."ownerWorkspaceId"
   AND (l."previousPitch" IS NOT NULL OR l."followUpPitch" IS NOT NULL);