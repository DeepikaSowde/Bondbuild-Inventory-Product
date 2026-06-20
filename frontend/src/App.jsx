// frontend/src/App.jsx
// Fixed: Using useLocation() hook for proper sidebar visibility on navigation

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Sidebar from "./components/Sidebar";
import { AdminRoute } from "./components/AdminRoute";

// Pages
import LoginPage from "./pages/auth/LoginPage";
import HomePage from "./pages/HomePage";
import SetupPage from "./pages/Setup/InventoryImport";
import StockPage from "./pages/StockPage";
import UserManagement from "./pages/UserManagement";
import SetupDashboard from "./pages/Setup/SetupDashboard";
import ProjectProgressModule from "./pages/ProjectProgressModule";
import Procurement from "./pages/Procurement";
// Placeholder pages (create these later)
const Dashboard = () => (
  <div className="p-8">
    <h1>📊 Dashboard</h1>
  </div>
);

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

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />

      <Route path="/setup" element={<SetupDashboard />} />

      <Route path="/project-progress" element={<ProjectProgressModule />} />

      {/* Protected routes */}
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
            <ProjectProgress />
          </PrivateRoute>
        }
      />

      <Route
        path="/accounting"
        element={
          <PrivateRoute>
            <Accounting />
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

  // Pages without sidebar
  const isAuthPage = pathname === "/login" || pathname === "/setup";
  const isHomePage = pathname === "/";

  // Show sidebar only on feature pages (Stock, Dashboard, etc)
  // HIDE on: Login, Setup, HomePage
  const showSidebar = !isAuthPage && !isHomePage && user;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar - NOW PASSES currentUser PROP! */}
      {showSidebar && (
        <Sidebar
          currentUser={user}
          alertCount={0}
          inboxCount={0}
          setShowAlerts={() => {}}
          tab="home"
          setTab={() => {}}
          showHome={false}
          setShowHome={() => {}}
        />
      )}

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
