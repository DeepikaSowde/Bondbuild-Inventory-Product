/**
 * InventoryOpz — Project Management Dashboard  (Enhanced)
 * All 7 visual additions included:
 *   1. Status donut chart
 *   2. Collection rate gauge (radial arc)
 *   3. Monthly stacked bar  (Target $ / Received $ / Pending $)
 *   4. Cumulative received area chart
 *   5. Claimed % vs Site Progress scatter plot
 *   6. Risk flag column in table
 *   7. Mini sparkline per project row
 *
 * Dependencies:  npm install recharts lucide-react
 */

import { useState, useMemo, useEffect } from "react";
import ExcelJS from "exceljs";
import api from "../services/api";
import ProjectFormModal from "./ProjectFormModal";
import {
  ComposedChart,
  Bar,
  Line,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  ZAxis,
  LabelList,
} from "recharts";
import {
  Building2,
  TrendingUp,
  DollarSign,
  Clock,
  BarChart3,
  CheckCircle2,
  XCircle,
  Loader2,
  CalendarClock,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Info,
  AlertTriangle,
  ShieldCheck,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  Download,
} from "lucide-react";

// ─── DATA ────────────────────────────────────────────────────────────────────
const FALLBACK_PROJECTS = [
  {
    name: "1402 Cedar Road",
    status: "Closed",
    siteProgress: 1.0,
    claimTillDate: 1.0,
    totalTargetPct: 1.0,
    totalClaimedPct: 1.0,
    contractSum: 100000,
    totalReceived: 100000,
    balance: 0,
    downPayment: 30000,
    targetMonthly: { "Mar'25": 0.59, "Apr'25": 0.11 },
    claimedMonthly: { "Mar'25": 0.59, "Apr'25": 0.11 },
    receivedMonthly: { "Mar'25": 59000, "Apr'25": 11000 },
  },
  {
    name: "400 Liberty Park",
    status: "Completed",
    siteProgress: 1.0,
    claimTillDate: 0.9,
    totalTargetPct: 1.0,
    totalClaimedPct: 0.9,
    contractSum: 700000,
    totalReceived: 630000,
    balance: 70000,
    downPayment: 175000,
    targetMonthly: { "Mar'25": 0.25, "Apr'25": 0.25, "May'25": 0.25 },
    claimedMonthly: { "Mar'25": 0.25, "Apr'25": 0.2, "May'25": 0.2 },
    receivedMonthly: { "Mar'25": 175000, "Apr'25": 140000, "May'25": 140000 },
  },
  {
    name: "350 Evergreen",
    status: "In Progress",
    siteProgress: 1.0,
    claimTillDate: 0.8,
    totalTargetPct: 1.0,
    totalClaimedPct: 0.8,
    contractSum: 1000000,
    totalReceived: 800000,
    balance: 200000,
    downPayment: 200000,
    targetMonthly: {
      "Mar'26": 0.25,
      "Apr'26": 0.15,
      "May'26": 0.2,
      "Jun'26": 0.2,
    },
    claimedMonthly: { "Mar'26": 0.25, "Apr'26": 0.15, "May'26": 0.2 },
    receivedMonthly: { "Mar'26": 250000, "Apr'26": 150000, "May'26": 200000 },
  },
  {
    name: "2205 Jefferson Ave",
    status: "In Progress",
    siteProgress: 0.0,
    claimTillDate: 0.9,
    totalTargetPct: 1.0,
    totalClaimedPct: 0.9,
    contractSum: 340000,
    totalReceived: 110640,
    balance: 232344,
    downPayment: 102000,
    targetMonthly: {
      "Feb'26": 0.05,
      "Mar'26": 0.25,
      "Apr'26": 0.3,
      "May'26": 0.1,
    },
    claimedMonthly: { "Feb'26": 0.05, "Mar'26": 0.25, "Apr'26": 0.3 },
    receivedMonthly: { "Feb'26": 17000, "Mar'26": 85000, "Apr'26": 102000 },
  },
  {
    name: "12 HARLYN ROAD",
    status: "Upcoming Project",
    siteProgress: 0.3,
    claimTillDate: 0.0,
    totalTargetPct: 1.0,
    totalClaimedPct: 0.0,
    contractSum: 735810,
    totalReceived: 0,
    balance: 0,
    targetMonthly: { "May'26": 0.2, "Jun'26": 0.4, "July'26": 0.2 },
    claimedMonthly: {},
    receivedMonthly: {},
  },
  {
    name: "11 Lynwood project",
    status: "Upcoming Project",
    siteProgress: 0.0,
    claimTillDate: 0.0,
    totalTargetPct: 1.0,
    totalClaimedPct: 0.0,
    contractSum: 0,
    totalReceived: 0,
    balance: 0,
    targetMonthly: {
      "Apr'26": 0.05,
      "May'26": 0.25,
      "Jun'26": 0.3,
      "July'26": 0.15,
    },
    claimedMonthly: {},
    receivedMonthly: {},
  },
  {
    name: "2450 Maple Ave",
    status: "Closed",
    siteProgress: 1.0,
    claimTillDate: 1.0,
    totalTargetPct: 1.0,
    totalClaimedPct: 1.0,
    contractSum: 120000,
    totalReceived: 110640,
    balance: 232344,
    downPayment: 30000,
    targetMonthly: { "Jan'25": 0.29088842, "Feb'25": 0.45911158 },
    claimedMonthly: { "Jan'25": 0.29088842, "Feb'25": 0.45911158 },
    receivedMonthly: { "Jan'25": 34906.61, "Feb'25": 55093.39 },
  },
  {
    name: "1875 Oak St",
    status: "Closed",
    siteProgress: 1.0,
    claimTillDate: 1.0,
    totalTargetPct: 1.0,
    totalClaimedPct: 1.0,
    contractSum: 95000,
    totalReceived: 95000,
    balance: 0,
    downPayment: 23750,
    targetMonthly: { "Jan'25": 0.21170937, "Feb'25": 0.53829063 },
    claimedMonthly: { "Jan'25": 0.21170937, "Feb'25": 0.53829063 },
    receivedMonthly: { "Jan'25": 20112.39, "Feb'25": 51137.61 },
  },
  {
    name: "3320 Pine Dr",
    status: "Closed",
    siteProgress: 1.0,
    claimTillDate: 1.0,
    totalTargetPct: 1.0,
    totalClaimedPct: 1.0,
    contractSum: 180000,
    totalReceived: 180000,
    balance: 0,
    downPayment: 36000,
    targetMonthly: {
      "Jan'25": 0.3027675,
      "Feb'25": 0.16268144,
      "Mar'25": 0.08786206,
      "Apr'25": 0.246689,
    },
    claimedMonthly: {
      "Jan'25": 0.3027675,
      "Feb'25": 0.16268144,
      "Mar'25": 0.08786206,
      "Apr'25": 0.246689,
    },
    receivedMonthly: {
      "Jan'25": 54498.15,
      "Feb'25": 29282.66,
      "Mar'25": 15815.17,
      "Apr'25": 44404.02,
    },
  },
  {
    name: "4100 Elm Ct",
    status: "Closed",
    siteProgress: 1.0,
    claimTillDate: 1.0,
    totalTargetPct: 1.0,
    totalClaimedPct: 1.0,
    contractSum: 150000,
    totalReceived: 150000,
    balance: 0,
    downPayment: 30000,
    targetMonthly: {
      "Jan'25": 0.27076173,
      "Feb'25": 0.17714427,
      "Mar'25": 0.10451307,
      "Apr'25": 0.24758093,
    },
    claimedMonthly: {
      "Jan'25": 0.27076173,
      "Feb'25": 0.17714427,
      "Mar'25": 0.10451307,
      "Apr'25": 0.24758093,
    },
    receivedMonthly: {
      "Jan'25": 40614.26,
      "Feb'25": 26571.64,
      "Mar'25": 15676.96,
      "Apr'25": 37137.14,
    },
  },
  {
    name: "5678 Birch Ln",
    status: "Closed",
    siteProgress: 1.0,
    claimTillDate: 1.0,
    totalTargetPct: 1.0,
    totalClaimedPct: 1.0,
    contractSum: 135000,
    totalReceived: 135000,
    balance: 0,
    downPayment: 33750,
    targetMonthly: { "Jan'25": 0.2278963, "Feb'25": 0.5221037 },
    claimedMonthly: { "Jan'25": 0.2278963, "Feb'25": 0.5221037 },
    receivedMonthly: { "Jan'25": 30766, "Feb'25": 70484 },
  },
  {
    name: "7890 Cedar Park",
    status: "Closed",
    siteProgress: 1.0,
    claimTillDate: 1.0,
    totalTargetPct: 1.0,
    totalClaimedPct: 1.0,
    contractSum: 165000,
    totalReceived: 165000,
    balance: 0,
    downPayment: 41250,
    targetMonthly: {
      "Jan'25": 0.19611885,
      "Feb'25": 0.13883945,
      "Mar'25": 0.4150417,
    },
    claimedMonthly: {
      "Jan'25": 0.19611885,
      "Feb'25": 0.13883945,
      "Mar'25": 0.4150417,
    },
    receivedMonthly: {
      "Jan'25": 32359.61,
      "Feb'25": 22908.51,
      "Mar'25": 68481.88,
    },
  },
  {
    name: "2341 Willow Rd",
    status: "Closed",
    siteProgress: 1.0,
    claimTillDate: 1.0,
    totalTargetPct: 1.0,
    totalClaimedPct: 1.0,
    contractSum: 110000,
    totalReceived: 110000,
    balance: 0,
    downPayment: 22000,
    targetMonthly: {
      "Jan'25": 0.31762255,
      "Feb'25": 0.18267273,
      "Mar'25": 0.29970473,
    },
    claimedMonthly: {
      "Jan'25": 0.31762255,
      "Feb'25": 0.18267273,
      "Mar'25": 0.29970473,
    },
    receivedMonthly: {
      "Jan'25": 34938.48,
      "Feb'25": 20094,
      "Mar'25": 32967.52,
    },
  },
  {
    name: "6543 Spruce Way",
    status: "Closed",
    siteProgress: 1.0,
    claimTillDate: 1.0,
    totalTargetPct: 1.0,
    totalClaimedPct: 1.0,
    contractSum: 145000,
    totalReceived: 145000,
    balance: 0,
    downPayment: 36250,
    targetMonthly: {
      "Jan'25": 0.22813166,
      "Feb'25": 0.14710276,
      "Mar'25": 0.37476559,
    },
    claimedMonthly: {
      "Jan'25": 0.22813166,
      "Feb'25": 0.14710276,
      "Mar'25": 0.37476559,
    },
    receivedMonthly: {
      "Jan'25": 33079.09,
      "Feb'25": 21329.9,
      "Mar'25": 54341.01,
    },
  },
  {
    name: "8765 Aspen Blvd",
    status: "Closed",
    siteProgress: 1.0,
    claimTillDate: 1.0,
    totalTargetPct: 1.0,
    totalClaimedPct: 1.0,
    contractSum: 175000,
    totalReceived: 175000,
    balance: 0,
    downPayment: 52500,
    targetMonthly: { "Jan'25": 0.19488469, "Feb'25": 0.50511531 },
    claimedMonthly: { "Jan'25": 0.19488469, "Feb'25": 0.50511531 },
    receivedMonthly: { "Jan'25": 34104.82, "Feb'25": 88395.18 },
  },
  {
    name: "9012 Redwood Cir",
    status: "Closed",
    siteProgress: 1.0,
    claimTillDate: 1.0,
    totalTargetPct: 1.0,
    totalClaimedPct: 1.0,
    contractSum: 125000,
    totalReceived: 125000,
    balance: 0,
    downPayment: 37500,
    targetMonthly: { "Jan'25": 0.24031184, "Feb'25": 0.45968816 },
    claimedMonthly: { "Jan'25": 0.24031184, "Feb'25": 0.45968816 },
    receivedMonthly: { "Jan'25": 30038.98, "Feb'25": 57461.02 },
  },
  {
    name: "1234 Valley View",
    status: "Completed",
    siteProgress: 1.0,
    claimTillDate: 0.94,
    totalTargetPct: 0.9958,
    totalClaimedPct: 0.94,
    contractSum: 250000,
    totalReceived: 235000,
    balance: 15000,
    downPayment: 75000,
    targetMonthly: {
      "Jan'25": 0.16120268,
      "Feb'25": 0.17580432,
      "Mar'25": 0.08712848,
      "Apr'25": 0.14,
      "May'25": 0.13164308,
    },
    claimedMonthly: {
      "Jan'25": 0.16120268,
      "Feb'25": 0.17580432,
      "Mar'25": 0.08712848,
      "Apr'25": 0.08422144,
      "May'25": 0.13164308,
    },
    receivedMonthly: {
      "Jan'25": 40300.67,
      "Feb'25": 43951.08,
      "Mar'25": 21782.12,
      "Apr'25": 21055.36,
      "May'25": 32910.77,
    },
  },
  {
    name: "5567 Mountain Ridge",
    status: "Completed",
    siteProgress: 1.0,
    claimTillDate: 0.91,
    totalTargetPct: 1.0,
    totalClaimedPct: 0.91,
    contractSum: 280000,
    totalReceived: 254800,
    balance: 25200,
    downPayment: 56000,
    targetMonthly: {
      "Jan'25": 0.20408743,
      "Feb'25": 0.18679025,
      "Mar'25": 0.31912232,
    },
    claimedMonthly: {
      "Jan'25": 0.20408743,
      "Feb'25": 0.18679025,
      "Mar'25": 0.31912232,
    },
    receivedMonthly: {
      "Jan'25": 57144.48,
      "Feb'25": 52301.27,
      "Mar'25": 89354.25,
    },
  },
  {
    name: "8901 Lake Shore",
    status: "Completed",
    siteProgress: 1.0,
    claimTillDate: 0.93,
    totalTargetPct: 0.9983,
    totalClaimedPct: 0.93,
    contractSum: 195000,
    totalReceived: 181350,
    balance: 13650,
    downPayment: 39000,
    targetMonthly: {
      "Jan'25": 0.18518215,
      "Feb'25": 0.15265508,
      "Mar'25": 0.2,
      "Apr'25": 0.08711451,
      "May'25": 0.17335774,
    },
    claimedMonthly: {
      "Jan'25": 0.18518215,
      "Feb'25": 0.15265508,
      "Mar'25": 0.13169051,
      "Apr'25": 0.08711451,
      "May'25": 0.17335774,
    },
    receivedMonthly: {
      "Jan'25": 36110.52,
      "Feb'25": 29767.74,
      "Mar'25": 25679.65,
      "Apr'25": 16987.33,
      "May'25": 33804.76,
    },
  },
  {
    name: "3456 Harbor Point",
    status: "Completed",
    siteProgress: 1.0,
    claimTillDate: 0.93,
    totalTargetPct: 1.0002,
    totalClaimedPct: 0.93,
    contractSum: 220000,
    totalReceived: 204600,
    balance: 15400,
    downPayment: 55000,
    targetMonthly: {
      "Jan'25": 0.232245,
      "Feb'25": 0.17212636,
      "Mar'25": 0.13,
      "Apr'25": 0.07,
      "May'25": 0.14579323,
    },
    claimedMonthly: {
      "Jan'25": 0.232245,
      "Feb'25": 0.17212636,
      "Mar'25": 0.077741,
      "Apr'25": 0.05209441,
      "May'25": 0.14579323,
    },
    receivedMonthly: {
      "Jan'25": 51093.9,
      "Feb'25": 37867.8,
      "Mar'25": 17103.02,
      "Apr'25": 11460.77,
      "May'25": 32074.51,
    },
  },
  {
    name: "7788 Riverside Plaza",
    status: "Completed",
    siteProgress: 1.0,
    claimTillDate: 0.9256,
    totalTargetPct: 0.9964,
    totalClaimedPct: 0.9256,
    contractSum: 265000,
    totalReceived: 245277.36,
    balance: 19722.64,
    downPayment: 66250,
    targetMonthly: {
      "Jan'25": 0.22,
      "Feb'25": 0.16,
      "Mar'25": 0.13,
      "Apr'25": 0.23635328,
    },
    claimedMonthly: {
      "Jan'25": 0.18590094,
      "Feb'25": 0.12332072,
      "Mar'25": 0.13,
      "Apr'25": 0.23635328,
    },
    receivedMonthly: {
      "Jan'25": 49263.75,
      "Feb'25": 32679.99,
      "Mar'25": 34450,
      "Apr'25": 62633.62,
    },
  },
  {
    name: "2233 Sunset Ave",
    status: "Completed",
    siteProgress: 1.0,
    claimTillDate: 0.94,
    totalTargetPct: 1.0014,
    totalClaimedPct: 0.94,
    contractSum: 180000,
    totalReceived: 169200,
    balance: 10800,
    downPayment: 45000,
    targetMonthly: {
      "Jan'25": 0.21157744,
      "Feb'25": 0.17018339,
      "Mar'25": 0.17,
      "Apr'25": 0.19963194,
    },
    claimedMonthly: {
      "Jan'25": 0.21157744,
      "Feb'25": 0.17018339,
      "Mar'25": 0.10860722,
      "Apr'25": 0.19963194,
    },
    receivedMonthly: {
      "Jan'25": 38083.94,
      "Feb'25": 30633.01,
      "Mar'25": 19549.3,
      "Apr'25": 35933.75,
    },
  },
  {
    name: "4455 Ocean Dr",
    status: "Completed",
    siteProgress: 1.0,
    claimTillDate: 0.86,
    totalTargetPct: 1.0021,
    totalClaimedPct: 0.86,
    contractSum: 240000,
    totalReceived: 206400,
    balance: 33600,
    downPayment: 60000,
    targetMonthly: {
      "Jan'25": 0.168988,
      "Feb'25": 0.16374558,
      "Mar'25": 0.17,
      "Apr'25": 0.13,
      "May'25": 0.11936479,
    },
    claimedMonthly: {
      "Jan'25": 0.168988,
      "Feb'25": 0.16374558,
      "Mar'25": 0.10921462,
      "Apr'25": 0.048687,
      "May'25": 0.11936479,
    },
    receivedMonthly: {
      "Jan'25": 40557.12,
      "Feb'25": 39298.94,
      "Mar'25": 26211.51,
      "Apr'25": 11684.88,
      "May'25": 28647.55,
    },
  },
  {
    name: "6677 Bay St",
    status: "Completed",
    siteProgress: 1.0,
    claimTillDate: 0.95,
    totalTargetPct: 1.0,
    totalClaimedPct: 0.95,
    contractSum: 210000,
    totalReceived: 199500,
    balance: 10500,
    downPayment: 52500,
    targetMonthly: { "Jan'25": 0.21, "Feb'25": 0.23, "Mar'25": 0.31 },
    claimedMonthly: {
      "Jan'25": 0.17678443,
      "Feb'25": 0.20695386,
      "Mar'25": 0.31626171,
    },
    receivedMonthly: {
      "Jan'25": 37124.73,
      "Feb'25": 43460.31,
      "Mar'25": 66414.96,
    },
  },
  {
    name: "9900 Park Ln",
    status: "Completed",
    siteProgress: 1.0,
    claimTillDate: 0.92,
    totalTargetPct: 1.0016,
    totalClaimedPct: 0.92,
    contractSum: 290000,
    totalReceived: 266800,
    balance: 23200,
    downPayment: 87000,
    targetMonthly: { "Jan'25": 0.26, "Feb'25": 0.14, "Mar'25": 0.30164607 },
    claimedMonthly: {
      "Jan'25": 0.21743176,
      "Feb'25": 0.10092217,
      "Mar'25": 0.30164607,
    },
    receivedMonthly: {
      "Jan'25": 63055.21,
      "Feb'25": 29267.43,
      "Mar'25": 87477.36,
    },
  },
  {
    name: "1122 Garden Ct",
    status: "Completed",
    siteProgress: 1.0,
    claimTillDate: 0.88,
    totalTargetPct: 1.0037,
    totalClaimedPct: 0.88,
    contractSum: 175000,
    totalReceived: 154000,
    balance: 21000,
    downPayment: 52500,
    targetMonthly: {
      "Jan'25": 0.16370023,
      "Feb'25": 0.15,
      "Mar'25": 0.17,
      "Apr'25": 0.22,
    },
    claimedMonthly: {
      "Jan'25": 0.16370023,
      "Feb'25": 0.11373469,
      "Mar'25": 0.12100423,
      "Apr'25": 0.18156086,
    },
    receivedMonthly: {
      "Jan'25": 28647.54,
      "Feb'25": 19903.57,
      "Mar'25": 21175.74,
      "Apr'25": 31773.15,
    },
  },
  {
    name: "3344 Tech Center",
    status: "In Progress",
    siteProgress: 0.52,
    claimTillDate: 0.3429,
    totalTargetPct: 0.48,
    totalClaimedPct: 0.3429,
    contractSum: 350000,
    totalReceived: 120026.97,
    balance: 229973.03,
    downPayment: 70000,
    targetMonthly: {
      "Apr'26": 0.08505609,
      "May'26": 0.05787811,
      "Jun'26": 0.0496438,
      "July'26": 0.087422,
    },
    claimedMonthly: { "Apr'26": 0.08505609, "May'26": 0.05787811 },
    receivedMonthly: { "Apr'26": 29769.63, "May'26": 20257.34 },
  },
  {
    name: "5566 Innovation Hub",
    status: "In Progress",
    siteProgress: 0.49,
    claimTillDate: 0.515,
    totalTargetPct: 0.6675,
    totalClaimedPct: 0.515,
    contractSum: 420000,
    totalReceived: 216283.8,
    balance: 203716.2,
    downPayment: 105000,
    targetMonthly: {
      "Mar'26": 0.10967338,
      "Apr'26": 0.07898105,
      "May'26": 0.076307,
      "Jun'26": 0.15253857,
    },
    claimedMonthly: {
      "Mar'26": 0.10967338,
      "Apr'26": 0.07898105,
      "May'26": 0.076307,
    },
    receivedMonthly: {
      "Mar'26": 46062.82,
      "Apr'26": 33172.04,
      "May'26": 32048.94,
    },
  },
  {
    name: "7788 Commerce Plaza",
    status: "In Progress",
    siteProgress: 0.5,
    claimTillDate: 0.4174,
    totalTargetPct: 0.46,
    totalClaimedPct: 0.4174,
    contractSum: 380000,
    totalReceived: 158629.27,
    balance: 221370.73,
    downPayment: 76000,
    targetMonthly: {
      "June'25": 0.06649166,
      "Apr'26": 0.10034374,
      "May'26": 0.05061005,
      "Jun'26": 0.04255455,
    },
    claimedMonthly: {
      "June'25": 0.06649166,
      "Apr'26": 0.10034374,
      "May'26": 0.05061005,
    },
    receivedMonthly: {
      "June'25": 25266.83,
      "Apr'26": 38130.62,
      "May'26": 19231.82,
    },
  },
  {
    name: "9900 Business Park",
    status: "In Progress",
    siteProgress: 0.68,
    claimTillDate: 0.6094,
    totalTargetPct: 0.887,
    totalClaimedPct: 0.6094,
    contractSum: 460000,
    totalReceived: 280319.74,
    balance: 179680.26,
    downPayment: 138000,
    targetMonthly: {
      "Apr'26": 0.16700046,
      "May'26": 0.14239028,
      "Jun'26": 0.27760926,
    },
    claimedMonthly: { "Apr'26": 0.16700046, "May'26": 0.14239028 },
    receivedMonthly: { "Apr'26": 76820.21, "May'26": 65499.53 },
  },
  {
    name: "2211 Industrial Way",
    status: "In Progress",
    siteProgress: 0.74,
    claimTillDate: 0.5618,
    totalTargetPct: 0.67,
    totalClaimedPct: 0.5618,
    contractSum: 290000,
    totalReceived: 162914.41,
    balance: 127085.59,
    downPayment: 87000,
    targetMonthly: {
      "June'25": 0.16852914,
      "May'26": 0.09324469,
      "Jun'26": 0.10822617,
    },
    claimedMonthly: { "June'25": 0.16852914, "May'26": 0.09324469 },
    receivedMonthly: { "June'25": 48873.45, "May'26": 27040.96 },
  },
  {
    name: "4433 Corporate Dr",
    status: "In Progress",
    siteProgress: 0.73,
    claimTillDate: 0.5715,
    totalTargetPct: 0.62,
    totalClaimedPct: 0.5715,
    contractSum: 335000,
    totalReceived: 191464.68,
    balance: 143535.32,
    downPayment: 83750,
    targetMonthly: {
      "June'25": 0.12562782,
      "Apr'26": 0.12629221,
      "May'26": 0.06961633,
      "Jun'26": 0.04846364,
    },
    claimedMonthly: {
      "June'25": 0.12562782,
      "Apr'26": 0.12629221,
      "May'26": 0.06961633,
    },
    receivedMonthly: {
      "June'25": 42085.32,
      "Apr'26": 42307.89,
      "May'26": 23321.47,
    },
  },
  {
    name: "6655 Enterprise Rd",
    status: "In Progress",
    siteProgress: 0.79,
    claimTillDate: 0.9016,
    totalTargetPct: 1.0016,
    totalClaimedPct: 0.9016,
    contractSum: 395000,
    totalReceived: 356145.11,
    balance: 38854.89,
    downPayment: 118500,
    targetMonthly: { "Apr'26": 0.25163319, "May'26": 0.45 },
    claimedMonthly: { "Apr'26": 0.25163319, "May'26": 0.35 },
    receivedMonthly: { "Apr'26": 99395.11, "May'26": 138250 },
  },
  {
    name: "8877 Venture St",
    status: "In Progress",
    siteProgress: 0.56,
    claimTillDate: 0.6143,
    totalTargetPct: 0.807,
    totalClaimedPct: 0.6143,
    contractSum: 410000,
    totalReceived: 251859.66,
    balance: 158140.34,
    downPayment: 123000,
    targetMonthly: {
      "Mar'26": 0.14963478,
      "Apr'26": 0.08940093,
      "May'26": 0.07525615,
      "Jun'26": 0.19270815,
    },
    claimedMonthly: {
      "Mar'26": 0.14963478,
      "Apr'26": 0.08940093,
      "May'26": 0.07525615,
    },
    receivedMonthly: {
      "Mar'26": 61350.26,
      "Apr'26": 36654.38,
      "May'26": 30855.02,
    },
  },
  {
    name: "1010 Summit Pl",
    status: "In Progress",
    siteProgress: 0.81,
    claimTillDate: 0.7,
    totalTargetPct: 0.7,
    totalClaimedPct: 0.7,
    contractSum: 315000,
    totalReceived: 220500,
    balance: 94500,
    downPayment: 94500,
    targetMonthly: {
      "Feb'26": 0.13286076,
      "Mar'26": 0.07081067,
      "Apr'26": 0.19632857,
    },
    claimedMonthly: {
      "Feb'26": 0.13286076,
      "Mar'26": 0.07081067,
      "Apr'26": 0.19632857,
    },
    receivedMonthly: {
      "Feb'26": 41851.14,
      "Mar'26": 22305.36,
      "Apr'26": 61843.5,
    },
  },
  {
    name: "3030 Gateway Blvd",
    status: "In Progress",
    siteProgress: 0.75,
    claimTillDate: 0.6571,
    totalTargetPct: 0.9947,
    totalClaimedPct: 0.6571,
    contractSum: 485000,
    totalReceived: 318670.63,
    balance: 166329.37,
    downPayment: 121250,
    targetMonthly: {
      "Apr'26": 0.26424889,
      "May'26": 0.2,
      "Jun'26": 0.28044715,
    },
    claimedMonthly: { "Apr'26": 0.26424889, "May'26": 0.14280396 },
    receivedMonthly: { "Apr'26": 128160.71, "May'26": 69259.92 },
  },
  {
    name: "4567 Future Plaza",
    status: "Upcoming Project",
    siteProgress: 0.26,
    claimTillDate: 0.0,
    totalTargetPct: 0.2,
    totalClaimedPct: 0.0,
    contractSum: 520000,
    totalReceived: 0,
    balance: 520000,
    targetMonthly: {},
    claimedMonthly: {},
    receivedMonthly: {},
  },
  {
    name: "7891 Horizon Tower",
    status: "Upcoming Project",
    siteProgress: 0.18,
    claimTillDate: 0.0,
    totalTargetPct: 0.3,
    totalClaimedPct: 0.0,
    contractSum: 450000,
    totalReceived: 0,
    balance: 450000,
    targetMonthly: {},
    claimedMonthly: {},
    receivedMonthly: {},
  },
  {
    name: "2345 Vision Center",
    status: "Upcoming Project",
    siteProgress: 0.27,
    claimTillDate: 0.0,
    totalTargetPct: 0.2,
    totalClaimedPct: 0.0,
    contractSum: 380000,
    totalReceived: 0,
    balance: 380000,
    targetMonthly: {},
    claimedMonthly: {},
    receivedMonthly: {},
  },
  {
    name: "6789 Dream Ave",
    status: "Upcoming Project",
    siteProgress: 0.03,
    claimTillDate: 0.0,
    totalTargetPct: 0.3,
    totalClaimedPct: 0.0,
    contractSum: 495000,
    totalReceived: 0,
    balance: 495000,
    targetMonthly: {},
    claimedMonthly: {},
    receivedMonthly: {},
  },
  {
    name: "1357 Nexus Point",
    status: "Upcoming Project",
    siteProgress: 0.02,
    claimTillDate: 0.0,
    totalTargetPct: 0.2,
    totalClaimedPct: 0.0,
    contractSum: 560000,
    totalReceived: 0,
    balance: 560000,
    targetMonthly: {},
    claimedMonthly: {},
    receivedMonthly: {},
  },
  {
    name: "2468 Skyline Dr",
    status: "Upcoming Project",
    siteProgress: 0.12,
    claimTillDate: 0.0,
    totalTargetPct: 0.3,
    totalClaimedPct: 0.0,
    contractSum: 425000,
    totalReceived: 0,
    balance: 425000,
    targetMonthly: {},
    claimedMonthly: {},
    receivedMonthly: {},
  },
  {
    name: "9753 Pioneer Way",
    status: "Upcoming Project",
    siteProgress: 0.27,
    claimTillDate: 0.0,
    totalTargetPct: 0.3,
    totalClaimedPct: 0.0,
    contractSum: 510000,
    totalReceived: 0,
    balance: 510000,
    targetMonthly: {},
    claimedMonthly: {},
    receivedMonthly: {},
  },
  {
    name: "8642 Frontier Rd",
    status: "Upcoming Project",
    siteProgress: 0.29,
    claimTillDate: 0.0,
    totalTargetPct: 0.2,
    totalClaimedPct: 0.0,
    contractSum: 475000,
    totalReceived: 0,
    balance: 475000,
    targetMonthly: {},
    claimedMonthly: {},
    receivedMonthly: {},
  },
  {
    name: "5319 Discovery Ln",
    status: "Upcoming Project",
    siteProgress: 0.14,
    claimTillDate: 0.0,
    totalTargetPct: 0.2,
    totalClaimedPct: 0.0,
    contractSum: 535000,
    totalReceived: 0,
    balance: 535000,
    targetMonthly: {},
    claimedMonthly: {},
    receivedMonthly: {},
  },
  {
    name: "7531 Evolution Park",
    status: "Upcoming Project",
    siteProgress: 0.07,
    claimTillDate: 0.0,
    totalTargetPct: 0.25,
    totalClaimedPct: 0.0,
    contractSum: 590000,
    totalReceived: 0,
    balance: 590000,
    targetMonthly: {},
    claimedMonthly: {},
    receivedMonthly: {},
  },
];

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const MONTHS_2025 = [
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
];
const MONTHS_2026 = [
  "Jan'26",
  "Feb'26",
  "Mar'26",
  "Apr'26",
  "May'26",
  "Jun'26",
  "July'26",
];
const ALL_MONTHS = [...MONTHS_2025, ...MONTHS_2026];

