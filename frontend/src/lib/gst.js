// GST helpers — read-only view of the values the DATABASE computes.
//
// purchase_orders.gst_rate / gst_amount are Postgres generated columns: GST is
// charged on local-supplier BUY POs only (overseas suppliers and internal STOCK
// POs excluded). Nothing here recalculates GST — doing so would risk disagreeing
// with the stored figure. `amount` is always NET; gross = amount + gst_amount.
const num = (v) => Number(v) || 0;

export const netAmount = (po) => num(po?.amount);
export const gstAmount = (po) => num(po?.gst_amount);
export const grossAmount = (po) => netAmount(po) + gstAmount(po);

// True for POs that carry GST — driven by the stored rate, so a local PO whose
// value is still 0 (unpriced) is still recognised as GST-bearing.
export const hasGst = (po) => num(po?.gst_rate) > 0 || gstAmount(po) > 0;

// "9" for 0.09 — label the GST line from stored data rather than a hardcoded 9%,
// so the rate lives in exactly one place (the column definition).
export const gstRatePct = (po) => {
  const pct = num(po?.gst_rate) * 100;
  return Number.isInteger(pct) ? pct : Number(pct.toFixed(2));
};
