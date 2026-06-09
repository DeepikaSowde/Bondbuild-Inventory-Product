// frontend/src/components/Sidebar.jsx
// Sidebar navigation - NO horizontal scroll

import { useNavigate } from "react-router-dom";

const ROLE_COLORS = {
  Admin: "bg-indigo-500/20 border-indigo-500 text-indigo-400",
  Drafter: "bg-emerald-500/20 border-emerald-500 text-emerald-400",
  Purchaser: "bg-amber-500/20 border-amber-500 text-amber-400",
  Manager: "bg-blue-500/20 border-blue-500 text-blue-400",
  Supervisor: "bg-purple-500/20 border-purple-500 text-purple-400",
  "Factory In-charge": "bg-emerald-500/20 border-emerald-500 text-emerald-400",
};

const ROLE_ICON = {
  Admin: "👑",
  Drafter: "✏️",
  Purchaser: "🛒",
  Manager: "✔️",
  Supervisor: "👷",
  "Factory In-charge": "🏭",
};

const ROLE_BADGE_COLOR = {
  Admin: "bg-indigo-500",
  Drafter: "bg-emerald-500",
  Purchaser: "bg-amber-500",
  Manager: "bg-blue-500",
  Supervisor: "bg-purple-500",
  "Factory In-charge": "bg-emerald-500",
};

export default function Sidebar({
  tab = "home",
  setTab = () => {},
  setShowHome = () => {},
  showHome = false,
  currentUser = { name: "User", role: "Guest" },
  alertCount = 0,
  inboxCount = 0,
  setShowAlerts = () => {},
}) {
  const navigate = useNavigate();

  // Safely get user info
  const userName = currentUser?.name || "User";
  const userRole = currentUser?.role || "Guest";

  const handleNavigation = (path, tabId) => {
    navigate(path);
    if (setTab) setTab(tabId);
    if (setShowHome) setShowHome(false);
  };

  const isActive = (tabId) => {
    return tab === tabId && !showHome;
  };

  // NavItem Component
  const NavItem = ({ id, icon, label, path, badge, badgeColor, sub }) => {
    const active = isActive(id);

    return (
      <button
        onClick={() => {
          if (path) handleNavigation(path, id);
          else {
            if (setTab) setTab(id);
            if (setShowHome) setShowHome(false);
          }
        }}
        className={`
          w-full flex items-center gap-3 rounded-lg border-l-2 transition-all duration-150
          ${sub ? "px-4 py-2 text-xs" : "px-3 py-2 text-sm"}
          ${
            active
              ? "bg-indigo-500/20 border-indigo-500 text-white font-bold"
              : "border-transparent bg-transparent text-gray-400 hover:text-indigo-300 hover:bg-white/5 font-medium"
          }
          ${sub ? "ml-6" : ""}
        `}
      >
        <span className={`flex-shrink-0 ${sub ? "text-sm" : "text-base"}`}>
          {icon}
        </span>
        <span className="flex-1 text-left truncate">{label}</span>
        {badge > 0 && (
          <span
            className={`${badgeColor || "bg-indigo-500"} text-white text-xs font-bold rounded-full px-2 py-0.5 flex-shrink-0`}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  // Section Label Component
  const SectionLabel = ({ label }) => (
    <div className="text-xs font-bold text-gray-500 uppercase tracking-widest px-4 pt-3 pb-2">
      {label}
    </div>
  );

  // Divider Component
  const Divider = () => <div className="h-px bg-white/10 my-2" />;

  // Get role colors safely
  const getRoleColors = () => {
    return (
      ROLE_COLORS[userRole] ||
      "bg-indigo-500/20 border-indigo-500 text-indigo-400"
    );
  };

  const getRoleIcon = () => {
    return ROLE_ICON[userRole] || "👤";
  };

  return (
    <div className="fixed left-0 top-0 bottom-0 w-56 bg-gray-900 border-r border-white/10 flex flex-col z-50 overflow-hidden">
      {/* ── Logo Section ── */}
      <div className="px-4 py-4 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-lg flex-shrink-0">
            📦
          </div>
          <div>
            <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
              Bond Build SG
            </div>
            <div className="text-sm font-bold text-white leading-tight">
              Inventory
              <br />
              Management
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable Nav Area (Vertical only, NO horizontal) ── */}
      <div className="flex-1 px-2 py-2 space-y-1 overflow-y-auto overflow-x-hidden">
        {/* ── SECTION 1: MAIN ── */}
        <SectionLabel label="Main" />

        {/* Home */}
        <NavItem id="home" icon="🏠" label="Home" />

        {/* Dashboard */}
        <NavItem id="dashboard" icon="📊" label="Dashboard" path="/dashboard" />

        {/* ── SECTION 2: MODULES ── */}
        <SectionLabel label=" " />

        {/* Inventory */}
        <NavItem id="stock" icon="📦" label="Inventory" path="/stock" sub />

        {/* Procurement */}
        <NavItem
          id="pr-followup"
          icon="📋"
          label="Procurement"
          path="/pr-followup"
          sub
        />

        {/* Operation and Finance */}
        <NavItem
          id="project-progress"
          icon="🏗️"
          label="Operation and Finance"
          path="/project-progress"
          sub
        />

        {/* Accounting */}
        <NavItem
          id="accounting"
          icon="💰"
          label="Accounting"
          path="/accounting"
          sub
        />

        <Divider />

        {/* ── SECTION 3: NOTIFICATIONS ── */}
        <SectionLabel label="Notifications" />

        {/* Alerts */}
        <button
          onClick={() => setShowAlerts?.(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-indigo-300 hover:bg-white/5 transition-all duration-150"
        >
          <span className="text-base flex-shrink-0">🔔</span>
          <span className="flex-1 text-left truncate">Alerts</span>
          {alertCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 flex-shrink-0">
              {alertCount}
            </span>
          )}
        </button>

        {/* Inbox */}
        <NavItem
          id="inbox"
          icon="📬"
          label="Inbox"
          badge={inboxCount}
          badgeColor="bg-indigo-500"
        />

        <Divider />

        {/* ── SECTION 4: USER ── */}
        <SectionLabel label="User" />

        {/* User Badge */}
        <div
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${getRoleColors()}`}
        >
          <div
            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm flex-shrink-0 ${getRoleColors()}`}
          >
            {getRoleIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-white truncate">
              {userName}
            </div>
            <div className="text-xs font-semibold mt-0.5 text-gray-300 truncate">
              {userRole}
            </div>
          </div>
        </div>

        {/* User Management - Admin Only */}
        {userRole === "Admin" && (
          <NavItem id="users" icon="👥" label="User Management" path="/users" />
        )}

        {/* Sign Out */}
        <button
          onClick={() => {
            navigate("/login");
            if (setShowHome) setShowHome(true);
          }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border-l-2 border-red-500/30 bg-red-500/10 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition-all duration-150 mt-2"
        >
          <span className="text-base flex-shrink-0">🚪</span>
          <span className="truncate">Sign Out</span>
        </button>
      </div>

      {/* ── Version Footer ── */}
      <div className="px-4 py-3 border-t border-white/10 flex-shrink-0 text-xs text-gray-600">
        Jan 2026 · v2.0
      </div>
    </div>
  );
}