// Full 12-month list for FY2026 (data only goes to July'26; Aug-Dec are forecast slots)
const MONTHS_2026_FULL = [
  "Jan'26",
  "Feb'26",
  "Mar'26",
  "Apr'26",
  "May'26",
  "Jun'26",
  "July'26",
  "Aug'26",
  "Sept'26",
  "Oct'26",
  "Nov'26",
  "Dec'26",
];
// Map a month key -> {year, monthIndex 0-11} so we can compare against "today"
const MONTH_ORDER = {
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
  // key like "July'26" -> name "July", yr 2026
  const m = key.match(/^([A-Za-z]+)'(\d{2})$/);
  if (!m) return { year: 2025, idx: 0 };
  return { year: 2000 + parseInt(m[2], 10), idx: MONTH_ORDER[m[1]] ?? 0 };
}

// Is a month key in the past or current (relative to today)?
function isPastOrCurrentMonth(key) {
  const now = new Date();
  const meta = monthMeta(key);
  return (
    meta.year < now.getFullYear() ||
    (meta.year === now.getFullYear() && meta.idx <= now.getMonth())
  );
}

// Cumulative achieved % up to and including today's month (0..1).
function cumulativeAchieved(achievedMonthly) {
  let sum = 0;
  Object.entries(achievedMonthly || {}).forEach(([k, v]) => {
    if (isPastOrCurrentMonth(k)) {
      const x = parseFloat(v);
      if (!isNaN(x)) sum += x;
    }
  });
  return Math.min(Math.max(sum, 0), 1);
}

// Per-month shortfall roll-forward for one project.
// Returns an array of { month, target, achieved, effectiveTarget, shortfall, carriedIn }
// where shortfall carries into the next month's effective target.
// All values are decimals (0..1).
function buildShortfallRows(targetMonthly, achievedMonthly) {
  const rows = [];
  let carry = 0; // shortfall carried from previous month
  ALL_MONTHS.forEach((month) => {
    const t = parseFloat(targetMonthly?.[month]);
    const a = parseFloat(achievedMonthly?.[month]);
    const hasTarget = !isNaN(t);
    const hasAchieved = !isNaN(a);
    // Skip months with no target AND no achieved AND no carry (nothing to show)
    if (!hasTarget && !hasAchieved && carry === 0) return;
    const target = hasTarget ? t : 0;
    const achieved = hasAchieved ? a : 0;
    const effectiveTarget = target + carry;
    const shortfall = Math.max(0, effectiveTarget - achieved);
    rows.push({
      month,
      target,
      achieved,
      carriedIn: carry,
      effectiveTarget,
      shortfall,
    });
    carry = shortfall; // roll forward
  });
  return rows;
}
const STATUS_LIST = ["Completed", "Closed", "In Progress", "Upcoming Project"];

// ─── COLORS ──────────────────────────────────────────────────────────────────
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
  teal: "#2dd4bf",
  status: {
    Completed: { bg: "#052e16", text: "#86efac", dot: "#22c55e" },
    Closed: { bg: "#0c1a3a", text: "#93c5fd", dot: "#3b82f6" },
    "In Progress": { bg: "#1c1500", text: "#fde68a", dot: "#eab308" },
    "Upcoming Project": { bg: "#1e2130", text: "#c4c9d8", dot: "#9ca3af" },
  },
};

// ─── FORMULA ENGINE ──────────────────────────────────────────────────────────
const computeBalance = (p) => p.contractSum - p.totalReceived;
const computeClaimTillDate = (p) =>
  Object.values(p.claimedMonthly).reduce((s, v) => s + v, 0);
const computeTotalTargetPct = (p) =>
  Object.values(p.targetMonthly).reduce((s, v) => s + v, 0);

// ADDITION 6: Risk flag logic
// High   = siteProgress > claimTillDate + 0.2  (site ahead of claims by >20%)
// Medium = siteProgress > claimTillDate + 0.1
// Low    = otherwise
function computeRisk(p) {
  // Risk is now set MANUALLY by the client and stored on the project.
  const lvl = (p.riskLevel || "low").toLowerCase();
  if (lvl === "high") return { level: "high", label: "High", color: C.red };
  if (lvl === "medium")
    return { level: "medium", label: "Medium", color: C.amber };
  if (lvl === "none") return { level: "none", label: "—", color: C.textDim };
  return { level: "low", label: "Low", color: C.green };
}

function computeYearSummary(projects, year, monthsOverride) {
  // monthsOverride lets callers pass an explicit month list (used by the
  // dynamic multi-year comparison); otherwise fall back to the fixed lists.
  const months =
    monthsOverride || (year === "2025" ? MONTHS_2025 : MONTHS_2026);
  const active = projects.filter((p) =>
    months.some(
      (m) => (p.receivedMonthly[m] || 0) > 0 || (p.targetMonthly[m] || 0) > 0,
    ),
  );
  return {
    count: active.length,
    totalContract: active.reduce((s, p) => s + p.contractSum, 0),
    yearReceived: active.reduce(
      (s, p) =>
        s + months.reduce((ms, m) => ms + (p.receivedMonthly[m] || 0), 0),
      0,
    ),
    lifetimeReceived: active.reduce((s, p) => s + p.totalReceived, 0),
    totalClaimed: active.reduce(
      (s, p) => s + p.contractSum * p.totalClaimedPct,
      0,
    ),
    totalPending: active.reduce(
      (s, p) => s + Math.max(0, computeBalance(p)),
      0,
    ),
  };
}

