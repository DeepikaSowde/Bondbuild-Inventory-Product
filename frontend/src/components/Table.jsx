// components/Table.jsx — Tailwind version
import { useState, useEffect } from "react";

// Pass `minWidth` (px) to keep the table from squeezing on narrow screens —
// the card then shows a horizontal scrollbar instead of cramming columns.
export function Table({ columns, children, minWidth }) {
  return (
    <div className={`rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.05)] ${minWidth ? "overflow-x-auto" : "overflow-hidden"}`}>
      <table className="w-full border-collapse" style={minWidth ? { minWidth } : undefined}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={`whitespace-nowrap border-b border-[#E5E7EB] bg-[#F9FAFB] px-[14px] py-3 text-[10.5px] font-bold uppercase tracking-wide text-[#9CA3AF] ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, mono, align, bold, className = "" }) {
  return (
    <td className={`border-b border-[#F3F4F6] px-[14px] py-[11px] text-[13px] text-[#374151]
      ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"}
      ${bold ? "font-bold" : ""} ${mono ? "font-mono whitespace-nowrap" : ""} ${className}`}>
      {children}
    </td>
  );
}

// Fixed-size client-side pagination (default 20 rows/page).
// Pass the full array and a resetKey (e.g. the active filter); get back the
// current page's slice plus the state needed to render <Pagination/>.
// Page resets to 1 whenever resetKey changes, and clamps if the list shrinks.
export function usePaged(items, resetKey, pageSize = 20) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const arr = Array.isArray(items) ? items : [];
  const total = arr.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const slice = arr.slice((current - 1) * pageSize, current * pageSize);
  return { page: current, setPage, slice, total, pageSize, pageCount };
}

function PgBtn({ children, disabled, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`rounded-lg border px-3 py-[5px] text-[12.5px] font-semibold transition-colors
        ${disabled ? "border-[#E5E7EB] bg-white text-[#D1D5DB] cursor-not-allowed"
                   : "border-[#E5E7EB] bg-white text-[#374151] hover:border-[#6366F1] cursor-pointer"}`}>
      {children}
    </button>
  );
}

// Pagination bar: "from–to of total" + Prev / page-number jump / Next.
// Renders nothing when there are no rows.
export function Pagination({ page, pageCount, total, pageSize, onPage }) {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const go = (p) => onPage(Math.min(Math.max(1, p), pageCount));
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-[12.5px] text-[#6B7280]">
      <span>{from}–{to} of {total}</span>
      <div className="flex items-center gap-1.5">
        <PgBtn disabled={page <= 1} onClick={() => go(page - 1)}>‹ Prev</PgBtn>
        <span className="flex items-center gap-1">
          Page
          <input
            type="number" min={1} max={pageCount} value={page}
            onChange={(e) => go(Number(e.target.value) || 1)}
            className="w-12 rounded-md border border-[#E5E7EB] px-2 py-[3px] text-center text-[12.5px] text-[#374151] focus:border-[#6366F1] focus:outline-none"
          />
          of {pageCount}
        </span>
        <PgBtn disabled={page >= pageCount} onClick={() => go(page + 1)}>Next ›</PgBtn>
      </div>
    </div>
  );
}

export function KPICard({ label, value, sub, color = "#6366F1", icon }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-2xl bg-white px-[22px] py-[18px] shadow-[0_1px_4px_rgba(0,0,0,0.07)]"
      style={{ border: `2px solid ${color}22` }}>
      <div className="mb-1.5 flex items-center gap-2.5">
        {icon && <span className="text-xl">{icon}</span>}
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">{label}</span>
      </div>
      <div className="text-[26px] font-extrabold" style={{ color }}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[#9CA3AF]">{sub}</div>}
    </div>
  );
}
