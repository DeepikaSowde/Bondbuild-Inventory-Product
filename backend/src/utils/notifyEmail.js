// src/utils/notifyEmail.js
// Looks up who should get an email (by role) and sends a templated message.
// Pairs with the in-app po_notifications inbox — this just adds the email channel.
// Non-blocking: uses sendMailAsync so the request never waits on email.
const db = require("../config/db");
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

// The original file names attached to a PR (whole-PR + per-item), so the email
// can LIST them (files themselves stay in the app, reached via the button).
// Never throws — a missing table or lookup failure just yields no list.
async function attachmentNamesForPr(prNo) {
  if (!prNo) return [];
  try {
    const { rows } = await db.query(
      `SELECT a.original_name FROM pr_attachments a
         JOIN purchase_requests pr ON pr.id = a.pr_id WHERE pr.pr_no = $1
       UNION ALL
       SELECT ia.original_name FROM pr_item_attachments ia
         JOIN purchase_requests pr ON pr.id = ia.pr_id WHERE pr.pr_no = $1`,
      [prNo]
    );
    return rows.map((r) => r.original_name).filter(Boolean).slice(0, 25);
  } catch {
    return [];
  }
}

// Minimal HTML-escape — only for user-supplied file names in the list. The
// message `lines` are our own trusted HTML and are intentionally not escaped.
const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Professional HTML shell shared by every notification email. `opts.attachments`
// is a list of file names to display (with a button to open them in the app).
function wrap(title, lines, prNo, poNo, opts = {}) {
  const attachments = opts.attachments || [];
  const url = appUrl();
  const ref = [prNo && `PR ${prNo}`, poNo && `PO ${poNo}`].filter(Boolean).join(" &nbsp;·&nbsp; ");

  const attachHtml = attachments.length
    ? `<div style="margin:18px 0 4px;padding:12px 14px;background:#F8F9FF;border:1px solid #E6E6F0;border-radius:8px">
         <div style="font-size:12px;font-weight:700;color:#4F46E5;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">📎 Attachments (${attachments.length})</div>
         ${attachments.map((n) => `<div style="font-size:13px;color:#374151;padding:3px 0;border-bottom:1px solid #F0F0F6">${escapeHtml(n)}</div>`).join("")}
         <div style="font-size:11px;color:#9CA3AF;margin-top:8px">Open the ${poNo ? "PO" : "PR"} in InventoryOpz to view or download these files.</div>
       </div>`
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
async function sendSlaEmail({ toEmails, subject, title, lines, prNo, poNo, fromEmail }) {
  const to = (toEmails || []).filter(Boolean);
  if (!to.length) return;
  const attachments = await attachmentNamesForPr(prNo);
  sendMailAsync([...new Set(to)], subject, wrap(title, lines.filter(Boolean), prNo, poNo, { attachments }), fromEmail);
}

module.exports = { Email, wrap, emailsForRoles, sendSlaEmail };
