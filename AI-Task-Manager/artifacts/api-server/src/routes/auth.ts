import { Router, type IRouter } from "express";
import {
  registerUser,
  loginUser,
  loginOrCreateGoogleUser,
  validateSession,
  logoutUser,
  logoutAllSessions,
  getUserCount,
  listUsers,
  updateUser,
  deleteUser,
  getActiveSessions,
  cleanExpiredSessions,
  hasSuperAdminRole,
  forgotPassword,
  getCompanyRoles,
  setCompanyRoleAdmin,
  verifyCurrentPassword,
  refreshSession,
  createUserSession,
} from "../lib/auth";
import { withRetry, pool } from "@workspace/db";
import crypto from "crypto";

const router: IRouter = Router();

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens (token) WHERE NOT used`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mfa_login_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        method TEXT NOT NULL DEFAULT 'totp',
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        attempts INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mlt_token ON mfa_login_tokens (token) WHERE NOT used`);
    await pool.query(`ALTER TABLE mfa_login_tokens ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE user_mfa ADD COLUMN IF NOT EXISTS sms_mfa_enabled BOOLEAN DEFAULT FALSE`).catch(() => {});
    await pool.query(`ALTER TABLE user_mfa ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`).catch(() => {});
  } catch {}
})();

const forgotPasswordAttempts = new Map<string, { count: number; resetAt: number }>();
const FORGOT_PASSWORD_LIMIT = 3;
const FORGOT_PASSWORD_WINDOW_MS = 15 * 60 * 1000;

function checkForgotPasswordRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = forgotPasswordAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    forgotPasswordAttempts.set(ip, { count: 1, resetAt: now + FORGOT_PASSWORD_WINDOW_MS });
    return true;
  }
  if (entry.count >= FORGOT_PASSWORD_LIMIT) return false;
  entry.count += 1;
  return true;
}

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: הרשמת משתמש חדש — Register user (admin only)
 *     description: יוצר משתמש חדש במערכת. נדרשת הרשאת SuperAdmin.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password, fullName]
 *             properties:
 *               username: { type: string, example: "john.doe" }
 *               password: { type: string, format: password }
 *               fullName: { type: string, example: "John Doe" }
 *               email: { type: string, format: email }
 *               department: { type: string, example: "Production" }
 *               jobTitle: { type: string, example: "Operator" }
 *     responses:
 *       201: { description: "משתמש נוצר בהצלחה" }
 *       400: { description: "נתונים לא תקינים / שם משתמש תפוס" }
 *       401: { description: "נדרשת הרשאת מנהל" }
 */
router.post("/auth/register", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
    const { user: currentUser, error: authError } = await validateSession(token);
    if (authError || !currentUser) { res.status(401).json({ error: authError || "לא מחובר" }); return; }
    const currentUserId = (currentUser as { id: number }).id;
    const isSuperAdmin = (currentUser as { isSuperAdmin: boolean }).isSuperAdmin || await hasSuperAdminRole(currentUserId);

    const { username, password, fullName, fullNameHe, email, phone, department, jobTitle, isSuperAdmin: newUserIsSuperAdmin } = req.body;
    if (!username || !password || !fullName) {
      res.status(400).json({ error: "שם משתמש, סיסמה ושם מלא הם שדות חובה" });
      return;
    }
    const canGrantSuperAdmin = isSuperAdmin && newUserIsSuperAdmin === true;
    const { user, error, welcomeEmailSent, welcomeEmailError } = await registerUser({ username, password, fullName, fullNameHe, email, phone, department, jobTitle, isSuperAdmin: canGrantSuperAdmin });
    if (error) {
      res.status(400).json({ error });
      return;
    }
    const message = welcomeEmailSent
      ? "המשתמש נוצר בהצלחה ואימייל ברוך הבא נשלח"
      : "המשתמש נוצר בהצלחה";
    res.json({
      user,
      message,
      welcomeEmailSent,
      welcomeEmailError: welcomeEmailError ? "שליחת אימייל ברוך הבא נכשלה" : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: "שגיאה ביצירת משתמש" });
  }
});

