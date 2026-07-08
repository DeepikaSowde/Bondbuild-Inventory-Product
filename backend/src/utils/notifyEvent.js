// src/utils/notifyEvent.js
// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle-event notifications for the PR → PO flow.
//
// Where utils/alertSla.js nags about things that DIDN'T happen on time, this
// module announces things that just DID happen: a PR was raised, a PR was
// approved, a PO was raised.
//
// Every event fans out to an "audience list" — a mix of NAMED PEOPLE (the
// drafter who raised the PR, the manager who approved it, the purchaser who
// raised the PO) and WHOLE ROLES (all Purchasers, the Factory In-charge).
// Named people are reached through po_notifications.target_user_id; roles are
// broadcast with target_user_id = NULL. The /notifications inbox query already
// unions the two ("addressed to me OR broadcast to my role"), so both land in
// the same mailbox.
//
// Each audience gets its OWN wording, because one event means different things
// to different people: the person who acted gets an acknowledgement, the next
// person in the chain gets a call to action, the manager gets a tracking note.
//
// Two-phase on purpose:
//   • notifyInApp() runs INSIDE the caller's transaction — if the PR insert
//     rolls back, its notifications roll back with it.
//   • mailAudiences() runs AFTER commit, fire-and-forget — so a mail outage can
//     never fail or slow the request, and we never email about a PR that in the
//     end didn't get created.
//
// The email channel is dormant until MAIL_ENABLED=true (see utils/mailer.js).
// Same audiences, same wording — it just also leaves the building.
// ─────────────────────────────────────────────────────────────────────────────
const db = require("../config/db");
const { emailsForRoles, sendSlaEmail } = require("./notifyEmail");

// ── who ──────────────────────────────────────────────────────────────────────
async function userById(id) {
  if (!id) return null;
  try {
    const { rows } = await db.query(
      "SELECT id, name, role, email FROM users WHERE id = $1", [id]
    );
    return rows[0] || null;
  } catch { return null; }
}

// Several columns (purchase_orders.prepared_by, purchase_requests.approved_by)
// hold a NAME, not a user id — resolve it back to a user so we can reach the
// individual rather than shouting at the whole role.
async function userByName(name) {
  if (!name) return null;
  try {
    const { rows } = await db.query(
      `SELECT id, name, role, email FROM users
       WHERE lower(name) = lower($1) AND status = 'Active'
       ORDER BY (email IS NOT NULL) DESC LIMIT 1`, [name]
    );
    return rows[0] || null;
  } catch { return null; }
}

// ── delivery ─────────────────────────────────────────────────────────────────
// One in-app row. `client` may be a transaction client or the pool.
//
// `category` decides WHERE the row surfaces in the UI: 'message' rows land in
// the 📬 Inbox (something happened), 'alert' rows in the 🔔 Alerts panel
// (something is overdue). Lifecycle events are messages, so that is the default;
// utils/alertSla.js overrides it to 'alert' for every row the sweep writes.
async function insertNotification(client, { role, targetUserId = null, title, body, type, refPr = null, refPo = null, category = "message" }) {
  await (client || db).query(
    `INSERT INTO po_notifications (role, target_user_id, title, body, type, ref_pr, ref_po, category)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [role, targetUserId, title, body, type, refPr, refPo, category]
  );
}

/**
 * Write the in-app half of an event. Call inside the caller's transaction.
 * An audience is either { user, … } (personal) or { role, … } (broadcast);
 * falsy entries are skipped so callers can inline `cond && {…}`.
 */
async function notifyInApp(client, audiences, { refPr = null, refPo = null } = {}) {
  for (const a of (audiences || []).filter(Boolean)) {
    await insertNotification(client, {
      role: a.user ? a.user.role : a.role,
      targetUserId: a.user ? a.user.id : null,
      title: a.title, body: a.body, type: a.type || "info", refPr, refPo,
    });
  }
}

/**
 * Write the email half. Call AFTER the transaction commits. Never awaited —
 * sendSlaEmail is already non-blocking and no-ops when it has no addresses.
 */
function mailAudiences(audiences, { refPr = null, refPo = null } = {}) {
  for (const a of (audiences || []).filter(Boolean)) {
    const send = (toEmails) => sendSlaEmail({
      toEmails, subject: a.title, title: a.emailTitle || a.title,
      lines: [a.body], prNo: refPr, poNo: refPo,
    });
    if (a.user) send([a.user.email]);
    else emailsForRoles([a.role]).then(send).catch(() => {});
  }
}

// ── the three lifecycle events ───────────────────────────────────────────────
const label = (pr) => pr?.project_name || pr?.job_no || "";

/**
 * 1. Drafter raises a PR.
 *    Drafter → acknowledgement.  All Managers → "you have one to approve".
 */
function prSubmitted({ actor, prNo, projectLabel, requestedBy }) {
  const proj = projectLabel ? ` for ${projectLabel}` : "";
  return [
    { user: actor,
      title: `PR ${prNo} submitted`,
      emailTitle: "Your purchase request was submitted",
      body: `Your purchase request ${prNo}${proj} has been submitted and is now awaiting Manager approval. You'll be notified once it is actioned.`,
      type: "success" },
    { role: "Manager",
      title: `New PR submitted: ${prNo}`,
      emailTitle: "A new purchase request needs your approval",
      body: `${requestedBy} submitted purchase request ${prNo}${proj}. Please review and approve, send back, or reject it.`,
      type: "info" },
  ];
}

