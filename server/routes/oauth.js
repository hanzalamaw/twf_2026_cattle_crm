import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";

/**
 * OAuth (Google, Microsoft, Apple) routes and Passport strategies.
 * @param {object} app - Express app
 * @param {object} db - MySQL connection
 * @param {string} JWT_SECRET
 */
export const registerOAuthRoutes = (app, db, JWT_SECRET) => {
  app.use(passport.initialize());

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.SERVER_URL || "http://localhost:5000"}/api/auth/google/callback`
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        let [users] = await db.execute(
          "SELECT u.*, r.role_name FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = ?",
          [email]
        );
        let user = users[0];
        if (!user) {
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

  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    passport.use("microsoft", new MicrosoftStrategy({
      clientID: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackURL: `${process.env.SERVER_URL || "http://localhost:5000"}/api/auth/microsoft/callback`,
      tenant: process.env.MICROSOFT_TENANT || "common"
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || profile._json.mail || profile._json.userPrincipalName;
        let [users] = await db.execute(
          "SELECT u.*, r.role_name FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = ?",
          [email]
        );
        let user = users[0];
        if (!user) {
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

  const redirectWithToken = async (req, res, user) => {
    try {
      await db.execute("UPDATE users SET last_login_at = NOW() WHERE user_id = ?", [user.user_id]);
      const sessionId = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      await db.execute(
        `INSERT INTO user_sessions (session_id, user_id, ip_address, user_agent, expires_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, user.user_id, req.ip, req.get('user-agent'), expiresAt]
      );
      const token = jwt.sign(
        { id: user.user_id, username: user.username, role: user.role_name, sessionId },
        JWT_SECRET,
        { expiresIn: "24h" }
      );
      const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
      res.redirect(`${clientUrl}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({
        id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role_name
      }))}`);
    } catch (error) {
      res.redirect(`${process.env.CLIENT_URL || "http://localhost:5173"}/login?error=oauth_failed`);
    }
  };

  app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
  app.get("/api/auth/google/callback",
    passport.authenticate("google", { session: false }),
    async (req, res) => { await redirectWithToken(req, res, req.user); }
  );

  app.get("/api/auth/microsoft", passport.authenticate("microsoft", { scope: ["user.read"] }));
  app.get("/api/auth/microsoft/callback",
    passport.authenticate("microsoft", { session: false }),
    async (req, res) => { await redirectWithToken(req, res, req.user); }
  );

  app.get("/api/auth/apple", (req, res) => {
    const clientId = process.env.APPLE_CLIENT_ID;
    const redirectUri = `${process.env.SERVER_URL || "http://localhost:5000"}/api/auth/apple/callback`;
    if (!clientId) {
      return res.status(501).json({ message: "Apple OAuth not configured" });
    }
    const appleAuthUrl = `https://appleid.apple.com/auth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=email%20name&response_mode=form_post`;
    res.redirect(appleAuthUrl);
  });

  app.post("/api/auth/apple/callback", async (req, res) => {
    res.redirect(`${process.env.CLIENT_URL || "http://localhost:5173"}/login?error=apple_oauth_not_fully_implemented`);
  });
};
