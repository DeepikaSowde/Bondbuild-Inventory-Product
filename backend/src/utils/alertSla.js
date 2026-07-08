// src/utils/alertSla.js
// ─────────────────────────────────────────────────────────────────────────────
// Scheduled SLA-breach sweep for the procurement flow.
//
// Fires in-app notifications (po_notifications) — and, when the Microsoft Graph
// mail channel is switched on (MAIL_ENABLED=true), the SAME content by email —
// for six overdue conditions across the PR → PO → delivery lifecycle.
//
// Design notes
//  • Windows are CALENDAR days, measured from each item's raise timestamp.
//  • Each alert REPEATS every N days (its own threshold) until a stop condition.
//    The alert_ledger table records the last fire time per (rule, entity) so a
//    12-hourly sweep only re-sends once the interval has actually elapsed.
//  • Targeting: the SPECIFIC owner (drafter who raised the PR / purchaser who
//    prepared the PO) is hit personally via target_user_id; Managers & the
//    Factory In-charge are hit as a whole role (target_user_id = NULL).
//  • A Postgres advisory lock makes the sweep safe if more than one backend
//    instance runs it at the same time (single-instance guard).
//
// See memory/sla-alert-notifications.md for the agreed spec.
// ─────────────────────────────────────────────────────────────────────────────
const db = require("../config/db");
const { emailsForRoles, sendSlaEmail } = require("./notifyEmail");
// Lookup + in-app write are shared with the lifecycle-event notifier so both
// channels target people and roles the same way. See utils/notifyEvent.js.
const { userById, userByName, insertNotification: insertRow } = require("./notifyEvent");

const ADVISORY_LOCK_KEY = 918273645; // arbitrary, unique to this job

// The sweep runs outside any transaction — write straight to the pool. Every row
// it writes is an overdue nag, so it lands in the 🔔 Alerts panel, never the 📬 Inbox.
const insertNotification = (opts) => insertRow(null, { ...opts, category: "alert" });

// Upsert the ledger so the next fire only happens after the interval elapses.
async function stampLedger(rule, entityType, entityId) {
  await db.query(
    `INSERT INTO alert_ledger (rule, entity_type, entity_id, last_fired_at, fire_count)
     VALUES ($1,$2,$3, NOW(), 1)
     ON CONFLICT (rule, entity_type, entity_id)
     DO UPDATE SET last_fired_at = NOW(), fire_count = alert_ledger.fire_count + 1`,
    [rule, entityType, entityId]
  );
}

// Days a given entity has been in its current SLA window (whole days, floored).
const daysBetween = (from) =>
  Math.floor((Date.now() - new Date(from).getTime()) / 86_400_000);

// ── The six rules ────────────────────────────────────────────────────────────
// Each returns the number of items it alerted on. A rule only re-fires an item
// once its interval has elapsed since last_fired_at (enforced in the WHERE).

async function rulePrApproval() {
  const rule = "PR_APPROVAL_OVERDUE", interval = 7;
  const { rows } = await db.query(
    `SELECT p.id, p.pr_no, p.project_name, p.job_no, p.requested_by, p.created_by, p.created_at
       FROM purchase_requests p
       LEFT JOIN alert_ledger l
         ON l.rule = $1 AND l.entity_type = 'PR' AND l.entity_id = p.id
      WHERE p.status = 'PENDING'
        AND p.created_at <= NOW() - make_interval(days => $2)
        AND (l.last_fired_at IS NULL OR l.last_fired_at <= NOW() - make_interval(days => $2))`,
    [rule, interval]
  );
  for (const pr of rows) {
    const n = daysBetween(pr.created_at);
    const proj = pr.project_name || pr.job_no;
    const title = `PR ${pr.pr_no} still awaiting approval (${n} days)`;
    const body = `PR ${pr.pr_no} (${proj}) raised by ${pr.requested_by} has been pending Manager approval for ${n} days. Please approve, send back, or reject. This reminder repeats every ${interval} days until actioned.`;
    const drafter = await userById(pr.created_by);
    // personal alert to the drafter who raised it (fall back to Drafter role)
    await insertNotification({ role: drafter?.role || "Drafter", targetUserId: drafter?.id || null,
      title, body, type: "warning", refPr: pr.pr_no });
    // whole Manager role
    await insertNotification({ role: "Manager", title, body, type: "warning", refPr: pr.pr_no });
    sendSlaEmail({ toEmails: [drafter?.email, ...(await emailsForRoles(["Manager"]))],
      subject: title, title: "Purchase request awaiting approval", lines: [body], prNo: pr.pr_no });
    await stampLedger(rule, "PR", pr.id);
  }
  return rows.length;
}

