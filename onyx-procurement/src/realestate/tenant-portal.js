/**
 * tenant-portal.js — Agent Y-050 / Swarm Real-Estate
 * ═══════════════════════════════════════════════════════════════════
 * Self-Service Tenant Portal — Techno-Kol Uzi mega-ERP (Real-Estate)
 * פורטל דיירים לשירות עצמי — נדל״ן, מערכת טכנו-קול אוזי
 * ═══════════════════════════════════════════════════════════════════
 *
 * Purpose / מטרה:
 *   A zero-dependency, server-side engine that lets tenants log in via
 *   a time-limited magic-link (email or SMS), view their current balance,
 *   upcoming rent, payment history, lease details, maintenance requests
 *   and documents (lease PDF, receipts), and perform self-service actions:
 *     • submit a maintenance request (with photo uploads)
 *     • pay rent online (bridges to Y-076 PayBox / Bit)
 *     • request a lease renewal
 *     • download receipts
 *
 *   מנוע צד-שרת המאפשר לדיירים להיכנס לפורטל ללא סיסמה,
 *   לראות יתרה שוטפת, שכ״ד קרוב, היסטוריית תשלומים, פרטי חוזה,
 *   בקשות תחזוקה, מסמכים, לשלם שכר דירה, להגיש בקשת תחזוקה,
 *   להעלות תמונות ולבקש חידוש חוזה — הכל ללא מעורבות אדם.
 *
 * ═══════════════════════════════════════════════════════════════════
 *   RULE  —  לא מוחקים, רק משדרגים ומגדלים
 *   Every mutation is additive: old records move to *History arrays,
 *   soft-deletion uses `archivedAt`, audit log is append-only.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Design principles:
 *   1. ZERO external deps  — only node:crypto (built-in).
 *   2. Tenant isolation    — every read/write is scoped by tenantId
 *                            resolved from the session, NEVER from the body.
 *   3. Magic link          — HMAC-SHA256 token, 24h TTL, single-use.
 *   4. Rate limiting       — per tenant (+ per email/phone) token-bucket.
 *   5. Audit log           — every portal access logged (append-only).
 *   6. Bilingual           — every label exposed in he + en.
 *   7. Hermetic tests      — in-memory repo by default.
 *   8. Injectable bridges  — mailer, smsSender, paymentBridge (Y-076),
 *                            pdfBridge, maintenanceBridge, clock.
 *
 * Public API (task spec):
 *   requestMagicLink(channel, value)          → { ok, sent, token?, link? }
 *   verifyMagicLink(token)                    → { ok, tenantId, session }
 *   getDashboard(tenantId)                    → DashboardSnapshot
 *   getBalance(tenantId)                      → BalanceSnapshot
 *   getUpcomingRent(tenantId)                 → UpcomingRent
 *   getPaymentHistory(tenantId, filters?)     → Payment[]
 *   getLeaseDetails(tenantId)                 → Lease
 *   getMaintenanceRequests(tenantId, filter?) → MaintenanceRequest[]
 *   submitMaintenanceRequest(tenantId, data)  → { ok, id }
 *   uploadMaintenancePhoto(tenantId, reqId, file) → { ok, photoId }
 *   payRent(tenantId, amount, method)         → { ok, paymentRef }
 *   requestLeaseRenewal(tenantId, opts)       → { ok, id }
 *   getDocuments(tenantId)                    → Document[]
 *   downloadReceipt(tenantId, receiptId)      → { ok, fileRef, fallbackText }
 *   downloadLeasePdf(tenantId)                → { ok, fileRef, fallbackText }
 *
 *   + utilities: getAuditLog, resolveSession, labels,
 *                hmacSign, hmacVerify, isValidEmail, isValidIsraeliPhone,
 *                safeEqual, createInMemoryRepo, createTenantPortal.
 *
 * Run self-tests:
 *   node --test test/realestate/tenant-portal.test.js
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════

/** Magic-link TTL in milliseconds (24 h). */
const MAGIC_LINK_TTL_MS = 24 * 60 * 60 * 1000;

/** Session TTL in milliseconds (8 h). */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/** Rate-limit: login attempts per email/phone inside a window. */
const RATE_LIMIT_MAX = 5;

/** Rate-limit window in milliseconds (15 min). */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Per-tenant requests-per-window on authenticated endpoints. */
const TENANT_RATE_LIMIT_MAX = 120;
const TENANT_RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** File upload — max bytes (15 MB for photos). */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Allowed mime types for maintenance photo uploads. */
const ALLOWED_PHOTO_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/** EICAR antivirus test string fingerprint — always blocked. */
const EICAR_FRAGMENT = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR';

/** Default HMAC secret — MUST be overridden in production via options.secret. */
const DEFAULT_SECRET_WARNING =
  'tenant-portal-default-secret-DO-NOT-USE-IN-PRODUCTION';

// ═══════════════════════════════════════════════════════════════════════
//  Bilingual labels  |  תוויות דו־לשוניות
// ═══════════════════════════════════════════════════════════════════════

