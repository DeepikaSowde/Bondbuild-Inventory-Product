// src/routes/prPoPermissions.js
// PR/PO Role Permissions API — mirrors permissions.js (Stock) exactly.
const express = require("express");
const db = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

const COLS = [
  "raise_pr", "approve_pr", "reject_pr", "assign_supplier", "send_to_fic",
  "issue_stock", "generate_po", "set_delivery", "receive_po", "cancel_po",
  "see_pr_price", "see_po_price", "see_po_amount",
  "see_operation_finance", "see_accounting",
];

const ALL_ROLES = ["Drafter", "Manager", "Purchaser", "Factory In-charge", "Supervisor", "QS", "Admin"];

// the same role defaults used by the backend gate (fallback when no row exists)
const ROLE_DEFAULTS = {
  raise_pr:               ["Drafter", "Admin"],
  approve_pr:             ["Manager", "Admin"],
  reject_pr:              ["Manager", "Admin"],
  assign_supplier:        ["Purchaser", "Admin"],
  send_to_fic:            ["Purchaser", "Admin"],
  issue_stock:            ["Factory In-charge", "Admin"],
  generate_po:            ["Purchaser", "Admin"],
  set_delivery:           ["Factory In-charge", "Supervisor", "Admin"],
  receive_po:             ["Purchaser", "Supervisor", "Factory In-charge", "Admin"],
  cancel_po:              ["Purchaser", "Admin"],
  see_pr_price:           ["Manager", "Purchaser", "QS", "Admin"],
  see_po_price:           ["Manager", "Purchaser", "QS", "Admin"],
  see_po_amount:          ["Manager", "Purchaser", "QS", "Admin"],
  see_operation_finance:  ALL_ROLES,   // all roles can see by default; admin can restrict
  see_accounting:         ALL_ROLES,
};

// ── CURRENT USER'S EFFECTIVE PERMISSIONS (for the frontend to show/hide UI) ──
router.get("/me/effective", protect, async (req, res) => {
  try {
    const role = req.user?.role;
    const out = {};
    let row = null;
    try {
      const r = await db.query("SELECT * FROM pr_po_permissions WHERE role = $1", [role]);
      row = r.rows[0] || null;
    } catch { /* table missing → fallback below */ }
    for (const c of COLS) {
      if (role === "Admin") { out[c] = true; continue; }
      if (row && row[c] !== null && row[c] !== undefined) out[c] = row[c] === true;
      else out[c] = (ROLE_DEFAULTS[c] || []).includes(role);
    }
    res.json({ role, permissions: out });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ── GET ALL ──
router.get("/", protect, async (_req, res) => {
  try {
    const result = await db.query("SELECT * FROM pr_po_permissions ORDER BY role ASC");
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET ONE ROLE ──
router.get("/:role", protect, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM pr_po_permissions WHERE role = $1", [req.params.role]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Role not found" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── UPDATE ONE ROLE (ADMIN ONLY) ──
router.put("/:role", protect, adminOnly, async (req, res) => {
  try {
    const { role } = req.params;
    // build a safe dynamic update from the known columns only
    const sets = [];
    const vals = [];
    let i = 1;
    for (const c of COLS) {
      if (c in req.body) { sets.push(`${c} = $${i++}`); vals.push(!!req.body[c]); }
    }
    if (!sets.length) return res.status(400).json({ error: "No valid permission fields" });
    vals.push(role);
    const result = await db.query(
      `UPDATE pr_po_permissions SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE role = $${i} RETURNING *`,
      vals
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Role not found" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