router.post("/auth/forgot-password", async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkForgotPasswordRateLimit(ip)) {
      res.status(429).json({ error: "יותר מדי ניסיונות. נסה שוב בעוד 15 דקות" });
      return;
    }
    const { email, username } = req.body;
    const identifier = email || username;
    if (!identifier) {
      res.status(400).json({ error: "יש להזין שם משתמש או כתובת אימייל" });
      return;
    }
    const trimmed = identifier.trim();
    const isEmail = trimmed.includes("@");
    const { rows: users } = await pool.query(
      `SELECT id, email, full_name, full_name_he, username FROM users WHERE ${isEmail ? "email" : "username"} = $1 AND is_active = true LIMIT 1`,
      [trimmed]
    );
    const genericMsg = "אם הפרטים קיימים במערכת, ישלח אימייל עם לינק לאיפוס הסיסמה";
    if (!users.length) {
      res.json({ message: genericMsg });
      return;
    }
    const user = users[0];
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query(
      `UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND NOT used`,
      [user.id]
    );
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.id, token, expiresAt]
    );
    try {
      const { sendPasswordResetEmail } = await import("../lib/gmail-service");
      const emailResult = await sendPasswordResetEmail({
        email: user.email,
        fullName: user.full_name_he || user.full_name,
        username: user.username,
        newPassword: "",
        resetLink: `${process.env.APP_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "")}/reset-password/${token}`,
      });
      if (!emailResult.success) {
        console.error(`[Auth] Password reset email failed for ${user.email}: ${emailResult.error}`);
      }
    } catch (emailErr) {
      console.error("[Auth] Password reset email error:", emailErr instanceof Error ? emailErr.message : emailErr);
    }
    res.json({ message: genericMsg });
  } catch (err) {
    res.status(500).json({ error: "שגיאה באיפוס סיסמה" });
  }
});

router.get("/auth/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  if (!token) {
    res.status(400).json({ valid: false, error: "טוקן לא תקין" });
    return;
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, expires_at FROM password_reset_tokens WHERE token = $1 AND NOT used LIMIT 1`,
      [token]
    );
    if (!rows.length) {
      res.status(400).json({ valid: false, error: "הלינק לאיפוס סיסמה אינו תקף או שכבר נוצל" });
      return;
    }
    if (new Date(rows[0].expires_at) < new Date()) {
      res.status(400).json({ valid: false, error: "הלינק לאיפוס סיסמה פג תוקף" });
      return;
    }
    res.json({ valid: true });
  } catch {
    res.status(500).json({ valid: false, error: "שגיאה בבדיקת הטוקן" });
  }
});

router.post("/auth/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  if (!token) {
    res.status(400).json({ error: "טוקן לאיפוס לא תקין" });
    return;
  }
  if (!password || typeof password !== "string" || password.trim().length < 6) {
    res.status(400).json({ error: "הסיסמה חייבת להכיל לפחות 6 תווים" });
    return;
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, expires_at FROM password_reset_tokens WHERE token = $1 AND NOT used LIMIT 1`,
      [token]
    );
    if (!rows.length) {
      res.status(400).json({ error: "הלינק לאיפוס סיסמה אינו תקף או שכבר נוצל" });
      return;
    }
    if (new Date(rows[0].expires_at) < new Date()) {
      res.status(400).json({ error: "הלינק לאיפוס סיסמה פג תוקף. אנא בקש לינק חדש." });
      return;
    }
    const updated = await updateUser(rows[0].user_id, { password: password.trim() });
    if (!updated) {
      res.status(400).json({ error: "משתמש לא נמצא" });
      return;
    }
    await pool.query(`UPDATE password_reset_tokens SET used = true WHERE id = $1`, [rows[0].id]);
    await pool.query(
      `DELETE FROM user_sessions WHERE user_id = $1`,
      [rows[0].user_id]
    );
    res.json({ message: "הסיסמה שונתה בהצלחה" });
  } catch (err) {
    res.status(500).json({ error: "שגיאה באיפוס סיסמה" });
  }
});

router.post("/auth/public-register", async (_req, res) => {
  res.status(403).json({ error: "הרשמה ציבורית אינה מופעלת. פנה למנהל המערכת לפתיחת חשבון" });
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: התחברות למערכת — Login
 *     description: |
 *       מחזיר JWT token לשימוש בכל הקריאות הבאות.
 *       שלח ב-header: `Authorization: Bearer <token>`
 *       Token תקף ל-24 שעות. מוגבל ל-10 ניסיונות לכישלון בשעה (rate limit).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, example: "admin" }
 *               password: { type: string, format: password, example: "admin123" }
 *           example:
 *             username: admin
 *             password: admin123
 *     responses:
 *       200:
 *         description: התחברות הצליחה
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string, description: "JWT Bearer token" }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     username: { type: string }
 *                     fullName: { type: string }
 *                     role: { type: string }
 *                     isSuperAdmin: { type: boolean }
 *       400: { description: "שם משתמש/סיסמה חסרים" }
 *       401: { description: "פרטי התחברות שגויים" }
 *       429: { description: "יותר מדי ניסיונות — Rate limit" }
 */
