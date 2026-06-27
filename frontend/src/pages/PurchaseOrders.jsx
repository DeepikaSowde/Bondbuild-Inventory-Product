// pages/PurchaseOrders.jsx — Tailwind version
import { useEffect, useMemo, useState } from "react";
import { api, apiError } from "../lib/api";
import { Btn, Badge, Modal, Field, Input, Select, EmptyRow, money } from "../components/ui";
import { Table, Td } from "../components/Table";

export default function PurchaseOrders({ user, perms = {}, notify, refreshInbox }) {
  const [pos, setPOs] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [job, setJob] = useState("All");
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);

  const isAdmin = user.role === "Admin";
  const canManage = !!perms.generate_po || isAdmin;
  const canReceive = !!perms.receive_po || isAdmin;
  const canTrack = !!perms.set_delivery || isAdmin;
  const canCancel = !!perms.cancel_po || isAdmin;
  const canSeePrice = !!perms.see_po_price || isAdmin;
  const canSeeAmount = !!perms.see_po_amount || isAdmin;

  const load = () => api.pos({ status, job, q }).then(setPOs).catch((e) => notify(apiError(e), "error"));
  useEffect(() => { load(); }, [status, job]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q]);

  const jobs = useMemo(() => ["All", ...new Set(pos.map((p) => p.job_no).filter(Boolean))], [pos]);
  const totalVal = pos.reduce((a, p) => a + Number(p.amount || 0), 0);
  const refresh = () => { load(); refreshInbox?.(); };

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-center gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PO, project, supplier…" className="!w-60" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto">
          {["All", "OPEN", "CLOSED", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select value={job} onChange={(e) => setJob(e.target.value)} className="!w-auto">
          {jobs.map((j) => <option key={j}>{j}</option>)}
        </Select>
        <span className="border-l-[3px] border-[#6366F1] pl-2.5 font-mono text-[12.5px] text-[#6B7280]">
          {pos.length} POs{canSeeAmount ? ` · ${money(totalVal)}` : ""}
        </span>
      </div>

      <Table columns={[
        { label: "PO No" }, { label: "PR" }, { label: "Project" }, { label: "Supplier" },
        { label: "Date" }, ...(canSeeAmount ? [{ label: "Amount", align: "right" }] : []), { label: "Status" }, { label: "Delivery stage" }, { label: "" },
      ]}>
        {pos.length === 0 && <EmptyRow colSpan={9}>No purchase orders match.</EmptyRow>}
        {pos.map((p) => (
          <tr key={p.po_no}>
            <Td mono bold className="!text-[#6366F1]">{p.po_no}</Td>
            <Td mono>{p.pr_no || "—"}</Td>
            <Td>{p.project_name || "—"}</Td>
            <Td>{p.po_type === "STOCK" ? <span className="text-[#6366F1]">From stock <span className="text-[11px] text-[#9CA3AF]">@ {p.source_location}</span></span> : p.supplier_name}</Td>
            <Td>{p.po_date?.slice(0, 10)}</Td>
            {canSeeAmount && <Td align="right">{money(p.amount)}</Td>}
            <Td><Badge status={p.status} /></Td>
            <Td>{p.delivery_stage ? <span className="rounded bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-bold text-[#D97706]">{stageLabel(p.delivery_stage)}</span> : <span className="text-[#9CA3AF]">—</span>}</Td>
            <Td align="right"><Btn variant="ghost" small onClick={() => api.po(p.po_no).then(setView)}>Open</Btn></Td>
          </tr>
        ))}
      </Table>

      {view && (
        <POView po={view} canManage={canManage} canReceive={canReceive} canTrack={canTrack} canCancel={canCancel}
          canSeePrice={canSeePrice} canSeeAmount={canSeeAmount}
          busy={busy} setBusy={setBusy} notify={notify}
          onChanged={(fresh) => { setView(fresh); refresh(); }} onClose={() => setView(null)} />
      )}
    </div>
  );
}

