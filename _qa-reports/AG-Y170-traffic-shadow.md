# AG-Y170 — Traffic Shadowing Middleware (`traffic-shadow`)

**Agent:** Y-170
**Swarm:** Mega-ERP Techno-Kol Uzi — Kobi EL (DevOps / SRE vertical)
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/devops/traffic-shadow.js`
**Tests:** `onyx-procurement/test/devops/traffic-shadow.test.js`
**Rule of the house:** **לא מוחקים — רק משדרגים ומגדלים.**
**Zero deps:** `node:http`, `node:https`, `node:events`, `node:crypto` only.

---

## 1. Summary / סיכום

### English

`traffic-shadow` is a drop-in `(req, res, next)` middleware that duplicates
live HTTP traffic to a **shadow upstream** without affecting the primary
response path. It compares primary and shadow JSON bodies, emits diff
events, scrubs PII before any logging, and is safe against upstream
failures — the shadow call can never delay, crash or mutate the primary
response.

Key design choices:

- **Fire-and-forget dispatch.** `next()` is called synchronously. The
  shadow HTTP request is only issued *after* the primary `res.end` has
  been observed, so end-users feel zero extra latency regardless of
  shadow state.
- **Zero dependencies.** Only `node:http` / `node:https` / `node:events`
  / `node:crypto`. No Express, no Axios, no diffing library.
- **Test-friendly transport.** An `httpAgent` option lets tests inject
  an in-memory fake that mimics the `.request()` contract; no real
  sockets are opened anywhere in the suite.
- **Sampling 0–100.** `sampleRate` clamps at both ends; `0` disables
  shadowing entirely, `100` shadows every eligible request. A custom
  `rng` can be injected for deterministic test runs.
- **PII scrubber.** Recursive, cycle-safe deep-clone that masks any
  key matching the PII substring list (`password`, `token`,
  `api_key`/`api-key`, `authorization`, `cookie`, `credit_card`,
  `iban`, `email`, `phone`, `national_id`, `tax_file`, `mobile`,
  `address`, `dob`, `birth`, …). Plus regex-based string scrubbing
  for raw values (email, Israeli phone, `IL` IBAN, JWT, 16-digit card).
- **Bilingual diff summary.** Every emitted diff carries `summary.he`
  and `summary.en`. Example match: `תגובת הצללה זהה לתגובה הראשית` /
  `Shadow response matches primary`. Example mismatch:
  `נמצאו הבדלים בין ראשי לצל — שונו: 1, נוספו: 1, הוסרו: 0` /
  `Differences detected — changed: 1, added: 1, removed: 0`.
- **Never-delete semantics.** A ring buffer (default 500, configurable)
  holds every diff/error record. `setSampleRate` does **not** touch
  history.

### עברית

`traffic-shadow` הוא middleware בסגנון `(req, res, next)` שמשכפל תעבורה
חיה לשירות-צל **מבלי לפגוע במסלול התגובה הראשי**. המערכת משווה את גוף
ה-JSON של שני הצדדים, מפיקה אירועי diff דו-לשוניים, מוחקת מידע רגיש
לפני כל רישום, ושורדת כל כשל של השירות המשני — שליחת הצל לעולם לא
תעכב, לא תפיל ולא תשנה את התגובה הראשית.

עקרונות:

- **שיגור ושכיחה.** `next()` נקרא סינכרונית. בקשת הצל נשלחת רק אחרי
  ש-`res.end` הראשי נצפה, כך שהמשתמש לעולם לא מרגיש השהיה נוספת.
- **ללא תלויות חיצוניות** — רק מודולים מובנים של Node.
- **טרנספורט ניתן להזרקה** — אובייקט `httpAgent` מדומה מאפשר בדיקות
  יחידה בלי סוקטים אמיתיים.
- **דגימה 0–100** — `0` מנטרל, `100` מצלל כל בקשה, ערכים ביניים
  מכובדים מול מחולל מספרים אקראיים שניתן להזריק.
- **מוחק מידע אישי** (PII) — עומק רקורסיבי, עמיד למעגלים, משווה
  גם לפי שמות מפתחות וגם בדפוסי ערכים (דוא"ל, טלפון ישראלי, IBAN,
  JWT, כרטיסי אשראי).
- **סיכום דו-לשוני לכל diff** — עברית + אנגלית.
- **לא מוחקים** — Ring buffer מחזיק כל תוצאה; `setSampleRate` לא
  מוחק היסטוריה.

---

## 2. Running the tests / הרצת הבדיקות

```bash
cd onyx-procurement
node --test test/devops/traffic-shadow.test.js
```

Expected tail:

```
ℹ tests 35
ℹ suites 0
ℹ pass 35
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Runtime on a cold Node 20: ~140 ms.

