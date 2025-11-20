import pkg from 'pg';
const { Pool } = pkg;

import dotenv from 'dotenv';
dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error("❌ ERROR: DATABASE_URL is missing from .env");
  process.exit(1);
}

console.log("📡 Connecting to DB:", process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export default pool;
