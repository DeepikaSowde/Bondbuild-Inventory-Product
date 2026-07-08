const jwt = require("jsonwebtoken");
const db = require("../config/db");

const protect = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database
    const { rows } = await db.query(
      // `email` rides along so route handlers can address the acting user
      // directly in lifecycle notifications (see utils/notifyEvent.js).
      `SELECT id, name, username, role, designation, status, email
       FROM users WHERE id = $1`,
      [decoded.id],
    );

    if (!rows[0]) {
      return res.status(401).json({ error: "User not found" });
    }

    if (rows[0].status !== "Active") {
      return res.status(403).json({ error: "Account inactive" });
    }

    // Attach user to request
    req.user = rows[0];
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== "Admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

const roles =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };

module.exports = { protect, adminOnly, roles };