router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: "שם משתמש וסיסמה הם שדות חובה" });
      return;
    }
    const ip = req.ip || req.headers["x-forwarded-for"] as string || "";
    const ua = req.headers["user-agent"] || "";
    const result = await withRetry(
      () => loginUser(username, password, ip, ua),
      { maxAttempts: 3, baseDelayMs: 300, label: "loginUser" }
    );
    if (result.error) {
      res.status(401).json({ error: result.error });
      return;
    }

    const userId = (result.user as any)?.id;
    if (userId) {
      try {
        const { rows: mfaRows } = await pool.query(
          `SELECT totp_enabled, email_mfa_enabled, sms_mfa_enabled, phone FROM user_mfa WHERE user_id = $1 LIMIT 1`,
          [userId]
        );
        const mfaRow = mfaRows[0];
        if (mfaRow && (mfaRow.totp_enabled || mfaRow.email_mfa_enabled || mfaRow.sms_mfa_enabled)) {
          await pool.query(
            `UPDATE user_sessions SET is_active = false WHERE token = $1`,
            [result.token]
          );

          const tempToken = crypto.randomBytes(48).toString("hex");
          const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

          let method: string;

          if (mfaRow.totp_enabled) {
            method = "totp";
          } else if (mfaRow.sms_mfa_enabled) {
            const phone = mfaRow.phone;
            if (!phone) {
              console.warn("[Auth] SMS MFA enabled but no phone number set — falling back to email");
              method = mfaRow.email_mfa_enabled ? "email" : "";
            } else {
              try {
                const { db } = await import("@workspace/db");
                const { integrationConnectionsTable } = await import("@workspace/db/schema");
                const { eq, and } = await import("drizzle-orm");
                const [smsConn] = await db.select()
                  .from(integrationConnectionsTable)
                  .where(and(
                    eq(integrationConnectionsTable.serviceType, "sms"),
                    eq(integrationConnectionsTable.isActive, true),
                  ))
                  .limit(1);

                if (!smsConn) {
                  console.warn("[Auth] SMS MFA enabled but no active SMS connection — falling back to email");
                  method = mfaRow.email_mfa_enabled ? "email" : "";
                } else {
                  const { generateChallenge } = await import("../lib/mfa");
                  const smsCode = await generateChallenge(userId, "sms");
                  const { sendSmsMessage } = await import("../lib/sms-service");
                  const smsResult = await sendSmsMessage({
                    connectionId: smsConn.id,
                    to: phone,
                    message: `קוד האימות שלך למערכת TechnoKol ERP: ${smsCode}. הקוד תקף ל-10 דקות.`,
                  });
                  if (smsResult.success) {
                    method = "sms";
                  } else {
                    console.warn("[Auth] SMS send failed:", smsResult.error, "— falling back to email");
                    method = mfaRow.email_mfa_enabled ? "email" : "";
                  }
                }
              } catch (smsErr) {
                console.warn("[Auth] SMS MFA error:", smsErr instanceof Error ? smsErr.message : smsErr, "— falling back to email");
                method = mfaRow.email_mfa_enabled ? "email" : "";
              }
            }
          } else {
            method = "email";
          }

          if (!method) {
            res.status(500).json({ error: "לא ניתן לשלוח קוד אימות דו-שלבי. צור קשר עם מנהל המערכת" });
            return;
          }

          if (method === "email") {
            let emailDispatched = false;
            try {
              const { generateEmailChallenge } = await import("../lib/mfa");
              const emailCode = await generateEmailChallenge(userId, "login");
              const { rows: userRows } = await pool.query(`SELECT email FROM users WHERE id = $1`, [userId]);
              const userEmail = userRows[0]?.email;
              if (!userEmail) {
                console.error("[Auth] Email MFA: no email address found for user", userId);
                res.status(500).json({ error: "לא ניתן לשלוח קוד אימות — כתובת אימייל חסרה" });
                return;
              }
              const nodemailer = await import("nodemailer");
              const transporter = nodemailer.default.createTransport({
                host: process.env.SMTP_HOST || "smtp.gmail.com",
                port: parseInt(process.env.SMTP_PORT || "587"),
                secure: false,
                auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
              });
              await transporter.sendMail({
                from: process.env.SMTP_FROM || "noreply@technokol.co.il",
                to: userEmail,
                subject: "קוד אימות כניסה - TechnoKol ERP",
                html: `<div dir="rtl" style="font-family: Arial; padding: 20px;"><h2>קוד אימות כניסה</h2><p>קוד האימות שלך הוא:</p><h1 style="letter-spacing: 4px; color: #3b82f6;">${emailCode}</h1><p>הקוד תקף ל-10 דקות.</p></div>`,
                text: `Your login MFA code is: ${emailCode}. Valid for 10 minutes.`,
              });
              emailDispatched = true;
            } catch (emailErr) {
              console.error("[Auth] Failed to send MFA email:", emailErr instanceof Error ? emailErr.message : emailErr);
            }
            if (!emailDispatched) {
              res.status(500).json({ error: "שליחת קוד האימות באימייל נכשלה. אנא נסה שוב" });
              return;
            }
          }

          await pool.query(
            `INSERT INTO mfa_login_tokens (user_id, token, method, expires_at, attempts) VALUES ($1, $2, $3, $4, 0)`,
            [userId, tempToken, method, expiresAt]
          );

          res.json({ mfa_required: true, method, temp_token: tempToken });
          return;
        }
      } catch (mfaErr) {
        console.error("[Auth] MFA check failed (fail-closed):", mfaErr instanceof Error ? mfaErr.message : mfaErr);
        try {
          await pool.query(`UPDATE user_sessions SET is_active = false WHERE token = $1`, [result.token]);
        } catch {}
        res.status(500).json({ error: "שגיאה בבדיקת אימות דו-שלבי. נסה שוב" });
        return;
      }
    }

    res.json({ token: result.token, user: result.user, message: "התחברת בהצלחה" });
  } catch (err) {
    res.status(500).json({ error: "שגיאת התחברות" });
  }
});

