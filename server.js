import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import chatbotRoutes from "./routes/chatbot.js";
import db from "./db.js"

dotenv.config();

const app = express();

/* ============================================
   🔥 HEALTH CHECK — MUST LOAD BEFORE ANYTHING
   Keeps Railway backend alive & prevents 502
=============================================== */
app.get("/health", (req, res) => {
  console.log("🏥 Health check responded");
  res.status(200).send("OK");
});

app.get("/", (req, res) => {
  res.status(200).send("Backend is running");
});

/* ============================================
   🔥 MIDDLEWARE
=============================================== */
app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:5173",                        // local dev (optional)
      "https://YOUR_FRONTEND_DOMAIN"                 // ← I will fill this for you
    ],
    credentials: true
  })
);


/* ============================================
   🔥 DATABASE CHECK
=============================================== */
db.query("SELECT 1")
  .then(() => console.log("📦 Database pool connected successfully"))
  .catch(err => console.error("❌ Database connection failed:", err));


/* ============================================
   🔥 ROUTES
=============================================== */
app.use("/auth", authRoutes);
app.use("/chatbot", chatbotRoutes);

/* ============================================
   🔥 SERVER LISTEN (Railway compatible)
=============================================== */
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server is live on port ${PORT}`);
});
