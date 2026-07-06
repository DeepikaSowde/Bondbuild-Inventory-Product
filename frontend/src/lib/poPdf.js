// lib/poPdf.js
// Per-PO "Purchase Order" PDF, modelled on the Bond Building paper form.
//   • BUY   PO → full supplier form + supplier's obligations block
//   • STOCK PO → simplified (source location instead of supplier, no obligations)
// Prices (Rate / Price / TOTAL) are shown only when opts.showPrice is true
// (driven by the caller's see_po_price permission).
//
// Logo/cert images load at runtime from /public (text fallback if missing).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const COMPANY = [
  "8 Jalan Kilang Barat #01-02 Singapore 159351",
  "tel 65 6558 7551  ·  fax 65 6558 7556  ·  info@bondbuild.com.sg",
  "www.bondbuild.com.sg  ·  Reg.no. 200508891H",
];

const OBLIGATIONS = [
  "The supplier's obligations:-",
  "a) Deliver the goods exactly as ordered at the agreed time.",
  "b) Guarantee the goods to be free from faults of which the buyer could not be aware at time of purchase.",
  "c) Ensure that all product(s) and service(s) provided to our company meets our Quality, Environmental, Health & Safety Requirements.",
  "d) Ensure that all product(s) and service(s) provided to our company meets applicable legal and regulatory requirements.",
  "e) For job to be performed on-behalf of our company, it is the responsibility of the contractors / vendors / suppliers to take all reasonably practicable measures to ensure all safety considerations are duly taken prior to commencement of the job.",
  "f) Ensure that our company's Contractor Guideline are read, understood and communicated to all affected personnel.",
];

