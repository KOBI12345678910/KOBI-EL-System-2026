/**
 * vacancy-tracker.js — Rental-Property Vacancy Tracker (מעקב נכסים פנויים)
 * Agent Y-051 / Swarm Real-Estate / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Domain: Techno-Kol Uzi real-estate portfolio (residential + commercial
 * rental units in Israel). The module tracks every unit's occupancy
 * timeline, computes vacancy-loss economics, drives marketing status
 * across Israeli listing platforms (Yad2, Madlan, Homeless), and surfaces
 * operational alerts for stale listings.
 *
 * Rule of the system (לא מוחקים רק משדרגים ומגדלים):
 *   - `markVacant` / `markOccupied` APPEND to the unit's timeline.
 *     A unit's history is an append-only stack — no entry is ever mutated
 *     or removed. Re-marking a unit vacant while it is already vacant
 *     pushes a new revision onto the current period's `revisions[]`.
 *   - Marketing status updates are append-only as well — every call to
 *     `marketingStatus` snapshots the previous campaign state onto
 *     `campaignHistory[]` before overwriting the active pointer.
 *   - Turnover-cost ledger is append-only — once recorded, a cost entry
 *     can only be SUPERSEDED by a new entry (with the original kept).
 *
 * Zero external dependencies. Only Node.js built-ins (none actually needed).
 *
 * ---------------------------------------------------------------------------
 * Public API — class `VacancyTracker`:
 *
 *   new VacancyTracker({ defaultMarketRent, alertDays, clock } = {})
 *
 *   .registerProperty({ id, name_he, name_en, address, marketRent,
 *                       unitType, city, sizeSqm })
 *        → property (frozen)
 *
 *   .markVacant(propertyId, {
 *       vacatedDate,         // Date | ISO string — defaults to now
 *       reason,              // one of VACANCY_REASONS
 *       previousTenant,      // {name, leaseId, contactPhone}
 *       conditionReport,     // free-form condition summary
 *       photos,              // array of {url, caption}
 *     })
 *        → vacancy record (frozen)
 *
 *   .markOccupied(propertyId, {
 *       leaseId,             // string
 *       moveInDate,          // Date | ISO string — defaults to now
 *       tenantName,          // optional
 *       monthlyRent,         // optional — defaults to property marketRent
 *     })
 *        → occupancy transition (frozen)
 *
 *   .recordTurnoverCost(propertyId, {
 *       cleaning, painting, repairs, description, date
 *     })
 *        → cost entry (frozen)
 *
 *   .marketingStatus(propertyId, {
 *       listed,              // bool
 *       platforms,           // subset of LISTING_PLATFORMS
 *       viewings,            // number OR array of viewing events
 *       applications,        // number OR array of application events
 *     })
 *        → campaign (frozen)
 *
 *   .vacancyRate(portfolio, period?)     → {rate, vacantUnits, totalUnits, ...}
 *   .daysVacant(propertyId, asOf?)       → integer days
 *   .lostRevenue(propertyId, asOf?)      → ILS
 *   .turnoverCost(propertyId)            → ILS (rolled up per vacancy period)
 *   .applicationFunnel(portfolio?, period?) → {listings, viewings, …, rates}
 *   .timeToLease(period?)                → avg days (vacancy → new lease)
 *   .seasonalPatterns()                  → {monthly: [12], peakMonth, ...}
 *   .alertLongVacancy(thresholdDays?)    → array of alerts
 *
 *   .getProperty(propertyId)             → frozen snapshot
 *   .listProperties()                    → array of frozen snapshots
 *   .generateReport(propertyId?)         → bilingual HE/EN report
 *
 *   // Static bilingual dictionaries
 *   VacancyTracker.VACANCY_REASONS
 *   VacancyTracker.LISTING_PLATFORMS
 *   VacancyTracker.UNIT_TYPES
 *   VacancyTracker.GLOSSARY
 *
 *   // Platform stubs — document real API surface for future wiring
 *   VacancyTracker.yad2Stub        → { publish, unpublish, metrics } stubs
 *   VacancyTracker.madlanStub
 *   VacancyTracker.homelessStub
 *
 * ---------------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Constants — bilingual dictionaries
// ═══════════════════════════════════════════════════════════════════════════

const DAY_MS = 24 * 60 * 60 * 1000;

/** Canonical reasons a tenant vacates. Bilingual HE/EN. */
const VACANCY_REASONS = Object.freeze({
  lease_ended: {
    he: 'סיום חוזה שכירות',
    en: 'Lease ended (natural expiry)',
  },
  tenant_left: {
    he: 'הדייר עזב מרצונו',
    en: 'Tenant moved out voluntarily',
  },
  eviction: {
    he: 'פינוי בצו',
    en: 'Eviction order',
  },
  breach: {
    he: 'הפרת חוזה',
    en: 'Lease breach / early termination',
  },
  non_payment: {
    he: 'אי-תשלום שכר דירה',
    en: 'Non-payment of rent',
  },
  renovation: {
    he: 'שיפוץ יזום',
    en: 'Planned renovation',
  },
  owner_sale: {
    he: 'מכירת הנכס',
    en: 'Property sale',
  },
  tama38: {
    he: 'תמ"א 38 / פינוי-בינוי',
    en: 'TAMA-38 / urban renewal',
  },
  other: {
    he: 'אחר',
    en: 'Other',
  },
});

