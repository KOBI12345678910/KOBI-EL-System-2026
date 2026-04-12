# AG-Y168 — Feature Flag Distribution Engine / מנוע הפצת דגלי תכונה

**Agent:** Y-168
**Module:** `onyx-procurement/src/devops/flag-distributor.js`
**Tests:** `onyx-procurement/test/devops/flag-distributor.test.js`
**Date:** 2026-04-11
**Rule / חוק הבית:** "לא מוחקים רק משדרגים ומגדלים" — no deletions, only non-destructive upgrades.
**Dependencies:** Zero — Node core only (`Buffer`, `Math.imul`).

---

## 1. Scope / היקף

### 1.1 EN — What this agent delivers

A **server-side feature flag distribution engine** for the Techno-Kol Uzi
Mega-ERP. Where Agent **X-97** manages config KV pairs and Agent **X-98**
defines static flags with FNV-1a + rule trees, **Y-168** is the *distribution
layer* that decides, for a given `(flagKey, userContext)` pair, whether the
flag is **enabled**, **which variant** the user sees, and **why**.

Key properties:

- Consistent hashing via **MurmurHash3 32-bit** (pure JS, UTF-8 aware so
  Hebrew flag names hash stably).
- Percentage rollout `0..100` with 0.01 % precision sticky buckets.
- Targeting by `userId`, `emailDomain`, `segment`, `country`, `tenantId`.
- **Kill switch** that overrides everything — rollout, targeting, default.
- **Flag dependencies** — a flag depends on one or more prerequisite flags.
- **Bilingual (he+en) audit log** — every evaluation, every administrative
  change, every kill-switch toggle records both Hebrew and English messages.
- Zero external dependencies — Node core only.
- `evaluate()` never throws — graceful degradation is the contract.

### 1.2 HE — מה הסוכן מספק

**מנוע הפצת דגלי תכונה בצד-שרת** עבור מערכת ERP של טכנו-קול עוזי. בעוד
ש-Agent **X-97** מנהל הגדרות config, ו-Agent **X-98** מגדיר דגלים סטטיים
עם FNV-1a ועצי-כללים, **Y-168** הוא **שכבת ההפצה** שמחליטה, עבור זוג
`(flagKey, userContext)` נתון, האם הדגל **מופעל**, באיזה **ואריאנט**
המשתמש יראה, ו**מדוע**.

תכונות עיקריות:

- גיבוב עקבי (Consistent hashing) באמצעות **MurmurHash3 32-bit** (JS טהור,
  תומך UTF-8 כך שגם שמות דגלים בעברית מגובבים ביציבות).
- פריסה הדרגתית `0..100%` עם דיוק של 0.01% ודליים יציבים.
- מיקוד לפי `userId`, `emailDomain`, `segment`, `country`, `tenantId`.
- **מתג כיבוי חירום** עוקף הכל — פריסה, מיקוד, ברירת מחדל.
- **תלות בין דגלים** — דגל תלוי בדגל/ים אחרים שחייבים להיות פעילים.
- **יומן ביקורת דו-לשוני (he+en)** — כל הערכה, כל שינוי ניהולי, כל הפעלת
  מתג חירום מתועדים בעברית וגם באנגלית.
- אפס תלויות חיצוניות — רק Node core.
- `evaluate()` לעולם לא זורק חריגה — התרסקות שקטה עם ברירת מחדל בטוחה.

---

## 2. How It Differs From X-97 and X-98 / הבחנה מסוכנים קודמים

| Agent | Role / תפקיד | Hash | Rule style |
|-------|-------------|------|------------|
| X-97  | Config KV manager / מנהל הגדרות | n/a | typed schema validation |
| X-98  | Static flag registry / רישום דגלים | **FNV-1a** | AND/OR/NOT rule tree, 11 operators |
| **Y-168** | **Distribution engine** / **מנוע הפצה** | **MurmurHash3** | Targeting lists + consistent-hash bucket + dependency graph |

Y-168 is **additive**, not a replacement: a future integration agent can
import X-98 flag state, feed it into Y-168 for distribution decisions, and
have both engines coexist. Following the rule **"לא מוחקים רק משדרגים"**,
no existing code is touched.

---

## 3. Architecture / ארכיטקטורה

