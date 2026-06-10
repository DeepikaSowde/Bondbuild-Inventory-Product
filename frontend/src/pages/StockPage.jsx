// frontend/src/pages/StockPage.jsx
// Stock Page with Role-Based Permissions from Database
// FIXES IN THIS VERSION:
//   1. Table wrapper: overflow "hidden" → "auto" + table minWidth,
//      so the table scrolls inside its own card instead of stretching
//      the whole page (this is what was pushing "Add Item" off-screen)
//   2. Search box now actually filters the table (code / name / location)
//   3. "undefined" stripped out of item_name display (band-aid — real fix
//      is in the backend where the name string is built)
//   4. Stats row wraps on narrow screens instead of forcing page width
//
// NOTE: Also add `minWidth: 0` to the <main> content area in your
// Layout/Sidebar component (the flex child that wraps this page),
// otherwise the page can still stretch. See note at bottom of file.

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

// Default permissions for each role
const DEFAULT_PERMISSIONS = {
  Drafter: {
    view_stock: true,
    view_unit_price: false,
    view_total_value: false,
    edit_quantity: false,
    edit_location: false,
    add_item: false,
    delete_item: false,
    export_excel: true,
  },
  Manager: {
    view_stock: true,
    view_unit_price: true,
    view_total_value: true,
    edit_quantity: true,
    edit_location: true,
    add_item: true,
    delete_item: false,
    export_excel: true,
  },
  Purchaser: {
    view_stock: true,
    view_unit_price: true,
    view_total_value: true,
    edit_quantity: true,
    edit_location: true,
    add_item: true,
    delete_item: false,
    export_excel: true,
  },
  "Factory In-charge": {
    view_stock: true,
    view_unit_price: false,
    view_total_value: false,
    edit_quantity: true,
    edit_location: true,
    add_item: false,
    delete_item: false,
    export_excel: true,
  },
  Supervisor: {
    view_stock: true,
    view_unit_price: false,
    view_total_value: false,
    edit_quantity: true,
    edit_location: false,
    add_item: false,
    delete_item: false,
    export_excel: true,
  },
  QS: {
    view_stock: true,
    view_unit_price: true,
    view_total_value: true,
    edit_quantity: false,
    edit_location: false,
    add_item: false,
    delete_item: false,
    export_excel: true,
  },
  Admin: {
    view_stock: true,
    view_unit_price: true,
    view_total_value: true,
    edit_quantity: true,
    edit_location: true,
    add_item: true,
    delete_item: true,
    export_excel: true,
  },
};

