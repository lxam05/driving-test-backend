import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';

dotenv.config();

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use(cors({
  origin: "http://localhost:5173",
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
