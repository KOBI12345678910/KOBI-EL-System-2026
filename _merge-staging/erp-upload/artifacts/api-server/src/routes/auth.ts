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
} from "../lib/auth";
import { withRetry } from "@workspace/db";

const router: IRouter = Router();

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
    const result = await withRetry(
      () => forgotPassword(identifier.trim()),
      { maxAttempts: 3, baseDelayMs: 300, label: "forgotPassword" }
    );
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    const response: Record<string, unknown> = { message: result.message };
    if (!result.emailSent && result.newPassword) {
      response.newPassword = result.newPassword;
    }
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: "שגיאה באיפוס סיסמה" });
  }
});

router.post("/auth/public-register", async (_req, res) => {
  res.status(403).json({ error: "הרשמה ציבורית אינה מופעלת. פנה למנהל המערכת לפתיחת חשבון" });
});

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
    res.json({ token: result.token, user: result.user, message: "התחברת בהצלחה" });
  } catch (err) {
    res.status(500).json({ error: "שגיאת התחברות" });
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
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.substring(7);
  }
  return req.query.token || null;
}

export default router;