const fmtDate = (v) => {
  if (!v) return "";
  const s = String(v);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
const num2 = (n) => (Number(n) > 0 ? Number(n).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

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

export async function exportPoPdf(po, opts = {}) {
  const showPrice = !!opts.showPrice;
  const isStock = po.po_type === "STOCK";
  const items = po.items || [];
  const sup = po.supplier || {};

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

  // ── Left block: supplier (buy) or source (stock) ──
  let ly = 40;
  doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  if (isStock) {
    doc.text("FROM STOCK", M, ly); ly += 15;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    doc.text(`Source location : ${po.source_location || "Stock"}`, M, ly); ly += 13;
  } else {
    doc.text(String(po.supplier_name || "").toUpperCase(), M, ly, { maxWidth: 300 }); ly += 15;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    if (sup.address) {
      for (const line of String(sup.address).split("\n")) { doc.text(line, M, ly, { maxWidth: 300 }); ly += 12; }
    }
    const telFax = [sup.phone && `Tel: ${sup.phone}`, sup.fax && `Fax: ${sup.fax}`].filter(Boolean).join("    ");
    if (telFax) { doc.text(telFax, M, ly); ly += 12; }
    if (sup.contact_person) { doc.text(`Attn: ${sup.contact_person}`, M, ly); ly += 12; }
  }

  // ── Right info box ──
  const bx = W - M - 210, bw = 210, by = 70;
  const rows = [
    ["*Our Ref./PO No.", po.po_no || ""],
    ["*Date of Agreement", fmtDate(po.po_date)],
    ...(isStock ? [] : [["Payment Terms", "30 DAYS"]]),
    ["Delivery Date", fmtDate(po.tracking?.shipment_eta) || po.required_date || ""],
  ];
  const rowH = 16, boxH = rowH * (rows.length + 1);
  doc.setDrawColor(0); doc.setLineWidth(0.7);
  doc.rect(bx, by, bw, boxH);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(isStock ? "*STOCK ISSUE" : "*PURCHASE ORDER", bx + bw / 2, by + 11.5, { align: "center" });
  doc.setFontSize(8.5);
  rows.forEach((r, i) => {
    const ry = by + rowH * (i + 1);
    doc.line(bx, ry, bx + bw, ry);
    doc.setFont("helvetica", "bold"); doc.text(r[0], bx + 4, ry + 11);
    doc.setFont("helvetica", r[0] === "Payment Terms" ? "bold" : "normal");
    if (r[0] === "Delivery Date") doc.setTextColor(200, 30, 30);
    else if (r[0] === "Payment Terms") doc.setTextColor(37, 99, 235);
    doc.text(`: ${r[1]}`, bx + 96, ry + 11, { maxWidth: bw - 100 });
    doc.setTextColor(0);
  });

  // ── Project + intro ──
  let py = Math.max(ly, by + boxH) + 16;
  doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(`PROJECT: ${po.project_name || ""}`, M, py); py += 15;
  if (!isStock) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(80);
    doc.text("With reference to the above, we would like to confirm the order as follow :-", M, py);
    doc.setTextColor(0); py += 6;
  }

  // ── Items table ──
  const descs = items.map((it) => String(it.description || ""));
  const colours = items.map((it) => (it.colour ? String(it.colour).toUpperCase() : ""));
  const head = showPrice
    ? [["Item", "Descriptions", "Qty", "Unit", "Rate (S$)", "Price (S$)"]]
    : [["Item", "Descriptions", "Qty", "Unit"]];
  const body = items.map((it, i) => {
    const base = [i + 1, descs[i] + (colours[i] ? `\n${colours[i]}` : ""), it.qty ?? "", it.unit || ""];
    return showPrice ? [...base, num2(it.unit_price), num2((Number(it.qty) || 0) * (Number(it.unit_price) || 0))] : base;
  });
  const colStyles = showPrice
    ? { 0: { cellWidth: 34, halign: "center" }, 1: { cellWidth: 230, valign: "top" }, 2: { cellWidth: 40, halign: "center" }, 3: { cellWidth: 45, halign: "center" }, 4: { cellWidth: 72, halign: "right" }, 5: { cellWidth: 93, halign: "right" } }
    : { 0: { cellWidth: 40, halign: "center" }, 1: { cellWidth: 359, valign: "top" }, 2: { cellWidth: 55, halign: "center" }, 3: { cellWidth: 60, halign: "center" } };

  autoTable(doc, {
    startY: py + 8,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4, lineColor: [140, 140, 140], lineWidth: 0.5, textColor: 20, valign: "middle" },
    headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: "bold", halign: "center", lineColor: [0, 0, 0], lineWidth: 0.7 },
    columnStyles: colStyles,
    margin: { left: M, right: M },
    // custom-draw the Descriptions cell so the colour appends in red
    willDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 1 && colours[data.row.index]) {
        data.cell.styles.textColor = [255, 255, 255]; // hide native text; we redraw below
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
    foot: showPrice ? [[{ content: "TOTAL", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } }, { content: num2(po.amount), styles: { halign: "right", fontStyle: "bold" } }]] : undefined,
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

  // ── Obligations (buy only) + signature ──
  let y = doc.lastAutoTable.finalY + 20;
  const needed = (isStock ? 0 : 96) + 70;
  if (y > H - needed) { doc.addPage(); y = 90; }

  if (!isStock) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(0);
    OBLIGATIONS.forEach((para, i) => {
      const lines = doc.splitTextToSize(para, W - 2 * M);
      if (i === 0) doc.setFont("helvetica", "bold"); else doc.setFont("helvetica", "normal");
      lines.forEach((ln) => { doc.text(ln, M, y); y += 11; });
      y += 1;
    });
    y += 14;
  }

  // Signature block (right side)
  const sx = W - M - 210;
  if (y > H - 90) { doc.addPage(); y = 90; }
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(0);
  doc.text("for and on behalf of the Purchaser", sx, y);
  doc.setFont("helvetica", "bold");
  doc.text("BOND BUILDING PRODUCTS PTE. LTD.", sx, y + 13);
  doc.setFont("helvetica", "normal");
  doc.text(String(po.prepared_by || ""), sx, y + 44);
  doc.setLineWidth(0.6); doc.line(sx, y + 48, W - M, y + 48);
  doc.setFontSize(8); doc.setTextColor(110); doc.text("Signature", sx, y + 58);
  doc.setTextColor(0);

  const fname = `${String(po.po_no || "PO").replace(/\//g, "-")}.pdf`;
  doc.save(fname);
}
