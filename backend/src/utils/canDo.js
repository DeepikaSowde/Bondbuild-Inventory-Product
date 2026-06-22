// src/utils/canDo.js
// Permission gate for PR/PO actions. Checks pr_po_permissions by the user's role.
// FALLBACK TO ROLE: if the table/row/column isn't set, fall back to the original
// role-based rule so behaviour never breaks. Admin always allowed.
const db = require("../config/db");

// the original role defaults (same as the hardcoded roles(...) we had before)
const ROLE_DEFAULTS = {
  raise_pr:        ["Drafter", "Admin"],
  approve_pr:      ["Manager", "Admin"],
  reject_pr:       ["Manager", "Admin"],
  assign_supplier: ["Purchaser", "Admin"],
  send_to_fic:     ["Purchaser", "Admin"],
  issue_stock:     ["Factory In-charge", "Admin"],
  generate_po:     ["Purchaser", "Admin"],
  set_delivery:    ["Factory In-charge", "Supervisor", "Admin"],
  receive_po:      ["Purchaser", "Supervisor", "Factory In-charge", "Admin"],
  cancel_po:       ["Purchaser", "Admin"],
};

// returns true/false for a (role, action), honouring the table then falling back to role
async function isAllowed(role, action) {
  if (role === "Admin") return true;
  try {
    const { rows } = await db.query(
      `SELECT ${action} AS allowed FROM pr_po_permissions WHERE role = $1`, [role]
    );
    if (rows.length && rows[0].allowed !== null && rows[0].allowed !== undefined) {
      return rows[0].allowed === true;
    }
  } catch { /* table missing → fall back */ }
  // fallback to original role rule
  const defaults = ROLE_DEFAULTS[action] || [];
  return defaults.includes(role);
}

// Express middleware: canDo("approve_pr")
function canDo(action) {
  return async (req, res, next) => {
    try {
      const allowed = await isAllowed(req.user?.role, action);
      if (!allowed) return res.status(403).json({ success: false, error: "You don't have permission for this action" });
      next();
    } catch (e) {
      // on unexpected error, fall back to role default rather than blocking
      const defaults = ROLE_DEFAULTS[action] || [];
      if (defaults.includes(req.user?.role) || req.user?.role === "Admin") return next();
      return res.status(403).json({ success: false, error: "You don't have permission for this action" });
    }
  };
}

module.exports = { canDo, isAllowed, ROLE_DEFAULTS };
