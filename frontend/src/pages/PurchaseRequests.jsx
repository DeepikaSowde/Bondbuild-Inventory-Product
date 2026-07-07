// pages/PurchaseRequests.jsx — Tailwind version
import { useEffect, useMemo, useRef, useState } from "react";
import { api, apiError, downloadAttachment } from "../lib/api";
import { Btn, Badge, Modal, Field, Input, Select, EmptyRow, money, fmtDate } from "../components/ui";
import { Table, Td, usePaged, Pagination } from "../components/Table";
import { exportPrPdf } from "../lib/prPdf";

const emptyItem = () => ({
  profile_code: "", description: "", colour: "", qty: "", unit: "pcs",
  remarks: "", supplier_id: "", supplier_name: "", supplier_type: "Local",
  unit_price: "", allocations: [],
});

// Format a native date input value (YYYY-MM-DD) into the project-wide
// dd/mm/yyyy style used by the Date required field.
const fmtDateReq = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// Attachment upload guard (mirrors the backend): block executables/scripts and
// files over 10 MB. Returns an error string for the first bad file, else null.
const MAX_UPLOAD_MB = 10;
const BLOCKED_UPLOAD_EXT = /\.(exe|com|scr|msi|msix|bat|cmd|dll|app|apk|jar|gadget|pif|cpl|sys|bin|run|out|sh|bash|zsh|ps1|psm1|psd1|vbs|vbe|vb|js|mjs|cjs|jse|wsf|wsh|hta|reg|lnk|py|pyc|pl|rb|php|php5|phtml|cgi|asp|aspx|jsp|htaccess)$/i;
const checkUploadFiles = (files) => {
  for (const f of Array.from(files || [])) {
    if (BLOCKED_UPLOAD_EXT.test(f.name)) return `"${f.name}" is blocked — executable and script files are not allowed.`;
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return `"${f.name}" is too large (max ${MAX_UPLOAD_MB} MB).`;
  }
  return null;
};

// Human label for an inventory row — also what a picked suggestion writes into Description.
const stockLabelOf = (s) =>
  [s.profile_name, s.size].filter(Boolean).join(" ") || s.item_name || s.item_code || "";

// ── Multi-source items ────────────────────────────────────────────────────────
// A visual PR item pulls one material from several pallets (allocations) plus an
// optional supplier buy. The DB stores ONE flat pr_items row per source, so we
// FLATTEN a visual item into rows on save (all rows share a line_no) and GROUP
// rows back by line_no on load. The backend reservation / PO logic already works
// one-source-per-row, so nothing downstream changes.
const stockSumOf = (it) => (it.allocations || []).reduce((s, a) => s + (Number(a.stock_qty) || 0), 0);
const buyQtyOf = (it) => Math.max(0, (Number(it.qty) || 0) - stockSumOf(it));

// Visual items -> flat pr_items rows. line_no (1-based item index) groups them.
function flattenItems(visualItems) {
  const out = [];
  visualItems.forEach((it, idx) => {
    const line_no = idx + 1;
    const base = {
      line_no, profile_code: it.profile_code || "", description: it.description.trim(),
      colour: it.colour || "", unit: it.unit || "pcs", remarks: it.remarks || "",
    };
    const allocs = (it.allocations || []).filter((a) => a.inventory_id && Number(a.stock_qty) > 0);
    for (const a of allocs) {
      out.push({
        ...base, qty: Number(a.stock_qty) || 0,
        stock_qty: Number(a.stock_qty) || 0, inventory_id: a.inventory_id || null,
        stock_location: a.stock_location || "", buy_qty: 0,
        supplier_id: null, supplier_name: null, supplier_type: it.supplier_type || "Local", unit_price: 0,
      });
    }
    const buy = buyQtyOf(it);
    if (buy > 0) {
      out.push({
        ...base, qty: buy, stock_qty: 0, inventory_id: null, stock_location: "", buy_qty: buy,
        supplier_id: it.supplier_id || null, supplier_name: it.supplier_name || null,
        supplier_type: it.supplier_type || "Local", unit_price: Number(it.unit_price) || 0,
      });
    }
    // description present but nothing sourced yet — keep a plain row so it isn't lost
    if (!allocs.length && buy <= 0) {
      out.push({
        ...base, qty: Number(it.qty) || 0, stock_qty: 0, inventory_id: null, stock_location: "", buy_qty: 0,
        supplier_id: it.supplier_id || null, supplier_name: it.supplier_name || null,
        supplier_type: it.supplier_type || "Local", unit_price: 0,
      });
    }
  });
  return out;
}

