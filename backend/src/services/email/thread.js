// Follow-ups that reply to the previous email, the way Outlook and Gmail do it:
//
//   <new message>
//   ________________________________
//   From: Robert Jackson <robert@crmconnectleads.com>
//   Sent: Wednesday, November 12, 2026 10:03 AM
//   To: lead@client.com
//   Subject: Quick question
//
//   <the earlier email, including anything it quoted>
//
// plus In-Reply-To / References headers and a "RE:" subject, so the recipient's mail app
// shows it in the same conversation.
//
// Where the earlier email comes from, for each recipient:
//   1. The last email this Sales ID's campaigns sent to that address (exact copy, from
//      campaign_recipients.sentHtml; older sends are rebuilt from the campaign + merge data).
//   2. Otherwise the lead's "Previous pitch" (sent outside the CRM, e.g. from Gmail),
//      with the lead's subject line.
//   3. Otherwise nothing is quoted and the email goes out as a normal message.
import {
  personalize,
  htmlToText,
  sanitizeEmailHtml,
} from "./messageBuilder.js";

const MAX_REFS = 10;

const escapeHtml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

/** Content between <body> and </body> (or the whole string when it is not a full document). */
export function bodyInner(html) {
  const s = String(html ?? "");
  const m = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(s);
  const inner = (m ? m[1] : s).trim();
  // Drop the layout wrapper messageBuilder adds, so quotes don't get narrower each reply.
  const w =
    /^<div style="max-width:640px;margin:0 auto;padding:16px">([\s\S]*)<\/div>$/.exec(
      inner,
    );
  return (w ? w[1] : inner).trim();
}

/** Plain text (a pitch typed in Excel) as simple HTML paragraphs. */
export function textToHtml(text) {
  return String(text ?? "")
    .trim()
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

/** "Quick question" -> "RE: Quick question"; never "RE: RE: …". */
export function replySubject(subject) {
  const s = String(subject ?? "").trim();
  if (!s) return "";
  return /^(re|aw|sv|antw)\s*:/i.test(s) ? s : `RE: ${s}`;
}

/** Outlook's "Wednesday, November 12, 2026 10:03 AM" in the sender's time zone. */
export function outlookDate(date, timeZone = "UTC") {
  if (!date) return "";
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(new Date(date))
      .map((x) => [x.type, x.value]),
  );
  return `${p.weekday}, ${p.month} ${p.day}, ${p.year} ${p.hour}:${p.minute} ${p.dayPeriod}`;
}

const addr = (name, email) => (name ? `${name} <${email}>` : email);

/**
 * The quoted earlier email, as HTML and text.
 * prev: { fromName, fromEmail, to, cc[], sentAt, subject, html, text }
 */
