/**
 * AI Summarizer — Local-Stub Unit Tests
 * Techno-Kol Uzi mega-ERP / Swarm 3 / Agent X-17
 *
 * Tests cover the deterministic local-stub backend plus the core
 * plumbing (language detection, LRU cache, fallback, bidi safety).
 *
 * Run:
 *   node --test test/payroll/summarizer.test.js
 *   node --test test/payroll/
 *
 * Zero external deps — Node built-in test runner only.
 */

'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  createSummarizer,
  Summarizer,
  summarize,
  extractEntities,
  classify,
  translate,
  suggestReply,
  BACKENDS,
  detectLanguage,
  hashContent,
  LruCache,
  bidiSafe,
  stripBidi,
  splitSentences,
  tokenize,
  extractEntitiesHeuristic,
  classifyHeuristic,
  resolveBackend,
  _resetDefault,
} = require('../../src/ai/summarizer.js');

// Wipe the process env knob that can flip the default backend.
beforeEach(() => {
  delete process.env.AI_BACKEND;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AZURE_OPENAI_KEY;
  delete process.env.AZURE_OPENAI_ENDPOINT;
  _resetDefault();
});

// ═══════════════════════════════════════════════════════════════
// 1. Language detection
// ═══════════════════════════════════════════════════════════════
describe('summarizer — language detection', () => {
  test('1. pure English', () => {
    assert.equal(detectLanguage('Hello world this is an invoice'), 'en');
  });

  test('2. pure Hebrew', () => {
    assert.equal(detectLanguage('שלום עולם זו חשבונית לדוגמה'), 'he');
  });

  test('3. mixed Hebrew + English', () => {
    const lang = detectLanguage('שלום hello world זו invoice עולם');
    // Ratio ~50/50 → should return 'mixed' or 'he' depending on token count.
    assert.ok(['mixed', 'he', 'en'].includes(lang));
    assert.notEqual(lang, 'en'); // must not classify as pure English
  });

  test('4. numbers-only defaults to English', () => {
    assert.equal(detectLanguage('1234 5678 9012'), 'en');
  });

  test('5. empty / null', () => {
    assert.equal(detectLanguage(''), 'en');
    assert.equal(detectLanguage(null), 'en');
    assert.equal(detectLanguage(undefined), 'en');
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Summarize — English
// ═══════════════════════════════════════════════════════════════
describe('summarizer — summarize() English', () => {
  test('6. English paragraph yields summary + bullets + English language', async () => {
    const text = [
      'Onyx Procurement received a new purchase order from Acme Corporation.',
      'The total amount is 45,000 ILS including VAT.',
      'Delivery is scheduled for 2026-05-15 in Tel Aviv.',
      'The purchase order must be approved by the CFO before payment.',
      'Payment terms are net 30 and the vendor requires a signed contract.',
    ].join(' ');

    const s = createSummarizer();
    const r = await s.summarize(text);

    assert.equal(r.backend, BACKENDS.LOCAL_STUB);
    assert.equal(r.language, 'en');
    assert.ok(r.summary.length > 0, 'summary should not be empty');
    assert.ok(Array.isArray(r.bullet_points));
    assert.ok(r.bullet_points.length >= 1 && r.bullet_points.length <= 5);
    assert.ok(typeof r.tokens_used === 'number' && r.tokens_used > 0);
    assert.ok(typeof r.confidence === 'number' && r.confidence > 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Summarize — Hebrew
// ═══════════════════════════════════════════════════════════════
describe('summarizer — summarize() Hebrew', () => {
  test('7. Hebrew paragraph yields Hebrew summary', async () => {
    const text = [
      'חברת אוניקס רכש קיבלה הזמנה חדשה מספק בשם אלקטרוניקה בע"מ.',
      'הסכום הכולל הוא 45,000 שקלים כולל מע"מ.',
      'התשלום מתוזמן ל-15 במאי 2026 בתל אביב.',
      'ההזמנה חייבת אישור של סמנכ"ל הכספים לפני ביצוע התשלום.',
      'תנאי התשלום הם שוטף+30 והספק דורש חוזה חתום.',
    ].join(' ');

    const r = await createSummarizer().summarize(text);
    assert.equal(r.language, 'he');
    assert.ok(r.summary.length > 0);
    assert.ok(r.bullet_points.length >= 1);
    // Summary should contain at least one Hebrew character.
    assert.ok(/[\u0590-\u05FF]/.test(r.summary), 'Hebrew summary must contain Hebrew chars');
  });

  test('8. empty input returns empty summary, no throw', async () => {
    const r = await createSummarizer().summarize('');
    assert.equal(r.summary, '');
    assert.deepEqual(r.bullet_points, []);
    assert.equal(r.tokens_used, 0);
  });

  test('9. null input is coerced, no throw', async () => {
    const r = await createSummarizer().summarize(null);
    assert.ok(r);
    assert.equal(r.backend, BACKENDS.LOCAL_STUB);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Entity extraction
// ═══════════════════════════════════════════════════════════════
describe('summarizer — extractEntities()', () => {
  test('10. pulls amounts + dates from English text', async () => {
    const text = 'Acme Inc will pay $12,345.67 on 2026-03-15 to the vendor in Tel Aviv.';
    const r = await createSummarizer().extractEntities(text);
    assert.ok(Array.isArray(r.amounts));
    assert.ok(r.amounts.length >= 1, `expected at least one amount, got ${JSON.stringify(r.amounts)}`);
    assert.ok(Array.isArray(r.dates));
    assert.ok(r.dates.length >= 1);
    assert.ok(Array.isArray(r.locations));
    assert.ok(r.locations.some((x) => /tel aviv/i.test(x)));
  });

  test('11. pulls Hebrew entities: company with בע"מ + Israeli city', async () => {
    const text = 'חברת אלקטרוניקה בע"מ שילמה 1,500 שקלים בתאריך 12/03/2026 בירושלים.';
    const r = await createSummarizer().extractEntities(text);
    assert.ok(r.companies.some((c) => /בע/.test(c)), `companies: ${JSON.stringify(r.companies)}`);
    assert.ok(r.amounts.length >= 1, `amounts: ${JSON.stringify(r.amounts)}`);
    assert.ok(r.dates.length >= 1, `dates: ${JSON.stringify(r.dates)}`);
    assert.ok(r.locations.includes('ירושלים'));
  });

  test('12. pulls people names (English)', async () => {
    const text = 'John Smith approved the contract. Jane Doe will sign it tomorrow.';
    const r = await createSummarizer().extractEntities(text);
    assert.ok(r.people.some((p) => /John Smith/.test(p)));
    assert.ok(r.people.some((p) => /Jane Doe/.test(p)));
  });

  test('13. empty input returns empty entity lists', async () => {
    const r = await createSummarizer().extractEntities('');
    assert.deepEqual(r, { people: [], companies: [], amounts: [], dates: [], locations: [] });
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Classification
// ═══════════════════════════════════════════════════════════════
describe('summarizer — classify()', () => {
  test('14. invoice-like text classified as invoice', async () => {
    const r = await createSummarizer().classify(
      'Please find attached the invoice total with VAT for last month',
      ['invoice', 'payment', 'complaint', 'other'],
    );
    assert.equal(r.category, 'invoice');
    assert.ok(r.confidence > 0);
  });

  test('15. Hebrew complaint text classified as complaint', async () => {
    const r = await createSummarizer().classify(
      'יש לי תלונה קשה לגבי השירות שלכם. זו בעיה חוזרת ואני מאוכזב מאוד.',
      ['invoice', 'payment', 'complaint', 'inquiry', 'other'],
    );
    assert.equal(r.category, 'complaint');
  });

  test('16. falls back to default categories when none given', async () => {
    const r = await createSummarizer().classify('נדרש לשלם תשלום עבור העברה בנקאית');
    assert.ok(typeof r.category === 'string' && r.category.length > 0);
    assert.ok(typeof r.confidence === 'number');
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Translate (stub echoes, documents source/target languages)
// ═══════════════════════════════════════════════════════════════
describe('summarizer — translate() stub', () => {
  test('17. English → Hebrew target: echoes text + records langs', async () => {
    const r = await createSummarizer().translate('Hello world', 'he');
    assert.equal(r.source_language, 'en');
    assert.equal(r.target_language, 'he');
    assert.equal(r.backend, BACKENDS.LOCAL_STUB);
    assert.ok(r.translated.includes('Hello world'));
  });

  test('18. Hebrew source detected', async () => {
    const r = await createSummarizer().translate('שלום עולם', 'en');
    assert.equal(r.source_language, 'he');
    assert.equal(r.target_language, 'en');
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Suggest reply (deterministic)
// ═══════════════════════════════════════════════════════════════
describe('summarizer — suggestReply()', () => {
  test('19. English thread → English reply, Hebrew thread → Hebrew reply', async () => {
    const s = createSummarizer();
    const en = await s.suggestReply([
      { from: 'customer', text: 'Hi, I want to check the status of my order.' },
    ]);
    assert.equal(en.language, 'en');
    assert.ok(/hello|thank|received|logged|working/i.test(en.reply));

    const he = await s.suggestReply([
      { from: 'לקוח', text: 'שלום, אני רוצה לבדוק את הסטטוס של ההזמנה שלי.' },
    ]);
    assert.equal(he.language, 'he');
    assert.ok(/[\u0590-\u05FF]/.test(he.reply));
  });

  test('20. deterministic by thread hash — same input yields same reply', async () => {
    const s = createSummarizer();
    const thread = [{ from: 'x', text: 'Please send a quote for 10 laptops' }];
    const a = await s.suggestReply(thread);
    const b = await s.suggestReply(thread);
    assert.equal(a.reply, b.reply);
  });

  test('21. subject from context is prepended', async () => {
    const s = createSummarizer();
    const r = await s.suggestReply(
      [{ from: 'a', text: 'Please update me on the project status.' }],
      { subject: 'Project X' },
    );
    assert.ok(r.reply.startsWith('[Project X]'), `reply should start with [Project X], got: ${r.reply}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Cache behavior
// ═══════════════════════════════════════════════════════════════
describe('summarizer — caching', () => {
  test('22. same text cached — second call is a cache hit', async () => {
    const s = createSummarizer();
    const text = 'This is a cached test sentence about purchase orders and payments.';
    const a = await s.summarize(text);
    assert.equal(s.cacheSize(), 1);
    const b = await s.summarize(text);
    assert.equal(s.cacheSize(), 1);
    assert.deepEqual(a, b);
  });

  test('23. different text → different cache entries', async () => {
    const s = createSummarizer();
    await s.summarize('First sentence here.');
    await s.summarize('Second sentence here.');
    assert.equal(s.cacheSize(), 2);
  });

  test('24. clearCache resets size', async () => {
    const s = createSummarizer();
    await s.summarize('test');
    s.clearCache();
    assert.equal(s.cacheSize(), 0);
  });

  test('25. caching can be disabled', async () => {
    const s = createSummarizer({ cache: false });
    await s.summarize('something');
    await s.summarize('something');
    assert.equal(s.cacheSize(), 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. LRU cache internals
// ═══════════════════════════════════════════════════════════════
describe('summarizer — LruCache primitive', () => {
  test('26. LRU evicts oldest beyond max', () => {
    const c = new LruCache(3, 60_000);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    c.set('d', 4); // should evict 'a'
    assert.equal(c.has('a'), false);
    assert.equal(c.get('b'), 2);
    assert.equal(c.get('c'), 3);
    assert.equal(c.get('d'), 4);
  });

  test('27. LRU TTL expires entry', async () => {
    const c = new LruCache(10, 20);
    c.set('k', 'v');
    assert.equal(c.get('k'), 'v');
    await new Promise((res) => setTimeout(res, 30));
    assert.equal(c.get('k'), undefined);
    assert.equal(c.has('k'), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. Backend resolution + fallback
// ═══════════════════════════════════════════════════════════════
describe('summarizer — backend resolution & fallback', () => {
  test('28. unknown backend name falls back to local-stub', () => {
    const b = resolveBackend('nonexistent-backend');
    assert.equal(b.name, BACKENDS.LOCAL_STUB);
  });

  test('29. missing OPENAI_API_KEY falls back to local-stub', async () => {
    delete process.env.OPENAI_API_KEY;
    const s = createSummarizer({ backend: 'openai' });
    assert.equal(s.activeBackend, BACKENDS.LOCAL_STUB);
    const r = await s.summarize('test content about a contract');
    assert.equal(r.backend, BACKENDS.LOCAL_STUB);
  });

  test('30. missing ANTHROPIC_API_KEY falls back to local-stub', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const s = createSummarizer({ backend: 'anthropic' });
    assert.equal(s.activeBackend, BACKENDS.LOCAL_STUB);
  });

  test('31. missing AZURE_OPENAI_KEY falls back to local-stub', async () => {
    delete process.env.AZURE_OPENAI_KEY;
    const s = createSummarizer({ backend: 'azure-openai' });
    assert.equal(s.activeBackend, BACKENDS.LOCAL_STUB);
  });

  test('32. factory never throws on weird config', () => {
    assert.doesNotThrow(() => createSummarizer());
    assert.doesNotThrow(() => createSummarizer(null));
    assert.doesNotThrow(() => createSummarizer({}));
    assert.doesNotThrow(() => createSummarizer({ backend: 'garbage' }));
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. Bidi helpers
// ═══════════════════════════════════════════════════════════════
describe('summarizer — bidi helpers', () => {
  test('33. bidiSafe wraps Hebrew with RLI + PDI', () => {
    const wrapped = bidiSafe('שלום', 'he');
    assert.ok(wrapped.startsWith('\u2067'));
    assert.ok(wrapped.endsWith('\u2069'));
  });

  test('34. bidiSafe wraps English with LRI + PDI', () => {
    const wrapped = bidiSafe('hello', 'en');
    assert.ok(wrapped.startsWith('\u2066'));
    assert.ok(wrapped.endsWith('\u2069'));
  });

  test('35. stripBidi is inverse of bidiSafe', () => {
    const s = 'Hello שלום world';
    const wrapped = bidiSafe(s, 'mixed');
    assert.equal(stripBidi(wrapped), s);
  });

  test('36. summary_bidi field is populated when bidi enabled', async () => {
    const s = createSummarizer({ bidi: true });
    const r = await s.summarize('שלום עולם זו חשבונית של אלף שקלים.');
    assert.ok(typeof r.summary_bidi === 'string');
    assert.ok(r.summary_bidi.includes('\u2067') || r.summary_bidi.includes('\u2066'));
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. Functional API + default instance
// ═══════════════════════════════════════════════════════════════
describe('summarizer — functional default API', () => {
  test('37. top-level summarize() works', async () => {
    const r = await summarize('This is a test document about procurement.');
    assert.ok(r);
    assert.equal(r.backend, BACKENDS.LOCAL_STUB);
    assert.ok(r.summary.length > 0);
  });

  test('38. top-level extractEntities works', async () => {
    const r = await extractEntities('John Smith paid $100 on 2026-01-01.');
    assert.ok(r.people.length >= 1);
  });

  test('39. top-level classify / translate / suggestReply do not throw', async () => {
    const c = await classify('urgent complaint about broken product');
    assert.ok(c && c.category);
    const t = await translate('שלום', 'en');
    assert.ok(t && t.translated);
    const rp = await suggestReply('Can you confirm?');
    assert.ok(rp && rp.reply);
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. Utility helpers
// ═══════════════════════════════════════════════════════════════
describe('summarizer — helpers', () => {
  test('40. hashContent is deterministic and hex', () => {
    const h1 = hashContent('foo');
    const h2 = hashContent('foo');
    assert.equal(h1, h2);
    assert.match(h1, /^[0-9a-f]{64}$/);
    assert.notEqual(hashContent('foo'), hashContent('bar'));
  });

  test('41. splitSentences handles English + Hebrew + newlines', () => {
    const out = splitSentences('First. Second! Third?\nFourth one here.');
    assert.equal(out.length, 4);
  });

  test('42. tokenize drops punctuation, lowercases', () => {
    const out = tokenize('Hello, World! Foo.Bar;Baz');
    assert.ok(out.includes('hello'));
    assert.ok(out.includes('world'));
    assert.ok(out.includes('foo'));
    assert.ok(!out.includes('Hello'));
  });

  test('43. extractEntitiesHeuristic exposed for reuse', () => {
    const r = extractEntitiesHeuristic('Paid $50 on 2025-12-31');
    assert.ok(r.amounts.length >= 1);
    assert.ok(r.dates.length >= 1);
  });

  test('44. classifyHeuristic exposed for reuse', () => {
    const r = classifyHeuristic('invoice total amount', ['invoice', 'other']);
    assert.equal(r.category, 'invoice');
  });
});

// ═══════════════════════════════════════════════════════════════
// 14. Resilience — never throw
// ═══════════════════════════════════════════════════════════════
describe('summarizer — never throws', () => {
  test('45. summarize handles numeric input', async () => {
    const r = await createSummarizer().summarize(12345);
    assert.ok(r);
  });

  test('46. summarize handles very long text without error', async () => {
    const long = 'This is a long sentence. '.repeat(500);
    const r = await createSummarizer().summarize(long);
    assert.ok(r && r.summary);
    assert.ok(r.bullet_points.length <= 5);
  });

  test('47. extractEntities on garbage', async () => {
    const r = await createSummarizer().extractEntities('###$$$%%%^^^');
    assert.ok(r && r.people && r.companies && r.amounts && r.dates && r.locations);
  });

  test('48. classify with weird categories does not throw', async () => {
    const r = await createSummarizer().classify('hello there', [null, undefined, 'ok', { name: 'x' }]);
    assert.ok(r && typeof r.category === 'string');
  });
});
