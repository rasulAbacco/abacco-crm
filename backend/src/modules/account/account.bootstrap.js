// First-run creation of the primary account: user, first Sales ID with its
// default pipeline, and editable country profiles. Runs inside a transaction.
import { createWorkspaceRecords } from '../sales-ids/salesId.service.js';

// Starting point only — every value is editable in Settings → Countries.
// requiresPriorConsent=true makes campaigns skip recipients without a consent record.
export const DEFAULT_COUNTRY_PROFILES = [
  { code: 'IN', name: 'India', defaultTimezone: 'Asia/Kolkata', legalRegime: 'DPDP', requiresPriorConsent: true, currency: 'INR' },
  { code: 'US', name: 'United States', defaultTimezone: 'America/New_York', legalRegime: 'CAN_SPAM', requiresPriorConsent: false, currency: 'USD' },
  { code: 'GB', name: 'United Kingdom', defaultTimezone: 'Europe/London', legalRegime: 'UK_GDPR', requiresPriorConsent: true, currency: 'GBP' },
  { code: 'IE', name: 'Ireland', defaultTimezone: 'Europe/Dublin', legalRegime: 'GDPR', requiresPriorConsent: true, currency: 'EUR' },
  { code: 'DE', name: 'Germany', defaultTimezone: 'Europe/Berlin', legalRegime: 'GDPR', requiresPriorConsent: true, currency: 'EUR' },
  { code: 'FR', name: 'France', defaultTimezone: 'Europe/Paris', legalRegime: 'GDPR', requiresPriorConsent: true, currency: 'EUR' },
  { code: 'NL', name: 'Netherlands', defaultTimezone: 'Europe/Amsterdam', legalRegime: 'GDPR', requiresPriorConsent: true, currency: 'EUR' },
  { code: 'ES', name: 'Spain', defaultTimezone: 'Europe/Madrid', legalRegime: 'GDPR', requiresPriorConsent: true, currency: 'EUR' },
  { code: 'IT', name: 'Italy', defaultTimezone: 'Europe/Rome', legalRegime: 'GDPR', requiresPriorConsent: true, currency: 'EUR' },
  { code: 'CA', name: 'Canada', defaultTimezone: 'America/Toronto', legalRegime: 'CASL', requiresPriorConsent: true, currency: 'CAD' },
  { code: 'AU', name: 'Australia', defaultTimezone: 'Australia/Sydney', legalRegime: 'SPAM_ACT', requiresPriorConsent: true, currency: 'AUD' },
  { code: 'AE', name: 'United Arab Emirates', defaultTimezone: 'Asia/Dubai', legalRegime: 'OTHER', requiresPriorConsent: false, currency: 'AED' },
  { code: 'SG', name: 'Singapore', defaultTimezone: 'Asia/Singapore', legalRegime: 'OTHER', requiresPriorConsent: false, currency: 'SGD' },
];

export async function bootstrapAccount(tx, { accountName, name, email, passwordHash }) {
  const account = await tx.account.create({ data: { name: accountName } });
  const user = await tx.user.create({
    data: { accountId: account.id, name, email: email.trim().toLowerCase(), passwordHash },
  });
  await createWorkspaceRecords(tx, account.id, { name: 'Sales ID 001', description: 'Default Sales ID', isDefault: true });
  await tx.countryProfile.createMany({
    data: DEFAULT_COUNTRY_PROFILES.map((c) => ({ ...c, accountId: account.id })),
    skipDuplicates: true,
  });
  return { account, user };
}
