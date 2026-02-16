import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import { createVerifyToken } from "./middleware/auth.js";
import { registerRegisterRoutes } from "./routes/register.js";
import { registerPasswordResetRoutes } from "./routes/passwordReset.js";
import { registerOAuthRoutes } from "./routes/oauth.js";
import { registerControlRoutes } from "./routes/control.js";
import { registerBookingRoutes } from "./routes/booking.js";
import { log, logError } from "./utils/logger.js";
import { writeAuditLog } from "./utils/auditLog.js";
import { sendLoginNotificationEmail } from "./utils/email.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const startServer = async () => {
  try {
    const db = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "twf_cattle_crm",
    });

    console.log("Connected to MySQL Database");

    const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key";
    const verifyToken = createVerifyToken(db, JWT_SECRET);

    // ---------- Login ----------
    app.post("/api/login", async (req, res) => {
      const { username, password } = req.body;
      log("AUTH", "Login attempt", { username: username ? `${username.slice(0, 3)}***` : null });

      if (!username || typeof username !== "string" || !password || typeof password !== "string") {
        await writeAuditLog(db, { action: "LOGIN_FAILED", entity_type: "auth", new_values: { reason: "invalid_request" }, ip_address: req.ip, user_agent: req.get("user-agent") });
        return res.status(400).json({ message: "Please enter username and password.", reason: "invalid_request" });
      }

      try {
        const [rows] = await db.execute(
          `SELECT u.user_id, u.username, u.email, u.password, u.role_id, u.terms_accepted_at, u.has_prev_logged_in,
            r.role_name,
            r.control_management, r.booking_management, r.operation_management,
            r.farm_management, r.procurement_management, r.accounting_and_finance, r.performance_management
           FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.username = ?`,
          [username]
        );

        if (rows.length === 0) {
          log("AUTH", "Login failed: user not found", { username: username ? `${username.slice(0, 3)}***` : null });
          await writeAuditLog(db, { action: "LOGIN_FAILED", entity_type: "auth", new_values: { reason: "user_not_found" }, ip_address: req.ip, user_agent: req.get("user-agent") });
          return res.status(401).json({ message: "Invalid credentials", reason: "user_not_found" });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
          log("AUTH", "Login failed: wrong password", { username: user.username });
          await writeAuditLog(db, { action: "LOGIN_FAILED", entity_type: "auth", new_values: { reason: "wrong_password", username: user.username }, ip_address: req.ip, user_agent: req.get("user-agent") });
          return res.status(401).json({ message: "Invalid credentials", reason: "wrong_password" });
        }

        await db.execute("UPDATE users SET last_login_at = NOW() WHERE user_id = ?", [user.user_id]);

        const sessionId = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        await db.execute(
          `INSERT INTO user_sessions (session_id, user_id, ip_address, user_agent, expires_at) 
           VALUES (?, ?, ?, ?, ?)`,
          [sessionId, user.user_id, req.ip, req.get('user-agent'), expiresAt]
        );

        await writeAuditLog(db, {
          user_id: user.user_id,
          session_id: sessionId,
          action: "LOGIN",
          entity_type: "auth",
          entity_id: String(user.user_id),
          new_values: { username: user.username },
          ip_address: req.ip,
          user_agent: req.get("user-agent")
        });

        const permissions = {
          control_management: !!user.control_management,
          booking_management: !!user.booking_management,
          operation_management: !!user.operation_management,
          farm_management: !!user.farm_management,
          procurement_management: !!user.procurement_management,
          accounting_and_finance: !!user.accounting_and_finance,
          performance_management: true
        };

        const token = jwt.sign(
          { id: user.user_id, username: user.username, role: user.role_name, role_id: user.role_id, sessionId, permissions },
          JWT_SECRET,
          { expiresIn: "24h" }
        );

        log("AUTH", "Login success", { user_id: user.user_id, username: user.username });
        if (user.email) {
          sendLoginNotificationEmail(user.email).catch((err) =>
            logError("AUTH", "Login notification email failed", err)
          );
        }
        res.json({
          token,
          sessionId,
          user: {
            id: user.user_id,
            username: user.username,
            email: user.email,
            role: user.role_name,
            role_id: user.role_id,
            permissions,
            terms_accepted_at: user.terms_accepted_at || null,
            has_prev_logged_in: user.has_prev_logged_in != null ? !!user.has_prev_logged_in : (user.terms_accepted_at != null)
          }
        });
      } catch (error) {
        logError("AUTH", "Login error", error);
        await writeAuditLog(db, { action: "LOGIN_ERROR", entity_type: "auth", new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
        res.status(500).json({ message: "Something went wrong. Please try again.", reason: "server_error" });
      }
    });

    // ---------- Current user (for OAuth callback and session load) ----------
    app.get("/api/me", verifyToken, async (req, res) => {
      log("AUTH", "Current user loaded", { user_id: req.userId });
      try {
        const [rows] = await db.execute(
          `SELECT u.user_id, u.username, u.email, u.role_id, u.terms_accepted_at, u.has_prev_logged_in,
            r.role_name,
            r.control_management, r.booking_management, r.operation_management,
            r.farm_management, r.procurement_management, r.accounting_and_finance, r.performance_management
           FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?`,
          [req.userId]
        );
        if (rows.length === 0) return res.status(404).json({ message: "User not found" });
        const user = rows[0];
        const permissions = {
          control_management: !!user.control_management,
          booking_management: !!user.booking_management,
          operation_management: !!user.operation_management,
          farm_management: !!user.farm_management,
          procurement_management: !!user.procurement_management,
          accounting_and_finance: !!user.accounting_and_finance,
          performance_management: true
        };
        res.json({
          user: {
            id: user.user_id,
            username: user.username,
            email: user.email,
            role: user.role_name,
            role_id: user.role_id,
            permissions,
            terms_accepted_at: user.terms_accepted_at || null,
            has_prev_logged_in: user.has_prev_logged_in != null ? !!user.has_prev_logged_in : (user.terms_accepted_at != null)
          }
        });
      } catch (error) {
        logError("AUTH", "/api/me error", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // ---------- Accept Terms (first-time login) ----------
    app.post("/api/accept-terms", verifyToken, async (req, res) => {
      try {
        const userId = req.userId;
        const [userRows] = await db.execute("SELECT role_id FROM users WHERE user_id = ?", [userId]);
        if (userRows.length === 0) {
          await writeAuditLog(db, { user_id: userId, action: "TERMS_ACCEPT_FAILED", entity_type: "auth", entity_id: String(userId), new_values: { reason: "user_not_found" }, ip_address: req.ip, user_agent: req.get("user-agent") });
          return res.status(404).json({ message: "User not found" });
        }
        const roleId = userRows[0].role_id;

        await db.execute("UPDATE users SET terms_accepted_at = NOW(), has_prev_logged_in = 1 WHERE user_id = ?", [userId]);

        await writeAuditLog(db, {
          user_id: userId,
          action: "TERMS_ACCEPTED",
          entity_type: "auth",
          entity_id: String(userId),
          new_values: { role_id: roleId },
          ip_address: req.ip,
          user_agent: req.get("user-agent")
        });
        log("AUTH", "Terms accepted", { user_id: userId, role_id: roleId });

        const [rows] = await db.execute(
          `SELECT u.user_id, u.username, u.email, u.role_id, u.terms_accepted_at, u.has_prev_logged_in,
            r.role_name,
            r.control_management, r.booking_management, r.operation_management,
            r.farm_management, r.procurement_management, r.accounting_and_finance, r.performance_management
           FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?`,
          [userId]
        );
        const u = rows[0];
        const permissions = {
          control_management: !!u.control_management,
          booking_management: !!u.booking_management,
          operation_management: !!u.operation_management,
          farm_management: !!u.farm_management,
          procurement_management: !!u.procurement_management,
          accounting_and_finance: !!u.accounting_and_finance,
          performance_management: true
        };
        res.json({
          user: {
            id: u.user_id,
            username: u.username,
            email: u.email,
            role: u.role_name,
            role_id: u.role_id,
            permissions,
            terms_accepted_at: u.terms_accepted_at,
            has_prev_logged_in: !!u.has_prev_logged_in
          }
        });
      } catch (error) {
        logError("AUTH", "Accept terms error", error);
        await writeAuditLog(db, { user_id: req.userId, action: "TERMS_ACCEPT_ERROR", entity_type: "auth", new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
        res.status(500).json({ message: "Server error" });
      }
    });

    // ---------- Logout ----------
    app.post("/api/logout", async (req, res) => {
      const token = req.headers.authorization?.split(' ')[1] || req.headers['x-access-token'];
      if (!token) {
        log("AUTH", "Logout (no token)");
        return res.status(200).json({ message: "Logged out" });
      }
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.id) {
          await db.execute("UPDATE user_sessions SET is_active = FALSE WHERE user_id = ? AND is_active = TRUE", [decoded.id]);
          await writeAuditLog(db, {
            user_id: decoded.id,
            action: "LOGOUT",
            entity_type: "auth",
            entity_id: String(decoded.id),
            new_values: { username: decoded.username },
            ip_address: req.ip,
            user_agent: req.get("user-agent")
          });
          log("AUTH", "Logout success", { user_id: decoded.id });
        }
        res.json({ message: "Logged out successfully" });
      } catch (error) {
        res.status(200).json({ message: "Logged out" });
      }
    });

    // ---------- Mount other routes ----------
    registerRegisterRoutes(app, db);
    registerPasswordResetRoutes(app, db);
    registerOAuthRoutes(app, db, JWT_SECRET);
    registerControlRoutes(app, db, verifyToken);
    registerBookingRoutes(app, db, verifyToken);

    // ---------- 404 ----------
    app.use((req, res) => {
      log("SERVER", "Route not found", { method: req.method, path: req.path });
      res.status(404).json({ message: `Not Found - ${req.path}` });
    });

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      log("SERVER", "Server started", { port: PORT });
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('Auth: POST /api/login, POST /api/logout');
      console.log('  POST /api/register, POST /api/forgot-password, GET /api/reset-password/validate, POST /api/reset-password');
      console.log('  GET /api/auth/google, GET /api/auth/microsoft, GET /api/auth/apple');
      console.log('Control: GET/POST/PUT/DELETE /api/control/users, /api/control/roles, /api/control/audit-logs, /api/control/sessions');
    });
  } catch (error) {
    logError("SERVER", "Database connection failed", error);
    process.exit(1);
  }
};

startServer();