// ─── FORMATTERS ──────────────────────────────────────────────────────────────
const fmtM = (v) =>
  v >= 1e6
    ? `$${(v / 1e6).toFixed(2)}M`
    : v >= 1000
      ? `$${(v / 1000).toFixed(1)}K`
      : `$${Math.round(v).toLocaleString()}`;
const fmtFull = (v) => `$${Math.round(v).toLocaleString()}`;
const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;

// ─── TINY COMPONENTS ─────────────────────────────────────────────────────────
const Card = ({ children, style = {} }) => (
  <div
    style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      overflow: "hidden",
      ...style,
    }}
  >
    {children}
  </div>
);
const CardHead = ({ title, sub }) => (
  <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</div>
    {sub && (
      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
        {sub}
      </div>
    )}
  </div>
);
const Bar2 = ({ value, color = C.blue, h = 5 }) => (
  <div
    style={{
      background: C.border,
      borderRadius: h,
      height: h,
      overflow: "hidden",
      width: "100%",
    }}
  >
    <div
      style={{
        width: `${Math.min(100, Math.max(0, value * 100))}%`,
        height: "100%",
        background: color,
        borderRadius: h,
        transition: "width 0.4s",
      }}
    />
  </div>
);
const Badge = ({ status }) => {
  const s = C.status[status] || C.status["Upcoming Project"];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 20,
        background: s.bg,
        color: s.text,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }}
      />
      {status === "Upcoming Project" ? "Upcoming" : status}
    </span>
  );
};
const Sel = ({ value, onChange, options }) => (
  <div style={{ position: "relative" }}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        appearance: "none",
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 9,
        padding: "7px 32px 7px 11px",
        fontSize: 13,
        color: "#c4c9d8",
        fontWeight: 500,
        cursor: "pointer",
        outline: "none",
        minWidth: 148,
      }}
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
    <ChevronDown
      size={13}
      style={{
        position: "absolute",
        right: 9,
        top: "50%",
        transform: "translateY(-50%)",
        pointerEvents: "none",
        color: C.textDim,
      }}
    />
  </div>
);
const YearTabs = ({ value, onChange }) => (
  <div style={{ display: "flex", gap: 4 }}>
    {["2025", "2026"].map((y) => (
      <button
        key={y}
        onClick={() => onChange(y)}
        style={{
          padding: "5px 14px",
          borderRadius: 8,
          border: `1px solid ${value === y ? C.blue : C.border}`,
          background: value === y ? "#0d1a2e" : C.card,
          color: value === y ? C.blue : "#c4c9d8",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        FY {y}
      </button>
    ))}
  </div>
);

// ─── ADDITION 2: Collection Rate Gauge (SVG radial arc) ──────────────────────
function CollectionGauge({ pct }) {
  const r = 54,
    cx = 70,
    cy = 70;
  const angle = pct * 270; // 270° sweep
  const startAngle = -225;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const arcX = (deg) => cx + r * Math.cos(toRad(deg));
  const arcY = (deg) => cy + r * Math.sin(toRad(deg));
  const endDeg = startAngle + angle;
  const largeArc = angle > 180 ? 1 : 0;
  const display = (pct * 100).toFixed(1);
  const color = pct >= 0.8 ? C.green : pct >= 0.5 ? C.blue : C.amber;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <svg width={140} height={130} style={{ overflow: "visible" }}>
        <path
          d={`M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 1 1 ${arcX(startAngle + 270)} ${arcY(startAngle + 270)}`}
          fill="none"
          stroke={C.border}
          strokeWidth={10}
          strokeLinecap="round"
        />
        {pct > 0 && (
          <path
            d={`M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 ${largeArc} 1 ${arcX(endDeg)} ${arcY(endDeg)}`}
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeLinecap="round"
          />
        )}
        <text
          x={cx}
          y={cy + 6}
          textAnchor="middle"
          fontSize={22}
          fontWeight={700}
          fill={color}
        >
          {display}%
        </text>
        <text
          x={cx}
          y={cy + 22}
          textAnchor="middle"
          fontSize={10}
          fill={C.textMuted}
        >
          collected
        </text>
        <text
          x={arcX(startAngle)}
          y={arcY(startAngle) + 14}
          textAnchor="middle"
          fontSize={9}
          fill={C.textDim}
        >
          0%
        </text>
        <text
          x={arcX(startAngle + 270) + 4}
          y={arcY(startAngle + 270) + 14}
          textAnchor="middle"
          fontSize={9}
          fill={C.textDim}
        >
          100%
        </text>
      </svg>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
        Received Rate
      </div>
    </div>
  );
}

// ─── ADDITION 7: Mini Sparkline (inline SVG bars) ───────────────────────────
function Sparkline({ project }) {
  const months = ALL_MONTHS;
  const vals = months
    .map((m) => project.receivedMonthly[m] || 0)
    .filter((v) => v > 0);
  if (!vals.length)
    return <span style={{ color: C.textDim, fontSize: 11 }}>—</span>;
  const allVals = months.map((m) => project.receivedMonthly[m] || 0);
  const maxV = Math.max(...allVals, 1);
  const w = 6,
    gap = 2,
    h = 20;
  return (
    <svg
      width={months.length * (w + gap)}
      height={h}
      style={{ display: "block" }}
    >
      {allVals.map((v, i) => {
        const barH = Math.max(2, (v / maxV) * h);
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={h - barH}
            width={w}
            height={barH}
            rx={1}
            fill={v > 0 ? C.teal : C.border}
          />
        );
      })}
    </svg>
  );
}

// ─── CUSTOM TOOLTIPS ─────────────────────────────────────────────────────────
const TT = ({ active, payload, label, extra = "" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#0d0f16",
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 12,
        color: C.text,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#e5e7eb" }}>
        {label}
      </div>
      {payload.map((p, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: p.color || p.fill,
              flexShrink: 0,
            }}
          />
          <span style={{ color: C.textMuted }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>
            {typeof p.value === "number" && p.name?.includes("%")
              ? fmtPct(p.value / 100)
              : fmtFull(p.value)}
          </span>
        </div>
      ))}
      {extra && (
        <div style={{ color: C.textDim, fontSize: 11, marginTop: 4 }}>
          {extra}
        </div>
      )}
    </div>
  );
};

const ScatterTT = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div
      style={{
        background: "#0d0f16",
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 12,
        color: C.text,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
      <div style={{ color: C.textMuted }}>
        Site progress:{" "}
        <span style={{ color: C.text, fontWeight: 600 }}>
          {fmtPct(d.x / 100)}
        </span>
      </div>
      <div style={{ color: C.textMuted }}>
        Claimed:{" "}
        <span style={{ color: C.text, fontWeight: 600 }}>
          {fmtPct(d.y / 100)}
        </span>
      </div>
      <div style={{ color: C.textMuted }}>
        Contract:{" "}
        <span style={{ color: C.text, fontWeight: 600 }}>
          {fmtFull(d.contract)}
        </span>
      </div>
    </div>
  );
};

