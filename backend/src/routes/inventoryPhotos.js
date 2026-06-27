// src/routes/inventoryPhotos.js
// Upload / list / serve photos attached to an inventory item (edit modal).
// Mounted under /api/inventory (see index.js).
const express = require("express");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const db      = require("../config/db");
const { protect } = require("../middleware/auth");

const router = express.Router();
router.use(protect);

const DEST = path.join(__dirname, "..", "..", "uploads", "inventory-photos");
fs.mkdirSync(DEST, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DEST),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Only image files are allowed"));
  },
});

const ok   = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const fail = (res, code, error)       => res.status(code).json({ success: false, error });
const decodeName = (n) => { try { return Buffer.from(n, "latin1").toString("utf8"); } catch { return n; } };

// Upload photos for an inventory item
router.post("/:id/photos", upload.array("photos", 30), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return fail(res, 400, "No photos received");
  try {
    const { rows } = await db.query("SELECT id FROM inventory WHERE id = $1", [req.params.id]);
    if (!rows[0]) {
      files.forEach((f) => fs.unlink(f.path, () => {}));
      return fail(res, 404, "Inventory item not found");
    }
    const saved = [];
    for (const f of files) {
      const orig = decodeName(f.originalname);
      const { rows: r } = await db.query(
        `INSERT INTO inventory_item_photos
           (inventory_id, original_name, stored_name, file_path, mime_type, size_bytes, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, original_name, mime_type, size_bytes, uploaded_by, created_at`,
        [rows[0].id, orig, f.filename, f.path, f.mimetype, f.size, req.user.name]
      );
      saved.push(r[0]);
    }
    res.status(201).json({ success: true, data: saved });
  } catch (e) {
    files.forEach((f) => fs.unlink(f.path, () => {}));
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
    fs.unlink(rows[0].file_path, () => {});
    ok(res, { deleted: true });
  } catch (e) { fail(res, 500, e.message); }
});

// Serve a photo inline (for <img> tags)
router.get("/photos/:photoId/view", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM inventory_item_photos WHERE id=$1", [req.params.photoId]
    );
    const photo = rows[0];
    if (!photo) return fail(res, 404, "Photo not found");
    if (!fs.existsSync(photo.file_path)) return fail(res, 410, "Photo file missing from server");
    res.setHeader("Content-Type", photo.mime_type || "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.sendFile(path.resolve(photo.file_path));
  } catch (e) { fail(res, 500, e.message); }
});

// Multer error handler
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError)
    return fail(res, 400, err.code === "LIMIT_FILE_SIZE" ? "File too large (max 15 MB each)" : err.message);
  fail(res, 400, err.message || "Upload failed");
});

module.exports = router;
