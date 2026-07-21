// src/routes/inventoryPhotos.js
// Upload / list / serve photos attached to an inventory item (edit modal).
// Files live on DigitalOcean Spaces (see config/spaces.js) — App Platform's local
// disk is ephemeral and would lose them on every deploy. The Spaces object key is
// kept in the existing file_path column (no schema change).
// Mounted under /api/inventory (see index.js).
const express = require("express");
const multer  = require("multer");
const db      = require("../config/db");
const spaces  = require("../config/spaces");
const { protect } = require("../middleware/auth");

const router = express.Router();
router.use(protect);

const PREFIX = "inventory-photos";

// Upload rules — kept in sync with the Add/Edit Item forms on the frontend.
// An explicit allowlist rather than image/*: it keeps out SVG (which can carry
// script and is served inline by the /view route below) and HEIC (which uploads
// fine from iPhones but no browser can render in an <img>).
const MAX_FILE_BYTES  = 15 * 1024 * 1024;
const MAX_FILES       = 5;
const ALLOWED_MIME    = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Only JPG, PNG, WebP or PDF files are allowed"));
  },
});

const ok   = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const fail = (res, code, error)       => res.status(code).json({ success: false, error });
const decodeName = (n) => { try { return Buffer.from(n, "latin1").toString("utf8"); } catch { return n; } };

// Upload photos for an inventory item
router.post("/:id/photos", upload.array("photos", MAX_FILES), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return fail(res, 400, "No photos received");
  if (!spaces.isConfigured()) return fail(res, 503, "File storage is not configured on the server yet");
  const uploadedKeys = [];
  try {
    const { rows } = await db.query("SELECT id FROM inventory WHERE id = $1", [req.params.id]);
    if (!rows[0]) return fail(res, 404, "Inventory item not found");

    // MAX_FILES is a per-item cap, not per-request: multer's `files` limit only
    // bounds a single upload, so without this an item could accumulate more
    // across repeated visits to the Edit modal.
    const { rows: [{ count }] } = await db.query(
      "SELECT COUNT(*)::int AS count FROM inventory_item_photos WHERE inventory_id = $1", [rows[0].id]
    );
    if (count + files.length > MAX_FILES) {
      const room = MAX_FILES - count;
      return fail(res, 400, room <= 0
        ? `This item already has the maximum of ${MAX_FILES} files. Remove one before adding another.`
        : `This item already has ${count} file(s) — you can add ${room} more (max ${MAX_FILES} per item).`);
    }

    const saved = [];
    for (const f of files) {
      const orig = decodeName(f.originalname);
      const key = await spaces.putBuffer({
        prefix: PREFIX, buffer: f.buffer, contentType: f.mimetype, originalName: f.originalname,
      });
      uploadedKeys.push(key);
      const { rows: r } = await db.query(
        `INSERT INTO inventory_item_photos
           (inventory_id, original_name, stored_name, file_path, mime_type, size_bytes, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, original_name, mime_type, size_bytes, uploaded_by, created_at`,
        [rows[0].id, orig, key, key, f.mimetype, f.size, req.user.name]
      );
      saved.push(r[0]);
    }
    res.status(201).json({ success: true, data: saved });
  } catch (e) {
    await Promise.all(uploadedKeys.map((k) => spaces.deleteObject(k)));
    fail(res, 500, e.message);
  }
});

// List photos for an inventory item
router.get("/:id/photos", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id, original_name, mime_type, size_bytes, uploaded_by, created_at FROM inventory_item_photos WHERE inventory_id=$1 ORDER BY id",
      [req.params.id]
    );
    ok(res, rows, { count: rows.length });
  } catch (e) { fail(res, 500, e.message); }
});

// Delete a photo
router.delete("/photos/:photoId", async (req, res) => {
  try {
    const { rows } = await db.query(
      "DELETE FROM inventory_item_photos WHERE id=$1 RETURNING *", [req.params.photoId]
    );
    if (!rows[0]) return fail(res, 404, "Photo not found");
    await spaces.deleteObject(rows[0].file_path);
    ok(res, { deleted: true });
  } catch (e) { fail(res, 500, e.message); }
});

// Serve a photo inline (for <img> tags) — streamed from Spaces
router.get("/photos/:photoId/view", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM inventory_item_photos WHERE id=$1", [req.params.photoId]
    );
    const photo = rows[0];
    if (!photo) return fail(res, 404, "Photo not found");
    const obj = await spaces.getObject(photo.file_path);
    res.setHeader("Content-Type", photo.mime_type || obj.ContentType || "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    obj.Body.on("error", () => { if (!res.headersSent) fail(res, 500, "Failed to read photo"); else res.end(); });
    obj.Body.pipe(res);
  } catch (e) {
    if (spaces.isMissing(e)) return fail(res, 410, "Photo file missing from server");
    fail(res, 500, e.message);
  }
});

// Multer error handler
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE")  return fail(res, 400, `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB each)`);
    if (err.code === "LIMIT_FILE_COUNT") return fail(res, 400, `Too many files (max ${MAX_FILES} per item)`);
    return fail(res, 400, err.message);
  }
  fail(res, 400, err.message || "Upload failed");
});

module.exports = router;
