import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendResetLinkEmail } from "../utils/email.js";
import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";

/**
 * Forgot password & reset password routes.
 * @param {object} app - Express app
 * @param {object} db - MySQL connection
 */
export const registerPasswordResetRoutes = (app, db) => {
  app.post("/api/forgot-password", async (req, res) => {
    const { email } = req.body;
    log("PASSWORD_RESET", "Forgot password request", { email: email ? `${email.slice(0, 3)}***` : null });

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
        log("PASSWORD_RESET", "Reset email sending failed");
      } else {
        await writeAuditLog(db, {
          user_id: rows[0].user_id,
          action: "FORGOT_PASSWORD_REQUEST",
          entity_type: "auth",
          entity_id: String(rows[0].user_id),
          new_values: { email_sent: true },
          ip_address: req.ip,
          user_agent: req.get("user-agent")
        });
        log("PASSWORD_RESET", "Reset link sent", { user_id: rows[0].user_id });
      }

      res.json({ message: "If that email exists, we've sent you a reset link." });
    } catch (error) {
      logError("PASSWORD_RESET", "Forgot password error", error);
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
      log("PASSWORD_RESET", "Token validated", { valid: rows.length > 0 });
      res.json({ valid: rows.length > 0 });
    } catch (error) {
      logError("PASSWORD_RESET", "Validate token error", error);
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
        log("PASSWORD_RESET", "Reset password failed: invalid or expired token");
        await writeAuditLog(db, {
          action: "PASSWORD_RESET_FAILED",
          entity_type: "auth",
          new_values: { reason: "invalid_or_expired_token" },
          ip_address: req.ip,
          user_agent: req.get("user-agent"),
        });
        return res.status(400).json({ message: "Invalid or expired reset link. Please request a new one." });
      }
      const userId = rows[0].user_id;
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await db.execute("UPDATE users SET password = ? WHERE user_id = ?", [hashedPassword, userId]);
      await db.execute("DELETE FROM password_reset_tokens WHERE token = ?", [token]);
      await writeAuditLog(db, {
        user_id: userId,
        action: "PASSWORD_RESET",
        entity_type: "auth",
        entity_id: String(userId),
        new_values: { password_changed: true },
        ip_address: req.ip,
        user_agent: req.get("user-agent")
      });
      log("PASSWORD_RESET", "Password reset success", { user_id: userId });
      res.json({ message: "Password updated successfully. You can now log in." });
    } catch (error) {
      logError("PASSWORD_RESET", "Reset password error", error);
      res.status(500).json({ message: "Server error" });
    }
  });
};
