// frontend/src/components/AdminRoute.jsx
// Protected route - Only Admin can access

import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  // While checking auth status
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-4">⚙️</div>
          <p className="text-gray-600 text-lg">Verifying access...</p>
        </div>
      </div>
    );
  }

  // Not logged in - redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Not Admin - redirect to home
  if (user.role !== "Admin") {
    return <Navigate to="/" replace />;
  }

  // Admin - allow access
  return children;
}
