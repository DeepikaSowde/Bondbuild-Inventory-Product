const { Pool } = require("pg");
require("dotenv").config();

// ============================================================
// Connection config
// - Production (Neon/Render/DigitalOcean): set DATABASE_URL, SSL on.
// - Local dev: use the individual DB_* vars (no SSL).
// ============================================================
const useConnectionString = !!process.env.DATABASE_URL;

const pool = new Pool(
  useConnectionString
    ? {
        connectionString: process.env.DATABASE_URL,
        // Neon and most managed Postgres require SSL.
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        // Allow optionally enabling SSL locally via DB_SSL=true
        ssl:
          process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      },
);

pool.on("connect", () => {
  console.log(
    `✅ PostgreSQL connected (${useConnectionString ? "DATABASE_URL" : "DB_* vars"})`,
  );
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL error:", err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
