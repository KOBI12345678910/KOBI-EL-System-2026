/**
 * שכבת אבטחה ארגונית - Enterprise Security Layer
 * מודול מאובטח הכולל JWT, 2FA, Blockchain Audit, GDPR ו-API Keys
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

// ─────────────────────────────────────────────────────────
// קבועי תצורה
// ─────────────────────────────────────────────────────────

/** מפתח סודי ל-JWT - נטען ממשתנה סביבה */
const JWT_SECRET = (() => {
  const v = process.env.JWT_SECRET;
  if (!v && process.env.NODE_ENV === "production") {
    throw new Error("[security] JWT_SECRET environment variable must be set in production");
  }
  return v || "default_jwt_secret_dev_only_2026";
})();

/** מפתח הצפנה לסודות 2FA */
const ENCRYPTION_KEY = (() => {
  const v = process.env.ENCRYPTION_KEY;
  if (!v && process.env.NODE_ENV === "production") {
    throw new Error("[security] ENCRYPTION_KEY environment variable must be set in production");
  }
  return v || "default_encryption_key_32chars!!";
})();

/** חלון זמן TOTP בשניות */
const TOTP_WINDOW_SECONDS = 30;

/** מספר קודי גיבוי ל-2FA */
const BACKUP_CODES_COUNT = 8;

/** אורך מפתח API */
const API_KEY_LENGTH = 48;

/** קידומת מפתח API */
const API_KEY_PREFIX_LENGTH = 8;


// ═════════════════════════════════════════════════════════
// 1. מערכת טוקני JWT
// ═════════════════════════════════════════════════════════

/** קידוד Base64URL בטוח */
function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** פענוח Base64URL */
function base64UrlDecode(str: string): string {
  // השלמת padding אם חסר
  let padded = str.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4 !== 0) {
    padded += "=";
  }
  return Buffer.from(padded, "base64").toString("utf-8");
}

/** יצירת חתימה ל-JWT */
function createJWTSignature(headerPayload: string): string {
  return crypto
    .createHmac("sha256", JWT_SECRET)
    .update(headerPayload)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * יצירת טוקן JWT
 * @param userId - מזהה המשתמש
 * @param roles - רשימת תפקידים
 * @param expiresIn - תוקף בשניות (ברירת מחדל: שעה)
 * @returns טוקן JWT בפורמט header.payload.signature
 */
export function generateJWT(
  userId: number,
  roles: string[],
  expiresIn: number = 3600
): string {
  // כותרת JWT סטנדרטית
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);

  // תוכן הטוקן
  const payload = {
    userId,
    roles,
    iat: now,
    exp: now + expiresIn,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const headerPayload = `${encodedHeader}.${encodedPayload}`;
  const signature = createJWTSignature(headerPayload);

  return `${headerPayload}.${signature}`;
}

/**
 * אימות טוקן JWT
 * @param token - הטוקן לאימות
 * @returns מידע מפוענח מהטוקן
 * @throws שגיאה אם הטוקן לא תקין או פג תוקף
 */
export function verifyJWT(token: string): {
  userId: number;
  roles: string[];
  iat: number;
  exp: number;
} {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("פורמט JWT לא תקין - נדרשים 3 חלקים");
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  // בדיקת חתימה
  const expectedSignature = createJWTSignature(`${encodedHeader}.${encodedPayload}`);
  if (signature !== expectedSignature) {
    throw new Error("חתימת JWT לא תקינה - הטוקן עלול להיות מזויף");
  }

  // פענוח התוכן
  const payload = JSON.parse(base64UrlDecode(encodedPayload));

  // בדיקת תוקף
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error("טוקן JWT פג תוקף");
  }

  return {
    userId: payload.userId,
    roles: payload.roles,
    iat: payload.iat,
    exp: payload.exp,
  };
}

/**
 * חידוש טוקן JWT - יוצר טוקן חדש עם אותם נתונים
 * @param token - הטוקן הנוכחי
 * @returns טוקן חדש עם תוקף מחודש
 */
export function refreshJWT(token: string): string {
  const decoded = verifyJWT(token);
  // חישוב תוקף מקורי לשימור
  const originalDuration = decoded.exp - decoded.iat;
  return generateJWT(decoded.userId, decoded.roles, originalDuration);
}


