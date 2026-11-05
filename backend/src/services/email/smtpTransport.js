// Nodemailer transports for saved SMTP accounts. Credentials are decrypted
// only here, in memory, and never logged or returned by the API.
import nodemailer from "nodemailer";
import { decryptJson } from "../encryption/encryptionService.js";

const cache = new Map(); // smtpAccountId → { version, transport }

export const credentialAad = (id) => `smtp:${id}`;

function transportOptions(account, { pool }) {
  const secret = decryptJson(
    {
      ciphertext: account.credentialCiphertext,
      iv: account.credentialIv,
      tag: account.credentialTag,
      keyVersion: account.credentialKeyVersion,
    },
    credentialAad(account.id),
  );
  const auth =
    account.authType === "OAUTH2"
      ? {
          type: "OAuth2",
          user: account.username,
          clientId: secret.clientId,
          clientSecret: secret.clientSecret,
          refreshToken: secret.refreshToken,
        }
      : { user: account.username, pass: secret.password };
  return {
    host: account.host,
    port: account.port,
    secure: account.security === "SSL",
    requireTLS: account.security === "STARTTLS",
    ignoreTLS: account.security === "NONE",
    auth,
    pool,
    maxConnections: 2,
    maxMessages: 100,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
    tls: {
      minVersion: "TLSv1.2",
      ...(process.env.SMTP_ALLOW_SELF_SIGNED === "true"
        ? { rejectUnauthorized: false }
        : {}),
    },
  };
}

export function getTransport(account) {
  const version = account.updatedAt?.getTime?.() ?? 0;
  const hit = cache.get(account.id);
  if (hit && hit.version === version) return hit.transport;
  if (hit) hit.transport.close();
  const transport = nodemailer.createTransport(
    transportOptions(account, { pool: true }),
  );
  cache.set(account.id, { version, transport });
  return transport;
}

export async function verifyAccount(account) {
  const t = nodemailer.createTransport(
    transportOptions(account, { pool: false }),
  );
  try {
    await t.verify();
  } finally {
    t.close();
  }
}

export function closeAllTransports() {
  for (const { transport } of cache.values()) transport.close();
  cache.clear();
}

/**
 * AUTH: credentials rejected → disable account, try another.
 * CONNECTION: network / TLS / timeout → back off the account, retry later.
 * PERMANENT: recipient rejected with 5xx → no retry (hard bounce when mailbox unknown).
 * TEMPORARY: 4xx → retry with backoff.
 */
export function classifySmtpError(err) {
  const code = err?.responseCode;
  const msg = `${err?.response ?? ""} ${err?.message ?? ""}`;
  // Stored credentials unreadable (key changed): treat like a rejected sign-in — stop using the account.
  if (err?.code === "ECREDENTIALS") return { kind: "AUTH" };
  if (err?.code === "EAUTH" || code === 535 || code === 534 || code === 530)
    return { kind: "AUTH" };
  if (
    [
      "ECONNECTION",
      "ETIMEDOUT",
      "ESOCKET",
      "EDNS",
      "ETLS",
      "ECONNREFUSED",
      "ECONNRESET",
      "EPROTOCOL",
    ].includes(err?.code) &&
    !code
  )
    return { kind: "CONNECTION" };
  if (code === 421 || code === 454) return { kind: "CONNECTION" };
  if (code >= 500) {
    const hardBounce =
      code === 550 ||
      code === 551 ||
      code === 553 ||
      /5\.1\.[0-3]|user unknown|no such user|does not exist|mailbox unavailable/i.test(
        msg,
      );
    if (/rate|limit|too many|quota/i.test(msg)) return { kind: "RATE_LIMITED" };
    return { kind: "PERMANENT", hardBounce };
  }
  if (code >= 400)
    return /rate|limit|too many|quota/i.test(msg)
      ? { kind: "RATE_LIMITED" }
      : { kind: "TEMPORARY" };
  return { kind: "CONNECTION" };
}

export function safeSmtpError(err) {
  // Server replies can echo the username; never the password. Keep it short.
  return String(err?.response ?? err?.message ?? "SMTP error")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}
