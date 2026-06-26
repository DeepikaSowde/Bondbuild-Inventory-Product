const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const db = require("./config/db");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// Security & Logging Middleware
// ============================================================
app.use(helmet());

// ── CORS: allow multiple origins via env (comma-separated) ──
// Set CORS_ORIGINS on Render, e.g.:
//   CORS_ORIGINS=https://your-app.vercel.app,http://localhost:5173
const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  process.env.CLIENT_URL ||
  "http://localhost:5173"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // allow non-browser tools (curl, Postman) with no origin
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(morgan("dev"));

// ============================================================
// Body Parser Middleware (IMPORTANT!)
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// Routes
// ============================================================

// Auth Routes
app.use("/api/auth", require("./routes/auth"));

// Import Routes
const importRoutes = require("./routes/importExcel");
app.use("/api/import", importRoutes);

// Inventory Routes
const inventoryRoutes = require("./routes/inventory");
app.use("/api/inventory", inventoryRoutes);

// Users Routes
const userRoutes = require("./routes/users");
app.use("/api/auth/users", userRoutes);

// Permissions Routes
const permissionsRoutes = require("./routes/permissions");
app.use("/api/permissions", permissionsRoutes);

// ============================================================
// Projects Routes
// ============================================================
const projectsRoutes = require("./routes/projects");
app.use("/api/projects", projectsRoutes);
// PR / PO module
app.use("/api", require("./routes/poReference"));
app.use("/api/purchase-requests", require("./routes/purchaseRequests"));
app.use("/api/purchase-orders", require("./routes/purchaseOrders"));
app.use("/api/pr-po-permissions", require("./routes/prPoPermissions"));
app.use("/api/purchase-orders", require("./routes/purchaseOrdersImport"));
app.use("/api/import", require("./routes/poImport"));
app.use("/api", require("./routes/poReference"));
app.use("/api", require("./routes/poDashboard"));
app.use("/api/auth", require("./routes/passwordRoutes"));
app.use("/api/home", require("./routes/homeSummary"));
// ============================================================
// Health Check Endpoint
// ============================================================
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({
      status: "ok",
      message: "InventoryOpz API running",
      database: "connected ✅",
      timestamp: new Date().toISOString(),
      endpoints: {
        auth: "/api/auth",
        import: "/api/import",
        inventory: "/api/inventory",
        users: "/api/auth/users",
        permissions: "/api/permissions",
        projects: "/api/projects",
      },
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      database: "disconnected ❌",
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================
// 404 Handler
// ============================================================
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// Error Handler
// ============================================================
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(err.status || 500).json({
    status: "error",
    message: err.message || "Internal server error",
    error: process.env.NODE_ENV === "development" ? err : {},
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 InventoryOpz Backend Server Started");
  console.log("=".repeat(60));
  console.log(`📍 Server running on port ${PORT}`);
  console.log(`🌐 Allowed origins: ${allowedOrigins.join(", ")}`);
  console.log("=".repeat(60) + "\n");
});

module.exports = app;