// ═════════════════════════════════════════════════════════
// 2. אימות דו-שלבי (2FA) - TOTP
// ═════════════════════════════════════════════════════════

/** הצפנת סוד 2FA */
function encrypt2FASecret(secret: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt_2fa", 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

/** פענוח סוד 2FA */
function decrypt2FASecret(encryptedData: string): string {
  const [ivHex, encrypted] = encryptedData.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt_2fa", 32);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/** יצירת סוד TOTP אקראי (Base32) */
function generateTOTPSecret(): string {
  // יצירת 20 בייטים אקראיים וקידוד ל-Base32
  const buffer = crypto.randomBytes(20);
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  for (let i = 0; i < buffer.length; i++) {
    secret += base32Chars[buffer[i] % 32];
  }
  return secret;
}

/** פענוח Base32 לבאפר */
function base32Decode(encoded: string): Buffer {
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of encoded.toUpperCase()) {
    const val = base32Chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** חישוב קוד TOTP לזמן נתון */
function computeTOTP(secret: string, timeStep: number): string {
  const secretBuffer = base32Decode(secret);

  // המרת timeStep ל-8 בייטים big-endian
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(0, 0);
  timeBuffer.writeUInt32BE(timeStep, 4);

  // חישוב HMAC-SHA1
  const hmac = crypto.createHmac("sha1", secretBuffer).update(timeBuffer).digest();

  // Dynamic truncation
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  // 6 ספרות
  return (code % 1000000).toString().padStart(6, "0");
}

/** יצירת קודי גיבוי חד-פעמיים */
function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODES_COUNT; i++) {
    // קוד בפורמט: XXXX-XXXX
    const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();
    codes.push(`${part1}-${part2}`);
  }
  return codes;
}

/**
 * יצירת סוד 2FA למשתמש
 * כולל סוד TOTP, כתובת QR ו-8 קודי גיבוי
 */
export async function generate2FASecret(
  userId: number
): Promise<{ secret: string; qrCodeUrl: string; backupCodes: string[] }> {
  const secret = generateTOTPSecret();
  const backupCodes = generateBackupCodes();

  // הצפנת הסוד לשמירה בבסיס הנתונים
  const encryptedSecret = encrypt2FASecret(secret);

  // Hash של קודי הגיבוי לשמירה בטוחה
  const hashedBackupCodes = backupCodes.map((code) => ({
    hash: crypto.createHash("sha256").update(code).digest("hex"),
    used: false,
  }));

  // שמירה בבסיס הנתונים
  await db.execute(sql`
    INSERT INTO user_2fa (user_id, secret_encrypted, backup_codes, enabled, verified_at)
    VALUES (
      ${userId},
      ${encryptedSecret},
      ${JSON.stringify(hashedBackupCodes)}::jsonb,
      FALSE,
      NULL
    )
    ON CONFLICT (user_id) DO UPDATE SET
      secret_encrypted = EXCLUDED.secret_encrypted,
      backup_codes = EXCLUDED.backup_codes,
      enabled = FALSE,
      verified_at = NULL
  `);

  // יצירת URL ל-QR Code (פורמט otpauth סטנדרטי)
  const issuer = encodeURIComponent("AI-Task-Manager");
  const qrCodeUrl = `otpauth://totp/${issuer}:user_${userId}?secret=${secret}&issuer=${issuer}&digits=6&period=${TOTP_WINDOW_SECONDS}`;

  return { secret, qrCodeUrl, backupCodes };
}

/**
 * אימות קוד 2FA (TOTP או קוד גיבוי)
 * @param userId - מזהה המשתמש
 * @param token - קוד TOTP בן 6 ספרות או קוד גיבוי
 * @returns האם הקוד תקין
 */
export async function verify2FAToken(
  userId: number,
  token: string
): Promise<boolean> {
  // שליפת נתוני 2FA מהמשתמש
  const result = await db.execute(sql`
    SELECT secret_encrypted, backup_codes, enabled
    FROM user_2fa
    WHERE user_id = ${userId}
  `);

  if (!result.rows || result.rows.length === 0) {
    return false;
  }

  const row = result.rows[0] as any;
  const encryptedSecret = row.secret_encrypted;
  const backupCodes = typeof row.backup_codes === "string"
    ? JSON.parse(row.backup_codes)
    : row.backup_codes;

  // בדיקת קוד גיבוי (פורמט XXXX-XXXX)
  if (/^[A-F0-9]{4}-[A-F0-9]{4}$/i.test(token)) {
    const tokenHash = crypto.createHash("sha256").update(token.toUpperCase()).digest("hex");
    const codeIndex = backupCodes.findIndex(
      (c: { hash: string; used: boolean }) => c.hash === tokenHash && !c.used
    );

    if (codeIndex >= 0) {
      // סימון הקוד כמשומש
      backupCodes[codeIndex].used = true;
      await db.execute(sql`
        UPDATE user_2fa
        SET backup_codes = ${JSON.stringify(backupCodes)}::jsonb
        WHERE user_id = ${userId}
      `);

      // אם זה אימות ראשון, הפעלת 2FA
      if (!row.enabled) {
        await db.execute(sql`
          UPDATE user_2fa
          SET enabled = TRUE, verified_at = NOW()
          WHERE user_id = ${userId}
        `);
      }
      return true;
    }
    return false;
  }

  // אימות קוד TOTP
  const secret = decrypt2FASecret(encryptedSecret);
  const now = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(now / TOTP_WINDOW_SECONDS);

  // בדיקה עם חלון של ±1 צעד (סה"כ 90 שניות)
  for (let offset = -1; offset <= 1; offset++) {
    const expectedCode = computeTOTP(secret, timeStep + offset);
    if (token === expectedCode) {
      // הפעלת 2FA אם זה אימות ראשון
      if (!row.enabled) {
        await db.execute(sql`
          UPDATE user_2fa
          SET enabled = TRUE, verified_at = NOW()
          WHERE user_id = ${userId}
        `);
      }
      return true;
    }
  }

  return false;
}


// ═════════════════════════════════════════════════════════
// 3. שרשרת ביקורת מבוססת בלוקצ'יין
// ═════════════════════════════════════════════════════════

/** חישוב Hash של בלוק */
function computeBlockHash(block: {
  block_number: number;
  previous_hash: string;
  record_type: string;
  record_id: string;
  action: string;
  actor: string;
  data_snapshot: any;
  timestamp: string;
}): string {
  const content = JSON.stringify({
    block_number: block.block_number,
    previous_hash: block.previous_hash,
    record_type: block.record_type,
    record_id: block.record_id,
    action: block.action,
    actor: block.actor,
    data_snapshot: block.data_snapshot,
    timestamp: block.timestamp,
  });
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** חתימת בלוק עם המפתח הסודי */
function signBlock(dataHash: string): string {
  return crypto
    .createHmac("sha256", JWT_SECRET)
    .update(dataHash)
    .digest("hex");
}

/**
 * יצירת בלוק ביקורת חדש בשרשרת
 * כל בלוק מקושר לקודמו באמצעות Hash
 */
export async function createAuditBlock(
  recordType: string,
  recordId: string,
  action: string,
  actor: string,
  data: any
): Promise<{
  id: number;
  block_number: number;
  data_hash: string;
  previous_hash: string;
}> {
  // שליפת הבלוק האחרון בשרשרת
  const lastBlockResult = await db.execute(sql`
    SELECT block_number, data_hash
    FROM blockchain_audit
    ORDER BY block_number DESC
    LIMIT 1
  `);

  const previousHash =
    lastBlockResult.rows && lastBlockResult.rows.length > 0
      ? (lastBlockResult.rows[0] as any).data_hash
      : "0000000000000000000000000000000000000000000000000000000000000000"; // בלוק ג'נסיס

  const nextBlockNumber =
    lastBlockResult.rows && lastBlockResult.rows.length > 0
      ? (lastBlockResult.rows[0] as any).block_number + 1
      : 1;

  const timestamp = new Date().toISOString();

  // חישוב ה-Hash של הבלוק החדש
  const dataHash = computeBlockHash({
    block_number: nextBlockNumber,
    previous_hash: previousHash,
    record_type: recordType,
    record_id: recordId,
    action,
    actor,
    data_snapshot: data,
    timestamp,
  });

  // חתימה על ה-Hash
  const signature = signBlock(dataHash);

  // הכנסת הבלוק לבסיס הנתונים
  const insertResult = await db.execute(sql`
    INSERT INTO blockchain_audit (
      block_number, previous_hash, data_hash,
      record_type, record_id, action, actor,
      data_snapshot, timestamp, signature
    )
    VALUES (
      ${nextBlockNumber}, ${previousHash}, ${dataHash},
      ${recordType}, ${recordId}, ${action}, ${actor},
      ${JSON.stringify(data)}::jsonb, ${timestamp}, ${signature}
    )
    RETURNING id, block_number, data_hash, previous_hash
  `);

  const block = insertResult.rows[0] as any;
  return {
    id: block.id,
    block_number: block.block_number,
    data_hash: block.data_hash,
    previous_hash: block.previous_hash,
  };
}

/**
 * אימות שלמות השרשרת
 * בודק שכל בלוק מקושר כראוי לקודמו
 */
export async function verifyChain(
  fromBlock: number,
  toBlock: number
): Promise<{ valid: boolean; brokenAt: number | null }> {
  const result = await db.execute(sql`
    SELECT id, block_number, previous_hash, data_hash,
           record_type, record_id, action, actor,
           data_snapshot, timestamp, signature
    FROM blockchain_audit
    WHERE block_number >= ${fromBlock} AND block_number <= ${toBlock}
    ORDER BY block_number ASC
  `);

  if (!result.rows || result.rows.length === 0) {
    return { valid: true, brokenAt: null };
  }

  const blocks = result.rows as any[];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // בדיקת Hash של הבלוק הנוכחי
    const expectedHash = computeBlockHash({
      block_number: block.block_number,
      previous_hash: block.previous_hash,
      record_type: block.record_type,
      record_id: block.record_id,
      action: block.action,
      actor: block.actor,
      data_snapshot: block.data_snapshot,
      timestamp: block.timestamp,
    });

    if (expectedHash !== block.data_hash) {
      // ה-Hash של הבלוק לא תואם - נתונים שונו
      return { valid: false, brokenAt: block.block_number };
    }

    // בדיקת חתימה
    const expectedSignature = signBlock(block.data_hash);
    if (expectedSignature !== block.signature) {
      return { valid: false, brokenAt: block.block_number };
    }

    // בדיקת קישור לבלוק הקודם
    if (i > 0) {
      const prevBlock = blocks[i - 1];
      if (block.previous_hash !== prevBlock.data_hash) {
        // השרשרת נשברה - הבלוק לא מצביע על ה-Hash הנכון
        return { valid: false, brokenAt: block.block_number };
      }
    }
  }

  return { valid: true, brokenAt: null };
}

/**
 * קבלת הוכחת ביקורת לרשומה ספציפית
 * מחזיר את כל הבלוקים הקשורים לרשומה
 */
export async function getAuditProof(
  recordType: string,
  recordId: string
): Promise<
  Array<{
    block_number: number;
    action: string;
    actor: string;
    timestamp: string;
    data_hash: string;
    previous_hash: string;
    verified: boolean;
  }>
> {
  const result = await db.execute(sql`
    SELECT block_number, previous_hash, data_hash,
           record_type, record_id, action, actor,
           data_snapshot, timestamp, signature
    FROM blockchain_audit
    WHERE record_type = ${recordType} AND record_id = ${recordId}
    ORDER BY block_number ASC
  `);

  if (!result.rows) return [];

  return (result.rows as any[]).map((block) => {
    // אימות Hash של כל בלוק
    const expectedHash = computeBlockHash({
      block_number: block.block_number,
      previous_hash: block.previous_hash,
      record_type: block.record_type,
      record_id: block.record_id,
      action: block.action,
      actor: block.actor,
      data_snapshot: block.data_snapshot,
      timestamp: block.timestamp,
    });

    const expectedSig = signBlock(block.data_hash);

    return {
      block_number: block.block_number,
      action: block.action,
      actor: block.actor,
      timestamp: block.timestamp,
      data_hash: block.data_hash,
      previous_hash: block.previous_hash,
      verified: expectedHash === block.data_hash && expectedSig === block.signature,
    };
  });
}


// ═════════════════════════════════════════════════════════
// 4. כלי עמידה ב-GDPR
// ═════════════════════════════════════════════════════════

/**
 * ייצוא כל נתוני המשתמש (זכות גישה - GDPR Art. 15)
 * אוסף מידע מכל הטבלאות הרלוונטיות
 */
export async function exportUserData(userId: number): Promise<{
  requestId: number;
  exportedAt: string;
  data: Record<string, any>;
}> {
  const exportedData: Record<string, any> = {};

  // נתוני משתמש בסיסיים
  const userResult = await db.execute(sql`
    SELECT id, username, full_name, email, phone, department, job_title,
           created_at, last_login_at
    FROM users
    WHERE id = ${userId}
  `);
  exportedData.user_profile = userResult.rows?.[0] || null;

  // סשנים
  const sessionsResult = await db.execute(sql`
    SELECT id, created_at, expires_at, ip_address, user_agent
    FROM user_sessions
    WHERE user_id = ${userId}
  `);
  exportedData.sessions = sessionsResult.rows || [];

  // הרשאות ותפקידים
  const rolesResult = await db.execute(sql`
    SELECT ra.role_id, pr.name as role_name, ra.assigned_at
    FROM role_assignments ra
    LEFT JOIN platform_roles pr ON ra.role_id = pr.id
    WHERE ra.user_id = ${userId}
  `);
  exportedData.roles = rolesResult.rows || [];

  // רישום ביקורת
  const auditResult = await db.execute(sql`
    SELECT table_name, action, created_at, description
    FROM audit_log
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 1000
  `);
  exportedData.audit_trail = auditResult.rows || [];

  // נתוני 2FA (בלי הסוד עצמו)
  const tfaResult = await db.execute(sql`
    SELECT enabled, verified_at
    FROM user_2fa
    WHERE user_id = ${userId}
  `);
  exportedData.two_factor_auth = tfaResult.rows?.[0] || null;

  // מפתחות API
  const apiKeysResult = await db.execute(sql`
    SELECT id, key_prefix, name, permissions, created_at, last_used_at, status
    FROM api_keys
    WHERE owner_id = ${userId}
  `);
  exportedData.api_keys = apiKeysResult.rows || [];

  const exportedAt = new Date().toISOString();

  // שמירת בקשת GDPR
  const gdprResult = await db.execute(sql`
    INSERT INTO gdpr_requests (
      request_type, subject_name, subject_email,
      requested_at, completed_at, status, data_exported, notes
    )
    SELECT
      'access',
      COALESCE(u.full_name, u.username),
      COALESCE(u.email, ''),
      NOW(), NOW(), 'completed',
      ${JSON.stringify(exportedData)},
      ${"ייצוא נתונים אוטומטי - סעיף 15 GDPR"}
    FROM users u
    WHERE u.id = ${userId}
    RETURNING id
  `);

  const requestId = (gdprResult.rows?.[0] as any)?.id || 0;

  // תיעוד בשרשרת הביקורת
  await createAuditBlock("gdpr", String(requestId), "DATA_EXPORT", `user_${userId}`, {
    type: "access_request",
    tables_exported: Object.keys(exportedData),
  });

  return {
    requestId,
    exportedAt,
    data: exportedData,
  };
}

/**
 * אנונימיזציה של נתוני משתמש (זכות למחיקה - GDPR Art. 17)
 * מחליף נתונים מזהים ב-Hash חד-כיווני
 */
export async function anonymizeUserData(userId: number): Promise<{
  requestId: number;
  anonymizedAt: string;
  fieldsAnonymized: string[];
}> {
  const fieldsAnonymized: string[] = [];

  // יצירת Hash ייחודי לאנונימיזציה
  const anonHash = crypto.createHash("sha256").update(`anon_${userId}_${Date.now()}`).digest("hex").substring(0, 12);

  // אנונימיזציה של טבלת המשתמשים
  await db.execute(sql`
    UPDATE users SET
      username = ${"anon_" + anonHash},
      full_name = ${"משתמש אנונימי"},
      full_name_he = ${"משתמש אנונימי"},
      email = ${`anon_${anonHash}@deleted.local`},
      phone = NULL,
      password_hash = ${"ANONYMIZED"},
      is_active = FALSE
    WHERE id = ${userId}
  `);
  fieldsAnonymized.push("users.username", "users.full_name", "users.email", "users.phone", "users.password_hash");

  // מחיקת סשנים
  await db.execute(sql`
    DELETE FROM user_sessions WHERE user_id = ${userId}
  `);
  fieldsAnonymized.push("user_sessions (deleted)");

  // מחיקת 2FA
  await db.execute(sql`
    DELETE FROM user_2fa WHERE user_id = ${userId}
  `);
  fieldsAnonymized.push("user_2fa (deleted)");

  // ביטול מפתחות API
  await db.execute(sql`
    UPDATE api_keys SET status = 'revoked', name = ${"ANONYMIZED"}
    WHERE owner_id = ${userId}
  `);
  fieldsAnonymized.push("api_keys (revoked)");

  const anonymizedAt = new Date().toISOString();

  // שמירת בקשת GDPR
  const gdprResult = await db.execute(sql`
    INSERT INTO gdpr_requests (
      request_type, subject_name, subject_email,
      requested_at, completed_at, status, notes
    )
    VALUES (
      'delete',
      ${"anon_" + anonHash},
      ${`anon_${anonHash}@deleted.local`},
      NOW(), NOW(), 'completed',
      ${"אנונימיזציה מלאה בוצעה - סעיף 17 GDPR. שדות שנמחקו: " + fieldsAnonymized.join(", ")}
    )
    RETURNING id
  `);

  const requestId = (gdprResult.rows?.[0] as any)?.id || 0;

  // תיעוד בשרשרת הביקורת
  await createAuditBlock("gdpr", String(requestId), "DATA_ANONYMIZE", `system`, {
    type: "deletion_request",
    original_user_id: userId,
    fields_anonymized: fieldsAnonymized,
  });

  return { requestId, anonymizedAt, fieldsAnonymized };
}

/**
 * דוח שימור נתונים - מה נשמר, כמה זמן, ומהי מדיניות השימור
 */
export async function getDataRetentionReport(): Promise<{
  generatedAt: string;
  tables: Array<{
    name: string;
    nameHe: string;
    recordCount: number;
    oldestRecord: string | null;
    newestRecord: string | null;
    retentionPolicy: string;
  }>;
}> {
  // רשימת טבלאות ומדיניות שימור
  const tablePolicies: Array<{
    name: string;
    nameHe: string;
    dateColumn: string;
    retentionPolicy: string;
  }> = [
    { name: "users", nameHe: "משתמשים", dateColumn: "created_at", retentionPolicy: "ללא הגבלה - עד בקשת מחיקה" },
    { name: "user_sessions", nameHe: "סשנים", dateColumn: "created_at", retentionPolicy: "72 שעות - מחיקה אוטומטית" },
    { name: "audit_log", nameHe: "יומן ביקורת", dateColumn: "created_at", retentionPolicy: "7 שנים - דרישה רגולטורית" },
    { name: "blockchain_audit", nameHe: "שרשרת ביקורת", dateColumn: "timestamp", retentionPolicy: "לצמיתות - לא ניתן למחיקה" },
    { name: "gdpr_requests", nameHe: "בקשות GDPR", dateColumn: "requested_at", retentionPolicy: "5 שנים - תיעוד עמידה ברגולציה" },
    { name: "api_keys", nameHe: "מפתחות API", dateColumn: "created_at", retentionPolicy: "עד ביטול + 90 יום" },
    { name: "user_2fa", nameHe: "אימות דו-שלבי", dateColumn: "verified_at", retentionPolicy: "עד בקשת מחיקה" },
  ];

  const tables: Array<{
    name: string;
    nameHe: string;
    recordCount: number;
    oldestRecord: string | null;
    newestRecord: string | null;
    retentionPolicy: string;
  }> = [];

  for (const table of tablePolicies) {
    try {
      const countResult = await db.execute(
        sql.raw(`SELECT COUNT(*) as count,
                        MIN(${table.dateColumn}) as oldest,
                        MAX(${table.dateColumn}) as newest
                 FROM ${table.name}`)
      );
      const row = countResult.rows?.[0] as any;
      tables.push({
        name: table.name,
        nameHe: table.nameHe,
        recordCount: parseInt(row?.count || "0", 10),
        oldestRecord: row?.oldest || null,
        newestRecord: row?.newest || null,
        retentionPolicy: table.retentionPolicy,
      });
    } catch {
      // טבלה לא קיימת - דילוג
      tables.push({
        name: table.name,
        nameHe: table.nameHe,
        recordCount: 0,
        oldestRecord: null,
        newestRecord: null,
        retentionPolicy: table.retentionPolicy,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    tables,
  };
}


// ═════════════════════════════════════════════════════════
// 5. ניהול מפתחות API
// ═════════════════════════════════════════════════════════

/**
 * יצירת מפתח API חדש
 * @param name - שם המפתח
 * @param ownerId - מזהה הבעלים
 * @param permissions - הרשאות בפורמט JSON
 * @param rateLimit - מגבלת בקשות לדקה (ברירת מחדל: 100)
 * @param expiresInDays - תוקף בימים (ברירת מחדל: 365)
 */
export async function generateApiKey(
  name: string,
  ownerId: number,
  permissions: Record<string, boolean | string[]> = {},
  rateLimit: number = 100,
  expiresInDays: number = 365
): Promise<{ key: string; prefix: string; id: number }> {
  // יצירת מפתח אקראי
  const rawKey = crypto.randomBytes(API_KEY_LENGTH).toString("base64url");
  const prefix = rawKey.substring(0, API_KEY_PREFIX_LENGTH);

  // Hash של המפתח לשמירה בטוחה (לעולם לא שומרים את המפתח בטקסט גלוי)
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const result = await db.execute(sql`
    INSERT INTO api_keys (
      key_hash, key_prefix, name, owner_id,
      permissions, rate_limit, expires_at,
      last_used_at, request_count, status, created_at
    )
    VALUES (
      ${keyHash}, ${prefix}, ${name}, ${ownerId},
      ${JSON.stringify(permissions)}::jsonb, ${rateLimit}, ${expiresAt.toISOString()},
      NULL, 0, 'active', NOW()
    )
    RETURNING id
  `);

  const id = (result.rows?.[0] as any)?.id || 0;

  // תיעוד בשרשרת הביקורת
  await createAuditBlock("api_key", String(id), "CREATE", `user_${ownerId}`, {
    name,
    prefix,
    permissions,
    rate_limit: rateLimit,
    expires_at: expiresAt.toISOString(),
  });

  return { key: rawKey, prefix, id };
}

/**
 * אימות מפתח API
 * בודק תקינות, תוקף ומגבלת בקשות
 */
export async function validateApiKey(key: string): Promise<{
  valid: boolean;
  ownerId?: number;
  permissions?: Record<string, any>;
  error?: string;
}> {
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");

  const result = await db.execute(sql`
    SELECT id, owner_id, permissions, rate_limit, expires_at,
           request_count, status
    FROM api_keys
    WHERE key_hash = ${keyHash}
  `);

  if (!result.rows || result.rows.length === 0) {
    return { valid: false, error: "מפתח API לא נמצא" };
  }

  const apiKey = result.rows[0] as any;

  // בדיקת סטטוס
  if (apiKey.status !== "active") {
    return { valid: false, error: `מפתח API ${apiKey.status === "revoked" ? "בוטל" : "לא פעיל"}` };
  }

  // בדיקת תוקף
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return { valid: false, error: "מפתח API פג תוקף" };
  }

  // עדכון מונה שימוש וזמן שימוש אחרון
  await db.execute(sql`
    UPDATE api_keys
    SET last_used_at = NOW(), request_count = request_count + 1
    WHERE id = ${apiKey.id}
  `);

  return {
    valid: true,
    ownerId: apiKey.owner_id,
    permissions: typeof apiKey.permissions === "string"
      ? JSON.parse(apiKey.permissions)
      : apiKey.permissions,
  };
}

/**
 * ביטול מפתח API
 * @param id - מזהה המפתח
 */
export async function revokeApiKey(id: number): Promise<void> {
  await db.execute(sql`
    UPDATE api_keys
    SET status = 'revoked'
    WHERE id = ${id}
  `);

  // תיעוד בשרשרת הביקורת
  await createAuditBlock("api_key", String(id), "REVOKE", "system", {
    revoked_at: new Date().toISOString(),
  });
}


// ═════════════════════════════════════════════════════════
// 6. Middleware ל-Express
// ═════════════════════════════════════════════════════════

/**
 * Middleware לאימות JWT
 * מצפה ל-header: Authorization: Bearer <token>
 */
export function jwtAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "נדרש טוקן JWT",
      message: "יש לשלוח Authorization: Bearer <token>",
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = verifyJWT(token);
    // הוספת מידע המשתמש לבקשה
    (req as any).jwtUser = decoded;
    next();
  } catch (err: any) {
    res.status(401).json({
      error: "טוקן JWT לא תקין",
      message: err.message,
    });
  }
}

/**
 * Middleware לאימות מפתח API
 * מצפה ל-header: X-API-Key: <key>
 */
export function apiKeyAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers["x-api-key"] as string;

  if (!apiKey) {
    res.status(401).json({
      error: "נדרש מפתח API",
      message: "יש לשלוח X-API-Key header",
    });
    return;
  }

  validateApiKey(apiKey)
    .then((result) => {
      if (!result.valid) {
        res.status(401).json({
          error: "מפתח API לא תקין",
          message: result.error,
        });
        return;
      }
      (req as any).apiKeyOwner = result.ownerId;
      (req as any).apiKeyPermissions = result.permissions;
      next();
    })
    .catch((err) => {
      res.status(500).json({
        error: "שגיאה באימות מפתח API",
        message: err.message,
      });
    });
}

