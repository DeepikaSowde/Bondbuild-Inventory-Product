// frontend/src/App.jsx
// Fixed: Using useLocation() hook for proper sidebar visibility on navigation

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Sidebar from "./components/Sidebar";
import { AdminRoute } from "./components/AdminRoute";
import AlertsInbox from "./components/AlertsInbox";
import api from "./services/api";
import { api as inboxApi } from "./lib/api";

// Pages
import LoginPage from "./pages/auth/LoginPage";
import HomePage from "./pages/HomePage";
import SetupPage from "./pages/Setup/InventoryImport";
import StockPage from "./pages/StockPage";
import UserManagement from "./pages/UserManagement";
import SetupDashboard from "./pages/Setup/SetupDashboard";
import ProjectProgressModule from "./pages/ProjectProgressModule";
import Procurement from "./pages/Procurement";
import Dashboard from "./pages/Dashboard";
import ChangePassword from "./pages/ChangePassword";

// Placeholder pages (create these later)

const ProjectProgress = () => (
  <div className="p-8">
    <h1>🏗️ Project Progress</h1>
  </div>
);
const Accounting = () => (
  <div className="p-8">
    <h1>💰 Accounting</h1>
  </div>
);

// Simple route wrapper for authenticated users
function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

// Module-level access guard — checks pr_po_permissions flag for the current role
function ModuleGuard({ permKey, moduleName, children }) {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    if (!user) { setAllowed(false); return; }
    if (user.role === "Admin") { setAllowed(true); return; }
    api.get("/pr-po-permissions/me/effective")
      .then((res) => {
        const perms = res.data.permissions || {};
        // if the key is missing from DB yet, default to allowed
        setAllowed(perms[permKey] !== false);
      })
      .catch(() => setAllowed(true));
  }, [user, permKey]);

  if (allowed === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-6">
        <div className="bg-white rounded-2xl shadow-md px-10 py-12 max-w-sm text-center border border-[#E5E7EB]">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-black text-[#1E1B4B] mb-2">Access Restricted</h2>
          <p className="text-[13px] text-gray-500 leading-relaxed">
            You don't have permission to view the{" "}
            <span className="font-bold text-[#6366F1]">{moduleName}</span> module.
          </p>
          <p className="text-[12px] text-gray-400 mt-2">
            Contact your administrator to request access.
          </p>
        </div>
      </div>
    );
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupDashboard />} />
      {/* Protected routes */}
      
      <Route
        path="/change-password"
        element={
          <PrivateRoute>
            <ChangePassword />
          </PrivateRoute>
        }
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <HomePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/stock"
        element={
          <PrivateRoute>
            <StockPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/pr-followup"
        element={
          <PrivateRoute>
            <Procurement />
          </PrivateRoute>
        }
      />
      <Route
        path="/project-progress"
        element={
          <PrivateRoute>
            <ModuleGuard permKey="see_operation_finance" moduleName="Operation and Finance">
              <ProjectProgressModule />
            </ModuleGuard>
          </PrivateRoute>
        }
      />
      <Route
        path="/accounting"
        element={
          <PrivateRoute>
            <ModuleGuard permKey="see_accounting" moduleName="Accounting">
              <Accounting />
            </ModuleGuard>
          </PrivateRoute>
        }
      />
      {/* ADMIN ONLY ROUTES */}
      <Route
        path="/users"
        element={
          <AdminRoute>
            <UserManagement />
          </AdminRoute>
        }
      />
      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
function AppContent() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  // ── Alerts / notifications inbox (mail-style) ──
  // Feeds the Sidebar "Alerts" badge and the slide-in inbox. Same feed the
  // backend SLA sweep writes to; polled so new reminders surface without reload.
  const [notifications, setNotifications] = useState([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const loadInbox = () => {
    inboxApi.notifications().then((rows) => setNotifications(Array.isArray(rows) ? rows : [])).catch(() => {});
  };
  useEffect(() => {
    if (!user) { setNotifications([]); return; }
    loadInbox();
    const t = setInterval(loadInbox, 60000); // refresh every minute
    return () => clearInterval(t);
  }, [user]);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Pages without sidebar
  const isAuthPage = pathname === "/login" || pathname === "/setup";
  const isHomePage = pathname === "/";

  // Show sidebar only on feature pages (Stock, Dashboard, etc)
  // HIDE on: Login, Setup, HomePage
  const showSidebar = !isAuthPage && !isHomePage && user;

  // Derive active tab from current route
  const activeTab = pathname === "/HomePage" ? "home" : pathname.slice(1);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar - NOW PASSES currentUser PROP! */}
      {showSidebar && (
        <Sidebar
          currentUser={user}
          alertCount={unreadCount}
          inboxCount={unreadCount}
          setShowAlerts={setShowAlerts}
          tab={activeTab}
          setTab={() => {}}
          showHome={false}
          setShowHome={() => {}}
        />
      )}

      {/* Mail-style alerts inbox (slide-in) */}
      <AlertsInbox
        open={showAlerts}
        onClose={() => setShowAlerts(false)}
        items={notifications}
        onChanged={loadInbox}
      />

      {/* Main content area - has left margin to account for sidebar */}
      <main
        className="min-w-0"
        style={
          showSidebar
            ? { marginLeft: "14rem", width: "calc(100% - 14rem)" }
            : { width: "100%" }
        }
      >
        <AppRoutes />
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
