import "dotenv/config";  // 🔥 forces env to load here too
import pkg from "pg";
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ DATABASE_URL missing — cannot connect to database");
  process.exit(1); // stop server instead of limp running
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT NOW()")
  .then(() => console.log("📦 Database connected successfully"))
  .catch(err => console.error("❌ Database connection failed:", err));

export default pool;
