// lib/rfqDoc.js
// Per-supplier "Request for Quotation" (RFQ) documents, generated from a PR's
// buy lines. One document per supplier — each supplier only sees their own lines.
// The price columns (Unit Price / Total) are intentionally BLANK for the supplier
// to fill in and return; the Purchaser then types the quoted prices back into the
// system before generating the Buy PO.
//
// Modelled on lib/poPdf.js (same Bond Building letterhead) and the ExcelJS export
// pattern in pages/ProcurementExport.jsx. Logo/cert images load from /public.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

const COMPANY = [
  "8 Jalan Kilang Barat #01-02 Singapore 159351",
  "tel 65 6558 7551  ·  fax 65 6558 7556  ·  info@bondbuild.com.sg",
  "www.bondbuild.com.sg  ·  Reg.no. 200508891H",
];

// Keep in sync with ui.CURRENCY_SYMBOLS / poPdf.js — the RFQ's currency labels the price columns.
const CUR_SYM = { SGD: "S$", EUR: "€", USD: "US$", CNY: "CN¥", JPY: "JP¥", INR: "₹", MYR: "RM" };

const fmtDate = (v) => {
  if (!v) return "";
  const s = String(v);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
const todayStr = () => fmtDate(new Date());
// RFQ ref: PR number + a supplier tag, safe for filenames (no slashes).
const safe = (s) => String(s || "").replace(/[/\\:*?"<>|]+/g, "-").replace(/\s+/g, "_");
const rfqRef = (g) => `RFQ-${safe(g.pr_no)}-${safe(g.supplier?.name || g.supplier_name || "SUP")}`;

async function loadImage(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    const fmt = blob.type.includes("jpeg") || blob.type.includes("jpg") ? "JPEG" : "PNG";
    const dataUrl = await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
    if (!dataUrl) return null;
    const dims = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
    if (!dims || !dims.w || !dims.h) return null;
    return { dataUrl, ...dims, fmt };
  } catch {
    return null;
  }
}

// ── PDF ────────────────────────────────────────────────────────────────────
// group = { pr_no, job_no, project_name, prepared_by, currency, reply_by,
//           supplier: { name, address, phone, fax, contact_person, email },
//           items: [{ description, colour, qty, unit }] }
export async function exportRfqPdf(group) {
  const g = group || {};
  const sup = g.supplier || {};
  const items = g.items || [];
  const sym = CUR_SYM[g.currency] || g.currency || "S$";

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  const [logo, certs] = await Promise.all([loadImage("/bdb-logo.png"), loadImage("/bdb-certs.png")]);

  // ── Logo (top-right) ──
  if (logo) {
    const scale = Math.min(100 / logo.w, 50 / logo.h);
    try { doc.addImage(logo.dataUrl, logo.fmt, W - M - logo.w * scale, 20, logo.w * scale, logo.h * scale); } catch { /* ignore */ }
  } else {
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(178, 42, 30);
    doc.text("bdb", W - M, 36, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(110);
    doc.text("bond building products pte ltd", W - M, 48, { align: "right" });
    doc.setTextColor(0);
  }

  // ── Left block: supplier ──
  let ly = 40;
  doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(String(sup.name || g.supplier_name || "").toUpperCase(), M, ly, { maxWidth: 300 }); ly += 15;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  if (sup.address) {
    for (const line of String(sup.address).split("\n")) { doc.text(line, M, ly, { maxWidth: 300 }); ly += 12; }
  }
  const telFax = [sup.phone && `Tel: ${sup.phone}`, sup.fax && `Fax: ${sup.fax}`].filter(Boolean).join("    ");
  if (telFax) { doc.text(telFax, M, ly); ly += 12; }
  if (sup.contact_person) { doc.text(`Attn: ${sup.contact_person}`, M, ly); ly += 12; }

  // ── Right info box ──
  const bx = W - M - 210, bw = 210, by = 70;
  const rows = [
    ["*RFQ Ref.", rfqRef(g)],
    ["*Date", todayStr()],
    ["Please reply by", fmtDate(g.reply_by) || ""],
  ];
  const rowH = 16, boxH = rowH * (rows.length + 1);
  doc.setDrawColor(0); doc.setLineWidth(0.7);
  doc.rect(bx, by, bw, boxH);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("*REQUEST FOR QUOTATION", bx + bw / 2, by + 11.5, { align: "center" });
  doc.setFontSize(8.5);
  const valX = bx + 96, valW = bx + bw - 4 - valX;
  rows.forEach((r, i) => {
    const ry = by + rowH * (i + 1);
    doc.line(bx, ry, bx + bw, ry);
    doc.setFont("helvetica", "bold"); doc.text(r[0], bx + 4, ry + 11);
    doc.setFont("helvetica", "normal");
    if (r[0] === "Please reply by") doc.setTextColor(200, 30, 30);
    const val = `: ${r[1]}`;
    let fs = 8.5;
    while (fs > 6 && doc.getTextWidth(val) > valW) { fs -= 0.5; doc.setFontSize(fs); }
    doc.text(val, valX, ry + 11);
    doc.setFontSize(8.5);
    doc.setTextColor(0);
  });

  // ── Project + intro ──
  let py = Math.max(ly, by + boxH) + 16;
  doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(`PROJECT: ${g.project_name || ""}`, M, py); py += 15;
  doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(80);
  doc.text("We invite you to quote your best price and delivery for the following :-", M, py);
  doc.setTextColor(0); py += 6;

  // ── Items table — Unit Price / Total left BLANK for the supplier ──
  const descs = items.map((it) => String(it.description || ""));
  const colours = items.map((it) => (it.colour ? String(it.colour).toUpperCase() : ""));
  const head = [["Item", "Descriptions", "Qty", "Unit", `Unit Price (${sym})`, `Total (${sym})`]];
  const body = items.map((it, i) => [
    i + 1,
    descs[i] + (colours[i] ? `\n${colours[i]}` : ""),
    it.qty ?? "",
    it.unit || "",
    "", // supplier fills
    "", // supplier fills
  ]);

  autoTable(doc, {
    startY: py + 8,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4, lineColor: [140, 140, 140], lineWidth: 0.5, textColor: 20, valign: "middle", minCellHeight: 22 },
    headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: "bold", halign: "center", lineColor: [0, 0, 0], lineWidth: 0.7 },
    columnStyles: { 0: { cellWidth: 34, halign: "center" }, 1: { cellWidth: 230, valign: "top" }, 2: { cellWidth: 40, halign: "center" }, 3: { cellWidth: 45, halign: "center" }, 4: { cellWidth: 72, halign: "right" }, 5: { cellWidth: 93, halign: "right" } },
    margin: { left: M, right: M },
    willDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 1 && colours[data.row.index]) {
        data.cell.styles.textColor = [255, 255, 255];
      }
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 1 && colours[data.row.index]) {
        const x = data.cell.x + 4, w = data.cell.width - 8;
        doc.setFontSize(9); doc.setFont("helvetica", "normal");
        let ty = data.cell.y + 4 + 7;
        doc.setTextColor(20, 20, 20);
        doc.splitTextToSize(descs[data.row.index], w).forEach((ln) => { doc.text(ln, x, ty); ty += 10.5; });
        doc.setTextColor(200, 30, 30);
        doc.splitTextToSize(colours[data.row.index], w).forEach((ln) => { doc.text(ln, x, ty); ty += 10.5; });
        doc.setTextColor(0);
      }
    },
    foot: [[{ content: "TOTAL", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } }, { content: "", styles: {} }]],
    footStyles: { fillColor: [255, 255, 255], textColor: 0, lineColor: [0, 0, 0], lineWidth: 0.7 },
    didDrawPage: () => {
      let fy = H - 46;
      if (certs) {
        const scale = Math.min(220 / certs.w, 26 / certs.h);
        try { doc.addImage(certs.dataUrl, certs.fmt, (W - certs.w * scale) / 2, H - 78, certs.w * scale, certs.h * scale); } catch { /* ignore */ }
      }
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(110);
      COMPANY.forEach((ln, i) => doc.text(ln, W / 2, fy + i * 10, { align: "center" }));
      doc.setTextColor(0);
    },
  });

  // ── Quotation terms + supplier signature ──
  let y = doc.lastAutoTable.finalY + 22;
  if (y > H - 150) { doc.addPage(); y = 90; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0);
  doc.text("Please also confirm:", M, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  ["Price validity : ______________________", "Lead time / delivery : ______________________", "Payment terms : ______________________", "Remarks : ______________________________________________"].forEach((ln) => { doc.text(ln, M, y); y += 14; });

  // Supplier signature block (right side)
  y += 16;
  const sx = W - M - 210;
  if (y > H - 80) { doc.addPage(); y = 90; }
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(0);
  doc.text("Quotation submitted by (Supplier)", sx, y);
  doc.setLineWidth(0.6); doc.line(sx, y + 34, W - M, y + 34);
  doc.setFontSize(8); doc.setTextColor(110); doc.text("Name / Signature / Company stamp / Date", sx, y + 44);
  doc.setTextColor(0);

  doc.save(`${rfqRef(g)}.pdf`);
}

