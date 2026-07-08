// ============================================================
// ProjectFormModal.jsx — Add / Edit a project from the dashboard
// Drop in: frontend/src/pages/ProjectFormModal.jsx
// Matches the dashboard dark theme. Auto-calculates totals.
// ============================================================
import { useState, useMemo, useEffect } from "react";
import api from "../services/api";
import { X, Plus, Trash2, Save, Loader2 } from "lucide-react";

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function makeMonthKey(year, monthIdx) {
  return `${MONTH_LABELS[monthIdx]}'${String(year).slice(2)}`;
}
function currentMonthKey() {
  const n = new Date();
  return makeMonthKey(n.getFullYear(), n.getMonth());
}
function nextMonthKey(key) {
  const m = String(key).match(/^([A-Za-z]+)'(\d{2})$/);
  if (!m) return makeMonthKey(new Date().getFullYear(), new Date().getMonth() + 1);
  const yr = 2000 + parseInt(m[2], 10);
  // normalise label to 0-11 index via MONTH_IDX
  const idx = MONTH_IDX[m[1]] ?? 0;
  const nextIdx = (idx + 1) % 12;
  return makeMonthKey(nextIdx === 0 ? yr + 1 : yr, nextIdx);
}
// Dropdown options for Down Payment Month — Jan'25 → Dec'27
const DROPDOWN_MONTHS = (() => {
  const out = [];
  for (let yr = 2025; yr <= 2027; yr++)
    for (let mi = 0; mi < 12; mi++) out.push(makeMonthKey(yr, mi));
  return out;
})();

const STATUSES = ["Upcoming Project", "In Progress", "Completed", "Closed"];
const RISK_LEVELS = [
  { v: "high", l: "High" },
  { v: "medium", l: "Medium" },
  { v: "low", l: "Low" },
];

// Parse a month key like "July'26" -> { year, idx } for "up to today" comparison
const MONTH_IDX = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  June: 5,
  Jul: 6,
  July: 6,
  Aug: 7,
  Sep: 8,
  Sept: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};
