// components/AuditTrail.jsx
// Read-only history timeline for a PR or PO (DR-AUD-001 / 003 / 004).
// Renders who did what, when, with the approver's comments and — for edits —
// the field-level before → after changes.
//
// Prices are redacted by the SERVER for roles without see_pr_price/see_po_price;
// such entries arrive with { redacted: true } and are shown as "hidden" here.
// This component never receives a price it isn't allowed to see.
import { useEffect, useState } from "react";
import { api, apiError } from "../lib/api";

const ACTION = {
  SUBMIT:         { label: "Submitted",          cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  RESUBMIT:       { label: "Resubmitted",        cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  EDIT:           { label: "Edited",             cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  APPROVE:        { label: "Approved",           cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  REQUEST_QUOTE:  { label: "Quote requested",    cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  SEND_BACK:      { label: "Sent back",          cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  REJECT:         { label: "Rejected",           cls: "bg-red-50 text-red-700 ring-red-200" },
  CREATE:         { label: "PO created",         cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  CREATE_STOCK:   { label: "Stock PO created",   cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  DELIVERY_STAGE: { label: "Delivery updated",   cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  RECEIVE:        { label: "Goods received",     cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  CANCEL:         { label: "Cancelled",          cls: "bg-red-50 text-red-700 ring-red-200" },
};
const act = (a) => ACTION[a] || { label: a, cls: "bg-gray-50 text-gray-700 ring-gray-200" };
const when = (ts) => (ts ? new Date(ts).toLocaleString() : "—");
const val = (v) => (v === "" || v === null || v === undefined ? "—" : String(v));

// One before → after line. Redacted price entries never carry a value.
function Change({ d }) {
  return (
    <li className="text-[12.5px] text-gray-600 leading-relaxed">
      <span className="font-medium text-gray-700">{d.field}:</span>{" "}
      {d.redacted ? (
        <span className="italic text-gray-400">••••• hidden (no price access)</span>
      ) : (
        <>
          <span className="text-gray-500 line-through">{val(d.from)}</span>
          <span className="mx-1 text-gray-400">→</span>
          <span className="font-semibold text-gray-800">{val(d.to)}</span>
        </>
      )}
    </li>
  );
}

function Details({ details }) {
  if (!details) return null;
  const { fields = [], items = [] } = details;
  if (!fields.length && !items.length) return null;
  return (
    <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
      {fields.length > 0 && <ul className="space-y-0.5">{fields.map((f, i) => <Change key={i} d={f} />)}</ul>}
      {items.map((it, i) => (
        <div key={i} className={fields.length || i ? "mt-2" : ""}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Line {it.line} · {it.change}
            {it.description ? <span className="normal-case font-normal text-gray-500"> — {it.description}</span> : null}
          </div>
          {it.diffs?.length > 0 && <ul className="mt-0.5 space-y-0.5 pl-3">{it.diffs.map((d, j) => <Change key={j} d={d} />)}</ul>}
        </div>
      ))}
    </div>
  );
}

export default function AuditTrail({ kind, no }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const fetcher = kind === "po" ? api.poHistory : api.prHistory;
    fetcher(no)
      .then((r) => alive && setRows(Array.isArray(r) ? r : []))
      .catch((e) => alive && setErr(apiError(e)));
    return () => { alive = false; };
  }, [kind, no]);

  if (err) return <div className="py-8 text-center text-[13px] text-red-600">Could not load history: {err}</div>;
  if (!rows) return <div className="py-8 text-center text-[13px] text-gray-400">Loading history…</div>;
  if (!rows.length) return <div className="py-8 text-center text-[13px] text-gray-400">No history recorded yet.</div>;

  return (
    <div className="py-1">
      <ol className="relative border-l-2 border-gray-100 pl-5">
        {rows.map((r) => {
          const a = act(r.action);
          return (
            <li key={r.id} className="relative pb-5 last:pb-1">
              <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-indigo-500 ring-1 ring-gray-200" />
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ring-1 ${a.cls}`}>{a.label}</span>
                {r.from_status && r.to_status && r.from_status !== r.to_status && (
                  <span className="text-[11px] text-gray-400">{r.from_status} → {r.to_status}</span>
                )}
                <span className="ml-auto text-[11px] tabular-nums text-gray-400">{when(r.created_at)}</span>
              </div>
              <div className="mt-1 text-[13px] text-gray-700">
                <span className="font-semibold">{r.actor || "—"}</span>
                {r.actor_role && <span className="text-gray-400"> · {r.actor_role}</span>}
              </div>
              {r.note && (
                <div className="mt-1.5 rounded-lg border-l-2 border-indigo-200 bg-indigo-50/50 px-3 py-1.5 text-[12.5px] italic text-gray-600">
                  “{r.note}”
                </div>
              )}
              <Details details={r.details} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
