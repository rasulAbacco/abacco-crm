// Structured JSON logging. Secrets are redacted at the logger, so a careless
// log call cannot leak a password, token or SMTP credential.
import pino from 'pino';
import config from './environment.js';

export const REDACT_PATHS = [
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'refreshToken',
  'accessToken',
  'credentials',
  'smtpPassword',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.credentials',
  '*.passwordHash',
  '*.credentialCiphertext',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

export const logger = pino({
  level: config.isTest ? 'silent' : config.LOG_LEVEL,
  base: { service: process.env.SERVICE_NAME || 'abacco-api' },
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.isProduction
    ? {}
    : { transport: { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } } }),
});

export default logger;
