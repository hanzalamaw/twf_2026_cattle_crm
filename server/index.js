import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import crypto from "crypto";

dotenv.config();

// Email configuration
const createEmailTransporter = () => {
  const emailUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const emailPass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;
  
  // If email credentials are not configured, return null
  if (!emailUser || !emailPass) {
    return null;
  }
  
  // For Gmail, you need to use an App Password (not your regular password)
  // Go to: Google Account > Security > 2-Step Verification > App passwords
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false, // true for 465, false for other ports
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });
  return transporter;
};

const sendPasswordEmail = async (email, newPassword) => {
  try {
    const transporter = createEmailTransporter();
    
    // If email is not configured, return false
    if (!transporter) {
      console.warn("Email not configured. Please set SMTP_USER and SMTP_PASS in .env file");
      return false;
    }
    
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.EMAIL_USER || "noreply@twfcattlecrm.com",
      to: email,
      subject: "Your Password - TWF Cattle CRM",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #FF5722;">Password Recovery</h2>
          <p>You requested your password for your TWF Cattle CRM account.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #666;">Your password is:</p>
            <p style="margin: 10px 0 0 0; font-size: 18px; font-weight: bold; color: #333; letter-spacing: 2px;">${newPassword}</p>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">Please keep this password secure and change it after logging in.</p>
          <p style="color: #999; font-size: 12px;">If you didn't request this, please contact support immediately.</p>
        </div>
      `,
      text: `Password Recovery\n\nYour password is: ${newPassword}\n\nPlease keep this password secure and change it after logging in.\n\nIf you didn't request this, please contact support immediately.`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending email:", error.message);
    return false;
  }
};