---

## 3. Public API / ממשק ציבורי

### `createTrafficShadow(options)`

| Option           | Type                              | Default    | Meaning / משמעות                                                   |
| ---------------- | --------------------------------- | ---------- | ------------------------------------------------------------------ |
| `target`         | `string` \| parsed object         | —          | **Required.** Shadow upstream URL (e.g. `http://shadow.svc:9090/prefix`). |
| `sampleRate`     | `number` (0–100)                  | `10`       | Percentage of eligible requests to shadow.                         |
| `timeoutMs`      | `number`                          | `5000`     | Shadow request timeout. Primary is never blocked.                  |
| `maxBodyBytes`   | `number`                          | `1048576`  | Upper bound on captured shadow body; truncates past this.          |
| `ringSize`       | `number`                          | `500`      | Capacity of the in-memory diff ring buffer.                        |
| `httpAgent`      | object w/ `.request()`            | `node:http`| Test injection point — inject a fake for unit tests.               |
| `logger`         | `(level, payload) => void`        | `null`     | Side-channel logger called for every emitted event.                |
| `rng`            | `() => number`                    | `Math.random` | PRNG used for sampling; inject for deterministic tests.         |
| `filter`         | `(req) => boolean`                | `null`     | Eligibility predicate; returning `false` emits `skip` with reason `filter`. |
| `scrubResponses` | `boolean`                         | `true`     | When false, raw bodies are stored in history (not recommended).    |

### Returned bundle / ערכת החזרה

| Member              | Purpose                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `middleware`        | `(req, res, next)` Express-compatible function.                        |
| `events`            | `EventEmitter` — `diff`, `match`, `mismatch`, `error`, `skip`.         |
| `stats()`           | Snapshot of counters + current sampleRate.                             |
| `history()`         | Snapshot of the ring buffer (diffs + errors).                          |
| `clearHistory()`    | Explicit, never implicit.                                              |
| `setSampleRate(n)`  | Runtime sample-rate change. Does not touch history.                    |
| `forwardToShadow()` | Manual dispatch helper for background tooling.                         |
| `diffBodies(a,b)`   | Pure JSON diff with bilingual summary.                                 |
| `compareResponses(p,s)` | Status + body comparison producing a bilingual verdict.            |
| `scrub(obj)`        | Recursive, cycle-safe PII scrubber.                                    |
| `scrubString(s)`    | Regex-based value scrubber (email/phone/IBAN/JWT/card).                |
| `isPiiKey(k)`       | Pure predicate — useful for downstream auditing.                       |
| `shouldSample()`    | Expose the sampler for probing.                                        |
| `close()`           | Remove all listeners for graceful shutdown.                            |
| `_constants`        | Frozen constants table (PII lists, event names, limits).               |

---

## 4. Event wiring example / דוגמת שילוב

