import 'dotenv/config';      // <- REQUIRED FIRST LINE
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import chatbotRoutes from "./routes/chatbot.js";
import db from "./db.js"

const app = express();

/* ================================
   🔥 CORS FIRST — REQUIRED FOR BROWSER
================================ */
app.use(cors({
  origin: [
    "https://driveflow-frontend-production.up.railway.app",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5173",     // if using vite
    "http://127.0.0.1:5173"
  ],
  credentials: true
}));


/* ================================
   🔥 ALWAYS BEFORE ROUTES
================================ */
app.use(express.json());

/* ================================
   🔥 HEALTH CHECK + ROOT
================================ */
app.get("/health", (req, res) => res.status(200).send("OK"));
app.get("/", (req, res) => res.send("Backend is running 🚀"));

/* ================================
   🔥 DATABASE CONNECT CHECK
================================ */
db.query("SELECT 1")
  .then(() => console.log("📦 Database pool connected successfully"))
  .catch(err => console.error("❌ Database connection failed:", err));

/* ================================
   🔥 ROUTES
================================ */
app.use("/auth", authRoutes);
app.use("/chatbot", chatbotRoutes);

/* ================================
   🔥 SERVER LISTEN
================================ */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server live on ${PORT}`));
