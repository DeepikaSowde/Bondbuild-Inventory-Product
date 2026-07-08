// src/routes/prItemAttachments.js
// Per-ITEM file attachments on a PR. Sibling of prAttachments.js (whole-PR files).
// Mounted under /api/purchase-requests (see index.js).
//
// KEY CHOICE — attachments hang off (pr_id, item_uid), never pr_items.id and never
// line_no. The PR edit path DELETEs and re-INSERTs every pr_items row, so ids are
// not stable; and flattenItems() on the frontend assigns line_no positionally, so
// removing visual item 2 renumbers item 3 into its place. Either key would silently
// re-home a supplier quote onto the wrong purchase line. item_uid is minted once per
// visual item and carried across edits.
//
// PERMISSIONS (as agreed with the client):
//   view / download → any authenticated user ("all in the ecosystem")
//   upload          → any authenticated user, while the PR is still editable
//   delete          → the PR's creator, or an Admin, while the PR is still editable
//
// Note the deliberate consequence: because download is open to every authenticated
// user, a supplier quotation attached here is readable by users whose *price columns*
// are redacted elsewhere in the app. That was an explicit decision, not an oversight.
//
// LIMITS: 5 MB per file, 2 files per item, 20 MB per PR. The per-file cap is enforced
// by multer; the other two need a DB round-trip and are enforced below.
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../config/db");
const { protect } = require("../middleware/auth");

const router = express.Router();

const DEST = path.join(__dirname, "..", "..", "uploads", "pr-item-attachments");
fs.mkdirSync(DEST, { recursive: true });

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_ITEM = 2;
const MAX_PR_BYTES = 20 * 1024 * 1024;

// A PR's items may only be touched while the PR itself is still editable — the same
// gate routes/purchaseRequests.js applies to PUT /:prNo. Once approved, the attachments
// are part of what was approved and freeze with it.
const EDITABLE_STATUSES = ["PENDING", "SEND_BACK"];

// Allowlist, not a blocklist. prAttachments.js enumerates ~40 banned extensions and
// still lets .html and .svg through; inverting the default closes that whole class.
const ALLOWED_EXT = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp", ".docx", ".xlsx"]);
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DEST),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  },
});

// file.mimetype comes from the client and is spoofable, so require BOTH the declared
// type and the extension to be on the list. This is a filter, not a virus scanner.
const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.has(mime)) {
    const e = new Error(
      `"${ext || file.originalname}" is not an allowed file type — attach a PDF, image, Word or Excel file.`
    );
    e.code = "BLOCKED_FILE_TYPE";
    return cb(e);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_ITEM },
  fileFilter,
});

const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const fail = (res, code, error) => res.status(code).json({ success: false, error });
const decodeName = (n) => { try { return Buffer.from(n, "latin1").toString("utf8"); } catch { return n; } };
const discard = (files) => (files || []).forEach((f) => fs.unlink(f.path, () => {}));
const mb = (b) => (b / 1024 / 1024).toFixed(1);

const loadPr = async (prNo) => {
  const { rows } = await db.query(
    "SELECT id, pr_no, status, created_by FROM purchase_requests WHERE pr_no = $1", [prNo]
  );
  return rows[0] || null;
};

