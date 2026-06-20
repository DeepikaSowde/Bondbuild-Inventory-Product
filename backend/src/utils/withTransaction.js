// src/utils/withTransaction.js
// Small helper so PR/PO routes can run all-or-nothing operations.
// Uses your EXISTING pool exported from ../config/db (module.exports = { query, pool }).
const db = require("../config/db");

// Usage:
//   const result = await withTransaction(async (client) => {
//     await client.query("UPDATE ...");
//     await client.query("INSERT ...");
//     return something;
//   });
// If any query throws, everything rolls back automatically.
async function withTransaction(fn) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { withTransaction };
