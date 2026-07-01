// frontend/src/pages/HomePage.jsx
// InventoryOpz — Bond Build SG | Yazhsey Technologies Pte Ltd
// Premium Redesign: Glassmorphism · Inter · Linear/Vercel/Stripe-inspired

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

// ─── SVG Icon Library ────────────────────────────────────────────────────────
const Ico = {
  box: ({ size = 20, stroke = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ),
  clipboard: ({ size = 20, stroke = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
      <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
    </svg>
  ),
  barChart: ({ size = 20, stroke = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  coins: ({ size = 20, stroke = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      <path d="M9.5 9.5c.5-1 1.5-1.5 2.5-1.5s2 .5 2 1.5c0 2-4 2-4 4s2 2.5 4 1.5"/>
    </svg>
  ),
  bell: ({ size = 18, stroke = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  ),
  settings: ({ size = 18, stroke = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  arrowRight: ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
  trendUp: ({ size = 11 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  alertCircle: ({ size = 11 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  user: ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  mail: ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  inbox: ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>
    </svg>
  ),
  key: ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  ),
  logOut: ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  layers: ({ size = 20, stroke = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
    </svg>
  ),
};

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  bg: "#0F172A",
  card: "rgba(30, 41, 59, 0.5)",
  cardSolid: "#1E293B",
  border: "rgba(148, 163, 184, 0.08)",
  borderHover: "rgba(148, 163, 184, 0.18)",
  text: "#F1F5F9",
  textSec: "#94A3B8",
  textDim: "#64748B",
  blue: "#3B82F6",
  blueDim: "rgba(59,130,246,0.12)",
  emerald: "#10B981",
  emeraldDim: "rgba(16,185,129,0.12)",
  violet: "#8B5CF6",
  violetDim: "rgba(139,92,246,0.12)",
  red: "#F43F5E",
  redDim: "rgba(244,63,94,0.12)",
  amber: "#F59E0B",
  amberDim: "rgba(245,158,11,0.12)",
};

const glass = {
  background: T.card,
  backdropFilter: "blur(20px) saturate(180%)",
  WebkitBackdropFilter: "blur(20px) saturate(180%)",
  border: `1px solid ${T.border}`,
  borderRadius: 16,
};

export default function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showAccounting, setShowAccounting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboardData, setDashboardData] = useState({
    totalItems: 0,
    totalPieces: 0,
    okItems: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    stockValue: 0,
    openPOs: 0,
    closedPOs: 0,
    totalPOValue: 0,
    openPRs: 0,
    totalProjects: 0,
    completedProjects: 0,
    inProgressProjects: 0,
    upcomingProjects: 0,
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError("");
        const inventoryResponse = await api.get("/inventory/summary");
        const invData = inventoryResponse.data;

        let procData = { open_prs: 0, open_pos: 0 };
        try {
          const procResponse = await api.get("/home/procurement-summary");
          procData = procResponse.data?.data || procData;
        } catch { /* not available yet */ }

        let opData = { completed: 0, in_progress: 0, upcoming: 0 };
        try {
          const opResponse = await api.get("/home/operation-summary");
          opData = opResponse.data?.data || opData;
        } catch { /* not available yet */ }

        setDashboardData({
          totalItems: invData.total_items || 0,
          totalPieces: invData.total_pieces || 0,
          okItems: invData.ok_items || 0,
          lowStockItems: invData.low_stock_items || 0,
          outOfStockItems: invData.out_of_stock_items || 0,
          stockValue: invData.total_value || 0,
          openPOs: procData.open_pos || 0,
          closedPOs: 0,
          totalPOValue: 0,
          openPRs: procData.open_prs || 0,
          totalProjects: (opData.completed || 0) + (opData.in_progress || 0) + (opData.upcoming || 0),
          completedProjects: opData.completed || 0,
          inProgressProjects: opData.in_progress || 0,
          upcomingProjects: opData.upcoming || 0,
        });
        setLoading(false);
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
        setError("Failed to load dashboard data");
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  useEffect(() => {
    const fn = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // ─── Shared full-screen shell ─────────────────────────────────────────────
  const Shell = ({ children }) => (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}>
      {children}
    </div>
  );

  if (!user) return (
    <Shell>
      <p style={{ fontSize: 15, color: T.violet, letterSpacing: "0.04em", fontWeight: 500 }}>
        Loading Workspace…
      </p>
    </Shell>
  );

  const handleSignOut = async () => {
    setDropdownOpen(false);
    await logout();
    navigate("/login");
  };

  if (showAccounting) return (
    <Shell>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: T.amberDim, border: `1px solid rgba(245,158,11,0.25)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 32 }}>⏳</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: "-0.03em", marginBottom: 8 }}>Accounting Module</h1>
        <p style={{ fontSize: 14, color: T.textSec, marginBottom: 32, lineHeight: 1.6 }}>Financials are being polished. Coming soon.</p>
        <button onClick={() => setShowAccounting(false)} style={{ padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 600, color: T.text, background: T.blueDim, border: `1px solid rgba(59,130,246,0.25)`, cursor: "pointer", transition: "all 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(59,130,246,0.2)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = T.blueDim; }}>
          ← Return to Dashboard
        </button>
      </div>
    </Shell>
  );

  if (loading) return (
    <Shell>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: `3px solid ${T.border}`, borderTopColor: T.blue, margin: "0 auto 20px", animation: "spin 0.8s linear infinite" }} />
        <p style={{ fontSize: 14, color: T.textSec, fontWeight: 500 }}>Loading dashboard…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </Shell>
  );

  if (error) return (
    <Shell>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <p style={{ fontSize: 14, color: "#f87171", marginBottom: 20 }}>{error}</p>
        <button onClick={() => window.location.reload()} style={{ padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 600, color: T.text, background: T.blueDim, border: `1px solid rgba(59,130,246,0.25)`, cursor: "pointer" }}>
          Retry
        </button>
      </div>
    </Shell>
  );

  // ─── Derived values ───────────────────────────────────────────────────────
  const { totalItems, lowStockItems: lowStock, openPOs, closedPOs, totalPOValue: totalPOVal, openPRs, stockValue, totalProjects, completedProjects, inProgressProjects, upcomingProjects, okItems } = dashboardData;
  const fmtVal = (n) => n >= 1000 ? `S$${(n / 1000).toFixed(1)}k` : `S$${n.toFixed(0)}`;

  const initials = (user?.full_name || user?.username || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const ROLE_COLOR = { Admin: T.violet, Drafter: T.emerald, Purchaser: T.amber, Manager: T.blue, Supervisor: "#c084fc", "Factory In-charge": T.emerald };
  const roleColor = ROLE_COLOR[user?.role] || T.violet;

  // ─── KPI Cards ────────────────────────────────────────────────────────────
  const kpis = [
    {
      label: "Total Items",
      value: totalItems,
      sub: `${okItems} healthy`,
      accent: T.blue,
      accentDim: T.blueDim,
      icon: <Ico.box size={18} stroke={T.blue} />,
      trend: { type: "up", text: "in stock", color: T.emerald },
    },
    {
      label: "Open POs",
      value: openPOs,
      sub: `Value ${fmtVal(totalPOVal)}`,
      accent: T.emerald,
      accentDim: T.emeraldDim,
      icon: <Ico.clipboard size={18} stroke={T.emerald} />,
      trend: { type: "neutral", text: "active orders", color: T.textDim },
    },
    {
      label: "Low Stock",
      value: lowStock,
      sub: "Needs reorder",
      accent: T.red,
      accentDim: T.redDim,
      icon: <Ico.alertCircle size={18} />,
      trend: { type: "warn", text: "items critical", color: T.red },
    },
    {
      label: "Projects",
      value: totalProjects,
      sub: `${closedPOs} POs closed`,
      accent: T.violet,
      accentDim: T.violetDim,
      icon: <Ico.barChart size={18} stroke={T.violet} />,
      trend: { type: "up", text: "total", color: T.violet },
    },
  ];

  // ─── Module Cards ─────────────────────────────────────────────────────────
  const cards = [
    {
      id: "stock",
      icon: <Ico.box size={22} stroke="#fff" />,
      accent: T.blue,
      accentDim: T.blueDim,
      iconGradient: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
      title: "Inventory",
      badge: lowStock > 0 ? `${lowStock} low` : null,
      badgeColor: T.red,
      subtitle: "Material inventory & pricing",
      stats: [
        { label: "Total Items", value: totalItems },
        { label: "Low Stock", value: lowStock },
        { label: "Stock Value", value: fmtVal(stockValue) },
      ],
      cta: "View materials, pricing & inventory",
    },
    {
      id: "pr-followup",
      icon: <Ico.clipboard size={22} stroke="#fff" />,
      accent: T.violet,
      accentDim: T.violetDim,
      iconGradient: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
      title: "Procurement",
      badge: openPRs > 0 ? "Active" : null,
      badgeColor: T.emerald,
      subtitle: "Purchase requests & delivery status",
      stats: [
        { label: "Open PRs", value: openPRs },
        { label: "Open POs", value: openPOs },
      ],
      cta: "Track requests, approvals & delivery",
    },
    {
      id: "project-progress",
      icon: <Ico.barChart size={22} stroke="#fff" />,
      accent: T.emerald,
      accentDim: T.emeraldDim,
      iconGradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
      title: "Operation & Finance",
      badge: null,
      subtitle: "Project status & claim follow up",
      stats: [
        { label: "Completed", value: completedProjects },
        { label: "In Progress", value: inProgressProjects },
        { label: "Upcoming", value: upcomingProjects },
      ],
      cta: "Monitor projects & claim status",
    },
    {
      id: "accounting",
      icon: <Ico.coins size={22} stroke="#fff" />,
      accent: T.amber,
      accentDim: T.amberDim,
      iconGradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
      title: "Accounting",
      badge: "Soon",
      badgeColor: T.amber,
      subtitle: "Spend analysis & financials",
      stats: [],
      cta: "View spending & financial summary",
    },
  ];

  // ─── Dropdown items ───────────────────────────────────────────────────────
  const dropdownItems = [
    { icon: <Ico.user />, label: "Profile", sub: "View your account", action: () => setDropdownOpen(false) },
    { icon: <Ico.inbox />, label: "Inbox", sub: "Messages & notifications", action: () => setDropdownOpen(false) },
    { icon: <Ico.bell />, label: "Alerts", sub: "Low stock & overdue POs", action: () => setDropdownOpen(false) },
    { icon: <Ico.settings />, label: "Settings", sub: "System preferences", action: () => setDropdownOpen(false) },
    { icon: <Ico.key />, label: "Change Password", sub: "Update your password", action: () => { setDropdownOpen(false); navigate("/change-password"); } },
    { divider: true },
    { icon: <Ico.logOut />, label: "Sign Out", sub: "Log out of your account", action: handleSignOut, danger: true },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "Inter, system-ui, -apple-system, sans-serif", position: "relative" }}>

      {/* ── Ambient background glows ── */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-15%", left: "-5%", width: "45%", paddingBottom: "45%", borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 65%)", filter: "blur(80px)" }} />
        <div style={{ position: "absolute", bottom: "-20%", right: "-5%", width: "55%", paddingBottom: "55%", borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 65%)", filter: "blur(80px)" }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "60%", paddingBottom: "40%", borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.03) 0%, transparent 65%)", filter: "blur(100px)" }} />
      </div>

      {/* ── Top Navigation Bar ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100, height: 64,
        background: "rgba(15,23,42,0.8)", backdropFilter: "blur(16px) saturate(180%)", WebkitBackdropFilter: "blur(16px) saturate(180%)",
        borderBottom: `1px solid ${T.border}`,
        padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)", boxShadow: "0 0 20px rgba(99,102,241,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ico.layers size={18} stroke="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#6366f1", letterSpacing: "0.18em", textTransform: "uppercase" }}>Bond Build SG</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", lineHeight: 1.2 }}>Inventory Management</div>
          </div>
        </div>

        {/* Right Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Bell */}
          <button style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.amber, transition: "all 0.18s", position: "relative" }}
            onMouseEnter={e => { e.currentTarget.style.background = T.amberDim; e.currentTarget.style.borderColor = "rgba(245,158,11,0.25)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = T.border; }}
            title="Alerts">
            <Ico.bell size={16} />
            <span style={{ position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: "50%", background: T.red, border: `2px solid ${T.bg}` }} />
          </button>

          {/* Settings */}
          <button style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.textSec, transition: "all 0.18s" }}
            onMouseEnter={e => { e.currentTarget.style.background = T.card; e.currentTarget.style.color = T.text; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textSec; }}
            title="Settings">
            <Ico.settings size={16} />
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: T.border, margin: "0 4px" }} />

          {/* Avatar + Dropdown */}
          <div ref={dropdownRef} style={{ position: "relative" }}>
            <button onClick={() => setDropdownOpen(o => !o)}
              style={{ width: 36, height: 36, borderRadius: 10, background: dropdownOpen ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.12)", border: `1px solid ${dropdownOpen ? "rgba(99,102,241,0.4)" : "rgba(99,102,241,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#a5b4fc", cursor: "pointer", transition: "all 0.18s", letterSpacing: "0.02em" }}
              title={`${user?.full_name || user?.username} · ${user?.role}`}>
              {initials}
            </button>

            {dropdownOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 268, background: "rgba(15,23,42,0.95)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: `1px solid ${T.border}`, borderRadius: 16, boxShadow: "0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)", overflow: "hidden", zIndex: 200, animation: "ddIn 0.15s ease-out" }}>
                <style>{`@keyframes ddIn { from { opacity:0; transform:translateY(-8px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>

                {/* User header */}
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, background: "rgba(99,102,241,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #6366f1, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{initials}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>{user?.full_name || user?.username}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: roleColor, marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: roleColor, display: "inline-block" }} />
                        {user?.role}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div style={{ padding: "6px 0" }}>
                  {dropdownItems.map((item, i) => {
                    if (item.divider) return <div key={i} style={{ height: 1, background: T.border, margin: "6px 0" }} />;
                    return (
                      <button key={i} onClick={item.action}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", width: "100%", textAlign: "left", background: "transparent", border: "none", color: item.danger ? T.red : T.text, transition: "all 0.15s" }}
                        onMouseEnter={e => { e.currentTarget.style.background = item.danger ? "rgba(244,63,94,0.08)" : "rgba(255,255,255,0.04)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: item.danger ? "rgba(244,63,94,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${item.danger ? "rgba(244,63,94,0.2)" : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: item.danger ? T.red : T.textSec, flexShrink: 0 }}>
                          {item.icon}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
                          <div style={{ fontSize: 11, color: T.textDim, marginTop: 1 }}>{item.sub}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "44px 28px 96px", position: "relative", zIndex: 10 }}>

        {/* ── KPI Strip ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 44 }}>
          {kpis.map((k) => (
            <div key={k.label} style={{
              ...glass,
              borderRadius: 16,
              padding: "22px 22px 18px",
              position: "relative",
              overflow: "hidden",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 12px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(148,163,184,0.12)`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
              {/* Top accent bar */}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${k.accent}, transparent)`, borderRadius: "16px 16px 0 0" }} />

              {/* Icon chip + label row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textDim, letterSpacing: "0.08em", textTransform: "uppercase" }}>{k.label}</span>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: k.accentDim, border: `1px solid ${k.accent}30`, display: "flex", alignItems: "center", justifyContent: "center", color: k.accent }}>
                  {k.icon}
                </div>
              </div>

              {/* Value */}
              <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, color: T.text, marginBottom: 10 }}>{k.value}</div>

              {/* Sub + trend */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: T.textSec, fontWeight: 500 }}>{k.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Section Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.textDim, letterSpacing: "0.14em", textTransform: "uppercase" }}>System Modules</span>
          <div style={{ flex: 1, height: 1, background: T.border }} />
        </div>

        {/* ── Module Cards Grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {cards.map((card) => (
            <button key={card.id}
              onClick={() => card.id === "accounting" ? setShowAccounting(true) : navigate(`/${card.id}`)}
              style={{
                ...glass,
                borderRadius: 20,
                overflow: "hidden",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                transition: "all 0.22s ease",
                position: "relative",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.border = `1px solid ${card.accent}40`;
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = `0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px ${card.accent}20, inset 0 1px 0 rgba(255,255,255,0.06)`;
                e.currentTarget.style.background = `rgba(30,41,59,0.7)`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.border = `1px solid ${T.border}`;
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.background = T.card;
              }}>

              {/* Subtle gradient wash */}
              <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at top left, ${card.accent}08 0%, transparent 60%)`, pointerEvents: "none" }} />

              {/* ── Card Header ── */}
              <div style={{ padding: "24px 24px 20px", display: "flex", alignItems: "flex-start", gap: 16, position: "relative" }}>
                {/* Icon */}
                <div style={{ width: 48, height: 48, borderRadius: 14, background: card.iconGradient, boxShadow: `0 6px 20px ${card.accent}35`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {card.icon}
                </div>

                {/* Title + badge + subtitle */}
                <div style={{ flex: 1, paddingTop: 2 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>{card.title}</span>
                    {card.badge && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: `${card.badgeColor}18`, color: card.badgeColor, border: `1px solid ${card.badgeColor}35`, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {card.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: T.textSec, fontWeight: 400, lineHeight: 1.4 }}>{card.subtitle}</div>
                </div>
              </div>

              {/* ── Stats Row ── */}
              {card.stats.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${card.stats.length}, 1fr)`, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, background: "rgba(0,0,0,0.12)" }}>
                  {card.stats.map((st, i) => (
                    <div key={st.label} style={{ padding: "14px 20px", borderRight: i < card.stats.length - 1 ? `1px solid ${T.border}` : "none" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.textDim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>{st.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>{st.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── CTA Footer ── */}
              <div style={{ padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", position: "relative" }}>
                {/* Accent line at top of footer */}
                <div style={{ position: "absolute", top: 0, left: 0, width: "35%", height: 1, background: `linear-gradient(90deg, ${card.accent}60, transparent)` }} />
                <span style={{ fontSize: 12, color: T.textDim, fontWeight: 500 }}>{card.cta}</span>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `${card.accent}15`, border: `1px solid ${card.accent}30`, display: "flex", alignItems: "center", justifyContent: "center", color: card.accent, transition: "all 0.2s", flexShrink: 0 }}>
                  <Ico.arrowRight size={13} />
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{ textAlign: "center", marginTop: 64, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ height: 1, flex: 1, maxWidth: 120, background: T.border }} />
          <p style={{ fontSize: 11, color: T.textDim, fontWeight: 500, letterSpacing: "0.04em" }}>
            Bond Build SG · Inventory Management System · Powered by Yazhsey Technologies Pte Ltd
          </p>
          <div style={{ height: 1, flex: 1, maxWidth: 120, background: T.border }} />
        </div>
      </main>
    </div>
  );
}