// ── Excel ────────────────────────────────────────────────────────────────────
export async function exportRfqExcel(group) {
  const g = group || {};
  const sup = g.supplier || {};
  const items = g.items || [];
  const sym = CUR_SYM[g.currency] || g.currency || "S$";

  const wb = new ExcelJS.Workbook();
  wb.creator = "InventoryOpz";
  wb.created = new Date();
  const ws = wb.addWorksheet("Quotation Request");

  const COLS = 6; // Item · Description · Qty · Unit · Unit Price · Total
  const lastCol = String.fromCharCode(64 + COLS); // "F"
  const indigo = "FF6366F1", ink = "FF1E1B4B", muted = "FF6B7280", zebra = "FFF5F5FF", border = "FFCBD5E1";

  // Title
  ws.mergeCells(`A1:${lastCol}1`);
  const t = ws.getCell("A1");
  t.value = "REQUEST FOR QUOTATION";
  t.font = { bold: true, size: 15, color: { argb: ink } };
  ws.getRow(1).height = 24;

  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell("A2").value = "Bond Building Products Pte Ltd · 8 Jalan Kilang Barat #01-02 Singapore 159351";
  ws.getCell("A2").font = { size: 10, color: { argb: muted } };

  // Meta block
  const meta = [
    ["RFQ Ref.", rfqRef(g)],
    ["Date", todayStr()],
    ["Please reply by", fmtDate(g.reply_by) || ""],
    ["Supplier", sup.name || g.supplier_name || ""],
    ["Attn", sup.contact_person || ""],
    ["Project", g.project_name || ""],
    ["Our PR No.", g.pr_no || ""],
  ];
  let r = 4;
  meta.forEach(([k, v]) => {
    ws.getCell(`A${r}`).value = k;
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: muted }, size: 10 };
    ws.mergeCells(`B${r}:${lastCol}${r}`);
    ws.getCell(`B${r}`).value = v;
    ws.getCell(`B${r}`).font = { size: 11, color: { argb: ink } };
    r += 1;
  });
  r += 1; // spacer

  ws.mergeCells(`A${r}:${lastCol}${r}`);
  ws.getCell(`A${r}`).value = "Please quote your best price and delivery for the following. Leave the Unit Price and Total columns for us — fill them in and return.";
  ws.getCell(`A${r}`).font = { italic: true, size: 10, color: { argb: muted } };
  r += 2;

  // Header row
  const headerRow = ws.getRow(r);
  ["Item", "Description", "Qty", "Unit", `Unit Price (${sym})`, `Total (${sym})`].forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: indigo } };
    cell.alignment = { vertical: "middle", horizontal: i >= 2 ? "center" : "left" };
    cell.border = { bottom: { style: "thin", color: { argb: border } } };
  });
  headerRow.height = 20;
  const headerRowNum = r;
  r += 1;

  // Item rows — Unit Price / Total left blank
  items.forEach((it, i) => {
    const row = ws.getRow(r);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = it.colour ? `${it.description}\n${String(it.colour).toUpperCase()}` : it.description;
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.getCell(3).value = Number(it.qty) || 0;
    row.getCell(4).value = it.unit || "";
    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(3).alignment = { horizontal: "center" };
    row.getCell(4).alignment = { horizontal: "center" };
    // 5 (unit price) + 6 (total) intentionally blank for the supplier
    if (i % 2 === 1) {
      for (let c = 1; c <= COLS; c++) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    }
    r += 1;
  });

  // Total row
  const totalRow = ws.getRow(r);
  ws.mergeCells(`A${r}:E${r}`);
  totalRow.getCell(1).value = "TOTAL";
  totalRow.getCell(1).alignment = { horizontal: "right" };
  totalRow.getCell(1).font = { bold: true, color: { argb: ink } };
  totalRow.getCell(6).value = ""; // supplier fills
  r += 2;

  // Terms
  ["Price validity:", "Lead time / delivery:", "Payment terms:", "Remarks:", "", "Quotation submitted by (Name / Signature / Company stamp / Date):"].forEach((line) => {
    ws.getCell(`A${r}`).value = line;
    ws.getCell(`A${r}`).font = { size: 10, color: { argb: ink } };
    r += 1;
  });

  // Column widths
  const widths = [8, 46, 8, 10, 16, 16];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: "frozen", ySplit: headerRowNum }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${rfqRef(g)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
