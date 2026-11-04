// Provider presets. Every field stays editable in the UI, and "Test connection"
// is the final check. Limits are conservative starting values — set them to
// your plan's real limits; the engine never exceeds what you enter here.
export const SMTP_PROVIDERS = {
  GMAIL: {
    label: 'Gmail / Google Workspace',
    host: 'smtp.gmail.com',
    port: 465,
    security: 'SSL',
    authTypes: ['PASSWORD', 'OAUTH2'],
    hourlyLimit: 80,
    dailyLimit: 500,
    notes:
      'Google turned off plain-password sign-in on 14 Mar 2025: use an App Password (2-Step Verification on) or OAuth2. ' +
      'About 500 recipients/day for personal Gmail and about 2,000/day for Google Workspace.',
  },
  ZOHO: {
    label: 'Zoho Mail',
    host: 'smtp.zoho.in', // India data centre; use smtp.zoho.com (US) or smtp.zoho.eu (EU) to match your account
    port: 465,
    security: 'SSL',
    authTypes: ['PASSWORD'],
    hourlyLimit: 50,
    dailyLimit: 300,
    notes: 'Use the host for your Zoho data centre (.in, .com, .eu). With 2FA on, create an application-specific password.',
  },
  YAHOO: {
    label: 'Yahoo Mail',
    host: 'smtp.mail.yahoo.com',
    port: 465,
    security: 'SSL',
    authTypes: ['PASSWORD'],
    hourlyLimit: 40,
    dailyLimit: 300,
    notes: 'Yahoo requires an app password (Account security → Generate app password).',
  },
  REDIFFMAIL: {
    label: 'Rediffmail / Rediffmail Pro',
    host: 'smtp.rediffmailpro.com',
    port: 465,
    security: 'SSL',
    authTypes: ['PASSWORD'],
    hourlyLimit: 40,
    dailyLimit: 200,
    notes: 'Rediff publishes few details; confirm host and port with Test connection (587 + STARTTLS is the alternative).',
  },
  AMAZON_SES: {
    label: 'Amazon SES (SMTP)',
    host: 'email-smtp.ap-south-1.amazonaws.com',
    port: 587,
    security: 'STARTTLS',
    authTypes: ['PASSWORD'],
    hourlyLimit: 500,
    dailyLimit: 2000,
    notes:
      'Use SES SMTP credentials (not IAM access keys) and the endpoint of your SES region. The From address or domain must be verified. ' +
      'New accounts are in the sandbox (verified recipients only, 200/day) until production access is granted. Set up SPF, DKIM and DMARC.',
  },
  CUSTOM: { label: 'Other SMTP server', host: '', port: 587, security: 'STARTTLS', authTypes: ['PASSWORD'], hourlyLimit: 50, dailyLimit: 300, notes: '' },
};

export function sesRegionFromHost(host) {
  const m = /^email-smtp\.([a-z0-9-]+)\.amazonaws\.com$/i.exec(host ?? '');
  return m ? m[1] : null;
}
