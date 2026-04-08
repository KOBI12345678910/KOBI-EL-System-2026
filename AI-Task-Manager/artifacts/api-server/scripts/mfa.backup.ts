import { db } from "@workspace/db";
import { userMfaTable, mfaChallengesTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";

const TOTP_ISSUER = "TechnoKol ERP";
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const BACKUP_CODE_COUNT = 10;
const EMAIL_CODE_EXPIRY_MS = 10 * 60 * 1000;
const MFA_CHALLENGE_EXPIRY_MS = 15 * 60 * 1000;

function base32Encode(buffer: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0, output = "";
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  while (output.length % 8 !== 0) output += "=";
  return output;
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const buffer: number[] = [];
  let bits = 0, value = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (c === "=") break;
    const idx = alphabet.indexOf(c);
    if (idx === -1) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      buffer.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(buffer);
}

function generateTOTP(secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const buffer = base32Decode(secret);
  const counter = Math.floor(timestamp / TOTP_PERIOD);
  const hmac = crypto.createHmac("sha1", buffer);
  const buf = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) {
    buf[i] = (counter >>> ((7 - i) * 8)) & 0xff;
  }
  hmac.update(buf);
  const hash = hmac.digest();
  const offset = hash[hash.length - 1]! & 0xf;
  const code = (
    ((hash[offset]! & 0x7f) << 24) |
    ((hash[offset + 1]! & 0xff) << 16) |
    ((hash[offset + 2]! & 0xff) << 8) |
    (hash[offset + 3]! & 0xff)
  ) % Math.pow(10, TOTP_DIGITS);
  return code.toString().padStart(TOTP_DIGITS, "0");
}

function verifyTOTP(secret: string, code: string, window = 1): boolean {
  const now = Math.floor(Date.now() / 1000);
  for (let i = -window; i <= window; i++) {
    if (generateTOTP(secret, now + i * TOTP_PERIOD) === code) return true;
  }
  return false;
}

export async function getMfaConfig(userId: number) {
  const mfa = await db.query.userMfaTable.findFirst({
    where: eq(userMfaTable.userId, userId),
  });
  if (!mfa) return null;
  return {
    isEnabled: mfa.enabled,
    method: mfa.method,
    totpVerified: mfa.enabled && mfa.method === "totp",
    emailVerified: mfa.enabled && mfa.method === "email",
    lastUsedAt: null,
    backupCodes: mfa.backupCodes || [],
  };
}