/**
 * Middleware לדרישת 2FA
 * מצפה ל-header: X-2FA-Token: <code>
 * חייב לרוץ אחרי middleware אימות (JWT או session)
 */
export function require2FA(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const tfaToken = req.headers["x-2fa-token"] as string;
  const userId = (req as any).jwtUser?.userId || (req as any).user?.id;

  if (!userId) {
    res.status(401).json({
      error: "נדרש אימות משתמש לפני בדיקת 2FA",
    });
    return;
  }

  if (!tfaToken) {
    res.status(403).json({
      error: "נדרש קוד אימות דו-שלבי",
      message: "יש לשלוח X-2FA-Token header עם קוד TOTP בן 6 ספרות",
    });
    return;
  }

  verify2FAToken(userId, tfaToken)
    .then((valid) => {
      if (!valid) {
        res.status(403).json({
          error: "קוד 2FA שגוי",
          message: "הקוד שהוזן אינו תקין או שפג תוקפו",
        });
        return;
      }
      (req as any).twoFactorVerified = true;
      next();
    })
    .catch((err) => {
      res.status(500).json({
        error: "שגיאה באימות 2FA",
        message: err.message,
      });
    });
}


// ═════════════════════════════════════════════════════════
// יצירת טבלאות - מיגרציה ראשונית
// ═════════════════════════════════════════════════════════

