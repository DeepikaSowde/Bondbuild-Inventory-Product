// Run this once to reset all test user passwords to known values.
// Usage:  node backend/scripts/reset-test-passwords.js
// Requires DATABASE_URL in .env (same as the backend uses).

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const TEST_USERS = [
  { username: "John",    password: "Admin@123",   role: "Admin"            },
  { username: "james",   password: "Manager@123", role: "Manager"          },
  { username: "peter",   password: "Drafter@123", role: "Drafter"          },
  { username: "freddy",  password: "Buyer@123",   role: "Purchaser"        },
  { username: "San",     password: "Fic@123",     role: "Factory In-charge"},
  { username: "David",   password: "Super@123",   role: "Supervisor"       },
  { username: "Michael", password: "Qs@123",      role: "QS"               },
];

async function run() {
  console.log("\n🔑  Resetting test user passwords...\n");
  for (const u of TEST_USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    const { rowCount } = await pool.query(
      "UPDATE users SET password_hash=$1 WHERE LOWER(username)=LOWER($2)",
      [hash, u.username]
    );
    if (rowCount) console.log(`  ✅  ${u.username.padEnd(10)} (${u.role}) → ${u.password}`);
    else          console.log(`  ⚠️   ${u.username} — not found in DB`);
  }
  console.log("\n✅  Done. Share the table below with the testing team.\n");
  await pool.end();
}

run().catch((e) => { console.error(e.message); process.exit(1); });
