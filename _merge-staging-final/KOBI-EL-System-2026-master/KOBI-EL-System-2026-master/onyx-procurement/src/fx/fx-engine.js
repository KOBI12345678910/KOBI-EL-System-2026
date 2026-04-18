/* ============================================================================
 * Techno-Kol ERP — Multi-Currency FX Engine / מנוע שערי חליפין
 * Agent X-36 / Swarm 3C / Onyx Procurement
 * ----------------------------------------------------------------------------
 * Daily FX engine wired to Bank of Israel (בנק ישראל) rate schedule.
 *
 * Features:
 *   1.  Daily FX rates cache (in-memory LRU, expires daily 10:00 Jerusalem)
 *   2.  Historical rates lookup by date
 *   3.  Convert amount between any two supported currencies
 *   4.  Triangulate via USD when a direct pair is missing
 *   5.  Rate source hierarchy:
 *        a. Official rate from Bank of Israel (pluggable XML fetcher)
 *        b. User-provided override
 *        c. Last known rate (with staleness warning)
 *   6.  Unrealized gain / loss revaluation of open positions
 *   7.  Rounding per currency convention (JPY = 0 dp, HKD = 2 dp, etc.)
 *
 * Supported currencies (primary basket):
 *   ILS (base), USD, EUR, GBP, JPY, CHF, CAD, AUD, HKD, CNY, JOD, EGP
 *
 * Bank of Israel XML endpoint:
 *   https://www.boi.org.il/currency.xml   (stub — pluggable fetcher)
 *
 * Rules:
 *   — Never delete, Hebrew bilingual, Israeli compliance, zero deps
 *   — Uses built-in fetch (Node ≥ 18)
 *   — IAS 21 rules apply:
 *       • Unrealized FX gains/losses taxable in period incurred
 *       • Revaluation monetary items at closing rate
 *       • Reports always presented in ILS
 *
 * Public API:
 *   createFxEngine(opts)                    → engine
 *   engine.getRate(from, to, date?)         → { rate, source, asOf, stale }
 *   engine.convert(amount, from, to, date?) → { converted, rate, source, stale }
 *   engine.revalue(positions[], asOf)       → [ { ..., unrealizedIls } ]
 *   engine.setOverride(from, to, rate, date) → void
 *   engine.cacheStats()                     → { size, hits, misses, overrides }
 *   engine.loadRates(snapshot)              → void      (bulk seed)
 *   engine.purgeExpired(nowIso?)            → number    (count purged)
 *   engine.listCurrencies()                 → string[]
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * Supported currencies & metadata
 * -------------------------------------------------------------------------- */
const BASE = 'ILS';

const CURRENCIES = Object.freeze({
  ILS: { code: 'ILS', symbol: '₪',  decimals: 2, nameHe: 'שקל חדש',        nameEn: 'Israeli New Shekel' },
  USD: { code: 'USD', symbol: '$',  decimals: 2, nameHe: 'דולר אמריקאי',    nameEn: 'US Dollar' },
  EUR: { code: 'EUR', symbol: '€',  decimals: 2, nameHe: 'אירו',            nameEn: 'Euro' },
  GBP: { code: 'GBP', symbol: '£',  decimals: 2, nameHe: 'לירה שטרלינג',    nameEn: 'Pound Sterling' },
  JPY: { code: 'JPY', symbol: '¥',  decimals: 0, nameHe: 'ין יפני',         nameEn: 'Japanese Yen' },
  CHF: { code: 'CHF', symbol: 'Fr', decimals: 2, nameHe: 'פרנק שוויצרי',    nameEn: 'Swiss Franc' },
  CAD: { code: 'CAD', symbol: 'C$', decimals: 2, nameHe: 'דולר קנדי',       nameEn: 'Canadian Dollar' },
  AUD: { code: 'AUD', symbol: 'A$', decimals: 2, nameHe: 'דולר אוסטרלי',    nameEn: 'Australian Dollar' },
  HKD: { code: 'HKD', symbol: 'HK$',decimals: 2, nameHe: 'דולר הונג קונג',  nameEn: 'Hong Kong Dollar' },
  CNY: { code: 'CNY', symbol: '¥',  decimals: 2, nameHe: 'יואן סיני',       nameEn: 'Chinese Yuan' },
  JOD: { code: 'JOD', symbol: 'JD', decimals: 3, nameHe: 'דינר ירדני',      nameEn: 'Jordanian Dinar' },
  EGP: { code: 'EGP', symbol: 'E£', decimals: 2, nameHe: 'לירה מצרית',      nameEn: 'Egyptian Pound' }
});

