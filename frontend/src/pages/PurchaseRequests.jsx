// pages/PurchaseRequests.jsx — Tailwind version
import { useEffect, useMemo, useRef, useState } from "react";
import { api, apiError, downloadAttachment } from "../lib/api";
import { Btn, Badge, Modal, Field, Input, Select, EmptyRow, money } from "../components/ui";
import { Table, Td } from "../components/Table";

const emptyItem = () => ({
  profile_code: "", description: "", colour: "", qty: "", unit: "pcs",
  remarks: "", stock_qty: "", inventory_id: "", stock_location: "", buy_qty: "",
});

export default function PurchaseRequests({ user, perms = {}, notify, refreshInbox }) {
  const [prs, setPRs] = useState([]);
  const [filter, setFilter] = useState("All");
  const [showCreate, setShowCreate] = useState(false);
  const [editPR, setEditPR] = useState(null);
  const [viewPR, setViewPR] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [nextNo, setNextNo] = useState("PR001");
  const [suppliers, setSuppliers] = useState([]);
  const [busy, setBusy] = useState(false);

  const role = user.role, isAdmin = role === "Admin";
  const canCreate = !!perms.raise_pr || isAdmin;
  const canApprove = !!perms.approve_pr || !!perms.reject_pr || isAdmin;
  const canPurchase = !!perms.assign_supplier || !!perms.generate_po || !!perms.send_to_fic || isAdmin;
  const canFIC = !!perms.issue_stock || isAdmin;

  const load = () => api.prs(filter).then(setPRs).catch((e) => notify(apiError(e), "error"));
  useEffect(() => { load(); }, [filter]);
  useEffect(() => { api.suppliers().then(setSuppliers).catch(() => {}); }, []);

  const counts = useMemo(() => { const c = {}; prs.forEach((p) => (c[p.status] = (c[p.status] || 0) + 1)); return c; }, [prs]);
  const refresh = () => { load(); refreshInbox?.(); };

  const openCreate = async () => {
    setEditPR(null);
    try { setNextNo((await api.prNext()).prNo); } catch {}
    setShowCreate(true);
  };

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {["All", "PENDING", "APPROVED", "SEND_BACK", "PO_RAISED", "REJECTED"].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`rounded-full border px-3.5 py-[5px] text-[12.5px] font-semibold capitalize transition-colors
                ${filter === s ? "border-[#1E1B4B] bg-[#1E1B4B] text-white" : "border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#6366F1]"}`}>
              {s === "All" ? "All" : s.replace("_", " ").toLowerCase()}{s !== "All" && counts[s] ? ` · ${counts[s]}` : ""}
            </button>
          ))}
        </div>
        {canCreate && <Btn onClick={openCreate}>+ New purchase request</Btn>}
      </div>

      <Table columns={[
        { label: "PR No" }, { label: "Job" }, { label: "Project" }, { label: "Requested by" },
        { label: "Required" }, { label: "Items", align: "center" }, { label: "Status" }, { label: "" },
      ]}>
        {prs.length === 0 && <EmptyRow colSpan={8}>No purchase requests yet.</EmptyRow>}
        {prs.map((p) => (
          <tr key={p.pr_no}>
            <Td mono bold className="!text-[#6366F1]">{p.pr_no}</Td>
            <Td mono>{p.job_no}</Td>
            <Td>{p.project_name || "—"}</Td>
            <Td>{p.requested_by}</Td>
            <Td>{p.date_required || "—"}</Td>
            <Td align="center">{p.item_count}</Td>
            <Td><Badge status={p.status} /></Td>
            <Td align="right"><Btn variant="ghost" small onClick={() => api.pr(p.pr_no).then(setViewPR)}>Open</Btn></Td>
          </tr>
        ))}
      </Table>

      {showCreate && (
        <PRForm user={user} suppliers={suppliers} nextNo={nextNo} editPR={editPR} notify={notify}
          onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); refresh(); }} />
      )}
      {viewPR && (
        <PRView pr={viewPR} user={user} suppliers={suppliers} perms={perms}
          canApprove={canApprove} canPurchase={canPurchase} canFIC={canFIC} canCreate={canCreate}
          busy={busy} setBusy={setBusy} notify={notify}
          onReject={() => setRejecting(viewPR)}
          onEdit={() => { setEditPR(viewPR); setViewPR(null); setShowCreate(true); }}
          onChanged={(fresh) => { setViewPR(fresh); refresh(); }} onClose={() => setViewPR(null)} />
      )}
      {rejecting && (
        <RejectModal pr={rejecting} busy={busy} onClose={() => setRejecting(null)}
          onDone={async (type, reason) => {
            setBusy(true);
            try { await api.rejectPR(rejecting.pr_no, type, reason); notify(type === "send_back" ? "Sent back to drafter" : "PR rejected"); setRejecting(null); setViewPR(null); refresh(); }
            catch (e) { notify(apiError(e), "error"); } finally { setBusy(false); }
          }} />
      )}
    </div>
  );
}