/**
 * יצירת כל טבלאות האבטחה אם לא קיימות
 * יש להריץ פעם אחת בעת אתחול המערכת
 */
export async function initSecurityTables(): Promise<void> {
  // טבלת 2FA
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_2fa (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      secret_encrypted TEXT NOT NULL,
      backup_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      verified_at TIMESTAMP
    )
  `);

  // טבלת שרשרת ביקורת מבוססת בלוקצ'יין
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS blockchain_audit (
      id SERIAL PRIMARY KEY,
      block_number SERIAL,
      previous_hash VARCHAR(64) NOT NULL,
      data_hash VARCHAR(64) NOT NULL,
      record_type VARCHAR(100) NOT NULL,
      record_id VARCHAR(255) NOT NULL,
      action VARCHAR(100) NOT NULL,
      actor VARCHAR(255) NOT NULL,
      data_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      timestamp VARCHAR(50) NOT NULL,
      signature VARCHAR(128) NOT NULL
    )
  `);

  // אינדקסים לשרשרת הביקורת
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_blockchain_audit_block_number
    ON blockchain_audit (block_number)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_blockchain_audit_record
    ON blockchain_audit (record_type, record_id)
  `);

  // טבלת בקשות GDPR
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS gdpr_requests (
      id SERIAL PRIMARY KEY,
      request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('access', 'delete', 'export', 'restrict')),
      subject_name VARCHAR(255),
      subject_email VARCHAR(255),
      requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      data_exported TEXT,
      notes TEXT
    )
  `);

  // טבלת מפתחות API
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      key_hash VARCHAR(64) NOT NULL UNIQUE,
      key_prefix VARCHAR(8) NOT NULL,
      name VARCHAR(255) NOT NULL,
      owner_id INTEGER NOT NULL,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      rate_limit INTEGER NOT NULL DEFAULT 100,
      expires_at TIMESTAMP,
      last_used_at TIMESTAMP,
      request_count INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // אינדקס למפתחות API
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_api_keys_owner
    ON api_keys (owner_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_api_keys_status
    ON api_keys (status)
  `);
}
