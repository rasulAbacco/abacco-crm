// Request rate limits. The in-memory store is correct for a single API
// instance (the Render plan in use); switch to a Redis store before scaling
// the API to more than one instance.
import { rateLimit } from 'express-rate-limit';
import config from '../config/environment.js';

function limiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => config.isTest && process.env.ENABLE_RATE_LIMIT_IN_TESTS !== 'true',
    handler: (req, res) =>
      res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message, requestId: req.id } }),
  });
}

export const apiLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 600,
  message: 'Too many requests. Please slow down.',
});

export const loginLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
});

export const passwordResetLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: 'Too many password reset requests. Please try again later.',
});