// ─── MAIN DASHBOARD ──────────────────────────────────────────────────────────
export default function ProjectProgressModule() {
  // ── Database state ──
  const [RAW_PROJECTS, setRawProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // ── Add/Edit modal state ──
  const [modalOpen, setModalOpen] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [detailProject, setDetailProject] = useState(null);

  // ── Fetch projects from database (reusable) ──
  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await api.get("/projects");
      if (response.data.success) {
        const transformed = response.data.data.map((item) => {
          const achievedMonthly = item.achieved_monthly || {};
          // If achieved data exists, site progress = cumulative achieved up to today.
          // Otherwise fall back to the stored site_progress value.
          const hasAchieved = Object.keys(achievedMonthly).length > 0;
          const computedSite = hasAchieved
            ? cumulativeAchieved(achievedMonthly)
            : parseFloat(item.site_progress) || 0;
          return {
            id: item.id,
            name: item.project_name,
            status: item.status,
            siteProgress: computedSite,
            claimTillDate: parseFloat(item.claim_till_date) || 0,
            totalTargetPct: parseFloat(item.total_target_pct) || 0,
            totalClaimedPct: parseFloat(item.total_claimed_pct) || 0,
            contractSum: parseFloat(item.contract_sum) || 0,
            totalReceived: parseFloat(item.total_received) || 0,
            balance: parseFloat(item.balance) || 0,
            downPayment: parseFloat(item.down_payment) || 0,
            riskLevel: item.risk_level || "low",
            targetMonthly: item.target_monthly || {},
            claimedMonthly: item.claimed_monthly || {},
            receivedMonthly: item.received_monthly || {},
            achievedMonthly: achievedMonthly,
            // raw fields for the edit form:
            project_name: item.project_name,
            contract_sum: item.contract_sum,
            down_payment: item.down_payment,
            down_payment_month: item.down_payment_month,
            site_progress: item.site_progress,
            claim_till_date: item.claim_till_date,
            target_monthly: item.target_monthly,
            claimed_monthly: item.claimed_monthly,
            received_monthly: item.received_monthly,
            achieved_monthly: item.achieved_monthly,
          };
        });
        setRawProjects(transformed);
        setFetchError(null);
      } else {
        setFetchError("Failed to load projects");
        setRawProjects([]);
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
      setFetchError(err.message || "Failed to load projects");
      setRawProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [chartYear, setChartYear] = useState("2025");
  const [velocityYear, setVelocityYear] = useState("2025");
  const [top5View, setTop5View] = useState("pending"); // pending | collected
  const [showAllTop5, setShowAllTop5] = useState(false);
  const [monthlyYear, setMonthlyYear] = useState("2025");
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [activeTab, setActiveTab] = useState("overview");
  const [exporting, setExporting] = useState(false);

  // ── Filtered set ──
  const filtered = useMemo(
    () =>
      RAW_PROJECTS.filter((p) => {
        if (statusFilter !== "all" && p.status !== statusFilter) return false;
        if (projectFilter !== "all" && p.name !== projectFilter) return false;
        if (monthFilter !== "all") {
          if (!p.targetMonthly[monthFilter] && !p.receivedMonthly[monthFilter])
            return false;
        }
        return true;
      }),
    [RAW_PROJECTS, statusFilter, projectFilter, monthFilter],
  );

  // ── KPIs ──
  const kpis = useMemo(
    () => ({
      totalContract: filtered.reduce((s, p) => s + p.contractSum, 0),
      totalReceived: filtered.reduce((s, p) => s + p.totalReceived, 0),
      totalPending: filtered.reduce(
        (s, p) => s + Math.max(0, p.contractSum - p.totalReceived),
        0,
      ),
      totalClaimed: filtered.reduce(
        (s, p) => s + p.contractSum * p.totalClaimedPct,
        0,
      ),
    }),
    [filtered],
  );

  const collectionRate =
    kpis.totalContract > 0 ? kpis.totalReceived / kpis.totalContract : 0;

  // ── ADDITION 1: Donut data ──
  const donutData = useMemo(() => {
    const counts = {
      Completed: 0,
      Closed: 0,
      "In Progress": 0,
      "Upcoming Project": 0,
    };
    filtered.forEach((p) => {
      if (counts[p.status] !== undefined) counts[p.status]++;
    });
    return [
      { name: "Completed", value: counts.Completed, color: "#22c55e" },
      { name: "Closed", value: counts.Closed, color: "#3b82f6" },
      { name: "In Progress", value: counts["In Progress"], color: "#eab308" },
      { name: "Upcoming", value: counts["Upcoming Project"], color: "#6b7280" },
    ].filter((d) => d.value > 0);
  }, [filtered]);

  // ── ADDITION 3: Monthly stacked bar (Target $ / Received $ / Pending $) ──
  const stackedBarData = useMemo(() => {
    const months = chartYear === "2025" ? MONTHS_2025 : MONTHS_2026;
    return months.map((m) => {
      const targetAmt = filtered.reduce(
        (s, p) => s + p.contractSum * (p.targetMonthly[m] || 0),
        0,
      );
      const receivedAmt = filtered.reduce(
        (s, p) => s + (p.receivedMonthly[m] || 0),
        0,
      );
      const pendingAmt = Math.max(0, targetAmt - receivedAmt);
      return {
        month: m.replace("'25", "").replace("'26", ""),
        "Target $": Math.round(targetAmt),
        "Received $": Math.round(receivedAmt),
        "Pending $": Math.round(pendingAmt),
      };
    });
  }, [filtered, chartYear]);

  // ── Revenue Velocity: selected year's months (Jan..Dec for 2025, Jan..Jul for 2026) ──
  const velocityData = useMemo(() => {
    const months = velocityYear === "2025" ? MONTHS_2025 : MONTHS_2026;
    return months.map((m) => ({
      month: m.replace("'25", "").replace("'26", ""),
      fullMonth: m,
      "Received $": Math.round(
        filtered.reduce((s, p) => s + (p.receivedMonthly[m] || 0), 0),
      ),
    }));
  }, [filtered, velocityYear]);

  // Total received for the selected velocity year (drives the big number)
  const velocityYearTotal = useMemo(
    () => velocityData.reduce((s, d) => s + d["Received $"], 0),
    [velocityData],
  );

  // ── ADDITION 4: Cumulative received ──
  const cumulativeData = useMemo(() => {
    const months = chartYear === "2025" ? MONTHS_2025 : MONTHS_2026;
    let running = 0;
    return months.map((m) => {
      const amt = filtered.reduce((s, p) => s + (p.receivedMonthly[m] || 0), 0);
      running += amt;
      return {
        month: m.replace("'25", "").replace("'26", ""),
        "Cumulative $": Math.round(running),
      };
    });
  }, [filtered, chartYear]);

  // ── ADDITION 5: Scatter plot data ──
  const scatterData = useMemo(() => {
    const colorMap = {
      Completed: "#22c55e",
      Closed: "#3b82f6",
      "In Progress": "#eab308",
      "Upcoming Project": "#6b7280",
    };
    return filtered
      .filter((p) => p.contractSum > 0)
      .map((p) => ({
        name: p.name,
        x: Math.round(p.siteProgress * 100),
        y: Math.round(p.totalClaimedPct * 100),
        z: Math.round(p.contractSum / 10000),
        contract: p.contractSum,
        color: colorMap[p.status] || "#6b7280",
        status: p.status,
      }));
  }, [filtered]);

  // ── Monthly Target data (per month: targetAmt, claimedAmt, receivedAmt, gap) ──
  const monthlyTargetData = useMemo(() => {
    return ALL_MONTHS.map((m) => {
      let targetAmt = 0,
        claimedAmt = 0,
        receivedAmt = 0,
        // Contract-weighted work progress (fractions), for target-vs-achieved:
        targetWork = 0,
        achievedWork = 0,
        projectCount = 0;
      filtered.forEach((p) => {
        const tv = p.targetMonthly[m] || 0;
        const cv = p.claimedMonthly[m] || 0;
        const rv = p.receivedMonthly[m] || 0;
        const av = (p.achievedMonthly || {})[m] || 0;
        if (tv > 0 || rv > 0 || av > 0) {
          targetAmt += p.contractSum * tv;
          claimedAmt += p.contractSum * cv;
          receivedAmt += rv;
          targetWork += p.contractSum * tv;
          achievedWork += p.contractSum * av;
          projectCount++;
        }
      });
      const gap = Math.max(0, targetAmt - receivedAmt);
      // Achievement = actual work progress vs planned work progress (not money).
      const achievementRate = targetWork > 0 ? achievedWork / targetWork : 0;
      return {
        month: m.replace("'25", "").replace("'26", ""),
        fullMonth: m,
        year: m.includes("'25") ? "2025" : "2026",
        "Target $": Math.round(targetAmt),
        "Claimed $": Math.round(claimedAmt),
        "Received $": Math.round(receivedAmt),
        "Gap $": Math.round(gap),
        achievementRate,
        projectCount,
      };
    }).filter((d) => d["Target $"] > 0 || d["Received $"] > 0);
  }, [filtered]);

  // ── Year-aware monthly data with past/forecast split ──
  // Past/current months → Claimed $ + Received $ (actuals).
  // Future months (after today) → Target $ only, flagged forecast.
  const yearMonthlyData = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curIdx = now.getMonth(); // 0-11
    const months = monthlyYear === "2025" ? MONTHS_2025 : MONTHS_2026_FULL;
    return months.map((m) => {
      const meta = monthMeta(m);
      const isForecast =
        meta.year > curYear || (meta.year === curYear && meta.idx > curIdx);
      let targetAmt = 0,
        claimedAmt = 0,
        receivedAmt = 0,
        contractBase = 0,
        projectCount = 0;
      filtered.forEach((p) => {
        const tv = p.targetMonthly[m] || 0;
        const cv = p.claimedMonthly[m] || 0;
        const rv = p.receivedMonthly[m] || 0;
        if (tv > 0 || cv > 0 || rv > 0) {
          targetAmt += p.contractSum * tv;
          claimedAmt += p.contractSum * cv;
          receivedAmt += rv;
          // Weight the target % by contract size (only projects active this month).
          if (tv > 0) contractBase += p.contractSum;
          projectCount++;
        }
      });
      // Contract-weighted average target % for the month (work planned, not money).
      const targetPct = contractBase > 0 ? targetAmt / contractBase : 0;
      return {
        month: m.replace("'25", "").replace("'26", ""),
        fullMonth: m,
        isForecast,
        // Chart fields (past: claimed+received bars · forecast: target bar):
        "Target $": isForecast ? Math.round(targetAmt) : 0,
        "Claimed $": isForecast ? 0 : Math.round(claimedAmt),
        "Received $": isForecast ? 0 : Math.round(receivedAmt),
        // Raw values for the table (always available):
        targetRaw: Math.round(targetAmt),
        targetPct, // work-progress target as a fraction (0–1)
        contractBase, // Σ contract of projects with a target this month (for weighting totals)
        claimedRaw: Math.round(claimedAmt),
        receivedRaw: Math.round(receivedAmt),
        projectCount,
      };
    });
  }, [filtered, monthlyYear]);

  // ── Per-project monthly target details (for drill-down table) ──
  const perProjectTargetRows = useMemo(() => {
    const months = chartYear === "2025" ? MONTHS_2025 : MONTHS_2026;
    const rows = [];
    filtered.forEach((p) => {
      months.forEach((m) => {
        const tv = p.targetMonthly[m] || 0;
        const cv = p.claimedMonthly[m] || 0;
        const rv = p.receivedMonthly[m] || 0;
        const av = (p.achievedMonthly || {})[m] || 0;
        if (tv > 0 || rv > 0 || av > 0) {
          const claimedAmt = p.contractSum * cv;
          // Gap = money claimed but not yet received (outstanding to collect).
          const gap = Math.max(0, claimedAmt - rv);
          rows.push({
            project: p.name,
            status: p.status,
            month: m,
            targetPct: tv, // planned work %
            achievedPct: av, // actual work completed %
            claimedPct: cv,
            claimedAmt: Math.round(claimedAmt),
            receivedAmt: Math.round(rv),
            gap: Math.round(gap),
            contract: p.contractSum,
          });
        }
      });
    });
    return rows.sort((a, b) => b.gap - a.gap); // sort by biggest gap first
  }, [filtered, chartYear]);

  // ── Monthly target summary for overview KPI ──
  const targetSummary = useMemo(() => {
    const totalTarget = monthlyTargetData.reduce(
      (s, d) => s + d["Target $"],
      0,
    );
    const totalClaimed = monthlyTargetData.reduce(
      (s, d) => s + d["Claimed $"],
      0,
    );
    const totalReceived = monthlyTargetData.reduce(
      (s, d) => s + d["Received $"],
      0,
    );
    const totalGap = monthlyTargetData.reduce((s, d) => s + d["Gap $"], 0);
    return { totalTarget, totalClaimed, totalReceived, totalGap };
  }, [monthlyTargetData]);

  // ── Down payment data ──
  const downPaymentData = useMemo(() => {
    return filtered
      .filter((p) => p.downPayment > 0)
      .map((p) => ({
        name: p.name.length > 16 ? p.name.slice(0, 14) + "…" : p.name,
        fullName: p.name,
        "Down Payment": p.downPayment,
        "Down Pmt %": Math.round((p.downPayment / p.contractSum) * 100),
        contract: p.contractSum,
      }))
      .sort((a, b) => b["Down Payment"] - a["Down Payment"])
      .slice(0, 10);
  }, [filtered]);

  // ── ADDITION: Top 5 by contract ──
  const top5 = useMemo(
    () =>
      [...filtered]
        .filter((p) => p.contractSum > 0)
        .sort((a, b) => b.contractSum - a.contractSum)
        .slice(0, 5)
        .map((p) => {
          const received = Math.round(p.totalReceived);
          const pending = Math.round(Math.max(0, computeBalance(p)));
          return {
            name: p.name.length > 18 ? p.name.slice(0, 16) + "…" : p.name,
            fullName: p.name,
            "Received $": received,
            "Pending $": pending,
            contract: p.contractSum,
            collectedPct: p.contractSum > 0 ? received / p.contractSum : 0,
          };
        }),
    [filtered],
  );

  // ── Top 5 dumbbell data — view depends on top5View ──
  // Each row has two dots (left/right) + a connecting bar, re-labeled per view.
  const top5Gap = useMemo(() => {
    const rows = [...filtered]
      .filter((p) => p.contractSum > 0 && p.status !== "Upcoming Project")
      .map((p) => {
        const claimed = Math.round(p.contractSum * p.totalClaimedPct);
        const received = Math.round(p.totalReceived);
        const contract = Math.round(p.contractSum);
        const pending = Math.max(0, contract - received);
        const collectedPct = contract > 0 ? received / contract : 0;
        return {
          fullName: p.name,
          name: p.name.length > 20 ? p.name.slice(0, 18) + "…" : p.name,
          claimed,
          received,
          contract,
          pending,
          collectedPct,
          gap: Math.max(0, claimed - received),
        };
      });

    if (top5View === "collected") {
      // worst collection first
      return rows.sort((a, b) => a.collectedPct - b.collectedPct);
    }
    // default: biggest pending (outstanding balance)
    return rows.sort((a, b) => b.pending - a.pending);
  }, [filtered, top5View]);

  // ── Year summaries ──
  const sum2025 = useMemo(
    () => computeYearSummary(filtered, "2025"),
    [filtered],
  );
  const sum2026 = useMemo(
    () => computeYearSummary(filtered, "2026"),
    [filtered],
  );

  // ── Dynamic multi-year comparison (auto-detects every year present in data) ──
  // Add 2027/2028 data and it appears here automatically, sorted ascending.
  const yearComparison = useMemo(() => {
    const yearMonths = {}; // year -> Set of month keys seen in the data
    filtered.forEach((p) => {
      ["receivedMonthly", "targetMonthly", "claimedMonthly", "achievedMonthly"].forEach(
        (f) => {
          Object.keys(p[f] || {}).forEach((k) => {
            const yr = monthMeta(k).year;
            (yearMonths[yr] = yearMonths[yr] || new Set()).add(k);
          });
        },
      );
    });
    return Object.keys(yearMonths)
      .map(Number)
      .sort((a, b) => a - b)
      .map((yr) => ({
        year: yr,
        ...computeYearSummary(filtered, String(yr), [...yearMonths[yr]]),
      }));
  }, [filtered]);

  // ── Sorted table ──
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        let av = a[sortCol],
          bv = b[sortCol];
        if (typeof av === "string") {
          av = av.toLowerCase();
          bv = bv.toLowerCase();
        }
        return sortDir === "asc"
          ? av < bv
            ? -1
            : av > bv
              ? 1
              : 0
          : av > bv
            ? -1
            : av < bv
              ? 1
              : 0;
      }),
    [filtered, sortCol, sortDir],
  );

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "Bond Build SG";
      wb.created = new Date();

      const ws = wb.addWorksheet("Project Report", {
        views: [{ state: "frozen", xSplit: 2, ySplit: 3 }],
        pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
      });

      const SUMMARY_COLS = [
        { header: "S.No",                width: 6  },
        { header: "Project Name",         width: 26 },
        { header: "Status",               width: 14 },
        { header: "Risk Level",           width: 11 },
        { header: "Contract\nSum ($)",    width: 15 },
        { header: "Down\nPayment ($)",    width: 14 },
        { header: "Down Payment\nMonth",  width: 14 },
        { header: "Site\nProgress (%)",   width: 13 },
        { header: "Claim Till\nDate (%)", width: 13 },
        { header: "Total\nClaimed ($)",   width: 15 },
        { header: "Total\nReceived ($)",  width: 15 },
        { header: "Balance ($)",          width: 14 },
      ];
      const totalCols = SUMMARY_COLS.length + ALL_MONTHS.length * 4;

      // ── Shared style helpers ──
      const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
      const navyFill  = fill("FF1E3A5F");
      const navy2Fill = fill("FF162E4D");
      const totalFill = fill("FF0D2540");
      const rowFills  = [fill("FFFFFFFF"), fill("FFF0F5FF")];

      const font = (size, bold, argb = "FF1A1A2E") => ({ name: "Calibri", size, bold, color: { argb } });
      const headerFont = font(10, true, "FFFFFFFF");
      const dataFont   = font(10, false);
      const totalFont  = font(10, true, "FFFFFFFF");

      const thinBorder = (colorArgb = "FFD0D8E8") => ({
        top:    { style: "thin", color: { argb: colorArgb } },
        left:   { style: "thin", color: { argb: colorArgb } },
        bottom: { style: "thin", color: { argb: colorArgb } },
        right:  { style: "thin", color: { argb: colorArgb } },
      });
      const navyBorder = thinBorder("FF2A4A6F");
      const boldTop    = { ...thinBorder("FF2A4A6F"), top: { style: "medium", color: { argb: "FF2A4A6F" } }, bottom: { style: "medium", color: { argb: "FF2A4A6F" } } };

      // ── Row 1: Title ──
      const _t = new Date();
      const today = `${String(_t.getDate()).padStart(2, "0")}/${String(_t.getMonth() + 1).padStart(2, "0")}/${_t.getFullYear()}`;
      const titleRow = ws.addRow([`Bond Build SG  |  Project Management Report  |  Exported: ${today}`]);
      titleRow.height = 34;
      ws.mergeCells(1, 1, 1, totalCols);
      const t1 = ws.getCell(1, 1);
      t1.font = font(14, true, "FFFFFFFF");
      t1.fill = navyFill;
      t1.alignment = { vertical: "middle", horizontal: "center" };
      for (let c = 2; c <= totalCols; c++) ws.getCell(1, c).fill = navyFill;

      // ── Row 2: Thin navy divider ──
      ws.addRow([]);
      ws.getRow(2).height = 5;
      for (let c = 1; c <= totalCols; c++) ws.getCell(2, c).fill = navyFill;

      // ── Row 3: Column headers ──
      const headerVals = [
        ...SUMMARY_COLS.map((c) => c.header),
        ...ALL_MONTHS.flatMap((m) => [`${m}\nTarget %`, `${m}\nAchieved %`, `${m}\nClaimed %`, `${m}\nReceived ($)`]),
      ];
      ws.addRow(headerVals);
      ws.getRow(3).height = 44;

      SUMMARY_COLS.forEach((col, i) => {
        const cell = ws.getCell(3, i + 1);
        cell.font = headerFont;
        cell.fill = navyFill;
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = navyBorder;
        ws.getColumn(i + 1).width = col.width;
      });
      ALL_MONTHS.forEach((m, mi) => {
        const base = SUMMARY_COLS.length + mi * 4;
        const hFill = mi % 2 === 0 ? navyFill : navy2Fill;
        for (let c = base + 1; c <= base + 4; c++) {
          const cell = ws.getCell(3, c);
          cell.font = font(9, true, "FFFFFFFF");
          cell.fill = hFill;
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
          cell.border = navyBorder;
        }
        ws.getColumn(base + 1).width = 9;
        ws.getColumn(base + 2).width = 10;
        ws.getColumn(base + 3).width = 9;
        ws.getColumn(base + 4).width = 12;
      });

      // Status & risk color maps
      const statusStyle = {
        "Completed":        { bg: "FF052E16", fg: "FF86EFAC" },
        "Closed":           { bg: "FF0C1A3A", fg: "FF93C5FD" },
        "In Progress":      { bg: "FF1C1500", fg: "FFFDE68A" },
        "Upcoming Project": { bg: "FF1E2130", fg: "FFC4C9D8" },
      };
      const riskFg = { high: "FFF87171", medium: "FFFBBF24", low: "FF4ADE80" };

      // ── Data rows ──
      filtered.forEach((p, idx) => {
        const bgFill = rowFills[idx % 2];
        const balance = (p.contractSum || 0) - (p.totalReceived || 0);
        const totalClaimed = (p.contractSum || 0) * (p.totalClaimedPct || 0);

        const row = ws.addRow([
          idx + 1,
          p.name,
          p.status,
          (p.riskLevel || "low").charAt(0).toUpperCase() + (p.riskLevel || "low").slice(1),
          p.contractSum || 0,
          p.downPayment || 0,
          p.down_payment_month || "",
          p.siteProgress || 0,
          p.totalClaimedPct || 0,
          totalClaimed,
          p.totalReceived || 0,
          balance,
          ...ALL_MONTHS.flatMap((m) => [
            p.targetMonthly[m]                  || "",
            (p.achievedMonthly || {})[m]         || "",
            p.claimedMonthly[m]                 || "",
            p.receivedMonthly[m]                || "",
          ]),
        ]);
        row.height = 20;

        // Base fill + border on all cells
        for (let c = 1; c <= totalCols; c++) {
          const cell = row.getCell(c);
          cell.fill = bgFill;
          cell.font = { ...dataFont };
          cell.border = thinBorder();
        }

        // S.No
        row.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
        // Project Name
        row.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
        // Status (colored)
        const sc = statusStyle[p.status] || statusStyle["Upcoming Project"];
        const statCell = row.getCell(3);
        statCell.font = font(10, true, sc.fg);
        statCell.fill = fill(sc.bg);
        statCell.alignment = { vertical: "middle", horizontal: "center" };
        // Risk (colored text)
        row.getCell(4).font = font(10, true, riskFg[(p.riskLevel || "low").toLowerCase()] || riskFg.low);
        row.getCell(4).alignment = { vertical: "middle", horizontal: "center" };
        // Contract Sum
        row.getCell(5).numFmt = "$#,##0";
        row.getCell(5).alignment = { vertical: "middle", horizontal: "right" };
        // Down Payment
        row.getCell(6).numFmt = "$#,##0";
        row.getCell(6).alignment = { vertical: "middle", horizontal: "right" };
        // Down Payment Month
        row.getCell(7).alignment = { vertical: "middle", horizontal: "center" };
        // Site Progress
        row.getCell(8).numFmt = "0.0%";
        row.getCell(8).alignment = { vertical: "middle", horizontal: "center" };
        // Claim Till Date
        row.getCell(9).numFmt = "0.0%";
        row.getCell(9).alignment = { vertical: "middle", horizontal: "center" };
        // Total Claimed $
        row.getCell(10).numFmt = "$#,##0";
        row.getCell(10).alignment = { vertical: "middle", horizontal: "right" };
        // Total Received $
        row.getCell(11).numFmt = "$#,##0";
        row.getCell(11).alignment = { vertical: "middle", horizontal: "right" };
        // Balance (red if negative)
        const balCell = row.getCell(12);
        balCell.numFmt = "$#,##0";
        balCell.alignment = { vertical: "middle", horizontal: "right" };
        if (balance < 0) balCell.font = font(10, true, "FFDC2626");

        // Monthly columns
        ALL_MONTHS.forEach((m, mi) => {
          const base = SUMMARY_COLS.length + mi * 4;
          const tCell = row.getCell(base + 1);
          const aCell = row.getCell(base + 2);
          const cCell = row.getCell(base + 3);
          const rCell = row.getCell(base + 4);
          if (tCell.value !== "") { tCell.numFmt = "0.0%"; tCell.alignment = { vertical: "middle", horizontal: "center" }; }
          if (aCell.value !== "") { aCell.numFmt = "0.0%"; aCell.alignment = { vertical: "middle", horizontal: "center" }; }
          if (cCell.value !== "") { cCell.numFmt = "0.0%"; cCell.alignment = { vertical: "middle", horizontal: "center" }; }
          if (rCell.value !== "") { rCell.numFmt = "$#,##0"; rCell.alignment = { vertical: "middle", horizontal: "right" }; }
        });
      });

      // ── Totals row ──
      const n = filtered.length;
      const tContract  = filtered.reduce((s, p) => s + (p.contractSum || 0), 0);
      const tDown      = filtered.reduce((s, p) => s + (p.downPayment || 0), 0);
      const tClaimed   = filtered.reduce((s, p) => s + (p.contractSum || 0) * (p.totalClaimedPct || 0), 0);
      const tReceived  = filtered.reduce((s, p) => s + (p.totalReceived || 0), 0);
      const tBalance   = filtered.reduce((s, p) => s + (p.contractSum || 0) - (p.totalReceived || 0), 0);
      const avgSite    = n > 0 ? filtered.reduce((s, p) => s + (p.siteProgress || 0), 0) / n : 0;
      const avgClaim   = n > 0 ? filtered.reduce((s, p) => s + (p.totalClaimedPct || 0), 0) / n : 0;

      const totRow = ws.addRow([
        "", `TOTALS  (${n} project${n !== 1 ? "s" : ""})`, "", "",
        tContract, tDown, "", avgSite, avgClaim, tClaimed, tReceived, tBalance,
        ...ALL_MONTHS.flatMap((m) => [
          "", "", "",
          filtered.reduce((s, p) => s + (p.receivedMonthly[m] || 0), 0) || "",
        ]),
      ]);
      totRow.height = 22;

      for (let c = 1; c <= totalCols; c++) {
        const cell = totRow.getCell(c);
        cell.font = totalFont;
        cell.fill = totalFill;
        cell.border = boldTop;
        cell.alignment = { vertical: "middle", horizontal: "right" };
      }
      totRow.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
      totRow.getCell(5).numFmt  = "$#,##0";
      totRow.getCell(6).numFmt  = "$#,##0";
      totRow.getCell(8).numFmt  = "0.0%";
      totRow.getCell(9).numFmt  = "0.0%";
      totRow.getCell(10).numFmt = "$#,##0";
      totRow.getCell(11).numFmt = "$#,##0";
      totRow.getCell(12).numFmt = "$#,##0";
      if (tBalance < 0) totRow.getCell(12).font = font(10, true, "FFDC2626");
      ALL_MONTHS.forEach((m, mi) => {
        const cell = totRow.getCell(SUMMARY_COLS.length + mi * 4 + 4);
        if (cell.value !== "") { cell.numFmt = "$#,##0"; cell.alignment = { vertical: "middle", horizontal: "right" }; }
      });

      // ── Auto-filter on summary headers ──
      ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: SUMMARY_COLS.length } };

      // ── Download ──
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BondBuildSG_ProjectReport_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/projects/${p.id}`);
      fetchProjects();
    } catch (err) {
      alert(err.response?.data?.message || "Delete failed");
    }
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  };
  const SortIco = ({ col }) =>
    sortCol !== col ? (
      <ArrowUpDown size={11} style={{ marginLeft: 3, opacity: 0.35 }} />
    ) : sortDir === "asc" ? (
      <ArrowUp size={11} style={{ marginLeft: 3, color: C.blue }} />
    ) : (
      <ArrowDown size={11} style={{ marginLeft: 3, color: C.blue }} />
    );

  const statusCounts = useMemo(() => {
    const c = {
      Completed: 0,
      Closed: 0,
      "In Progress": 0,
      "Upcoming Project": 0,
    };
    RAW_PROJECTS.forEach((p) => {
      if (c[p.status] !== undefined) c[p.status]++;
    });
    return c;
  }, [RAW_PROJECTS]);

  const projectOpts = [
    { v: "all", l: "All Projects" },
    ...RAW_PROJECTS.map((p) => ({ v: p.name, l: p.name })),
  ];
  const monthOpts = [
    { v: "all", l: "All Months" },
    ...ALL_MONTHS.map((m) => ({ v: m, l: m })),
  ];
  const statusOpts = [
    { v: "all", l: "All Status" },
    ...STATUS_LIST.map((s) => ({
      v: s,
      l: s === "Upcoming Project" ? "Upcoming" : s,
    })),
  ];

  const TABS = ["overview", "charts", "table", "monthlyTarget", "yearwise"];
  const TAB_LABELS = {
    overview: "Overview",
    charts: "Charts",
    table: "Projects Table",
    monthlyTarget: "Monthly Target",
    yearwise: "Year Summary",
  };

  // ── Shared chart axis style ──
  const axTick = { fontSize: 11, fill: C.textMuted };
  const gridSt = { stroke: "#1e2130", strokeDasharray: "3 3" };

  // ── LOADING STATE ──
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.text,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <Loader2
            size={48}
            style={{
              color: C.blue,
              animation: "spin 1s linear infinite",
              marginBottom: 16,
            }}
          />
          <p style={{ fontSize: 16, color: C.textMuted }}>
            Loading projects from database...
          </p>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── ERROR STATE ──
  if (fetchError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.text,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <AlertCircle size={48} style={{ color: C.red, marginBottom: 16 }} />
          <p style={{ fontSize: 16, color: C.red, marginBottom: 8 }}>
            {fetchError}
          </p>
          <p style={{ fontSize: 13, color: C.textMuted }}>
            Make sure the backend is running and projects are imported.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 20,
              padding: "10px 24px",
              borderRadius: 8,
              fontSize: 14,
              color: "#fff",
              fontWeight: "bold",
              background: C.blue,
              border: "none",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── EMPTY STATE ──
  if (!RAW_PROJECTS.length) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
        {modalOpen && (
          <ProjectFormModal
            project={editProject}
            onClose={() => { setModalOpen(false); setEditProject(null); }}
            onSaved={fetchProjects}
          />
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <Building2 size={48} style={{ color: C.textDim }} />
          <p style={{ fontSize: 16, color: C.textMuted, margin: 0 }}>
            No projects found in database.
          </p>
          <button
            onClick={() => { setEditProject(null); setModalOpen(true); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 18px",
              borderRadius: 9,
              border: "none",
              background: C.blue,
              color: "#06121f",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              marginTop: 8,
            }}
          >
            <Plus size={15} /> Add Project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
        color: C.text,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          background: C.card,
          borderBottom: `1px solid ${C.border}`,
          padding: "13px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: "#0d1a2e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Building2 size={20} color={C.blue} strokeWidth={1.8} />
          </div>
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              InventoryOpz
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: -1 }}>
              Project Management Dashboard
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={exportToExcel}
            disabled={exporting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 9,
              border: `1px solid ${C.border}`,
              background: exporting ? "#0d2010" : "#0a1f0a",
              color: exporting ? C.textMuted : C.green,
              fontSize: 13,
              fontWeight: 700,
              cursor: exporting ? "not-allowed" : "pointer",
              opacity: exporting ? 0.7 : 1,
            }}
          >
            <Download size={15} />
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
          <button
            onClick={() => {
              setEditProject(null);
              setModalOpen(true);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 9,
              border: "none",
              background: C.blue,
              color: "#06121f",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Plus size={15} /> Add Project
          </button>
          <Sel
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOpts}
          />
          <Sel
            value={projectFilter}
            onChange={setProjectFilter}
            options={projectOpts}
          />
          <Sel
            value={monthFilter}
            onChange={setMonthFilter}
            options={monthOpts}
          />
        </div>
      </div>

      <div style={{ padding: "22px 24px", maxWidth: 1400, margin: "0 auto" }}>
        {/* ── Status pills ── */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          {[
            { v: "all", l: "All" },
            ...STATUS_LIST.map((s) => ({
              v: s,
              l: s === "Upcoming Project" ? "Upcoming" : s,
            })),
          ].map(({ v, l }) => {
            const active = statusFilter === v;
            const sc = C.status[v];
            return (
              <button
                key={v}
                onClick={() => setStatusFilter(v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 13px",
                  borderRadius: 20,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  background: active
                    ? sc
                      ? sc.dot
                      : "#1d4ed8"
                    : sc
                      ? sc.bg
                      : "#0d1a2e",
                  color: active ? "#fff" : sc ? sc.text : C.blue,
                  transition: "all 0.15s",
                }}
              >
                {v === "Completed" && <CheckCircle2 size={13} />}
                {v === "Closed" && <XCircle size={13} />}
                {v === "In Progress" && <Loader2 size={13} />}
                {v === "Upcoming Project" && <CalendarClock size={13} />}
                {l}
                {v !== "all" && (
                  <span
                    style={{
                      background: "rgba(0,0,0,0.2)",
                      borderRadius: 20,
                      padding: "1px 6px",
                      fontSize: 11,
                    }}
                  >
                    {statusCounts[v]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Tabs ── */}
        <div
          style={{
            display: "flex",
            gap: 2,
            marginBottom: 20,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {TABS.map((k) => (
            <button
              key={k}
              onClick={() => setActiveTab(k)}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                borderBottom:
                  activeTab === k
                    ? `2px solid ${C.blue}`
                    : "2px solid transparent",
                background: "transparent",
                color: activeTab === k ? C.blue : C.textMuted,
                marginBottom: -1,
                transition: "all 0.15s",
              }}
            >
              {TAB_LABELS[k]}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════
            OVERVIEW TAB
        ════════════════════════════════════ */}
        {/* ════════════════════════════════════
            OVERVIEW TAB
        ════════════════════════════════════ */}
        {activeTab === "overview" && (
          <>
            {/* 1. TOP KPIs (Preserved exactly as requested) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                gap: 12,
                marginBottom: 20,
              }}
            >
              {[
                {
                  icon: DollarSign,
                  label: "Total Contract Sum",
                  value: fmtM(kpis.totalContract),
                  sub: `${filtered.length} projects`,
                  bg: "#0d1a2e",
                  ic: C.blue,
                  val: "#93c5fd",
                },
                {
                  icon: TrendingUp,
                  label: "Total Received",
                  value: fmtM(kpis.totalReceived),
                  sub:
                    kpis.totalContract > 0
                      ? `${fmtPct(kpis.totalReceived / kpis.totalContract)} collected`
                      : "—",
                  bg: "#0d2218",
                  ic: "#34d399",
                  val: "#6ee7b7",
                },
                {
                  icon: Clock,
                  label: "Total Pending",
                  value: fmtM(kpis.totalPending),
                  sub: "outstanding balance",
                  bg: "#1f1a0d",
                  ic: C.amber,
                  val: "#fcd34d",
                },
                {
                  icon: BarChart3,
                  label: "Total Claimed",
                  value: fmtM(kpis.totalClaimed),
                  sub:
                    kpis.totalContract > 0
                      ? `${fmtPct(kpis.totalClaimed / kpis.totalContract)} of contract`
                      : "—",
                  bg: "#200d10",
                  ic: "#f87171",
                  val: "#fca5a5",
                },
              ].map(({ icon: Icon, label, value, sub, bg, ic, val }) => (
                <div
                  key={label}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    padding: "16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={18} color={ic} strokeWidth={1.8} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        color: C.textMuted,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 3,
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: val,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {value}
                    </div>
                    {sub && (
                      <div
                        style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}
                      >
                        {sub}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 2. ENHANCED VISUALS LAYOUT (From Gauge Onwards) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 2fr",
                gap: 16,
                marginBottom: 20,
              }}
            >
              {/* LEFT COLUMN: Health & Portfolio Mix */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                {/* Visual Addition 2 & 6 Combined: Collection Gauge + Risk Matrix */}
                <Card
                  style={{
                    padding: "18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <CollectionGauge pct={collectionRate} />

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      paddingLeft: 16,
                      borderLeft: `1px solid ${C.border}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: C.textMuted,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 2,
                      }}
                    >
                      Risk Matrix
                    </div>
                    {[
                      {
                        label: "High",
                        count: filtered.filter(
                          (p) => computeRisk(p).level === "high",
                        ).length,
                        c: C.red,
                      },
                      {
                        label: "Med",
                        count: filtered.filter(
                          (p) => computeRisk(p).level === "medium",
                        ).length,
                        c: C.amber,
                      },
                      {
                        label: "Low",
                        count: filtered.filter(
                          (p) => computeRisk(p).level === "low",
                        ).length,
                        c: C.green,
                      },
                    ].map((r) => (
                      <div
                        key={r.label}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 16,
                          fontSize: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: r.c,
                            }}
                          />
                          <span style={{ color: C.textDim }}>{r.label}</span>
                        </div>
                        <span style={{ fontWeight: 700, color: C.text }}>
                          {r.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Visual Addition 1: Expanded Donut Chart */}
                <Card
                  style={{
                    padding: "18px",
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: C.textMuted,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 16,
                    }}
                  >
                    Portfolio Distribution
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 24,
                      flexGrow: 1,
                    }}
                  >
                    <ResponsiveContainer width={120} height={120}>
                      <PieChart>
                        <Pie
                          data={donutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={36}
                          outerRadius={56}
                          dataKey="value"
                          paddingAngle={3}
                          startAngle={90}
                          endAngle={-270}
                        >
                          {donutData.map((d, i) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0]?.payload;
                            return (
                              <div
                                style={{
                                  background: "#0d0f16",
                                  border: `1px solid ${C.border}`,
                                  borderRadius: 8,
                                  padding: "6px 10px",
                                  fontSize: 12,
                                  color: C.text,
                                }}
                              >
                                {d.name}:{" "}
                                <span style={{ fontWeight: 700 }}>
                                  {d.value}
                                </span>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {donutData.map((d) => (
                        <div
                          key={d.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 12,
                          }}
                        >
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 3,
                              background: d.color,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ color: C.textMuted, width: 75 }}>
                            {d.name}
                          </span>
                          <span style={{ color: C.text, fontWeight: 700 }}>
                            {d.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              </div>

              {/* RIGHT COLUMN: Trends & Top 5 */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                {/* NEW Visual Addition: 6-Month Cashflow Sparkline (Built from existing cumulative/stacked data) */}
                <Card style={{ padding: "16px 20px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{ fontSize: 14, fontWeight: 700, color: C.text }}
                      >
                        Revenue Velocity
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: C.textMuted,
                          marginTop: 2,
                        }}
                      >
                        Monthly received cashflow
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <YearTabs
                        value={velocityYear}
                        onChange={setVelocityYear}
                      />
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: C.green,
                        }}
                      >
                        {fmtM(velocityYearTotal)}{" "}
                        <span
                          style={{
                            fontSize: 11,
                            color: C.textDim,
                            fontWeight: 400,
                          }}
                        >
                          {velocityYear}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart
                      data={velocityData}
                      margin={{ top: 5, right: 16, left: 16, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="velGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor={C.green}
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor={C.green}
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 10, fill: C.textMuted }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                      />
                      <YAxis hide domain={[0, "auto"]} />
                      <Tooltip
                        cursor={{
                          stroke: C.border,
                          strokeWidth: 1,
                          strokeDasharray: "3 3",
                        }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0]?.payload;
                          return (
                            <div
                              style={{
                                background: "#0d0f16",
                                border: `1px solid ${C.border}`,
                                borderRadius: 10,
                                padding: "10px 14px",
                                fontSize: 12,
                                color: C.text,
                              }}
                            >
                              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                                {d?.fullMonth || ""}
                              </div>
                              <div style={{ color: C.textMuted }}>
                                Received:{" "}
                                <span
                                  style={{ color: C.green, fontWeight: 600 }}
                                >
                                  {fmtFull(d?.["Received $"] || 0)}
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="Received $"
                        stroke={C.green}
                        strokeWidth={2}
                        fill="url(#velGrad)"
                        activeDot={{
                          r: 4,
                          fill: C.green,
                          stroke: "#000",
                          strokeWidth: 2,
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>

                {/* Top 5 dumbbell — switchable view (pending / collected) */}
                <Card style={{ flexGrow: 1 }}>
                  <div
                    style={{
                      padding: "16px 20px",
                      borderBottom: `1px solid ${C.border}`,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div
                        style={{ fontSize: 14, fontWeight: 700, color: C.text }}
                      >
                        {top5View === "collected"
                          ? "Top 5 Lowest Collection"
                          : "Top 5 Outstanding Balances"}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: C.textMuted,
                          marginTop: 2,
                        }}
                      >
                        {top5View === "collected"
                          ? "Received vs Contract — worst collection rate first"
                          : "Received vs Contract — biggest outstanding balance"}
                      </div>
                    </div>
                    {/* view toggle buttons */}
                    <div style={{ display: "flex", gap: 4 }}>
                      {[
                        { k: "pending", l: "Pending" },
                        { k: "collected", l: "% Collected" },
                      ].map((b) => (
                        <button
                          key={b.k}
                          onClick={() => setTop5View(b.k)}
                          style={{
                            padding: "5px 12px",
                            borderRadius: 8,
                            border: `1px solid ${top5View === b.k ? C.blue : C.border}`,
                            background: top5View === b.k ? "#0d1a2e" : C.card,
                            color: top5View === b.k ? C.blue : "#c4c9d8",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {b.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding: "16px 20px" }}>
                    {/* legend (changes per view) */}
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        marginBottom: 16,
                        fontSize: 11,
                        color: C.textMuted,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: C.green,
                            display: "inline-block",
                          }}
                        />
                        Received
                      </span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: C.blue,
                            display: "inline-block",
                          }}
                        />
                        Contract
                      </span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 3,
                            background: C.amber,
                            display: "inline-block",
                            borderRadius: 2,
                          }}
                        />
                        {top5View === "collected"
                          ? "Uncollected"
                          : "Outstanding"}
                      </span>
                    </div>

                    {(() => {
                      const allRows = top5Gap;
                      if (!allRows.length)
                        return (
                          <div
                            style={{
                              color: C.textDim,
                              fontSize: 13,
                              padding: "20px 0",
                              textAlign: "center",
                            }}
                          >
                            No data to compare.
                          </div>
                        );
                      const rows = showAllTop5 ? allRows : allRows.slice(0, 5);

                      // Per-view mapping: right dot value + right label + bar amount
                      const rightColor = C.blue;
                      const maxVal = Math.max(
                        ...rows.map((r) => Math.max(r.received, r.contract)),
                        1,
                      );

                      return (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 18,
                            maxHeight: showAllTop5 ? 420 : "none",
                            overflowY: showAllTop5 ? "auto" : "visible",
                            paddingRight: showAllTop5 ? 6 : 0,
                          }}
                        >
                          {rows.map((r) => {
                            const rightVal = r.contract;
                            const barAmt =
                              top5View === "collected"
                                ? Math.max(0, r.contract - r.received)
                                : r.pending;
                            const recPct = (r.received / maxVal) * 100;
                            const rightPct = (rightVal / maxVal) * 100;
                            const left = Math.min(recPct, rightPct);
                            const right = Math.max(recPct, rightPct);

                            const headlineRight =
                              top5View === "collected"
                                ? `${Math.round(r.collectedPct * 100)}% collected`
                                : `${fmtM(r.pending)} outstanding`;
                            const headlineColor =
                              top5View === "collected"
                                ? r.collectedPct >= 0.8
                                  ? C.green
                                  : r.collectedPct >= 0.5
                                    ? C.blue
                                    : C.amber
                                : barAmt > 0
                                  ? C.amber
                                  : C.textDim;

                            return (
                              <div key={r.fullName} title={r.fullName}>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "baseline",
                                    marginBottom: 7,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: C.text,
                                    }}
                                  >
                                    {r.name}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 700,
                                      color: headlineColor,
                                    }}
                                  >
                                    {headlineRight}
                                  </span>
                                </div>
                                <div
                                  style={{ position: "relative", height: 16 }}
                                >
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: 7,
                                      left: 0,
                                      right: 0,
                                      height: 2,
                                      background: C.border,
                                      borderRadius: 2,
                                    }}
                                  />
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: 6,
                                      left: `${left}%`,
                                      width: `${right - left}%`,
                                      height: 4,
                                      background: C.amber,
                                      borderRadius: 2,
                                    }}
                                  />
                                  <div
                                    title={`Received: ${fmtFull(r.received)}`}
                                    style={{
                                      position: "absolute",
                                      top: 2,
                                      left: `calc(${recPct}% - 6px)`,
                                      width: 12,
                                      height: 12,
                                      borderRadius: "50%",
                                      background: C.green,
                                      border: "2px solid #0f1117",
                                      boxShadow: "0 0 0 1px " + C.green,
                                    }}
                                  />
                                  <div
                                    title={`Contract: ${fmtFull(rightVal)}`}
                                    style={{
                                      position: "absolute",
                                      top: 2,
                                      left: `calc(${rightPct}% - 6px)`,
                                      width: 12,
                                      height: 12,
                                      borderRadius: "50%",
                                      background: rightColor,
                                      border: "2px solid #0f1117",
                                      boxShadow: "0 0 0 1px " + rightColor,
                                    }}
                                  />
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    marginTop: 5,
                                    fontSize: 10,
                                    color: C.textDim,
                                  }}
                                >
                                  <span style={{ color: C.green }}>
                                    Recd {fmtM(r.received)}
                                  </span>
                                  <span style={{ color: rightColor }}>
                                    Contract {fmtM(rightVal)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* View all / Show less toggle */}
                    {top5Gap.length > 5 && (
                      <div style={{ textAlign: "center", marginTop: 14 }}>
                        <button
                          onClick={() => setShowAllTop5((v) => !v)}
                          style={{
                            padding: "7px 18px",
                            borderRadius: 8,
                            border: `1px solid ${C.border}`,
                            background: C.card,
                            color: C.blue,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {showAllTop5
                            ? "Show top 5"
                            : `View all ${top5Gap.length} projects`}
                        </button>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </>
        )}
        {/* ════════════════════════════════════
            CHARTS TAB
        ════════════════════════════════════ */}
        {activeTab === "charts" && (
          <>
            {/* ADDITION 3: Monthly stacked bar */}
            <Card style={{ marginBottom: 20 }}>
              <div
                style={{
                  padding: "16px 20px",
                  borderBottom: `1px solid ${C.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                    Monthly cash flow — Target vs Received vs Pending
                  </div>
                  <div
                    style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}
                  >
                    Dollar amounts per month (stacked)
                  </div>
                </div>
                <YearTabs value={chartYear} onChange={setChartYear} />
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    marginBottom: 12,
                    fontSize: 11,
                    color: C.textMuted,
                    flexWrap: "wrap",
                  }}
                >
                  {[
                    ["Target $", C.blue],
                    ["Received $", C.green],
                    ["Pending $", C.amber],
                  ].map(([l, c]) => (
                    <span
                      key={l}
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: c,
                          display: "inline-block",
                        }}
                      />
                      {l}
                    </span>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart
                    data={stackedBarData}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid {...gridSt} vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={axTick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => fmtM(v)}
                      tick={axTick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<TT />} />
                    <Bar
                      dataKey="Target $"
                      fill={C.blue}
                      fillOpacity={0.35}
                      maxBarSize={36}
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="Received $"
                      fill={C.green}
                      maxBarSize={36}
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="Pending $"
                      fill={C.amber}
                      fillOpacity={0.7}
                      maxBarSize={36}
                      radius={[3, 3, 0, 0]}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 20,
              }}
            >
              {/* ADDITION 4: Cumulative area */}
              <Card>
                <div
                  style={{
                    padding: "14px 18px",
                    borderBottom: `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{ fontSize: 13, fontWeight: 700, color: C.text }}
                    >
                      Cumulative received
                    </div>
                    <div
                      style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}
                    >
                      Running total over time
                    </div>
                  </div>
                  <YearTabs value={chartYear} onChange={setChartYear} />
                </div>
                <div style={{ padding: "14px 18px" }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart
                      data={cumulativeData}
                      margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="cumGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor={C.teal}
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor={C.teal}
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...gridSt} vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={axTick}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => fmtM(v)}
                        tick={axTick}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<TT />} />
                      <Area
                        type="monotone"
                        dataKey="Cumulative $"
                        stroke={C.teal}
                        strokeWidth={2.5}
                        fill="url(#cumGrad)"
                        dot={false}
                        activeDot={{ r: 4, fill: C.teal }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Target % vs Received % combo */}
              <Card>
                <div
                  style={{
                    padding: "14px 18px",
                    borderBottom: `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{ fontSize: 13, fontWeight: 700, color: C.text }}
                    >
                      Target % vs Received %
                    </div>
                    <div
                      style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}
                    >
                      Avg target allocation vs normalized received
                    </div>
                  </div>
                  <YearTabs value={chartYear} onChange={setChartYear} />
                </div>
                <div style={{ padding: "14px 18px" }}>
                  {(() => {
                    const months =
                      chartYear === "2025" ? MONTHS_2025 : MONTHS_2026;
                    const cd = months.map((m) => {
                      let st = 0,
                        ct = 0,
                        sr = 0;
                      filtered.forEach((p) => {
                        if (p.targetMonthly[m]) {
                          st += p.targetMonthly[m];
                          ct++;
                        }
                        sr += p.receivedMonthly[m] || 0;
                      });
                      return {
                        month: m.replace("'25", "").replace("'26", ""),
                        fullMonth: m,
                        "Target %":
                          ct > 0 ? parseFloat(((st / ct) * 100).toFixed(1)) : 0,
                        receivedRaw: sr,
                      };
                    });
                    const maxR = Math.max(...cd.map((d) => d.receivedRaw), 1);
                    const cdNorm = cd.map((d) => ({
                      ...d,
                      "Received %": parseFloat(
                        ((d.receivedRaw / maxR) * 100).toFixed(1),
                      ),
                    }));
                    return (
                      <ResponsiveContainer width="100%" height={220}>
                        <ComposedChart
                          data={cdNorm}
                          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid {...gridSt} vertical={false} />
                          <XAxis
                            dataKey="month"
                            tick={axTick}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={(v) => `${v}%`}
                            tick={axTick}
                            axisLine={false}
                            tickLine={false}
                            domain={[0, 100]}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const d = cd.find((x) => x.month === label);
                              return (
                                <div
                                  style={{
                                    background: "#0d0f16",
                                    border: `1px solid ${C.border}`,
                                    borderRadius: 10,
                                    padding: "10px 14px",
                                    fontSize: 12,
                                    color: C.text,
                                  }}
                                >
                                  <div
                                    style={{ fontWeight: 700, marginBottom: 4 }}
                                  >
                                    {d?.fullMonth || label}
                                  </div>
                                  {payload.map((p, i) => (
                                    <div
                                      key={i}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        marginBottom: 2,
                                      }}
                                    >
                                      <span
                                        style={{
                                          width: 8,
                                          height: 8,
                                          borderRadius: 2,
                                          background: p.color,
                                          flexShrink: 0,
                                        }}
                                      />
                                      <span style={{ color: C.textMuted }}>
                                        {p.name}:
                                      </span>
                                      <span style={{ fontWeight: 600 }}>
                                        {p.name === "Target %"
                                          ? `${p.value.toFixed(1)}%`
                                          : fmtFull(d?.receivedRaw || 0)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              );
                            }}
                          />
                          <Bar
                            dataKey="Target %"
                            fill={C.blue}
                            radius={[3, 3, 0, 0]}
                            maxBarSize={36}
                          />
                          <Line
                            type="monotone"
                            dataKey="Received %"
                            stroke={C.green}
                            strokeWidth={2.5}
                            strokeDasharray="5 3"
                            dot={{ fill: C.green, r: 3, strokeWidth: 0 }}
                            activeDot={{ r: 5 }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    );
                  })()}
                </div>
              </Card>
            </div>

            {/* Risk grouped by High / Medium / Low (client-set) */}
            <Card>
              <CardHead
                title="Projects by Risk Level"
                sub="Risk is set manually per project · grouped High / Medium / Low"
              />
              <div style={{ padding: "16px 20px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 14,
                  }}
                >
                  {[
                    {
                      key: "high",
                      label: "High Risk",
                      color: C.red,
                      bg: "#200d10",
                    },
                    {
                      key: "medium",
                      label: "Medium Risk",
                      color: C.amber,
                      bg: "#1f1a0d",
                    },
                    {
                      key: "low",
                      label: "Low Risk",
                      color: C.green,
                      bg: "#0d2218",
                    },
                  ].map((col) => {
                    const list = filtered
                      .filter((p) => computeRisk(p).level === col.key)
                      .sort((a, b) => b.contractSum - a.contractSum);
                    const totalVal = list.reduce(
                      (s, p) => s + p.contractSum,
                      0,
                    );
                    return (
                      <div
                        key={col.key}
                        style={{
                          border: `1px solid ${C.border}`,
                          borderRadius: 12,
                          overflow: "hidden",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        {/* column header */}
                        <div
                          style={{
                            background: col.bg,
                            padding: "12px 14px",
                            borderBottom: `1px solid ${C.border}`,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                fontSize: 13,
                                fontWeight: 700,
                                color: col.color,
                              }}
                            >
                              <span
                                style={{
                                  width: 9,
                                  height: 9,
                                  borderRadius: "50%",
                                  background: col.color,
                                  display: "inline-block",
                                }}
                              />
                              {col.label}
                            </span>
                            <span
                              style={{
                                fontSize: 18,
                                fontWeight: 700,
                                color: col.color,
                              }}
                            >
                              {list.length}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: C.textMuted,
                              marginTop: 3,
                            }}
                          >
                            {fmtM(totalVal)} contract value
                          </div>
                        </div>
                        {/* project list */}
                        <div
                          style={{
                            maxHeight: 280,
                            overflowY: "auto",
                            padding: "6px 0",
                          }}
                        >
                          {list.length === 0 ? (
                            <div
                              style={{
                                padding: "16px 14px",
                                color: C.textDim,
                                fontSize: 12,
                                textAlign: "center",
                              }}
                            >
                              No projects
                            </div>
                          ) : (
                            list.map((p) => (
                              <div
                                key={p.name}
                                style={{
                                  padding: "8px 14px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                  borderBottom: `1px solid #13151e`,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: C.text,
                                    fontWeight: 500,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={p.name}
                                >
                                  {p.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: C.textMuted,
                                    flexShrink: 0,
                                  }}
                                >
                                  {p.contractSum > 0
                                    ? fmtM(p.contractSum)
                                    : "—"}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </>
        )}

        {/* ════════════════════════════════════
            PROJECTS TABLE TAB — Rich Visual
        ════════════════════════════════════ */}
        {activeTab === "table" &&
          (() => {
            const Ring = ({ pct, color, size = 36 }) => {
              const r = 14,
                cx = 18,
                cy = 18,
                circ = 2 * Math.PI * r;
              const full = pct >= 1;
              const dash = Math.min(1, Math.max(0, pct)) * circ;
              return (
                <svg width={size} height={size} viewBox="0 0 36 36">
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={full ? color : C.border}
                    strokeWidth={4}
                  />
                  {!full && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={4}
                    strokeDasharray={circ}
                    strokeDashoffset={circ - dash}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${cx} ${cy})`}
                  />
                  )}
                  <text
                    x={cx}
                    y={cy + 4}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={700}
                    fill={color}
                  >
                    {Math.round(pct * 100)}
                  </text>
                </svg>
              );
            };
            const riskBg = {
              high: "#200d10",
              medium: "#1f1a0d",
              low: "#0d2218",
              none: "transparent",
            };
            const riskColors = {
              high: C.red,
              medium: C.amber,
              low: C.green,
              none: C.textDim,
            };
            return (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                {/* Summary strip */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
                    gap: 10,
                  }}
                >
                  {[
                    { l: "Total projects", v: filtered.length, c: C.blue },
                    {
                      l: "High risk",
                      v: filtered.filter((p) => computeRisk(p).level === "high")
                        .length,
                      c: C.red,
                    },
                    {
                      l: "Med risk",
                      v: filtered.filter(
                        (p) => computeRisk(p).level === "medium",
                      ).length,
                      c: C.amber,
                    },
                    {
                      l: "Low risk",
                      v: filtered.filter((p) => computeRisk(p).level === "low")
                        .length,
                      c: C.green,
                    },
                    {
                      l: "Fully collected",
                      v: filtered.filter(
                        (p) => computeBalance(p) <= 0 && p.contractSum > 0,
                      ).length,
                      c: C.green,
                    },
                    {
                      l: "Avg site progress",
                      v: filtered.length
                        ? `${Math.round((filtered.reduce((s, p) => s + p.siteProgress, 0) / filtered.length) * 100)}%`
                        : "—",
                      c: C.teal,
                    },
                  ].map(({ l, v, c }) => (
                    <div
                      key={l}
                      style={{
                        background: C.card,
                        border: `1px solid ${C.border}`,
                        borderRadius: 10,
                        padding: "10px 14px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: C.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginBottom: 3,
                        }}
                      >
                        {l}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: c }}>
                        {v}
                      </div>
                    </div>
                  ))}
                </div>

                <Card>
                  <div
                    style={{
                      padding: "12px 18px",
                      borderBottom: `1px solid ${C.border}`,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        Project breakdown
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: C.textMuted,
                          background: C.cardAlt,
                          borderRadius: 20,
                          padding: "2px 10px",
                        }}
                      >
                        {filtered.length} projects
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 14,
                        fontSize: 11,
                        color: C.textMuted,
                      }}
                    >
                      {[
                        ["Received", C.green],
                        ["Pending", C.amber],
                        ["Claimed", C.purple],
                        ["Target", C.blue],
                      ].map(([l, c]) => (
                        <span
                          key={l}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 2,
                              background: c,
                              display: "inline-block",
                            }}
                          />
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 12,
                      }}
                    >
                      <thead>
                        <tr style={{ background: C.cardAlt }}>
                          {[
                            { k: "name", l: "Project", w: "17%" },
                            { k: "status", l: "Status", w: "9%" },
                            { k: "contractSum", l: "Contract", w: "10%" },
                            { k: "_split", l: "Received / Pending", w: "16%" },
                            {
                              k: "_rings",
                              l: "Target · Site · Claimed",
                              w: "14%",
                            },
                            { k: "_risk", l: "Risk", w: "8%" },
                            { k: "_spark", l: "Payment history", w: "22%" },
                            { k: "_actions", l: "Actions", w: "8%" },
                          ].map((col) => (
                            <th
                              key={col.k}
                              onClick={
                                col.k.startsWith("_")
                                  ? undefined
                                  : () => handleSort(col.k)
                              }
                              style={{
                                padding: "9px 14px",
                                textAlign: "left",
                                fontSize: 10,
                                fontWeight: 600,
                                color: C.textMuted,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                borderBottom: `1px solid ${C.border}`,
                                width: col.w,
                                whiteSpace: "nowrap",
                                cursor: col.k.startsWith("_")
                                  ? "default"
                                  : "pointer",
                                userSelect: "none",
                              }}
                            >
                              {col.l}
                              {!col.k.startsWith("_") && (
                                <SortIco col={col.k} />
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              style={{
                                padding: "40px",
                                textAlign: "center",
                                color: C.textDim,
                              }}
                            >
                              No projects match filters.
                            </td>
                          </tr>
                        ) : (
                          sorted.map((p, i) => {
                            const bal = Math.max(0, computeBalance(p));
                            const cc = p.totalClaimedPct;
                            const ct = Math.min(1, computeTotalTargetPct(p));
                            const risk = computeRisk(p);
                            const siteColor =
                              p.siteProgress >= 1
                                ? C.green
                                : p.siteProgress >= 0.5
                                  ? C.blue
                                  : C.amber;
                            return (
                              <tr
                                key={p.name}
                                style={{
                                  borderBottom:
                                    i < sorted.length - 1
                                      ? `1px solid #13151e`
                                      : "none",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.background = "#1e2130")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.background =
                                    "transparent")
                                }
                              >
                                <td
                                  style={{
                                    padding: "11px 14px",
                                    fontWeight: 600,
                                    color: C.text,
                                    verticalAlign: "middle",
                                  }}
                                >
                                  {p.name}
                                </td>
                                <td
                                  style={{
                                    padding: "11px 14px",
                                    verticalAlign: "middle",
                                  }}
                                >
                                  <Badge status={p.status} />
                                </td>
                                <td
                                  style={{
                                    padding: "11px 14px",
                                    color: "#c4c9d8",
                                    verticalAlign: "middle",
                                  }}
                                >
                                  {p.contractSum > 0
                                    ? fmtFull(p.contractSum)
                                    : "—"}
                                </td>
                                {/* Received / Pending stacked split bar */}
                                <td
                                  style={{
                                    padding: "11px 14px",
                                    verticalAlign: "middle",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 4,
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        fontSize: 10,
                                        marginBottom: 1,
                                      }}
                                    >
                                      <span
                                        style={{
                                          color: C.green,
                                          fontWeight: 600,
                                        }}
                                      >
                                        {p.totalReceived > 0
                                          ? fmtM(p.totalReceived)
                                          : "—"}
                                      </span>
                                      {bal > 0 && (
                                        <span
                                          style={{
                                            color: C.amber,
                                            fontWeight: 600,
                                          }}
                                        >
                                          {fmtM(bal)}
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      style={{
                                        height: 6,
                                        borderRadius: 3,
                                        background: C.border,
                                        overflow: "hidden",
                                        width: "100%",
                                      }}
                                    >
                                      {p.contractSum > 0 && (
                                        <div
                                          style={{
                                            display: "flex",
                                            height: "100%",
                                          }}
                                        >
                                          <div
                                            style={{
                                              width: `${Math.min(100, (p.totalReceived / p.contractSum) * 100)}%`,
                                              background: C.green,
                                            }}
                                          />
                                          <div
                                            style={{
                                              width: `${Math.min(100, (bal / p.contractSum) * 100)}%`,
                                              background: C.amber,
                                            }}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                {/* Three SVG rings */}
                                <td
                                  style={{
                                    padding: "11px 14px",
                                    verticalAlign: "middle",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 4,
                                    }}
                                  >
                                    {[
                                      { pct: ct, color: C.blue, lbl: "target" },
                                      {
                                        pct: p.siteProgress,
                                        color: siteColor,
                                        lbl: "progress",
                                      },
                                      {
                                        pct: cc,
                                        color: C.purple,
                                        lbl: "claim",
                                      },
                                    ].map(({ pct, color, lbl }) => (
                                      <div
                                        key={lbl}
                                        style={{ textAlign: "center" }}
                                      >
                                        <Ring pct={pct} color={color} />
                                        <div
                                          style={{
                                            fontSize: 9,
                                            color: C.textDim,
                                            marginTop: 1,
                                          }}
                                        >
                                          {lbl}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                                {/* Risk badge */}
                                <td
                                  style={{
                                    padding: "11px 14px",
                                    verticalAlign: "middle",
                                  }}
                                >
                                  {risk.level !== "none" ? (
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 5,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        padding: "3px 9px",
                                        borderRadius: 20,
                                        background: riskBg[risk.level],
                                        color: riskColors[risk.level],
                                      }}
                                    >
                                      {risk.level === "high" && (
                                        <AlertCircle size={11} />
                                      )}
                                      {risk.level === "medium" && (
                                        <AlertTriangle size={11} />
                                      )}
                                      {risk.level === "low" && (
                                        <ShieldCheck size={11} />
                                      )}
                                      {risk.level === "high"
                                        ? "High"
                                        : risk.level === "medium"
                                          ? "Med"
                                          : "Low"}
                                    </span>
                                  ) : (
                                    <span
                                      style={{ color: C.textDim, fontSize: 11 }}
                                    >
                                      —
                                    </span>
                                  )}
                                </td>
                                {/* Wide sparkline */}
                                <td
                                  style={{
                                    padding: "11px 14px",
                                    verticalAlign: "middle",
                                  }}
                                >
                                  {(() => {
                                    const allVals = ALL_MONTHS.map(
                                      (m) => p.receivedMonthly[m] || 0,
                                    );
                                    const maxV = Math.max(...allVals, 1);
                                    const hasAny = allVals.some((v) => v > 0);
                                    if (!hasAny)
                                      return (
                                        <span
                                          style={{
                                            color: C.textDim,
                                            fontSize: 11,
                                          }}
                                        >
                                          No payments yet
                                        </span>
                                      );
                                    const W = 10,
                                      GAP = 4,
                                      H = 30,
                                      colW = W + GAP;
                                    return (
                                      <div style={{ display: "inline-block" }}>
                                        <svg
                                          width={ALL_MONTHS.length * colW}
                                          height={H + 26}
                                          style={{
                                            display: "block",
                                            overflow: "visible",
                                          }}
                                        >
                                          {ALL_MONTHS.map((m, idx) => {
                                            const v = allVals[idx];
                                            const bh = Math.max(
                                              2,
                                              (v / maxV) * H,
                                            );
                                            const col =
                                              v > 0 ? C.green : C.border;
                                            const shortM = m
                                              .replace("'25", "")
                                              .replace("'26", "");
                                            return (
                                              <g key={idx}>
                                                {/* hover target + native tooltip */}
                                                <rect
                                                  x={idx * colW}
                                                  y={0}
                                                  width={colW}
                                                  height={H}
                                                  fill="transparent"
                                                >
                                                  <title>{`${m}: ${v > 0 ? fmtFull(v) : "no payment"}`}</title>
                                                </rect>
                                                {/* the bar */}
                                                <rect
                                                  x={idx * colW + GAP / 2}
                                                  y={H - bh}
                                                  width={W}
                                                  height={bh}
                                                  rx={1.5}
                                                  fill={col}
                                                  pointerEvents="none"
                                                />
                                                {/* month label (rotated) */}
                                                <text
                                                  x={idx * colW + colW / 2}
                                                  y={H + 8}
                                                  textAnchor="end"
                                                  fontSize={8}
                                                  fill={
                                                    v > 0
                                                      ? C.textMuted
                                                      : C.textDim
                                                  }
                                                  transform={`rotate(-60 ${idx * colW + colW / 2} ${H + 8})`}
                                                >
                                                  {shortM}
                                                </text>
                                              </g>
                                            );
                                          })}
                                        </svg>
                                      </div>
                                    );
                                  })()}
                                </td>
                                {/* Actions: Edit / Delete */}
                                <td
                                  style={{
                                    padding: "11px 14px",
                                    verticalAlign: "middle",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  <button
                                    onClick={() => setDetailProject(p)}
                                    title="Monthly detail"
                                    style={{
                                      background: "none",
                                      border: `1px solid ${C.border}`,
                                      borderRadius: 6,
                                      padding: "4px 6px",
                                      cursor: "pointer",
                                      color: C.amber,
                                      marginRight: 6,
                                    }}
                                  >
                                    <BarChart3 size={13} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditProject(p);
                                      setModalOpen(true);
                                    }}
                                    title="Edit"
                                    style={{
                                      background: "none",
                                      border: `1px solid ${C.border}`,
                                      borderRadius: 6,
                                      padding: "4px 6px",
                                      cursor: "pointer",
                                      color: C.blue,
                                      marginRight: 6,
                                    }}
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(p)}
                                    title="Delete"
                                    style={{
                                      background: "none",
                                      border: `1px solid ${C.border}`,
                                      borderRadius: 6,
                                      padding: "4px 6px",
                                      cursor: "pointer",
                                      color: C.red,
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            );
          })()}

        {/* ════════════════════════════════════
            MONTHLY TARGET TAB
        ════════════════════════════════════ */}
        {activeTab === "monthlyTarget" &&
          (() => {
            return (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                {/* ── Summary KPI strip ── */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                    gap: 12,
                  }}
                >
                  {[
                    {
                      l: "Total Target ($)",
                      v: fmtM(targetSummary.totalTarget),
                      c: "#93c5fd",
                      bg: "#0d1a2e",
                    },
                    {
                      l: "Total Claimed ($)",
                      v: fmtM(targetSummary.totalClaimed),
                      c: C.purple,
                      bg: "#1a0d2e",
                    },
                    {
                      l: "Total Received ($)",
                      v: fmtM(targetSummary.totalReceived),
                      c: C.green,
                      bg: "#0d2218",
                    },
                    {
                      l: "Uncollected Gap",
                      v: fmtM(targetSummary.totalGap),
                      c: C.red,
                      bg: "#200d10",
                    },
                    {
                      l: "Achievement Rate",
                      v:
                        targetSummary.totalTarget > 0
                          ? `${Math.round((targetSummary.totalReceived / targetSummary.totalTarget) * 100)}%`
                          : "—",
                      c: C.amber,
                      bg: "#1f1a0d",
                    },
                  ].map(({ l, v, c, bg }) => (
                    <div
                      key={l}
                      style={{
                        background: C.card,
                        border: `1px solid ${C.border}`,
                        borderRadius: 12,
                        padding: "14px 16px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: C.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginBottom: 4,
                        }}
                      >
                        {l}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: c }}>
                        {v}
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── Monthly Target/Claimed/Received with year toggle + forecast ── */}
                <Card>
                  <div
                    style={{
                      padding: "16px 20px",
                      borderBottom: `1px solid ${C.border}`,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div
                        style={{ fontSize: 14, fontWeight: 700, color: C.text }}
                      >
                        FY {monthlyYear} — Monthly Claimed / Received
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: C.textMuted,
                          marginTop: 2,
                        }}
                      >
                        Claimed $ &amp; Received $ (money) per month
                      </div>
                    </div>
                    <YearTabs value={monthlyYear} onChange={setMonthlyYear} />
                  </div>
                  <div style={{ padding: "14px 20px" }}>
                    {/* legend */}
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        marginBottom: 12,
                        fontSize: 11,
                        color: C.textMuted,
                        flexWrap: "wrap",
                      }}
                    >
                      {[
                        ["Claimed $", C.purple],
                        ["Received $", C.green],
                      ].map(([l, c]) => (
                        <span
                          key={l}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 2,
                              background: c,
                              display: "inline-block",
                              opacity: l.includes("forecast") ? 0.5 : 1,
                            }}
                          />
                          {l}
                        </span>
                      ))}
                    </div>
                    <ResponsiveContainer width="100%" height={320}>
                      <ComposedChart
                        data={yearMonthlyData}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <pattern
                            id="forecastHatch"
                            patternUnits="userSpaceOnUse"
                            width="6"
                            height="6"
                            patternTransform="rotate(45)"
                          >
                            <rect
                              width="6"
                              height="6"
                              fill="#60a5fa"
                              fillOpacity="0.15"
                            />
                            <line
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="6"
                              stroke="#60a5fa"
                              strokeWidth="2"
                              strokeOpacity="0.6"
                            />
                          </pattern>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#1e2130"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 11, fill: C.textMuted }}
                          axisLine={false}
                          tickLine={false}
                          interval={0}
                        />
                        <YAxis
                          tickFormatter={(v) => fmtM(v)}
                          tick={{ fontSize: 11, fill: C.textMuted }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const d =
                              yearMonthlyData.find((x) => x.month === label) ||
                              {};
                            const shown = payload.filter((p) => p.value > 0);
                            return (
                              <div
                                style={{
                                  background: "#0d0f16",
                                  border: `1px solid ${C.border}`,
                                  borderRadius: 10,
                                  padding: "10px 14px",
                                  fontSize: 12,
                                  color: C.text,
                                }}
                              >
                                <div
                                  style={{ fontWeight: 700, marginBottom: 6 }}
                                >
                                  {d.fullMonth || label}
                                  {d.isForecast ? (
                                    <span
                                      style={{
                                        color: "#60a5fa",
                                        marginLeft: 6,
                                        fontSize: 11,
                                      }}
                                    >
                                      · forecast
                                    </span>
                                  ) : null}
                                </div>
                                {shown.length ? (
                                  shown.map((p, i) => (
                                    <div
                                      key={i}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        marginBottom: 2,
                                      }}
                                    >
                                      <span
                                        style={{
                                          width: 8,
                                          height: 8,
                                          borderRadius: 2,
                                          background: p.color || p.fill,
                                          flexShrink: 0,
                                        }}
                                      />
                                      <span style={{ color: C.textMuted }}>
                                        {p.name}:
                                      </span>
                                      <span style={{ fontWeight: 600 }}>
                                        {fmtFull(p.value)}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <div style={{ color: C.textDim }}>
                                    No data
                                  </div>
                                )}
                              </div>
                            );
                          }}
                        />
                        {/* Actuals (only have values in past months) */}
                        <Bar
                          dataKey="Claimed $"
                          fill={C.purple}
                          fillOpacity={0.75}
                          maxBarSize={30}
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          dataKey="Received $"
                          fill={C.green}
                          maxBarSize={30}
                          radius={[3, 3, 0, 0]}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* ── Monthly summary table (follows year toggle) ── */}
                <Card>
                  <CardHead
                    title={`FY ${monthlyYear} — Monthly Summary`}
                    sub="Target % = planned work progress (contract-weighted) · Balance = Claimed − Received (outstanding to collect)"
                  />
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 12,
                      }}
                    >
                      <thead>
                        <tr style={{ background: C.cardAlt }}>
                          {[
                            "Month",
                            "Target %",
                            "Claimed $",
                            "Received $",
                            "Balance $",
                            "Status",
                          ].map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: "9px 14px",
                                textAlign:
                                  h === "Month" || h === "Status"
                                    ? "left"
                                    : "right",
                                fontSize: 10,
                                fontWeight: 600,
                                color: C.textMuted,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                borderBottom: `1px solid ${C.border}`,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {yearMonthlyData.map((d, i, arr) => {
                          // Target % shown for ALL months; Claimed/Received for actual months.
                          const targetPct = d.targetPct;
                          const claimed = d.isForecast ? 0 : d.claimedRaw;
                          const received = d.isForecast ? 0 : d.receivedRaw;
                          // Balance = outstanding to collect (money claimed but not yet received).
                          const balance = d.isForecast
                            ? 0
                            : Math.max(0, Math.round(claimed - received));
                          const empty =
                            targetPct === 0 && claimed === 0 && received === 0;
                          return (
                            <tr
                              key={d.fullMonth}
                              style={{
                                borderBottom:
                                  i < arr.length - 1
                                    ? `1px solid #13151e`
                                    : "none",
                                opacity: empty ? 0.5 : 1,
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background = "#1e2130")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.background =
                                  "transparent")
                              }
                            >
                              <td
                                style={{
                                  padding: "9px 14px",
                                  fontWeight: 600,
                                  color: C.text,
                                }}
                              >
                                {d.fullMonth}
                              </td>
                              <td
                                style={{
                                  padding: "9px 14px",
                                  textAlign: "right",
                                  color: "#93c5fd",
                                }}
                              >
                                {targetPct > 0
                                  ? `${(targetPct * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td
                                style={{
                                  padding: "9px 14px",
                                  textAlign: "right",
                                  color: C.purple,
                                }}
                              >
                                {claimed > 0 ? fmtFull(claimed) : "—"}
                              </td>
                              <td
                                style={{
                                  padding: "9px 14px",
                                  textAlign: "right",
                                  color: C.green,
                                  fontWeight: 600,
                                }}
                              >
                                {received > 0 ? fmtFull(received) : "—"}
                              </td>
                              <td
                                style={{
                                  padding: "9px 14px",
                                  textAlign: "right",
                                  color: balance > 0 ? C.amber : C.textDim,
                                  fontWeight: balance > 0 ? 700 : 400,
                                }}
                              >
                                {balance > 0 ? fmtFull(balance) : "—"}
                              </td>
                              <td style={{ padding: "9px 14px" }}>
                                {d.isForecast ? (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: "#60a5fa",
                                      background: "#0d1a2e",
                                      borderRadius: 20,
                                      padding: "2px 9px",
                                    }}
                                  >
                                    Forecast
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: C.green,
                                      background: "#0d2218",
                                      borderRadius: 20,
                                      padding: "2px 9px",
                                    }}
                                  >
                                    Actual
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        {(() => {
                          // Contract-weighted average target % across the year.
                          const tTargetAmt = yearMonthlyData.reduce(
                            (s, d) => s + d.targetRaw,
                            0,
                          );
                          const tContractBase = yearMonthlyData.reduce(
                            (s, d) => s + d.contractBase,
                            0,
                          );
                          const tTargetPct =
                            tContractBase > 0 ? tTargetAmt / tContractBase : 0;
                          const tC = yearMonthlyData.reduce(
                            (s, d) => s + (d.isForecast ? 0 : d.claimedRaw),
                            0,
                          );
                          const tR = yearMonthlyData.reduce(
                            (s, d) => s + (d.isForecast ? 0 : d.receivedRaw),
                            0,
                          );
                          // Balance total = Claimed − Received (outstanding to collect).
                          const tG = Math.max(0, tC - tR);
                          const cell = {
                            padding: "10px 14px",
                            textAlign: "right",
                            fontWeight: 700,
                          };
                          return (
                            <tr style={{ background: C.cardAlt }}>
                              <td
                                style={{
                                  padding: "10px 14px",
                                  fontWeight: 700,
                                  color: C.text,
                                }}
                              >
                                TOTAL
                              </td>
                              <td style={{ ...cell, color: "#93c5fd" }}>
                                {tTargetPct > 0
                                  ? `${(tTargetPct * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td style={{ ...cell, color: C.purple }}>
                                {tC > 0 ? fmtFull(tC) : "—"}
                              </td>
                              <td style={{ ...cell, color: C.green }}>
                                {tR > 0 ? fmtFull(tR) : "—"}
                              </td>
                              <td style={{ ...cell, color: C.amber }}>
                                {tG > 0 ? fmtFull(tG) : "—"}
                              </td>
                              <td style={{ padding: "10px 14px" }} />
                            </tr>
                          );
                        })()}
                      </tfoot>
                    </table>
                  </div>
                </Card>

                {/* ── Achievement rate heatmap-style row ── */}
                <Card>
                  <CardHead
                    title="Monthly achievement rate — target vs achieved"
                    sub="How much of each month's planned work was actually achieved (work progress, not money)"
                  />
                  <div style={{ padding: "16px 20px" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {monthlyTargetData.map((d) => {
                        const r = d.achievementRate;
                        const bg =
                          r >= 0.95
                            ? "#052e16"
                            : r >= 0.7
                              ? "#0c1a3a"
                              : r >= 0.4
                                ? "#1f1a0d"
                                : r > 0
                                  ? "#200d10"
                                  : "#1e2130";
                        const col =
                          r >= 0.95
                            ? C.green
                            : r >= 0.7
                              ? C.blue
                              : r >= 0.4
                                ? C.amber
                                : r > 0
                                  ? C.red
                                  : C.textDim;
                        return (
                          <div
                            key={d.fullMonth}
                            style={{
                              background: bg,
                              border: `1px solid ${C.border}`,
                              borderRadius: 10,
                              padding: "10px 12px",
                              minWidth: 72,
                              textAlign: "center",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                color: C.textMuted,
                                marginBottom: 4,
                              }}
                            >
                              {d.fullMonth}
                            </div>
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 700,
                                color: col,
                              }}
                            >
                              {Math.round(r * 100)}%
                            </div>
                            <div
                              style={{
                                fontSize: 9,
                                color: C.textDim,
                                marginTop: 2,
                              }}
                            >
                              {d.projectCount}p
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        marginTop: 12,
                        fontSize: 11,
                        color: C.textMuted,
                        flexWrap: "wrap",
                      }}
                    >
                      {[
                        ["≥95% on track", C.green],
                        ["70–94% close", C.blue],
                        ["40–69% behind", C.amber],
                        ["<40% critical", C.red],
                      ].map(([l, c]) => (
                        <span
                          key={l}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 2,
                              background: c,
                              display: "inline-block",
                            }}
                          />
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>
                </Card>

                {/* ── Per-project monthly target drill-down ── */}
                <Card>
                  <div
                    style={{
                      padding: "14px 20px",
                      borderBottom: `1px solid ${C.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        Per-project monthly target breakdown
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: C.textMuted,
                          marginTop: 2,
                        }}
                      >
                        Sorted by biggest uncollected gap first
                      </div>
                    </div>
                    <YearTabs value={chartYear} onChange={setChartYear} />
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 12,
                      }}
                    >
                      <thead>
                        <tr style={{ background: C.cardAlt }}>
                          {[
                            "Project",
                            "Status",
                            "Month",
                            "Target %",
                            "Achieved %",
                            "Claimed %",
                            "Claimed $",
                            "Received $",
                            "Gap $",
                          ].map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: "9px 14px",
                                textAlign: "left",
                                fontSize: 10,
                                fontWeight: 600,
                                color: C.textMuted,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                borderBottom: `1px solid ${C.border}`,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {perProjectTargetRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={9}
                              style={{
                                padding: "30px",
                                textAlign: "center",
                                color: C.textDim,
                              }}
                            >
                              No monthly target data for this period.
                            </td>
                          </tr>
                        ) : (
                          perProjectTargetRows.slice(0, 40).map((r, i, arr) => (
                            <tr
                              key={`${r.project}-${r.month}`}
                              style={{
                                borderBottom:
                                  i < arr.length - 1
                                    ? `1px solid #13151e`
                                    : "none",
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background = "#1e2130")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.background =
                                  "transparent")
                              }
                            >
                              <td
                                style={{
                                  padding: "9px 14px",
                                  fontWeight: 600,
                                  color: C.text,
                                }}
                              >
                                {r.project}
                              </td>
                              <td style={{ padding: "9px 14px" }}>
                                <Badge status={r.status} />
                              </td>
                              <td
                                style={{
                                  padding: "9px 14px",
                                  color: C.blue,
                                  fontWeight: 600,
                                }}
                              >
                                {r.month}
                              </td>
                              {/* Target % with bar */}
                              <td style={{ padding: "9px 14px" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 40,
                                      background: C.border,
                                      borderRadius: 2,
                                      height: 4,
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: `${Math.min(100, r.targetPct * 100)}%`,
                                        height: "100%",
                                        background: "#60a5fa",
                                      }}
                                    />
                                  </div>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: "#93c5fd",
                                    }}
                                  >
                                    {fmtPct(r.targetPct)}
                                  </span>
                                </div>
                              </td>
                              {/* Achieved % with bar (actual work completed) */}
                              <td style={{ padding: "9px 14px" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 40,
                                      background: C.border,
                                      borderRadius: 2,
                                      height: 4,
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: `${Math.min(100, r.achievedPct * 100)}%`,
                                        height: "100%",
                                        background: C.green,
                                      }}
                                    />
                                  </div>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: C.green,
                                    }}
                                  >
                                    {r.achievedPct > 0
                                      ? fmtPct(r.achievedPct)
                                      : "—"}
                                  </span>
                                </div>
                              </td>
                              {/* Claimed % with bar */}
                              <td style={{ padding: "9px 14px" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 40,
                                      background: C.border,
                                      borderRadius: 2,
                                      height: 4,
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: `${Math.min(100, r.claimedPct * 100)}%`,
                                        height: "100%",
                                        background: C.purple,
                                      }}
                                    />
                                  </div>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: C.purple,
                                    }}
                                  >
                                    {fmtPct(r.claimedPct)}
                                  </span>
                                </div>
                              </td>
                              <td
                                style={{ padding: "9px 14px", color: C.purple }}
                              >
                                {fmtFull(r.claimedAmt)}
                              </td>
                              <td
                                style={{
                                  padding: "9px 14px",
                                  color: C.green,
                                  fontWeight: 600,
                                }}
                              >
                                {r.receivedAmt > 0
                                  ? fmtFull(r.receivedAmt)
                                  : "—"}
                              </td>
                              <td
                                style={{
                                  padding: "9px 14px",
                                  color: r.gap > 0 ? C.red : C.textDim,
                                  fontWeight: r.gap > 0 ? 700 : 400,
                                }}
                              >
                                {r.gap > 0 ? fmtFull(r.gap) : "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* ── Down payment analysis ── */}
                <Card>
                  <CardHead
                    title="Down payment analysis"
                    sub="First payment received per project as % of contract"
                  />
                  <div style={{ padding: "16px 20px" }}>
                    <ResponsiveContainer
                      width="100%"
                      height={downPaymentData.length * 44 + 40}
                    >
                      <ComposedChart
                        layout="vertical"
                        data={downPaymentData}
                        margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#1e2130"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          tickFormatter={(v) => fmtM(v)}
                          tick={{ fontSize: 11, fill: C.textMuted }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 11, fill: C.textMuted }}
                          axisLine={false}
                          tickLine={false}
                          width={120}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0]?.payload;
                            return (
                              <div
                                style={{
                                  background: "#0d0f16",
                                  border: `1px solid ${C.border}`,
                                  borderRadius: 10,
                                  padding: "10px 14px",
                                  fontSize: 12,
                                  color: C.text,
                                }}
                              >
                                <div
                                  style={{ fontWeight: 700, marginBottom: 4 }}
                                >
                                  {d?.fullName}
                                </div>
                                <div style={{ color: C.textMuted }}>
                                  Down payment:{" "}
                                  <span
                                    style={{ color: C.teal, fontWeight: 600 }}
                                  >
                                    {fmtFull(d?.["Down Payment"] || 0)}
                                  </span>
                                </div>
                                <div style={{ color: C.textMuted }}>
                                  Contract:{" "}
                                  <span
                                    style={{ color: C.text, fontWeight: 600 }}
                                  >
                                    {fmtFull(d?.contract || 0)}
                                  </span>
                                </div>
                                <div style={{ color: C.textMuted }}>
                                  % of contract:{" "}
                                  <span
                                    style={{ color: C.amber, fontWeight: 600 }}
                                  >
                                    {d?.["Down Pmt %"]}%
                                  </span>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Bar
                          dataKey="Down Payment"
                          fill={C.teal}
                          radius={[0, 4, 4, 0]}
                          maxBarSize={28}
                        >
                          <LabelList
                            dataKey="Down Pmt %"
                            position="right"
                            style={{
                              fontSize: 11,
                              fill: C.amber,
                              fontWeight: 600,
                            }}
                            formatter={(v) => `${v}%`}
                          />
                        </Bar>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            );
          })()}

        {/* ════════════════════════════════════
            YEAR SUMMARY TAB — Rich Visual
        ════════════════════════════════════ */}
        {activeTab === "yearwise" &&
          (() => {
            // Radial ring for year-level metric
            const YearRing = ({ pct, color, label, value }) => {
              const r = 38,
                cx = 50,
                cy = 50,
                circ = 2 * Math.PI * r;
              const dash = Math.min(1, Math.max(0, pct)) * circ;
              return (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <svg width={100} height={100} viewBox="0 0 100 100">
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      stroke={C.border}
                      strokeWidth={7}
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      stroke={color}
                      strokeWidth={7}
                      strokeDasharray={circ}
                      strokeDashoffset={circ - dash}
                      strokeLinecap="round"
                      transform={`rotate(-90 ${cx} ${cy})`}
                    />
                    <text
                      x={cx}
                      y={cy - 4}
                      textAnchor="middle"
                      fontSize={13}
                      fontWeight={700}
                      fill={color}
                    >
                      {Math.round(pct * 100)}%
                    </text>
                    <text
                      x={cx}
                      y={cy + 12}
                      textAnchor="middle"
                      fontSize={9}
                      fill={C.textMuted}
                    >
                      {label}
                    </text>
                  </svg>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color,
                      textAlign: "center",
                    }}
                  >
                    {value}
                  </div>
                </div>
              );
            };

            // Vertical grouped bars for years side by side.
            // Warm/cool alternate so adjacent year columns contrast strongly
            // (cycles if there are more years than colors).
            const YEAR_COLORS = ["#60a5fa", "#fbbf24", "#2dd4bf", "#f472b6", "#a78bfa"];
            // values: [{ year, value }], one entry per year present in the data.
            const CompareBar = ({ label, values }) => {
              const max = Math.max(...values.map((d) => d.value), 1);
              const PLOT_H = 130; // px height of the tallest column
              return (
                <div style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: C.textMuted,
                      marginBottom: 8,
                    }}
                  >
                    {label}
                  </div>
                  {/* grouped vertical columns, one per year — packed tightly
                      (fixed-width columns, centered) so the years read as a group */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "flex-start",
                      gap: 3,
                      height: PLOT_H + 30,
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    {values.map((d, i) => {
                      const col = YEAR_COLORS[i % YEAR_COLORS.length];
                      const barH = Math.max(2, (d.value / max) * PLOT_H);
                      return (
                        <div
                          key={d.year}
                          style={{
                            width: 34,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            height: "100%",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: col,
                              marginBottom: 3,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {fmtM(d.value)}
                          </div>
                          <div
                            style={{
                              width: "100%",
                              maxWidth: 30,
                              height: barH,
                              background: col,
                              borderRadius: "3px 3px 0 0",
                              transition: "height .3s ease",
                            }}
                          />
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: C.textMuted,
                              marginTop: 5,
                            }}
                          >
                            '{String(d.year).slice(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            };

            return (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                {/* ── Year cards with rings ── */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
                    gap: 16,
                  }}
                >
                  {[
                    {
                      year: "2025",
                      s: sum2025,
                      hdr: "#1d4ed8",
                      accent: "#60a5fa",
                    },
                    {
                      year: "2026",
                      s: sum2026,
                      hdr: "#0f766e",
                      accent: "#2dd4bf",
                    },
                  ].map(({ year, s, hdr, accent }) => {
                    const collRate =
                      s.totalContract > 0
                        ? s.yearReceived / s.totalContract
                        : 0;
                    const claimRate =
                      s.totalContract > 0
                        ? s.totalClaimed / s.totalContract
                        : 0;
                    const pendRate =
                      s.totalContract > 0
                        ? s.totalPending / s.totalContract
                        : 0;
                    return (
                      <Card key={year}>
                        <div
                          style={{
                            background: hdr,
                            padding: "14px 20px",
                            color: "#fff",
                            borderRadius: "14px 14px 0 0",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 18, fontWeight: 700 }}>
                                FY {year}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  opacity: 0.75,
                                  marginTop: 1,
                                }}
                              >
                                {s.count} active projects
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 11, opacity: 0.7 }}>
                                Total contract
                              </div>
                              <div style={{ fontSize: 17, fontWeight: 700 }}>
                                {fmtM(s.totalContract)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 3 rings row */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-around",
                            padding: "18px 16px",
                            borderBottom: `1px solid ${C.border}`,
                          }}
                        >
                          <YearRing
                            pct={collRate}
                            color={C.green}
                            label="received"
                            value={fmtM(s.yearReceived)}
                          />
                          <YearRing
                            pct={claimRate}
                            color={C.purple}
                            label="claimed"
                            value={fmtM(s.totalClaimed)}
                          />
                          <YearRing
                            pct={pendRate}
                            color={C.amber}
                            label="pending"
                            value={fmtM(s.totalPending)}
                          />
                        </div>

                        {/* metric rows with mini bars */}
                        <div style={{ padding: "10px 20px" }}>
                          {[
                            {
                              l: "Contract Sum",
                              v: s.totalContract,
                              pct: 1,
                              c: "#93c5fd",
                            },
                            {
                              l: "Total Claimed",
                              v: s.totalClaimed,
                              pct: claimRate,
                              c: C.purple,
                            },
                            {
                              l: "Received to Date",
                              v: s.lifetimeReceived,
                              pct:
                                s.totalContract > 0
                                  ? s.lifetimeReceived / s.totalContract
                                  : 0,
                              c: C.green,
                            },
                            {
                              l: "Year Received",
                              v: s.yearReceived,
                              pct: collRate,
                              c: C.green,
                              nested: true,
                            },
                            {
                              l: "Total Pending",
                              v: s.totalPending,
                              pct: pendRate,
                              c: C.amber,
                            },
                          ].map((row, i, arr) => (
                            <div
                              key={row.l}
                              style={{
                                padding: "10px 0",
                                paddingLeft: row.nested ? 16 : 0,
                                borderBottom:
                                  i < arr.length - 1
                                    ? `1px solid ${C.border}`
                                    : "none",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  marginBottom: 5,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: row.nested ? 11 : 12,
                                    color: row.nested ? C.textMuted : "#c4c9d8",
                                    fontWeight: 500,
                                  }}
                                >
                                  {row.nested ? "↳ " : ""}
                                  {row.l}
                                </span>
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: row.c,
                                  }}
                                >
                                  {fmtFull(row.v)}
                                </span>
                              </div>
                              <div
                                style={{
                                  height: 4,
                                  background: C.border,
                                  borderRadius: 2,
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    width: `${Math.min(100, row.pct * 100)}%`,
                                    height: "100%",
                                    background: row.c,
                                    borderRadius: 2,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {/* ── Side-by-side comparison bars (dynamic across all years) ── */}
                <Card>
                  <CardHead
                    title={`${
                      yearComparison.length <= 2
                        ? yearComparison.map((y) => `FY ${y.year}`).join(" vs ")
                        : `FY ${yearComparison[0].year}–${yearComparison[yearComparison.length - 1].year}`
                    } — head to head`}
                    sub="All values from filtered projects"
                  />
                  <div
                    style={{
                      padding: "18px 22px",
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap: 18,
                    }}
                  >
                    <CompareBar
                      label="Contract Sum"
                      values={yearComparison.map((y) => ({
                        year: y.year,
                        value: y.totalContract,
                      }))}
                    />
                    <CompareBar
                      label="Year Received"
                      values={yearComparison.map((y) => ({
                        year: y.year,
                        value: y.yearReceived,
                      }))}
                    />
                    <CompareBar
                      label="Total Claimed"
                      values={yearComparison.map((y) => ({
                        year: y.year,
                        value: y.totalClaimed,
                      }))}
                    />
                    <CompareBar
                      label="Total Pending"
                      values={yearComparison.map((y) => ({
                        year: y.year,
                        value: y.totalPending,
                      }))}
                    />
                  </div>
                </Card>

                {/* ── Per-project year breakdown ── */}
                <Card>
                  <div
                    style={{
                      padding: "14px 20px",
                      borderBottom: `1px solid ${C.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      Per-project year breakdown
                    </div>
                    <YearTabs value={chartYear} onChange={setChartYear} />
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 12,
                      }}
                    >
                      <thead>
                        <tr style={{ background: C.cardAlt }}>
                          {[
                            "Project",
                            "Status",
                            "Contract",
                            "Year Received",
                            "% Collected",
                            "Claimed",
                            "Pending",
                            "Risk",
                          ].map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: "9px 14px",
                                textAlign: "left",
                                fontSize: 10,
                                fontWeight: 600,
                                color: C.textMuted,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                borderBottom: `1px solid ${C.border}`,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const months =
                            chartYear === "2025" ? MONTHS_2025 : MONTHS_2026;
                          const rows = filtered
                            .filter((p) =>
                              months.some(
                                (m) =>
                                  (p.receivedMonthly[m] || 0) > 0 ||
                                  (p.targetMonthly[m] || 0) > 0,
                              ),
                            )
                            .sort((a, b) => b.contractSum - a.contractSum);
                          if (!rows.length)
                            return (
                              <tr>
                                <td
                                  colSpan={8}
                                  style={{
                                    padding: "30px",
                                    textAlign: "center",
                                    color: C.textDim,
                                  }}
                                >
                                  No activity for FY {chartYear}
                                </td>
                              </tr>
                            );
                          return rows.map((p, i, arr) => {
                            const yr = months.reduce(
                              (s, m) => s + (p.receivedMonthly[m] || 0),
                              0,
                            );
                            const cb = Math.max(0, computeBalance(p));
                            const collPct =
                              p.contractSum > 0 ? yr / p.contractSum : 0;
                            const risk = computeRisk(p);
                            return (
                              <tr
                                key={p.name}
                                style={{
                                  borderBottom:
                                    i < arr.length - 1
                                      ? `1px solid #13151e`
                                      : "none",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.background = "#1e2130")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.background =
                                    "transparent")
                                }
                              >
                                <td
                                  style={{
                                    padding: "10px 14px",
                                    fontWeight: 600,
                                  }}
                                >
                                  {p.name}
                                </td>
                                <td style={{ padding: "10px 14px" }}>
                                  <Badge status={p.status} />
                                </td>
                                <td
                                  style={{
                                    padding: "10px 14px",
                                    color: "#c4c9d8",
                                  }}
                                >
                                  {p.contractSum > 0
                                    ? fmtFull(p.contractSum)
                                    : "—"}
                                </td>
                                <td
                                  style={{
                                    padding: "10px 14px",
                                    color: C.green,
                                    fontWeight: 600,
                                  }}
                                >
                                  {yr > 0 ? fmtFull(yr) : "—"}
                                </td>
                                {/* % collected mini bar */}
                                <td style={{ padding: "10px 14px" }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 7,
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: 60,
                                        background: C.border,
                                        borderRadius: 3,
                                        height: 5,
                                        overflow: "hidden",
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: `${Math.min(100, collPct * 100)}%`,
                                          height: "100%",
                                          background:
                                            collPct >= 0.8
                                              ? C.green
                                              : collPct >= 0.4
                                                ? C.blue
                                                : C.amber,
                                        }}
                                      />
                                    </div>
                                    <span
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color:
                                          collPct >= 0.8
                                            ? C.green
                                            : collPct >= 0.4
                                              ? C.blue
                                              : C.amber,
                                      }}
                                    >
                                      {fmtPct(collPct)}
                                    </span>
                                  </div>
                                </td>
                                <td
                                  style={{
                                    padding: "10px 14px",
                                    color: C.purple,
                                  }}
                                >
                                  {fmtFull(p.contractSum * p.totalClaimedPct)}
                                </td>
                                <td
                                  style={{
                                    padding: "10px 14px",
                                    color: cb > 0 ? C.amber : C.textDim,
                                  }}
                                >
                                  {cb > 0 ? fmtFull(cb) : "—"}
                                </td>
                                <td style={{ padding: "10px 14px" }}>
                                  {risk.level === "high" && (
                                    <span
                                      style={{
                                        color: C.red,
                                        fontWeight: 700,
                                        fontSize: 11,
                                      }}
                                    >
                                      ● High
                                    </span>
                                  )}
                                  {risk.level === "medium" && (
                                    <span
                                      style={{
                                        color: C.amber,
                                        fontWeight: 700,
                                        fontSize: 11,
                                      }}
                                    >
                                      ● Med
                                    </span>
                                  )}
                                  {risk.level === "low" && (
                                    <span
                                      style={{
                                        color: C.green,
                                        fontWeight: 700,
                                        fontSize: 11,
                                      }}
                                    >
                                      ● Low
                                    </span>
                                  )}
                                  {risk.level === "none" && (
                                    <span
                                      style={{ color: C.textDim, fontSize: 11 }}
                                    >
                                      —
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            );
          })()}
      </div>

      {modalOpen && (
        <ProjectFormModal
          project={editProject}
          onClose={() => setModalOpen(false)}
          onSaved={fetchProjects}
        />
      )}

      {detailProject && (
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
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              width: "100%",
              maxWidth: 720,
              maxHeight: "88vh",
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
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                  {detailProject.name}
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                  Monthly Target vs Achieved · Shortfall carries to next month
                </div>
              </div>
              <button
                onClick={() => setDetailProject(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: C.textMuted,
                  fontSize: 20,
                }}
              >
                <XCircle size={20} />
              </button>
            </div>

            <div style={{ padding: 22 }}>
              {/* Cumulative summary */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: C.textMuted,
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Site Progress (cumulative achieved to today)
                  </div>
                  <div
                    style={{ fontSize: 20, fontWeight: 700, color: C.green }}
                  >
                    {fmtPct(detailProject.siteProgress)}
                  </div>
                </div>
                <div
                  style={{
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: C.textMuted,
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Total Target %
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.blue }}>
                    {fmtPct(detailProject.totalTargetPct)}
                  </div>
                </div>
              </div>

              {/* Monthly table */}
              {(() => {
                const rows = buildShortfallRows(
                  detailProject.targetMonthly,
                  detailProject.achievedMonthly,
                );
                if (rows.length === 0) {
                  return (
                    <div
                      style={{
                        color: C.textMuted,
                        fontSize: 13,
                        textAlign: "center",
                        padding: "20px 0",
                      }}
                    >
                      No monthly target or achieved data entered yet.
                    </div>
                  );
                }
                const th = {
                  textAlign: "left",
                  padding: "8px 10px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.textMuted,
                  textTransform: "uppercase",
                  borderBottom: `1px solid ${C.border}`,
                };
                const td = {
                  padding: "7px 10px",
                  fontSize: 13,
                  color: C.text,
                  borderBottom: `1px solid ${C.border}`,
                };
                return (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={th}>Month</th>
                        <th style={{ ...th, color: C.blue }}>Target %</th>
                        <th style={{ ...th, color: C.amber }}>Achieved %</th>
                        <th style={{ ...th, color: C.textMuted }}>
                          Carried In
                        </th>
                        <th style={{ ...th, color: C.purple }}>Eff. Target</th>
                        <th style={{ ...th, color: C.red }}>Shortfall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.month}>
                          <td style={{ ...td, color: C.textMuted }}>
                            {r.month}
                          </td>
                          <td style={td}>{fmtPct(r.target)}</td>
                          <td style={td}>{fmtPct(r.achieved)}</td>
                          <td
                            style={{
                              ...td,
                              color: r.carriedIn > 0 ? C.amber : C.textDim,
                            }}
                          >
                            {r.carriedIn > 0 ? fmtPct(r.carriedIn) : "—"}
                          </td>
                          <td style={{ ...td, fontWeight: 600 }}>
                            {fmtPct(r.effectiveTarget)}
                          </td>
                          <td
                            style={{
                              ...td,
                              color: r.shortfall > 0 ? C.red : C.green,
                              fontWeight: 600,
                            }}
                          >
                            {r.shortfall > 0 ? fmtPct(r.shortfall) : "On track"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}

              <div
                style={{
                  fontSize: 11,
                  color: C.textMuted,
                  marginTop: 14,
                  lineHeight: 1.5,
                }}
              >
                <strong>Eff. Target</strong> = this month's target + shortfall
                carried from previous month. <strong>Shortfall</strong> = Eff.
                Target − Achieved, carried into the next month.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
