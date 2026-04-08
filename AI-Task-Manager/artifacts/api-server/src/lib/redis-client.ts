/**
 * TechnoKoluzi ERP - Redis Caching Layer
 * שכבת קאש מבוססת Redis עם fallback לזיכרון מקומי
 *
 * Features:
 * - In-memory Map fallback (ללא תלות ב-Redis בפועל)
 * - Tag-based invalidation לניקוי קבוצתי
 * - Pattern-based invalidation עם glob matching
 * - Rate limiting מובנה
 * - TTL מוגדר עם ניקוי אוטומטי תקופתי
 * - מקסימום 5000 רשומות עם מדיניות LRU
 * - פונקציות מיוחדות: cacheQuery, cacheSession, cacheApiResponse
 */

// ============== Types ==============

interface CacheEntry<T = any> {
  value: T;
  expiresAt: number;
  tags: string[];
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

interface CacheOptions {
  ttl?: number;           // זמן חיים בשניות
  tags?: string[];        // תגיות לניקוי קבוצתי
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;        // timestamp של איפוס
  limit: number;
}

interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  totalSets: number;
  totalDeletes: number;
  memoryEstimate: string;
  oldestEntry: number | null;
  tagCount: number;
}

// ============== Constants ==============

/** מספר מקסימלי של רשומות בקאש */
const MAX_ENTRIES = 5000;

/** TTL ברירת מחדל - 5 דקות */
const DEFAULT_TTL = 300;

/** TTL לשאילתות - 2 דקות */
const QUERY_TTL = 120;

/** TTL לסשנים - שעה */
const SESSION_TTL = 3600;

/** TTL לתגובות API - 30 שניות */
const API_RESPONSE_TTL = 30;

/** מרווח ניקוי אוטומטי - כל דקה */
const CLEANUP_INTERVAL = 60_000;

// ============== מאגר נתונים בזיכרון ==============

const cache = new Map<string, CacheEntry>();
const tagIndex = new Map<string, Set<string>>(); // tag -> set of keys

// סטטיסטיקות
let stats = {
  hits: 0,
  misses: 0,
  evictions: 0,
  totalSets: 0,
  totalDeletes: 0,
};

// ============== פונקציות עזר ==============

/** בדיקה אם רשומה פגה תוקף */
function isExpired(entry: CacheEntry): boolean {
  return Date.now() > entry.expiresAt;
}

/** הסרת רשומה מהקאש כולל אינדקס תגיות */
function removeEntry(key: string): boolean {
  const entry = cache.get(key);
  if (!entry) return false;

  // ניקוי מאינדקס התגיות
  for (const tag of entry.tags) {
    const tagKeys = tagIndex.get(tag);
    if (tagKeys) {
      tagKeys.delete(key);
      if (tagKeys.size === 0) {
        tagIndex.delete(tag);
      }
    }
  }

  cache.delete(key);
  return true;
}

/** מדיניות LRU - הסרת הרשומות הכי ישנות/פחות בשימוש */
function evictIfNeeded(): void {
  if (cache.size < MAX_ENTRIES) return;

  // מיון לפי גישה אחרונה - הסרת 10% מהישנות ביותר
  const entries = Array.from(cache.entries())
    .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

  const toRemove = Math.ceil(MAX_ENTRIES * 0.1);
  for (let i = 0; i < toRemove && i < entries.length; i++) {
    removeEntry(entries[i][0]);
    stats.evictions++;
  }
}

/** בדיקת glob pattern פשוט - תומך ב-* */
function matchPattern(key: string, pattern: string): boolean {
  const regex = new RegExp(
    "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  );
  return regex.test(key);
}

// ============== פונקציות קאש ראשיות ==============

/**
 * קריאת ערך מהקאש
 * מחזיר null אם לא נמצא או פג תוקף
 */
export function cacheGet<T = any>(key: string): T | null {
  const entry = cache.get(key);

  if (!entry) {
    stats.misses++;
    return null;
  }

  if (isExpired(entry)) {
    removeEntry(key);
    stats.misses++;
    return null;
  }

  // עדכון סטטיסטיקות גישה
  entry.accessCount++;
  entry.lastAccessedAt = Date.now();
  stats.hits++;

  return entry.value as T;
}

/**
 * כתיבת ערך לקאש
 */
export function cacheSet<T = any>(
  key: string,
  value: T,
  options: CacheOptions = {}
): void {
  const { ttl = DEFAULT_TTL, tags = [] } = options;

  // ודא שיש מקום
  evictIfNeeded();

  const now = Date.now();
  const entry: CacheEntry<T> = {
    value,
    expiresAt: now + ttl * 1000,
    tags,
    createdAt: now,
    accessCount: 0,
    lastAccessedAt: now,
  };

  // הסר רשומה ישנה אם קיימת (ניקוי תגיות ישנות)
  if (cache.has(key)) {
    removeEntry(key);
  }

  cache.set(key, entry);

  // עדכון אינדקס תגיות
  for (const tag of tags) {
    if (!tagIndex.has(tag)) {
      tagIndex.set(tag, new Set());
    }
    tagIndex.get(tag)!.add(key);
  }

  stats.totalSets++;
}

/**
 * מחיקת ערך מהקאש
 */
export function cacheDel(key: string): boolean {
  const removed = removeEntry(key);
  if (removed) stats.totalDeletes++;
  return removed;
}

/**
 * קריאה מהקאש, ואם לא קיים - חישוב ושמירה
 * שימושי למניעת חישובים כפולים
 */
export async function cacheGetOrSet<T>(
  key: string,
  factory: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== null) return cached;

  const value = await factory();
  cacheSet(key, value, options);
  return value;
}

// ============== ניקוי מבוסס תגיות ==============

