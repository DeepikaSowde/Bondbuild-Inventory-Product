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

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import ExcelJS from "exceljs";
import { usePaged, Pagination } from "../components/Table";

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
  const [exporting, setExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // ── Dropdown filters: Location / Profile Code / Profile ──
  const [filterLocation, setFilterLocation] = useState("");
  const [filterProfileCode, setFilterProfileCode] = useState("");
  const [filterProfileName, setFilterProfileName] = useState("");

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

  // ── Add Item modal state ──
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const EMPTY_ITEM = {
    location_code: "",
    item_code: "",
    profile_name: "",
    size: "",
    length: "",
    quantity_in_stock: "",
    unit_price: "",
    remarks: "",
  };
  const [newItem, setNewItem] = useState(EMPTY_ITEM);

  const openAdd = () => {
    setNewItem(EMPTY_ITEM);
    setAddError("");
    setAddOpen(true);
  };

  const handleAddSave = async () => {
    // Client-side validation: all required except remarks
    const required = [
      ["location_code", "Location"],
      ["item_code", "Profile Code"],
      ["profile_name", "Profile"],
      ["size", "Size"],
      ["length", "Length"],
      ["quantity_in_stock", "Qty"],
      ["unit_price", "Unit Price"],
    ];
    const missing = required
      .filter(([k]) => String(newItem[k] ?? "").trim() === "")
      .map(([, label]) => label);
    if (missing.length > 0) {
      setAddError("Please fill: " + missing.join(", "));
      return;
    }
    if (Number(newItem.quantity_in_stock) < 0) {
      setAddError("Qty cannot be negative");
      return;
    }
    try {
      setSaving(true);
      setAddError("");
      await api.post("/inventory", {
        location_code: newItem.location_code.trim(),
        item_code: newItem.item_code.trim(),
        profile_name: newItem.profile_name.trim(),
        size: newItem.size.trim(),
        length: newItem.length,
        quantity_in_stock: newItem.quantity_in_stock,
        unit_price: newItem.unit_price,
        remarks: newItem.remarks.trim(),
      });
      setAddOpen(false);
      await fetchData(); // refresh table so new item shows
    } catch (err) {
      setAddError(
        err.response?.data?.error || "Failed to add item. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Edit Item modal state ──
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({
    location_code: "",
    item_code: "",
    profile_name: "",
    size: "",
    length: "",
    quantity_in_stock: "",
    unit_price: "",
    remarks: "",
  });
  const [editError, setEditError] = useState("");

  // ── Photo state for edit modal ──
  const [existingPhotos, setExistingPhotos] = useState([]);   // photos already in DB
  const [newFiles,       setNewFiles]       = useState([]);   // files picked this session
  const [previews,       setPreviews]       = useState([]);   // object-URL previews for newFiles
  const [blobUrls,       setBlobUrls]       = useState({});   // id → blob URL for existing photos
  const [lightbox,       setLightbox]       = useState(null); // id or preview index open in lightbox
  const [lightboxSrc,   setLightboxSrc]    = useState(null); // resolved URL for lightbox img
  const photoInputRef = useRef();

  const openEdit = async (item) => {
    setEditItem(item);
    setEditForm({
      location_code: item.location_code ?? "",
      item_code: item.item_code ?? "",
      profile_name: item.profile_name ?? "",
      size: item.size ?? "",
      length: item.length ?? "",
      quantity_in_stock: item.quantity_in_stock ?? "",
      unit_price: item.unit_price ?? "",
      remarks: item.remarks ?? "",
    });
    setEditError("");
    // reset photo state
    setNewFiles([]); setPreviews([]); setBlobUrls({}); setLightbox(null); setLightboxSrc(null);
    // load existing photos from DB
    try {
      const res = await api.get(`/inventory/${item.id}/photos`);
      const photos = res.data?.data || [];
      setExistingPhotos(photos);
      // fetch blob URLs for thumbnails
      photos.forEach((p) => {
        api.get(`/inventory/photos/${p.id}/view`, { responseType: "blob" })
          .then((r) => {
            const url = URL.createObjectURL(r.data);
            setBlobUrls((prev) => ({ ...prev, [p.id]: url }));
          }).catch(() => {});
      });
    } catch {
      setExistingPhotos([]);
    }
  };

  const closeEdit = () => {
    // revoke all blob URLs to free memory
    Object.values(blobUrls).forEach((u) => URL.revokeObjectURL(u));
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setEditItem(null); setExistingPhotos([]); setNewFiles([]); setPreviews([]);
    setBlobUrls({}); setLightbox(null); setLightboxSrc(null);
  };

  const handleAddPhotos = (incoming) => {
    const arr = Array.from(incoming);
    setNewFiles((prev) => [...prev, ...arr]);
    setPreviews((prev) => [...prev, ...arr.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }))]);
  };

  const removeNewPhoto = (idx) => {
    URL.revokeObjectURL(previews[idx].url);
    setNewFiles((p)    => p.filter((_, i) => i !== idx));
    setPreviews((p) => p.filter((_, i) => i !== idx));
  };

  const removeExistingPhoto = async (photo) => {
    try {
      await api.delete(`/inventory/photos/${photo.id}`);
      URL.revokeObjectURL(blobUrls[photo.id]);
      setBlobUrls((prev) => { const n = { ...prev }; delete n[photo.id]; return n; });
      setExistingPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch { /* silent */ }
  };

  const openLightbox = (src) => { setLightboxSrc(src); setLightbox(true); };

  const handleEditSave = async () => {
    // Full validation: all required except remarks (mirrors Add Item).
    const required = [
      ["location_code", "Location"],
      ["item_code", "Profile Code"],
      ["profile_name", "Profile"],
      ["size", "Size"],
      ["length", "Length"],
      ["quantity_in_stock", "Qty"],
      ["unit_price", "Unit Price"],
    ];
    const missing = required
      .filter(([k]) => String(editForm[k] ?? "").trim() === "")
      .map(([, label]) => label);
    if (missing.length > 0) {
      setEditError("Please fill: " + missing.join(", ")); return;
    }
    if (Number(editForm.quantity_in_stock) < 0) {
      setEditError("Qty cannot be negative"); return;
    }
    if (Number(editForm.unit_price) < 0) {
      setEditError("Unit Price cannot be negative"); return;
    }
    try {
      setSaving(true);
      setEditError("");
      await api.put(`/inventory/${editItem.id}`, {
        location_code: String(editForm.location_code).trim(),
        item_code: String(editForm.item_code).trim(),
        profile_name: String(editForm.profile_name).trim(),
        size: String(editForm.size).trim(),
        length: editForm.length,
        quantity_in_stock: editForm.quantity_in_stock,
        unit_price: editForm.unit_price,
        remarks: String(editForm.remarks).trim(),
      });
      // upload any newly selected photos
      if (newFiles.length) {
        const fd = new FormData();
        newFiles.forEach((f) => fd.append("photos", f));
        await api.post(`/inventory/${editItem.id}/photos`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      closeEdit();
      await fetchData();
    } catch (err) {
      setEditError(err.response?.data?.error || "Failed to update item. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete handler ──
  const handleDelete = async (item) => {
    const ok = window.confirm(
      `Delete "${item.item_code}"? This cannot be undone.`,
    );
    if (!ok) return;
    try {
      await api.delete(`/inventory/${item.id}`);
      await fetchData(); // refresh table
    } catch (err) {
      alert(
        err.response?.data?.error || "Failed to delete item. Please try again.",
      );
    }
  };

  // ── FIX #2: search now actually filters the inventory ──
  // Computed before the loading guard below so the usePaged hook always runs
  // (hooks must not sit after a conditional return — see React error #310).
  const q = searchTerm.trim().toLowerCase();

  // Build sorted, de-duplicated option lists for the dropdown filters.
  const uniqueSorted = (key) =>
    Array.from(
      new Set(
        (Array.isArray(inventory) ? inventory : [])
          .map((item) => String(item[key] ?? "").trim())
          .filter((v) => v !== ""),
      ),
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  const locationOptions = uniqueSorted("location_code");
  const profileCodeOptions = uniqueSorted("item_code");
  const profileNameOptions = uniqueSorted("profile_name");

  const filteredInventory = (Array.isArray(inventory) ? inventory : []).filter(
    (item) => {
      // Free-text search across code / name / location
      if (
        q &&
        !(
          String(item.item_code || "").toLowerCase().includes(q) ||
          String(item.profile_name || "").toLowerCase().includes(q) ||
          String(item.location_code || "").toLowerCase().includes(q)
        )
      )
        return false;
      // Dropdown filters (exact match, empty = "All")
      if (filterLocation && String(item.location_code ?? "") !== filterLocation)
        return false;
      if (filterProfileCode && String(item.item_code ?? "") !== filterProfileCode)
        return false;
      if (filterProfileName && String(item.profile_name ?? "") !== filterProfileName)
        return false;
      return true;
    },
  );

  // Paginate the (filtered) inventory, 20 per page; reset to page 1 when the
  // active filter set changes.
  const filterKey = `${q}|${filterLocation}|${filterProfileCode}|${filterProfileName}`;
  const { page, setPage, slice: pageInventory, total, pageSize, pageCount } =
    usePaged(filteredInventory, filterKey);

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
    { key: "item_code", label: "Profile Code", show: true },
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

  // Editing the full item is Admin-only; delete still follows its own permission.
  const isAdmin = user?.role === "Admin";

  const showActions = isAdmin || permissions.delete_item;

  // ── FIX #3: clean "undefined" out of item names (backend band-aid) ──
  const cleanName = (name) => {
    if (!name) return "—";
    const cleaned = String(name)
      .replace(/\s*undefined\s*/gi, "")
      .trim();
    return cleaned || "—";
  };

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

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "Bond Build SG";
      wb.created = new Date();

      // ── Column layout (price / value columns depend on permissions) ──
      const cols = [
        { header: "S.No",         width: 6,  align: "center" },
        { header: "Location",     width: 14, align: "center" },
        { header: "Profile Code", width: 16, align: "left" },
        { header: "Profile",      width: 32, align: "left" },
        { header: "Size",         width: 12, align: "center" },
        { header: "Length",       width: 12, align: "center" },
        { header: "Quantity",     width: 12, align: "right", numFmt: "#,##0" },
        { header: "Status",       width: 16, align: "center" },
      ];
      const STATUS_COL = cols.length; // 1-based index of the Status column
      if (permissions.view_unit_price)
        cols.push({ header: "Unit Price (SGD)",  width: 17, align: "right", numFmt: '"$"#,##0.00' });
      if (permissions.view_total_value)
        cols.push({ header: "Total Value (SGD)", width: 18, align: "right", numFmt: '"$"#,##0.00' });
      cols.push({ header: "Remarks", width: 30, align: "left" });
      const totalCols = cols.length;

      const ws = wb.addWorksheet("Factory Stock", {
        views: [{ state: "frozen", xSplit: 1, ySplit: 3 }],
        pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
      });

      // ── Style helpers (mirrors the Project report export) ──
      const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
      const navyFill  = fill("FF1E3A5F");
      const totalFill = fill("FF0D2540");
      const rowFills  = [fill("FFFFFFFF"), fill("FFF0F5FF")];
      const font = (size, bold, argb = "FF1A1A2E") => ({ name: "Calibri", size, bold, color: { argb } });
      const thinBorder = (c = "FFD0D8E8") => ({
        top: { style: "thin", color: { argb: c } }, left: { style: "thin", color: { argb: c } },
        bottom: { style: "thin", color: { argb: c } }, right: { style: "thin", color: { argb: c } },
      });
      const navyBorder = thinBorder("FF2A4A6F");
      const boldTop = { ...navyBorder, top: { style: "medium", color: { argb: "FF2A4A6F" } } };

      // ── Row 1: Title ──
      const _t = new Date();
      const today = `${String(_t.getDate()).padStart(2, "0")}/${String(_t.getMonth() + 1).padStart(2, "0")}/${_t.getFullYear()}`;
      const titleRow = ws.addRow([`Bond Build SG  |  Factory Stock Report  |  Exported: ${today}`]);
      titleRow.height = 34;
      ws.mergeCells(1, 1, 1, totalCols);
      const t1 = ws.getCell(1, 1);
      t1.font = font(14, true, "FFFFFFFF");
      t1.fill = navyFill;
      t1.alignment = { vertical: "middle", horizontal: "center" };
      for (let c = 2; c <= totalCols; c++) ws.getCell(1, c).fill = navyFill;

      // ── Row 2: thin divider ──
      ws.addRow([]);
      ws.getRow(2).height = 5;
      for (let c = 1; c <= totalCols; c++) ws.getCell(2, c).fill = navyFill;

      // ── Row 3: column headers ──
      ws.addRow(cols.map((c) => c.header));
      ws.getRow(3).height = 26;
      cols.forEach((col, i) => {
        const cell = ws.getCell(3, i + 1);
        cell.font = font(10, true, "FFFFFFFF");
        cell.fill = navyFill;
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = navyBorder;
        ws.getColumn(i + 1).width = col.width;
      });

      // Status pill colors (match the on-screen badges)
      const statusStyle = {
        OK:           { bg: "FFECFDF5", fg: "FF059669" },
        LOW_STOCK:    { bg: "FFFEF3C7", fg: "FFD97706" },
        OUT_OF_STOCK: { bg: "FFFEF2F2", fg: "FFDC2626" },
      };

      // ── Data rows ──
      let totalQty = 0, totalValue = 0;
      filteredInventory.forEach((item, idx) => {
        const qty = Number(item.quantity_in_stock) || 0;
        const value = Number(item.total_value) || 0;
        totalQty += qty;
        totalValue += value;

        const vals = [
          idx + 1,
          item.location_code ?? "",
          item.item_code ?? "",
          item.profile_name ?? "",
          item.size ?? "",
          item.length ?? "",
          qty,
          item.stock_status ?? "",
        ];
        if (permissions.view_unit_price) vals.push(Number(item.unit_price) || 0);
        if (permissions.view_total_value) vals.push(value);
        vals.push(item.remarks ?? "");

        const row = ws.addRow(vals);
        row.height = 20;
        const bgFill = rowFills[idx % 2];
        cols.forEach((col, i) => {
          const cell = row.getCell(i + 1);
          cell.fill = bgFill;
          cell.font = font(10, false);
          cell.border = thinBorder();
          cell.alignment = { vertical: "middle", horizontal: col.align };
          if (col.numFmt) cell.numFmt = col.numFmt;
        });

        // Colored status cell
        const sc = statusStyle[item.stock_status] || null;
        if (sc) {
          const sCell = row.getCell(STATUS_COL);
          sCell.font = font(10, true, sc.fg);
          sCell.fill = fill(sc.bg);
        }
      });

      // ── Totals row ──
      const n = filteredInventory.length;
      const totRow = ws.addRow(cols.map((col, i) => {
        if (i === 2) return `TOTALS (${n} item${n !== 1 ? "s" : ""})`;
        if (col.header === "Quantity") return totalQty;
        if (col.header === "Total Value (SGD)") return totalValue;
        return "";
      }));
      totRow.height = 22;
      cols.forEach((col, i) => {
        const cell = totRow.getCell(i + 1);
        cell.font = font(10, true, "FFFFFFFF");
        cell.fill = totalFill;
        cell.border = boldTop;
        cell.alignment = { vertical: "middle", horizontal: col.align };
        if (col.header === "Quantity") cell.numFmt = "#,##0";
        if (col.header === "Total Value (SGD)") cell.numFmt = '"$"#,##0.00';
      });
      totRow.getCell(3).alignment = { vertical: "middle", horizontal: "left" };

      // ── Auto-filter on the header row ──
      ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: totalCols } };

      // ── Download ──
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BondBuildSG_FactoryStock_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
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
              onClick={exportToExcel}
              disabled={exporting}
              style={{
                background: exporting ? "#6EE7B7" : "#10B981",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: exporting ? "default" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {exporting ? "⏳ Exporting…" : "📥 Export Excel"}
            </button>
          )}

          {/* Add Item button - only if allowed */}
          {permissions.add_item && (
            <button
              onClick={openAdd}
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

      {/* Search + Filters */}
      {(() => {
        const selStyle = {
          padding: "10px 12px",
          borderRadius: 8,
          border: "1.5px solid #E5E7EB",
          fontSize: 13,
          outline: "none",
          background: "#fff",
          color: "#374151",
          minWidth: 160,
          flex: "1 1 160px",
        };
        const anyFilter =
          filterLocation || filterProfileCode || filterProfileName;
        return (
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 16,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              placeholder="Search by code, name, location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: "2 1 240px",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1.5px solid #E5E7EB",
                fontSize: 13,
                outline: "none",
              }}
            />

            <select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              style={selStyle}
            >
              <option value="">All Locations</option>
              {locationOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

            <select
              value={filterProfileCode}
              onChange={(e) => setFilterProfileCode(e.target.value)}
              style={selStyle}
            >
              <option value="">All Profile Codes</option>
              {profileCodeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

            <select
              value={filterProfileName}
              onChange={(e) => setFilterProfileName(e.target.value)}
              style={selStyle}
            >
              <option value="">All Profiles</option>
              {profileNameOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

            {anyFilter && (
              <button
                onClick={() => {
                  setFilterLocation("");
                  setFilterProfileCode("");
                  setFilterProfileName("");
                }}
                style={{
                  background: "#F3F4F6",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#374151",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ✕ Clear Filters
              </button>
            )}
          </div>
        );
      })()}

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
        {(q || filterLocation || filterProfileCode || filterProfileName) && (
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
              pageInventory.map((item, i) => (
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
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
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
                          {Number(item.reserved_qty) > 0 && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                color: Number(item.reserved_qty) >= Number(item.quantity_in_stock) ? "#DC2626" : "#D97706",
                                background: Number(item.reserved_qty) >= Number(item.quantity_in_stock) ? "#FEF2F2" : "#FEF3C7",
                                padding: "3px 10px",
                                borderRadius: 20,
                              }}
                              title="Reserved by a raised STOCK PO, not yet issued"
                            >
                              {Number(item.reserved_qty) >= Number(item.quantity_in_stock)
                                ? "🔒 BLOCKED"
                                : `🔒 ${item.reserved_qty} BLOCKED`}
                            </span>
                          )}
                        </span>
                      ) : col.key === "unit_price" ||
                        col.key === "total_value" ? (
                        <span style={{ fontWeight: 600, color: "#059669" }}>
                          SGD{formatPrice(item[col.key])}
                        </span>
                      ) : col.key === "quantity_in_stock" ? (
                        <span style={{ fontWeight: 700, fontSize: 13 }}>
                          {item[col.key]}
                          {Number(item.reserved_qty) > 0 && (
                            <span style={{ fontWeight: 600, fontSize: 11, color: "#6B7280", marginLeft: 6 }}>
                              ({Math.max(0, Number(item.quantity_in_stock) - Number(item.reserved_qty))} free)
                            </span>
                          )}
                        </span>
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
                        {/* Edit button - Admin only (full-item edit) */}
                        {isAdmin && (
                          <button
                            onClick={() => openEdit(item)}
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
                            onClick={() => handleDelete(item)}
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
                    : filterLocation || filterProfileCode || filterProfileName
                      ? "No items match the selected filters"
                      : "No items in inventory"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPage={setPage} />

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

      {/* ── Add Item Modal ── */}
      {addOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 14,
              width: "100%",
              maxWidth: 520,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "18px 22px",
                borderBottom: "1px solid #E5E7EB",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 800,
                  color: "#111827",
                }}
              >
                ➕ Add New Item
              </h3>
              <button
                onClick={() => !saving && setAddOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "#6B7280",
                }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 22px" }}>
              {addError && (
                <div
                  style={{
                    background: "#FEF2F2",
                    border: "1px solid #FECACA",
                    color: "#B91C1C",
                    borderRadius: 8,
                    padding: "9px 12px",
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  {addError}
                </div>
              )}

              {(() => {
                const lbl = {
                  display: "block",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#374151",
                  marginBottom: 5,
                };
                const inp = {
                  width: "100%",
                  padding: "9px 11px",
                  borderRadius: 8,
                  border: "1px solid #D1D5DB",
                  fontSize: 14,
                  boxSizing: "border-box",
                  marginBottom: 14,
                };
                const set = (k, v) => setNewItem({ ...newItem, [k]: v });
                return (
                  <>
                    <label style={lbl}>Location *</label>
                    <input
                      style={inp}
                      value={newItem.location_code}
                      onChange={(e) => set("location_code", e.target.value)}
                      placeholder="e.g. Pallet-01"
                    />

                    <label style={lbl}>Profile Code *</label>
                    <input
                      style={inp}
                      value={newItem.item_code}
                      onChange={(e) => set("item_code", e.target.value)}
                      placeholder="e.g. LA-051"
                    />

                    <label style={lbl}>Profile *</label>
                    <input
                      style={inp}
                      value={newItem.profile_name}
                      onChange={(e) => set("profile_name", e.target.value)}
                      placeholder="e.g. L-Angle"
                    />

                    <label style={lbl}>Size *</label>
                    <input
                      style={inp}
                      value={newItem.size}
                      onChange={(e) => set("size", e.target.value)}
                      placeholder="e.g. 50x50x4mm Thk"
                    />

                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={lbl}>Length *</label>
                        <input
                          style={inp}
                          type="number"
                          value={newItem.length}
                          onChange={(e) => set("length", e.target.value)}
                          placeholder="e.g. 6000"
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={lbl}>Qty *</label>
                        <input
                          style={inp}
                          type="number"
                          value={newItem.quantity_in_stock}
                          onChange={(e) =>
                            set("quantity_in_stock", e.target.value)
                          }
                          placeholder="e.g. 10"
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={lbl}>Unit Price *</label>
                        <input
                          style={inp}
                          type="number"
                          value={newItem.unit_price}
                          onChange={(e) => set("unit_price", e.target.value)}
                          placeholder="e.g. 20"
                        />
                      </div>
                    </div>

                    <label style={lbl}>Remark (optional)</label>
                    <input
                      style={inp}
                      value={newItem.remarks}
                      onChange={(e) => set("remarks", e.target.value)}
                      placeholder="Any note (optional)"
                    />
                  </>
                );
              })()}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "14px 22px",
                borderTop: "1px solid #E5E7EB",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                onClick={() => !saving && setAddOpen(false)}
                disabled={saving}
                style={{
                  background: "#F3F4F6",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#374151",
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddSave}
                disabled={saving}
                style={{
                  background: saving ? "#A5B4FC" : "#6366F1",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#fff",
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving…" : "Create Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Item Modal (all fields · Admin only) ── */}
      {editItem && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
          >
            {/* Header */}
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#111827" }}>✏️ Edit {editItem.item_code}</h3>
              <button onClick={() => !saving && closeEdit()} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#6B7280" }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 22px" }}>
              {editError && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 16 }}>
                  {editError}
                </div>
              )}

              {/* Context */}
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>
                {editItem.profile_name}{editItem.size ? ` · ${editItem.size}` : ""}{editItem.location_code ? ` · ${editItem.location_code}` : ""}
              </div>

              {/* Fields — every field is editable (Admin only) */}
              {[
                { label: "Location *",     type: "text",   key: "location_code" },
                { label: "Profile Code *", type: "text",   key: "item_code" },
                { label: "Profile *",      type: "text",   key: "profile_name" },
                { label: "Size *",         type: "text",   key: "size" },
                { label: "Length *",       type: "text",   key: "length" },
                { label: "Quantity *",     type: "number", key: "quantity_in_stock" },
                { label: "Unit Price *",   type: "number", key: "unit_price" },
                { label: "Remarks",        type: "text",   key: "remarks", placeholder: "Optional note" },
              ].map(({ label, type, key, placeholder }) => (
                <div key={key}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 5 }}>{label}</label>
                  <input
                    type={type}
                    value={editForm[key]}
                    onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                    placeholder={placeholder || ""}
                    style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: 14, boxSizing: "border-box", marginBottom: 14 }}
                  />
                </div>
              ))}

              {/* ── Photo Section ── */}
              <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 16, marginTop: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    📷 Photos {(existingPhotos.length + newFiles.length) > 0 && (
                      <span style={{ background: "#6366F1", color: "#fff", borderRadius: 99, padding: "1px 7px", marginLeft: 6, fontSize: 11 }}>
                        {existingPhotos.length + newFiles.length}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    style={{ background: "#EEF2FF", border: "1px solid #6366F1", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#6366F1", cursor: "pointer" }}
                  >
                    + Add Photos
                  </button>
                </div>

                <input ref={photoInputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                  onChange={(e) => { handleAddPhotos(e.target.files); e.target.value = ""; }} />

                {/* Drop zone when empty */}
                {existingPhotos.length === 0 && newFiles.length === 0 && (
                  <div
                    onClick={() => photoInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); handleAddPhotos(e.dataTransfer.files); }}
                    style={{ border: "2px dashed #C7D2FE", borderRadius: 10, padding: "24px 0", textAlign: "center", color: "#9CA3AF", cursor: "pointer", background: "#F8F9FF" }}
                  >
                    <div style={{ fontSize: 28 }}>📷</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>Click or drag photos here</div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>Any number of images (max 15 MB each)</div>
                  </div>
                )}

                {/* Thumbnail grid */}
                {(existingPhotos.length > 0 || newFiles.length > 0) && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                    {/* Existing DB photos */}
                    {existingPhotos.map((p) => (
                      <div key={p.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: "1px solid #E5E7EB", background: "#F3F4F6", cursor: "pointer" }}
                        onClick={() => blobUrls[p.id] && openLightbox(blobUrls[p.id])}>
                        {blobUrls[p.id]
                          ? <img src={blobUrls[p.id]} alt={p.original_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#9CA3AF" }}>⏳</div>
                        }
                        <button
                          onClick={(e) => { e.stopPropagation(); removeExistingPhoto(p); }}
                          style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >✕</button>
                      </div>
                    ))}

                    {/* New (not yet uploaded) photos */}
                    {previews.map((p, i) => (
                      <div key={`new-${i}`} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: "2px dashed #A5B4FC", background: "#F0F0FF", cursor: "pointer" }}
                        onClick={() => openLightbox(p.url)}>
                        <img src={p.url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button
                          onClick={(e) => { e.stopPropagation(); removeNewPhoto(i); }}
                          style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >✕</button>
                        <div style={{ position: "absolute", bottom: 2, left: 2, background: "#6366F1", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 4, padding: "1px 4px" }}>NEW</div>
                      </div>
                    ))}

                    {/* Add more tile */}
                    <div
                      onClick={() => photoInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); handleAddPhotos(e.dataTransfer.files); }}
                      style={{ aspectRatio: "1", borderRadius: 8, border: "2px dashed #C7D2FE", background: "#F8F9FF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9CA3AF", fontSize: 24 }}
                    >+</div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 22px", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => !saving && closeEdit()} disabled={saving}
                style={{ background: "#F3F4F6", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#374151", cursor: saving ? "not-allowed" : "pointer" }}>
                Cancel
              </button>
              <button onClick={handleEditSave} disabled={saving}
                style={{ background: saving ? "#A5B4FC" : "#6366F1", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && lightboxSrc && (
        <div onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <img src={lightboxSrc} alt="" style={{ maxHeight: "88vh", maxWidth: "88vw", borderRadius: 12, objectFit: "contain", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} />
            <button onClick={() => setLightbox(null)}
              style={{ position: "absolute", top: -12, right: -12, width: 30, height: 30, borderRadius: "50%", background: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#374151", boxShadow: "0 2px 8px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ✕
            </button>
          </div>
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
