import { useCallback, useEffect, useState } from "react";
import { api, apiError } from "../lib/api";
import { Btn, Field, Input, Select, Modal } from "../components/ui";

const TYPE_COLORS = {
  Local:  { bg: "#ECFDF5", text: "#059669" },
  China:  { bg: "#FEF3C7", text: "#D97706" },
  Europe: { bg: "#EEF2FF", text: "#6366F1" },
  Other:  { bg: "#F3F4F6", text: "#6B7280" },
};

const BLANK = { name: "", type: "Local", contact_person: "", phone: "", email: "", address: "" };
const TYPES = ["Local", "China", "Europe", "Other"];

function TypeBadge({ type }) {
  const c = TYPE_COLORS[type] || TYPE_COLORS.Other;
  return (
    <span
      style={{ background: c.bg, color: c.text }}
      className="rounded-md px-2.5 py-[3px] text-[11px] font-bold uppercase tracking-wide"
    >
      {type}
    </span>
  );
}

function hasContact(s) {
  return s.contact_person || s.phone || s.email || s.address;
}

function SupplierCard({ supplier, canEdit, onEdit, onDelete }) {
  const s = supplier;
  return (
    <div className="flex flex-col rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-[15px] font-extrabold uppercase tracking-wide text-[#1E1B4B]">
          {s.name}
        </span>
        <TypeBadge type={s.type} />
      </div>

      {hasContact(s) ? (
        <div className="mb-4 space-y-[3px] text-[12px] text-[#6B7280]">
          {s.contact_person && <div>👤 {s.contact_person}</div>}
          {s.phone        && <div>📞 {s.phone}</div>}
          {s.email        && <div>✉️ {s.email}</div>}
          {s.address      && <div>📍 {s.address}</div>}
        </div>
      ) : (
        <p className="mb-4 text-[12px] text-[#9CA3AF]">
          No contact info yet — click Edit to add
        </p>
      )}

      <div className="mt-auto flex gap-2">
        {canEdit && (
          <>
            <button
              onClick={() => onEdit(s)}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-[#F8F9FF] py-2 text-[13px] font-semibold text-[#6366F1] transition hover:bg-[#EEF2FF]"
            >
              ✏️ Edit
            </button>
            <button
              onClick={() => onDelete(s)}
              className="flex cursor-pointer items-center justify-center rounded-lg border border-[#FEE2E2] bg-[#FFF5F5] px-3 py-2 text-[#EF4444] transition hover:bg-[#FEE2E2]"
            >
              🗑
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SupplierForm({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState({ ...BLANK, ...initial });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal title={initial?.id ? "Edit Supplier" : "Add Supplier"} onClose={onClose}>
      <div className="space-y-3 p-1">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company Name *" className="col-span-2">
            <Input value={form.name} onChange={set("name")} placeholder="e.g. Buildmate (S) Pte Ltd" required />
          </Field>

          <Field label="Type">
            <Select value={form.type} onChange={set("type")}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>

          <Field label="Contact Person">
            <Input value={form.contact_person} onChange={set("contact_person")} placeholder="Full name" />
          </Field>

          <Field label="Phone / WhatsApp">
            <Input value={form.phone} onChange={set("phone")} placeholder="+65 9123 4567" />
          </Field>

          <Field label="Email">
            <Input type="email" value={form.email} onChange={set("email")} placeholder="orders@supplier.com" />
          </Field>

          <Field label="Address" className="col-span-2">
            <textarea
              value={form.address}
              onChange={set("address")}
              placeholder="Full mailing / delivery address"
              rows={3}
              className="w-full resize-none rounded-lg border border-[#E5E7EB] px-3 py-[9px] text-[13px] text-[#374151] outline-none focus:border-[#6366F1]"
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn
            onClick={() => onSave(form)}
            disabled={saving || !form.name.trim()}
          >
            {saving ? "Saving…" : initial?.id ? "Save changes" : "Add Supplier"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

export default function SupplierDirectory({ notify, canEdit = true }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [modal, setModal]         = useState(null); // null | { mode: "add"|"edit", supplier? }
  const [saving, setSaving]       = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.suppliers()
      .then(setSuppliers)
      .catch(() => notify?.("Failed to load suppliers", "error"))
      .finally(() => setLoading(false));
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const filtered = suppliers.filter((s) => {
    const matchType = typeFilter === "All" || s.type === typeFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || s.name.toLowerCase().includes(q)
      || (s.contact_person || "").toLowerCase().includes(q)
      || (s.email || "").toLowerCase().includes(q)
      || (s.phone || "").toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  async function handleSave(form) {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (modal.supplier?.id) {
        await api.updateSupplier(modal.supplier.id, form);
        notify?.("Supplier updated", "success");
      } else {
        await api.addSupplier(form);
        notify?.("Supplier added", "success");
      }
      setModal(null);
      load();
    } catch (e) {
      notify?.(apiError(e), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(s) {
    setSaving(true);
    try {
      await api.deleteSupplier(s.id);
      notify?.(`${s.name} removed`, "success");
      setConfirmDel(null);
      load();
    } catch (e) {
      notify?.(apiError(e), "error");
    } finally {
      setSaving(false);
    }
  }

  function exportExcel() {
    // Build CSV and trigger download
    const headers = ["Name", "Type", "Contact Person", "Phone", "Email", "Address"];
    const rows = filtered.map((s) => [
      s.name, s.type, s.contact_person || "", s.phone || "", s.email || "", (s.address || "").replace(/\n/g, " "),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "suppliers.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-extrabold text-[#1E1B4B]">🏢 Supplier Directory</h2>
          <p className="mt-0.5 text-[13px] text-[#6B7280]">
            All suppliers with contacts, phone, email and WhatsApp
          </p>
        </div>
        <div className="flex gap-2">
          <Btn variant="dark" onClick={exportExcel}>⬇ Export Excel</Btn>
          {canEdit && (
            <Btn onClick={() => setModal({ mode: "add", supplier: null })}>+ Add Supplier</Btn>
          )}
        </div>
      </div>

      {/* Search + Filter */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1" style={{ minWidth: 220 }}>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier, contact..."
            className="w-full rounded-xl border border-[#E5E7EB] bg-white py-2.5 pl-9 pr-4 text-[13px] outline-none focus:border-[#6366F1]"
          />
        </div>
        <div className="flex gap-1">
          {["All", ...TYPES].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition cursor-pointer border-none
                ${typeFilter === t
                  ? "bg-[#6366F1] text-white"
                  : "bg-transparent text-[#6B7280] hover:bg-[#F3F4F6]"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      {loading ? (
        <p className="text-[#9CA3AF]">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-[#9CA3AF]">No suppliers found.</p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {filtered.map((s) => (
            <SupplierCard
              key={s.id}
              supplier={s}
              canEdit={canEdit}
              onEdit={(sup) => setModal({ mode: "edit", supplier: sup })}
              onDelete={setConfirmDel}
            />
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {modal && (
        <SupplierForm
          initial={modal.supplier}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}

      {/* Delete confirmation */}
      {confirmDel && (
        <Modal title="Remove Supplier" onClose={() => setConfirmDel(null)}>
          <div className="p-1">
            <p className="mb-4 text-[14px] text-[#374151]">
              Remove <strong>{confirmDel.name}</strong> from the directory? This won't affect existing PRs or POs.
            </p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setConfirmDel(null)} disabled={saving}>Cancel</Btn>
              <Btn variant="danger" onClick={() => handleDelete(confirmDel)} disabled={saving}>
                {saving ? "Removing…" : "Remove"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
