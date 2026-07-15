// pages/PurchaseRequests.jsx — Tailwind version
import { useEffect, useMemo, useRef, useState } from "react";
import { api, apiError, downloadAttachment } from "../lib/api";
import { Btn, Badge, Modal, Field, Input, Select, EmptyRow, money, curMoney, fmtDate } from "../components/ui";
import { Table, Td, usePaged, Pagination } from "../components/Table";
import { exportPrPdf } from "../lib/prPdf";
import { exportRfqPdf, exportRfqExcel } from "../lib/rfqDoc";
import AuditTrail from "../components/AuditTrail";

// Currencies the Purchaser may assign to a buy line. SGD is the default so the
// screen behaves exactly as before until someone changes it. Keep this list in
// sync with the pr_items.currency CHECK on the backend. Symbols + formatting live
// in ui.curMoney so the PO screen and PDF render them identically.
const CURRENCIES = ["SGD", "EUR", "USD", "CNY", "JPY", "INR", "MYR"];

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

// ── Per-item attachments + OneDrive link ──
// Attachments key on item_uid, NOT line_no: flattenItems() numbers lines positionally,
// so deleting item 2 renumbers item 3 into its place and its files would follow the
// number rather than the material. The uid is minted once and carried through edits.
const newItemUid = () =>
  globalThis.crypto?.randomUUID?.() ?? `uid-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const ITEM_FILE_LIMITS = { maxPerItem: 2, maxBytes: 5 * 1024 * 1024, maxPrBytes: 20 * 1024 * 1024 };
const ITEM_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx";

// Mirrors backend/src/utils/oneDriveUrl.js — the server is the authority; this is
// only so the user sees the problem before they hit Submit.
const isOneDriveUrl = (raw) => {
  const v = (raw || "").trim();
  if (!v) return true;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return h === "onedrive.live.com" || h === "1drv.ms" || h === "sharepoint.com" || h.endsWith(".sharepoint.com");
  } catch { return false; }
};

// Visual items -> flat pr_items rows. line_no (1-based item index) groups them.
function flattenItems(visualItems) {
  const out = [];
  visualItems.forEach((it, idx) => {
    const line_no = idx + 1;
    const base = {
      line_no, profile_code: it.profile_code || "", description: it.description.trim(),
      colour: it.colour || "", unit: it.unit || "pcs", remarks: it.remarks || "",
      // every flat row of one visual item carries the same uid, exactly as it carries
      // the same line_no — the server reads it off any of them
      item_uid: it.item_uid || newItemUid(),
      onedrive_url: (it.onedrive_url || "").trim() || null,
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
      // PRs raised before the item_uid migration have none; mint one so the item can
      // take attachments from here on
      item_uid: base.item_uid || newItemUid(),
      onedrive_url: base.onedrive_url || "",
    };
  });
}

export default function PurchaseRequests({ user, perms = {}, notify, refreshInbox }) {
  const [prs, setPRs] = useState([]);
  // Purchasers land on Approved (their first actionable tab); everyone else on All.
  const [filter, setFilter] = useState(user.role === "Purchaser" ? "APPROVED" : "All");
  const [showCreate, setShowCreate] = useState(false);
  const [editPR, setEditPR] = useState(null);
  const [viewPR, setViewPR] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [busy, setBusy] = useState(false);
  // Free-text search + per-field filters (job no / project / PR no)
  const [search, setSearch] = useState("");
  const [fJob, setFJob] = useState("");
  const [fProject, setFProject] = useState("");
  const [fPrNo, setFPrNo] = useState("");

  const role = user.role, isAdmin = role === "Admin";
  // Purchasers only work with approved PRs (to action) and PO-raised ones (to track),
  // so their tab bar is scoped to those two stages. Other roles see every status.
  const STATUS_TABS = role === "Purchaser"
    ? ["APPROVED", "PO_RAISED"]
    : ["All", "PENDING", "APPROVED", "SEND_BACK", "PO_RAISED", "REJECTED"];
  const canCreate = !!perms.raise_pr || isAdmin;
  const canApprove = !!perms.approve_pr || !!perms.reject_pr || isAdmin;
  const canPurchase = !!perms.assign_supplier || !!perms.generate_po || !!perms.send_to_fic || isAdmin;
  const canFIC = !!perms.issue_stock || isAdmin;

  const load = () => api.prs(filter).then(setPRs).catch((e) => notify(apiError(e), "error"));
  useEffect(() => { load(); }, [filter]);
  useEffect(() => { api.suppliers().then(setSuppliers).catch(() => {}); }, []);

  const counts = useMemo(() => { const c = {}; prs.forEach((p) => (c[p.status] = (c[p.status] || 0) + 1)); return c; }, [prs]);
  const refresh = () => { load(); refreshInbox?.(); };

  // Search (PR no / job / project) + dropdown filters, applied client-side to
  // the loaded list. Dropdown options are the distinct values in that list.
  const jobOptions = useMemo(() => [...new Set(prs.map((p) => p.job_no).filter(Boolean))].sort(), [prs]);
  const projectOptions = useMemo(() => [...new Set(prs.map((p) => p.project_name).filter(Boolean))].sort(), [prs]);
  const prNoOptions = useMemo(() => [...new Set(prs.map((p) => p.pr_no).filter(Boolean))].sort(), [prs]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prs.filter((p) => {
      if (fJob && p.job_no !== fJob) return false;
      if (fProject && p.project_name !== fProject) return false;
      if (fPrNo && p.pr_no !== fPrNo) return false;
      if (q && !`${p.pr_no || ""} ${p.job_no || ""} ${p.project_name || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [prs, search, fJob, fProject, fPrNo]);

  // Paginate, 20 per page; reset to page 1 when the tab, search or filters change.
  const { page, setPage, slice: pagePrs, total, pageSize, pageCount } =
    usePaged(filtered, `${filter}|${search}|${fJob}|${fProject}|${fPrNo}`);

  const fieldCls = "rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-[#374151] outline-none focus:border-[#6366F1] max-w-[190px]";
  const STATUS_LABEL = { All: "All statuses", APPROVED: "Approved", PENDING: "Pending", SEND_BACK: "Sent back", PO_RAISED: "PO raised", REJECTED: "Rejected" };
  const defaultStatus = role === "Purchaser" ? "APPROVED" : "All";
  const anyFilter = search || fJob || fProject || fPrNo || filter !== defaultStatus;
  const clearFilters = () => { setSearch(""); setFJob(""); setFProject(""); setFPrNo(""); setFilter(defaultStatus); };

  // PR number is now assigned per-job on submit, so there is nothing to preview here.
  const openCreate = () => {
    setEditPR(null);
    setShowCreate(true);
  };

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`rounded-full border px-3.5 py-[5px] text-[12.5px] font-semibold capitalize transition-colors
                ${filter === s ? "border-[#1E1B4B] bg-[#1E1B4B] text-white" : "border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#6366F1]"}`}>
              {s === "All" ? "All" : s.replace("_", " ").toLowerCase()}{s !== "All" && counts[s] ? ` · ${counts[s]}` : ""}
            </button>
          ))}
        </div>
        {canCreate && <Btn onClick={openCreate}>+ New purchase request</Btn>}
      </div>

      {/* Search + per-field filters (job no / project / PR no) */}
      <div className="mb-[18px] flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PR no, job no or project…"
            className="w-full rounded-lg border border-[#E5E7EB] bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-[#6366F1]"
          />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={fieldCls}>
          {STATUS_TABS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
        </select>
        <select value={fJob} onChange={(e) => setFJob(e.target.value)} className={fieldCls}>
          <option value="">All jobs</option>
          {jobOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={fProject} onChange={(e) => setFProject(e.target.value)} className={fieldCls}>
          <option value="">All projects</option>
          {projectOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={fPrNo} onChange={(e) => setFPrNo(e.target.value)} className={fieldCls}>
          <option value="">All PR numbers</option>
          {prNoOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {anyFilter && (
          <button onClick={clearFilters}
            className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#6B7280] transition-colors hover:border-[#6366F1]">
            Clear
          </button>
        )}
      </div>

      <Table columns={[
        { label: "PR No" }, { label: "Job" }, { label: "Project" }, { label: "Requested by" },
        { label: "Required" }, { label: "Items", align: "center" }, { label: "Status" }, { label: "" },
      ]}>
        {filtered.length === 0 && <EmptyRow colSpan={8}>{prs.length === 0 ? "No purchase requests yet." : "No PRs match your search / filters."}</EmptyRow>}
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
                <Btn variant="ghost" small onClick={() => api.pr(p.pr_no).then(setViewPR)}>View</Btn>
              </span>
            </Td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPage={setPage} />

      {showCreate && (
        <PRForm user={user} suppliers={suppliers} editPR={editPR} notify={notify}
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

function PRForm({ user, suppliers, editPR, notify, onClose, onSaved }) {
  const blankItem = () => ({
    profile_code: "", description: "", colour: "", qty: "", unit: "pcs",
    remarks: "", supplier_id: "", supplier_name: "", supplier_type: "Local",
    unit_price: "", allocations: [], item_uid: newItemUid(), onedrive_url: "",
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
  // Per-item files awaiting upload, keyed by item_uid. Same trick as heldFiles: on a
  // create the PR doesn't exist yet, so they ride along until the save returns a pr_no.
  const [heldItemFiles, setHeldItemFiles] = useState({});
  // Already-uploaded per-item files (edit mode) — getPR returns them on the PR.
  const [itemAttachments, setItemAttachments] = useState(() => editPR?.item_attachments || []);
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
  const removeItem = (i) => {
    // Drop any files still held for the item being removed. Files already uploaded stay
    // put; the server reconciles them against the surviving item_uids when the PR saves.
    const gone = form.items[i]?.item_uid;
    if (gone) setHeldItemFiles((h) => Object.fromEntries(Object.entries(h).filter(([uid]) => uid !== gone)));
    setForm((f) => ({ ...f, items: f.items.filter((_, x) => x !== i) }));
  };
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, blankItem()] }));

  // ── Per-item attachments ──
  const savedFilesOf = (uid) => itemAttachments.filter((a) => a.item_uid === uid);
  const heldFilesOf = (uid) => heldItemFiles[uid] || [];
  const fileCountOf = (uid) => savedFilesOf(uid).length + heldFilesOf(uid).length;

  const pickItemFiles = (uid, fileList) => {
    const picked = Array.from(fileList || []);
    if (!picked.length) return;
    const room = ITEM_FILE_LIMITS.maxPerItem - fileCountOf(uid);
    if (picked.length > room) {
      return notify(
        room <= 0
          ? `This item already has ${ITEM_FILE_LIMITS.maxPerItem} files — remove one first`
          : `Only ${room} more file(s) allowed on this item`,
        "error"
      );
    }
    const tooBig = picked.find((f) => f.size > ITEM_FILE_LIMITS.maxBytes);
    if (tooBig) return notify(`"${tooBig.name}" is over the 5 MB limit`, "error");

    // The 20 MB per-PR ceiling is enforced server-side too; check it here so the user
    // finds out before uploading rather than after.
    const already = itemAttachments.reduce((s, a) => s + Number(a.size_bytes || 0), 0)
      + Object.values(heldItemFiles).flat().reduce((s, f) => s + f.size, 0);
    const incoming = picked.reduce((s, f) => s + f.size, 0);
    if (already + incoming > ITEM_FILE_LIMITS.maxPrBytes) {
      return notify("This PR's attachments would exceed the 20 MB total limit", "error");
    }
    setHeldItemFiles((h) => ({ ...h, [uid]: [...(h[uid] || []), ...picked] }));
  };

  const dropHeldFile = (uid, idx) =>
    setHeldItemFiles((h) => ({ ...h, [uid]: (h[uid] || []).filter((_, x) => x !== idx) }));

  const dropSavedFile = async (att) => {
    if (!window.confirm(`Remove "${att.original_name}"?`)) return;
    try {
      await api.deleteItemAttachment(att.id);
      setItemAttachments((l) => l.filter((a) => a.id !== att.id));
      notify("Attachment removed");
    } catch (e) { notify(apiError(e), "error"); }
  };

  // Upload everything held, once the PR is known to exist. Reports per-item failures
  // rather than pretending the save was clean.
  const uploadHeldItemFiles = async (prNo) => {
    const entries = Object.entries(heldItemFiles).filter(([, files]) => files.length);
    if (!entries.length) return { uploaded: 0, failed: [] };
    let uploaded = 0;
    const failed = [];
    for (const [uid, files] of entries) {
      try { await api.uploadItemAttachments(prNo, uid, files); uploaded += files.length; }
      catch (e) { failed.push(apiError(e)); }
    }
    return { uploaded, failed };
  };

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
    const badLink = form.items.find((it) => it.description.trim() && !isOneDriveUrl(it.onedrive_url));
    if (badLink) return notify(`"${badLink.description.trim()}" has a link that isn't an https OneDrive or SharePoint URL`, "error");
    setBusy(true);
    try {
      try { await api.poProject(form.job_no.trim()); }
      catch { await api.addPoProject({ job_no: form.job_no.trim(), project_name: form.project_name || form.job_no, location: form.location }); }
      const payload = { ...form, items: flattenItems(form.items.filter((it) => it.description.trim())) };
      if (editPR) {
        await api.updatePR(editPR.pr_no, { ...payload, resubmit: editPR.status === "SEND_BACK" });
        const { failed } = await uploadHeldItemFiles(editPR.pr_no);
        if (failed.length) notify(`${editPR.pr_no} updated, but ${failed.length} item file(s) failed: ${failed[0]}`, "warning");
        else notify(`${editPR.pr_no} updated${editPR.status === "SEND_BACK" ? " and resubmitted" : ""}`);
      }
      else {
        const pr = await api.createPR(payload);
        // upload any files held on the form, now that the PR exists
        const itemResult = await uploadHeldItemFiles(pr.pr_no);
        let prFilesOk = true;
        if (heldFiles.length) {
          try { await api.uploadAttachments(pr.pr_no, heldFiles); }
          catch { prFilesOk = false; }
        }
        const totalFiles = heldFiles.length + itemResult.uploaded;
        if (!prFilesOk || itemResult.failed.length) {
          notify(`${pr.pr_no} created, but some files failed to upload — open the PR to add them`, "warning");
        } else if (totalFiles) {
          notify(`${pr.pr_no} created with ${totalFiles} file(s)`);
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
        form.items.some((it) => it.profile_code || it.description || it.qty || it.onedrive_url));
    const heldItemCount = Object.values(heldItemFiles).reduce((s, l) => s + l.length, 0);
    const pending = heldFiles.length + heldItemCount;
    if (pending > 0 || enteredNew) {
      const msg = pending > 0
        ? `You have ${pending} attached file(s) and unsaved details that haven't been submitted yet. Close and discard them?`
        : "You have unsaved details that haven't been submitted yet. Close and discard them?";
      if (!window.confirm(msg)) return;
    }
    onClose();
  };

  const lbl = "block text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF] mb-1";
  const inp = "w-full box-border border border-[#E5E7EB] rounded-lg px-2.5 py-2 text-[12px] outline-none bg-white focus:border-[#6366F1]";

  return (
    <Modal wide noBackdropClose title={editPR ? `Edit ${editPR.pr_no}` : "New purchase request"} onClose={guardedClose}>
      {editPR?.rejection_reason && (
        <div className="mb-3.5 rounded-lg bg-[#FFF7E6] px-3.5 py-2.5 text-[13px] text-[#92400E]">Sent back: {editPR.rejection_reason}</div>
      )}

      {/* Header fields */}
      <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
        <Field label="Job No *">
          {/* Job No is fixed once the PR exists — pr_no (<job>/PR-001) is built from it. */}
          <Input value={form.job_no} disabled={!!editPR}
            onChange={(e) => setForm({ ...form, job_no: e.target.value })} onBlur={lookupJob} placeholder="JN426"
            title={editPR ? "Job No can't be changed after the PR is created" : undefined}
            className={!editPR && !jobValid ? "!border-[#DC2626] focus:!border-[#DC2626]" : ""} />
          {!editPR && !jobValid && (
            <span className="mt-1 block text-[10px] font-semibold text-[#DC2626]">
              {form.job_no.trim() ? "Must contain a letter or number" : "Job No is required"}
            </span>
          )}
        </Field>
        <Field label="Project name"><Input value={form.project_name} maxLength={200} onChange={(e) => setForm({ ...form, project_name: e.target.value })} placeholder="12 Harlyn Road" /></Field>
        <Field label="Location / scope"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
        <Field label="Date required" className="sm:col-span-2">
          <div className="flex items-center gap-2">
            <div className="min-w-[5rem] flex-1"><Input value={form.date_required} onChange={(e) => setForm({ ...form, date_required: e.target.value })} placeholder="ASAP, 01/04/2026" /></div>
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

              {/* OneDrive link — one per item, host-validated server-side */}
              <div className="px-3 pb-1.5">
                <label className={lbl}>OneDrive link (optional)</label>
                <input
                  className={inp}
                  value={it.onedrive_url || ""}
                  onChange={(e) => setItem(i, "onedrive_url", e.target.value)}
                  placeholder="https://contoso.sharepoint.com/… or https://1drv.ms/…"
                />
                {!isOneDriveUrl(it.onedrive_url) && (
                  <span className="mt-0.5 block text-[10px] font-semibold text-[#DC2626]">
                    Must be an https OneDrive or SharePoint link
                  </span>
                )}
              </div>

              {/* Per-item attachments — everyone can view and add; only the raiser or an Admin removes */}
              <div className="px-3 pb-2">
                <label className={lbl}>
                  Attachments ({fileCountOf(it.item_uid)}/{ITEM_FILE_LIMITS.maxPerItem}) — PDF, image, Word or Excel · max 5 MB each
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {savedFilesOf(it.item_uid).map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1 rounded border border-[#E5E7EB] bg-white px-1.5 py-px text-[11px]">
                      <button
                        type="button"
                        className="max-w-[160px] truncate text-[#4F46E5] hover:underline"
                        title={`Download ${a.original_name}`}
                        onClick={() => downloadAttachment(api.itemAttachmentDownloadPath(a.id), a.original_name)}
                      >
                        {a.original_name}
                      </button>
                      <button type="button" className="text-[#9CA3AF] hover:text-[#DC2626]" title="Remove" onClick={() => dropSavedFile(a)}>✕</button>
                    </span>
                  ))}
                  {heldFilesOf(it.item_uid).map((f, x) => (
                    <span key={`${f.name}-${x}`} className="inline-flex items-center gap-1 rounded border border-dashed border-[#C7D2FE] bg-[#EEF2FF] px-1.5 py-px text-[11px] text-[#4338CA]">
                      <span className="max-w-[160px] truncate" title={`${f.name} — uploads when the PR is saved`}>{f.name}</span>
                      <button type="button" className="text-[#9CA3AF] hover:text-[#DC2626]" title="Remove" onClick={() => dropHeldFile(it.item_uid, x)}>✕</button>
                    </span>
                  ))}
                  {fileCountOf(it.item_uid) < ITEM_FILE_LIMITS.maxPerItem && (
                    <label className="cursor-pointer rounded border border-[#E5E7EB] bg-white px-2 py-px text-[11px] font-semibold text-[#4F46E5] hover:bg-[#F5F3FF]">
                      + Attach
                      <input
                        type="file"
                        multiple
                        accept={ITEM_FILE_ACCEPT}
                        className="hidden"
                        onChange={(e) => { pickItemFiles(it.item_uid, e.target.files); e.target.value = ""; }}
                      />
                    </label>
                  )}
                </div>
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
  // FIC shouldn't send stock to themselves — hide "Send stock to FIC" for that role.
  const pSendFic = (!!perms.send_to_fic || isAdmin) && user.role !== "Factory In-charge";
  const [items, setItems] = useState(pr.items.map((it) => ({ ...it })));
  const [tab, setTab] = useState("details");
  useEffect(() => { setItems(pr.items.map((it) => ({ ...it }))); }, [pr]);
  // Stays open through PO_RAISED too: a PR with both buy + stock items needs BOTH
  // "Generate Buy PO" and "Send stock to FIC", and generating the buy PO flips the
  // status to PO_RAISED. Closing the section there would strand the stock portion.
  const assignMode = (pAssign || pGenerate || pSendFic) && ["APPROVED", "PO_RAISED"].includes(pr.status);
  // Buy-line supplier/price stay editable only until the Buy PO is generated —
  // after that the section is still open purely so the stock half can be sent.
  const canEditBuy = assignMode && !pr.buy_po_created;

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
  // A summed Buy total only makes sense in one currency. Show the shared currency
  // when every buy line agrees; otherwise fall back to SGD (mixed currencies can't
  // be added, so the figure is indicative only).
  const buyCurrencies = [...new Set(items.filter((it) => Number(it.buy_qty) > 0).map((it) => it.currency || "SGD"))];
  const buyCurrency = buyCurrencies.length === 1 ? buyCurrencies[0] : "SGD";
  const th = "border-b border-[#E5E7EB] px-2.5 py-2 text-left text-[10px] font-bold uppercase text-[#9CA3AF]";
  const td = "border-b border-[#F3F4F6] px-2.5 py-2";

  // Colour + Remark belong to the item, not to the stock/buy split — so a buy row
  // that follows a stock row leaves them blank, the same way it blanks the code.
  const attrCells = (it, blank) => (
    <>
      <td className={td}>{blank ? "—" : (it.colour || "—")}</td>
      <td className={td}>
        {!blank && it.remarks
          ? <span className="block max-w-[248px] whitespace-normal break-words" title={it.remarks}>{it.remarks}</span>
          : "—"}
      </td>
    </>
  );

  const cols = ["Code", "Description", "Colour", "Remark", "Total", "Stock", "Stock status", "Buy", "Supplier",
    ...(canSeePrice ? ["Unit price", "Amount"] : [])];

  const meta = [["Status", <Badge status={pr.status} />], ["Job", pr.job_no], ["Project", pr.project_name || "—"],
    ["Location", pr.location || "—"],
    ["Requested by", pr.requested_by], ["Required", pr.date_required || "—"], ["Date issued", fmtDate(pr.date_issued) || "—"], ["Approved by", pr.approved_by || "—"]];

  return (
    <Modal wide title={`Purchase request ${pr.pr_no}`} onClose={onClose}>
      {/* Details / History tabs — history is read-only (DR-AUD-004) */}
      <div className="mb-4 flex gap-1 border-b border-[#E5E7EB]">
        {[["details", "Details"], ["history", "History"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-[13px] font-semibold transition ${
              tab === id ? "border-[#6366F1] text-[#4F46E5]" : "border-transparent text-[#9CA3AF] hover:text-[#6B7280]"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "history" && <AuditTrail kind="pr" no={pr.pr_no} />}

      {tab === "details" && (<>
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
          <thead><tr>{cols.map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
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
                    {attrCells(it, false)}
                    <td className={td}>{it.stock_qty}</td>
                    <td className={td}>{it.stock_qty} <span className="text-[11px] text-[#9CA3AF]">@ {it.stock_location}</span></td>
                    <td className={td}>
                      {/* FIC issues this line by receiving its STOCK PO on the
                          Purchase Orders screen — no per-item action here. */}
                      <Badge status={it.stock_status} />
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
                    {attrCells(it, hasStock)}
                    <td className={td}>{it.buy_qty}</td>
                    <td className={td}>—</td>
                    <td className={td}>—</td>
                    <td className={td}>{it.buy_qty}</td>
                    <td className={`${td} min-w-[160px]`}>
                      {canEditBuy ? (
                        <Select value={it.supplier_id || ""} onChange={(e) => setIt(i, "supplier_id", e.target.value)}>
                          <option value="">— choose —</option>
                          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </Select>
                      ) : (it.supplier_name || "—")}
                    </td>
                    {canSeePrice && (
                      <td className={`${td} w-[150px] min-w-[150px]`}>
                        {canEditBuy ? (
                          <div className="flex items-center gap-1.5">
                            <Select value={it.currency || "SGD"} onChange={(e) => setIt(i, "currency", e.target.value)} className="!w-[64px] shrink-0 !px-1.5">
                              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </Select>
                            <Input type="number" min="0" step="0.01" value={it.unit_price || ""} onChange={(e) => setIt(i, "unit_price", e.target.value)} className={`!w-auto min-w-0 flex-1 ${Number(it.unit_price) > 0 ? "" : "!border-[#DC2626]"}`} placeholder="0.00" />
                          </div>
                        ) : curMoney(it.unit_price, it.currency)}
                      </td>
                    )}
                    {canSeePrice && <td className={td}>{curMoney((Number(it.buy_qty) || 0) * (Number(it.unit_price) || 0), it.currency)}</td>}
                  </tr>
                );
              }
              // neither (shouldn't happen) — show a plain row
              if (!hasStock && !hasBuy) {
                rows.push(
                  <tr key={`${it.id}-n`}>
                    <td className={`${td} font-mono`}>{it.profile_code || "—"}</td>
                    <td className={td}>{it.description}</td>
                    {attrCells(it, false)}
                    <td className={td}>{it.qty}</td>
                    <td className={td} colSpan={cols.length - 5}>—</td>
                  </tr>
                );
              }
              return rows;
            })}
          </tbody>
          {canSeePrice && (
            <tfoot>
              <tr><td colSpan={cols.length - 1} className="px-2.5 py-2.5 text-right font-bold text-[#6B7280]">Buy total{buyCurrencies.length > 1 ? " (mixed currencies)" : ""}</td><td className="px-2.5 py-2.5 font-extrabold text-[#1E1B4B]">{curMoney(total, buyCurrency)}</td></tr>
              <tr><td colSpan={cols.length - 1} className="px-2.5 py-1 text-right text-[12px] text-[#6B7280]">Stock value</td><td className="px-2.5 py-1 text-[12px] font-semibold text-[#6366F1]">{money(stockTotal)}</td></tr>
            </tfoot>
          )}
        </table>
      </div>

      {pr.remarks && <div className="mt-3 text-[13px] text-[#6B7280]">Remarks: {pr.remarks}</div>}

      {/* Per-item links & files — read-only mirror of what the drafter attached to each line.
          Grouped by item_uid so a material split across a stock + buy row shows once. */}
      {(() => {
        const seen = new Set();
        const perItem = [];
        for (const it of items) {
          const uid = it.item_uid;
          if (!uid || seen.has(uid)) continue;
          seen.add(uid);
          const files = (pr.item_attachments || []).filter((a) => a.item_uid === uid);
          const link = (it.onedrive_url || "").trim();
          if (!link && !files.length) continue;
          perItem.push({ it, link, files });
        }
        if (!perItem.length) return null;
        return (
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">Item links &amp; files</div>
            <div className="space-y-1.5">
              {perItem.map(({ it, link, files }) => (
                <div key={it.item_uid} className="rounded-lg border border-[#F3F4F6] px-3 py-2">
                  <div className="mb-1 text-[12.5px] font-semibold text-[#374151]">{it.description || it.profile_code || "Item"}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded border border-[#E5E7EB] bg-white px-1.5 py-px text-[11px] text-[#4F46E5] hover:underline"
                        title={link}>
                        🔗 OneDrive link
                      </a>
                    )}
                    {files.map((a) => (
                      <button key={a.id} type="button"
                        className="inline-flex max-w-[200px] items-center gap-1 truncate rounded border border-[#E5E7EB] bg-white px-1.5 py-px text-[11px] text-[#4F46E5] hover:underline"
                        title={`Download ${a.original_name}`}
                        onClick={() => downloadAttachment(api.itemAttachmentDownloadPath(a.id), a.original_name)}>
                        {a.original_name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Whole-PR attachments — view, add, remove */}
      <div className="mt-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">Attachments</div>
        <PRAttachments pr={pr} notify={notify} onChanged={() => onChanged(pr)} />
      </div>

      {assignMode && (
        <RfqPanel pr={pr} user={user} items={items} suppliers={suppliers}
          canEditBuy={canEditBuy} busy={busy} act={act} notify={notify} />
      )}
      </>)}

      {tab === "details" && (
      <div className="mt-5 flex justify-end gap-2.5">
        <Btn variant="soft" onClick={() => exportPrPdf(pr).catch((e) => notify(apiError(e), "error"))}>⬇ PDF</Btn>
        {(pApprove || pReject) && pr.status === "PENDING" && (
          <>
            {pReject && <Btn variant="danger" onClick={onReject} disabled={busy}>Reject / send back</Btn>}
            {pApprove && <Btn variant="success" disabled={busy} onClick={() => act(() => api.approvePR(pr.pr_no, user.name), `${pr.pr_no} approved`)}>Approve</Btn>}
          </>
        )}
        {/* Edit & resubmit is the drafter's action — hide it from approvers (Manager/Admin) */}
        {canCreate && !pApprove && !pReject && pr.status === "SEND_BACK" && <Btn onClick={onEdit} disabled={busy}>Edit &amp; resubmit</Btn>}
        {/* A sent-back PR is with the drafter; approvers just wait for the resubmission */}
        {(pApprove || pReject) && pr.status === "SEND_BACK" && (
          <span className="self-center text-[12.5px] text-[#6B7280]">Awaiting drafter’s resubmission</span>
        )}
        {assignMode && (() => {
          const hasStock = items.some((it) => Number(it.stock_qty) > 0);
          const hasBuy = items.some((it) => Number(it.buy_qty) > 0);
          const anyAwaiting = items.some((it) => Number(it.stock_qty) > 0 && it.stock_status === "AWAITING_PURCHASER");
          const buyItems = items.filter((it) => Number(it.buy_qty) > 0);
          const allBuyHaveSupplier = buyItems.every((it) => it.supplier_id);
          const allBuyHavePrice = buyItems.every((it) => Number(it.unit_price) > 0);
          // A quotation must be requested from every buy supplier before the PO can be raised.
          const allBuyQuoted = buyItems.every((it) => it.quote_requested_at);
          const firstUnquoted = buyItems.find((it) => it.supplier_id && !it.quote_requested_at);
          const saveAssign = async () => api.assignItems(pr.pr_no, buyItems.map((it) => ({ id: it.id, supplier_id: it.supplier_id || null, supplier_name: it.supplier_name, unit_price: Number(it.unit_price) || 0, currency: it.currency || "SGD" })));
          // Each half is "done" once its own PO exists. A PR with both halves needs
          // BOTH actions — the buttons below only disappear once each is truly done.
          const buyPending = hasBuy && !pr.buy_po_created;
          const stockPending = hasStock && anyAwaiting && !pr.stock_po_created;
          const showSendFic = pSendFic && stockPending;
          const showGenerate = pGenerate && buyPending;
          return (
            <>
              {/* Remind the purchaser that a mixed PR isn't finished until both the
                  Buy PO is generated AND the stock is sent to the Factory In-charge. */}
              {buyPending && stockPending && (
                <div className="mr-auto self-center text-[12px] font-medium text-[#B45309]">
                  This PR has both buy and stock items — complete <b>both</b>: Generate Buy PO <i>and</i> Send stock to FIC.
                </div>
              )}
              {canEditBuy && <Btn variant="soft" disabled={busy} onClick={() => act(saveAssign, "Saved")}>Save prices</Btn>}
              {showSendFic && (
                <Btn variant="warning" disabled={busy} onClick={() => {
                  if (buyPending && !window.confirm("Stock will be sent to the Factory In-charge and the Stock PO created.\n\nYou still have buy items — remember to click \"Generate Buy PO\" as well.\n\nContinue?")) return;
                  act(async () => { await saveAssign(); await api.sendToFic(pr.pr_no); }, "Stock info sent to Factory In-charge — Stock PO created");
                }}>Send stock to FIC</Btn>
              )}
              {showGenerate && (
                <Btn disabled={busy || !allBuyHaveSupplier || !allBuyQuoted || !allBuyHavePrice}
                  title={!allBuyHaveSupplier ? "Assign a supplier to every buy item first"
                    : !allBuyQuoted ? `Request a quotation from ${firstUnquoted?.supplier_name || "every supplier"} before generating the PO`
                    : !allBuyHavePrice ? "Enter a unit price (> 0) for every buy item first" : ""}
                  onClick={() => {
                    if (stockPending && !window.confirm("The Buy PO will be created.\n\nYou still have stock items awaiting the Factory In-charge — remember to click \"Send stock to FIC\" as well, or the Stock PO won't be created.\n\nContinue?")) return;
                    act(async () => {
                      if (!allBuyHavePrice) throw new Error("Enter a unit price for every buy item before generating the PO");
                      await saveAssign();
                      const r = await api.generatePOs(pr.pr_no);
                      notify(`${r.created_pos.length} Buy PO(s) created: ${r.created_pos.join(", ")}`, "success");
                    });
                  }}>Generate Buy PO</Btn>
              )}
            </>
          );
        })()}
      </div>
      )}
    </Modal>
  );
}

// ── Request for Quotation panel ─────────────────────────────────────────────
// Groups the PR's buy lines by supplier (one RFQ = one supplier). Each group can
// export a Quotation Request (PDF / Excel, blank price column) and be marked as
// "requested" — which is the gate that unlocks Generate Buy PO. A supplier line
// with no supplier assigned yet is listed but can't be quoted.
function RfqPanel({ pr, user, items, suppliers, canEditBuy, busy, act, notify }) {
  const buyItems = items.filter((it) => Number(it.buy_qty) > 0);
  // Once the Buy PO exists the RFQ step is done — the panel is only for the pre-PO stage.
  if (!buyItems.length || pr.buy_po_created) return null;

  const groups = {};
  for (const it of buyItems) {
    if (!it.supplier_id) continue;
    const k = String(it.supplier_id);
    (groups[k] ||= { supplier_id: it.supplier_id, supplier_name: it.supplier_name, currency: it.currency || "SGD", items: [] }).items.push(it);
  }
  const groupList = Object.values(groups);
  const unassignedCount = buyItems.filter((it) => !it.supplier_id).length;
  const isRequested = (g) => g.items.every((it) => it.quote_requested_at);
  const allRequested = groupList.length > 0 && groupList.every(isRequested);

  // Persist any unsaved supplier/price edits before hitting the server (mirrors the
  // Generate-PO flow), so request-quote sees the assignment the user just made.
  const saveAssign = () => api.assignItems(pr.pr_no, buyItems.map((it) => ({
    id: it.id, supplier_id: it.supplier_id || null, supplier_name: it.supplier_name,
    unit_price: Number(it.unit_price) || 0, currency: it.currency || "SGD",
  })));

  const docGroup = (g) => ({
    pr_no: pr.pr_no, job_no: pr.job_no, project_name: pr.project_name, prepared_by: user.name,
    currency: g.currency,
    supplier: suppliers.find((s) => String(s.id) === String(g.supplier_id)) || { name: g.supplier_name },
    items: g.items.map((it) => ({ description: it.description, colour: it.colour, qty: it.buy_qty, unit: it.unit })),
  });

  const exportPdf = (g) => exportRfqPdf(docGroup(g)).catch((e) => notify(apiError(e), "error"));
  const exportExcel = (g) => exportRfqExcel(docGroup(g)).catch((e) => notify(apiError(e), "error"));

  const requestOne = (g) => act(async () => {
    if (canEditBuy) await saveAssign();
    await api.requestQuote(pr.pr_no, { supplierId: g.supplier_id });
    await exportPdf(g); // hand the purchaser the document to send
  }, `Quotation requested from ${g.supplier_name}`);

  const requestAll = () => act(async () => {
    if (canEditBuy) await saveAssign();
    await api.requestQuote(pr.pr_no, { all: true });
    for (const g of groupList) await exportPdf(g); // one form per supplier
  }, `Quotation requested from ${groupList.length} supplier(s)`);

  return (
    <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] font-extrabold text-[#1E1B4B]">📄 Request for Quotation</span>
        {groupList.length > 1 && (
          <Btn variant="soft" small disabled={busy || allRequested} onClick={requestAll}
            title={allRequested ? "All suppliers already requested" : "Generate every supplier's form and mark all as requested"}>
            Request all quotes
          </Btn>
        )}
      </div>

      {groupList.length === 0 ? (
        <div className="text-[12.5px] text-[#9CA3AF]">Assign a supplier to the buy items above to request quotations.</div>
      ) : (
        <div className="grid gap-2">
          {groupList.map((g) => {
            const req = isRequested(g);
            return (
              <div key={g.supplier_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2">
                <div className="mr-auto min-w-[180px]">
                  <div className="text-[13.5px] font-semibold text-[#374151]">{g.supplier_name || "—"}</div>
                  <div className="text-[11px] text-[#9CA3AF]">{g.items.length} item{g.items.length > 1 ? "s" : ""} · {g.currency}</div>
                </div>
                {req
                  ? <span className="rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-bold text-[#059669] border border-[#B7E9CF]">✓ Quote requested</span>
                  : <span className="rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[11px] font-bold text-[#D97706] border border-[#F5D98A]">○ Not requested</span>}
                <Btn variant="ghost" small disabled={busy} onClick={() => exportExcel(g)}>⬇ Excel</Btn>
                <Btn variant="ghost" small disabled={busy} onClick={() => exportPdf(g)}>⬇ PDF</Btn>
                <Btn variant={req ? "soft" : undefined} small disabled={busy} onClick={() => requestOne(g)}
                  title={req ? "Re-send / re-export this supplier's quotation request" : "Mark quote requested and download the form to send"}>
                  {req ? "Re-request" : "Request Quote"}
                </Btn>
              </div>
            );
          })}
          {unassignedCount > 0 && (
            <div className="text-[11.5px] text-[#B45309]">{unassignedCount} buy item(s) still need a supplier before you can request a quote or generate the PO.</div>
          )}
        </div>
      )}
    </div>
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
