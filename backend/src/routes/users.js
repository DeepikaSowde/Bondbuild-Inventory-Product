// backend/src/routes/users.js
// User Management API Endpoints - FIXED VERSION

const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// ── Shared validation ──────────────────────────────────────────
const ALLOWED_ROLES = ["Drafter", "Manager", "Purchaser", "Factory In-charge", "Supervisor", "Admin"];
const ALLOWED_STATUS = ["Active", "Inactive"];

// Password policy: 8–128 chars, at least one letter, one number, one special char.
const passwordError = (pw) => {
  if (typeof pw !== "string" || pw.length < 8 || pw.length > 128)
    return "Password must be 8–128 characters";
  if (!/[A-Za-z]/.test(pw)) return "Password must include at least one letter";
  if (!/[0-9]/.test(pw)) return "Password must include at least one number";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must include at least one special character";
  return null;
};
const usernameError = (u) => {
  if (typeof u !== "string" || u.length < 3 || u.length > 30)
    return "User ID must be 3–30 characters";
  if (!/^[a-zA-Z0-9._]+$/.test(u))
    return "User ID can only contain letters, numbers, dot (.) and underscore (_)";
  return null;
};

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
    const name = (req.body.name || "").trim();
    const username = (req.body.username || "").trim();
    const { password, role } = req.body;
    const status = req.body.status || "Active";

    // Required + length + special chars + enum validation
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: "All fields required" });
    }
    if (name.length > 60) return res.status(400).json({ error: "Name must be 60 characters or fewer" });
    const uErr = usernameError(username);
    if (uErr) return res.status(400).json({ error: uErr });
    const pErr = passwordError(password);
    if (pErr) return res.status(400).json({ error: pErr });
    if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (!ALLOWED_STATUS.includes(status)) return res.status(400).json({ error: "Invalid status" });

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
    const userId = req.params.id;
    const name = req.body.name != null ? String(req.body.name).trim() : undefined;
    const username = req.body.username != null ? String(req.body.username).trim() : undefined;
    const { role, status, password } = req.body;

    // Validate any provided field (edit is a partial update)
    if (name !== undefined) {
      if (!name) return res.status(400).json({ error: "Name cannot be empty" });
      if (name.length > 60) return res.status(400).json({ error: "Name must be 60 characters or fewer" });
    }
    if (username !== undefined) {
      const uErr = usernameError(username);
      if (uErr) return res.status(400).json({ error: uErr });
    }
    if (role !== undefined && !ALLOWED_ROLES.includes(role))
      return res.status(400).json({ error: "Invalid role" });
    if (status !== undefined && !ALLOWED_STATUS.includes(status))
      return res.status(400).json({ error: "Invalid status" });
    if (password) {
      const pErr = passwordError(password);
      if (pErr) return res.status(400).json({ error: pErr });
    }

    // Get current user
    const current = await db.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Self-lockout guard: an admin can't deactivate or demote their own account
    if (String(userId) === String(req.user.id)) {
      if (status && status !== "Active")
        return res.status(400).json({ error: "You can't deactivate your own account" });
      if (role && role !== current.rows[0].role)
        return res.status(400).json({ error: "You can't change your own role" });
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