```js
const express = require('express');
const { createTrafficShadow } = require('./src/devops/traffic-shadow.js');

const shadow = createTrafficShadow({
  target: process.env.SHADOW_URL || 'http://shadow.internal:9090',
  sampleRate: Number(process.env.SHADOW_RATE || 10),
  timeoutMs: 4000,
  filter: (req) => !req.url.startsWith('/internal/health'),
});

shadow.events.on('mismatch', (ev) => {
  console.warn('[shadow:mismatch]', ev.id, ev.diff.summary.en);
  console.warn('[shadow:mismatch]', ev.id, ev.diff.summary.he);
});
shadow.events.on('error', (ev) => {
  console.error('[shadow:error]', ev.id, ev.error.message);
});

const app = express();
app.use(express.json());
app.use(shadow.middleware);
// … normal routes …
```

---

## 5. Test matrix / מטריצת בדיקות

**35 tests, all passing** (`node --test`, zero deps).

| # | Test                                                                                    | What it proves                                             |
| - | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1 | `CONSTANTS — exposes the expected symbols`                                              | Public constants table frozen and well-formed.             |
| 2 | `scrub — masks PII keys recursively without mutating input`                             | Deep PII scrub is non-destructive.                         |
| 3 | `scrub — handles circular references safely`                                            | Cycle-safe scrubber never loops.                           |
| 4 | `scrubString — redacts email/phone/IBAN/JWT patterns`                                   | Value-level PII regexes bite correctly.                    |
| 5 | `isPiiKey — recognises common PII keys case-insensitively`                              | Key detection covers hyphen + underscore variants.         |
| 6 | `clampSampleRate — keeps values inside [0,100]`                                         | Rate clamping is inclusive + tolerant of junk input.       |
| 7 | `makeSampler — deterministic with injected RNG`                                         | RNG injection yields predictable sampling.                 |
| 8 | `makeSampler — 0% never samples, 100% always samples`                                   | Boundary behaviour.                                        |
| 9 | `diffBodies — identical primitives and objects match`                                   | Equal inputs produce `equal:true` + bilingual summary.     |
| 10 | `diffBodies — detects added/removed/changed keys with paths`                           | Structured diff report.                                    |
| 11 | `diffBodies — arrays: length mismatch recorded as added/removed`                       | Arrays handled distinctly from objects.                    |
| 12 | `diffBodies — nested mismatch carries scrubbed values`                                 | Nested scrub still produces readable non-PII paths.        |
| 13 | `compareResponses — matches when status + body match`                                  | Happy path comparator.                                     |
| 14 | `compareResponses — mismatched status bubbles into summary`                            | Status diff appears in bilingual summary.                  |
| 15 | `compareResponses — unparseable JSON yields explicit bilingual marker`                 | Graceful fallback for non-JSON bodies.                     |
| 16 | `parseTarget — URL string round-trip`                                                  | Target parser.                                             |
| 17 | `parseTarget — invalid input returns null`                                             | Hostile input tolerated.                                   |
| 18 | `captureResponse — wraps res.end and reports final body once`                          | Response-body interception works exactly once per request. |
| 19 | `middleware — samples at 100% and emits a match event`                                 | End-to-end happy path via the mock agent.                  |
| 20 | `middleware — emits mismatch and records diff paths`                                   | End-to-end mismatch path.                                  |
| 21 | `middleware — sampleRate 0 skips everything and calls next()`                          | 0% rate short-circuits shadow entirely.                    |
| 22 | `middleware — filter() predicate can veto a sampled request`                           | Eligibility filter emits `skip` with `reason='filter'`.    |
| 23 | `middleware — shadow error never corrupts stats and never rejects`                     | Shadow failures are isolated from the primary path.        |
| 24 | `middleware — fires next() before shadow completes (non-blocking)`                     | Latency guarantee — primary never waits on shadow.         |
| 25 | `middleware — PII in response body is scrubbed before ring buffer storage`             | End-to-end PII scrubbing on both primary and shadow bodies.|
| 26 | `middleware — setSampleRate at runtime flips sampling behaviour`                       | Runtime reconfiguration.                                   |
| 27 | `middleware — ring buffer capped to configured ringSize`                               | Bounded memory.                                            |
| 28 | `middleware — emits diff event alongside match/mismatch`                               | Dual event stream — `diff` is always emitted.              |
| 29 | `middleware — correlationId threads x-request-id header when present`                  | Tracing integration.                                       |
| 30 | `middleware — logger receives bilingual error payload on shadow failure`               | Logger side-channel also gets errors.                      |
| 31 | `middleware — throws when target missing`                                              | Misconfiguration guard.                                    |
| 32 | `middleware — does not delete history on setSampleRate change`                         | Never-delete invariant.                                    |
| 33 | `stats() — returns a snapshot including current sampleRate`                            | Stats reflect current state.                               |
| 34 | `tryParseJson — accepts objects, null, empty, malformed`                               | JSON parser tolerances.                                    |
| 35 | `end-to-end — mixed match/mismatch/error batch keeps counters consistent`              | Realistic multi-request run: 2 match + 1 mismatch + 1 error. |

