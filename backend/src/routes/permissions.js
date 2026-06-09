// backend/src/routes/permissions.js
// Stock Permissions API Endpoints

const express = require("express");
const db = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// ── GET PERMISSIONS FOR A ROLE ──────────────────────────────────
router.get("/:role", protect, async (req, res) => {
  try {
    const { role } = req.params;

    const result = await db.query(
      "SELECT * FROM stock_permissions WHERE role = $1",
      [role],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Role not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET ALL PERMISSIONS ─────────────────────────────────────────
router.get("/", protect, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM stock_permissions ORDER BY role ASC",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE PERMISSIONS FOR A ROLE (ADMIN ONLY) ──────────────────
router.put("/:role", protect, adminOnly, async (req, res) => {
  try {
    const { role } = req.params;
    const {
      view_stock,
      view_unit_price,
      view_total_value,
      edit_quantity,
      edit_location,
      add_item,
      delete_item,
      export_excel,
    } = req.body;

    const result = await db.query(
      `UPDATE stock_permissions 
       SET view_stock = $1, view_unit_price = $2, view_total_value = $3,
           edit_quantity = $4, edit_location = $5, add_item = $6,
           delete_item = $7, export_excel = $8, updated_at = CURRENT_TIMESTAMP
       WHERE role = $9
       RETURNING *`,
      [
        view_stock,
        view_unit_price,
        view_total_value,
        edit_quantity,
        edit_location,
        add_item,
        delete_item,
        export_excel,
        role,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Role not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
