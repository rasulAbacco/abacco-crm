-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TimezoneSource" AS ENUM ('EXPLICIT', 'PHONE', 'COUNTRY', 'DEFAULT');

-- CreateEnum
CREATE TYPE "StageKind" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('TODO', 'CALL', 'EMAIL', 'MEETING', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'MEETING', 'TASK', 'STATUS_CHANGE', 'SHARE', 'TRANSFER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ShareableEntity" AS ENUM ('LEAD', 'CONTACT', 'COMPANY', 'DEAL');

-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('READ', 'COLLABORATE');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'URL');

-- CreateEnum
CREATE TYPE "SmtpProvider" AS ENUM ('GMAIL', 'REDIFFMAIL', 'ZOHO', 'YAHOO', 'AMAZON_SES', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SmtpSecurity" AS ENUM ('SSL', 'STARTTLS', 'NONE');

-- CreateEnum
CREATE TYPE "SmtpAuthType" AS ENUM ('PASSWORD', 'OAUTH2');

-- CreateEnum
CREATE TYPE "SmtpHealth" AS ENUM ('UNTESTED', 'HEALTHY', 'UNHEALTHY', 'AUTH_FAILED');

-- CreateEnum
CREATE TYPE "UsageWindow" AS ENUM ('HOUR', 'DAY');

-- CreateEnum
CREATE TYPE "ListMemberStatus" AS ENUM ('SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED', 'REMOVED');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('HARD_BOUNCE', 'COMPLAINT', 'UNSUBSCRIBED', 'MANUAL', 'ERASURE', 'INVALID');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "LegalRegime" AS ENUM ('GDPR', 'UK_GDPR', 'CASL', 'CAN_SPAM', 'DPDP', 'SPAM_ACT', 'OTHER');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'BOUNCED', 'SUPPRESSED', 'UNSUBSCRIBED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScheduleMode" AS ENUM ('IMMEDIATE', 'FIXED_TIME', 'RECIPIENT_LOCAL');

-- CreateEnum
CREATE TYPE "PastTimeBehaviour" AS ENUM ('SEND_NOW', 'NEXT_DAY', 'SKIP');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('ACCEPTED', 'DELIVERED', 'BOUNCED_HARD', 'BOUNCED_SOFT', 'COMPLAINED', 'OPENED', 'CLICKED', 'UNSUBSCRIBED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('SMTP', 'SES_SNS', 'IMAP_BOUNCE', 'TRACKING_PIXEL', 'LINK_REDIRECT', 'UNSUBSCRIBE_LINK', 'LIST_UNSUBSCRIBE_POST', 'MANUAL');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('LEAD_CREATED', 'CONTACT_CREATED', 'LIST_JOINED', 'LEAD_STATUS_CHANGED', 'DATE_FIELD', 'CAMPAIGN_EVENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "AutomationStepType" AS ENUM ('SEND_EMAIL', 'WAIT', 'CONDITION', 'CREATE_TASK', 'UPDATE_FIELD');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXITED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportEntity" AS ENUM ('LEAD', 'CONTACT', 'COMPANY', 'LIST_MEMBER');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'INR',
    "defaultTimezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "defaultLocale" TEXT NOT NULL DEFAULT 'en-IN',
    "legalName" TEXT,
    "postalAddress" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT,
    "locale" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "passwordChangedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" TEXT,
    "replacedById" UUID,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_workspaces" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "defaultCurrency" CHAR(3),
    "defaultTimezone" TEXT,
    "senderLegalName" TEXT,
    "senderPostalAddress" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "sales_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_workspace_settings" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "businessHoursStart" TEXT NOT NULL DEFAULT '09:00',
    "businessHoursEnd" TEXT NOT NULL DEFAULT '18:00',
    "businessDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "emailFooterHtml" TEXT,
    "leadScoringRules" JSONB,
    "preferences" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_workspace_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "ownerWorkspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "domain" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "email" TEXT,
    "phoneE164" TEXT,
    "phoneRaw" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "countryCode" CHAR(2),
    "timezone" TEXT,
    "description" TEXT,
    "customFields" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "ownerWorkspaceId" UUID NOT NULL,
    "companyId" UUID,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phoneE164" TEXT,
    "phoneRaw" TEXT,
    "designation" TEXT,
    "countryCode" CHAR(2),
    "region" TEXT,
    "city" TEXT,
    "timezone" TEXT,
    "timezoneSource" "TimezoneSource" NOT NULL DEFAULT 'DEFAULT',
    "locale" TEXT,
    "source" TEXT,
    "description" TEXT,
    "customFields" JSONB,
    "lastContactedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "ownerWorkspaceId" UUID NOT NULL,
    "companyId" UUID,
    "contactId" UUID,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phoneE164" TEXT,
    "phoneRaw" TEXT,
    "companyName" TEXT,
    "designation" TEXT,
    "website" TEXT,
    "countryCode" CHAR(2),
    "region" TEXT,
    "city" TEXT,
    "timezone" TEXT,
    "timezoneSource" "TimezoneSource" NOT NULL DEFAULT 'DEFAULT',
    "locale" TEXT,
    "source" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "score" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "customFields" JSONB,
    "convertedAt" TIMESTAMPTZ(3),
    "lastActivityAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipelines" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" UUID NOT NULL,
    "pipelineId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "kind" "StageKind" NOT NULL DEFAULT 'OPEN',
    "color" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "ownerWorkspaceId" UUID NOT NULL,
    "pipelineId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "leadId" UUID,
    "contactId" UUID,
    "companyId" UUID,
    "title" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "probability" INTEGER,
    "expectedCloseDate" DATE,
    "status" "DealStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMPTZ(3),
    "lostReason" TEXT,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "customFields" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "ownerWorkspaceId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "TaskType" NOT NULL DEFAULT 'TODO',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "dueAt" TIMESTAMPTZ(3),
    "remindAt" TIMESTAMPTZ(3),
    "reminderSentAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "leadId" UUID,
    "contactId" UUID,
    "companyId" UUID,
    "dealId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "authorId" UUID,
    "body" TEXT NOT NULL,
    "leadId" UUID,
    "contactId" UUID,
    "companyId" UUID,
    "dealId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "actorId" UUID,
    "type" "ActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadId" UUID,
    "contactId" UUID,
    "companyId" UUID,
    "dealId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_tags" (
    "tagId" UUID NOT NULL,
    "entityType" "ShareableEntity" NOT NULL,
    "entityId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_tags_pkey" PRIMARY KEY ("tagId","entityType","entityId")
);

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "entityType" "ShareableEntity" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "CustomFieldType" NOT NULL DEFAULT 'TEXT',
    "options" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_shares" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "entityType" "ShareableEntity" NOT NULL,
    "entityId" UUID NOT NULL,
    "ownerWorkspaceId" UUID NOT NULL,
    "targetWorkspaceId" UUID NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'READ',
    "createdById" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "record_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_transfer_history" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "entityType" "ShareableEntity" NOT NULL,
    "entityId" UUID NOT NULL,
    "fromWorkspaceId" UUID NOT NULL,
    "toWorkspaceId" UUID NOT NULL,
    "cascaded" JSONB,
    "reason" TEXT,
    "performedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_transfer_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "userId" UUID,
    "workspaceId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smtp_accounts" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "provider" "SmtpProvider" NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "security" "SmtpSecurity" NOT NULL,
    "authType" "SmtpAuthType" NOT NULL DEFAULT 'PASSWORD',
    "username" TEXT NOT NULL,
    "credentialCiphertext" TEXT NOT NULL,
    "credentialIv" TEXT NOT NULL,
    "credentialTag" TEXT NOT NULL,
    "credentialKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "sesRegion" TEXT,
    "hourlyLimit" INTEGER NOT NULL,
    "dailyLimit" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "health" "SmtpHealth" NOT NULL DEFAULT 'UNTESTED',
    "unhealthyUntil" TIMESTAMPTZ(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastTestedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "lastUsedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "smtp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smtp_account_workspaces" (
    "smtpAccountId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smtp_account_workspaces_pkey" PRIMARY KEY ("smtpAccountId","workspaceId")
);

-- CreateTable
CREATE TABLE "smtp_usage_windows" (
    "smtpAccountId" UUID NOT NULL,
    "window" "UsageWindow" NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "smtp_usage_windows_pkey" PRIMARY KEY ("smtpAccountId","window","windowStart")
);

-- CreateTable
CREATE TABLE "email_lists" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "ownerWorkspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "email_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_list_contacts" (
    "listId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "status" "ListMemberStatus" NOT NULL DEFAULT 'SUBSCRIBED',
    "source" TEXT,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMPTZ(3),

    CONSTRAINT "email_list_contacts_pkey" PRIMARY KEY ("listId","contactId")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "ownerWorkspaceId" UUID,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "preheader" TEXT,
    "html" TEXT NOT NULL,
    "text" TEXT,
    "design" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppressions" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "emailNormalized" TEXT,
    "emailHash" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "source" "EventSource" NOT NULL DEFAULT 'MANUAL',
    "countryCode" CHAR(2),
    "note" TEXT,
    "campaignId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unsubscribes" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "emailNormalized" TEXT,
    "emailHash" TEXT NOT NULL,
    "workspaceId" UUID,
    "campaignId" UUID,
    "recipientId" UUID,
    "source" "EventSource" NOT NULL,
    "countryCode" CHAR(2),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unsubscribes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "contactId" UUID,
    "emailNormalized" TEXT,
    "emailHash" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "legalBasis" TEXT,
    "source" TEXT,
    "countryCode" CHAR(2),
    "evidence" JSONB,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country_profiles" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "defaultTimezone" TEXT NOT NULL,
    "legalRegime" "LegalRegime" NOT NULL DEFAULT 'OTHER',
    "requiresPriorConsent" BOOLEAN NOT NULL DEFAULT false,
    "businessHoursStart" TEXT NOT NULL DEFAULT '09:00',
    "businessHoursEnd" TEXT NOT NULL DEFAULT '18:00',
    "businessDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "currency" CHAR(3),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "country_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "ownerWorkspaceId" UUID NOT NULL,
    "templateId" UUID,
    "createdById" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "statusReason" TEXT,
    "subject" TEXT,
    "preheader" TEXT,
    "fromName" TEXT,
    "fromEmail" TEXT,
    "replyTo" TEXT,
    "html" TEXT,
    "text" TEXT,
    "segmentFilter" JSONB,
    "trackOpens" BOOLEAN NOT NULL DEFAULT true,
    "trackClicks" BOOLEAN NOT NULL DEFAULT true,
    "scheduleMode" "ScheduleMode" NOT NULL DEFAULT 'IMMEDIATE',
    "scheduledAtUtc" TIMESTAMPTZ(3),
    "localSendDate" DATE,
    "localSendTime" TEXT,
    "fallbackTimezone" TEXT,
    "pastTimeBehaviour" "PastTimeBehaviour" NOT NULL DEFAULT 'NEXT_DAY',
    "respectBusinessHours" BOOLEAN NOT NULL DEFAULT false,
    "pitchAmountMinor" BIGINT,
    "pitchCurrency" CHAR(3),
    "pitchPriceNote" TEXT,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_lists" (
    "campaignId" UUID NOT NULL,
    "listId" UUID NOT NULL,

    CONSTRAINT "campaign_lists_pkey" PRIMARY KEY ("campaignId","listId")
);

-- CreateTable
CREATE TABLE "campaign_smtp_accounts" (
    "campaignId" UUID NOT NULL,
    "smtpAccountId" UUID NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "campaign_smtp_accounts_pkey" PRIMARY KEY ("campaignId","smtpAccountId")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "contactId" UUID,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "mergeData" JSONB,
    "countryCode" CHAR(2),
    "recipientTimezone" TEXT,
    "scheduledAtUtc" TIMESTAMPTZ(3),
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "skipReason" TEXT,
    "smtpAccountId" UUID,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3),
    "lockedAt" TIMESTAMPTZ(3),
    "lockedBy" TEXT,
    "messageId" TEXT,
    "trackingToken" TEXT NOT NULL,
    "lastError" TEXT,
    "queuedAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "firstOpenedAt" TIMESTAMPTZ(3),
    "firstClickedAt" TIMESTAMPTZ(3),
    "bouncedAt" TIMESTAMPTZ(3),
    "unsubscribedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "workspaceId" UUID,
    "campaignId" UUID,
    "recipientId" UUID,
    "smtpAccountId" UUID,
    "automationExecId" UUID,
    "type" "EmailEventType" NOT NULL,
    "source" "EventSource" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "providerEventId" TEXT,
    "url" TEXT,
    "isMachine" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracked_links" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracked_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automations" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "ownerWorkspaceId" UUID NOT NULL,
    "smtpAccountId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerType" "AutomationTrigger" NOT NULL,
    "triggerConfig" JSONB,
    "allowReentry" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_steps" (
    "id" UUID NOT NULL,
    "automationId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "AutomationStepType" NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "automation_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_enrollments" (
    "id" UUID NOT NULL,
    "automationId" UUID NOT NULL,
    "contactId" UUID,
    "leadId" UUID,
    "emailNormalized" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPosition" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMPTZ(3),
    "exitReason" TEXT,
    "enrolledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "automation_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_executions" (
    "id" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "stepId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "messageId" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "accountId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("accountId","key")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdById" UUID,
    "entityType" "ImportEntity" NOT NULL,
    "targetListId" UUID,
    "fileName" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "mapping" JSONB,
    "options" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_accountId_idx" ON "users"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "sales_workspaces_accountId_status_idx" ON "sales_workspaces"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_workspaces_accountId_code_key" ON "sales_workspaces"("accountId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_workspaces_account_name_live_key" ON "sales_workspaces"("accountId", "name") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "sales_workspaces_one_default_key" ON "sales_workspaces"("accountId") WHERE ("isDefault" = true AND "deletedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "sales_workspace_settings_workspaceId_key" ON "sales_workspace_settings"("workspaceId");

-- CreateIndex
CREATE INDEX "companies_accountId_ownerWorkspaceId_deletedAt_idx" ON "companies"("accountId", "ownerWorkspaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "companies_ownerWorkspaceId_countryCode_idx" ON "companies"("ownerWorkspaceId", "countryCode");

-- CreateIndex
CREATE INDEX "companies_domain_idx" ON "companies"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "companies_workspace_name_live_key" ON "companies"("ownerWorkspaceId", "nameNormalized") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE INDEX "contacts_accountId_ownerWorkspaceId_deletedAt_idx" ON "contacts"("accountId", "ownerWorkspaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "contacts_ownerWorkspaceId_countryCode_idx" ON "contacts"("ownerWorkspaceId", "countryCode");

-- CreateIndex
CREATE INDEX "contacts_accountId_emailNormalized_idx" ON "contacts"("accountId", "emailNormalized");

-- CreateIndex
CREATE INDEX "contacts_companyId_idx" ON "contacts"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_workspace_email_live_key" ON "contacts"("ownerWorkspaceId", "emailNormalized") WHERE ("deletedAt" IS NULL AND "emailNormalized" IS NOT NULL);

-- CreateIndex
CREATE INDEX "leads_accountId_ownerWorkspaceId_deletedAt_createdAt_idx" ON "leads"("accountId", "ownerWorkspaceId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "leads_ownerWorkspaceId_status_idx" ON "leads"("ownerWorkspaceId", "status");

-- CreateIndex
CREATE INDEX "leads_ownerWorkspaceId_source_idx" ON "leads"("ownerWorkspaceId", "source");

-- CreateIndex
CREATE INDEX "leads_ownerWorkspaceId_countryCode_idx" ON "leads"("ownerWorkspaceId", "countryCode");

-- CreateIndex
CREATE INDEX "leads_accountId_emailNormalized_idx" ON "leads"("accountId", "emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "pipelines_workspaceId_name_key" ON "pipelines"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "pipeline_stages_pipelineId_position_idx" ON "pipeline_stages"("pipelineId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_pipelineId_name_key" ON "pipeline_stages"("pipelineId", "name");

-- CreateIndex
CREATE INDEX "deals_accountId_ownerWorkspaceId_deletedAt_idx" ON "deals"("accountId", "ownerWorkspaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "deals_ownerWorkspaceId_status_currency_idx" ON "deals"("ownerWorkspaceId", "status", "currency");

-- CreateIndex
CREATE INDEX "deals_stageId_position_idx" ON "deals"("stageId", "position");

-- CreateIndex
CREATE INDEX "deals_leadId_idx" ON "deals"("leadId");

-- CreateIndex
CREATE INDEX "deals_contactId_idx" ON "deals"("contactId");

-- CreateIndex
CREATE INDEX "deals_companyId_idx" ON "deals"("companyId");

-- CreateIndex
CREATE INDEX "tasks_accountId_ownerWorkspaceId_status_dueAt_idx" ON "tasks"("accountId", "ownerWorkspaceId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "tasks_remindAt_reminderSentAt_idx" ON "tasks"("remindAt", "reminderSentAt");

-- CreateIndex
CREATE INDEX "tasks_leadId_idx" ON "tasks"("leadId");

-- CreateIndex
CREATE INDEX "tasks_contactId_idx" ON "tasks"("contactId");

-- CreateIndex
CREATE INDEX "tasks_dealId_idx" ON "tasks"("dealId");

-- CreateIndex
CREATE INDEX "notes_leadId_createdAt_idx" ON "notes"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "notes_contactId_createdAt_idx" ON "notes"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "notes_companyId_createdAt_idx" ON "notes"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "notes_dealId_createdAt_idx" ON "notes"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "activities_accountId_workspaceId_occurredAt_idx" ON "activities"("accountId", "workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "activities_leadId_occurredAt_idx" ON "activities"("leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "activities_contactId_occurredAt_idx" ON "activities"("contactId", "occurredAt");

-- CreateIndex
CREATE INDEX "activities_companyId_occurredAt_idx" ON "activities"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "activities_dealId_occurredAt_idx" ON "activities"("dealId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "tags_accountId_name_key" ON "tags"("accountId", "name");

-- CreateIndex
CREATE INDEX "entity_tags_entityType_entityId_idx" ON "entity_tags"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_accountId_entityType_key_key" ON "custom_field_definitions"("accountId", "entityType", "key");

-- CreateIndex
CREATE INDEX "record_shares_targetWorkspaceId_entityType_revokedAt_idx" ON "record_shares"("targetWorkspaceId", "entityType", "revokedAt");

-- CreateIndex
CREATE INDEX "record_shares_accountId_entityType_entityId_idx" ON "record_shares"("accountId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "record_shares_entityType_entityId_targetWorkspaceId_key" ON "record_shares"("entityType", "entityId", "targetWorkspaceId");

-- CreateIndex
CREATE INDEX "record_transfer_history_accountId_entityType_entityId_creat_idx" ON "record_transfer_history"("accountId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_accountId_createdAt_idx" ON "audit_logs"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_accountId_entityType_entityId_idx" ON "audit_logs"("accountId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_workspaceId_createdAt_idx" ON "audit_logs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "smtp_accounts_accountId_isEnabled_health_idx" ON "smtp_accounts"("accountId", "isEnabled", "health");

-- CreateIndex
CREATE UNIQUE INDEX "smtp_accounts_account_from_live_key" ON "smtp_accounts"("accountId", "fromEmail") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE INDEX "smtp_account_workspaces_workspaceId_idx" ON "smtp_account_workspaces"("workspaceId");

-- CreateIndex
CREATE INDEX "email_lists_accountId_ownerWorkspaceId_idx" ON "email_lists"("accountId", "ownerWorkspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "email_lists_workspace_name_live_key" ON "email_lists"("ownerWorkspaceId", "name") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE INDEX "email_list_contacts_contactId_idx" ON "email_list_contacts"("contactId");

-- CreateIndex
CREATE INDEX "email_list_contacts_listId_status_idx" ON "email_list_contacts"("listId", "status");

-- CreateIndex
CREATE INDEX "email_templates_accountId_ownerWorkspaceId_idx" ON "email_templates"("accountId", "ownerWorkspaceId");

-- CreateIndex
CREATE INDEX "suppressions_accountId_reason_idx" ON "suppressions"("accountId", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "suppressions_accountId_emailHash_key" ON "suppressions"("accountId", "emailHash");

-- CreateIndex
CREATE INDEX "unsubscribes_accountId_emailHash_idx" ON "unsubscribes"("accountId", "emailHash");

-- CreateIndex
CREATE INDEX "unsubscribes_campaignId_idx" ON "unsubscribes"("campaignId");

-- CreateIndex
CREATE INDEX "consent_records_accountId_emailHash_capturedAt_idx" ON "consent_records"("accountId", "emailHash", "capturedAt");

-- CreateIndex
CREATE INDEX "consent_records_contactId_idx" ON "consent_records"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "country_profiles_accountId_code_key" ON "country_profiles"("accountId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_accountId_countryCode_date_key" ON "holidays"("accountId", "countryCode", "date");

-- CreateIndex
CREATE INDEX "campaigns_accountId_ownerWorkspaceId_status_idx" ON "campaigns"("accountId", "ownerWorkspaceId", "status");

-- CreateIndex
CREATE INDEX "campaigns_status_scheduledAtUtc_idx" ON "campaigns"("status", "scheduledAtUtc");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_trackingToken_key" ON "campaign_recipients"("trackingToken");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaignId_status_scheduledAtUtc_idx" ON "campaign_recipients"("campaignId", "status", "scheduledAtUtc");

-- CreateIndex
CREATE INDEX "campaign_recipients_status_scheduledAtUtc_idx" ON "campaign_recipients"("status", "scheduledAtUtc");

-- CreateIndex
CREATE INDEX "campaign_recipients_status_lockedAt_idx" ON "campaign_recipients"("status", "lockedAt");

-- CreateIndex
CREATE INDEX "campaign_recipients_messageId_idx" ON "campaign_recipients"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaignId_emailNormalized_key" ON "campaign_recipients"("campaignId", "emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "email_events_dedupeKey_key" ON "email_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "email_events_campaignId_type_occurredAt_idx" ON "email_events"("campaignId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "email_events_accountId_type_occurredAt_idx" ON "email_events"("accountId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "email_events_workspaceId_type_occurredAt_idx" ON "email_events"("workspaceId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "email_events_smtpAccountId_type_occurredAt_idx" ON "email_events"("smtpAccountId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "email_events_recipientId_idx" ON "email_events"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_links_campaignId_urlHash_key" ON "tracked_links"("campaignId", "urlHash");

-- CreateIndex
CREATE INDEX "automations_accountId_ownerWorkspaceId_status_idx" ON "automations"("accountId", "ownerWorkspaceId", "status");

-- CreateIndex
CREATE INDEX "automations_triggerType_status_idx" ON "automations"("triggerType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "automation_steps_automationId_position_key" ON "automation_steps"("automationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "automation_enrollments_dedupeKey_key" ON "automation_enrollments"("dedupeKey");

-- CreateIndex
CREATE INDEX "automation_enrollments_status_nextRunAt_idx" ON "automation_enrollments"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "automation_enrollments_automationId_status_idx" ON "automation_enrollments"("automationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "automation_executions_idempotencyKey_key" ON "automation_executions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "automation_executions_enrollmentId_idx" ON "automation_executions"("enrollmentId");

-- CreateIndex
CREATE INDEX "automation_executions_status_createdAt_idx" ON "automation_executions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "import_jobs_accountId_workspaceId_createdAt_idx" ON "import_jobs"("accountId", "workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_workspaces" ADD CONSTRAINT "sales_workspaces_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_workspace_settings" ADD CONSTRAINT "sales_workspace_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "sales_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_ownerWorkspaceId_fkey" FOREIGN KEY ("ownerWorkspaceId") REFERENCES "sales_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_ownerWorkspaceId_fkey" FOREIGN KEY ("ownerWorkspaceId") REFERENCES "sales_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_ownerWorkspaceId_fkey" FOREIGN KEY ("ownerWorkspaceId") REFERENCES "sales_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "sales_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_ownerWorkspaceId_fkey" FOREIGN KEY ("ownerWorkspaceId") REFERENCES "sales_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ownerWorkspaceId_fkey" FOREIGN KEY ("ownerWorkspaceId") REFERENCES "sales_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "sales_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "sales_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_tags" ADD CONSTRAINT "entity_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_shares" ADD CONSTRAINT "record_shares_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_shares" ADD CONSTRAINT "record_shares_ownerWorkspaceId_fkey" FOREIGN KEY ("ownerWorkspaceId") REFERENCES "sales_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_shares" ADD CONSTRAINT "record_shares_targetWorkspaceId_fkey" FOREIGN KEY ("targetWorkspaceId") REFERENCES "sales_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_shares" ADD CONSTRAINT "record_shares_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_transfer_history" ADD CONSTRAINT "record_transfer_history_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_transfer_history" ADD CONSTRAINT "record_transfer_history_fromWorkspaceId_fkey" FOREIGN KEY ("fromWorkspaceId") REFERENCES "sales_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_transfer_history" ADD CONSTRAINT "record_transfer_history_toWorkspaceId_fkey" FOREIGN KEY ("toWorkspaceId") REFERENCES "sales_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_transfer_history" ADD CONSTRAINT "record_transfer_history_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "sales_workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smtp_accounts" ADD CONSTRAINT "smtp_accounts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smtp_account_workspaces" ADD CONSTRAINT "smtp_account_workspaces_smtpAccountId_fkey" FOREIGN KEY ("smtpAccountId") REFERENCES "smtp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smtp_account_workspaces" ADD CONSTRAINT "smtp_account_workspaces_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "sales_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smtp_usage_windows" ADD CONSTRAINT "smtp_usage_windows_smtpAccountId_fkey" FOREIGN KEY ("smtpAccountId") REFERENCES "smtp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_lists" ADD CONSTRAINT "email_lists_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_lists" ADD CONSTRAINT "email_lists_ownerWorkspaceId_fkey" FOREIGN KEY ("ownerWorkspaceId") REFERENCES "sales_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_list_contacts" ADD CONSTRAINT "email_list_contacts_listId_fkey" FOREIGN KEY ("listId") REFERENCES "email_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_list_contacts" ADD CONSTRAINT "email_list_contacts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_ownerWorkspaceId_fkey" FOREIGN KEY ("ownerWorkspaceId") REFERENCES "sales_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unsubscribes" ADD CONSTRAINT "unsubscribes_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unsubscribes" ADD CONSTRAINT "unsubscribes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "sales_workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country_profiles" ADD CONSTRAINT "country_profiles_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ownerWorkspaceId_fkey" FOREIGN KEY ("ownerWorkspaceId") REFERENCES "sales_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_lists" ADD CONSTRAINT "campaign_lists_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_lists" ADD CONSTRAINT "campaign_lists_listId_fkey" FOREIGN KEY ("listId") REFERENCES "email_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_smtp_accounts" ADD CONSTRAINT "campaign_smtp_accounts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_smtp_accounts" ADD CONSTRAINT "campaign_smtp_accounts_smtpAccountId_fkey" FOREIGN KEY ("smtpAccountId") REFERENCES "smtp_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_smtpAccountId_fkey" FOREIGN KEY ("smtpAccountId") REFERENCES "smtp_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "sales_workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "campaign_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_smtpAccountId_fkey" FOREIGN KEY ("smtpAccountId") REFERENCES "smtp_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_ownerWorkspaceId_fkey" FOREIGN KEY ("ownerWorkspaceId") REFERENCES "sales_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_smtpAccountId_fkey" FOREIGN KEY ("smtpAccountId") REFERENCES "smtp_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_steps" ADD CONSTRAINT "automation_steps_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_enrollments" ADD CONSTRAINT "automation_enrollments_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_enrollments" ADD CONSTRAINT "automation_enrollments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_enrollments" ADD CONSTRAINT "automation_enrollments_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "automation_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "automation_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "sales_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written integrity rules Prisma cannot express in schema.prisma.
-- ---------------------------------------------------------------------------

-- A note / activity belongs to exactly one parent record.
ALTER TABLE "notes" ADD CONSTRAINT "notes_single_parent_chk"
  CHECK (num_nonnulls("leadId", "contactId", "companyId", "dealId") = 1);
ALTER TABLE "activities" ADD CONSTRAINT "activities_single_parent_chk"
  CHECK (num_nonnulls("leadId", "contactId", "companyId", "dealId") = 1);

-- A Sales ID cannot share with or transfer to itself.
ALTER TABLE "record_shares" ADD CONSTRAINT "record_shares_not_self_chk"
  CHECK ("ownerWorkspaceId" <> "targetWorkspaceId");
ALTER TABLE "record_transfer_history" ADD CONSTRAINT "record_transfer_not_self_chk"
  CHECK ("fromWorkspaceId" <> "toWorkspaceId");

-- Money, probabilities and limits stay in range.
ALTER TABLE "deals" ADD CONSTRAINT "deals_amount_nonneg_chk" CHECK ("amountMinor" >= 0);
ALTER TABLE "deals" ADD CONSTRAINT "deals_probability_chk" CHECK ("probability" IS NULL OR "probability" BETWEEN 0 AND 100);
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_probability_chk" CHECK ("probability" BETWEEN 0 AND 100);
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_pitch_amount_chk" CHECK ("pitchAmountMinor" IS NULL OR "pitchAmountMinor" >= 0);
ALTER TABLE "smtp_accounts" ADD CONSTRAINT "smtp_accounts_limits_chk" CHECK ("hourlyLimit" > 0 AND "dailyLimit" > 0 AND "hourlyLimit" <= "dailyLimit");
ALTER TABLE "smtp_accounts" ADD CONSTRAINT "smtp_accounts_port_chk" CHECK ("port" BETWEEN 1 AND 65535);
