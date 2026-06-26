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
    if (String(newPassword).length < 6) {
      return res
        .status(400)
        .json({
          success: false,
          error: "New password must be at least 6 characters",
        });
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
      if (!newPassword || String(newPassword).length < 6) {
        return res
          .status(400)
          .json({
            success: false,
            error: "New password must be at least 6 characters",
          });
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
