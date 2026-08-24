// src/utils/notifyEmail.js
// Looks up who should get an email (by role) and sends a templated message.
// Pairs with the in-app po_notifications inbox — this just adds the email channel.
// Non-blocking: uses sendMailAsync so the request never waits on email.
const db = require("../config/db");
const spaces = require("../config/spaces");
const { sendMailAsync } = require("./mailer");

// Get active users' emails for one or more roles
async function emailsForRoles(roles) {
  try {
    const { rows } = await db.query(
      `SELECT email FROM users
       WHERE role = ANY($1) AND status = 'Active' AND email IS NOT NULL AND email <> ''`,
      [roles]
    );
    return rows.map((r) => r.email);
  } catch {
    return []; // email column may not exist yet — just skip
  }
}

// The app's public URL, for the "View in InventoryOpz" button. Prefers an
// explicit APP_URL, else the first non-localhost origin in CORS_ORIGINS/CLIENT_URL.
function appUrl() {
  const raw = process.env.APP_URL || process.env.CORS_ORIGINS || process.env.CLIENT_URL || "";
  const first = raw.split(",").map((s) => s.trim()).filter(Boolean)
    .find((o) => /^https?:\/\//.test(o) && !/localhost|127\.0\.0\.1/.test(o));
  return (first || "").replace(/\/+$/, "");
}

// Microsoft Graph caps a sendMail request at 4 MB TOTAL (base64 inflates raw
// bytes ~1.37x), so keep the combined raw attachment size under ~2.7 MB — the
// email body is only a few KB. Files over the remaining budget are not attached;
// they're listed with a "too large" note pointing at the app instead.
const MAX_EMAIL_ATTACH_TOTAL = 2_700_000; // raw bytes across all files in one email

// Collect a Spaces object stream into a Buffer.
async function streamToBuffer(stream) {
  if (!stream) return Buffer.alloc(0);
  if (typeof stream.transformToByteArray === "function") {
    return Buffer.from(await stream.transformToByteArray()); // AWS SDK v3 helper
  }
  const chunks = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

// A PR's files (whole-PR + per-item), fetched from Spaces and split into two
// buckets: `files` small enough to attach inline (base64), and `skipped` (too
// large for email) to list with a note. Never throws — failures just skip.
async function attachmentsForPr(prNo) {
  if (!prNo) return { files: [], skipped: [] };
  let rows;
  try {
    const r = await db.query(
      `SELECT a.original_name, a.mime_type, a.size_bytes, a.file_path FROM pr_attachments a
         JOIN purchase_requests pr ON pr.id = a.pr_id WHERE pr.pr_no = $1
       UNION ALL
       SELECT ia.original_name, ia.mime_type, ia.size_bytes, ia.file_path FROM pr_item_attachments ia
         JOIN purchase_requests pr ON pr.id = ia.pr_id WHERE pr.pr_no = $1`,
      [prNo]
    );
    rows = r.rows;
  } catch {
    return { files: [], skipped: [] };
  }

  const files = [], skipped = [];
  let total = 0;
  for (const row of rows.slice(0, 25)) {
    const size = Number(row.size_bytes) || 0;
    const mb = (size / 1048576).toFixed(1);
    if (size === 0 || total + size > MAX_EMAIL_ATTACH_TOTAL) {
      skipped.push({ name: row.original_name, mb });
      continue;
    }
    try {
      const obj = await spaces.getObject(row.file_path);
      const buf = await streamToBuffer(obj.Body);
      files.push({
        name: row.original_name,
        contentType: row.mime_type || obj.ContentType || "application/octet-stream",
        contentBytes: buf.toString("base64"),
      });
      total += size;
    } catch {
      skipped.push({ name: row.original_name, mb });
    }
  }
  return { files, skipped };
}

// Minimal HTML-escape — only for user-supplied file names in the list. The
// message `lines` are our own trusted HTML and are intentionally not escaped.
const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Professional HTML shell shared by every notification email. `opts.attachedNames`
// are the file names attached to this email; `opts.skipped` are [{name, mb}] files
// too large to attach, shown as a short note pointing at the app.
function wrap(title, lines, prNo, poNo, opts = {}) {
  const attachedNames = opts.attachedNames || [];
  const skipped = opts.skipped || [];
  const url = appUrl();
  const ref = [prNo && `PR ${prNo}`, poNo && `PO ${poNo}`].filter(Boolean).join(" &nbsp;·&nbsp; ");

  const attachedHtml = attachedNames.length
    ? `<div style="font-size:12px;font-weight:700;color:#4F46E5;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">📎 Attached (${attachedNames.length})</div>
       ${attachedNames.map((n) => `<div style="font-size:13px;color:#374151;padding:3px 0;border-bottom:1px solid #F0F0F6">${escapeHtml(n)}</div>`).join("")}`
    : "";
  const skippedHtml = skipped.length
    ? `<div style="font-size:12.5px;color:#B45309;background:#FEF6E7;border:1px solid #F3D9A4;border-radius:6px;padding:9px 11px;margin-top:${attachedNames.length ? "10px" : "0"}">
         ${skipped.map((s) => `⚠️ <b>${escapeHtml(s.name)}</b> (${s.mb}&nbsp;MB) is too large to attach — open the ${poNo ? "PO" : "PR"} in InventoryOpz to download it.`).join("<br>")}
       </div>`
    : "";
  const attachHtml = (attachedNames.length || skipped.length)
    ? `<div style="margin:18px 0 4px;padding:12px 14px;background:#F8F9FF;border:1px solid #E6E6F0;border-radius:8px">${attachedHtml}${skippedHtml}</div>`
    : "";

  const button = url
    ? `<div style="margin:22px 0 4px"><a href="${url}" style="display:inline-block;background:#6366F1;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 22px;border-radius:8px">View in InventoryOpz →</a></div>`
    : "";

  return `
  <div style="font-family:-apple-system,Segoe UI,Arial,Helvetica,sans-serif;max-width:600px;margin:auto;background:#ffffff;border:1px solid #E6E6F0;border-radius:12px;overflow:hidden">
    <div style="background:#6366F1;padding:16px 22px">
      <div style="color:#ffffff;font-size:16px;font-weight:800;letter-spacing:-.01em">Bond Build · Procurement</div>
      <div style="color:#C7D2FE;font-size:11px;font-weight:600;margin-top:2px;text-transform:uppercase;letter-spacing:.08em">InventoryOpz</div>
    </div>
    <div style="padding:22px">
      <h2 style="margin:0 0 12px;font-size:18px;color:#1E1B4B;font-weight:800">${title}</h2>
      ${lines.map((l) => `<p style="margin:8px 0;font-size:14px;line-height:1.6;color:#374151">${l}</p>`).join("")}
      ${ref ? `<p style="margin:14px 0 0;font-size:12px;color:#9CA3AF;font-weight:600">${ref}</p>` : ""}
      ${attachHtml}
      ${button}
    </div>
    <div style="background:#F7F7FB;padding:14px 22px;font-size:11px;color:#9CA3AF;border-top:1px solid #F0F0F6">
      Automated message from InventoryOpz · Bond Building Products Pte. Ltd. Please log in to take action.
    </div>
  </div>`;
}

// The stage-by-stage emails. Each takes a context object and fires async.
//
// NOTE: PR-submitted, PR-approved and POs-created are NOT here. Those three
// events address named individuals (the drafter who raised it, the manager who
// approved it, the purchaser who raised the PO) as well as whole roles, so they
// live in utils/notifyEvent.js where the in-app and email audiences are built
// once, from the same list. Adding role-only copies back here would double-send.
const Email = {
  prRejected: async (pr, sentBack, reason) => {
    sendMailAsync(await emailsForRoles(["Drafter"]),
      sentBack ? `PR ${pr.pr_no} sent back for changes` : `PR ${pr.pr_no} rejected`,
      wrap(sentBack ? "Your PR was sent back" : "Your PR was rejected",
        [sentBack ? `<b>${pr.pr_no}</b> needs changes before it can proceed.` : `<b>${pr.pr_no}</b> was rejected.`,
         reason ? `Reason: <i>${reason}</i>` : "",
         sentBack ? "Please edit and resubmit." : ""].filter(Boolean), pr.pr_no));
  },
  stockToFic: async (pr) => {
    sendMailAsync(await emailsForRoles(["Factory In-charge"]), `Stock to issue for ${pr.pr_no}`,
      wrap("Please issue stock for a purchase request",
        [`The Purchaser has sent stock items from <b>${pr.pr_no}</b> (${pr.project_name || pr.job_no}).`,
         "Please issue the listed quantities from their factory locations."], pr.pr_no));
  },
  stockIssued: async (pr) => {
    sendMailAsync(await emailsForRoles(["Purchaser"]), `Stock issued for ${pr.pr_no}`,
      wrap("Stock has been issued",
        [`The Factory In-charge has issued the stock portion of <b>${pr.pr_no}</b>.`,
         "You can now generate the purchase orders."], pr.pr_no));
  },
  deliveryStage: async (po, stageLabel) => {
    sendMailAsync(await emailsForRoles(["Purchaser"]), `${po.po_no}: ${stageLabel}`,
      wrap("Delivery status updated",
        [`PO <b>${po.po_no}</b> (${po.supplier_name}) is now: <b>${stageLabel}</b>.`], po.pr_no, po.po_no));
  },
  poClosed: async (po) => {
    sendMailAsync(await emailsForRoles(["Purchaser", "Manager"]), `PO ${po.po_no} closed`,
      wrap("Purchase order closed",
        [`Goods received from <b>${po.supplier_name}</b>. PO <b>${po.po_no}</b> is now closed.`], po.pr_no, po.po_no));
  },
};

// Generic SLA-alert email: send a wrapped message to an explicit list of
// addresses (specific owner + role recipients). Non-blocking / dormant while
// MAIL_ENABLED=false. Used by the scheduled SLA sweep (utils/alertSla.js).
// `attachments` (base64 files for Graph), `attachedNames` and `skipped` are
// fetched ONCE per event by the caller (mailAudiences) and passed in, so a
// multi-recipient event doesn't re-read the same files from Spaces per email.
function sendSlaEmail({ toEmails, subject, title, lines, prNo, poNo, fromEmail, attachments = [], attachedNames = [], skipped = [] }) {
  const to = (toEmails || []).filter(Boolean);
  if (!to.length) return;
  sendMailAsync(
    [...new Set(to)], subject,
    wrap(title, lines.filter(Boolean), prNo, poNo, { attachedNames, skipped }),
    fromEmail, attachments
  );
}

module.exports = { Email, wrap, emailsForRoles, sendSlaEmail, attachmentsForPr };
