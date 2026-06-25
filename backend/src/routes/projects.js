// ============================================================
// Projects Routes - InventoryOpz
// Reads the NEW client template: sheet "Project Forecast",
// 3 rows per project (Target % / Claimed % / Received $),
// down-payment column J, months in cols L..AD (19 months).
// ============================================================

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const pool = require("../config/db");

const router = express.Router();

// ============================================================
// Multer (file upload)
// ============================================================
const uploadDir = path.join(__dirname, "../../uploads/projects");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".xlsx" && ext !== ".xls")
      return cb(new Error("Only Excel files are allowed"));
    cb(null, true);
  },
});

// ============================================================
// Constants — month keys MUST match the dashboard exactly
// (note: June'25 / July'25 with 'e', but Jun'26 without)
// ============================================================
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
// In sheet_to_json (header:1), columns are 0-indexed.
// A=0 B=1 C=2 D=3 E=4 F=5 G=6 H=7 I=8 J=9 K=10 L=11 ...
const COL = {
  no: 0,
  name: 1,
  type: 2,
  status: 3,
  site: 4,
  claimtill: 5,
  contract: 6,
  received: 7,
  balance: 8,
  downpay: 9,
  total: 10,
};
const MONTH_START = 11; // column L

// Map a month KEY like "July'26" -> { year, idx } so we can compare against today.
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
function monthKeyMeta(key) {
  const m = String(key).match(/^([A-Za-z]+)'(\d{2})$/);
  if (!m) return null;
  return { year: 2000 + parseInt(m[2], 10), idx: MONTH_IDX[m[1]] ?? 0 };
}
// Site progress = sum of achieved % for all months up to and including TODAY's month.
// Future months are ignored (they haven't happened yet).
function computeSiteProgress(achievedMonthly) {
  const now = new Date();
  const curYear = now.getFullYear();
  const curIdx = now.getMonth(); // 0-11
  let sum = 0;
  for (const [key, val] of Object.entries(achievedMonthly || {})) {
    const meta = monthKeyMeta(key);
    if (!meta) continue;
    const isPastOrCurrent =
      meta.year < curYear || (meta.year === curYear && meta.idx <= curIdx);
    if (isPastOrCurrent) sum += n(val);
  }
  return Math.min(Math.max(sum, 0), 1); // clamp 0..1
}

// ============================================================
// Helpers
// ============================================================
function n(v) {
  const x = parseFloat(v);
  return isNaN(x) ? 0 : x;
}

// Percentages in the new template are already decimals (0.30 = 30%).
// Clamp to 0..1 just in case someone types 30 instead of 0.30.
function pct(v) {
  let x = n(v);
  if (x > 1) x = x / 100; // tolerate accidental 0-100 entry
  return Math.max(0, Math.min(x, 1));
}

function normalizeStatus(s) {
  if (!s) return "Upcoming Project";
  const k = String(s).trim().toLowerCase();
  const map = {
    closed: "Closed",
    complete: "Completed",
    completed: "Completed",
    "in progress": "In Progress",
    inprogress: "In Progress",
    upcoming: "Upcoming Project",
    "upcoming project": "Upcoming Project",
    pending: "Upcoming Project",
  };
  return map[k] || "Upcoming Project";
}

// Risk is set MANUALLY by the client. Validate/normalize the incoming value.
function normalizeRisk(value) {
  const k = String(value || "")
    .trim()
    .toLowerCase();
  if (k === "high" || k === "medium" || k === "low") return k;
  return "low"; // default
}

// ============================================================
// POST /api/projects/upload
// ============================================================
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file)
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });

    console.log("\n" + "=".repeat(60));
    console.log("📊 PARSING PROJECT FORECAST EXCEL");
    console.log("=".repeat(60));
    console.log(`📁 File: ${req.file.filename}`);

    const workbook = XLSX.readFile(req.file.path);
    const sheet =
      workbook.Sheets["Project Forecast"] ||
      workbook.Sheets["📊 Projects"] || // fallback for old files
      workbook.Sheets[workbook.SheetNames[0]];

    if (!sheet)
      return res.status(400).json({
        success: false,
        message: 'Sheet "Project Forecast" not found in Excel file',
      });

    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (!data || data.length < 4)
      return res.status(400).json({
        success: false,
        message: "Excel file does not contain enough data",
      });

    const projects = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i] || [];
      const typ = row[COL.type];
      const name = row[COL.name];

      // A project starts on its "🎯 Target %" row, which also carries the name.
      if (typ && String(typ).includes("Target") && name) {
        const targetRow = row;
        const claimedRow = data[i + 1] || [];
        const receivedRow = data[i + 2] || [];

        const status = normalizeStatus(targetRow[COL.status]);
        const site = pct(targetRow[COL.site]);
        const claimTill = pct(targetRow[COL.claimtill]);

        const downPct = pct(targetRow[COL.downpay]); // J on Target row (decimal)
        const contractSum = n(receivedRow[COL.contract]); // G on Received row
        const downAmt = n(receivedRow[COL.downpay]); // J on Received row ($)

        const targetMonthly = {};
        const claimedMonthly = {};
        const receivedMonthly = {};
        let sumTarget = 0,
          sumClaimed = 0,
          sumReceived = 0;

        for (let m = 0; m < MONTHS.length; m++) {
          const col = MONTH_START + m;
          const tv = pct(targetRow[col]);
          const cv = pct(claimedRow[col]);
          const rv = n(receivedRow[col]);
          if (tv) {
            targetMonthly[MONTHS[m]] = tv;
            sumTarget += tv;
          }
          if (cv) {
            claimedMonthly[MONTHS[m]] = cv;
            sumClaimed += cv;
          }
          if (rv) {
            receivedMonthly[MONTHS[m]] = rv;
            sumReceived += rv;
          }
        }

        // Client's formula: total = down payment + sum of monthly
        const totalTargetPct = Math.min(downPct + sumTarget, 1);
        const totalClaimedPct = Math.min(downPct + sumClaimed, 1);
        const totalReceived = downAmt + sumReceived;

        const project = {
          projectName: String(name).trim(),
          status,
          contractSum,
          totalReceived,
          downPayment: downAmt,
          siteProgress: site,
          claimTillDate: claimTill,
          totalTargetPct,
          totalClaimedPct,
          targetMonthly,
          claimedMonthly,
          receivedMonthly,
          riskLevel: "low", // risk is set manually after import
        };

        // Skip truly empty placeholder rows (no contract, no received)
        if (
          project.contractSum === 0 &&
          project.totalReceived === 0 &&
          Object.keys(targetMonthly).length === 0
        ) {
          console.log(`⏭️  Skipping empty project: ${project.projectName}`);
        } else {
          projects.push(project);
          console.log(
            `📝 ${project.projectName} [${status}] contract=${contractSum} received=${totalReceived}`,
          );
        }

        i += 2; // jump past the Claimed + Received rows
      }
    }

    console.log(`\n✅ Extracted ${projects.length} projects\n`);
    if (projects.length === 0)
      return res.status(400).json({
        success: false,
        message: "No projects found in Excel file",
      });

    let inserted = 0;
    const errors = [];

    for (const p of projects) {
      try {
        const query = `
          INSERT INTO projects (
            project_name, status, contract_sum, total_received, down_payment,
            site_progress, claim_till_date, total_target_pct, total_claimed_pct,
            target_monthly, claimed_monthly, received_monthly,
            risk_level, uploaded_by, excel_source
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          ON CONFLICT (project_name) DO UPDATE SET
            status = EXCLUDED.status,
            contract_sum = EXCLUDED.contract_sum,
            total_received = EXCLUDED.total_received,
            down_payment = EXCLUDED.down_payment,
            site_progress = EXCLUDED.site_progress,
            claim_till_date = EXCLUDED.claim_till_date,
            total_target_pct = EXCLUDED.total_target_pct,
            total_claimed_pct = EXCLUDED.total_claimed_pct,
            target_monthly = EXCLUDED.target_monthly,
            claimed_monthly = EXCLUDED.claimed_monthly,
            received_monthly = EXCLUDED.received_monthly,
            risk_level = EXCLUDED.risk_level,
            uploaded_by = EXCLUDED.uploaded_by,
            excel_source = EXCLUDED.excel_source,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id;
        `;
        const values = [
          p.projectName,
          p.status,
          p.contractSum,
          p.totalReceived,
          p.downPayment,
          p.siteProgress,
          p.claimTillDate,
          p.totalTargetPct,
          p.totalClaimedPct,
          JSON.stringify(p.targetMonthly),
          JSON.stringify(p.claimedMonthly),
          JSON.stringify(p.receivedMonthly),
          p.riskLevel,
          "admin",
          req.file.originalname,
        ];
        const result = await pool.query(query, values);
        if (result.rowCount > 0) {
          inserted++;
          console.log(`✅ ${p.projectName}`);
        }
      } catch (err) {
        console.error(`❌ ${p.projectName}: ${err.message}`);
        errors.push({ project: p.projectName, error: err.message });
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(
      `✅ IMPORT COMPLETE — Total ${projects.length} | Success ${inserted}`,
    );
    console.log("=".repeat(60) + "\n");

    res.status(200).json({
      success: true,
      message: `Successfully imported ${inserted} projects`,
      data: {
        total: projects.length,
        imported: inserted,
        errors,
        fileName: req.file.originalname,
      },
    });
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// GET /api/projects
// ============================================================
router.get("/", async (req, res) => {
  try {
    const { status, risk_level, limit = 100, offset = 0 } = req.query;
    let query = "SELECT * FROM projects WHERE 1=1";
    const values = [];
    let idx = 1;
    if (status) {
      query += ` AND status = $${idx++}`;
      values.push(status);
    }
    if (risk_level) {
      query += ` AND risk_level = $${idx++}`;
      values.push(risk_level);
    }
    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`;
    values.push(limit, offset);
    const result = await pool.query(query, values);
    res
      .status(200)
      .json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// GET /api/projects/summary/stats
// ============================================================
router.get("/summary/stats", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total_projects,
        SUM(contract_sum) AS total_contract_sum,
        SUM(total_received) AS total_received_amount,
        SUM(down_payment) AS total_down_payment,
        COUNT(CASE WHEN status='Closed' THEN 1 END) AS closed_projects,
        COUNT(CASE WHEN status='Completed' THEN 1 END) AS completed_projects,
        COUNT(CASE WHEN status='In Progress' THEN 1 END) AS in_progress_projects,
        COUNT(CASE WHEN status='Upcoming Project' THEN 1 END) AS upcoming_projects,
        COUNT(CASE WHEN risk_level='high' THEN 1 END) AS high_risk_projects,
        COUNT(CASE WHEN risk_level='medium' THEN 1 END) AS medium_risk_projects,
        COUNT(CASE WHEN risk_level='low' THEN 1 END) AS low_risk_projects
      FROM projects
    `);
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// GET /api/projects/:id
// ============================================================
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM projects WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// POST /api/projects  — create ONE project from the dashboard form
// Body: { project_name, status, contract_sum, down_payment,
//         site_progress, claim_till_date,
//         target_monthly, claimed_monthly, received_monthly }
//   - percentages as decimals (0.30), monthly received in dollars
//   - totals are computed here (downpay + sum of months)
// ============================================================
router.post("/", async (req, res) => {
  try {
    const b = req.body || {};
    const name = (b.project_name || "").trim();
    if (!name)
      return res
        .status(400)
        .json({ success: false, message: "Project name is required" });

    const status = normalizeStatus(b.status);
    const contractSum = n(b.contract_sum);
    const downAmt = n(b.down_payment);
    const claimTill = pct(b.claim_till_date);

    const targetMonthly = b.target_monthly || {};
    const claimedMonthly = b.claimed_monthly || {};
    const receivedMonthly = b.received_monthly || {};
    const achievedMonthly = b.achieved_monthly || {};

    // Site progress is now AUTO: cumulative achieved % up to today's month.
    const site = computeSiteProgress(achievedMonthly);

    const downPct = contractSum > 0 ? Math.min(downAmt / contractSum, 1) : 0;
    const sumTarget = Object.values(targetMonthly).reduce(
      (s, v) => s + n(v),
      0,
    );
    const sumClaimed = Object.values(claimedMonthly).reduce(
      (s, v) => s + n(v),
      0,
    );
    const sumReceived = Object.values(receivedMonthly).reduce(
      (s, v) => s + n(v),
      0,
    );

    // Total Target % = sum of monthly targets ONLY (down payment excluded).
    const totalTargetPct = Math.min(sumTarget, 1);
    const totalClaimedPct = Math.min(downPct + sumClaimed, 1);
    const totalReceived = downAmt + sumReceived;
    const riskLevel = normalizeRisk(b.risk_level);

    const result = await pool.query(
      `INSERT INTO projects (
        project_name, status, contract_sum, total_received, down_payment, down_payment_month,
        site_progress, claim_till_date, total_target_pct, total_claimed_pct,
        target_monthly, claimed_monthly, received_monthly, achieved_monthly,
        risk_level, uploaded_by, excel_source
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *`,
      [
        name,
        status,
        contractSum,
        totalReceived,
        downAmt,
        b.down_payment_month || null,
        site,
        claimTill,
        totalTargetPct,
        totalClaimedPct,
        JSON.stringify(targetMonthly),
        JSON.stringify(claimedMonthly),
        JSON.stringify(receivedMonthly),
        JSON.stringify(achievedMonthly),
        riskLevel,
        "dashboard",
        "manual-entry",
      ],
    );
    res.status(201).json({
      success: true,
      message: "Project created",
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505")
      return res.status(409).json({
        success: false,
        message: "A project with this name already exists",
      });
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// PUT /api/projects/:id  — update an existing project
// Same body shape as POST. Recomputes all totals.
// ============================================================
router.put("/:id", async (req, res) => {
  try {
    const b = req.body || {};
    const name = (b.project_name || "").trim();
    if (!name)
      return res
        .status(400)
        .json({ success: false, message: "Project name is required" });

    const status = normalizeStatus(b.status);
    const contractSum = n(b.contract_sum);
    const downAmt = n(b.down_payment);
    const claimTill = pct(b.claim_till_date);

    const targetMonthly = b.target_monthly || {};
    const claimedMonthly = b.claimed_monthly || {};
    const receivedMonthly = b.received_monthly || {};
    const achievedMonthly = b.achieved_monthly || {};

    // Site progress is now AUTO: cumulative achieved % up to today's month.
    const site = computeSiteProgress(achievedMonthly);

    const downPct = contractSum > 0 ? Math.min(downAmt / contractSum, 1) : 0;
    const sumTarget = Object.values(targetMonthly).reduce(
      (s, v) => s + n(v),
      0,
    );
    const sumClaimed = Object.values(claimedMonthly).reduce(
      (s, v) => s + n(v),
      0,
    );
    const sumReceived = Object.values(receivedMonthly).reduce(
      (s, v) => s + n(v),
      0,
    );

    // Total Target % = sum of monthly targets ONLY (down payment excluded).
    const totalTargetPct = Math.min(sumTarget, 1);
    const totalClaimedPct = Math.min(downPct + sumClaimed, 1);
    const totalReceived = downAmt + sumReceived;
    const riskLevel = normalizeRisk(b.risk_level);

    const result = await pool.query(
      `UPDATE projects SET
        project_name=$1, status=$2, contract_sum=$3, total_received=$4, down_payment=$5,
        site_progress=$6, claim_till_date=$7, total_target_pct=$8, total_claimed_pct=$9,
        target_monthly=$10, claimed_monthly=$11, received_monthly=$12, achieved_monthly=$13,
        risk_level=$14, down_payment_month=$15, updated_at=CURRENT_TIMESTAMP
      WHERE id=$16 RETURNING *`,
      [
        name,
        status,
        contractSum,
        totalReceived,
        downAmt,
        site,
        claimTill,
        totalTargetPct,
        totalClaimedPct,
        JSON.stringify(targetMonthly),
        JSON.stringify(claimedMonthly),
        JSON.stringify(receivedMonthly),
        JSON.stringify(achievedMonthly),
        riskLevel,
        b.down_payment_month || null,
        req.params.id,
      ],
    );
    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    res.status(200).json({
      success: true,
      message: "Project updated",
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505")
      return res.status(409).json({
        success: false,
        message: "A project with this name already exists",
      });
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// DELETE /api/projects/:id
// ============================================================
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM projects WHERE id=$1 RETURNING id, project_name",
      [req.params.id],
    );
    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    res.status(200).json({
      success: true,
      message: "Project deleted",
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
