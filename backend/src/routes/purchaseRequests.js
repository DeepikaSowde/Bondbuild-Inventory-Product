// src/routes/purchaseRequests.js
// PR lifecycle: create (with stock+buy split) → approve/reject/resubmit →
// Purchaser assigns suppliers → FIC reduces stock (writes stock_movements) →
// generate POs (one per supplier, buy qty only).
// Uses your existing db (../config/db) + auth (protect, roles) + withTransaction helper.
const express = require("express");
const db = require("../config/db");
const { protect, roles } = require("../middleware/auth");
const { withTransaction } = require("../utils/withTransaction");

const router = express.Router();
router.use(protect);

const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const fail = (res, code, error) => res.status(code).json({ success: false, error });

// created_by is a uuid FK to users.id — only pass through if it's a real uuid
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuid = (v) => (typeof v === "string" && UUID_RE.test(v) ? v : null);

async function getPR(prNo, client = db) {
  const { rows } = await client.query("SELECT * FROM purchase_requests WHERE pr_no = $1", [prNo]);
  if (!rows[0]) return null;
  const items = await client.query(
    "SELECT * FROM pr_items WHERE pr_id = $1 ORDER BY line_no, id", [rows[0].id]
  );
  // attach the file list to each item (best-effort; ignore if table not present yet)
  let attByItem = {};
  try {
    const itemIds = items.rows.map((it) => it.id);
    if (itemIds.length) {
      const att = await client.query(
        `SELECT id, pr_item_id, original_name, mime_type, size_bytes, created_at
         FROM pr_item_attachments WHERE pr_item_id = ANY($1) ORDER BY id`,
        [itemIds]
      );
      for (const a of att.rows) (attByItem[a.pr_item_id] ||= []).push(a);
    }
  } catch { /* attachments table optional */ }
  const withAtt = items.rows.map((it) => ({ ...it, attachments: attByItem[it.id] || [] }));
  return { ...rows[0], items: withAtt };
}

async function notify(client, rolesList, title, body, type, refPr = null, refPo = null) {
  for (const role of rolesList) {
    await client.query(
      "INSERT INTO po_notifications (role, title, body, type, ref_pr, ref_po) VALUES ($1,$2,$3,$4,$5,$6)",
      [role, title, body, type, refPr, refPo]
    );
  }
}

// ── List ──
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    let sql = "SELECT * FROM purchase_requests";
    const params = [];
    if (status && status !== "All") { params.push(status); sql += " WHERE status = $1"; }
    sql += " ORDER BY created_at DESC, id DESC";
    const { rows } = await db.query(sql, params);
    const withCounts = await Promise.all(rows.map(async (pr) => {
      const c = await db.query(
        "SELECT COUNT(*)::int n, COALESCE(SUM(stock_qty),0) s, COALESCE(SUM(buy_qty),0) b FROM pr_items WHERE pr_id=$1",
        [pr.id]
      );
      return { ...pr, item_count: c.rows[0].n, total_stock_qty: c.rows[0].s, total_buy_qty: c.rows[0].b };
    }));
    ok(res, withCounts, { count: withCounts.length });
  } catch (e) { fail(res, 500, e.message); }
});

router.get("/next-number", async (_req, res) => {
  try {
    const { rows } = await db.query("SELECT last_value, is_called FROM pr_number_seq");
    const next = rows[0].is_called ? Number(rows[0].last_value) + 1 : Number(rows[0].last_value);
    ok(res, { prNo: "PR" + String(next).padStart(3, "0") });
  } catch (e) { fail(res, 500, e.message); }
});

router.get("/:prNo", async (req, res) => {
  try {
    const pr = await getPR(req.params.prNo);
    if (!pr) return fail(res, 404, "PR not found");
    ok(res, pr);
  } catch (e) { fail(res, 500, e.message); }
});

