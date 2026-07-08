// ============================================================
// Canonical month-key helpers.
//
// Monthly data (target/claimed/received/achieved) is stored as a JSON object
// keyed by a month label like "June'25". Those labels mirror the client's
// Excel headers and are IRREGULAR — some abbreviated to 3 letters, some to 4,
// and the spelling differs between years:
//
//   2025 -> Jan Feb Mar Apr May June July Aug Sept Oct Nov Dec
//   2026 -> Jan Feb Mar Apr May Jun  July Aug Sept Oct Nov Dec
//                                ^^^ note: Jun in '26, June in '25
//
// The dashboard reads these maps by exact string key, so a mismatched
// spelling ("Jun'25" vs "June'25") silently reads as 0 — the payment is
// invisible even though it is present in the data and counted in the totals.
//
// Everything that reads or writes a month key must route through here.
// ============================================================

const CANONICAL_LABELS = {
  2025: ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"],
  2026: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "July", "Aug", "Sept", "Oct", "Nov", "Dec"],
};

// Years outside the client's sheet have no prescribed spelling; use plain
// 3-letter abbreviations so the keys stay stable and round-trip cleanly.
const DEFAULT_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Every spelling we accept on input, mapped to a 0-11 index.
const MONTH_IDX = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4,
  Jun: 5, June: 5,
  Jul: 6, July: 6,
  Aug: 7,
  Sep: 8, Sept: 8, September: 8,
  Oct: 9, Nov: 10, Dec: 11,
};

/** Parse "July'26" -> { year: 2026, idx: 6 }. Returns null if unparseable. */
export function monthMeta(key) {
  const m = String(key).match(/^([A-Za-z]+)'(\d{2})$/);
  if (!m) return null;
  const idx = MONTH_IDX[m[1]];
  if (idx === undefined) return null;
  return { year: 2000 + parseInt(m[2], 10), idx };
}

/** Build the canonical key for a given year + 0-11 month index. */
export function makeMonthKey(year, monthIdx) {
  const labels = CANONICAL_LABELS[year] || DEFAULT_LABELS;
  return `${labels[monthIdx]}'${String(year).slice(2)}`;
}

/** Re-spell any accepted month key into its canonical form. Unparseable keys pass through untouched. */
export function canonicalMonthKey(key) {
  const meta = monthMeta(key);
  return meta ? makeMonthKey(meta.year, meta.idx) : key;
}

/**
 * Re-key a monthly map into canonical spellings.
 *
 * If a map somehow holds two spellings of the same month ("Jun'25" and
 * "June'25"), the value stored under the already-canonical key wins. We do
 * NOT sum them: these maps hold percentages as often as dollars, and adding
 * two readings of the same month would be wrong in both cases.
 */
export function normalizeMonthMap(obj) {
  const out = {};
  const fromCanonical = new Set();
  Object.entries(obj || {}).forEach(([key, value]) => {
    const ck = canonicalMonthKey(key);
    const wasCanonical = ck === key;
    if (!(ck in out) || (wasCanonical && !fromCanonical.has(ck))) {
      out[ck] = value;
      if (wasCanonical) fromCanonical.add(ck);
    }
  });
  return out;
}

/** Sort month keys chronologically, tolerant of any accepted spelling. */
export function sortMonthKeys(keys) {
  return [...keys].sort((a, b) => {
    const ma = monthMeta(a), mb = monthMeta(b);
    if (!ma || !mb) return 0;
    return ma.year !== mb.year ? ma.year - mb.year : ma.idx - mb.idx;
  });
}