export function generateTotpUri(secret: string, username: string): string {
  return `otpauth://totp/${TOTP_ISSUER}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(TOTP_ISSUER)}&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

export async function setupTotp(userId: number, username: string) {
  const secret = base32Encode(crypto.randomBytes(20));
  const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
    crypto.randomBytes(4).toString("hex")
  );
  const existing = await db.query.userMfaTable.findFirst({
    where: eq(userMfaTable.userId, userId),
  });
  if (existing) {
    await db.update(userMfaTable).set({ secret, method: "totp", backupCodes, enabled: false }).where(eq(userMfaTable.userId, userId));
  } else {
    await db.insert(userMfaTable).values({ userId, method: "totp", secret, backupCodes, enabled: false });
  }
  const uri = generateTotpUri(secret, username);
  return { secret, uri, qrData: uri };
}

export async function verifyAndEnableTotp(userId: number, code: string): Promise<{ success: boolean; error?: string; backupCodes?: string[] }> {
  const mfa = await db.query.userMfaTable.findFirst({
    where: eq(userMfaTable.userId, userId),
  });
  if (!mfa) return { success: false, error: "MFA not set up" };
  if (!verifyTOTP(mfa.secret, code)) return { success: false, error: "Invalid TOTP code" };
  await db.update(userMfaTable).set({ enabled: true }).where(eq(userMfaTable.id, mfa.id));
  return { success: true, backupCodes: (mfa.backupCodes as string[]) || [] };
}

export async function disableMfa(userId: number): Promise<void> {
  await db.update(userMfaTable).set({ enabled: false }).where(eq(userMfaTable.userId, userId));
}

export async function disableMFA(userId: number): Promise<void> {
  return disableMfa(userId);
}

export async function generateEmailChallenge(userId: number, purpose: string = "login"): Promise<string> {
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + EMAIL_CODE_EXPIRY_MS);
  await db.insert(mfaChallengesTable).values({ userId, method: "email", code, expiresAt });
  return code;
}

export async function generateChallenge(userId: number, method: "email" | "sms"): Promise<string> {
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + EMAIL_CODE_EXPIRY_MS);
  await db.insert(mfaChallengesTable).values({ userId, method, code, expiresAt });
  return code;
}

export async function verifyMfaCode(
  userId: number,
  code: string,
  challengeToken?: string,
  purpose?: string
): Promise<{ success: boolean; error?: string; method?: string }> {
  const mfa = await db.query.userMfaTable.findFirst({
    where: eq(userMfaTable.userId, userId),
  });
  if (mfa && mfa.enabled) {
    if (mfa.method === "totp" && verifyTOTP(mfa.secret, code)) {
      return { success: true, method: "totp" };
    }
    if (mfa.backupCodes && (mfa.backupCodes as string[]).includes(code)) {
      const updated = (mfa.backupCodes as string[]).filter((c) => c !== code);
      await db.update(userMfaTable).set({ backupCodes: updated }).where(eq(userMfaTable.id, mfa.id));
      return { success: true, method: "backup" };
    }
  }
  const challenge = await db.query.mfaChallengesTable.findFirst({
    where: and(eq(mfaChallengesTable.userId, userId), eq(mfaChallengesTable.code, code)),
  });
  if (challenge && new Date() <= challenge.expiresAt) {
    await db.update(mfaChallengesTable).set({ verifiedAt: new Date() }).where(eq(mfaChallengesTable.id, challenge.id));
    return { success: true, method: "email" };
  }
  return { success: false, error: "Invalid verification code" };
}

export async function isMfaRequired(userId: number, roleIds: number[]): Promise<boolean> {
  if (!roleIds.length) return false;
  try {
    const { rows } = await (db as any).execute(
      `SELECT 1 FROM role_mfa_requirements WHERE role_id = ANY($1) AND require_mfa = true LIMIT 1`,
      [roleIds]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function isMfaRequiredForAction(userId: number, roleIds: number[], action: string): Promise<boolean> {
  if (!roleIds.length) return false;
  try {
    const { rows } = await (db as any).execute(
      `SELECT require_mfa_for_actions FROM role_mfa_requirements WHERE role_id = ANY($1)`,
      [roleIds]
    );
    for (const row of rows) {
      const actions = row.require_mfa_for_actions;
      if (Array.isArray(actions) && actions.includes(action)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function enableMFA(userId: number, method: "totp" | "email" = "totp") {
  const secret = base32Encode(crypto.randomBytes(20));
  const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
    crypto.randomBytes(4).toString("hex")
  );
  await db.insert(userMfaTable).values({ userId, method, secret, backupCodes, enabled: false });
  return {
    secret,
    qrCodeUri: `otpauth://totp/${TOTP_ISSUER}:user${userId}?secret=${secret}&issuer=${TOTP_ISSUER}`,
  };
}

export async function confirmMFA(userId: number, code: string): Promise<boolean> {
  const mfa = await db.query.userMfaTable.findFirst({
    where: eq(userMfaTable.userId, userId),
  });
  if (!mfa || !verifyTOTP(mfa.secret, code)) return false;
  await db.update(userMfaTable).set({ enabled: true }).where(eq(userMfaTable.id, mfa.id));
  return true;
}

export async function verifyMFA(userId: number, code: string): Promise<boolean> {
  const mfa = await db.query.userMfaTable.findFirst({
    where: eq(userMfaTable.userId, userId),
  });
  if (!mfa || !mfa.enabled) return false;
  if (mfa.backupCodes && (mfa.backupCodes as string[]).includes(code)) {
    const updated = (mfa.backupCodes as string[]).filter((c) => c !== code);
    await db.update(userMfaTable).set({ backupCodes: updated }).where(eq(userMfaTable.id, mfa.id));
    return true;
  }
  return verifyTOTP(mfa.secret, code);
}

export async function createMFAChallenge(userId: number, method: "email" = "email"): Promise<string> {
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + EMAIL_CODE_EXPIRY_MS);
  const [challenge] = await db.insert(mfaChallengesTable).values({ userId, method, code, expiresAt }).returning();
  return challenge.id.toString();
}

export async function verifyMFAChallenge(userId: number, code: string, method?: "email" | "sms"): Promise<boolean> {
  const whereClause = method
    ? and(eq(mfaChallengesTable.userId, userId), eq(mfaChallengesTable.code, code), eq(mfaChallengesTable.method, method))
    : and(eq(mfaChallengesTable.userId, userId), eq(mfaChallengesTable.code, code));
  const challenge = await db.query.mfaChallengesTable.findFirst({ where: whereClause });
  if (!challenge || new Date() > challenge.expiresAt) return false;
  await db.update(mfaChallengesTable).set({ verifiedAt: new Date() }).where(eq(mfaChallengesTable.id, challenge.id));
  return true;
}
