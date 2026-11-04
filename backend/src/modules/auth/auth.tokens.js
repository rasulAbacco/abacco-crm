// Token primitives: signed JWT access tokens (kept in memory by the frontend)
// and opaque refresh tokens (httpOnly cookie, stored only as a SHA-256 hash).
import jwt from 'jsonwebtoken';
import config from '../../config/environment.js';
import { randomToken, sha256 } from '../../utils/normalize.js';

const ISSUER = 'abacco-crm';
const AUDIENCE = 'abacco-crm-web';

export function signAccessToken(user) {
  return jwt.sign({ acc: user.accountId, typ: 'access' }, config.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: config.JWT_ACCESS_TTL,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token) {
  const claims = jwt.verify(token, config.JWT_ACCESS_SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  });
  if (claims.typ !== 'access') throw new jwt.JsonWebTokenError('wrong token type');
  return claims;
}

export function newOpaqueToken() {
  const raw = randomToken(48);
  return { raw, hash: sha256(raw) };
}

export const REFRESH_COOKIE = 'abacco_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function refreshCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.COOKIE_SAMESITE,
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  };
}
