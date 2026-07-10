// src/routes/poReceivePhotos.js
// Upload / list / serve photos taken when goods are received on a PO.
// Files live on DigitalOcean Spaces (see config/spaces.js) — App Platform's local
// disk is ephemeral and would lose them on every deploy. The Spaces object key is
// kept in the existing file_path column (no schema change).
// Mounted under /api/purchase-orders (see index.js).
const express = require("express");
const multer  = require("multer");
const db      = require("../config/db");
const spaces  = require("../config/spaces");
const { protect } = require("../middleware/auth");

const router = express.Router();
router.use(protect);

const PREFIX = "po-receive-photos";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Only image files are allowed"));
  },
});

const ok   = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const fail = (res, code, error)       => res.status(code).json({ success: false, error });
const decodeName = (n) => { try { return Buffer.from(n, "latin1").toString("utf8"); } catch { return n; } };

// Upload photos for a PO
router.post("/:poNo/receive-photos", upload.array("photos", 30), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return fail(res, 400, "No photos received");
  if (!spaces.isConfigured()) return fail(res, 503, "File storage is not configured on the server yet");
  const uploadedKeys = [];
  try {
    const { rows: poRows } = await db.query(
      "SELECT id FROM purchase_orders WHERE po_no = $1", [req.params.poNo]
    );
    if (!poRows[0]) return fail(res, 404, "PO not found");
    const poId  = poRows[0].id;
    const saved = [];
    for (const f of files) {
      const orig = decodeName(f.originalname);
      const key = await spaces.putBuffer({
        prefix: PREFIX, buffer: f.buffer, contentType: f.mimetype, originalName: f.originalname,
      });
      uploadedKeys.push(key);
      const { rows } = await db.query(
        `INSERT INTO po_receive_photos
           (po_id, original_name, stored_name, file_path, mime_type, size_bytes, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, original_name, mime_type, size_bytes, created_at`,
        [poId, orig, key, key, f.mimetype, f.size, req.user.name]
      );
      saved.push(rows[0]);
    }
    res.status(201).json({ success: true, data: saved });
  } catch (e) {
    await Promise.all(uploadedKeys.map((k) => spaces.deleteObject(k)));
    fail(res, 500, e.message);
  }
});

// List photos for a PO
router.get("/:poNo/receive-photos", async (req, res) => {
  try {
    const { rows: poRows } = await db.query(
      "SELECT id FROM purchase_orders WHERE po_no = $1", [req.params.poNo]
    );
    if (!poRows[0]) return fail(res, 404, "PO not found");
    const { rows } = await db.query(
      "SELECT id, original_name, mime_type, size_bytes, uploaded_by, created_at FROM po_receive_photos WHERE po_id=$1 ORDER BY id",
      [poRows[0].id]
    );
    ok(res, rows, { count: rows.length });
  } catch (e) { fail(res, 500, e.message); }
});

// Serve a photo inline (for <img src>) — streamed from Spaces
router.get("/receive-photos/:id/view", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM po_receive_photos WHERE id=$1", [req.params.id]);
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
  if (err instanceof multer.MulterError)
    return fail(res, 400, err.code === "LIMIT_FILE_SIZE" ? "File too large (max 15 MB each)" : err.message);
  fail(res, 400, err.message || "Upload failed");
});

module.exports = router;