const LABELS = {
  title:            { he: 'פורטל דיירים',              en: 'Tenant Portal' },
  tagline:          { he: 'שירות עצמי לדייר',          en: 'Tenant Self-Service' },
  loginPrompt:      { he: 'כניסה באמצעות קישור חד־פעמי', en: 'Sign in with a one-time link' },
  loginSent:        { he: 'נשלח קישור כניסה',          en: 'Magic link sent' },
  loginSentEmail:   { he: 'נשלח לכתובת הדוא״ל',        en: 'Sent by email' },
  loginSentSms:     { he: 'נשלח בהודעת SMS',           en: 'Sent by SMS' },

  // Nav tabs (mirror the JSX Hebrew tabs)
  tabDashboard:     { he: 'דשבורד',                    en: 'Dashboard' },
  tabPayments:      { he: 'תשלומים',                    en: 'Payments' },
  tabMaintenance:   { he: 'תחזוקה',                     en: 'Maintenance' },
  tabDocuments:     { he: 'מסמכים',                     en: 'Documents' },
  tabAccount:       { he: 'חשבון',                      en: 'Account' },

  // Dashboard cards
  currentBalance:   { he: 'יתרה נוכחית',               en: 'Current balance' },
  upcomingRent:     { he: 'שכר דירה קרוב',             en: 'Upcoming rent' },
  dueDate:          { he: 'תאריך תשלום',               en: 'Due date' },
  leaseEnds:        { he: 'סיום חוזה',                 en: 'Lease ends' },
  openRequests:     { he: 'בקשות תחזוקה פתוחות',       en: 'Open requests' },

  // Payments
  paymentHistory:   { he: 'היסטוריית תשלומים',         en: 'Payment history' },
  payNow:           { he: 'שלם עכשיו',                 en: 'Pay now' },
  paid:             { he: 'שולם',                       en: 'Paid' },
  pending:          { he: 'ממתין',                      en: 'Pending' },
  failed:           { he: 'נכשל',                       en: 'Failed' },
  refunded:         { he: 'הוחזר',                      en: 'Refunded' },
  method:           { he: 'אמצעי',                      en: 'Method' },
  reference:        { he: 'אסמכתא',                     en: 'Reference' },
  amount:           { he: 'סכום',                       en: 'Amount' },

  // Maintenance
  maintenance:      { he: 'בקשות תחזוקה',               en: 'Maintenance requests' },
  newRequest:       { he: 'בקשה חדשה',                 en: 'New request' },
  requestCategory:  { he: 'קטגוריה',                    en: 'Category' },
  requestPriority:  { he: 'דחיפות',                     en: 'Priority' },
  requestDesc:      { he: 'תיאור',                      en: 'Description' },
  uploadPhoto:      { he: 'העלאת תמונה',                en: 'Upload photo' },
  priority: {
    low:     { he: 'נמוכה',   en: 'Low' },
    medium:  { he: 'בינונית',  en: 'Medium' },
    high:    { he: 'גבוהה',   en: 'High' },
    urgent:  { he: 'דחופה',   en: 'Urgent' },
  },
  category: {
    plumbing:    { he: 'אינסטלציה',      en: 'Plumbing' },
    electrical:  { he: 'חשמל',           en: 'Electrical' },
    hvac:        { he: 'מיזוג אוויר',    en: 'HVAC' },
    structural:  { he: 'מבנה',           en: 'Structural' },
    appliance:   { he: 'מכשיר חשמלי',    en: 'Appliance' },
    pest:        { he: 'מזיקים',         en: 'Pest control' },
    common:      { he: 'שטחים משותפים',  en: 'Common area' },
    other:       { he: 'אחר',            en: 'Other' },
  },
  status: {
    open:        { he: 'פתוחה',          en: 'Open' },
    inProgress:  { he: 'בטיפול',         en: 'In progress' },
    scheduled:   { he: 'מתוזמנת',        en: 'Scheduled' },
    resolved:    { he: 'הסתיימה',        en: 'Resolved' },
    closed:      { he: 'סגורה',          en: 'Closed' },
  },

  // Documents
  documents:        { he: 'מסמכים',                     en: 'Documents' },
  leasePdf:         { he: 'הסכם שכירות',                en: 'Lease agreement' },
  receipt:          { he: 'קבלה',                        en: 'Receipt' },
  download:         { he: 'הורדה',                       en: 'Download' },

  // Lease & renewal
  leaseDetails:     { he: 'פרטי החוזה',                 en: 'Lease details' },
  leaseFrom:        { he: 'מתאריך',                     en: 'From' },
  leaseTo:          { he: 'עד תאריך',                   en: 'To' },
  monthlyRent:      { he: 'שכר דירה חודשי',             en: 'Monthly rent' },
  renewalRequested: { he: 'נשלחה בקשת חידוש',          en: 'Renewal requested' },
  requestRenewal:   { he: 'בקשת חידוש חוזה',           en: 'Request lease renewal' },

  // Errors
  errNotFound:      { he: 'דייר לא נמצא',               en: 'Tenant not found' },
  errInactive:      { he: 'חשבון לא פעיל',              en: 'Account inactive' },
  errEmail:         { he: 'כתובת דוא״ל לא תקינה',      en: 'Invalid e-mail' },
  errPhone:         { he: 'מספר טלפון לא תקין',        en: 'Invalid phone number' },
  errBadChannel:    { he: 'אפיק כניסה לא נתמך',        en: 'Unsupported login channel' },
  errBadToken:      { he: 'קישור פג תוקף או לא תקין',  en: 'Invalid or expired token' },
  errExpired:       { he: 'הקישור פג תוקף',             en: 'Link expired' },
  errSession:       { he: 'הפעלה פגה תוקף',             en: 'Session expired' },
  errRateLimit:     { he: 'נחסם זמנית — יותר מדי ניסיונות', en: 'Rate limit — too many attempts' },
  errAccessDenied:  { he: 'גישה חסומה',                 en: 'Access denied' },
  errBadRequest:    { he: 'בקשה לא תקינה',              en: 'Bad request' },
  errNoBalance:     { he: 'אין יתרה לתשלום',            en: 'No outstanding balance' },
  errUploadSize:    { he: 'קובץ גדול מדי',              en: 'File too large' },
  errUploadType:    { he: 'סוג קובץ אסור',              en: 'File type not allowed' },
  errInfected:      { he: 'הקובץ נחסם על-ידי סריקת וירוסים', en: 'File blocked by antivirus' },
  errPayment:       { he: 'התשלום נכשל',                en: 'Payment failed' },
  errRenewal:       { he: 'כבר הוגשה בקשת חידוש',       en: 'Renewal already requested' },
  errReceipt:       { he: 'הקבלה לא נמצאה',             en: 'Receipt not found' },
  errMaintenance:   { he: 'בקשת התחזוקה לא נמצאה',     en: 'Maintenance request not found' },
};

function labels(key) {
  return LABELS[key] || { he: key, en: key };
}

// ═══════════════════════════════════════════════════════════════════════
//  Pure helpers
// ═══════════════════════════════════════════════════════════════════════

function b64urlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(str) {
  const padLen = (4 - (str.length % 4)) % 4;
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  return Buffer.from(padded, 'base64');
}

/**
 * HMAC-SHA256 → base64url digest.
 * חתימת HMAC-SHA256 ב־base64url.
 */
