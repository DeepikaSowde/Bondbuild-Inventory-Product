// ============================================================
// purchaseOrdersImport.js — ONE-TIME historical PO load
// File: backend/routes/purchaseOrdersImport.js
//
// Parses the client's existing "Purchase Order List" Excel AS-IS
// (no template required) and loads it into the database.
// Mount: app.use("/api/purchase-orders", require("./routes/purchaseOrdersImport"));
// Endpoint: POST /api/purchase-orders/upload   (multer field "file")
//
// Designed for the real file shape:
//   - data sheet named like "2026"; a junk row sits ABOVE the header
//   - PO NO is a compound string  JN431/PR118/26/20132A
//   - one row = one whole PO with a lump-sum AMOUNT (no line items)
//   - statuses: CLOSED / OPEN / COLLECTED PENDING INV / CANCEL
// ============================================================
const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");

// Same db + auth as your other PR/PO routes (purchaseOrders.js).
const db = require("../config/db");
const pool = db.pool;
const { protect, roles } = require("../middleware/auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// If your purchase_orders.pr_no is a FK into purchase_requests, leave true so
// a minimal PR stub is created first. If pr_no is just a text column, set false.
const CREATE_PR_STUBS = true;

// ------------------------------------------------------------
// ⚠ SCHEMA ASSUMPTIONS (inferred from PurchaseOrders.jsx / PurchaseRequests.jsx).
// Confirm against your DB; all writes are isolated in the persistence section.
//   purchase_requests      (pr_no UNIQUE, job_no, project_name, requested_by, status)
//   purchase_orders        (po_no UNIQUE, pr_no, job_no, project_name, po_ref,
//                           supplier_name, supplier_type, po_type, po_date, status,
//                           amount, prepared_by, delivery_method, goods_received_date,
//                           fabrication_lead_days, shipment_etd, shipment_eta,
//                           freight_forwarder, freight_total_cost, remarks)
//   purchase_order_items   (po_no FK, profile_code, description, qty, unit, unit_price, line_total)
//   suppliers              (id, name, type)
// Needs UNIQUE constraints on purchase_orders.po_no (and purchase_requests.pr_no).
// If your PO table has no po_ref/tracking/remarks columns, drop those from the INSERT.
// ------------------------------------------------------------

// ---------- helpers ----------
const norm = (s) =>
  String(s ?? "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function classifyHeader(h) {
  const n = norm(h);
  if (!n) return null;
  if (n.includes("project") && n.includes("descrip")) return null; // ignore Project Description
  if (n === "po no" || n === "po number") return "po_ref";
  if (n === "status") return "status";
  if (n === "project name" || n === "project / site" || n.startsWith("project"))
    return "project_name";
  if (n.includes("descrip") && n.includes("item")) return "item_description";
  // specific: avoid matching "...FROM SUPPLIER SIDE" (shipment col)
  if (/^supplier/.test(n) || n.includes("company name")) return "supplier_name";
  if (n === "requested by") return "requested_by";
  if (n === "prepared by") return "prepared_by";
  if (n.includes("good received") || n.includes("goods received"))
    return "goods_received_date";
  if (n === "po date" || n === "date") return "po_date";
  if (n.includes("freight") && n.includes("cost")) return "freight_total_cost";
  if (n.includes("freight forwa")) return "freight_forwarder";
  if (n.includes("shipment etd")) return "shipment_etd";
  if (n.includes("shipment arrival") || n.includes("shipment eta"))
    return "shipment_eta";
  if (n.includes("fabrication lead")) return "fabrication_lead_days";
  if (n === "delivery" || n.includes("self-collect")) return "delivery_method";
  if (n === "amount" || n.startsWith("amount")) return "amount";
  if (n.includes("invoice verif")) return "invoice_verified";
  if (n === "collect/deliver" || n === "remarks" || n === "notes")
    return "notes";
  return null; // s/no, redundant job col, project description, workflow flags, blanks → ignored
}

function toISODate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[, $]/g, ""));
  return isNaN(n) ? null : n;
}

// JN431/PR118/26/20132A -> { job_no:'431', pr_no:'PR118', po_no:'20132A', po_ref:'...' }
function splitPO(raw) {
  const ref = String(raw).trim();
  const parts = ref.split("/").map((p) => p.trim());
  let [job = "", pr = "", , po = ""] = parts;
  if (/^jn/i.test(job)) job = job.slice(2); // strip "JN", keep everything else as text
  return {
    job_no: job || null,
    pr_no: pr || null,
    po_no: po || null,
    po_ref: ref,
  };
}

