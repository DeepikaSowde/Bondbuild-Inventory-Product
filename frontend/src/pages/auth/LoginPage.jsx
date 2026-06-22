// frontend/src/pages/auth/LoginPage.jsx
// InventoryOpz — Bond Build SG | Yazhsey Technologies Pte Ltd
// Tailwind CSS v4 — No inline styles

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!username || !password) {
      setError("Enter username and password.");
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
      setError("");
      navigate("/home");
    } catch (err) {
      setError(err?.response?.data?.message || "Invalid username or password.");
      setLoading(false);
    }
  };

  const roles = [
    {
      role: "Drafter / Purchaser",
      icon: "🛒",
      color: "from-green-500 to-transparent",
      desc: "PRs, POs & Suppliers",
    },
    {
      role: "Manager",
      icon: "📋",
      color: "from-amber-500 to-transparent",
      desc: "Approve PRs, manage orders",
    },
    {
      role: "Supervisor / Factory In-charge",
      icon: "🏭",
      color: "from-blue-500 to-transparent",
      desc: "Stock & Issue control",
    },
    {
      role: "Admin",
      icon: "👑",
      color: "from-indigo-500 to-transparent",
      desc: "Full system access",
    },
  ];

  return (
    <div className="flex w-screen h-screen font-sans overflow-hidden bg-[#0F0E1A]">
      {/* ── LEFT PANEL ── */}
      <div className="w-1/2 h-full bg-gradient-to-br from-[#1a1744] via-[#251d6b] to-[#1a1744] flex flex-col justify-center px-11 py-8 relative overflow-hidden">
        {/* Radial glow overlays */}
        <div
          className="absolute top-[-20%] right-[-15%] w-3/5 aspect-square rounded-full bg-radial-gradient pointer-events-none opacity-20"
          style={{
            background:
              "radial-gradient(circle,rgba(99,102,241,.25) 0%,transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-[-15%] left-[-10%] w-5/12 aspect-square rounded-full pointer-events-none opacity-15"
          style={{
            background:
              "radial-gradient(circle,rgba(129,140,248,.15) 0%,transparent 70%)",
          }}
        />

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-7 relative z-10">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-400 flex items-center justify-center text-lg flex-shrink-0">
            📦
          </div>
          <div>
            <div className="text-xs font-black text-white tracking-wider uppercase">
              Bond Build SG
            </div>
            <div className="text-[9px] text-indigo-400 tracking-widest uppercase mt-0.5">
              Inventory System
            </div>
          </div>
        </div>

        {/* Hero Section */}
        <div className="mb-6 relative z-10">
          <div className="text-[9px] text-indigo-400 font-bold tracking-[0.2em] uppercase mb-2.5">
            Welcome to
          </div>
          <div className="text-4xl font-black text-white leading-tight tracking-tighter mb-2.5">
            InventoryOpz
            <br />
          </div>
          <div className="text-xs text-indigo-200 leading-relaxed max-w-xs">
            Track stock, manage POs, coordinate between site and factory.
          </div>
        </div>

        {/* System Roles Grid */}
        <div className="relative z-10">
          <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider mb-2">
            System Roles
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {roles.map((r) => (
              <div
                key={r.role}
                className="bg-white/5 border border-white/10 rounded-lg p-3 cursor-default hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{r.icon}</span>
                  <span className="text-xs font-bold text-white">{r.role}</span>
                </div>
                <div className="text-[9px] text-indigo-200 mb-2">{r.desc}</div>
                <div
                  className={`h-0.5 w-10 rounded-full bg-gradient-to-r ${r.color}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="w-1/2 h-full bg-[#0F0E1A] flex items-center justify-center px-11">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-black text-white tracking-tighter mb-1">
              Sign In
            </h1>
            <p className="text-xs text-gray-500">
              Enter your credentials to continue
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
              <span className="text-red-500">⚠️</span>
              <span className="text-xs text-red-300">{error}</span>
            </div>
          )}

          {/* Username Field */}
          <div className="mb-3">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="your.username"
              className="w-full px-3.5 py-2.75 bg-white/6 border border-white/12 rounded-lg text-sm text-white placeholder-gray-600 outline-none transition-all focus:border-indigo-500 focus:bg-indigo-500/10 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {/* Password Field */}
          <div className="mb-4">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.75 pr-11 bg-white/6 border border-white/12 rounded-lg text-sm text-white placeholder-gray-600 outline-none transition-all focus:border-indigo-500 focus:bg-indigo-500/10 focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                type="button"
                onClick={() => setShowPw((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                aria-label="Toggle password visibility"
              >
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {/* Sign In Button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className={`w-full py-3 rounded-lg font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all ${
              loading
                ? "bg-indigo-500/40 text-white cursor-not-allowed"
                : "bg-indigo-500 text-white hover:bg-indigo-600 active:scale-95 shadow-lg shadow-indigo-500/40"
            }`}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                Sign In
                <span>→</span>
              </>
            )}
          </button>

          {/* Footer */}
          <div className="mt-6 text-center text-[10px] text-gray-600">
            Bond Build SG · v2.0
          </div>
        </div>
      </div>
    </div>
  );
}
