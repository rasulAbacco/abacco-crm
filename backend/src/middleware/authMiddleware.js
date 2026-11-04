// Verifies the short-lived access token (Authorization: Bearer …) and loads
// the user, so deactivation and password changes take effect immediately.
import { verifyAccessToken } from '../modules/auth/auth.tokens.js';
import prisma from '../prisma/client.js';
import { unauthorized } from '../utils/errors.js';

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());

  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch (err) {
    return next(
      unauthorized(
        err.name === 'TokenExpiredError' ? 'Session expired.' : 'Invalid session.',
        err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      ),
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, accountId: true, email: true, name: true, isActive: true, passwordChangedAt: true, timezone: true, locale: true },
  });
  if (!user || !user.isActive || user.accountId !== claims.acc) return next(unauthorized('Invalid session.', 'INVALID_TOKEN'));
  if (user.passwordChangedAt && claims.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
    return next(unauthorized('Password changed. Please sign in again.', 'TOKEN_REVOKED'));
  }

  req.user = user;
  req.accountId = user.accountId;
  return next();
}

export default requireAuth;
