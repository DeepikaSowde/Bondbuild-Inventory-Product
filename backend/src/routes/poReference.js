// src/routes/poReference.js
// Reference data the PR/PO module owns: po-projects, suppliers, notifications.
// Mounted SEPARATELY so it never collides with your existing /api/projects or /api/inventory.
// Uses your existing db (../config/db) and auth (../middleware/auth).
const express = require("express");
const db = require("../config/db");
const { protect, roles } = require("../middleware/auth");

const router = express.Router();
const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const fail = (res, code, error) => res.status(code).json({ success: false, error });

// ── PR/PO projects (job_no based — separate from your dashboard projects) ──
router.get("/po-projects", protect, async (_req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM po_projects WHERE is_active = TRUE ORDER BY job_no"
    );
    ok(res, rows, { count: rows.length });
  } catch (e) { fail(res, 500, e.message); }
});

// Look up one project by job_no (used when the Drafter types the Job No)
router.get("/po-projects/:jobNo", protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM po_projects WHERE job_no = $1", [req.params.jobNo]
    );
    if (!rows[0]) return fail(res, 404, "Job No not found");
    ok(res, rows[0]);
  } catch (e) { fail(res, 500, e.message); }
});

router.post("/po-projects", protect, roles("Drafter", "Purchaser", "Admin"), async (req, res) => {
  const { job_no, project_name, location } = req.body || {};
  if (!job_no || !project_name) return fail(res, 400, "Job No and project name are required");
  try {
    const { rows } = await db.query(
      `INSERT INTO po_projects (job_no, project_name, location)
       VALUES ($1,$2,$3)
       ON CONFLICT (job_no) DO UPDATE SET project_name = EXCLUDED.project_name
       RETURNING *`,
      [job_no, project_name, location]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { fail(res, 500, e.message); }
});

// ── Suppliers (PR/PO owns these) ──
router.get("/suppliers", protect, async (_req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM po_suppliers WHERE is_active = TRUE ORDER BY name"
    );
    ok(res, rows, { count: rows.length });
  } catch (e) { fail(res, 500, e.message); }
});

router.post("/suppliers", protect, async (req, res) => {
  const { name, type, contact_person, phone, email, address, fax } = req.body || {};
  if (!name) return fail(res, 400, "Supplier name is required");
  try {
    const { rows } = await db.query(
      `INSERT INTO po_suppliers (name, type, contact_person, phone, email, address, fax)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, type || "Local", contact_person || null, phone || null, email || null, address || null, fax || null]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    fail(res, e.code === "23505" ? 409 : 500, e.code === "23505" ? "Supplier already exists" : e.message);
  }
});

router.put("/suppliers/:id", protect, async (req, res) => {
  const { name, type, contact_person, phone, email, address, fax } = req.body || {};
  if (!name) return fail(res, 400, "Supplier name is required");
  try {
    const { rows } = await db.query(
      `UPDATE po_suppliers
       SET name=$1, type=$2, contact_person=$3, phone=$4, email=$5, address=$6, fax=$7, updated_at=NOW()
       WHERE id=$8 AND is_active=TRUE RETURNING *`,
      [name, type || "Local", contact_person || null, phone || null, email || null, address || null, fax || null, req.params.id]
    );
    if (!rows[0]) return fail(res, 404, "Supplier not found");
    ok(res, rows[0]);
  } catch (e) {
    fail(res, e.code === "23505" ? 409 : 500, e.code === "23505" ? "Supplier name already exists" : e.message);
  }
});

router.delete("/suppliers/:id", protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      "UPDATE po_suppliers SET is_active=FALSE, updated_at=NOW() WHERE id=$1 AND is_active=TRUE RETURNING id",
      [req.params.id]
    );
    if (!rows[0]) return fail(res, 404, "Supplier not found");
    ok(res, { id: rows[0].id });
  } catch (e) { fail(res, 500, e.message); }
});

// ── Notifications / inbox ──
// Returns: whole-role broadcasts for my role (target_user_id IS NULL) PLUS any
// alerts addressed specifically to me (target_user_id = my id — used by the SLA
// sweep to reach the exact drafter/purchaser who owns an item).
router.get("/notifications", protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM po_notifications
        WHERE target_user_id = $1
           OR (target_user_id IS NULL AND role = $2)
        ORDER BY id DESC LIMIT 50`,
      [req.user.id, req.user.role]
    );
    ok(res, rows, { count: rows.length, unread: rows.filter((r) => !r.is_read).length });
  } catch (e) { fail(res, 500, e.message); }
});

router.post("/notifications/:id/read", protect, async (req, res) => {
  try {
    await db.query("UPDATE po_notifications SET is_read = TRUE WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e) { fail(res, 500, e.message); }
});

module.exports = router;
