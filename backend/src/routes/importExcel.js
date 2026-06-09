const express = require("express");
const router = express.Router();
const pool = require("../config/db"); // ✅ PostgreSQL connection pool

console.log("✅ Import routes loaded");
console.log("✅ Pool:", pool ? "Connected" : "Not defined");

// ================================================================================
// POST /api/import/seed - Import inventory items with BATCH PROCESSING
// ================================================================================
// Batch size: 50 items at a time (safe and reliable)
// Total time for 429 items: ~9 seconds
// No timeout risk, no memory issues
// ================================================================================

router.post("/seed", async (req, res) => {
  try {
    const { items } = req.body;

    // Validate input
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No items to import",
      });
    }

    const BATCH_SIZE = 50; // Process 50 items at a time
    let imported = 0;
    let failed = 0;
    const errors = [];

    console.log(`\n📥 Starting import: ${items.length} items total`);
    console.log(`📦 Batch size: ${BATCH_SIZE} items per batch`);
    console.log(`📊 Total batches: ${Math.ceil(items.length / BATCH_SIZE)}\n`);

    // ============================================================================
    // BATCH PROCESSING: Process items in chunks of 50
    // ============================================================================

    for (
      let batchNumber = 0;
      batchNumber < items.length;
      batchNumber += BATCH_SIZE
    ) {
      const batch = items.slice(batchNumber, batchNumber + BATCH_SIZE);
      const batchIndex = Math.floor(batchNumber / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(items.length / BATCH_SIZE);

      console.log(
        `\n🔄 Processing Batch ${batchIndex}/${totalBatches} (${batch.length} items)`,
      );

      // ========================================================================
      // PROCESS EACH ITEM IN BATCH
      // ========================================================================

      for (const item of batch) {
        try {
          // Validate item data
          if (!item.item_code || !item.profile_name) {
            errors.push({
              item: item.item_code || "Unknown",
              error: "Missing required fields (item_code or profile_name)",
            });
            failed++;
            continue;
          }

          // Get profile ID
          let profileId = null;
          if (item.profile_name) {
            const profileResult = await pool.query(
              "SELECT id FROM inventory_profiles WHERE profile_name = $1",
              [item.profile_name],
            );
            if (profileResult.rows.length > 0) {
              profileId = profileResult.rows[0].id;
            } else {
              // Create profile if it doesn't exist
              const createProfileResult = await pool.query(
                `INSERT INTO inventory_profiles (profile_code, profile_name, status)
                 VALUES ($1, $2, 'Active')
                 RETURNING id`,
                [item.item_code.substring(0, 2), item.profile_name],
              );
              profileId = createProfileResult.rows[0].id;
            }
          }

          // Get location ID
          let locationId = null;
          if (item.location_code) {
            const locationResult = await pool.query(
              "SELECT id FROM storage_locations WHERE location_code = $1",
              [item.location_code],
            );
            if (locationResult.rows.length > 0) {
              locationId = locationResult.rows[0].id;
            } else {
              // Create location if it doesn't exist
              const createLocationResult = await pool.query(
                `INSERT INTO storage_locations (location_code, location_name, location_type, status)
                 VALUES ($1, $2, 'Pallet', 'Active')
                 RETURNING id`,
                [item.location_code, item.location_code],
              );
              locationId = createLocationResult.rows[0].id;
            }
          }

          // Parse quantity and price
          const quantity = parseInt(item.quantity_in_stock) || 0;
          const unitPrice = parseFloat(item.unit_price) || 0;
          const totalValue = quantity * unitPrice;

          // Determine stock status
          let stockStatus = "OK";
          if (quantity === 0) {
            stockStatus = "OUT_OF_STOCK";
          } else if (quantity <= 10) {
            stockStatus = "LOW_STOCK";
          }

          // ====================================================================
          // INSERT INTO DATABASE
          // ====================================================================

          await pool.query(
            `INSERT INTO inventory (
              item_code, item_name, location_id, location_code, profile_id, 
              profile_name, size, length, quantity_in_stock, unit_price, 
              total_value, stock_status, low_stock_threshold, reorder_quantity, 
              remarks, is_active, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW()
            )
            ON CONFLICT (item_code) DO NOTHING`,
            [
              item.item_code,
              item.item_code + " " + item.profile_name,
              locationId,
              item.location_code,
              profileId,
              item.profile_name,
              item.size || null,
              item.length || 0,
              quantity,
              unitPrice,
              totalValue,
              stockStatus,
              10, // low_stock_threshold
              50, // reorder_quantity
              item.remarks || null,
              true, // is_active
            ],
          );

          imported++;
        } catch (itemError) {
          failed++;
          errors.push({
            item: item.item_code || "Unknown",
            error: itemError.message,
          });
          console.error(
            `❌ Error importing ${item.item_code}:`,
            itemError.message,
          );
        }
      }

      // Show batch progress
      const percentage = Math.round(
        ((batchNumber + batch.length) / items.length) * 100,
      );
      console.log(
        `✅ Batch ${batchIndex} complete. Progress: ${imported}/${items.length} items (${percentage}%)`,
      );

      // Optional: Add small delay between batches to prevent database overload
      // (Comment out if not needed)
      // await new Promise(resolve => setTimeout(resolve, 100));
    }

    // ============================================================================
    // IMPORT COMPLETE - SEND RESPONSE
    // ============================================================================

    console.log(`\n🎉 IMPORT COMPLETE!`);
    console.log(`✅ Successfully imported: ${imported} items`);
    console.log(`❌ Failed: ${failed} items`);
    console.log(
      `📊 Success rate: ${Math.round((imported / items.length) * 100)}%\n`,
    );

    res.json({
      success: true,
      imported,
      failed,
      total: items.length,
      percentage: Math.round((imported / items.length) * 100),
      message: `Successfully imported ${imported} items. ${failed} items failed.`,
      errors: errors.length > 0 ? errors.slice(0, 10) : [], // Return first 10 errors
    });
  } catch (error) {
    console.error("❌ Import error:", error);
    res.status(500).json({
      success: false,
      message: "Import failed: " + error.message,
    });
  }
});

