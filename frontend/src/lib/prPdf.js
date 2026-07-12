// lib/prPdf.js
// Per-PR "Purchase Requisition Form" PDF, modelled on the Bond Building paper form.
// Uses jsPDF + jspdf-autotable (already in the project via ProcurementExport).
//
// Logo/cert images are loaded at runtime from /public:
//   /bdb-logo.png   — company logo (top-right)      [optional]
//   /bdb-certs.png  — certification strip (footer)  [optional]
// If a file is missing, the PDF falls back to a clean text header/footer.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const COMPANY = [
  "8 Jalan Kilang Barat #01-02 Singapore 159351",
  "tel 65 6558 7551  ·  fax 65 6558 7556  ·  info@bondbuild.com.sg",
  "www.bondbuild.com.sg  ·  Reg.no. 200508891H",
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
// PR No printed as a bare per-job number (JN426/PR-001 -> 001, legacy PR106 -> 106)
// per the paper form; the Job No prints in its own field, so only the tail is shown.
const prNumberOnly = (prNo) => String(prNo || "").split("/").pop().replace(/^PR-?/i, "").trim();

const STATUS_COLOR = {
  APPROVED: [5, 150, 105], PENDING: [217, 119, 6], SEND_BACK: [217, 119, 6],
  REJECTED: [220, 38, 38], PO_RAISED: [99, 102, 241],
};

// Load an image from /public as { dataUrl, w, h, fmt }, or null if missing.
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

