// ============================================================
// PurchaseOrdersImport.jsx
// File: frontend/src/pages/Setup/PurchaseOrdersImport.jsx
// Same approach as InventoryImport: parse Excel in the browser,
// POST JSON to the backend. No file upload / multer involved.
// ============================================================
import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import api from "../../services/api"; // default export — same as InventoryImport

const TEMPLATE_URL = "/PO_Standard_Template.xlsx"; // put this file in frontend/public

const norm = (s) =>
  String(s ?? "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// Excel exports can declare a 1,000,000-row range; shrink it before reading.
function clampRange(ws) {
  let mr = 0,
    mc = 0;
  for (const k of Object.keys(ws)) {
    if (k[0] === "!") continue;
    const v = ws[k] && ws[k].v;
    if (v === undefined || v === null || v === "") continue;
    const { r, c } = XLSX.utils.decode_cell(k);
    if (r > mr) mr = r;
    if (c > mc) mc = c;
  }
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: mr, c: mc },
  });
}

// Read the workbook to a 2-D grid (array of arrays), picking the sheet that has "PO NO".
function fileToGrid(arrayBuffer) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), {
    type: "array",
    cellDates: true,
  });
  let fallback = null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    clampRange(ws);
    const grid = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      defval: "",
    });
    if (grid.some((r) => r.some((c) => norm(c) === "po no"))) return grid;
    if (!fallback) fallback = grid;
  }
  return fallback || [];
}

export default function PurchaseOrdersImport() {
  const [file, setFile] = useState(null);
  const [grid, setGrid] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const reset = () => {
    setFile(null);
    setGrid(null);
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const pick = (f) => {
    setResult(null);
    setError("");
    setGrid(null);
    if (!f) return;
    if (!f.name.endsWith(".xlsx") && !f.name.endsWith(".xls")) {
      setError("Please choose an Excel file (.xlsx or .xls).");
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const g = fileToGrid(e.target.result);
        if (!g.length) {
          setError("That sheet looks empty.");
          return;
        }
        setGrid(g);
      } catch (err) {
        setError("Couldn't read the file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const importNow = async () => {
    if (!grid) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await api.post("/import/po-seed", { grid });
      setResult(res.data);
      setFile(null);
      setGrid(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-base font-semibold text-slate-900">
          Import purchase orders
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload the client's PO list or the standard template. One row per
          order — rows are matched and added automatically.
        </p>
      </div>

      <div className="mb-5 flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-indigo-600 ring-1 ring-slate-200">
            <DownloadIcon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-800">
              Standard template
            </p>
            <p className="text-xs text-slate-500">
              The format for new purchase orders.
            </p>
          </div>
        </div>
        <a
          href={TEMPLATE_URL}
          download
          className="rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 ring-1 ring-indigo-200 transition-colors hover:bg-indigo-50"
        >
          Download
        </a>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          drag || file
            ? "border-indigo-400 bg-indigo-50/50"
            : "border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-slate-100/60"
        }`}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-indigo-600 ring-1 ring-slate-200">
          <UploadIcon className="h-5 w-5" />
        </span>
        {file ? (
          <div>
            <p className="text-sm font-medium text-slate-800">{file.name}</p>
            <p className="text-xs text-slate-500">
              {grid ? "Ready to import · click to replace" : "Reading…"}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-slate-700">
              Drop an Excel file here, or click to browse
            </p>
            <p className="text-xs text-slate-500">.xlsx or .xls</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
          disabled={busy}
        />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={importNow}
          disabled={!grid || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Spinner />}
          {busy ? "Importing…" : "Upload and import"}
        </button>
        {(file || result || error) && (
          <button
            onClick={reset}
            disabled={busy}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="mt-5 flex items-start gap-3 rounded-xl bg-rose-50 px-4 py-3 ring-1 ring-rose-200">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-5 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <CheckIcon className="h-4 w-4 text-emerald-500" />
            <p className="text-sm font-medium text-slate-800">
              Import finished
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-100">
            <Stat
              label="Created"
              value={result.imported ?? 0}
              accent="text-emerald-600"
            />
            <Stat
              label="Updated"
              value={result.updated ?? 0}
              accent="text-indigo-600"
            />
            <Stat
              label="Skipped"
              value={result.skipped ?? 0}
              accent="text-slate-500"
            />
          </div>
          {Array.isArray(result.errors) && result.errors.length > 0 && (
            <div className="border-t border-slate-100 p-4">
              <p className="mb-2 text-sm font-medium text-amber-700">
                {result.errors.length} row(s) need a look
              </p>
              <div className="max-h-52 overflow-auto rounded-lg ring-1 ring-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.errors.map((e, i) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-500">
                          {e.row ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {e.reason || e.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="px-4 py-4 text-center">
      <p className={`text-2xl font-semibold ${accent}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}
function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z"
      />
    </svg>
  );
}
function UploadIcon(props) {
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
      <path d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
function DownloadIcon(props) {
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
      <path d="M12 4v12m0 0 5-5m-5 5-5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}
function CheckIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function AlertIcon(props) {
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
      <path d="M12 9v4m0 4h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}
