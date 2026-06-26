// backend/src/routes/poImport.js
// PR/PO historical import — same pattern as importExcel.js (inventory):
// the browser parses the Excel and POSTs JSON; this inserts with pool.query.
// Mount in src/index.js:  app.use("/api/import", require("./routes/poImport"));
//  -> endpoint: POST /api/import/po-seed   body: { grid: [[...row], ...] }

const express = require("express");
const router = express.Router();
const db = require("../config/db"); // { query, pool }
const pool = db; // pool.query(...) works (matches inventory routes)
const pgPool = db.pool; // raw pg Pool, for per-record transactions

console.log("✅ PO import route loaded");

// ----------------------------------------------------------------------------
// ⚠ COLUMN NAMES are inferred from PurchaseOrders.jsx / PurchaseRequests.jsx.
//   purchase_orders      : po_no, pr_no, job_no, project_name, supplier_name,
//                          supplier_type, po_type, po_date, status, amount,
//                          prepared_by, delivery_method, goods_received_date
//   po_items             : po_id (FK -> purchase_orders.id), line_no, profile_code,
//                          description, qty, unit, unit_price, line_total
//   purchase_requests    : pr_no, job_no, project_name, requested_by, status
//   suppliers            : name, type
// If a name differs, every row will report the SAME error — fix it here once.
// ----------------------------------------------------------------------------

const norm = (s) =>
  String(s ?? "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function classifyHeader(h) {
  const n = norm(h);
  if (!n) return null;
  if (n.includes("project") && n.includes("descrip")) return null;
  if (n === "po no" || n === "po number") return "po_ref";
  if (n === "status") return "status";
  if (n === "project name" || n === "project / site" || n.startsWith("project"))
    return "project_name";
  if (n.includes("descrip") && n.includes("item")) return "item_description";
  if (/^supplier/.test(n) || n.includes("company name")) return "supplier_name";
  if (n === "requested by") return "requested_by";
  if (n === "prepared by") return "prepared_by";
  if (n.includes("good received") || n.includes("goods received"))
    return "goods_received_date";
  if (n === "po date" || n === "date") return "po_date";
  if (n === "delivery" || n.includes("self-collect")) return "delivery_method";
  if (n === "amount" || n.startsWith("amount")) return "amount";
  if (n.includes("invoice verif")) return "invoice_verified";
  if (n === "collect/deliver" || n === "remarks" || n === "notes")
    return "notes";
  return null;
}

function toISODate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
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
function splitPO(raw) {
  const ref = String(raw).trim();
  const p = ref.split("/").map((x) => x.trim());
  let [job = "", pr = "", , po = ""] = p;
  if (/^jn/i.test(job)) job = job.slice(2);
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
  const t = String(s || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, " ")
    .split(/\s+/);
  for (const c of ["COD", "SC", "D"]) if (t.includes(c)) return c;
  return null;
}

// grid (array of arrays) -> clean records
function parseGrid(grid) {
  const errors = [];
  if (!Array.isArray(grid) || !grid.length) return { records: [], errors };

  const headerRowIdx = grid.findIndex(
    (row) => Array.isArray(row) && row.some((c) => norm(c) === "po no"),
  );
  if (headerRowIdx === -1)
    throw new Error('No "PO NO" header found in the sheet.');

  const colField = {};
  grid[headerRowIdx].forEach((h, i) => {
    const f = classifyHeader(h);
    if (f) colField[i] = f;
  });

  const records = [];
  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const raw = {};
    for (const [i, field] of Object.entries(colField)) {
      const v = row[i];
      raw[field] = typeof v === "string" ? v.trim() : v;
    }
    if (!raw.po_ref) continue;

    const { job_no, pr_no, po_no, po_ref } = splitPO(raw.po_ref);
    if (!po_no) {
      errors.push({ row: po_ref || r + 1, reason: "Unparseable PO NO" });
      continue;
    }

    const { status, note } = mapStatus(raw.status);
    const amount = toNum(raw.amount) ?? 0; // purchase_orders.amount is NOT NULL
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
      remarks: notes.join(" | ") || null,
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
  return { records, errors };
}

// run fn inside a savepoint; swallow its error (best-effort writes)
async function softly(client, fn) {
  await client.query("SAVEPOINT sp");
  try {
    await fn();
    await client.query("RELEASE SAVEPOINT sp");
  } catch {
    await client.query("ROLLBACK TO SAVEPOINT sp");
  }
}