/** Israeli rental-listing platforms. `apiDocUrl` points to the real doc. */
const LISTING_PLATFORMS = Object.freeze({
  yad2: {
    he: 'יד2',
    en: 'Yad2',
    domain: 'yad2.co.il',
    // Yad2 does not publish an open public REST API for listings;
    // syndication is typically done via RSS feed push to yad2.co.il
    // or commercial XML feeds for brokerages. Document the real API
    // before wiring up live publishing.
    apiDocUrl: 'https://www.yad2.co.il/help/api (private partner)',
    notes:
      'private partner API — no public docs. Contact sales@yad2.co.il for XML feed onboarding.',
  },
  madlan: {
    he: 'מדלן',
    en: 'Madlan',
    domain: 'madlan.co.il',
    apiDocUrl: 'https://www.madlan.co.il/api (partner only)',
    notes:
      'partner XML/CSV feed ingestion for brokerage portfolios; no self-serve REST API as of 2026.',
  },
  homeless: {
    he: 'הומלס',
    en: 'Homeless',
    domain: 'homeless.co.il',
    apiDocUrl: 'https://www.homeless.co.il/api (feed only)',
    notes:
      'nightly CSV feed ingestion; manual posting via portal for single listings.',
  },
  komo: {
    he: 'קומו',
    en: 'Komo',
    domain: 'komo.co.il',
    apiDocUrl: 'https://www.komo.co.il/api (partner only)',
    notes: 'feed-based partner integration.',
  },
  facebook_marketplace: {
    he: 'פייסבוק מרקטפלייס',
    en: 'Facebook Marketplace',
    domain: 'facebook.com/marketplace',
    apiDocUrl: 'https://developers.facebook.com/docs/marketing-api',
    notes: 'Graph API — requires approved app + page token.',
  },
});

/** Rental unit types (Israeli residential + commercial). */
const UNIT_TYPES = Object.freeze({
  apartment: { he: 'דירה', en: 'Apartment' },
  studio: { he: 'סטודיו', en: 'Studio' },
  penthouse: { he: 'פנטהאוז', en: 'Penthouse' },
  duplex: { he: 'דופלקס', en: 'Duplex' },
  villa: { he: 'וילה', en: 'Villa' },
  house: { he: 'בית פרטי', en: 'Single-family home' },
  room: { he: 'חדר בדירת שותפים', en: 'Room in share' },
  office: { he: 'משרד', en: 'Office' },
  retail: { he: 'חנות', en: 'Retail / storefront' },
  warehouse: { he: 'מחסן', en: 'Warehouse' },
  industrial: { he: 'תעשייה', en: 'Industrial space' },
});

/** Bilingual glossary for UI & docs. */
const GLOSSARY = Object.freeze({
  vacancy_rate: { he: 'אחוז נכסים פנויים', en: 'Vacancy rate' },
  days_vacant: { he: 'ימי פנוי', en: 'Days vacant' },
  lost_revenue: { he: 'הפסד הכנסה', en: 'Lost revenue' },
  turnover_cost: { he: 'עלות החלפת דייר', en: 'Turnover cost' },
  time_to_lease: { he: 'זמן להשכרה', en: 'Time to lease' },
  application_funnel: { he: 'משפך מועמדויות', en: 'Application funnel' },
  seasonal_pattern: { he: 'דפוס עונתי', en: 'Seasonal pattern' },
  market_rent: { he: 'שכר דירה שוקי', en: 'Market rent' },
  listing: { he: 'מודעה', en: 'Listing' },
  viewing: { he: 'סיור', en: 'Viewing' },
  application: { he: 'מועמדות', en: 'Application' },
  approved: { he: 'מאושר', en: 'Approved' },
  leased: { he: 'מושכר', en: 'Leased' },
  portfolio: { he: 'פורטפוליו נכסים', en: 'Property portfolio' },
  condition_report: { he: 'דו"ח מצב', en: 'Condition report' },
});

// ═══════════════════════════════════════════════════════════════════════════
// Helpers — dates, math, validation
// ═══════════════════════════════════════════════════════════════════════════

/** Normalise Date | string → epoch ms. Returns NaN on bad input. */
function toTs(value) {
  if (value === undefined || value === null) return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Positive-or-zero coercion. */
function nonNeg(v) {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Round half-up to `digits` decimal places, IEEE-drift protected. */
function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, digits);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Integer day-count between two epoch-ms timestamps (ceiling). */
function daysBetween(fromTs, toTs) {
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs <= fromTs) return 0;
  return Math.max(0, Math.floor((toTs - fromTs) / DAY_MS));
}

