// ------------------------
// ENVIRONMENT CONFIG
// ------------------------
// ENV CONFIG
import dotenv from "dotenv";

// Only load .env locally — NEVER in Railway
if (!process.env.PORT) {
  console.log("🌍 Running Local → Loading .env");
  dotenv.config();
} else {
  console.log("🚀 Running on Railway → Using built-in environment variables");
}


// ------------------------
// IMPORTS
// ------------------------
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import mockTestRoutes from './routes/mockTests.js';
import chatbotRoutes from './routes/chatbot.js';
import authMiddleware from "./middleware/auth.js";
import pool from './db.js';

// ------------------------
// ERROR HANDLING
// ------------------------
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
});

// ------------------------
// ENVIRONMENT STATUS LOG
// ------------------------
console.log("🔧 Environment check:");
console.log("  - PORT:", process.env.PORT ? process.env.PORT : "Using 3000 locally");
console.log("  - DATABASE_URL:", process.env.DATABASE_URL ? "Set" : "❌ Missing");
console.log("  - JWT_SECRET:", process.env.JWT_SECRET ? "Set" : "❌ Missing");
console.log("  - OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "Set" : "❌ Missing");

console.log("🔍 Railway PORT", process.env.PORT || "❌ No PORT received from Railway");

// ------------------------
// EXPRESS SETUP
// ------------------------
const app = express();
app.use(express.json());
app.use(cookieParser());

app.use(cors({
  origin: [
    'http://127.0.0.1:5500', 'http://localhost:5500',
    'http://127.0.0.1:5501', 'http://localhost:5501',
    'http://127.0.0.1:5502', 'http://localhost:5502',
    'https://driving-test-backend-production.up.railway.app'
  ],
  credentials: true
}));

// ------------------------
// ROUTES
// ------------------------
console.log('📦 Loading routes...');
try { app.use('/auth', authRoutes); console.log('  ✓ Auth routes loaded'); } 
catch (e) { console.error('❌ Failed to load auth routes', e); }

try { app.use('/mock-tests', mockTestRoutes); console.log('  ✓ Mock test routes loaded'); } 
catch (e) { console.error('❌ Failed to load mock test routes', e); }

try { app.use('/chatbot', chatbotRoutes); console.log('  ✓ Chatbot routes loaded'); } 
catch (e) { console.error('❌ Failed to load chatbot routes', e); }

// ------------------------
// HEALTH + ROOT
// ------------------------
app.get('/', (req,res)=>{ res.json({status:"Backend running"}) });

app.get('/health', async (req,res)=>{
  try{
    const result = await pool.query("SELECT NOW()");
    res.json({status:"healthy", database:"connected", time:result.rows[0].now});
  } catch (err){
    res.status(500).json({status:"unhealthy", database:"disconnected", error:err.message});
  }
});

// ------------------------
// RAILWAY PORT LISTENER  🚀
// ------------------------
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(PORT, "0.0.0.0", ()=>{
  console.log(`🔥 Server bound to port: ${PORT}`);
  console.log(`📍 Health: http://0.0.0.0:${PORT}/health`);
});