// ── Create (Drafter) ──
router.post("/", roles("Drafter", "Admin"), async (req, res) => {
  const f = req.body || {};
  if (!f.job_no || !f.requested_by) return fail(res, 400, "Job No and Requested By are required");
  const items = (f.items || []).filter((it) => it.description?.trim());
  if (!items.length) return fail(res, 400, "At least one item with a description is required");
  try {
    const prNo = await withTransaction(async (c) => {
      const num = await c.query("SELECT next_pr_no() AS pr_no");
      const prNo = num.rows[0].pr_no;
      const ins = await c.query(
        `INSERT INTO purchase_requests
         (pr_no, job_no, project_name, location, date_required, date_issued, pic, requested_by,
          checked_by, approved_by, remarks, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [prNo, f.job_no, f.project_name, f.location, f.date_required, f.date_issued || null,
         f.pic, f.requested_by, f.checked_by, f.approved_by, f.remarks, asUuid(req.user.id)]
      );
      const prId = ins.rows[0].id;
      let line = 1;
      for (const it of items) {
        const stockQty = Number(it.stock_qty) || 0;
        await c.query(
          `INSERT INTO pr_items
           (pr_id, line_no, profile_code, description, colour, qty, unit, remarks,
            stock_qty, inventory_id, stock_location, stock_status, buy_qty,
            supplier_id, supplier_name, supplier_type, unit_price)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [prId, line++, it.profile_code, it.description.trim(), it.colour,
           Number(it.qty) || 0, it.unit || "pcs", it.remarks, stockQty,
           it.inventory_id || null, it.stock_location,
           stockQty > 0 ? "AWAITING_PURCHASER" : "NONE", Number(it.buy_qty) || 0,
           it.supplier_id || null, it.supplier_name || null, it.supplier_type || "Local", Number(it.unit_price) || 0]
        );
      }
      await c.query(
        "INSERT INTO pr_approvals (pr_id, action, to_status, actor, actor_role) VALUES ($1,'SUBMIT','PENDING',$2,$3)",
        [prId, f.requested_by, req.user.role]
      );
      await notify(c, ["Manager"], `New PR submitted: ${prNo}`,
        `${f.requested_by} submitted a PR for ${f.project_name || f.job_no}. Please review.`, "info", prNo);
      return prNo;
    });
    res.status(201).json({ success: true, data: await getPR(prNo) });
  } catch (e) {
    fail(res, e.code === "23503" ? 400 : 500,
      e.code === "23503" ? "Job No does not exist in po_projects" : e.message);
  }
});

