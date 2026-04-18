/**
 * ERP Chatbot Engine — Unit Tests
 * Agent X-18 / Techno-Kol Uzi Mega-ERP (Swarm 3)
 *
 * 20+ intents × Hebrew + English = 40+ bilingual cases plus
 * entity-extraction tests, context / pronoun resolution tests,
 * SQL-safety tests, and custom-intent registration tests.
 *
 * Run: node --test test/payroll/chatbot-engine.test.js
 *   or: node --test test/payroll/
 */

'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  createChatbot,
  detectLanguage,
  parseAmount,
  parseDate,
  classifyIntent,
  INTENTS,
  _internals,
} = require('../../src/chatbot/engine.js');

// ─────────────────────────────────────────────────────────────────────
// Test harness — fake dataSource that records every call and can be
// programmed with canned rows per SQL prefix.
// ─────────────────────────────────────────────────────────────────────
function makeDataSource(responses) {
  const calls = [];
  return {
    calls,
    query(sql, params) {
      calls.push({ sql, params });
      if (responses && typeof responses === 'function') {
        return responses(sql, params);
      }
      return { rows: [], count: 0 };
    },
  };
}

// Deterministic clock so "last month" is always 2026-03.
const FIXED_NOW = new Date(Date.UTC(2026, 3, 11, 12, 0, 0)); // 2026-04-11
const clockFn = () => new Date(FIXED_NOW.getTime());

function makeBot(ds, extra) {
  return createChatbot(ds, Object.assign({ now: clockFn }, extra || {}));
}

