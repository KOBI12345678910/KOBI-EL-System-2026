import { Router, type IRouter } from "express";
import { validateSession } from "../lib/auth";
import {
  getMfaConfig,
  setupTotp,
  verifyAndEnableTotp,
  disableMfa,
  generateEmailChallenge,
  verifyMfaCode,
  isMfaRequired,
  isMfaRequiredForAction,
  generateTotpUri,
} from "../lib/mfa";
import { db } from "@workspace/db";
import { usersTable, roleMfaRequirementsTable, roleAssignmentsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

function extractToken(req: any): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.substring(7);
  return req.query.token || null;
}

router.get("/mfa/status", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }

    const userId = (user as any).id;
    let mfa: any = null;
    try { mfa = await getMfaConfig(userId); } catch {}

    let required = false;
    try {
      const assignments = await db.select({ roleId: roleAssignmentsTable.roleId })
        .from(roleAssignmentsTable)
        .where(eq(roleAssignmentsTable.userId, String(userId)));
      const roleIds = assignments.map(a => a.roleId);
      required = await isMfaRequired(userId, roleIds);
    } catch {}

    res.json({
      isEnabled: mfa?.isEnabled || false,
      method: mfa?.method || null,
      totpVerified: mfa?.totpVerified || false,
      emailVerified: mfa?.emailVerified || false,
      lastUsedAt: mfa?.lastUsedAt || null,
      backupCodesCount: Array.isArray(mfa?.backupCodes) ? (mfa.backupCodes as string[]).length : 0,
      isRequired: required,
    });
  } catch (err: any) {
    console.warn("[MFA] status error:", err?.message?.slice(0, 200));
    res.status(500).json({ error: "Failed to get MFA status" });
  }
});

router.post("/mfa/totp/setup", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }

    const userId = (user as any).id;
    const username = (user as any).username || (user as any).email || `user-${userId}`;
    const result = await setupTotp(userId, username);

    res.json({
      secret: result.secret,
      uri: result.uri,
      qrData: result.qrData,
      message: "TOTP setup initiated. Scan the QR code with your authenticator app and verify to complete setup.",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to setup TOTP" });
  }
});

router.post("/mfa/totp/verify", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }

    const userId = (user as any).id;
    const { code } = req.body;
    if (!code) { res.status(400).json({ error: "Verification code required" }); return; }

    const result = await verifyAndEnableTotp(userId, code);
    if (!result.success) { res.status(400).json({ error: result.error || "Invalid code" }); return; }

    res.json({
      message: "MFA enabled successfully. Store your backup codes safely!",
      backupCodes: result.backupCodes,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to verify TOTP" });
  }
});

router.post("/mfa/disable", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }

    const userId = (user as any).id;
    const { code } = req.body;

    const mfaVerification = await verifyMfaCode(userId, code || "");
    if (!mfaVerification.success) {
      res.status(400).json({ error: "Invalid MFA code. Please verify your identity before disabling MFA." });
      return;
    }

    await disableMfa(userId);
    res.json({ message: "MFA disabled successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to disable MFA" });
  }
});

router.post("/mfa/email/send", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }

    const userId = (user as any).id;
    const email = (user as any).email;
    if (!email) { res.status(400).json({ error: "No email address configured for this account" }); return; }

    const code = await generateEmailChallenge(userId, "login");

    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: false,
        auth: process.env.SMTP_USER ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        } : undefined,
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || "noreply@technokol.co.il",
        to: email,
        subject: "קוד אימות - TechnoKol ERP",
        html: `<div dir="rtl" style="font-family: Arial; padding: 20px;"><h2>קוד אימות</h2><p>קוד האימות שלך הוא:</p><h1 style="letter-spacing: 4px; color: #f59e0b;">${code}</h1><p>הקוד תקף ל-10 דקות.</p></div>`,
        text: `Your MFA code is: ${code}. Valid for 10 minutes.`,
      });
    } catch (emailErr) {
      console.warn("[MFA] Failed to send email code:", emailErr);
    }

    res.json({ message: "Verification code sent to your email", expiresIn: 600 });
  } catch (err) {
    res.status(500).json({ error: "Failed to send verification code" });
  }
});

router.post("/mfa/verify", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }

    const userId = (user as any).id;
    const { code, challengeToken, purpose } = req.body;
    if (!code) { res.status(400).json({ error: "Verification code required" }); return; }

    const result = await verifyMfaCode(userId, code, challengeToken, purpose);
    if (!result.success) { res.status(400).json({ error: result.error || "Invalid MFA code" }); return; }

    res.json({ success: true, method: result.method, message: "MFA verification successful" });
  } catch (err) {
    res.status(500).json({ error: "MFA verification failed" });
  }
});

router.get("/mfa/admin/requirements", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }
    if (!(user as any).isSuperAdmin) { res.status(403).json({ error: "Admin access required" }); return; }

    const requirements = await db.select().from(roleMfaRequirementsTable);
    res.json(requirements);
  } catch (err) {
    res.status(500).json({ error: "Failed to get MFA requirements" });
  }
});

router.put("/mfa/admin/requirements/:roleId", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
    const { user, error } = await validateSession(token);
    if (error || !user) { res.status(401).json({ error: error || "Not authenticated" }); return; }
    if (!(user as any).isSuperAdmin) { res.status(403).json({ error: "Admin access required" }); return; }

    const roleId = parseInt(req.params.roleId);
    const { requireMfa, requireMfaForActions } = req.body;

    const existing = await db.select().from(roleMfaRequirementsTable)
      .where(eq(roleMfaRequirementsTable.roleId, roleId)).limit(1);

    if (existing.length > 0) {
      await db.update(roleMfaRequirementsTable).set({
        requireMfa: requireMfa ?? existing[0]!.requireMfa,
        requireMfaForActions: requireMfaForActions ?? existing[0]!.requireMfaForActions,
        updatedAt: new Date(),
      }).where(eq(roleMfaRequirementsTable.roleId, roleId));
    } else {
      await db.insert(roleMfaRequirementsTable).values({
        roleId,
        requireMfa: requireMfa ?? false,
        requireMfaForActions: requireMfaForActions ?? [],
      });
    }

    res.json({ message: "MFA requirement updated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update MFA requirement" });
  }
});

export default router;