```
                ┌──────────────────────────────┐
                │      FlagDistributor         │
                │  ┌────────────────────────┐  │
user context ─► │  │ evaluate(key, ctx)     │  ├──► { enabled, variant,
                │  └──┬─────────────────────┘  │      reason (he+en),
                │     │                        │      bucket, rollout,
                │     ▼                        │      killed, version }
                │  ┌──────────────────┐        │
                │  │ killSwitch gate  │        │
                │  ├──────────────────┤        │
                │  │ enabled gate     │        │
                │  ├──────────────────┤        │         ┌───────────────┐
                │  │ dependsOn recurse│ ◄──────┼────────►│ other flags   │
                │  ├──────────────────┤        │         └───────────────┘
                │  │ targeting rules  │        │
                │  ├──────────────────┤        │
                │  │ rollout bucket   │◄─── murmurHash3_32(flagKey::userKey)
                │  ├──────────────────┤        │
                │  │ variant pick     │◄─── sticky modulo
                │  └──────────────────┘        │
                │            │                 │
                │            ▼                 │
                │  ┌───────────────────────┐   │
                │  │ bilingual audit log   │───┼──► in-memory ring + sink
                │  └───────────────────────┘   │
                └──────────────────────────────┘
```

---

## 4. Evaluation Pipeline / סדר ההערכה

`evaluate(flagKey, userContext)` runs the following ordered gates — the
**first** one to fire returns the result and writes an audit entry:

1. **Not registered** → `enabled:false`, reason `not-registered`.
2. **Kill switch** → `enabled:false`, `killed:true`, reason `killed`.
3. **Global enabled=false** → reason `disabled-global`.
4. **Dependency chain** — recurse into each prerequisite flag:
   - Missing flag → reason `dependency-missing`.
   - Prerequisite disabled → reason `dependency-off`.
5. **Targeting** — any matching rule enables the flag immediately:
   - `target-user` (userId in list)
   - `target-email-domain` (domain of `ctx.email`)
   - `target-segment`
   - `target-country`
   - `target-tenant`
6. **Rollout bucket**:
   - `100 %` → reason `rollout-100`, always on.
   - `0 %`   → reason `rollout-0` (or `target-excluded` if targets existed).
   - Otherwise compare `bucket < percent*100` (bucket is `[0,10000)` for
     0.01 % precision) → reason `rollout-in` / `rollout-out`.

Every branch populates a bilingual `reason` object:

```js
reason: {
  code: 'rollout-in',
  he:   'משתמש נכלל בדלי הפריסה — 1234/2500',
  en:   'user bucket within rollout — 1234/2500'
}
```

---

## 5. Consistent Hashing — MurmurHash3 / גיבוב עקבי

**Why MurmurHash3 and not FNV-1a?** Agent X-98 already used FNV-1a. Y-168
uses MurmurHash3 so that the same `userId` produces **different buckets** in
the two engines (no cross-engine leakage of rollout state). MurmurHash3 also
has better avalanche properties, which shows in the distribution test below.

**UTF-8 stable.** The key is encoded via `Buffer.from(key, 'utf8')` so
Hebrew flag keys like `דגל-חדש` hash consistently across Node versions and
operating systems. This was explicitly verified in test `Y168-01`.

**Bucket precision.** The bucket is `murmurHash3_32(flagKey + '::' + userKey) % 10000`,
giving four-digit precision — rollouts down to `0.01 %` work correctly.

**Flag salting.** Because the flag key is prepended to the user key, a
single `userId` lands in an **independent** bucket on every flag. The test
suite verifies `< 5 %` cross-flag collision over 500 users
(`Y168-02`). In practice this prevents the well-known "everyone in the early
buckets gets every beta" pathology.

Distribution accuracy measured in `Y168-14`:

| Target | Observed (10 000 users) | Tolerance |
|--------|-------------------------|-----------|
| 25 %   | typically 24.5 – 25.5 % | ± 3 %     |

---

## 6. Targeting Rules / כללי מיקוד

Targeting **expands** the rollout audience — a match short-circuits to
*enabled*. If the user doesn't match **any** targeting rule, evaluation
falls through to the rollout bucket. Example:

