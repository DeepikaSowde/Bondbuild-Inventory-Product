// frontend/src/pages/HomePage.jsx
// InventoryOpz — Bond Build SG | Yazhsey Technologies Pte Ltd
// Upgraded Visuals: Midnight Navy with Accent-Tinted Contrast Boxes
// UPDATED: Now fetches real data from Database

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

export default function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showAccounting, setShowAccounting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // ========================
  // STATE FOR DATABASE DATA
  // ========================
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
  });

  // ========================
  // FETCH DATA ON MOUNT
  // ========================
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError("");

        // Fetch inventory summary from backend
        const inventoryResponse = await api.get("/inventory/summary");
        console.log("Inventory Summary:", inventoryResponse.data);

        // Extract data from response
        const invData = inventoryResponse.data;

        // Fetch PO data (if endpoint exists)
        let poData = { openPOs: 0, closedPOs: 0, totalPOValue: 0 };
        try {
          const poResponse = await api.get("/purchase-orders/summary");
          poData = poResponse.data;
        } catch (err) {
          console.log("PO endpoint not available yet, using defaults");
        }

        // Fetch PR data (if endpoint exists)
        let prData = { openPRs: 0 };
        try {
          const prResponse = await api.get("/material-requests/summary");
          prData = prResponse.data;
        } catch (err) {
          console.log("PR endpoint not available yet, using defaults");
        }

        // Update state with fetched data
        setDashboardData({
          totalItems: invData.total_items || 0,
          totalPieces: invData.total_pieces || 0,
          okItems: invData.ok_items || 0,
          lowStockItems: invData.low_stock_items || 0,
          outOfStockItems: invData.out_of_stock_items || 0,
          stockValue: invData.total_value || 0,
          openPOs: poData.openPOs || poData.open_pos || 0,
          closedPOs: poData.closedPOs || poData.closed_pos || 0,
          totalPOValue: poData.totalPOValue || poData.total_po_value || 0,
          openPRs: prData.openPRs || prData.open_prs || 0,
          totalProjects: 0, // Will implement if needed
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

  // Close dropdown on outside click
  useEffect(() => {
    const fn = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0B0E14",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ fontSize: "18px", letterSpacing: "1px", color: "#818cf8" }}>
          Loading Workspace...
        </p>
      </div>
    );
  }

  // Handle logout
  const handleSignOut = async () => {
    setDropdownOpen(false);
    await logout();
    navigate("/login");
  };

  if (showAccounting) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0B0E14",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "56px",
              marginBottom: "20px",
              filter: "drop-shadow(0 0 20px rgba(245, 158, 11, 0.4))",
            }}
          >
            ⏳
          </div>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: "900",
              marginBottom: "8px",
              color: "#fff",
              letterSpacing: "-0.5px",
            }}
          >
            Accounting Module
          </h1>
          <p
            style={{ fontSize: "15px", color: "#8B9BB4", marginBottom: "32px" }}
          >
            Financials are being polished. Coming soon.
          </p>
          <button
            onClick={() => setShowAccounting(false)}
            style={{
              padding: "10px 24px",
              borderRadius: "8px",
              fontSize: "14px",
              color: "#fff",
              fontWeight: "bold",
              background: "rgba(99, 102, 241, 0.15)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(99, 102, 241, 0.25)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "rgba(99, 102, 241, 0.15)")
            }
          >
            ← Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ========================
  // LOADING STATE
  // ========================
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0B0E14",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "48px",
              marginBottom: "20px",
              animation: "spin 1s linear infinite",
            }}
          >
            ⚙️
          </div>
          <p style={{ fontSize: "16px", color: "#818cf8" }}>
            Loading dashboard...
          </p>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ========================
  // ERROR STATE
  // ========================
  if (error) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0B0E14",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "20px" }}>⚠️</div>
          <p style={{ fontSize: "16px", color: "#f87171" }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "20px",
              padding: "10px 24px",
              borderRadius: "8px",
              fontSize: "14px",
              color: "#fff",
              fontWeight: "bold",
              background: "rgba(99, 102, 241, 0.15)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ========================
  // DERIVED VALUES FROM DATA
  // ========================
  const totalItems = dashboardData.totalItems;
  const lowStock = dashboardData.lowStockItems;
  const openPOs = dashboardData.openPOs;
  const closedPOs = dashboardData.closedPOs;
  const totalPOVal = dashboardData.totalPOValue;
  const openPRs = dashboardData.openPRs;
  const stockValue = dashboardData.stockValue;
  const totalProjects = dashboardData.totalProjects;
  const fmtVal = (n) =>
    n >= 1000 ? `S$${(n / 1000).toFixed(1)}k` : `S$${n.toFixed(0)}`;

  const initials = (user?.full_name || user?.username || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const ROLE_COLOR = {
    Admin: "#818cf8",
    Drafter: "#34d399",
    Purchaser: "#fbbf24",
    Manager: "#60a5fa",
    Supervisor: "#a78bfa",
    "Factory In-charge": "#34d399",
  };
  const roleColor = ROLE_COLOR[user?.role] || "#818cf8";

  // ========================
  // KPI CARDS
  // ========================
  const kpis = [
    {
      label: "TOTAL ITEMS",
      value: totalItems,
      sub: `↑ ${dashboardData.okItems} in stock`,
      color: "#818cf8",
    },
    {
      label: "OPEN POS",
      value: openPOs,
      sub: `PO value ${fmtVal(totalPOVal)}`,
      color: "#10b981",
    },
    {
      label: "LOW STOCK",
      value: lowStock,
      sub: "Needs reorder",
      color: "#f87171",
    },
    {
      label: "PROJECTS",
      value: totalProjects,
      sub: `${closedPOs} POs closed`,
      color: "#c084fc",
    },
  ];

  // ========================
  // MODULE CARDS
  // ========================
  const cards = [
    {
      id: "stock",
      icon: "📦",
      accentColor: "#3b82f6",
      title: "Inventory",
      badge: lowStock > 0 ? `${lowStock} low` : null,
      badgeColor: "#f87171",
      subtitle: "Material inventory & pricing",
      stats: [
        { label: "TOTAL ITEMS", value: totalItems },
        { label: "LOW STOCK", value: lowStock },
        { label: "STOCK VALUE", value: fmtVal(stockValue) },
      ],
      cta: "View materials, pricing & inventory",
    },
    {
      id: "pr-followup",
      icon: "📋",
      accentColor: "#a855f7",
      title: "Procurement",
      badge: openPRs > 0 ? "Active" : null,
      badgeColor: "#34d399",
      subtitle: "Purchase requests & delivery status",
      stats: [
        { label: "OPEN PRS", value: openPRs },
        { label: "OPEN POS", value: openPOs },
        { label: "PO VALUE", value: fmtVal(totalPOVal) },
      ],
      cta: "Track requests, approvals & delivery",
    },
    {
      id: "project-progress",
      icon: "🏗️",
      accentColor: "#10b981",
      title: "Operation & Finance",
      badge: null,
      subtitle: "Project status & claim follow up",
      stats: [
        { label: "PROJECTS", value: totalProjects },
        { label: "CLOSED POS", value: closedPOs },
        { label: "OPEN POS", value: openPOs },
      ],
      cta: "Monitor projects & claim status",
    },
    {
      id: "accounting",
      icon: "💰",
      accentColor: "#f59e0b",
      title: "Accounting",
      badge: "Soon",
      badgeColor: "#fbbf24",
      subtitle: "Spend analysis & financials",
      stats: [
        { label: "TOTAL POS", value: openPOs + closedPOs },
        { label: "CLOSED", value: closedPOs },
        { label: "PO VALUE", value: fmtVal(totalPOVal) },
      ],
      cta: "View spending & financial summary",
    },
  ];

  const dropdownItems = [
    {
      icon: "👤",
      label: "Profile",
      sub: "View your account",
      action: () => setDropdownOpen(false),
    },
    {
      icon: "📬",
      label: "Inbox",
      sub: "Messages & notifications",
      action: () => setDropdownOpen(false),
    },
    {
      icon: "🔔",
      label: "Alerts",
      sub: "Low stock & overdue POs",
      action: () => setDropdownOpen(false),
    },
    {
      icon: "⚙️",
      label: "Settings",
      sub: "System preferences",
      action: () => setDropdownOpen(false),
    },
    { divider: true },
    {
      icon: "🚪",
      label: "Sign Out",
      sub: "Log out of your account",
      action: handleSignOut,
      danger: true,
    },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0B0E14",
        color: "white",
        position: "relative",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Subtle Background glow orbs */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
          zIndex: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "10%",
            left: "-10%",
            width: "50%",
            paddingBottom: "50%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 60%)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-20%",
            right: "-10%",
            width: "60%",
            paddingBottom: "60%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(139,92,246,0.04) 0%, transparent 60%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      {/* ── Sticky Top Bar ── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "rgba(11, 14, 20, 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid #2E3B52",
          padding: "0 32px",
          height: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            📦
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: "800",
                color: "#818cf8",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              Bond Build SG
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: "#fff",
                letterSpacing: "-0.02em",
                marginTop: "2px",
              }}
            >
              Inventory Management
            </div>
          </div>
        </div>

        {/* Right icons */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "1px solid #2E3B52",
              background: "#161D2C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 16,
              color: "#f59e0b",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#1E293B";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#161D2C";
            }}
            title="Alerts"
          >
            🔔
          </button>

          <button
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "1px solid #2E3B52",
              background: "#161D2C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 16,
              color: "#8B9BB4",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#1E293B";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#161D2C";
            }}
            title="Settings"
          >
            ⚙️
          </button>

          {/* Avatar + dropdown */}
          <div ref={dropdownRef} style={{ position: "relative" }}>
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: dropdownOpen ? "#4f46e5" : "#6366f1",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: "800",
                color: "white",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              title={`${user?.full_name || user?.username} · ${user?.role}`}
            >
              {initials}
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 12px)",
                  right: 0,
                  width: 260,
                  background: "#161D2C",
                  border: "1px solid #2E3B52",
                  borderRadius: 16,
                  boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
                  overflow: "hidden",
                  zIndex: 200,
                  animation: "fadeIn 0.15s ease-out",
                }}
              >
                <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }`}</style>

                {/* User header */}
                <div
                  style={{
                    padding: "16px",
                    borderBottom: "1px solid #2E3B52",
                    background: "rgba(99,102,241,0.05)",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: "#6366f1",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: "900",
                        color: "#fff",
                        flexShrink: 0,
                      }}
                    >
                      {initials}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: "800",
                          color: "#f8fafc",
                          lineHeight: 1.2,
                        }}
                      >
                        {user?.full_name || user?.username}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: roleColor,
                          marginTop: 4,
                        }}
                      >
                        {user?.role}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div style={{ padding: "8px 0" }}>
                  {dropdownItems.map((item, i) => {
                    if (item.divider)
                      return (
                        <div
                          key={i}
                          style={{
                            height: 1,
                            background: "#2E3B52",
                            margin: "8px 0",
                          }}
                        />
                      );
                    return (
                      <button
                        key={i}
                        onClick={item.action}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 16px",
                          cursor: "pointer",
                          width: "100%",
                          textAlign: "left",
                          background: "transparent",
                          border: "none",
                          color: "white",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = item.danger
                            ? "rgba(239,68,68,0.1)"
                            : "#1E293B";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            background: item.danger
                              ? "rgba(239,68,68,0.1)"
                              : "rgba(255,255,255,0.03)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 16,
                            flexShrink: 0,
                          }}
                        >
                          {item.icon}
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: "600",
                              color: item.danger ? "#f87171" : "#e2e8f0",
                            }}
                          >
                            {item.label}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#8B9BB4",
                              marginTop: 2,
                            }}
                          >
                            {item.sub}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Scrollable Content ── */}
      <div
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          padding: "48px 24px 100px",
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* KPI Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 16,
            marginBottom: 48,
          }}
        >
          {kpis.map((k) => (
            <div
              key={k.label}
              style={{
                background: "#161D2C",
                border: "1px solid #2E3B52",
                borderRadius: 16,
                padding: "24px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  color: "#6B7A99",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 12,
                }}
              >
                {k.label}
              </div>
              <div
                style={{
                  fontSize: 38,
                  fontWeight: "900",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                  marginBottom: 8,
                  color: k.color,
                }}
              >
                {k.value}
              </div>
              <div
                style={{ fontSize: 12, color: "#8B9BB4", fontWeight: "500" }}
              >
                {k.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Section label */}
        <div
          style={{
            fontSize: 12,
            fontWeight: "800",
            color: "#6B7A99",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          System Modules
        </div>

        {/* Cards */}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
        >
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() =>
                card.id === "accounting"
                  ? setShowAccounting(true)
                  : navigate(`/${card.id}`)
              }
              style={{
                background: `linear-gradient(145deg, ${card.accentColor}0F 0%, #161D2C 100%)`,
                border: "1px solid #2E3B52",
                borderRadius: 20,
                overflow: "hidden",
                cursor: "pointer",
                transition: "all 0.2s ease",
                textAlign: "left",
                position: "relative",
                display: "flex",
                flexDirection: "column",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.border = `1px solid ${card.accentColor}77`;
                e.currentTarget.style.transform = `translateY(-3px)`;
                e.currentTarget.style.boxShadow = `0 12px 24px rgba(0,0,0,0.3)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.border = "1px solid #2E3B52";
                e.currentTarget.style.transform = `none`;
                e.currentTarget.style.boxShadow = `none`;
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: "24px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 16,
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: `rgba(255,255,255,0.03)`,
                    border: `1px solid rgba(255,255,255,0.08)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    flexShrink: 0,
                  }}
                >
                  {card.icon}
                </div>
                <div style={{ flex: 1, paddingTop: 2 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: "800",
                        color: "#fff",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {card.title}
                    </span>
                    {card.badge && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: "800",
                          padding: "4px 10px",
                          borderRadius: 24,
                          background: card.badgeColor + "22",
                          color: card.badgeColor,
                          border: `1px solid ${card.badgeColor}55`,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {card.badge}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "#8B9BB4",
                      fontWeight: "500",
                    }}
                  >
                    {card.subtitle}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: "rgba(0,0,0,0.15)",
                }}
              >
                {card.stats.map((st, i) => (
                  <div
                    key={st.label}
                    style={{
                      padding: "16px 24px",
                      borderRight:
                        i < card.stats.length - 1
                          ? "1px solid rgba(255,255,255,0.04)"
                          : "none",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        color: "#6B7A99",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        marginBottom: 6,
                      }}
                    >
                      {st.label}
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: "800",
                        letterSpacing: "-0.02em",
                        color: "#fff",
                      }}
                    >
                      {st.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer CTA */}
              <div
                style={{
                  position: "relative",
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -1,
                    left: 0,
                    height: 2,
                    width: "40%",
                    background: `linear-gradient(90deg, ${card.accentColor}, transparent)`,
                  }}
                />
                <div
                  style={{
                    padding: "16px 24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "#8B9BB4",
                      fontWeight: "500",
                    }}
                  >
                    {card.cta}
                  </span>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.05)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      color: "#8B9BB4",
                    }}
                  >
                    →
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            textAlign: "center",
            marginTop: 64,
            fontSize: 12,
            color: "#475569",
            fontWeight: "500",
            letterSpacing: "0.02em",
          }}
        >
          Bond Build SG · Inventory Management System · Powered by Yazhsey
          Technologies Pte Ltd
        </div>
      </div>
    </div>
  );
}
