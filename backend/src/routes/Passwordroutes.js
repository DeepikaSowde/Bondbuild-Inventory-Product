// src/routes/passwordRoutes.js
// Two no-email password features:
//   1. POST /api/auth/change-password      — any logged-in user changes their OWN password
//   2. POST /api/auth/users/:id/reset-password — Admin sets a new (temp) password for a user
//
// Mount in index.js:  app.use("/api/auth", require("./routes/passwordRoutes"));
// (Mount this BEFORE your existing /api/auth route is fine; paths don't collide.)
//
// Uses the real users table (password column = password_hash, bcrypt).
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// Same password policy enforced when creating/editing users (routes/users.js).
const passwordError = (pw) => {
  if (typeof pw !== "string" || pw.length < 8 || pw.length > 128)
    return "Password must be 8–128 characters";
  if (!/[A-Za-z]/.test(pw)) return "Password must include at least one letter";
  if (!/[0-9]/.test(pw)) return "Password must include at least one number";
  if (!/[^A-Za-z0-9]/.test(pw))
    return "Password must include at least one special character (e.g. !@#$)";
  return null;
};

// ── 1. Change my own password ──
// Body: { currentPassword, newPassword }
router.post("/change-password", protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Current and new password are required",
        });
    }
    const pErr = passwordError(String(newPassword));
    if (pErr) {
      return res.status(400).json({ success: false, error: pErr });
    }

    // load the current hash for the logged-in user
    const { rows } = await db.query(
      "SELECT id, password_hash FROM users WHERE id = $1",
      [req.user.id],
    );
    const user = rows[0];
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });

    // verify the current password
    const okPass = await bcrypt.compare(
      String(currentPassword),
      user.password_hash || "",
    );
    if (!okPass) {
      return res
        .status(401)
        .json({ success: false, error: "Current password is incorrect" });
    }

    // prevent reusing the same password
    const same = await bcrypt.compare(
      String(newPassword),
      user.password_hash || "",
    );
    if (same) {
      return res
        .status(400)
        .json({
          success: false,
          error: "New password must be different from the current one",
        });
    }

    const newHash = await bcrypt.hash(String(newPassword), 10);
    await db.query(
      "UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2",
      [newHash, user.id],
    );

    res.json({ success: true, message: "Password changed successfully" });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 2. Admin resets a user's password (no email — sets a temp password) ──
// Body: { newPassword }
router.post(
  "/users/:id/reset-password",
  protect,
  adminOnly,
  async (req, res) => {
    try {
      const { newPassword } = req.body || {};
      const pErr = passwordError(String(newPassword || ""));
      if (pErr) {
        return res.status(400).json({ success: false, error: pErr });
      }

      const { rows } = await db.query(
        "SELECT id, username FROM users WHERE id = $1",
        [req.params.id],
      );
      const user = rows[0];
      if (!user)
        return res
          .status(404)
          .json({ success: false, error: "User not found" });

      const newHash = await bcrypt.hash(String(newPassword), 10);
      await db.query(
        "UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2",
        [newHash, user.id],
      );

      res.json({
        success: true,
        message: `Password reset for ${user.username}`,
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  },
);

module.exports = router;