function POView({ po, canManage, canReceive, canTrack, canCancel, canSeePrice, canSeeAmount, busy, setBusy, notify, onChanged, onClose }) {
  const [d, setD] = useState({
    delivery_method: po.delivery_method || "",
    delivery_address: po.delivery_address || "",
    required_date: po.required_date || "",
    tracking: {
      fabrication_lead_days: po.tracking?.fabrication_lead_days || "",
      powder_coating_lead_days: po.tracking?.powder_coating_lead_days || "",
      shipment_etd: po.tracking?.shipment_etd?.slice(0, 10) || "",
      shipment_eta: po.tracking?.shipment_eta?.slice(0, 10) || "",
      freight_forwarder: po.tracking?.freight_forwarder || "",
      freight_total_cost: po.tracking?.freight_total_cost || "",
    },
  });
  const setT = (k, v) => setD((s) => ({ ...s, tracking: { ...s.tracking, [k]: v } }));

  const act = async (fn, msg) => {
    setBusy(true);
    try { await fn(); if (msg) notify(msg); onChanged(await api.po(po.po_no)); }
    catch (e) { notify(apiError(e), "error"); } finally { setBusy(false); }
  };
  const isSC = d.delivery_method === "SC";

  const meta = [["Status", <Badge status={po.status} />], ["Supplier", po.supplier_name], ["Type", po.supplier_type],
    ["Job", po.job_no || "—"], ["From PR", po.pr_no || "—"], ["Prepared by", po.prepared_by || "—"],
    ["PO date", po.po_date?.slice(0, 10)], ["Received", po.goods_received_date?.slice(0, 10) || "—"]];

  return (
    <Modal wide title={`Purchase order ${po.po_no}`} onClose={onClose}>
      <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-[18px] gap-y-3">
        {meta.map(([k, v], i) => (
          <div key={i}>
            <div className="mb-0.5 text-[10px] uppercase tracking-wide text-[#9CA3AF]">{k}</div>
            <div className="text-[13.5px] font-semibold text-[#374151]">{v}</div>
          </div>
        ))}
      </div>

      <table className="mb-4 w-full border-collapse text-[13px]">
        <thead>
          <tr>{["Code", "Description", "Qty", "Unit", ...(canSeePrice ? ["Unit price"] : []), ...(canSeeAmount ? ["Amount"] : [])].map((h, i) => (
            <th key={i} className="border-b border-[#E5E7EB] px-2.5 py-2 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {po.items.map((it) => (
            <tr key={it.id}>
              <td className="border-b border-[#F3F4F6] px-2.5 py-2 font-mono">{it.profile_code || "—"}</td>
              <td className="border-b border-[#F3F4F6] px-2.5 py-2">{it.description}</td>
              <td className="border-b border-[#F3F4F6] px-2.5 py-2">{it.qty}</td>
              <td className="border-b border-[#F3F4F6] px-2.5 py-2">{it.unit}</td>
              {canSeePrice && <td className="border-b border-[#F3F4F6] px-2.5 py-2">{money(it.unit_price)}</td>}
              {canSeeAmount && <td className="border-b border-[#F3F4F6] px-2.5 py-2">{money(it.line_total)}</td>}
            </tr>
          ))}
        </tbody>
        {canSeeAmount && (
          <tfoot>
            <tr><td colSpan={4 + (canSeePrice ? 1 : 0)} className="px-2.5 py-2.5 text-right font-bold text-[#6B7280]">Total</td>
              <td className="px-2.5 py-2.5 font-extrabold text-[#1E1B4B]">{money(po.amount)}</td></tr>
          </tfoot>
        )}
      </table>

      {canManage && po.status === "OPEN" && (
        <>
          <div className="my-1.5 text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">Delivery &amp; lead times</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
            <Field label="Delivery method">
              <Select value={d.delivery_method} onChange={(e) => setD({ ...d, delivery_method: e.target.value })}>
                <option value="">—</option><option value="D">Delivery</option><option value="SC">Self-collect</option><option value="COD">COD</option>
              </Select>
            </Field>
            <Field label={isSC ? "Collect from (supplier)" : "Delivery address"} className="col-span-2">
              <Input value={d.delivery_address} onChange={(e) => setD({ ...d, delivery_address: e.target.value })}
                placeholder={isSC ? "auto-filled from supplier on save" : "type the delivery address"} disabled={isSC} />
            </Field>
            <Field label="Required date"><Input value={d.required_date} onChange={(e) => setD({ ...d, required_date: e.target.value })} /></Field>
            <Field label="Fabrication lead (days)"><Input type="number" value={d.tracking.fabrication_lead_days} onChange={(e) => setT("fabrication_lead_days", e.target.value)} /></Field>
            <Field label="Powder coat lead (days)"><Input type="number" value={d.tracking.powder_coating_lead_days} onChange={(e) => setT("powder_coating_lead_days", e.target.value)} /></Field>
            <Field label="Shipment ETD"><Input type="date" value={d.tracking.shipment_etd} onChange={(e) => setT("shipment_etd", e.target.value)} /></Field>
            <Field label="Shipment ETA"><Input type="date" value={d.tracking.shipment_eta} onChange={(e) => setT("shipment_eta", e.target.value)} /></Field>
            <Field label="Freight forwarder"><Input value={d.tracking.freight_forwarder} onChange={(e) => setT("freight_forwarder", e.target.value)} /></Field>
            <Field label="Freight cost"><Input type="number" step="0.01" value={d.tracking.freight_total_cost} onChange={(e) => setT("freight_total_cost", e.target.value)} /></Field>
          </div>
        </>
      )}

      {/* Delivery Status Tracker — FIC / Supervisor click a stage */}
      <DeliveryTracker po={po} canTrack={canTrack && po.status === "OPEN"} busy={busy}
        onSet={(stage) => act(() => api.setDeliveryStage(po.po_no, stage), stage ? "Delivery stage updated" : "Stage cleared")} />

      <div className="mt-5 flex justify-end gap-2.5">
        {canManage && po.status === "OPEN" && (
          <Btn variant="soft" disabled={busy} onClick={() => act(() => api.updatePO(po.po_no, d), "Saved")}>Save details</Btn>
        )}
        {canCancel && po.status === "OPEN" && (
          <Btn variant="danger" disabled={busy} onClick={() => act(() => api.cancelPO(po.po_no, ""), "PO cancelled")}>Cancel PO</Btn>
        )}
        {canReceive && po.status === "OPEN" && (
          <Btn variant="success" disabled={busy} onClick={() => act(() => api.receivePO(po.po_no, ""), "Goods received — PO closed")}>Receive goods (close)</Btn>
        )}
      </div>
    </Modal>
  );
}

