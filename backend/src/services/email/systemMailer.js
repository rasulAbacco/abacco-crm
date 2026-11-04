// Transactional "system" mail (password reset). Uses SYSTEM_SMTP_* — in
// development that is Mailpit from docker-compose (localhost:1025), so no real
// mail leaves the machine. Campaign mail never goes through this path.
import nodemailer from 'nodemailer';
import config from '../../config/environment.js';
import logger from '../../config/logger.js';

let transport;
let testOutbox = [];

function getTransport() {
  if (transport) return transport;
  if (config.isTest) {
    transport = { sendMail: async (msg) => { testOutbox.push(msg); return { messageId: `test-${testOutbox.length}` }; } };
    return transport;
  }
  if (!config.SYSTEM_SMTP_HOST) return null;
  transport = nodemailer.createTransport({
    host: config.SYSTEM_SMTP_HOST,
    port: config.SYSTEM_SMTP_PORT ?? 587,
    secure: config.SYSTEM_SMTP_SECURE ?? false,
    auth: config.SYSTEM_SMTP_USER ? { user: config.SYSTEM_SMTP_USER, pass: config.SYSTEM_SMTP_PASS } : undefined,
  });
  return transport;
}

export function isSystemMailConfigured() {
  return config.isTest || Boolean(config.SYSTEM_SMTP_HOST);
}

export async function sendSystemMail({ to, subject, text, html }) {
  const t = getTransport();
  if (!t) {
    logger.warn({ subject }, 'system mail not sent: SYSTEM_SMTP_HOST is not configured');
    return { sent: false };
  }
  await t.sendMail({ from: config.SYSTEM_MAIL_FROM ?? 'Abacco CRM <no-reply@localhost>', to, subject, text, html });
  logger.info({ subject }, 'system mail sent');
  return { sent: true };
}

// Test helpers
export function __takeTestOutbox() {
  const out = testOutbox;
  testOutbox = [];
  return out;
}
