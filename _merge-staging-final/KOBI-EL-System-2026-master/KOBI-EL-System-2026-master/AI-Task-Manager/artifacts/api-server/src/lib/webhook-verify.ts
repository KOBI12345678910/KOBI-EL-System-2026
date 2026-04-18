/**
 * Webhook request-signing verification middleware.
 *
 * For any registered webhook endpoint (path matched in security_webhook_secrets),
 * this middleware verifies the HMAC-SHA256 signature carried in X-Webhook-Signature.
 * It also enforces replay-protection via X-Webhook-Timestamp.
 *
 * Secret storage:
 *  Secrets are encrypted with AES-256-GCM using APP_SECRET_KEY. In production this
 *  env var is mandatory. In non-production environments the server falls back to a
 *  plaintext `plain:` prefix and emits a startup warning.
 *
 * Environment variables:
 *  APP_SECRET_KEY          — 256-bit key for AES encryption of stored secrets (required in prod)
 *  WEBHOOK_REPLAY_WINDOW_SEC — seconds tolerance for X-Webhook-Timestamp (default 300)
 *  WEBHOOK_STRICT_MODE     — "true" to fail closed when rawBody is unavailable
 */

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";

const REPLAY_WINDOW_SEC = parseInt(process.env.WEBHOOK_REPLAY_WINDOW_SEC || "300", 10);
const STRICT_MODE = process.env.WEBHOOK_STRICT_MODE === "true";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const APP_SECRET_KEY = process.env.APP_SECRET_KEY;

if (!APP_SECRET_KEY) {
  if (IS_PRODUCTION) {
    throw new Error("[webhook-verify] APP_SECRET_KEY must be set in production to protect webhook secrets");
  }
  logger.warn("[webhook-verify] APP_SECRET_KEY not set — secrets stored as plaintext. Set APP_SECRET_KEY in production.");
}

export function encrypt(text: string): string {
  if (!APP_SECRET_KEY) return `plain:${text}`;
  const key = crypto.createHash("sha256").update(APP_SECRET_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function decrypt(stored: string): string | null {
  if (stored.startsWith("plain:")) {
    if (IS_PRODUCTION) {
      logger.warn("[webhook-verify] Refusing to use plaintext-stored secret in production");
      return null;
    }
    return stored.slice(6);
  }
  if (!stored.startsWith("aes:")) return null;
  try {
    const parts = stored.split(":");
    if (parts.length !== 4) return null;
    const iv = Buffer.from(parts[1], "hex");
    const tag = Buffer.from(parts[2], "hex");
    const enc = Buffer.from(parts[3], "hex");
    const key = crypto.createHash("sha256").update(APP_SECRET_KEY!).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc).toString("utf8") + decipher.final("utf8");
  } catch {
    return null;
  }
}

const decryptedCache = new Map<string, { secret: string | null; id: number | null; loadedAt: number }>();
const DECRYPTED_TTL_MS = 60_000;

async function getDecryptedSecretForPath(path: string): Promise<{ secret: string; id: number } | null> {
  const now = Date.now();
  const cached = decryptedCache.get(path);
  if (cached && now - cached.loadedAt < DECRYPTED_TTL_MS) {
    if (cached.secret === null || cached.id === null) return null;
    return { secret: cached.secret, id: cached.id };
  }

  try {
    const { rows } = await pool.query<{ id: number; secret_hash: string }>(
      `SELECT id, secret_hash FROM security_webhook_secrets WHERE endpoint_path = $1 AND is_active = true LIMIT 1`,
      [path]
    );
    if (rows.length === 0) {
      decryptedCache.set(path, { secret: null, id: null, loadedAt: now });
      return null;
    }
    const plain = decrypt(rows[0].secret_hash);
    if (!plain) {
      logger.warn("[webhook-verify] Could not decrypt secret for path", { path });
      decryptedCache.set(path, { secret: null, id: null, loadedAt: now });
      return null;
    }
    decryptedCache.set(path, { secret: plain, id: rows[0].id, loadedAt: now });
    return { secret: plain, id: rows[0].id };
  } catch (err) {
    logger.warn("[webhook-verify] DB error", { path, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function markUsed(id: number) {
  try {
    await pool.query(`UPDATE security_webhook_secrets SET last_used_at = NOW() WHERE id = $1`, [id]);
  } catch {}
}

export function webhookVerifyMiddleware(req: Request, res: Response, next: NextFunction) {
  _verifyAsync(req, res, next).catch(() => next());
}

async function _verifyAsync(req: Request, res: Response, next: NextFunction) {
  const entry = await getDecryptedSecretForPath(req.path);
  if (!entry) return next();

  const signature = req.headers["x-webhook-signature"] as string | undefined;
  if (!signature) {
    logger.warn("[webhook-verify] Missing X-Webhook-Signature header", { path: req.path });
    return res.status(401).json({ error: "Missing webhook signature" });
  }

  const tsHeader = req.headers["x-webhook-timestamp"] as string | undefined;
  if (tsHeader) {
    const ts = parseInt(tsHeader, 10);
    const ageSeconds = Math.floor(Date.now() / 1000) - ts;
    if (isNaN(ts) || ageSeconds > REPLAY_WINDOW_SEC || ageSeconds < -60) {
      logger.warn("[webhook-verify] Stale/invalid timestamp", { path: req.path, ageSeconds });
      return res.status(401).json({ error: "Webhook timestamp out of tolerance window" });
    }
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    if (STRICT_MODE) {
      logger.error("[webhook-verify] rawBody not available", { path: req.path });
      return res.status(500).json({ error: "Server cannot verify webhook signature" });
    }
    logger.warn("[webhook-verify] rawBody unavailable — passing through", { path: req.path });
    return next();
  }

  const expected = crypto.createHmac("sha256", entry.secret).update(rawBody).digest("hex");
  const signatureHex = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  let valid = false;
  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const providedBuf = Buffer.from(signatureHex, "hex");
    if (expectedBuf.length === providedBuf.length) {
      valid = crypto.timingSafeEqual(expectedBuf, providedBuf);
    }
  } catch {
    valid = false;
  }

  if (!valid) {
    logger.warn("[webhook-verify] Invalid webhook signature", { path: req.path });
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  void markUsed(entry.id);
  next();
}