```js
fd.register({
  key: 'new-checkout',
  rollout: 10,
  targeting: {
    userIds:      ['u-vip-1', 'u-vip-2'],     // always on
    emailDomains: ['tko.co.il'],              // internal users always on
    segments:     ['beta'],                   // beta testers always on
    countries:    ['IL'],                     // all Israeli users always on
    tenantIds:    ['tenant-7'],               // VIP tenant always on
  },
});
```

Everyone who matches any filter is in. Everyone else goes through a sticky
10 % rollout. Rule of thumb: **targeting is the allow-list, rollout is the
population**.

### 6.1 Excluded users

When `rollout === 0` **and** targeting is configured **and** the user
matches none of the rules, the reason is `target-excluded` (not `rollout-0`)
so ops can distinguish "no one is in the rollout" from "this user simply
doesn't match any targeting rule".

---

## 7. Kill Switch / מתג כיבוי חירום

The kill switch is the **highest-priority** gate — it overrides rollout,
targeting, variants, and default. Verified in `Y168-05`: a flag with
`rollout:100`, `killSwitch:true`, and a user in the targeting list still
evaluates to `enabled:false`.

Toggle via:

```js
fd.setKillSwitch('new-checkout', true,  'ops@tko.co.il');  // emergency off
fd.setKillSwitch('new-checkout', false, 'ops@tko.co.il');  // release
```

Both events write a versioned audit entry with before/after snapshots and
bilingual messages:

```json
{
  "event": "kill-switch",
  "flagKey": "new-checkout",
  "actor": "ops@tko.co.il",
  "version": 3,
  "message_he": "מתג כיבוי חירום הופעל עבור new-checkout",
  "message_en": "kill switch engaged for new-checkout"
}
```

---

## 8. Flag Dependencies / תלויות בין דגלים

A flag may declare `dependsOn: ['other-flag', ...]`. The engine recursively
evaluates each prerequisite with the **same user context**:

- Missing prerequisite → `dependency-missing` (fail-safe).
- Prerequisite evaluates to `false` → `dependency-off`.

This allows us to build **guard rails**: an experimental `advanced-checkout`
flag can depend on a stable `core-checkout` flag, so engaging the kill
switch on `core` automatically turns `advanced` off for every user in one
atomic action. Verified in `Y168-07`.

---

## 9. Bilingual Audit Log / יומן ביקורת דו-לשוני

Every decision — register, upgrade, rollout change, kill-switch toggle, and
**every single evaluation** — writes an entry that contains:

```json
{
  "ts":         "2026-04-11T12:34:56.789Z",
  "event":      "evaluate",
  "flagKey":    "new-checkout",
  "version":    4,
  "user":       "u-42",
  "enabled":    true,
  "variant":    "B",
  "bucket":     2418,
  "rollout":    25,
  "killed":     false,
  "reasonCode": "rollout-in",
  "message_he": "דגל new-checkout הופעל למשתמש u-42 — משתמש נכלל בדלי הפריסה — 2418/2500",
  "message_en": "flag new-checkout enabled for user u-42 — user bucket within rollout — 2418/2500"
}
```

**Storage.** In-memory ring buffer of configurable size (default 500).
An optional `auditSink` callback lets the host pipe entries to JSONL,
Elastic, Kafka, or any other sink without modifying the engine. The
sink is wrapped in a try/catch — **an audit failure never breaks an
evaluation**.

**Language table.** Every reason code has a Hebrew and English phrase in
the `REASONS` table, so the audit messages are consistent even as new gates
are added. Currently 16 reason codes — see `Y168-20`.

---

## 10. Public API / API ציבורי

