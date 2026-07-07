// pages/PurchaseOrders.jsx — Tailwind version
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, apiError } from "../lib/api";
import { Btn, Badge, Modal, Field, Input, Select, EmptyRow, money, fmtDate } from "../components/ui";
import { Table, Td } from "../components/Table";
import { exportPoPdf } from "../lib/poPdf";

export default function PurchaseOrders({ user, perms = {}, notify, refreshInbox }) {
  const [pos, setPOs] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [job, setJob] = useState("All");
  const [view, setView] = useState(null);
  const [receiveTarget, setReceiveTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  // Sort: default by PO date, latest first.
  const [sort, setSort] = useState({ key: "po_date", dir: "desc" });

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

  // ── Sorting ──────────────────────────────────────────────────────────────
  // Group rank so clicking "Status" keeps same-status rows together.
  const STATUS_RANK = { OPEN: 0, CLOSED: 1, CANCELLED: 2 };
  const sortedPos = useMemo(() => {
    const { key, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    const byDateDesc = (a, b) => new Date(b.po_date || 0) - new Date(a.po_date || 0);
    return [...pos].sort((a, b) => {
      if (key === "amount") return (Number(a.amount || 0) - Number(b.amount || 0)) * mul;
      if (key === "status") {
        const ra = STATUS_RANK[a.status] ?? 99, rb = STATUS_RANK[b.status] ?? 99;
        if (ra !== rb) return (ra - rb) * mul;
        return byDateDesc(a, b); // within a status group, latest first
      }
      // default: po_date
      return (new Date(a.po_date || 0) - new Date(b.po_date || 0)) * mul;
    });
  }, [pos, sort]);

  // Clicking a header selects that key; clicking again flips direction.
  const toggleSort = (key) =>
    setSort((s) => (s.key === key
      ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "status" ? "asc" : "desc" }));

  const SortHead = ({ label, keyName }) => {
    const active = sort.key === keyName;
    return (
      <button type="button" onClick={() => toggleSort(keyName)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide select-none hover:text-[#6366F1] ${active ? "text-[#6366F1]" : ""}`}
        title={`Sort by ${label.toLowerCase()}`}>
        {label}
        <span className="text-[9px]">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    );
  };

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
        { label: <SortHead label="Date" keyName="po_date" /> },
        ...(canSeeAmount ? [{ label: <SortHead label="Amount" keyName="amount" />, align: "right" }] : []),
        { label: <SortHead label="Status" keyName="status" /> }, { label: "Delivery stage" }, { label: "" },
      ]}>
        {pos.length === 0 && <EmptyRow colSpan={9}>No purchase orders match.</EmptyRow>}
        {sortedPos.map((p) => (
          <tr key={p.po_no}>
            <Td mono bold className="!text-[#6366F1]">{p.po_no}</Td>
            <Td mono>{p.pr_no || "—"}</Td>
            <Td>{p.project_name || "—"}</Td>
            <Td>{p.po_type === "STOCK" ? <span className="text-[#6366F1]">From stock <span className="text-[11px] text-[#9CA3AF]">@ {p.source_location}</span></span> : p.supplier_name}</Td>
            <Td>{fmtDate(p.po_date)}</Td>
            {canSeeAmount && <Td align="right">{money(p.amount)}</Td>}
            <Td>
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <Badge status={p.status} />
                {p.overdue && <span className="rounded bg-[#FEF2F2] px-2 py-0.5 text-[11px] font-bold text-[#DC2626]" title="STOCK PO open >30 days — awaiting the FIC. Consider cancelling to release the reserved stock.">⏰ Overdue</span>}
              </span>
            </Td>
            <Td>{p.delivery_stage ? <span className="rounded bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-bold text-[#D97706]">{stageLabel(p.delivery_stage)}</span> : <span className="text-[#9CA3AF]">—</span>}</Td>
            <Td align="right">
              <span className="inline-flex justify-end gap-1.5">
                <Btn variant="ghost" small title="Download PDF"
                  onClick={() => api.po(p.po_no).then((full) => exportPoPdf(full, { showPrice: canSeePrice })).catch((e) => notify(apiError(e), "error"))}>PDF</Btn>
                <Btn variant="ghost" small onClick={() => api.po(p.po_no).then(setView)}>Open</Btn>
              </span>
            </Td>
          </tr>
        ))}
      </Table>

      {view && (
        <POView po={view} canManage={canManage} canReceive={canReceive} canTrack={canTrack} canCancel={canCancel}
          canSeePrice={canSeePrice} canSeeAmount={canSeeAmount}
          busy={busy} setBusy={setBusy} notify={notify}
          onChanged={(fresh) => { setView(fresh); refresh(); }}
          onClose={() => setView(null)}
          onOpenReceive={() => setReceiveTarget(view)} />
      )}

      {receiveTarget && (
        <ReceiveModal
          po={receiveTarget}
          onClose={() => setReceiveTarget(null)}
          onConfirmed={async (receivedBy, files) => {
            setBusy(true);
            try {
              if (files.length) await api.uploadReceivePhotos(receiveTarget.po_no, files);
              await api.receivePO(receiveTarget.po_no, receivedBy);
              notify("Goods received — PO closed");
              const fresh = await api.po(receiveTarget.po_no);
              setView(fresh);
              refresh();
              setReceiveTarget(null);
            } catch (e) {
              notify(apiError(e), "error");
            } finally {
              setBusy(false);
            }
          }}
          busy={busy}
        />
      )}
    </div>
  );
}