async function rulePoInitiation() {
  const rule = "PO_INITIATION_OVERDUE", interval = 7;
  const { rows } = await db.query(
    `SELECT p.id, p.pr_no, p.project_name, p.job_no, p.approved_date
       FROM purchase_requests p
       LEFT JOIN alert_ledger l
         ON l.rule = $1 AND l.entity_type = 'PR' AND l.entity_id = p.id
      WHERE p.status = 'APPROVED'
        AND p.approved_date <= (NOW() - make_interval(days => $2))::date
        AND (l.last_fired_at IS NULL OR l.last_fired_at <= NOW() - make_interval(days => $2))`,
    [rule, interval]
  );
  for (const pr of rows) {
    const n = daysBetween(pr.approved_date);
    const proj = pr.project_name || pr.job_no;
    const title = `Approved PR ${pr.pr_no} has no PO after ${n} days`;
    const body = `PR ${pr.pr_no} (${proj}) was approved ${n} days ago but no purchase order has been raised. Purchaser: please generate the PO(s). This reminder repeats every ${interval} days until a PO is raised.`;
    // No purchaser is assigned to a PR before a PO exists → whole Purchaser role.
    await insertNotification({ role: "Purchaser", title, body, type: "warning", refPr: pr.pr_no });
    await insertNotification({ role: "Manager", title, body, type: "warning", refPr: pr.pr_no });
    sendSlaEmail({ toEmails: await emailsForRoles(["Purchaser", "Manager"]),
      subject: title, title: "Approved PR is waiting for a PO", lines: [body], prNo: pr.pr_no });
    await stampLedger(rule, "PR", pr.id);
  }
  return rows.length;
}

// Shared body for the four PO-stage rules.
async function firePoStageAlert({ rule, po, interval, title, body, includeFic }) {
  const owner = await userByName(po.prepared_by);
  await insertNotification({ role: owner?.role || "Purchaser", targetUserId: owner?.id || null,
    title, body, type: "warning", refPr: po.pr_no, refPo: po.po_no });
  await insertNotification({ role: "Manager", title, body, type: "warning", refPr: po.pr_no, refPo: po.po_no });
  const emailRoles = ["Manager"];
  if (includeFic) {
    await insertNotification({ role: "Factory In-charge", title, body, type: "warning", refPr: po.pr_no, refPo: po.po_no });
    emailRoles.push("Factory In-charge");
  }
  if (!owner) emailRoles.push("Purchaser"); // owner unknown → broadcast to role
  sendSlaEmail({ toEmails: [owner?.email, ...(await emailsForRoles(emailRoles))],
    subject: title, title: "Purchase order needs attention", lines: [body], prNo: po.pr_no, poNo: po.po_no });
  await stampLedger(rule, "PO", po.id);
}

async function ruleBuyNoMovement() {
  const rule = "PO_BUY_NO_MOVEMENT", interval = 10;
  const { rows } = await db.query(
    `SELECT p.id, p.po_no, p.pr_no, p.supplier_name, p.prepared_by, p.po_date
       FROM purchase_orders p
       LEFT JOIN alert_ledger l ON l.rule=$1 AND l.entity_type='PO' AND l.entity_id=p.id
      WHERE p.po_type='BUY' AND p.status='OPEN' AND p.delivery_stage IS NULL
        AND p.po_date <= NOW() - make_interval(days => $2)
        AND (l.last_fired_at IS NULL OR l.last_fired_at <= NOW() - make_interval(days => $2))`,
    [rule, interval]
  );
  for (const po of rows) {
    const n = daysBetween(po.po_date);
    const title = `PO ${po.po_no}: no delivery update after ${n} days`;
    const body = `Purchase order ${po.po_no} (${po.supplier_name || "supplier"}) has had no delivery movement for ${n} days since it was raised. FIC: please update its delivery status. Repeats every ${interval} days until it progresses.`;
    await firePoStageAlert({ rule, po, interval, title, body, includeFic: true });
  }
  return rows.length;
}

async function ruleBuyNotReceived() {
  const rule = "PO_BUY_NOT_RECEIVED", interval = 15;
  const { rows } = await db.query(
    `SELECT p.id, p.po_no, p.pr_no, p.supplier_name, p.prepared_by, p.po_date
       FROM purchase_orders p
       LEFT JOIN alert_ledger l ON l.rule=$1 AND l.entity_type='PO' AND l.entity_id=p.id
      WHERE p.po_type='BUY' AND p.status='OPEN'
        AND (p.delivery_stage IS DISTINCT FROM 'RECEIVED_FACTORY')
        AND p.po_date <= NOW() - make_interval(days => $2)
        AND (l.last_fired_at IS NULL OR l.last_fired_at <= NOW() - make_interval(days => $2))`,
    [rule, interval]
  );
  for (const po of rows) {
    const n = daysBetween(po.po_date);
    const title = `PO ${po.po_no}: goods not received after ${n} days`;
    const body = `Purchase order ${po.po_no} (${po.supplier_name || "supplier"}) has not reached the Received state ${n} days after it was raised. FIC/Purchaser: please follow up on receipt. Repeats every ${interval} days until received.`;
    await firePoStageAlert({ rule, po, interval, title, body, includeFic: true });
  }
  return rows.length;
}

