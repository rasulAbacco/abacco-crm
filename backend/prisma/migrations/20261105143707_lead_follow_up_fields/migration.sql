-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "basicPriceMinor" BIGINT,
ADD COLUMN     "callNotes" TEXT,
ADD COLUMN     "callStatus" TEXT,
ADD COLUMN     "dataCount" INTEGER,
ADD COLUMN     "followUpPitch" TEXT,
ADD COLUMN     "premiumPriceMinor" BIGINT,
ADD COLUMN     "previousPitch" TEXT,
ADD COLUMN     "priceCurrency" CHAR(3),
ADD COLUMN     "responseStatus" TEXT;

-- CreateIndex
CREATE INDEX "leads_ownerWorkspaceId_responseStatus_idx" ON "leads"("ownerWorkspaceId", "responseStatus");

-- Prices and counts are typed by users; they can never be negative.
ALTER TABLE "leads" ADD CONSTRAINT "leads_prices_nonneg_chk"
  CHECK (("basicPriceMinor" IS NULL OR "basicPriceMinor" >= 0) AND ("premiumPriceMinor" IS NULL OR "premiumPriceMinor" >= 0) AND ("dataCount" IS NULL OR "dataCount" >= 0));