export default function StockPage() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // ── Fetch inventory data and permissions on mount ──
  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // The API returns { success: true, data: [...], count: 165 }
      // So we need inventoryRes.data.data (nested!)
      const inventoryRes = await api.get("/inventory");
      const inventoryData = inventoryRes.data.data || [];
      setInventory(Array.isArray(inventoryData) ? inventoryData : []);

      // Fetch permissions for current user's role with fallback
      if (user?.role) {
        try {
          const permRes = await api.get(`/permissions/${user.role}`);
          setPermissions(permRes.data);
        } catch (err) {
          console.log(
            "⚠️ Permissions API failed, using defaults for",
            user.role,
          );
          const defaultPerms =
            DEFAULT_PERMISSIONS[user.role] || DEFAULT_PERMISSIONS.Drafter;
          setPermissions(defaultPerms);
        }
      }
    } catch (err) {
      console.error("❌ Error fetching data:", err);
      setInventory([]);
      const defaultPerms =
        DEFAULT_PERMISSIONS[user?.role] || DEFAULT_PERMISSIONS.Drafter;
      setPermissions(defaultPerms);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !permissions) {
    return (
      <div style={{ padding: "32px", textAlign: "center" }}>
        <p>Loading inventory...</p>
      </div>
    );
  }

  // ── Determine which columns to show based on permissions ──
  const columns = [
    { key: "location_code", label: "Location", show: true },
    { key: "item_code", label: "Code", show: true },
    { key: "item_name", label: "Item Name", show: true },
    { key: "profile_name", label: "Profile", show: true },
    { key: "size", label: "Size", show: true },
    { key: "length", label: "Length", show: true },
    { key: "quantity_in_stock", label: "Qty", show: true },
    {
      key: "unit_price",
      label: "Unit Price",
      show: permissions.view_unit_price,
    },
    {
      key: "total_value",
      label: "Total Value",
      show: permissions.view_total_value,
    },
    { key: "stock_status", label: "Status", show: true },
    { key: "remarks", label: "Remarks", show: true },
  ];

  const visibleColumns = columns.filter((col) => col.show);

  const showActions =
    permissions.edit_quantity ||
    permissions.edit_location ||
    permissions.delete_item;

  // ── FIX #3: clean "undefined" out of item names (backend band-aid) ──
  const cleanName = (name) => {
    if (!name) return "—";
    const cleaned = String(name)
      .replace(/\s*undefined\s*/gi, "")
      .trim();
    return cleaned || "—";
  };

  // ── FIX #2: search now actually filters the inventory ──
  const q = searchTerm.trim().toLowerCase();
  const filteredInventory = !q
    ? inventory
    : inventory.filter(
        (item) =>
          String(item.item_code || "")
            .toLowerCase()
            .includes(q) ||
          String(item.item_name || "")
            .toLowerCase()
            .includes(q) ||
          String(item.location_code || "")
            .toLowerCase()
            .includes(q),
      );

  // ── Safe calculation functions (stats stay based on FULL inventory) ──
  const getTotalQty = () => {
    if (!Array.isArray(inventory)) return 0;
    return inventory.reduce(
      (sum, item) => sum + (item.quantity_in_stock || 0),
      0,
    );
  };

  const getLowStockCount = () => {
    if (!Array.isArray(inventory)) return 0;
    return inventory.filter((item) => item.stock_status === "LOW_STOCK").length;
  };

  const getOutOfStockCount = () => {
    if (!Array.isArray(inventory)) return 0;
    return inventory.filter((item) => item.stock_status === "OUT_OF_STOCK")
      .length;
  };

  // ── Safe price formatting ──
  const formatPrice = (value) => {
    if (!value) return "0.00";
    const num = parseFloat(value);
    return isNaN(num) ? "0.00" : num.toFixed(2);
  };

  return (
    <div style={{ padding: "32px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 800,
              color: "#1E1B4B",
            }}
          >
            📦 Factory Stock
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9CA3AF" }}>
            All materials currently in factory storage
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
          {/* Export button - visible to all */}
          {permissions.export_excel && (
            <button
              style={{
                background: "#10B981",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              📥 Export Excel
            </button>
          )}

          {/* Add Item button - only if allowed */}
          {permissions.add_item && (
            <button
              style={{
                background: "#6366F1",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ➕ Add Item
            </button>
          )}
        </div>
      </div>

      {/* Stats — FIX #4: flexWrap so cards never force page width */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        {[
          [
            "Total Items",
            Array.isArray(inventory) ? inventory.length : 0,
            "#6366F1",
          ],
          ["Total Qty", getTotalQty(), "#059669"],
          ["Low Stock", getLowStockCount(), "#D97706"],
          ["Out of Stock", getOutOfStockCount(), "#DC2626"],
        ].map(([label, value, color]) => (
          <div
            key={label}
            style={{
              background: "#fff",
              borderRadius: 10,
              padding: "12px 20px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              borderLeft: `4px solid ${color}`,
              flex: "1 1 150px",
              minWidth: 150,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by code, name, location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1.5px solid #E5E7EB",
            fontSize: 13,
            outline: "none",
          }}
        />
      </div>

      {/* Permission Info Banner */}
      <div
        style={{
          background: "#F0F9FF",
          border: "1px solid #BAE6FD",
          borderRadius: 10,
          padding: "10px 16px",
          marginBottom: 16,
          fontSize: 12,
          color: "#0369A1",
        }}
      >
        ℹ️ Your Role: <strong>{user?.role}</strong> | Visible Columns:{" "}
        <strong>{visibleColumns.length}</strong> | Can Edit Qty:{" "}
        <strong>{permissions.edit_quantity ? "✅ Yes" : "❌ No"}</strong> | Can
        Add Items: <strong>{permissions.add_item ? "✅ Yes" : "❌ No"}</strong>
        {q && (
          <>
            {" "}
            | Showing: <strong>{filteredInventory.length}</strong> of{" "}
            <strong>{inventory.length}</strong> items
          </>
        )}
      </div>

      {/* Table — FIX #1: overflowX auto so the table scrolls in its own
          card instead of stretching the whole page */}
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
          overflowX: "auto",
        }}
      >
        <table
          style={{
            width: "100%",
            minWidth: 1100,
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr style={{ background: "#1E1B4B" }}>
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#A5B4FC",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.label}
                </th>
              ))}
              {/* Actions column - only if user has edit permissions */}
              {showActions && (
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#A5B4FC",
                    textTransform: "uppercase",
                  }}
                >
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {Array.isArray(filteredInventory) &&
            filteredInventory.length > 0 ? (
              filteredInventory.map((item, i) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: "1px solid #F3F4F6",
                    background: i % 2 === 0 ? "#fff" : "#FAFAFA",
                  }}
                >
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        padding: "12px 16px",
                        fontSize: 12,
                        color: "#374151",
                      }}
                    >
                      {col.key === "stock_status" ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            color:
                              item[col.key] === "OK"
                                ? "#059669"
                                : item[col.key] === "LOW_STOCK"
                                  ? "#D97706"
                                  : "#DC2626",
                            background:
                              item[col.key] === "OK"
                                ? "#ECFDF5"
                                : item[col.key] === "LOW_STOCK"
                                  ? "#FEF3C7"
                                  : "#FEF2F2",
                            padding: "3px 10px",
                            borderRadius: 20,
                          }}
                        >
                          {item[col.key]}
                        </span>
                      ) : col.key === "unit_price" ||
                        col.key === "total_value" ? (
                        <span style={{ fontWeight: 600, color: "#059669" }}>
                          SGD{formatPrice(item[col.key])}
                        </span>
                      ) : col.key === "quantity_in_stock" ? (
                        <span style={{ fontWeight: 700, fontSize: 13 }}>
                          {item[col.key]}
                        </span>
                      ) : col.key === "item_name" ? (
                        cleanName(item[col.key])
                      ) : (
                        item[col.key]
                      )}
                    </td>
                  ))}

                  {/* Actions - show based on permissions */}
                  {showActions && (
                    <td
                      style={{
                        padding: "12px 16px",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          justifyContent: "center",
                        }}
                      >
                        {/* Edit button - if user can edit qty or location */}
                        {(permissions.edit_quantity ||
                          permissions.edit_location) && (
                          <button
                            style={{
                              background: "#EEF2FF",
                              border: "none",
                              borderRadius: 7,
                              padding: "6px 12px",
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#6366F1",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            ✏️ Edit
                          </button>
                        )}

                        {/* Delete button - only if user can delete */}
                        {permissions.delete_item && (
                          <button
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
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={visibleColumns.length + (showActions ? 1 : 0)}
                  style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}
                >
                  {q
                    ? `No items match "${searchTerm}"`
                    : "No items in inventory"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Permission Restrictions Notice */}
      {(!permissions.view_unit_price || !permissions.view_total_value) && (
        <div
          style={{
            background: "#FEF3C7",
            border: "1px solid #FCD34D",
            borderRadius: 10,
            padding: "10px 16px",
            marginTop: 16,
            fontSize: 12,
            color: "#92400E",
          }}
        >
          ⚠️ Some columns are hidden based on your role permissions.
          {!permissions.edit_quantity && " You cannot edit quantities."}
          {!permissions.add_item && " You cannot add new items."}
          {!permissions.delete_item && " You cannot delete items."}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   IMPORTANT — ONE MORE CHANGE NEEDED IN YOUR LAYOUT COMPONENT
   (the file that renders the Sidebar next to the page content)

   The content area is a flex child, and flex children refuse to shrink
   below their content width unless you set minWidth: 0. Without this,
   the table can still stretch the page. It should look like:

   <div style={{ display: "flex" }}>
     <Sidebar />
     <main style={{ flex: 1, minWidth: 0 }}>   // ← minWidth: 0 is the key
       <Outlet />   // or {children}
     </main>
   </div>

   If your layout uses CSS Grid instead:
   gridTemplateColumns: "280px minmax(0, 1fr)"
   ───────────────────────────────────────────────────────────────────── */
