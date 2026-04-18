/**
 * Dunning & Collections Workflow Automation
 * Techno-Kol Uzi mega-ERP — Agent X-48 (Swarm 3C)
 *
 * Bilingual AR-aging + collections engine with Israeli legal compliance.
 *
 * Zero external dependencies — pure Node core. Deterministic, side-effect-free
 * at the module level (everything routes through a mutable `store` passed in
 * by the orchestrator, or the default in-memory store for unit tests).
 *
 * Israeli legal constraints honored here:
 *   • חוק ההוצאה לפועל 1967 — referral gate before legal stage
 *   • Max commercial interest rate = BOI prime + 3% (חוק הריבית)
 *   • Cooling period (30d between pre-legal and legal referral)
 *   • All debtor-facing notices in Hebrew (bilingual EN companion)
 *   • Anti-harassment: hard cap on contact frequency (max 1 touch / 72h)
 *   • 7-year statute of limitations (חוק ההתיישנות תשי"ח-1958)
 *
 * Never deletes: all state transitions are append-only. `writeOff` marks an
 * invoice `written_off` but the record stays in the book forever for audit.
 *
 * Public exports:
 *   runDunning(asOf, opts)          → { actions[], counts_by_stage }
 *   sendReminder(invoiceId, level)  → { channel, delivered, message_he, message_en }
 *   recordPromise(invoiceId, p)     → void (appends to promise ledger)
 *   flagDispute(invoiceId, reason)  → pauses dunning
 *   recordPayment(invoiceId, amt, d)→ updates aging / may close invoice
 *   agingReport(asOf)               → { by_customer, totals, buckets }
 *   writeOff(invoiceId, reason, by) → journal entry stub
 *   collectionMetrics(period)       → { dso, collection_rate, aging_trend }
 *
 * Plus factory helpers for test isolation:
 *   createStore()                   → fresh in-memory store
 *   configure(opts)                 → mutates default config
 *   DUNNING_SCHEDULE, BUCKETS, CONFIG, STAGES, CHANNELS
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Constants & configuration
// ─────────────────────────────────────────────────────────────

const STAGES = Object.freeze({
  NONE:        'none',
  COURTESY:    'courtesy',     // day 1
  FRIENDLY:    'friendly',     // day 7
  FORMAL:      'formal',       // day 15
  SECOND:      'second',       // day 30
  PRE_LEGAL:   'pre_legal',    // day 45
  LEGAL:       'legal',        // day 60
  WRITE_OFF:   'write_off',    // day 90+
  PAID:        'paid',
  DISPUTED:    'disputed',
  WRITTEN_OFF: 'written_off',
  PROMISED:    'promised',
});

const CHANNELS = Object.freeze({
  EMAIL:           'email',
  CERTIFIED_EMAIL: 'certified_email',
  SMS:             'sms',
  PHONE:           'phone',
  REGISTERED_MAIL: 'registered_mail',
  LEGAL_FILING:    'legal_filing',
});

/**
 * Dunning schedule. Each entry:
 *   day:      days overdue trigger (0 = due today, 7 = 7 days overdue …)
 *   stage:    STAGES key
 *   channels: ordered list of delivery channels
 *   severity: 1..7 (used to break promises & compute DSO weighting)
 *   he / en:  message templates (bilingual)
 *
 * Configurable via configure({ schedule }).
 */
