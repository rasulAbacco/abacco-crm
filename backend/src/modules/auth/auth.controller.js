import * as authService from './auth.service.js';
import { REFRESH_COOKIE, refreshCookieOptions } from './auth.tokens.js';
import { ok, created, noContent } from '../../utils/apiResponse.js';
import { requestContext } from '../../services/audit/auditService.js';

function sendSession(res, session, status = 200) {
  res.cookie(REFRESH_COOKIE, session.refresh.raw, refreshCookieOptions(session.refresh.expiresAt));
  const body = { accessToken: session.accessToken, user: session.user };
  return status === 201 ? created(res, body) : ok(res, body);
}

function clearRefresh(res) {
  const { expires, ...opts } = refreshCookieOptions(new Date(0));
  res.clearCookie(REFRESH_COOKIE, opts);
}

export async function setup(req, res) {
  return sendSession(res, await authService.setupPrimaryAccount(req.valid.body, requestContext(req)), 201);
}

export async function login(req, res) {
  return sendSession(res, await authService.login(req.valid.body, requestContext(req)));
}

export async function refresh(req, res) {
  try {
    return sendSession(res, await authService.refresh(req.cookies?.[REFRESH_COOKIE], requestContext(req)));
  } catch (err) {
    clearRefresh(res);
    throw err;
  }
}

export async function logout(req, res) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE], { allSessions: req.valid.body.allSessions, userId: req.user?.id });
  clearRefresh(res);
  return noContent(res);
}

export async function forgotPassword(req, res) {
  await authService.forgotPassword(req.valid.body.email, requestContext(req));
  return ok(res, { message: 'If that email belongs to an account, a reset link is on its way.' });
}

export async function resetPassword(req, res) {
  await authService.resetPassword(req.valid.body, requestContext(req));
  clearRefresh(res);
  return ok(res, { message: 'Password updated. Please sign in.' });
}

export async function changePassword(req, res) {
  return sendSession(res, await authService.changePassword(req.user.id, req.valid.body, requestContext(req)));
}

export async function me(req, res) {
  return ok(res, await authService.getMe(req.user.id));
}

export async function updateMe(req, res) {
  return ok(res, await authService.updateProfile(req.user.id, req.valid.body));
}
