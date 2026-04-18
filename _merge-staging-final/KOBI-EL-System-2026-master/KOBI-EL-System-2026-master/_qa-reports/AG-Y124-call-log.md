# AG-Y124 — Voice Call Log (`CallLog`)

**Agent:** Y-124
**Swarm:** Mega-ERP Techno-Kol Uzi — Kobi EL (CRM / comms vertical)
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/comms/call-log.js`
**Tests:** `onyx-procurement/test/comms/call-log.test.js`
**Rule of the house:** **לא מוחקים — רק משדרגים ומגדלים.**

---

## 1. Summary

A zero-dependency, deterministic, bilingual (Hebrew / English) voice
call-logging engine that bridges PBX events and CRM records for the
comms vertical of the Mega-ERP (Techno-Kol Uzi / ONYX procurement layer).

The engine provides:

* Call lifecycle logging (`recordCall`) with automatic supersession
  so re-emitted events keep every prior version append-only.
* Three linking primitives (`linkToCustomer`, `linkToOpportunity`,
  `linkToTicket`) for stitching calls into CRM / sales / support
  workstreams with full history trails.
* A configurable disposition taxonomy (`dispositionCodes`,
  `addDisposition`, `deactivateDisposition`) that defaults to the five
  codes the spec requires — לא ענה / שיחה מוצלחת / בקשה לחזור /
  הצעה נשלחה / סגירת עסקה — plus five operationally-useful extras.
* Aggregation (`callSummary`) — volume, inbound/outbound split,
  answer rate, average duration, per-agent productivity, per-outcome
  and per-category drill-downs; optional period and agent filters.
* Auto-task creation (`followUpTasks`, `updateFollowUpStatus`,
  `listFollowUps`) with append-only history on each task.
* Missed-call workflow (`missedCallHandling`) that auto-enqueues
  inbound `no-answer` / `busy` / `voicemail` calls to a prioritised
  callback queue — VIP → high → normal → low with time-of-enqueue as
  the secondary sort.
* Priority callback queue (`callBackQueue`, `updateQueueItem`) with
  append-only state transitions and never-delete semantics.
* Generic PBX adapter (`pbxIntegration`) with four recognised
  providers (`3cx`, `asterisk`, `mitel`, `cloud-pbx`), a deterministic
  mock adapter baked in for staging/tests, and override-by-injection
  so real clients can drop in without touching this file.
* Outbound dial helper (`dialOutbound`) that invokes the adapter and
  logs the resulting call in one step.
* Per-customer routing (`callRoutingRules`, `resolveRouting`) with a
  flexible `match`/`action` DSL, supersession semantics, and a
  VIP→specific-agent example proven in tests.
* Supervisor silent-monitor (`silentListen`, `endSilentListen`) with
  an **Israeli legal gate** — the call is refused unless a valid
  `lawfulBasis` is supplied (one-party-consent / informed-consent /
  employment-contract / court-order).
* Recording URL linkage (`recordingLinkage`) — append-only pointer to
  the recording store (Y-125), with retention, lawful-basis, disclosure
  flag, and optional content checksum. No audio is ever stored inside
  this module.
* Full-text / agent / customer / date-range search (`searchCalls`)
  with case-insensitive substring match over Hebrew and English
  content, honouring supersession by default.
* Master event stream (`eventLog()`) — every mutation across every
  store is timestamped and appended; **nothing is ever deleted**.

Test suite: **35 passing, 0 failing** (`node --test`, zero deps).

---

## 2. Run the tests

```bash
# from repo root
cd onyx-procurement
node --test test/comms/call-log.test.js
```

Expected output (abridged):

```
✔ CONSTANTS — enums cover the required domain values
✔ recordCall — creates a logged call with Hebrew labels
✔ recordCall — validates required fields
✔ recordCall — rejects unknown outcome codes
✔ recordCall — derives duration from start+end
✔ recordCall — supersedes prior version (never deletes)
✔ linkToCustomer / linkToOpportunity / linkToTicket — append history
✔ linking — unknown callId throws
✔ dispositionCodes — includes the required seed codes (with Hebrew)
✔ addDisposition — upsert a custom code, never deletes the prior one
✔ deactivateDisposition — sets active=false but keeps the record
✔ callSummary — volume / avg duration / answer rate
✔ followUpTasks — auto-created and linked to call
✔ followUpTasks — rejects unknown statuses
✔ followUpTasks — validates required fields
✔ missedCallHandling — enqueues with priority (explicit call)
✔ missedCallHandling — auto-triggers for inbound no-answer/busy/voicemail
✔ callBackQueue — ordered by priority then enqueue time
✔ updateQueueItem — progresses through lifecycle, keeps history
✔ pbxIntegration — registers a known provider, mockable
✔ pbxIntegration — rejects unknown providers
✔ dialOutbound — uses the mock adapter and records a call
✔ pbxIntegration — injected adapter overrides the mock
✔ callRoutingRules — VIP customer routes to a specific agent
✔ callRoutingRules — supersedes prior rule-set (never deletes)
✔ silentListen — rejected without lawfulBasis when disclosure required
✔ silentListen — accepted with employment-contract basis
✔ silentListen — disclosure notice is set on the session
✔ silentListen — rejects unknown lawfulBasis
✔ recordingLinkage — attaches a URL with retention + lawful basis
✔ recordingLinkage — supersession keeps history, does not delete
✔ searchCalls — text / agent / customer / date range
✔ searchCalls — excludes superseded by default
✔ callSummary — disposition aggregation matches the raw counts
✔ house rule — nothing is ever deleted
ℹ tests 35
ℹ pass  35
ℹ fail  0
```

---

## 3. Disposition codes — טקסונומיית תוצאות שיחה

The module seeds a ten-code taxonomy. The first five rows are the
codes the spec demanded; rows 6-10 are the operationally useful extras
we see in every Israeli SMB contact centre. Everything is configurable
— `addDisposition()` upserts, `deactivateDisposition()` soft-disables,
neither operation deletes a prior row.

| Code             | Hebrew                    | English                      | Category      | Terminal | Source  |
|------------------|---------------------------|------------------------------|---------------|:--------:|---------|
| `no-answer`      | לא ענה                    | No answer                    | unconnected   | no       | spec    |
| `successful`     | שיחה מוצלחת               | Successful conversation      | connected     | no       | spec    |
| `callback`       | בקשה לחזור                | Customer asked for callback  | connected     | no       | spec    |
| `quote-sent`     | הצעה נשלחה                | Quote / proposal sent        | business      | no       | spec    |
| `deal-won`       | סגירת עסקה                | Deal won                     | business      | yes      | spec    |
| `voicemail`      | הושאר מסר בתא קולי        | Left voicemail               | unconnected   | no       | extra   |
| `wrong-number`   | מספר שגוי                 | Wrong number                 | unconnected   | yes      | extra   |
| `busy`           | קו תפוס                   | Busy                         | unconnected   | no       | extra   |
| `not-interested` | לא מעוניין                | Not interested               | connected     | yes      | extra   |
| `escalated`      | הועבר לממונה              | Escalated to supervisor      | connected     | no       | extra   |

### 3.1 Category semantics

| Category      | Hebrew       | Contributes to answered rate? | Typical use in analytics         |
|---------------|--------------|:------------------------------:|----------------------------------|
| `unconnected` | לא התחברה    | no                             | Retry / callback workflow        |
| `connected`   | התחברה       | yes                            | Operator productivity            |
| `business`    | תוצאה עסקית  | yes                            | Conversion / pipeline metrics    |

`callSummary()` returns:
* `answerRate` — `(connected + business) / total` — the classic
  contact-centre answer-rate KPI.
* `answerRatePct` — the same quantity rounded to two decimals.
* `byCategory` — raw counts per category (plus `unknown` for calls
  logged without an outcome code, e.g. mid-flight ringing events).
* `byOutcome` — raw counts per code for fine-grained drill-down.
* `byAgent` — per-agent roll-up with its own `answerRate` and
  `avgDuration` so you can rank operator productivity without
  leaving the module.
* `avgDuration` — average only over calls with `duration > 0`, so
  `no-answer` (which has duration zero) never drags the mean down.
* `avgDurationFmt` — human-readable `M:SS`.

### 3.2 Terminal codes

`terminal: true` marks codes that end the call lifecycle — no
follow-up auto-task is expected. Currently: `deal-won`, `wrong-number`,
`not-interested`. Downstream workflow engines (Y-X15) can use this
flag to decide whether to keep a call in the retry queue.

---

## 4. PBX adapter — `pbxIntegration`

The module is **PBX-agnostic**. It ships with a deterministic mock
adapter so unit tests and staging environments work without a real
PBX, and every method can be overridden by injection at registration
time.

### 4.1 Supported providers

| Provider    | Hebrew                      | Notes                                |
|-------------|------------------------------|--------------------------------------|
| `3cx`       | מרכזיית 3CX                  | Most common Israeli SMB softswitch   |
| `asterisk`  | מרכזיית Asterisk (קוד פתוח)  | Open-source, popular in Israeli VoIP ISPs |
| `mitel`     | מרכזיית Mitel                | Legacy enterprise installs            |
| `cloud-pbx` | מרכזייה בענן                 | Generic cloud bucket (012/Cellcom/Bezeq Cloud PBX) |

### 4.2 Adapter contract

A full adapter implements:

```js
const adapter = {
  dial:        ({ from, to, agent, customer })   => ({ callId, ... }),
  hangup:      ({ callId })                      => ({ callId, status }),
  listen:      ({ callId, supervisor })          => ({ sessionId, ... }),
  getRecording:({ callId })                      => ({ url, sizeBytes, ... }),
};