function mapStatus(s) {
  const n = String(s || "")
    .trim()
    .toUpperCase();
  if (n === "CANCEL" || n === "CANCELLED")
    return { status: "CANCELLED", note: null };
  if (n.startsWith("COLLECT"))
    return { status: "CLOSED", note: "Collected, invoice pending" };
  if (n === "OPEN" || n === "CLOSED") return { status: n, note: null };
  return { status: "OPEN", note: null };
}

function mapDelivery(s) {
  const tokens = String(s || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, " ")
    .split(/\s+/);
  for (const code of ["COD", "SC", "D"]) if (tokens.includes(code)) return code;
  return null;
}

// Some Excel exports declare a used range covering the whole grid (1M+ rows).
// Reading that directly OOMs the process, so shrink !ref to the real extent first.
function clampUsedRange(ws) {
  let maxR = 0,
    maxC = 0;
  for (const key of Object.keys(ws)) {
    if (key[0] === "!") continue;
    const v = ws[key] && ws[key].v;
    if (v === undefined || v === null || v === "") continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxR, c: maxC },
  });
}

// ---------- parse (schema-independent) ----------
function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });

  // pick the data sheet: the one whose first rows contain a "PO NO" header cell
  let sheet = null,
    headerRowIdx = -1,
    grid = null;
  for (const name of wb.SheetNames) {
    clampUsedRange(wb.Sheets[name]); // ⬅ prevents the 1M-row OOM
    const g = XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      raw: true,
      defval: "",
    });
    const idx = g.findIndex((row) => row.some((c) => norm(c) === "po no"));
    if (idx !== -1) {
      sheet = name;
      headerRowIdx = idx;
      grid = g;
      break;
    }
  }
  if (!sheet)
    throw new Error('Could not find a "PO NO" header row in any sheet.');

  // build columnIndex -> field map
  const headerRow = grid[headerRowIdx];
  const colField = {};
  headerRow.forEach((h, i) => {
    const f = classifyHeader(h);
    if (f) colField[i] = f;
  });

  const records = [];
  const errors = [];
  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const raw = {};
    for (const [i, field] of Object.entries(colField)) {
      const val = row[i];
      raw[field] = typeof val === "string" ? val.trim() : val;
    }
    if (!raw.po_ref) continue; // blank / subtotal row

    const excelRow = r + 1;
    const { job_no, pr_no, po_no, po_ref } = splitPO(raw.po_ref);
    if (!po_no) {
      errors.push({ row: po_ref || excelRow, reason: "Unparseable PO NO" });
      continue;
    }

    const { status, note } = mapStatus(raw.status);
    const amount = toNum(raw.amount);
    const notes = [];
    if (raw.notes) notes.push(String(raw.notes).trim());
    const invV = toISODate(raw.invoice_verified);
    if (invV) notes.push("Invoice verified: " + invV);
    if (note) notes.push(note);

    records.push({
      po_ref,
      job_no,
      pr_no,
      po_no,
      project_name: raw.project_name || null,
      supplier_name: raw.supplier_name
        ? String(raw.supplier_name).trim()
        : null,
      supplier_type: "Local",
      po_type: "BUY",
      po_date: toISODate(raw.po_date),
      status,
      amount,
      prepared_by: raw.prepared_by || null,
      requested_by: raw.requested_by || null,
      delivery_method: mapDelivery(raw.delivery_method),
      goods_received_date: toISODate(raw.goods_received_date),
      fabrication_lead_days: raw.fabrication_lead_days || null,
      shipment_etd: toISODate(raw.shipment_etd),
      shipment_eta: toISODate(raw.shipment_eta),
      freight_forwarder: raw.freight_forwarder || null,
      freight_total_cost: toNum(raw.freight_total_cost),
      remarks: notes.join(" | ") || null,
      // single derived line item — source has no per-item breakdown
      item: {
        description: String(raw.item_description || "")
          .replace(/\s+/g, " ")
          .trim(),
        qty: 1,
        unit: "lot",
        unit_price: amount,
        line_total: amount,
      },
    });
  }

  return { sheet, records, errors };
}

// ============================================================
// ⚠ PERSISTENCE — the only schema-dependent part.
// ============================================================
async function findSupplierId(client, name, type) {
  if (!name) return null;
  const r = await client.query(
    `SELECT id FROM suppliers WHERE LOWER(name)=LOWER($1) LIMIT 1`,
    [name],
  );
  if (r.rows[0]) return r.rows[0].id;
  const ins = await client.query(
    `INSERT INTO suppliers (name, type) VALUES ($1,$2) RETURNING id`,
    [name, type || "Local"],
  );
  return ins.rows[0].id;
}

