import express from 'express';
import bcrypt from 'bcrypt';
import pool from '../db.js';
import jwt from "jsonwebtoken";


const router = express.Router();

// Debug route to confirm router works
router.get('/ping', (req, res) => {
  console.log("🔥 AUTH PING HIT");
  res.json({ message: 'auth router working' });
});

// Signup route
router.post('/signup', async (req, res) => {
  console.log("🔥 SIGNUP ROUTE HIT");

  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // check if exists
    const exists = await pool.query(
      "SELECT * FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );

    if (exists.rows.length > 0) {
      return res.status(400).json({ error: "User exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3)",
      [email, username, hashed]
    );

    res.json({ message: "Signup success" });

  } catch (err) {
    console.error("🔥 SIGNUP ERROR:", err);
    
    // Provide more specific error messages
    if (err.code === '23505') { // PostgreSQL unique violation
      return res.status(400).json({ error: "User already exists" });
    }
    if (err.code === '42P01') { // Table doesn't exist
      return res.status(500).json({ error: "Database table not found. Please create the 'users' table." });
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(500).json({ error: "Database connection failed. Check your DATABASE_URL." });
    }
    
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// Login route
router.post('/login', async (req, res) => {
  console.log("🔥 LOGIN ROUTE HIT");

  try {
    const { email, password } = req.body;

    // 1. Missing fields
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    // 2. Find user by email
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const user = result.rows[0];

    // 3. Check password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    // 4. Create JWT token
    if (!process.env.JWT_SECRET) {
      console.error("⚠️ JWT_SECRET not set in environment variables");
      return res.status(500).json({ error: "Server configuration error." });
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        username: user.username   // ← add this
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    

    // 5. Send it back
    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      }
    });

  } catch (err) {
    console.error("🔥 LOGIN ERROR:", err);
    
    // Provide more specific error messages
    if (err.code === '42P01') { // Table doesn't exist
      return res.status(500).json({ error: "Database table not found. Please create the 'users' table." });
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(500).json({ error: "Database connection failed. Check your DATABASE_URL." });
    }
    
    return res.status(500).json({ error: "Server error", details: err.message });
  }
});

// Test database connection
router.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      message: 'Database connection successful',
      timestamp: result.rows[0].now 
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Database connection failed',
      details: err.message 
    });
  }
});

export default router;
