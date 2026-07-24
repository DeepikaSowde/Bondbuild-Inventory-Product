// pages/Procurement.jsx — Tailwind version. Drop-in for the /pr-followup route.
// Renders only the content area; the host app provides sidebar, shell, AuthContext.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { Toasts } from "../components/ui";
import PurchaseRequests from "./PurchaseRequests";
import PurchaseOrders from "./PurchaseOrders";
import ProcurementExport from "./ProcurementExport";
import SupplierDirectory from "./SupplierDirectory";

export default function Procurement() {
  const { user } = useAuth();
  // Factory In-charge only works with Purchase Orders — the PR and Supplier
  // tabs are hidden for them, so default their landing tab to "po".
  const isFic = user?.role === "Factory In-charge";
  const [tab, setTab] = useState(isFic ? "po" : "pr");
  const [toasts, setToasts] = useState([]);
  const [perms, setPerms] = useState(null);

  const notify = useCallback((msg, type = "success") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const refreshInbox = useCallback(() => {
    api.notifications().catch(() => {});
  }, []);
  useEffect(() => {
    refreshInbox();
  }, []);
  useEffect(() => {
    api
      .myPermissions()
      .then(setPerms)
      .catch(() => setPerms({}));
  }, []);

  if (!user) return null;
  if (perms === null) return <div className="p-8 text-[#9CA3AF]">Loading…</div>;

  const canEditSuppliers = !!user;

  const tabBtn = (key, label) => (
    <button
      onClick={() => setTab(key)}
      className={`mr-6 cursor-pointer border-none bg-transparent px-1 py-2.5 text-[15px] font-bold transition-colors
        ${tab === key ? "border-b-[3px] border-[#6366F1] text-[#6366F1]" : "border-b-[3px] border-transparent text-[#6B7280]"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-8 font-['DM_Sans',sans-serif] text-[#374151]">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="m-0 text-2xl font-extrabold text-[#1E1B4B]">
            Procurement
          </h1>
          <p className="mb-4 mt-1 text-[13px] text-[#6B7280]">
            {tab === "pr"
              ? "Drafter raises · Manager approves · Purchaser assigns suppliers · Factory In-charge issues stock"
              : "One PO per supplier · self-collect shows supplier address · receiving closes the PO"}
          </p>
        </div>
        <ProcurementExport includePRs={!isFic} />
      </div>

      <div className="mb-[22px] border-b border-[#E5E7EB]">
        {!isFic && tabBtn("pr", "Purchase requests")}
        {tabBtn("po", "Purchase orders")}
        {!isFic && tabBtn("suppliers", "Supplier")}
      </div>

      {tab === "pr" && (
        <PurchaseRequests
          user={user}
          perms={perms}
          notify={notify}
          refreshInbox={refreshInbox}
        />
      )}
      {tab === "po" && (
        <PurchaseOrders
          user={user}
          perms={perms}
          notify={notify}
          refreshInbox={refreshInbox}
        />
      )}
      {tab === "suppliers" && (
        <SupplierDirectory
          notify={notify}
          canEdit={canEditSuppliers}
        />
      )}

      <Toasts items={toasts} />
    </div>
  );
}