/** Parse period filter. See oee-tracker for the shared convention. */
function parsePeriod(period) {
  if (!period || period === 'all') return { from: -Infinity, to: Infinity };
  if (typeof period === 'string') {
    const now = Date.now();
    if (period === 'today') return { from: now - DAY_MS, to: now + DAY_MS };
    if (period === 'week') return { from: now - 7 * DAY_MS, to: now + DAY_MS };
    if (period === 'month') return { from: now - 30 * DAY_MS, to: now + DAY_MS };
    if (period === 'quarter') return { from: now - 90 * DAY_MS, to: now + DAY_MS };
    if (period === 'year') return { from: now - 365 * DAY_MS, to: now + DAY_MS };
    return { from: -Infinity, to: Infinity };
  }
  const from = period.from ? toTs(period.from) : -Infinity;
  const to = period.to ? toTs(period.to) : Infinity;
  return {
    from: Number.isFinite(from) ? from : -Infinity,
    to: Number.isFinite(to) ? to : Infinity,
  };
}

/** Clone-and-freeze shallow helper — keeps callers from mutating history. */
function freezeShallow(obj) {
  return Object.freeze({ ...obj });
}

// ═══════════════════════════════════════════════════════════════════════════
// VacancyTracker — the main class
// ═══════════════════════════════════════════════════════════════════════════

class VacancyTracker {
  constructor({
    defaultMarketRent = 0,
    alertDays = 45,
    clock = () => Date.now(),
  } = {}) {
    /** Map<propertyId, propertyState>. Property state is mutable at the
     *  top level (to append history), but every entry in `vacancies[]`,
     *  `campaignHistory[]` and `turnoverLedger[]` is a frozen record. */
    this._properties = new Map();

    this.defaultMarketRent = nonNeg(defaultMarketRent);
    this.alertDays = Math.max(1, Math.floor(nonNeg(alertDays)) || 45);
    this._clock = typeof clock === 'function' ? clock : () => Date.now();

    // Expose static dictionaries on the instance for convenience.
    this.VACANCY_REASONS = VACANCY_REASONS;
    this.LISTING_PLATFORMS = LISTING_PLATFORMS;
    this.UNIT_TYPES = UNIT_TYPES;
    this.GLOSSARY = GLOSSARY;
  }

  // ─── registerProperty ────────────────────────────────────────────────

  /**
   * Register a rental unit. Idempotent — re-registering an existing id
   * returns the existing state snapshot (never overwrites history).
   */
  registerProperty(input) {
    if (!input || typeof input !== 'object') {
      throw new TypeError('registerProperty requires an object');
    }
    const id = String(input.id || '').trim();
    if (!id) throw new Error('property id is required');

    if (this._properties.has(id)) {
      return this.getProperty(id);
    }

    const unitType = input.unitType && UNIT_TYPES[input.unitType]
      ? input.unitType
      : 'apartment';

    const state = {
      id,
      name_he: input.name_he ? String(input.name_he) : id,
      name_en: input.name_en ? String(input.name_en) : id,
      address: input.address ? String(input.address) : '',
      city: input.city ? String(input.city) : '',
      sizeSqm: nonNeg(input.sizeSqm),
      unitType,
      unitTypeLabel: UNIT_TYPES[unitType],
      marketRent: nonNeg(input.marketRent) || this.defaultMarketRent,
      createdAt: new Date(this._clock()).toISOString(),

      // Timeline — append-only.
      vacancies: [],     // array of frozen vacancy periods
      occupancies: [],   // array of frozen occupancy transitions
      turnoverLedger: [],
      campaignHistory: [],

      // Rolling "current" pointers — updated but old pointers snapshot
      // to history arrays above.
      currentVacancyIndex: -1, // index in `vacancies`; -1 = occupied
      currentCampaign: null,
    };

    this._properties.set(id, state);
    return this.getProperty(id);
  }

  // ─── markVacant ──────────────────────────────────────────────────────

  /**
   * Mark a property vacant. Appends a new vacancy period.
   *
   * If called on an already-vacant unit, the call is treated as an UPDATE
   * to the active period: the new payload is pushed onto the period's
   * `revisions[]` array. The previous revision is preserved.
   */
  markVacant(propertyId, details = {}) {
    const state = this._requireProperty(propertyId);

    const vacatedDate = details.vacatedDate
      ? toTs(details.vacatedDate)
      : this._clock();
    if (!Number.isFinite(vacatedDate)) {
      throw new Error('vacatedDate is invalid');
    }

    const reason = details.reason && VACANCY_REASONS[details.reason]
      ? details.reason
      : 'other';

    const revision = Object.freeze({
      vacatedDate: new Date(vacatedDate).toISOString(),
      reason,
      reasonLabel: VACANCY_REASONS[reason],
      previousTenant: details.previousTenant
        ? freezeShallow(details.previousTenant)
        : null,
      conditionReport: details.conditionReport
        ? String(details.conditionReport)
        : '',
      photos: Array.isArray(details.photos)
        ? Object.freeze(details.photos.map((p) => freezeShallow(p)))
        : Object.freeze([]),
      recordedAt: new Date(this._clock()).toISOString(),
    });

    // If there's an active vacancy period, append as a revision.
    if (state.currentVacancyIndex >= 0) {
      const active = state.vacancies[state.currentVacancyIndex];
      const revisions = [...active.revisions, revision];
      const updated = Object.freeze({
        ...active,
        // Latest revision wins for the "headline" fields.
        reason: revision.reason,
        reasonLabel: revision.reasonLabel,
        previousTenant: revision.previousTenant,
        conditionReport: revision.conditionReport,
        photos: revision.photos,
        revisions: Object.freeze(revisions),
      });
      state.vacancies[state.currentVacancyIndex] = updated;
      return updated;
    }

    // Otherwise open a brand-new vacancy period.
    const period = Object.freeze({
      periodId: `VAC-${propertyId}-${state.vacancies.length + 1}`,
      vacatedDate: revision.vacatedDate,
      vacatedTs: vacatedDate,
      reoccupiedDate: null,
      reoccupiedTs: null,
      leaseId: null,
      reason: revision.reason,
      reasonLabel: revision.reasonLabel,
      previousTenant: revision.previousTenant,
      conditionReport: revision.conditionReport,
      photos: revision.photos,
      revisions: Object.freeze([revision]),
    });

    state.vacancies.push(period);
    state.currentVacancyIndex = state.vacancies.length - 1;
    return period;
  }