const MFA_MAX_ATTEMPTS = 5;

router.post("/auth/mfa-login", async (req, res) => {
  try {
    const { temp_token, code } = req.body;
    if (!temp_token || !code) {
      res.status(400).json({ error: "נדרש טוקן זמני וקוד אימות" });
      return;
    }

    const { rows: tokenRows } = await pool.query(
      `UPDATE mfa_login_tokens SET attempts = COALESCE(attempts, 0) + 1
       WHERE token = $1 AND NOT used
       RETURNING id, user_id, method, expires_at, attempts`,
      [temp_token]
    );
    if (!tokenRows.length) {
      res.status(401).json({ error: "טוקן זמני לא תקין או שכבר נוצל" });
      return;
    }
    const tokenRow = tokenRows[0];
    if (new Date(tokenRow.expires_at) < new Date()) {
      await pool.query(`UPDATE mfa_login_tokens SET used = true WHERE id = $1`, [tokenRow.id]);
      res.status(401).json({ error: "טוקן זמני פג תוקף. אנא התחבר מחדש" });
      return;
    }

    if ((tokenRow.attempts || 0) > MFA_MAX_ATTEMPTS) {
      await pool.query(`UPDATE mfa_login_tokens SET used = true WHERE id = $1`, [tokenRow.id]);
      res.status(429).json({ error: "יותר מדי ניסיונות אימות. אנא התחבר מחדש" });
      return;
    }

    const userId = tokenRow.user_id;
    const challengeMethod = tokenRow.method || "totp";

    const { rows: mfaRows } = await pool.query(
      `SELECT totp_secret, totp_enabled, backup_codes FROM user_mfa WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (!mfaRows.length) {
      res.status(400).json({ error: "הגדרות MFA לא נמצאו" });
      return;
    }
    const mfaRow = mfaRows[0];

    let verified = false;

    if (challengeMethod === "email" || challengeMethod === "sms") {
      try {
        const { verifyMFAChallenge } = await import("../lib/mfa");
        verified = await verifyMFAChallenge(userId, code, challengeMethod as "email" | "sms");
      } catch (verifyErr) {
        console.error(`[Auth] ${challengeMethod} MFA verify error:`, verifyErr instanceof Error ? verifyErr.message : verifyErr);
      }
    }

    if (challengeMethod === "totp" && mfaRow.totp_enabled && mfaRow.totp_secret) {
      const { verifyMfaCode } = await import("../lib/mfa-verify");
      verified = verifyMfaCode(mfaRow.totp_secret, code);
    }

    if (!verified && mfaRow.backup_codes) {
      const backupCodes: string[] = Array.isArray(mfaRow.backup_codes) ? mfaRow.backup_codes : [];
      if (backupCodes.includes(code)) {
        verified = true;
        const updatedCodes = backupCodes.filter(c => c !== code);
        await pool.query(
          `UPDATE user_mfa SET backup_codes = $1 WHERE user_id = $2`,
          [JSON.stringify(updatedCodes), userId]
        );
      }
    }

    if (!verified) {
      const attemptsLeft = MFA_MAX_ATTEMPTS - (tokenRow.attempts || 0);
      const msg = attemptsLeft > 0
        ? `קוד אימות שגוי. נותרו ${attemptsLeft} ניסיונות`
        : "קוד אימות שגוי. הטוקן נחסם, אנא התחבר מחדש";
      if (attemptsLeft <= 0) {
        await pool.query(`UPDATE mfa_login_tokens SET used = true WHERE id = $1`, [tokenRow.id]);
      }
      res.status(401).json({ error: msg });
      return;
    }

    await pool.query(`UPDATE mfa_login_tokens SET used = true WHERE id = $1`, [tokenRow.id]);

    const ip = req.ip || req.headers["x-forwarded-for"] as string || "";
    const ua = req.headers["user-agent"] || "";
    const sessionResult = await createUserSession(userId, ip, ua);
    if (!sessionResult) {
      res.status(500).json({ error: "שגיאה ביצירת חיבור" });
      return;
    }

    res.json({ token: sessionResult.token, user: sessionResult.user, message: "התחברת בהצלחה" });
  } catch (err) {
    console.error("[Auth] MFA login error:", err);
    res.status(500).json({ error: "שגיאה באימות דו-שלבי" });
  }
});

router.post("/auth/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      res.status(400).json({ error: "Google credential is required" });
      return;
    }
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    if (!GOOGLE_CLIENT_ID) {
      res.status(500).json({ error: "Google OAuth לא מוגדר. יש להגדיר GOOGLE_CLIENT_ID" });
      return;
    }
    const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`;
    const verifyRes = await fetch(verifyUrl);
    if (!verifyRes.ok) {
      res.status(401).json({ error: "Google token לא תקין" });
      return;
    }
    const payload = await verifyRes.json() as any;
    if (payload.aud !== GOOGLE_CLIENT_ID) {
      res.status(401).json({ error: "Google token לא מורשה" });
      return;
    }
    if (!payload.email || !payload.email_verified) {
      res.status(401).json({ error: "אימייל Google לא מאומת" });
      return;
    }
    const ip = req.ip || req.headers["x-forwarded-for"] as string || "";
    const ua = req.headers["user-agent"] || "";
    const result = await loginOrCreateGoogleUser(
      { email: payload.email, name: payload.name || payload.email, picture: payload.picture, googleId: payload.sub },
      ip, ua
    );
    if (result.error) {
      res.status(401).json({ error: result.error });
      return;
    }
    res.json({ token: result.token, user: result.user, message: "התחברת עם Google בהצלחה" });
  } catch (err) {
    res.status(500).json({ error: "שגיאה בהתחברות Google" });
  }
});

router.get("/auth/google/client-id", (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  res.json({ clientId: clientId || null, configured: !!clientId });
});


router.post("/auth/logout", async (req, res) => {
  try {
    const token = extractToken(req);
    if (token) await logoutUser(token);
    res.json({ message: "התנתקת בהצלחה" });
  } catch (err) {
    res.status(500).json({ error: "שגיאה בהתנתקות" });
  }
});

router.post("/auth/refresh-session", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "לא מחובר" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "לא מחובר" }); return; }
    const ok = await refreshSession(token);
    if (!ok) { res.status(401).json({ error: "Session לא תקין" }); return; }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "שגיאה ברענון חיבור" });
  }
});

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Authentication]
 *     summary: פרטי המשתמש המחובר — Get current user
 *     description: מחזיר את פרטי המשתמש הנוכחי לפי ה-Bearer token שסופק ב-Authorization header.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: פרטי המשתמש
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer, example: 1 }
 *                 username: { type: string, example: "admin" }
 *                 fullName: { type: string, example: "מנהל מערכת" }
 *                 email: { type: string, example: "admin@technokol.co.il" }
 *                 role: { type: string, example: "admin" }
 *                 department: { type: string }
 *                 isSuperAdmin: { type: boolean }
 *       401: { description: "לא מחובר — token חסר או פג תוקף" }
 */
