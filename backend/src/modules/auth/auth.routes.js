import { Router } from 'express';
import * as c from './auth.controller.js';
import * as v from './auth.validator.js';
import { validate } from '../../middleware/validationMiddleware.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { loginLimiter, passwordResetLimiter } from '../../middleware/rateLimitMiddleware.js';
import { AppError } from '../../utils/errors.js';

// Cookie-authenticated endpoints must carry a custom header. Browsers cannot
// add one cross-origin without a CORS preflight the API would refuse, which
// blocks CSRF even if the cookie's SameSite setting is relaxed.
function requireXhr(req, _res, next) {
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return next(new AppError(400, 'MISSING_XHR_HEADER', 'X-Requested-With: XMLHttpRequest is required.'));
  }
  return next();
}

// Logout works with or without a valid access token.
async function optionalAuth(req, res, next) {
  if (!req.headers.authorization) return next();
  return requireAuth(req, res, (err) => next(err?.status === 401 ? undefined : err));
}

const router = Router();

router.post('/setup', loginLimiter, validate({ body: v.setupSchema }), c.setup);
router.post('/login', loginLimiter, validate({ body: v.loginSchema }), c.login);
router.post('/refresh', requireXhr, c.refresh);
router.post('/logout', requireXhr, optionalAuth, validate({ body: v.logoutSchema }), c.logout);
router.post('/forgot-password', passwordResetLimiter, validate({ body: v.forgotSchema }), c.forgotPassword);
router.post('/reset-password', passwordResetLimiter, validate({ body: v.resetSchema }), c.resetPassword);
router.post('/change-password', requireAuth, requireXhr, validate({ body: v.changePasswordSchema }), c.changePassword);
router.get('/me', requireAuth, c.me);
router.patch('/me', requireAuth, validate({ body: v.profileSchema }), c.updateMe);

export default router;