**Final tally:** 35 passed, 0 failed, 0 skipped — `duration_ms ≈ 126`.

---

## 6. Operational guidance / הנחיות הפעלה

### Recommended sampling plan

| Environment         | sampleRate | Notes                                                          |
| ------------------- | ---------- | -------------------------------------------------------------- |
| Local dev           | `100`      | Fast feedback; mock shadow upstream.                           |
| Staging             | `50`       | Exercise diff pipeline aggressively.                           |
| Canary (production) | `5`        | Ramp up gradually to `25` once diffs stabilise.                |
| Production steady   | `1–10`     | Low background bleed. Alert on `mismatched > matched * 0.01`.  |

### Rollback

The middleware is additive. To neutralise it without removing code:

```js
shadow.setSampleRate(0);   // stops all shadowing immediately
```

History is preserved intact for post-mortem.

### Alerts / התראות

Wire `events.on('mismatch', …)` and `events.on('error', …)` into the
existing ONYX alert-manager (`src/ops/alert-manager.js`). Recommended
rules:

- `error` rate > 1% of sampled → page the on-call SRE.
- `mismatch` rate > 0.5% of sampled → open a Y-series investigation
  ticket with the ring-buffer snapshot attached.

### PII envelope / מעטפת מידע אישי

Every emitted record passes through `scrub()` for objects and
`scrubString()` for raw-text edges. If you extend the PII list, do so
in `CONSTANTS.PII_KEY_SUBSTRINGS` — the frozen table documents what
the auditors already signed off on.

---

## 7. Out-of-scope / מחוץ לגבולות הסוכן

- **Binary / streaming bodies** — only JSON/text bodies are compared;
  binary payloads (PDF, ZIP, images) are passed to the shadow but the
  comparator reports them as "not valid JSON on both sides" with a
  bilingual marker. This is intentional — binary diffing belongs in a
  dedicated agent.
- **TLS client-certs on shadow side** — not configured here. Add a
  custom `httpAgent` if your shadow cluster mTLS.
- **Cross-region retries** — there are none. Shadow is fire-and-forget
  by design.

---

## 8. Commit suggestion / הצעת commit

```
feat(devops): add traffic-shadow middleware (Y-170)

- (req,res,next) middleware forwards to primary and shadow concurrently
- fire-and-forget shadow dispatch, never blocks primary response
- sampling 0–100 + optional filter predicate
- recursive PII scrubber (keys + regex values) + bilingual diff summary
- EventEmitter stream: diff / match / mismatch / error / skip
- bounded ring buffer history, runtime setSampleRate
- 35 node:test cases with mocked HTTP agent (no real sockets)
- zero dependencies — node:http/https/events/crypto only
```

---

**לא מוחקים — רק משדרגים ומגדלים.**
**End of report — AG-Y170.**
