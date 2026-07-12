import { createContext, useContext, useState, useEffect, useRef } from "react";
import api from "../services/api";

const AuthContext = createContext(null);

// ── Single session per browser ────────────────────────────────────────────
// Only one tab of this browser may be logged in at a time. A logged-in tab
// holds a shared localStorage "lock" and refreshes it on a heartbeat. Another
// tab that finds a live lock owned by a different tab is refused at login, or
// shown a blocking screen if it restored a remembered session on load. If the
// owning tab closes (or crashes), the lock goes stale and is released.
const LOCK_KEY = "bb_tab_lock";
const HEARTBEAT_MS = 2000;
const STALE_MS = 6000; // a lock not refreshed within this window is abandoned
const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const readLock = () => {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY) || "null"); }
  catch { return null; }
};
// A lock is "held elsewhere" only if it belongs to another tab and is fresh.
const heldByOtherTab = (lock) =>
  !!lock && lock.id !== TAB_ID && Date.now() - lock.ts <= STALE_MS;
const writeLock = () =>
  localStorage.setItem(LOCK_KEY, JSON.stringify({ id: TAB_ID, ts: Date.now() }));
const releaseLock = () => {
  const cur = readLock();
  if (cur && cur.id === TAB_ID) localStorage.removeItem(LOCK_KEY);
};

function SessionBlocked({ onReload, onSignOut }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0F0E1A] px-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1744] p-8 text-center shadow-2xl">
        <div className="mb-4 text-4xl">🔒</div>
        <h1 className="mb-2 text-lg font-black text-white">Already open in another tab</h1>
        <p className="mb-6 text-sm leading-relaxed text-indigo-200">
          This account is already signed in on another tab of this browser.
          Only one tab can be active at a time. Please use that tab, or close it
          and continue here.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onReload}
            className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-600"
          >
            Continue here
          </button>
          <button
            onClick={onSignOut}
            className="w-full rounded-lg border border-white/10 bg-transparent py-2.5 text-sm font-semibold text-indigo-200 transition-colors hover:bg-white/5"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  // Latest `blocked` for use inside the heartbeat closure.
  const blockedRef = useRef(false);
  useEffect(() => { blockedRef.current = blocked; }, [blocked]);

  // Restore an existing session on first load.
  useEffect(() => {
    const token = localStorage.getItem("bb_token") || sessionStorage.getItem("bb_token");
    if (token) {
      api
        .get("/auth/me")
        .then((res) => setUser(res.data.user))
        .catch(() => {
          localStorage.removeItem("bb_token");
          sessionStorage.removeItem("bb_token");
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // While logged in, hold the single-session lock (or get blocked by it).
  useEffect(() => {
    if (!user) { setBlocked(false); return; }

    // Take the lock if it's free / ours / stale; otherwise mark this tab blocked.
    const tryAcquire = () => {
      if (heldByOtherTab(readLock())) { setBlocked(true); return false; }
      writeLock();
      setBlocked(false);
      return true;
    };

    tryAcquire();

    const hb = setInterval(() => {
      if (blockedRef.current) {
        tryAcquire(); // keep watching for the owning tab to leave
      } else if (heldByOtherTab(readLock())) {
        setBlocked(true); // our lock was taken over
      } else {
        writeLock(); // refresh our lock
      }
    }, HEARTBEAT_MS);

    const onStorage = (e) => {
      // React immediately when the lock changes in another tab.
      if (e.key === LOCK_KEY && blockedRef.current) tryAcquire();
    };
    const onUnload = () => releaseLock();
    window.addEventListener("storage", onStorage);
    window.addEventListener("beforeunload", onUnload);

    return () => {
      clearInterval(hb);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [user]);

  const login = async (username, password, remember = false) => {
    // Refuse a second concurrent login from another tab of this browser.
    if (heldByOtherTab(readLock())) {
      const err = new Error(
        "This app is already open in another tab of this browser. Please use that tab, or close it and try again.",
      );
      err.code = "TAB_LOCKED";
      throw err;
    }
    const res = await api.post("/auth/login", { username, password });
    // Keep a single source of truth: clear both stores first so a stale
    // token in the other store can't shadow this fresh one (reads prefer
    // localStorage, so an old "Remember me" token would win otherwise).
    localStorage.removeItem("bb_token");
    sessionStorage.removeItem("bb_token");
    (remember ? localStorage : sessionStorage).setItem("bb_token", res.data.token);
    writeLock(); // claim the session lock for this tab
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    releaseLock();
    localStorage.removeItem("bb_token");
    sessionStorage.removeItem("bb_token");
    setUser(null);
    setBlocked(false);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, blocked }}>
      {!loading &&
        (blocked ? (
          <SessionBlocked onReload={() => window.location.reload()} onSignOut={logout} />
        ) : (
          children
        ))}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