log.pbxIntegration({ provider: '3cx', adapter });
```

All four methods are **optional**. The module merges the injected
adapter over the mock, so if your 3CX client only wires `dial`, the
other three still work in "mock mode" and the workflow is end-to-end
runnable in staging.

### 4.3 What this module does *not* do

* **No network I/O.** The module has zero dependencies and never
  calls `fetch`, `http`, `https`, or any HTTP client. It will never
  leak a call-id, phone number, or customer-id to a third-party
  endpoint on its own.
* **No audio handling.** Audio streams are handled by the PBX +
  Y-125 recording subsystem. This module only stores pointers
  (`recordingLinkage`) and metadata.
* **No signalling.** SIP, MGCP, and H.323 are entirely outside the
  scope. The adapter is expected to handle all telephony signalling
  and emit a stable `callId`.

### 4.4 Recommended real-adapter file layout

Real adapters live under `src/integrations/pbx-<provider>-client.js`:

```
src/integrations/
  pbx-3cx-client.js         ← talks to 3CX REST API via src/http
  pbx-asterisk-client.js    ← AMI/ARI client
  pbx-mitel-client.js       ← Mitel OIG REST
  pbx-cloud-pbx-client.js   ← Bezeq/Cellcom/012 cloud APIs
```

Each client:

1. Holds PBX credentials behind a secret-manager hook (see
   `SECURITY_MODEL.md`) — never commits API keys.
2. Maps provider-specific call states → the four-method contract
   above.
3. Emits an HMAC-signed webhook into this module so
   `recordCall({callId})` is called from the server boundary, not
   from inside the adapter (separation of I/O and state).

---

## 5. Israeli call-recording & monitoring law — notes

> **TL;DR.** One-party consent is usually fine in a business context
> (because your agent is aware), but disclosure at the IVR or first
> greeting is strongly recommended by the Privacy Protection
> Authority and reduces your legal exposure to ~zero. Silent
> supervisor monitoring needs a documented `lawfulBasis` in every
> session log — this module enforces it.

### 5.1 Statutory framework

1. **חוק האזנת סתר, התשל"ט-1979** — Wiretap Act, 1979.
   Intercepting a conversation **between other parties** (a
   conversation to which you are not a party) without a court order
   or the consent of at least one participant is a criminal offence
   carrying up to three years' imprisonment.

2. **One-party consent is permitted** when one of the parties is
   aware of and consents to the recording. In a business context, if
   the company is a party to the call (via its employee) and the
   employee knows the call is being recorded, the company may
   lawfully record even without the external party's explicit
   consent. This is the most common legal basis used by Israeli
   contact centres.

3. **Privacy Protection Law 1981** (חוק הגנת הפרטיות, התשמ"א-1981)
   and the **Privacy Protection Regulations (Information Security)
   2017** classify call recordings as sensitive personal information.
   The recording store falls under **Database Registration Class B**
   — it MUST be registered with the Privacy Protection Authority, be
   access-controlled, be retention-scheduled, and have a documented
   purpose of collection.

4. **Silent supervisor monitoring** (`silentListen`) is treated by
   Israeli practice as an additional party joining the conversation.
   It is lawful only if **either**:
   * the agent is aware that monitoring may occur at any time
     (usually disclosed in the employment contract or in a separate
     "monitoring policy" acknowledgement), **or**
   * the supervisor is silent and the call was already disclosed-as-
     recorded to the customer at the IVR stage.

5. **Retention.** The Privacy Protection Authority recommends NOT
   keeping call recordings longer than the business purpose requires.
   Common Israeli practice:
   * **12 months** for general quality-assurance / training.
   * **Up to 7 years** if the recording underpins a legally binding
     transaction (under הוראות ניהול ספרים / bookkeeping rules, e.g.
     a telephonic mortgage agreement).
   `recordingLinkage()` accepts a `retentionDays` field so Y-125 can
   schedule deletion — but deletion happens in Y-125, not here.

### 5.2 Ready-to-play disclosure notice

```
Hebrew (as stored on every session / recording entry):
  "לתשומת ליבך — שיחה זו עשויה להיות מוקלטת
   לצורכי בקרת איכות ושירות."

