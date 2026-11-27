// lib/pdfCjk.js
// Chinese / Japanese (CJK) text in the jsPDF documents (PR, PO, RFQ).
//
// jsPDF's built-in Helvetica has no CJK glyphs, so Chinese text printed as garbage
// (e.g. a PR remark '请在周五前交货' came out as 'NûOUgPe™Y,g…'). When — and only
// when — a document's data contains CJK text, we load Noto Sans SC (SIL OFL, see
// /public/fonts/OFL.txt) and print every string that contains CJK in that font.
// Everything else stays Helvetica, so English-only PDFs are unchanged and never
// download the 10 MB font. jsPDF embeds only the glyphs used, so the PDF stays small.
//
// Usage, right after `new jsPDF(...)`:
//   await enableCjk(doc, pr);                 // pr / po / rfq group — scanned for CJK
//   … in each autoTable: didParseCell: (d) => { cjkCell(doc, d); … }
const FONT = "NotoSansSC";
const FILE = "NotoSansSC-Regular.ttf";
const URL = `/fonts/${FILE}`;

// CJK punctuation, kana, bopomofo, ideographs (+ ext. A, compatibility), fullwidth forms.
const CJK_RE = /[⺀-⿟　-ヿ㄀-ㄯ㆐-ㇿ㐀-䶿一-鿿豈-﫿︰-﹏＀-￯]/;

export const hasCjk = (v) =>
  CJK_RE.test(Array.isArray(v) ? v.join("\n") : String(v ?? ""));

// One download per page session; a failure clears the cache so a later PDF retries.
let fontPromise = null;
function loadFontBase64() {
  if (!fontPromise) {
    fontPromise = fetch(URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        // The host rewrites unknown paths to index.html (200), so check it is really
        // a TrueType font (0x00010000) before handing it to jsPDF.
        if (bytes.length < 4 || bytes[0] !== 0 || bytes[1] !== 1 || bytes[2] !== 0 || bytes[3] !== 0)
          throw new Error("not a TrueType font");
        let s = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
          s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s);
      })
      .catch((e) => { fontPromise = null; throw e; });
  }
  return fontPromise;
}

/**
 * If `data` contains CJK text, register the CJK font on `doc` and make doc.text /
 * splitTextToSize / getTextWidth switch to it for any string containing CJK.
 * Returns true when CJK support is active. Never throws: if the font can't be
 * loaded the PDF is still produced, exactly as before.
 */
export async function enableCjk(doc, data) {
  let json = "";
  try { json = JSON.stringify(data) ?? ""; } catch { /* circular — treat as none */ }
  if (!hasCjk(json)) return false;

  let b64;
  try { b64 = await loadFontBase64(); }
  catch (e) { console.warn("[pdf] Chinese font unavailable — CJK text may not print:", e.message); return false; }

  doc.addFileToVFS(FILE, b64);
  // The font has a single (regular) weight, and jsPDF embeds a copy per registered
  // style, so register "normal" only: CJK strings always print regular, even where
  // the surrounding text is bold (e.g. the "REMARK:" line).
  doc.addFont(FILE, FONT, "normal");
  doc.__cjk = true;

  // Run `fn` with the CJK font active when `t` contains CJK, then restore the font.
  const withFont = (t, fn) => {
    if (!hasCjk(t)) return fn();
    const cur = doc.getFont();
    if (cur.fontName === FONT) return fn();
    doc.setFont(FONT, "normal");
    try { return fn(); } finally { doc.setFont(cur.fontName, cur.fontStyle); }
  };
  const text = doc.text, split = doc.splitTextToSize, width = doc.getTextWidth;
  doc.text = function (t, ...rest) { return withFont(t, () => text.call(doc, t, ...rest)); };
  doc.splitTextToSize = function (t, ...rest) { return withFont(t, () => split.call(doc, t, ...rest)); };
  doc.getTextWidth = function (t, ...rest) { return withFont(t, () => width.call(doc, t, ...rest)); };
  return true;
}

// autoTable hook: a cell whose text contains CJK prints in the CJK font (keeps its
// colour/size; bold prints regular). Call from didParseCell.
export function cjkCell(doc, data) {
  if (doc.__cjk && hasCjk(data.cell.text)) { data.cell.styles.font = FONT; data.cell.styles.fontStyle = "normal"; }
}
