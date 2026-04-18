/**
 * ERP Chatbot Engine — Agent X-18 (Swarm 3)
 * Techno-Kol Uzi Mega-ERP (Kobi 2026)
 *
 * Rule-based, bilingual (Hebrew RTL + English), zero-dependency
 * natural-language front-end for ERP queries of the form:
 *
 *   "show me invoices over 5000 from last month"
 *   "הצג חשבוניות מעל 5000 מחודש שעבר"
 *   "מה היתרה של הלקוח אבישי?"
 *   "report revenue Q1"
 *
 * The engine takes a free-text user message + optional session
 * context, classifies it into one of a fixed set of intents,
 * extracts structured entities (amounts, dates, names, categories),
 * builds a parameterised SQL query, pretends to run it through an
 * injected `dataSource`, and then composes a bilingual natural-
 * language response with a small sample (≤5 rows), a row count, and
 * contextual follow-up suggestions.
 *
 * Design constraints (non-negotiable):
 *   • NEVER delete user data — the chatbot is strictly read / create,
 *     no DELETE, DROP, TRUNCATE, or UPDATE intents are exposed.
 *   • Hebrew RTL bilingual — every intent and every response has both
 *     a Hebrew and an English branch; language is auto-detected from
 *     the user message.
 *   • Zero external dependencies — pure ES2020 JS, no npm installs.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Public API
 * ─────────────────────────────────────────────────────────────────────
 *   createChatbot(dataSource, opts?) → Chatbot
 *
 *   chatbot.process(message, context?) → {
 *     intent, entities, language, response, query?, params?,
 *     results?, count?, suggestions[]
 *   }
 *
 *   chatbot.clearContext(sessionId)          → void
 *   chatbot.getContext(sessionId)            → context snapshot
 *   chatbot.registerIntent(name, patterns, handler) → void
 *   chatbot.listIntents()                    → string[]
 *
 * ─────────────────────────────────────────────────────────────────────
 * dataSource contract
 * ─────────────────────────────────────────────────────────────────────
 *   dataSource is an object of the shape:
 *     {
 *       query(sql, params) → { rows: Array<object>, count?: number }
 *         // sync OR returning a thenable; both are accepted
 *     }
 *
 *   The engine NEVER concatenates user input into SQL. All values
 *   appear in `params` only; the SQL uses `$1`, `$2` … placeholders.
 *   The test suite verifies this property.
 *
 * Exports:
 *   createChatbot
 *   detectLanguage                (helper, exported for tests)
 *   parseAmount                   (helper, exported for tests)
 *   parseDate                     (helper, exported for tests)
 *   classifyIntent                (helper, exported for tests)
 *   INTENTS                       (canonical list)
 *   _resetForTests                (wipes module-level state)
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────
// 1. Canonical intents
// ─────────────────────────────────────────────────────────────────────
const INTENTS = Object.freeze({
  SHOW_INVOICES:    'show_invoices',
  SHOW_PAYMENTS:    'show_payments',
  SHOW_CLIENTS:     'show_clients',
  SHOW_VENDORS:     'show_vendors',
  SHOW_INVENTORY:   'show_inventory',
  CREATE_INVOICE:   'create_invoice',
  CREATE_QUOTE:     'create_quote',
  CREATE_PO:        'create_po',
  REPORT_REVENUE:   'report_revenue',
  REPORT_EXPENSES:  'report_expenses',
  REPORT_PROFIT:    'report_profit',
  REPORT_CASH:      'report_cash',
  CHECK_BALANCE:    'check_balance',
  CHECK_STOCK:      'check_stock',
  CHECK_EMPLOYEE:   'check_employee',
  HELP:             'help',
  GREET:            'greet',
  THANKS:           'thanks',
  UNKNOWN:          'unknown',
});

// ─────────────────────────────────────────────────────────────────────
// 2. Intent pattern catalogue
// Patterns are RegExp in both Hebrew and English; the first matching
// pattern wins, higher-priority intents (create_*, check_*, report_*)
// are tested before their more generic show_* / help counterparts.
// ─────────────────────────────────────────────────────────────────────
const HE = 'he';
const EN = 'en';

function re(src, flags) { return new RegExp(src, flags || 'i'); }

const BASE_PATTERNS = [
  // thanks — handled first so "thanks, show me invoices" is still thanks
  { intent: INTENTS.THANKS, priority: 100, patterns: [
    re('\\b(thanks|thank you|thx|ty)\\b'),
    re('(תודה|תודה רבה|אחלה|יופי)'),
  ]},

  // greet
  { intent: INTENTS.GREET, priority: 95, patterns: [
    re('\\b(hi|hello|hey|good (morning|afternoon|evening))\\b'),
    re('(שלום|היי|בוקר טוב|ערב טוב|הלו)'),
  ]},

  // help
  { intent: INTENTS.HELP, priority: 90, patterns: [
    re('\\b(help|what can you do|commands?|options?)\\b'),
    re('(עזרה|מה אתה יודע|מה תפריט|פקודות)'),
  ]},

  // create_quote — tested before create_invoice so "quote" wins
  { intent: INTENTS.CREATE_QUOTE, priority: 85, patterns: [
    re('\\b(create|new|make|draft)\\s+(a\\s+)?quote\\b'),
    re('\\b(price quote|quotation)\\b'),
    re('(צור|חדש|הפק)\\s*הצעת\\s*מחיר'),
  ]},

  // create_po — tested before create_invoice
  { intent: INTENTS.CREATE_PO, priority: 84, patterns: [
    re('\\b(create|new|make|draft)\\s+(a\\s+)?(po|purchase\\s*order)\\b'),
    re('(צור|חדש|הפק)\\s*הזמנת\\s*רכש'),
  ]},

  // create_invoice
  { intent: INTENTS.CREATE_INVOICE, priority: 80, patterns: [
    re('\\b(create|new|make|draft|issue)\\s+(a(n)?\\s+)?invoice\\b'),
    re('(צור|חדש|הפק|הוצא)\\s*חשבונית'),
  ]},

  // report_revenue
  { intent: INTENTS.REPORT_REVENUE, priority: 75, patterns: [
    re('\\b(revenue|sales|income|turnover)\\b.*\\b(report|summary|total)?\\b'),
    re('\\b(report|show)\\s+(revenue|sales|income)\\b'),
    re('(דו"?ח\\s*)?הכנסות'),
    re('(מחזור|מכירות)'),
  ]},

  // report_expenses
  { intent: INTENTS.REPORT_EXPENSES, priority: 74, patterns: [
    re('\\b(expenses?|costs?|spending|spend)\\b'),
    re('(הוצאות|עלויות)'),
  ]},

  // report_profit
  { intent: INTENTS.REPORT_PROFIT, priority: 73, patterns: [
    re('\\b(profit|margin|net\\s*income|bottom\\s*line)\\b'),
    re('(רווח|רווחיות|שורה\\s*תחתונה)'),
  ]},

  // report_cash
  { intent: INTENTS.REPORT_CASH, priority: 72, patterns: [
    re('\\b(cash(\\s*flow)?|liquidity|bank\\s*balance)\\b'),
    re('(תזרים|מזומנים|יתרה\\s*בבנק)'),
  ]},

  // check_balance
  { intent: INTENTS.CHECK_BALANCE, priority: 70, patterns: [
    re('\\b(balance|owed|outstanding|debt)\\b'),
    re('(יתרה|חוב|חייב|לתשלום)'),
  ]},

  // check_stock — narrower than show_inventory; requires an explicit
  // question/quantity phrase, not the bare word "מלאי" (which is
  // already handled by show_inventory with its "הצג" prefix).
  { intent: INTENTS.CHECK_STOCK, priority: 69, patterns: [
    re('\\b(stock|inventory\\s+level|how many .* in stock|qty)\\b'),
    re('(כמה\\s*יש|כמות\\s*במלאי|בדוק\\s*מלאי|יתרת\\s*מלאי)'),
  ]},

  // check_employee
  { intent: INTENTS.CHECK_EMPLOYEE, priority: 68, patterns: [
    re('\\b(employee|staff|worker|payroll status|salary of)\\b'),
    re('(עובד|עובדת|שכר\\s*של|כוח\\s*אדם)'),
  ]},

  // show_invoices
  { intent: INTENTS.SHOW_INVOICES, priority: 60, patterns: [
    re('\\b(show|list|display|find|get)\\s+(me\\s+)?(the\\s+)?invoices?\\b'),
    re('\\binvoices?\\b.*\\b(over|above|under|below|from|last|this)\\b'),
    re('(הצג|הראה|תן לי)\\s*חשבוניות'),
    re('חשבוניות'),
  ]},

  // show_payments
  { intent: INTENTS.SHOW_PAYMENTS, priority: 59, patterns: [
    re('\\b(show|list|display|find|get)\\s+(me\\s+)?(the\\s+)?payments?\\b'),
    re('\\bpayments?\\b'),
    re('(הצג|הראה)\\s*תשלומים'),
    re('תשלומים'),
  ]},

  // show_clients
  { intent: INTENTS.SHOW_CLIENTS, priority: 58, patterns: [
    re('\\b(show|list|display|find|get)\\s+(me\\s+)?(the\\s+)?clients?\\b'),
    re('\\b(clients?|customers?)\\b'),
    re('(הצג|הראה)\\s*לקוחות'),
    re('לקוחות'),
  ]},

  // show_vendors
  { intent: INTENTS.SHOW_VENDORS, priority: 57, patterns: [
    re('\\b(show|list|display|find|get)\\s+(me\\s+)?(the\\s+)?(vendors?|suppliers?)\\b'),
    re('\\b(vendor|supplier)\\b'),
    re('(הצג|הראה)\\s*ספקים'),
    re('ספקים'),
  ]},

  // show_inventory
  { intent: INTENTS.SHOW_INVENTORY, priority: 56, patterns: [
    re('\\b(show|list|display)\\s+(me\\s+)?(the\\s+)?inventory\\b'),
    re('\\binventory\\b'),
    re('(הצג|הראה)\\s*(מלאי|פריטים)'),
    re('מלאי'),
  ]},
];

// ─────────────────────────────────────────────────────────────────────
// 3. Language detection (Hebrew if it contains any Hebrew letter)
// ─────────────────────────────────────────────────────────────────────
function detectLanguage(message) {
  if (typeof message !== 'string' || message.length === 0) return EN;
  // Hebrew block: U+0590..U+05FF
  return /[\u0590-\u05FF]/.test(message) ? HE : EN;
}

// ─────────────────────────────────────────────────────────────────────
// 4. Intent classifier
// ─────────────────────────────────────────────────────────────────────
function classifyIntent(message, extraPatterns) {
  if (typeof message !== 'string' || message.trim().length === 0) {
    return { intent: INTENTS.UNKNOWN, confidence: 0, matched: null };
  }
  const all = (extraPatterns || []).concat(BASE_PATTERNS);
  // higher priority first
  const sorted = all.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));
  for (const entry of sorted) {
    for (const p of entry.patterns) {
      if (p.test(message)) {
        return {
          intent: entry.intent,
          confidence: 90,
          matched: p.source,
        };
      }
    }
  }
  return { intent: INTENTS.UNKNOWN, confidence: 0, matched: null };
}

// ─────────────────────────────────────────────────────────────────────
// 5. Amount parser
//    supports: "5000", "5,000", "over 5000", "above 10k", "מעל 5000",
//              "under 200", "below 1m", "בין 1000 ל-5000",
//              "between 1000 and 5000", "מתחת ל-500"
// ─────────────────────────────────────────────────────────────────────
const NUMBER_RX = /(\d[\d,.]*)(\s*)(k|m|ק|מ)?/i;

function numToken(tok) {
  if (tok == null) return null;
  let s = String(tok).trim().replace(/,/g, '');
  let mult = 1;
  // Only ASCII k/m are allowed as magnitude suffixes — the Hebrew
  // letters ק/מ would collide with the words "מעל" / "מתחת" / etc.
  const m = s.match(/^([\d.]+)\s*(k|m)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const suf = (m[2] || '').toLowerCase();
  if (suf === 'k') mult = 1_000;
  else if (suf === 'm') mult = 1_000_000;
  return n * mult;
}

function parseAmount(message) {
  if (typeof message !== 'string') return null;
  const m = message;

  // A digit group followed by optional k/m, BUT the suffix must NOT be
  // followed by another digit or word-char (otherwise "5000 מעל" would
  // consume the ASCII "m" of a following English word). We also refuse
  // to swallow Hebrew letters as suffix — see numToken.
  const NUM = '(\\d[\\d,.]*)(?:\\s*([kmKM])(?=\\b|\\s|$))?';

  // between X and Y
  let rx = new RegExp('between\\s+' + NUM + '\\s+and\\s+' + NUM, 'i');
  let mm = m.match(rx);
  if (mm) {
    const a = numToken(mm[1] + (mm[2] || ''));
    const b = numToken(mm[3] + (mm[4] || ''));
    if (a != null && b != null) return { op: 'between', min: Math.min(a, b), max: Math.max(a, b) };
  }
  // בין X ל-Y  (Hebrew) — no Hebrew suffix allowed
  rx = /בין\s+(\d[\d,.]*)\s*(?:ל|ל-|ל\s*)\s*(\d[\d,.]*)/;
  mm = m.match(rx);
  if (mm) {
    const a = numToken(mm[1]);
    const b = numToken(mm[2]);
    if (a != null && b != null) return { op: 'between', min: Math.min(a, b), max: Math.max(a, b) };
  }

  // over / above / more than / greater than X
  rx = new RegExp('(?:over|above|more than|greater than|>\\s*=?)\\s*' + NUM, 'i');
  mm = m.match(rx);
  if (mm) {
    const v = numToken(mm[1] + (mm[2] || ''));
    if (v != null) return { op: 'gt', value: v };
  }
  // מעל / יותר מ / גדול מ  (Hebrew) — no k/m suffix parsed here
  rx = /(?:מעל|יותר\s*מ-?|גדול\s*מ-?)\s*(\d[\d,.]*)/;
  mm = m.match(rx);
  if (mm) {
    const v = numToken(mm[1]);
    if (v != null) return { op: 'gt', value: v };
  }

  // under / below / less than X
  rx = new RegExp('(?:under|below|less than|<\\s*=?)\\s*' + NUM, 'i');
  mm = m.match(rx);
  if (mm) {
    const v = numToken(mm[1] + (mm[2] || ''));
    if (v != null) return { op: 'lt', value: v };
  }
  // מתחת ל- / פחות מ  (Hebrew)
  rx = /(?:מתחת\s*ל-?|פחות\s*מ-?|קטן\s*מ-?)\s*(\d[\d,.]*)/;
  mm = m.match(rx);
  if (mm) {
    const v = numToken(mm[1]);
    if (v != null) return { op: 'lt', value: v };
  }

  // bare number — take the first number we can find, treat as "equals"
  rx = new RegExp(NUM);
  mm = m.match(rx);
  if (mm) {
    const v = numToken(mm[1] + (mm[2] || ''));
    if (v != null) return { op: 'eq', value: v };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// 6. Date parser
//    "today", "yesterday", "this week", "last week", "this month",
//    "last month", "this year", "last year", "this quarter",
//    "last quarter", "Q1..Q4", "YYYY", "YYYY-MM", "YYYY-MM-DD",
//    Hebrew: היום, אתמול, השבוע, שבוע שעבר, החודש, חודש שעבר,
//    השנה, שנה שעברה, הרבעון, רבעון שעבר, ברבעון הזה
// ─────────────────────────────────────────────────────────────────────
function ymd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function endOfDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}
function addDays(d, n) {
  const c = new Date(d.getTime());
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}
function startOfMonth(year, monthIdx) {
  return new Date(Date.UTC(year, monthIdx, 1));
}
function endOfMonth(year, monthIdx) {
  return new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59, 999));
}
function startOfYear(year) {
  return new Date(Date.UTC(year, 0, 1));
}
function endOfYear(year) {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
}
function startOfQuarter(year, q) {
  const m = (q - 1) * 3;
  return new Date(Date.UTC(year, m, 1));
}
function endOfQuarter(year, q) {
  const m = q * 3 - 1;
  return new Date(Date.UTC(year, m + 1, 0, 23, 59, 59, 999));
}

function parseDate(message, now) {
  if (typeof message !== 'string') return null;
  const clock = now instanceof Date ? now : new Date();
  const y = clock.getUTCFullYear();
  const m = clock.getUTCMonth();
  const curQuarter = Math.floor(m / 3) + 1;

  // explicit YYYY-MM-DD
  let mm = message.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (mm) {
    const d = new Date(Date.UTC(+mm[1], +mm[2] - 1, +mm[3]));
    return { label: mm[0], from: ymd(startOfDay(d)), to: ymd(endOfDay(d)) };
  }
  // explicit YYYY-MM
  mm = message.match(/\b(\d{4})-(\d{2})\b/);
  if (mm) {
    const year = +mm[1]; const monIdx = +mm[2] - 1;
    return {
      label: mm[0],
      from: ymd(startOfMonth(year, monIdx)),
      to:   ymd(endOfMonth(year, monIdx)),
    };
  }
  // Q1..Q4 with optional year — checked BEFORE bare YYYY
  // otherwise "Q4 2025" would greedy-match the year first.
  mm = message.match(/\bQ([1-4])(?:\s+(\d{4}))?\b/i);
  if (mm) {
    const q = +mm[1]; const year = mm[2] ? +mm[2] : y;
    return { label: `Q${q} ${year}`, from: ymd(startOfQuarter(year, q)), to: ymd(endOfQuarter(year, q)) };
  }
  // Hebrew Q1..Q4
  mm = message.match(/רבעון\s*([1-4])/);
  if (mm) {
    const q = +mm[1];
    return { label: `רבעון ${q} ${y}`, from: ymd(startOfQuarter(y, q)), to: ymd(endOfQuarter(y, q)) };
  }
  // explicit YYYY (after Q-pattern so "Q4 2025" is already handled)
  mm = message.match(/\b(20\d{2})\b/);
  if (mm) {
    const year = +mm[1];
    return { label: mm[0], from: ymd(startOfYear(year)), to: ymd(endOfYear(year)) };
  }

  // relative English
  if (/\btoday\b/i.test(message)) {
    return { label: 'today', from: ymd(startOfDay(clock)), to: ymd(endOfDay(clock)) };
  }
  if (/\byesterday\b/i.test(message)) {
    const d = addDays(clock, -1);
    return { label: 'yesterday', from: ymd(startOfDay(d)), to: ymd(endOfDay(d)) };
  }
  if (/\bthis\s+week\b/i.test(message)) {
    const dow = clock.getUTCDay(); // 0=Sun
    const start = startOfDay(addDays(clock, -dow));
    const end   = endOfDay(addDays(start, 6));
    return { label: 'this week', from: ymd(start), to: ymd(end) };
  }
  if (/\blast\s+week\b/i.test(message)) {
    const dow = clock.getUTCDay();
    const start = startOfDay(addDays(clock, -dow - 7));
    const end   = endOfDay(addDays(start, 6));
    return { label: 'last week', from: ymd(start), to: ymd(end) };
  }
  if (/\bthis\s+month\b/i.test(message)) {
    return { label: 'this month', from: ymd(startOfMonth(y, m)), to: ymd(endOfMonth(y, m)) };
  }
  if (/\blast\s+month\b/i.test(message)) {
    const pm = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    return { label: 'last month', from: ymd(startOfMonth(py, pm)), to: ymd(endOfMonth(py, pm)) };
  }
  if (/\bthis\s+quarter\b/i.test(message)) {
    return { label: 'this quarter', from: ymd(startOfQuarter(y, curQuarter)), to: ymd(endOfQuarter(y, curQuarter)) };
  }
  if (/\blast\s+quarter\b/i.test(message)) {
    const lq = curQuarter === 1 ? 4 : curQuarter - 1;
    const ly = curQuarter === 1 ? y - 1 : y;
    return { label: 'last quarter', from: ymd(startOfQuarter(ly, lq)), to: ymd(endOfQuarter(ly, lq)) };
  }
  if (/\bthis\s+year\b/i.test(message)) {
    return { label: 'this year', from: ymd(startOfYear(y)), to: ymd(endOfYear(y)) };
  }
  if (/\blast\s+year\b/i.test(message)) {
    return { label: 'last year', from: ymd(startOfYear(y - 1)), to: ymd(endOfYear(y - 1)) };
  }

  // relative Hebrew — note: JS \b does NOT behave as a word boundary
  // for Hebrew letters, so we use explicit token-edge lookarounds or
  // substring checks instead. Order matters: "שבוע שעבר" must be
  // tested BEFORE the standalone "השבוע" check.
  if (/היום/.test(message)) {
    return { label: 'היום', from: ymd(startOfDay(clock)), to: ymd(endOfDay(clock)) };
  }
  if (/אתמול/.test(message)) {
    const d = addDays(clock, -1);
    return { label: 'אתמול', from: ymd(startOfDay(d)), to: ymd(endOfDay(d)) };
  }
  if (/(שבוע\s*שעבר|שבוע\s*קודם)/.test(message)) {
    const dow = clock.getUTCDay();
    const start = startOfDay(addDays(clock, -dow - 7));
    const end   = endOfDay(addDays(start, 6));
    return { label: 'שבוע שעבר', from: ymd(start), to: ymd(end) };
  }
  if (/(השבוע|בשבוע\s*הזה)/.test(message)) {
    const dow = clock.getUTCDay();
    const start = startOfDay(addDays(clock, -dow));
    const end   = endOfDay(addDays(start, 6));
    return { label: 'השבוע', from: ymd(start), to: ymd(end) };
  }
  if (/(חודש\s*שעבר|חודש\s*קודם)/.test(message)) {
    const pm = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    return { label: 'חודש שעבר', from: ymd(startOfMonth(py, pm)), to: ymd(endOfMonth(py, pm)) };
  }
  if (/(החודש|בחודש\s*הזה)/.test(message)) {
    return { label: 'החודש', from: ymd(startOfMonth(y, m)), to: ymd(endOfMonth(y, m)) };
  }
  if (/(רבעון\s*שעבר|רבעון\s*קודם)/.test(message)) {
    const lq = curQuarter === 1 ? 4 : curQuarter - 1;
    const ly = curQuarter === 1 ? y - 1 : y;
    return { label: 'רבעון שעבר', from: ymd(startOfQuarter(ly, lq)), to: ymd(endOfQuarter(ly, lq)) };
  }
  if (/(הרבעון|ברבעון\s*הזה)/.test(message)) {
    return { label: 'הרבעון', from: ymd(startOfQuarter(y, curQuarter)), to: ymd(endOfQuarter(y, curQuarter)) };
  }
  if (/(שנה\s*שעברה|שנה\s*קודם)/.test(message)) {
    return { label: 'שנה שעברה', from: ymd(startOfYear(y - 1)), to: ymd(endOfYear(y - 1)) };
  }
  if (/(השנה|בשנה\s*הזו)/.test(message)) {
    return { label: 'השנה', from: ymd(startOfYear(y)), to: ymd(endOfYear(y)) };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// 7. Name extraction (fuzzy) + category extraction
//    We look for quoted strings, capitalised words, or known lists
//    stored on the chatbot instance (clients / vendors / employees).
// ─────────────────────────────────────────────────────────────────────
function normalize(s) {
  return String(s || '').toLowerCase().trim();
}

function editDistance(a, b) {
  // classic Levenshtein, iterative DP, zero-dep
  a = normalize(a); b = normalize(b);
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const prev = new Array(bl + 1);
  const cur  = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    cur[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bl; j++) prev[j] = cur[j];
  }
  return prev[bl];
}

function fuzzyFind(needle, haystack) {
  if (!needle || !Array.isArray(haystack) || haystack.length === 0) return null;
  const n = normalize(needle);
  let best = null;
  for (const item of haystack) {
    const name = typeof item === 'string' ? item : (item && item.name) || '';
    const nm = normalize(name);
    if (!nm) continue;
    if (nm === n || nm.includes(n) || n.includes(nm)) {
      return { item, score: 100, name };
    }
    const maxLen = Math.max(nm.length, n.length);
    if (maxLen === 0) continue;
    const dist = editDistance(nm, n);
    const score = Math.round(((maxLen - dist) / maxLen) * 100);
    if (!best || score > best.score) best = { item, score, name };
  }
  if (best && best.score >= 70) return best;
  return null;
}

function extractName(message, lists) {
  if (typeof message !== 'string') return null;

  // 1. Quoted names "..." or '...' or “...”
  const q = message.match(/["'“]([^"'”]{2,})["'”]/);
  if (q) return { name: q[1].trim(), source: 'quoted' };

  // 2. Known lists (fuzzy)
  if (lists) {
    for (const listName of ['clients', 'vendors', 'employees']) {
      const list = lists[listName];
      if (Array.isArray(list) && list.length > 0) {
        // try per-token match
        const tokens = message.split(/\s+/).filter(t => t.length >= 2);
        for (let size = Math.min(3, tokens.length); size >= 1; size--) {
          for (let i = 0; i + size <= tokens.length; i++) {
            const phrase = tokens.slice(i, i + size).join(' ');
            const hit = fuzzyFind(phrase, list);
            if (hit && hit.score >= 75) {
              return { name: hit.name, source: listName, score: hit.score };
            }
          }
        }
      }
    }
  }
  return null;
}

function extractCategory(message) {
  const m = message || '';
  const map = [
    { re: /(דלק|fuel|gas(oline)?|petrol)/i,           cat: 'fuel' },
    { re: /(מזון|food|grocer(y|ies))/i,                cat: 'food' },
    { re: /(משרד|office|stationery)/i,                 cat: 'office' },
    { re: /(תקשורת|telecom|phone|cell(ular)?)/i,       cat: 'telecom' },
    { re: /(שכר|payroll|salary|wage)/i,                cat: 'payroll' },
    { re: /(ארנונה|arnona|property\s*tax)/i,           cat: 'arnona' },
    { re: /(אחזקה|maintenance|repair)/i,               cat: 'maintenance' },
    { re: /(חשמל|electric(ity)?|מים|water|utilit(y|ies))/i, cat: 'utilities' },
    { re: /(מסעדות?|restaurant|dining)/i,              cat: 'restaurant' },
    { re: /(קמעונאות|retail|store)/i,                  cat: 'retail' },
  ];
  for (const r of map) {
    if (r.re.test(m)) return r.cat;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// 8. SQL builders (parameterised, read-only)
// ─────────────────────────────────────────────────────────────────────
function buildListQuery(table, entities, orderBy) {
  const where = [];
  const params = [];
  let i = 0;

  if (entities && entities.amount) {
    const a = entities.amount;
    if (a.op === 'gt')      { where.push(`total > $${++i}`); params.push(a.value); }
    else if (a.op === 'lt') { where.push(`total < $${++i}`); params.push(a.value); }
    else if (a.op === 'eq') { where.push(`total = $${++i}`); params.push(a.value); }
    else if (a.op === 'between') {
      where.push(`total BETWEEN $${++i} AND $${++i}`);
      params.push(a.min, a.max);
    }
  }
  if (entities && entities.date) {
    where.push(`issued_at >= $${++i}`);
    params.push(entities.date.from);
    where.push(`issued_at <= $${++i}`);
    params.push(entities.date.to);
  }
  if (entities && entities.name && entities.name.name) {
    where.push(`name = $${++i}`);
    params.push(entities.name.name);
  }
  if (entities && entities.category) {
    where.push(`category = $${++i}`);
    params.push(entities.category);
  }

  let sql = `SELECT * FROM ${table}`;
  if (where.length > 0) sql += ` WHERE ${where.join(' AND ')}`;
  if (orderBy) sql += ` ORDER BY ${orderBy}`;
  sql += ` LIMIT 5`;
  return { sql, params };
}

function buildAggregateQuery(table, column, entities, kind) {
  const where = [];
  const params = [];
  let i = 0;
  if (entities && entities.date) {
    where.push(`issued_at >= $${++i}`);
    params.push(entities.date.from);
    where.push(`issued_at <= $${++i}`);
    params.push(entities.date.to);
  }
  if (entities && entities.category) {
    where.push(`category = $${++i}`);
    params.push(entities.category);
  }
  const op = kind === 'count' ? 'COUNT(*)' : `SUM(${column})`;
  let sql = `SELECT ${op} AS value FROM ${table}`;
  if (where.length > 0) sql += ` WHERE ${where.join(' AND ')}`;
  return { sql, params };
}

// ─────────────────────────────────────────────────────────────────────
// 9. Response templates (bilingual)
// ─────────────────────────────────────────────────────────────────────
const RESP = {
  greet: {
    he: 'שלום! אני העוזר הדיגיטלי של Techno-Kol. איך אפשר לעזור?',
    en: 'Hi! I am the Techno-Kol assistant. How can I help?',
  },
  thanks: {
    he: 'בשמחה! יש עוד משהו שאפשר לברר?',
    en: 'You are welcome! Anything else I can look up?',
  },
  help: {
    he: 'אני יכול להציג חשבוניות, תשלומים, לקוחות, ספקים, מלאי, דוחות הכנסות/הוצאות/רווח/תזרים, לבדוק יתרות, ולפתוח הצעת מחיר/חשבונית/הזמנת רכש.',
    en: 'I can list invoices, payments, clients, vendors, inventory, report revenue/expenses/profit/cash, check balances, and create quotes/invoices/POs.',
  },
  unknown: {
    he: 'סליחה, לא הבנתי. אפשר לנסח מחדש? נסה למשל "הצג חשבוניות מעל 5000 מחודש שעבר".',
    en: 'Sorry, I did not catch that. Try for example "show invoices over 5000 from last month".',
  },
  noData: {
    he: 'לא נמצאו רשומות.',
    en: 'No records found.',
  },
};

function pick(obj, lang) {
  return (obj && obj[lang]) || obj.en || '';
}

function formatCount(n, lang) {
  if (lang === HE) return `נמצאו ${n} רשומות`;
  return `Found ${n} record${n === 1 ? '' : 's'}`;
}

function buildSuggestions(intent, lang) {
  const s = {
    [INTENTS.SHOW_INVOICES]: {
      he: ['הצג את הלקוח הגדול ביותר', 'דוח הכנסות החודש', 'חשבוניות לא שולמו'],
      en: ['show the largest client', 'revenue this month', 'unpaid invoices'],
    },
    [INTENTS.SHOW_PAYMENTS]: {
      he: ['הצג יתרה כוללת', 'תשלומים באיחור', 'דוח תזרים'],
      en: ['show outstanding balance', 'overdue payments', 'cash flow report'],
    },
    [INTENTS.SHOW_CLIENTS]: {
      he: ['הצג את הלקוח הגדול ביותר', 'הצג חשבוניות של לקוח', 'יתרות פתוחות'],
      en: ['show the largest client', 'show client invoices', 'open balances'],
    },
    [INTENTS.SHOW_VENDORS]: {
      he: ['הצג הזמנות רכש', 'הצג חובות ספקים', 'דוח הוצאות'],
      en: ['show purchase orders', 'show vendor debts', 'expenses report'],
    },
    [INTENTS.SHOW_INVENTORY]: {
      he: ['הצג פריטים חסרים', 'הצג פריטים מובילים', 'דוח מלאי'],
      en: ['show low stock', 'show top items', 'inventory report'],
    },
    [INTENTS.REPORT_REVENUE]: {
      he: ['השווה לחודש הקודם', 'הצג לקוחות מובילים', 'דוח רווח'],
      en: ['compare to previous month', 'show top clients', 'profit report'],
    },
    [INTENTS.REPORT_EXPENSES]: {
      he: ['פירוט לפי קטגוריה', 'השווה לחודש שעבר', 'דוח תזרים'],
      en: ['breakdown by category', 'compare to last month', 'cash flow report'],
    },
    [INTENTS.REPORT_PROFIT]: {
      he: ['הצג הכנסות', 'הצג הוצאות', 'השווה לשנה שעברה'],
      en: ['show revenue', 'show expenses', 'compare to last year'],
    },
    [INTENTS.REPORT_CASH]: {
      he: ['תשלומים באיחור', 'יתרת בנק', 'התחייבויות פתוחות'],
      en: ['overdue payments', 'bank balance', 'open obligations'],
    },
    [INTENTS.CHECK_BALANCE]: {
      he: ['הצג חשבוניות פתוחות', 'שלח תזכורת תשלום', 'דוח גיול חובות'],
      en: ['show open invoices', 'send payment reminder', 'aging report'],
    },
    [INTENTS.CHECK_STOCK]: {
      he: ['הצג פריטים חסרים', 'פתח הזמנת רכש', 'תחזית מלאי'],
      en: ['show low stock', 'create a PO', 'stock forecast'],
    },
    [INTENTS.CHECK_EMPLOYEE]: {
      he: ['הצג תלוש שכר', 'ימי חופשה', 'דוח שכר חודשי'],
      en: ['show wage slip', 'vacation days', 'monthly payroll'],
    },
    [INTENTS.CREATE_INVOICE]: {
      he: ['הצג טיוטות', 'שלח ללקוח', 'הפק הצעת מחיר'],
      en: ['show drafts', 'send to client', 'create a quote'],
    },
    [INTENTS.CREATE_QUOTE]: {
      he: ['הפוך לחשבונית', 'שלח ללקוח', 'הצג תבניות'],
      en: ['convert to invoice', 'send to client', 'show templates'],
    },
    [INTENTS.CREATE_PO]: {
      he: ['הצג ספקים', 'אשר הזמנה', 'עקוב אחרי משלוחים'],
      en: ['show vendors', 'approve PO', 'track shipments'],
    },
    [INTENTS.HELP]: {
      he: ['הצג חשבוניות', 'דוח הכנסות', 'בדוק יתרה'],
      en: ['show invoices', 'revenue report', 'check balance'],
    },
    [INTENTS.GREET]: {
      he: ['דוח היום', 'הצג חשבוניות', 'בדוק יתרה'],
      en: ['today report', 'show invoices', 'check balance'],
    },
    [INTENTS.THANKS]: {
      he: ['הצג חשבוניות', 'דוח הכנסות', 'עזרה'],
      en: ['show invoices', 'revenue report', 'help'],
    },
  };
  const entry = s[intent] || { he: ['עזרה'], en: ['help'] };
  return entry[lang] || entry.en;
}

// ─────────────────────────────────────────────────────────────────────
// 10. Pronoun / context resolution
// ─────────────────────────────────────────────────────────────────────
const PRONOUNS_HE = /(הלקוח\s*הזה|הספק\s*הזה|העובד\s*הזה|הפריט\s*הזה|זה\b)/;
const PRONOUNS_EN = /\b(this (client|customer|vendor|supplier|employee|item|one)|it|same one)\b/i;

function hasPronoun(message) {
  return PRONOUNS_HE.test(message) || PRONOUNS_EN.test(message);
}

// ─────────────────────────────────────────────────────────────────────
// 11. Chatbot factory
// ─────────────────────────────────────────────────────────────────────
function createChatbot(dataSource, opts) {
  if (!dataSource || typeof dataSource.query !== 'function') {
    throw new Error('createChatbot: dataSource must expose a query(sql, params) method');
  }
  const options = opts || {};
  const sessions = new Map(); // sessionId → context
  const customIntents = [];   // [{ name, patterns, handler, priority }]
  const knownLists = {
    clients:   Array.isArray(options.clients)   ? options.clients.slice()   : [],
    vendors:   Array.isArray(options.vendors)   ? options.vendors.slice()   : [],
    employees: Array.isArray(options.employees) ? options.employees.slice() : [],
  };
  const clock = typeof options.now === 'function' ? options.now : () => new Date();

  function getContext(sessionId) {
    if (!sessionId) return null;
    return sessions.get(sessionId) || null;
  }
  function setContext(sessionId, ctx) {
    if (!sessionId) return;
    sessions.set(sessionId, ctx);
  }
  function clearContext(sessionId) {
    if (!sessionId) return;
    sessions.delete(sessionId);
  }

  function registerIntent(name, patterns, handler) {
    if (!name || !Array.isArray(patterns) || typeof handler !== 'function') {
      throw new Error('registerIntent: invalid arguments');
    }
    customIntents.push({
      intent: name,
      priority: 1000, // custom wins over builtin
      patterns: patterns.map(p => p instanceof RegExp ? p : new RegExp(p, 'i')),
      handler,
    });
  }

  function listIntents() {
    return Object.values(INTENTS);
  }

  function runQuery(sql, params) {
    // data source may return { rows, count } sync or async
    const r = dataSource.query(sql, params);
    if (r && typeof r.then === 'function') return r;
    return Promise.resolve(r || { rows: [], count: 0 });
  }

  function composeListResponse(intent, rows, count, entities, lang) {
    const n = typeof count === 'number' ? count : (rows ? rows.length : 0);
    if (n === 0) return pick(RESP.noData, lang);
    const header = formatCount(n, lang);
    const sample = Array.isArray(rows) ? rows.slice(0, 5) : [];
    const labelHe = {
      [INTENTS.SHOW_INVOICES]: 'חשבוניות',
      [INTENTS.SHOW_PAYMENTS]: 'תשלומים',
      [INTENTS.SHOW_CLIENTS]:  'לקוחות',
      [INTENTS.SHOW_VENDORS]:  'ספקים',
      [INTENTS.SHOW_INVENTORY]: 'פריטי מלאי',
    }[intent] || 'רשומות';
    const labelEn = {
      [INTENTS.SHOW_INVOICES]: 'invoices',
      [INTENTS.SHOW_PAYMENTS]: 'payments',
      [INTENTS.SHOW_CLIENTS]:  'clients',
      [INTENTS.SHOW_VENDORS]:  'vendors',
      [INTENTS.SHOW_INVENTORY]: 'inventory items',
    }[intent] || 'records';
    const label = lang === HE ? labelHe : labelEn;
    const sampleStr = sample.length
      ? ' ' + (lang === HE ? `מציג ${sample.length} ראשונים` : `showing ${sample.length}`)
      : '';
    return `${header} ${label}.${sampleStr}`;
  }

  function composeAggResponse(intent, value, entities, lang) {
    const num = typeof value === 'number' ? value : 0;
    const fmt = num.toLocaleString(lang === HE ? 'he-IL' : 'en-US');
    const sign = '₪';
    const label = entities && entities.date ? (entities.date.label || '') : '';
    if (lang === HE) {
      if (intent === INTENTS.REPORT_REVENUE)  return `סך הכנסות ${label}: ${sign}${fmt}`.trim();
      if (intent === INTENTS.REPORT_EXPENSES) return `סך הוצאות ${label}: ${sign}${fmt}`.trim();
      if (intent === INTENTS.REPORT_PROFIT)   return `רווח נקי ${label}: ${sign}${fmt}`.trim();
      if (intent === INTENTS.REPORT_CASH)     return `יתרת מזומנים ${label}: ${sign}${fmt}`.trim();
      if (intent === INTENTS.CHECK_BALANCE)   return `יתרה: ${sign}${fmt}`;
      if (intent === INTENTS.CHECK_STOCK)     return `כמות במלאי: ${fmt}`;
      return `${sign}${fmt}`;
    }
    if (intent === INTENTS.REPORT_REVENUE)  return `Total revenue ${label}: ${sign}${fmt}`.trim();
    if (intent === INTENTS.REPORT_EXPENSES) return `Total expenses ${label}: ${sign}${fmt}`.trim();
    if (intent === INTENTS.REPORT_PROFIT)   return `Net profit ${label}: ${sign}${fmt}`.trim();
    if (intent === INTENTS.REPORT_CASH)     return `Cash balance ${label}: ${sign}${fmt}`.trim();
    if (intent === INTENTS.CHECK_BALANCE)   return `Balance: ${sign}${fmt}`;
    if (intent === INTENTS.CHECK_STOCK)     return `In stock: ${fmt}`;
    return `${sign}${fmt}`;
  }

  function entitiesFromMessage(message, prevContext) {
    const amount = parseAmount(message);
    const date   = parseDate(message, clock());
    let name     = extractName(message, knownLists);
    const category = extractCategory(message);

    // pronoun resolution: "what about הלקוח הזה" reuses previous name
    if (!name && prevContext && prevContext.entities && prevContext.entities.name
        && hasPronoun(message)) {
      name = prevContext.entities.name;
    }
    return { amount, date, name, category };
  }

  function processOnce(message, context) {
    const lang = detectLanguage(message);
    const sessionId = context && context.sessionId;
    const prev = getContext(sessionId);

    // "show me more" / "same again" / "עוד" → reuse previous intent
    const isFollowUp = /^(show me more|more|עוד|אותו הדבר|אותו דבר)/i.test(
      (message || '').trim()
    );

    let intentResult;
    if (isFollowUp && prev && prev.intent) {
      intentResult = { intent: prev.intent, confidence: 85, matched: 'follow-up' };
    } else {
      intentResult = classifyIntent(message, customIntents);
    }
    let intent = intentResult.intent;
    let entities = entitiesFromMessage(message, prev);

    // inherit date from context if missing and it's a pronoun / follow-up
    if (!entities.date && prev && prev.entities && prev.entities.date
        && (isFollowUp || hasPronoun(message))) {
      entities.date = prev.entities.date;
    }

    // Small-talk intents short-circuit the SQL path
    if (intent === INTENTS.GREET) {
      const out = {
        intent, entities, language: lang,
        response: pick(RESP.greet, lang),
        suggestions: buildSuggestions(intent, lang),
      };
      setContext(sessionId, { intent, entities, language: lang, lastMessage: message });
      return Promise.resolve(out);
    }
    if (intent === INTENTS.THANKS) {
      const out = {
        intent, entities, language: lang,
        response: pick(RESP.thanks, lang),
        suggestions: buildSuggestions(intent, lang),
      };
      setContext(sessionId, { intent, entities, language: lang, lastMessage: message });
      return Promise.resolve(out);
    }
    if (intent === INTENTS.HELP) {
      const out = {
        intent, entities, language: lang,
        response: pick(RESP.help, lang),
        suggestions: buildSuggestions(intent, lang),
      };
      setContext(sessionId, { intent, entities, language: lang, lastMessage: message });
      return Promise.resolve(out);
    }
    if (intent === INTENTS.UNKNOWN) {
      const out = {
        intent, entities, language: lang,
        response: pick(RESP.unknown, lang),
        suggestions: buildSuggestions(INTENTS.HELP, lang),
      };
      setContext(sessionId, { intent, entities, language: lang, lastMessage: message });
      return Promise.resolve(out);
    }

    // Custom intents — delegate to user handler
    for (const c of customIntents) {
      if (c.intent === intent && typeof c.handler === 'function') {
        const custom = c.handler({ message, entities, language: lang, dataSource, context });
        return Promise.resolve(custom).then((r) => {
          const out = Object.assign({
            intent, entities, language: lang,
            response: '',
            suggestions: buildSuggestions(intent, lang),
          }, r || {});
          setContext(sessionId, { intent, entities, language: lang, lastMessage: message });
          return out;
        });
      }
    }

    // SQL-driven intents
    let sqlBuild = null;
    switch (intent) {
      case INTENTS.SHOW_INVOICES:
        sqlBuild = buildListQuery('invoices',  entities, 'issued_at DESC');
        break;
      case INTENTS.SHOW_PAYMENTS:
        sqlBuild = buildListQuery('payments',  entities, 'paid_at DESC');
        break;
      case INTENTS.SHOW_CLIENTS:
        sqlBuild = buildListQuery('clients',   entities, 'name ASC');
        break;
      case INTENTS.SHOW_VENDORS:
        sqlBuild = buildListQuery('vendors',   entities, 'name ASC');
        break;
      case INTENTS.SHOW_INVENTORY:
        sqlBuild = buildListQuery('inventory', entities, 'name ASC');
        break;
      case INTENTS.REPORT_REVENUE:
        sqlBuild = buildAggregateQuery('invoices',  'total',   entities, 'sum');
        break;
      case INTENTS.REPORT_EXPENSES:
        sqlBuild = buildAggregateQuery('expenses',  'amount',  entities, 'sum');
        break;
      case INTENTS.REPORT_PROFIT:
        sqlBuild = {
          sql: 'SELECT (SELECT COALESCE(SUM(total),0) FROM invoices) - '
             + '(SELECT COALESCE(SUM(amount),0) FROM expenses) AS value',
          params: [],
        };
        break;
      case INTENTS.REPORT_CASH:
        sqlBuild = { sql: 'SELECT COALESCE(SUM(balance),0) AS value FROM bank_accounts', params: [] };
        break;
      case INTENTS.CHECK_BALANCE:
        sqlBuild = buildAggregateQuery('invoices', 'total', entities, 'sum');
        break;
      case INTENTS.CHECK_STOCK:
        sqlBuild = buildAggregateQuery('inventory', 'qty',  entities, 'sum');
        break;
      case INTENTS.CHECK_EMPLOYEE:
        sqlBuild = buildListQuery('employees', entities, 'name ASC');
        break;
      case INTENTS.CREATE_INVOICE:
      case INTENTS.CREATE_QUOTE:
      case INTENTS.CREATE_PO: {
        // Creation is a "draft intent" — we do not actually write here,
        // we return a template response that upstream UI will turn into
        // a form. This honours the "never delete / never auto-mutate"
        // rule while still classifying the user's intent.
        const label = {
          [INTENTS.CREATE_INVOICE]: { he: 'טיוטת חשבונית', en: 'Draft invoice' },
          [INTENTS.CREATE_QUOTE]:   { he: 'טיוטת הצעת מחיר', en: 'Draft quote' },
          [INTENTS.CREATE_PO]:      { he: 'טיוטת הזמנת רכש', en: 'Draft purchase order' },
        }[intent];
        const out = {
          intent, entities, language: lang,
          response: pick(label, lang) + (lang === HE ? ' נוצרה. אפשר למלא את הפרטים.' : ' created. Fill in the details.'),
          draft: {
            kind: intent.replace('create_', ''),
            client: entities.name ? entities.name.name : null,
            total:  entities.amount ? (entities.amount.value || entities.amount.max || null) : null,
          },
          suggestions: buildSuggestions(intent, lang),
        };
        setContext(sessionId, { intent, entities, language: lang, lastMessage: message });
        return Promise.resolve(out);
      }
      default:
        sqlBuild = null;
    }

    if (!sqlBuild) {
      const out = {
        intent, entities, language: lang,
        response: pick(RESP.unknown, lang),
        suggestions: buildSuggestions(INTENTS.HELP, lang),
      };
      setContext(sessionId, { intent, entities, language: lang, lastMessage: message });
      return Promise.resolve(out);
    }

    return runQuery(sqlBuild.sql, sqlBuild.params).then((result) => {
      const rows  = (result && result.rows) || [];
      const count = typeof result.count === 'number' ? result.count : rows.length;
      let response;
      if (intent === INTENTS.REPORT_REVENUE
          || intent === INTENTS.REPORT_EXPENSES
          || intent === INTENTS.REPORT_PROFIT
          || intent === INTENTS.REPORT_CASH
          || intent === INTENTS.CHECK_BALANCE
          || intent === INTENTS.CHECK_STOCK) {
        const v = rows.length > 0 ? (rows[0].value != null ? rows[0].value : rows[0].sum) : 0;
        response = composeAggResponse(intent, v, entities, lang);
      } else {
        response = composeListResponse(intent, rows, count, entities, lang);
      }
      const out = {
        intent, entities, language: lang,
        query:  sqlBuild.sql,
        params: sqlBuild.params,
        results: rows,
        count,
        response,
        suggestions: buildSuggestions(intent, lang),
      };
      setContext(sessionId, {
        intent, entities, language: lang, lastMessage: message,
        lastQuery: sqlBuild.sql, lastParams: sqlBuild.params,
      });
      return out;
    });
  }

  function process(message, context) {
    try {
      return processOnce(message, context || {});
    } catch (err) {
      const lang = detectLanguage(message);
      return Promise.resolve({
        intent: INTENTS.UNKNOWN,
        entities: {},
        language: lang,
        response: pick(RESP.unknown, lang),
        suggestions: buildSuggestions(INTENTS.HELP, lang),
        error: String(err && err.message || err),
      });
    }
  }

  return {
    process,
    clearContext,
    getContext,
    registerIntent,
    listIntents,
    // internal — exposed for tests
    _debug: {
      classify: (m) => classifyIntent(m, customIntents),
      sessionsSize: () => sessions.size,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// 12. Exports
// ─────────────────────────────────────────────────────────────────────
module.exports = {
  createChatbot,
  detectLanguage,
  parseAmount,
  parseDate,
  classifyIntent,
  INTENTS,
  // deep helpers some tests may want to reach
  _internals: {
    buildListQuery,
    buildAggregateQuery,
    extractName,
    extractCategory,
    fuzzyFind,
    editDistance,
    hasPronoun,
  },
  _resetForTests() { /* no module-level state to reset */ },
};