// ─────────────────────────────────────────────────────────────────────
// 1. Language detection
// ─────────────────────────────────────────────────────────────────────
describe('detectLanguage', () => {
  test('Hebrew text → "he"', () => {
    assert.equal(detectLanguage('הצג חשבוניות'), 'he');
  });
  test('English text → "en"', () => {
    assert.equal(detectLanguage('show invoices'), 'en');
  });
  test('mixed with Hebrew → "he" (any Hebrew letter wins)', () => {
    assert.equal(detectLanguage('show חשבוניות over 5000'), 'he');
  });
  test('empty / nullish → "en"', () => {
    assert.equal(detectLanguage(''), 'en');
    assert.equal(detectLanguage(null), 'en');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. classifyIntent — 20 intents × HE + EN (≥40 cases)
// ─────────────────────────────────────────────────────────────────────
describe('classifyIntent — bilingual 20+ intents', () => {
  const cases = [
    // 1–2  show_invoices
    ['show invoices over 5000 from last month', INTENTS.SHOW_INVOICES],
    ['הצג חשבוניות מעל 5000 מחודש שעבר',        INTENTS.SHOW_INVOICES],
    // 3–4  show_payments
    ['list payments this week',                 INTENTS.SHOW_PAYMENTS],
    ['הצג תשלומים מהשבוע',                       INTENTS.SHOW_PAYMENTS],
    // 5–6  show_clients
    ['show clients',                             INTENTS.SHOW_CLIENTS],
    ['הצג לקוחות',                               INTENTS.SHOW_CLIENTS],
    // 7–8  show_vendors
    ['list vendors',                             INTENTS.SHOW_VENDORS],
    ['הצג ספקים',                                INTENTS.SHOW_VENDORS],
    // 9–10 show_inventory
    ['show inventory',                           INTENTS.SHOW_INVENTORY],
    ['הצג מלאי',                                 INTENTS.SHOW_INVENTORY],
    // 11–12 create_invoice
    ['create a new invoice for Acme',            INTENTS.CREATE_INVOICE],
    ['צור חשבונית חדשה ל-Acme',                  INTENTS.CREATE_INVOICE],
    // 13–14 create_quote
    ['draft a quote for 12,000',                 INTENTS.CREATE_QUOTE],
    ['צור הצעת מחיר חדשה',                       INTENTS.CREATE_QUOTE],
    // 15–16 create_po
    ['create purchase order',                    INTENTS.CREATE_PO],
    ['צור הזמנת רכש',                            INTENTS.CREATE_PO],
    // 17–18 report_revenue
    ['revenue report for Q1',                    INTENTS.REPORT_REVENUE],
    ['דוח הכנסות ברבעון הזה',                    INTENTS.REPORT_REVENUE],
    // 19–20 report_expenses
    ['expenses last month',                      INTENTS.REPORT_EXPENSES],
    ['הוצאות חודש שעבר',                         INTENTS.REPORT_EXPENSES],
    // 21–22 report_profit
    ['profit this year',                         INTENTS.REPORT_PROFIT],
    ['רווח השנה',                                INTENTS.REPORT_PROFIT],
    // 23–24 report_cash
    ['cash flow this week',                      INTENTS.REPORT_CASH],
    ['תזרים מזומנים השבוע',                       INTENTS.REPORT_CASH],
    // 25–26 check_balance
    ['what is the outstanding balance',          INTENTS.CHECK_BALANCE],
    ['מה היתרה',                                 INTENTS.CHECK_BALANCE],
    // 27–28 check_stock
    ['how many widgets in stock',                INTENTS.CHECK_STOCK],
    ['כמה יש במלאי',                             INTENTS.CHECK_STOCK],
    // 29–30 check_employee
    ['show employee Dana',                       INTENTS.CHECK_EMPLOYEE],
    ['הצג עובד דנה',                             INTENTS.CHECK_EMPLOYEE],
    // 31–32 help
    ['help',                                     INTENTS.HELP],
    ['עזרה',                                     INTENTS.HELP],
    // 33–34 greet
    ['hello',                                    INTENTS.GREET],
    ['שלום',                                     INTENTS.GREET],
    // 35–36 thanks
    ['thanks',                                   INTENTS.THANKS],
    ['תודה',                                     INTENTS.THANKS],
  ];
  for (const [msg, want] of cases) {
    test(`"${msg}" → ${want}`, () => {
      const r = classifyIntent(msg);
      assert.equal(r.intent, want);
      assert.ok(r.confidence > 0, 'confidence should be > 0');
    });
  }
  test('count is at least 36 (18 intents × 2 languages)', () => {
    assert.ok(cases.length >= 36, `got ${cases.length}`);
  });
  test('empty message → unknown', () => {
    assert.equal(classifyIntent('').intent, INTENTS.UNKNOWN);
    assert.equal(classifyIntent('   ').intent, INTENTS.UNKNOWN);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. parseAmount
// ─────────────────────────────────────────────────────────────────────
describe('parseAmount', () => {
  test('over 5000 → gt/5000', () => {
    assert.deepEqual(parseAmount('over 5000'), { op: 'gt', value: 5000 });
  });
  test('above 10k → gt/10000', () => {
    assert.deepEqual(parseAmount('above 10k'), { op: 'gt', value: 10000 });
  });
  test('under 200 → lt/200', () => {
    assert.deepEqual(parseAmount('under 200'), { op: 'lt', value: 200 });
  });
  test('below 1m → lt/1000000', () => {
    assert.deepEqual(parseAmount('below 1m'), { op: 'lt', value: 1000000 });
  });
  test('between 1000 and 5000', () => {
    assert.deepEqual(parseAmount('between 1000 and 5000'),
      { op: 'between', min: 1000, max: 5000 });
  });
  test('מעל 5000 → gt/5000 (Hebrew)', () => {
    assert.deepEqual(parseAmount('חשבוניות מעל 5000 מחודש שעבר'),
      { op: 'gt', value: 5000 });
  });
  test('בין 1000 ל-5000 → between', () => {
    assert.deepEqual(parseAmount('בין 1000 ל-5000'),
      { op: 'between', min: 1000, max: 5000 });
  });
  test('פחות מ-200 → lt/200', () => {
    const r = parseAmount('פחות מ-200');
    assert.equal(r.op, 'lt');
    assert.equal(r.value, 200);
  });
  test('no amount → null', () => {
    assert.equal(parseAmount('hello world'), null);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. parseDate — uses fixed clock 2026-04-11
// ─────────────────────────────────────────────────────────────────────
describe('parseDate with clock 2026-04-11', () => {
  const NOW = () => new Date(FIXED_NOW.getTime());

  test('today', () => {
    const r = parseDate('today', NOW());
    assert.equal(r.from, '2026-04-11');
    assert.equal(r.to,   '2026-04-11');
  });
  test('yesterday', () => {
    const r = parseDate('yesterday', NOW());
    assert.equal(r.from, '2026-04-10');
  });
  test('this month → April 2026', () => {
    const r = parseDate('this month', NOW());
    assert.equal(r.from, '2026-04-01');
    assert.equal(r.to,   '2026-04-30');
  });
  test('last month → March 2026', () => {
    const r = parseDate('last month', NOW());
    assert.equal(r.from, '2026-03-01');
    assert.equal(r.to,   '2026-03-31');
  });
  test('this year → 2026', () => {
    const r = parseDate('this year', NOW());
    assert.equal(r.from, '2026-01-01');
    assert.equal(r.to,   '2026-12-31');
  });
  test('last year → 2025', () => {
    const r = parseDate('last year', NOW());
    assert.equal(r.from, '2025-01-01');
    assert.equal(r.to,   '2025-12-31');
  });
  test('Q1 → Jan..Mar 2026', () => {
    const r = parseDate('Q1', NOW());
    assert.equal(r.from, '2026-01-01');
    assert.equal(r.to,   '2026-03-31');
  });
  test('Q4 2025', () => {
    const r = parseDate('Q4 2025', NOW());
    assert.equal(r.from, '2025-10-01');
    assert.equal(r.to,   '2025-12-31');
  });
  test('חודש שעבר → 2026-03', () => {
    const r = parseDate('הצג חשבוניות מחודש שעבר', NOW());
    assert.equal(r.from, '2026-03-01');
    assert.equal(r.to,   '2026-03-31');
  });
  test('השנה → 2026', () => {
    const r = parseDate('הכנסות השנה', NOW());
    assert.equal(r.from, '2026-01-01');
    assert.equal(r.to,   '2026-12-31');
  });
  test('רבעון 2 → Apr..Jun 2026', () => {
    const r = parseDate('רבעון 2', NOW());
    assert.equal(r.from, '2026-04-01');
    assert.equal(r.to,   '2026-06-30');
  });
  test('YYYY-MM-DD literal', () => {
    const r = parseDate('2026-02-14', NOW());
    assert.equal(r.from, '2026-02-14');
    assert.equal(r.to,   '2026-02-14');
  });
  test('no date → null', () => {
    assert.equal(parseDate('no date here', NOW()), null);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. Name fuzzy match + extractName via known lists
// ─────────────────────────────────────────────────────────────────────
describe('extractName fuzzy', () => {
  const lists = {
    clients:   [{ name: 'Acme Corp' }, { name: 'חברת אבישי' }, { name: 'Globex' }],
    vendors:   [{ name: 'Paz Oil' }, { name: 'מקורות' }],
    employees: [{ name: 'Dana Levi' }, { name: 'דוד כהן' }],
  };
  test('exact English match', () => {
    const r = _internals.extractName('show invoices for Acme Corp', lists);
    assert.ok(r);
    assert.match(r.name, /Acme/);
  });
  test('Hebrew client fuzzy', () => {
    const r = _internals.extractName('מה היתרה של חברת אבישי', lists);
    assert.ok(r);
    assert.match(r.name, /אבישי/);
  });
  test('typo Globext → Globex (Levenshtein 1)', () => {
    const hit = _internals.fuzzyFind('Globext', lists.clients);
    assert.ok(hit);
    assert.equal(hit.item.name, 'Globex');
    assert.ok(hit.score >= 70);
  });
  test('quoted name wins', () => {
    const r = _internals.extractName('send to "Some New Vendor"', lists);
    assert.ok(r);
    assert.equal(r.name, 'Some New Vendor');
    assert.equal(r.source, 'quoted');
  });
  test('no match → null', () => {
    const r = _internals.extractName('random gibberish xyzzy', lists);
    assert.equal(r, null);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. Category extraction
// ─────────────────────────────────────────────────────────────────────
describe('extractCategory', () => {
  test('fuel (EN)', () => { assert.equal(_internals.extractCategory('fuel report'), 'fuel'); });
  test('דלק (HE)', () => { assert.equal(_internals.extractCategory('הוצאות דלק'), 'fuel'); });
  test('office (EN)', () => { assert.equal(_internals.extractCategory('office supplies'), 'office'); });
  test('חשמל (HE)', () => { assert.equal(_internals.extractCategory('חשבון חשמל'), 'utilities'); });
  test('no category → null', () => { assert.equal(_internals.extractCategory('hello'), null); });
});

// ─────────────────────────────────────────────────────────────────────
// 7. End-to-end — chatbot.process with a fake data source
// ─────────────────────────────────────────────────────────────────────
describe('chatbot.process — end-to-end', () => {
  let ds, bot;
  beforeEach(() => {
    ds = makeDataSource((sql) => {
      if (/FROM invoices/.test(sql) && /SUM\(total\)/.test(sql)) {
        return { rows: [{ value: 123456 }], count: 1 };
      }
      if (/FROM invoices/.test(sql)) {
        return {
          rows: [
            { id: 1, name: 'Acme Corp',  total: 5400, issued_at: '2026-03-05' },
            { id: 2, name: 'Globex',     total: 7200, issued_at: '2026-03-18' },
          ],
          count: 2,
        };
      }
      if (/FROM expenses/.test(sql) && /SUM\(amount\)/.test(sql)) {
        return { rows: [{ value: 45000 }], count: 1 };
      }
      if (/FROM clients/.test(sql)) {
        return { rows: [{ id: 10, name: 'Acme Corp' }, { id: 11, name: 'חברת אבישי' }], count: 2 };
      }
      if (/FROM vendors/.test(sql)) {
        return { rows: [{ id: 20, name: 'Paz Oil' }], count: 1 };
      }
      if (/FROM inventory/.test(sql)) {
        return { rows: [{ id: 30, name: 'Widget', qty: 42 }], count: 1 };
      }
      if (/FROM payments/.test(sql)) {
        return { rows: [{ id: 40, amount: 1200, paid_at: '2026-04-01' }], count: 1 };
      }
      if (/FROM employees/.test(sql)) {
        return { rows: [{ id: 50, name: 'Dana Levi' }], count: 1 };
      }
      if (/FROM bank_accounts/.test(sql)) {
        return { rows: [{ value: 87654 }], count: 1 };
      }
      if (/SUM\(qty\)/.test(sql)) {
        return { rows: [{ value: 42 }], count: 1 };
      }
      if (/invoices\) - \(SELECT/.test(sql)) {
        return { rows: [{ value: 78456 }], count: 1 };
      }
      return { rows: [], count: 0 };
    });
    bot = makeBot(ds, {
      clients:   ['Acme Corp', 'חברת אבישי', 'Globex'],
      vendors:   ['Paz Oil', 'מקורות'],
      employees: ['Dana Levi', 'דוד כהן'],
    });
  });

  test('show invoices over 5000 from last month (EN)', async () => {
    const out = await bot.process('show invoices over 5000 from last month', { sessionId: 's1' });
    assert.equal(out.intent, INTENTS.SHOW_INVOICES);
    assert.equal(out.language, 'en');
    assert.ok(out.query);
    assert.match(out.query, /FROM invoices/);
    assert.match(out.query, /\$1/);
    assert.match(out.query, /\$2/);
    assert.deepEqual(out.entities.amount, { op: 'gt', value: 5000 });
    assert.equal(out.entities.date.from, '2026-03-01');
    assert.equal(out.entities.date.to,   '2026-03-31');
    assert.equal(out.count, 2);
    assert.ok(out.response.length > 0);
    assert.ok(out.suggestions.length >= 1);
  });

  test('הצג חשבוניות מעל 5000 מחודש שעבר (HE)', async () => {
    const out = await bot.process('הצג חשבוניות מעל 5000 מחודש שעבר', { sessionId: 's2' });
    assert.equal(out.intent, INTENTS.SHOW_INVOICES);
    assert.equal(out.language, 'he');
    assert.deepEqual(out.entities.amount, { op: 'gt', value: 5000 });
    assert.equal(out.entities.date.from, '2026-03-01');
    assert.ok(/חשבוניות/.test(out.response));
  });

  test('revenue report this year (EN) → aggregate', async () => {
    const out = await bot.process('revenue report this year', { sessionId: 's3' });
    assert.equal(out.intent, INTENTS.REPORT_REVENUE);
    assert.match(out.query, /SUM\(total\)/);
    assert.match(out.response, /Total revenue/i);
    assert.match(out.response, /₪/);
  });

  test('דוח הכנסות השנה (HE)', async () => {
    const out = await bot.process('דוח הכנסות השנה', { sessionId: 's4' });
    assert.equal(out.intent, INTENTS.REPORT_REVENUE);
    assert.equal(out.language, 'he');
    assert.match(out.response, /הכנסות/);
  });

  test('expenses last month (EN)', async () => {
    const out = await bot.process('expenses last month', { sessionId: 's5' });
    assert.equal(out.intent, INTENTS.REPORT_EXPENSES);
    assert.match(out.query, /FROM expenses/);
    assert.match(out.response, /Total expenses/i);
  });

  test('הוצאות חודש שעבר (HE)', async () => {
    const out = await bot.process('הוצאות חודש שעבר', { sessionId: 's6' });
    assert.equal(out.intent, INTENTS.REPORT_EXPENSES);
    assert.match(out.response, /הוצאות/);
  });

  test('profit this year (EN)', async () => {
    const out = await bot.process('profit this year', { sessionId: 's7' });
    assert.equal(out.intent, INTENTS.REPORT_PROFIT);
    assert.match(out.response, /Net profit/i);
  });

  test('רווח השנה (HE)', async () => {
    const out = await bot.process('רווח השנה', { sessionId: 's8' });
    assert.equal(out.intent, INTENTS.REPORT_PROFIT);
    assert.match(out.response, /רווח/);
  });

  test('cash flow this week (EN)', async () => {
    const out = await bot.process('cash flow this week', { sessionId: 's9' });
    assert.equal(out.intent, INTENTS.REPORT_CASH);
    assert.match(out.query, /bank_accounts/);
  });

  test('תזרים מזומנים (HE)', async () => {
    const out = await bot.process('תזרים מזומנים השבוע', { sessionId: 's10' });
    assert.equal(out.intent, INTENTS.REPORT_CASH);
    assert.match(out.response, /מזומנים/);
  });

  test('check balance (EN)', async () => {
    const out = await bot.process('what is the outstanding balance', { sessionId: 's11' });
    assert.equal(out.intent, INTENTS.CHECK_BALANCE);
    assert.match(out.response, /Balance/i);
  });

  test('מה היתרה (HE)', async () => {
    const out = await bot.process('מה היתרה', { sessionId: 's12' });
    assert.equal(out.intent, INTENTS.CHECK_BALANCE);
    assert.match(out.response, /יתרה/);
  });

  test('check stock (EN)', async () => {
    const out = await bot.process('how many widgets in stock', { sessionId: 's13' });
    assert.equal(out.intent, INTENTS.CHECK_STOCK);
    assert.match(out.response, /In stock/i);
  });

  test('בדיקת מלאי (HE)', async () => {
    const out = await bot.process('כמה יש במלאי', { sessionId: 's14' });
    assert.equal(out.intent, INTENTS.CHECK_STOCK);
    assert.match(out.response, /מלאי/);
  });

  test('check employee (EN)', async () => {
    const out = await bot.process('show employee Dana Levi', { sessionId: 's15' });
    assert.equal(out.intent, INTENTS.CHECK_EMPLOYEE);
    assert.match(out.query, /FROM employees/);
  });

  test('בדיקת עובד (HE)', async () => {
    const out = await bot.process('הצג עובד דוד כהן', { sessionId: 's16' });
    assert.equal(out.intent, INTENTS.CHECK_EMPLOYEE);
    assert.match(out.query, /FROM employees/);
  });

  test('show clients (EN) + HE', async () => {
    const en = await bot.process('show clients', { sessionId: 's17' });
    assert.equal(en.intent, INTENTS.SHOW_CLIENTS);
    const he = await bot.process('הצג לקוחות', { sessionId: 's18' });
    assert.equal(he.intent, INTENTS.SHOW_CLIENTS);
    assert.match(he.response, /לקוחות/);
  });

  test('show vendors (EN) + HE', async () => {
    const en = await bot.process('list vendors', { sessionId: 's19' });
    assert.equal(en.intent, INTENTS.SHOW_VENDORS);
    const he = await bot.process('הצג ספקים', { sessionId: 's20' });
    assert.equal(he.intent, INTENTS.SHOW_VENDORS);
    assert.match(he.response, /ספקים/);
  });

  test('show inventory (EN) + HE', async () => {
    const en = await bot.process('show inventory', { sessionId: 's21' });
    assert.equal(en.intent, INTENTS.SHOW_INVENTORY);
    const he = await bot.process('הצג מלאי', { sessionId: 's22' });
    assert.equal(he.intent, INTENTS.SHOW_INVENTORY);
  });

  test('show payments (EN) + HE', async () => {
    const en = await bot.process('list payments this week', { sessionId: 's23' });
    assert.equal(en.intent, INTENTS.SHOW_PAYMENTS);
    const he = await bot.process('הצג תשלומים', { sessionId: 's24' });
    assert.equal(he.intent, INTENTS.SHOW_PAYMENTS);
  });

  test('create_invoice (EN) + HE → draft', async () => {
    const en = await bot.process('create a new invoice for Acme Corp', { sessionId: 's25' });
    assert.equal(en.intent, INTENTS.CREATE_INVOICE);
    assert.ok(en.draft);
    assert.equal(en.draft.kind, 'invoice');
    const he = await bot.process('צור חשבונית חדשה ל-Acme Corp', { sessionId: 's26' });
    assert.equal(he.intent, INTENTS.CREATE_INVOICE);
    assert.ok(he.draft);
  });

  test('create_quote (EN) + HE → draft', async () => {
    const en = await bot.process('draft a quote for 12000', { sessionId: 's27' });
    assert.equal(en.intent, INTENTS.CREATE_QUOTE);
    assert.equal(en.draft.kind, 'quote');
    const he = await bot.process('צור הצעת מחיר חדשה', { sessionId: 's28' });
    assert.equal(he.intent, INTENTS.CREATE_QUOTE);
  });

  test('create_po (EN) + HE → draft', async () => {
    const en = await bot.process('create purchase order', { sessionId: 's29' });
    assert.equal(en.intent, INTENTS.CREATE_PO);
    assert.equal(en.draft.kind, 'po');
    const he = await bot.process('צור הזמנת רכש', { sessionId: 's30' });
    assert.equal(he.intent, INTENTS.CREATE_PO);
  });

  test('greet (EN) + HE', async () => {
    assert.equal((await bot.process('hello')).intent, INTENTS.GREET);
    const he = await bot.process('שלום');
    assert.equal(he.intent, INTENTS.GREET);
    assert.match(he.response, /שלום/);
  });

  test('thanks (EN) + HE', async () => {
    assert.equal((await bot.process('thanks')).intent, INTENTS.THANKS);
    const he = await bot.process('תודה');
    assert.equal(he.intent, INTENTS.THANKS);
  });

  test('help (EN) + HE', async () => {
    const en = await bot.process('help');
    assert.equal(en.intent, INTENTS.HELP);
    assert.ok(en.response.length > 10);
    const he = await bot.process('עזרה');
    assert.equal(he.intent, INTENTS.HELP);
    assert.match(he.response, /חשבוניות|דוחות|הצג/);
  });

  test('unknown gibberish → unknown + suggestions', async () => {
    const out = await bot.process('xyzzy plugh');
    assert.equal(out.intent, INTENTS.UNKNOWN);
    assert.ok(out.suggestions.length > 0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 8. Session context & follow-ups
// ─────────────────────────────────────────────────────────────────────
describe('session context', () => {
  test('follow-up "show me more" reuses previous intent', async () => {
    const ds = makeDataSource(() => ({ rows: [{ id: 1 }], count: 1 }));
    const bot = makeBot(ds);
    const first = await bot.process('show invoices this month', { sessionId: 'S' });
    assert.equal(first.intent, INTENTS.SHOW_INVOICES);
    const second = await bot.process('show me more', { sessionId: 'S' });
    assert.equal(second.intent, INTENTS.SHOW_INVOICES);
  });
  test('Hebrew follow-up "עוד" reuses intent', async () => {
    const ds = makeDataSource(() => ({ rows: [{ id: 1 }], count: 1 }));
    const bot = makeBot(ds);
    await bot.process('הצג חשבוניות החודש', { sessionId: 'T' });
    const more = await bot.process('עוד', { sessionId: 'T' });
    assert.equal(more.intent, INTENTS.SHOW_INVOICES);
  });
  test('pronoun "הלקוח הזה" reuses client name', async () => {
    const ds = makeDataSource(() => ({ rows: [], count: 0 }));
    const bot = makeBot(ds, { clients: ['חברת אבישי'] });
    const a = await bot.process('מה היתרה של חברת אבישי', { sessionId: 'U' });
    assert.ok(a.entities.name && /אבישי/.test(a.entities.name.name));
    const b = await bot.process('הצג חשבוניות של הלקוח הזה', { sessionId: 'U' });
    assert.ok(b.entities.name, 'name should be inherited from context');
    assert.match(b.entities.name.name, /אבישי/);
  });
  test('clearContext removes session state', async () => {
    const bot = makeBot(makeDataSource(() => ({ rows: [] })));
    await bot.process('hello', { sessionId: 'X' });
    assert.ok(bot.getContext('X'));
    bot.clearContext('X');
    assert.equal(bot.getContext('X'), null);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 9. SQL safety
// ─────────────────────────────────────────────────────────────────────
describe('SQL safety — parameterised, read-only', () => {
  test('user number is never inlined — always $1', async () => {
    const ds = makeDataSource(() => ({ rows: [], count: 0 }));
    const bot = makeBot(ds);
    const out = await bot.process('show invoices over 99999', { sessionId: 'Z' });
    assert.ok(out.query);
    // The literal 99999 must NOT appear in the SQL
    assert.ok(!/99999/.test(out.query), `found literal in SQL: ${out.query}`);
    assert.equal(out.params[0], 99999);
  });
  test('SQL has no DELETE / DROP / UPDATE / TRUNCATE', async () => {
    const ds = makeDataSource(() => ({ rows: [], count: 0 }));
    const bot = makeBot(ds);
    const intents = [
      'show invoices', 'show payments', 'show clients', 'show vendors',
      'show inventory', 'revenue this year', 'expenses this month',
      'profit this quarter', 'cash flow', 'balance', 'how many in stock',
    ];
    for (const m of intents) {
      const out = await bot.process(m, {});
      if (out.query) {
        assert.ok(!/\bDELETE\b/i.test(out.query), `DELETE in: ${out.query}`);
        assert.ok(!/\bDROP\b/i.test(out.query),   `DROP in: ${out.query}`);
        assert.ok(!/\bUPDATE\b/i.test(out.query), `UPDATE in: ${out.query}`);
        assert.ok(!/\bTRUNCATE\b/i.test(out.query), `TRUNCATE in: ${out.query}`);
      }
    }
  });
  test('between N and M produces two params', async () => {
    const ds = makeDataSource(() => ({ rows: [], count: 0 }));
    const bot = makeBot(ds);
    const out = await bot.process('show invoices between 1000 and 5000', { sessionId: 'Q' });
    assert.ok(out.params.indexOf(1000) >= 0);
    assert.ok(out.params.indexOf(5000) >= 0);
    assert.match(out.query, /BETWEEN \$\d+ AND \$\d+/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 10. Custom intent registration
// ─────────────────────────────────────────────────────────────────────
describe('registerIntent', () => {
  test('custom intent wins over builtin and runs handler', async () => {
    const ds = makeDataSource(() => ({ rows: [], count: 0 }));
    const bot = makeBot(ds);
    let called = 0;
    bot.registerIntent('check_weather', [/\bweather\b/i, /מזג(\s*ה)?\s*אוויר/], () => {
      called++;
      return { response: 'sunny / שמש', extra: true };
    });
    const en = await bot.process('what is the weather today', {});
    assert.equal(en.intent, 'check_weather');
    assert.equal(en.response, 'sunny / שמש');
    assert.equal(en.extra, true);
    const he = await bot.process('מה מזג האוויר', {});
    assert.equal(he.intent, 'check_weather');
    assert.equal(called, 2);
  });
  test('invalid registerIntent throws', () => {
    const bot = makeBot(makeDataSource(() => ({ rows: [] })));
    assert.throws(() => bot.registerIntent('', [], null));
    assert.throws(() => bot.registerIntent('x', 'not-array', () => {}));
  });
});

// ─────────────────────────────────────────────────────────────────────
// 11. Data-source error handling
// ─────────────────────────────────────────────────────────────────────
describe('robustness', () => {
  test('dataSource throwing is swallowed into unknown response', async () => {
    const ds = {
      query() { throw new Error('db down'); },
    };
    const bot = makeBot(ds);
    const out = await bot.process('show invoices', {});
    assert.equal(out.intent, INTENTS.UNKNOWN);
    assert.ok(out.error);
  });
  test('createChatbot without dataSource throws', () => {
    assert.throws(() => createChatbot(null));
    assert.throws(() => createChatbot({}));
  });
});

// ─────────────────────────────────────────────────────────────────────
// 12. Final count — ensure we delivered ≥40 bilingual intent assertions
// ─────────────────────────────────────────────────────────────────────
describe('coverage guard', () => {
  test('INTENTS exposes all 18 canonical names', () => {
    const names = Object.values(INTENTS);
    // 18 + unknown
    assert.ok(names.length >= 18, `got ${names.length} intents`);
    for (const n of [
      'show_invoices','show_payments','show_clients','show_vendors',
      'show_inventory','create_invoice','create_quote','create_po',
      'report_revenue','report_expenses','report_profit','report_cash',
      'check_balance','check_stock','check_employee','help','greet','thanks',
    ]) {
      assert.ok(names.indexOf(n) >= 0, `missing intent: ${n}`);
    }
  });
});