// ── Edit / resubmit (Drafter; only PENDING or SEND_BACK) ──
router.put("/:prNo", roles("Drafter", "Admin"), async (req, res) => {
  try {
    const pr = await getPR(req.params.prNo);
    if (!pr) return fail(res, 404, "PR not found");
    if (!["PENDING", "SEND_BACK"].includes(pr.status))
      return fail(res, 409, `PR is ${pr.status} and can no longer be edited`);
    const f = req.body || {};
    const items = (f.items || []).filter((it) => it.description?.trim());
    if (!items.length) return fail(res, 400, "At least one item is required");
    await withTransaction(async (c) => {
      await c.query(
        `UPDATE purchase_requests SET job_no=$2, project_name=$3, location=$4,
         date_required=$5, pic=$6, checked_by=$7, approved_by=$8, remarks=$9, date_issued=$10 WHERE id=$1`,
        [pr.id, f.job_no || pr.job_no, f.project_name, f.location, f.date_required,
         f.pic, f.checked_by, f.approved_by, f.remarks, f.date_issued || null]
      );
      await c.query("DELETE FROM pr_items WHERE pr_id = $1", [pr.id]);
      let line = 1;
      for (const it of items) {
        const stockQty = Number(it.stock_qty) || 0;
        await c.query(
          `INSERT INTO pr_items
           (pr_id, line_no, profile_code, description, colour, qty, unit, remarks,
            stock_qty, inventory_id, stock_location, stock_status, buy_qty,
            supplier_id, supplier_name, supplier_type, unit_price)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [pr.id, line++, it.profile_code, it.description.trim(), it.colour,
           Number(it.qty) || 0, it.unit || "pcs", it.remarks, stockQty,
           it.inventory_id || null, it.stock_location,
           stockQty > 0 ? "AWAITING_PURCHASER" : "NONE", Number(it.buy_qty) || 0,
           it.supplier_id || null, it.supplier_name || null, it.supplier_type || "Local", Number(it.unit_price) || 0]
        );
      }
      if (f.resubmit) {
        await c.query(
          "UPDATE purchase_requests SET status='PENDING', rejection_type=NULL, rejection_reason=NULL WHERE id=$1",
          [pr.id]
        );
        await c.query(
          "INSERT INTO pr_approvals (pr_id, action, from_status, to_status, actor, actor_role) VALUES ($1,'RESUBMIT','SEND_BACK','PENDING',$2,$3)",
          [pr.id, req.user.name, req.user.role]
        );
        await notify(c, ["Manager"], `PR resubmitted: ${pr.pr_no}`,
          `${pr.requested_by} resubmitted PR ${pr.pr_no}. Please review.`, "info", pr.pr_no);
      }
    });
    ok(res, await getPR(pr.pr_no));
  } catch (e) { fail(res, 500, e.message); }
});

// ── Approve (Manager) ──
router.post("/:prNo/approve", roles("Manager", "Admin"), async (req, res) => {
  try {
    const pr = await getPR(req.params.prNo);
    if (!pr) return fail(res, 404, "PR not found");
    if (pr.status !== "PENDING") return fail(res, 409, `Only PENDING PRs can be approved (current: ${pr.status})`);
    await withTransaction(async (c) => {
      await c.query(
        "UPDATE purchase_requests SET status='APPROVED', approved_date=CURRENT_DATE, approved_by=$2 WHERE id=$1",
        [pr.id, req.body?.approved_by || req.user.name]
      );
      await c.query(
        "INSERT INTO pr_approvals (pr_id, action, from_status, to_status, actor, actor_role) VALUES ($1,'APPROVE','PENDING','APPROVED',$2,$3)",
        [pr.id, req.user.name, req.user.role]
      );
      await notify(c, ["Drafter"], `PR approved: ${pr.pr_no}`,
        `Your PR for ${pr.project_name || pr.job_no} was approved.`, "success", pr.pr_no);
      await notify(c, ["Purchaser"], `Assign suppliers: ${pr.pr_no}`,
        `PR ${pr.pr_no} is approved. Assign suppliers to the buy items, then generate POs.`, "info", pr.pr_no);
    });
    ok(res, await getPR(pr.pr_no));
  } catch (e) { fail(res, 500, e.message); }
});

// ── Reject / send back (Manager) ──
router.post("/:prNo/reject", roles("Manager", "Admin"), async (req, res) => {
  try {
    const pr = await getPR(req.params.prNo);
    if (!pr) return fail(res, 404, "PR not found");
    if (pr.status !== "PENDING") return fail(res, 409, `Only PENDING PRs can be rejected (current: ${pr.status})`);
    const sendBack = req.body?.type === "send_back";
    const reason = req.body?.reason || "";
    await withTransaction(async (c) => {
      await c.query(
        "UPDATE purchase_requests SET status=$2, rejection_type=$3, rejection_reason=$4 WHERE id=$1",
        [pr.id, sendBack ? "SEND_BACK" : "REJECTED", sendBack ? "send_back" : "complete", reason]
      );
      await c.query(
        "INSERT INTO pr_approvals (pr_id, action, from_status, to_status, actor, actor_role, note) VALUES ($1,$2,'PENDING',$3,$4,$5,$6)",
        [pr.id, sendBack ? "SEND_BACK" : "REJECT", sendBack ? "SEND_BACK" : "REJECTED", req.user.name, req.user.role, reason]
      );
      await notify(c, ["Drafter"],
        sendBack ? `PR sent back: ${pr.pr_no}` : `PR rejected: ${pr.pr_no}`,
        (sendBack ? "Please edit and resubmit. " : "") + reason, sendBack ? "warning" : "error", pr.pr_no);
    });
    ok(res, await getPR(pr.pr_no));
  } catch (e) { fail(res, 500, e.message); }
});

// ── Purchaser assigns supplier + price on the BUY portion ──
router.put("/:prNo/items", roles("Purchaser", "Admin"), async (req, res) => {
  try {
    const pr = await getPR(req.params.prNo);
    if (!pr) return fail(res, 404, "PR not found");
    if (pr.status !== "APPROVED") return fail(res, 409, "Suppliers can only be assigned on APPROVED PRs");
    const items = req.body?.items || [];
    await withTransaction(async (c) => {
      for (const it of items) {
        await c.query(
          "UPDATE pr_items SET supplier_id=$2, supplier_name=$3, unit_price=$4 WHERE id=$1 AND pr_id=$5",
          [it.id, it.supplier_id || null, it.supplier_name, Number(it.unit_price) || 0, pr.id]
        );
      }
      // price the stock portion automatically from inventory.unit_price
      await c.query(
        `UPDATE pr_items pi
         SET stock_unit_price = COALESCE(inv.unit_price, 0)
         FROM inventory inv
         WHERE pi.inventory_id = inv.id AND pi.pr_id = $1 AND pi.stock_qty > 0`,
        [pr.id]
      );
    });
    ok(res, await getPR(pr.pr_no));
  } catch (e) { fail(res, 500, e.message); }
});

// ── Purchaser sends stock info to the FIC (flips stock items to PENDING_FIC) ──
// This is the step where the Purchaser tells the FIC which item + location to issue.
router.post("/:prNo/send-to-fic", roles("Purchaser", "Admin"), async (req, res) => {
  try {
    const pr = await getPR(req.params.prNo);
    if (!pr) return fail(res, 404, "PR not found");
    if (pr.status !== "APPROVED") return fail(res, 409, "PR must be APPROVED first");
    const stockItems = pr.items.filter((it) => Number(it.stock_qty) > 0);
    if (!stockItems.length) return fail(res, 400, "This PR has no from-stock items");
    await withTransaction(async (c) => {
      // price stock from inventory + flip AWAITING_PURCHASER -> PENDING_FIC
      await c.query(
        `UPDATE pr_items pi
         SET stock_status = 'PENDING_FIC',
             stock_unit_price = COALESCE(inv.unit_price, pi.stock_unit_price, 0)
         FROM inventory inv
         WHERE pi.inventory_id = inv.id AND pi.pr_id = $1
           AND pi.stock_qty > 0 AND pi.stock_status = 'AWAITING_PURCHASER'`,
        [pr.id]
      );
      await notify(c, ["Factory In-charge"], `Stock to issue: ${pr.pr_no}`,
        `Purchaser sent stock items for ${pr.project_name || pr.job_no}. Please issue from the listed locations.`,
        "info", pr.pr_no);
    });
    ok(res, await getPR(pr.pr_no));
  } catch (e) { fail(res, 500, e.message); }
});

// ── FIC reduces stock for one PR item (PR→inventory action) ──
// Calls the DB function fn_fic_reduce_stock() which (atomically) lowers
// inventory.quantity_in_stock AND writes an 'OUT' row to stock_movements.
router.post("/items/:itemId/reduce-stock", roles("Factory In-charge", "Admin"), async (req, res) => {
  try {
    const r = await db.query("SELECT fn_fic_reduce_stock($1,$2) AS movement_id", [
      req.params.itemId, req.user.name,
    ]);
    ok(res, { movement_id: r.rows[0].movement_id });
  } catch (e) {
    // surface the friendly message from the DB function (e.g. "Not enough stock…")
    fail(res, 409, String(e.message).replace(/^.*ERROR:\s*/, ""));
  }
});

// ── Generate POs from the BUY portion (one PO per supplier) ──
router.post("/:prNo/generate-pos", roles("Purchaser", "Admin"), async (req, res) => {
  try {
    const pr = await getPR(req.params.prNo);
    if (!pr) return fail(res, 404, "PR not found");
    if (pr.status !== "APPROVED") return fail(res, 409, `POs come from APPROVED PRs (current: ${pr.status})`);
    const buyItems = pr.items.filter((it) => Number(it.buy_qty) > 0);
    if (!buyItems.length) return fail(res, 400, "No buy-quantity items on this PR");
    for (const it of buyItems)
      if (!it.supplier_id) return fail(res, 400, `Assign a supplier to "${it.description}" first`);

    // Per the flow, FIC issues stock BEFORE POs are generated.
    const pendingStock = pr.items.filter((it) => Number(it.stock_qty) > 0 && it.stock_status !== "STOCK_REDUCED");
    if (pendingStock.length)
      return fail(res, 409, `Stock not issued yet for ${pendingStock.length} item(s) — the Factory In-charge must reduce stock first`);

    const created = await withTransaction(async (c) => {
      const groups = {};
      for (const it of buyItems)
        (groups[it.supplier_id] ||= { supplier_id: it.supplier_id, supplier_name: it.supplier_name, items: [] }).items.push(it);
      const poNos = [];
      for (const g of Object.values(groups)) {
        const sup = await c.query("SELECT type FROM po_suppliers WHERE id=$1", [g.supplier_id]);
        const supType = sup.rows[0]?.type || "Local";
        const num = await c.query("SELECT next_po_no($1,$2) AS po_no", [pr.job_no, pr.pr_no]);
        const poNo = num.rows[0].po_no;
        const amount = g.items.reduce((s, i) => s + Number(i.buy_qty) * Number(i.unit_price || 0), 0);
        const po = await c.query(
          `INSERT INTO purchase_orders
           (po_no, job_no, pr_id, pr_no, project_name, supplier_id, supplier_name,
            supplier_type, requested_by, prepared_by, amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [poNo, pr.job_no, pr.id, pr.pr_no, pr.project_name, g.supplier_id,
           g.supplier_name, supType, pr.requested_by, req.user.name, amount]
        );
        let line = 1;
        for (const it of g.items)
          await c.query(
            "INSERT INTO po_items (po_id, line_no, profile_code, description, qty, unit, unit_price) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            [po.rows[0].id, line++, it.profile_code, it.description, Number(it.buy_qty), it.unit, Number(it.unit_price) || 0]
          );
        await c.query(
          "INSERT INTO po_approvals (po_id, action, to_status, actor, actor_role) VALUES ($1,'CREATE','OPEN',$2,$3)",
          [po.rows[0].id, req.user.name, req.user.role]
        );
        poNos.push(poNo);
      }
      await c.query("UPDATE purchase_requests SET status='PO_RAISED' WHERE id=$1", [pr.id]);
      await notify(c, ["Drafter", "Manager"], `POs created for ${pr.pr_no}`,
        `${poNos.length} PO(s) generated: ${poNos.join(", ")}`, "success", pr.pr_no, poNos[0]);
      return poNos;
    });
    ok(res, { created_pos: created, pr: await getPR(pr.pr_no) });
  } catch (e) { fail(res, 500, e.message); }
});

module.exports = router;