async function upsertPRStub(client, rec) {
  if (!CREATE_PR_STUBS || !rec.pr_no) return;
  await client.query(
    `INSERT INTO purchase_requests (pr_no, job_no, project_name, requested_by, status)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (pr_no) DO UPDATE SET
       job_no=EXCLUDED.job_no, project_name=EXCLUDED.project_name,
       requested_by=COALESCE(purchase_requests.requested_by, EXCLUDED.requested_by)`,
    [rec.pr_no, rec.job_no, rec.project_name, rec.requested_by, "PO_RAISED"],
  );
}

async function upsertPO(client, rec) {
  await findSupplierId(client, rec.supplier_name, rec.supplier_type);
  await client.query(
    `INSERT INTO purchase_orders
       (po_no, pr_no, job_no, project_name, po_ref, supplier_name, supplier_type, po_type,
        po_date, status, amount, prepared_by, delivery_method, goods_received_date,
        fabrication_lead_days, shipment_etd, shipment_eta, freight_forwarder, freight_total_cost, remarks)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     ON CONFLICT (po_no) DO UPDATE SET
       pr_no=EXCLUDED.pr_no, job_no=EXCLUDED.job_no, project_name=EXCLUDED.project_name,
       po_ref=EXCLUDED.po_ref, supplier_name=EXCLUDED.supplier_name, po_date=EXCLUDED.po_date,
       status=EXCLUDED.status, amount=EXCLUDED.amount, prepared_by=EXCLUDED.prepared_by,
       delivery_method=EXCLUDED.delivery_method, goods_received_date=EXCLUDED.goods_received_date,
       freight_total_cost=EXCLUDED.freight_total_cost, remarks=EXCLUDED.remarks`,
    [
      rec.po_no,
      rec.pr_no,
      rec.job_no,
      rec.project_name,
      rec.po_ref,
      rec.supplier_name,
      rec.supplier_type,
      rec.po_type,
      rec.po_date,
      rec.status,
      rec.amount,
      rec.prepared_by,
      rec.delivery_method,
      rec.goods_received_date,
      rec.fabrication_lead_days,
      rec.shipment_etd,
      rec.shipment_eta,
      rec.freight_forwarder,
      rec.freight_total_cost,
      rec.remarks,
    ],
  );

  await client.query(`DELETE FROM purchase_order_items WHERE po_no=$1`, [
    rec.po_no,
  ]);
  await client.query(
    `INSERT INTO purchase_order_items (po_no, profile_code, description, qty, unit, unit_price, line_total)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      rec.po_no,
      null,
      rec.item.description,
      rec.item.qty,
      rec.item.unit,
      rec.item.unit_price,
      rec.item.line_total,
    ],
  );
}

// ---------- route ----------
// Admin-only import. Widen if needed, e.g. roles("Admin", "Purchaser"),
// and match your roles() signature in middleware/auth.js.
router.post(
  "/upload",
  protect,
  roles("Admin"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file)
      return res
        .status(400)
        .json({ error: "No file uploaded (field name must be 'file')." });

    // ?dry=1  -> parse and return what WOULD be imported, without touching the DB
    const dryRun = req.query.dry === "1" || req.body?.dry === "1";

    let parsed;
    try {
      parsed = parseWorkbook(req.file.buffer);
    } catch (e) {
      return res
        .status(400)
        .json({ error: `Could not read the Excel file: ${e.message}` });
    }

    const { sheet, records, errors } = parsed;

    if (dryRun) {
      return res.json({
        dryRun: true,
        sheet,
        parsed: records.length,
        errors,
        sample: records.slice(0, 10),
      });
    }

    let imported = 0,
      updated = 0,
      skipped = 0;
    const rowErrors = [...errors];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const rec of records) {
        await client.query("SAVEPOINT sp");
        try {
          const exists = await client.query(
            `SELECT 1 FROM purchase_orders WHERE po_no=$1`,
            [rec.po_no],
          );
          await upsertPRStub(client, rec);
          await upsertPO(client, rec);
          exists.rowCount ? updated++ : imported++;
          await client.query("RELEASE SAVEPOINT sp");
        } catch (e) {
          await client.query("ROLLBACK TO SAVEPOINT sp");
          skipped++;
          rowErrors.push({ row: rec.po_ref, reason: e.message });
        }
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: `Import failed: ${e.message}` });
    } finally {
      client.release();
    }

    res.json({ sheet, imported, updated, skipped, errors: rowErrors });
  },
);

module.exports = router;
