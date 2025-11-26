import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import mockTestRoutes from './routes/mockTests.js';
import chatbotRoutes from './routes/chatbot.js';
import authMiddleware from "./middleware/auth.js";
import pool from './db.js';  // Import pool instead of Pool from pg

// Better error handling
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
  console.error('Stack:', err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION at:', promise);
  console.error('Reason:', reason);
});

dotenv.config();

console.log('🔧 Environment check:');
console.log('  - PORT:', process.env.PORT || '3000 (default)');
console.log('  - DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'NOT SET');
console.log('  - JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'NOT SET');
console.log('  - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set' : 'NOT SET');

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use(cors({
  origin: [
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://127.0.0.1:5501',
    'http://localhost:5501',
    'http://127.0.0.1:5502',
    'http://localhost:5502',
    'https://driving-test-backend-production.up.railway.app'
  ],
  credentials: true
}));




// Mount routes with error handling
console.log('📦 Loading routes...');
try {
  app.use('/auth', authRoutes);
  console.log('  ✓ Auth routes loaded');
} catch (err) {
  console.error('❌ Error loading auth routes:', err);
  // Don't throw - allow server to start even if one route fails
}

try {
  app.use('/mock-tests', mockTestRoutes);
  console.log('  ✓ Mock test routes loaded');
} catch (err) {
  console.error('❌ Error loading mock test routes:', err);
}

try {
  app.use('/chatbot', chatbotRoutes);
  console.log('  ✓ Chatbot routes loaded');
} catch (err) {
  console.error('❌ Error loading chatbot routes:', err);
}

// Root test route
app.get('/', (req, res) => {
  res.json({ message: 'Backend running' });
});

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

// Start server with error handling
try {
// Make sure PORT is dynamic for Railway hosting
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🔥 SERVER RUNNING on port ${PORT}`);
  console.log(`📍 Test endpoint: http://localhost:${PORT}/`);
  console.log(`📍 Auth ping: http://localhost:${PORT}/auth/ping`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});

} catch (err) {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
}

app.get("/auth/protected", authMiddleware, (req, res) => {
  res.json({
    message: "You accessed a protected route!",
    user: req.user
  });
});
