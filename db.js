import pkg from "pg";
const { Pool } = pkg;

let pool;

try {
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️ DATABASE_URL not set - database features will be unavailable');
    // Create a dummy pool that will fail gracefully
    pool = {
      query: () => Promise.reject(new Error('Database not configured')),
    };
  } else {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      },
    });
    
    // Test connection asynchronously (don't block startup)
    pool.query('SELECT NOW()')
      .then(() => console.log('✅ Database connection successful'))
      .catch((err) => console.warn('⚠️ Database connection test failed (will retry on first query):', err.message));
  }
} catch (err) {
  console.error('❌ Error creating database pool:', err.message);
  // Create a dummy pool that will fail gracefully
  pool = {
    query: () => Promise.reject(new Error('Database pool creation failed')),
  };
}

export default pool;
