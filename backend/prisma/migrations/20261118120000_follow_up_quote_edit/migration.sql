-- Follow-ups: optional edited copy of the earlier email that is quoted below the new message.
ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "quoteSourceCampaignId" UUID,
  ADD COLUMN IF NOT EXISTS "quoteHtml" TEXT;