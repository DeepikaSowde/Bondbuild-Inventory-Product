// pages/ProcurementExport.jsx
// Export buttons for the Procurement page: Excel (PRs sheet + POs sheet) and
// PDF (one document, title + date, PR table then PO table).
// Fetches its own data via lib/api (api.prs / api.pos). Drop <ProcurementExport/>
// into the Procurement page header.
//
// Requires: npm install jspdf jspdf-autotable   (xlsx is already in the project)
import { useState } from "react";
import { api } from "../lib/api";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const money = (n) => "S$ " + (Number(n) || 0).toFixed(2);
const dt = (v) => (v ? String(v).slice(0, 10) : "");
const today = () => new Date().toISOString().slice(0, 10);

// shared: pull both lists from the backend
async function loadData() {
  const [prs, pos] = await Promise.all([api.prs("All"), api.pos({})]);
  return { prs: prs || [], pos: pos || [] };
}

// columns used for both Excel and PDF
const PR_COLS = [
  ["PR No", (r) => r.pr_no],
  ["Job No", (r) => r.job_no],
  ["Project", (r) => r.project_name || ""],
  ["Requested By", (r) => r.requested_by || ""],
  ["Date Issued", (r) => dt(r.date_issued || r.created_at)],
  ["Status", (r) => r.status],
];
const PO_COLS = [
  ["PO No", (r) => r.po_no],
  ["Job No", (r) => r.job_no],
  ["Project", (r) => r.project_name || ""],
  ["Type", (r) => (r.po_type === "STOCK" ? "Stock" : "Buy")],
  ["Supplier / Source", (r) => (r.po_type === "STOCK" ? (r.source_location || "From stock") : (r.supplier_name || ""))],
  ["Amount", (r) => money(r.amount)],
  ["Status", (r) => r.status],
];

export default function ProcurementExport() {
  const [busy, setBusy] = useState("");

  const exportExcel = async () => {
    setBusy("excel");
    try {
      const { prs, pos } = await loadData();
      const wb = new ExcelJS.Workbook();
      wb.creator = "InventoryOpz";
      wb.created = new Date();

      // helper: build one styled sheet
      const buildSheet = (name, title, cols, rows) => {
        const ws = wb.addWorksheet(name, {
          views: [{ state: "frozen", ySplit: 4 }], // freeze through the header row
        });
        const lastCol = String.fromCharCode(64 + cols.length); // e.g. "F"

        // Title row
        ws.mergeCells(`A1:${lastCol}1`);
        const t = ws.getCell("A1");
        t.value = title;
        t.font = { bold: true, size: 14, color: { argb: "FF1E1B4B" } };
        t.alignment = { vertical: "middle" };
        ws.getRow(1).height = 22;

        // Subtitle / date row
        ws.mergeCells(`A2:${lastCol}2`);
        const s = ws.getCell("A2");
        s.value = `Bond Build SG · Generated ${today()}`;
        s.font = { size: 10, color: { argb: "FF6B7280" } };
        // row 3 left blank as spacer

        // Header row (row 4)
        const headerRow = ws.getRow(4);
        cols.forEach((c, i) => {
          const cell = headerRow.getCell(i + 1);
          cell.value = c[0];
          cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6366F1" } };
          cell.alignment = { vertical: "middle", horizontal: "left" };
          cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
        });
        headerRow.height = 20;

        // Data rows (from row 5)
        rows.forEach((r, ri) => {
          const row = ws.getRow(5 + ri);
          cols.forEach((c, i) => {
            row.getCell(i + 1).value = c[1](r);
          });
          if (ri % 2 === 1) {
            cols.forEach((_, i) => {
              row.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
            });
          }
        });

        // Auto-width: fit to longest content per column
        cols.forEach((c, i) => {
          let max = c[0].length;
          rows.forEach((r) => {
            const v = String(c[1](r) ?? "");
            if (v.length > max) max = v.length;
          });
          ws.getColumn(i + 1).width = Math.min(Math.max(max + 3, 10), 45);
        });

        return ws;
      };

      buildSheet("Purchase Requests", `Purchase Requests (${prs.length})`, PR_COLS, prs);
      buildSheet("Purchase Orders", `Purchase Orders (${pos.length})`, PO_COLS, pos);

      // download
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Procurement_${today()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Excel export failed: " + (e?.message || e));
    } finally {
      setBusy("");
    }
  };

  const exportPDF = async () => {
    setBusy("pdf");
    try {
      const { prs, pos } = await loadData();
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();

      // Header
      doc.setFontSize(16); doc.setFont(undefined, "bold");
      doc.text("Procurement Report", 40, 40);
      doc.setFontSize(10); doc.setFont(undefined, "normal");
      doc.setTextColor(120);
      doc.text("Bond Build SG · InventoryOpz", 40, 56);
      doc.text(`Generated: ${today()}`, pageW - 40, 56, { align: "right" });
      doc.setTextColor(0);

      // PR table
      doc.setFontSize(12); doc.setFont(undefined, "bold");
      doc.text(`Purchase Requests (${prs.length})`, 40, 80);
      autoTable(doc, {
        startY: 88,
        head: [PR_COLS.map(([h]) => h)],
        body: prs.map((r) => PR_COLS.map(([, f]) => f(r))),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [99, 102, 241], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 255] },
        margin: { left: 40, right: 40 },
      });

      // PO table (below PR table)
      const afterPR = doc.lastAutoTable.finalY + 24;
      doc.setFontSize(12); doc.setFont(undefined, "bold");
      doc.text(`Purchase Orders (${pos.length})`, 40, afterPR);
      autoTable(doc, {
        startY: afterPR + 8,
        head: [PO_COLS.map(([h]) => h)],
        body: pos.map((r) => PO_COLS.map(([, f]) => f(r))),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [30, 27, 75], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 255] },
        margin: { left: 40, right: 40 },
      });

      doc.save(`Procurement_${today()}.pdf`);
    } catch (e) {
      alert("PDF export failed: " + (e?.message || e));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex gap-2">
      <button onClick={exportExcel} disabled={!!busy}
        className="rounded-lg bg-[#059669] px-3.5 py-2 text-[13px] font-bold text-white hover:bg-[#047857] disabled:opacity-60">
        {busy === "excel" ? "Exporting…" : "⬇ Excel"}
      </button>
      <button onClick={exportPDF} disabled={!!busy}
        className="rounded-lg bg-[#DC2626] px-3.5 py-2 text-[13px] font-bold text-white hover:bg-[#B91C1C] disabled:opacity-60">
        {busy === "pdf" ? "Exporting…" : "⬇ PDF"}
      </button>
    </div>
  );
}