const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

// ── Login ─────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check username and password provided
    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password required",
      });
    }

    // Find user in database
    const { rows } = await db.query(
      `SELECT * FROM users 
       WHERE LOWER(username) = LOWER($1)`,
      [username],
    );

    const user = rows[0];

    // Check user exists
    if (!user) {
      return res.status(401).json({
        error: "Invalid username or password",
      });
    }

    // Check account is active
    if (user.status !== "Active") {
      return res.status(403).json({
        error: "Your account is inactive. Contact Admin.",
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        error: "Invalid username or password",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
    );

    // Send response
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        designation: user.designation,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Get Current User ──────────────────────────────────────
const getMe = async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { login, getMe };