function POView({ po, canManage, canReceive, canTrack, canCancel, canSeePrice, canSeeAmount, busy, setBusy, notify, onChanged, onClose, onOpenReceive }) {
  const [d, setD] = useState({
    delivery_method: po.delivery_method ?? "",
    delivery_address: po.delivery_address ?? "",
    required_date: po.required_date ?? "",
    tracking: {
      fabrication_lead_days: po.tracking?.fabrication_lead_days ?? "",
      powder_coating_lead_days: po.tracking?.powder_coating_lead_days ?? "",
      shipment_etd: po.tracking?.shipment_etd?.slice(0, 10) ?? "",
      shipment_eta: po.tracking?.shipment_eta?.slice(0, 10) ?? "",
      freight_forwarder: po.tracking?.freight_forwarder ?? "",
      freight_total_cost: po.tracking?.freight_total_cost ?? "",
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
    ["PO date", fmtDate(po.po_date)], ["Received", fmtDate(po.goods_received_date) || "—"]];

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

      {canManage && po.status === "OPEN" && po.po_type !== "STOCK" && (
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
        canReceive={canReceive} onReceive={onOpenReceive}
        onSet={(stage) => act(() => api.setDeliveryStage(po.po_no, stage), stage ? "Delivery stage updated" : "Stage cleared")} />

      <PhotoGallery photos={po.receive_photos || []} />

      <div className="mt-5 flex justify-end gap-2.5">
        <Btn variant="soft" disabled={busy} onClick={() => exportPoPdf(po, { showPrice: canSeePrice })}>⬇ PDF</Btn>
        {canManage && po.status === "OPEN" && (
          <Btn variant="soft" disabled={busy} onClick={() => act(() => api.updatePO(po.po_no, d), "Saved")}>Save details</Btn>
        )}
        {canCancel && po.status === "OPEN" && (
          <Btn variant="danger" disabled={busy} onClick={() => act(() => api.cancelPO(po.po_no, ""), "PO cancelled")}>Cancel PO</Btn>
        )}
        {canReceive && po.status === "OPEN" && (
          <Btn variant="success" disabled={busy} onClick={onOpenReceive}>✅ Receive goods (close)</Btn>
        )}
      </div>
    </Modal>
  );
}

// Delivery stage labels (DB key → display name)
export const BUY_STAGES = [
  { key: "WITH_VENDOR",      label: "With Vendor",    icon: "🏭", desc: "Order confirmed, vendor processing / fabricating" },
  { key: "SHIPPED",          label: "In Transit",     icon: "🚢", desc: "Goods dispatched / in transit to Singapore" },
  { key: "ARRIVED_HUB",     label: "Arrived at Hub", icon: "📦", desc: "Arrived at port / forwarder / warehouse hub" },
  { key: "RECEIVED_FACTORY", label: "Received",       icon: "✅", desc: "Goods delivered & received at factory / site" },
];

export const STOCK_STAGES = [
  { key: "PENDING_ISSUE",  label: "Pending Issue",     icon: "⏳", desc: "Waiting for factory in-charge to prepare and pick items" },
  { key: "READY_COLLECT",  label: "Ready to Collect",  icon: "📋", desc: "Items picked & ready for collection at factory / warehouse" },
  { key: "COLLECTED",      label: "Collected",          icon: "✅", desc: "Items collected from factory / site" },
];

export const STAGES = [...BUY_STAGES, ...STOCK_STAGES];
export const stageLabel = (key) => STAGES.find((s) => s.key === key)?.label || "—";

function DeliveryTracker({ po, canTrack, canReceive, onReceive, busy, onSet }) {
  const isStock    = po.po_type === "STOCK";
  const stages     = isStock ? STOCK_STAGES : BUY_STAGES;
  const current    = po.delivery_stage;
  const currentIdx = stages.findIndex((s) => s.key === current);
  const isOpen     = po.status === "OPEN";

  return (
    <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[14px] font-extrabold text-[#1E1B4B]">
          {isStock ? "🏭 Collection Status Tracker" : "🚚 Delivery Status Tracker"}
        </span>
        <span className="rounded-full bg-[#FEF3C7] px-3 py-1 text-[12px] font-bold text-[#D97706]">
          Current: {current ? stageLabel(current) : "Not started"}
        </span>
      </div>

      <div className={`grid gap-3 ${isStock ? "grid-cols-3" : "grid-cols-2 md:grid-cols-4"}`}>
        {stages.map((s, i) => {
          const isPast    = currentIdx > -1 && i < currentIdx;
          const isCurrent = s.key === current;
          const isFuture  = i > currentIdx;
          // The last stage (Received/Collected) is reached only via the
          // Receive-goods flow; clicking it opens that modal.
          const isFinal   = i === stages.length - 1;
          const clickable = isFinal
            ? canReceive && !busy && isOpen && !isCurrent
            : canTrack && !busy && isFuture;
          const handleClick = () => {
            if (!clickable) return;
            if (isFinal) onReceive();
            else onSet(s.key);
          };

          const base = "rounded-xl border p-3 text-center transition-all";
          const cls  = isCurrent
            ? "border-[#D97706] bg-[#D97706] text-white cursor-default"
            : isPast
            ? "border-[#D1D5DB] bg-[#F3F4F6] text-[#9CA3AF] cursor-not-allowed opacity-70"
            : clickable
            ? "border-[#E5E7EB] bg-white text-[#374151] cursor-pointer hover:border-[#6366F1] hover:shadow-md"
            : "border-[#E5E7EB] bg-white text-[#9CA3AF] cursor-default";

          return (
            <button
              key={s.key}
              disabled={!clickable}
              onClick={handleClick}
              title={
                isPast    ? "Already passed — cannot go back"
                : isCurrent ? "Current stage"
                : isFinal   ? (clickable ? "Click to confirm goods received (photos + name)" : "Reached via Receive goods")
                : canTrack  ? "Click to advance to this stage"
                : ""
              }
              className={`${base} ${cls}`}
            >
              <div className="text-[22px]">{isPast ? "✓" : s.icon}</div>
              <div className={`mt-1 text-[13px] font-bold ${isCurrent ? "text-white" : isPast ? "text-[#9CA3AF]" : "text-[#374151]"}`}>
                {s.label}
              </div>
              <div className={`mt-0.5 text-[10px] leading-tight ${isCurrent ? "text-white/90" : "text-[#9CA3AF]"}`}>
                {s.desc}
              </div>
              {isCurrent && <div className="mt-1.5 rounded bg-white/25 px-2 py-0.5 text-[10px] font-bold">● CURRENT</div>}
              {isPast    && <div className="mt-1.5 text-[11px] font-bold text-[#6B7280]">✓ Done</div>}
            </button>
          );
        })}
      </div>

      {(canTrack || canReceive) && isOpen && (
        <div className="mt-2 text-center text-[11px] text-[#9CA3AF]">
          Click a future stage to advance · the final stage opens “Receive goods” · completed stages are locked
        </div>
      )}
    </div>
  );
}

// ── Receive goods modal ─────────────────────────────────────────────────────
function ReceiveModal({ po, onClose, onConfirmed, busy }) {
  const [receivedBy, setReceivedBy] = useState("");
  const [files, setFiles]           = useState([]);
  const [previews, setPreviews]     = useState([]);
  const fileRef                     = useRef();

  const handleFiles = (incoming) => {
    const arr = Array.from(incoming);
    setFiles((prev) => {
      const merged = [...prev, ...arr];
      setPreviews(merged.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })));
      return merged;
    });
  };

  const removePhoto = (idx) => {
    URL.revokeObjectURL(previews[idx].url);
    setFiles((p)    => p.filter((_, i) => i !== idx));
    setPreviews((p) => p.filter((_, i) => i !== idx));
  };

  // FIC should upload receiving photos. If none were added, warn before closing the PO.
  const confirmReceive = () => {
    if (files.length === 0 &&
        !window.confirm("⚠️ You haven't uploaded any receiving photos.\n\nConfirm goods received without photos?")) {
      return;
    }
    onConfirmed(receivedBy, files);
  };

  const summary = po.items?.map((it) => `${it.description} ${it.qty} ${it.unit}`).join(" · ") || "";

  return (
    <Modal title="Confirm Goods Received" onClose={onClose} wide>
      <div className="space-y-4 p-1">
        {/* PO summary box */}
        <div className="rounded-xl border border-[#E5E7EB] bg-[#F8F9FF] p-4">
          <div className="text-[15px] font-extrabold text-[#1E1B4B]">{po.po_no}</div>
          {po.delivery_address && <div className="mt-0.5 text-[12px] uppercase text-[#6B7280]">{po.delivery_address}</div>}
          {summary && <div className="mt-1 text-[12px] text-[#374151]">{summary}</div>}
        </div>

        {/* Info notices */}
        <div className="rounded-xl border border-[#D1FAE5] bg-[#ECFDF5] px-4 py-3 text-[13px] text-[#065F46]">
          ✅ This will mark the PO as <strong>CLOSED</strong>, record goods received on <strong>{fmtDate(new Date())}</strong>, and update factory stock.
        </div>
        <div className="rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] px-4 py-3 text-[13px] text-[#1E40AF]">
          🔔 <strong>Site Supervisor will be notified</strong> — please ensure supervisor confirms receipt of goods.
        </div>

        {/* Received by */}
        <Field label="Received by (Factory In-charge name)">
          <Input
            value={receivedBy}
            onChange={(e) => setReceivedBy(e.target.value)}
            placeholder="Enter your name"
          />
        </Field>

        {/* Photo upload */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">
              📷 Receiving Photos {files.length > 0 && <span className="ml-1 rounded-full bg-[#6366F1] px-2 py-0.5 text-white">{files.length}</span>}
            </span>
            <button
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded-lg border border-[#6366F1] bg-[#EEF2FF] px-3 py-1.5 text-[12px] font-semibold text-[#6366F1] hover:bg-[#6366F1] hover:text-white transition"
            >
              + Add Photos
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />

          {/* Drop zone (when no photos yet) */}
          {previews.length === 0 && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#C7D2FE] bg-[#F8F9FF] py-8 text-[#9CA3AF] hover:border-[#6366F1] hover:bg-[#EEF2FF] transition"
            >
              <div className="text-3xl">📷</div>
              <div className="mt-2 text-[13px] font-semibold">Click or drag photos here</div>
              <div className="text-[11px]">Any number of images (max 15 MB each)</div>
            </div>
          )}

          {/* Thumbnails */}
          {previews.length > 0 && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {previews.map((p, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-[#E5E7EB] bg-[#F3F4F6]">
                  <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/60 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                  >✕</button>
                </div>
              ))}
              {/* Add more tile */}
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[#C7D2FE] bg-[#F8F9FF] text-[#9CA3AF] hover:border-[#6366F1] hover:bg-[#EEF2FF] transition"
              >
                <span className="text-2xl">+</span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn
            variant="success"
            disabled={busy}
            onClick={confirmReceive}
          >
            {busy ? "Saving…" : "✅ Confirm Goods Received"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Receiving photos gallery (shown inside closed PO detail) ──────────────
function PhotoGallery({ photos }) {
  const [blobUrls, setBlobUrls]     = useState({});
  const [lightbox, setLightbox]     = useState(null);

  useEffect(() => {
    if (!photos.length) return;
    let alive = true;
    photos.forEach((p) => {
      api.receivePhotoBlob(p.id).then((url) => {
        if (alive) setBlobUrls((prev) => ({ ...prev, [p.id]: url }));
      }).catch(() => {});
    });
    return () => { alive = false; };
  }, [photos]);

  if (!photos.length) return null;

  return (
    <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
      <div className="mb-3 text-[13px] font-extrabold text-[#1E1B4B]">📷 Receiving Photos ({photos.length})</div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {photos.map((p) => (
          <div
            key={p.id}
            onClick={() => blobUrls[p.id] && setLightbox(p.id)}
            className="aspect-square cursor-pointer overflow-hidden rounded-lg border border-[#E5E7EB] bg-[#F3F4F6] hover:opacity-90 transition"
            title={p.original_name}
          >
            {blobUrls[p.id]
              ? <img src={blobUrls[p.id]} alt={p.original_name} className="h-full w-full object-cover" />
              : <div className="flex h-full w-full items-center justify-center text-[#9CA3AF] text-xl">⏳</div>
            }
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && blobUrls[lightbox] && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <img
              src={blobUrls[lightbox]}
              alt=""
              className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setLightbox(null)}
              className="absolute -right-3 -top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white text-[#374151] shadow-lg hover:bg-[#F3F4F6]"
            >✕</button>
            {/* Prev / Next */}
            {photos.length > 1 && (() => {
              const idx  = photos.findIndex((p) => p.id === lightbox);
              const prev = photos[idx - 1];
              const next = photos[idx + 1];
              return (
                <>
                  {prev && <button onClick={(e) => { e.stopPropagation(); setLightbox(prev.id); }}
                    className="absolute left-[-44px] top-1/2 -translate-y-1/2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white shadow-lg hover:bg-[#F3F4F6] text-[#374151]">‹</button>}
                  {next && <button onClick={(e) => { e.stopPropagation(); setLightbox(next.id); }}
                    className="absolute right-[-44px] top-1/2 -translate-y-1/2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white shadow-lg hover:bg-[#F3F4F6] text-[#374151]">›</button>}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