router.get("/auth/me", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: "לא מחובר" });
      return;
    }
    const { user, error } = await validateSession(token);
    if (error || !user) {
      res.status(401).json({ error: error || "לא מחובר" });
      return;
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: "שגיאה בבדיקת חיבור" });
  }
});

router.get("/auth/users", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "לא מחובר" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "לא מחובר" }); return; }
    const users = await listUsers();
    res.json({ users, count: users.length });
  } catch (err) {
    res.status(500).json({ error: "שגיאה בטעינת משתמשים" });
  }
});

router.post("/auth/users/:id/reset-password", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "לא מחובר" }); return; }
    const { user: currentUser, error } = await validateSession(token);
    if (error || !currentUser) { res.status(401).json({ error: error || "לא מחובר" }); return; }
    if (!(currentUser as any).isSuperAdmin) {
      res.status(403).json({ error: "רק מנהלים יכולים לאפס סיסמאות" });
      return;
    }
    const targetId = parseInt(req.params.id);
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      res.status(400).json({ error: "סיסמה חדשה חייבת להכיל לפחות 6 תווים" });
      return;
    }
    const updated = await updateUser(targetId, { password: newPassword });
    if (!updated) { res.status(404).json({ error: "משתמש לא נמצא" }); return; }
    res.json({ message: "הסיסמה אופסה בהצלחה" });
  } catch (err) {
    res.status(500).json({ error: "שגיאה באיפוס סיסמה" });
  }
});