/**
 * ניקוי כל הרשומות עם תגית מסוימת
 * שימושי לדוגמה: invalidation של כל קאש השאילתות של מודול מסוים
 */
export function cacheInvalidateByTag(tag: string): number {
  const keys = tagIndex.get(tag);
  if (!keys) return 0;

  let count = 0;
  // העתקה למערך כדי למנוע בעיות עם מחיקה תוך כדי iteration
  const keysCopy = Array.from(keys);
  for (const key of keysCopy) {
    if (removeEntry(key)) {
      count++;
      stats.totalDeletes++;
    }
  }

  return count;
}

/**
 * ניקוי רשומות לפי תבנית (glob pattern)
 * תומך ב-* כ-wildcard
 */
export function cacheInvalidateByPattern(pattern: string): number {
  let count = 0;

  for (const key of Array.from(cache.keys())) {
    if (matchPattern(key, pattern)) {
      if (removeEntry(key)) {
        count++;
        stats.totalDeletes++;
      }
    }
  }

  return count;
}

// ============== פונקציות מיוחדות ==============

/**
 * קאש שאילתות מסד נתונים
 * TTL קצר יותר, תגיות אוטומטיות לפי טבלה
 */
export async function cacheQuery<T>(
  table: string,
  queryKey: string,
  factory: () => Promise<T>,
  ttl: number = QUERY_TTL
): Promise<T> {
  const key = `query:${table}:${queryKey}`;
  return cacheGetOrSet(key, factory, {
    ttl,
    tags: ["query", `query:${table}`],
  });
}

/**
 * קאש סשנים - TTL ארוך יותר
 */
export function cacheSession(
  sessionId: string,
  data: Record<string, any>
): void {
  cacheSet(`session:${sessionId}`, data, {
    ttl: SESSION_TTL,
    tags: ["session"],
  });
}

/**
 * קריאת סשן מהקאש
 */
export function getSessionFromCache(
  sessionId: string
): Record<string, any> | null {
  return cacheGet(`session:${sessionId}`);
}

/**
 * קאש תגובות API חיצוניות
 */
export async function cacheApiResponse<T>(
  endpoint: string,
  factory: () => Promise<T>,
  ttl: number = API_RESPONSE_TTL
): Promise<T> {
  const key = `api:${endpoint}`;
  return cacheGetOrSet(key, factory, {
    ttl,
    tags: ["api-response"],
  });
}

// ============== Rate Limiting ==============

/**
 * בדיקת הגבלת קצב
 * מחזיר אם הפעולה מותרת + מידע על הנותר
 */
export function checkRateLimit(
  identifier: string,
  limit: number,
  windowSeconds: number
): RateLimitResult {
  const key = `ratelimit:${identifier}`;
  const now = Date.now();

  const existing = cacheGet<{ count: number; windowStart: number }>(key);

  if (!existing) {
    // חלון חדש
    cacheSet(key, { count: 1, windowStart: now }, {
      ttl: windowSeconds,
      tags: ["ratelimit"],
    });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: now + windowSeconds * 1000,
      limit,
    };
  }

  // בדיקה אם החלון עדיין תקף
  const windowEnd = existing.windowStart + windowSeconds * 1000;
  if (now > windowEnd) {
    // חלון חדש
    cacheSet(key, { count: 1, windowStart: now }, {
      ttl: windowSeconds,
      tags: ["ratelimit"],
    });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: now + windowSeconds * 1000,
      limit,
    };
  }

  // עדכון מונה
  existing.count++;
  cacheSet(key, existing, {
    ttl: Math.ceil((windowEnd - now) / 1000),
    tags: ["ratelimit"],
  });

  const allowed = existing.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    resetAt: windowEnd,
    limit,
  };
}

// ============== סטטיסטיקות ==============

/**
 * קבלת סטטיסטיקות קאש
 */
export function getCacheStats(): CacheStats {
  const totalRequests = stats.hits + stats.misses;
  let oldestEntry: number | null = null;

  for (const entry of cache.values()) {
    if (oldestEntry === null || entry.createdAt < oldestEntry) {
      oldestEntry = entry.createdAt;
    }
  }

  // הערכת זיכרון גסה - ~200 bytes לרשומה בממוצע
  const memoryBytes = cache.size * 200;
  const memoryEstimate =
    memoryBytes < 1024 * 1024
      ? `${(memoryBytes / 1024).toFixed(1)} KB`
      : `${(memoryBytes / (1024 * 1024)).toFixed(1)} MB`;

  return {
    entries: cache.size,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: totalRequests > 0 ? stats.hits / totalRequests : 0,
    evictions: stats.evictions,
    totalSets: stats.totalSets,
    totalDeletes: stats.totalDeletes,
    memoryEstimate,
    oldestEntry,
    tagCount: tagIndex.size,
  };
}

/**
 * ניקוי מלא של הקאש
 */
export function cacheClear(): void {
  cache.clear();
  tagIndex.clear();
}

// ============== ניקוי תקופתי ==============

/** ניקוי רשומות שפג תוקפן */
function cleanupExpired(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      removeEntry(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    // לוג שקט - אין צורך בהודעה על כל ניקוי
  }
}

// הפעלת ניקוי תקופתי
const cleanupTimer = setInterval(cleanupExpired, CLEANUP_INTERVAL);

// מניעת חסימה של תהליך Node.js
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

export default {
  get: cacheGet,
  set: cacheSet,
  del: cacheDel,
  getOrSet: cacheGetOrSet,
  invalidateByTag: cacheInvalidateByTag,
  invalidateByPattern: cacheInvalidateByPattern,
  query: cacheQuery,
  session: cacheSession,
  getSession: getSessionFromCache,
  apiResponse: cacheApiResponse,
  checkRateLimit,
  getStats: getCacheStats,
  clear: cacheClear,
};
