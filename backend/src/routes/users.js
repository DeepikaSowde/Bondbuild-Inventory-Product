// backend/src/routes/users.js
// User Management API Endpoints - FIXED VERSION

const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// ── GET ALL USERS ──────────────────────────────────────────────
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, username, role, status, created_at FROM users ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET SINGLE USER ────────────────────────────────────────────
router.get("/:id", protect, adminOnly, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, username, role, status, created_at FROM users WHERE id = $1",
      [req.params.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CREATE NEW USER ────────────────────────────────────────────
router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const { name, username, password, role, status } = req.body;

    // Validation
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: "All fields required" });
    }

    // Check if username already exists
    const existing = await db.query(
      "SELECT id FROM users WHERE LOWER(username) = LOWER($1)",
      [username],
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Username already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const result = await db.query(
      "INSERT INTO users (name, username, password_hash, role, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, username, role, status, created_at",
      [name, username, hashedPassword, role, status || "Active"],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE USER ────────────────────────────────────────────────
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const { name, username, role, status, password } = req.body;
    const userId = req.params.id;

    // Get current user
    const current = await db.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if username already taken (by another user)
    if (username && username !== current.rows[0].username) {
      const existing = await db.query(
        "SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2",
        [username, userId],
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: "Username already taken" });
      }
    }

    // Build update query dynamically
    let updateFields = [];
    let values = [];
    let paramCount = 1;

    if (name) {
      updateFields.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (username) {
      updateFields.push(`username = $${paramCount++}`);
      values.push(username);
    }
    if (role) {
      updateFields.push(`role = $${paramCount++}`);
      values.push(role);
    }
    if (status) {
      updateFields.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push(`password_hash = $${paramCount++}`);
      values.push(hashedPassword);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Add userId at the end
    values.push(userId);
    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(", ")}
      WHERE id = $${paramCount}
      RETURNING id, name, username, role, status, created_at
    `;

    const result = await db.query(updateQuery, values);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE USER ────────────────────────────────────────────────
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;

    // Cannot delete own account
    if (userId === req.user.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // Check if user exists
    const result = await db.query("SELECT name FROM users WHERE id = $1", [
      userId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Delete user
    await db.query("DELETE FROM users WHERE id = $1", [userId]);

    res.json({ message: `User ${result.rows[0].name} deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
