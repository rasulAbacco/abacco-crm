// Centralised, validated configuration. The process refuses to start with a
// clear message when a required variable is missing or malformed.
import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  REDIS_URL: z.string().optional(),

  // Public URLs
  APP_URL: z.string().url().default('http://localhost:5173'), // frontend
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'), // tracking + unsubscribe links
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0), // Render: 1

  // Auth
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: bool.optional(),
  // strict when the web app and API share a site (custom domain or the static
  // site's /api rewrite). onrender.com subdomains are different sites.
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  SETUP_TOKEN: z.string().min(24).optional(), // enables one-time POST /auth/setup

  // Encryption of SMTP credentials: base64 32-byte keys, "1:<key>,2:<key>"
  ENCRYPTION_KEYS: z.string().min(1),
  ENCRYPTION_ACTIVE_KEY_VERSION: z.coerce.number().int().positive().default(1),

  // System mail (password reset). Never the campaign SMTP accounts.
  SYSTEM_SMTP_HOST: z.string().optional(),
  SYSTEM_SMTP_PORT: z.coerce.number().int().positive().optional(),
  SYSTEM_SMTP_SECURE: bool.optional(),
  SYSTEM_SMTP_USER: z.string().optional(),
  SYSTEM_SMTP_PASS: z.string().optional(),
  SYSTEM_MAIL_FROM: z.string().optional(),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${lines.join('\n')}`);
    process.exit(1);
  }
  const env = parsed.data;
  return {
    ...env,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    cookieSecure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  };
}

export const config = load();
export default config;