const SUPPORTED = Object.freeze(Object.keys(CURRENCIES));

/* ----------------------------------------------------------------------------
 * Error type — bilingual messages for ERP surfacing
 * -------------------------------------------------------------------------- */
class FxError extends Error {
  constructor(code, messageEn, messageHe, details) {
    super(`[${code}] ${messageEn} / ${messageHe}`);
    this.name = 'FxError';
    this.code = code;
    this.messageEn = messageEn;
    this.messageHe = messageHe;
    this.details = details || null;
  }
}

/* ----------------------------------------------------------------------------
 * Date utilities — Jerusalem-centric ISO date helpers
 * -------------------------------------------------------------------------- */
function pad(n, w) {
  const s = String(n);
  return s.length >= w ? s : '0'.repeat(w - s.length) + s;
}

/** Return YYYY-MM-DD in Asia/Jerusalem, regardless of host TZ. */
function jerusalemDateStr(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) throw new FxError('BAD_DATE', 'Invalid date', 'תאריך לא תקין');
  // Use Intl to pull a Jerusalem wall-clock date — avoids DST pitfalls.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit'
  });
  // en-CA yields YYYY-MM-DD already.
  return fmt.format(date);
}

/** Parse 'YYYY-MM-DD' to a UTC Date at 00:00:00. */
function parseIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new FxError('BAD_DATE', 'Expected YYYY-MM-DD', 'נדרש תאריך בפורמט YYYY-MM-DD', { value: s });
  }
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

/** Shift a YYYY-MM-DD string by N days. */
function addDays(isoDate, n) {
  const d = parseIsoDate(isoDate);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

/** 0=Sun … 6=Sat  (in Jerusalem semantics — weekend = Fri/Sat). */
function dayOfWeek(isoDate) {
  return parseIsoDate(isoDate).getUTCDay();
}
function isIsraeliWeekend(isoDate) {
  const dow = dayOfWeek(isoDate);
  return dow === 5 /* Fri */ || dow === 6 /* Sat */;
}

/** Step backward to the last weekday (Sun–Thu). BoI publishes Sun–Thu. */
function lastTradingDay(isoDate) {
  let cur = isoDate;
  let guard = 10;
  while (isIsraeliWeekend(cur) && guard-- > 0) cur = addDays(cur, -1);
  return cur;
}

/**
 * Jerusalem 10:00 rollover: each day's rates come from BoI at ~10:00 local.
 * Prior to 10:00, the "current" rate is still yesterday's.
 */
function currentRateDate(nowDate) {
  const d = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const hourFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour12: false,
    hour: '2-digit'
  });
  const hour = parseInt(hourFmt.format(d), 10);
  const today = jerusalemDateStr(d);
  // Before 10:00 local → yesterday's publish
  const effective = hour < 10 ? addDays(today, -1) : today;
  return lastTradingDay(effective);
}

/* ----------------------------------------------------------------------------
 * Rounding per currency convention
 * -------------------------------------------------------------------------- */
function round(amount, currency) {
  const meta = CURRENCIES[currency];
  if (!meta) throw new FxError('UNKNOWN_CCY', `Unknown currency ${currency}`, `מטבע לא מוכר ${currency}`);
  const f = Math.pow(10, meta.decimals);
  // Banker's rounding avoids drift on large batches.
  const scaled = amount * f;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let n;
  if (diff > 0.5) n = floor + 1;
  else if (diff < 0.5) n = floor;
  else n = (floor % 2 === 0) ? floor : floor + 1;
  return n / f;
}

/* ----------------------------------------------------------------------------
 * LRU cache  (zero-dep, Map-based)
 * -------------------------------------------------------------------------- */
