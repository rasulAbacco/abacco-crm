// Builds the final email for one recipient: personalisation, tracking links,
// open pixel, compliance footer and List-Unsubscribe headers (RFC 8058).
import sanitizeHtml from "sanitize-html";
import { convert } from "html-to-text";
import crypto from "node:crypto";
import config from "../../config/environment.js";

export const MERGE_FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "email",
  "company",
  "designation",
  "city",
  "country",
  "senderName",
  "salesIdName",
  "unsubscribeUrl",
];

const escapeHtml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

/** {{firstName}} or {{firstName|there}} (fallback). Values are HTML-escaped in HTML parts. */
export function personalize(template, vars, { html = false } = {}) {
  if (!template) return template;
  return template.replace(
    /\{\{\s*([a-zA-Z]+)\s*(?:\|\s*([^}]*))?\}\}/g,
    (_, key, fallback) => {
      const v = vars[key];
      const out =
        v === undefined || v === null || v === ""
          ? (fallback ?? "").trim()
          : String(v);
      return html && key !== "unsubscribeUrl" ? escapeHtml(out) : out;
    },
  );
}

export function sanitizeEmailHtml(html) {
  return sanitizeHtml(html ?? "", {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "h3",
      "h4",
      "span",
      "center",
      "font",
      "u",
      "s",
      "hr",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "style",
    ]),
    allowedAttributes: {
      "*": [
        "style",
        "class",
        "align",
        "width",
        "height",
        "bgcolor",
        "border",
        "cellpadding",
        "cellspacing",
        "valign",
        "dir",
        "role",
      ],
      a: ["href", "name", "target", "title", "style", "class"],
      img: ["src", "alt", "width", "height", "style", "border"],
      font: ["color", "face", "size"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowVulnerableTags: true, // <style> for email client CSS; scripts and event handlers are still removed
    disallowedTagsMode: "discard",
  });
}

export function htmlToText(html) {
  return convert(html ?? "", {
    wordwrap: 100,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
    ],
  });
}

export const urlHash = (url) =>
  crypto.createHash("sha256").update(url).digest("hex").slice(0, 32);

/** All http(s) links in the HTML (unique). */
export function extractLinks(html) {
  const out = new Set();
  for (const m of (html ?? "").matchAll(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi,
  )) {
    const href = m[1].trim();
    if (/^https?:\/\//i.test(href) && !href.includes("{{")) out.add(href);
  }
  return [...out];
}

export function mergeVars(recipient, { workspace, campaign }) {
  const m = recipient.mergeData ?? {};
  return {
    firstName: m.firstName,
    lastName: m.lastName,
    fullName: [m.firstName, m.lastName].filter(Boolean).join(" "),
    email: recipient.email,
    company: m.company,
    designation: m.designation,
    city: m.city,
    subjectLine: m.subjectLine, // the lead's / contact's own subject line
    country: recipient.countryCode,
    senderName: campaign.fromName,
    salesIdName: workspace.name,
    unsubscribeUrl: `${config.API_PUBLIC_URL}/u/${recipient.trackingToken}`,
  };
}

// Company name / address are optional (many teams put them in the pitch itself):
// a line appears only when it is filled in. The unsubscribe link is always added.
function footer({ workspace, account, unsubscribeUrl }) {
  const legal = (workspace.senderLegalName ?? account.legalName ?? "").trim();
  const address = (
    workspace.senderPostalAddress ??
    account.postalAddress ??
    ""
  ).trim();
  const lines = [
    legal && escapeHtml(legal),
    address && escapeHtml(address).replace(/\n/g, "<br>"),
  ].filter(Boolean);
  return {
    html: `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#6b7280;text-align:center">
${lines.map((l) => `${l}<br>`).join("")}<a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a></div>`,
    text: `\n\n--\n${[legal, address]
      .filter(Boolean)
      .map((l) => `${l}\n`)
      .join("")}Unsubscribe: ${unsubscribeUrl}`,
  };
}

/** "Follow up - {{subjectLine}}" with no subject line on file must not end in a dangling " - ". */
export function finalSubject(template, vars, fallback = "") {
  const s = personalize(template, vars)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s\-–—:|,]+|[\s\-–—:|,]+$/g, "")
    .trim();
  return s || fallback;
}

/**
 * campaign: { subject, html, text, fromName, fromEmail, replyTo, trackOpens, trackClicks }
 * links: Map(url → trackedLinkId)
 */
export function buildMessage({
  campaign,
  recipient,
  workspace,
  account,
  links = new Map(),
  messageId,
}) {
  const vars = mergeVars(recipient, { workspace, campaign });
  const base = config.API_PUBLIC_URL;
  let html = personalize(campaign.html, vars, { html: true });
  if (campaign.trackClicks && links.size) {
    html = html.replace(
      /(<a\b[^>]*\bhref\s*=\s*["'])([^"']+)(["'])/gi,
      (all, pre, href, post) => {
        const id = links.get(href.trim());
        return id
          ? `${pre}${base}/t/c/${recipient.trackingToken}/${id}${post}`
          : all;
      },
    );
  }
  const f = footer({ workspace, account, unsubscribeUrl: vars.unsubscribeUrl });
  const pixel = campaign.trackOpens
    ? `<img src="${base}/t/o/${recipient.trackingToken}.gif" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`
    : "";
  const hasUnsub = /\{\{\s*unsubscribeUrl/.test(campaign.html ?? "");
  const finalHtml = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${hasUnsub ? "" : f.html}${pixel}</body>`)
    : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0"><div style="max-width:640px;margin:0 auto;padding:16px">${html}${hasUnsub ? "" : f.html}</div>${pixel}</body></html>`;
  const text =
    (campaign.text
      ? personalize(campaign.text, vars)
      : htmlToText(personalize(campaign.html, vars))) +
    (hasUnsub ? "" : f.text);

  return {
    from: campaign.fromName
      ? { name: campaign.fromName, address: campaign.fromEmail }
      : campaign.fromEmail,
    to: recipient.email,
    replyTo: campaign.replyTo || undefined,
    subject: finalSubject(campaign.subject, vars, campaign.name ?? ""),
    html: finalHtml,
    text,
    messageId,
    headers: {
      "List-Unsubscribe": `<${vars.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Abacco-Recipient": recipient.trackingToken,
    },
  };
}
