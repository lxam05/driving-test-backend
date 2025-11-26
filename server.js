import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import chatbotRoutes from "./routes/chatbot.js";
import db from "./config/db.js";

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

/* ============================================
   🔥 MIDDLEWARE
=============================================== */
app.use(express.json());

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      // Local development support (VSCode Live Server)
      if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
        return callback(null, true);
      }

      // Production backend origin
      if (origin === "https://driving-test-backend-production.up.railway.app") {
        return callback(null, true);
      }

      // TEMPORARY: allow all origins during testing
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  })
);

/* ============================================
   🔥 DATABASE CHECK
=============================================== */
db.connect((err) => {
  if (err) console.error("❌ DB Connection Failed:", err);
  else console.log("📦 Database connected successfully");
});

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
