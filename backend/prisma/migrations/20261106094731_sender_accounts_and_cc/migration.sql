-- AlterTable
ALTER TABLE "campaign_recipients" ADD COLUMN     "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "includeCc" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "sales_workspaces" ADD COLUMN     "alternateSmtpAccountId" UUID,
ADD COLUMN     "primarySmtpAccountId" UUID;

-- AddForeignKey
ALTER TABLE "sales_workspaces" ADD CONSTRAINT "sales_workspaces_primarySmtpAccountId_fkey" FOREIGN KEY ("primarySmtpAccountId") REFERENCES "smtp_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_workspaces" ADD CONSTRAINT "sales_workspaces_alternateSmtpAccountId_fkey" FOREIGN KEY ("alternateSmtpAccountId") REFERENCES "smtp_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;