```js
const { FlagDistributor } = require('./src/devops/flag-distributor');
const fd = new FlagDistributor({
  hashSeed: 0,           // optional murmur seed
  auditRingSize: 500,    // in-memory ring buffer size
  clock: () => new Date(),   // injectable for tests
  auditSink: entry => appendToJsonl(entry),
});

// ─── Registration ─────────────────────────────────────────
fd.register({
  key:            'new-checkout',
  enabled:        true,
  killSwitch:     false,
  rollout:        25,
  variants:       ['A', 'B'],
  targeting: {
    userIds:      ['u-1'],
    emailDomains: ['tko.co.il'],
    segments:     ['beta'],
    countries:    ['IL'],
    tenantIds:    ['tenant-7'],
  },
  dependsOn:      ['core-checkout'],
  description_he: 'תשלום חדש',
  description_en: 'New checkout',
  owner:          'procurement-team',
});

// ─── Evaluation ───────────────────────────────────────────
const r = fd.evaluate('new-checkout', {
  userId:  'u-42',
  email:   'uzi@tko.co.il',
  segment: 'beta',
  country: 'IL',
  tenantId:'tenant-7',
});
// r.enabled / r.variant / r.reason / r.bucket / r.rollout / r.killed

fd.isEnabled('new-checkout', ctx);   // boolean shortcut

// ─── Admin ────────────────────────────────────────────────
fd.setRollout('new-checkout', 50, 'ops@tko.co.il');
fd.setKillSwitch('new-checkout', true, 'ops@tko.co.il');
fd.getFlag('new-checkout');
fd.listFlags();

// ─── Audit ────────────────────────────────────────────────
fd.getAuditLog();       // all entries
fd.getAuditLog(50);     // most recent 50
fd.getStats();          // { evalCount, auditSize, flagCount, hashSeed }
```

---

## 11. Hebrew Glossary / מילון מונחים

| English | עברית | Notes |
|---------|-------|-------|
| Feature flag | דגל תכונה | base primitive |
| Distribution engine | מנוע הפצה | the Y-168 layer |
| Consistent hashing | גיבוב עקבי | MurmurHash3 32-bit |
| Sticky bucket | דליי יציב | same user → same bucket |
| Rollout percent | אחוז פריסה | 0..100 |
| Targeting | מיקוד | allow-list overlay |
| Segment | פלח משתמשים | marketing cohort |
| Tenant | ארגון לקוח | multi-tenant key |
| Kill switch | מתג כיבוי חירום | highest-priority gate |
| Dependency | תלות | prerequisite flag |
| Variant | וואריאנט / גרסה | A/B bucket |
| Audit log | יומן ביקורת | bilingual, append-only |
| Reason code | קוד סיבה | machine-readable reason |
| Non-destructive upgrade | שדרוג לא הרסני | never delete, bump version |
| Ring buffer | מאגר טבעתי | fixed-size in-memory log |
| Evaluation | הערכה | single `(flag, user)` decision |
| Graceful degradation | נפילה רכה | never throw, fall safe |

---

## 12. Test Matrix / מטריצת בדיקות

File: `test/devops/flag-distributor.test.js` — **20 / 20 pass**.

| # | Case | Result |
|---|------|--------|
| Y168-01 | MurmurHash3 determinism, unsigned 32-bit, Hebrew stable | pass |
| Y168-02 | bucketOf sticky per (flag,user); flag salting < 5% collision | pass |
| Y168-03 | register + listFlags + non-destructive upgrade (version bump) | pass |
| Y168-04 | unknown flag → reason `not-registered` | pass |
| Y168-05 | kill switch overrides 100% rollout + targeting | pass |
| Y168-06 | enabled=false globally → reason `disabled-global` | pass |
| Y168-07 | flag-depends-on-flag; prereq off propagates | pass |
| Y168-08 | missing dependency → reason `dependency-missing` | pass |
| Y168-09 | targeting by userId | pass |
| Y168-10 | targeting by email domain (case insensitive) | pass |
| Y168-11 | targeting by segment / country / tenantId + excluded | pass |
| Y168-12 | targeting + 10 % rollout composition (~10 % hit rate) | pass |
| Y168-13 | rollout 0 % and 100 % hard boundaries (500 users each) | pass |
| Y168-14 | rollout 25 % accuracy ± 3 % over 10 000 users | pass |
| Y168-15 | sticky variant assignment + pool balance (A ≈ B) | pass |
| Y168-16 | audit log bilingual he+en for every evaluate | pass |
| Y168-17 | setKillSwitch / setRollout emit audit + throw on unknown | pass |
| Y168-18 | audit ring trims at configured `auditRingSize` | pass |
| Y168-19 | `evaluate()` never throws on bad input; rollout clamps | pass |
| Y168-20 | internal helpers (`_extractDomain`, `_clampRollout`, `_pickVariant`, `REASONS`) | pass |

**Run:** `node --test test/devops/flag-distributor.test.js`
**Total:** 20 / 20 pass, ≈ 252 ms.

---

## 13. Files Touched (Non-destructive) / קבצים שנגעו בהם