  // ─── markOccupied ────────────────────────────────────────────────────

  /**
   * Close the active vacancy period (if any) and register an occupancy
   * transition. Never mutates prior records — the closed vacancy period
   * is replaced in `vacancies[]` with a new frozen copy carrying the
   * `reoccupiedDate` / `reoccupiedTs` fields filled in.
   */
  markOccupied(propertyId, details = {}) {
    const state = this._requireProperty(propertyId);

    const moveInDate = details.moveInDate
      ? toTs(details.moveInDate)
      : this._clock();
    if (!Number.isFinite(moveInDate)) {
      throw new Error('moveInDate is invalid');
    }

    const leaseId = details.leaseId ? String(details.leaseId) : '';
    const monthlyRent = nonNeg(details.monthlyRent) || state.marketRent;

    // Close out active vacancy period, if any.
    if (state.currentVacancyIndex >= 0) {
      const active = state.vacancies[state.currentVacancyIndex];
      const closed = Object.freeze({
        ...active,
        reoccupiedDate: new Date(moveInDate).toISOString(),
        reoccupiedTs: moveInDate,
        leaseId: leaseId || active.leaseId,
      });
      state.vacancies[state.currentVacancyIndex] = closed;
      state.currentVacancyIndex = -1;
    }

    const transition = Object.freeze({
      propertyId,
      leaseId,
      moveInDate: new Date(moveInDate).toISOString(),
      moveInTs: moveInDate,
      tenantName: details.tenantName ? String(details.tenantName) : '',
      monthlyRent,
      recordedAt: new Date(this._clock()).toISOString(),
    });

    state.occupancies.push(transition);
    return transition;
  }

  // ─── recordTurnoverCost ─────────────────────────────────────────────

  /**
   * Append a turnover-cost ledger entry. Attached to the most-recent
   * vacancy period (by default) so `turnoverCost(propertyId)` can roll
   * up per-period. Pass `periodId` to target a specific historical period.
   */
  recordTurnoverCost(propertyId, details = {}) {
    const state = this._requireProperty(propertyId);

    const cleaning = round(nonNeg(details.cleaning));
    const painting = round(nonNeg(details.painting));
    const repairs = round(nonNeg(details.repairs));
    const date = details.date ? toTs(details.date) : this._clock();

    // Resolve the period this cost belongs to.
    let periodId = details.periodId ? String(details.periodId) : null;
    if (!periodId) {
      if (state.vacancies.length > 0) {
        periodId = state.vacancies[state.vacancies.length - 1].periodId;
      } else {
        periodId = `VAC-${propertyId}-external`;
      }
    }

    const entry = Object.freeze({
      propertyId,
      periodId,
      cleaning,
      painting,
      repairs,
      total: round(cleaning + painting + repairs),
      description: details.description ? String(details.description) : '',
      date: new Date(date).toISOString(),
      dateTs: date,
      recordedAt: new Date(this._clock()).toISOString(),
    });

    state.turnoverLedger.push(entry);
    return entry;
  }

  // ─── marketingStatus ────────────────────────────────────────────────

  /**
   * Update marketing status for a property. Snapshots the prior active
   * campaign onto `campaignHistory[]` before overwriting the pointer.
   *
   * `viewings` / `applications` may be a number (total count) OR an
   * array of event objects `{date, contact, notes}`. Arrays are stored
   * verbatim as frozen records; numbers are rolled into a `.count` scalar
   * and a `[]` event list.
   */
  marketingStatus(propertyId, details = {}) {
    const state = this._requireProperty(propertyId);

    const platforms = Array.isArray(details.platforms)
      ? details.platforms.filter((p) => LISTING_PLATFORMS[p])
      : [];

    const viewings = this._normaliseEvents(details.viewings);
    const applications = this._normaliseEvents(details.applications);

    const campaign = Object.freeze({
      listed: !!details.listed,
      platforms: Object.freeze(platforms),
      platformLabels: Object.freeze(
        platforms.map((p) => ({
          key: p,
          ...LISTING_PLATFORMS[p],
        })),
      ),
      viewings: Object.freeze(viewings),
      applications: Object.freeze(applications),
      viewingCount: viewings.length,
      applicationCount: applications.length,
      updatedAt: new Date(this._clock()).toISOString(),
    });

    // Snapshot previous campaign to history before overwriting.
    if (state.currentCampaign) {
      state.campaignHistory.push(state.currentCampaign);
    }
    state.currentCampaign = campaign;
    return campaign;
  }

