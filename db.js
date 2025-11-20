import pkg from 'pg';
const { Pool } = pkg;

import dotenv from 'dotenv';
dotenv.config();

// Check multiple possible Railway variable names
const connectionString = 
  process.env.DATABASE_URL || 
  process.env.POSTGRES_URL || 
  process.env.PGDATABASE ||
  process.env.POSTGRES_DATABASE_URL;

if (!connectionString) {
  console.error("❌ ERROR: No database URL found");
  console.error("❌ Checked: DATABASE_URL, POSTGRES_URL, PGDATABASE, POSTGRES_DATABASE_URL");
  console.error("❌ Available env vars:", Object.keys(process.env).filter(k => 
    k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('PG')
  ));
  process.exit(1);
}

// Log partial connection string for debugging (safe - doesn't expose password)
const urlParts = new URL(connectionString);
console.log("📡 DATABASE_URL parsed:");
console.log("   - Protocol:", urlParts.protocol);
console.log("   - Host:", urlParts.hostname);
console.log("   - Port:", urlParts.port);
console.log("   - Database:", urlParts.pathname);

// Railway PostgreSQL requires SSL
const poolConfig = {
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
};

const pool = new Pool(poolConfig);

// Handle connection errors gracefully
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test connection with better error handling
pool.connect()
  .then((client) => {
    console.log("✅ Connected to PostgreSQL");
    client.release();
  })
  .catch(err => {
    console.error("❌ Connection error:", err.message);
    console.error("❌ Error code:", err.code);
    console.error("❌ Full error:", err);
  });

export default pool;