// Generate a random password
const generateRandomPassword = (length = 12) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

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

    // Register Endpoint
    app.post("/api/register", async (req, res) => {
      const { username, email, password } = req.body;

      try {
        // Check if username already exists
        const [usernameRows] = await db.execute(
          "SELECT user_id FROM users WHERE username = ?",
          [username]
        );

        if (usernameRows.length > 0) {
          return res.status(400).json({ message: "Username already exists" });
        }

        // Check if email already exists
        const [emailRows] = await db.execute(
          "SELECT user_id FROM users WHERE email = ?",
          [email]
        );

        if (emailRows.length > 0) {
          return res.status(400).json({ message: "Email already exists" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Get default role (or assign role_id 2 if exists, otherwise 1)
        const [roleRows] = await db.execute(
          "SELECT role_id FROM roles ORDER BY role_id LIMIT 1"
        );
        const defaultRoleId = roleRows.length > 0 ? roleRows[0].role_id : 1;

        // Insert new user
        await db.execute(
          "INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, ?)",
          [username, email, hashedPassword, defaultRoleId]
        );

        res.status(201).json({ message: "User registered successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Forgot Password Endpoint
    app.post("/api/forgot-password", async (req, res) => {
      console.log("Forgot password endpoint hit!");
      const { email } = req.body;

      try {
        const [rows] = await db.execute(
          "SELECT user_id, username FROM users WHERE email = ?",
          [email]
        );

        if (rows.length === 0) {
          // Don't reveal if email exists or not for security
          return res.json({ message: "If that email exists, we've sent your password." });
        }

        // Generate a new random password
        const newPassword = generateRandomPassword(12);
        
        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update the user's password in the database
        await db.execute(
          "UPDATE users SET password = ? WHERE user_id = ?",
          [hashedPassword, rows[0].user_id]
        );

        // Send email with the new password
        const emailSent = await sendPasswordEmail(email, newPassword);
        
        if (!emailSent) {
          // If email fails, log the password for development (only in dev mode)
          console.log(`New password for ${email}: ${newPassword}`);
          console.warn("Email sending failed. Password has been reset. Check email configuration.");
        }

        res.json({ message: "If that email exists, we've sent your password." });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Initialize Passport
    app.use(passport.initialize());

    // Google OAuth Strategy
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.SERVER_URL || "http://localhost:5000"}/api/auth/google/callback`
      }, async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const name = profile.displayName || profile.name?.givenName || "User";
          
          // Check if user exists
          let [users] = await db.execute(
            "SELECT u.*, r.role_name FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = ?",
            [email]
          );

          let user = users[0];

          if (!user) {
            // Create new user
            const [roleRows] = await db.execute("SELECT role_id FROM roles ORDER BY role_id LIMIT 1");
            const defaultRoleId = roleRows.length > 0 ? roleRows[0].role_id : 1;
            
            // Generate a random username from email
            const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
            
            await db.execute(
              "INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, ?)",
              [username, email, await bcrypt.hash(Math.random().toString(36), 10), defaultRoleId]
            );
            
            [users] = await db.execute(
              "SELECT u.*, r.role_name FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = ?",
              [email]
            );
            user = users[0];
          }

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }));
    }

    // Microsoft OAuth Strategy
    if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
      passport.use("microsoft", new MicrosoftStrategy({
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackURL: `${process.env.SERVER_URL || "http://localhost:5000"}/api/auth/microsoft/callback`,
        tenant: process.env.MICROSOFT_TENANT || "common"
      }, async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value || profile._json.mail || profile._json.userPrincipalName;
          const name = profile.displayName || profile.name?.givenName || "User";
          
          // Check if user exists
          let [users] = await db.execute(
            "SELECT u.*, r.role_name FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = ?",
            [email]
          );

          let user = users[0];

          if (!user) {
            // Create new user
            const [roleRows] = await db.execute("SELECT role_id FROM roles ORDER BY role_id LIMIT 1");
            const defaultRoleId = roleRows.length > 0 ? roleRows[0].role_id : 1;
            
            const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
            
            await db.execute(
              "INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, ?)",
              [username, email, await bcrypt.hash(Math.random().toString(36), 10), defaultRoleId]
            );
            
            [users] = await db.execute(
              "SELECT u.*, r.role_name FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = ?",
              [email]
            );
            user = users[0];
          }

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }));
    }

    // OAuth Routes
    app.get("/api/auth/google", 
      passport.authenticate("google", { scope: ["profile", "email"] })
    );

    app.get("/api/auth/google/callback",
      passport.authenticate("google", { session: false }),
      async (req, res) => {
        try {
          const user = req.user;
          
          // Update last login
          await db.execute("UPDATE users SET last_login_at = NOW() WHERE user_id = ?", [user.user_id]);
          
          // Create session
          const sessionId = crypto.randomBytes(32).toString('hex');
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);
          
          await db.execute(
            `INSERT INTO user_sessions (session_id, user_id, ip_address, user_agent, expires_at) 
             VALUES (?, ?, ?, ?, ?)`,
            [sessionId, user.user_id, req.ip, req.get('user-agent'), expiresAt]
          );
          
          // Include sessionId in token
          const token = jwt.sign(
            { id: user.user_id, username: user.username, role: user.role_name, sessionId: sessionId },
            JWT_SECRET,
            { expiresIn: "24h" }
          );
          
          // Redirect to frontend with token
          res.redirect(`${process.env.CLIENT_URL || "http://localhost:3000"}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({
            id: user.user_id,
            username: user.username,
            email: user.email,
            role: user.role_name
          }))}`);
        } catch (error) {
          res.redirect(`${process.env.CLIENT_URL || "http://localhost:3000"}/login?error=oauth_failed`);
        }
      }
    );

    app.get("/api/auth/microsoft",
      passport.authenticate("microsoft", { scope: ["user.read"] })
    );

    app.get("/api/auth/microsoft/callback",
      passport.authenticate("microsoft", { session: false }),
      async (req, res) => {
        try {
          const user = req.user;
          
          // Update last login
          await db.execute("UPDATE users SET last_login_at = NOW() WHERE user_id = ?", [user.user_id]);
          
          // Create session
          const sessionId = crypto.randomBytes(32).toString('hex');
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);
          
          await db.execute(
            `INSERT INTO user_sessions (session_id, user_id, ip_address, user_agent, expires_at) 
             VALUES (?, ?, ?, ?, ?)`,
            [sessionId, user.user_id, req.ip, req.get('user-agent'), expiresAt]
          );
          
          // Include sessionId in token
          const token = jwt.sign(
            { id: user.user_id, username: user.username, role: user.role_name, sessionId: sessionId },
            JWT_SECRET,
            { expiresIn: "24h" }
          );
          
          res.redirect(`${process.env.CLIENT_URL || "http://localhost:3000"}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({
            id: user.user_id,
            username: user.username,
            email: user.email,
            role: user.role_name
          }))}`);
        } catch (error) {
          res.redirect(`${process.env.CLIENT_URL || "http://localhost:3000"}/login?error=oauth_failed`);
        }
      }
    );

    // Apple OAuth (Sign in with Apple)
    app.get("/api/auth/apple", (req, res) => {
      // Apple OAuth requires special handling with JWT tokens
      // For now, redirect to Apple's authorization URL
      const clientId = process.env.APPLE_CLIENT_ID;
      const redirectUri = `${process.env.SERVER_URL || "http://localhost:5000"}/api/auth/apple/callback`;
      
      if (!clientId) {
        return res.status(501).json({ message: "Apple OAuth not configured" });
      }
      
      const appleAuthUrl = `https://appleid.apple.com/auth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=email%20name&response_mode=form_post`;
      res.redirect(appleAuthUrl);
    });

    app.post("/api/auth/apple/callback", async (req, res) => {
      // Apple callback handling (simplified - full implementation requires JWT verification)
      // For production, you'd need to verify the Apple JWT token
      res.redirect(`${process.env.CLIENT_URL || "http://localhost:3000"}/login?error=apple_oauth_not_fully_implemented`);
    });

    // Login Endpoint
    app.post("/api/login", async (req, res) => {
      const { username, password } = req.body;

      try {
        const [rows] = await db.execute(
          "SELECT u.*, r.role_name FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.username = ?",
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

        // Update last login
        await db.execute("UPDATE users SET last_login_at = NOW() WHERE user_id = ?", [user.user_id]);

        // Create session first
        const sessionId = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        
        await db.execute(
          `INSERT INTO user_sessions (session_id, user_id, ip_address, user_agent, expires_at) 
           VALUES (?, ?, ?, ?, ?)`,
          [sessionId, user.user_id, req.ip, req.get('user-agent'), expiresAt]
        );

        // Include session_id in token so we can verify it later
        const token = jwt.sign(
          { id: user.user_id, username: user.username, role: user.role_name, sessionId: sessionId },
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
            role: user.role_name
          }
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Middleware to verify JWT token and get user
    const verifyToken = async (req, res, next) => {
      const token = req.headers.authorization?.split(' ')[1] || req.headers['x-access-token'];
      
      if (!token) {
        return res.status(401).json({ message: 'No token provided' });
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if session is still active (if sessionId exists in token)
        if (decoded.sessionId) {
          const [sessions] = await db.execute(
            "SELECT is_active, expires_at FROM user_sessions WHERE session_id = ?",
            [decoded.sessionId]
          );
          
          if (sessions.length === 0 || !sessions[0].is_active) {
            return res.status(401).json({ message: 'Session has been terminated' });
          }
          
          // Check if session has expired
          if (new Date(sessions[0].expires_at) < new Date()) {
            // Mark session as inactive
            await db.execute("UPDATE user_sessions SET is_active = FALSE WHERE session_id = ?", [decoded.sessionId]);
            return res.status(401).json({ message: 'Session has expired' });
          }
          
          // Update last activity
          await db.execute(
            "UPDATE user_sessions SET last_activity_at = NOW() WHERE session_id = ?",
            [decoded.sessionId]
          );
        }
        
        req.userId = decoded.id;
        req.userRole = decoded.role;
        req.sessionId = decoded.sessionId;
        next();
      } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
      }
    };

    // Helper function to log audit actions
    const logAuditAction = async (userId, action, entityType, entityId, oldValues, newValues, ipAddress, userAgent) => {
      try {
        await db.execute(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            action,
            entityType,
            entityId,
            oldValues ? JSON.stringify(oldValues) : null,
            newValues ? JSON.stringify(newValues) : null,
            ipAddress,
            userAgent
          ]
        );
      } catch (error) {
        console.error('Error logging audit action:', error);
      }
    };

    // ========== CONTROL MANAGEMENT API ENDPOINTS ==========

    // Get all users
    app.get("/api/control/users", verifyToken, async (req, res) => {
      try {
        const [users] = await db.execute(
          `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, u.phone, 
                  u.status, u.created_at, u.last_login_at, u.role_id,
                  r.role_name, u.created_by, creator.username as created_by_username
           FROM users u
           LEFT JOIN roles r ON u.role_id = r.role_id
           LEFT JOIN users creator ON u.created_by = creator.user_id
           ORDER BY u.created_at DESC`
        );
        res.json(users);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Get single user
    app.get("/api/control/users/:id", verifyToken, async (req, res) => {
      try {
        const [users] = await db.execute(
          `SELECT u.*, r.role_name 
           FROM users u
           LEFT JOIN roles r ON u.role_id = r.role_id
           WHERE u.user_id = ?`,
          [req.params.id]
        );
        if (users.length === 0) {
          return res.status(404).json({ message: "User not found" });
        }
        res.json(users[0]);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Create user
    app.post("/api/control/users", verifyToken, async (req, res) => {
      try {
        const { username, email, password, first_name, last_name, phone, role_id, status } = req.body;

        // Validate required fields
        if (!username || !email || !password || !role_id) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        // Check if username exists
        const [usernameRows] = await db.execute("SELECT user_id FROM users WHERE username = ?", [username]);
        if (usernameRows.length > 0) {
          return res.status(400).json({ message: "Username already exists" });
        }

        // Check if email exists
        const [emailRows] = await db.execute("SELECT user_id FROM users WHERE email = ?", [email]);
        if (emailRows.length > 0) {
          return res.status(400).json({ message: "Email already exists" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        const [result] = await db.execute(
          `INSERT INTO users (username, email, password, first_name, last_name, phone, role_id, status, created_by) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [username, email, hashedPassword, first_name || null, last_name || null, phone || null, role_id, status || 'active', req.userId]
        );

        // Log audit action
        await logAuditAction(
          req.userId,
          'CREATE_USER',
          'users',
          result.insertId.toString(),
          null,
          { username, email, role_id, status },
          req.ip,
          req.get('user-agent')
        );

        res.status(201).json({ message: "User created successfully", user_id: result.insertId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Update user
    app.put("/api/control/users/:id", verifyToken, async (req, res) => {
      try {
        const { username, email, password, first_name, last_name, phone, role_id, status } = req.body;

        // Get old values
        const [oldUsers] = await db.execute("SELECT * FROM users WHERE user_id = ?", [req.params.id]);
        if (oldUsers.length === 0) {
          return res.status(404).json({ message: "User not found" });
        }
        const oldUser = oldUsers[0];

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (username !== undefined) {
          // Check if username is taken by another user
          const [usernameRows] = await db.execute("SELECT user_id FROM users WHERE username = ? AND user_id != ?", [username, req.params.id]);
          if (usernameRows.length > 0) {
            return res.status(400).json({ message: "Username already exists" });
          }
          updates.push("username = ?");
          values.push(username);
        }
        if (email !== undefined) {
          // Check if email is taken by another user
          const [emailRows] = await db.execute("SELECT user_id FROM users WHERE email = ? AND user_id != ?", [email, req.params.id]);
          if (emailRows.length > 0) {
            return res.status(400).json({ message: "Email already exists" });
          }
          updates.push("email = ?");
          values.push(email);
        }
        if (password !== undefined && password !== '') {
          const hashedPassword = await bcrypt.hash(password, 10);
          updates.push("password = ?");
          values.push(hashedPassword);
        }
        if (first_name !== undefined) {
          updates.push("first_name = ?");
          values.push(first_name);
        }
        if (last_name !== undefined) {
          updates.push("last_name = ?");
          values.push(last_name);
        }
        if (phone !== undefined) {
          updates.push("phone = ?");
          values.push(phone);
        }
        if (role_id !== undefined) {
          updates.push("role_id = ?");
          values.push(role_id);
        }
        if (status !== undefined) {
          updates.push("status = ?");
          values.push(status);
        }

        if (updates.length === 0) {
          return res.status(400).json({ message: "No fields to update" });
        }

        values.push(req.params.id);

        await db.execute(
          `UPDATE users SET ${updates.join(", ")} WHERE user_id = ?`,
          values
        );

        // Get new values
        const [newUsers] = await db.execute("SELECT * FROM users WHERE user_id = ?", [req.params.id]);
        const newUser = newUsers[0];

        // Log audit action
        await logAuditAction(
          req.userId,
          'UPDATE_USER',
          'users',
          req.params.id,
          oldUser,
          newUser,
          req.ip,
          req.get('user-agent')
        );

        res.json({ message: "User updated successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Delete user
    app.delete("/api/control/users/:id", verifyToken, async (req, res) => {
      try {
        // Get old values for audit
        const [oldUsers] = await db.execute("SELECT * FROM users WHERE user_id = ?", [req.params.id]);
        if (oldUsers.length === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        // Don't allow deleting yourself
        if (parseInt(req.params.id) === req.userId) {
          return res.status(400).json({ message: "Cannot delete your own account" });
        }

        await db.execute("DELETE FROM users WHERE user_id = ?", [req.params.id]);

        // Log audit action
        await logAuditAction(
          req.userId,
          'DELETE_USER',
          'users',
          req.params.id,
          oldUsers[0],
          null,
          req.ip,
          req.get('user-agent')
        );

        res.json({ message: "User deleted successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Get all roles
    app.get("/api/control/roles", verifyToken, async (req, res) => {
      try {
        const [roles] = await db.execute("SELECT * FROM roles ORDER BY role_id");
        res.json(roles);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Get single role
    app.get("/api/control/roles/:id", verifyToken, async (req, res) => {
      try {
        const [roles] = await db.execute("SELECT * FROM roles WHERE role_id = ?", [req.params.id]);
        if (roles.length === 0) {
          return res.status(404).json({ message: "Role not found" });
        }
        res.json(roles[0]);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Create role
    app.post("/api/control/roles", verifyToken, async (req, res) => {
      try {
        const {
          role_name,
          has_prev_logged_in,
          control_management,
          booking_management,
          operation_management,
          farm_management,
          procurement_management,
          accounting_and_finance,
          performance_management
        } = req.body;

        if (!role_name) {
          return res.status(400).json({ message: "Role name is required" });
        }

        // Check if role name exists
        const [existingRoles] = await db.execute("SELECT role_id FROM roles WHERE role_name = ?", [role_name]);
        if (existingRoles.length > 0) {
          return res.status(400).json({ message: "Role name already exists" });
        }

        const [result] = await db.execute(
          `INSERT INTO roles (role_name, has_prev_logged_in, control_management, booking_management, 
                             operation_management, farm_management, procurement_management, 
                             accounting_and_finance, performance_management) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            role_name,
            has_prev_logged_in || false,
            control_management || false,
            booking_management || false,
            operation_management || false,
            farm_management || false,
            procurement_management || false,
            accounting_and_finance || false,
            performance_management || false
          ]
        );

        // Log audit action
        await logAuditAction(
          req.userId,
          'CREATE_ROLE',
          'roles',
          result.insertId.toString(),
          null,
          req.body,
          req.ip,
          req.get('user-agent')
        );

        res.status(201).json({ message: "Role created successfully", role_id: result.insertId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Update role
    app.put("/api/control/roles/:id", verifyToken, async (req, res) => {
      try {
        // Get old values
        const [oldRoles] = await db.execute("SELECT * FROM roles WHERE role_id = ?", [req.params.id]);
        if (oldRoles.length === 0) {
          return res.status(404).json({ message: "Role not found" });
        }

        const {
          role_name,
          has_prev_logged_in,
          control_management,
          booking_management,
          operation_management,
          farm_management,
          procurement_management,
          accounting_and_finance,
          performance_management
        } = req.body;

        // Check if role name is being changed and if it conflicts
        if (role_name && role_name !== oldRoles[0].role_name) {
          const [existingRoles] = await db.execute("SELECT role_id FROM roles WHERE role_name = ? AND role_id != ?", [role_name, req.params.id]);
          if (existingRoles.length > 0) {
            return res.status(400).json({ message: "Role name already exists" });
          }
        }

        await db.execute(
          `UPDATE roles SET 
           role_name = ?, has_prev_logged_in = ?, control_management = ?, booking_management = ?,
           operation_management = ?, farm_management = ?, procurement_management = ?,
           accounting_and_finance = ?, performance_management = ?
           WHERE role_id = ?`,
          [
            role_name || oldRoles[0].role_name,
            has_prev_logged_in !== undefined ? has_prev_logged_in : oldRoles[0].has_prev_logged_in,
            control_management !== undefined ? control_management : oldRoles[0].control_management,
            booking_management !== undefined ? booking_management : oldRoles[0].booking_management,
            operation_management !== undefined ? operation_management : oldRoles[0].operation_management,
            farm_management !== undefined ? farm_management : oldRoles[0].farm_management,
            procurement_management !== undefined ? procurement_management : oldRoles[0].procurement_management,
            accounting_and_finance !== undefined ? accounting_and_finance : oldRoles[0].accounting_and_finance,
            performance_management !== undefined ? performance_management : oldRoles[0].performance_management,
            req.params.id
          ]
        );

        // Get new values
        const [newRoles] = await db.execute("SELECT * FROM roles WHERE role_id = ?", [req.params.id]);

        // Log audit action
        await logAuditAction(
          req.userId,
          'UPDATE_ROLE',
          'roles',
          req.params.id,
          oldRoles[0],
          newRoles[0],
          req.ip,
          req.get('user-agent')
        );

        res.json({ message: "Role updated successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Delete role
    app.delete("/api/control/roles/:id", verifyToken, async (req, res) => {
      try {
        // Check if role is in use
        const [users] = await db.execute("SELECT COUNT(*) as count FROM users WHERE role_id = ?", [req.params.id]);
        if (users[0].count > 0) {
          return res.status(400).json({ message: "Cannot delete role that is assigned to users" });
        }

        // Get old values for audit
        const [oldRoles] = await db.execute("SELECT * FROM roles WHERE role_id = ?", [req.params.id]);
        if (oldRoles.length === 0) {
          return res.status(404).json({ message: "Role not found" });
        }

        await db.execute("DELETE FROM roles WHERE role_id = ?", [req.params.id]);

        // Log audit action
        await logAuditAction(
          req.userId,
          'DELETE_ROLE',
          'roles',
          req.params.id,
          oldRoles[0],
          null,
          req.ip,
          req.get('user-agent')
        );

        res.json({ message: "Role deleted successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Get audit logs
    app.get("/api/control/audit-logs", verifyToken, async (req, res) => {
      try {
        const { limit = 100, offset = 0, entity_type, action } = req.query;
        
        let query = `
          SELECT al.*, u.username, u.email
          FROM audit_logs al
          LEFT JOIN users u ON al.user_id = u.user_id
          WHERE 1=1
        `;
        const params = [];

        if (entity_type) {
          query += " AND al.entity_type = ?";
          params.push(entity_type);
        }
        if (action) {
          query += " AND al.action = ?";
          params.push(action);
        }

        query += " ORDER BY al.created_at DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), parseInt(offset));

        const [logs] = await db.execute(query, params);
        res.json(logs);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Get active sessions
    app.get("/api/control/sessions", verifyToken, async (req, res) => {
      try {
        const [sessions] = await db.execute(
          `SELECT s.*, u.username, u.email, u.role_id, r.role_name
           FROM user_sessions s
           JOIN users u ON s.user_id = u.user_id
           LEFT JOIN roles r ON u.role_id = r.role_id
           WHERE s.is_active = TRUE
           ORDER BY s.last_activity_at DESC`
        );
        res.json(sessions);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Terminate session
    app.delete("/api/control/sessions/:sessionId", verifyToken, async (req, res) => {
      try {
        await db.execute("UPDATE user_sessions SET is_active = FALSE WHERE session_id = ?", [req.params.sessionId]);
        
        // Log audit action
        await logAuditAction(
          req.userId,
          'TERMINATE_SESSION',
          'sessions',
          req.params.sessionId,
          null,
          null,
          req.ip,
          req.get('user-agent')
        );

        res.json({ message: "Session terminated successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Catch-all for undefined routes
    app.use((req, res) => {
      console.log(`Route not found: ${req.method} ${req.path}`);
      res.status(404).json({ message: `Not Found - ${req.path}` });
    });

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('Available endpoints:');
      console.log('  POST /api/login');
      console.log('  POST /api/register');
      console.log('  POST /api/forgot-password');
      console.log('  GET /api/auth/google');
      console.log('  GET /api/auth/microsoft');
      console.log('  GET /api/auth/apple');
      console.log('\nControl Management endpoints:');
      console.log('  GET /api/control/users');
      console.log('  POST /api/control/users');
      console.log('  PUT /api/control/users/:id');
      console.log('  DELETE /api/control/users/:id');
      console.log('  GET /api/control/roles');
      console.log('  POST /api/control/roles');
      console.log('  PUT /api/control/roles/:id');
      console.log('  DELETE /api/control/roles/:id');
      console.log('  GET /api/control/audit-logs');
      console.log('  GET /api/control/sessions');
      console.log('  DELETE /api/control/sessions/:sessionId');
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};

startServer();
