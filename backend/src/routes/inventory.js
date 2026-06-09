// backend/src/routes/inventory.js
// Complete inventory routes with summary endpoint

const express = require("express");
const router = express.Router();
const pool = require("../config/db");

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

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity_in_stock, unit_price, remarks } = req.body;

    const updateResult = await pool.query(
      `UPDATE inventory 
       SET quantity_in_stock = COALESCE($1, quantity_in_stock),
           unit_price = COALESCE($2, unit_price),
           remarks = COALESCE($3, remarks),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [quantity_in_stock, unit_price, remarks, id],
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
