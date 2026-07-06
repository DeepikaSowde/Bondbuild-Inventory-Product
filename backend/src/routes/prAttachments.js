// src/routes/prAttachments.js
// Whole-PR file attachments — stored on the backend in uploads/pr-attachments/.
// One set of files per PR (any type, 10 MB each). Files are picked on the create
// form and uploaded right after the PR saves; also viewable/manageable when the PR
// is opened later. Uses your existing db + auth (protect).
// Mounted under /api/purchase-requests (see index.js note).
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../config/db");
const { protect } = require("../middleware/auth");

const router = express.Router();

const DEST = path.join(__dirname, "..", "..", "uploads", "pr-attachments");
fs.mkdirSync(DEST, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DEST),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  },
});

// Block executable and script files — attachments should be documents/images only.
const BLOCKED_EXT = new Set([
  ".exe", ".com", ".scr", ".msi", ".msix", ".bat", ".cmd", ".dll", ".app", ".apk",
  ".jar", ".gadget", ".pif", ".cpl", ".sys", ".bin", ".run", ".out",
  ".sh", ".bash", ".zsh", ".ps1", ".psm1", ".psd1", ".vbs", ".vbe", ".vb",
  ".js", ".mjs", ".cjs", ".jse", ".wsf", ".wsh", ".hta", ".reg", ".lnk",
  ".py", ".pyc", ".pl", ".rb", ".php", ".php5", ".phtml", ".cgi", ".asp", ".aspx", ".jsp", ".htaccess",
]);
const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (BLOCKED_EXT.has(ext)) {
    const e = new Error(`"${ext}" files are not allowed — executable and script files are blocked.`);
    e.code = "BLOCKED_FILE_TYPE";
    return cb(e);
  }
  cb(null, true);
};
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter });

const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const fail = (res, code, error) => res.status(code).json({ success: false, error });
const decodeName = (n) => { try { return Buffer.from(n, "latin1").toString("utf8"); } catch { return n; } };

// Upload one or more files to a PR (whole-PR)
router.post("/:prNo/attachments", protect, upload.array("files", 20), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return fail(res, 400, "No files received");
  try {
    const pr = await db.query("SELECT id FROM purchase_requests WHERE pr_no = $1", [req.params.prNo]);
    if (!pr.rows[0]) { files.forEach((f) => fs.unlink(f.path, () => {})); return fail(res, 404, "PR not found"); }
    const prId = pr.rows[0].id;
    const saved = [];
    for (const f of files) {
      const orig = decodeName(f.originalname);
      const { rows } = await db.query(
        `INSERT INTO pr_attachments (pr_id, original_name, stored_name, file_path, mime_type, size_bytes, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, pr_id, original_name, mime_type, size_bytes, uploaded_by, created_at`,
        [prId, orig, f.filename, f.path, f.mimetype, f.size, req.user.name]
      );
      saved.push(rows[0]);
    }
    res.status(201).json({ success: true, data: saved });
  } catch (e) {
    files.forEach((f) => fs.unlink(f.path, () => {}));
    fail(res, 500, e.message);
  }
});

// List a PR's attachments
router.get("/:prNo/attachments", protect, async (req, res) => {
  try {
    const pr = await db.query("SELECT id FROM purchase_requests WHERE pr_no = $1", [req.params.prNo]);
    if (!pr.rows[0]) return fail(res, 404, "PR not found");
    const { rows } = await db.query(
      "SELECT id, pr_id, original_name, mime_type, size_bytes, uploaded_by, created_at FROM pr_attachments WHERE pr_id = $1 ORDER BY id",
      [pr.rows[0].id]
    );
    ok(res, rows, { count: rows.length });
  } catch (e) { fail(res, 500, e.message); }
});

// Download one file
router.get("/attachments/:id/download", protect, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM pr_attachments WHERE id = $1", [req.params.id]);
    const a = rows[0];
    if (!a) return fail(res, 404, "Attachment not found");
    if (!fs.existsSync(a.file_path)) return fail(res, 410, "File no longer on server");
    res.download(a.file_path, a.original_name);
  } catch (e) { fail(res, 500, e.message); }
});

// Delete one file
router.delete("/attachments/:id", protect, async (req, res) => {
  try {
    const { rows } = await db.query("DELETE FROM pr_attachments WHERE id = $1 RETURNING *", [req.params.id]);
    const a = rows[0];
    if (!a) return fail(res, 404, "Attachment not found");
    fs.unlink(a.file_path, () => {});
    ok(res, { deleted: true });
  } catch (e) { fail(res, 500, e.message); }
});

router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return fail(res, 400, err.code === "LIMIT_FILE_SIZE" ? "File too large (max 10 MB each)" : err.message);
  }
  if (err && err.code === "BLOCKED_FILE_TYPE") return fail(res, 400, err.message);
  fail(res, 500, err.message || "Upload failed");
});

module.exports = router;
