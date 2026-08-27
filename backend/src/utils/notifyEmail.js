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

// A PR's requested items for the email table — one row per distinct item, with
// the total requested qty (buy + stock). Never throws.
async function itemsForPr(prNo) {
  if (!prNo) return [];
  try {
    const { rows } = await db.query(
      `SELECT MIN(i.line_no) AS line_no, i.profile_code, i.description, i.unit,
              SUM(COALESCE(i.buy_qty,0) + COALESCE(i.stock_qty,0)) AS qty
         FROM pr_items i JOIN purchase_requests pr ON pr.id = i.pr_id
        WHERE pr.pr_no = $1
        GROUP BY i.profile_code, i.description, i.unit
       HAVING SUM(COALESCE(i.buy_qty,0) + COALESCE(i.stock_qty,0)) > 0
        ORDER BY line_no`,
      [prNo]
    );
    return rows.slice(0, 40);
  } catch {
    return [];
  }
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

  // Optional clean-format extras (the layout the client asked for on PR/PO
  // emails): a greeting instead of the bare title, an item table, and a signature.
  const items = opts.items || [];
  const cS = "font-size:13px;color:#374151;padding:7px 10px;border-bottom:1px solid #F0F0F6";
  const hS = "font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#6B7280;padding:7px 10px;background:#F3F4F6;border-bottom:1px solid #E5E7EB";
  const itemsHtml = items.length
    ? `<table style="width:100%;border-collapse:collapse;margin:14px 0 6px">
         <thead><tr><th style="${hS};text-align:left">#</th><th style="${hS};text-align:left">Profile Code</th><th style="${hS};text-align:left">Description</th><th style="${hS};text-align:right">Qty</th><th style="${hS};text-align:left">Unit</th></tr></thead>
         <tbody>${items.map((it, i) => `<tr><td style="${cS}">${i + 1}</td><td style="${cS}">${escapeHtml(it.profile_code || "")}</td><td style="${cS}">${escapeHtml(it.description || "")}</td><td style="${cS};text-align:right">${Number(it.qty) || 0}</td><td style="${cS}">${escapeHtml(it.unit || "")}</td></tr>`).join("")}</tbody>
       </table>`
    : "";
  const heading = opts.greeting
    ? `<p style="margin:0 0 12px;font-weight:700;color:#1E1B4B;font-size:14px">${escapeHtml(opts.greeting)}</p>`
    : `<h2 style="margin:0 0 12px;font-size:18px;color:#1E1B4B;font-weight:800">${title}</h2>`;
  const sign = opts.signName
    ? `<div style="margin-top:18px;font-size:14px;color:#374151">Thank you,<br><b style="color:#1E1B4B">${escapeHtml(opts.signName)}</b><br>Bond Building Products Pte. Ltd.</div>`
    : "";

  return `
  <div style="font-family:-apple-system,Segoe UI,Arial,Helvetica,sans-serif;max-width:600px;margin:auto;background:#ffffff;border:1px solid #E6E6F0;border-radius:12px;overflow:hidden">
    <div style="background:#6366F1;padding:16px 22px">
      <div style="color:#ffffff;font-size:16px;font-weight:800;letter-spacing:-.01em">Bond Build · Procurement</div>
      <div style="color:#C7D2FE;font-size:11px;font-weight:600;margin-top:2px;text-transform:uppercase;letter-spacing:.08em">InventoryOpz</div>
    </div>
    <div style="padding:22px">
      ${heading}
      ${lines.map((l) => `<p style="margin:8px 0;font-size:14px;line-height:1.6;color:#374151">${l}</p>`).join("")}
      ${ref ? `<p style="margin:14px 0 4px;font-size:12px;color:#9CA3AF;font-weight:600">${ref}</p>` : ""}
      ${itemsHtml}
      ${attachHtml}
      ${button}
      ${sign}
    </div>
    <div style="background:#F7F7FB;padding:14px 22px;font-size:11px;color:#9CA3AF;border-top:1px solid #F0F0F6">
      Automated message from InventoryOpz · Bond Building Products Pte. Ltd. Please log in to take action.
    </div>
  </div>`;
}