  _normaliseEvents(value) {
    if (typeof value === 'number' && value >= 0) {
      // Synthetic count → create `n` placeholder events.
      const arr = [];
      for (let i = 0; i < Math.floor(value); i++) {
        arr.push(
          Object.freeze({
            date: new Date(this._clock()).toISOString(),
            contact: '',
            notes: '',
          }),
        );
      }
      return arr;
    }
    if (Array.isArray(value)) {
      return value.map((e) =>
        Object.freeze({
          date: e && e.date ? new Date(toTs(e.date) || this._clock()).toISOString() : new Date(this._clock()).toISOString(),
          contact: e && e.contact ? String(e.contact) : '',
          notes: e && e.notes ? String(e.notes) : '',
          approved: !!(e && e.approved),
          leased: !!(e && e.leased),
        }),
      );
    }
    return [];
  }

  // ═══════════════════════════════════════════════════════════════════
  // Metric computation
  // ═══════════════════════════════════════════════════════════════════

  // ─── vacancyRate ────────────────────────────────────────────────────

  /**
   * Percentage of units vacant for a given portfolio at a given period.
   *
   * `portfolio` — optional array of property ids to restrict to. If
   * omitted, uses the full registered set.
   *
   * `period` — parsed via `parsePeriod`. When a period is given, the
   * rate is time-weighted: sum of vacant-days across all units divided
   * by (total property-days in window). Without a period, returns the
   * instantaneous rate (# currently vacant / total).
   */
  vacancyRate(portfolio, period) {
    const ids = this._resolvePortfolio(portfolio);
    const total = ids.length;
    if (total === 0) {
      return {
        rate: 0,
        vacantUnits: 0,
        totalUnits: 0,
        vacantDays: 0,
        portfolioDays: 0,
      };
    }

    // Instantaneous (no period)
    if (!period) {
      let vacant = 0;
      for (const id of ids) {
        const s = this._properties.get(id);
        if (s && s.currentVacancyIndex >= 0) vacant++;
      }
      return {
        rate: round(vacant / total, 4),
        ratePct: round((vacant / total) * 100, 2),
        vacantUnits: vacant,
        totalUnits: total,
        vacantDays: null,
        portfolioDays: null,
      };
    }

    // Time-weighted across period window
    const { from, to } = parsePeriod(period);
    const now = this._clock();
    const windowStart = Number.isFinite(from) ? from : now - 365 * DAY_MS;
    const windowEnd = Number.isFinite(to) ? to : now;
    const windowLenDays = Math.max(0, (windowEnd - windowStart) / DAY_MS);

    let vacantDays = 0;
    let vacantUnitsInstant = 0;
    for (const id of ids) {
      const s = this._properties.get(id);
      if (!s) continue;
      if (s.currentVacancyIndex >= 0) vacantUnitsInstant++;

      for (const v of s.vacancies) {
        const vStart = Math.max(v.vacatedTs, windowStart);
        const vEnd = Math.min(
          v.reoccupiedTs != null ? v.reoccupiedTs : now,
          windowEnd,
        );
        if (vEnd > vStart) {
          vacantDays += (vEnd - vStart) / DAY_MS;
        }
      }
    }

    const portfolioDays = windowLenDays * total;
    const rate = portfolioDays > 0 ? vacantDays / portfolioDays : 0;
    return {
      rate: round(rate, 4),
      ratePct: round(rate * 100, 2),
      vacantUnits: vacantUnitsInstant,
      totalUnits: total,
      vacantDays: round(vacantDays, 2),
      portfolioDays: round(portfolioDays, 2),
      period: { from: new Date(windowStart).toISOString(), to: new Date(windowEnd).toISOString() },
    };
  }

  // ─── daysVacant ─────────────────────────────────────────────────────

  /** Running days vacant for a property (active period only). */
  daysVacant(propertyId, asOf) {
    const state = this._requireProperty(propertyId);
    if (state.currentVacancyIndex < 0) return 0;
    const current = state.vacancies[state.currentVacancyIndex];
    const end = asOf ? toTs(asOf) : this._clock();
    return daysBetween(current.vacatedTs, end);
  }

  // ─── lostRevenue ────────────────────────────────────────────────────

  /**
   * Lost revenue = days vacant × daily market rent.
   *   - If currently vacant: uses the running days on the active period.
   *   - Always sums prior closed vacancy periods too, since each one
   *     represents historical lost revenue.
   */
  lostRevenue(propertyId, asOf) {
    const state = this._requireProperty(propertyId);
    const dailyRent = state.marketRent / 30; // monthly → daily
    const now = asOf ? toTs(asOf) : this._clock();

    let totalDays = 0;
    const byPeriod = [];

    for (const v of state.vacancies) {
      const endTs = v.reoccupiedTs != null ? v.reoccupiedTs : now;
      const days = daysBetween(v.vacatedTs, endTs);
      totalDays += days;
      byPeriod.push({
        periodId: v.periodId,
        days,
        revenue: round(days * dailyRent),
        closed: v.reoccupiedTs != null,
      });
    }

    return {
      propertyId,
      totalDaysVacant: totalDays,
      dailyRent: round(dailyRent),
      marketRent: state.marketRent,
      lostRevenue: round(totalDays * dailyRent),
      byPeriod,
    };
  }

