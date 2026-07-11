// frontend/src/pages/UserManagement.jsx
// User Management with Database Integration
// Fetches users from API, no designation field

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import RolePermissions from "../components/RolePermissions";

// Default role permissions
const DEFAULT_FIELD_PERMS = {
  Drafter: {
    seePRPrice: false,
    editPRSupplier: false,
    seePOPrice: false,
    seePOAmount: false,
    editPOSupplier: false,
    editPOPrice: false,
  },
  Manager: {
    seePRPrice: true,
    editPRSupplier: true,
    seePOPrice: true,
    seePOAmount: true,
    editPOSupplier: true,
    editPOPrice: false,
  },
  Purchaser: {
    seePRPrice: true,
    editPRSupplier: false,
    seePOPrice: true,
    seePOAmount: true,
    editPOSupplier: true,
    editPOPrice: true,
  },
  "Factory In-charge": {
    seePRPrice: false,
    editPRSupplier: false,
    seePOPrice: false,
    seePOAmount: false,
    editPOSupplier: false,
    editPOPrice: false,
  },
  Supervisor: {
    seePRPrice: false,
    editPRSupplier: false,
    seePOPrice: false,
    seePOAmount: false,
    editPOSupplier: false,
    editPOPrice: false,
  },
};

// Password policy: 8–128 chars, at least one letter, one number, one special char.
const passwordError = (pw) => {
  if (typeof pw !== "string" || pw.length < 8 || pw.length > 128)
    return "Password must be 8–128 characters";
  if (!/[A-Za-z]/.test(pw)) return "Password must include at least one letter";
  if (!/[0-9]/.test(pw)) return "Password must include at least one number";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must include at least one special character (e.g. !@#$)";
  return null;
};

function UsersModule({
  users,
  setUsers,
  showNotify,
  currentUser,
  fieldPermsState,
  setFieldPermsState,
  loading,
}) {
  const ROLES = [
    "Drafter",
    "Manager",
    "Purchaser",
    "Factory In-charge",
    "Supervisor",
    "QS",
  ];

  const emptyForm = {
    name: "",
    role: "Drafter",
    username: "",
    password: "",
    status: "Active",
  };

  const [activeTab, setActiveTab] = useState("users");
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showPw, setShowPw] = useState(false);
  const [filterRole, setFilterRole] = useState("All");

  const openAdd = () => {
    setForm(emptyForm);
    setEditUser(null);
    setShowForm(true);
  };

  const openEdit = (u) => {
    setForm({ ...u, password: "" }); // password blank on edit → keeps input controlled
    setEditUser(u);
    setShowForm(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const username = form.username.trim();
    const password = form.password || ""; // never trim a password

    // Required + length
    if (!name) return showNotify("Name is required", "error");
    if (name.length > 60) return showNotify("Name must be 60 characters or fewer", "error");
    if (!username) return showNotify("User ID is required", "error");
    if (username.length < 3 || username.length > 30)
      return showNotify("User ID must be 3–30 characters", "error");
    // Special characters (User ID whitelist)
    if (!/^[a-zA-Z0-9._]+$/.test(username))
      return showNotify("User ID can only contain letters, numbers, dot (.) and underscore (_). No spaces or special characters.", "error");
    // Password: required on add; on edit only validated when a new one is typed
    if (!editUser || password) {
      const pErr = passwordError(password);
      if (pErr) return showNotify(pErr, "error");
    }
    // Duplicate prevention (case-insensitive, excludes self)
    const dup = users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.id !== editUser?.id,
    );
    if (dup) return showNotify("User ID already exists", "error");
    // Self-lockout guards
    if (editUser && editUser.id === currentUser?.id) {
      if (form.status !== "Active")
        return showNotify("You can't set your own account to Inactive", "error");
      if (form.role !== editUser.role)
        return showNotify("You can't change your own role", "error");
    }

    try {
      if (editUser) {
        const { data } = await api.put(`/auth/users/${editUser.id}`, {
          name,
          username,
          role: form.role,
          status: form.status,
          ...(password && { password }),
        });
        setUsers((prev) =>
          prev.map((u) => (u.id === editUser.id ? { ...u, ...data } : u)),
        );
        showNotify(`${name} updated ✅`);
      } else {
        const { data } = await api.post("/auth/users", {
          name,
          username,
          password,
          role: form.role,
          status: form.status,
        });
        setUsers((prev) => [...prev, data]);
        showNotify(`${name} added ✅`);
      }
      setShowForm(false);
    } catch (err) {
      showNotify(err.response?.data?.error || "Error saving user", "error");
    }
  };

  const handleDelete = async (u) => {
    if (u.id === currentUser?.id) {
      showNotify("Cannot delete your own account", "error");
      return;
    }
    if (window.confirm(`Delete user "${u.name}"?`)) {
      try {
        await api.delete(`/auth/users/${u.id}`);
        setUsers((prev) => prev.filter((x) => x.id !== u.id));
        showNotify(`${u.name} deleted`, "warning");
      } catch (err) {
        showNotify(err.response?.data?.error || "Error deleting user", "error");
      }
    }
  };

  const handleResetPassword = async (u) => {
    const newPassword = window.prompt(
      `Reset password for "${u.name}" (${u.username}).\nEnter a new temporary password (8–128 chars, incl. a letter, a number, and a special character):`,
    );
    if (newPassword === null) return; // cancelled
    const pErr = passwordError(newPassword); // never trim a password
    if (pErr) {
      showNotify(pErr, "error");
      return;
    }
    try {
      await api.post(`/auth/users/${u.id}/reset-password`, {
        newPassword,
      });
      showNotify(
        `Password reset for ${u.name}. Share the temporary password with them.`,
      );
    } catch (err) {
      showNotify(
        err.response?.data?.error || "Error resetting password",
        "error",
      );
    }
  };

  const toggleStatus = async (u) => {
    if (u.id === currentUser?.id) {
      showNotify("Cannot deactivate your own account", "error");
      return;
    }
    const newStatus = u.status === "Active" ? "Inactive" : "Active";
    try {
      await api.put(`/auth/users/${u.id}`, { status: newStatus });
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, status: newStatus } : x)),
      );
      showNotify(
        `${u.name} ${newStatus === "Active" ? "activated" : "deactivated"}`,
      );
    } catch (err) {
      showNotify(err.response?.data?.error || "Error updating status", "error");
    }
  };

  const togglePerm = (role, key) => {
    setFieldPermsState((prev) => ({
      ...prev,
      [role]: { ...prev[role], [key]: !prev[role][key] },
    }));
  };

  const ROLE_ICON = {
    Drafter: "✏️",
    Manager: "✔️",
    Purchaser: "🛒",
    "Factory In-charge": "🏭",
    Supervisor: "👷",
    Admin: "👑",
  };

  const ROLE_CLR = {
    Drafter: "#6366F1",
    Manager: "#059669",
    Purchaser: "#D97706",
    "Factory In-charge": "#0891B2",
    Supervisor: "#7C3AED",
    Admin: "#DC2626",
  };

  const PERM_GROUPS = [
    {
      group: "📋 Purchase Request",
      perms: [
        {
          key: "seePRPrice",
          label: "View Unit Price",
          desc: "Can see item prices in PR form",
        },
        {
          key: "editPRSupplier",
          label: "Suggest Supplier",
          desc: "Can suggest supplier per item in PR",
        },
      ],
    },
    {
      group: "🛒 Purchase Order",
      perms: [
        {
          key: "seePOPrice",
          label: "View Unit Price",
          desc: "Can see unit price per item in PO",
        },
        {
          key: "seePOAmount",
          label: "View Total Amount",
          desc: "Can see S$ total amount in PO",
        },
        {
          key: "editPOSupplier",
          label: "Edit Supplier",
          desc: "Can change supplier on PO",
        },
        {
          key: "editPOPrice",
          label: "Edit Unit Price",
          desc: "Can enter/edit unit price in PO",
        },
      ],
    },
  ];

  const filtered = users.filter(
    (u) => filterRole === "All" || u.role === filterRole,
  );

  if (loading) {
    return (
      <div style={{ padding: "32px", textAlign: "center" }}>
        <p>Loading users...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              color: "#1E1B4B",
            }}
          >
            👥 User Management
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9CA3AF" }}>
            Manage user accounts and role-based field permissions
          </p>
        </div>
        {activeTab === "users" && (
          <button
            onClick={openAdd}
            style={{
              background: "#6366F1",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            + Add User
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 20,
          background: "#F3F4F6",
          borderRadius: 10,
          padding: 4,
          width: "fit-content",
        }}
      >
        {[
          ["users", "👤 Users"],
          ["permissions", "🔐 Role Permissions"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              background: activeTab === id ? "#fff" : "transparent",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontSize: 12,
              fontWeight: 700,
              color: activeTab === id ? "#1E1B4B" : "#9CA3AF",
              cursor: "pointer",
              boxShadow:
                activeTab === id ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: USERS ── */}
      {activeTab === "users" && (
        <>
          {/* Stats */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            {[
              ["Total Users", users.length, "#6366F1"],
              [
                "Active",
                users.filter((u) => u.status === "Active").length,
                "#059669",
              ],
              [
                "Inactive",
                users.filter((u) => u.status === "Inactive").length,
                "#9CA3AF",
              ],
              ["Roles", new Set(users.map((u) => u.role)).size, "#D97706"],
            ].map(([l, v, c]) => (
              <div
                key={l}
                style={{
                  background: "#fff",
                  borderRadius: 10,
                  padding: "12px 20px",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  borderLeft: `4px solid ${c}`,
                  flex: 1,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800, color: c }}>
                  {v}
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                  {l}
                </div>
              </div>
            ))}
          </div>

          {/* Filter */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            {[
              "All",
              "Drafter",
              "Manager",
              "Purchaser",
              "Factory In-charge",
              "Supervisor",
              "Admin",
            ].map((r) => (
              <button
                key={r}
                onClick={() => setFilterRole(r)}
                style={{
                  background:
                    filterRole === r ? ROLE_CLR[r] || "#6366F1" : "#F3F4F6",
                  color: filterRole === r ? "#fff" : "#6B7280",
                  border: "none",
                  borderRadius: 20,
                  padding: "5px 14px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Table */}
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#1E1B4B" }}>
                  {["Name", "Role", "User ID", "Status", "Actions"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#A5B4FC",
                        textTransform: "uppercase",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => {
                  const clr = ROLE_CLR[u.role] || "#6366F1";
                  const isMe = u.id === currentUser?.id;
                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: "1px solid #F3F4F6",
                        background: i % 2 === 0 ? "#fff" : "#FAFAFA",
                      }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              background: clr + "22",
                              border: `2px solid ${clr}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 14,
                            }}
                          >
                            {ROLE_ICON[u.role] || "👤"}
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: "#1E1B4B",
                              }}
                            >
                              {u.name}
                              {isMe && (
                                <span
                                  style={{
                                    fontSize: 9,
                                    background: "#EEF2FF",
                                    color: "#6366F1",
                                    padding: "1px 6px",
                                    borderRadius: 8,
                                    fontWeight: 700,
                                    marginLeft: 6,
                                  }}
                                >
                                  YOU
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: clr,
                            background: clr + "18",
                            padding: "3px 10px",
                            borderRadius: 20,
                          }}
                        >
                          {ROLE_ICON[u.role]} {u.role}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#374151",
                          fontFamily: "monospace",
                        }}
                      >
                        {u.username}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <button
                          onClick={() => toggleStatus(u)}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color:
                              u.status === "Active" ? "#059669" : "#9CA3AF",
                            background:
                              u.status === "Active" ? "#ECFDF5" : "#F3F4F6",
                            border: "none",
                            borderRadius: 20,
                            padding: "4px 12px",
                            cursor: "pointer",
                          }}
                        >
                          {u.status === "Active" ? "● Active" : "○ Inactive"}
                        </button>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => openEdit(u)}
                            style={{
                              background: "#EEF2FF",
                              border: "none",
                              borderRadius: 7,
                              padding: "6px 12px",
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#6366F1",
                              cursor: "pointer",
                            }}
                          >
                            ✏️ Edit
                          </button>
                          {!isMe && (
                            <button
                              onClick={() => handleResetPassword(u)}
                              style={{
                                background: "#FFF7ED",
                                border: "none",
                                borderRadius: 7,
                                padding: "6px 12px",
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#D97706",
                                cursor: "pointer",
                              }}
                              title="Reset this user's password"
                            >
                              🔑 Reset
                            </button>
                          )}
                          {!isMe && (
                            <button
                              onClick={() => handleDelete(u)}
                              style={{
                                background: "#FEF2F2",
                                border: "none",
                                borderRadius: 7,
                                padding: "6px 12px",
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#DC2626",
                                cursor: "pointer",
                              }}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div
                style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}
              >
                No users found
              </div>
            )}
          </div>
        </>
      )}
      {activeTab === "permissions" && (
        <RolePermissions showNotify={showNotify} />
      )}
      {/* Add/Edit Modal */}
      {showForm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 28,
              width: 480,
              boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 800,
                  color: "#1E1B4B",
                }}
              >
                {editUser ? "Edit User" : "Add New User"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "#9CA3AF",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#6B7280",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Full Name *
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="e.g. James Wong"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1.5px solid #E5E7EB",
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#6B7280",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Role *
                </label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      role: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    border: "1.5px solid #E5E7EB",
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontSize: 13,
                    background: "#fff",
                    outline: "none",
                  }}
                >
                  {(editUser?.role === "Admin" ? [...ROLES, "Admin"] : ROLES).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#6B7280",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  User ID (Login) *
                </label>
                <input
                  value={form.username}
                  maxLength={30}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      username: e.target.value.toLowerCase().replace(/\s/g, ""),
                    }))
                  }
                  placeholder="e.g. James"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1.5px solid #E5E7EB",
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontSize: 13,
                    outline: "none",
                    fontFamily: "monospace",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#6B7280",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Password {editUser ? "(leave blank to keep current)" : "*"}
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password: e.target.value }))
                    }
                    placeholder="8–128 chars · letter, number & special"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      border: "1.5px solid #E5E7EB",
                      borderRadius: 8,
                      padding: "10px 40px 10px 12px",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((p) => !p)}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                      color: "#9CA3AF",
                    }}
                  >
                    {showPw ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#6B7280",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Status
                </label>
                <div style={{ display: "flex", gap: 10 }}>
                  {["Active", "Inactive"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, status: s }))}
                      style={{
                        flex: 1,
                        padding: "8px",
                        borderRadius: 8,
                        border: `2px solid ${form.status === s ? (s === "Active" ? "#059669" : "#9CA3AF") : "#E5E7EB"}`,
                        background:
                          form.status === s
                            ? s === "Active"
                              ? "#ECFDF5"
                              : "#F3F4F6"
                            : "#fff",
                        color:
                          form.status === s
                            ? s === "Active"
                              ? "#059669"
                              : "#6B7280"
                            : "#9CA3AF",
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {s === "Active" ? "● Active" : "○ Inactive"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  flex: 1,
                  background: "#F3F4F6",
                  border: "none",
                  borderRadius: 9,
                  padding: "11px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#6B7280",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                style={{
                  flex: 2,
                  background: "#6366F1",
                  border: "none",
                  borderRadius: 9,
                  padding: "11px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                {editUser ? "💾 Save Changes" : "➕ Add User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UserManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fieldPermsState, setFieldPermsState] = useState(DEFAULT_FIELD_PERMS);

  // Fetch users from API
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await api.get("/auth/users");
        setUsers(response.data);
      } catch (err) {
        console.error("Error fetching users:", err);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const showNotify = (msg, type = "success") => {
    alert(msg);
  };

  return (
    <UsersModule
      users={users}
      setUsers={setUsers}
      showNotify={showNotify}
      currentUser={user}
      fieldPermsState={fieldPermsState}
      setFieldPermsState={setFieldPermsState}
      loading={loading}
    />
  );
}