function PRForm({ user, suppliers, nextNo, editPR, notify, onClose, onSaved }) {
  const blankItem = () => ({
    profile_code: "", description: "", colour: "", qty: "", unit: "pcs",
    remarks: "", supplier_id: "", supplier_name: "", supplier_type: "Local",
    stock_qty: "", inventory_id: "", stock_location: "", buy_qty: "", available_stock_qty: "",
  });
  const [form, setForm] = useState(() => editPR ? {
    job_no: editPR.job_no, project_name: editPR.project_name || "", location: editPR.location || "",
    date_required: editPR.date_required || "", date_issued: editPR.date_issued?.slice(0, 10) || "",
    pic: editPR.pic || "", requested_by: editPR.requested_by, checked_by: editPR.checked_by || "",
    approved_by: editPR.approved_by || "", remarks: editPR.remarks || "",
    items: editPR.items.map((it) => ({
      profile_code: it.profile_code || "", description: it.description, colour: it.colour || "",
      qty: it.qty, unit: it.unit, remarks: it.remarks || "",
      supplier_id: it.supplier_id || "", supplier_name: it.supplier_name || "", supplier_type: it.supplier_type || "Local",
      stock_qty: it.stock_qty || "", inventory_id: it.inventory_id || "", stock_location: it.stock_location || "", buy_qty: it.buy_qty || "",
    })),
  } : {
    job_no: "", project_name: "", location: "", date_required: "", date_issued: "",
    pic: "", requested_by: user.name, checked_by: "", approved_by: "", remarks: "", items: [blankItem()],
  });
  const [busy, setBusy] = useState(false);
  const [heldFiles, setHeldFiles] = useState([]);      // files picked on the create form, uploaded after save
  const fileInputRef = useRef(null);
  const [stockOpen, setStockOpen] = useState(null);   // which item's stock table is expanded
  const [stockList, setStockList] = useState([]);      // factory stock rows
  const [stockLoaded, setStockLoaded] = useState(false);

  const setItem = (i, key, val) => setForm((f) => ({
    ...f,
    items: f.items.map((it, x) => {
      if (x !== i) return it;
      const updated = { ...it, [key]: val };
      if (key === "qty") {
        const total = Number(val) || 0;
        const avail = Number(it.available_stock_qty) || 0;
        const maxStock = avail > 0 ? Math.min(total, avail) : 0;
        const stock = Math.min(Number(it.stock_qty) || 0, maxStock);
        updated.stock_qty = it.inventory_id ? String(stock) : it.stock_qty;
        updated.buy_qty = String(Math.max(0, total - (Number(updated.stock_qty) || 0)));
      }
      if (key === "stock_qty") {
        const total = Number(it.qty) || 0;
        const avail = Number(it.available_stock_qty) || 0;
        const max = avail > 0 ? Math.min(total, avail) : total;
        const capped = Math.min(Math.max(0, Number(val) || 0), max);
        updated.stock_qty = String(capped);
        updated.buy_qty = String(Math.max(0, total - capped));
      }
      return updated;
    }),
  }));
  const removeItem = (i) => setForm((f) => ({ ...f, items: f.items.filter((_, x) => x !== i) }));
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, blankItem()] }));

  const lookupJob = async () => {
    if (!form.job_no.trim()) return;
    try { const p = await api.poProject(form.job_no.trim()); setForm((f) => ({ ...f, project_name: p.project_name, location: p.location || f.location })); }
    catch { notify(`Job ${form.job_no} not found — type the project name, it will be saved.`, "warning"); }
  };

  const openStock = async (i) => {
    if (stockOpen === i) { setStockOpen(null); return; }
    setStockOpen(i);
    if (!stockLoaded) {
      try { setStockList(await api.inventory()); setStockLoaded(true); } catch { notify("Could not load factory stock", "error"); }
    }
  };

  // "Use from Stock": link the inventory row, pre-fill From-Stock qty, set code/description
  const useFromStock = (i, s) => {
    setForm((f) => ({ ...f, items: f.items.map((it, x) => {
      if (x !== i) return it;
      const total = Number(it.qty) || 0;
      const avail = Number(s.quantity_in_stock) || 0;
      const stock = Math.min(total, avail);
      const buy = Math.max(0, total - stock);
      return {
        ...it,
        inventory_id: s.id,
        stock_location: s.location_code,
        profile_code: s.item_code || it.profile_code,
        description: it.description || [s.profile_name, s.size].filter(Boolean).join(" "),
        available_stock_qty: String(avail),
        stock_qty: String(stock),
        buy_qty: String(buy),
      };
    }) }));
    setStockOpen(null);
  };

  const submit = async () => {
    if (!form.job_no.trim() || !form.requested_by.trim()) return notify("Job No and Requested By are required", "error");
    if (!form.items.some((it) => it.description.trim())) return notify("Add at least one item", "error");
    setBusy(true);
    try {
      try { await api.poProject(form.job_no.trim()); }
      catch { await api.addPoProject({ job_no: form.job_no.trim(), project_name: form.project_name || form.job_no, location: form.location }); }
      const payload = { ...form, items: form.items.filter((it) => it.description.trim()).map((it) => ({
        ...it, qty: Number(it.qty) || 0, stock_qty: Number(it.stock_qty) || 0, buy_qty: Number(it.buy_qty) || 0, inventory_id: it.inventory_id || null,
      })) };
      if (editPR) { await api.updatePR(editPR.pr_no, { ...payload, resubmit: editPR.status === "SEND_BACK" }); notify(`${editPR.pr_no} updated${editPR.status === "SEND_BACK" ? " and resubmitted" : ""}`); }
      else {
        const pr = await api.createPR(payload);
        // upload any files held on the form, now that the PR exists
        if (heldFiles.length) {
          try { await api.uploadAttachments(pr.pr_no, heldFiles); notify(`${pr.pr_no} created with ${heldFiles.length} file(s)`); }
          catch { notify(`${pr.pr_no} created, but files failed to upload — you can add them by opening the PR`, "warning"); }
        } else {
          notify(`${pr.pr_no} created — pending approval`);
        }
      }
      onSaved();
    } catch (e) { notify(apiError(e), "error"); } finally { setBusy(false); }
  };

  const lbl = "block text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF] mb-1";
  const inp = "w-full box-border border border-[#E5E7EB] rounded-lg px-2.5 py-2 text-[12px] outline-none bg-white focus:border-[#6366F1]";

  return (
    <Modal wide title={editPR ? `Edit ${editPR.pr_no}` : `New purchase request · ${nextNo}`} onClose={onClose}>
      {editPR?.rejection_reason && (
        <div className="mb-3.5 rounded-lg bg-[#FFF7E6] px-3.5 py-2.5 text-[13px] text-[#92400E]">Sent back: {editPR.rejection_reason}</div>
      )}

      {/* Header fields */}
      <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
        <Field label="Job No *"><Input value={form.job_no} onChange={(e) => setForm({ ...form, job_no: e.target.value })} onBlur={lookupJob} placeholder="JN426" /></Field>
        <Field label="Project name"><Input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} placeholder="12 Harlyn Road" /></Field>
        <Field label="Location / scope"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
        <Field label="Date required"><Input value={form.date_required} onChange={(e) => setForm({ ...form, date_required: e.target.value })} placeholder="ASAP, 01-Apr-26" /></Field>
        <Field label="Date issued"><Input type="date" value={form.date_issued} onChange={(e) => setForm({ ...form, date_issued: e.target.value })} /></Field>
        <Field label="PIC (person in charge)"><Input value={form.pic} onChange={(e) => setForm({ ...form, pic: e.target.value })} /></Field>
        <Field label="Requested by *"><Input value={form.requested_by} onChange={(e) => setForm({ ...form, requested_by: e.target.value })} /></Field>
        <Field label="Checked by"><Input value={form.checked_by} onChange={(e) => setForm({ ...form, checked_by: e.target.value })} /></Field>
      </div>

      <div className="my-2 text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">Items — split each line into stock + buy</div>

      {/* Per-item cards */}
      <div className="grid gap-4">
        {form.items.map((it, i) => {
          const totalQty = Number(it.qty) || 0;
          const stockQty = Number(it.stock_qty) || 0;
          const autoBuy = Math.max(0, totalQty - stockQty);
          return (
            <div key={i} className="overflow-hidden rounded-xl border border-[#E5E7EB]">
              {/* purple header */}
              <div className="flex items-center justify-between bg-[#6366F1] px-3 py-1 text-[10px] font-bold text-white">
                <span>Item {i + 1}</span>
                {form.items.length > 1 && (
                  <button onClick={() => removeItem(i)} className="rounded bg-white/20 px-2 py-px text-[11px] text-white">✕ Remove</button>
                )}
              </div>

              {/* Row 1: S/N + Description + Colour */}
              <div className="grid grid-cols-[44px_1fr_130px] gap-2.5 px-3 pb-1.5 pt-2.5">
                <div className="flex flex-col items-center justify-center">
                  <label className={lbl}>S/N</label>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] text-[15px] font-extrabold text-[#6366F1]">{i + 1}</div>
                </div>
                <div><label className={lbl}>Description *</label><input className={inp} value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} placeholder="e.g. L-Angle 25x75x2.8mm" /></div>
                <div><label className={lbl}>Colour</label><input className={inp} value={it.colour} onChange={(e) => setItem(i, "colour", e.target.value)} placeholder="e.g. SS, RAL 7016" /></div>
              </div>

              {/* Row 2: Total + Unit + Supplier + Type */}
              <div className="grid grid-cols-[90px_90px_1fr_110px] gap-2.5 px-3 pb-2 pt-1">
                <div><label className={lbl}>Total Qty</label><input type="number" min="0" className={inp} value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} placeholder="0" /></div>
                <div><label className={lbl}>Unit</label>
                  <select className={inp} value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)}>{["pcs", "m", "set", "lot", "kg"].map((u) => <option key={u}>{u}</option>)}</select>
                </div>
                <div><label className={lbl}>Supplier <span className="text-[#D97706]">(suggested)</span></label>
                  <select className={inp} value={it.supplier_id} onChange={(e) => { const s = suppliers.find((s) => String(s.id) === e.target.value); setItem(i, "supplier_id", e.target.value); setItem(i, "supplier_name", s?.name || ""); if (s) setItem(i, "supplier_type", s.type); }}>
                    <option value="">— Select supplier (optional) —</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div><label className={lbl}>Type</label>
                  <select className={inp} value={it.supplier_type} onChange={(e) => setItem(i, "supplier_type", e.target.value)}>{["Local", "China", "Europe", "Other"].map((t) => <option key={t}>{t}</option>)}</select>
                </div>
              </div>

              {/* Row 3: the split — From stock + Buy qty */}
              <div className="grid grid-cols-[1fr_140px_140px] items-end gap-2.5 px-3 pb-2">
                <div><label className={lbl}>Remarks</label><input className={inp} value={it.remarks} onChange={(e) => setItem(i, "remarks", e.target.value)} placeholder="e.g. URGENT, Preference (P&M)" /></div>
                <div>
                  <label className={lbl}>From stock {it.stock_location && <span className="text-[#059669]">@ {it.stock_location}</span>}{it.available_stock_qty !== "" && <span className="text-[#9CA3AF]"> (avail: {it.available_stock_qty})</span>}</label>
                  <input type="number" min="0"
                    max={it.available_stock_qty !== "" ? Math.min(totalQty, Number(it.available_stock_qty)) : totalQty}
                    className={inp} value={it.stock_qty}
                    disabled={!it.inventory_id}
                    title={it.inventory_id ? `Max: ${Math.min(totalQty, Number(it.available_stock_qty) || totalQty)}` : "Use 'Use from Stock' below to link an item"}
                    onChange={(e) => setItem(i, "stock_qty", e.target.value)}
                    placeholder={it.inventory_id ? "" : "use stock ↓"} />
                </div>
                <div>
                  <label className={lbl}>Buy qty <span className="text-[#9CA3AF]">(auto)</span></label>
                  <input type="number" className={`${inp} bg-[#F9FAFB] cursor-not-allowed`} value={autoBuy} readOnly title="Auto-calculated: Total Qty − Stock Qty" />
                </div>
              </div>

              {/* Stock toggle */}
              <div className="px-3 pb-3">
                <button onClick={() => openStock(i)} className="rounded-lg bg-[#6366F1] px-3 py-1.5 text-[12px] font-semibold text-white">
                  {stockOpen === i ? "▲ Hide Stock Details" : "▼ Show Stock Details"}
                </button>

                {stockOpen === i && (
                  <div className="mt-2 overflow-hidden rounded-lg border border-[#E5E7EB]">
                    <div className="flex items-center justify-between bg-[#6366F1] px-3 py-1.5 text-[12px] font-bold text-white">
                      <span>📦 Factory Stock</span>
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px]">{stockList.length} records</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full border-collapse text-[12px]">
                        <thead className="sticky top-0 bg-[#F9FAFB]">
                          <tr>{["Location", "Profile code", "Size", "Stock qty", "Status", "Action"].map((h) => <th key={h} className="border-b border-[#E5E7EB] px-2.5 py-1.5 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {stockList.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-[#9CA3AF]">No stock loaded.</td></tr>}
                          {stockList.map((s) => {
                            const enough = Number(s.quantity_in_stock) > 0;
                            return (
                              <tr key={s.id}>
                                <td className="border-b border-[#F3F4F6] px-2.5 py-1.5">{s.location_code || "—"}</td>
                                <td className="border-b border-[#F3F4F6] px-2.5 py-1.5">
                                  <span className="font-mono text-[#6366F1]">{s.item_code}</span>
                                  {s.profile_name && <div className="text-[10px] text-[#9CA3AF] mt-0.5">{s.profile_name}</div>}
                                </td>
                                <td className="border-b border-[#F3F4F6] px-2.5 py-1.5">{s.size || s.item_name || "—"}</td>
                                <td className="border-b border-[#F3F4F6] px-2.5 py-1.5 font-bold text-[#059669]">{s.quantity_in_stock}</td>
                                <td className="border-b border-[#F3F4F6] px-2.5 py-1.5">
                                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${enough ? "bg-[#ECFDF5] text-[#059669]" : "bg-[#FEF2F2] text-[#DC2626]"}`}>{enough ? "IN STOCK" : "OUT"}</span>
                                </td>
                                <td className="border-b border-[#F3F4F6] px-2.5 py-1.5">
                                  {enough
                                    ? <button onClick={() => useFromStock(i, s)} className="whitespace-nowrap rounded-md bg-[#059669] px-3 py-1 text-[11px] font-bold text-white">✅ Use from Stock</button>
                                    : <span className="text-[10px] text-[#9CA3AF]">Insufficient</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Btn variant="soft" small className="mt-3" onClick={addItem}>+ Add item</Btn>

      <div className="mt-3.5"><Field label="Remarks (overall)"><Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field></div>

      {/* Whole-PR attachments — files are held now, uploaded right after the PR saves */}
      <div className="mt-3.5">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF]">Attachments (whole PR)</div>
        <div className="rounded-lg border border-dashed border-[#C7D2FE] bg-[#F5F3FF] px-3 py-2.5">
          <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#EEF2FF] px-3 py-1.5 text-[12px] font-semibold text-[#6366F1]">
            📎 Attach File
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files || []);
              if (picked.length) setHeldFiles((prev) => [...prev, ...picked]);
              e.target.value = "";
            }} />
          {editPR && <span className="ml-2 text-[11px] text-[#9CA3AF]">New files here upload on save; existing files are managed in the PR view.</span>}
          {heldFiles.length > 0 && (
            <div className="mt-2 grid gap-1">
              {heldFiles.map((f, x) => (
                <div key={x} className="flex items-center justify-between rounded bg-white px-2 py-1 text-[12px]">
                  <span className="truncate">📄 {f.name} <span className="text-[#9CA3AF]">({f.size < 1048576 ? (f.size/1024).toFixed(0)+" KB" : (f.size/1048576).toFixed(1)+" MB"})</span></span>
                  <button type="button" onClick={() => setHeldFiles((prev) => prev.filter((_, j) => j !== x))} className="ml-2 text-[#EF4444]">✕</button>
                </div>
              ))}
              <span className="text-[11px] text-[#9CA3AF]">{heldFiles.length} file(s) will upload when you submit.</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2.5">
        <Btn variant="soft" onClick={onClose}>Cancel</Btn>
        <Btn onClick={submit} disabled={busy}>{editPR ? "Save" : "Submit request"}</Btn>
      </div>
    </Modal>
  );
}

function PRView({ pr, user, suppliers, perms = {}, canApprove, canPurchase, canFIC, canCreate, busy, setBusy, notify, onReject, onEdit, onChanged, onClose }) {
  const isAdmin = user.role === "Admin";
  const canSeePrice = !!perms.see_pr_price || isAdmin;
  const pApprove = !!perms.approve_pr || isAdmin;
  const pReject = !!perms.reject_pr || isAdmin;
  const pAssign = !!perms.assign_supplier || isAdmin;
  const pGenerate = !!perms.generate_po || isAdmin;
  const pSendFic = !!perms.send_to_fic || isAdmin;
  const pIssue = !!perms.issue_stock || isAdmin;
  const [items, setItems] = useState(pr.items.map((it) => ({ ...it })));
  useEffect(() => { setItems(pr.items.map((it) => ({ ...it }))); }, [pr]);
  const assignMode = (pAssign || pGenerate || pSendFic) && pr.status === "APPROVED";
  const ficMode = pIssue && ["APPROVED", "PO_RAISED"].includes(pr.status);

  const setIt = (i, key, val) => setItems((arr) => arr.map((it, x) => {
    if (x !== i) return it;
    const u = { ...it, [key]: val };
    if (key === "supplier_id") { const s = suppliers.find((s) => String(s.id) === String(val)); u.supplier_name = s?.name || ""; }
    return u;
  }));

  const act = async (fn, msg) => {
    setBusy(true);
    try { await fn(); if (msg) notify(msg); onChanged(await api.pr(pr.pr_no)); }
    catch (e) { notify(apiError(e), "error"); } finally { setBusy(false); }
  };
  const total = items.reduce((s, it) => s + (Number(it.buy_qty) || 0) * (Number(it.unit_price) || 0), 0);
  const stockTotal = items.reduce((s, it) => s + (Number(it.stock_qty) || 0) * (Number(it.stock_unit_price) || 0), 0);
  const th = "border-b border-[#E5E7EB] px-2.5 py-2 text-left text-[10px] font-bold uppercase text-[#9CA3AF]";
  const td = "border-b border-[#F3F4F6] px-2.5 py-2";

  const meta = [["Status", <Badge status={pr.status} />], ["Job", pr.job_no], ["Project", pr.project_name || "—"],
    ["Requested by", pr.requested_by], ["Required", pr.date_required || "—"], ["Date issued", pr.date_issued?.slice(0, 10) || "—"], ["Approved by", pr.approved_by || "—"]];

  return (
    <Modal wide title={`Purchase request ${pr.pr_no}`} onClose={onClose}>
      <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-[18px] gap-y-3">
        {meta.map(([k, v], i) => (
          <div key={i}><div className="mb-0.5 text-[10px] uppercase tracking-wide text-[#9CA3AF]">{k}</div><div className="text-[13.5px] font-semibold text-[#374151]">{v}</div></div>
        ))}
      </div>

      {pr.rejection_reason && (
        <div className={`mb-3.5 rounded-lg px-3.5 py-2.5 text-[13px] ${pr.status === "SEND_BACK" ? "bg-[#FFF7E6] text-[#92400E]" : "bg-[#FEF2F2] text-[#DC2626]"}`}>
          {pr.status === "SEND_BACK" ? "Sent back" : "Rejected"}: {pr.rejection_reason}
        </div>
      )}
      {assignMode && (
        <div className="mb-3.5 rounded-lg bg-[#EEF2FF] px-3.5 py-2.5 text-[13px] text-[#6366F1]">
          Assign a supplier and price to each <b>buy</b> item, then generate POs. The stock portion is handled by the Factory In-charge.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr>{["Code", "Description", "Total", "Stock", "Stock status", "Buy", "Supplier", ...(canSeePrice ? ["Unit price", "Amount"] : [])].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map((it, i) => {
              const hasStock = Number(it.stock_qty) > 0;
              const hasBuy = Number(it.buy_qty) > 0;
              const rows = [];
              // STOCK ROW — becomes the Stock PO (priced from inventory)
              if (hasStock) {
                rows.push(
                  <tr key={`${it.id}-s`} className="bg-[#F5F3FF]">
                    <td className={`${td} font-mono`}>{it.profile_code || "—"}</td>
                    <td className={td}>{it.description} <span className="text-[10px] text-[#6366F1]">· stock</span></td>
                    <td className={td}>{it.stock_qty}</td>
                    <td className={td}>{it.stock_qty} <span className="text-[11px] text-[#9CA3AF]">@ {it.stock_location}</span></td>
                    <td className={td}>
                      <span className="inline-flex items-center gap-1.5">
                        <Badge status={it.stock_status} />
                        {ficMode && it.stock_status === "PENDING_FIC" && (
                          <Btn variant="warning" small disabled={busy} onClick={() => act(() => api.reduceStock(it.id), `Stock reduced for ${it.profile_code}`)}>Reduce stock</Btn>
                        )}
                      </span>
                    </td>
                    <td className={td}>—</td>
                    <td className={td}><span className="text-[12px] text-[#6B7280]">From stock</span></td>
                    {canSeePrice && <td className={td}>{money(it.stock_unit_price)}</td>}
                    {canSeePrice && <td className={td}>{money((Number(it.stock_qty) || 0) * (Number(it.stock_unit_price) || 0))}</td>}
                  </tr>
                );
              }
              // BUY ROW — becomes the Buy PO (priced by Purchaser, real supplier)
              if (hasBuy) {
                rows.push(
                  <tr key={`${it.id}-b`}>
                    <td className={`${td} font-mono`}>{hasStock ? "—" : (it.profile_code || "—")}</td>
                    <td className={td}>{it.description} <span className="text-[10px] text-[#9CA3AF]">· buy</span></td>
                    <td className={td}>{it.buy_qty}</td>
                    <td className={td}>—</td>
                    <td className={td}>—</td>
                    <td className={td}>{it.buy_qty}</td>
                    <td className={`${td} min-w-[160px]`}>
                      {assignMode ? (
                        <Select value={it.supplier_id || ""} onChange={(e) => setIt(i, "supplier_id", e.target.value)}>
                          <option value="">— choose —</option>
                          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </Select>
                      ) : (it.supplier_name || "—")}
                    </td>
                    {canSeePrice && (
                      <td className={`${td} w-[110px]`}>
                        {assignMode ? <Input type="number" min="0" step="0.01" value={it.unit_price || ""} onChange={(e) => setIt(i, "unit_price", e.target.value)} /> : money(it.unit_price)}
                      </td>
                    )}
                    {canSeePrice && <td className={td}>{money((Number(it.buy_qty) || 0) * (Number(it.unit_price) || 0))}</td>}
                  </tr>
                );
              }
              // neither (shouldn't happen) — show a plain row
              if (!hasStock && !hasBuy) {
                rows.push(
                  <tr key={`${it.id}-n`}>
                    <td className={`${td} font-mono`}>{it.profile_code || "—"}</td>
                    <td className={td}>{it.description}</td>
                    <td className={td}>{it.qty}</td>
                    <td className={td} colSpan={canSeePrice ? 6 : 4}>—</td>
                  </tr>
                );
              }
              return rows;
            })}
          </tbody>
          {canSeePrice && (
            <tfoot>
              <tr><td colSpan={8} className="px-2.5 py-2.5 text-right font-bold text-[#6B7280]">Buy total</td><td className="px-2.5 py-2.5 font-extrabold text-[#1E1B4B]">{money(total)}</td></tr>
              <tr><td colSpan={8} className="px-2.5 py-1 text-right text-[12px] text-[#6B7280]">Stock value</td><td className="px-2.5 py-1 text-[12px] font-semibold text-[#6366F1]">{money(stockTotal)}</td></tr>
            </tfoot>
          )}
        </table>
      </div>

      {pr.remarks && <div className="mt-3 text-[13px] text-[#6B7280]">Remarks: {pr.remarks}</div>}

      {/* Whole-PR attachments — view, add, remove */}
      <div className="mt-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">Attachments</div>
        <PRAttachments pr={pr} notify={notify} onChanged={() => onChanged(pr)} />
      </div>

      <div className="mt-5 flex justify-end gap-2.5">
        {(pApprove || pReject) && pr.status === "PENDING" && (
          <>
            {pReject && <Btn variant="danger" onClick={onReject} disabled={busy}>Reject / send back</Btn>}
            {pApprove && <Btn variant="success" disabled={busy} onClick={() => act(() => api.approvePR(pr.pr_no, user.name), `${pr.pr_no} approved`)}>Approve</Btn>}
          </>
        )}
        {canCreate && pr.status === "SEND_BACK" && <Btn onClick={onEdit} disabled={busy}>Edit &amp; resubmit</Btn>}
        {assignMode && (() => {
          const hasStock = items.some((it) => Number(it.stock_qty) > 0);
          const hasBuy = items.some((it) => Number(it.buy_qty) > 0);
          const anyAwaiting = items.some((it) => Number(it.stock_qty) > 0 && it.stock_status === "AWAITING_PURCHASER");
          const allBuyHaveSupplier = items.filter((it) => Number(it.buy_qty) > 0).every((it) => it.supplier_id);
          const saveAssign = async () => api.assignItems(pr.pr_no, items.filter((it) => Number(it.buy_qty) > 0).map((it) => ({ id: it.id, supplier_id: it.supplier_id || null, supplier_name: it.supplier_name, unit_price: Number(it.unit_price) || 0 })));
          return (
            <>
              <Btn variant="soft" disabled={busy} onClick={() => act(saveAssign, "Saved")}>Save prices</Btn>
              {pSendFic && hasStock && anyAwaiting && (
                <Btn variant="warning" disabled={busy} onClick={() => act(async () => { await saveAssign(); await api.sendToFic(pr.pr_no); }, "Stock info sent to Factory In-charge — Stock PO created")}>Send stock to FIC</Btn>
              )}
              {pGenerate && hasBuy && (
                <Btn disabled={busy || !allBuyHaveSupplier}
                  title={!allBuyHaveSupplier ? "Assign a supplier to every buy item first" : ""}
                  onClick={() => act(async () => {
                    await saveAssign();
                    const r = await api.generatePOs(pr.pr_no);
                    notify(`${r.created_pos.length} Buy PO(s) created: ${r.created_pos.join(", ")}`, "success");
                  })}>Generate Buy PO</Btn>
              )}
            </>
          );
        })()}
      </div>
    </Modal>
  );
}

function RejectModal({ pr, busy, onClose, onDone }) {
  const [reason, setReason] = useState("");
  return (
    <Modal title={`Reject ${pr.pr_no}`} onClose={onClose}>
      <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs to change?" /></Field>
      <div className="mt-2.5 text-[12.5px] text-[#6B7280]">Send back lets the drafter edit and resubmit. Reject closes it permanently.</div>
      <div className="mt-4 flex justify-end gap-2.5">
        <Btn variant="soft" onClick={onClose}>Cancel</Btn>
        <Btn variant="warning" disabled={busy} onClick={() => onDone("send_back", reason)}>Send back</Btn>
        <Btn variant="danger" disabled={busy} onClick={() => onDone("complete", reason)}>Reject</Btn>
      </div>
    </Modal>
  );
}

// Per-item attachment list + uploader (files attach after the PR is saved)
// Whole-PR attachments: list + add + download + remove (used when a PR is opened)
function PRAttachments({ pr, notify, onChanged }) {
  const [files, setFiles] = useState(pr.attachments || []);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setFiles(pr.attachments || []); }, [pr]);

  const refresh = async () => { try { setFiles(await api.listAttachments(pr.pr_no)); } catch {} };

  const onPick = async (e) => {
    const picked = e.target.files;
    if (!picked || !picked.length) return;
    setBusy(true);
    try { await api.uploadAttachments(pr.pr_no, picked); notify(`${picked.length} file(s) attached`); await refresh(); }
    catch (err) { notify(apiError(err), "error"); }
    finally { setBusy(false); e.target.value = ""; }
  };
  const remove = async (id) => {
    setBusy(true);
    try { await api.deleteAttachment(id); await refresh(); notify("Attachment removed"); }
    catch (err) { notify(apiError(err), "error"); } finally { setBusy(false); }
  };
  const download = async (a) => {
    try { await downloadAttachment(api.attachmentDownloadPath(a.id), a.original_name); }
    catch (err) { notify(apiError(err), "error"); }
  };
  const kb = (n) => n == null ? "" : n < 1024 ? n + " B" : n < 1048576 ? (n/1024).toFixed(0)+" KB" : (n/1048576).toFixed(1)+" MB";

  return (
    <div className="rounded-lg border border-[#E5E7EB] px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[#374151]">Files for {pr.pr_no}</span>
        <label className={`cursor-pointer rounded-md bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-semibold text-[#6366F1] ${busy ? "opacity-50" : ""}`}>
          📎 Attach File
          <input type="file" multiple className="hidden" disabled={busy} onChange={onPick} />
        </label>
      </div>
      {files.length === 0 ? (
        <div className="text-[11px] text-[#9CA3AF]">No files attached.</div>
      ) : (
        <div className="grid gap-1">
          {files.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded bg-[#F9FAFB] px-2 py-1 text-[12px]">
              <button onClick={() => download(a)} className="truncate text-left text-[#6366F1] hover:underline" title={a.original_name}>
                📄 {a.original_name} <span className="text-[#9CA3AF]">({kb(a.size_bytes)})</span>
              </button>
              <button onClick={() => remove(a.id)} disabled={busy} className="ml-2 shrink-0 text-[#EF4444]">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