const DEFAULT_SCHEDULE = [
  {
    day: 1,
    stage: STAGES.COURTESY,
    channels: [CHANNELS.EMAIL],
    severity: 1,
    he: 'תזכורת ידידותית: חשבונית {invoice} בסך {amount} ש"ח חלף מועד פירעונה ביום {due}. נודה על הסדרה מיידית.',
    en: 'Courtesy reminder: invoice {invoice} in the amount of {amount} ILS is due ({due}). Please settle at your earliest convenience.',
  },
  {
    day: 7,
    stage: STAGES.FRIENDLY,
    channels: [CHANNELS.EMAIL, CHANNELS.SMS],
    severity: 2,
    he: 'תזכורת: חשבונית {invoice} בסך {amount} ש"ח נמצאת באיחור של {overdue} ימים. נבקש להסדיר את החוב בהקדם.',
    en: 'Reminder: invoice {invoice} ({amount} ILS) is {overdue} days overdue. Kindly arrange settlement ASAP.',
  },
  {
    day: 15,
    stage: STAGES.FORMAL,
    channels: [CHANNELS.CERTIFIED_EMAIL],
    severity: 3,
    he: 'הודעה רשמית: חשבונית {invoice} בסך {amount} ש"ח ({overdue} ימי איחור). ריבית פיגורים מחושבת החל מיום הפירעון בהתאם לחוק.',
    en: 'Formal notice: invoice {invoice} ({amount} ILS) is {overdue} days overdue. Statutory late interest accrues from the due date.',
  },
  {
    day: 30,
    stage: STAGES.SECOND,
    channels: [CHANNELS.CERTIFIED_EMAIL, CHANNELS.PHONE],
    severity: 4,
    he: 'הודעה רשמית שנייה: חשבונית {invoice} בסך {amount} ש"ח באיחור של {overdue} ימים. אי-הסדרה בתוך 15 ימים תוביל להליכים משפטיים.',
    en: 'Second formal notice: invoice {invoice} ({amount} ILS) is {overdue} days overdue. Failure to settle within 15 days will trigger legal action.',
  },
  {
    day: 45,
    stage: STAGES.PRE_LEGAL,
    channels: [CHANNELS.REGISTERED_MAIL],
    severity: 5,
    he: 'הודעה טרום-משפטית: חשבונית {invoice} בסך {amount} ש"ח ({overdue} ימי איחור). זוהי ההתראה האחרונה לפני פנייה להוצאה לפועל.',
    en: 'Pre-legal notice: invoice {invoice} ({amount} ILS) is {overdue} days overdue. This is the final warning before execution office referral.',
  },
  {
    day: 60,
    stage: STAGES.LEGAL,
    channels: [CHANNELS.LEGAL_FILING],
    severity: 6,
    he: 'הפניה משפטית: תיק {invoice} הועבר לטיפול משפטי במסגרת חוק ההוצאה לפועל, התשכ"ז-1967.',
    en: 'Legal referral: file {invoice} transferred to legal collection under Execution Office Law 1967.',
  },
  {
    day: 90,
    stage: STAGES.WRITE_OFF,
    channels: [],
    severity: 7,
    he: 'המלצה למחיקה חשבונאית: חשבונית {invoice} בסך {amount} ש"ח באיחור של {overdue} ימים.',
    en: 'Write-off recommendation: invoice {invoice} ({amount} ILS) at {overdue} days overdue.',
  },
];

const BUCKETS = Object.freeze([
  { name: 'current',  min: -Infinity, max: 0   },
  { name: '1_30',     min: 1,         max: 30  },
  { name: '31_60',    min: 31,        max: 60  },
  { name: '61_90',    min: 61,        max: 90  },
  { name: '91_plus',  min: 91,        max: Infinity },
]);

/** Default config — mutable via `configure()`. */
const CONFIG = {
  schedule:              DEFAULT_SCHEDULE.slice(),
  boi_prime:             0.06,           // BOI prime rate, update via configure()
  max_interest_spread:   0.03,           // Prime + 3% max commercial debt
  cooling_period_days:   30,             // Between pre-legal and legal
  max_contact_per_72h:   1,              // Anti-harassment cap
  statute_of_limit_days: 7 * 365,        // 7 years
  default_currency:      'ILS',
  broken_promise_bump:   1,              // Severity tiers to add on break
  write_off_approver_required: true,
};

// ─────────────────────────────────────────────────────────────
// Store (swappable, in-memory by default)
// ─────────────────────────────────────────────────────────────

/**
 * Factory: create a fresh store. Use one per test.
 * The store is intentionally a plain object so adapters (SQL, Mongo, Foundry
 * Ontology) can drop-in replace it with the same shape.
 */
function createStore() {
  return {
    invoices:    new Map(), // id → invoice
    customers:   new Map(), // id → customer
    comm_log:    [],        // communication events (append-only)
    promises:    [],        // payment promise ledger
    disputes:    new Map(), // invoice_id → { reason, at }
    payments:    [],        // payment ledger (append-only)
    plans:       new Map(), // invoice_id → payment plan
    journal:     [],        // write-off + accounting impact
    assignments: new Map(), // invoice_id → agent_id
    metrics_hist:[],        // daily aging snapshots for trend
  };
}

/** Module-default store (tests can call createStore() for isolation). */
const _defaultStore = createStore();

// ─────────────────────────────────────────────────────────────
// Date / money helpers (no deps)
// ─────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

function toDate(d) {
  if (d instanceof Date) return new Date(d.getTime());
  if (typeof d === 'number') return new Date(d);
  if (typeof d === 'string') {
    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) throw new Error('invalid date: ' + d);
    return parsed;
  }
  throw new Error('cannot coerce to date: ' + typeof d);
}

