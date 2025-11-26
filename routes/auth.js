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
