// frontend/src/components/RolePermissions.jsx
// Role Permissions Management - Admin Only
// Fetches from database, toggles save to database

import { useState, useEffect } from "react";
import api from "../services/api";

const ROLES = [
  "Drafter",
  "Manager",
  "Purchaser",
  "Factory In-charge",
  "Supervisor",
  "QS",
];

const ROLE_ICON = {
  Drafter: "✏️",
  Manager: "✔️",
  Purchaser: "🛒",
  "Factory In-charge": "🏭",
  Supervisor: "👷",
  QS: "📊",
};

const ROLE_CLR = {
  Drafter: "#6366F1",
  Manager: "#059669",
  Purchaser: "#D97706",
  "Factory In-charge": "#0891B2",
  Supervisor: "#7C3AED",
  QS: "#8B5CF6",
};

const PERM_GROUPS = [
  {
    group: "📦 Stock Management",
    perms: [
      {
        key: "view_stock",
        label: "View Stock",
        desc: "Can see inventory list",
      },
      {
        key: "view_unit_price",
        label: "View Unit Price",
        desc: "Can see item prices",
      },
      {
        key: "view_total_value",
        label: "View Total Value",
        desc: "Can see financial values",
      },
      {
        key: "edit_quantity",
        label: "Edit Quantity",
        desc: "Can change stock quantities",
      },
      {
        key: "edit_location",
        label: "Edit Location",
        desc: "Can move items between locations",
      },
    ],
  },
  {
    group: "➕ Operations",
    perms: [
      {
        key: "add_item",
        label: "Add Item",
        desc: "Can create new inventory items",
      },
      {
        key: "delete_item",
        label: "Delete Item",
        desc: "Can delete inventory items",
      },
    ],
  },
  {
    group: "📊 Reports",
    perms: [
      {
        key: "export_excel",
        label: "Export Excel",
        desc: "Can download inventory reports",
      },
    ],
  },
];

export default function RolePermissions({ showNotify }) {
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // Track which role is being saved

  // ── Fetch permissions from database on mount ──
  useEffect(() => {
    fetchPermissions();
  }, []);

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      const response = await api.get("/permissions");

      // Convert array to object keyed by role
      const permsObj = {};
      response.data.forEach((perm) => {
        permsObj[perm.role] = perm;
      });

      setPermissions(permsObj);
    } catch (err) {
      console.error("Error fetching permissions:", err);
      showNotify("Failed to load permissions", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Toggle permission and save to database ──
  const togglePermission = async (role, key) => {
    try {
      setSaving(role);

      // Get current permission
      const currentPerm = permissions[role][key];
      const newValue = !currentPerm;

      // Prepare update payload
      const updatePayload = {
        ...permissions[role],
        [key]: newValue,
      };

      // Save to database via API
      const response = await api.put(`/permissions/${role}`, updatePayload);

      // Update local state
      setPermissions((prev) => ({
        ...prev,
        [role]: response.data,
      }));

      showNotify(`${role} - ${key} ${newValue ? "Allowed" : "Denied"} ✅`);
    } catch (err) {
      console.error("Error updating permission:", err);
      showNotify(
        err.response?.data?.error || "Failed to update permission",
        "error",
      );
      // Refetch to sync with server
      fetchPermissions();
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "32px", textAlign: "center" }}>
        <p>Loading permissions...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px" }}>
      <div
        style={{
          background: "#EEF2FF",
          border: "1px solid #C7D2FE",
          borderRadius: 10,
          padding: "10px 16px",
          marginBottom: 20,
          fontSize: 12,
          color: "#4338CA",
        }}
      >
        💡 Toggle permissions for each role. Changes save to database
        immediately. All logged-in users of that role will see updated
        permissions.
      </div>

      {PERM_GROUPS.map((group) => (
        <div
          key={group.group}
          style={{
            background: "#fff",
            borderRadius: 14,
            boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
            marginBottom: 20,
            overflow: "hidden",
          }}
        >
          {/* Group header */}
          <div style={{ background: "#1E1B4B", padding: "12px 20px" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>
              {group.group}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 900,
              }}
            >
              <thead>
                <tr style={{ background: "#F8F7FF" }}>
                  <th
                    style={{
                      padding: "10px 20px",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#6B7280",
                      textTransform: "uppercase",
                      width: 250,
                    }}
                  >
                    Permission
                  </th>
                  {ROLES.map((role) => (
                    <th
                      key={role}
                      style={{
                        padding: "10px 14px",
                        textAlign: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        color: ROLE_CLR[role] || "#6366F1",
                        textTransform: "uppercase",
                        minWidth: 100,
                      }}
                    >
                      <div>{ROLE_ICON[role]}</div>
                      <div style={{ fontSize: 9, marginTop: 2 }}>
                        {role.replace("Factory In-charge", "Factory")}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.perms.map((perm, pi) => (
                  <tr
                    key={perm.key}
                    style={{
                      borderBottom: "1px solid #F3F4F6",
                      background: pi % 2 === 0 ? "#fff" : "#FAFAFA",
                    }}
                  >
                    <td style={{ padding: "14px 20px" }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#1E1B4B",
                        }}
                      >
                        {perm.label}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "#9CA3AF",
                          marginTop: 2,
                        }}
                      >
                        {perm.desc}
                      </div>
                    </td>
                    {ROLES.map((role) => {
                      const perm_value = permissions[role]?.[perm.key] ?? false;
                      const clr = ROLE_CLR[role] || "#6366F1";
                      const isSaving = saving === role;

                      return (
                        <td
                          key={role}
                          style={{
                            padding: "14px",
                            textAlign: "center",
                            opacity: isSaving ? 0.6 : 1,
                          }}
                        >
                          <button
                            onClick={() => togglePermission(role, perm.key)}
                            disabled={isSaving}
                            style={{
                              width: 52,
                              height: 28,
                              borderRadius: 14,
                              border: "none",
                              cursor: isSaving ? "wait" : "pointer",
                              position: "relative",
                              background: perm_value ? clr : "#E5E7EB",
                              transition: "background 0.2s",
                            }}
                          >
                            {/* Toggle knob */}
                            <div
                              style={{
                                position: "absolute",
                                top: 3,
                                left: perm_value ? 26 : 3,
                                width: 22,
                                height: 22,
                                borderRadius: "50%",
                                background: "#fff",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                                transition: "left 0.2s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 10,
                              }}
                            >
                              {isSaving ? "⟳" : perm_value ? "✓" : "✗"}
                            </div>
                          </button>
                          <div
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: perm_value ? clr : "#9CA3AF",
                              marginTop: 4,
                            }}
                          >
                            {perm_value ? "Allowed" : "Denied"}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div
        style={{
          background: "#EEF2FF",
          border: "1px solid #C7D2FE",
          borderRadius: 10,
          padding: "12px 16px",
          marginTop: 20,
          fontSize: 12,
          color: "#4338CA",
        }}
      >
        ✅ All changes are saved to database automatically. Users will see
        updated permissions on next login.
      </div>
    </div>
  );
}