  // ─── turnoverCost ───────────────────────────────────────────────────

  /**
   * Roll up turnover costs: cleaning + painting + repairs, per vacancy
   * period, plus the grand total. Returns zeros when no entries exist.
   */
  turnoverCost(propertyId) {
    const state = this._requireProperty(propertyId);
    const byPeriod = new Map();
    let grandTotal = 0;
    let cleaning = 0;
    let painting = 0;
    let repairs = 0;

    for (const entry of state.turnoverLedger) {
      cleaning += entry.cleaning;
      painting += entry.painting;
      repairs += entry.repairs;
      grandTotal += entry.total;

      const bucket = byPeriod.get(entry.periodId) || {
        periodId: entry.periodId,
        cleaning: 0,
        painting: 0,
        repairs: 0,
        total: 0,
      };
      bucket.cleaning = round(bucket.cleaning + entry.cleaning);
      bucket.painting = round(bucket.painting + entry.painting);
      bucket.repairs = round(bucket.repairs + entry.repairs);
      bucket.total = round(bucket.total + entry.total);
      byPeriod.set(entry.periodId, bucket);
    }

    return {
      propertyId,
      cleaning: round(cleaning),
      painting: round(painting),
      repairs: round(repairs),
      total: round(grandTotal),
      entries: state.turnoverLedger.length,
      byPeriod: Array.from(byPeriod.values()),
    };
  }

  // ─── applicationFunnel ──────────────────────────────────────────────

  /**
   * Conversion funnel across portfolio:
   *   listings → viewings → applications → approved → leased
   *
   * All rates expressed as ratios 0..1 (and a `*Pct` twin as percent).
   */
  applicationFunnel(portfolio, period) {
    const ids = this._resolvePortfolio(portfolio);
    const { from, to } = parsePeriod(period);

    let listings = 0;
    let viewings = 0;
    let applications = 0;
    let approved = 0;
    let leased = 0;

    for (const id of ids) {
      const s = this._properties.get(id);
      if (!s) continue;

      // Collect all campaigns (current + historical) within window.
      const campaigns = [...s.campaignHistory];
      if (s.currentCampaign) campaigns.push(s.currentCampaign);

      for (const c of campaigns) {
        const ts = toTs(c.updatedAt);
        if (!(ts >= from && ts <= to)) continue;
        if (c.listed) listings++;
        viewings += c.viewings.length;
        applications += c.applications.length;
        for (const app of c.applications) {
          if (app.approved) approved++;
          if (app.leased) leased++;
        }
      }

      // Count every occupancy transition in window as a lease event if
      // no explicit `leased` flag was set in application events.
      if (leased === 0) {
        for (const occ of s.occupancies) {
          if (occ.moveInTs >= from && occ.moveInTs <= to) leased++;
        }
      }
    }

    const safeRate = (num, den) => (den > 0 ? round(num / den, 4) : 0);

    return {
      listings,
      viewings,
      applications,
      approved,
      leased,
      rates: {
        listingToViewing: safeRate(viewings, listings),
        viewingToApplication: safeRate(applications, viewings),
        applicationToApproval: safeRate(approved, applications),
        approvalToLease: safeRate(leased, approved),
        overallConversion: safeRate(leased, listings),
      },
      ratesPct: {
        listingToViewing: round(safeRate(viewings, listings) * 100, 2),
        viewingToApplication: round(safeRate(applications, viewings) * 100, 2),
        applicationToApproval: round(safeRate(approved, applications) * 100, 2),
        approvalToLease: round(safeRate(leased, approved) * 100, 2),
        overallConversion: round(safeRate(leased, listings) * 100, 2),
      },
    };
  }

  // ─── timeToLease ────────────────────────────────────────────────────

  /**
   * Average days from vacancy start to new lease (closed periods only).
   * Optional period filter restricts by the re-occupied date.
   */
  timeToLease(period) {
    const { from, to } = parsePeriod(period);
    let days = 0;
    let n = 0;
    const samples = [];

    for (const s of this._properties.values()) {
      for (const v of s.vacancies) {
        if (v.reoccupiedTs == null) continue;
        if (v.reoccupiedTs < from || v.reoccupiedTs > to) continue;
        const d = daysBetween(v.vacatedTs, v.reoccupiedTs);
        days += d;
        n++;
        samples.push({ propertyId: s.id, periodId: v.periodId, days: d });
      }
    }

    return {
      avgDays: n > 0 ? round(days / n, 2) : 0,
      medianDays: n > 0 ? this._median(samples.map((s) => s.days)) : 0,
      samples: n,
      totalDays: days,
      window: {
        from: Number.isFinite(from) ? new Date(from).toISOString() : null,
        to: Number.isFinite(to) ? new Date(to).toISOString() : null,
      },
    };
  }