// ── Upload one or more files against a single item ──
router.post("/:prNo/items/:itemUid/attachments", protect, upload.array("files", MAX_FILES_PER_ITEM),
  async (req, res) => {
    const files = req.files || [];
    if (!files.length) return fail(res, 400, "No files received");
    const { prNo, itemUid } = req.params;
    try {
      const pr = await loadPr(prNo);
      if (!pr) { discard(files); return fail(res, 404, "PR not found"); }
      if (!EDITABLE_STATUSES.includes(pr.status)) {
        discard(files);
        return fail(res, 409, `PR is ${pr.status} — its item attachments can no longer be changed`);
      }

      // The item must actually belong to this PR. Without this, any uid string would
      // create attachment rows nobody can ever see or delete.
      const item = await db.query(
        "SELECT 1 FROM pr_items WHERE pr_id = $1 AND item_uid = $2 LIMIT 1", [pr.id, itemUid]
      );
      if (!item.rows[0]) { discard(files); return fail(res, 404, "Item not found on this PR"); }

      const counts = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE item_uid = $2)::int AS item_files,
           COALESCE(SUM(size_bytes), 0)::bigint       AS pr_bytes
         FROM pr_item_attachments WHERE pr_id = $1`,
        [pr.id, itemUid]
      );
      const { item_files: itemFiles, pr_bytes: prBytes } = counts.rows[0];

      if (Number(itemFiles) + files.length > MAX_FILES_PER_ITEM) {
        discard(files);
        return fail(res, 400,
          `This item already has ${itemFiles} of ${MAX_FILES_PER_ITEM} allowed files`);
      }

      const incoming = files.reduce((s, f) => s + f.size, 0);
      if (Number(prBytes) + incoming > MAX_PR_BYTES) {
        discard(files);
        return fail(res, 400,
          `This PR would hold ${mb(Number(prBytes) + incoming)} MB of attachments — the limit is ${mb(MAX_PR_BYTES)} MB`);
      }

      const saved = [];
      for (const f of files) {
        const { rows } = await db.query(
          `INSERT INTO pr_item_attachments
             (pr_id, item_uid, original_name, stored_name, file_path, mime_type, size_bytes, uploaded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id, pr_id, item_uid, original_name, mime_type, size_bytes, uploaded_by, created_at`,
          [pr.id, itemUid, decodeName(f.originalname), f.filename, f.path, f.mimetype, f.size, req.user.name]
        );
        saved.push(rows[0]);
      }
      res.status(201).json({ success: true, data: saved });
    } catch (e) {
      discard(files);
      fail(res, 500, e.message);
    }
  }
);

// ── List every item attachment on a PR (client groups them by item_uid) ──
router.get("/:prNo/item-attachments", protect, async (req, res) => {
  try {
    const pr = await loadPr(req.params.prNo);
    if (!pr) return fail(res, 404, "PR not found");
    const { rows } = await db.query(
      `SELECT id, pr_id, item_uid, original_name, mime_type, size_bytes, uploaded_by, created_at
       FROM pr_item_attachments WHERE pr_id = $1 ORDER BY item_uid, id`,
      [pr.id]
    );
    ok(res, rows, { count: rows.length });
  } catch (e) { fail(res, 500, e.message); }
});

// ── Download — open to every authenticated user, by explicit decision ──
router.get("/item-attachments/:id/download", protect, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM pr_item_attachments WHERE id = $1", [req.params.id]);
    const a = rows[0];
    if (!a) return fail(res, 404, "Attachment not found");
    if (!fs.existsSync(a.file_path)) return fail(res, 410, "File no longer on server");
    res.download(a.file_path, a.original_name);
  } catch (e) { fail(res, 500, e.message); }
});

// ── Delete — PR creator or Admin only, and only while the PR is editable ──
router.delete("/item-attachments/:id", protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.*, pr.status, pr.created_by
       FROM pr_item_attachments a
       JOIN purchase_requests pr ON pr.id = a.pr_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    const a = rows[0];
    if (!a) return fail(res, 404, "Attachment not found");

    const isOwner = a.created_by && String(a.created_by) === String(req.user.id);
    if (req.user.role !== "Admin" && !isOwner) {
      return fail(res, 403, "Only the person who raised this PR, or an Admin, can remove its attachments");
    }
    if (!EDITABLE_STATUSES.includes(a.status)) {
      return fail(res, 409, `PR is ${a.status} — its item attachments can no longer be changed`);
    }

    await db.query("DELETE FROM pr_item_attachments WHERE id = $1", [req.params.id]);
    fs.unlink(a.file_path, () => {});
    ok(res, { deleted: true });
  } catch (e) { fail(res, 500, e.message); }
});

router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return fail(res, 400, `File too large (max ${mb(MAX_FILE_BYTES)} MB each)`);
    if (err.code === "LIMIT_FILE_COUNT") return fail(res, 400, `At most ${MAX_FILES_PER_ITEM} files per item`);
    return fail(res, 400, err.message);
  }
  if (err && err.code === "BLOCKED_FILE_TYPE") return fail(res, 400, err.message);
  fail(res, 500, err.message || "Upload failed");
});

module.exports = router;
module.exports.LIMITS = { MAX_FILE_BYTES, MAX_FILES_PER_ITEM, MAX_PR_BYTES };