function makeLruCache(max) {
  const store = new Map();
  return {
    get(key) {
      if (!store.has(key)) return undefined;
      const v = store.get(key);
      store.delete(key);
      store.set(key, v);
      return v;
    },
    set(key, value) {
      if (store.has(key)) store.delete(key);
      store.set(key, value);
      while (store.size > max) {
        const firstKey = store.keys().next().value;
        store.delete(firstKey);
      }
    },
    has(key) { return store.has(key); },
    delete(key) { return store.delete(key); },
    size() { return store.size; },
    keys() { return Array.from(store.keys()); },
    clear() { store.clear(); },
    entries() { return Array.from(store.entries()); }
  };
}

/* ----------------------------------------------------------------------------
 * Tiny XML parser — enough for <CURRENCY> blocks in BoI payload.
 * Zero deps, forgiving about CDATA / whitespace.
 * -------------------------------------------------------------------------- */
function parseBoiXml(xml) {
  if (typeof xml !== 'string' || xml.length === 0) {
    throw new FxError('BAD_XML', 'Empty XML', 'XML ריק');
  }
  // Grab top-level LAST_UPDATE if present
  const lastUpdateMatch = xml.match(/<LAST_UPDATE>\s*([\d\-]+)\s*<\/LAST_UPDATE>/i);
  const asOf = lastUpdateMatch ? lastUpdateMatch[1] : null;

  const out = {};
  const blockRe = /<CURRENCY>([\s\S]*?)<\/CURRENCY>/gi;
  let m;
  while ((m = blockRe.exec(xml)) !== null) {
    const body = m[1];
    const tag = (name) => {
      const r = new RegExp(`<${name}>\\s*([\\s\\S]*?)\\s*<\\/${name}>`, 'i');
      const x = body.match(r);
      return x ? x[1].trim() : null;
    };
    const code = tag('CURRENCYCODE');
    const rate = parseFloat(tag('RATE'));
    const unit = parseInt(tag('UNIT') || '1', 10);
    const change = parseFloat(tag('CHANGE') || '0');
    if (code && !isNaN(rate) && unit > 0) {
      // BoI rates are "ILS per UNIT of foreign currency"
      // Normalize to 'ILS per 1 foreign'.
      out[code.toUpperCase()] = {
        rate: rate / unit,
        unit,
        change,
        asOf
      };
    }
  }
  return { asOf, rates: out };
}

/* ----------------------------------------------------------------------------
 * Default fetcher (built-in Node fetch) — users MAY pass their own.
 * Never called automatically at import time.
 * -------------------------------------------------------------------------- */
async function defaultBoiFetcher(url, signal) {
  if (typeof fetch !== 'function') {
    throw new FxError('NO_FETCH', 'Built-in fetch not available', 'פונקציית fetch אינה זמינה');
  }
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new FxError('BOI_HTTP', `BoI HTTP ${res.status}`, `בנק ישראל השיב ${res.status}`);
  }
  return await res.text();
}

/* ----------------------------------------------------------------------------
 * Core engine factory
 * -------------------------------------------------------------------------- */