router.put("/auth/users/:id", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "לא מחובר" }); return; }
    const { user: currentUser, error } = await validateSession(token);
    if (error || !currentUser) { res.status(401).json({ error: error || "לא מחובר" }); return; }
    const targetId = parseInt(req.params.id);
    const isSelf = (currentUser as any).id === targetId;
    if (!isSelf && !(currentUser as any).isSuperAdmin) {
      res.status(403).json({ error: "אין הרשאה לעדכן משתמש זה" });
      return;
    }
    const body = { ...req.body };
    if (!(currentUser as any).isSuperAdmin) {
      delete body.isSuperAdmin;
      delete body.isActive;
      delete body.password;
    }
    const updated = await updateUser(targetId, body);
    if (!updated) { res.status(404).json({ error: "משתמש לא נמצא" }); return; }
    res.json({ user: updated, message: "המשתמש עודכן בהצלחה" });
  } catch (err) {
    res.status(500).json({ error: "שגיאה בעדכון משתמש" });
  }
});

router.delete("/auth/users/:id", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "לא מחובר" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "לא מחובר" }); return; }
    if (!(user as any).isSuperAdmin) { res.status(403).json({ error: "נדרשות הרשאות מנהל" }); return; }
    const targetId = parseInt(req.params.id);
    if ((user as any).id === targetId) { res.status(400).json({ error: "לא ניתן למחוק את עצמך" }); return; }
    const deleted = await deleteUser(targetId);
    if (!deleted) { res.status(404).json({ error: "משתמש לא נמצא" }); return; }
    res.json({ message: "המשתמש נמחק בהצלחה" });
  } catch (err) {
    res.status(500).json({ error: "שגיאה במחיקת משתמש" });
  }
});

router.post("/auth/change-password", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "לא מחובר" }); return; }
    const { user: currentUser, error } = await validateSession(token);
    if (error || !currentUser) { res.status(401).json({ error: error || "לא מחובר" }); return; }
    const userId = (currentUser as { id: number }).id;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "יש לספק סיסמה נוכחית וסיסמה חדשה" });
      return;
    }
    if (typeof newPassword !== "string" || newPassword.trim().length < 8) {
      res.status(400).json({ error: "הסיסמה החדשה חייבת להכיל לפחות 8 תווים" });
      return;
    }
    const isValid = await verifyCurrentPassword(userId, currentPassword);
    if (!isValid) {
      res.status(401).json({ error: "הסיסמה הנוכחית שגויה" });
      return;
    }
    await updateUser(userId, { password: newPassword });
    res.json({ message: "הסיסמה שונתה בהצלחה" });
  } catch {
    res.status(500).json({ error: "שגיאה בשינוי סיסמה" });
  }
});

router.post("/auth/logout-all", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "לא מחובר" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "לא מחובר" }); return; }
    const count = await logoutAllSessions((user as any).id);
    res.json({ message: `נותקו ${count} חיבורים` });
  } catch (err) {
    res.status(500).json({ error: "שגיאה" });
  }
});

