import { createContext, useContext, useState, useEffect } from "react";
import api from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if user already logged in
  useEffect(() => {
    const token = localStorage.getItem("bb_token") || sessionStorage.getItem("bb_token");
    if (token) {
      api
        .get("/auth/me")
        .then((res) => setUser(res.data.user))
        .catch(() => localStorage.removeItem("bb_token"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password, remember = false) => {
    const res = await api.post("/auth/login", { username, password });
    if (remember) {
      localStorage.setItem("bb_token", res.data.token);
    } else {
      sessionStorage.setItem("bb_token", res.data.token);
    }
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    localStorage.removeItem("bb_token");
    sessionStorage.removeItem("bb_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
