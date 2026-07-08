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

// Simple, clean HTML shell so messages look consistent
function wrap(title, lines, prNo, poNo) {
  const ref = [prNo && `PR: ${prNo}`, poNo && `PO: ${poNo}`].filter(Boolean).join(" &nbsp;·&nbsp; ");
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden">
    <div style="background:#6366F1;color:#fff;padding:14px 20px;font-size:16px;font-weight:bold">Bond Build · Procurement</div>
    <div style="padding:20px">
      <h2 style="margin:0 0 10px;font-size:17px;color:#1E1B4B">${title}</h2>
      ${lines.map((l) => `<p style="margin:6px 0;font-size:14px;color:#374151">${l}</p>`).join("")}
      ${ref ? `<p style="margin:14px 0 0;font-size:12px;color:#9CA3AF">${ref}</p>` : ""}
    </div>
    <div style="background:#F9FAFB;padding:12px 20px;font-size:11px;color:#9CA3AF">
      Automated message from the InventoryOpz procurement module. Please log in to take action.
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
function sendSlaEmail({ toEmails, subject, title, lines, prNo, poNo }) {
  const to = (toEmails || []).filter(Boolean);
  if (!to.length) return;
  sendMailAsync([...new Set(to)], subject, wrap(title, lines.filter(Boolean), prNo, poNo));
}

module.exports = { Email, wrap, emailsForRoles, sendSlaEmail };
