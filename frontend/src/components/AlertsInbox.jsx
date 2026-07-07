// components/AlertsInbox.jsx
// Mail-style inbox for procurement alerts (SLA reminders + workflow notices).
// Reads the same po_notifications feed the backend SLA sweep writes to. Renders
// each notification like an email: sender, subject, body, PR/PO refs, time, and
// a read/unread state. When the Microsoft Graph mail channel is switched on the
// SAME messages also arrive by email — this is the in-app mirror of that inbox.
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

const TYPE = {
  error:   { dot: "bg-red-500",    chip: "bg-red-50 text-red-700 ring-red-200",       icon: "⛔" },
  warning: { dot: "bg-amber-500",  chip: "bg-amber-50 text-amber-700 ring-amber-200", icon: "⚠️" },
  success: { dot: "bg-emerald-500",chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: "✅" },
  info:    { dot: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700 ring-indigo-200", icon: "✉️" },
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

export default function AlertsInbox({ open, onClose, items = [], onChanged }) {
  const [selected, setSelected] = useState(null);

  // Close on Escape.
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
            <div className="text-base font-bold flex items-center gap-2">📬 Alerts &amp; Reminders</div>
            <div className="text-xs text-indigo-200 mt-0.5">
              {items.length} message{items.length === 1 ? "" : "s"}
              {unread > 0 && ` · ${unread} unread`}
            </div>
          </div>
          <button onClick={onClose} className="text-indigo-100 hover:text-white text-2xl leading-none px-2" title="Close">×</button>
        </div>

        {/* List / detail */}
        {!selected ? (
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {items.length === 0 && (
              <div className="p-10 text-center text-gray-400 text-sm">
                <div className="text-4xl mb-3">🎉</div>
                No alerts. You're all caught up.
              </div>
            )}
            {items.map((n) => {
              const k = kind(n.type);
              return (
                <button
                  key={n.id}
                  onClick={() => openMail(n)}
                  className={`w-full text-left px-5 py-3.5 flex gap-3 hover:bg-gray-50 transition ${n.is_read ? "" : "bg-indigo-50/40"}`}
                >
                  <span className="text-lg flex-shrink-0 mt-0.5">{k.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      {!n.is_read && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${k.dot}`} />}
                      <span className={`truncate text-sm ${n.is_read ? "text-gray-700 font-medium" : "text-gray-900 font-bold"}`}>
                        {n.title}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-gray-500 mt-0.5">{n.body}</span>
                    <span className="flex items-center gap-1.5 mt-1.5">
                      {n.ref_pr && <span className={`text-[10px] px-1.5 py-0.5 rounded ring-1 ${k.chip}`}>PR {n.ref_pr}</span>}
                      {n.ref_po && <span className={`text-[10px] px-1.5 py-0.5 rounded ring-1 ${k.chip}`}>PO {n.ref_po}</span>}
                      <span className="text-[10px] text-gray-400 ml-auto">{timeAgo(n.created_at)}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <button onClick={() => setSelected(null)} className="px-5 py-3 text-sm text-indigo-600 hover:underline">← Back to inbox</button>
            <div className="px-6 pb-6">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <span>{kind(selected.type).icon}</span>
                <span>InventoryOpz · Procurement</span>
                <span className="ml-auto">{selected.created_at ? new Date(selected.created_at).toLocaleString() : ""}</span>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-3">{selected.title}</h2>
              <div className="flex gap-2 mb-4">
                {selected.ref_pr && <span className={`text-xs px-2 py-1 rounded ring-1 ${kind(selected.type).chip}`}>PR {selected.ref_pr}</span>}
                {selected.ref_po && <span className={`text-xs px-2 py-1 rounded ring-1 ${kind(selected.type).chip}`}>PO {selected.ref_po}</span>}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{selected.body}</p>
              <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400">
                Automated message from the InventoryOpz procurement module. Please log in and take action.
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
    </div>
  );
}