export function quoteBlock(prev, { timeZone } = {}) {
  const lines = [
    ["From", addr(prev.fromName, prev.fromEmail)],
    ["Sent", outlookDate(prev.sentAt, timeZone)],
    ["To", prev.to],
    ["Cc", (prev.cc ?? []).join("; ")],
    ["Subject", prev.subject],
  ].filter(([, v]) => v);
  const head = lines
    .map(([k, v]) => `<b>${k}:</b> ${escapeHtml(v)}`)
    .join("<br>");
  const html =
    `<div class="abacco-quote" style="margin-top:24px">` +
    `<hr style="display:inline-block;width:98%;border:none;border-top:1px solid #e1e1e1" tabindex="-1">` +
    `<div dir="ltr"><font face="Calibri, Arial, sans-serif" color="#000000" style="font-size:11pt">${head}</font><div>&nbsp;</div></div>` +
    `<div>${bodyInner(prev.html)}</div>` +
    `</div>`;
  const text =
    `\n\n________________________________\n` +
    lines.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\n${prev.text ?? htmlToText(prev.html)}`;
  return { html, text };
}

/** References for a reply: the earlier email's references plus its own Message-ID (last 10). */
export function replyReferences(prev) {
  if (!prev?.messageId) return null;
  const ids = `${prev.threadRefs ?? ""} ${prev.messageId}`
    .split(/\s+/)
    .filter(Boolean);
  return [...new Set(ids)].slice(-MAX_REFS).join(" ");
}

/** One sent campaign_recipients row (joined with its campaign / sender) as an earlier email. */
function toPrev(r, workspaceName) {
  const fromName = r.fromName ?? r.smtpFromName ?? null;
  let subject = r.sentSubject;
  let html = r.sentHtml;
  let text = r.sentText;
  if (!html) {
    // Sent before this update: rebuild it from the campaign and the merge snapshot.
    const m = r.mergeData ?? {};
    const vars = {
      firstName: m.firstName,
      lastName: m.lastName,
      fullName: [m.firstName, m.lastName].filter(Boolean).join(" "),
      email: r.email,
      company: m.company,
      designation: m.designation,
      city: m.city,
      subjectLine: m.subjectLine,
      previousPitch: m.previousPitch,
      followUpPitch: m.followUpPitch,
      senderName: fromName,
      salesIdName: workspaceName,
      unsubscribeUrl: "",
    };
    html = sanitizeEmailHtml(personalize(r.html ?? "", vars, { html: true }));
    text = r.text ? personalize(r.text, vars) : htmlToText(html);
    subject = subject ?? personalize(r.subject ?? "", vars).trim();
  }
  return {
    source: "EMAIL",
    campaignName: r.campaignName,
    messageId: r.messageId,
    threadRefs: r.threadRefs,
    sentAt: r.sentAt,
    fromName,
    fromEmail: r.fromEmail,
    to: r.email,
    cc: r.sentCc?.length ? r.sentCc : (r.ccEmails ?? []),
    subject,
    html,
    text,
  };
}

/**
 * The last email each address got from this Sales ID's campaigns (status SENT).
 * Returns Map(emailNormalized -> prev) where prev has everything quoteBlock() needs plus
 * { messageId, threadRefs, source: "EMAIL", campaignName }.
 */
export async function findPreviousEmails(
  db,
  {
    accountId,
    workspaceId,
    emails,
    excludeCampaignId = null,
    workspaceName = "",
  },
) {
  const list = [...new Set((emails ?? []).filter(Boolean))];
  if (!list.length) return new Map();
  const rows = await db.$queryRaw`
    SELECT DISTINCT ON (r."emailNormalized")
           r."emailNormalized", r.email, r."messageId", r."threadRefs", r."sentAt",
           r."sentSubject", r."sentHtml", r."sentText", r."sentCc", r."ccEmails", r."mergeData", r."trackingToken",
           c.name AS "campaignName", c.subject, c.html, c.text, c."fromName",
           s."fromEmail", s."fromName" AS "smtpFromName"
      FROM campaign_recipients r
      JOIN campaigns c ON c.id = r."campaignId"
      LEFT JOIN smtp_accounts s ON s.id = r."smtpAccountId"
     WHERE c."accountId" = ${accountId}::uuid
       AND c."ownerWorkspaceId" = ${workspaceId}::uuid
       AND c."deletedAt" IS NULL
       AND r."emailNormalized" = ANY(${list}::text[])
       AND r.status = 'SENT'
       AND r."sentAt" IS NOT NULL
       AND (${excludeCampaignId}::uuid IS NULL OR r."campaignId" <> ${excludeCampaignId}::uuid)
     ORDER BY r."emailNormalized", r."sentAt" DESC`;
  const out = new Map();
  for (const r of rows) out.set(r.emailNormalized, toPrev(r, workspaceName));
  return out;
}

/** The lead's "Previous pitch" as the earlier email (no date, no Message-ID). */
export function previousFromPitch(mergeData, { to, fromName, fromEmail }) {
  const pitch = String(mergeData?.previousPitch ?? "").trim();
  if (!pitch) return null;
  return {
    source: "PITCH",
    messageId: null,
    threadRefs: null,
    sentAt: null,
    fromName,
    fromEmail,
    to,
    cc: [],
    subject: mergeData?.subjectLine ?? "",
    html: textToHtml(pitch),
    text: pitch,
  };
}

/** Everything buildMessage() needs to send `prev`'s follow-up. */
export function buildReply(prev, { timeZone } = {}) {
  if (!prev) return null;
  return {
    quote: quoteBlock(prev, { timeZone }),
    subject: replySubject(prev.subject),
    inReplyTo: prev.messageId ?? null,
    references: replyReferences(prev),
    source: prev.source,
  };
}

/**
 * The earlier email for one recipient of a follow-up campaign: the last CRM email,
 * else the lead's "Previous pitch", else null.
 */
export async function previousFor(
  db,
  { campaign, recipient, workspaceName, fromName, fromEmail },
) {
  const found = await findPreviousEmails(db, {
    accountId: campaign.accountId,
    workspaceId: campaign.ownerWorkspaceId,
    emails: [recipient.emailNormalized],
    excludeCampaignId: campaign.id ?? null,
    workspaceName,
  });
  return (
    found.get(recipient.emailNormalized) ??
    previousFromPitch(recipient.mergeData, {
      to: recipient.email,
      fromName,
      fromEmail,
    })
  );
}

/** Every email this Sales ID's campaigns sent to one address, newest first (for the lead page). */
export async function conversationWith(
  db,
  { accountId, workspaceId, email, workspaceName = "", limit = 50 },
) {
  if (!email) return [];
  const rows = await db.$queryRaw`
    SELECT r."emailNormalized", r.email, r."messageId", r."threadRefs", r."sentAt", r.status, r."firstOpenedAt", r."firstClickedAt",
           r."sentSubject", r."sentHtml", r."sentText", r."sentCc", r."ccEmails", r."mergeData", r."inReplyTo",
           c.id AS "campaignId", c.name AS "campaignName", c.subject, c.html, c.text, c."fromName",
           s."fromEmail", s."fromName" AS "smtpFromName"
      FROM campaign_recipients r
      JOIN campaigns c ON c.id = r."campaignId"
      LEFT JOIN smtp_accounts s ON s.id = r."smtpAccountId"
     WHERE c."accountId" = ${accountId}::uuid
       AND c."ownerWorkspaceId" = ${workspaceId}::uuid
       AND c."deletedAt" IS NULL
       AND r."emailNormalized" = ${email}
       AND r."sentAt" IS NOT NULL
     ORDER BY r."sentAt" DESC
     LIMIT ${limit}`;
  return rows.map((r) => ({
    ...toPrev(r, workspaceName),
    campaignId: r.campaignId,
    status: r.status,
    isFollowUp: !!r.inReplyTo,
    opened: !!r.firstOpenedAt,
    clicked: !!r.firstClickedAt,
  }));
}
