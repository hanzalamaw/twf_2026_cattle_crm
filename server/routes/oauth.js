import jwt from "jsonwebtoken";
import crypto from "crypto";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { sendLoginNotificationEmail } from "../utils/email.js";

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
        if (!email) {
          logError("OAUTH_GOOGLE", "No email in profile – user must grant email scope", null);
          return done(new Error("Google did not provide an email. Please grant email access."), null);
        }
        const [users] = await db.execute(
          "SELECT u.*, r.role_name FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = ?",
          [email]
        );
        const user = users[0];
        if (!user) {
          log("OAUTH_GOOGLE", "Sign-in rejected: user not in database (admin must add user)", { email });
          return done(new Error("USER_NOT_FOUND"), null);
        }
        log("OAUTH_GOOGLE", "Existing user signed in via Google", { email: user.email, user_id: user.user_id });
        return done(null, user);
      } catch (error) {
        logError("OAUTH_GOOGLE", "Strategy error", error);
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
        const email = profile.emails?.[0]?.value || profile._json?.mail || profile._json?.userPrincipalName;
        if (!email) {
          logError("OAUTH_MICROSOFT", "No email in profile", null);
          return done(new Error("Microsoft did not provide an email."), null);
        }
        const [users] = await db.execute(
          "SELECT u.*, r.role_name FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = ?",
          [email]
        );
        const user = users[0];
        if (!user) {
          log("OAUTH_MICROSOFT", "Sign-in rejected: user not in database (admin must add user)", { email });
          return done(new Error("USER_NOT_FOUND"), null);
        }
        log("OAUTH_MICROSOFT", "Existing user signed in via Microsoft", { email: user.email, user_id: user.user_id });
        return done(null, user);
      } catch (error) {
        logError("OAUTH_MICROSOFT", "Strategy error", error);
        return done(error, null);
      }
    }));
  }

  const redirectWithToken = async (req, res, user, provider) => {
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
      await writeAuditLog(db, {
        user_id: user.user_id,
        session_id: sessionId,
        action: "LOGIN_OAUTH",
        entity_type: "auth",
        entity_id: String(user.user_id),
        new_values: { provider, email: user.email },
        ip_address: req.ip,
        user_agent: req.get("user-agent")
      });
      if (user.email) {
        sendLoginNotificationEmail(user.email).catch((err) =>
          logError("OAUTH", "Login notification email failed", err)
        );
      }
      const token = jwt.sign(
        { id: user.user_id, username: user.username, role: user.role_name, sessionId },
        JWT_SECRET,
        { expiresIn: "24h" }
      );
      const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
      log("OAUTH", `${provider} sign-in success, redirecting to client`, { user_id: user.user_id, email: user.email });
      res.redirect(`${clientUrl}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({
        id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role_name
      }))}`);
    } catch (error) {
      logError("OAUTH", `${provider} redirect/session failed`, error);
      res.redirect(`${process.env.CLIENT_URL || "http://localhost:5173"}/login?error=oauth_failed`);
    }
  };

  app.get("/api/auth/google", (req, res, next) => {
    log("OAUTH", "Google sign-in started");
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });
  app.get("/api/auth/google/callback",
    (req, res, next) => {
      log("OAUTH", "Google callback hit");
      passport.authenticate("google", { session: false }, async (err, user) => {
        if (err) {
          logError("OAUTH", "Google callback auth failed", err);
          await writeAuditLog(db, {
            action: err.message === "USER_NOT_FOUND" ? "OAUTH_USER_NOT_FOUND" : "OAUTH_FAILED",
            entity_type: "auth",
            new_values: { provider: "Google", reason: err.message },
            ip_address: req.ip,
            user_agent: req.get("user-agent")
          });
          const errorParam = err.message === "USER_NOT_FOUND" ? "user_not_found" : "oauth_failed";
          return res.redirect(`${process.env.CLIENT_URL || "http://localhost:5173"}/login?error=${errorParam}`);
        }
        if (!user) {
          log("OAUTH", "Google callback: no user");
          await writeAuditLog(db, { action: "OAUTH_FAILED", entity_type: "auth", new_values: { provider: "Google" }, ip_address: req.ip, user_agent: req.get("user-agent") });
          return res.redirect(`${process.env.CLIENT_URL || "http://localhost:5173"}/login?error=oauth_failed`);
        }
        redirectWithToken(req, res, user, "Google");
      })(req, res, next);
    }
  );

  app.get("/api/auth/microsoft", (req, res, next) => {
    log("OAUTH", "Microsoft sign-in started");
    passport.authenticate("microsoft", { scope: ["user.read"] })(req, res, next);
  });
  app.get("/api/auth/microsoft/callback",
    (req, res, next) => {
      log("OAUTH", "Microsoft callback hit");
      passport.authenticate("microsoft", { session: false }, async (err, user) => {
        if (err) {
          logError("OAUTH", "Microsoft callback auth failed", err);
          await writeAuditLog(db, {
            action: err.message === "USER_NOT_FOUND" ? "OAUTH_USER_NOT_FOUND" : "OAUTH_FAILED",
            entity_type: "auth",
            new_values: { provider: "Microsoft", reason: err.message },
            ip_address: req.ip,
            user_agent: req.get("user-agent")
          });
          const errorParam = err.message === "USER_NOT_FOUND" ? "user_not_found" : "oauth_failed";
          return res.redirect(`${process.env.CLIENT_URL || "http://localhost:5173"}/login?error=${errorParam}`);
        }
        if (!user) {
          log("OAUTH", "Microsoft callback: no user");
          await writeAuditLog(db, { action: "OAUTH_FAILED", entity_type: "auth", new_values: { provider: "Microsoft" }, ip_address: req.ip, user_agent: req.get("user-agent") });
          return res.redirect(`${process.env.CLIENT_URL || "http://localhost:5173"}/login?error=oauth_failed`);
        }
        redirectWithToken(req, res, user, "Microsoft");
      })(req, res, next);
    }
  );

  app.get("/api/auth/apple", (req, res) => {
    log("OAUTH", "Apple sign-in started");
    const clientId = process.env.APPLE_CLIENT_ID;
    const redirectUri = `${process.env.SERVER_URL || "http://localhost:5000"}/api/auth/apple/callback`;
    if (!clientId) {
      return res.status(501).json({ message: "Apple OAuth not configured" });
    }
    const appleAuthUrl = `https://appleid.apple.com/auth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=email%20name&response_mode=form_post`;
    res.redirect(appleAuthUrl);
  });

  app.post("/api/auth/apple/callback", async (req, res) => {
    log("OAUTH", "Apple callback hit (not fully implemented)");
    await writeAuditLog(db, {
      action: "OAUTH_FAILED",
      entity_type: "auth",
      new_values: { provider: "Apple", reason: "not_fully_implemented" },
      ip_address: req.ip,
      user_agent: req.get("user-agent")
    });
    res.redirect(`${process.env.CLIENT_URL || "http://localhost:5173"}/login?error=apple_oauth_not_fully_implemented`);
  });
};