function createFxEngine(opts) {
  opts = opts || {};

  const config = {
    boiUrl:         opts.boiUrl   || 'https://www.boi.org.il/currency.xml',
    fetcher:        opts.fetcher  || defaultBoiFetcher,
    now:            opts.now      || (() => new Date()),
    cacheMax:       opts.cacheMax || 1000,
    staleHours:     typeof opts.staleHours === 'number' ? opts.staleHours : 24,
    autoFetch:      !!opts.autoFetch,
    logger:         opts.logger || null
  };

  // rateStore[date][code] = { rate, source, asOf }
  const rateStore = new Map();
  // overrideStore[date][from][to] = { rate, ts }
  const overrideStore = new Map();
  const lookupCache = makeLruCache(config.cacheMax);

  const stats = { hits: 0, misses: 0, fetches: 0, overrides: 0, stale: 0 };

  /* ---- logger shim ---- */
  function log(level, msg, data) {
    if (!config.logger) return;
    try { config.logger[level] && config.logger[level](msg, data); } catch (_) { /* ignore */ }
  }

  /* ---- internal helpers ---- */
  function ensureCcy(code) {
    const c = String(code || '').toUpperCase();
    if (!CURRENCIES[c]) {
      throw new FxError('UNKNOWN_CCY', `Unknown currency ${c}`, `מטבע לא מוכר ${c}`);
    }
    return c;
  }

  function dateKey(dateLike) {
    if (!dateLike) return currentRateDate(config.now());
    if (typeof dateLike === 'string') {
      // accept 'YYYY-MM-DD' directly
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateLike)) return dateLike;
      return jerusalemDateStr(new Date(dateLike));
    }
    return jerusalemDateStr(dateLike);
  }

  function storeRate(date, code, rate, source, asOf) {
    if (!rateStore.has(date)) rateStore.set(date, {});
    rateStore.get(date)[code] = {
      rate,
      source,
      asOf: asOf || date
    };
  }

  function getStoredRate(date, code) {
    const day = rateStore.get(date);
    return day ? day[code] : undefined;
  }

  /**
   * Load a snapshot of BoI rates (or user-provided equivalent).
   * snapshot shape: { date: 'YYYY-MM-DD', rates: { USD: 3.72, EUR: 4.01 } }
   * OR raw BoI XML string.
   */
  function loadRates(snapshot) {
    if (!snapshot) throw new FxError('BAD_SNAPSHOT', 'Missing snapshot', 'נתוני שערים חסרים');
    let date;
    let parsedRates;
    let source = 'BOI';

    if (typeof snapshot === 'string') {
      const parsed = parseBoiXml(snapshot);
      date = parsed.asOf || currentRateDate(config.now());
      parsedRates = {};
      for (const k of Object.keys(parsed.rates)) {
        parsedRates[k] = parsed.rates[k].rate;
      }
    } else if (typeof snapshot === 'object') {
      date = snapshot.date || currentRateDate(config.now());
      parsedRates = snapshot.rates || {};
      source = snapshot.source || 'BOI';
    } else {
      throw new FxError('BAD_SNAPSHOT', 'Invalid snapshot type', 'סוג נתונים לא תקין');
    }

    // BoI always expresses rates as "ILS per 1 unit of foreign ccy".
    // We store them exactly that way.
    let count = 0;
    for (const rawCode of Object.keys(parsedRates)) {
      const code = rawCode.toUpperCase();
      if (!CURRENCIES[code]) continue; // silently skip unsupported
      const r = Number(parsedRates[rawCode]);
      if (!(r > 0)) continue;
      storeRate(date, code, r, source, date);
      count += 1;
    }
    // The base always has rate 1 in itself.
    storeRate(date, BASE, 1, source, date);

    // Bust lookup cache entries for this date
    for (const k of lookupCache.keys()) {
      if (k.indexOf(`|${date}|`) >= 0 || k.indexOf(`|${date}`) === k.length - date.length - 1) {
        lookupCache.delete(k);
      }
    }
    log('info', `fx-engine loaded ${count} rates`, { date, source });
    return { date, count };
  }

  /**
   * Remove rate days older than N (default 400) days.
   * Used by schedulers to keep memory tidy without losing fiscal-year history.
   */
  function purgeExpired(nowIso, days) {
    days = typeof days === 'number' ? days : 400;
    const anchor = nowIso ? dateKey(nowIso) : currentRateDate(config.now());
    const cutoff = addDays(anchor, -days);
    let n = 0;
    for (const k of Array.from(rateStore.keys())) {
      if (k < cutoff) { rateStore.delete(k); n += 1; }
    }
    for (const k of Array.from(overrideStore.keys())) {
      if (k < cutoff) { overrideStore.delete(k); n += 1; }
    }
    lookupCache.clear();
    return n;
  }

  /**
   * Walk backward day-by-day until a rate is located OR cap reached.
   * Returns { date, rate, source, asOf } or null.
   */
  function findLatestRateOnOrBefore(code, date, maxBack) {
    maxBack = typeof maxBack === 'number' ? maxBack : 14;
    let cur = date;
    for (let i = 0; i <= maxBack; i++) {
      const entry = getStoredRate(cur, code);
      if (entry) return { date: cur, ...entry };
      cur = addDays(cur, -1);
    }
    return null;
  }

  /**
   * Override resolution: check override map first (exact date, then fallback).
   */
  function getOverride(from, to, date) {
    const day = overrideStore.get(date);
    if (!day) return null;
    if (day[from] && day[from][to]) return day[from][to];
    // inverse
    if (day[to] && day[to][from]) {
      return { rate: 1 / day[to][from].rate, ts: day[to][from].ts, inverse: true };
    }
    return null;
  }

  /**
   * Set a manual override rate for a pair on a given date.
   * This has priority over BoI but is still subject to staleness logic
   * when consumed on later dates.
   */
  function setOverride(from, to, rate, date) {
    const f = ensureCcy(from);
    const t = ensureCcy(to);
    if (!(rate > 0)) throw new FxError('BAD_RATE', 'Rate must be > 0', 'השער חייב להיות חיובי');
    const key = dateKey(date);
    if (!overrideStore.has(key)) overrideStore.set(key, {});
    const day = overrideStore.get(key);
    if (!day[f]) day[f] = {};
    day[f][t] = { rate, ts: Date.now() };
    stats.overrides += 1;
    lookupCache.clear();
  }

  /**
   * Compute ILS-anchored rate from a stored "ILS per 1 foreign" value.
   * i.e. rate(FROM → TO) derived from store[FROM] and store[TO].
   *
   * Rules:
   *   rate(FROM → ILS) = store[FROM]              // ILS per 1 FROM
   *   rate(ILS → TO)   = 1 / store[TO]            // inverse
   *   rate(FROM → TO)  = store[FROM] / store[TO]  // triangulation through ILS
   */
  function derivePairFromIlsBase(from, to, storeDay, stale) {
    if (from === to) return { rate: 1, source: 'IDENTITY', stale: false };

    if (from === BASE) {
      const rhs = storeDay[to];
      if (!rhs) return null;
      return {
        rate: 1 / rhs.rate,
        source: rhs.source,
        asOf: rhs.asOf,
        stale: !!stale
      };
    }

    if (to === BASE) {
      const lhs = storeDay[from];
      if (!lhs) return null;
      return {
        rate: lhs.rate,
        source: lhs.source,
        asOf: lhs.asOf,
        stale: !!stale
      };
    }

    // Cross rate: FROM -> ILS -> TO
    const lhs = storeDay[from];
    const rhs = storeDay[to];
    if (!lhs || !rhs) return null;
    return {
      rate: lhs.rate / rhs.rate,
      source: `${lhs.source}+${rhs.source}/ILS`,
      asOf: lhs.asOf < rhs.asOf ? lhs.asOf : rhs.asOf,
      stale: !!stale
    };
  }

  /**
   * Synthesize a full-day store by walking backward when a ccy is missing.
   */
  function buildStoreForDate(date) {
    const day = rateStore.get(date) || {};
    const out = {};
    let anyStale = false;

    for (const code of SUPPORTED) {
      if (code === BASE) { out[BASE] = { rate: 1, source: 'BASE', asOf: date }; continue; }
      if (day[code]) { out[code] = day[code]; continue; }
      const fallback = findLatestRateOnOrBefore(code, addDays(date, -1), 14);
      if (fallback) {
        out[code] = { rate: fallback.rate, source: `${fallback.source}:stale`, asOf: fallback.date };
        anyStale = true;
      }
    }
    return { store: out, anyStale };
  }

  /**
   * Stale detector: compare asOf to date and threshold (hours).
   */
  function isStale(asOf, nowIso, thresholdHours) {
    if (!asOf) return true;
    const asOfD = parseIsoDate(asOf);
    const nowD  = parseIsoDate(nowIso);
    const diffH = Math.abs(nowD.getTime() - asOfD.getTime()) / (1000 * 60 * 60);
    return diffH > thresholdHours;
  }

  /**
   * Main rate lookup — obeys source hierarchy, triangulates via ILS,
   * returns { rate, source, asOf, stale, direction }.
   */
  function getRate(from, to, date) {
    const f = ensureCcy(from);
    const t = ensureCcy(to);
    const d = dateKey(date);
    const cacheKey = `${f}|${t}|${d}`;

    const cached = lookupCache.get(cacheKey);
    if (cached) {
      stats.hits += 1;
      return { ...cached };
    }
    stats.misses += 1;

    // 1) same currency
    if (f === t) {
      const r = { rate: 1, source: 'IDENTITY', asOf: d, stale: false, direction: 'identity' };
      lookupCache.set(cacheKey, r);
      return r;
    }

    // 2) override (direct pair)
    const override = getOverride(f, t, d);
    if (override) {
      const r = {
        rate: override.rate,
        source: override.inverse ? 'OVERRIDE_INV' : 'OVERRIDE',
        asOf: d,
        stale: false,
        direction: override.inverse ? 'inverse' : 'direct'
      };
      lookupCache.set(cacheKey, r);
      return r;
    }

    // 3) BoI store (possibly with stale fallback)
    const { store, anyStale } = buildStoreForDate(d);
    const derived = derivePairFromIlsBase(f, t, store, anyStale);
    if (derived) {
      // Compute staleness from asOf
      const staleByTime = derived.asOf
        ? isStale(derived.asOf, d, config.staleHours)
        : true;
      const result = {
        rate:   derived.rate,
        source: derived.source,
        asOf:   derived.asOf || d,
        stale:  !!derived.stale || staleByTime,
        direction: f === BASE || t === BASE ? 'direct' : 'triangle'
      };
      if (result.stale) stats.stale += 1;
      lookupCache.set(cacheKey, result);
      return result;
    }

    // 4) Triangulate via USD when ILS path is unavailable (extreme fallback)
    if (f !== 'USD' && t !== 'USD') {
      const a = findLatestRateOnOrBefore('USD', d, 14);
      if (a) {
        // We have USD→ILS, but we're missing one of our legs.
        // Try pair via overrides or deeper historic lookups.
        const leg1 = findLatestRateOnOrBefore(f, d, 14);
        const leg2 = findLatestRateOnOrBefore(t, d, 14);
        if (leg1 && leg2) {
          // rate(FROM→TO) = leg1.rate / leg2.rate   (both ILS per 1 unit)
          const r = {
            rate: leg1.rate / leg2.rate,
            source: `${leg1.source}+${leg2.source}/ILS-HIST`,
            asOf: leg1.date < leg2.date ? leg1.date : leg2.date,
            stale: true,
            direction: 'triangle-hist'
          };
          stats.stale += 1;
          lookupCache.set(cacheKey, r);
          return r;
        }
      }
    }

    throw new FxError(
      'RATE_NOT_FOUND',
      `No FX rate for ${f}->${t} on ${d}`,
      `אין שער חליפין עבור ${f}->${t} בתאריך ${d}`,
      { from: f, to: t, date: d }
    );
  }

  /**
   * Convert an amount. Rounding applied per TARGET currency convention.
   */
  function convert(amount, from, to, date) {
    if (typeof amount !== 'number' || !isFinite(amount)) {
      throw new FxError('BAD_AMOUNT', 'Amount must be finite number', 'סכום חייב להיות מספר תקין', { amount });
    }
    const f = ensureCcy(from);
    const t = ensureCcy(to);
    const info = getRate(f, t, date);
    const raw = amount * info.rate;
    const converted = round(raw, t);
    return {
      amount,
      from: f,
      to: t,
      rate: info.rate,
      converted,
      source: info.source,
      asOf: info.asOf,
      stale: info.stale,
      direction: info.direction
    };
  }

  /**
   * Revalue a set of open monetary positions per IAS 21.
   * position: { id?, currency, amount, bookRateIls?, bookValueIls? }
   * - bookValueIls: historic ILS value booked at entry date
   * - bookRateIls:  historic rate (ILS per 1 foreign) if known
   *
   * Result per position:
   *   { ...pos, closingRate, closingValueIls, unrealizedIls, stale }
   * Plus aggregate totals by currency and grand total in ILS.
   */
  function revalue(positions, asOfDate) {
    if (!Array.isArray(positions)) {
      throw new FxError('BAD_POSITIONS', 'positions must be array', 'רשימת פוזיציות חייבת להיות מערך');
    }
    const date = dateKey(asOfDate);
    const lines = [];
    const byCcy = {};
    let grandUnrealizedIls = 0;
    let anyStale = false;

    for (const p of positions) {
      if (!p || typeof p !== 'object') continue;
      const ccy = ensureCcy(p.currency);
      const amt = Number(p.amount);
      if (!isFinite(amt)) continue;

      const info = getRate(ccy, BASE, date);
      const closingValueIls = round(amt * info.rate, BASE);

      let book;
      if (typeof p.bookValueIls === 'number' && isFinite(p.bookValueIls)) {
        book = p.bookValueIls;
      } else if (typeof p.bookRateIls === 'number' && isFinite(p.bookRateIls)) {
        book = round(amt * p.bookRateIls, BASE);
      } else {
        // Without history we can only mark to market; unrealized = 0
        book = closingValueIls;
      }

      const unrealized = round(closingValueIls - book, BASE);
      grandUnrealizedIls = round(grandUnrealizedIls + unrealized, BASE);
      if (info.stale) anyStale = true;

      const line = {
        ...p,
        currency: ccy,
        amount: amt,
        closingRateIls: info.rate,
        closingValueIls,
        bookValueIls: book,
        unrealizedIls: unrealized,
        source: info.source,
        asOf: info.asOf,
        stale: !!info.stale
      };
      lines.push(line);

      if (!byCcy[ccy]) byCcy[ccy] = { currency: ccy, amount: 0, closingValueIls: 0, unrealizedIls: 0 };
      byCcy[ccy].amount = round(byCcy[ccy].amount + amt, ccy);
      byCcy[ccy].closingValueIls = round(byCcy[ccy].closingValueIls + closingValueIls, BASE);
      byCcy[ccy].unrealizedIls = round(byCcy[ccy].unrealizedIls + unrealized, BASE);
    }

    return {
      asOf: date,
      lines,
      byCurrency: Object.values(byCcy),
      totalUnrealizedIls: grandUnrealizedIls,
      stale: anyStale,
      // IAS 21 cue: unrealized FX is reported P&L in period incurred.
      taxNotice: {
        en: 'Unrealized FX gains/losses are taxable in the period incurred per IAS 21 and Israeli tax practice.',
        he: 'רווחי והפסדי שער לא-ממומשים חייבים במס בתקופה בה נוצרו בהתאם ל-IAS 21 ולנוהלי מס הכנסה בישראל.'
      }
    };
  }

  /**
   * Fetch latest BoI XML and load it (safe — only runs if fetcher provided).
   * Returns the loadRates() outcome or throws a wrapped FxError.
   */
  async function refreshFromBoi(signal) {
    try {
      stats.fetches += 1;
      const xml = await config.fetcher(config.boiUrl, signal);
      const outcome = loadRates(xml);
      return outcome;
    } catch (err) {
      if (err instanceof FxError) throw err;
      throw new FxError('BOI_FETCH', `BoI fetch failed: ${err.message}`, `כשל באחזור נתוני בנק ישראל: ${err.message}`, err);
    }
  }

  function cacheStats() {
    return {
      size: lookupCache.size(),
      hits: stats.hits,
      misses: stats.misses,
      overrides: stats.overrides,
      fetches: stats.fetches,
      stale: stats.stale,
      rateDays: rateStore.size,
      overrideDays: overrideStore.size
    };
  }

  function listCurrencies() {
    return SUPPORTED.slice();
  }

  function describeCurrency(code) {
    const c = ensureCcy(code);
    return { ...CURRENCIES[c] };
  }

  function dumpRates(date) {
    const d = dateKey(date);
    const day = rateStore.get(d);
    return day ? JSON.parse(JSON.stringify(day)) : {};
  }

  /* auto-fetch on boot (opt-in) */
  if (config.autoFetch && typeof config.fetcher === 'function') {
    refreshFromBoi().catch((err) => log('warn', 'fx-engine autoFetch failed', err));
  }

  return {
    /* lookup API */
    getRate,
    convert,
    revalue,

    /* management API */
    loadRates,
    setOverride,
    refreshFromBoi,
    purgeExpired,

    /* introspection */
    cacheStats,
    listCurrencies,
    describeCurrency,
    dumpRates,

    /* utility — exposed for tests / debugging */
    _internal: {
      round,
      parseBoiXml,
      currentRateDate,
      lastTradingDay,
      isIsraeliWeekend,
      jerusalemDateStr,
      parseIsoDate,
      addDays,
      makeLruCache,
      FxError,
      CURRENCIES,
      SUPPORTED
    }
  };
}

/* ----------------------------------------------------------------------------
 * Module exports
 * -------------------------------------------------------------------------- */
module.exports = {
  createFxEngine,
  FxError,
  CURRENCIES,
  SUPPORTED,
  BASE,
  parseBoiXml,
  // exposed helpers for co-located utilities / tests
  round,
  currentRateDate,
  lastTradingDay,
  isIsraeliWeekend,
  jerusalemDateStr,
  parseIsoDate,
  addDays
};