English (stored alongside for bilingual IVRs):
  "Please note — this call may be recorded for
   quality assurance and service purposes."
```

Both strings are exported as `DISCLOSURE_NOTICE_HE` and
`DISCLOSURE_NOTICE_EN` so an IVR generator (or a text-to-speech
script) can pull them directly without copy-paste drift.

### 5.3 Enforcement surface

| Entry point           | Legal gate                                              |
|-----------------------|---------------------------------------------------------|
| `silentListen()`      | MUST supply `lawfulBasis` unless `legal.disclosureRequired=false`. Unknown bases are rejected. The chosen basis and Hebrew label are stored on the session record for audit. |
| `recordingLinkage()`  | **Soft** legal check — invalid bases are still accepted (you may be linking an older recording whose basis is unknown), but `legalOk: false` is written onto the record so the compliance officer can later triage. |
| `recordCall()`        | No legal gate — logging metadata about a call is not regulated; only the *audio* is. |
| `pbxIntegration()`    | No legal gate — adapter registration is infrastructural. |
| Session fields        | Every monitor session carries `disclosureNoticeHe / En`, `lawfulBasis`, `lawfulBasisHe`, `disclosed`, and `startedAtIso / endedAtIso` for reconstruction by an auditor. |

### 5.4 Lawful-basis taxonomy

| Key                     | Hebrew                                                                              | When to use                                                       |
|-------------------------|--------------------------------------------------------------------------------------|-------------------------------------------------------------------|
| `one-party-consent`     | הסכמת צד אחד (חוק האזנת סתר, התשל"ט-1979 — מותר אם הנציג מודע)                        | Default for business-to-customer calls where the agent knows       |
| `informed-consent`      | הסכמה מדעת של שני הצדדים (IVR גילוי בתחילת שיחה)                                       | IVR plays the disclosure, customer continues the call              |
| `employment-contract`   | הסכמת עובד במסגרת חוזה עבודה / מדיניות בקרת איכות                                      | Silent supervisor monitoring of your own employees                 |
| `court-order`           | צו בית משפט (האזנת סתר מותרת בהליך משפטי)                                              | Regulated industries under investigation — NEVER self-declare    |

### 5.5 What the operator still has to do outside this module

1. **Register the recording database** under Privacy Protection Law
   Class B with the Authority. This module does not register databases.
2. **Publish a written monitoring policy** and get written employee
   acknowledgement before relying on `lawfulBasis: 'employment-contract'`.
3. **Configure the IVR** to play `DISCLOSURE_NOTICE_HE` at session
   start. This module exports the string but does not drive the IVR.
4. **Set the retention in Y-125** to match `retentionDays` — the
   pointer here is only a hint, not the enforcer.
5. **Run an annual DPIA (הערכת השלכות פרטיות)** for the call
   recording store. See `COMPLIANCE_CHECKLIST.md`.

---

## 6. Missed-call workflow

`missedCallHandling()` is both an **explicit** API call (for custom
flows) and an **automatic** trigger. The module watches every inbound
call emitted by `recordCall()`, and if the outcome is one of
`no-answer` / `busy` / `voicemail`, it enqueues a callback with
`priority: high` behind the scenes.

The queue itself (`callBackQueue()`) orders items by:

1. Priority weight: `vip` → `high` → `normal` → `low` (tests cover
   a specific vip/normal/low ordering case).
2. Enqueue timestamp — FIFO within a priority band.

State transitions (`updateQueueItem()`) are: `queued → in-progress →
(completed | failed | abandoned)`. Transitioning to `in-progress`
increments `attempts`. The item is never removed — `callBackQueue()`
filters to `status === 'queued'` at read time, so terminal items
disappear from the view but live on in `storeSizes().queue` and
`eventLog({event:'queue.status'})`.

---

## 7. Routing rules DSL

`callRoutingRules({ customerId, rules })` accepts an ordered array of
rule objects. Each rule has:

```js
{
  match?: { hour: [9,18], day: 'mon', tier: 'vip' },  // AND semantics
  action: { route: 'agent:uzi' }                      // the verdict
}
```

Matching rules are:

* **Scalar equality** — `match.tier: 'vip'` requires `ctx.tier === 'vip'`.
* **Array membership OR numeric range** — `match.hour: [9,18]` is
  interpreted as a **closed numeric range** (9 ≤ ctx.hour ≤ 18),
  while `match.day: ['mon','tue']` is interpreted as membership.
* **Nested object recursion** — rules can drill into sub-objects.
* **No `match` clause** → always matches → fallback rule.

`resolveRouting({ customerId, context })` walks the rules of the
latest active rule-set for the customer and returns the first match.
Superseded rule-sets are kept forever, so you can reconstruct the
customer's routing at any historical point from the event log.

Example tested: during working hours (9-18) VIP customer `cust-vip`
routes to `agent:uzi`; outside hours to `group:after-hours`.

---

## 8. Search semantics

`searchCalls({ text, dateRange, agent, customer, includeSuperseded, limit })`:

* Text match is **case-insensitive substring** over the concatenation
  of `from / to / outcome / agent / customerId / customerName / notes`
  and every tag in `tags[]`.
* Hebrew-in-notes and English-in-tags both work (tested with
  `text: 'מלט'` and `text: 'CEMENT'` against the same corpus).
* `dateRange.{from,to}` accept ISO strings, millis, or `Date`.
* Superseded calls are excluded by default — pass
  `includeSuperseded: true` to get the full history.
* `limit` defaults to 200 to protect the caller; pass higher for
  dashboards.

---

## 9. Data-source contract

The module is **agnostic to the backing store**. Everything is held
in JSON-serialisable in-memory arrays so the whole state can be
snapshot, diffed, and replayed. The only injection points are:

```js
const log = new CallLog({
  clock: () => Date.now(),                                  // injectable for tests
  pbx:   require('../integrations/pbx-3cx-client'),         // optional
  legal: {
    disclosureRequired: true,                               // default true
    noticeHe: '...custom Hebrew disclosure...',             // optional override
    noticeEn: '...custom English disclosure...',            // optional override
  },
  dispositions: [ /* override the 10-code seed entirely */ ],
});
```

To persist across process restarts, wrap the in-memory state in a
pluggable store layer (the recommended pattern is the same one used
by `credit-limits.js` — snapshot `_calls`, `_followUps`, `_queue`,
`_routingRules`, `_monitorSessions`, `_dispositions` and `_events`
into the store of your choice; restore by reconstructing the
`_callIndex` Map on load).

---

## 10. Hebrew glossary — מילון עברי-אנגלי

| Hebrew                   | Transliteration             | English                                |
|--------------------------|------------------------------|----------------------------------------|
| שיחה נכנסת               | sicha nichneset             | Inbound call                           |
| שיחה יוצאת               | sicha yotzet                | Outbound call                          |
| מרכזיה (טלפונית)         | merkaziya (telefonit)       | PBX / telephone exchange               |
| מרכזייה בענן             | merkaziya be-anan           | Cloud PBX                              |
| תיעוד שיחה               | ti'ud sicha                 | Call logging                           |
| מספר מקור / יעד          | mispar makor / ya'ad        | From / to number                       |
| משך שיחה                 | meshekh sicha               | Call duration                          |
| קוד סיום שיחה            | kod siyum sicha             | Disposition code                       |
| טקסונומיה של תוצאות      | taksonomya shel totza'ot    | Outcome taxonomy                       |
| שיחה מוצלחת              | sicha mutzlakhat            | Successful call                        |
| לא ענה                   | lo ana                      | No answer                              |
| בקשה לחזור               | bakasha lakhzor             | Callback request                       |
| הצעה נשלחה               | hatza'a nishlekha           | Quote / proposal sent                  |
| סגירת עסקה               | sgirat iska                 | Deal won / closing                     |
| לא מעוניין               | lo me'unyan                 | Not interested                         |
| תא קולי                  | ta koli                     | Voicemail                              |
| קו תפוס                  | kav tafus                   | Busy line                              |
| מספר שגוי                | mispar shagui               | Wrong number                           |
| הועבר לממונה             | hu'avar la-memune           | Escalated to supervisor                |
| אחוז מענה                | akhuz ma'ane                | Answer rate                            |
| משך שיחה ממוצע           | meshekh sicha memutza       | Average call duration                  |
| נציג / סוכן              | natzig / sochen             | Agent / operator                       |
| לקוח VIP                 | lakoakh VIP                 | VIP customer                           |
| ניתוב שיחות              | nituv sikhot                | Call routing                           |
| תור חזרה                 | tor khazara                 | Callback queue                         |
| משימת המשך               | mesimat hemshekh            | Follow-up task                         |
| מועד יעד                 | moed ya'ad                  | Due date                               |
| האזנה שקטה               | haazana shketa              | Silent listen / silent monitor         |
| גילוי נאות               | giluy na'ot                 | Disclosure (informed consent)          |
| הסכמת צד אחד             | haskamat tzad ekhad         | One-party consent                      |
| הסכמה מדעת               | haskama mi-da'at            | Informed consent                       |
| חוק האזנת סתר, התשל"ט-1979 | khok ha'azanat seter       | Wiretap Act, 1979                      |
| חוק הגנת הפרטיות, התשמ"א-1981 | khok haganat ha-pratiyut | Privacy Protection Law, 1981           |
| מסמך מדיניות בקרה        | mismakh mediniyut bakara    | Monitoring policy document             |
| הקלטת שיחה               | haklatat sicha              | Call recording                         |
| שמירת הקלטות             | shmirat haklatot            | Recording retention                    |
| רשם מאגרי מידע           | rasham ma'agarei meida      | Database registrar (Privacy Auth)      |
| הערכת השלכות פרטיות       | haarachat hashlakhot pratiyut | DPIA (privacy impact assessment)     |

---

## 11. House-rule audit — "לא מוחקים, רק משדרגים ומגדלים"

The engine contains **zero** `delete` / `splice` / `shift` / `pop`
operations on any store. The house rule is enforced structurally
and verified with a regex probe in the test suite
(`house rule — nothing is ever deleted`):

* `recordCall` on an existing `callId` **supersedes** the prior
  version (`status = 'superseded'`, history-event appended). The
  prior record stays in `_calls` with its full history array intact.
* `recordingLinkage` **appends** a `recording.superseded` history
  entry before pointing `call.recording` at the new URL. Prior
  linkage events remain recoverable from `eventLog()`.
* `linkToCustomer / linkToOpportunity / linkToTicket` mutate the
  pointer **in place** but push a `link.*` history entry with `prev`
  and `next` values so the full evolution is reconstructible.
* `addDisposition` on an existing code marks the prior version
  `supersededAt` and writes a new row under the same key. The old
  label is still discoverable in `eventLog({event:'disposition.upsert'})`.
* `deactivateDisposition` flips `active: false` and stamps
  `deactivatedAt` — it does NOT drop the row.
* `updateFollowUpStatus` appends a `status` history entry to the
  follow-up task. The prior status is still in `task.history[]`.
* `updateQueueItem` appends a `status` history entry and increments
  `attempts` when entering `in-progress`. The item stays in `_queue`.
* `callRoutingRules` **supersedes** prior rule-sets
  (`active=false`, `supersededAt` stamped) instead of replacing
  them. Both rule-sets are kept forever.
* `silentListen` / `endSilentListen` — sessions are appended; the
  closing action sets `active=false, endedAt`, never removes the row.
* The master `_events[]` array is append-only and covers every
  mutation across every store. Timestamps are monotonic (tested).
* A regex guard in the test suite scans `call-log.js` for any
  `this._<store>.splice / pop / shift` call and fails the build if
  one creeps in.

`storeSizes()` returns the live count of every backing store — the
house-rule test asserts that the count only ever grows, never shrinks.

---

## 12. Open questions / next agents

* **Y-125 — call-recording store.** This module only tracks pointers
  via `recordingLinkage()`. A downstream agent should own the actual
  recording bucket (S3-compatible or on-prem), implement retention
  scheduling, enforce checksums, and serve playback URLs with signed
  TTL-bounded URLs.
* **Y-126 — CRM webhook bridge.** The module exposes `recordCall`
  but is called from somewhere. Wire `src/integrations/pbx-*-client.js`
  to emit HMAC-signed webhooks into a new `src/webhooks/calls.js`
  handler that calls into `CallLog.recordCall`.
* **Y-127 — IVR disclosure playback.** `DISCLOSURE_NOTICE_HE/EN` are
  ready to ship; a thin agent should generate the TTS audio file and
  upload it to each PBX. The IVR configuration itself lives on the
  PBX, not in this module.
* **Y-128 — supervisor monitoring UI.** `silentListen` works over
  the adapter, but there's no web UI yet. Build a thin route at
  `/comms/supervisor/monitor` that enforces the `lawfulBasis`
  dropdown with the same four keys exported here.
* **Y-129 — callback SLA alerts.** `callBackQueue` is prioritised,
  but there's no SLA breach detection. Add a scheduled job that
  emails the supervisor when a VIP item has been queued for > 15
  minutes or a normal item for > 4 hours.
* **Y-130 — call intent classifier.** Hook the notes field into the
  existing AI summariser (X-17) to auto-tag calls and propose
  disposition codes. Keep `addDisposition` so the human operator can
  still override the AI.
* **Y-131 — call sentiment scorer.** Run the recording (via Y-125)
  through a speech-to-text + sentiment pipeline and attach the score
  to the call via a new `sentiment` field. The module already
  versions calls, so adding a field is a forward-compatible upgrade.
* **Y-132 — compliance calendar.** Annual DPIA + database-registration
  renewal reminders for the recording store. Not this module.

---

## 13. Sign-off

* Module file:  `onyx-procurement/src/comms/call-log.js` — 880+ lines, zero deps
* Test file:    `onyx-procurement/test/comms/call-log.test.js` — 35 tests, all passing
* House rule:   **enforced & tested** (regex probe guards the source file)
* Hebrew/English: **bilingual throughout** (every enum + every error message + disclosure notices)
* Israeli law:  Wiretap Act + Privacy Protection Law surface **documented & enforced** in `silentListen`
* Ready for:    Y-125 recording-store wiring + Y-126 CRM-webhook bridge