function daysBetween(a, b) {
  const A = toDate(a); const B = toDate(b);
  // Zero-out time component to avoid off-by-one on DST boundaries.
  const au = Date.UTC(A.getUTCFullYear(), A.getUTCMonth(), A.getUTCDate());
  const bu = Date.UTC(B.getUTCFullYear(), B.getUTCMonth(), B.getUTCDate());
  return Math.round((bu - au) / MS_PER_DAY);
}

function addDays(d, n) {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function round2(n) { return Math.round(n * 100) / 100; }

function money(n, currency) {
  return { amount: round2(n), currency: currency || CONFIG.default_currency };
}

// ─────────────────────────────────────────────────────────────
// Configuration mutator
// ─────────────────────────────────────────────────────────────

function configure(opts) {
  if (!opts || typeof opts !== 'object') return Object.assign({}, CONFIG);
  for (const k of Object.keys(opts)) {
    if (Object.prototype.hasOwnProperty.call(CONFIG, k)) CONFIG[k] = opts[k];
  }
  // Keep schedule sorted by day ascending.
  if (Array.isArray(CONFIG.schedule)) {
    CONFIG.schedule = CONFIG.schedule.slice().sort((a, b) => a.day - b.day);
  }
  return Object.assign({}, CONFIG);
}

// ─────────────────────────────────────────────────────────────
// Invoice ingestion
// ─────────────────────────────────────────────────────────────

/**
 * Add or replace an invoice in the store.
 * Required: id, customer_id, amount, due_date
 * Optional: currency, issued_at, description
 */
function upsertInvoice(inv, store) {
  const s = store || _defaultStore;
  if (!inv || !inv.id) throw new Error('invoice.id required');
  if (!inv.customer_id) throw new Error('invoice.customer_id required');
  if (typeof inv.amount !== 'number') throw new Error('invoice.amount must be number');
  if (!inv.due_date) throw new Error('invoice.due_date required');
  const record = Object.assign(
    {
      currency:  CONFIG.default_currency,
      issued_at: inv.due_date,
      paid:      0,
      stage:     STAGES.NONE,
      last_touch_at: null,
      severity:  0,
      broken_promises: 0,
      written_off: false,
      written_off_at: null,
      disputed:  false,
    },
    inv,
  );
  // Preserve existing mutable state if already present (never delete).
  const existing = s.invoices.get(inv.id);
  if (existing) {
    record.paid            = existing.paid;
    record.stage           = existing.stage;
    record.last_touch_at   = existing.last_touch_at;
    record.severity        = existing.severity;
    record.broken_promises = existing.broken_promises;
    record.written_off     = existing.written_off;
    record.written_off_at  = existing.written_off_at;
    record.disputed        = existing.disputed;
  }
  s.invoices.set(inv.id, record);
  return record;
}

function upsertCustomer(cust, store) {
  const s = store || _defaultStore;
  if (!cust || !cust.id) throw new Error('customer.id required');
  const record = Object.assign(
    { language: 'he', email: null, phone: null, name: '' },
    s.customers.get(cust.id) || {},
    cust,
  );
  s.customers.set(cust.id, record);
  return record;
}

// ─────────────────────────────────────────────────────────────
// Aging calculation
// ─────────────────────────────────────────────────────────────

function outstandingOf(inv) {
  return round2((inv.amount || 0) - (inv.paid || 0));
}

function ageDays(inv, asOf) {
  return daysBetween(inv.due_date, asOf);
}

function bucketFor(daysOverdue) {
  for (const b of BUCKETS) {
    if (daysOverdue >= b.min && daysOverdue <= b.max) return b.name;
  }
  return '91_plus';
}

/**
 * Build an aging report grouped by customer.
 * @param {Date|string} asOf
 * @param {object} [store]
 * @returns {{ by_customer: object, totals: object, buckets: object, as_of: string }}
 */
function agingReport(asOf, store) {
  const s = store || _defaultStore;
  const when = toDate(asOf);
  const by_customer = {};
  const buckets = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '91_plus': 0 };
  let grand_total = 0;
  let total_overdue = 0;
  let count_overdue = 0;

  for (const inv of s.invoices.values()) {
    if (inv.written_off) continue;
    const out = outstandingOf(inv);
    if (out <= 0) continue;
    const over = ageDays(inv, when);
    const bucket = bucketFor(over);
    buckets[bucket] += out;
    grand_total += out;
    if (over > 0) { total_overdue += out; count_overdue += 1; }

    const cid = inv.customer_id;
    if (!by_customer[cid]) {
      by_customer[cid] = {
        customer_id: cid,
        total: 0,
        current: 0,
        '1_30': 0,
        '31_60': 0,
        '61_90': 0,
        '91_plus': 0,
        invoices: [],
      };
    }
    by_customer[cid][bucket] += out;
    by_customer[cid].total   += out;
    by_customer[cid].invoices.push({
      id: inv.id,
      amount: out,
      overdue_days: over,
      bucket,
      stage: inv.stage,
      disputed: !!inv.disputed,
    });
  }

  // Round every money figure.
  for (const k of Object.keys(buckets)) buckets[k] = round2(buckets[k]);
  for (const cid of Object.keys(by_customer)) {
    const c = by_customer[cid];
    c.total = round2(c.total);
    for (const b of ['current', '1_30', '31_60', '61_90', '91_plus']) c[b] = round2(c[b]);
  }

  return {
    as_of:   when.toISOString(),
    buckets,
    by_customer,
    totals: {
      outstanding:    round2(grand_total),
      overdue:        round2(total_overdue),
      overdue_count:  count_overdue,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Dunning orchestration
// ─────────────────────────────────────────────────────────────

/** Pick the schedule entry for the given days-overdue. */
function stageForDay(daysOverdue, schedule) {
  const sch = schedule || CONFIG.schedule;
  let match = null;
  for (const entry of sch) {
    if (daysOverdue >= entry.day) match = entry;
  }
  return match;
}

/** Is this invoice paused (disputed, paid, written-off, in legal pipeline lock)? */
function isPaused(inv) {
  if (inv.disputed) return 'disputed';
  if (inv.written_off) return 'written_off';
  if (outstandingOf(inv) <= 0) return 'paid';
  if (inv.stage === STAGES.PROMISED && inv.promise_until && Date.now() < toDate(inv.promise_until).getTime()) return 'promised';
  return null;
}

/** Anti-harassment: has a touch been sent within 72h? */
function canContact(inv, asOf) {
  if (!inv.last_touch_at) return true;
  const hrs = (toDate(asOf).getTime() - toDate(inv.last_touch_at).getTime()) / 3_600_000;
  return hrs >= (72 / CONFIG.max_contact_per_72h);
}

/**
 * Run dunning for every outstanding invoice as of the given date.
 * Does NOT delete anything; only appends comm_log entries and mutates the
 * invoice.stage / severity / last_touch_at fields.
 *
 * @returns {{ actions: Array, counts_by_stage: object, skipped: Array }}
 */
function runDunning(asOf, opts) {
  const when  = toDate(asOf || new Date());
  const store = (opts && opts.store) || _defaultStore;
  const actions = [];
  const skipped = [];
  const counts_by_stage = {};

  // Statute-of-limit cut-off: anything past 7y cannot be legally pursued.
  const statute_cutoff = addDays(when, -CONFIG.statute_of_limit_days);

  for (const inv of store.invoices.values()) {
    const pauseReason = isPaused(inv);
    if (pauseReason) {
      skipped.push({ invoice_id: inv.id, reason: pauseReason });
      continue;
    }

    const over = ageDays(inv, when);
    if (over < 1) continue; // not due yet — skip silently

    // Statute of limitations — append a notice, never a dunning touch.
    if (toDate(inv.due_date).getTime() < statute_cutoff.getTime()) {
      skipped.push({ invoice_id: inv.id, reason: 'statute_of_limitations' });
      continue;
    }

    const entry = stageForDay(over, CONFIG.schedule);
    if (!entry) continue;

    // Cooling period between pre_legal and legal.
    if (entry.stage === STAGES.LEGAL) {
      const pre = store.comm_log
        .filter((e) => e.invoice_id === inv.id && e.stage === STAGES.PRE_LEGAL)
        .sort((a, b) => toDate(b.at).getTime() - toDate(a.at).getTime())[0];
      if (!pre) {
        skipped.push({ invoice_id: inv.id, reason: 'cooling_period_no_prior_pre_legal' });
        continue;
      }
      const since = daysBetween(pre.at, when);
      if (since < CONFIG.cooling_period_days) {
        skipped.push({ invoice_id: inv.id, reason: 'cooling_period', days_since_pre_legal: since });
        continue;
      }
    }

    // Already processed this stage? (idempotency)
    if (inv.stage === entry.stage && inv.last_touch_at && daysBetween(inv.last_touch_at, when) < 1) {
      skipped.push({ invoice_id: inv.id, reason: 'already_touched_today' });
      continue;
    }

    // Anti-harassment.
    if (!canContact(inv, when)) {
      skipped.push({ invoice_id: inv.id, reason: 'harassment_cap' });
      continue;
    }

    // Execute the touch for every channel in the entry.
    for (const ch of entry.channels) {
      const msg = renderMessage(entry, inv);
      const event = {
        id:         `evt_${inv.id}_${over}_${ch}_${when.getTime()}`,
        invoice_id: inv.id,
        customer_id: inv.customer_id,
        channel:    ch,
        stage:      entry.stage,
        severity:   entry.severity,
        at:         when.toISOString(),
        message_he: msg.he,
        message_en: msg.en,
        delivered:  true,
      };
      store.comm_log.push(event);
      actions.push(event);
    }

    // Phone-call task for day-30 second notice.
    if (entry.stage === STAGES.SECOND) {
      actions.push({
        type: 'task',
        kind: 'phone_call',
        invoice_id: inv.id,
        customer_id: inv.customer_id,
        assigned_to: store.assignments.get(inv.id) || null,
        due: addDays(when, 2).toISOString(),
      });
    }

    // Legal referral stub.
    if (entry.stage === STAGES.LEGAL) {
      actions.push({
        type: 'legal_referral',
        invoice_id: inv.id,
        customer_id: inv.customer_id,
        law_reference: 'חוק ההוצאה לפועל, התשכ"ז-1967',
        referred_at: when.toISOString(),
      });
    }

    // Write-off recommendation at 90d (not auto-executed — requires approver).
    if (entry.stage === STAGES.WRITE_OFF) {
      actions.push({
        type: 'write_off_recommendation',
        invoice_id: inv.id,
        amount: outstandingOf(inv),
        requires_approver: true,
      });
    }

    // Mutate invoice state.
    inv.stage         = entry.stage;
    inv.severity      = Math.max(inv.severity || 0, entry.severity);
    inv.last_touch_at = when.toISOString();

    counts_by_stage[entry.stage] = (counts_by_stage[entry.stage] || 0) + 1;
  }

  // Snapshot aging for trend metrics.
  const rep = agingReport(when, store);
  store.metrics_hist.push({ at: when.toISOString(), buckets: rep.buckets, totals: rep.totals });

  return { actions, counts_by_stage, skipped, as_of: when.toISOString() };
}

function renderMessage(entry, inv) {
  const over = Math.max(0, ageDays(inv, new Date()));
  const ctx = {
    invoice: inv.id,
    amount:  outstandingOf(inv).toFixed(2),
    due:     typeof inv.due_date === 'string' ? inv.due_date : toDate(inv.due_date).toISOString().slice(0, 10),
    overdue: String(over),
  };
  return {
    he: formatTemplate(entry.he, ctx),
    en: formatTemplate(entry.en, ctx),
  };
}

function formatTemplate(tpl, ctx) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (k in ctx ? ctx[k] : '{' + k + '}'));
}

// ─────────────────────────────────────────────────────────────
// Manual reminder (out-of-band)
// ─────────────────────────────────────────────────────────────

/**
 * Fire a single reminder, bypassing the schedule gate but still respecting
 * dispute / paid / harassment guards.
 *
 * @param {string} invoiceId
 * @param {string} level  one of STAGES.*
 * @param {object} [opts] { store, asOf, override_harassment }
 */
function sendReminder(invoiceId, level, opts) {
  const store = (opts && opts.store) || _defaultStore;
  const when  = toDate((opts && opts.asOf) || new Date());
  const inv   = store.invoices.get(invoiceId);
  if (!inv) throw new Error('invoice not found: ' + invoiceId);
  const pause = isPaused(inv);
  if (pause) return { channel: null, delivered: false, reason: pause };
  if (!(opts && opts.override_harassment) && !canContact(inv, when)) {
    return { channel: null, delivered: false, reason: 'harassment_cap' };
  }
  const entry = CONFIG.schedule.find((e) => e.stage === level);
  if (!entry) throw new Error('unknown level: ' + level);
  const msg = renderMessage(entry, inv);
  const primaryChannel = entry.channels[0] || CHANNELS.EMAIL;
  const event = {
    id:         `evt_${invoiceId}_${level}_${when.getTime()}`,
    invoice_id: invoiceId,
    customer_id: inv.customer_id,
    channel:    primaryChannel,
    stage:      entry.stage,
    severity:   entry.severity,
    at:         when.toISOString(),
    message_he: msg.he,
    message_en: msg.en,
    delivered:  true,
    manual:     true,
  };
  store.comm_log.push(event);
  inv.last_touch_at = when.toISOString();
  inv.stage = entry.stage;
  inv.severity = Math.max(inv.severity || 0, entry.severity);
  return {
    channel:    primaryChannel,
    delivered:  true,
    message_he: msg.he,
    message_en: msg.en,
    event,
  };
}

// ─────────────────────────────────────────────────────────────
// Promises
// ─────────────────────────────────────────────────────────────

/**
 * Record a payment promise. Pauses dunning until `date` is reached.
 * If the promise date passes without full payment, severity bumps on next run.
 */
function recordPromise(invoiceId, promise, store) {
  const s = store || _defaultStore;
  const inv = s.invoices.get(invoiceId);
  if (!inv) throw new Error('invoice not found: ' + invoiceId);
  if (!promise || !promise.date) throw new Error('promise.date required');
  if (typeof promise.amount !== 'number' || promise.amount <= 0) {
    throw new Error('promise.amount must be positive number');
  }
  const rec = {
    id:           `prm_${invoiceId}_${Date.now()}_${s.promises.length}`,
    invoice_id:   invoiceId,
    customer_id:  inv.customer_id,
    promise_date: toDate(promise.date).toISOString(),
    amount:       round2(promise.amount),
    created_at:   new Date().toISOString(),
    status:       'open',
  };
  s.promises.push(rec);
  inv.stage = STAGES.PROMISED;
  inv.promise_until = rec.promise_date;
  return rec;
}

/**
 * Reconcile expired promises. A promise is "broken" if the promise_date has
 * passed and the invoice balance has not dropped by at least promise.amount
 * since the promise was made.
 */
function reconcilePromises(asOf, store) {
  const s = store || _defaultStore;
  const when = toDate(asOf || new Date());
  const broken = [];
  for (const p of s.promises) {
    if (p.status !== 'open') continue;
    if (toDate(p.promise_date).getTime() > when.getTime()) continue;
    const inv = s.invoices.get(p.invoice_id);
    if (!inv) continue;
    // Sum payments received since promise creation.
    const since = toDate(p.created_at).getTime();
    const paidSince = s.payments
      .filter((pay) => pay.invoice_id === p.invoice_id && toDate(pay.at).getTime() >= since)
      .reduce((acc, pay) => acc + pay.amount, 0);
    if (paidSince + 0.01 >= p.amount) {
      p.status = 'kept';
    } else {
      p.status = 'broken';
      inv.broken_promises = (inv.broken_promises || 0) + 1;
      inv.severity        = Math.min(7, (inv.severity || 0) + CONFIG.broken_promise_bump);
      inv.promise_until   = null;
      if (inv.stage === STAGES.PROMISED) inv.stage = STAGES.FRIENDLY;
      broken.push(p);
    }
  }
  return broken;
}

// ─────────────────────────────────────────────────────────────
// Disputes
// ─────────────────────────────────────────────────────────────

function flagDispute(invoiceId, reason, store) {
  const s = store || _defaultStore;
  const inv = s.invoices.get(invoiceId);
  if (!inv) throw new Error('invoice not found: ' + invoiceId);
  inv.disputed = true;
  inv.stage = STAGES.DISPUTED;
  s.disputes.set(invoiceId, {
    reason: reason || 'unspecified',
    at:     new Date().toISOString(),
  });
  s.comm_log.push({
    type:       'dispute_flag',
    invoice_id: invoiceId,
    reason,
    at:         new Date().toISOString(),
  });
  return { paused: true, invoice_id: invoiceId };
}

function clearDispute(invoiceId, store) {
  const s = store || _defaultStore;
  const inv = s.invoices.get(invoiceId);
  if (!inv) throw new Error('invoice not found: ' + invoiceId);
  inv.disputed = false;
  if (inv.stage === STAGES.DISPUTED) inv.stage = STAGES.NONE;
  return { resumed: true, invoice_id: invoiceId };
}

// ─────────────────────────────────────────────────────────────
// Payments
// ─────────────────────────────────────────────────────────────

/**
 * Record a payment against an invoice. Never deletes data — always an
 * append to the `payments` ledger.
 */
function recordPayment(invoiceId, amount, date, store) {
  const s = store || _defaultStore;
  const inv = s.invoices.get(invoiceId);
  if (!inv) throw new Error('invoice not found: ' + invoiceId);
  if (typeof amount !== 'number' || amount <= 0) throw new Error('amount must be positive number');
  const when = toDate(date || new Date());
  const rec = {
    id:         `pay_${invoiceId}_${when.getTime()}_${s.payments.length}`,
    invoice_id: invoiceId,
    amount:     round2(amount),
    at:         when.toISOString(),
    recorded_at: new Date().toISOString(),
  };
  s.payments.push(rec);
  inv.paid = round2((inv.paid || 0) + rec.amount);
  if (outstandingOf(inv) <= 0.001) {
    inv.stage = STAGES.PAID;
    inv.paid_in_full_at = when.toISOString();
  }
  return rec;
}

// ─────────────────────────────────────────────────────────────
// Payment plans (installments)
// ─────────────────────────────────────────────────────────────

/**
 * Create a payment plan: N installments spaced every X days.
 * The plan creates N implicit promises.
 */
function createPaymentPlan(invoiceId, plan, store) {
  const s = store || _defaultStore;
  const inv = s.invoices.get(invoiceId);
  if (!inv) throw new Error('invoice not found: ' + invoiceId);
  if (!plan || typeof plan.installments !== 'number' || plan.installments < 1) {
    throw new Error('plan.installments must be positive integer');
  }
  if (typeof plan.every_days !== 'number' || plan.every_days < 1) {
    throw new Error('plan.every_days must be positive integer');
  }
  const out = outstandingOf(inv);
  const each = round2(out / plan.installments);
  const start = toDate(plan.start || new Date());
  const schedule = [];
  for (let i = 0; i < plan.installments; i++) {
    const due = addDays(start, i * plan.every_days);
    schedule.push({ due: due.toISOString(), amount: each, status: 'pending' });
  }
  // Last installment absorbs the rounding remainder.
  const totalScheduled = schedule.reduce((acc, x) => acc + x.amount, 0);
  const drift = round2(out - totalScheduled);
  if (drift !== 0) schedule[schedule.length - 1].amount = round2(schedule[schedule.length - 1].amount + drift);

  const rec = {
    id:         `plan_${invoiceId}_${Date.now()}`,
    invoice_id: invoiceId,
    created_at: new Date().toISOString(),
    installments: plan.installments,
    every_days: plan.every_days,
    schedule,
    status:     'active',
  };
  s.plans.set(invoiceId, rec);
  // Each installment becomes a promise.
  for (const inst of schedule) {
    recordPromise(invoiceId, { date: inst.due, amount: inst.amount }, s);
  }
  inv.payment_plan_id = rec.id;
  return rec;
}

// ─────────────────────────────────────────────────────────────
// Write-off workflow
// ─────────────────────────────────────────────────────────────

/**
 * Write off an invoice — produces a journal entry stub and marks the
 * invoice `written_off=true`. The invoice record is NEVER removed.
 */
function writeOff(invoiceId, reason, approver, store) {
  const s = store || _defaultStore;
  const inv = s.invoices.get(invoiceId);
  if (!inv) throw new Error('invoice not found: ' + invoiceId);
  if (CONFIG.write_off_approver_required && !approver) {
    throw new Error('write_off requires approver');
  }
  if (inv.written_off) throw new Error('already written off: ' + invoiceId);
  const amt = outstandingOf(inv);
  const je = {
    id:   `je_wo_${invoiceId}_${Date.now()}`,
    type: 'write_off',
    invoice_id: invoiceId,
    customer_id: inv.customer_id,
    reason: reason || 'uncollectible',
    approver,
    at:    new Date().toISOString(),
    lines: [
      { account: '6500', name: 'Bad Debt Expense',      debit:  amt, credit: 0 },
      { account: '1200', name: 'Accounts Receivable',   debit:  0,   credit: amt },
    ],
    currency: inv.currency || CONFIG.default_currency,
  };
  s.journal.push(je);
  inv.written_off   = true;
  inv.written_off_at= je.at;
  inv.stage         = STAGES.WRITTEN_OFF;
  return je;
}

// ─────────────────────────────────────────────────────────────
// Agent assignment
// ─────────────────────────────────────────────────────────────

function assignAgent(invoiceId, agentId, store) {
  const s = store || _defaultStore;
  const inv = s.invoices.get(invoiceId);
  if (!inv) throw new Error('invoice not found: ' + invoiceId);
  if (!agentId) throw new Error('agentId required');
  s.assignments.set(invoiceId, agentId);
  inv.assigned_agent = agentId;
  return { invoice_id: invoiceId, agent_id: agentId };
}

// ─────────────────────────────────────────────────────────────
// Performance metrics
// ─────────────────────────────────────────────────────────────

/**
 * DSO = (AR / sales) * days_in_period
 * collection_rate = collected / (beginning_AR + sales) in period
 * aging_trend     = delta of buckets between first and last snapshot in period
 */
function collectionMetrics(period, store) {
  const s = store || _defaultStore;
  const from = period && period.from ? toDate(period.from) : new Date(0);
  const to   = period && period.to   ? toDate(period.to)   : new Date();
  const days = Math.max(1, daysBetween(from, to));

  // Sales = invoices issued in period.
  let sales = 0;
  let ar    = 0;
  let opening_ar = 0;
  for (const inv of s.invoices.values()) {
    const issued = toDate(inv.issued_at || inv.due_date).getTime();
    if (issued >= from.getTime() && issued <= to.getTime()) sales += inv.amount || 0;
    if (!inv.written_off) ar += outstandingOf(inv);
    if (issued < from.getTime() && !inv.written_off) opening_ar += outstandingOf(inv);
  }

  // Collected in period.
  const collected = s.payments
    .filter((p) => {
      const t = toDate(p.at).getTime();
      return t >= from.getTime() && t <= to.getTime();
    })
    .reduce((acc, p) => acc + p.amount, 0);

  const dso = sales > 0 ? round2((ar / sales) * days) : 0;
  const denom = opening_ar + sales;
  const collection_rate = denom > 0 ? round2(collected / denom) : 0;

  // Aging trend — oldest vs newest snapshot in period.
  const snaps = s.metrics_hist.filter((h) => {
    const t = toDate(h.at).getTime();
    return t >= from.getTime() && t <= to.getTime();
  });
  let aging_trend = null;
  if (snaps.length >= 2) {
    const first = snaps[0].buckets;
    const last  = snaps[snaps.length - 1].buckets;
    aging_trend = {};
    for (const k of Object.keys(first)) {
      aging_trend[k] = round2((last[k] || 0) - (first[k] || 0));
    }
  }

  return {
    period: { from: from.toISOString(), to: to.toISOString(), days },
    dso,
    collection_rate,
    collected: round2(collected),
    ar:         round2(ar),
    opening_ar: round2(opening_ar),
    sales:      round2(sales),
    aging_trend,
    snapshot_count: snaps.length,
  };
}

// ─────────────────────────────────────────────────────────────
// Late-interest helper (legal cap)
// ─────────────────────────────────────────────────────────────

/** Max permissible annual interest for commercial debt = BOI prime + spread. */
function maxLegalInterest() {
  return round2(CONFIG.boi_prime + CONFIG.max_interest_spread);
}

/** Compute late interest for an outstanding amount, capped at legal max. */
function computeLateInterest(principal, days, annualRate) {
  const rate = Math.min(annualRate || maxLegalInterest(), maxLegalInterest());
  if (principal <= 0 || days <= 0 || rate <= 0) return 0;
  // Simple daily accrual.
  return round2((principal * rate * days) / 365);
}

// ─────────────────────────────────────────────────────────────
// Comm log accessor
// ─────────────────────────────────────────────────────────────

function customerCommLog(customerId, store) {
  const s = store || _defaultStore;
  return s.comm_log.filter((e) => e.customer_id === customerId);
}

// ─────────────────────────────────────────────────────────────
// Public exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  // core workflow
  runDunning,
  sendReminder,
  recordPromise,
  reconcilePromises,
  flagDispute,
  clearDispute,
  recordPayment,
  agingReport,
  writeOff,
  collectionMetrics,
  // support
  upsertInvoice,
  upsertCustomer,
  createPaymentPlan,
  assignAgent,
  customerCommLog,
  // legal helpers
  maxLegalInterest,
  computeLateInterest,
  // helpers / constants
  createStore,
  configure,
  daysBetween,
  addDays,
  bucketFor,
  outstandingOf,
  ageDays,
  stageForDay,
  isPaused,
  canContact,
  renderMessage,
  formatTemplate,
  round2,
  money,
  STAGES,
  CHANNELS,
  BUCKETS,
  CONFIG,
  DUNNING_SCHEDULE: DEFAULT_SCHEDULE,
};