router.get("/auth/sessions", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "לא מחובר" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "לא מחובר" }); return; }
    const sessions = await getActiveSessions((user as any).id);
    res.json({ sessions, count: sessions.length });
  } catch (err) {
    res.status(500).json({ error: "שגיאה בטעינת חיבורים" });
  }
});

router.post("/auth/cleanup", async (req, res) => {
  try {
    const count = await cleanExpiredSessions();
    res.json({ message: `נוקו ${count} חיבורים שפגו` });
  } catch (err) {
    res.status(500).json({ error: "שגיאה בניקוי" });
  }
});

router.get("/auth/company-roles", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "לא מחובר" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "לא מחובר" }); return; }
    if (!(user as any).isSuperAdmin) { res.status(403).json({ error: "נדרשות הרשאות מנהל" }); return; }
    const companyRoles = await getCompanyRoles();
    res.json(companyRoles);
  } catch (err) {
    res.status(500).json({ error: "שגיאה בטעינת תפקידי חברה" });
  }
});

router.put("/auth/company-roles/:jobTitle/admin", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "לא מחובר" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "לא מחובר" }); return; }
    if (!(user as any).isSuperAdmin) { res.status(403).json({ error: "נדרשות הרשאות מנהל" }); return; }
    const jobTitle = decodeURIComponent(req.params.jobTitle);
    const { isAdmin } = req.body;
    if (typeof isAdmin !== "boolean") { res.status(400).json({ error: "נדרש ערך isAdmin" }); return; }
    const updatedCount = await setCompanyRoleAdmin(jobTitle, isAdmin);
    res.json({ message: `עודכנו ${updatedCount} משתמשים`, updatedCount });
  } catch (err) {
    res.status(500).json({ error: "שגיאה בעדכון תפקיד חברה" });
  }
});

const DEPT_ROLE_MAP: Record<string, string> = {
  "הנהלה": "executive-manager",
  "מכירות": "sales-rep",
  "כספים": "accountant",
  "ייצור ברזל": "production-worker",
  "ייצור אלומיניום": "production-worker",
  "ייצור זכוכית": "production-worker",
  "ייצור נירוסטה": "production-worker",
  "מחסנים": "warehouse-worker",
  "לוגיסטיקה": "warehouse-worker",
  "התקנות": "production-worker",
  "תחזוקה": "factory-manager",
  "תכנון": "factory-manager",
  "מדידות": "production-worker",
  "בקרת איכות": "factory-manager",
  "IT": "factory-manager",
  "משאבי אנוש": "hr-manager",
  "רכש": "procurement-manager",
};

function generateUsername(firstName: string, lastName: string, existingUsernames: Set<string>): string {
  const translitMap: Record<string, string> = {
    "א": "a", "ב": "b", "ג": "g", "ד": "d", "ה": "h", "ו": "v", "ז": "z",
    "ח": "ch", "ט": "t", "י": "y", "כ": "k", "ך": "k", "ל": "l", "מ": "m",
    "ם": "m", "נ": "n", "ן": "n", "ס": "s", "ע": "a", "פ": "p", "ף": "f",
    "צ": "tz", "ץ": "tz", "ק": "k", "ר": "r", "ש": "sh", "ת": "t",
  };
  const translit = (s: string) => s.split("").map(c => translitMap[c] || c).join("").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const first = translit(firstName.trim());
  const last = translit(lastName.trim());
  let base = `${first}.${last}`;
  if (!base || base === ".") base = `user${Date.now()}`;
  let username = base;
  let counter = 2;
  while (existingUsernames.has(username)) {
    username = `${base}${counter}`;
    counter++;
  }
  existingUsernames.add(username);
  return username;
}

