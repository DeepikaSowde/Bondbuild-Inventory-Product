// backend/src/routes/inventory.js
// Complete inventory routes with summary endpoint

const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");

// Who may edit a stock item, and which fields. Mirrors the frontend
// stockPermissions.js so the UI and API agree: full editors change every
// field; limited editors (Factory In-charge / Supervisor) may only move stock
// (Location) and/or adjust Quantity. Roles absent here cannot edit at all.
const STOCK_EDIT = {
  Admin: { full: true, location: true, quantity: true },
  Purchaser: { full: true, location: true, quantity: true },
  Manager: { full: true, location: true, quantity: true },
  "Factory In-charge": { full: false, location: true, quantity: true },
  Supervisor: { full: false, location: false, quantity: true },
};

// ================================================================================
// GET /api/inventory/summary - Dashboard summary (total items, low stock, etc)
// ================================================================================

router.get("/summary", async (req, res) => {
  try {
    console.log("📊 Fetching inventory summary...");

    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_items,
        COALESCE(SUM(quantity_in_stock), 0) as total_pieces,
        COUNT(CASE WHEN stock_status = 'OK' THEN 1 END) as ok_items,
        COUNT(CASE WHEN stock_status = 'LOW_STOCK' THEN 1 END) as low_stock_items,
        COUNT(CASE WHEN stock_status = 'OUT_OF_STOCK' THEN 1 END) as out_of_stock_items,
        COALESCE(SUM(total_value), 0) as total_value
      FROM inventory
    `);

    const data = result.rows[0];
    console.log("✅ Inventory summary:", data);

    res.json({
      total_items: parseInt(data.total_items) || 0,
      total_pieces: parseInt(data.total_pieces) || 0,
      ok_items: parseInt(data.ok_items) || 0,
      low_stock_items: parseInt(data.low_stock_items) || 0,
      out_of_stock_items: parseInt(data.out_of_stock_items) || 0,
      total_value: parseFloat(data.total_value) || 0,
    });
  } catch (err) {
    console.error("❌ Error fetching inventory summary:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ================================================================================
// GET /api/inventory - Get all inventory items
// ================================================================================

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM inventory ORDER BY item_code ASC`,
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error("❌ Error fetching inventory:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ================================================================================
// POST /api/inventory - Create a NEW inventory item (Add Item)
// ================================================================================

router.post("/", async (req, res) => {
  try {
    const {
      location_code,
      item_code, // this is the "Profile Code" (e.g. LA-051)
      profile_name,
      size,
      length,
      quantity_in_stock,
      unit_price,
      remarks,
    } = req.body;

    // --- Validate required fields (all required except remarks) ---
    const missing = [];
    if (!location_code) missing.push("Location");
    if (!item_code) missing.push("Profile Code");
    if (!profile_name) missing.push("Profile");
    if (size === undefined || size === null || size === "")
      missing.push("Size");
    if (length === undefined || length === null || length === "")
      missing.push("Length");
    if (
      quantity_in_stock === undefined ||
      quantity_in_stock === null ||
      quantity_in_stock === ""
    )
      missing.push("Qty");
    if (unit_price === undefined || unit_price === null || unit_price === "")
      missing.push("Unit Price");

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: " + missing.join(", "),
      });
    }

    // --- Resolve profile_id (look up by name or code, create if missing) ---
    let profileId = null;
    const profileCode = String(item_code).substring(0, 2).toUpperCase();
    const profileResult = await pool.query(
      "SELECT id FROM inventory_profiles WHERE profile_name = $1 OR profile_code = $2 LIMIT 1",
      [profile_name, profileCode],
    );
    if (profileResult.rows.length > 0) {
      profileId = profileResult.rows[0].id;
    } else {
      const createProfile = await pool.query(
        `INSERT INTO inventory_profiles (profile_code, profile_name, status)
         VALUES ($1, $2, 'Active')
         RETURNING id`,
        [profileCode, profile_name],
      );
      profileId = createProfile.rows[0].id;
    }

    // --- Resolve location_id (look up by code, create if missing) ---
    let locationId = null;
    const locationResult = await pool.query(
      "SELECT id FROM storage_locations WHERE location_code = $1",
      [location_code],
    );
    if (locationResult.rows.length > 0) {
      locationId = locationResult.rows[0].id;
    } else {
      const createLocation = await pool.query(
        `INSERT INTO storage_locations (location_code, location_name, location_type, status)
         VALUES ($1, $2, 'Pallet', 'Active')
         RETURNING id`,
        [location_code, location_code],
      );
      locationId = createLocation.rows[0].id;
    }

    // --- Compute derived values ---
    const qty = parseInt(quantity_in_stock) || 0;
    const price = parseFloat(unit_price) || 0;
    const totalValue = qty * price;

    let stockStatus = "OK";
    if (qty === 0) stockStatus = "OUT_OF_STOCK";
    else if (qty <= 10) stockStatus = "LOW_STOCK";

    // --- Insert the new item (item_name not used) ---
    const insertResult = await pool.query(
      `INSERT INTO inventory (
        item_code, location_id, location_code, profile_id,
        profile_name, size, length, quantity_in_stock, unit_price,
        total_value, stock_status, low_stock_threshold, reorder_quantity,
        remarks, is_active, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW()
      )
      RETURNING *`,
      [
        item_code,
        locationId,
        location_code,
        profileId,
        profile_name,
        size || null,
        parseFloat(length) || 0,
        qty,
        price,
        totalValue,
        stockStatus,
        10, // low_stock_threshold
        50, // reorder_quantity
        remarks || null,
        true, // is_active
      ],
    );

    console.log(`✅ New item created: ${item_code}`);

    res.status(201).json({
      success: true,
      data: insertResult.rows[0],
      message: "Item created successfully",
    });
  } catch (err) {
    // Unique violation on item_code
    if (err.code === "23505") {
      return res.status(409).json({
        success: false,
        error: `Profile Code "${req.body.item_code}" already exists`,
      });
    }
    console.error("❌ Error creating item:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ================================================================================
// GET /api/inventory/:id - Get single inventory item
// ================================================================================

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query("SELECT * FROM inventory WHERE id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    console.error("❌ Error fetching item:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ================================================================================
// GET /api/inventory/low-stock - Get low stock items
// ================================================================================

router.get("/filter/low-stock", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM inventory WHERE stock_status = 'LOW_STOCK' ORDER BY quantity_in_stock ASC`,
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error("❌ Error fetching low stock items:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ================================================================================
// GET /api/inventory/out-of-stock - Get out of stock items
// ================================================================================

router.get("/filter/out-of-stock", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM inventory WHERE stock_status = 'OUT_OF_STOCK' ORDER BY item_code ASC`,
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error("❌ Error fetching out of stock items:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ================================================================================
// POST /api/inventory/add-stock - Add stock to an item
// ================================================================================

router.post("/add-stock", async (req, res) => {
  try {
    const { item_id, quantity, remarks } = req.body;

    if (!item_id || !quantity) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: item_id, quantity",
      });
    }

    // Get current item
    const itemResult = await pool.query(
      "SELECT * FROM inventory WHERE id = $1",
      [item_id],
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
      });
    }

    const currentItem = itemResult.rows[0];
    const newQty = parseInt(currentItem.quantity_in_stock) + parseInt(quantity);
    const newTotal = newQty * parseFloat(currentItem.unit_price);

    // Determine new status
    let newStatus = "OK";
    if (newQty === 0) newStatus = "OUT_OF_STOCK";
    else if (newQty <= 10) newStatus = "LOW_STOCK";

    // Update inventory
    const updateResult = await pool.query(
      `UPDATE inventory 
       SET quantity_in_stock = $1, 
           total_value = $2, 
           stock_status = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [newQty, newTotal, newStatus, item_id],
    );

    // Log stock movement
    await pool.query(
      `INSERT INTO stock_movements (item_id, movement_type, quantity, remarks, created_at)
       VALUES ($1, 'ADD', $2, $3, NOW())`,
      [item_id, quantity, remarks || "Stock added"],
    );

    console.log(`✅ Stock added: ${item_id} + ${quantity}`);

    res.json({
      success: true,
      data: updateResult.rows[0],
      message: `Added ${quantity} units`,
    });
  } catch (err) {
    console.error("❌ Error adding stock:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ================================================================================
// POST /api/inventory/remove-stock - Remove stock from an item
// ================================================================================

router.post("/remove-stock", async (req, res) => {
  try {
    const { item_id, quantity, remarks } = req.body;

    if (!item_id || !quantity) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: item_id, quantity",
      });
    }

    // Get current item
    const itemResult = await pool.query(
      "SELECT * FROM inventory WHERE id = $1",
      [item_id],
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
      });
    }

    const currentItem = itemResult.rows[0];
    const newQty = Math.max(
      0,
      parseInt(currentItem.quantity_in_stock) - parseInt(quantity),
    );
    const newTotal = newQty * parseFloat(currentItem.unit_price);

    // Determine new status
    let newStatus = "OK";
    if (newQty === 0) newStatus = "OUT_OF_STOCK";
    else if (newQty <= 10) newStatus = "LOW_STOCK";

    // Update inventory
    const updateResult = await pool.query(
      `UPDATE inventory 
       SET quantity_in_stock = $1, 
           total_value = $2, 
           stock_status = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [newQty, newTotal, newStatus, item_id],
    );

    // Log stock movement
    await pool.query(
      `INSERT INTO stock_movements (item_id, movement_type, quantity, remarks, created_at)
       VALUES ($1, 'REMOVE', $2, $3, NOW())`,
      [item_id, quantity, remarks || "Stock removed"],
    );

    console.log(`✅ Stock removed: ${item_id} - ${quantity}`);

    res.json({
      success: true,
      data: updateResult.rows[0],
      message: `Removed ${quantity} units`,
    });
  } catch (err) {
    console.error("❌ Error removing stock:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ================================================================================
// PUT /api/inventory/:id - Update inventory item
// ================================================================================

// Admin-only. Edits every field and recomputes total_value / stock_status.
router.put("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      location_code,
      item_code, // "Profile Code" (e.g. LA-051)
      profile_name,
      size,
      length,
      quantity_in_stock,
      unit_price,
      remarks,
    } = req.body;

    const caps = STOCK_EDIT[req.user?.role];
    if (!caps) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to edit inventory items",
      });
    }

    // --- Limited editors (FIC / Supervisor): only the fields their role may
    //     change. Other submitted fields are ignored, not trusted. ---
    if (!caps.full) {
      const current = await pool.query(
        "SELECT unit_price FROM inventory WHERE id = $1",
        [id],
      );
      if (current.rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, error: "Item not found" });
      }

      const sets = [];
      const values = [];
      let p = 1;

      if (caps.location) {
        if (!location_code || String(location_code).trim() === "") {
          return res.status(400).json({
            success: false,
            error: "Missing required fields: Location",
          });
        }
        // Resolve location_id (look up by code, create if missing)
        let locationId = null;
        const locationResult = await pool.query(
          "SELECT id FROM storage_locations WHERE location_code = $1",
          [location_code],
        );
        if (locationResult.rows.length > 0) {
          locationId = locationResult.rows[0].id;
        } else {
          const createLocation = await pool.query(
            `INSERT INTO storage_locations (location_code, location_name, location_type, status)
             VALUES ($1, $2, 'Pallet', 'Active')
             RETURNING id`,
            [location_code, location_code],
          );
          locationId = createLocation.rows[0].id;
        }
        sets.push(`location_code = $${p++}`);
        values.push(String(location_code).trim());
        sets.push(`location_id = $${p++}`);
        values.push(locationId);
      }

      if (caps.quantity) {
        if (
          quantity_in_stock === undefined ||
          quantity_in_stock === null ||
          quantity_in_stock === ""
        ) {
          return res
            .status(400)
            .json({ success: false, error: "Missing required fields: Qty" });
        }
        const qty = parseInt(quantity_in_stock);
        if (isNaN(qty) || qty < 0) {
          return res
            .status(400)
            .json({ success: false, error: "Qty cannot be negative" });
        }
        const price = parseFloat(current.rows[0].unit_price) || 0;
        let stockStatus = "OK";
        if (qty === 0) stockStatus = "OUT_OF_STOCK";
        else if (qty <= 10) stockStatus = "LOW_STOCK";
        sets.push(`quantity_in_stock = $${p++}`);
        values.push(qty);
        sets.push(`total_value = $${p++}`);
        values.push(qty * price);
        sets.push(`stock_status = $${p++}`);
        values.push(stockStatus);
      }

      if (sets.length === 0) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to edit these fields",
        });
      }

      sets.push(`updated_at = NOW()`);
      values.push(id);
      const limitedResult = await pool.query(
        `UPDATE inventory SET ${sets.join(", ")} WHERE id = $${p} RETURNING *`,
        values,
      );
      console.log(`✅ Item ${id} updated (limited: ${req.user.role})`);
      return res.json({ success: true, data: limitedResult.rows[0] });
    }

    // --- Full editors (Admin / Purchaser / Manager): all fields. ---
    // --- Validate required fields (all required except remarks) ---
    const missing = [];
    if (!location_code) missing.push("Location");
    if (!item_code) missing.push("Profile Code");
    if (!profile_name) missing.push("Profile");
    if (size === undefined || size === null || size === "") missing.push("Size");
    if (length === undefined || length === null || length === "")
      missing.push("Length");
    if (
      quantity_in_stock === undefined ||
      quantity_in_stock === null ||
      quantity_in_stock === ""
    )
      missing.push("Qty");
    if (unit_price === undefined || unit_price === null || unit_price === "")
      missing.push("Unit Price");

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: " + missing.join(", "),
      });
    }

    // --- Resolve profile_id (look up by name or code, create if missing) ---
    const profileCode = String(item_code).substring(0, 2).toUpperCase();
    let profileId = null;
    const profileResult = await pool.query(
      "SELECT id FROM inventory_profiles WHERE profile_name = $1 OR profile_code = $2 LIMIT 1",
      [profile_name, profileCode],
    );
    if (profileResult.rows.length > 0) {
      profileId = profileResult.rows[0].id;
    } else {
      const createProfile = await pool.query(
        `INSERT INTO inventory_profiles (profile_code, profile_name, status)
         VALUES ($1, $2, 'Active')
         RETURNING id`,
        [profileCode, profile_name],
      );
      profileId = createProfile.rows[0].id;
    }

    // --- Resolve location_id (look up by code, create if missing) ---
    let locationId = null;
    const locationResult = await pool.query(
      "SELECT id FROM storage_locations WHERE location_code = $1",
      [location_code],
    );
    if (locationResult.rows.length > 0) {
      locationId = locationResult.rows[0].id;
    } else {
      const createLocation = await pool.query(
        `INSERT INTO storage_locations (location_code, location_name, location_type, status)
         VALUES ($1, $2, 'Pallet', 'Active')
         RETURNING id`,
        [location_code, location_code],
      );
      locationId = createLocation.rows[0].id;
    }

    // --- Recompute derived values ---
    const qty = parseInt(quantity_in_stock) || 0;
    const price = parseFloat(unit_price) || 0;
    const totalValue = qty * price;

    let stockStatus = "OK";
    if (qty === 0) stockStatus = "OUT_OF_STOCK";
    else if (qty <= 10) stockStatus = "LOW_STOCK";

    const updateResult = await pool.query(
      `UPDATE inventory
       SET location_code = $1,
           location_id = $2,
           item_code = $3,
           profile_name = $4,
           profile_id = $5,
           size = $6,
           length = $7,
           quantity_in_stock = $8,
           unit_price = $9,
           total_value = $10,
           stock_status = $11,
           remarks = $12,
           updated_at = NOW()
       WHERE id = $13
       RETURNING *`,
      [
        location_code,
        locationId,
        item_code,
        profile_name,
        profileId,
        size,
        length,
        qty,
        price,
        totalValue,
        stockStatus,
        remarks ?? null,
        id,
      ],
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
      });
    }

    console.log(`✅ Item updated: ${id}`);

    res.json({
      success: true,
      data: updateResult.rows[0],
    });
  } catch (err) {
    console.error("❌ Error updating item:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ================================================================================
// DELETE /api/inventory/:id - Delete inventory item
// ================================================================================

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deleteResult = await pool.query(
      "DELETE FROM inventory WHERE id = $1 RETURNING *",
      [id],
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
      });
    }

    console.log(`✅ Item deleted: ${id}`);

    res.json({
      success: true,
      message: "Item deleted successfully",
    });
  } catch (err) {
    console.error("❌ Error deleting item:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
