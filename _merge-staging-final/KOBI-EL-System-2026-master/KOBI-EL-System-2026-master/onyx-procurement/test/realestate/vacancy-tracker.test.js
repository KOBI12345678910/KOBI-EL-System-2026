/**
 * AG-Y051 — Unit tests for the Rental Vacancy Tracker
 *
 * Covers:
 *   - registerProperty + idempotency
 *   - markVacant / markOccupied append-only timeline
 *   - vacancyRate (instantaneous + time-weighted)
 *   - daysVacant running counter
 *   - lostRevenue calculation (historic + active)
 *   - turnoverCost roll-up
 *   - marketingStatus + campaignHistory append-only
 *   - applicationFunnel conversion rates
 *   - timeToLease (avg + median)
 *   - seasonalPatterns (monthly buckets + peaks)
 *   - alertLongVacancy (severity + sort)
 *   - platform stubs return documented "stub" shapes
 *   - bilingual labels
 *
 * Run with:  node --test test/realestate/vacancy-tracker.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  VacancyTracker,
  VACANCY_REASONS,
  LISTING_PLATFORMS,
  UNIT_TYPES,
  GLOSSARY,
} = require('../../src/realestate/vacancy-tracker');

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const DAY = 24 * 60 * 60 * 1000;

/** Build a tracker with a fixed clock so tests are deterministic. */
function makeTracker(nowIso = '2026-04-11T09:00:00Z', opts = {}) {
  const now = new Date(nowIso).getTime();
  let tick = now;
  return new VacancyTracker({
    defaultMarketRent: 6000,
    alertDays: 45,
    clock: () => tick++,
    ...opts,
  });
}

