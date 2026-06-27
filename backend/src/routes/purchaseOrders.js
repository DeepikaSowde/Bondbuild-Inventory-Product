// src/routes/purchaseOrders.js
// PO list/detail, manual PO, lead times + delivery, receive (close), cancel.
// PO receiving does NOT touch inventory (per spec — just closes the PO).
// Uses your existing db (../config/db) + auth (protect, roles).
const express = require("express");
const db = require("../config/db");
const { protect, roles } = require("../middleware/auth");
const { withTransaction } = require("../utils/withTransaction");
const { canDo } = require("../utils/canDo");
const { Email } = require("../utils/notifyEmail");
const STAGE_LABEL = { WITH_VENDOR: "With Vendor", SHIPPED: "In Transit", ARRIVED_HUB: "Arrived at Hub", RECEIVED_FACTORY: "Received" };

const router = express.Router();
router.use(protect);

const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const fail = (res, code, error) => res.status(code).json({ success: false, error });

async function getPO(poNo, client = db) {
  const { rows } = await client.query("SELECT * FROM purchase_orders WHERE po_no = $1", [poNo]);
  if (!rows[0]) return null;
  const items  = await client.query("SELECT * FROM po_items WHERE po_id=$1 ORDER BY line_no, id", [rows[0].id]);
  const track  = await client.query("SELECT * FROM po_delivery_tracking WHERE po_id=$1", [rows[0].id]);
  const photos = await client.query(
    "SELECT id, original_name, mime_type, size_bytes, uploaded_by, created_at FROM po_receive_photos WHERE po_id=$1 ORDER BY id",
    [rows[0].id]
  );
  return { ...rows[0], items: items.rows, tracking: track.rows[0] || null, receive_photos: photos.rows };
}

async function notify(client, rolesList, title, body, type, refPr, refPo) {
  for (const role of rolesList)
    await client.query(
      "INSERT INTO po_notifications (role, title, body, type, ref_pr, ref_po) VALUES ($1,$2,$3,$4,$5,$6)",
      [role, title, body, type, refPr, refPo]
    );
}

// ── List with filters ──
router.get("/", async (req, res) => {
  try {
    const { status, job, q } = req.query;
    const where = []; const params = [];
    if (status && status !== "All") { params.push(status); where.push(`status = $${params.length}`); }
    if (job && job !== "All") { params.push(job); where.push(`job_no = $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(po_no ILIKE $${params.length} OR project_name ILIKE $${params.length} OR supplier_name ILIKE $${params.length})`);
    }
    const sql = `SELECT * FROM purchase_orders ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY po_date DESC, id DESC`;
    const { rows } = await db.query(sql, params);
    ok(res, rows, { count: rows.length });
  } catch (e) { fail(res, 500, e.message); }
});

router.get("/:poNo", async (req, res) => {
  try {
    const po = await getPO(req.params.poNo);
    if (!po) return fail(res, 404, "PO not found");
    ok(res, po);
  } catch (e) { fail(res, 500, e.message); }
});

