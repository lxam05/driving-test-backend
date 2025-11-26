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

app.use(express.json());
app.use(cookieParser());

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://127.0.0.1:5500',
      'http://localhost:5500',
      'http://127.0.0.1:5501',
      'http://localhost:5501',
      'http://127.0.0.1:5502',
      'http://localhost:5502',
      'http://127.0.0.1:5503',
      'http://localhost:5503',
      'https://driving-test-backend-production.up.railway.app'
    ];
    
    // Check if origin matches allowed origins or is a localhost/127.0.0.1 port
    if (allowedOrigins.includes(origin) || 
        /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) || 
        /^http:\/\/localhost:\d+$/.test(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization']
}));




// Mount routes
app.use('/auth', authRoutes);
app.use('/mock-tests', mockTestRoutes);
app.use('/chatbot', chatbotRoutes);

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

app.listen(PORT, () => {
  console.log(`🔥 SERVER RUNNING on port ${PORT}`);
  console.log(`📍 Test endpoint: http://localhost:${PORT}/`);
  console.log(`📍 Auth ping: http://localhost:${PORT}/auth/ping`);
});

app.get("/auth/protected", authMiddleware, (req, res) => {
  res.json({
    message: "You accessed a protected route!",
    user: req.user
  });
});