// Flat pr_items rows (grouped by line_no) -> editable visual items. Also handles
// legacy rows that carried both stock_qty and buy_qty on a single line.
function groupItemsForEdit(rawItems) {
  const order = [];
  const byLine = new Map();
  for (const it of rawItems) {
    const key = it.line_no != null ? `l${it.line_no}` : `id${it.id}`;
    if (!byLine.has(key)) { byLine.set(key, []); order.push(key); }
    byLine.get(key).push(it);
  }
  return order.map((key) => {
    const rows = byLine.get(key);
    const base = rows[0];
    const allocations = rows
      .filter((r) => Number(r.stock_qty) > 0)
      .map((r) => ({
        inventory_id: r.inventory_id || "", stock_location: r.stock_location || "",
        available_stock_qty: "", // backfilled from live stock once it loads
        stock_qty: String(Number(r.stock_qty) || 0),
      }));
    const buyRow = rows.find((r) => Number(r.buy_qty) > 0);
    // total = every portion added up (works for split rows and legacy combined rows)
    const total = rows.reduce(
      (s, r) => s + Math.max(0, Number(r.stock_qty) || 0) + Math.max(0, Number(r.buy_qty) || 0), 0);
    return {
      profile_code: base.profile_code || "", description: base.description || "", colour: base.colour || "",
      qty: total ? String(total) : (base.qty ?? ""), unit: base.unit || "pcs", remarks: base.remarks || "",
      supplier_id: buyRow?.supplier_id || "", supplier_name: buyRow?.supplier_name || "",
      supplier_type: (buyRow || base).supplier_type || "Local", unit_price: buyRow?.unit_price || "",
      allocations,
    };
  });
}

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

  // Paginate the list, 20 per page; reset to page 1 when the status filter changes.
  const { page, setPage, slice: pagePrs, total, pageSize, pageCount } = usePaged(prs, filter);

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
        {pagePrs.map((p) => (
          <tr key={p.pr_no}>
            <Td mono bold className="!text-[#6366F1]">{p.pr_no}</Td>
            <Td mono>{p.job_no}</Td>
            <Td>{p.project_name || "—"}</Td>
            <Td>{p.requested_by}</Td>
            <Td>{p.date_required || "—"}</Td>
            <Td align="center">{p.item_count}</Td>
            <Td><Badge status={p.status} /></Td>
            <Td align="right">
              <span className="inline-flex justify-end gap-1.5">
                <Btn variant="ghost" small title="Download PDF"
                  onClick={() => api.pr(p.pr_no).then(exportPrPdf).catch((e) => notify(apiError(e), "error"))}>PDF</Btn>
                <Btn variant="ghost" small onClick={() => api.pr(p.pr_no).then(setViewPR)}>Open</Btn>
              </span>
            </Td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPage={setPage} />

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
    unit_price: "", allocations: [],
  });
  const [form, setForm] = useState(() => editPR ? {
    job_no: editPR.job_no, project_name: editPR.project_name || "", location: editPR.location || "",
    date_required: editPR.date_required || "", date_issued: editPR.date_issued?.slice(0, 10) || "",
    pic: editPR.pic || "", requested_by: editPR.requested_by, checked_by: editPR.checked_by || "",
    approved_by: editPR.approved_by || "", remarks: editPR.remarks || "",
    items: groupItemsForEdit(editPR.items),
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
  const [descSuggest, setDescSuggest] = useState({ idx: -1, list: [] });

  // Load factory stock once on open so availability tags can show for any item
  // (including descriptions pre-filled when editing an existing PR).
  useEffect(() => {
    api.inventory().then((l) => { setStockList(l); setStockLoaded(true); }).catch(() => {});
  }, []);

  const setItem = (i, key, val) => setForm((f) => ({
    ...f,
    items: f.items.map((it, x) => {
      if (x !== i) return it;
      if (key === "qty" && val !== "" && (isNaN(Number(val)) || Number(val) < 0)) return it;
      return { ...it, [key]: val };
    }),
  }));
  const removeItem = (i) => setForm((f) => ({ ...f, items: f.items.filter((_, x) => x !== i) }));
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, blankItem()] }));

  // ── Stock allocations (one visual item -> many pallets) ──
  // Add a pallet as a new allocation, pre-filled with what it can cover.
  const addAllocation = (i, s) => setForm((f) => ({
    ...f,
    items: f.items.map((it, x) => {
      if (x !== i) return it;
      if ((it.allocations || []).some((a) => String(a.inventory_id) === String(s.id))) return it; // no duplicate pallet
      const total = Number(it.qty) || 0;
      const avail = availOf(s);
      const remaining = Math.max(0, total - stockSumOf(it));
      const qty = total > 0 ? Math.min(avail, remaining) : 0;
      return {
        ...it,
        profile_code: it.profile_code || s.item_code || "",
        description: it.description || [s.profile_name, s.size].filter(Boolean).join(" "),
        allocations: [
          ...(it.allocations || []),
          { inventory_id: s.id, stock_location: s.location_code || "", available_stock_qty: String(avail), stock_qty: String(qty) },
        ],
      };
    }),
  }));
  // Edit one allocation's pull qty (capped at that pallet's availability).
  const setAllocQty = (i, aIdx, val) => setForm((f) => ({
    ...f,
    items: f.items.map((it, x) => {
      if (x !== i) return it;
      return {
        ...it,
        allocations: it.allocations.map((a, y) => {
          if (y !== aIdx) return a;
          if (val === "") return { ...a, stock_qty: "" };
          const max = a.available_stock_qty !== "" ? Number(a.available_stock_qty) : Infinity;
          const capped = Math.min(Math.max(0, Number(val) || 0), max);
          return { ...a, stock_qty: String(capped) };
        }),
      };
    }),
  }));
  const removeAllocation = (i, aIdx) => setForm((f) => ({
    ...f,
    items: f.items.map((it, x) => x === i ? { ...it, allocations: it.allocations.filter((_, y) => y !== aIdx) } : it),
  }));
  // Greedily fill from every in-stock pallet in order; the remainder becomes Buy.
  const autoFillStock = (i) => setForm((f) => ({
    ...f,
    items: f.items.map((it, x) => {
      if (x !== i) return it;
      const info = getStockInfo(it.description);
      const inStock = info ? info.locations.filter((l) => l.qty > 0) : [];
      let left = Number(it.qty) || 0;
      const allocations = [];
      for (const l of inStock) {
        if (left <= 0) break;
        const take = Math.min(l.qty, left);
        if (take > 0) { allocations.push({ inventory_id: l.row.id, stock_location: l.loc, available_stock_qty: String(l.qty), stock_qty: String(take) }); left -= take; }
      }
      return { ...it, profile_code: it.profile_code || (inStock[0]?.row.item_code || ""), allocations };
    }),
  }));

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

  const onDescChange = async (i, val) => {
    setItem(i, "description", val);
    if (!val.trim() || val.trim().length < 2) { setDescSuggest({ idx: -1, list: [] }); return; }
    let list = stockList;
    if (!stockLoaded) {
      try { list = await api.inventory(); setStockList(list); setStockLoaded(true); } catch { return; }
    }
    const q = val.toLowerCase();
    // Filter by partial text, then collapse rows that share a label (same item in
    // multiple locations) so each catalogue item appears once in the dropdown.
    const seen = new Set();
    const matches = [];
    for (const s of list) {
      if (matches.length >= 8) break;
      const hit =
        (s.profile_name && s.profile_name.toLowerCase().includes(q)) ||
        (s.size && s.size.toLowerCase().includes(q)) ||
        (s.item_code && s.item_code.toLowerCase().includes(q)) ||
        (s.item_name && s.item_name.toLowerCase().includes(q));
      if (!hit) continue;
      const key = stockLabelOf(s).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(s);
    }
    setDescSuggest({ idx: i, list: matches });
  };

  // Claimable stock = physical on hand minus what's already reserved by other
  // raised STOCK POs. This is what a drafter can actually pull from.
  const availOf = (s) => Math.max(0, (Number(s?.quantity_in_stock) || 0) - (Number(s?.reserved_qty) || 0));

  // Derive stock availability for a description by matching it to the catalogue.
  // Aggregates every inventory row sharing that item's label (all its locations).
  // Returns null for free-text (non-catalogue) descriptions so no tag is shown.
  const getStockInfo = (description) => {
    const d = (description || "").trim().toLowerCase();
    if (!d || stockList.length === 0) return null;
    const rows = stockList.filter((s) => stockLabelOf(s).toLowerCase() === d);
    if (rows.length === 0) return null;
    const locations = rows.map((s) => ({
      loc: s.location_code || "—",
      qty: availOf(s),
      row: s, // source inventory row, used to link on button click
    }));
    return { locations, total: locations.reduce((sum, l) => sum + l.qty, 0) };
  };

  // When editing an existing PR, allocations arrive without live availability
  // (it isn't stored on the row). Backfill it from factory stock once loaded so
  // the pull-qty inputs cap correctly.
  useEffect(() => {
    if (!stockLoaded) return;
    setForm((f) => ({
      ...f,
      items: f.items.map((it) => ({
        ...it,
        allocations: (it.allocations || []).map((a) => {
          if (a.available_stock_qty !== "" || !a.inventory_id) return a;
          const inv = stockList.find((s) => String(s.id) === String(a.inventory_id));
          return inv ? { ...a, available_stock_qty: String(availOf(inv)), stock_location: a.stock_location || inv.location_code } : a;
        }),
      })),
    }));
  }, [stockLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!jobValid) return notify("Job No must contain at least one letter or number", "error");
    if (!form.requested_by.trim()) return notify("Requested By is required", "error");
    if (!form.items.some((it) => it.description.trim())) return notify("Description is required — add at least one item with a description", "error");
    if (form.items.some((it) => Number(it.qty) < 0)) return notify("Quantity cannot be negative", "error");
    if (!form.items.some((it) => Number(it.qty) > 0)) return notify("Quantity is required — at least one item must have a quantity greater than 0", "error");
    const over = form.items.find((it) => it.description.trim() && stockSumOf(it) > (Number(it.qty) || 0));
    if (over) return notify(`"${over.description.trim()}" pulls ${stockSumOf(over)} from stock but its total qty is only ${Number(over.qty) || 0} — lower a pallet quantity or raise the total`, "error");
    const buyNeedsSupplier = form.items.find((it) => it.description.trim() && buyQtyOf(it) > 0 && !it.supplier_id);
    if (buyNeedsSupplier) return notify(`Select a supplier for "${buyNeedsSupplier.description.trim() || buyNeedsSupplier.profile_code || "the buy item"}" — items with a buy quantity need a supplier`, "error");
    setBusy(true);
    try {
      try { await api.poProject(form.job_no.trim()); }
      catch { await api.addPoProject({ job_no: form.job_no.trim(), project_name: form.project_name || form.job_no, location: form.location }); }
      const payload = { ...form, items: flattenItems(form.items.filter((it) => it.description.trim())) };
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

  // Job No must contain at least one letter or digit — blocks blank and
  // punctuation-only junk like "" or " " that would otherwise pass a trim check.
  const jobValid = /[a-z0-9]/i.test(form.job_no || "");

  // Guard the close (X / Cancel) so unsaved attachments and details aren't lost silently.
  const guardedClose = () => {
    const enteredNew =
      !editPR &&
      (form.job_no || form.project_name || form.location || form.approved_by ||
        form.checked_by || form.pic || form.remarks ||
        form.items.some((it) => it.profile_code || it.description || it.qty));
    if (heldFiles.length > 0 || enteredNew) {
      const msg = heldFiles.length > 0
        ? `You have ${heldFiles.length} attached file(s) and unsaved details that haven't been submitted yet. Close and discard them?`
        : "You have unsaved details that haven't been submitted yet. Close and discard them?";
      if (!window.confirm(msg)) return;
    }
    onClose();
  };

  const lbl = "block text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF] mb-1";
  const inp = "w-full box-border border border-[#E5E7EB] rounded-lg px-2.5 py-2 text-[12px] outline-none bg-white focus:border-[#6366F1]";

  return (
    <Modal wide noBackdropClose title={editPR ? `Edit ${editPR.pr_no}` : `New purchase request · ${nextNo}`} onClose={guardedClose}>
      {editPR?.rejection_reason && (
        <div className="mb-3.5 rounded-lg bg-[#FFF7E6] px-3.5 py-2.5 text-[13px] text-[#92400E]">Sent back: {editPR.rejection_reason}</div>
      )}

      {/* Header fields */}
      <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
        <Field label="Job No *">
          <Input value={form.job_no} onChange={(e) => setForm({ ...form, job_no: e.target.value })} onBlur={lookupJob} placeholder="JN426"
            className={!jobValid ? "!border-[#DC2626] focus:!border-[#DC2626]" : ""} />
          {!jobValid && (
            <span className="mt-1 block text-[10px] font-semibold text-[#DC2626]">
              {form.job_no.trim() ? "Must contain a letter or number" : "Job No is required"}
            </span>
          )}
        </Field>
        <Field label="Project name"><Input value={form.project_name} maxLength={200} onChange={(e) => setForm({ ...form, project_name: e.target.value })} placeholder="12 Harlyn Road" /></Field>
        <Field label="Location / scope"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
        <Field label="Date required">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><Input value={form.date_required} onChange={(e) => setForm({ ...form, date_required: e.target.value })} placeholder="ASAP, 01/04/2026" /></div>
            <Input type="date" className="!w-[9.5rem] flex-none" title="Pick a date" onChange={(e) => setForm({ ...form, date_required: fmtDateReq(e.target.value) })} />
          </div>
        </Field>
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
          const stockSum = stockSumOf(it);
          const buyQty = Math.max(0, totalQty - stockSum);
          const overAlloc = stockSum > totalQty;
          const info = getStockInfo(it.description);
          const inStock = info ? info.locations.filter((l) => l.qty > 0) : [];
          const usedInv = new Set((it.allocations || []).map((a) => String(a.inventory_id)));
          const pStock = totalQty > 0 ? Math.min(100, (stockSum / totalQty) * 100) : 0;
          const pBuy = totalQty > 0 ? Math.min(100 - pStock, (buyQty / totalQty) * 100) : 0;
          return (
            <div key={i} className="rounded-xl border border-[#E5E7EB]">
              {/* purple header */}
              <div className="flex items-center justify-between rounded-t-xl bg-[#6366F1] px-3 py-1 text-[10px] font-bold text-white">
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
                <div>
                  <label className={lbl}>
                    Description *
                    <span className={`ml-1 font-normal normal-case tracking-normal ${it.description.length > 450 ? "text-[#DC2626]" : "text-[#9CA3AF]"}`}>
                      ({it.description.length}/500)
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      className={inp} value={it.description} maxLength={500}
                      onChange={(e) => onDescChange(i, e.target.value)}
                      onBlur={() => setTimeout(() => setDescSuggest({ idx: -1, list: [] }), 150)}
                      placeholder="e.g. L-Angle 25x75x2.8mm"
                    />
                    {descSuggest.idx === i && descSuggest.list.length > 0 && (
                      <div className="absolute left-0 top-full z-50 mt-0.5 w-full rounded-lg border border-[#E5E7EB] bg-white shadow-lg">
                        {descSuggest.list.map((s) => {
                          const label = stockLabelOf(s);
                          return (
                            <button key={s.id} type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-[#EEF2FF] first:rounded-t-lg last:rounded-b-lg"
                              onMouseDown={() => { setItem(i, "description", label); setDescSuggest({ idx: -1, list: [] }); }}
                            >
                              <span className="shrink-0 font-mono text-[10px] text-[#6366F1]">{s.item_code}</span>
                              <span className="text-[#374151]">{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* Stock availability tag — shows for catalogue items, hidden for free-text */}
                  {(() => {
                    const info = getStockInfo(it.description);
                    if (!info) return null;
                    const inStock = info.locations.filter((l) => l.qty > 0);
                    if (inStock.length === 0)
                      return (
                        <div className="mt-1 text-[11px] font-semibold text-[#DC2626]">
                          ⛔ Out of Stock (Avail: 0)
                        </div>
                      );
                    return (
                      <div className="mt-1 text-[11px] font-semibold text-[#059669]">
                        📦 From Stock{" "}
                        {inStock.map((l) => `@${l.loc} (Avail: ${l.qty})`).join(", ")}
                        {inStock.length > 1 && (
                          <span className="font-normal text-[#6B7280]"> · Total Avail: {info.total}</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div><label className={lbl}>Colour</label><input className={inp} value={it.colour} onChange={(e) => setItem(i, "colour", e.target.value)} placeholder="e.g. SS, RAL 7016" /></div>
              </div>

              {/* Row 2: Total + Unit + Supplier + Type */}
              <div className="grid grid-cols-[90px_90px_1fr_110px] gap-2.5 px-3 pb-2 pt-1">
                <div><label className={lbl}>Total Qty</label><input type="number" min="0" className={inp} value={it.qty} onKeyDown={(e) => e.key === "-" && e.preventDefault()} onChange={(e) => { const v = e.target.value; if (v === "" || Number(v) >= 0) setItem(i, "qty", v); }} placeholder="0" /></div>
                <div><label className={lbl}>Unit</label>
                  <select className={inp} value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)}>{["pcs", "m", "set", "lot", "kg"].map((u) => <option key={u}>{u}</option>)}</select>
                </div>
                <div><label className={lbl}>Supplier {buyQty > 0 ? <span className="text-[#DC2626]">*required</span> : <span className="text-[#D97706]">(for buy qty)</span>}</label>
                  <select className={`${inp} ${buyQty > 0 && !it.supplier_id ? "!border-[#DC2626]" : ""}`} value={it.supplier_id} onChange={(e) => { const s = suppliers.find((s) => String(s.id) === e.target.value); setItem(i, "supplier_id", e.target.value); setItem(i, "supplier_name", s?.name || ""); if (s) setItem(i, "supplier_type", s.type); }}>
                    <option value="">{buyQty > 0 ? "— Select supplier —" : "— Select supplier (optional) —"}</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {buyQty > 0 && !it.supplier_id && <span className="mt-0.5 block text-[10px] font-semibold text-[#DC2626]">Buy qty needs a supplier</span>}
                </div>
                <div><label className={lbl}>Type</label>
                  <select className={inp} value={it.supplier_type} onChange={(e) => setItem(i, "supplier_type", e.target.value)}>{["Local", "China", "Europe", "Other"].map((t) => <option key={t}>{t}</option>)}</select>
                </div>
              </div>

              {/* Remarks */}
              <div className="px-3 pb-1.5">
                <label className={lbl}>Remarks ({(it.remarks || "").length}/200)</label>
                <input className={inp} value={it.remarks || ""} maxLength={200} onChange={(e) => setItem(i, "remarks", e.target.value)} placeholder="e.g. URGENT, Preference (P&M)" />
              </div>

              {/* Fulfil-from ledger — pull one material from several pallets; the remainder is a Buy */}
              <div className="mx-3 mb-2 rounded-lg border border-[#E5E7EB] bg-[#FBFBFD] px-3 py-2.5">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF]">Fulfil from — pull stock, rest is buy</span>
                  {inStock.length > 0 && (
                    <button type="button" disabled={totalQty <= 0} onClick={() => autoFillStock(i)}
                      title={totalQty <= 0 ? "Enter Total Qty first" : "Fill from every pallet in order; remainder becomes Buy"}
                      className={`ml-auto rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${totalQty <= 0 ? "cursor-not-allowed bg-[#F3F4F6] text-[#9CA3AF]" : "bg-[#6366F1] text-white hover:bg-[#4F46E5]"}`}>
                      ⚡ Auto-fill
                    </button>
                  )}
                </div>

                {/* pallet chips — click to add that pallet as an allocation */}
                {inStock.length > 0 && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Pull from stock:</span>
                    {inStock.map((l) => {
                      const added = usedInv.has(String(l.row.id));
                      const disabled = totalQty <= 0 || added;
                      return (
                        <button key={l.row.id} type="button" disabled={disabled} onClick={() => addAllocation(i, l.row)}
                          title={added ? "Already added below" : totalQty <= 0 ? "Enter Total Qty first" : `Add ${l.loc} (avail ${l.qty})`}
                          className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            added ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#059669]"
                              : disabled ? "cursor-not-allowed border-[#E5E7EB] bg-[#F9FAFB] text-[#9CA3AF]"
                              : "border-[#C7D2FE] bg-[#EEF2FF] text-[#6366F1] hover:bg-[#E0E7FF]"}`}>
                          {added ? "✓ " : "+ "}{l.loc} · {l.qty}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* allocation rows + auto buy remainder */}
                <div className="grid gap-1.5">
                  {(it.allocations || []).map((a, aIdx) => {
                    const aOver = a.available_stock_qty !== "" && Number(a.stock_qty) > Number(a.available_stock_qty);
                    return (
                      <div key={aIdx} className="grid grid-cols-[16px_1fr_110px_26px] items-center gap-2 rounded-md border border-[#E5E7EB] border-l-[3px] border-l-[#059669] bg-white px-2.5 py-1.5">
                        <span className="text-[13px]">📦</span>
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-[#374151]">{a.stock_location || "Stock"}</div>
                          <div className="text-[10px] text-[#9CA3AF]">Reserved against this pallet{a.available_stock_qty !== "" ? ` · avail ${a.available_stock_qty}` : ""}</div>
                        </div>
                        <input type="number" min="0" max={a.available_stock_qty !== "" ? Number(a.available_stock_qty) : undefined}
                          className={`${inp} py-1 text-right ${aOver ? "!border-[#DC2626] text-[#DC2626]" : ""}`}
                          value={a.stock_qty} onChange={(e) => setAllocQty(i, aIdx, e.target.value)} placeholder="0" />
                        <button type="button" onClick={() => removeAllocation(i, aIdx)} title="Remove pallet"
                          className="rounded text-center text-[14px] text-[#9CA3AF] hover:bg-[#FEF2F2] hover:text-[#DC2626]">✕</button>
                      </div>
                    );
                  })}

                  {buyQty > 0 && (
                    <div className="grid grid-cols-[16px_1fr_110px_26px] items-center gap-2 rounded-md border border-[#E5E7EB] border-l-[3px] border-l-[#D97706] bg-white px-2.5 py-1.5">
                      <span className="text-[13px]">🛒</span>
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold text-[#374151]">Buy{it.supplier_name ? ` — ${it.supplier_name}` : ""}</div>
                        <div className="text-[10px] text-[#9CA3AF]">{it.supplier_id ? "Becomes a PO on approval" : "Select a supplier above"}</div>
                      </div>
                      <input type="number" className={`${inp} py-1 text-right bg-[#F9FAFB] cursor-not-allowed`} value={buyQty} readOnly title="Auto = Total − stock allocated" />
                      <span />
                    </div>
                  )}

                  {(it.allocations || []).length === 0 && buyQty <= 0 && (
                    <div className="rounded-md border border-dashed border-[#E5E7EB] px-2.5 py-2 text-center text-[11px] italic text-[#9CA3AF]">
                      Enter a Total Qty, then add a pallet or Auto-fill. With no pallets the whole qty becomes a Buy.
                    </div>
                  )}
                </div>

                {/* running tally */}
                <div className="mt-2">
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-[#EEF0F4]">
                    <div className="bg-[#059669]" style={{ width: `${pStock}%` }} />
                    <div className="bg-[#D97706]" style={{ width: `${pBuy}%` }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11.5px]">
                    <span className="text-[#6B7280]">From stock <b className="text-[#059669]">{stockSum}</b> · Buy <b className="text-[#D97706]">{buyQty}</b> · Total <b className="text-[#374151]">{totalQty}</b></span>
                    {overAlloc
                      ? <span className="rounded-full bg-[#FEF2F2] px-2 py-0.5 text-[10.5px] font-bold text-[#DC2626]">{stockSum - totalQty} over — reduce a pallet</span>
                      : totalQty > 0
                      ? <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10.5px] font-bold text-[#059669]">✓ balanced</span>
                      : <span className="text-[10.5px] text-[#9CA3AF]">enter total qty</span>}
                  </div>
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
                            const avail = availOf(s);
                            const reserved = Number(s.reserved_qty) || 0;
                            const enough = avail > 0;
                            const added = usedInv.has(String(s.id));
                            return (
                              <tr key={s.id}>
                                <td className="border-b border-[#F3F4F6] px-2.5 py-1.5">{s.location_code || "—"}</td>
                                <td className="border-b border-[#F3F4F6] px-2.5 py-1.5">
                                  <span className="font-mono text-[#6366F1]">{s.item_code}</span>
                                  {s.profile_name && <div className="text-[10px] text-[#9CA3AF] mt-0.5">{s.profile_name}</div>}
                                </td>
                                <td className="border-b border-[#F3F4F6] px-2.5 py-1.5">{s.size || s.item_name || "—"}</td>
                                <td className="border-b border-[#F3F4F6] px-2.5 py-1.5 font-bold text-[#059669]">
                                  {avail}
                                  {reserved > 0 && <span className="ml-1 text-[10px] font-semibold text-[#D97706]">({reserved} blocked)</span>}
                                </td>
                                <td className="border-b border-[#F3F4F6] px-2.5 py-1.5">
                                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${enough ? "bg-[#ECFDF5] text-[#059669]" : "bg-[#FEF2F2] text-[#DC2626]"}`}>{enough ? "IN STOCK" : "OUT"}</span>
                                </td>
                                <td className="border-b border-[#F3F4F6] px-2.5 py-1.5">
                                  {added
                                    ? <span className="whitespace-nowrap rounded-md bg-[#ECFDF5] px-3 py-1 text-[11px] font-bold text-[#059669]">✓ Added</span>
                                    : enough
                                    ? <button onClick={() => { addAllocation(i, s); setStockOpen(null); }} className="whitespace-nowrap rounded-md bg-[#059669] px-3 py-1 text-[11px] font-bold text-white">✅ Use from Stock</button>
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

      <div className="mt-3.5">
        <Field label={`Remarks (overall) — ${(form.remarks || "").length}/200`}>
          <Input value={form.remarks || ""} maxLength={200} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </Field>
      </div>

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
              const err = checkUploadFiles(picked);
              if (err) { notify(err, "error"); e.target.value = ""; return; }
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
        <Btn variant="soft" onClick={guardedClose}>Cancel</Btn>
        <Btn onClick={submit} disabled={busy || !jobValid}>{editPR ? "Save" : "Submit request"}</Btn>
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
    ["Requested by", pr.requested_by], ["Required", pr.date_required || "—"], ["Date issued", fmtDate(pr.date_issued) || "—"], ["Approved by", pr.approved_by || "—"]];

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
                        {assignMode ? <Input type="number" min="0" step="0.01" value={it.unit_price || ""} onChange={(e) => setIt(i, "unit_price", e.target.value)} className={Number(it.unit_price) > 0 ? "" : "!border-[#DC2626]"} placeholder="0.00" /> : money(it.unit_price)}
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
        <Btn variant="soft" onClick={() => exportPrPdf(pr).catch((e) => notify(apiError(e), "error"))}>⬇ PDF</Btn>
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
          const buyItems = items.filter((it) => Number(it.buy_qty) > 0);
          const allBuyHaveSupplier = buyItems.every((it) => it.supplier_id);
          const allBuyHavePrice = buyItems.every((it) => Number(it.unit_price) > 0);
          const saveAssign = async () => api.assignItems(pr.pr_no, buyItems.map((it) => ({ id: it.id, supplier_id: it.supplier_id || null, supplier_name: it.supplier_name, unit_price: Number(it.unit_price) || 0 })));
          return (
            <>
              <Btn variant="soft" disabled={busy} onClick={() => act(saveAssign, "Saved")}>Save prices</Btn>
              {pSendFic && hasStock && anyAwaiting && (
                <Btn variant="warning" disabled={busy} onClick={() => act(async () => { await saveAssign(); await api.sendToFic(pr.pr_no); }, "Stock info sent to Factory In-charge — Stock PO created")}>Send stock to FIC</Btn>
              )}
              {pGenerate && hasBuy && (
                <Btn disabled={busy || !allBuyHaveSupplier || !allBuyHavePrice}
                  title={!allBuyHaveSupplier ? "Assign a supplier to every buy item first" : !allBuyHavePrice ? "Enter a unit price (> 0) for every buy item first" : ""}
                  onClick={() => act(async () => {
                    if (!allBuyHavePrice) throw new Error("Enter a unit price for every buy item before generating the PO");
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
    const err = checkUploadFiles(picked);
    if (err) { notify(err, "error"); e.target.value = ""; return; }
    setBusy(true);
    try { await api.uploadAttachments(pr.pr_no, picked); notify(`${picked.length} file(s) attached`); await refresh(); }
    catch (err) { notify(apiError(err), "error"); }
    finally { setBusy(false); e.target.value = ""; }
  };
  const remove = async (a) => {
    // Confirm before permanently deleting an already-uploaded file.
    if (!window.confirm(`Delete attachment "${a.original_name}"?\n\nThis removes the file permanently and can't be undone.`)) return;
    setBusy(true);
    try { await api.deleteAttachment(a.id); await refresh(); notify("Attachment removed"); }
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
              <button onClick={() => remove(a)} disabled={busy} className="ml-2 shrink-0 text-[#EF4444]">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
