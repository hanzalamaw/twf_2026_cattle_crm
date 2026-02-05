import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

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

        const token = jwt.sign(
          { id: user.user_id, username: user.username, role: user.role_name },
          JWT_SECRET,
          { expiresIn: "24h" }
        );

        res.json({
          token,
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

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};

startServer();