function monthMeta(key) {
  const m = String(key).match(/^([A-Za-z]+)'(\d{2})$/);
  if (!m) return null;
  return { year: 2000 + parseInt(m[2], 10), idx: MONTH_IDX[m[1]] ?? 0 };
}
// Sort month keys chronologically (e.g. Jul'26 above Aug'26).
function sortMonths(keys) {
  return [...keys].sort((a, b) => {
    const ma = monthMeta(a), mb = monthMeta(b);
    if (!ma || !mb) return 0;
    return ma.year !== mb.year ? ma.year - mb.year : ma.idx - mb.idx;
  });
}
// Wide month-year range for the per-row picker so past months can be backfilled.
const MONTH_PICKER_OPTIONS = (() => {
  const out = [];
  const cy = new Date().getFullYear();
  for (let yr = cy - 3; yr <= cy + 4; yr++)
    for (let mi = 0; mi < 12; mi++) out.push(makeMonthKey(yr, mi));
  return out;
})();
// Site Progress % = cumulative achieved % up to and including TODAY's month.
// achievedObj values are whole-number percents here (e.g. 20 for 20%).
function cumulativeAchievedPct(achievedObj) {
  const now = new Date();
  const cy = now.getFullYear();
  const ci = now.getMonth();
  let sum = 0;
  Object.entries(achievedObj || {}).forEach(([k, v]) => {
    const meta = monthMeta(k);
    if (!meta) return;
    const pastOrCurrent =
      meta.year < cy || (meta.year === cy && meta.idx <= ci);
    if (pastOrCurrent) {
      const x = parseFloat(v);
      if (!isNaN(x)) sum += x;
    }
  });
  return Math.min(Math.max(sum, 0), 100); // clamp 0..100
}

const C = {
  bg: "#0f1117",
  card: "#1a1d27",
  cardAlt: "#13151e",
  border: "#2a2d3e",
  text: "#e8eaf0",
  textMuted: "#7b8299",
  textDim: "#555b6e",
  green: "#4ade80",
  blue: "#60a5fa",
  amber: "#fbbf24",
  red: "#f87171",
  purple: "#c084fc",
};

const fmt = (v) => `$${Math.round(v || 0).toLocaleString()}`;

const inp = {
  background: C.cardAlt,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  color: C.text,
  outline: "none",
  width: "100%",
};
const lbl = {
  fontSize: 11,
  fontWeight: 600,
  color: C.textMuted,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 5,
  display: "block",
};

export default function ProjectFormModal({ project, onClose, onSaved }) {
  const isEdit = !!project;

  const [form, setForm] = useState({
    project_name: "",
    status: "Upcoming Project",
    contract_sum: "",
    down_payment: "",
    down_payment_month: "",
    site_progress: "",
    claim_till_date: "",
    risk_level: "low",
  });
  const [target, setTarget] = useState({}); // {month: decimal}
  const [claimed, setClaimed] = useState({});
  const [received, setReceived] = useState({}); // {month: dollars}
  const [achieved, setAchieved] = useState({}); // {month: decimal} actual site progress %
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [visibleMonths, setVisibleMonths] = useState([currentMonthKey()]);

  // Suggest the month immediately after the last month present.
  // Seeded from the Down Payment Month when no months exist yet.
  const suggestNextMonth = (months) => {
    const sorted = sortMonths(months);
    let cand = sorted.length
      ? nextMonthKey(sorted[sorted.length - 1])
      : form.down_payment_month
      ? nextMonthKey(form.down_payment_month)
      : currentMonthKey();
    // Skip any month already present so the suggestion is always free.
    let guard = 0;
    while (sorted.includes(cand) && guard++ < 200) cand = nextMonthKey(cand);
    return cand;
  };

  const addMonth = () =>
    setVisibleMonths((prev) => sortMonths([...prev, suggestNextMonth(prev)]));

  // Change a row's month via the picker: move that row's data to the new key,
  // prevent duplicates, and keep rows sorted chronologically.
  const changeMonth = (oldKey, newKey) => {
    if (!newKey || oldKey === newKey || visibleMonths.includes(newKey)) return;
    const rename = (setter) =>
      setter((prev) => {
        if (!(oldKey in prev)) return prev;
        const next = { ...prev };
        next[newKey] = next[oldKey];
        delete next[oldKey];
        return next;
      });
    rename(setTarget);
    rename(setClaimed);
    rename(setReceived);
    rename(setAchieved);
    setVisibleMonths((prev) =>
      sortMonths(prev.map((k) => (k === oldKey ? newKey : k)))
    );
  };

  // Prefill when editing
  useEffect(() => {
    if (project) {
      setForm({
        project_name: project.project_name || project.name || "",
        status: project.status || "Upcoming Project",
        contract_sum: project.contract_sum ?? project.contractSum ?? "",
        down_payment: project.down_payment ?? project.downPayment ?? "",
        down_payment_month:
          project.down_payment_month ?? project.downPaymentMonth ?? "",
        site_progress:
          (project.site_progress ?? project.siteProgress ?? 0) * 100 || "",
        claim_till_date:
          (project.claim_till_date ?? project.claimTillDate ?? 0) * 100 || "",
        risk_level: project.risk_level || project.riskLevel || "low",
      });
      // Stored as decimals (0-1) in DB; show as whole percents in the form.
      const toPct = (obj) => {
        const out = {};
        Object.entries(obj || {}).forEach(([m, v]) => {
          const x = parseFloat(v);
          if (!isNaN(x)) out[m] = x <= 1 ? Math.round(x * 1000) / 10 : x;
        });
        return out;
      };
      const tgt = toPct(project.target_monthly || project.targetMonthly);
      const clm = toPct(project.claimed_monthly || project.claimedMonthly);
      const rcv = project.received_monthly || project.receivedMonthly || {};
      const rawAchieved = project.achieved_monthly || project.achievedMonthly || {};
      const achievedPct = {};
      Object.entries(rawAchieved).forEach(([m, v]) => {
        const x = parseFloat(v);
        if (!isNaN(x)) achievedPct[m] = x <= 1 ? Math.round(x * 1000) / 10 : x;
      });
      setTarget(tgt);
      setClaimed(clm);
      setReceived(rcv);
      setAchieved(achievedPct);

      // Build visible month list from existing data (sorted chronologically)
      const dataMonths = new Set([
        ...Object.keys(tgt), ...Object.keys(clm),
        ...Object.keys(rcv), ...Object.keys(achievedPct),
      ]);
      const sorted = [...dataMonths].sort((a, b) => {
        const ma = monthMeta(a), mb = monthMeta(b);
        if (!ma || !mb) return 0;
        return ma.year !== mb.year ? ma.year - mb.year : ma.idx - mb.idx;
      });
      const curr = currentMonthKey();
      if (!sorted.includes(curr)) sorted.push(curr);
      setVisibleMonths(sorted.length > 0 ? sorted : [curr]);
    }
  }, [project]);

  // Add mode only: when the Down Payment Month changes while the grid is still
  // pristine (a single row, no data entered anywhere), re-seed the first row to
  // the month right after it. Once the user edits data or adds months, leave it.
  const handleDownPaymentMonthChange = (value) => {
    setForm((f) => ({ ...f, down_payment_month: value }));
    if (isEdit) return;
    const noData =
      Object.keys(target).length === 0 &&
      Object.keys(claimed).length === 0 &&
      Object.keys(received).length === 0 &&
      Object.keys(achieved).length === 0;
    if (visibleMonths.length === 1 && noData) {
      setVisibleMonths([value ? nextMonthKey(value) : currentMonthKey()]);
    }
  };

  const num = (v) => {
    const x = parseFloat(v);
    return isNaN(x) ? 0 : x;
  };

  // ── Auto-calculated totals (mirror Excel) ──
  const calc = useMemo(() => {
    const contract = num(form.contract_sum);
    const downAmt = num(form.down_payment);
    const downPct = contract > 0 ? Math.min(downAmt / contract, 1) : 0;
    const sumT = Object.values(target).reduce((s, v) => s + num(v) / 100, 0);
    const sumC = Object.values(claimed).reduce((s, v) => s + num(v) / 100, 0);
    const sumA = Object.values(achieved).reduce((s, v) => s + num(v) / 100, 0);
    const sumR = Object.values(received).reduce((s, v) => s + num(v), 0);
    const autoSitePct = cumulativeAchievedPct(achieved);
    const totalClaimedRaw = downPct + sumC;
    const totalClaimedAmt = contract * Math.min(totalClaimedRaw, 1);
    const totalReceived = downAmt + sumR;
    return {
      totalTarget: Math.min(sumT, 1),
      totalTargetRaw: sumT,
      totalAchievedRaw: sumA,
      totalClaimed: Math.min(totalClaimedRaw, 1),
      totalClaimedRaw,
      claimedMonthlySum: sumC,
      totalReceived,
      totalClaimedAmt,
      receivedExceedsClaimed: contract > 0 && (totalReceived - totalClaimedAmt) > 0.01,
      balance: contract - totalReceived,
      downPct,
      autoSitePct,
    };
  }, [
    form.contract_sum,
    form.down_payment,
    target,
    claimed,
    received,
    achieved,
  ]);

  // Running cumulative sums per month — used for both target and achieved checks
  const cumulativeCheck = useMemo(() => {
    let cumT = 0, cumC = 0, cumA = 0;
    const result = {};
    visibleMonths.forEach((m) => {
      cumT += num(target[m]);
      cumC += num(claimed[m]);
      cumA += num(achieved[m]);
      result[m] = {
        cumTarget: cumT,
        cumClaimed: cumC,
        cumAchieved: cumA,
        exceedsTarget:   cumC > cumT + 0.01 && cumC > 0,
        exceedsAchieved: cumA > 0 && cumC > cumA + 0.01,
      };
    });
    return result;
  }, [target, claimed, achieved, visibleMonths]);

  // ── Soft (non-blocking) warnings: cumulative Claimed running ahead of the
  // cumulative Target / Achieved. These inform but never prevent saving. ──
  const claimWarnings = useMemo(() => {
    const out = [];
    const firstT = visibleMonths.find((m) => cumulativeCheck[m]?.exceedsTarget);
    if (firstT) {
      const c = cumulativeCheck[firstT];
      out.push(
        `Cumulative Claimed (${Math.round(c.cumClaimed)}%) exceeds Cumulative Target (${Math.round(c.cumTarget)}%) at ${firstT}. Monthly claims can vary, but ideally the running total stays within the running target.`
      );
    }
    const firstA = visibleMonths.find((m) => cumulativeCheck[m]?.exceedsAchieved);
    if (firstA) {
      const c = cumulativeCheck[firstA];
      out.push(
        `Cumulative Claimed (${Math.round(c.cumClaimed)}%) exceeds Cumulative Achieved (${Math.round(c.cumAchieved)}%) at ${firstA}. Ideally you only claim work that has been achieved.`
      );
    }
    return out;
  }, [cumulativeCheck, visibleMonths]);

  // ── Part A hard validation (per-month ≤100, totals ≤100, no negatives) ──
  // Runs on every change; blocks the save button and submission when it fails.
  const validation = useMemo(() => {
    const NEG = "Value cannot be negative";
    const OVER = "Value cannot exceed 100%";
    const isNeg = (v) => v != null && v !== "" && num(v) < 0;
    const isOver = (v) => num(v) > 100;

    const months = {};
    visibleMonths.forEach((m) => {
      const e = {};
      if (isNeg(target[m])) e.target = NEG;
      else if (isOver(target[m])) e.target = OVER;
      if (isNeg(achieved[m])) e.achieved = NEG;
      else if (isOver(achieved[m])) e.achieved = OVER;
      if (isNeg(claimed[m])) e.claimed = NEG;
      else if (isOver(claimed[m])) e.claimed = OVER;
      if (isNeg(received[m])) e.received = NEG;
      if (Object.keys(e).length) months[m] = e;
    });

    const contract_sum = isNeg(form.contract_sum) ? NEG : null;
    const down_payment = isNeg(form.down_payment) ? NEG : null;

    const totals = {};
    if (calc.totalTargetRaw > 1.001)
      totals.target = `Total Target is ${Math.round(calc.totalTargetRaw * 100)}% — cannot exceed 100%`;
    if (calc.totalAchievedRaw > 1.001)
      totals.achieved = `Total Achieved is ${Math.round(calc.totalAchievedRaw * 100)}% — cannot exceed 100%`;
    if (calc.totalClaimedRaw > 1.001)
      totals.claimed = `Total Claimed is ${Math.round(calc.totalClaimedRaw * 100)}% — cannot exceed 100%`;

    const hasErrors =
      !!contract_sum ||
      !!down_payment ||
      Object.keys(months).length > 0 ||
      Object.keys(totals).length > 0;

    return { months, contract_sum, down_payment, totals, hasErrors };
  }, [
    form.contract_sum,
    form.down_payment,
    target,
    claimed,
    received,
    achieved,
    visibleMonths,
    calc.totalTargetRaw,
    calc.totalAchievedRaw,
    calc.totalClaimedRaw,
  ]);

  const setMonth = (setter) => (month, val) =>
    setter((prev) => {
      const next = { ...prev };
      if (val === "" || val === null) delete next[month];
      else next[month] = parseFloat(val);
      return next;
    });

  const handleSubmit = async () => {
    if (!form.project_name.trim()) {
      setError("Project name is required");
      return;
    }
    // Part A: block submission while any hard validation rule is violated.
    if (validation.hasErrors) {
      const first =
        validation.contract_sum && `Contract Sum: ${validation.contract_sum}`;
      const firstDown =
        validation.down_payment && `Down Payment: ${validation.down_payment}`;
      const firstTotal = Object.values(validation.totals)[0];
      const firstMonthKey = Object.keys(validation.months)[0];
      const firstMonth =
        firstMonthKey &&
        `${firstMonthKey}: ${Object.values(validation.months[firstMonthKey])[0]}`;
      setError(
        first ||
          firstDown ||
          firstTotal ||
          firstMonth ||
          "Please fix the highlighted fields before saving."
      );
      return;
    }
    const contractSum = num(form.contract_sum);
    const downPayment = num(form.down_payment);
    if (contractSum < 0) {
      setError("Contract Sum cannot be negative");
      return;
    }
    if (downPayment < 0) {
      setError("Down Payment cannot be negative");
      return;
    }
    const negativeMonths = visibleMonths.filter(
      (m) => num(target[m]) < 0 || num(achieved[m]) < 0 || num(claimed[m]) < 0 || num(received[m]) < 0
    );
    if (negativeMonths.length > 0) {
      setError(`Negative values are not allowed. Check: ${negativeMonths.slice(0, 3).join(", ")}`);
      return;
    }
    const monthsOver100 = visibleMonths.filter(
      (m) => num(target[m]) > 100 || num(achieved[m]) > 100 || num(claimed[m]) > 100
    );
    if (monthsOver100.length > 0) {
      setError(`Monthly % values cannot exceed 100%. Check: ${monthsOver100.slice(0, 3).join(", ")}`);
      return;
    }
    const hasMonthlyData = visibleMonths.some(
      (m) => num(target[m]) > 0 || num(achieved[m]) > 0 || num(claimed[m]) > 0 || num(received[m]) > 0
    );
    if (contractSum === 0 && (downPayment > 0 || hasMonthlyData)) {
      setError("Contract Sum is required when financial or monthly data is entered.");
      return;
    }
    if (contractSum > 0 && downPayment > contractSum) {
      setError(`Down payment ($${Math.round(downPayment).toLocaleString()}) cannot exceed contract sum ($${Math.round(contractSum).toLocaleString()})`);
      return;
    }
    if (calc.totalTargetRaw > 1) {
      setError(`Total Target % is ${Math.round(calc.totalTargetRaw * 100)}% — cannot exceed 100%. Reduce monthly target values.`);
      return;
    }
    if (downPayment > 0 && !form.down_payment_month) {
      setError("Down Payment Month is required when a down payment amount is entered");
      return;
    }
    if (contractSum > 0 && (calc.totalReceived - contractSum) > 0.01) {
      setError(`Total received ($${Math.round(calc.totalReceived).toLocaleString()}) exceeds contract sum ($${Math.round(contractSum).toLocaleString()}). Reduce the monthly received amounts.`);
      return;
    }
    if (calc.receivedExceedsClaimed) {
      setError(`Total received ($${Math.round(calc.totalReceived).toLocaleString()}) cannot exceed total claimed amount ($${Math.round(calc.totalClaimedAmt).toLocaleString()}). You can only receive what has been claimed.`);
      return;
    }
    if (downPayment > 0 && form.down_payment_month && num(received[form.down_payment_month]) > 0) {
      setError(`"${form.down_payment_month}" is the down payment month — the $${Math.round(downPayment).toLocaleString()} down payment is already tracked separately. Remove the Received $ amount for ${form.down_payment_month} to avoid double-counting.`);
      return;
    }
    // NOTE: Claimed % does not require a Target % in the same month. Billing can
    // slip past the planned months (e.g. work targeted for Sep is claimed in Oct),
    // so Claimed is entered freely like Achieved %.
    // NOTE: Cumulative Claimed running ahead of cumulative Target / Achieved
    // (and of Site Progress) are now non-blocking warnings shown via
    // `claimWarnings` in the form body — they no longer prevent saving.
    if (calc.claimedMonthlySum > 1) {
      setError(`Monthly Claimed % total is ${Math.round(calc.claimedMonthlySum * 100)}% — cannot exceed 100%`);
      return;
    }
    if (calc.totalClaimedRaw > 1.001) {
      const dpPct = Math.round((calc.totalClaimedRaw - calc.claimedMonthlySum) * 100);
      const monthlyPct = Math.round(calc.claimedMonthlySum * 100);
      setError(`Total Claimed % is ${Math.round(calc.totalClaimedRaw * 100)}% — Down Payment (${dpPct}%) + Monthly Claims (${monthlyPct}%) cannot exceed 100%. Reduce your monthly claimed values.`);
      return;
    }
    setSaving(true);
    setError(null);

    // Convert % inputs (0-100 in the form) to decimals for the API
    const toDecimal = (obj) => {
      const out = {};
      Object.entries(obj).forEach(([m, v]) => {
        if (num(v)) out[m] = num(v) / 100;
      });
      return out;
    };
    const receivedClean = {};
    Object.entries(received).forEach(([m, v]) => {
      if (num(v)) receivedClean[m] = num(v);
    });

    const payload = {
      project_name: form.project_name.trim(),
      status: form.status,
      contract_sum: num(form.contract_sum),
      down_payment: num(form.down_payment),
      down_payment_month: form.down_payment_month || null,
      site_progress: calc.autoSitePct / 100, // auto = cumulative achieved up to today
      claim_till_date: calc.totalClaimed,
      risk_level: form.risk_level,
      target_monthly: toDecimal(target),
      claimed_monthly: toDecimal(claimed),
      received_monthly: receivedClean,
      achieved_monthly: toDecimal(achieved),
    };

    try {
      if (isEdit) await api.put(`/projects/${project.id}`, payload);
      else await api.post("/projects", payload);
      onSaved && onSaved();
      onClose && onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          width: "100%",
          maxWidth: 760,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            position: "sticky",
            top: 0,
            background: C.card,
            borderBottom: `1px solid ${C.border}`,
            padding: "16px 22px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderRadius: "16px 16px 0 0",
            zIndex: 2,
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>
            {isEdit ? "Edit Project" : "Add New Project"}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: C.textMuted,
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "22px" }}>
          {error && (
            <div
              style={{
                background: "#200d10",
                border: `1px solid ${C.red}`,
                color: C.red,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {/* Core fields */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div>
              <label style={lbl}>Project Name *</label>
              <input
                style={inp}
                value={form.project_name}
                onChange={(e) =>
                  setForm({ ...form, project_name: e.target.value })
                }
                placeholder="e.g. 1402 Cedar Road"
              />
            </div>
            <div>
              <label style={lbl}>Status</label>
              <select
                style={inp}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
              gap: 14,
              marginBottom: 20,
            }}
          >
            <div>
              <label style={lbl}>Contract Sum ($)</label>
              <input
                style={{
                  ...inp,
                  borderColor: validation.contract_sum ? C.red : C.border,
                }}
                type="number"
                min="0"
                value={form.contract_sum}
                onChange={(e) =>
                  setForm({ ...form, contract_sum: e.target.value })
                }
                placeholder="0"
              />
              {validation.contract_sum && (
                <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>
                  {validation.contract_sum}
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>Down Payment ($)</label>
              <input
                style={{
                  ...inp,
                  borderColor:
                    validation.down_payment ||
                    (num(form.down_payment) > num(form.contract_sum) &&
                      num(form.contract_sum) > 0)
                      ? C.red
                      : C.border,
                }}
                type="number"
                min="0"
                value={form.down_payment}
                onChange={(e) =>
                  setForm({ ...form, down_payment: e.target.value })
                }
                placeholder="0"
              />
              {validation.down_payment ? (
                <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>
                  {validation.down_payment}
                </div>
              ) : (
                num(form.down_payment) > num(form.contract_sum) &&
                num(form.contract_sum) > 0 && (
                  <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>
                    Cannot exceed contract sum
                  </div>
                )
              )}
            </div>
            <div>
              <label style={lbl}>
                Down Payment Month
                {num(form.down_payment) > 0 && (
                  <span style={{ color: C.red, marginLeft: 2 }}>*</span>
                )}
              </label>
              <select
                style={{
                  ...inp,
                  borderColor:
                    num(form.down_payment) > 0 && !form.down_payment_month
                      ? C.red
                      : C.border,
                }}
                value={form.down_payment_month}
                onChange={(e) => handleDownPaymentMonthChange(e.target.value)}
              >
                <option value="">—</option>
                {DROPDOWN_MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              {num(form.down_payment) > 0 && !form.down_payment_month && (
                <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>
                  Required when down payment is entered
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>Site Progress % (auto)</label>
              <input
                style={{
                  ...inp,
                  background: "#10131c",
                  color: C.green,
                  cursor: "not-allowed",
                }}
                type="text"
                value={`${calc.autoSitePct.toFixed(1)}%`}
                readOnly
                title="Auto = sum of monthly Achieved % up to today's month"
              />
            </div>
            <div>
              <label style={lbl}>Claim Till Date % (auto)</label>
              <input
                style={{
                  ...inp,
                  background: "#10131c",
                  color: C.green,
                  cursor: "not-allowed",
                }}
                type="text"
                value={`${(calc.totalClaimed * 100).toFixed(1)}%`}
                readOnly
                title="Auto = Down Payment % + sum of monthly Claimed %"
              />
            </div>
          </div>

          {/* Risk level (client-set) */}
          <div style={{ marginBottom: 20, maxWidth: 220 }}>
            <label style={lbl}>Risk Level</label>
            <select
              style={inp}
              value={form.risk_level}
              onChange={(e) => setForm({ ...form, risk_level: e.target.value })}
            >
              {RISK_LEVELS.map((r) => (
                <option key={r.v} value={r.v}>
                  {r.l}
                </option>
              ))}
            </select>
          </div>

          {/* Monthly grid */}
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: C.text,
              marginBottom: 4,
            }}
          >
            Monthly Breakdown
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>
            Target %, Claimed % and Achieved % as numbers (e.g. 25 for 25%).
            Received in dollars. Achieved % = actual site progress that month.
            Leave blank for no activity. Pick any month from the dropdown to
            backfill an earlier month — rows sort automatically.
          </div>

          <div
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "116px 1fr 1fr 1fr 1fr",
                background: C.cardAlt,
                padding: "8px 12px",
                fontSize: 10,
                fontWeight: 700,
                color: C.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              <div>Month</div>
              <div style={{ color: C.blue }}>Target %</div>
              <div style={{ color: C.amber }}>Achieved %</div>
              <div style={{ color: C.purple }}>Claimed %</div>
              <div style={{ color: C.green }}>Received $</div>
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {visibleMonths.map((m, i) => {
                const mErr = validation.months[m] || {};
                return (
                <div
                  key={m}
                  style={{
                    padding: "1px 0",
                    background:
                      i % 2 ? "transparent" : "rgba(255,255,255,0.015)",
                  }}
                >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "116px 1fr 1fr 1fr 1fr",
                    gap: 8,
                    padding: "5px 12px",
                    alignItems: "center",
                  }}
                >
                  {/* Month-year picker — any past/current/future month; duplicates disabled */}
                  <select
                    style={{ ...inp, padding: "5px 6px", fontSize: 12 }}
                    value={m}
                    onChange={(e) => changeMonth(m, e.target.value)}
                    title="Pick month & year — earlier months can be backfilled"
                  >
                    {!MONTH_PICKER_OPTIONS.includes(m) && (
                      <option value={m}>{m}</option>
                    )}
                    {MONTH_PICKER_OPTIONS.map((opt) => {
                      const taken = opt !== m && visibleMonths.includes(opt);
                      return (
                        <option key={opt} value={opt} disabled={taken}>
                          {opt}
                          {taken ? " — added" : ""}
                        </option>
                      );
                    })}
                  </select>
                  <input
                    style={{
                      ...inp,
                      padding: "5px 8px",
                      ...(mErr.target ? { borderColor: C.red } : {}),
                    }}
                    type="number"
                    min="0"
                    max="100"
                    placeholder="—"
                    value={target[m] ?? ""}
                    onChange={(e) => setMonth(setTarget)(m, e.target.value)}
                  />
                  <input
                    style={{
                      ...inp,
                      padding: "5px 8px",
                      ...(mErr.achieved ? { borderColor: C.red } : {}),
                    }}
                    type="number"
                    min="0"
                    max="100"
                    placeholder="—"
                    value={achieved[m] ?? ""}
                    onChange={(e) => setMonth(setAchieved)(m, e.target.value)}
                  />
                  <input
                    style={{
                      ...inp,
                      padding: "5px 8px",
                      ...(cumulativeCheck[m]?.exceedsTarget || cumulativeCheck[m]?.exceedsAchieved
                        ? { borderColor: C.amber } // soft warning, not a blocker
                        : {}),
                      ...(mErr.claimed ? { borderColor: C.red } : {}),
                    }}
                    type="number"
                    min="0"
                    max="100"
                    placeholder="—"
                    title={
                      cumulativeCheck[m]?.exceedsTarget
                        ? `Cumulative Claimed (${cumulativeCheck[m].cumClaimed.toFixed(1)}%) exceeds Cumulative Target (${cumulativeCheck[m].cumTarget.toFixed(1)}%) at this month`
                        : cumulativeCheck[m]?.exceedsAchieved
                        ? `Cumulative Claimed (${cumulativeCheck[m].cumClaimed.toFixed(1)}%) exceeds Cumulative Achieved (${cumulativeCheck[m].cumAchieved.toFixed(1)}%) at this month`
                        : ""
                    }
                    value={claimed[m] ?? ""}
                    onChange={(e) => setMonth(setClaimed)(m, e.target.value)}
                  />
                  <input
                    style={{
                      ...inp,
                      padding: "5px 8px",
                      ...(m === form.down_payment_month && num(form.down_payment) > 0 && num(received[m]) > 0
                        ? { borderColor: C.red }
                        : {}),
                      ...(mErr.received ? { borderColor: C.red } : {}),
                    }}
                    type="number"
                    min="0"
                    placeholder="—"
                    title={m === form.down_payment_month && num(form.down_payment) > 0 ? "Down payment month — don't enter received here, it's tracked separately" : ""}
                    value={received[m] ?? ""}
                    onChange={(e) => setMonth(setReceived)(m, e.target.value)}
                  />
                </div>
                {Object.keys(mErr).length > 0 && (
                  <div style={{ padding: "0 12px 5px", fontSize: 11, color: C.red }}>
                    {[
                      mErr.target && `Target %: ${mErr.target}`,
                      mErr.achieved && `Achieved %: ${mErr.achieved}`,
                      mErr.claimed && `Claimed %: ${mErr.claimed}`,
                      mErr.received && `Received $: ${mErr.received}`,
                    ]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </div>
                )}
                </div>
                );
              })}
            </div>
          </div>

          {/* Add Month button */}
          <button
            type="button"
            onClick={addMonth}
            style={{
              marginTop: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: `1px dashed ${C.border}`,
              borderRadius: 8,
              padding: "7px 16px",
              fontSize: 12,
              fontWeight: 600,
              color: C.blue,
              cursor: "pointer",
            }}
          >
            <Plus size={13} /> Add Month
          </button>

          {/* Soft (non-blocking) warnings: cumulative Claimed ahead of Target / Achieved */}
          {claimWarnings.map((msg, idx) => (
            <div key={idx} style={{
              background: "#1c1500",
              border: `1px solid ${C.amber}`,
              borderRadius: 8,
              padding: "9px 14px",
              fontSize: 12,
              color: C.amber,
              marginTop: 12,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}>
              <span>⚠️</span>
              <span>{msg}</span>
            </div>
          ))}

          {/* Soft warning: site progress ahead of claimed */}
          {calc.autoSitePct > calc.totalClaimed * 100 && calc.autoSitePct > 0 && (
            <div style={{
              background: "#1c1500",
              border: `1px solid ${C.amber}`,
              borderRadius: 8,
              padding: "9px 14px",
              fontSize: 12,
              color: C.amber,
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              ⚠️ Site Progress ({calc.autoSitePct.toFixed(1)}%) is ahead of Claim Till Date ({(calc.totalClaimed * 100).toFixed(1)}%) — you may have unclaimed work.
            </div>
          )}
          {(form.status === "Completed" || form.status === "Closed") && calc.totalTargetRaw < 1 && (
            <div style={{
              background: "#1c1500",
              border: `1px solid ${C.amber}`,
              borderRadius: 8,
              padding: "9px 14px",
              fontSize: 12,
              color: C.amber,
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              ⚠️ Status is "{form.status}" but Total Target is only {Math.round(calc.totalTargetRaw * 100)}% — a completed project should have 100% target planned.
            </div>
          )}

          {/* Live totals */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 10,
              marginTop: 16,
            }}
          >
            {[
              {
                l: "Total Target %",
                v: `${Math.round(calc.totalTargetRaw * 100)}%`,
                c: calc.totalTargetRaw > 1 ? C.red : C.blue,
              },
              {
                l: "Total Claimed %",
                v: `${Math.round(calc.totalClaimedRaw * 100)}%`,
                c: calc.totalClaimedRaw > 1 ? C.red : C.purple,
              },
              { l: "Total Received", v: fmt(calc.totalReceived), c: calc.receivedExceedsClaimed ? C.red : C.green },
              { l: "Balance", v: fmt(calc.balance), c: calc.balance < 0 ? C.red : C.amber },
            ].map((x) => (
              <div
                key={x.l}
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: C.textMuted,
                    textTransform: "uppercase",
                    marginBottom: 3,
                  }}
                >
                  {x.l}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: x.c }}>
                  {x.v}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: C.card,
            borderTop: `1px solid ${C.border}`,
            padding: "14px 22px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            borderRadius: "0 0 16px 16px",
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: "transparent",
              color: C.textMuted,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || validation.hasErrors}
            title={validation.hasErrors ? "Fix the highlighted fields before saving" : ""}
            style={{
              padding: "9px 20px",
              borderRadius: 8,
              border: "none",
              background: validation.hasErrors ? C.border : C.blue,
              color: validation.hasErrors ? C.textMuted : "#06121f",
              fontSize: 13,
              fontWeight: 700,
              cursor: saving || validation.hasErrors ? "not-allowed" : "pointer",
              opacity: validation.hasErrors ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {saving ? (
              <>
                <Loader2
                  size={15}
                  style={{ animation: "spin 1s linear infinite" }}
                />{" "}
                Saving…
              </>
            ) : (
              <>
                <Save size={15} />{" "}
                {isEdit ? "Update Project" : "Create Project"}
              </>
            )}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