/**
 * 2. Manager approves a PR.
 *    Approving manager → acknowledgement.  All Purchasers → "raise the PO".
 *    Drafter who raised it → their PR got through.
 */
async function prApproved({ actor, pr }) {
  const proj = label(pr) ? ` (${label(pr)})` : "";
  // The drafter is a specific person; only fall back to the whole role for
  // legacy PRs raised before created_by was recorded.
  const drafter = await userById(pr.created_by);
  return [
    { user: actor,
      title: `You approved PR ${pr.pr_no}`,
      emailTitle: "Approval recorded",
      body: `You approved purchase request ${pr.pr_no}${proj}. It has moved to the Purchaser to assign suppliers and raise the purchase order(s).`,
      type: "success" },
    { role: "Purchaser",
      title: `Assign suppliers: ${pr.pr_no}`,
      emailTitle: "PR approved — ready for purchasing",
      body: `Purchase request ${pr.pr_no}${proj} was approved by ${actor.name}. Assign suppliers and prices to the buy items, send any stock items to the Factory In-charge, then generate the PO(s).`,
      type: "info" },
    drafter
      ? { user: drafter,
          title: `PR approved: ${pr.pr_no}`,
          emailTitle: "Your purchase request was approved",
          body: `Your purchase request ${pr.pr_no}${proj} was approved by ${actor.name}. The Purchaser will now raise the purchase order(s).`,
          type: "success" }
      : { role: "Drafter",
          title: `PR approved: ${pr.pr_no}`,
          emailTitle: "A purchase request was approved",
          body: `Purchase request ${pr.pr_no}${proj} was approved by ${actor.name}.`,
          type: "success" },
  ];
}

/**
 * 3. Purchaser raises a PO (buy PO, internal stock PO, or a manual one-off).
 *    Purchaser → acknowledgement.  Factory In-charge → "next step is yours".
 *    Manager who approved the parent PR → tracking.  Drafter → tracking.
 *
 * `pr` is null for a manual PO raised outside the PR flow; the manager and
 * drafter audiences degrade to a role broadcast / are dropped accordingly.
 */
async function poRaised({ actor, pr, poNos, poType = "BUY" }) {
  const list = poNos.join(", ");
  const n = poNos.length;
  const many = n > 1;
  const stock = poType === "STOCK";
  const kind = stock ? "internal stock PO" : "purchase order";
  const proj = label(pr) ? ` (${label(pr)})` : "";
  const fromPr = pr ? ` from PR ${pr.pr_no}` : "";
  const noun = many ? `${n} ${kind}s` : `${kind} ${list}`;

  const audiences = [
    { user: actor,
      title: `You raised ${many ? `${n} POs` : `PO ${list}`}${pr ? ` for ${pr.pr_no}` : ""}`,
      emailTitle: "Purchase order raised",
      body: `You raised ${noun}${fromPr}${proj}${many ? `: ${list}` : ""}. The Factory In-charge has been notified to take the next step.`,
      type: "success" },
    { role: "Factory In-charge",
      title: `New ${stock ? "stock PO" : "PO"} to action: ${list}`,
      emailTitle: "A purchase order needs your attention",
      body: stock
        ? `${actor.name} raised ${noun}${fromPr}${proj}${many ? `: ${list}` : ""}. Please issue the stock from its factory location and keep the collection status updated.`
        : `${actor.name} raised ${noun}${fromPr}${proj}${many ? `: ${list}` : ""}. Please track the delivery and update the status as the goods move, through to receipt at the factory.`,
      type: "info" },
  ];

  // Manager: the individual who approved the parent PR, so the person who let
  // it through is the person who follows it. No PR (manual PO) → all Managers.
  const manager = pr?.approved_by ? await userByName(pr.approved_by) : null;
  const managerBody = `${actor.name} raised ${noun}${fromPr}${proj}${many ? `: ${list}` : ""}. The Factory In-charge has been asked to action it.`;
  audiences.push(
    manager
      ? { user: manager, title: `PO raised: ${list}`, emailTitle: "Purchase order raised", body: managerBody, type: "info" }
      : { role: "Manager", title: `PO raised: ${list}`, emailTitle: "Purchase order raised", body: managerBody, type: "info" }
  );

  // Drafter: only meaningful when the PO descends from a PR they raised.
  if (pr) {
    const drafter = await userById(pr.created_by);
    // "your PR" only holds when we know the individual. The role-broadcast
    // fallback (legacy PRs with no created_by) must stay impersonal — otherwise
    // every Drafter is told a PR they never raised is theirs.
    const raised = `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${many ? `(${list}) ` : ""}${many ? "were" : "was"} raised from`;
    audiences.push(
      drafter
        ? { user: drafter, title: `POs created for ${pr.pr_no}`, emailTitle: "Purchase orders generated",
            body: `${raised} your purchase request ${pr.pr_no}${proj}.`, type: "success" }
        : { role: "Drafter", title: `POs created for ${pr.pr_no}`, emailTitle: "Purchase orders generated",
            body: `${raised} purchase request ${pr.pr_no}${proj}.`, type: "success" }
    );
  }

  return audiences;
}

module.exports = {
  userById, userByName, insertNotification,
  notifyInApp, mailAudiences,
  events: { prSubmitted, prApproved, poRaised },
};