// Supplier-facing enquiry email — formal/external, separate from the internal
// wrap() template: navy header, an item table, no InventoryOpz branding. Prices
// are intentionally omitted for now (pending client sign-off); add a Unit Price
// column here when confirmed.
function supplierHtml({ supplierName, projectName, location, prNo, items, purchaserName }) {
  const cell = "font-size:13px;color:#374151;padding:8px 10px;border-bottom:1px solid #F0F0F6";
  const th = "font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#6B7280;padding:8px 10px;background:#F3F4F6;border-bottom:1px solid #E5E7EB";
  const rows = (items || []).map((it, i) => `
    <tr>
      <td style="${cell}">${i + 1}</td>
      <td style="${cell}">${escapeHtml(it.profile_code || "")}</td>
      <td style="${cell}">${escapeHtml(it.description || "")}</td>
      <td style="${cell};text-align:right">${Number(it.qty) || 0}</td>
      <td style="${cell}">${escapeHtml(it.unit || "")}</td>
    </tr>`).join("");
  return `
  <div style="font-family:-apple-system,Segoe UI,Arial,Helvetica,sans-serif;max-width:600px;margin:auto;background:#ffffff;border:1px solid #E6E6F0;border-radius:12px;overflow:hidden">
    <div style="background:#1E3A5F;padding:18px 24px">
      <div style="color:#ffffff;font-size:17px;font-weight:800">Bond Building Products Pte. Ltd.</div>
      <div style="color:#AEC3DE;font-size:11px;font-weight:600;margin-top:2px">Procurement Department</div>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 11px;font-weight:700;color:#1E1B4B;font-size:14px">Dear ${escapeHtml(supplierName || "Supplier")},</p>
      <p style="margin:11px 0;font-size:14px;line-height:1.65;color:#374151">We are processing an order for the following items for our project <b>${escapeHtml(projectName || "")}</b>${location ? ` (Location: <b>${escapeHtml(location)}</b>)` : ""}, and would like to confirm the details with you.</p>
      <div style="display:inline-block;font-size:12px;color:#4F46E5;background:#EEF2FF;border-radius:6px;padding:4px 10px;font-weight:700;margin:2px 0 4px">Reference: ${escapeHtml(prNo || "")}</div>
      <table style="width:100%;border-collapse:collapse;margin:14px 0 6px">
        <thead><tr>
          <th style="${th};text-align:left">#</th><th style="${th};text-align:left">Profile Code</th>
          <th style="${th};text-align:left">Description</th><th style="${th};text-align:right">Qty</th>
          <th style="${th};text-align:left">Unit</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin:14px 0 4px;padding:12px 15px;background:#F8F9FF;border:1px solid #E6E6F0;border-radius:8px">
        <div style="font-size:12px;font-weight:800;color:#1E1B4B;margin-bottom:6px">Please confirm at your earliest convenience:</div>
        <ul style="margin:0;padding-left:18px">
          <li style="font-size:13px;color:#374151;margin:3px 0">Unit prices and total amount</li>
          <li style="font-size:13px;color:#374151;margin:3px 0">Availability &amp; delivery lead time</li>
          <li style="font-size:13px;color:#374151;margin:3px 0">Delivery terms</li>
        </ul>
      </div>
      <p style="margin:11px 0;font-size:14px;line-height:1.65;color:#374151">A formal <b>Purchase Order</b> will be issued once our internal approval is complete. Should you have any questions, kindly reply to this email.</p>
      <div style="margin-top:18px;font-size:14px;color:#374151">Thank you,<br><b style="color:#1E1B4B">${escapeHtml(purchaserName || "Procurement")}</b><br>Procurement · Bond Building Products Pte. Ltd.</div>
    </div>
    <div style="background:#F7F7FB;padding:14px 24px;font-size:11px;color:#9CA3AF;border-top:1px solid #F0F0F6">This message was sent from Bond Building Products Pte. Ltd. procurement. Please reply to this email to respond.</div>
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
  // Supplier-facing purchase enquiry (send-as the Purchaser). Fire-and-forget.
  supplierEnquiry: ({ supplierEmail, supplierName, projectName, location, prNo, items, purchaserName, fromEmail }) => {
    if (!supplierEmail) return;
    sendMailAsync([supplierEmail],
      `Purchase enquiry — ${projectName || prNo} · Ref ${prNo}`,
      supplierHtml({ supplierName, projectName, location, prNo, items, purchaserName }),
      fromEmail);
  },
  // Email one or more ROLES with send-as + the PR's attachments, mirroring an
  // in-app notify() for steps outside the audience/event machinery (e.g. the QS
  // gate). `fromEmail` is the acting person's mailbox; falls back to MAIL_FROM.
  emailRoles: async ({ roles, fromEmail, subject, title, body, prNo, signName }) => {
    const toEmails = await emailsForRoles(roles);
    if (!toEmails.length) return;
    const [{ files, skipped }, items] = await Promise.all([attachmentsForPr(prNo), itemsForPr(prNo)]);
    sendSlaEmail({
      toEmails, subject, title, lines: [body], prNo, fromEmail,
      attachments: files, attachedNames: files.map((f) => f.name), skipped,
      items, greeting: `Dear ${roles[0]},`, signName,
    });
  },
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
    sendMailAsync(await emailsForRoles(["Purchaser", "Manager", "Account"]), `PO ${po.po_no} closed`,
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
function sendSlaEmail({ toEmails, subject, title, lines, prNo, poNo, fromEmail, attachments = [], attachedNames = [], skipped = [], items = [], greeting, signName }) {
  const to = (toEmails || []).filter(Boolean);
  if (!to.length) return;
  sendMailAsync(
    [...new Set(to)], subject,
    wrap(title, lines.filter(Boolean), prNo, poNo, { attachedNames, skipped, items, greeting, signName }),
    fromEmail, attachments
  );
}

module.exports = { Email, wrap, emailsForRoles, sendSlaEmail, attachmentsForPr, itemsForPr };