async function importRecord(client, rec) {
  // job / po_project (must exist — purchase_orders.job_no -> po_projects.job_no FK)
  if (rec.job_no) {
    const ex = await client.query(
      "SELECT 1 FROM po_projects WHERE job_no=$1 LIMIT 1",
      [rec.job_no],
    );
    if (!ex.rowCount) {
      // project_name is NOT NULL — use the site address, fall back to the job number
      await client.query(
        "INSERT INTO po_projects (job_no, project_name) VALUES ($1, $2)",
        [rec.job_no, rec.project_name || rec.job_no],
      );
    }
  }

  // supplier (best-effort, won't fail the row)
  if (rec.supplier_name) {
    await softly(client, async () => {
      const ex = await client.query(
        "SELECT 1 FROM suppliers WHERE LOWER(name)=LOWER($1) LIMIT 1",
        [rec.supplier_name],
      );
      if (!ex.rowCount)
        await client.query(
          "INSERT INTO suppliers (name, type) VALUES ($1,$2)",
          [rec.supplier_name, rec.supplier_type],
        );
    });
  }
  // PR stub (best-effort)
  if (rec.pr_no) {
    await softly(client, async () => {
      const ex = await client.query(
        "SELECT 1 FROM purchase_requests WHERE pr_no=$1 LIMIT 1",
        [rec.pr_no],
      );
      if (!ex.rowCount) {
        await client.query(
          "INSERT INTO purchase_requests (pr_no, job_no, project_name, requested_by, status) VALUES ($1,$2,$3,$4,$5)",
          [
            rec.pr_no,
            rec.job_no,
            rec.project_name,
            rec.requested_by,
            "PO_RAISED",
          ],
        );
      }
    });
  }

  // PO (must succeed) — manual upsert, no constraint needed. Capture the row id.
  const exists = await client.query(
    "SELECT id FROM purchase_orders WHERE po_no=$1",
    [rec.po_no],
  );
  const cols = [
    rec.pr_no,
    rec.job_no,
    rec.project_name,
    rec.supplier_name,
    rec.supplier_type,
    rec.po_type,
    rec.po_date,
    rec.status,
    rec.amount,
    rec.prepared_by,
    rec.delivery_method,
    rec.goods_received_date,
  ];
  let poId;
  if (exists.rowCount) {
    poId = exists.rows[0].id;
    await client.query(
      `UPDATE purchase_orders SET
         pr_no=$2, job_no=$3, project_name=$4, supplier_name=$5, supplier_type=$6,
         po_type=$7, po_date=$8, status=$9, amount=$10, prepared_by=$11,
         delivery_method=$12, goods_received_date=$13
       WHERE po_no=$1`,
      [rec.po_no, ...cols],
    );
  } else {
    const ins = await client.query(
      `INSERT INTO purchase_orders
         (po_no, pr_no, job_no, project_name, supplier_name, supplier_type,
          po_type, po_date, status, amount, prepared_by, delivery_method, goods_received_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [rec.po_no, ...cols],
    );
    poId = ins.rows[0].id;
  }

  // items (must succeed) — po_items links by po_id; replace any existing line(s).
  // line_total is a generated column (computed by the DB), so we do NOT insert it.
  await client.query("DELETE FROM po_items WHERE po_id=$1", [poId]);
  await client.query(
    `INSERT INTO po_items (po_id, line_no, profile_code, description, qty, unit, unit_price)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      poId,
      1,
      null,
      rec.item.description,
      rec.item.qty,
      rec.item.unit,
      rec.item.unit_price,
    ],
  );

  return exists.rowCount > 0; // true = updated
}

// POST /api/import/po-seed   { grid }   ?dry=1 to preview without writing
router.post("/po-seed", async (req, res) => {
  try {
    const { grid } = req.body;
    if (!grid || !Array.isArray(grid)) {
      return res
        .status(400)
        .json({ success: false, message: "No grid data received" });
    }

    let parsed;
    try {
      parsed = parseGrid(grid);
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message });
    }

    const { records, errors } = parsed;

    if (req.query.dry === "1") {
      return res.json({
        success: true,
        dryRun: true,
        parsed: records.length,
        errors,
        sample: records.slice(0, 10),
      });
    }

    let imported = 0,
      updated = 0,
      skipped = 0;
    const rowErrors = [...errors];

    for (const rec of records) {
      const client = await pgPool.connect();
      try {
        await client.query("BEGIN");
        const wasUpdate = await importRecord(client, rec);
        await client.query("COMMIT");
        wasUpdate ? updated++ : imported++;
      } catch (e) {
        await client.query("ROLLBACK");
        skipped++;
        rowErrors.push({ row: rec.po_ref, reason: e.message });
      } finally {
        client.release();
      }
    }

    console.log(
      `📥 PO import: created ${imported}, updated ${updated}, skipped ${skipped}`,
    );
    res.json({ success: true, imported, updated, skipped, errors: rowErrors });
  } catch (error) {
    console.error("❌ PO import error:", error);
    res
      .status(500)
      .json({ success: false, message: "Import failed: " + error.message });
  }
});

module.exports = router;
