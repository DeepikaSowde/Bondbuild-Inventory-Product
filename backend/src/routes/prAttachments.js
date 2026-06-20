// src/routes/prAttachments.js
// PR item file attachments — stored on the backend in uploads/pr-attachments/.
// Multiple files per item, any type, 10 MB each. Uses your existing db + auth (protect).
// Mounted under /api/purchase-requests (see index.js note).
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../config/db");
const { protect } = require("../middleware/auth");

const router = express.Router();

// ── storage: backend/uploads/pr-attachments ──
const DEST = path.join(__dirname, "..", "..", "uploads", "pr-attachments");
fs.mkdirSync(DEST, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DEST),
  filename: (_req, file, cb) => {
    // unique, safe name: <timestamp>-<random>.<ext>; keep the original separately in DB
    const ext = path.extname(file.originalname);
    const base = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, base + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const fail = (res, code, error) => res.status(code).json({ success: false, error });

// Multer stores originalname as latin1; decode to UTF-8 so non-ascii names survive
const decodeName = (n) => {
  try { return Buffer.from(n, "latin1").toString("utf8"); } catch { return n; }
};

// ── Upload one or more files to a PR item ──
router.post("/items/:itemId/attachments", protect, upload.array("files", 20), async (req, res) => {
  const { itemId } = req.params;
  const files = req.files || [];
  if (!files.length) return fail(res, 400, "No files received");
  try {
    // make sure the pr_item exists (avoid orphan files)
    const chk = await db.query("SELECT id FROM pr_items WHERE id = $1", [itemId]);
    if (!chk.rows[0]) {
      files.forEach((f) => fs.unlink(f.path, () => {}));
      return fail(res, 404, "PR item not found");
    }
    const saved = [];
    for (const f of files) {
      const orig = decodeName(f.originalname);
      const { rows } = await db.query(
        `INSERT INTO pr_item_attachments
         (pr_item_id, original_name, stored_name, file_path, mime_type, size_bytes, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [itemId, orig, f.filename, f.path, f.mimetype, f.size, req.user.name]
      );
      saved.push(rows[0]);
    }
    res.status(201).json({ success: true, data: saved });
  } catch (e) {
    // on DB failure, clean up the files we just wrote
    files.forEach((f) => fs.unlink(f.path, () => {}));
    fail(res, 500, e.message);
  }
});

// ── List attachments for an item ──
router.get("/items/:itemId/attachments", protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id, pr_item_id, original_name, mime_type, size_bytes, uploaded_by, created_at FROM pr_item_attachments WHERE pr_item_id = $1 ORDER BY id",
      [req.params.itemId]
    );
    ok(res, rows, { count: rows.length });
  } catch (e) { fail(res, 500, e.message); }
});

// ── Download one file ──
router.get("/attachments/:id/download", protect, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM pr_item_attachments WHERE id = $1", [req.params.id]);
    const a = rows[0];
    if (!a) return fail(res, 404, "Attachment not found");
    if (!fs.existsSync(a.file_path)) return fail(res, 410, "File no longer on server");
    res.download(a.file_path, a.original_name);
  } catch (e) { fail(res, 500, e.message); }
});

// ── Delete one file (DB row + the file on disk) ──
router.delete("/attachments/:id", protect, async (req, res) => {
  try {
    const { rows } = await db.query("DELETE FROM pr_item_attachments WHERE id = $1 RETURNING *", [req.params.id]);
    const a = rows[0];
    if (!a) return fail(res, 404, "Attachment not found");
    fs.unlink(a.file_path, () => {});
    ok(res, { deleted: true });
  } catch (e) { fail(res, 500, e.message); }
});

// multer errors (e.g. file too big) → friendly message
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? "File too large (max 10 MB each)" : err.message;
    return fail(res, 400, msg);
  }
  fail(res, 500, err.message || "Upload failed");
});

module.exports = router;
