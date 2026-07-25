// src/routes/alerts.js
// On-demand trigger for the SLA-breach sweep. On spin-down hosts (Render free
// tier) the in-process node-cron in index.js misses its 08:00/20:00 ticks while
// the service is asleep, so the real driver is an EXTERNAL cron (a Render Cron
// Job) hitting POST /api/alerts/run-sweep on a fixed clock — which also wakes
// the web service. Set ALERTS_ENABLED=false to retire the in-process scheduler.
const crypto = require("crypto");
const express = require("express");
const { protect, roles } = require("../middleware/auth");
const { runSlaSweep } = require("../utils/alertSla");

const router = express.Router();

// Constant-time compare so a wrong X-Cron-Secret can't be guessed by timing.
function secretMatches(provided) {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Accept EITHER a valid X-Cron-Secret header (unattended external cron) OR a
// normal Admin JWT (manual trigger from the app). The secret path exists because
// a scheduler can't hold an expiring login token. Requires CRON_SECRET to be set
// in the backend env — if it's unset, only the Admin-JWT path works.
function cronOrAdmin(req, res, next) {
  if (secretMatches(req.headers["x-cron-secret"])) return next();
  return protect(req, res, () => roles("Admin")(req, res, next));
}

// `force=true` bypasses the advisory lock (does NOT bypass each rule's own
// N-day threshold — a rule still only fires on entities that actually qualify).
router.post("/run-sweep", cronOrAdmin, async (req, res) => {
  const result = await runSlaSweep({ force: req.query.force === "true" });
  res.json({ success: true, data: result });
});

module.exports = router;