- NEW `onyx-procurement/src/devops/flag-distributor.js`  (≈ 490 LOC)
- NEW `onyx-procurement/test/devops/flag-distributor.test.js` (20 cases)
- NEW `_qa-reports/AG-Y168-flag-distributor.md` (this file)

No existing file modified. No file deleted. Following the Uzi rule:
**לא מוחקים רק משדרגים ומגדלים**.

---

## 14. Integration Notes / הערות אינטגרציה

Wiring into `server.js` (future agent, not this one):

```js
const { FlagDistributor } = require('./src/devops/flag-distributor');
const fd = new FlagDistributor({
  auditSink: entry => fs.appendFile(
    path.join(__dirname, 'data', 'flag-distribution-audit.jsonl'),
    JSON.stringify(entry) + '\n',
    () => {}
  ),
});

// Seed on boot — register is idempotent (version bumps).
fd.register({
  key: 'core-checkout',
  rollout: 100,
  description_he: 'תשלום בסיסי',
  description_en: 'Core checkout',
});
fd.register({
  key: 'new-checkout',
  rollout: 10,
  variants: ['classic', 'experimental'],
  dependsOn: ['core-checkout'],
  description_he: 'תשלום חדש — פריסה הדרגתית',
  description_en: 'New checkout — gradual rollout',
});

// Express middleware pattern:
app.use((req, res, next) => {
  req.ff = (key) => fd.evaluate(key, {
    userId:   req.user && req.user.id,
    email:    req.user && req.user.email,
    segment:  req.user && req.user.segment,
    country:  req.user && req.user.country,
    tenantId: req.user && req.user.tenantId,
  });
  next();
});

app.get('/checkout', (req, res) => {
  const r = req.ff('new-checkout');
  if (r.enabled && r.variant === 'experimental') {
    return res.render('checkout-v2');
  }
  return res.render('checkout-v1');
});

// Admin API for kill switch:
app.post('/admin/flags/:key/kill', requireOps, (req, res) => {
  fd.setKillSwitch(req.params.key, !!req.body.on, req.user.email);
  res.json(fd.getFlag(req.params.key));
});
```

---

## 15. Operational Notes / תפעול

- **Shadowing X-98**: Y-168 and X-98 can coexist. An integration helper
  (future agent) can subscribe to X-98 `define` events and register the
  same flag in Y-168 for distribution. Neither engine modifies the other.
- **Audit volume**: each evaluation writes one audit entry. For a system
  with 100 RPS and 10 flag checks per request, expect ≈ 1000 audit
  entries/sec — the in-memory ring defaults to 500 entries (≈ 0.5 s) so a
  production host **must** configure `auditSink` to pipe to JSONL/Kafka.
- **No file I/O in tests**: `flag-distributor.js` writes nothing to disk by
  itself. All persistence is through the `auditSink` callback, so unit
  tests run in pure memory.
- **Hash seed rotation**: the `hashSeed` constructor option is reserved for
  future A/B **experiment isolation** — bumping the seed reshuffles every
  bucket, which is useful for clean-slate experiments after a release.

---

## 16. Rule Compliance Summary / עמידה בחוקי הבית

| Rule / חוק | Status |
|-----------|--------|
| לא מוחקים רק משדרגים ומגדלים — no deletions | ✓ no `deleteFlag`, only `register` (version bump) |
| Zero external deps | ✓ Node core only (`Buffer`, `Math.imul`) |
| Bilingual (he + en) | ✓ REASONS table, audit messages, glossary, this report |
| Different from X-97 / X-98 | ✓ MurmurHash3 (not FNV-1a); targeting + deps (not rule tree) |
| ≥ 15 tests | ✓ 20 tests, all passing |
| Distribution engine with consistent hashing | ✓ MurmurHash3, sticky bucket, flag-salted |
| Percentage rollout | ✓ 0..100, 0.01 % precision |
| User targeting (5 axes) | ✓ userId, emailDomain, segment, country, tenantId |
| Kill switch overrides everything | ✓ highest-priority gate, test Y168-05 |
| Flag dependencies | ✓ recursive with cycle-safe ordering, tests Y168-07/08 |
| Bilingual audit of every decision | ✓ `message_he` + `message_en` on every entry |

---

**End of report — AG-Y168 flag-distributor**
**סוף דוח — סוכן Y-168 מנוע הפצת דגלים**