export async function exportPrPdf(pr) {
  const items = pr.items || [];
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  const [logo, certs] = await Promise.all([loadImage("/bdb-logo.png"), loadImage("/bdb-certs.png")]);

  // ── Header: title + logo ──
  if (logo) {
    const scale = Math.min(100 / logo.w, 52 / logo.h);
    const lw = logo.w * scale, lh = logo.h * scale;
    // sit fully above the info box (top at y=72) with clearance
    try { doc.addImage(logo.dataUrl, logo.fmt, W - M - lw, 8, lw, lh); } catch { /* ignore */ }
  } else {
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(178, 42, 30);
    doc.text("bdb", W - M, 40, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(110);
    doc.text("bond building products pte ltd", W - M, 52, { align: "right" });
  }
  doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("PURCHASE REQUISITION FORM", W / 2, 50, { align: "center" });

  // status badge (top-left)
  const st = String(pr.status || "").toUpperCase();
  if (st) {
    const col = STATUS_COLOR[st] || [107, 114, 128];
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    const label = st.replace("_", " ");
    const tw = doc.getTextWidth(label) + 14;
    doc.setFillColor(col[0], col[1], col[2]);
    doc.roundedRect(M, 30, tw, 15, 3, 3, "F");
    doc.setTextColor(255); doc.text(label, M + 7, 40.5);
    doc.setTextColor(0);
  }

  // ── Info box ──
  const boxTop = 72, boxH = 70;
  const rightX = W - M - 168;
  doc.setDrawColor(0); doc.setLineWidth(1);
  doc.rect(M, boxTop, W - 2 * M, boxH);
  doc.setLineWidth(0.5);
  doc.line(rightX - 12, boxTop, rightX - 12, boxTop + boxH); // divider before right column

  doc.setFontSize(10);
  // Left column
  doc.setFont("helvetica", "bold");
  doc.text("Project Name :", M + 8, boxTop + 26);
  doc.text("Job No. :", M + 8, boxTop + 50);
  doc.setFont("helvetica", "normal");
  doc.text(String(pr.project_name || ""), M + 92, boxTop + 26, { maxWidth: 130 });
  doc.text(String(pr.job_no || ""), M + 92, boxTop + 50, { maxWidth: 130 });
  // Middle: work-scope (Location) in red bold. Kept strictly between the left
  // values and the divider, and vertically centred regardless of line count,
  // so it never bleeds into the "PR No." column.
  if (pr.location) {
    const midLeft = M + 232;        // clears the left-column values
    const midRight = rightX - 12;   // the divider line
    const midCX = (midLeft + midRight) / 2;
    const midW = midRight - midLeft - 8;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(200, 30, 30);
    const locLines = doc.splitTextToSize(String(pr.location).toUpperCase(), midW);
    const lineH = 11;
    const startY = boxTop + boxH / 2 - ((locLines.length - 1) * lineH) / 2 + 3;
    doc.text(locLines, midCX, startY, { align: "center" });
    doc.setFontSize(10); doc.setTextColor(0);
  }
  // Right column
  doc.setFont("helvetica", "bold");
  doc.text("PR No. :", rightX, boxTop + 16);
  doc.text("Date Issued :", rightX, boxTop + 32);
  doc.text("Date Required :", rightX, boxTop + 48);
  doc.text("PIC :", rightX, boxTop + 64);
  doc.setFont("helvetica", "normal");
  const rvX = rightX + 84;
  const rvW = W - M - rvX - 6;   // keep values inside the box's right edge
  doc.text(prNumberOnly(pr.pr_no), rvX, boxTop + 16, { maxWidth: rvW });
  doc.text(fmtDate(pr.date_issued), rvX, boxTop + 32, { maxWidth: rvW });
  doc.text(fmtDate(pr.date_required), rvX, boxTop + 48, { maxWidth: rvW });
  doc.text(String(pr.pic || ""), rvX, boxTop + 64, { maxWidth: rvW });

  // ── Items table ──
  // A material can be stored as several rows (one per source pallet + a buy row)
  // sharing a line_no. Group them back so the requisition prints one line per
  // material with the total qty and the buy supplier(s).
  const order = [];
  const byLine = new Map();
  for (const it of items) {
    const key = it.line_no != null ? `l${it.line_no}` : `id${it.id}`;
    if (!byLine.has(key)) { byLine.set(key, { ...it, qty: 0, _suppliers: [] }); order.push(key); }
    const g = byLine.get(key);
    g.qty += Number(it.qty) || 0;
    if (it.supplier_name && !g._suppliers.includes(it.supplier_name)) g._suppliers.push(it.supplier_name);
  }
  const grouped = order.map((k) => byLine.get(k));
  const body = grouped.map((it, i) => [
    i + 1,
    it.description || "",
    it.colour || "",
    it.qty || "",
    it.unit || "",
    it._suppliers.join(", "),
    it.remarks || "",
  ]);
  // pad with blank ruled rows to resemble the paper form
  const MIN_ROWS = 14;
  for (let i = body.length; i < MIN_ROWS; i++) body.push(["", "", "", "", "", "", ""]);

  autoTable(doc, {
    startY: boxTop + boxH + 10,
    head: [["ITEM", "DESCRIPTIONS", "COLOUR", "QTY", "UNIT", "P.O. NO. / SUPPLIER", "REMARKS"]],
    body,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4, lineColor: [180, 180, 180], lineWidth: 0.5, textColor: 20, valign: "middle" },
    headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: "bold", halign: "center", lineColor: [0, 0, 0], lineWidth: 0.7 },
    columnStyles: {
      0: { cellWidth: 34, halign: "center" },
      1: { cellWidth: 174 },
      2: { cellWidth: 52, halign: "center" },
      3: { cellWidth: 40, halign: "center" },
      4: { cellWidth: 46, halign: "center" },
      5: { cellWidth: 100 },
      6: { cellWidth: 67 },
    },
    margin: { left: M, right: M },
    didParseCell: (data) => {
      // URGENT remarks in red bold, like the paper form
      if (data.section === "body" && data.column.index === 6 && /urgent/i.test(String(data.cell.raw || ""))) {
        data.cell.styles.textColor = [200, 30, 30];
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: () => {
      // company footer on every page
      let fy = H - 46;
      if (certs) {
        const scale = Math.min(220 / certs.w, 26 / certs.h);
        const cw = certs.w * scale, ch = certs.h * scale;
        try { doc.addImage(certs.dataUrl, certs.fmt, (W - cw) / 2, H - 78, cw, ch); } catch { /* ignore */ }
      }
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(110);
      COMPANY.forEach((ln, i) => doc.text(ln, W / 2, fy + i * 10, { align: "center" }));
      doc.setTextColor(0);
    },
  });

  // ── Signatory block ──
  let sy = doc.lastAutoTable.finalY + 26;
  // keep it clear of the company footer
  if (sy > H - 120) { doc.addPage(); sy = 90; }
  doc.setFontSize(10); doc.setTextColor(0);
  doc.setFont("helvetica", "bold"); doc.text("Requested by :", M, sy);
  doc.text("Checked by :", M, sy + 22);
  doc.text("Approved by :", M, sy + 44);
  doc.setFont("helvetica", "normal");
  doc.text(String(pr.requested_by || ""), M + 92, sy);
  doc.text(String(pr.checked_by || ""), M + 92, sy + 22);
  doc.text(String(pr.approved_by || ""), M + 92, sy + 44);
  // Approved-by date + signature line (only the approver signs)
  doc.setFont("helvetica", "bold"); doc.text("Date :", M + 250, sy + 44);
  doc.setFont("helvetica", "normal"); doc.text(fmtDate(pr.approved_date), M + 288, sy + 44);
  doc.setFont("helvetica", "bold"); doc.text("Signature :", M + 372, sy + 44);
  doc.setLineWidth(0.6); doc.line(M + 428, sy + 46, W - M, sy + 46);

  // pr_no already carries the job (e.g. JN426/PR-001). Swap the slash for a dash so
  // it's a valid filename, and don't prepend job_no again or it'd be doubled.
  const fname = `${(pr.pr_no || pr.job_no || "PR").replace(/[\\/]+/g, "-")}.pdf`.replace(/\s+/g, "");
  doc.save(fname);
}
