import * as s from './tracking.service.js';
import config from '../../config/environment.js';
import logger from '../../config/logger.js';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function page(res, title, body, status = 200) {
  res.status(status).type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#111827;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;max-width:440px;width:100%;box-shadow:0 1px 2px rgba(0,0,0,.04)}h1{font-size:20px;margin:0 0 12px}p{color:#4b5563;line-height:1.5}
button{background:#1d4ed8;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer}</style></head><body><div class="card">${body}</div></body></html>`);
}

export async function open(req, res) {
  const token = req.params.file.replace(/\.gif$/, '');
  s.trackOpen(token, meta(req)).catch((err) => logger.error({ err }, 'open tracking failed'));
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private', Pragma: 'no-cache' });
  return res.end(GIF);
}

export async function click(req, res) {
  const url = await s.trackClick(req.params.token, req.params.linkId, meta(req)).catch(() => null);
  if (!url) return page(res, 'Link not found', '<h1>Link not found</h1><p>This link is no longer available.</p>', 404);
  return res.redirect(302, url);
}

export async function unsubscribePage(req, res) {
  const info = await s.describeToken(req.params.token);
  if (!info) return page(res, 'Link not valid', '<h1>Link not valid</h1><p>This unsubscribe link is not valid.</p>', 404);
  if (info.test) return page(res, 'Test email', '<h1>This was a test email</h1><p>Unsubscribe links in test emails do nothing.</p>');
  if (info.already) return page(res, 'Unsubscribed', `<h1>You are unsubscribed</h1><p>${esc(info.email)} will not receive further emails from ${esc(info.sender)}.</p>`);
  // A button (POST) — mail scanners that pre-fetch links must not unsubscribe people.
  return page(res, 'Unsubscribe', `<h1>Unsubscribe</h1><p>Stop emails from ${esc(info.sender)} to <strong>${esc(info.email)}</strong>?</p><form method="post"><button type="submit">Unsubscribe</button></form>`);
}

export async function unsubscribe(req, res) {
  const oneClick = req.body?.['List-Unsubscribe'] === 'One-Click';
  const result = await s.unsubscribe(req.params.token, { ...meta(req), source: oneClick ? 'LIST_UNSUBSCRIBE_POST' : 'UNSUBSCRIBE_LINK' });
  if (!result) return oneClick ? res.status(404).end() : page(res, 'Link not valid', '<h1>Link not valid</h1>', 404);
  if (oneClick) return res.status(200).type('text').send('Unsubscribed');
  if (result.test) return page(res, 'Test email', '<h1>This was a test email</h1><p>Nothing changed.</p>');
  return page(res, 'Unsubscribed', `<h1>You are unsubscribed</h1><p>${esc(result.email)} will not receive further marketing emails from us. This can take effect immediately; no further action is needed.</p>`);
}

export async function sesWebhook(req, res) {
  let m;
  try {
    m = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).end();
  }
  const allowed = (process.env.SES_SNS_TOPIC_ARNS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(m.TopicArn)) return res.status(403).end();
  try {
    if (!(await s.verifySnsMessage(m))) return res.status(403).end();
  } catch (err) {
    logger.warn({ err: { message: err.message } }, 'SNS signature check failed');
    return res.status(403).end();
  }
  if (m.Type === 'SubscriptionConfirmation') {
    const u = new URL(m.SubscribeURL);
    if (u.protocol === 'https:' && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname)) await fetch(m.SubscribeURL);
    logger.info({ topic: m.TopicArn }, 'SNS subscription confirmed');
    return res.status(200).end();
  }
  if (m.Type === 'Notification') await s.handleSesNotification(m.Message);
  return res.status(200).end();
}

export const apiBase = () => config.API_PUBLIC_URL;
