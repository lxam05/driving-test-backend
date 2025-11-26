import pkg from "pg";
const { Pool } = pkg;

let pool;

try {
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️ DATABASE_URL not set - database features will be unavailable');
    pool = {
      query: () => Promise.reject(new Error('Database not configured')),
    };
  } else {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    pool.query('SELECT NOW()')
      .then(() => console.log('📦 Database connected successfully'))
      .catch(err => console.warn('⚠ DB connection test failed:', err.message));
  }
} catch(err) {
  console.error('❌ Error creating pool:', err.message);
  pool = {
    query: () => Promise.reject(new Error('Database pool creation failed')),
  };
}

export default pool;
