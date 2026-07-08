// context/NotificationsContext.jsx
// One poll of /notifications, split into the two things the UI shows separately:
//
//   🔔 Alerts  (category 'alert')   — overdue PRs/POs from the SLA sweep. Things
//                                      that are LATE and need chasing.
//   📬 Inbox   (category 'message') — PR raised / approved, PO raised. Things
//                                      that HAPPENED, and what to do next.
//
// Both feeds and both openers live here rather than being drilled through props,
// because they're reached from three unrelated places: the Sidebar (feature
// pages), and the HomePage bell + profile dropdown (which sits outside the
// Sidebar entirely).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";

const NotificationsContext = createContext(null);

const POLL_MS = 60_000;

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  // Uncapped unread counts from the server. `rows` is capped at 50 per category,
  // so counting unread in it would understate the badge for a busy user.
  // null until the first successful load → fall back to counting rows.
  const [serverUnread, setServerUnread] = useState(null);
  // null = closed, otherwise the category the panel is showing.
  const [panel, setPanel] = useState(null);

  const reload = useCallback(() => {
    api.notificationsFeed()
      .then((env) => {
        setRows(Array.isArray(env?.data) ? env.data : []);
        setServerUnread(env?.unreadByCategory ?? null);
      })
      .catch(() => { /* keep the last good feed rather than blanking the badges */ });
  }, []);

  useEffect(() => {
    if (!user) { setRows([]); setServerUnread(null); setPanel(null); return; }
    reload();
    const t = setInterval(reload, POLL_MS);
    return () => clearInterval(t);
  }, [user, reload]);

  const value = useMemo(() => {
    // Rows written before the category column existed have no category. Fall back
    // to the type, which is what the migration's backfill keys off, so an
    // un-migrated backend still routes rows to the right panel instead of
    // dumping every one of them into the Inbox.
    const categoryOf = (n) =>
      n.category || (n.type === "warning" || n.type === "error" ? "alert" : "message");

    const alerts = rows.filter((n) => categoryOf(n) === "alert");
    const messages = rows.filter((n) => categoryOf(n) === "message");
    const unread = (list) => list.filter((n) => !n.is_read).length;

    return {
      alerts,
      messages,
      // Prefer the server's uncapped tally; counting `rows` only sees the newest 50.
      alertCount: serverUnread?.alert ?? unread(alerts),
      messageCount: serverUnread?.message ?? unread(messages),
      panel,
      openAlerts: () => setPanel("alert"),
      openInbox: () => setPanel("message"),
      closePanel: () => setPanel(null),
      reload,
    };
  }, [rows, serverUnread, panel, reload]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

// Safe outside the provider (e.g. the login page) — returns inert zeros/no-ops
// so a consumer never has to null-check before reading a count or wiring a click.
const INERT = {
  alerts: [], messages: [], alertCount: 0, messageCount: 0, panel: null,
  openAlerts: () => {}, openInbox: () => {}, closePanel: () => {}, reload: () => {},
};

export const useNotifications = () => useContext(NotificationsContext) || INERT;
