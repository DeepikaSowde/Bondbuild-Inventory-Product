// ============================================================
// ProjectFormModal.jsx — Add / Edit a project from the dashboard
// Drop in: frontend/src/pages/ProjectFormModal.jsx
// Matches the dashboard dark theme. Auto-calculates totals.
// ============================================================
import { useState, useMemo, useEffect } from "react";
import api from "../services/api";
import { X, Plus, Trash2, Save, Loader2 } from "lucide-react";

// Month keys MUST match the dashboard/parser exactly
const MONTHS = [
  "Jan'25",
  "Feb'25",
  "Mar'25",
  "Apr'25",
  "May'25",
  "June'25",
  "July'25",
  "Aug'25",
  "Sept'25",
  "Oct'25",
  "Nov'25",
  "Dec'25",
  "Jan'26",
  "Feb'26",
  "Mar'26",
  "Apr'26",
  "May'26",
  "Jun'26",
  "July'26",
];
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
      setTarget(toPct(project.target_monthly || project.targetMonthly));
      setClaimed(toPct(project.claimed_monthly || project.claimedMonthly));
      setReceived(project.received_monthly || project.receivedMonthly || {});
      // achieved is stored as decimals (0-1) in DB; show as whole percents in the form
      const rawAchieved =
        project.achieved_monthly || project.achievedMonthly || {};
      const achievedPct = {};
      Object.entries(rawAchieved).forEach(([m, v]) => {
        const x = parseFloat(v);
        if (!isNaN(x)) achievedPct[m] = x <= 1 ? Math.round(x * 1000) / 10 : x;
      });
      setAchieved(achievedPct);
    }
  }, [project]);

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
    const sumR = Object.values(received).reduce((s, v) => s + num(v), 0);
    const autoSitePct = cumulativeAchievedPct(achieved);
    const totalClaimedRaw = downPct + sumC;
    const totalClaimedAmt = contract * Math.min(totalClaimedRaw, 1);
    const totalReceived = downAmt + sumR;
    return {
      totalTarget: Math.min(sumT, 1),
      totalClaimed: Math.min(totalClaimedRaw, 1),
      totalClaimedRaw,
      claimedMonthlySum: sumC,
      totalReceived,
      totalClaimedAmt,
      receivedExceedsClaimed: contract > 0 && totalReceived > totalClaimedAmt,
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
    const negativeMonths = MONTHS.filter(
      (m) => num(target[m]) < 0 || num(achieved[m]) < 0 || num(claimed[m]) < 0 || num(received[m]) < 0
    );
    if (negativeMonths.length > 0) {
      setError(`Negative values are not allowed. Check: ${negativeMonths.slice(0, 3).join(", ")}`);
      return;
    }
    if (contractSum > 0 && downPayment > contractSum) {
      setError(`Down payment ($${Math.round(downPayment).toLocaleString()}) cannot exceed contract sum ($${Math.round(contractSum).toLocaleString()})`);
      return;
    }
    if (downPayment > 0 && !form.down_payment_month) {
      setError("Down Payment Month is required when a down payment amount is entered");
      return;
    }
    if (contractSum > 0 && calc.totalReceived > contractSum) {
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
    const monthsClaimedWithoutTarget = Object.keys(claimed).filter(
      (m) => num(claimed[m]) > 0 && !(num(target[m]) > 0)
    );
    if (monthsClaimedWithoutTarget.length > 0) {
      setError(`Claimed % requires Target % to be set first for: ${monthsClaimedWithoutTarget.slice(0, 3).join(", ")}${monthsClaimedWithoutTarget.length > 3 ? "…" : ""}`);
      return;
    }
    const monthsClaimedExceedsTarget = MONTHS.filter(
      (m) => num(claimed[m]) > 0 && num(target[m]) > 0 && num(claimed[m]) > num(target[m])
    );
    if (monthsClaimedExceedsTarget.length > 0) {
      setError(`Claimed % exceeds Target % for: ${monthsClaimedExceedsTarget.slice(0, 3).join(", ")}`);
      return;
    }
    const monthsClaimedExceedsAchieved = MONTHS.filter(
      (m) => num(claimed[m]) > 0 && num(achieved[m]) > 0 && num(claimed[m]) > num(achieved[m])
    );
    if (monthsClaimedExceedsAchieved.length > 0) {
      setError(`Claimed % exceeds Achieved % for: ${monthsClaimedExceedsAchieved.slice(0, 3).join(", ")}`);
      return;
    }
    const totalClaimedSum = Object.values(claimed).reduce((s, v) => s + num(v), 0);
    if (totalClaimedSum > calc.autoSitePct && calc.autoSitePct > 0) {
      setError(`Total Claimed (${Math.round(totalClaimedSum)}%) cannot exceed Site Progress (${Math.round(calc.autoSitePct)}%)`);
      return;
    }
    if (calc.claimedMonthlySum > 1) {
      setError(`Monthly Claimed % total is ${Math.round(calc.claimedMonthlySum * 100)}% — cannot exceed 100%`);
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
                style={inp}
                type="number"
                min="0"
                value={form.contract_sum}
                onChange={(e) =>
                  setForm({ ...form, contract_sum: e.target.value })
                }
                placeholder="0"
              />
            </div>
            <div>
              <label style={lbl}>Down Payment ($)</label>
              <input
                style={{
                  ...inp,
                  borderColor:
                    num(form.down_payment) > num(form.contract_sum) &&
                    num(form.contract_sum) > 0
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
              {num(form.down_payment) > num(form.contract_sum) &&
                num(form.contract_sum) > 0 && (
                  <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>
                    Cannot exceed contract sum
                  </div>
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
                onChange={(e) =>
                  setForm({ ...form, down_payment_month: e.target.value })
                }
              >
                <option value="">—</option>
                {MONTHS.map((m) => (
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
            Leave blank for no activity.
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
                gridTemplateColumns: "70px 1fr 1fr 1fr 1fr",
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
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {MONTHS.map((m, i) => (
                <div
                  key={m}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "70px 1fr 1fr 1fr 1fr",
                    gap: 8,
                    padding: "5px 12px",
                    alignItems: "center",
                    background:
                      i % 2 ? "transparent" : "rgba(255,255,255,0.015)",
                  }}
                >
                  <div style={{ fontSize: 12, color: C.textMuted }}>{m}</div>
                  <input
                    style={{ ...inp, padding: "5px 8px" }}
                    type="number"
                    min="0"
                    placeholder="—"
                    value={target[m] ?? ""}
                    onChange={(e) => setMonth(setTarget)(m, e.target.value)}
                  />
                  <input
                    style={{ ...inp, padding: "5px 8px" }}
                    type="number"
                    min="0"
                    placeholder="—"
                    value={achieved[m] ?? ""}
                    onChange={(e) => setMonth(setAchieved)(m, e.target.value)}
                  />
                  <input
                    style={{
                      ...inp,
                      padding: "5px 8px",
                      ...(!(num(target[m]) > 0)
                        ? { opacity: 0.35, cursor: "not-allowed", background: "#0c0e16" }
                        : (num(claimed[m]) > num(target[m]) && num(target[m]) > 0) ||
                          (num(claimed[m]) > num(achieved[m]) && num(achieved[m]) > 0)
                        ? { borderColor: C.red }
                        : {}),
                    }}
                    type="number"
                    min="0"
                    placeholder="—"
                    disabled={!(num(target[m]) > 0)}
                    title={
                      !(num(target[m]) > 0)
                        ? "Set Target % first"
                        : num(claimed[m]) > num(target[m]) && num(target[m]) > 0
                        ? "Claimed % cannot exceed Target %"
                        : num(claimed[m]) > num(achieved[m]) && num(achieved[m]) > 0
                        ? "Claimed % cannot exceed Achieved %"
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
                    }}
                    type="number"
                    min="0"
                    placeholder="—"
                    title={m === form.down_payment_month && num(form.down_payment) > 0 ? "Down payment month — don't enter received here, it's tracked separately" : ""}
                    value={received[m] ?? ""}
                    onChange={(e) => setMonth(setReceived)(m, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

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
                v: `${Math.round(calc.totalTarget * 100)}%`,
                c: C.blue,
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
            disabled={saving}
            style={{
              padding: "9px 20px",
              borderRadius: 8,
              border: "none",
              background: C.blue,
              color: "#06121f",
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
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
