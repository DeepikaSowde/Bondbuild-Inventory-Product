// src/utils/prFilePerms.js
// Who may ADD or REMOVE files on a PR (whole-PR and per-item attachments alike).
// Viewing / downloading stays open to every authenticated user.
//
//   1. Any role holding the "manage_pr_attachments" permission (Role Permissions
//      screen; default Drafter, Manager, Purchaser, Admin) — at ANY stage of the PR.
//   2. The PR's own raiser while the PR is still editable (DRAFT / PENDING /
//      SEND_BACK). This keeps the raise flow working — files picked on the form are
//      uploaded right after the PR saves — even if an Admin switches the permission
//      off for the raiser's role.
const { isAllowed } = require("./canDo");

const RAISER_EDITABLE = ["DRAFT", "PENDING", "SEND_BACK"];

async function canManagePrFiles(user, pr) {
  if (!user || !pr) return false;
  if (await isAllowed(user.role, "manage_pr_attachments")) return true;
  const isRaiser = pr.created_by && String(pr.created_by) === String(user.id);
  return !!isRaiser && RAISER_EDITABLE.includes(pr.status);
}

const DENIED = "You don't have permission to add or remove attachments on this PR";

module.exports = { canManagePrFiles, DENIED };
