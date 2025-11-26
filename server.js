import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import mockTestRoutes from './routes/mockTests.js';
import chatbotRoutes from './routes/chatbot.js';
import authMiddleware from "./middleware/auth.js";
import pool from './db.js';  // Import pool instead of Pool from pg

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

dotenv.config();

const app = express();

// CORS must be configured BEFORE other middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or curl requests)
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
    
    // Log blocked origins for debugging
    console.log('⚠️ CORS blocked origin:', origin);
    callback(null, true); // For now, allow all origins to debug
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

// CORS test endpoint
app.options('*', cors()); // Handle all OPTIONS requests

// Health check with database status
app.get('/health', async (req, res) => {
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

// Error handling middleware (must be last)
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🔥 SERVER RUNNING on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 Test endpoint: http://0.0.0.0:${PORT}/`);
  console.log(`📍 Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`📍 Auth login: http://0.0.0.0:${PORT}/auth/login`);
});

// Handle server errors
server.on('error', (err) => {
  console.error('❌ Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  }
});

app.get("/auth/protected", authMiddleware, (req, res) => {
  res.json({
    message: "You accessed a protected route!",
    user: req.user
  });
});