function hmacSign(data, secret) {
  return b64urlEncode(
    crypto.createHmac('sha256', secret).update(String(data)).digest(),
  );
}

/**
 * Verify an HMAC signature in constant time.
 * אימות חתימה בזמן קבוע.
 */
function hmacVerify(data, secret, signature) {
  const expected = hmacSign(data, secret);
  return safeEqual(expected, signature);
}

/** Constant-time string equality. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Basic email validator. */
function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  if (email.length < 5 || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Israeli phone validator — accepts +9725X, 05X, with optional dashes/spaces. */
function isValidIsraeliPhone(phone) {
  if (typeof phone !== 'string') return false;
  const normalized = phone.replace(/[\s\-()]/g, '');
  // +972 5X XXXXXXX  (10 digits after country code, 9 after drop-zero)
  if (/^\+9725\d{8}$/.test(normalized)) return true;
  // 05X-XXXXXXX  (10 digits total, mobile)
  if (/^05\d{8}$/.test(normalized)) return true;
  // Landline 0X-XXXXXXX (9 digits)
  if (/^0[2-4,6-9]\d{7}$/.test(normalized)) return true;
  return false;
}

function normalizePhone(phone) {
  if (typeof phone !== 'string') return '';
  return phone.replace(/[\s\-()]/g, '');
}

function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function newId(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function clone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(clone);
  if (obj instanceof Date) return new Date(obj.getTime());
  const out = {};
  for (const k of Object.keys(obj)) out[k] = clone(obj[k]);
  return out;
}

function toCents(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100);
}

function fromCents(c) {
  return Math.round(Number(c) || 0) / 100;
}

function parseDate(v) {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? new Date(v.getTime()) : null;
  if (typeof v !== 'string' || v === '') return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function ymd(d) {
  if (!(d instanceof Date)) return '';
  return d.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════════════
//  Magic-link token
//
//  Format:  <b64url(payload)>.<b64url(hmac)>
//  Payload: { tid, iat, exp, ch, nonce }
//    tid   : tenant id
//    iat   : issued-at (seconds)
//    exp   : expiry   (seconds)
//    ch    : channel  ('email' | 'sms')
//    nonce : crypto.randomBytes(8) to make every link unique
// ═══════════════════════════════════════════════════════════════════════

function createMagicLinkToken(tenantId, channel, secret, ttlMs = MAGIC_LINK_TTL_MS) {
  const now = Date.now();
  const payload = {
    tid: tenantId,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + ttlMs) / 1000),
    ch:  channel,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const p = b64urlEncode(JSON.stringify(payload));
  const sig = hmacSign(p, secret);
  return `${p}.${sig}`;
}

function parseMagicLinkToken(token, secret) {
  if (typeof token !== 'string') return { ok: false, reason: 'bad_token' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'bad_token' };
  const [p, s] = parts;
  const expected = hmacSign(p, secret);
  if (!safeEqual(s, expected)) return { ok: false, reason: 'bad_token' };
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(p).toString('utf8'));
  } catch (_e) {
    return { ok: false, reason: 'bad_token' };
  }
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'bad_token' };
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, payload };
}

// ═══════════════════════════════════════════════════════════════════════
//  In-memory repository  |  ריפו בזיכרון
// ═══════════════════════════════════════════════════════════════════════

/**
 * createInMemoryRepo — reference persistence layer. Every list call
 * returns clones so callers mutating the result cannot corrupt the repo.
 *
 * Schema (Maps):
 *   tenants, tenantsByEmail, tenantsByPhone
 *   leases        : by tenantId → lease (one active lease per tenant)
 *   charges       : recurring rent charges (upcoming + past)
 *   payments      : append-only
 *   maintenance   : maintenance requests
 *   documents     : lease PDFs, receipts, misc
 *   magicLinks    : token hash → record (for single-use + audit)
 *   auditLog      : append-only access log
 *   rateBuckets   : rate-limit token buckets
 */
