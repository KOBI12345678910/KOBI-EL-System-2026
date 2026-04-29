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

// Agent 222 — scrypt params for backup-code hashing.
// MUST stay in sync with onyx-procurement/src/auth/totp.js (RFC-6238 reference impl).
// Format: "scrypt$N$r$p$base64salt$base64hash" — self-describing so verify can
// parse without a config lookup.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALTLEN = 16;

type StoredBackupCode = { hash: string; used: boolean; usedAt: string | null };

function normalizeBackupCode(code: string): string {
  return code.replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
}

function hashBackupCode(code: string): string {
  if (typeof code !== "string" || code.length === 0) {
    throw new TypeError("hashBackupCode: code must be a non-empty string");
  }
  const salt = crypto.randomBytes(SCRYPT_SALTLEN);
  const hash = crypto.scryptSync(normalizeBackupCode(code), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    // scrypt requires maxmem >= 128 * N * r; bump it explicitly.
    maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

function verifyBackupCodeHash(code: string, stored: string): boolean {
  if (typeof code !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, "base64");
    expected = Buffer.from(parts[5]!, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  let actual: Buffer;
  try {
    actual = crypto.scryptSync(normalizeBackupCode(code), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function generatePlaintextBackupCodes(count: number): string[] {
  // Crockford-ish alphabet (no 0/O/1/I/L), 50 bits per code in XXXXX-XXXXX format.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const out = new Set<string>();
  while (out.size < count) {
    const bytes = crypto.randomBytes(10);
    let raw = "";
    for (let i = 0; i < 10; i++) raw += alphabet[bytes[i]! % alphabet.length];
    out.add(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return Array.from(out);
}

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
  // Agent 222 — backup_codes is now an array of {hash, used, usedAt}.
  // Never surface the hashes; expose only count + remaining-unused so the UI
  // can prompt the user to regenerate when they're running low.
  const stored = (mfa.backupCodes as StoredBackupCode[] | null) || [];
  const remaining = stored.filter((c) => !c.used).length;
  return {
    isEnabled: mfa.enabled,
    method: mfa.method,
    totpVerified: mfa.enabled && mfa.method === "totp",
    emailVerified: mfa.enabled && mfa.method === "email",
    lastUsedAt: null,
    backupCodesCount: stored.length,
    backupCodesRemaining: remaining,
  };
}

export function generateTotpUri(secret: string, username: string): string {
  return `otpauth://totp/${TOTP_ISSUER}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(TOTP_ISSUER)}&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

export async function setupTotp(userId: number, username: string) {
  const secret = base32Encode(crypto.randomBytes(20));
  // Agent 222 — generate plaintext + hashed pair. Plaintext returned to caller
  // exactly once (right here); DB only sees hashed values.
  const plaintextCodes = generatePlaintextBackupCodes(BACKUP_CODE_COUNT);
  const hashedCodes: StoredBackupCode[] = plaintextCodes.map((code) => ({
    hash: hashBackupCode(code),
    used: false,
    usedAt: null,
  }));
  const existing = await db.query.userMfaTable.findFirst({
    where: eq(userMfaTable.userId, userId),
  });
  if (existing) {
    await db.update(userMfaTable).set({ secret, method: "totp", backupCodes: hashedCodes, enabled: false }).where(eq(userMfaTable.userId, userId));
  } else {
    await db.insert(userMfaTable).values({ userId, method: "totp", secret, backupCodes: hashedCodes, enabled: false });
  }
  const uri = generateTotpUri(secret, username);
  // plaintextBackupCodes is the ONLY place plaintext leaves this function.
  // Caller (route handler) is responsible for surfacing it to the user once
  // and never persisting it.
  return { secret, uri, qrData: uri, plaintextBackupCodes: plaintextCodes };
}

export async function verifyAndEnableTotp(userId: number, code: string): Promise<{ success: boolean; error?: string; backupCodes?: string[] }> {
  const mfa = await db.query.userMfaTable.findFirst({
    where: eq(userMfaTable.userId, userId),
  });
  if (!mfa) return { success: false, error: "MFA not set up" };
  if (!verifyTOTP(mfa.secret, code)) return { success: false, error: "Invalid TOTP code" };
  await db.update(userMfaTable).set({ enabled: true }).where(eq(userMfaTable.id, mfa.id));
  // Agent 222 — DB no longer stores plaintext. Plaintext was already returned
  // by setupTotp(); the verify step does not re-issue them. Routes layer that
  // still reads `result.backupCodes` will get an empty array — by design.
  return { success: true, backupCodes: [] };
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
    // Agent 222 — backup codes are now scrypt-hashed objects. Walk EVERY
    // entry to keep verify-time independent of the array index of the match,
    // and constant-time compare per entry via crypto.timingSafeEqual inside
    // verifyBackupCodeHash.
    const stored = (mfa.backupCodes as StoredBackupCode[] | null) || [];
    let matchedIndex = -1;
    for (let i = 0; i < stored.length; i++) {
      const entry = stored[i]!;
      if (entry.used) continue;
      if (verifyBackupCodeHash(code, entry.hash) && matchedIndex === -1) {
        matchedIndex = i;
      }
    }
    if (matchedIndex >= 0) {
      const next = stored.slice();
      next[matchedIndex] = { ...next[matchedIndex]!, used: true, usedAt: new Date().toISOString() };
      await db.update(userMfaTable).set({ backupCodes: next }).where(eq(userMfaTable.id, mfa.id));
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
  // Agent 222 — same hash-on-storage pattern as setupTotp.
  const plaintextCodes = generatePlaintextBackupCodes(BACKUP_CODE_COUNT);
  const hashedCodes: StoredBackupCode[] = plaintextCodes.map((code) => ({
    hash: hashBackupCode(code),
    used: false,
    usedAt: null,
  }));
  await db.insert(userMfaTable).values({ userId, method, secret, backupCodes: hashedCodes, enabled: false });
  return {
    secret,
    qrCodeUri: `otpauth://totp/${TOTP_ISSUER}:user${userId}?secret=${secret}&issuer=${TOTP_ISSUER}`,
    plaintextBackupCodes: plaintextCodes,
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
  // Agent 222 — same constant-time hashed-code walk as verifyMfaCode.
  const stored = (mfa.backupCodes as StoredBackupCode[] | null) || [];
  let matchedIndex = -1;
  for (let i = 0; i < stored.length; i++) {
    const entry = stored[i]!;
    if (entry.used) continue;
    if (verifyBackupCodeHash(code, entry.hash) && matchedIndex === -1) {
      matchedIndex = i;
    }
  }
  if (matchedIndex >= 0) {
    const next = stored.slice();
    next[matchedIndex] = { ...next[matchedIndex]!, used: true, usedAt: new Date().toISOString() };
    await db.update(userMfaTable).set({ backupCodes: next }).where(eq(userMfaTable.id, mfa.id));
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