async function ruleStockNoMovement() {
  const rule = "PO_STOCK_NO_MOVEMENT", interval = 5;
  const { rows } = await db.query(
    `SELECT p.id, p.po_no, p.pr_no, p.prepared_by, p.po_date
       FROM purchase_orders p
       LEFT JOIN alert_ledger l ON l.rule=$1 AND l.entity_type='PO' AND l.entity_id=p.id
      WHERE p.po_type='STOCK' AND p.status='OPEN' AND p.delivery_stage IS NULL
        AND p.po_date <= NOW() - make_interval(days => $2)
        AND (l.last_fired_at IS NULL OR l.last_fired_at <= NOW() - make_interval(days => $2))`,
    [rule, interval]
  );
  for (const po of rows) {
    const n = daysBetween(po.po_date);
    const title = `Internal PO ${po.po_no}: no movement after ${n} days`;
    const body = `Internal inventory PO ${po.po_no} has had no movement for ${n} days since it was raised. FIC: please progress it. Repeats every ${interval} days until it moves.`;
    await firePoStageAlert({ rule, po, interval, title, body, includeFic: true });
  }
  return rows.length;
}

async function ruleStockNotCollected() {
  const rule = "PO_STOCK_NOT_COLLECTED", interval = 30;
  const { rows } = await db.query(
    `SELECT p.id, p.po_no, p.pr_no, p.prepared_by, p.po_date
       FROM purchase_orders p
       LEFT JOIN alert_ledger l ON l.rule=$1 AND l.entity_type='PO' AND l.entity_id=p.id
      WHERE p.po_type='STOCK' AND p.status='OPEN'
        AND (p.delivery_stage IS DISTINCT FROM 'COLLECTED')
        AND p.po_date <= NOW() - make_interval(days => $2)
        AND (l.last_fired_at IS NULL OR l.last_fired_at <= NOW() - make_interval(days => $2))`,
    [rule, interval]
  );
  for (const po of rows) {
    const n = daysBetween(po.po_date);
    const title = `Internal PO ${po.po_no}: not collected after ${n} days — consider cancelling`;
    const body = `Internal inventory PO ${po.po_no} has not been collected ${n} days after it was raised. Purchaser: please collect it or cancel the PO. Repeats every ${interval} days until collected or cancelled.`;
    // Purchaser only (cancel prompt) — no Manager/FIC broadcast for this one.
    const owner = await userByName(po.prepared_by);
    await insertNotification({ role: owner?.role || "Purchaser", targetUserId: owner?.id || null,
      title, body, type: "error", refPr: po.pr_no, refPo: po.po_no });
    sendSlaEmail({ toEmails: owner?.email ? [owner.email] : await emailsForRoles(["Purchaser"]),
      subject: title, title: "Internal PO not collected", lines: [body], prNo: po.pr_no, poNo: po.po_no });
    await stampLedger(rule, "PO", po.id);
  }
  return rows.length;
}

const RULES = [
  ["PR_APPROVAL_OVERDUE", rulePrApproval],
  ["PO_INITIATION_OVERDUE", rulePoInitiation],
  ["PO_BUY_NO_MOVEMENT", ruleBuyNoMovement],
  ["PO_BUY_NOT_RECEIVED", ruleBuyNotReceived],
  ["PO_STOCK_NO_MOVEMENT", ruleStockNoMovement],
  ["PO_STOCK_NOT_COLLECTED", ruleStockNotCollected],
];

/**
 * Run one full SLA sweep. Safe to call from cron or a manual endpoint.
 * Uses a Postgres advisory lock so concurrent instances don't double-send.
 * Never throws — always resolves with a per-rule summary.
 */
async function runSlaSweep({ force = false } = {}) {
  const startedAt = new Date();
  let locked = false;
  const summary = {};
  try {
    if (!force) {
      const { rows } = await db.query("SELECT pg_try_advisory_lock($1) AS ok", [ADVISORY_LOCK_KEY]);
      locked = rows[0]?.ok === true;
      if (!locked) {
        console.log("[alertSla] another instance holds the sweep lock — skipping");
        return { skipped: "locked" };
      }
    }
    for (const [name, fn] of RULES) {
      try { summary[name] = await fn(); }
      catch (e) { console.error(`[alertSla] rule ${name} failed:`, e.message); summary[name] = `error: ${e.message}`; }
    }
    const total = Object.values(summary).filter((v) => typeof v === "number").reduce((a, b) => a + b, 0);
    console.log(`[alertSla] sweep done in ${Date.now() - startedAt}ms — ${total} alert(s):`, summary);
    return { ok: true, total, summary, at: startedAt.toISOString() };
  } catch (e) {
    console.error("[alertSla] sweep failed:", e.message);
    return { ok: false, error: e.message, summary };
  } finally {
    if (locked) await db.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => {});
  }
}

module.exports = { runSlaSweep };
