// src/utils/mailer.js
// Microsoft Graph email sender for PR/PO notifications.
//
// Why Graph (not SMTP app password): Microsoft 365 increasingly blocks SMTP AUTH /
// app passwords. Graph is the modern, supported way. It needs an app registered in
// the client's Microsoft Entra (Azure AD) admin — see EMAIL_SETUP.md.
//
// ── Setup (in your backend .env) ────────────────────────────────────────────
//   MAIL_ENABLED=false                       # keep false until ready; nothing sends while false
//   MAIL_FROM=vaaaa@bondbuild.com.sg         # the mailbox to send from (must exist in the tenant)
//   MAIL_FROM_NAME=Bond Build Procurement    # optional display name
//   MS_TENANT_ID=xxxxxxxx-xxxx-...           # Directory (tenant) ID  — from Entra admin
//   MS_CLIENT_ID=xxxxxxxx-xxxx-...           # Application (client) ID — from Entra admin
//   MS_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxx     # client secret VALUE     — from Entra admin
//
// The app registration needs Microsoft Graph Application permission "Mail.Send"
// with admin consent granted. (Optionally scoped to just MAIL_FROM via an
// Application Access Policy.)
//
// Emails NEVER block the workflow: if sending fails (or MAIL_ENABLED=false),
// the calling code continues normally and the error is just logged.
//
// Requires: npm install @azure/msal-node   (uses built-in fetch on Node 18+)
let msal = null;
try { msal = require("@azure/msal-node"); } catch { /* not installed yet — mailer stays disabled */ }

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPE = "https://graph.microsoft.com/.default";

let cca = null;          // MSAL confidential client
let initTried = false;

function getClient() {
  if (initTried) return cca;
  initTried = true;

  if (process.env.MAIL_ENABLED !== "true") return (cca = null);
  if (!msal) { console.warn("[mailer] @azure/msal-node not installed — emails disabled"); return (cca = null); }

  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MAIL_FROM } = process.env;
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET || !MAIL_FROM) {
    console.warn("[mailer] Graph env not fully set (MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET/MAIL_FROM) — emails disabled");
    return (cca = null);
  }

  cca = new msal.ConfidentialClientApplication({
    auth: {
      clientId: MS_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${MS_TENANT_ID}`,
      clientSecret: MS_CLIENT_SECRET,
    },
  });
  console.log(`[mailer] Microsoft Graph ready (from ${MAIL_FROM})`);
  return cca;
}

async function getToken() {
  const client = getClient();
  if (!client) return null;
  const res = await client.acquireTokenByClientCredential({ scopes: [SCOPE] });
  return res?.accessToken || null;
}

/**
 * Send an email via Microsoft Graph. Always resolves (never throws).
 * @param {string|string[]} to   recipient email(s); falsy entries ignored
 * @param {string} subject
 * @param {string} html
 */
async function sendMail(to, subject, html, from, attachments) {
  try {
    const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
    if (!recipients.length) return { ok: false, skipped: "no recipient" };

    const token = await getToken();
    if (!token) return { ok: false, skipped: "mail disabled" };

    // Send "as" the acting person — but ONLY when their mailbox is in our own
    // tenant domain (same as MAIL_FROM). Graph cannot send as an external address
    // (a test Gmail, or a user with no real mailbox), so fall back to MAIL_FROM
    // rather than failing the whole email. In production every actor has a real
    // tenant mailbox, so this is true send-as; it only degrades for odd/test data.
    const mailFrom = (process.env.MAIL_FROM || "").trim();
    const tenantDomain = mailFrom.split("@")[1]?.toLowerCase();
    const fromDomain = String(from || "").trim().split("@")[1]?.toLowerCase();
    const fromAddr = (from && fromDomain && fromDomain === tenantDomain)
      ? String(from).trim()
      : mailFrom;
    // Inline file attachments (base64). The caller keeps the total under Graph's
    // 4 MB message limit; larger files are omitted here and flagged in the body.
    const files = (attachments || []).filter((a) => a && a.contentBytes);
    const body = {
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
        ...(files.length ? {
          attachments: files.map((a) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: a.name,
            contentType: a.contentType || "application/octet-stream",
            contentBytes: a.contentBytes,
          })),
        } : {}),
      },
      saveToSentItems: false,
    };

    // POST /users/{from}/sendMail
    const resp = await fetch(`${GRAPH}/users/${encodeURIComponent(fromAddr)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (resp.status === 202) return { ok: true };           // Graph returns 202 Accepted
    const text = await resp.text().catch(() => "");
    console.error(`[mailer] Graph send failed (${resp.status}) — workflow continues:`, text.slice(0, 300));
    return { ok: false, error: `Graph ${resp.status}` };
  } catch (err) {
    console.error("[mailer] send failed (workflow continues):", err.message);
    return { ok: false, error: err.message };
  }
}

// Fire-and-forget: never blocks the request.
function sendMailAsync(to, subject, html, from, attachments) {
  sendMail(to, subject, html, from, attachments).catch(() => {});
}

module.exports = { sendMail, sendMailAsync };