router.post("/auth/bulk-provision", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
    const { user: currentUser, error: authError } = await validateSession(token);
    if (authError || !currentUser) { res.status(401).json({ error: authError || "לא מחובר" }); return; }
    if (!(currentUser as any).isSuperAdmin) { res.status(403).json({ error: "נדרשות הרשאות מנהל-על" }); return; }

    const defaultPassword = req.body.defaultPassword || "Technokol2026!";
    const dryRun = req.body.dryRun === true;

    const { rows: employees } = await (await import("@workspace/db")).pool.query(
      `SELECT id, employee_number, first_name, last_name, full_name, email, department, job_title, phone, status
       FROM employees WHERE status != 'terminated' OR status IS NULL ORDER BY id`
    );

    const { rows: existingUsers } = await (await import("@workspace/db")).pool.query(
      `SELECT username, email, employee_number FROM users`
    );

    const existingEmails = new Set(existingUsers.map((u: any) => u.email?.toLowerCase()).filter(Boolean));
    const existingEmpNums = new Set(existingUsers.map((u: any) => u.employee_number).filter(Boolean));
    const existingUsernames = new Set(existingUsers.map((u: any) => u.username));

    const { rows: roles } = await (await import("@workspace/db")).pool.query(
      `SELECT id, slug FROM platform_roles`
    );
    const roleMap = new Map(roles.map((r: any) => [r.slug, r.id]));

    const toCreate: any[] = [];
    const skipped: any[] = [];

    for (const emp of employees) {
      if (existingEmpNums.has(emp.employee_number)) {
        skipped.push({ employee_number: emp.employee_number, reason: "כבר קיים חשבון" });
        continue;
      }
      if (emp.email && existingEmails.has(emp.email.toLowerCase())) {
        skipped.push({ employee_number: emp.employee_number, reason: "אימייל כבר רשום" });
        continue;
      }

      const firstName = emp.first_name || emp.full_name?.split(" ")[0] || "user";
      const lastName = emp.last_name || emp.full_name?.split(" ").slice(1).join(" ") || emp.employee_number;
      const username = generateUsername(firstName, lastName, existingUsernames);
      const roleSlug = DEPT_ROLE_MAP[emp.department] || "production-worker";
      const roleId = roleMap.get(roleSlug);

      toCreate.push({
        username,
        email: emp.email,
        fullName: emp.full_name || `${firstName} ${lastName}`,
        fullNameHe: emp.full_name || `${firstName} ${lastName}`,
        phone: emp.phone,
        department: emp.department,
        jobTitle: emp.job_title,
        employeeNumber: emp.employee_number,
        roleSlug,
        roleId,
        employeeId: emp.id,
      });
    }

    if (dryRun) {
      res.json({
        dryRun: true,
        toCreate: toCreate.length,
        skipped: skipped.length,
        preview: toCreate.slice(0, 20),
        skippedList: skipped.slice(0, 10),
        roleSummary: toCreate.reduce((acc: Record<string, number>, u: any) => {
          acc[u.roleSlug] = (acc[u.roleSlug] || 0) + 1;
          return acc;
        }, {}),
      });
      return;
    }

    const { pool: dbPool } = await import("@workspace/db");
    const crypto = await import("crypto");
    let created = 0;
    let errors: any[] = [];

    for (const u of toCreate) {
      const client = await dbPool.connect();
      try {
        await client.query("BEGIN");
        const salt = crypto.randomBytes(32).toString("hex");
        const hash = crypto.pbkdf2Sync(defaultPassword, salt, 100000, 64, "sha512").toString("hex");
        const passwordHash = `${salt}:${hash}`;

        const { rows: [newUser] } = await client.query(
          `INSERT INTO users (username, email, password_hash, full_name, full_name_he, phone, department, job_title, employee_number, is_active, is_super_admin, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, false, NOW(), NOW())
           RETURNING id`,
          [u.username, u.email, passwordHash, u.fullName, u.fullNameHe, u.phone, u.department, u.jobTitle, u.employeeNumber]
        );

        if (newUser && u.roleId) {
          await client.query(
            `INSERT INTO role_assignments (user_id, role_id, assigned_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
            [String(newUser.id), u.roleId]
          );
        }
        await client.query("COMMIT");
        created++;
      } catch (err: any) {
        await client.query("ROLLBACK");
        errors.push({ username: u.username, error: err.message?.slice(0, 100) });
      } finally {
        client.release();
      }
    }

    res.json({
      message: `נוצרו ${created} חשבונות משתמש`,
      created,
      skipped: skipped.length,
      errors: errors.length,
      errorDetails: errors.slice(0, 10),
      roleSummary: toCreate.reduce((acc: Record<string, number>, u: any) => {
        acc[u.roleSlug] = (acc[u.roleSlug] || 0) + 1;
        return acc;
      }, {}),
    });
  } catch (err: any) {
    console.error("[bulk-provision]", err);
    res.status(500).json({ error: "שגיאה ביצירת משתמשים: " + (err.message || "").slice(0, 200) });
  }
});

router.get("/auth/stats", async (req, res) => {
  try {
    const totalUsers = await getUserCount();
    res.json({ totalUsers });
  } catch (err) {
    res.status(500).json({ error: "שגיאה" });
  }
});

function extractToken(req: any): string | null {
  if (req.cookies?.accessToken) {
    return req.cookies.accessToken;
  }
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.substring(7);
  }
  return null;
}

export default router;
