// ============================================================
// SetupDashboard.jsx — Setup page (modern SaaS, indigo accent)
// File: frontend/src/pages/Setup/SetupDashboard.jsx
// ============================================================
import React, { useState } from "react";
import InventoryImport from "./InventoryImport";
import ProjectsImport from "./ProjectsImport";
import PurchaseOrdersImport from "./PurchaseOrdersImport";

const TABS = [
  {
    key: "inventory",
    label: "Inventory",
    Icon: BoxIcon,
    render: () => <InventoryImport />,
  },
  {
    key: "projects",
    label: "Projects",
    Icon: LayersIcon,
    render: () => <ProjectsImport />,
  },
  {
    key: "purchaseOrders",
    label: "Purchase orders",
    Icon: FileIcon,
    render: () => <PurchaseOrdersImport />,
  },
];

export default function SetupDashboard() {
  const [active, setActive] = useState("inventory");
  const current = TABS.find((t) => t.key === active);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Data import
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Setup
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Bring inventory, projects and purchase orders into the system from
            Excel.
          </p>
        </header>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <nav className="flex gap-1 border-b border-slate-100 p-2">
            {TABS.map(({ key, label, Icon }) => {
              const on = key === active;
              return (
                <button
                  key={key}
                  onClick={() => setActive(key)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    on
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="p-6 sm:p-8">{current.render()}</div>
        </div>

        <p className="mt-4 px-1 text-xs text-slate-400">
          Accepts .xlsx and .xls files. Re-importing a file updates records that
          already exist.
        </p>
      </div>
    </div>
  );
}

/* ---- inline icons (no extra dependency) ---- */
function BoxIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5" />
      <path d="M12 13v9" />
    </svg>
  );
}
function LayersIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  );
}
function FileIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M14 3v5h5" />
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-5Z" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}
