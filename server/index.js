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

      try {
        const [rows] = await db.execute(
          `SELECT u.user_id, u.username, u.email, u.password, u.role_id, r.role_name,
            r.control_management, r.booking_management, r.operation_management,
            r.farm_management, r.procurement_management, r.accounting_and_finance, r.performance_management
           FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.username = ?`,
          [username]
        );

        if (rows.length === 0) {
          return res.status(401).json({ message: "Invalid credentials" });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
          return res.status(401).json({ message: "Invalid credentials" });
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

        res.json({
          token,
          sessionId,
          user: {
            id: user.user_id,
            username: user.username,
            email: user.email,
            role: user.role_name,
            role_id: user.role_id,
            permissions
          }
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // ---------- Current user (for OAuth callback and session load) ----------
    app.get("/api/me", verifyToken, async (req, res) => {
      try {
        const [rows] = await db.execute(
          `SELECT u.user_id, u.username, u.email, u.role_id, r.role_name,
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
            permissions
          }
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // ---------- Logout ----------
    app.post("/api/logout", async (req, res) => {
      const token = req.headers.authorization?.split(' ')[1] || req.headers['x-access-token'];
      if (!token) {
        return res.status(200).json({ message: "Logged out" });
      }
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.id) {
          // Deactivate all active sessions for this user
          await db.execute("UPDATE user_sessions SET is_active = FALSE WHERE user_id = ? AND is_active = TRUE", [decoded.id]);
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

    // ---------- 404 ----------
    app.use((req, res) => {
      console.log(`Route not found: ${req.method} ${req.path}`);
      res.status(404).json({ message: `Not Found - ${req.path}` });
    });

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('Auth: POST /api/login, POST /api/logout');
      console.log('  POST /api/register, POST /api/forgot-password, GET /api/reset-password/validate, POST /api/reset-password');
      console.log('  GET /api/auth/google, GET /api/auth/microsoft, GET /api/auth/apple');
      console.log('Control: GET/POST/PUT/DELETE /api/control/users, /api/control/roles, /api/control/audit-logs, /api/control/sessions');
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};

startServer();
