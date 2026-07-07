// components/AlertsInbox.jsx
// Mail-style inbox for procurement alerts (SLA reminders + workflow notices).
// This is the IN-APP mailbox that stands in for email until the Microsoft Graph
// mail channel is switched on (MAIL_ENABLED=true) — at which point the SAME
// messages are also delivered by email. It reads the po_notifications feed the
// backend SLA sweep writes to, and renders each item like an email: sender,
// From/To/Subject/Date headers, PR/PO refs, body, and a read/unread state.
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

// The "sender" the in-app mailbox and the future email share.
const SENDER = { name: "InventoryOpz Procurement", email: "procurement@inventoryopz" };

const TYPE = {
  error:   { av: "bg-red-500",     chip: "bg-red-50 text-red-700 ring-red-200",         icon: "⛔" },
  warning: { av: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 ring-amber-200",   icon: "⚠️" },
  success: { av: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: "✅" },
  info:    { av: "bg-indigo-500",  chip: "bg-indigo-50 text-indigo-700 ring-indigo-200", icon: "✉️" },
};
const kind = (t) => TYPE[t] || TYPE.info;

function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function AlertsInbox({ open, onClose, items = [], onChanged, user }) {
  const [selected, setSelected] = useState(null);

  // "To" line — a personally-targeted alert reads as "you", a role broadcast as the role.
  const toLabel = (n) => (n.target_user_id ? (user?.name || "you") : `${n.role} team`);

  // Close on Escape (detail → list → panel).
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === "Escape" && (selected ? setSelected(null) : onClose?.());
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, selected, onClose]);

  const unread = useMemo(() => items.filter((n) => !n.is_read).length, [items]);

  if (!open) return null;

  const openMail = async (n) => {
    setSelected(n);
    if (!n.is_read) {
      try { await api.markRead(n.id); onChanged?.(); } catch { /* non-blocking */ }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-md bg-white shadow-2xl flex flex-col animate-[slideIn_.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-indigo-600 text-white">
          <div>
            <div className="text-base font-bold flex items-center gap-2">📬 Procurement Mailbox</div>
            <div className="text-xs text-indigo-200 mt-0.5">
              {items.length} message{items.length === 1 ? "" : "s"}
              {unread > 0 && ` · ${unread} unread`}
            </div>
          </div>
          <button onClick={onClose} className="text-indigo-100 hover:text-white text-2xl leading-none px-2" title="Close">×</button>
        </div>

        {/* Dormant-email banner */}
        <div className="px-5 py-2 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-700">
          ✉️ Email delivery is not yet enabled — these alerts are shown here in your in-app mailbox.
        </div>

        {/* List / detail */}
        {!selected ? (
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {items.length === 0 && (
              <div className="p-10 text-center text-gray-400 text-sm">
                <div className="text-4xl mb-3">📭</div>
                Your mailbox is empty. You're all caught up.
              </div>
            )}
            {items.map((n) => {
              const k = kind(n.type);
              return (
                <button
                  key={n.id}
                  onClick={() => openMail(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-gray-50 transition ${n.is_read ? "" : "bg-indigo-50/40"}`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 ${k.av}`}>
                    <span className="grayscale-0">{k.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm truncate ${n.is_read ? "text-gray-700 font-medium" : "text-gray-900 font-bold"}`}>
                        {SENDER.name}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{timeAgo(n.created_at)}</span>
                    </div>
                    <div className={`truncate text-sm ${n.is_read ? "text-gray-600" : "text-gray-900 font-semibold"}`}>{n.title}</div>
                    <div className="truncate text-xs text-gray-500 mt-0.5">{n.body}</div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {n.ref_pr && <span className={`text-[10px] px-1.5 py-0.5 rounded ring-1 ${k.chip}`}>PR {n.ref_pr}</span>}
                      {n.ref_po && <span className={`text-[10px] px-1.5 py-0.5 rounded ring-1 ${k.chip}`}>PO {n.ref_po}</span>}
                      {!n.is_read && <span className={`w-2 h-2 rounded-full ml-auto ${k.av}`} />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <button onClick={() => setSelected(null)} className="px-5 py-3 text-sm text-indigo-600 hover:underline">← Back to mailbox</button>
            <div className="px-6 pb-6">
              {/* Subject */}
              <h2 className="text-xl font-bold text-gray-900 mb-4">{selected.title}</h2>
              {/* From / To / Date — like an opened email */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${kind(selected.type).av}`}>
                  {kind(selected.type).icon}
                </div>
                <div className="min-w-0 flex-1 text-sm leading-tight">
                  <div className="text-gray-900 font-semibold">
                    {SENDER.name} <span className="font-normal text-gray-400">&lt;{SENDER.email}&gt;</span>
                  </div>
                  <div className="text-gray-500 text-xs mt-0.5">to {toLabel(selected)}</div>
                </div>
                <div className="text-xs text-gray-400 flex-shrink-0 text-right">
                  {selected.created_at ? new Date(selected.created_at).toLocaleString() : ""}
                </div>
              </div>
              {/* Refs */}
              {(selected.ref_pr || selected.ref_po) && (
                <div className="flex gap-2 mb-4">
                  {selected.ref_pr && <span className={`text-xs px-2 py-1 rounded ring-1 ${kind(selected.type).chip}`}>PR {selected.ref_pr}</span>}
                  {selected.ref_po && <span className={`text-xs px-2 py-1 rounded ring-1 ${kind(selected.type).chip}`}>PO {selected.ref_po}</span>}
                </div>
              )}
              {/* Body */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{selected.body}</p>
              </div>
              <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400">
                Automated message from the InventoryOpz procurement module. When email delivery is enabled,
                this same message is also sent to your email inbox. Please log in and take action.
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
    </div>
  );
}
