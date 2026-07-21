// src/routes/purchaseOrders.js
// PO list/detail, manual PO, lead times + delivery, receive (close), cancel.
// PO receiving does NOT touch inventory (per spec — just closes the PO).
// Uses your existing db (../config/db) + auth (protect, roles).
const express = require("express");
const db = require("../config/db");
const { protect, roles } = require("../middleware/auth");
const { withTransaction } = require("../utils/withTransaction");
const { canDo, isAllowed } = require("../utils/canDo");
const { Email } = require("../utils/notifyEmail");
const { notifyInApp, mailAudiences, events } = require("../utils/notifyEvent");
const { redactDetails } = require("../utils/auditTrail");
const STAGE_LABEL ={ WITH_VENDOR: "With Vendor", SHIPPED: "In Transit", ARRIVED_HUB: "Arrived at Hub", RECEIVED_FACTORY: "Received" };

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
  // supplier contact block (for the PO PDF): address / phone / fax / attn
  let supplier = null;
  if (rows[0].supplier_id) {
    const s = await client.query(
      "SELECT contact_person, phone, email, address, fax FROM po_suppliers WHERE id=$1",
      [rows[0].supplier_id]
    );
    supplier = s.rows[0] || null;
  }
  return { ...rows[0], items: items.rows, tracking: track.rows[0] || null, receive_photos: photos.rows, supplier };
}

