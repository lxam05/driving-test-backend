import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import chatbotRoutes from "./routes/chatbot.js";
import db from "./db.js";

dotenv.config();

const app = express();

/* ================================
   🔥 HEALTH CHECK & ROOT
================================ */
app.get("/health", (req, res) => res.status(200).send("OK"));
app.get("/", (req, res) => res.send("Backend is running 🚀"));

/* ================================
   🔥 CORS CONFIG (FINAL + WORKING)
================================ */
app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://driveflow-frontend-production.up.railway.app"
    ],
    credentials: true,
}));

/* ================================
   🔥 EXPRESS MIDDLEWARE
================================ */
app.use(express.json());

/* ================================
   🔥 DATABASE CHECK (fixed)
================================ */
db.query("SELECT 1")
  .then(() => console.log("📦 Database pool connected successfully"))
  .catch(err => console.error("❌ Database connection failed:", err.message));

/* ================================
   🔥 ROUTES
================================ */
app.use("/auth", authRoutes);
app.use("/chatbot", chatbotRoutes);

/* ================================
   🔥 START SERVER ON RAILWAY PORT
================================ */
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server is live on port ${PORT}`);
});
