import express from 'express';
import bcrypt from 'bcrypt';
import pool from '../db.js';
import jwt from "jsonwebtoken";

const router = express.Router();

// Middleware to verify JWT
function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

  if (!token) return res.status(401).json({ message: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid or expired token" });

    req.user = decoded; // attach user data
    next();
  });
}

// SIGNUP ROUTE
router.post("/signup", async (req, res) => {
  console.log("🔥 SIGNUP ROUTE HIT");

  try {
    const { email, username, password } = req.body;

    // Basic validation
    if (!email || !username || !password) {
      return res.status(400).json({ error: "Email, username and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    // Check if email already exists
    const existingByEmail = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );
    if (existingByEmail.rows.length > 0) {
      return res.status(400).json({ error: "Email is already registered" });
    }

    // Check if username already exists
    const existingByUsername = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    if (existingByUsername.rows.length > 0) {
      return res.status(400).json({ error: "Username is already taken" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const insertResult = await pool.query(
      "INSERT INTO users (email, username, password) VALUES ($1, $2, $3) RETURNING id, email, username",
      [email, username, hashedPassword]
    );

    const newUser = insertResult.rows[0];

    console.log("✅ New user created:", newUser.id);

    // For now we just confirm creation (frontend redirects to login)
    return res.status(201).json({
      message: "Account created successfully",
      user: newUser,
    });
  } catch (err) {
    console.error("🔥 SIGNUP ERROR:", err);
    return res.status(500).json({
      error: "Server error while creating account",
      details: err.message,
    });
  }
});


// Debug route
router.get('/ping', (req, res) => {
  console.log("🔥 AUTH PING HIT");
  res.json({ message: 'auth router working' });
});

// LOGIN ROUTE (only one!)
router.post('/login', async (req, res) => {
  console.log("🔥 LOGIN ROUTE HIT");

  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1", [email]
    );

    if (result.rows.length === 0)
      return res.status(400).json({ error: "Invalid email or password." });

    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Invalid email or password." });

    if (!process.env.JWT_SECRET)
      return res.status(500).json({ error: "Server config error" });

    const token = jwt.sign(
      { user_id: user.id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, email: user.email, username: user.username }
    });

  } catch (err) {
    console.error("🔥 LOGIN ERROR:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// DB test route
router.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ message: 'Database OK', timestamp: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});

// Protected route (requires valid JWT)
router.get("/protected", verifyToken, (req, res) => {
  res.json({
    message: "Authenticated ✔",
    user: req.user
  });
});


export default router;
