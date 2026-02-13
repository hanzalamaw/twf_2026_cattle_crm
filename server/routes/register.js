import bcrypt from "bcryptjs";

/**
 * Register routes. Expects app-level middleware (cors, json) to be applied.
 * @param {object} db - MySQL connection
 */
export const registerRegisterRoutes = (app, db) => {
  app.post("/api/register", async (req, res) => {
    const { username, email, password } = req.body;

    try {
      const [usernameRows] = await db.execute(
        "SELECT user_id FROM users WHERE username = ?",
        [username]
      );
      if (usernameRows.length > 0) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const [emailRows] = await db.execute(
        "SELECT user_id FROM users WHERE email = ?",
        [email]
      );
      if (emailRows.length > 0) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const [roleRows] = await db.execute(
        "SELECT role_id FROM roles ORDER BY role_id LIMIT 1"
      );
      const defaultRoleId = roleRows.length > 0 ? roleRows[0].role_id : 1;

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
};
