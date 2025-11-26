import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import mockTestRoutes from './routes/mockTests.js';
import chatbotRoutes from './routes/chatbot.js';
import authMiddleware from "./middleware/auth.js";
import pool from './db.js';

// Better error handling - prevent crashes
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION (server will continue):', err);
  // Don't exit - let the server keep running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION (server will continue):', reason);
  // Don't exit - let the server keep running
});

dotenv.config();

const app = express();

// Simple health check (doesn't require database) - Railway needs this
// MUST be registered BEFORE other middleware to ensure it's always accessible
app.get('/health', (req, res) => {
  console.log('🏥 Health check called');
  res.status(200).send('OK');
});

// CORS must be configured BEFORE other middleware
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    
    // Always allow localhost and 127.0.0.1 on any port
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    
    // Allow Railway backend URL
    if (origin === 'https://driving-test-backend-production.up.railway.app') {
      return callback(null, true);
    }
    
    // Allow all origins for now (you can restrict later)
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Mount routes
app.use('/auth', authRoutes);
app.use('/mock-tests', mockTestRoutes);
app.use('/chatbot', chatbotRoutes);

// Root test route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Backend running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Database health check (separate endpoint)
app.get('/health/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'healthy',
      database: 'connected',
      timestamp: result.rows[0].now 
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'unhealthy',
      database: 'disconnected',
      error: err.message 
    });
  }
});

const PORT = process.env.PORT || 3000;

// Error handling middleware (must be last, before 404)
app.use((err, req, res, next) => {
  console.error('❌ Request Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// 404 handler (must be absolute last)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🔥 SERVER RUNNING on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 Health: http://0.0.0.0:${PORT}/health`);
  
  // Small delay to ensure server is fully ready
  setTimeout(() => {
    console.log('✅ Server fully initialized and ready');
  }, 100);
});

// Handle server errors
server.on('error', (err) => {
  console.error('❌ Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  }
});

// Protected route (moved after server starts)
app.get("/auth/protected", authMiddleware, (req, res) => {
  res.json({
    message: "You accessed a protected route!",
    user: req.user
  });
});