// ── Manual PO ──
router.post("/", canDo("generate_po"), async (req, res) => {
  const f = req.body || {};
  const items = (f.items || []).filter((i) => i.description?.trim());
  if (!f.job_no || !f.supplier_id || !items.length)
    return fail(res, 400, "Job No, supplier and at least one item are required");
  try {
    const poNo = await withTransaction(async (c) => {
      const sup = await c.query("SELECT name, type, address FROM po_suppliers WHERE id=$1", [f.supplier_id]);
      const num = await c.query("SELECT next_po_no($1,$2) AS po_no", [f.job_no, f.pr_no || "MANUAL"]);
      const poNo = num.rows[0].po_no;
      const amount = items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price || 0), 0);
      const deliveryAddr = f.delivery_method === "SC" ? sup.rows[0]?.address : f.delivery_address;
      const po = await c.query(
        `INSERT INTO purchase_orders
         (po_no, job_no, pr_no, project_name, supplier_id, supplier_name, supplier_type,
          requested_by, prepared_by, required_date, delivery_method, delivery_address, amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [poNo, f.job_no, f.pr_no, f.project_name, f.supplier_id, sup.rows[0]?.name,
         sup.rows[0]?.type || "Local", f.requested_by, req.user.name, f.required_date,
         f.delivery_method, deliveryAddr, amount]
      );
      let line = 1;
      for (const i of items)
        await c.query(
          "INSERT INTO po_items (po_id, line_no, profile_code, description, qty, unit, unit_price) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [po.rows[0].id, line++, i.profile_code, i.description.trim(), Number(i.qty) || 0, i.unit || "pcs", Number(i.unit_price) || 0]
        );
      return poNo;
    });
    res.status(201).json({ success: true, data: await getPO(poNo) });
  } catch (e) { fail(res, 500, e.message); }
});

// ── Update delivery / lead times ──
router.put("/:poNo", canDo("generate_po"), async (req, res) => {
  try {
    const po = await getPO(req.params.poNo);
    if (!po) return fail(res, 404, "PO not found");
    const f = req.body || {};
    await withTransaction(async (c) => {
      let deliveryAddr = f.delivery_address ?? po.delivery_address;
      if (f.delivery_method === "SC") {
        const sup = await c.query("SELECT address FROM po_suppliers WHERE id=$1", [po.supplier_id]);
        deliveryAddr = sup.rows[0]?.address || deliveryAddr;
      }
      await c.query(
        "UPDATE purchase_orders SET required_date=$2, delivery_method=$3, delivery_address=$4 WHERE id=$1",
        [po.id, f.required_date ?? po.required_date, f.delivery_method ?? po.delivery_method, deliveryAddr]
      );
      if (f.tracking) {
        const t = f.tracking;
        await c.query(
          `INSERT INTO po_delivery_tracking
           (po_id, fabrication_lead_days, powder_coating_lead_days, shipment_etd, shipment_eta, freight_forwarder, freight_collect_date, freight_total_cost)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (po_id) DO UPDATE SET
             fabrication_lead_days=EXCLUDED.fabrication_lead_days,
             powder_coating_lead_days=EXCLUDED.powder_coating_lead_days,
             shipment_etd=EXCLUDED.shipment_etd, shipment_eta=EXCLUDED.shipment_eta,
             freight_forwarder=EXCLUDED.freight_forwarder,
             freight_collect_date=EXCLUDED.freight_collect_date,
             freight_total_cost=EXCLUDED.freight_total_cost, updated_at=CURRENT_TIMESTAMP`,
          [po.id, t.fabrication_lead_days || null, t.powder_coating_lead_days || null,
           t.shipment_etd || null, t.shipment_eta || null, t.freight_forwarder,
           t.freight_collect_date || null, t.freight_total_cost || null]
        );
      }
    });
    ok(res, await getPO(po.po_no));
  } catch (e) { fail(res, 500, e.message); }
});

// ── Set delivery stage (FIC / Supervisor click the tracker) ──
const BUY_STAGE_ORDER   = ["WITH_VENDOR", "SHIPPED", "ARRIVED_HUB", "RECEIVED_FACTORY"];
const STOCK_STAGE_ORDER = ["PENDING_ISSUE", "READY_COLLECT", "COLLECTED"];

router.put("/:poNo/delivery-stage", canDo("set_delivery"), async (req, res) => {
  try {
    const po = await getPO(req.params.poNo);
    if (!po) return fail(res, 404, "PO not found");
    if (po.status !== "OPEN") return fail(res, 409, `PO is ${po.status}; delivery stage can only change while OPEN`);

    const stage = req.body?.stage;
    const stageOrder = po.po_type === "STOCK" ? STOCK_STAGE_ORDER : BUY_STAGE_ORDER;

    if (!stage || !stageOrder.includes(stage))
      return fail(res, 400, "Invalid delivery stage");

    const currentIdx = po.delivery_stage ? stageOrder.indexOf(po.delivery_stage) : -1;
    const newIdx     = stageOrder.indexOf(stage);

    if (newIdx <= currentIdx)
      return fail(res, 400, `Cannot go back to "${stage}" — stages can only move forward`);

    await withTransaction(async (c) => {
      await c.query("UPDATE purchase_orders SET delivery_stage=$2 WHERE id=$1", [po.id, stage]);
      await c.query(
        "INSERT INTO po_approvals (po_id, action, actor, actor_role, note) VALUES ($1,'DELIVERY_STAGE',$2,$3,$4)",
        [po.id, req.user.name, req.user.role, stage]
      );
    });
    const updatedPO = await getPO(po.po_no);
    if (stage) Email.deliveryStage(updatedPO, STAGE_LABEL[stage] || stage);
    ok(res, updatedPO);
  } catch (e) { fail(res, 500, e.message); }
});

router.post("/:poNo/receive", canDo("receive_po"), async (req, res) => {
  try {
    const po = await getPO(req.params.poNo);
    if (!po) return fail(res, 404, "PO not found");
    if (po.status !== "OPEN") return fail(res, 409, `PO is already ${po.status}`);
    await withTransaction(async (c) => {
      await c.query(
        "UPDATE purchase_orders SET status='CLOSED', goods_received_date=CURRENT_DATE WHERE id=$1", [po.id]
      );
      await c.query(
        "INSERT INTO po_approvals (po_id, action, from_status, to_status, actor, actor_role, note) VALUES ($1,'RECEIVE','OPEN','CLOSED',$2,$3,$4)",
        [po.id, req.user.name, req.user.role, req.body?.notes || ""]
      );
      await notify(c, ["Purchaser", "Manager"], `PO closed: ${po.po_no}`,
        `Goods received from ${po.supplier_name}.`, "success", po.pr_no, po.po_no);
    });
    const closedPO = await getPO(po.po_no);
    Email.poClosed(closedPO);
    ok(res, closedPO);
  } catch (e) { fail(res, 500, e.message); }
});

// ── Cancel ──
router.post("/:poNo/cancel", canDo("cancel_po"), async (req, res) => {
  try {
    const po = await getPO(req.params.poNo);
    if (!po) return fail(res, 404, "PO not found");
    if (po.status !== "OPEN") return fail(res, 409, `Only OPEN POs can be cancelled (current: ${po.status})`);
    await withTransaction(async (c) => {
      await c.query("UPDATE purchase_orders SET status='CANCELLED' WHERE id=$1", [po.id]);
      await c.query(
        "INSERT INTO po_approvals (po_id, action, from_status, to_status, actor, actor_role, note) VALUES ($1,'CANCEL','OPEN','CANCELLED',$2,$3,$4)",
        [po.id, req.user.name, req.user.role, req.body?.reason || ""]
      );
    });
    ok(res, await getPO(po.po_no));
  } catch (e) { fail(res, 500, e.message); }
});

module.exports = router;
