import express from "express";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";

const router = express.Router();

// Optional auth middleware - doesn't fail if no token
const optionalAuth = (req, res, next) => {
  const header = req.headers["authorization"];
  if (header && header.startsWith("Bearer ")) {
    try {
      const token = header.split(" ")[1];
      if (token && process.env.JWT_SECRET) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
      } else {
        req.user = null;
      }
    } catch (err) {
      // If token is invalid, just continue without user info
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
};

// Create transporter (using environment variables)
// For Gmail, you'll need an App Password: https://support.google.com/accounts/answer/185833
// Railway may block port 587, so we default to 465 (SSL) which is more reliable
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "465"),
  secure: process.env.SMTP_SECURE !== "false", // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

// Verify transporter configuration
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  console.log("📧 SMTP configured with user:", process.env.SMTP_USER);
  console.log("📧 SMTP host:", process.env.SMTP_HOST || "smtp.gmail.com");
  const smtpPort = parseInt(process.env.SMTP_PORT || "465");
  console.log("📧 SMTP port:", smtpPort);
  console.log("📧 SMTP secure:", process.env.SMTP_SECURE !== "false");
  transporter.verify((error, success) => {
    if (error) {
      console.error("❌ SMTP configuration error:", error);
      console.error("Error details:", {
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode
      });
    } else {
      console.log("✅ SMTP server is ready to send emails");
    }
  });
} else {
  console.warn("⚠️ SMTP not configured - SMTP_USER or SMTP_PASS missing");
  console.warn("SMTP_USER:", process.env.SMTP_USER ? "Set" : "Missing");
  console.warn("SMTP_PASS:", process.env.SMTP_PASS ? "Set" : "Missing");
}

// POST /contact/send - Send contact message (optional auth)
router.post("/send", optionalAuth, async (req, res) => {
  try {
    const { message } = req.body;

    // Validate input
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Limit message length to prevent abuse
    if (message.length > 5000) {
      return res.status(400).json({ error: "Message is too long (max 5000 characters)" });
    }

    // Get user info if authenticated (optional)
    let userEmail = "Anonymous";
    let username = "Anonymous";
    
    if (req.user) {
      userEmail = req.user.email || "Unknown";
      username = req.user.username || "Unknown";
    }

    // Check if email is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error("❌ SMTP not configured. Contact message from:", userEmail);
      console.log("Message:", message);
      // Still return success to user, but log the message
      return res.status(200).json({ 
        message: "Thank you for your message. We'll get back to you soon." 
      });
    }

    // Get recipient email from env or use SMTP_USER as default
    const recipientEmail = process.env.CONTACT_EMAIL || process.env.SMTP_USER;

    // Prepare email
    const mailOptions = {
      from: `"DriveFlow Contact" <${process.env.SMTP_USER}>`,
      to: recipientEmail,
      replyTo: userEmail !== "Anonymous" ? userEmail : undefined,
      subject: `Contact Form Message from ${username}`,
      text: `New contact form message from DriveFlow\n\n` +
            `From: ${username} (${userEmail})\n\n` +
            `Message:\n${message.trim()}\n\n` +
            `---\nSent from DriveFlow Contact Form`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #5bc0be;">New Contact Form Message</h2>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>From:</strong> ${username} (${userEmail})</p>
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-wrap; background: white; padding: 15px; border-radius: 4px;">${message.trim().replace(/\n/g, '<br>')}</p>
          </div>
          <p style="color: #666; font-size: 12px; margin-top: 20px;">
            ---<br>
            Sent from DriveFlow Contact Form
          </p>
        </div>
      `,
    };

    // Send email
    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Contact message sent from ${userEmail} to ${recipientEmail}`);
    } catch (emailError) {
      console.error("❌ Email sending failed:", emailError);
      console.error("Error details:", {
        code: emailError.code,
        command: emailError.command,
        response: emailError.response,
        responseCode: emailError.responseCode
      });
      throw emailError; // Re-throw to be caught by outer catch
    }

    res.status(200).json({
      message: "Thank you for your message. We'll get back to you soon.",
    });

  } catch (err) {
    console.error("❌ Error sending contact message:", err);
    console.error("Full error:", JSON.stringify(err, Object.getOwnPropertyNames(err)));
    res.status(500).json({
      error: "Failed to send message. Please try again later.",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

export default router;

