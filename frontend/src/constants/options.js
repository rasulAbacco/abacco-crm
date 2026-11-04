export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST'];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
export const TASK_TYPES = ['TODO', 'CALL', 'EMAIL', 'MEETING', 'FOLLOW_UP'];
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
export const LEAD_SOURCES = ['Website', 'Referral', 'LinkedIn', 'Cold outreach', 'Email campaign', 'Event / Expo', 'Partner', 'Advertisement', 'Import', 'Other'];
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY', 'CHF', 'SAR', 'ZAR', 'NZD', 'HKD', 'MYR'];

export const COUNTRIES = [
  ['IN', 'India'], ['US', 'United States'], ['GB', 'United Kingdom'], ['IE', 'Ireland'], ['DE', 'Germany'], ['FR', 'France'], ['NL', 'Netherlands'], ['ES', 'Spain'],
  ['IT', 'Italy'], ['BE', 'Belgium'], ['SE', 'Sweden'], ['NO', 'Norway'], ['DK', 'Denmark'], ['FI', 'Finland'], ['PL', 'Poland'], ['PT', 'Portugal'], ['AT', 'Austria'],
  ['CH', 'Switzerland'], ['CA', 'Canada'], ['MX', 'Mexico'], ['BR', 'Brazil'], ['AU', 'Australia'], ['NZ', 'New Zealand'], ['SG', 'Singapore'], ['MY', 'Malaysia'],
  ['AE', 'United Arab Emirates'], ['SA', 'Saudi Arabia'], ['QA', 'Qatar'], ['KW', 'Kuwait'], ['OM', 'Oman'], ['BH', 'Bahrain'], ['ZA', 'South Africa'], ['NG', 'Nigeria'],
  ['KE', 'Kenya'], ['JP', 'Japan'], ['KR', 'South Korea'], ['CN', 'China'], ['HK', 'Hong Kong'], ['ID', 'Indonesia'], ['TH', 'Thailand'], ['PH', 'Philippines'],
  ['VN', 'Vietnam'], ['BD', 'Bangladesh'], ['LK', 'Sri Lanka'], ['NP', 'Nepal'], ['PK', 'Pakistan'], ['IL', 'Israel'], ['TR', 'Turkey'], ['EG', 'Egypt'],
].sort((a, b) => a[1].localeCompare(b[1]));

export const countryName = (code) => COUNTRIES.find((c) => c[0] === code)?.[1] ?? code ?? '—';

export const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York'];
  }
})();

export const STATUS_COLORS = {
  NEW: 'blue', CONTACTED: 'indigo', QUALIFIED: 'green', UNQUALIFIED: 'gray', CONVERTED: 'emerald', LOST: 'red',
  OPEN: 'blue', WON: 'emerald', ACTIVE: 'green', INACTIVE: 'gray', DRAFT: 'gray', SCHEDULED: 'indigo', QUEUED: 'indigo', SENDING: 'blue', PAUSED: 'amber',
  COMPLETED: 'emerald', COMPLETED_WITH_ERRORS: 'amber', FAILED: 'red', CANCELLED: 'gray', HEALTHY: 'green', UNTESTED: 'gray', UNHEALTHY: 'amber', AUTH_FAILED: 'red',
  TODO: 'gray', IN_PROGRESS: 'blue', DONE: 'emerald', LOW: 'gray', MEDIUM: 'blue', HIGH: 'amber', URGENT: 'red', SENT: 'emerald', PENDING: 'gray', BOUNCED: 'red',
  SUPPRESSED: 'gray', SKIPPED: 'gray', UNSUBSCRIBED: 'amber', SUBSCRIBED: 'green', REMOVED: 'gray', ARCHIVED: 'gray', READ: 'gray', COLLABORATE: 'indigo',
};
