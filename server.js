import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import authMiddleware from "./middleware/auth.js";

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

dotenv.config();

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use(cors({
  origin: [
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'https://driving-test-backend-production.up.railway.app'
  ],
  credentials: true
}));




// Mount routes
app.use('/auth', authRoutes);

// Root test route
app.get('/', (req, res) => {
  res.json({ message: 'Backend running' });
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