  _median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? round((sorted[mid - 1] + sorted[mid]) / 2, 2)
      : sorted[mid];
  }

  // ─── seasonalPatterns ───────────────────────────────────────────────

  /**
   * Buckets vacancy activity by calendar month (Jan-Dec).
   * Returns: monthly[12] array of vacancy-start counts + vacancy-days,
   * plus `peakMonth` (1-indexed) and HE/EN labels.
   */
  seasonalPatterns() {
    const MONTHS_HE = [
      'ינואר',
      'פברואר',
      'מרץ',
      'אפריל',
      'מאי',
      'יוני',
      'יולי',
      'אוגוסט',
      'ספטמבר',
      'אוקטובר',
      'נובמבר',
      'דצמבר',
    ];
    const MONTHS_EN = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      he: MONTHS_HE[i],
      en: MONTHS_EN[i],
      vacancyStarts: 0,
      vacancyDays: 0,
      turnovers: 0,
    }));

    const now = this._clock();
    for (const s of this._properties.values()) {
      for (const v of s.vacancies) {
        const start = new Date(v.vacatedTs);
        monthly[start.getMonth()].vacancyStarts++;
        const endTs = v.reoccupiedTs != null ? v.reoccupiedTs : now;
        const totalDays = daysBetween(v.vacatedTs, endTs);

        // Distribute days across months they touched.
        const dayMs = DAY_MS;
        for (let t = v.vacatedTs; t < endTs; t += dayMs) {
          const d = new Date(t);
          monthly[d.getMonth()].vacancyDays++;
        }

        if (v.reoccupiedTs != null) {
          monthly[new Date(v.reoccupiedTs).getMonth()].turnovers++;
        }
        // Reference to totalDays to silence lint — monthly distribution
        // already captured above via the day-stride loop.
        void totalDays;
      }
    }

    // Find peaks (most starts, most days).
    let peakStarts = 0;
    let peakStartsMonth = 1;
    let peakDays = 0;
    let peakDaysMonth = 1;
    for (const m of monthly) {
      if (m.vacancyStarts > peakStarts) {
        peakStarts = m.vacancyStarts;
        peakStartsMonth = m.month;
      }
      if (m.vacancyDays > peakDays) {
        peakDays = m.vacancyDays;
        peakDaysMonth = m.month;
      }
    }

    return {
      monthly,
      peakStartsMonth,
      peakDaysMonth,
      peakStartsLabel: {
        he: MONTHS_HE[peakStartsMonth - 1],
        en: MONTHS_EN[peakStartsMonth - 1],
      },
      peakDaysLabel: {
        he: MONTHS_HE[peakDaysMonth - 1],
        en: MONTHS_EN[peakDaysMonth - 1],
      },
    };
  }

  // ─── alertLongVacancy ───────────────────────────────────────────────

  /**
   * Return every property whose active vacancy exceeds `thresholdDays`.
   * Default threshold is the instance-level `alertDays` (45 days).
   */
  alertLongVacancy(thresholdDays) {
    const threshold = Math.max(
      1,
      Math.floor(nonNeg(thresholdDays)) || this.alertDays,
    );
    const now = this._clock();
    const alerts = [];

    for (const s of this._properties.values()) {
      if (s.currentVacancyIndex < 0) continue;
      const active = s.vacancies[s.currentVacancyIndex];
      const days = daysBetween(active.vacatedTs, now);
      if (days < threshold) continue;

      const campaign = s.currentCampaign;
      const lost = round((days * s.marketRent) / 30);

      alerts.push(
        Object.freeze({
          propertyId: s.id,
          name_he: s.name_he,
          name_en: s.name_en,
          address: s.address,
          city: s.city,
          daysVacant: days,
          threshold,
          marketRent: s.marketRent,
          lostRevenue: lost,
          listed: !!(campaign && campaign.listed),
          platforms: campaign ? campaign.platforms : [],
          viewingCount: campaign ? campaign.viewingCount : 0,
          applicationCount: campaign ? campaign.applicationCount : 0,
          severity:
            days > threshold * 2
              ? 'critical'
              : days > threshold * 1.5
                ? 'high'
                : 'medium',
          message_he: `הנכס "${s.name_he}" פנוי ${days} ימים — מעל סף של ${threshold} ימים. הפסד מצטבר: ₪${lost.toLocaleString('he-IL')}`,
          message_en: `Property "${s.name_en}" vacant ${days} days — over ${threshold}-day threshold. Cumulative loss: ILS ${lost.toLocaleString('en-IL')}`,
        }),
      );
    }

    // Sort worst-first.
    alerts.sort((a, b) => b.daysVacant - a.daysVacant);
    return alerts;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Read-only helpers
  // ═══════════════════════════════════════════════════════════════════

  getProperty(propertyId) {
    const state = this._properties.get(propertyId);
    if (!state) return null;
    return Object.freeze({
      id: state.id,
      name_he: state.name_he,
      name_en: state.name_en,
      address: state.address,
      city: state.city,
      sizeSqm: state.sizeSqm,
      unitType: state.unitType,
      unitTypeLabel: state.unitTypeLabel,
      marketRent: state.marketRent,
      createdAt: state.createdAt,
      vacancies: Object.freeze([...state.vacancies]),
      occupancies: Object.freeze([...state.occupancies]),
      turnoverLedger: Object.freeze([...state.turnoverLedger]),
      campaignHistory: Object.freeze([...state.campaignHistory]),
      currentCampaign: state.currentCampaign,
      isVacant: state.currentVacancyIndex >= 0,
      activeVacancy:
        state.currentVacancyIndex >= 0
          ? state.vacancies[state.currentVacancyIndex]
          : null,
    });
  }

  listProperties() {
    return Array.from(this._properties.keys()).map((id) =>
      this.getProperty(id),
    );
  }

  /**
   * Generate a bilingual report — either per-property (when id given)
   * or portfolio-wide roll-up.
   */
  generateReport(propertyId) {
    if (propertyId) {
      const s = this.getProperty(propertyId);
      if (!s) return null;
      return {
        id: s.id,
        title_he: `דו"ח תפוסה — ${s.name_he}`,
        title_en: `Occupancy Report — ${s.name_en}`,
        status_he: s.isVacant ? 'פנוי' : 'מושכר',
        status_en: s.isVacant ? 'Vacant' : 'Occupied',
        daysVacant: this.daysVacant(propertyId),
        lostRevenue: this.lostRevenue(propertyId),
        turnoverCost: this.turnoverCost(propertyId),
      };
    }
    const vr = this.vacancyRate(null);
    return {
      title_he: 'דו"ח פורטפוליו שכירות',
      title_en: 'Rental Portfolio Report',
      vacancyRate: vr,
      funnel: this.applicationFunnel(),
      timeToLease: this.timeToLease(),
      seasonal: this.seasonalPatterns(),
      longVacancyAlerts: this.alertLongVacancy(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Internal plumbing
  // ═══════════════════════════════════════════════════════════════════

  _requireProperty(propertyId) {
    const id = String(propertyId || '').trim();
    if (!id) throw new Error('propertyId is required');
    const state = this._properties.get(id);
    if (!state) throw new Error(`unknown property: ${id}`);
    return state;
  }

  _resolvePortfolio(portfolio) {
    if (!portfolio) return Array.from(this._properties.keys());
    if (Array.isArray(portfolio)) return portfolio.filter((id) => this._properties.has(id));
    if (typeof portfolio === 'string') {
      return this._properties.has(portfolio) ? [portfolio] : [];
    }
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Platform stubs — document real API needed for wiring up live publishing
// ═══════════════════════════════════════════════════════════════════════════
//
// NOTE: the three major Israeli residential-listing platforms (Yad2,
// Madlan, Homeless) do not expose self-serve public REST APIs for
// programmatic listing creation. They operate via:
//
//   1. Partner XML/CSV feed ingestion (Yad2, Madlan)
//   2. Nightly CSV feed upload (Homeless)
//   3. Per-listing manual upload through the brokerage portal
//
// Until a commercial feed partnership is signed, the stubs below simply
// return a simulated response documenting the request and the real
// endpoint that would be called in production.
//

function makePlatformStub(platformKey) {
  const meta = LISTING_PLATFORMS[platformKey];
  return Object.freeze({
    key: platformKey,
    meta,
    async publish(listing) {
      return Object.freeze({
        status: 'stub',
        platform: platformKey,
        apiDocUrl: meta ? meta.apiDocUrl : null,
        notes: meta ? meta.notes : null,
        payloadReceived: listing,
        message_he: `יש להגדיר אינטגרציה אמיתית מול ${meta ? meta.he : platformKey} — ראה תיעוד שותפים.`,
        message_en: `Real ${meta ? meta.en : platformKey} partner integration required — see partner docs.`,
      });
    },
    async unpublish(listingId) {
      return Object.freeze({
        status: 'stub',
        platform: platformKey,
        listingId,
        message_en: 'stub unpublish — real API required',
      });
    },
    async metrics(listingId) {
      return Object.freeze({
        status: 'stub',
        platform: platformKey,
        listingId,
        views: 0,
        inquiries: 0,
        message_en: 'stub metrics — real API required',
      });
    },
  });
}

VacancyTracker.VACANCY_REASONS = VACANCY_REASONS;
VacancyTracker.LISTING_PLATFORMS = LISTING_PLATFORMS;
VacancyTracker.UNIT_TYPES = UNIT_TYPES;
VacancyTracker.GLOSSARY = GLOSSARY;
VacancyTracker.yad2Stub = makePlatformStub('yad2');
VacancyTracker.madlanStub = makePlatformStub('madlan');
VacancyTracker.homelessStub = makePlatformStub('homeless');
VacancyTracker.komoStub = makePlatformStub('komo');
VacancyTracker.facebookStub = makePlatformStub('facebook_marketplace');

// Exposed for unit testing.
VacancyTracker._internal = Object.freeze({
  toTs,
  nonNeg,
  round,
  daysBetween,
  parsePeriod,
  DAY_MS,
});

module.exports = {
  VacancyTracker,
  VACANCY_REASONS,
  LISTING_PLATFORMS,
  UNIT_TYPES,
  GLOSSARY,
};