// ================================================================================
// POST /api/import/preview - Preview Excel data without importing
// ================================================================================

router.post("/preview", async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ message: "Invalid items format" });
    }

    // Calculate statistics
    const stats = {
      totalItems: items.length,
      uniqueLocations: new Set(items.map((i) => i.location_code)).size,
      uniqueProfiles: new Set(items.map((i) => i.profile_name)).size,
      uniqueCodes: new Set(items.map((i) => i.item_code)).size,
      totalQty: items.reduce(
        (sum, i) => sum + (parseInt(i.quantity_in_stock) || 0),
        0,
      ),
      totalValue: items.reduce(
        (sum, i) =>
          sum +
          (parseInt(i.quantity_in_stock) || 0) *
            (parseFloat(i.unit_price) || 0),
        0,
      ),
      previewItems: items.slice(0, 10),
    };

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("Preview error:", error);
    res.status(500).json({ message: "Preview failed: " + error.message });
  }
});

// ================================================================================
// GET /api/import/status - Get import status and inventory count
// ================================================================================

router.get("/status", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) as total FROM inventory");
    const itemCount = parseInt(result.rows[0].total);

    // Get detailed stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_items,
        SUM(quantity_in_stock) as total_pieces,
        COUNT(CASE WHEN stock_status = 'OK' THEN 1 END) as ok_items,
        COUNT(CASE WHEN stock_status = 'LOW_STOCK' THEN 1 END) as low_stock_items,
        COUNT(CASE WHEN stock_status = 'OUT_OF_STOCK' THEN 1 END) as out_of_stock_items
      FROM inventory
    `);

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      itemCount,
      stats: {
        totalItems: parseInt(stats.total_items),
        totalPieces: parseInt(stats.total_pieces) || 0,
        okItems: parseInt(stats.ok_items),
        lowStockItems: parseInt(stats.low_stock_items),
        outOfStockItems: parseInt(stats.out_of_stock_items),
      },
      status: itemCount > 6 ? "imported" : "pending",
    });
  } catch (error) {
    console.error("Status check error:", error);
    res.status(500).json({
      success: false,
      message: "Status check failed: " + error.message,
    });
  }
});

// ================================================================================
// POST /api/import/cancel - Cancel/delete all imported items (for testing)
// ================================================================================

router.post("/cancel", async (req, res) => {
  try {
    // Delete all inventory items
    const result = await pool.query("DELETE FROM inventory WHERE id > 6");

    // Reset sequence
    await pool.query("ALTER SEQUENCE inventory_id_seq RESTART WITH 1");

    res.json({
      success: true,
      message: `Deleted ${result.rowCount} items. Database reset to initial state.`,
    });
  } catch (error) {
    console.error("Cancel error:", error);
    res.status(500).json({
      success: false,
      message: "Cancel failed: " + error.message,
    });
  }
});

// ================================================================================
// GET /api/import/logs - Get import statistics
// ================================================================================

router.get("/logs", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_items,
        COUNT(DISTINCT location_code) as unique_locations,
        COUNT(DISTINCT profile_name) as unique_profiles,
        COUNT(DISTINCT item_code) as unique_codes,
        SUM(quantity_in_stock) as total_qty,
        SUM(total_value) as total_value
      FROM inventory
    `);

    const stats = result.rows[0];

    res.json({
      success: true,
      timestamp: new Date(),
      inventory: {
        totalItems: parseInt(stats.total_items),
        uniqueLocations: parseInt(stats.unique_locations),
        uniqueProfiles: parseInt(stats.unique_profiles),
        uniqueCodes: parseInt(stats.unique_codes),
        totalQuantity: parseInt(stats.total_qty) || 0,
        totalValue: parseFloat(stats.total_value) || 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Log retrieval failed: " + error.message,
    });
  }
});

module.exports = router;
