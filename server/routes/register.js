import bcrypt from "bcryptjs";
import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";

/**
 * Register routes. Expects app-level middleware (cors, json) to be applied.
 * @param {object} db - MySQL connection
 */
export const registerRegisterRoutes = (app, db) => {
  app.post("/api/register", async (req, res) => {
    const { username, email, password } = req.body;
    log("REGISTER", "Registration attempt", { username: username ? `${username.slice(0, 3)}***` : null, email: email ? `${email.slice(0, 3)}***` : null });

    try {
      const [usernameRows] = await db.execute(
        "SELECT user_id FROM users WHERE username = ?",
        [username]
      );
      if (usernameRows.length > 0) {
        log("REGISTER", "Registration failed: username exists", { username });
        await writeAuditLog(db, { action: "REGISTER_FAILED", entity_type: "auth", new_values: { reason: "username_exists" }, ip_address: req.ip, user_agent: req.get("user-agent") });
        return res.status(400).json({ message: "Username already exists" });
      }

      const [emailRows] = await db.execute(
        "SELECT user_id FROM users WHERE email = ?",
        [email]
      );
      if (emailRows.length > 0) {
        log("REGISTER", "Registration failed: email exists", { email: email ? `${email.slice(0, 5)}***` : null });
        await writeAuditLog(db, { action: "REGISTER_FAILED", entity_type: "auth", new_values: { reason: "email_exists" }, ip_address: req.ip, user_agent: req.get("user-agent") });
        return res.status(400).json({ message: "Email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const [roleRows] = await db.execute(
        "SELECT role_id FROM roles ORDER BY role_id LIMIT 1"
      );
      const defaultRoleId = roleRows.length > 0 ? roleRows[0].role_id : 1;

      const [insertResult] = await db.execute(
        "INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, ?)",
        [username, email, hashedPassword, defaultRoleId]
      );
      const newUserId = insertResult?.insertId;

      if (newUserId) {
        await writeAuditLog(db, {
          user_id: newUserId,
          action: "REGISTER_SUCCESS",
          entity_type: "auth",
          entity_id: String(newUserId),
          new_values: { username },
          ip_address: req.ip,
          user_agent: req.get("user-agent")
        });
      }
      log("REGISTER", "User registered successfully", { username });
      res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
      logError("REGISTER", "Registration error", error);
      res.status(500).json({ message: "Server error" });
    }
  });
};
