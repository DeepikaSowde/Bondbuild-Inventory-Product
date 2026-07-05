// frontend/src/pages/Dashboard.jsx
// The /dashboard page — title + live per-project PR/PO cards, ALL IN ONE FILE.
// Fetches its own data from the backend using your existing services/api.js
// (login token handled automatically). No other dashboard file needed.
import { useEffect, useState } from "react";
import api from "../services/api";
import * as XLSX from "xlsx";

// S$ formatter: 2400 -> "2.4k", 420 -> "420"
function money(n) {
  const v = Number(n) || 0;
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(v));
}

function Stat({ label, value, color }) {
  return (
    <div className="rounded-lg bg-white py-2 text-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="text-[18px] font-extrabold" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-[#9CA3AF]">{label}</div>
    </div>
  );
}

function QField({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-bold text-[#6B7280]">{label}</div>
      {children}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg bg-[#F8F7FF] px-3 py-2">
      <div className="text-[10px] uppercase text-[#9CA3AF]">{label}</div>
      <div className="text-[13px] font-semibold text-[#1E1B4B]">
        {value ?? "—"}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    PENDING: "bg-[#FEF3C7] text-[#92400E]",
    APPROVED: "bg-[#D1FAE5] text-[#065F46]",
    REJECTED: "bg-[#FEE2E2] text-[#991B1B]",
    SEND_BACK: "bg-[#FEF3C7] text-[#92400E]",
    PO_RAISED: "bg-[#E0E7FF] text-[#3730A3]",
    OPEN: "bg-[#D1FAE5] text-[#065F46]",
    CLOSED: "bg-[#E5E7EB] text-[#374151]",
    CANCELLED: "bg-[#FEE2E2] text-[#991B1B]",
  };
  const cls = map[status] || "bg-[#E5E7EB] text-[#374151]";
  return (
    <span
      className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-bold ${cls}`}
    >
      {status}
    </span>
  );
}

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [byJob, setByJob] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null); // open project detail
  const [detailLoading, setDetailLoading] = useState(false);
  const [options, setOptions] = useState({
    projects: [],
    prs: [],
    pos: [],
    suppliers: [],
  });
  const [filterJob, setFilterJob] = useState(""); // Quick View: project filter
  const [lists, setLists] = useState({ prs: [], pos: [], suppliers: [] });

  useEffect(() => {
    api
      .get("/dashboard-options")
      .then((r) =>
        setOptions(
          r.data?.data || { projects: [], prs: [], pos: [], suppliers: [] },
        ),
      )
      .catch(() => {});
    api
      .get("/dashboard-lists")
      .then((r) =>
        setLists(r.data?.data || { prs: [], pos: [], suppliers: [] }),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const [projRes, statsRes] = await Promise.all([
          api.get("/po-projects"),
          api.get("/dashboard-stats"),
        ]);
        if (!alive) return;
        setProjects(projRes.data?.data || []);
        setByJob(statsRes.data?.data?.by_job || {});
      } catch (e) {
        if (alive)
          setError(e?.response?.data?.error || "Failed to load dashboard data");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const openDetail = async (jobNo) => {
    setDetailLoading(true);
    setDetail({ loading: true, job_no: jobNo, kind: "project" });
    try {
      const r = await api.get(`/dashboard-stats/${encodeURIComponent(jobNo)}`);
      setDetail({ ...(r.data?.data || {}), kind: "project" });
    } catch (e) {
      setDetail({
        error: e?.response?.data?.error || "Failed to load project",
        kind: "project",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const openPR = async (prNo) => {
    if (!prNo) return;
    setDetail({ loading: true, kind: "pr", pr_no: prNo });
    try {
      const r = await api.get(`/dashboard-pr/${encodeURIComponent(prNo)}`);
      setDetail({ ...(r.data?.data || {}), kind: "pr" });
    } catch (e) {
      setDetail({
        error: e?.response?.data?.error || "Failed to load PR",
        kind: "pr",
      });
    }
  };
  const openPO = async (poNo) => {
    if (!poNo) return;
    setDetail({ loading: true, kind: "po", po_no: poNo });
    try {
      const r = await api.get(`/dashboard-po/${encodeURIComponent(poNo)}`);
      setDetail({ ...(r.data?.data || {}), kind: "po" });
    } catch (e) {
      setDetail({
        error: e?.response?.data?.error || "Failed to load PO",
        kind: "po",
      });
    }
  };
  const openSupplier = async (name) => {
    if (!name) return;
    setDetail({ loading: true, kind: "supplier", supplier_name: name });
    try {
      const r = await api.get(
        `/dashboard-supplier/${encodeURIComponent(name)}`,
      );
      setDetail({ ...(r.data?.data || {}), kind: "supplier" });
    } catch (e) {
      setDetail({
        error: e?.response?.data?.error || "Failed to load supplier",
        kind: "supplier",
      });
    }
  };

  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    setExporting(true);
    try {
      // gather everything fresh from the backend
      const [optsRes, statsRes] = await Promise.all([
        api.get("/dashboard-options"),
        api.get("/dashboard-stats"),
      ]);
      const opts = optsRes.data?.data || {};
      const stats = statsRes.data?.data?.by_job || {};

      // Sheet 1 — Projects summary (from stats)
      const projectRows = (opts.projects || []).map((p) => {
        const s = stats[p.job_no] || {};
        return {
          "Job No": p.job_no,
          Project: p.project_name,
          PRs: s.pr_count || 0,
          POs: s.po_count || 0,
          "Open POs": s.po_open || 0,
          "Total Value (S$)": s.po_value || 0,
        };
      });

      // Sheet 2 — Purchase Requests
      const prRows = (opts.prs || []).map((r) => ({
        "PR No": r.pr_no,
        "Job No": r.job_no,
        Project: r.project_name,
      }));

      // Sheet 3 — Purchase Orders
      const poRows = (opts.pos || []).map((o) => ({
        "PO No": o.po_no,
        "Job No": o.job_no,
        Type: o.po_type === "STOCK" ? "Stock" : "Buy",
        Supplier: o.supplier_name || "",
      }));

      // Sheet 4 — Suppliers
      const supRows = (opts.suppliers || []).map((s) => ({ Supplier: s }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(projectRows),
        "Projects",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(prRows),
        "Purchase Requests",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(poRows),
        "Purchase Orders",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(supRows),
        "Suppliers",
      );

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Dashboard_${today}.xlsx`);
    } catch (e) {
      alert("Export failed: " + (e?.response?.data?.error || e.message));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F6FA] p-6">
      {/* Title */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1E1B4B]">Dashboard</h1>
          <p className="text-[13px] text-[#6B7280]">
            PR/PO overview by project
          </p>
        </div>
        <button
          onClick={exportExcel}
          disabled={exporting}
          className="rounded-lg bg-[#1E1B4B] px-4 py-2 text-[14px] font-bold text-white hover:bg-[#2D2A5C] disabled:opacity-60"
        >
          {exporting ? "Exporting…" : "⬇ Export Dashboard"}
        </button>
      </div>

      {/* Quick View */}
      <div className="mb-5 rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-[14px] font-extrabold text-[#1E1B4B]">
          ⚡ Quick View
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QField label="📋 Project">
            <select
              value={filterJob}
              onChange={(e) => setFilterJob(e.target.value)}
              className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-[14px]"
            >
              <option value="">— All projects —</option>
              {options.projects.map((p) => (
                <option key={p.job_no} value={p.job_no}>
                  {p.job_no} — {p.project_name}
                </option>
              ))}
            </select>
          </QField>
          <QField label="📝 Purchase Request">
            <select
              value=""
              onChange={(e) => openPR(e.target.value)}
              className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-[14px]"
            >
              <option value="">— Select PR —</option>
              {options.prs.map((p) => (
                <option key={p.pr_no} value={p.pr_no}>
                  {p.pr_no} — {p.project_name || p.job_no}
                </option>
              ))}
            </select>
          </QField>
          <QField label="🛒 Purchase Order">
            <select
              value=""
              onChange={(e) => openPO(e.target.value)}
              className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-[14px]"
            >
              <option value="">— Select PO —</option>
              {options.pos.map((p) => (
                <option key={p.po_no} value={p.po_no}>
                  {p.po_no} ({p.po_type === "STOCK" ? "Stock" : "Buy"})
                </option>
              ))}
            </select>
          </QField>
          <QField label="🤝 Supplier">
            <select
              value=""
              onChange={(e) => openSupplier(e.target.value)}
              className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-[14px]"
            >
              <option value="">— Select Supplier —</option>
              {options.suppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </QField>
        </div>
      </div>

      {/* Cards panel */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏗️</span>
            <span className="text-[15px] font-extrabold text-[#1E1B4B]">
              Projects
            </span>
            <span className="text-[13px] text-[#9CA3AF]">
              ({projects.length})
            </span>
          </div>
          <span className="text-[12px] text-[#9CA3AF]">
            Click a card to view details
          </span>
        </div>

        {loading ? (
          <div className="py-10 text-center text-[#9CA3AF]">
            Loading projects…
          </div>
        ) : error ? (
          <div className="py-10 text-center text-[#DC2626]">{error}</div>
        ) : projects.length === 0 ? (
          <div className="py-10 text-center text-[#9CA3AF]">
            No projects yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {projects
              .filter((p) => !filterJob || p.job_no === filterJob)
              .map((p) => {
                const st = byJob[p.job_no] || {
                  pr_count: 0,
                  po_count: 0,
                  po_value: 0,
                  po_open: 0,
                };
                return (
                  <div
                    key={p.job_no}
                    onClick={() => openDetail(p.job_no)}
                    className="cursor-pointer rounded-xl border border-[#E5E7EB] bg-[#FAFAFF] p-4 transition hover:border-[#C7D2FE] hover:shadow-sm"
                  >
                    <div className="mb-1 flex items-start justify-between">
                      <span className="text-[13px] font-bold text-[#6366F1]">
                        {p.job_no}
                      </span>
                      {st.po_open > 0 && (
                        <span className="text-[12px] font-semibold text-[#059669]">
                          {st.po_open} open
                        </span>
                      )}
                    </div>
                    <div className="mb-3 line-clamp-2 min-h-[40px] text-[15px] font-extrabold uppercase leading-tight text-[#1E1B4B]">
                      {p.project_name}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Stat label="PRs" value={st.pr_count} color="#6366F1" />
                      <Stat label="POs" value={st.po_count} color="#1E1B4B" />
                      <Stat
                        label="S$"
                        value={money(st.po_value)}
                        color="#D97706"
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* ── Purchase Requests list ── */}
      <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📝</span>
            <span className="text-[15px] font-extrabold text-[#1E1B4B]">
              Purchase Requests
            </span>
            <span className="text-[13px] text-[#9CA3AF]">
              ({lists.prs.length})
            </span>
          </div>
          <span className="text-[12px] text-[#9CA3AF]">
            Sorted by latest — click to view
          </span>
        </div>
        {lists.prs.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-[#9CA3AF]">
            No purchase requests.
          </div>
        ) : (
          <div className="max-h-[320px] divide-y divide-[#F3F4F6] overflow-y-auto">
            {lists.prs.map((pr) => (
              <button
                key={pr.pr_no}
                onClick={() => openPR(pr.pr_no)}
                className="flex w-full items-center gap-3 px-2 py-3 text-left hover:bg-[#F8F7FF]"
              >
                <span className="font-mono text-[14px] font-bold text-[#6366F1]">
                  {pr.pr_no}
                </span>
                <span className="text-[13px] text-[#6B7280]">
                  {pr.requested_by || "—"}
                </span>
                <span className="text-[12px] text-[#9CA3AF]">
                  {pr.item_count} items
                </span>
                <span className="flex-1" />
                <span className="text-[12px] text-[#9CA3AF]">
                  {(pr.date_issued || pr.created_at || "")
                    .toString()
                    .slice(0, 10)}
                </span>
                <StatusBadge status={pr.status} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Purchase Orders list ── */}
      <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🛒</span>
            <span className="text-[15px] font-extrabold text-[#1E1B4B]">
              Purchase Orders
            </span>
            <span className="text-[13px] text-[#9CA3AF]">
              ({lists.pos.length})
            </span>
          </div>
          <span className="text-[12px] text-[#9CA3AF]">
            Sorted by latest — click to view
          </span>
        </div>
        {lists.pos.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-[#9CA3AF]">
            No purchase orders.
          </div>
        ) : (
          <div className="max-h-[340px] divide-y divide-[#F3F4F6] overflow-y-auto">
            {lists.pos.map((po) => (
              <button
                key={po.po_no}
                onClick={() => openPO(po.po_no)}
                className="flex w-full items-center gap-3 px-2 py-3 text-left hover:bg-[#F8F7FF]"
              >
                <span className="font-mono text-[13px] font-bold text-[#6366F1]">
                  {po.po_no}
                </span>
                <span className="text-[12px] font-semibold uppercase text-[#1E1B4B]">
                  {po.project_name || po.job_no}
                </span>
                <span className="text-[12px] text-[#6B7280]">
                  {po.po_type === "STOCK"
                    ? po.source_location || "From stock"
                    : po.supplier_name || "—"}
                </span>
                <span className="flex-1" />
                {po.amount > 0 && (
                  <span className="text-[13px] font-bold text-[#1E1B4B]">
                    S${Number(po.amount).toFixed(0)}
                  </span>
                )}
                <span className="text-[12px] text-[#9CA3AF]">
                  {(po.created_at || "").toString().slice(0, 10)}
                </span>
                <StatusBadge status={po.status} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Suppliers cards ── */}
      <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤝</span>
            <span className="text-[15px] font-extrabold text-[#1E1B4B]">
              Suppliers
            </span>
            <span className="text-[13px] text-[#9CA3AF]">
              ({lists.suppliers.length})
            </span>
          </div>
          <span className="text-[12px] text-[#9CA3AF]">
            Click to view details
          </span>
        </div>
        {lists.suppliers.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-[#9CA3AF]">
            No suppliers yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {lists.suppliers.map((s) => (
              <button
                key={s.supplier_name}
                onClick={() => openSupplier(s.supplier_name)}
                className="rounded-xl border border-[#D1FAE5] bg-[#F0FDF4] p-4 text-left transition hover:border-[#6EE7B7] hover:shadow-sm"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <span className="text-[14px] font-extrabold uppercase leading-tight text-[#065F46]">
                    {s.supplier_name}
                  </span>
                  <span className="shrink-0 rounded bg-[#D1FAE5] px-1.5 py-0.5 text-[10px] font-semibold text-[#059669]">
                    {s.supplier_type}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="POs" value={s.po_count} color="#0891B2" />
                  <Stat label="Open" value={s.po_open} color="#059669" />
                  <Stat label="S$" value={money(s.po_value)} color="#D97706" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Project / PR / PO / Supplier detail modal */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
        >
          <div
            className="mt-4 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="text-[13px] font-bold text-[#6366F1]">
                  {detail.kind === "project" &&
                    (detail.job_no || detail.project?.job_no)}
                  {detail.kind === "pr" && (detail.pr?.pr_no || detail.pr_no)}
                  {detail.kind === "po" && (detail.po?.po_no || detail.po_no)}
                  {detail.kind === "supplier" && "Supplier"}
                </div>
                <h2 className="text-xl font-extrabold uppercase text-[#1E1B4B]">
                  {detail.kind === "project" &&
                    (detail.project?.project_name || "Project")}
                  {detail.kind === "pr" &&
                    (detail.pr?.project_name || "Purchase Request")}
                  {detail.kind === "po" &&
                    (detail.po?.po_type === "STOCK"
                      ? "Stock PO"
                      : "Purchase Order")}
                  {detail.kind === "supplier" &&
                    (detail.supplier_name || "Supplier")}
                </h2>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="text-2xl leading-none text-[#9CA3AF] hover:text-[#1E1B4B]"
              >
                ×
              </button>
            </div>

            {detail.loading ? (
              <div className="py-10 text-center text-[#9CA3AF]">Loading…</div>
            ) : detail.error ? (
              <div className="py-10 text-center text-[#DC2626]">
                {detail.error}
              </div>
            ) : detail.kind === "pr" ? (
              <div>
                <div className="mb-3 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-3">
                  <Info label="Status" value={detail.pr?.status} />
                  <Info label="Requested by" value={detail.pr?.requested_by} />
                  <Info label="Job No" value={detail.pr?.job_no} />
                </div>
                <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#9CA3AF]">
                  Items ({detail.items?.length || 0})
                </div>
                <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
                  <table className="w-full text-left text-[13px]">
                    <thead className="bg-[#F8F7FF] text-[11px] uppercase text-[#6B7280]">
                      <tr>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Stock</th>
                        <th className="px-3 py-2">Buy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.items || []).map((it) => (
                        <tr key={it.id} className="border-t border-[#F3F4F6]">
                          <td className="px-3 py-2">{it.description}</td>
                          <td className="px-3 py-2">{it.qty}</td>
                          <td className="px-3 py-2">
                            {Number(it.stock_qty) > 0 ? it.stock_qty : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {Number(it.buy_qty) > 0 ? it.buy_qty : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : detail.kind === "po" ? (
              <div>
                <div className="mb-3 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-3">
                  <Info
                    label="Type"
                    value={detail.po?.po_type === "STOCK" ? "Stock" : "Buy"}
                  />
                  <Info
                    label="Supplier / Source"
                    value={
                      detail.po?.po_type === "STOCK"
                        ? detail.po?.source_location || "From stock"
                        : detail.po?.supplier_name || "—"
                    }
                  />
                  <Info label="Status" value={detail.po?.status} />
                  <Info
                    label="Amount"
                    value={"S$ " + Number(detail.po?.amount || 0).toFixed(2)}
                  />
                  <Info label="PR No" value={detail.po?.pr_no} />
                  <Info label="Job No" value={detail.po?.job_no} />
                </div>
                <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#9CA3AF]">
                  Items ({detail.items?.length || 0})
                </div>
                <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
                  <table className="w-full text-left text-[13px]">
                    <thead className="bg-[#F8F7FF] text-[11px] uppercase text-[#6B7280]">
                      <tr>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2 text-right">Unit price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.items || []).map((it) => (
                        <tr key={it.id} className="border-t border-[#F3F4F6]">
                          <td className="px-3 py-2">{it.description}</td>
                          <td className="px-3 py-2">{it.qty}</td>
                          <td className="px-3 py-2 text-right">
                            S$ {Number(it.unit_price || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : detail.kind === "supplier" ? (
              <div>
                <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#9CA3AF]">
                  Purchase Orders ({detail.pos?.length || 0})
                </div>
                {!detail.pos || detail.pos.length === 0 ? (
                  <div className="text-[13px] text-[#9CA3AF]">
                    No purchase orders for this supplier.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
                    <table className="w-full text-left text-[13px]">
                      <thead className="bg-[#F8F7FF] text-[11px] uppercase text-[#6B7280]">
                        <tr>
                          <th className="px-3 py-2">PO No</th>
                          <th className="px-3 py-2">Job</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.pos.map((po) => (
                          <tr
                            key={po.po_no}
                            className="border-t border-[#F3F4F6]"
                          >
                            <td className="px-3 py-2 font-mono font-semibold text-[#6366F1]">
                              {po.po_no}
                            </td>
                            <td className="px-3 py-2">{po.job_no}</td>
                            <td className="px-3 py-2">{po.status}</td>
                            <td className="px-3 py-2 text-right font-semibold">
                              S$ {Number(po.amount).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* PRs */}
                <div className="mb-5">
                  <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#9CA3AF]">
                    Purchase Requests ({detail.prs?.length || 0})
                  </div>
                  {!detail.prs || detail.prs.length === 0 ? (
                    <div className="text-[13px] text-[#9CA3AF]">
                      No purchase requests.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
                      <table className="w-full text-left text-[13px]">
                        <thead className="bg-[#F8F7FF] text-[11px] uppercase text-[#6B7280]">
                          <tr>
                            <th className="px-3 py-2">PR No</th>
                            <th className="px-3 py-2">Requested by</th>
                            <th className="px-3 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.prs.map((pr) => (
                            <tr
                              key={pr.pr_no}
                              className="border-t border-[#F3F4F6]"
                            >
                              <td className="px-3 py-2 font-mono font-semibold text-[#6366F1]">
                                {pr.pr_no}
                              </td>
                              <td className="px-3 py-2">
                                {pr.requested_by || "—"}
                              </td>
                              <td className="px-3 py-2">{pr.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* POs */}
                <div>
                  <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#9CA3AF]">
                    Purchase Orders ({detail.pos?.length || 0})
                  </div>
                  {!detail.pos || detail.pos.length === 0 ? (
                    <div className="text-[13px] text-[#9CA3AF]">
                      No purchase orders.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
                      <table className="w-full text-left text-[13px]">
                        <thead className="bg-[#F8F7FF] text-[11px] uppercase text-[#6B7280]">
                          <tr>
                            <th className="px-3 py-2">PO No</th>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2">Supplier / Source</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.pos.map((po) => (
                            <tr
                              key={po.po_no}
                              className="border-t border-[#F3F4F6]"
                            >
                              <td className="px-3 py-2 font-mono font-semibold text-[#6366F1]">
                                {po.po_no}
                              </td>
                              <td className="px-3 py-2">
                                {po.po_type === "STOCK" ? "Stock" : "Buy"}
                              </td>
                              <td className="px-3 py-2">
                                {po.po_type === "STOCK"
                                  ? po.source_location || "From stock"
                                  : po.supplier_name || "—"}
                              </td>
                              <td className="px-3 py-2">{po.status}</td>
                              <td className="px-3 py-2 text-right font-semibold">
                                S$ {Number(po.amount).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
