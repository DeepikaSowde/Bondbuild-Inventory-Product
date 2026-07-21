// components/ui.jsx — Tailwind version (exact App.jsx palette via arbitrary hex)
import { useEffect } from "react";

const VARIANT = {
  primary: "bg-[#6366F1] text-white hover:bg-[#5457e5]",
  danger: "bg-[#EF4444] text-white hover:bg-[#dc2626]",
  ghost: "bg-transparent text-[#6366F1] border border-[#6366F1] hover:bg-[#EEF2FF]",
  success: "bg-[#10B981] text-white hover:bg-[#059669]",
  warning: "bg-[#F59E0B] text-white hover:bg-[#D97706]",
  dark: "bg-[#1E1B4B] text-white hover:bg-[#2a256b]",
  soft: "bg-[#F3F4F6] text-[#374151] hover:bg-[#e5e7eb]",
};

export function Btn({ children, variant = "primary", small, className = "", ...p }) {
  return (
    <button
      {...p}
      className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors
        ${small ? "px-3 py-[5px] text-xs" : "px-[18px] py-[9px] text-[13px]"}
        ${VARIANT[variant]} ${p.disabled ? "opacity-55 cursor-not-allowed" : "cursor-pointer"} ${className}`}
    >
      {children}
    </button>
  );
}

const STATUS = {
  PENDING: "bg-[#FEF3C7] text-[#D97706]",
  APPROVED: "bg-[#ECFDF5] text-[#059669]",
  SEND_BACK: "bg-[#FFF7E6] text-[#92400E]",
  REJECTED: "bg-[#FEF2F2] text-[#DC2626]",
  PO_RAISED: "bg-[#EEF2FF] text-[#6366F1]",
  OPEN: "bg-[#EEF2FF] text-[#6366F1]",
  CLOSED: "bg-[#ECFDF5] text-[#059669]",
  CANCELLED: "bg-[#FEF2F2] text-[#DC2626]",
  NONE: "bg-[#F3F4F6] text-[#6B7280]",
  AWAITING_PURCHASER: "bg-[#F3F4F6] text-[#6B7280]",
  PENDING_FIC: "bg-[#FEF3C7] text-[#D97706]",
  STOCK_REDUCED: "bg-[#ECFDF5] text-[#059669]",
  // QS approval (enhancement #3): PR Gate 1 statuses + PO Gate 2 price statuses.
  PENDING_QS_APPROVAL: "bg-[#FEF3C7] text-[#D97706]",
  QS_APPROVED: "bg-[#ECFDF5] text-[#059669]",
  AWAITING_PRICING: "bg-[#F3F4F6] text-[#6B7280]",
  PENDING_QS_PRICE: "bg-[#FEF3C7] text-[#D97706]",
  PRICE_APPROVED: "bg-[#ECFDF5] text-[#059669]",
};
const LABEL = {
  PENDING: "Pending", APPROVED: "Approved", SEND_BACK: "Sent back", REJECTED: "Rejected",
  PO_RAISED: "PO raised", OPEN: "Open", CLOSED: "Closed", CANCELLED: "Cancelled",
  NONE: "Buy only", AWAITING_PURCHASER: "Awaiting Purchaser", PENDING_FIC: "Awaiting FIC", STOCK_REDUCED: "Stock issued",
  PENDING_QS_APPROVAL: "Pending QS approval", QS_APPROVED: "QS approved",
  AWAITING_PRICING: "Awaiting pricing", PENDING_QS_PRICE: "Pending QS price approval", PRICE_APPROVED: "Price approved",
};

export function Badge({ status }) {
  return (
    <span className={`inline-block rounded-md px-2.5 py-[3px] text-[11px] font-bold uppercase tracking-wide ${STATUS[status] || "bg-[#F3F4F6] text-[#6B7280]"}`}>
      {LABEL[status] || status}
    </span>
  );
}

export function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[#9CA3AF] mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const FIELD_CLS = "w-full box-border bg-white border border-[#E5E7EB] rounded-lg px-3 py-[9px] text-[13px] text-[#374151] outline-none focus:border-[#6366F1] disabled:bg-[#F9FAFB] disabled:text-[#9CA3AF]";

export function Input({ className = "", ...props }) {
  return <input {...props} className={`${FIELD_CLS} ${className}`} />;
}
export function Select({ children, className = "", ...props }) {
  return <select {...props} className={`${FIELD_CLS} ${className}`}>{children}</select>;
}

export function Modal({ title, onClose, children, wide, noBackdropClose }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && !noBackdropClose && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, noBackdropClose]);
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center p-6 bg-[#0F0E1A]/45"
    >
      <div className={`flex max-h-[90vh] w-full flex-col rounded-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.25)] ${wide ? "max-w-[min(1160px,96vw)]" : "max-w-[540px]"}`}>
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-[18px]">
          <h2 className="m-0 text-lg font-extrabold text-[#1E1B4B]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="border-none bg-transparent text-lg text-[#9CA3AF] cursor-pointer">✕</button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// Compact yes/no dialog — the styled replacement for window.confirm().
// `body` may be a string or JSX (use <b> to stress the irreversible bit).
export function ConfirmDialog({ title, body, confirmLabel = "Confirm", cancelLabel = "Cancel", variant = "primary", onConfirm, onCancel }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[150] grid place-items-center p-6 bg-[#0F0E1A]/45" onMouseDown={onCancel}>
      <div role="alertdialog" aria-modal="true"
        className="w-full max-w-[460px] rounded-2xl bg-white px-6 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
        onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="m-0 text-[17px] font-extrabold text-[#1E1B4B]">{title}</h2>
        <div className="mt-2 text-[13px] leading-relaxed text-[#6B7280]">{body}</div>
        <div className="mt-5 flex justify-end gap-2.5">
          <Btn variant="ghost" className="border-[#E5E7EB]" onClick={onCancel}>{cancelLabel}</Btn>
          <Btn variant={variant} autoFocus onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

export function Toasts({ items }) {
  const edge = { success: "border-l-[#10B981]", error: "border-l-[#EF4444]", warning: "border-l-[#F59E0B]" };
  return (
    <div className="fixed bottom-5 right-5 z-[200] grid gap-2">
      {items.map((t) => (
        <div key={t.id} className={`max-w-[380px] rounded-lg border-l-4 bg-[#1E1B4B] px-4 py-[11px] text-[13px] font-medium text-white shadow-[0_8px_22px_rgba(0,0,0,0.3)] ${edge[t.type] || edge.success}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function EmptyRow({ colSpan, children }) {
  return <tr><td colSpan={colSpan} className="py-9 text-center text-[#9CA3AF]">{children}</td></tr>;
}

export const money = (n) =>
  n == null || n === "" ? "—" : "S$ " + Number(n).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Multi-currency display. Buy lines/POs carry their own currency (default SGD);
// keep this map in sync with the pr_items/purchase_orders currency CHECK.
export const CURRENCY_SYMBOLS = { SGD: "S$", EUR: "€", USD: "US$", CNY: "CN¥", JPY: "JP¥", INR: "₹", MYR: "RM" };
export const currencySymbol = (cur) => CURRENCY_SYMBOLS[cur] || cur || "S$";
// Like money() but prefixes the given currency's symbol instead of a fixed "S$".
export const curMoney = (n, cur = "SGD") =>
  n == null || n === ""
    ? "—"
    : `${currencySymbol(cur)} ${Number(n).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Project-wide date display format: dd/mm/yyyy.
// - "2026-04-01" or ISO timestamps -> parses the date part directly (no TZ shift).
// - Anything that isn't a real date (e.g. "ASAP") passes through unchanged.
export const fmtDate = (v) => {
  if (v == null || v === "") return "";
  const s = String(v);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
