// src/utils/auditTrail.js
// Helpers for the PR/PO audit trail (pr_approvals / po_approvals).
//
//  • buildPrEditDiff() — turns an old PR + the incoming edit payload into a
//    structured before→after diff, stored in the `details` JSONB column.
//  • redactDetails()   — strips price fields server-side for roles without
//    see_pr_price / see_po_price. Redaction MUST happen here, not in the UI:
//    hiding a price in the browser still ships it in the API response.
//
// Note on item keying: a single visual PR line can be split across several
// pr_items rows (one per source pallet + a buy row), so line_no is NOT unique.
// We key items on "line_no::description". A renamed description therefore reads
// as a remove + an add rather than a rename — accurate, if slightly verbose.

// Fields whose values are prices and must be hidden from unprivileged roles.
const PRICE_FIELDS = new Set(["Unit Price", "Stock Unit Price"]);

const HEADER_FIELDS = {
  job_no: "Job No", project_name: "Project", location: "Location",
  date_required: "Date Required", pic: "PIC", checked_by: "Checked By",
  approved_by: "Approved By", remarks: "Remarks", date_issued: "Date Issued",
};

const ITEM_FIELDS = {
  profile_code: "Profile Code", colour: "Colour", qty: "Qty", unit: "Unit",
  remarks: "Remarks", stock_qty: "Stock Qty", buy_qty: "Buy Qty",
  supplier_name: "Supplier", stock_location: "Stock Location", unit_price: "Unit Price",
};
const NUMERIC_ITEM_FIELDS = new Set(["qty", "stock_qty", "buy_qty", "unit_price"]);

// Normalise a value for comparison: null/undefined → "", Date → YYYY-MM-DD.
function norm(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}
const numEq = (a, b) => (Number(a) || 0) === (Number(b) || 0);
const itemKey = (it) => `${Number(it.line_no) || 0}::${norm(it.description).toLowerCase()}`;

/**
 * Diff an existing PR (with .items) against an incoming edit payload.
 * @returns {object|null} details object, or null when nothing changed.
 */
function buildPrEditDiff(oldPr, payload) {
  const fields = [];
  for (const [key, label] of Object.entries(HEADER_FIELDS)) {
    // Only compare keys the client actually sent (an absent key is "unchanged").
    if (!(key in payload)) continue;
    const before = norm(oldPr[key]);
    const after = norm(payload[key]);
    if (before !== after) fields.push({ field: label, from: before, to: after });
  }

  const oldItems = oldPr.items || [];
  const newItems = (payload.items || []).filter((it) => it?.description?.trim());
  const oldMap = new Map(oldItems.map((it) => [itemKey(it), it]));
  const newMap = new Map(newItems.map((it) => [itemKey(it), it]));

  const items = [];
  for (const [key, oldIt] of oldMap) {
    if (newMap.has(key)) continue;
    items.push({ line: Number(oldIt.line_no) || 0, change: "removed", description: norm(oldIt.description) });
  }
  for (const [key, newIt] of newMap) {
    if (oldMap.has(key)) continue;
    items.push({ line: Number(newIt.line_no) || 0, change: "added", description: norm(newIt.description) });
  }
  for (const [key, newIt] of newMap) {
    const oldIt = oldMap.get(key);
    if (!oldIt) continue;
    const diffs = [];
    for (const [f, label] of Object.entries(ITEM_FIELDS)) {
      if (!(f in newIt)) continue;
      const changed = NUMERIC_ITEM_FIELDS.has(f)
        ? !numEq(oldIt[f], newIt[f])
        : norm(oldIt[f]) !== norm(newIt[f]);
      if (!changed) continue;
      const entry = { field: label, from: norm(oldIt[f]), to: norm(newIt[f]) };
      if (PRICE_FIELDS.has(label)) entry.price = true; // marks it for redaction
      diffs.push(entry);
    }
    if (diffs.length) items.push({ line: Number(newIt.line_no) || 0, change: "modified", description: norm(newIt.description), diffs });
  }

  if (!fields.length && !items.length) return null;
  items.sort((a, b) => a.line - b.line);
  return { fields, items };
}

/**
 * Remove price values from a details object for users who may not see prices.
 * Returns a copy; the original is untouched.
 */
function redactDetails(details, canSeePrice) {
  if (!details || canSeePrice) return details || null;
  const scrub = (d) => (d.price ? { ...d, from: null, to: null, redacted: true } : d);
  return {
    fields: (details.fields || []).map(scrub),
    items: (details.items || []).map((it) =>
      it.diffs ? { ...it, diffs: it.diffs.map(scrub) } : it
    ),
  };
}

module.exports = { buildPrEditDiff, redactDetails, PRICE_FIELDS };
