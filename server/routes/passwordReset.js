import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendResetLinkEmail } from "../utils/email.js";

/**
 * Forgot password & reset password routes.
 * @param {object} app - Express app
 * @param {object} db - MySQL connection
 */
export const registerPasswordResetRoutes = (app, db) => {
  app.post("/api/forgot-password", async (req, res) => {
    const { email } = req.body;

    try {
      const [rows] = await db.execute(
        "SELECT user_id, username FROM users WHERE email = ?",
        [email]
      );

      if (rows.length === 0) {
        return res.json({ message: "If that email exists, we've sent you a reset link." });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.execute(
        "INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
        [token, rows[0].user_id, expiresAt]
      );

      const baseUrl = process.env.PASSWORD_RESET_BASE_URL || process.env.CLIENT_URL || "http://localhost:5173";
      const resetLink = `${baseUrl}/reset-password?token=${token}`;
      const emailSent = await sendResetLinkEmail(email, resetLink);

      if (!emailSent) {
        await db.execute("DELETE FROM password_reset_tokens WHERE token = ?", [token]);
        console.warn("Email sending failed. Check email configuration.");
      }

      res.json({ message: "If that email exists, we've sent you a reset link." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/reset-password/validate", async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ valid: false, message: "Token required" });
    try {
      const [rows] = await db.execute(
        "SELECT user_id FROM password_reset_tokens WHERE token = ? AND expires_at > NOW()",
        [token]
      );
      res.json({ valid: rows.length > 0 });
    } catch (error) {
      console.error(error);
      res.status(500).json({ valid: false });
    }
  });

  app.post("/api/reset-password", async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token and new password are required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }
    try {
      const [rows] = await db.execute(
        "SELECT user_id FROM password_reset_tokens WHERE token = ? AND expires_at > NOW()",
        [token]
      );
      if (rows.length === 0) {
        return res.status(400).json({ message: "Invalid or expired reset link. Please request a new one." });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await db.execute("UPDATE users SET password = ? WHERE user_id = ?", [hashedPassword, rows[0].user_id]);
      await db.execute("DELETE FROM password_reset_tokens WHERE token = ?", [token]);
      res.json({ message: "Password updated successfully. You can now log in." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  });
};