// Delivery stage labels (DB key → display name)
export const STAGES = [
  { key: "WITH_VENDOR", label: "With Vendor", icon: "🏭", desc: "Order confirmed, vendor processing / fabricating" },
  { key: "SHIPPED", label: "In Transit", icon: "🚢", desc: "Goods dispatched / in transit to Singapore" },
  { key: "ARRIVED_HUB", label: "Arrived at Hub", icon: "📦", desc: "Arrived at port / forwarder / warehouse hub" },
  { key: "RECEIVED_FACTORY", label: "Received", icon: "✅", desc: "Goods delivered & received at factory / site" },
];
export const stageLabel = (key) => STAGES.find((s) => s.key === key)?.label || "—";

function DeliveryTracker({ po, canTrack, busy, onSet }) {
  const current = po.delivery_stage;
  const currentIdx = STAGES.findIndex((s) => s.key === current);
  return (
    <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[14px] font-extrabold text-[#1E1B4B]">🚚 Delivery Status Tracker</span>
        <span className="rounded-full bg-[#FEF3C7] px-3 py-1 text-[12px] font-bold text-[#D97706]">
          Current: {current ? stageLabel(current) : "Not started"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STAGES.map((s, i) => {
          const done = currentIdx > -1 && i < currentIdx;
          const isCurrent = s.key === current;
          const base = "rounded-xl border p-3 text-center transition-all";
          const cls = isCurrent
            ? "border-[#D97706] bg-[#D97706] text-white"
            : done
            ? "border-[#C7D2FE] bg-[#EEF2FF] text-[#6366F1]"
            : "border-[#E5E7EB] bg-white text-[#9CA3AF]";
          return (
            <button key={s.key} disabled={!canTrack || busy}
              onClick={() => onSet(isCurrent ? null : s.key)}
              title={canTrack ? "Click to set current stage (click again to clear)" : ""}
              className={`${base} ${cls} ${canTrack ? "cursor-pointer hover:shadow-md" : "cursor-default"}`}>
              <div className="text-[22px]">{s.icon}</div>
              <div className={`mt-1 text-[13px] font-bold ${isCurrent ? "text-white" : done ? "text-[#6366F1]" : "text-[#374151]"}`}>{s.label}</div>
              <div className={`mt-0.5 text-[10px] leading-tight ${isCurrent ? "text-white/90" : "text-[#9CA3AF]"}`}>{s.desc}</div>
              {isCurrent && <div className="mt-1.5 rounded bg-white/25 px-2 py-0.5 text-[10px] font-bold">● CURRENT</div>}
              {done && <div className="mt-1.5 text-[11px] font-bold text-[#6366F1]">✓ Done</div>}
            </button>
          );
        })}
      </div>
      {canTrack && <div className="mt-2 text-center text-[11px] text-[#9CA3AF]">Click a stage to set current delivery status · click again to deselect</div>}
    </div>
  );
}
