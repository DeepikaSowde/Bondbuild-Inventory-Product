const router = require("express").Router();
const { login, getMe } = require("../controllers/authController");
const { protect } = require("../middleware/auth");

// POST /api/auth/login
router.post("/login", login);

// GET /api/auth/me
router.get("/me", protect, getMe);

module.exports = router;