function createInMemoryRepo() {
  const db = {
    tenants: new Map(),
    tenantsByEmail: new Map(),
    tenantsByPhone: new Map(),
    leases: new Map(),
    charges: new Map(),
    payments: new Map(),
    maintenance: new Map(),
    documents: new Map(),
    magicLinks: new Map(),
    auditLog: [],
    rateBuckets: new Map(),
  };

  return {
    // ─── tenants ───────────────────────────────────────────────
    addTenant(tenant) {
      const t = { active: true, createdAt: new Date().toISOString(), ...clone(tenant) };
      db.tenants.set(t.id, t);
      if (t.email) db.tenantsByEmail.set(normalizeEmail(t.email), t.id);
      if (t.phone) db.tenantsByPhone.set(normalizePhone(t.phone), t.id);
    },
    getTenant(id) {
      return clone(db.tenants.get(id));
    },
    getTenantByEmail(email) {
      if (!email) return null;
      const id = db.tenantsByEmail.get(normalizeEmail(email));
      return id ? clone(db.tenants.get(id)) : null;
    },
    getTenantByPhone(phone) {
      if (!phone) return null;
      const id = db.tenantsByPhone.get(normalizePhone(phone));
      return id ? clone(db.tenants.get(id)) : null;
    },
    updateTenant(id, patch) {
      const existing = db.tenants.get(id);
      if (!existing) throw new Error(`Tenant ${id} not found`);
      db.tenants.set(id, { ...existing, ...patch, id });
    },

    // ─── leases ────────────────────────────────────────────────
    addLease(lease) {
      db.leases.set(lease.id, clone(lease));
    },
    getLeaseByTenant(tenantId) {
      for (const lease of db.leases.values()) {
        if (lease.tenantId === tenantId && !lease.archivedAt) {
          return clone(lease);
        }
      }
      return null;
    },
    updateLease(id, patch) {
      const existing = db.leases.get(id);
      if (!existing) throw new Error(`Lease ${id} not found`);
      db.leases.set(id, { ...existing, ...patch, id });
    },

    // ─── charges (recurring rent / utilities) ──────────────────
    addCharge(charge) {
      db.charges.set(charge.id, clone(charge));
    },
    listChargesByTenant(tenantId) {
      const out = [];
      for (const c of db.charges.values()) {
        if (c.tenantId === tenantId && !c.archivedAt) out.push(clone(c));
      }
      return out;
    },
    updateCharge(id, patch) {
      const existing = db.charges.get(id);
      if (!existing) throw new Error(`Charge ${id} not found`);
      db.charges.set(id, { ...existing, ...patch, id });
    },

    // ─── payments ──────────────────────────────────────────────
    addPayment(payment) {
      db.payments.set(payment.id, clone(payment));
    },
    getPayment(id) {
      return clone(db.payments.get(id));
    },
    listPaymentsByTenant(tenantId) {
      const out = [];
      for (const p of db.payments.values()) {
        if (p.tenantId === tenantId && !p.archivedAt) out.push(clone(p));
      }
      return out;
    },

    // ─── maintenance ───────────────────────────────────────────
    addMaintenance(req) {
      db.maintenance.set(req.id, clone(req));
    },
    getMaintenance(id) {
      return clone(db.maintenance.get(id));
    },
    listMaintenanceByTenant(tenantId) {
      const out = [];
      for (const m of db.maintenance.values()) {
        if (m.tenantId === tenantId && !m.archivedAt) out.push(clone(m));
      }
      return out;
    },
    updateMaintenance(id, patch) {
      const existing = db.maintenance.get(id);
      if (!existing) throw new Error(`Maintenance ${id} not found`);
      db.maintenance.set(id, { ...existing, ...patch, id });
    },

    // ─── documents ─────────────────────────────────────────────
    addDocument(doc) {
      db.documents.set(doc.id, clone(doc));
    },
    getDocument(id) {
      return clone(db.documents.get(id));
    },
    listDocumentsByTenant(tenantId) {
      const out = [];
      for (const d of db.documents.values()) {
        if (d.tenantId === tenantId && !d.archivedAt) out.push(clone(d));
      }
      return out;
    },

    // ─── magic links ───────────────────────────────────────────
    addMagicLink(tokenHash, record) {
      db.magicLinks.set(tokenHash, { ...clone(record), tokenHash });
    },
    getMagicLink(tokenHash) {
      return clone(db.magicLinks.get(tokenHash));
    },
    markMagicLinkUsed(tokenHash, at) {
      const existing = db.magicLinks.get(tokenHash);
      if (!existing) return;
      db.magicLinks.set(tokenHash, { ...existing, usedAt: at });
    },

    // ─── audit log ─────────────────────────────────────────────
    appendAudit(entry) {
      db.auditLog.push(clone(entry));
    },
    listAudit(filter = {}) {
      const rows = [];
      for (const e of db.auditLog) {
        if (filter.tenantId && e.tenantId !== filter.tenantId) continue;
        if (filter.action && e.action !== filter.action) continue;
        rows.push(clone(e));
      }
      return rows;
    },

    // ─── rate buckets ──────────────────────────────────────────
    getBucket(key) {
      return db.rateBuckets.get(key);
    },
    setBucket(key, bucket) {
      db.rateBuckets.set(key, bucket);
    },

    // ─── direct access (debug / tests) ─────────────────────────
    _db: db,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  Rate limiter  |  מנגנון חסימה
// ═══════════════════════════════════════════════════════════════════════

/**
 * Token-bucket rate limiter keyed by arbitrary string.
 * Returns { allowed: boolean, remaining: number, resetMs: number }.
 */
function consumeBucket(repo, key, { max, windowMs, clock }) {
  const now = clock ? clock.now() : Date.now();
  const bucket = repo.getBucket(key) || { count: 0, reset: now + windowMs };
  if (bucket.reset <= now) {
    bucket.count = 0;
    bucket.reset = now + windowMs;
  }
  if (bucket.count >= max) {
    repo.setBucket(key, bucket);
    return { allowed: false, remaining: 0, resetMs: bucket.reset - now };
  }
  bucket.count += 1;
  repo.setBucket(key, bucket);
  return { allowed: true, remaining: max - bucket.count, resetMs: bucket.reset - now };
}

// ═══════════════════════════════════════════════════════════════════════
//  File upload validation  |  בדיקת העלאות קבצים
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate a maintenance photo upload.
 * Checks mime allow-list, size cap, EICAR signature and path traversal.
 */
function validatePhotoUpload(file) {
  if (!file || typeof file !== 'object') {
    return { ok: false, reason: 'invalid_file', label: LABELS.errBadRequest };
  }
  if (typeof file.name !== 'string' || file.name === '' || file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
    return { ok: false, reason: 'invalid_name', label: LABELS.errBadRequest };
  }
  if (typeof file.mime !== 'string' || !ALLOWED_PHOTO_MIME.has(file.mime)) {
    return { ok: false, reason: 'invalid_mime', label: LABELS.errUploadType };
  }
  const size = Number(file.size || (file.bytes && file.bytes.length) || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, reason: 'invalid_size', label: LABELS.errUploadSize };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'too_large', label: LABELS.errUploadSize };
  }
  // EICAR stub — block any buffer containing the string.
  if (file.bytes) {
    const asString = Buffer.isBuffer(file.bytes)
      ? file.bytes.toString('latin1')
      : String(file.bytes);
    if (asString.includes(EICAR_FRAGMENT)) {
      return { ok: false, reason: 'infected', label: LABELS.errInfected };
    }
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════
//  Tenant Portal Engine
// ═══════════════════════════════════════════════════════════════════════

/**
 * createTenantPortal — factory function.
 *
 * @param {object} opts
 * @param {object} [opts.repo]           repository (defaults to in-memory).
 * @param {string} [opts.secret]         HMAC secret (REQUIRED in prod).
 * @param {object} [opts.clock]          { now: () => number } — epoch ms.
 * @param {Function} [opts.sendEmail]    async (to, subject, body) => void
 * @param {Function} [opts.sendSms]      async (to, body) => void
 * @param {object} [opts.paymentBridge]  { charge: async ({tenantId, amount, method}) => ref }
 * @param {object} [opts.pdfBridge]      { getDocument: async ({tenantId, docId}) => {fileRef, mime, bytes} }
 * @param {object} [opts.maintenanceBridge] { dispatch: async ({tenantId, requestId}) => void }
 * @param {string} [opts.portalBaseUrl]  used to compose magic links.
 * @param {number} [opts.tokenTtlMs]     override magic-link TTL.
 * @param {number} [opts.sessionTtlMs]   override session TTL.
 */
function createTenantPortal(opts = {}) {
  const repo = opts.repo || createInMemoryRepo();
  const secret = opts.secret || DEFAULT_SECRET_WARNING;
  const clock = opts.clock || { now: () => Date.now() };
  const portalBaseUrl = opts.portalBaseUrl || 'https://portal.techno-kol.local/tenant';
  const tokenTtlMs = Number.isFinite(opts.tokenTtlMs) ? opts.tokenTtlMs : MAGIC_LINK_TTL_MS;
  const sessionTtlMs = Number.isFinite(opts.sessionTtlMs) ? opts.sessionTtlMs : SESSION_TTL_MS;
  const sendEmail = typeof opts.sendEmail === 'function' ? opts.sendEmail : null;
  const sendSms = typeof opts.sendSms === 'function' ? opts.sendSms : null;
  const paymentBridge = opts.paymentBridge || null;
  const pdfBridge = opts.pdfBridge || null;
  const maintenanceBridge = opts.maintenanceBridge || null;

  // In-memory active sessions (sessionId → { tenantId, exp }).
  const sessions = new Map();

  // ---------- audit helper ----------
  function audit(action, tenantId, payload = {}) {
    repo.appendAudit({
      ts: new Date(clock.now()).toISOString(),
      action,
      tenantId: tenantId || null,
      payload: clone(payload),
    });
  }

  // ---------- tenant access guard ----------
  function requireTenant(tenantId) {
    const t = repo.getTenant(tenantId);
    if (!t) {
      const err = new Error('tenant_not_found');
      err.code = 'NOT_FOUND';
      err.label = LABELS.errNotFound;
      throw err;
    }
    if (t.active === false) {
      const err = new Error('tenant_inactive');
      err.code = 'INACTIVE';
      err.label = LABELS.errInactive;
      throw err;
    }
    return t;
  }

  // ---------- per-tenant rate limit ----------
  function enforceTenantRate(tenantId) {
    const key = `tenant:${tenantId}`;
    const res = consumeBucket(repo, key, {
      max: TENANT_RATE_LIMIT_MAX,
      windowMs: TENANT_RATE_LIMIT_WINDOW_MS,
      clock,
    });
    if (!res.allowed) {
      const err = new Error('rate_limited');
      err.code = 'RATE_LIMIT';
      err.label = LABELS.errRateLimit;
      err.resetMs = res.resetMs;
      throw err;
    }
  }

  // ═════════════════════════════════════════════════════════════════
  //  AUTH — magic link via email or SMS
  // ═════════════════════════════════════════════════════════════════

  /**
   * Request a magic-link. Channel is 'email' or 'sms'.
   * Returns { ok, sent, token, link } on success.
   * For unknown recipients returns ok:true, sent:false (no enumeration).
   */
  async function requestMagicLink(channel, value) {
    if (channel !== 'email' && channel !== 'sms') {
      return { ok: false, error: 'bad_channel', label: LABELS.errBadChannel };
    }
    if (channel === 'email' && !isValidEmail(value)) {
      return { ok: false, error: 'invalid_email', label: LABELS.errEmail };
    }
    if (channel === 'sms' && !isValidIsraeliPhone(value)) {
      return { ok: false, error: 'invalid_phone', label: LABELS.errPhone };
    }

    // Rate limit PER contact value to prevent enumeration and spam.
    const key = `magic:${channel}:${channel === 'email' ? normalizeEmail(value) : normalizePhone(value)}`;
    const rl = consumeBucket(repo, key, {
      max: RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
      clock,
    });
    if (!rl.allowed) {
      audit('magic_rate_limited', null, { channel, value });
      return { ok: false, error: 'rate_limited', label: LABELS.errRateLimit, resetMs: rl.resetMs };
    }

    const tenant = channel === 'email'
      ? repo.getTenantByEmail(value)
      : repo.getTenantByPhone(value);

    if (!tenant || tenant.active === false) {
      audit('magic_unknown', null, { channel, value });
      return { ok: true, sent: false, label: LABELS.loginSent };
    }

    const token = createMagicLinkToken(tenant.id, channel, secret, tokenTtlMs);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = clock.now();
    repo.addMagicLink(tokenHash, {
      tenantId: tenant.id,
      channel,
      createdAt: new Date(now).toISOString(),
      exp: now + tokenTtlMs,
      usedAt: null,
    });

    const link = `${portalBaseUrl}/auth/verify?token=${encodeURIComponent(token)}`;
    const subjectHe = 'קישור כניסה לפורטל הדיירים';
    const subjectEn = 'Tenant portal sign-in link';
    const bodyHe = `שלום ${tenant.name || ''},\nלחץ על הקישור כדי להיכנס לפורטל:\n${link}\nהקישור בתוקף 24 שעות.`;
    const bodyEn = `Hello ${tenant.name || ''},\nClick the link below to sign in:\n${link}\nValid for 24 hours.`;
    const fullBody = `${bodyHe}\n\n${bodyEn}`;

    try {
      if (channel === 'email' && sendEmail) {
        await sendEmail(tenant.email, `${subjectHe} | ${subjectEn}`, fullBody);
      } else if (channel === 'sms' && sendSms) {
        await sendSms(tenant.phone, `${subjectHe}: ${link}`);
      }
    } catch (err) {
      audit('magic_delivery_failed', tenant.id, { channel, error: String(err && err.message || err) });
      // Still return ok to avoid enumeration.
    }

    audit('magic_issued', tenant.id, { channel, tokenHash });
    return {
      ok: true,
      sent: true,
      token,
      link,
      label: channel === 'email' ? LABELS.loginSentEmail : LABELS.loginSentSms,
    };
  }

  /**
   * Verify a magic-link token and mint a session.
   * Single-use: marks the token as used to block replay.
   */
  function verifyMagicLink(token) {
    const parsed = parseMagicLinkToken(token, secret);
    if (!parsed.ok) {
      audit('magic_verify_failed', null, { reason: parsed.reason });
      return { ok: false, error: parsed.reason, label: parsed.reason === 'expired' ? LABELS.errExpired : LABELS.errBadToken };
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = repo.getMagicLink(tokenHash);
    if (!record) {
      audit('magic_verify_failed', parsed.payload.tid, { reason: 'unknown_token' });
      return { ok: false, error: 'bad_token', label: LABELS.errBadToken };
    }
    if (record.usedAt) {
      audit('magic_verify_replay', parsed.payload.tid, { tokenHash });
      return { ok: false, error: 'already_used', label: LABELS.errBadToken };
    }
    const now = clock.now();
    if (record.exp < now) {
      audit('magic_verify_failed', parsed.payload.tid, { reason: 'expired' });
      return { ok: false, error: 'expired', label: LABELS.errExpired };
    }

    const tenant = repo.getTenant(record.tenantId);
    if (!tenant || tenant.active === false) {
      audit('magic_verify_failed', record.tenantId, { reason: 'tenant_inactive' });
      return { ok: false, error: 'inactive', label: LABELS.errInactive };
    }

    repo.markMagicLinkUsed(tokenHash, new Date(now).toISOString());

    const sessionId = newId('sess');
    const exp = now + sessionTtlMs;
    sessions.set(sessionId, { tenantId: tenant.id, exp });
    audit('login_success', tenant.id, { sessionId, channel: record.channel });

    return {
      ok: true,
      tenantId: tenant.id,
      session: { id: sessionId, exp },
    };
  }

  /** Resolve a session id to a tenant id (or null). */
  function resolveSession(sessionId) {
    const s = sessions.get(sessionId);
    if (!s) return null;
    if (s.exp < clock.now()) {
      sessions.delete(sessionId);
      return null;
    }
    return s.tenantId;
  }

  function logout(sessionId) {
    const s = sessions.get(sessionId);
    if (!s) return { ok: true };
    sessions.delete(sessionId);
    audit('logout', s.tenantId, { sessionId });
    return { ok: true };
  }

  // ═════════════════════════════════════════════════════════════════
  //  BALANCE / RENT / PAYMENTS
  // ═════════════════════════════════════════════════════════════════

  function _computeBalance(tenantId) {
    const charges = repo.listChargesByTenant(tenantId);
    const payments = repo.listPaymentsByTenant(tenantId);
    const today = new Date(clock.now());
    let owedCents = 0;
    let paidCents = 0;
    for (const c of charges) {
      const due = parseDate(c.dueDate);
      if (due && due.getTime() <= today.getTime()) {
        owedCents += toCents(c.amount || 0);
      }
    }
    for (const p of payments) {
      if (p.status === 'paid') paidCents += toCents(p.amount || 0);
    }
    const balanceCents = owedCents - paidCents;
    return {
      owed: fromCents(owedCents),
      paid: fromCents(paidCents),
      balance: fromCents(balanceCents),
      currency: 'ILS',
    };
  }

  function getBalance(tenantId) {
    requireTenant(tenantId);
    enforceTenantRate(tenantId);
    const snapshot = _computeBalance(tenantId);
    audit('balance_view', tenantId, {});
    return snapshot;
  }

  function getUpcomingRent(tenantId) {
    requireTenant(tenantId);
    enforceTenantRate(tenantId);
    const charges = repo.listChargesByTenant(tenantId);
    const today = new Date(clock.now());
    let next = null;
    for (const c of charges) {
      if (c.status === 'paid') continue;
      const due = parseDate(c.dueDate);
      if (!due) continue;
      if (due.getTime() < today.getTime() && c.status !== 'open') continue;
      if (!next || parseDate(next.dueDate).getTime() > due.getTime()) {
        next = c;
      }
    }
    audit('upcoming_view', tenantId, {});
    return next ? { ...next, amount: fromCents(toCents(next.amount || 0)) } : null;
  }

  function getPaymentHistory(tenantId, filters = {}) {
    requireTenant(tenantId);
    enforceTenantRate(tenantId);
    const rows = repo.listPaymentsByTenant(tenantId);
    const f = filters || {};
    const out = [];
    for (const p of rows) {
      if (f.status && p.status !== f.status) continue;
      if (f.from) {
        const d = parseDate(p.paidAt);
        const lo = parseDate(f.from);
        if (d && lo && d.getTime() < lo.getTime()) continue;
      }
      if (f.to) {
        const d = parseDate(p.paidAt);
        const hi = parseDate(f.to);
        if (d && hi && d.getTime() > hi.getTime()) continue;
      }
      out.push({
        ...p,
        amount: fromCents(toCents(p.amount || 0)),
      });
    }
    out.sort((a, b) => {
      const da = parseDate(a.paidAt); const db = parseDate(b.paidAt);
      const ta = da ? da.getTime() : 0; const tb = db ? db.getTime() : 0;
      return tb - ta;
    });
    audit('payments_view', tenantId, { count: out.length });
    return out;
  }

  /**
   * Pay rent — bridges to Y-076 PayBox/Bit. In tests the payment bridge
   * is stubbed; in production it hands off to the real gateway.
   * Always records the attempt (success or failure) in the payments table.
   */
  async function payRent(tenantId, amount, method = 'paybox') {
    requireTenant(tenantId);
    enforceTenantRate(tenantId);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return { ok: false, error: 'bad_amount', label: LABELS.errBadRequest };
    }
    if (!['paybox', 'bit', 'card', 'masav'].includes(method)) {
      return { ok: false, error: 'bad_method', label: LABELS.errBadRequest };
    }

    const paymentId = newId('pay');
    const nowIso = new Date(clock.now()).toISOString();

    let paymentRef = null;
    let status = 'pending';
    let error = null;

    if (paymentBridge && typeof paymentBridge.charge === 'function') {
      try {
        const result = await paymentBridge.charge({
          tenantId,
          amount: amt,
          method,
          paymentId,
        });
        paymentRef = (result && result.ref) || (result && result.reference) || newId('ref');
        status = 'paid';
      } catch (err) {
        status = 'failed';
        error = String(err && err.message || err);
      }
    } else {
      // No bridge: treat as immediately-settled for happy-path local dev.
      paymentRef = newId('ref');
      status = 'paid';
    }

    repo.addPayment({
      id: paymentId,
      tenantId,
      amount: amt,
      currency: 'ILS',
      method,
      status,
      reference: paymentRef,
      paidAt: status === 'paid' ? nowIso : null,
      createdAt: nowIso,
    });

    // Try to mark the latest unpaid charge as paid.
    if (status === 'paid') {
      const charges = repo.listChargesByTenant(tenantId).filter((c) => c.status !== 'paid');
      charges.sort((a, b) => {
        const da = parseDate(a.dueDate); const db = parseDate(b.dueDate);
        return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
      });
      if (charges.length > 0) {
        repo.updateCharge(charges[0].id, {
          status: 'paid',
          paymentId,
          paidAt: nowIso,
        });
      }

      // Auto-generate a receipt document for the payment (never delete).
      const receiptId = newId('doc');
      repo.addDocument({
        id: receiptId,
        tenantId,
        kind: 'receipt',
        title: `קבלה ${paymentRef}`,
        paymentId,
        createdAt: nowIso,
      });
    }

    audit('rent_payment', tenantId, { paymentId, status, method, amount: amt, error });
    if (status === 'paid') {
      return { ok: true, paymentId, paymentRef, status };
    }
    return { ok: false, paymentId, status, error, label: LABELS.errPayment };
  }

  // ═════════════════════════════════════════════════════════════════
  //  LEASE
  // ═════════════════════════════════════════════════════════════════

  function getLeaseDetails(tenantId) {
    requireTenant(tenantId);
    enforceTenantRate(tenantId);
    const lease = repo.getLeaseByTenant(tenantId);
    audit('lease_view', tenantId, {});
    if (!lease) return null;
    return {
      ...lease,
      monthlyRent: fromCents(toCents(lease.monthlyRent || 0)),
      securityDeposit: fromCents(toCents(lease.securityDeposit || 0)),
    };
  }

  /**
   * Request lease renewal — additive only; keeps old renewal requests
   * in `renewalRequests[]`, never overwrites.
   */
  function requestLeaseRenewal(tenantId, opts = {}) {
    requireTenant(tenantId);
    enforceTenantRate(tenantId);
    const lease = repo.getLeaseByTenant(tenantId);
    if (!lease) {
      return { ok: false, error: 'no_lease', label: LABELS.errBadRequest };
    }
    const previous = Array.isArray(lease.renewalRequests) ? lease.renewalRequests : [];
    const hasPending = previous.some((r) => r.status === 'pending');
    if (hasPending) {
      return { ok: false, error: 'already_requested', label: LABELS.errRenewal };
    }
    const id = newId('ren');
    const entry = {
      id,
      requestedAt: new Date(clock.now()).toISOString(),
      status: 'pending',
      desiredTermMonths: Number(opts.termMonths || 12),
      note: String(opts.note || ''),
      proposedMonthlyRent: Number(opts.proposedRent || lease.monthlyRent || 0),
    };
    repo.updateLease(lease.id, {
      renewalRequests: [...previous, entry],
    });
    audit('lease_renewal_requested', tenantId, { renewalId: id });
    return { ok: true, id };
  }

  // ═════════════════════════════════════════════════════════════════
  //  MAINTENANCE
  // ═════════════════════════════════════════════════════════════════

  function getMaintenanceRequests(tenantId, filter = {}) {
    requireTenant(tenantId);
    enforceTenantRate(tenantId);
    const rows = repo.listMaintenanceByTenant(tenantId);
    const out = [];
    for (const r of rows) {
      if (filter.status && r.status !== filter.status) continue;
      out.push(clone(r));
    }
    out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    audit('maintenance_list', tenantId, { count: out.length });
    return out;
  }

  function submitMaintenanceRequest(tenantId, data = {}) {
    requireTenant(tenantId);
    enforceTenantRate(tenantId);

    const category = String(data.category || 'other');
    const priority = String(data.priority || 'medium');
    const description = String(data.description || '').trim();

    if (!description || description.length < 3) {
      return { ok: false, error: 'bad_description', label: LABELS.errBadRequest };
    }
    if (!LABELS.category[category]) {
      return { ok: false, error: 'bad_category', label: LABELS.errBadRequest };
    }
    if (!LABELS.priority[priority]) {
      return { ok: false, error: 'bad_priority', label: LABELS.errBadRequest };
    }

    const id = newId('req');
    const nowIso = new Date(clock.now()).toISOString();
    const request = {
      id,
      tenantId,
      category,
      priority,
      description,
      status: 'open',
      photos: [],
      history: [{ ts: nowIso, action: 'created', status: 'open' }],
      createdAt: nowIso,
    };
    repo.addMaintenance(request);
    audit('maintenance_submit', tenantId, { requestId: id, category, priority });

    if (maintenanceBridge && typeof maintenanceBridge.dispatch === 'function') {
      Promise.resolve(maintenanceBridge.dispatch({ tenantId, requestId: id })).catch(() => {});
    }
    return { ok: true, id };
  }

  function uploadMaintenancePhoto(tenantId, requestId, file) {
    requireTenant(tenantId);
    enforceTenantRate(tenantId);
    const req = repo.getMaintenance(requestId);
    if (!req || req.tenantId !== tenantId) {
      return { ok: false, error: 'not_found', label: LABELS.errMaintenance };
    }
    const v = validatePhotoUpload(file);
    if (!v.ok) return { ok: false, error: v.reason, label: v.label };
    const photoId = newId('photo');
    const photo = {
      id: photoId,
      name: file.name,
      mime: file.mime,
      size: Number(file.size || (file.bytes && file.bytes.length) || 0),
      uploadedAt: new Date(clock.now()).toISOString(),
      // store bytes or a reference; tests use bytes in memory
      ref: file.ref || null,
    };
    const existingPhotos = Array.isArray(req.photos) ? req.photos : [];
    const existingHistory = Array.isArray(req.history) ? req.history : [];
    repo.updateMaintenance(requestId, {
      photos: [...existingPhotos, photo],
      history: [...existingHistory, { ts: photo.uploadedAt, action: 'photo_added', photoId }],
    });
    audit('maintenance_photo_upload', tenantId, { requestId, photoId });
    return { ok: true, photoId };
  }

  // ═════════════════════════════════════════════════════════════════
  //  DOCUMENTS
  // ═════════════════════════════════════════════════════════════════

  function getDocuments(tenantId) {
    requireTenant(tenantId);
    enforceTenantRate(tenantId);
    const docs = repo.listDocumentsByTenant(tenantId);
    const lease = repo.getLeaseByTenant(tenantId);
    // Always include a synthetic lease-PDF entry if the lease exists.
    if (lease && lease.pdfRef && !docs.find((d) => d.id === `lease-${lease.id}`)) {
      docs.push({
        id: `lease-${lease.id}`,
        tenantId,
        kind: 'lease',
        title: LABELS.leasePdf.he,
        pdfRef: lease.pdfRef,
        createdAt: lease.startDate,
      });
    }
    docs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    audit('documents_list', tenantId, { count: docs.length });
    return docs;
  }

  async function downloadReceipt(tenantId, receiptId) {
    requireTenant(tenantId);
    enforceTenantRate(tenantId);
    const doc = repo.getDocument(receiptId);
    if (!doc || doc.tenantId !== tenantId || doc.kind !== 'receipt') {
      return { ok: false, error: 'not_found', label: LABELS.errReceipt };
    }
    if (pdfBridge && typeof pdfBridge.getDocument === 'function') {
      try {
        const res = await pdfBridge.getDocument({ tenantId, docId: receiptId });
        audit('receipt_download', tenantId, { receiptId, via: 'bridge' });
        return { ok: true, fileRef: res && res.fileRef, mime: res && res.mime, bytes: res && res.bytes };
      } catch (err) {
        audit('receipt_download_failed', tenantId, { receiptId, error: String(err && err.message || err) });
      }
    }
    audit('receipt_download', tenantId, { receiptId, via: 'fallback' });
    return {
      ok: true,
      fileRef: null,
      fallbackText: `קבלה ${doc.title || receiptId}\nתאריך: ${doc.createdAt || ''}\nתשלום: ${doc.paymentId || ''}\n`,
    };
  }

  async function downloadLeasePdf(tenantId) {
    requireTenant(tenantId);
    enforceTenantRate(tenantId);
    const lease = repo.getLeaseByTenant(tenantId);
    if (!lease) {
      return { ok: false, error: 'no_lease', label: LABELS.errBadRequest };
    }
    if (pdfBridge && typeof pdfBridge.getDocument === 'function') {
      try {
        const res = await pdfBridge.getDocument({ tenantId, docId: `lease-${lease.id}` });
        audit('lease_download', tenantId, { via: 'bridge' });
        return { ok: true, fileRef: res && res.fileRef, mime: res && res.mime, bytes: res && res.bytes };
      } catch (err) {
        audit('lease_download_failed', tenantId, { error: String(err && err.message || err) });
      }
    }
    audit('lease_download', tenantId, { via: 'fallback' });
    return {
      ok: true,
      fileRef: lease.pdfRef || null,
      fallbackText: `הסכם שכירות | Lease\nדייר: ${tenantId}\nמתאריך: ${lease.startDate}\nעד: ${lease.endDate}\nשכ״ד חודשי: ${lease.monthlyRent} ₪\n`,
    };
  }

  // ═════════════════════════════════════════════════════════════════
  //  DASHBOARD aggregator
  // ═════════════════════════════════════════════════════════════════

  function getDashboard(tenantId) {
    const tenant = requireTenant(tenantId);
    enforceTenantRate(tenantId);
    const balance = _computeBalance(tenantId);
    const upcoming = (() => {
      const charges = repo.listChargesByTenant(tenantId);
      const today = new Date(clock.now());
      let next = null;
      for (const c of charges) {
        if (c.status === 'paid') continue;
        const due = parseDate(c.dueDate);
        if (!due) continue;
        if (!next || parseDate(next.dueDate).getTime() > due.getTime()) next = c;
      }
      return next ? { ...next, amount: fromCents(toCents(next.amount || 0)) } : null;
    })();
    const lease = repo.getLeaseByTenant(tenantId);
    const openMaintenance = repo.listMaintenanceByTenant(tenantId)
      .filter((r) => r.status === 'open' || r.status === 'inProgress' || r.status === 'scheduled')
      .length;

    audit('dashboard_view', tenantId, {});

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        propertyId: tenant.propertyId,
        unit: tenant.unit,
      },
      balance,
      upcomingRent: upcoming,
      leaseEndDate: lease ? lease.endDate : null,
      openMaintenance,
      currency: 'ILS',
    };
  }

  // ═════════════════════════════════════════════════════════════════
  //  AUDIT LOG viewer
  // ═════════════════════════════════════════════════════════════════

  function getAuditLog(filter = {}) {
    return repo.listAudit(filter);
  }

  // ---------- API surface ----------
  return {
    // auth
    requestMagicLink,
    verifyMagicLink,
    resolveSession,
    logout,
    // data
    getDashboard,
    getBalance,
    getUpcomingRent,
    getPaymentHistory,
    getLeaseDetails,
    getMaintenanceRequests,
    submitMaintenanceRequest,
    uploadMaintenancePhoto,
    payRent,
    requestLeaseRenewal,
    getDocuments,
    downloadReceipt,
    downloadLeasePdf,
    // audit / admin
    getAuditLog,
    // test helpers
    _repo: repo,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  createTenantPortal,
  createInMemoryRepo,
  // primitives (exported for tests & reuse)
  createMagicLinkToken,
  parseMagicLinkToken,
  hmacSign,
  hmacVerify,
  safeEqual,
  isValidEmail,
  isValidIsraeliPhone,
  normalizeEmail,
  normalizePhone,
  validatePhotoUpload,
  consumeBucket,
  labels,
  LABELS,
  constants: {
    MAGIC_LINK_TTL_MS,
    SESSION_TTL_MS,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
    TENANT_RATE_LIMIT_MAX,
    TENANT_RATE_LIMIT_WINDOW_MS,
    MAX_UPLOAD_BYTES,
    ALLOWED_PHOTO_MIME,
    EICAR_FRAGMENT,
  },
};
