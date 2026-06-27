const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "inventoryopz",
  user: "postgres",
  password: "postgres123",
});

const users = [
  {
    name: "John",
    username: "John",
    password: "Admin@123",
    role: "Admin",
    designation: "System Admin",
  },
  {
    name: "Peter Tan",
    username: "peter",
    password: "Admin@123",
    role: "Drafter",
    designation: "Drafter",
  },
  {
    name: "Freddy Lim",

    username: "freddy",
    password: "Admin@123",
    role: "Purchaser",
    designation: "Purchaser",
  },
  {
    name: "James Wong",
    username: "james",
    password: "Admin@123",
    role: "Manager",
    designation: "Project Manager",
  },
  {
    name: "Michael Lee",
    username: "Michael",
    password: "Admin@123",
    role: "QS",
    designation: "Quantity Surveyor",
  },
  {
    name: "David",
    username: "David",
    password: "Admin@123",
    role: "Supervisor",
    designation: "Site Supervisor",
  },
  {
    name: "San",
    username: "San",
    password: "Admin@123",
    role: "Factory In-charge",
    designation: "Factory In-charge",
  },
];

async function seed() {
  try {
    console.log("🌱 Seeding users...");

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await pool.query(
        `INSERT INTO users 
          (name, username, password_hash, role, designation, status)
         VALUES ($1,$2,$3,$4,$5,'Active')
         ON CONFLICT (username) DO NOTHING`,
        [u.name, u.username, hash, u.role, u.designation],
      );
      console.log(`  ✅ ${u.name} (${u.role})`);
    }

    console.log("");
    console.log("✅ All users seeded!");
    console.log("");
    console.log("📋 Login credentials:");
    console.log("─────────────────────────────────");
    users.forEach((u) => {
      console.log(
        `  ${u.username.padEnd(10)} / ${u.password.padEnd(12)} → ${u.role}`,
      );
    });
    console.log("─────────────────────────────────");
  } catch (err) {
    console.error("❌ Seed error:", err.message);
  } finally {
    await pool.end();
  }
}

seed();