function seedPortfolio(tracker) {
  tracker.registerProperty({
    id: 'P-TLV-01',
    name_he: 'דירת 3 חדרים תל אביב',
    name_en: '3-room apartment Tel Aviv',
    address: 'רחוב דיזנגוף 100',
    city: 'תל אביב',
    sizeSqm: 75,
    unitType: 'apartment',
    marketRent: 8000,
  });
  tracker.registerProperty({
    id: 'P-HAIFA-01',
    name_he: 'סטודיו בחיפה',
    name_en: 'Studio Haifa',
    address: 'רחוב הרצל 5',
    city: 'חיפה',
    sizeSqm: 35,
    unitType: 'studio',
    marketRent: 3500,
  });
  tracker.registerProperty({
    id: 'P-BS-01',
    name_he: 'פנטהאוז באר שבע',
    name_en: 'Penthouse Beer Sheva',
    address: 'רחוב רינגלבלום 50',
    city: 'באר שבע',
    sizeSqm: 140,
    unitType: 'penthouse',
    marketRent: 6500,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Registration + dictionary sanity
// ═══════════════════════════════════════════════════════════════════════════

describe('VacancyTracker — registration & dictionaries', () => {
  test('01. exports bilingual dictionaries', () => {
    assert.ok(VACANCY_REASONS.lease_ended);
    assert.equal(VACANCY_REASONS.lease_ended.he, 'סיום חוזה שכירות');
    assert.ok(LISTING_PLATFORMS.yad2);
    assert.equal(LISTING_PLATFORMS.yad2.domain, 'yad2.co.il');
    assert.ok(LISTING_PLATFORMS.madlan);
    assert.ok(LISTING_PLATFORMS.homeless);
    assert.ok(UNIT_TYPES.apartment);
    assert.equal(UNIT_TYPES.studio.he, 'סטודיו');
    assert.ok(GLOSSARY.vacancy_rate);
  });

  test('02. registerProperty creates and is idempotent', () => {
    const t = makeTracker();
    const p1 = t.registerProperty({
      id: 'P1',
      name_he: 'דירה 1',
      marketRent: 5000,
      unitType: 'apartment',
    });
    assert.equal(p1.id, 'P1');
    assert.equal(p1.marketRent, 5000);
    assert.equal(p1.unitType, 'apartment');
    assert.equal(p1.isVacant, false);

    // Re-register returns existing snapshot, no history overwrite.
    const p2 = t.registerProperty({ id: 'P1', marketRent: 9999 });
    assert.equal(p2.marketRent, 5000);
    assert.equal(t.listProperties().length, 1);
  });

  test('03. registerProperty throws on missing id', () => {
    const t = makeTracker();
    assert.throws(() => t.registerProperty({}), /id is required/);
    assert.throws(() => t.registerProperty(null), /object/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// markVacant / markOccupied timeline
// ═══════════════════════════════════════════════════════════════════════════

describe('VacancyTracker — vacant/occupied timeline', () => {
  test('04. markVacant opens a new period', () => {
    const t = makeTracker();
    seedPortfolio(t);

    const period = t.markVacant('P-TLV-01', {
      vacatedDate: '2026-03-01T08:00:00Z',
      reason: 'lease_ended',
      previousTenant: { name: 'משפחת כהן', leaseId: 'L-2025-7' },
      conditionReport: 'מצב טוב, ניקוי קל',
      photos: [{ url: 'photo1.jpg', caption: 'סלון' }],
    });

    assert.equal(period.reason, 'lease_ended');
    assert.equal(period.reasonLabel.he, 'סיום חוזה שכירות');
    assert.equal(period.previousTenant.name, 'משפחת כהן');
    assert.equal(period.reoccupiedDate, null);
    assert.equal(period.revisions.length, 1);

    const snap = t.getProperty('P-TLV-01');
    assert.equal(snap.isVacant, true);
    assert.equal(snap.vacancies.length, 1);
  });

  test('05. unknown reason falls back to "other"', () => {
    const t = makeTracker();
    seedPortfolio(t);
    const p = t.markVacant('P-HAIFA-01', { reason: 'volcano' });
    assert.equal(p.reason, 'other');
    assert.equal(p.reasonLabel.en, 'Other');
  });

  test('06. re-marking vacant appends a revision (append-only)', () => {
    const t = makeTracker();
    seedPortfolio(t);
    t.markVacant('P-TLV-01', {
      vacatedDate: '2026-03-01T08:00:00Z',
      reason: 'lease_ended',
    });
    const updated = t.markVacant('P-TLV-01', {
      vacatedDate: '2026-03-01T08:00:00Z',
      reason: 'non_payment',
      conditionReport: 'עדכון לאחר סיור שני',
    });
    assert.equal(updated.revisions.length, 2);
    assert.equal(updated.reason, 'non_payment');
    // Original still in revisions[0]
    assert.equal(updated.revisions[0].reason, 'lease_ended');
    assert.equal(updated.revisions[1].reason, 'non_payment');
    assert.equal(t.getProperty('P-TLV-01').vacancies.length, 1);
  });

  test('07. markOccupied closes the active period and records transition', () => {
    const t = makeTracker();
    seedPortfolio(t);
    t.markVacant('P-TLV-01', {
      vacatedDate: '2026-03-01T00:00:00Z',
      reason: 'lease_ended',
    });
    const trans = t.markOccupied('P-TLV-01', {
      leaseId: 'L-2026-12',
      moveInDate: '2026-03-25T00:00:00Z',
      tenantName: 'משפחת לוי',
      monthlyRent: 8500,
    });
    assert.equal(trans.leaseId, 'L-2026-12');
    assert.equal(trans.tenantName, 'משפחת לוי');
    assert.equal(trans.monthlyRent, 8500);

    const snap = t.getProperty('P-TLV-01');
    assert.equal(snap.isVacant, false);
    assert.equal(snap.vacancies[0].reoccupiedDate, '2026-03-25T00:00:00.000Z');
    assert.equal(snap.vacancies[0].leaseId, 'L-2026-12');
  });

  test('08. full lifecycle: vacant → occupied → vacant again creates two periods', () => {
    const t = makeTracker();
    seedPortfolio(t);
    t.markVacant('P-HAIFA-01', { vacatedDate: '2025-12-01T00:00:00Z', reason: 'lease_ended' });
    t.markOccupied('P-HAIFA-01', { leaseId: 'L-A', moveInDate: '2026-01-10T00:00:00Z' });
    t.markVacant('P-HAIFA-01', { vacatedDate: '2026-03-15T00:00:00Z', reason: 'tenant_left' });

    const snap = t.getProperty('P-HAIFA-01');
    assert.equal(snap.vacancies.length, 2);
    assert.equal(snap.vacancies[0].reoccupiedDate, '2026-01-10T00:00:00.000Z');
    assert.equal(snap.vacancies[1].reoccupiedDate, null);
    assert.equal(snap.isVacant, true);
  });

  test('09. markVacant / markOccupied throw on unknown property', () => {
    const t = makeTracker();
    assert.throws(() => t.markVacant('NOPE', {}), /unknown property/);
    assert.throws(() => t.markOccupied('NOPE', {}), /unknown property/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Vacancy rate
// ═══════════════════════════════════════════════════════════════════════════

describe('VacancyTracker — vacancyRate', () => {
  test('10. vacancyRate instantaneous — 1/3 vacant', () => {
    const t = makeTracker();
    seedPortfolio(t);
    t.markVacant('P-TLV-01', { vacatedDate: '2026-04-01T00:00:00Z', reason: 'lease_ended' });
    const vr = t.vacancyRate();
    assert.equal(vr.totalUnits, 3);
    assert.equal(vr.vacantUnits, 1);
    assert.equal(vr.rate, 0.3333);
    assert.equal(vr.ratePct, 33.33);
  });

  test('11. vacancyRate 0/0 returns zeros', () => {
    const t = makeTracker();
    const vr = t.vacancyRate();
    assert.equal(vr.rate, 0);
    assert.equal(vr.totalUnits, 0);
  });

  test('12. vacancyRate subset portfolio', () => {
    const t = makeTracker();
    seedPortfolio(t);
    t.markVacant('P-TLV-01', { vacatedDate: '2026-04-01T00:00:00Z', reason: 'lease_ended' });
    const vr = t.vacancyRate(['P-TLV-01', 'P-HAIFA-01']);
    assert.equal(vr.totalUnits, 2);
    assert.equal(vr.vacantUnits, 1);
    assert.equal(vr.rate, 0.5);
  });

  test('13. vacancyRate time-weighted across 100-day window', () => {
    // Fix clock at 2026-04-11 and test a 100-day window.
    const t = makeTracker('2026-04-11T00:00:00Z');
    seedPortfolio(t);
    // Unit 1 vacant for 30 days within window.
    t.markVacant('P-TLV-01', { vacatedDate: '2026-01-01T00:00:00Z', reason: 'lease_ended' });
    t.markOccupied('P-TLV-01', { leaseId: 'L1', moveInDate: '2026-01-31T00:00:00Z' });

    const vr = t.vacancyRate(null, {
      from: '2026-01-01T00:00:00Z',
      to: '2026-04-11T00:00:00Z',
    });
    // 30 vacant-days / (100 days × 3 units) = 0.1
    assert.equal(vr.totalUnits, 3);
    assert.equal(vr.vacantDays, 30);
    assert.equal(vr.portfolioDays, 300);
    assert.equal(vr.rate, 0.1);
    assert.equal(vr.ratePct, 10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// daysVacant / lostRevenue
// ═══════════════════════════════════════════════════════════════════════════

describe('VacancyTracker — daysVacant / lostRevenue', () => {
  test('14. daysVacant counts running days from vacatedDate', () => {
    const t = makeTracker('2026-04-11T00:00:00Z');
    seedPortfolio(t);
    t.markVacant('P-TLV-01', { vacatedDate: '2026-03-11T00:00:00Z', reason: 'lease_ended' });
    // asOf overrides the clock so we can assert a stable 31 days.
    assert.equal(t.daysVacant('P-TLV-01', '2026-04-11T00:00:00Z'), 31);
  });

  test('15. daysVacant returns 0 when occupied', () => {
    const t = makeTracker();
    seedPortfolio(t);
    assert.equal(t.daysVacant('P-HAIFA-01'), 0);
  });

  test('16. lostRevenue = totalDays × dailyRent', () => {
    const t = makeTracker('2026-04-11T00:00:00Z');
    seedPortfolio(t);
    // 30-day vacancy at ILS 8000/month = ILS 8000 lost
    t.markVacant('P-TLV-01', { vacatedDate: '2026-02-01T00:00:00Z', reason: 'lease_ended' });
    t.markOccupied('P-TLV-01', { leaseId: 'L1', moveInDate: '2026-03-03T00:00:00Z' });
    const lr = t.lostRevenue('P-TLV-01', '2026-04-11T00:00:00Z');
    // ILS 8000 / 30 days = 266.67 daily × 30 = ILS 8000
    assert.equal(lr.totalDaysVacant, 30);
    assert.equal(lr.marketRent, 8000);
    assert.equal(lr.lostRevenue, 8000);
    assert.equal(lr.byPeriod.length, 1);
    assert.equal(lr.byPeriod[0].closed, true);
  });

  test('17. lostRevenue includes active (still-open) period', () => {
    const t = makeTracker('2026-04-11T00:00:00Z');
    seedPortfolio(t);
    // 60-day active vacancy at ILS 3500/month ⇒ ILS 7000
    t.markVacant('P-HAIFA-01', {
      vacatedDate: '2026-02-10T00:00:00Z',
      reason: 'lease_ended',
    });
    const lr = t.lostRevenue('P-HAIFA-01', '2026-04-11T00:00:00Z');
    assert.equal(lr.totalDaysVacant, 60);
    assert.equal(lr.lostRevenue, 7000);
    assert.equal(lr.byPeriod[0].closed, false);
  });

  test('18. lostRevenue — zero periods returns zeros', () => {
    const t = makeTracker();
    seedPortfolio(t);
    const lr = t.lostRevenue('P-BS-01');
    assert.equal(lr.totalDaysVacant, 0);
    assert.equal(lr.lostRevenue, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// turnoverCost
// ═══════════════════════════════════════════════════════════════════════════

describe('VacancyTracker — turnoverCost', () => {
  test('19. recordTurnoverCost sums cleaning + painting + repairs', () => {
    const t = makeTracker();
    seedPortfolio(t);
    t.markVacant('P-TLV-01', {
      vacatedDate: '2026-03-01T00:00:00Z',
      reason: 'lease_ended',
    });
    t.recordTurnoverCost('P-TLV-01', {
      cleaning: 800,
      painting: 2200,
      repairs: 1500,
      description: 'ניקוי, צביעה וטיפול בדלת',
    });
    t.recordTurnoverCost('P-TLV-01', {
      cleaning: 200,
      painting: 0,
      repairs: 0,
      description: 'ניקוי סופי',
    });
    const tc = t.turnoverCost('P-TLV-01');
    assert.equal(tc.cleaning, 1000);
    assert.equal(tc.painting, 2200);
    assert.equal(tc.repairs, 1500);
    assert.equal(tc.total, 4700);
    assert.equal(tc.entries, 2);
    assert.equal(tc.byPeriod.length, 1);
    assert.equal(tc.byPeriod[0].total, 4700);
  });

  test('20. turnoverCost across two distinct vacancy periods', () => {
    const t = makeTracker();
    seedPortfolio(t);
    t.markVacant('P-TLV-01', { vacatedDate: '2025-11-01T00:00:00Z', reason: 'lease_ended' });
    t.recordTurnoverCost('P-TLV-01', { cleaning: 500, painting: 0, repairs: 0 });
    t.markOccupied('P-TLV-01', { leaseId: 'L-A', moveInDate: '2025-12-01T00:00:00Z' });
    t.markVacant('P-TLV-01', { vacatedDate: '2026-03-01T00:00:00Z', reason: 'lease_ended' });
    t.recordTurnoverCost('P-TLV-01', { cleaning: 600, painting: 1500, repairs: 300 });
    const tc = t.turnoverCost('P-TLV-01');
    assert.equal(tc.byPeriod.length, 2);
    assert.equal(tc.total, 500 + 600 + 1500 + 300);
  });

  test('21. turnoverCost — empty ledger', () => {
    const t = makeTracker();
    seedPortfolio(t);
    const tc = t.turnoverCost('P-BS-01');
    assert.equal(tc.total, 0);
    assert.equal(tc.entries, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// marketingStatus + campaignHistory
// ═══════════════════════════════════════════════════════════════════════════

describe('VacancyTracker — marketingStatus', () => {
  test('22. marketingStatus stores platforms + viewings + apps', () => {
    const t = makeTracker();
    seedPortfolio(t);
    const c = t.marketingStatus('P-TLV-01', {
      listed: true,
      platforms: ['yad2', 'madlan', 'homeless'],
      viewings: 5,
      applications: 2,
    });
    assert.equal(c.listed, true);
    assert.deepEqual([...c.platforms], ['yad2', 'madlan', 'homeless']);
    assert.equal(c.platformLabels.length, 3);
    assert.equal(c.platformLabels[0].he, 'יד2');
    assert.equal(c.viewingCount, 5);
    assert.equal(c.applicationCount, 2);
  });

  test('23. marketingStatus filters unknown platforms', () => {
    const t = makeTracker();
    seedPortfolio(t);
    const c = t.marketingStatus('P-TLV-01', {
      listed: true,
      platforms: ['yad2', 'mars_listings', 'madlan'],
    });
    assert.deepEqual([...c.platforms], ['yad2', 'madlan']);
  });

  test('24. marketingStatus appends to campaignHistory', () => {
    const t = makeTracker();
    seedPortfolio(t);
    t.marketingStatus('P-TLV-01', { listed: true, platforms: ['yad2'], viewings: 1 });
    t.marketingStatus('P-TLV-01', { listed: true, platforms: ['yad2', 'madlan'], viewings: 3 });
    const snap = t.getProperty('P-TLV-01');
    assert.equal(snap.campaignHistory.length, 1);
    assert.equal(snap.currentCampaign.viewingCount, 3);
  });

  test('25. marketingStatus with array event objects', () => {
    const t = makeTracker();
    seedPortfolio(t);
    const c = t.marketingStatus('P-TLV-01', {
      listed: true,
      platforms: ['yad2'],
      viewings: [
        { date: '2026-04-05T10:00:00Z', contact: 'דוד', notes: 'עניין רב' },
        { date: '2026-04-06T11:00:00Z', contact: 'שרה' },
      ],
      applications: [
        { contact: 'דוד', approved: true, leased: false },
        { contact: 'שרה', approved: false, leased: false },
      ],
    });
    assert.equal(c.viewingCount, 2);
    assert.equal(c.applicationCount, 2);
    assert.equal(c.applications[0].approved, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// applicationFunnel conversion
// ═══════════════════════════════════════════════════════════════════════════

describe('VacancyTracker — applicationFunnel', () => {
  test('26. funnel computes conversion rates', () => {
    const t = makeTracker();
    seedPortfolio(t);
    t.marketingStatus('P-TLV-01', {
      listed: true,
      platforms: ['yad2'],
      viewings: [
        { contact: 'A' },
        { contact: 'B' },
        { contact: 'C' },
        { contact: 'D' },
        { contact: 'E' },
      ],
      applications: [
        { contact: 'A', approved: true, leased: true },
        { contact: 'B', approved: true, leased: false },
        { contact: 'C', approved: false, leased: false },
      ],
    });
    const f = t.applicationFunnel();
    assert.equal(f.listings, 1);
    assert.equal(f.viewings, 5);
    assert.equal(f.applications, 3);
    assert.equal(f.approved, 2);
    assert.equal(f.leased, 1);

    // Rates
    assert.equal(f.rates.listingToViewing, 5); // 5/1
    assert.equal(f.rates.viewingToApplication, 0.6); // 3/5
    assert.equal(f.rates.applicationToApproval, 0.6667); // 2/3
    assert.equal(f.rates.approvalToLease, 0.5); // 1/2
    assert.equal(f.rates.overallConversion, 1); // 1/1 listing → 1 lease

    // Pct variants present
    assert.equal(f.ratesPct.viewingToApplication, 60);
    assert.equal(f.ratesPct.applicationToApproval, 66.67);
  });

  test('27. funnel — empty portfolio returns zeros', () => {
    const t = makeTracker();
    const f = t.applicationFunnel();
    assert.equal(f.listings, 0);
    assert.equal(f.rates.overallConversion, 0);
  });

  test('28. funnel falls back to occupancy events when no approval flags set', () => {
    const t = makeTracker();
    seedPortfolio(t);
    t.marketingStatus('P-TLV-01', {
      listed: true,
      platforms: ['yad2'],
      viewings: 3,
      applications: 1,
    });
    // Application had no `leased:true` flag, but we recorded an occupancy
    t.markVacant('P-TLV-01', { vacatedDate: '2026-03-01T00:00:00Z', reason: 'lease_ended' });
    t.markOccupied('P-TLV-01', { leaseId: 'L-NEW', moveInDate: '2026-03-20T00:00:00Z' });

    const f = t.applicationFunnel();
    assert.ok(f.leased >= 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// timeToLease
// ═══════════════════════════════════════════════════════════════════════════

describe('VacancyTracker — timeToLease', () => {
  test('29. timeToLease averages closed vacancy periods', () => {
    const t = makeTracker();
    seedPortfolio(t);
    // Period 1 — 10 days
    t.markVacant('P-TLV-01', { vacatedDate: '2026-01-01T00:00:00Z', reason: 'lease_ended' });
    t.markOccupied('P-TLV-01', { leaseId: 'L1', moveInDate: '2026-01-11T00:00:00Z' });
    // Period 2 — 30 days
    t.markVacant('P-HAIFA-01', { vacatedDate: '2026-01-01T00:00:00Z', reason: 'lease_ended' });
    t.markOccupied('P-HAIFA-01', { leaseId: 'L2', moveInDate: '2026-01-31T00:00:00Z' });
    // Period 3 — 50 days
    t.markVacant('P-BS-01', { vacatedDate: '2026-01-01T00:00:00Z', reason: 'lease_ended' });
    t.markOccupied('P-BS-01', { leaseId: 'L3', moveInDate: '2026-02-20T00:00:00Z' });

    const tl = t.timeToLease();
    assert.equal(tl.samples, 3);
    assert.equal(tl.avgDays, 30); // (10+30+50)/3
    assert.equal(tl.medianDays, 30);
    assert.equal(tl.totalDays, 90);
  });

  test('30. timeToLease — no closed periods returns zeros', () => {
    const t = makeTracker();
    seedPortfolio(t);
    t.markVacant('P-TLV-01', { vacatedDate: '2026-03-01T00:00:00Z', reason: 'lease_ended' });
    const tl = t.timeToLease();
    assert.equal(tl.samples, 0);
    assert.equal(tl.avgDays, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// seasonalPatterns
// ═══════════════════════════════════════════════════════════════════════════

describe('VacancyTracker — seasonalPatterns', () => {
  test('31. seasonalPatterns buckets by month (1-12)', () => {
    const t = makeTracker();
    seedPortfolio(t);
    t.markVacant('P-TLV-01', { vacatedDate: '2026-07-15T00:00:00Z', reason: 'lease_ended' });
    t.markOccupied('P-TLV-01', { leaseId: 'L1', moveInDate: '2026-08-10T00:00:00Z' });
    t.markVacant('P-HAIFA-01', { vacatedDate: '2026-07-20T00:00:00Z', reason: 'lease_ended' });
    t.markOccupied('P-HAIFA-01', { leaseId: 'L2', moveInDate: '2026-08-05T00:00:00Z' });
    t.markVacant('P-BS-01', { vacatedDate: '2026-01-10T00:00:00Z', reason: 'lease_ended' });
    t.markOccupied('P-BS-01', { leaseId: 'L3', moveInDate: '2026-01-20T00:00:00Z' });

    const s = t.seasonalPatterns();
    assert.equal(s.monthly.length, 12);
    assert.equal(s.monthly[6].month, 7); // July
    assert.equal(s.monthly[6].he, 'יולי');
    assert.equal(s.monthly[6].vacancyStarts, 2);
    assert.equal(s.monthly[0].vacancyStarts, 1); // January
    assert.equal(s.peakStartsMonth, 7);
    assert.equal(s.peakStartsLabel.he, 'יולי');
    assert.equal(s.peakStartsLabel.en, 'July');
  });

  test('32. seasonal months carry bilingual labels', () => {
    const t = makeTracker();
    const s = t.seasonalPatterns();
    assert.equal(s.monthly[0].he, 'ינואר');
    assert.equal(s.monthly[11].en, 'December');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// alertLongVacancy
// ═══════════════════════════════════════════════════════════════════════════

describe('VacancyTracker — alertLongVacancy', () => {
  test('33. alertLongVacancy flags units past threshold, sorted worst-first', () => {
    const t = makeTracker('2026-04-11T00:00:00Z', { alertDays: 30 });
    seedPortfolio(t);

    // 60 days — triggers (2x threshold → critical? no, critical is >2x = >60)
    t.markVacant('P-TLV-01', { vacatedDate: '2026-02-10T00:00:00Z', reason: 'lease_ended' });
    // 20 days — below threshold
    t.markVacant('P-HAIFA-01', { vacatedDate: '2026-03-22T00:00:00Z', reason: 'lease_ended' });
    // 100 days — critical (>2×30)
    t.markVacant('P-BS-01', { vacatedDate: '2026-01-01T00:00:00Z', reason: 'lease_ended' });

    // Give the TLV unit a marketing campaign so we can check flags
    t.marketingStatus('P-TLV-01', {
      listed: true,
      platforms: ['yad2'],
      viewings: 2,
      applications: 1,
    });

    const alerts = t.alertLongVacancy();
    // HAIFA (20d) excluded; TLV (60d) + BS (100d) included
    assert.equal(alerts.length, 2);
    // Sorted worst-first
    assert.equal(alerts[0].propertyId, 'P-BS-01');
    assert.equal(alerts[0].daysVacant, 100);
    assert.equal(alerts[0].severity, 'critical');
    assert.equal(alerts[1].propertyId, 'P-TLV-01');
    assert.equal(alerts[1].daysVacant, 60);
    assert.equal(alerts[1].listed, true);
    // Lost revenue: 60 × (8000/30) = 16000
    assert.equal(alerts[1].lostRevenue, 16000);
    // Hebrew message includes the days number
    assert.match(alerts[1].message_he, /60 ימים/);
  });

  test('34. alertLongVacancy returns [] when nothing is past threshold', () => {
    const t = makeTracker('2026-04-11T00:00:00Z', { alertDays: 60 });
    seedPortfolio(t);
    t.markVacant('P-TLV-01', { vacatedDate: '2026-04-01T00:00:00Z', reason: 'lease_ended' });
    const alerts = t.alertLongVacancy();
    assert.equal(alerts.length, 0);
  });

  test('35. alertLongVacancy uses passed threshold override', () => {
    const t = makeTracker('2026-04-11T00:00:00Z', { alertDays: 100 });
    seedPortfolio(t);
    t.markVacant('P-TLV-01', { vacatedDate: '2026-03-01T00:00:00Z', reason: 'lease_ended' });
    const defaultAlerts = t.alertLongVacancy(); // threshold 100, days=41 → []
    assert.equal(defaultAlerts.length, 0);
    const loweredAlerts = t.alertLongVacancy(30); // override to 30 → matches
    assert.equal(loweredAlerts.length, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Platform stubs
// ═══════════════════════════════════════════════════════════════════════════

describe('VacancyTracker — platform stubs', () => {
  test('36. yad2Stub.publish returns a documented stub response', async () => {
    const res = await VacancyTracker.yad2Stub.publish({
      propertyId: 'P-TLV-01',
      rent: 8000,
    });
    assert.equal(res.status, 'stub');
    assert.equal(res.platform, 'yad2');
    assert.ok(res.apiDocUrl);
    assert.match(res.message_he, /יד2/);
  });

  test('37. madlanStub + homelessStub are callable', async () => {
    const m = await VacancyTracker.madlanStub.publish({});
    const h = await VacancyTracker.homelessStub.publish({});
    assert.equal(m.platform, 'madlan');
    assert.equal(h.platform, 'homeless');
  });

  test('38. stubs expose metrics + unpublish', async () => {
    const mx = await VacancyTracker.yad2Stub.metrics('L-123');
    assert.equal(mx.status, 'stub');
    assert.equal(mx.views, 0);
    const un = await VacancyTracker.yad2Stub.unpublish('L-123');
    assert.equal(un.listingId, 'L-123');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generateReport
// ═══════════════════════════════════════════════════════════════════════════

describe('VacancyTracker — generateReport', () => {
  test('39. generateReport(propertyId) returns bilingual payload', () => {
    const t = makeTracker('2026-04-11T00:00:00Z');
    seedPortfolio(t);
    t.markVacant('P-TLV-01', { vacatedDate: '2026-03-01T00:00:00Z', reason: 'lease_ended' });
    const r = t.generateReport('P-TLV-01');
    assert.match(r.title_he, /דו"ח תפוסה/);
    assert.match(r.title_en, /Occupancy Report/);
    assert.equal(r.status_he, 'פנוי');
    assert.equal(r.status_en, 'Vacant');
    assert.ok(r.daysVacant > 0);
    assert.ok(r.lostRevenue.lostRevenue > 0);
  });

  test('40. generateReport() without id returns portfolio roll-up', () => {
    const t = makeTracker();
    seedPortfolio(t);
    const r = t.generateReport();
    assert.match(r.title_he, /פורטפוליו/);
    assert.ok(r.vacancyRate);
    assert.ok(r.funnel);
    assert.ok(r.timeToLease);
    assert.ok(r.seasonal);
    assert.ok(Array.isArray(r.longVacancyAlerts));
  });

  test('41. generateReport unknown id returns null', () => {
    const t = makeTracker();
    assert.equal(t.generateReport('GHOST'), null);
  });
});
