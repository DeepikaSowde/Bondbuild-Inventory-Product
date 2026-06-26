// frontend/src/pages/ChangePassword.jsx
// Any logged-in user can change their own password here.
// Uses services/api.js (token handled automatically). No email needed.
//
// Add a route, e.g.  <Route path="/change-password" element={<PrivateRoute><ChangePassword/></PrivateRoute>} />
// and a link/button somewhere (e.g. the user menu or Sidebar).
import { useState } from "react";
import api from "../services/api";

export default function ChangePassword() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: "ok"|"err", text }

  const submit = async () => {
    setMsg(null);
    if (!currentPassword || !newPassword)
      return setMsg({ type: "err", text: "Please fill in all fields." });
    if (newPassword.length < 6)
      return setMsg({
        type: "err",
        text: "New password must be at least 6 characters.",
      });
    if (newPassword !== confirm)
      return setMsg({
        type: "err",
        text: "New password and confirmation do not match.",
      });

    setBusy(true);
    try {
      const r = await api.post("/auth/change-password", {
        currentPassword,
        newPassword,
      });
      setMsg({
        type: "ok",
        text: r.data?.message || "Password changed successfully.",
      });
      setCurrent("");
      setNew("");
      setConfirm("");
    } catch (e) {
      setMsg({
        type: "err",
        text: e?.response?.data?.error || "Failed to change password.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F6FA] p-6">
      <div className="mx-auto max-w-md">
        <h1 className="mb-1 text-2xl font-extrabold text-[#1E1B4B]">
          Change Password
        </h1>
        <p className="mb-5 text-[13px] text-[#6B7280]">
          Update your account password.
        </p>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {msg && (
            <div
              className={`mb-4 rounded-lg px-3 py-2 text-[13px] ${msg.type === "ok" ? "bg-[#D1FAE5] text-[#065F46]" : "bg-[#FEE2E2] text-[#991B1B]"}`}
            >
              {msg.text}
            </div>
          )}

          <Field label="Current password">
            <input
              type={show ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
              className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-[14px]"
            />
          </Field>

          <Field label="New password">
            <input
              type={show ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
              className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-[14px]"
            />
          </Field>

          <Field label="Confirm new password">
            <input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-[14px]"
            />
          </Field>

          <label className="mb-4 flex items-center gap-2 text-[13px] text-[#6B7280]">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
            />
            Show passwords
          </label>

          <button
            onClick={submit}
            disabled={busy}
            className="w-full rounded-lg bg-[#6366F1] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-[#4F46E5] disabled:opacity-60"
          >
            {busy ? "Saving…" : "Change Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <div className="mb-1 text-[13px] font-semibold text-[#374151]">
        {label}
      </div>
      {children}
    </div>
  );
}