// Lifecycle message → the 📬 Inbox, never the 🔔 Alerts panel (that one is only for
// the SLA sweep's overdue nags). Stamped explicitly, not left to the column default.
async function notify(client, rolesList, title, body, type, refPr, refPo) {
  for (const role of rolesList)
    await client.query(
      "INSERT INTO po_notifications (role, title, body, type, ref_pr, ref_po, category) VALUES ($1,$2,$3,$4,$5,$6,'message')",
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
    // `overdue` is computed at read time (no stored state, no scheduler): a STOCK
    // PO still OPEN more than 30 days after it was raised is awaiting the FIC.
    const sql = `SELECT *,
        (po_type = 'STOCK' AND status = 'OPEN' AND po_date < NOW() - INTERVAL '30 days') AS overdue
      FROM purchase_orders ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY po_date DESC, id DESC`;
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
  let audience;   // built inside the txn, mailed once it commits
  try {
    const poNo = await withTransaction(async (c) => {
      const sup = await c.query("SELECT name, type, address FROM po_suppliers WHERE id=$1", [f.supplier_id]);
      const num = await c.query("SELECT next_po_no($1,$2) AS po_no", [f.job_no, f.pr_no || "MANUAL"]);
      const poNo = num.rows[0].po_no;
      const amount = items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price || 0), 0);
      const deliveryAddr = f.delivery_method === "SC" ? sup.rows[0]?.address : f.delivery_address;
      // Site location follows the parent PR when there is one; a manual PO with
      // no PR can still be given one explicitly.
      const prLoc = f.pr_no
        ? (await c.query("SELECT location FROM purchase_requests WHERE pr_no = $1", [f.pr_no])).rows[0]?.location
        : null;
      const po = await c.query(
        `INSERT INTO purchase_orders
         (po_no, job_no, pr_no, project_name, location, supplier_id, supplier_name, supplier_type,
          requested_by, prepared_by, required_date, delivery_method, delivery_address, amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [poNo, f.job_no, f.pr_no, f.project_name, f.location || prLoc || null,
         f.supplier_id, sup.rows[0]?.name,
         sup.rows[0]?.type || "Local", f.requested_by, req.user.name, f.required_date,
         f.delivery_method, deliveryAddr, amount]
      );
      let line = 1;
      for (const i of items)
        await c.query(
          "INSERT INTO po_items (po_id, line_no, profile_code, description, qty, unit, unit_price) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [po.rows[0].id, line++, i.profile_code, i.description.trim(), Number(i.qty) || 0, i.unit || "pcs", Number(i.unit_price) || 0]
        );
      // A manual PO usually has no parent PR — then there's no approving manager
      // and no drafter to address, so poRaised() broadcasts to Managers instead.
      const parent = f.pr_no
        ? (await c.query("SELECT pr_no, job_no, project_name, created_by, approved_by FROM purchase_requests WHERE pr_no = $1", [f.pr_no])).rows[0]
        : null;
      audience = await events.poRaised({ actor: req.user, pr: parent || null, poNos: [poNo], poType: "BUY" });
      await notifyInApp(c, audience, { refPr: f.pr_no || null, refPo: poNo });
      return poNo;
    });
    mailAudiences(audience, { refPr: f.pr_no || null, refPo: poNo });
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

// ── Enter / correct unit prices on an OPEN PO ──
// A BUY PO may be generated before the supplier has quoted (see generate-pos):
// it sits OPEN · awaiting pricing with amount 0 until the prices land here.
// Body: { items: [{ id, unit_price }, ...] } — only the lines sent are touched.
// amount is rewritten from ALL lines afterwards, so gst_amount (generated from
// amount) follows automatically.
//
// GATE 2 trigger (enhancement #3): entering or editing any unit price on an OPEN
// BUY PO sends the price to the QS — price_status flips to PENDING_QS_PRICE and any
// prior approval is cleared. This is why "every price edit re-triggers Gate 2", and
// it stops the PO from closing on an unapproved price. Closing is now a separate,
// explicit action (POST /:poNo/close) gated on delivery + price approval.
router.put("/:poNo/prices", canDo("generate_po"), async (req, res) => {
  try {
    const po = await getPO(req.params.poNo);
    if (!po) return fail(res, 404, "PO not found");
    if (po.status !== "OPEN") return fail(res, 409, `Prices can only be set on an OPEN PO (current: ${po.status})`);
    if (po.po_type === "STOCK") return fail(res, 400, "A stock PO carries no supplier prices");

    const byId = new Map(po.items.map((i) => [i.id, i]));
    const updates = [];
    for (const row of req.body?.items || []) {
      const item = byId.get(Number(row.id));
      if (!item) return fail(res, 400, `Line ${row.id} is not on this PO`);
      const price = Number(row.unit_price);
      if (!Number.isFinite(price) || price < 0) return fail(res, 400, `Invalid unit price for "${item.description}"`);
      if (Number(item.unit_price) === price) continue;   // no-op line, skip
      updates.push({ item, price });
    }
    if (!updates.length) return ok(res, po);

    await withTransaction(async (c) => {
      for (const u of updates)
        await c.query("UPDATE po_items SET unit_price=$2 WHERE id=$1", [u.item.id, u.price]);
      // Recompute from the table, not from the payload — untouched lines count too.
      await c.query(
        `UPDATE purchase_orders SET amount =
           (SELECT COALESCE(SUM(qty * unit_price), 0) FROM po_items WHERE po_id = $1)
         WHERE id = $1`,
        [po.id]
      );
      // Gate 2: the edited price now needs (re-)approval; clear any prior approval.
      await c.query(
        "UPDATE purchase_orders SET price_status='PENDING_QS_PRICE', price_approved_by=NULL, price_approved_at=NULL WHERE id=$1",
        [po.id]
      );
      const details = {
        fields: [],
        items: updates.map((u) => ({
          line: Number(u.item.line_no) || 0,
          change: "modified",
          description: u.item.description,
          // `price: true` marks the entry for redaction in GET /:poNo/history
          diffs: [{ field: "Unit Price", from: String(u.item.unit_price), to: String(u.price), price: true }],
        })),
      };
      await c.query(
        "INSERT INTO po_approvals (po_id, action, from_status, to_status, actor, actor_role, details) VALUES ($1,'PRICE_UPDATE',$2,$2,$3,$4,$5)",
        [po.id, po.status, req.user.name, req.user.role, JSON.stringify(details)]
      );
      await notify(c, ["QS"], `PO price pending approval: ${po.po_no}`,
        `${po.supplier_name || "Supplier"} — review and approve the price on ${po.po_no}.`,
        "message", po.pr_no, po.po_no);
    });
    ok(res, await getPO(po.po_no));
  } catch (e) { fail(res, 500, e.message); }
});

// GATE 2 (enhancement #3): QS approves the price on the PO.
router.post("/:poNo/qs-approve-price", canDo("qs_approve"), async (req, res) => {
  try {
    const po = await getPO(req.params.poNo);
    if (!po) return fail(res, 404, "PO not found");
    if (po.status !== "OPEN") return fail(res, 409, `PO is ${po.status}; price approval only applies while OPEN`);
    if (po.price_status !== "PENDING_QS_PRICE")
      return fail(res, 409, `Nothing pending price approval on ${po.po_no} (price status: ${po.price_status})`);
    if (po.items.some((it) => !(Number(it.unit_price) > 0)))
      return fail(res, 400, "Every line needs a price before it can be approved");
    await withTransaction(async (c) => {
      await c.query(
        "UPDATE purchase_orders SET price_status='PRICE_APPROVED', price_approved_by=$2, price_approved_at=NOW() WHERE id=$1",
        [po.id, req.user.name]
      );
      await c.query(
        "INSERT INTO po_approvals (po_id, action, from_status, to_status, actor, actor_role, note) VALUES ($1,'QS_APPROVE_PRICE',$2,$2,$3,$4,$5)",
        [po.id, po.status, req.user.name, req.user.role, "Price approved"]
      );
      await notify(c, ["Purchaser"], `PO price approved: ${po.po_no}`,
        `The price on ${po.po_no} is approved. Close it once the goods are delivered.`,
        "success", po.pr_no, po.po_no);
    });
    ok(res, await getPO(po.po_no));
  } catch (e) { fail(res, 500, e.message); }
});

// GATE 2 (enhancement #3): QS sends the price back to the Purchaser to revise.
router.post("/:poNo/qs-send-back-price", canDo("qs_approve"), async (req, res) => {
  try {
    const po = await getPO(req.params.poNo);
    if (!po) return fail(res, 404, "PO not found");
    if (po.price_status !== "PENDING_QS_PRICE")
      return fail(res, 409, `Nothing pending price approval on ${po.po_no}`);
    const reason = (req.body?.reason || "").trim();
    await withTransaction(async (c) => {
      await c.query(
        "UPDATE purchase_orders SET price_status='AWAITING_PRICING', price_approved_by=NULL, price_approved_at=NULL WHERE id=$1",
        [po.id]
      );
      await c.query(
        "INSERT INTO po_approvals (po_id, action, from_status, to_status, actor, actor_role, note) VALUES ($1,'QS_SEND_BACK_PRICE',$2,$2,$3,$4,$5)",
        [po.id, po.status, req.user.name, req.user.role, reason || "Price sent back"]
      );
      await notify(c, ["Purchaser"], `PO price sent back: ${po.po_no}`,
        reason || `Revise the price on ${po.po_no} and resubmit for approval.`,
        "warning", po.pr_no, po.po_no);
    });
    ok(res, await getPO(po.po_no));
  } catch (e) { fail(res, 500, e.message); }
});

// Close a BUY PO (enhancement #3). Standalone from the FIC track, but Close is the
// one point that joins them: it needs BOTH the goods received (FIC = Delivered) AND
// the latest price QS-approved. Stock POs still close on receipt, not here.
router.post("/:poNo/close", canDo("generate_po"), async (req, res) => {
  try {
    const po = await getPO(req.params.poNo);
    if (!po) return fail(res, 404, "PO not found");
    if (po.status !== "OPEN") return fail(res, 409, `PO is already ${po.status}`);
    if (po.po_type === "STOCK") return fail(res, 400, "Stock POs close on receipt, not here");
    if (!po.goods_received_date) return fail(res, 409, "The goods must be received (FIC) before the PO can be closed");
    if (po.price_status !== "PRICE_APPROVED") return fail(res, 409, "The price must be QS-approved before the PO can be closed");
    await withTransaction(async (c) => {
      await c.query("UPDATE purchase_orders SET status='CLOSED' WHERE id=$1", [po.id]);
      await c.query(
        "INSERT INTO po_approvals (po_id, action, from_status, to_status, actor, actor_role, note) VALUES ($1,'CLOSE','OPEN','CLOSED',$2,$3,$4)",
        [po.id, req.user.name, req.user.role, (req.body?.notes || "").trim() || "Delivered and price approved — PO closed"]
      );
      await notify(c, ["Purchaser", "Manager"], `PO closed: ${po.po_no}`,
        `${po.po_no} closed — goods delivered and price approved.`, "success", po.pr_no, po.po_no);
    });
    const fresh = await getPO(po.po_no);
    Email.poClosed(fresh);
    ok(res, fresh);
  } catch (e) { fail(res, 500, e.message); }
});

// ── Set delivery stage (FIC / Supervisor click the tracker) ──
const BUY_STAGE_ORDER   = ["WITH_VENDOR", "SHIPPED", "ARRIVED_HUB", "RECEIVED_FACTORY"];
const STOCK_STAGE_ORDER = ["PENDING_ISSUE", "READY_COLLECT", "COLLECTED"];

// ── Audit trail / history (DR-AUD-004) ──
// Any user who can open the PO may view its history. Prices inside the change
// details are stripped SERVER-SIDE for roles without see_po_price.
router.get("/:poNo/history", async (req, res) => {
  try {
    const po = await getPO(req.params.poNo);
    if (!po) return fail(res, 404, "PO not found");
    const canSeePrice = await isAllowed(req.user.role, "see_po_price");
    const { rows } = await db.query(
      `SELECT id, action, from_status, to_status, actor, actor_role, note, details, created_at
         FROM po_approvals WHERE po_id = $1 ORDER BY created_at ASC, id ASC`,
      [po.id]
    );
    ok(res, rows.map((r) => ({ ...r, details: redactDetails(r.details, canSeePrice) })),
      { count: rows.length, can_see_price: canSeePrice });
  } catch (e) { fail(res, 500, e.message); }
});

router.put("/:poNo/delivery-stage", canDo("set_delivery"),async (req, res) => {
  try {
    const po = await getPO(req.params.poNo);
    if (!po) return fail(res, 404, "PO not found");
    if (po.status !== "OPEN") return fail(res, 409, `PO is ${po.status}; delivery stage can only change while OPEN`);

    const stage = req.body?.stage;
    const stageOrder = po.po_type === "STOCK" ? STOCK_STAGE_ORDER : BUY_STAGE_ORDER;

    if (!stage || !stageOrder.includes(stage))
      return fail(res, 400, "Invalid delivery stage");

    // The final stage (Received/Collected) represents goods actually received —
    // it may only be set through the Receive-goods flow (photos + stock update).
    if (stage === stageOrder[stageOrder.length - 1])
      return fail(res, 400, "Use 'Receive goods' to mark this PO as received/collected.");

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
    if (po.goods_received_date) return fail(res, 409, "Goods on this PO are already recorded as received");
    // Receiving goods and closing the PO are two different events. The FIC records
    // the physical receipt whenever the goods land — that must never be blocked on
    // paperwork. But a CLOSED PO is the settled record of committed spend, so an
    // unpriced buy PO stays OPEN ("received · needs pricing") until the prices are
    // entered; PUT /:poNo/prices closes it at that point. Stock POs carry no
    // supplier prices, so they close on receipt as before.
    // Enhancement #3: receiving is the FIC "Delivered" event. It NO LONGER closes a
    // BUY PO — that now needs an explicit Close (Delivered + QS-approved price, see
    // POST /:poNo/close). Only STOCK POs (no price gate) still close on receipt.
    const willClose = po.po_type === "STOCK";
    // Receiving also advances the tracker to its final stage so the delivery
    // status and the PO status can't disagree.
    const finalStage = po.po_type === "STOCK" ? "COLLECTED" : "RECEIVED_FACTORY";
    await withTransaction(async (c) => {
      // For a STOCK PO, receiving IS the stock issue: pull each still-reserved PR
      // line out of inventory (fn_fic_reduce_stock writes the OUT movement + drops
      // quantity_in_stock and flips it to STOCK_REDUCED) and release the reservation
      // placed at send-to-FIC. Lines already issued are skipped by the PENDING_FIC
      // filter; if any line is short on stock the function raises and the whole
      // receive rolls back, so the PO can't close without the stock actually moving.
      if (po.po_type === "STOCK") {
        const held = await c.query(
          `SELECT id, inventory_id, stock_qty FROM pr_items
             WHERE pr_id = $1 AND COALESCE(stock_location,'Stock') = COALESCE($2,'Stock')
               AND stock_qty > 0 AND stock_status = 'PENDING_FIC' AND inventory_id IS NOT NULL
             FOR UPDATE`,
          [po.pr_id, po.source_location]
        );
        for (const it of held.rows) {
          await c.query("SELECT fn_fic_reduce_stock($1,$2)", [it.id, req.user.name]);
          await c.query(
            "UPDATE inventory SET reserved_qty = GREATEST(0, reserved_qty - $1) WHERE id = $2",
            [it.stock_qty, it.inventory_id]
          );
        }
      }
      await c.query(
        "UPDATE purchase_orders SET status=$3, goods_received_date=CURRENT_DATE, delivery_stage=$2 WHERE id=$1",
        [po.id, finalStage, willClose ? "CLOSED" : "OPEN"]
      );
      await c.query(
        "INSERT INTO po_approvals (po_id, action, from_status, to_status, actor, actor_role, note) VALUES ($1,'RECEIVE','OPEN',$2,$3,$4,$5)",
        [po.id, willClose ? "CLOSED" : "OPEN", req.user.name, req.user.role, req.body?.notes || ""]
      );
      // A BUY PO stays OPEN after receipt: the goods are Delivered, but the Purchaser
      // still Closes it explicitly once the price is QS-approved. A STOCK PO closes here.
      if (!willClose) {
        await notify(c, ["Purchaser"], `Goods received: ${po.po_no}`,
          `Goods received from ${po.supplier_name}. Close ${po.po_no} once the price is QS-approved.`,
          "message", po.pr_no, po.po_no);
      } else {
        await notify(c, ["Purchaser", "Manager"], `PO closed: ${po.po_no}`,
          `Stock issued from ${po.source_location || "stock"}.`,
          "success", po.pr_no, po.po_no);
      }
    });
    const freshPO = await getPO(po.po_no);
    if (willClose) Email.poClosed(freshPO);   // only a real close is announced
    ok(res, freshPO);
  } catch (e) {
    // Surface the friendly stock message from the DB function (e.g. "Not enough
    // stock…") as a 409 rather than a raw 500.
    const msg = String(e.message).replace(/^.*ERROR:\s*/, "");
    const conflict = /not enough stock|already reduced/i.test(msg);
    fail(res, conflict ? 409 : 500, msg);
  }
});

// ── Cancel ──
router.post("/:poNo/cancel", canDo("cancel_po"), async (req, res) => {
  try {
    const po = await getPO(req.params.poNo);
    if (!po) return fail(res, 404, "PO not found");
    if (po.status !== "OPEN") return fail(res, 409, `Only OPEN POs can be cancelled (current: ${po.status})`);
    // An unpriced PO stays OPEN after its goods arrive, so "OPEN" alone no longer
    // means "nothing has happened yet" — the goods may already be on the floor.
    if (po.goods_received_date) return fail(res, 409, "Goods on this PO have already been received — it can't be cancelled. Enter the prices to close it.");
    await withTransaction(async (c) => {
      await c.query("UPDATE purchase_orders SET status='CANCELLED' WHERE id=$1", [po.id]);
      await c.query(
        "INSERT INTO po_approvals (po_id, action, from_status, to_status, actor, actor_role, note) VALUES ($1,'CANCEL','OPEN','CANCELLED',$2,$3,$4)",
        [po.id, req.user.name, req.user.role, req.body?.reason || ""]
      );
      // Cancelling a STOCK PO releases its reservation: the promised pieces go
      // back to "available", and the PR items return to the Purchaser to
      // re-source (stock again, or switch to buy). Physical stock is untouched.
      if (po.po_type === "STOCK") {
        // Match the PO's location group exactly the way the STOCK PO was built
        // at send-to-FIC (key = stock_location || 'Stock'), so multi-location
        // PRs release only the items belonging to *this* PO.
        const held = await c.query(
          `SELECT id, inventory_id, stock_qty FROM pr_items
            WHERE pr_id = $1 AND COALESCE(stock_location, 'Stock') = COALESCE($2, 'Stock')
              AND stock_qty > 0 AND stock_status = 'PENDING_FIC' AND inventory_id IS NOT NULL
            FOR UPDATE`,
          [po.pr_id, po.source_location]
        );
        for (const it of held.rows) {
          await c.query(
            "UPDATE inventory SET reserved_qty = GREATEST(0, reserved_qty - $1) WHERE id = $2",
            [it.stock_qty, it.inventory_id]
          );
          await c.query(
            "UPDATE pr_items SET stock_status = 'AWAITING_PURCHASER' WHERE id = $1",
            [it.id]
          );
        }
      }
    });
    ok(res, await getPO(po.po_no));
  } catch (e) { fail(res, 500, e.message); }
});

module.exports = router;
