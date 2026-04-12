/**
 * Israeli Seed Data Generator
 * ═══════════════════════════════════════════════════════════════════════
 * Agent X-85 — Techno-Kol Uzi mega-ERP — written 2026-04-11
 *
 * Rule: "לא מוחקים רק משדרגים ומגדלים" — never delete, only upgrade/grow.
 *
 * Purpose
 * ───────
 * Generate realistic Israeli-flavoured seed data for development, demo
 * environments, QA fixtures, integration tests, and load tests. All
 * output is plausible (not identifying any real person / company) but
 * passes the same validators the production code uses:
 *
 *   - Teudat Zehut   → Luhn-like 9-digit with valid check digit
 *   - Company ID     → 513xxxxxx (LLC), checksum-correct
 *   - Hebrew strings → real city names, real street patterns, real
 *                       metal-fabrication SKUs, real payroll math
 *
 * Deterministic
 * ─────────────
 * Every generator accepts a `seed` (number) in the constructor or the
 * per-call options. Given the same seed, the generator produces byte-
 * identical output on every run. This is CRITICAL for:
 *   - Reproducible test fixtures
 *   - Deterministic demos ("the October invoice list is always the same")
 *   - Diffing seed output across refactors
 *
 * The PRNG is a simple Mulberry32 — zero deps, 32-bit state, passes
 * BigCrush for the uses we care about (uniform draws from short pools).
 *
 * Zero dependencies
 * ─────────────────
 * Pure Node — no faker, no lodash, no moment, no i18n libraries. Built-in
 * Intl is only used to format numbers for display, never for core logic.
 *
 * Tolerance for absent validator
 * ──────────────────────────────
 * If `src/validators/teudat-zehut.js` is present, we'll use its
 * `generateValidTeudatZehut` for extra confidence. If it's absent
 * (e.g. this file is copied to a slimmer project), we fall back to
 * an embedded implementation of the same algorithm.
 *
 * Usage
 * ─────
 *   const { IsraeliSeedGenerator } = require('./src/seed/israeli-seed.js');
 *
 *   const gen = new IsraeliSeedGenerator({ seed: 42 });
 *   const suppliers = gen.generateSupplier(50);
 *   const customers = gen.generateCustomer(200);
 *   const employees = gen.generateEmployee(25);
 *   const items     = gen.generateItem(100);
 *   const invoices  = gen.generateInvoice(500, { suppliers, items });
 *   const payroll   = gen.generatePayroll(employees, '2026-03');
 *
 *   // Or all at once:
 *   const all = gen.generateAll({
 *     suppliers: 50, customers: 200, employees: 25,
 *     items: 100, invoices: 500, months: ['2026-01','2026-02','2026-03'],
 *   });
 *
 * Output shape
 * ────────────
 * Every generator returns an array of plain objects ready for:
 *   - `INSERT INTO ... VALUES`
 *   - JSON.stringify → fixture file
 *   - direct injection into an ORM
 *
 * Field names are snake_case to match the rest of onyx-procurement.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// Optional validator — tolerate absence
// ═══════════════════════════════════════════════════════════════════════

let externalGenerateValidTZ = null;
let externalValidateTZ = null;
try {
  // eslint-disable-next-line global-require
  const tz = require('../validators/teudat-zehut.js');
  if (tz && typeof tz.generateValidTeudatZehut === 'function') {
    externalGenerateValidTZ = tz.generateValidTeudatZehut;
  }
  if (tz && typeof tz.validateTeudatZehut === 'function') {
    externalValidateTZ = tz.validateTeudatZehut;
  }
} catch (_) {
  // validator not present — fall back to embedded implementation
}

// ═══════════════════════════════════════════════════════════════════════
// Deterministic RNG — Mulberry32 (tiny, fast, good-enough uniformity)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a Mulberry32 PRNG from an integer seed.
 * Returns a function that produces uniform floats in [0, 1).
 *
 * This is NOT cryptographically secure — it's a test-data generator.
 */
function mulberry32(seed) {
  let a = (seed | 0) || 0xC0FFEE;
  return function rng() {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Source pools — Hebrew first names, surnames, cities, streets, SKUs
// All strings are real, non-identifying, and commonly used in Israel.
// Pools are intentionally biased toward working-class / industrial /
// metalworking demographics to match the Techno-Kol Uzi domain.
// ═══════════════════════════════════════════════════════════════════════

const FIRST_NAMES_MALE = Object.freeze([
  'אורי', 'אברהם', 'אלי', 'אליהו', 'אריה', 'אריק', 'אורן', 'איתן', 'אסף', 'אמיר',
  'בני', 'ברוך', 'בועז', 'גיל', 'גדי', 'גיא', 'גבי', 'דוד', 'דני', 'דרור',
  'הילל', 'חיים', 'חגי', 'טל', 'יוסי', 'יובל', 'ישראל', 'יונתן', 'יעקב', 'יצחק',
  'יורם', 'יריב', 'לירן', 'משה', 'מנחם', 'מאיר', 'מיכאל', 'מרדכי', 'נפתלי', 'ניר',
  'נתן', 'עמית', 'עמוס', 'עוזי', 'עידן', 'עופר', 'פנחס', 'צחי', 'רוני', 'רמי',
  'רענן', 'שלמה', 'שמעון', 'שמואל', 'שי', 'שלום', 'תומר', 'רפי', 'בן', 'איל',
]);

const FIRST_NAMES_FEMALE = Object.freeze([
  'אביבה', 'אורית', 'אורנה', 'איריס', 'אסתר', 'בתיה', 'בלהה', 'גילה', 'גלית', 'דליה',
  'דפנה', 'הדס', 'הלה', 'חנה', 'חווה', 'טלי', 'יעל', 'יפה', 'יהודית', 'כרמלה',
  'לאה', 'ליאת', 'לימור', 'מירב', 'מיכל', 'מרים', 'מאיה', 'נורית', 'נועה', 'נילי',
  'סיגל', 'סיון', 'עדי', 'עדנה', 'עירית', 'פנינה', 'ציפורה', 'צילה', 'קרן', 'רבקה',
  'רחל', 'רונית', 'רינה', 'רותי', 'שרה', 'שולה', 'שושנה', 'שרית', 'תמר', 'תקווה',
]);

const SURNAMES = Object.freeze([
  'כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אברהם', 'פרידמן', 'אוחיון', 'חדד',
  'אזולאי', 'יוסף', 'דוד', 'שטרית', 'גבאי', 'אוחנה', 'אדרי', 'טולדנו', 'אלבז', 'בן-דוד',
  'שמעון', 'מלכה', 'חזן', 'אליהו', 'עמר', 'אטיאס', 'בן-שושן', 'סעדון', 'ארביב', 'סבג',
  'זוהר', 'שרעבי', 'אברגיל', 'ברוך', 'יעקב', 'חיים', 'מועלם', 'גולן', 'שלום', 'לביא',
  'ברק', 'הלוי', 'סגל', 'רוזנברג', 'רוטנברג', 'גולדשטיין', 'וייס', 'שפירא', 'רובין', 'פרידלנד',
  'ארד', 'אהרון', 'שלומי', 'שלם', 'מטלון', 'סויסה', 'טובול', 'נחום', 'אלקיים', 'דיין',
]);

const CITIES = Object.freeze([
  { he: 'תל אביב-יפו', zip: '6100000', area: 'merkaz' },
  { he: 'ירושלים', zip: '9100000', area: 'yerushalayim' },
  { he: 'חיפה', zip: '3100000', area: 'haifa' },
  { he: 'ראשון לציון', zip: '7500000', area: 'merkaz' },
  { he: 'פתח תקווה', zip: '4910000', area: 'merkaz' },
  { he: 'אשדוד', zip: '7700000', area: 'darom' },
  { he: 'נתניה', zip: '4200000', area: 'sharon' },
  { he: 'באר שבע', zip: '8400000', area: 'darom' },
  { he: 'חולון', zip: '5810000', area: 'merkaz' },
  { he: 'בני ברק', zip: '5110000', area: 'merkaz' },
  { he: 'רמת גן', zip: '5210000', area: 'merkaz' },
  { he: 'אשקלון', zip: '7810000', area: 'darom' },
  { he: 'רחובות', zip: '7610000', area: 'merkaz' },
  { he: 'בת ים', zip: '5910000', area: 'merkaz' },
  { he: 'הרצליה', zip: '4610000', area: 'sharon' },
  { he: 'כפר סבא', zip: '4440000', area: 'sharon' },
  { he: 'חדרה', zip: '3810000', area: 'haifa' },
  { he: 'מודיעין', zip: '7170000', area: 'merkaz' },
  { he: 'רמלה', zip: '7210000', area: 'merkaz' },
  { he: 'לוד', zip: '7110000', area: 'merkaz' },
  { he: 'נצרת', zip: '1610000', area: 'tsafon' },
  { he: 'עפולה', zip: '1810000', area: 'tsafon' },
  { he: 'טבריה', zip: '1410000', area: 'tsafon' },
  { he: 'אילת', zip: '8810000', area: 'darom' },
  { he: 'דימונה', zip: '8610000', area: 'darom' },
  { he: 'נהריה', zip: '2210000', area: 'tsafon' },
  { he: 'כרמיאל', zip: '2160000', area: 'tsafon' },
  { he: 'קריית גת', zip: '8210000', area: 'darom' },
  { he: 'קריית מוצקין', zip: '2610000', area: 'haifa' },
  { he: 'קריית ים', zip: '2910000', area: 'haifa' },
  { he: 'קריית אתא', zip: '2810000', area: 'haifa' },
  { he: 'ראש העין', zip: '4810000', area: 'sharon' },
  { he: 'יהוד-מונוסון', zip: '5610000', area: 'merkaz' },
  { he: 'אור יהודה', zip: '6010000', area: 'merkaz' },
  { he: 'גבעתיים', zip: '5310000', area: 'merkaz' },
  { he: 'רעננה', zip: '4310000', area: 'sharon' },
  { he: 'הוד השרון', zip: '4510000', area: 'sharon' },
]);

// Real street patterns used across Israel. Street NAMES are common
// (Herzl, Weizmann, Rothschild, Ben Gurion, HaHaroshet, HaMelacha, etc.)
// so every generated address is plausible.
const STREETS = Object.freeze([
  'הרצל', 'ז\'בוטינסקי', 'ביאליק', 'רוטשילד', 'ויצמן', 'בן גוריון', 'בן צבי',
  'אלנבי', 'דיזנגוף', 'אבן גבירול', 'ארלוזורוב', 'הנביאים', 'יפו', 'המלך ג\'ורג\'',
  'החרושת', 'המלאכה', 'התעשייה', 'היוצרים', 'המסגר', 'הברזל', 'האומנים',
  'האורגים', 'הנפחים', 'האשלג', 'העמל', 'ההגנה', 'הפלמ"ח', 'הגולן', 'הכרמל',
  'הנגב', 'הגליל', 'יצחק שדה', 'לוי אשכול', 'מנחם בגין', 'סוקולוב', 'הרב קוק',
  'הדקל', 'האלון', 'התמר', 'התאנה', 'הגפן', 'הדר', 'השקד', 'הזית', 'הברוש',
  'שדרות ירושלים', 'שדרות יהודית', 'שדרות העצמאות', 'דרך השלום', 'דרך ההגנה',
]);

// Industrial-zone street patterns (for suppliers)
const INDUSTRIAL_STREETS = Object.freeze([
  'החרושת', 'המלאכה', 'התעשייה', 'היוצרים', 'המסגר', 'הברזל', 'הפלדה',
  'הנפחים', 'האורגים', 'האומנים', 'הצמיגים', 'הבונים', 'המדע', 'האשלג',
]);

// ═══════════════════════════════════════════════════════════════════════
// Company name pools — metalworking, industrial supplies, and services
// Patterns: "X עבודות מתכת", "X בע\"מ", "יבוא X Y", "X אחים", etc.
// ═══════════════════════════════════════════════════════════════════════

const COMPANY_PREFIX = Object.freeze([
  'ברזל', 'פלדה', 'מתכות', 'אלומיניום', 'נירוסטה', 'צבעים', 'ריתוך',
  'חיתוך', 'חרושת', 'כלי עבודה', 'מסגרות', 'בנייה', 'תעשיות',
  'כימיקלים', 'שמנים', 'בורגי', 'ציוד', 'אבטחת', 'הגנת',
]);

const COMPANY_MIDDLE = Object.freeze([
  'הארץ', 'הצפון', 'הדרום', 'המרכז', 'השרון', 'הגולן', 'הכרמל',
  'הנגב', 'הגליל', 'הנמל', 'העמק', 'השפלה', 'המישור', 'המפרץ',
]);

const COMPANY_SURNAMES = Object.freeze([
  'רוטנברג', 'ברזילאי', 'פרידמן', 'שפירא', 'גולדשטיין', 'הלוי', 'סגל',
  'כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'חדד', 'אזולאי', 'גבאי',
  'שלומי', 'שמעוני', 'אוזן', 'יוסף',
]);

const COMPANY_SUFFIX_BIZ = Object.freeze([
  'עבודות מתכת',
  'עבודות ברזל',
  'מסגרות',
  'יצור וריתוך',
  'חיתוך לייזר',
  'ציוד ובינוי',
  'תעשיות',
  'יבוא ושיווק',
  'סחר ותעשיה',
  'קבלני משנה',
  'הנדסה ובינוי',
  'כלי עבודה',
  'ציוד מקצועי',
  'חומרי בניין',
  'צבעים וציפויים',
  'חומרי גלם',
]);

const COMPANY_SUFFIX_LEGAL = Object.freeze([
  'בע"מ',
  'ושות\'',
  'אחים',
  'בע"מ',
  '', // bare (no legal suffix — small עוסק מורשה)
]);

// ═══════════════════════════════════════════════════════════════════════
// Metal fabrication items — realistic SKU families
// ═══════════════════════════════════════════════════════════════════════

/**
 * Realistic metal fabrication item families. Each entry is one category
 * and carries the Hebrew noun, English name, unit, realistic dimension
 * formats, and price band (in NIS, pre-VAT).
 */
const ITEM_CATEGORIES = Object.freeze([
  {
    code: 'ANG',
    he: 'ברזל זווית',
    en: 'Angle iron',
    unit: 'מטר',
    dims: ['20x20x3', '30x30x3', '40x40x4', '50x50x5', '60x60x6', '75x75x6', '100x100x8'],
    priceMin: 12, priceMax: 85,
  },
  {
    code: 'SQT',
    he: 'צינור רבוע',
    en: 'Square tube',
    unit: 'מטר',
    dims: ['20x20x2', '25x25x2', '30x30x2', '40x40x2', '50x50x3', '60x60x3', '80x80x4', '100x100x4'],
    priceMin: 15, priceMax: 120,
  },
  {
    code: 'RCT',
    he: 'צינור מלבני',
    en: 'Rectangular tube',
    unit: 'מטר',
    dims: ['40x20x2', '50x25x2', '60x30x2', '80x40x3', '100x50x3', '120x60x4'],
    priceMin: 18, priceMax: 140,
  },
  {
    code: 'RND',
    he: 'מוט עגול',
    en: 'Round bar',
    unit: 'מטר',
    dims: ['Ø8', 'Ø10', 'Ø12', 'Ø14', 'Ø16', 'Ø20', 'Ø25', 'Ø32', 'Ø40'],
    priceMin: 8, priceMax: 160,
  },
  {
    code: 'PIP',
    he: 'צינור עגול',
    en: 'Round pipe',
    unit: 'מטר',
    dims: ['Ø21x2', 'Ø27x2', 'Ø33x3', 'Ø42x3', 'Ø48x3', 'Ø60x3', 'Ø76x4'],
    priceMin: 14, priceMax: 130,
  },
  {
    code: 'FLB',
    he: 'פרופיל שטוח',
    en: 'Flat bar',
    unit: 'מטר',
    dims: ['20x3', '25x4', '30x5', '40x5', '50x6', '60x8', '80x10', '100x12'],
    priceMin: 10, priceMax: 95,
  },
  {
    code: 'SHT',
    he: 'פח גלוון',
    en: 'Galvanized sheet',
    unit: 'יריעה',
    dims: ['1.0mm 1x2', '1.2mm 1x2', '1.5mm 1.25x2.5', '2.0mm 1.25x2.5', '3.0mm 1.25x2.5'],
    priceMin: 85, priceMax: 680,
  },
  {
    code: 'PLT',
    he: 'פח פלדה',
    en: 'Steel plate',
    unit: 'יריעה',
    dims: ['3mm 1x2', '4mm 1x2', '5mm 1.25x2.5', '6mm 1.25x2.5', '8mm 1.5x3', '10mm 1.5x3'],
    priceMin: 140, priceMax: 1250,
  },
  {
    code: 'EXP',
    he: 'רשת מוגבהת',
    en: 'Expanded metal',
    unit: 'יריעה',
    dims: ['1x2 standard', '1.25x2.5 standard', '1x2 heavy'],
    priceMin: 120, priceMax: 520,
  },
  {
    code: 'IPE',
    he: 'פרופיל IPE',
    en: 'IPE beam',
    unit: 'מטר',
    dims: ['IPE 80', 'IPE 100', 'IPE 120', 'IPE 140', 'IPE 160', 'IPE 180', 'IPE 200'],
    priceMin: 45, priceMax: 310,
  },
  {
    code: 'HEA',
    he: 'פרופיל HEA',
    en: 'HEA beam',
    unit: 'מטר',
    dims: ['HEA 100', 'HEA 120', 'HEA 140', 'HEA 160', 'HEA 180', 'HEA 200'],
    priceMin: 95, priceMax: 480,
  },
  {
    code: 'UNP',
    he: 'פרופיל UNP',
    en: 'UNP channel',
    unit: 'מטר',
    dims: ['UNP 50', 'UNP 65', 'UNP 80', 'UNP 100', 'UNP 120', 'UNP 140'],
    priceMin: 32, priceMax: 240,
  },
  {
    code: 'WLD',
    he: 'חוט ריתוך',
    en: 'Welding wire',
    unit: 'גליל',
    dims: ['Ø0.8 5kg', 'Ø1.0 5kg', 'Ø1.2 15kg', 'Ø1.6 15kg'],
    priceMin: 65, priceMax: 380,
  },
  {
    code: 'ELC',
    he: 'אלקטרודות ריתוך',
    en: 'Welding electrodes',
    unit: 'חבילה',
    dims: ['Ø2.5 2.5kg', 'Ø3.2 5kg', 'Ø4.0 5kg'],
    priceMin: 45, priceMax: 210,
  },
  {
    code: 'NUT',
    he: 'אומים מגולוון',
    en: 'Galvanized nuts',
    unit: 'חבילה',
    dims: ['M6 x100', 'M8 x100', 'M10 x100', 'M12 x50', 'M16 x25'],
    priceMin: 18, priceMax: 120,
  },
  {
    code: 'BLT',
    he: 'ברגים מגולוון',
    en: 'Galvanized bolts',
    unit: 'חבילה',
    dims: ['M6x20 x100', 'M8x30 x100', 'M10x40 x50', 'M12x50 x50', 'M16x60 x25'],
    priceMin: 28, priceMax: 280,
  },
  {
    code: 'PNT',
    he: 'צבע יסוד אפוקסי',
    en: 'Epoxy primer',
    unit: 'פח',
    dims: ['1 ליטר', '4 ליטר', '18 ליטר'],
    priceMin: 85, priceMax: 620,
  },
  {
    code: 'THN',
    he: 'מדלל לצבע',
    en: 'Paint thinner',
    unit: 'פח',
    dims: ['1 ליטר', '4 ליטר', '18 ליטר'],
    priceMin: 32, priceMax: 340,
  },
]);

// ═══════════════════════════════════════════════════════════════════════
// Roles for employees (production + office)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Role catalog — drives wages. `base` is a monthly gross anchor in NIS
 * (pre-deductions); actual wage is jittered ±15% around this value.
 */
const ROLES = Object.freeze([
  { code: 'prod_worker',  he: 'עובד ייצור',        en: 'Production worker',      base: 8900 },
  { code: 'welder',       he: 'רתך מוסמך',         en: 'Certified welder',       base: 11500 },
  { code: 'cnc_op',       he: 'מפעיל CNC',         en: 'CNC operator',           base: 12200 },
  { code: 'laser_op',     he: 'מפעיל לייזר',       en: 'Laser cutter operator',  base: 13000 },
  { code: 'crew_lead',    he: 'ראש צוות',          en: 'Crew lead',              base: 14500 },
  { code: 'shift_mgr',    he: 'מנהל משמרת',        en: 'Shift manager',          base: 16800 },
  { code: 'prod_mgr',     he: 'מנהל ייצור',        en: 'Production manager',     base: 22500 },
  { code: 'quality',      he: 'בקר איכות',         en: 'Quality inspector',      base: 11800 },
  { code: 'forklift',     he: 'מפעיל מלגזה',       en: 'Forklift operator',      base: 10200 },
  { code: 'warehouse',    he: 'מחסנאי',            en: 'Warehouse clerk',        base: 9400 },
  { code: 'driver',       he: 'נהג משאית',         en: 'Truck driver',           base: 11000 },
  { code: 'maintenance',  he: 'טכנאי תחזוקה',      en: 'Maintenance technician', base: 12600 },
  { code: 'secretary',    he: 'מזכירה',            en: 'Secretary',              base: 9800 },
  { code: 'bookkeeper',   he: 'הנהלת חשבונות',     en: 'Bookkeeper',             base: 12500 },
  { code: 'accountant',   he: 'רואת חשבון',        en: 'Accountant',             base: 18000 },
  { code: 'buyer',        he: 'רכזת רכש',          en: 'Purchasing officer',     base: 13200 },
  { code: 'sales',        he: 'איש מכירות',        en: 'Sales rep',              base: 11500 },
  { code: 'hr',           he: 'מנהלת משאבי אנוש',  en: 'HR manager',             base: 16500 },
]);

// ═══════════════════════════════════════════════════════════════════════
// Helpers — seeded random primitives
// ═══════════════════════════════════════════════════════════════════════

function pickFrom(rng, array) {
  return array[Math.floor(rng() * array.length)];
}

function intBetween(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function floatBetween(rng, min, max, decimals = 2) {
  const v = rng() * (max - min) + min;
  const m = Math.pow(10, decimals);
  return Math.round(v * m) / m;
}

function weightedChoice(rng, items, weightFn) {
  let total = 0;
  for (const it of items) total += weightFn(it);
  let r = rng() * total;
  for (const it of items) {
    r -= weightFn(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function padStart(value, length, char = '0') {
  const s = String(value);
  if (s.length >= length) return s;
  return char.repeat(length - s.length) + s;
}

function zeroPad(n, width) {
  return padStart(n, width, '0');
}

// ═══════════════════════════════════════════════════════════════════════
// Embedded TZ / Company-ID generators (used when validator is absent)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Embedded fallback — produces a valid Israeli 9-digit ID with correct
 * Luhn-like check digit. This is character-identical to the algorithm
 * in `src/validators/teudat-zehut.js`.
 */
function embeddedGenerateValidTZ(rng) {
  for (let attempt = 0; attempt < 50; attempt++) {
    let prefix = '';
    for (let i = 0; i < 8; i++) prefix += Math.floor(rng() * 10).toString();
    let partial = 0;
    for (let i = 0; i < 8; i++) {
      const digit = prefix.charCodeAt(i) - 48;
      const multiplier = (i % 2 === 0) ? 1 : 2;
      let product = digit * multiplier;
      if (product > 9) product -= 9;
      partial += product;
    }
    const checkDigit = (10 - (partial % 10)) % 10;
    const candidate = prefix + checkDigit.toString();
    // Avoid hard-reserved band 000000000..000000017
    if (/^0{7}/.test(candidate)) {
      const tail = parseInt(candidate.slice(7), 10);
      if (tail >= 0 && tail <= 17) continue;
    }
    if (candidate === '999999999') continue;
    return candidate;
  }
  return '000000018';
}

/**
 * Generate a valid Israeli COMPANY ID with a forced leading prefix
 * (default '513' — private LLC, the most common form for small metal
 * fabrication companies). The prefix is 3 digits; the remaining 5 digits
 * are drawn from rng and the 9th is the computed check digit.
 *
 * Uses the same Luhn-like algorithm as ת.ז.
 */
function generateValidCompanyId(rng, prefix = '513') {
  if (prefix.length !== 3 || !/^\d{3}$/.test(prefix)) {
    prefix = '513';
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    let middle = '';
    for (let i = 0; i < 5; i++) middle += Math.floor(rng() * 10).toString();
    const eight = prefix + middle;
    let partial = 0;
    for (let i = 0; i < 8; i++) {
      const digit = eight.charCodeAt(i) - 48;
      const multiplier = (i % 2 === 0) ? 1 : 2;
      let product = digit * multiplier;
      if (product > 9) product -= 9;
      partial += product;
    }
    const checkDigit = (10 - (partial % 10)) % 10;
    return eight + checkDigit.toString();
  }
  return '513000005';
}

// ═══════════════════════════════════════════════════════════════════════
// Address + phone helpers
// ═══════════════════════════════════════════════════════════════════════

function makeAddress(rng, opts = {}) {
  const streetPool = opts.industrial ? INDUSTRIAL_STREETS : STREETS;
  const street = pickFrom(rng, streetPool);
  const houseNo = intBetween(rng, 1, 180);
  const city = pickFrom(rng, CITIES);
  return {
    street,
    house_number: houseNo,
    street_line: `${street} ${houseNo}`,
    city: city.he,
    zip: city.zip,
    area: city.area,
    country: 'IL',
  };
}

/**
 * Israeli land-line (Bezeq) phone number. Format: 0[2-4|8-9]-NNN-NNNN.
 * Area codes: 02 Jerusalem, 03 Tel Aviv, 04 Haifa/North, 08 Center/South,
 *             09 Sharon.
 */
function makeBezeqPhone(rng, areaCode = null) {
  const areas = ['02', '03', '04', '08', '09'];
  const area = areaCode || pickFrom(rng, areas);
  const mid = zeroPad(intBetween(rng, 200, 999), 3);
  const last = zeroPad(intBetween(rng, 0, 9999), 4);
  return `${area}-${mid}-${last}`;
}

/**
 * Israeli mobile (cell) phone. Format: 05N-NNN-NNNN where N ∈ {0-5, 7-8}.
 */
function makeMobilePhone(rng) {
  const prefixes = ['050', '052', '053', '054', '055', '058'];
  const prefix = pickFrom(rng, prefixes);
  const mid = zeroPad(intBetween(rng, 0, 999), 3);
  const last = zeroPad(intBetween(rng, 0, 9999), 4);
  return `${prefix}-${mid}-${last}`;
}

/**
 * Build a realistic email from a latinised first/last name pair + domain.
 */
function makeEmail(rng, first, last, companyTag = null) {
  const latin = heToLatinSlug(first) + '.' + heToLatinSlug(last);
  const domains = ['gmail.com', 'walla.co.il', 'hotmail.com', 'outlook.com', 'yahoo.com'];
  if (companyTag) {
    return `${latin}@${heToLatinSlug(companyTag)}.co.il`;
  }
  return `${latin}@${pickFrom(rng, domains)}`;
}

/**
 * Minimal Hebrew-to-Latin slugifier for email locals. Not reversible —
 * just stable enough for plausible output. Falls back to 'il' if the
 * string contains no mappable characters.
 */
const HE_TO_LATIN = Object.freeze({
  'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
  'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'k', 'ך': 'k', 'ל': 'l',
  'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p',
  'ף': 'f', 'צ': 'ts', 'ץ': 'ts', 'ק': 'q', 'ר': 'r', 'ש': 'sh', 'ת': 't',
});

function heToLatinSlug(str) {
  if (!str) return 'il';
  let out = '';
  for (const ch of String(str)) {
    if (HE_TO_LATIN[ch]) out += HE_TO_LATIN[ch];
    else if (/[a-z0-9]/i.test(ch)) out += ch.toLowerCase();
    else if (ch === ' ' || ch === '-' || ch === "'") out += '';
  }
  return out || 'il';
}

// ═══════════════════════════════════════════════════════════════════════
// Company name construction
// ═══════════════════════════════════════════════════════════════════════

function buildCompanyName(rng) {
  // Three patterns — pick one at random:
  //  1. "<surname> <suffix_biz> בע\"מ"   e.g. "רוטנברג עבודות מתכת בע\"מ"
  //  2. "<prefix> <middle> בע\"מ"        e.g. "ברזל הארץ בע\"מ"
  //  3. "<suffix_biz> <surname>"        e.g. "יבוא צבעים רוטנברג"
  const pattern = intBetween(rng, 1, 3);
  let name;

  if (pattern === 1) {
    const surname = pickFrom(rng, COMPANY_SURNAMES);
    const biz = pickFrom(rng, COMPANY_SUFFIX_BIZ);
    name = `${surname} ${biz}`;
  } else if (pattern === 2) {
    const prefix = pickFrom(rng, COMPANY_PREFIX);
    const middle = pickFrom(rng, COMPANY_MIDDLE);
    name = `${prefix} ${middle}`;
  } else {
    const biz = pickFrom(rng, COMPANY_SUFFIX_BIZ);
    const surname = pickFrom(rng, COMPANY_SURNAMES);
    name = `${biz} ${surname}`;
  }

  // 80% chance to append a legal suffix
  if (rng() < 0.8) {
    const legal = pickFrom(rng, COMPANY_SUFFIX_LEGAL);
    if (legal) name = `${name} ${legal}`;
  }

  return name;
}

// ═══════════════════════════════════════════════════════════════════════
// Israeli payroll math
// ═══════════════════════════════════════════════════════════════════════

/**
 * Simplified 2026 Israeli income-tax bracket table (individual, NIS/month).
 * Matches `ISRAELI_TAX_CONSTANTS_2026.md` cheat-sheet — annual thresholds
 * divided by 12.
 *
 * These values are ball-park realistic and used ONLY for seed data;
 * production payroll uses `src/payroll/wage-slip-calculator.js` for the
 * authoritative, audited figures.
 */
const TAX_BRACKETS_2026 = Object.freeze([
  { upto:  6790, rate: 0.10 },
  { upto:  9730, rate: 0.14 },
  { upto: 15620, rate: 0.20 },
  { upto: 21710, rate: 0.31 },
  { upto: 45180, rate: 0.35 },
  { upto: 58190, rate: 0.47 },
  { upto: Infinity, rate: 0.50 },
]);

const BL_RATE_REDUCED = 0.035;    // Bituach Leumi, reduced bracket
const BL_RATE_FULL    = 0.07;     // Bituach Leumi, full bracket
const BL_THRESHOLD    = 7522;     // monthly threshold (2026 approx)
const HEALTH_REDUCED  = 0.031;    // mas briut, reduced
const HEALTH_FULL     = 0.05;     // mas briut, full
const PENSION_EMPLOYEE= 0.06;     // 6% employee pension
const PENSION_EMPLOYER= 0.065;    // 6.5% employer pension
const SEVERANCE_EMPLOYER = 0.0833;// 8.33% employer severance (קרן פיצויים)

/**
 * Compute monthly income tax for a given gross, assuming 2.25 personal
 * credit points (value-per-point is ~242 NIS in 2026).
 */
function computeIncomeTax(gross, creditPoints = 2.25) {
  const pointValue = 242;
  let remaining = gross;
  let tax = 0;
  let lastCeiling = 0;
  for (const b of TAX_BRACKETS_2026) {
    const span = b.upto - lastCeiling;
    const taxable = Math.min(remaining, span);
    if (taxable <= 0) break;
    tax += taxable * b.rate;
    remaining -= taxable;
    lastCeiling = b.upto;
    if (remaining <= 0) break;
  }
  const credit = creditPoints * pointValue;
  return Math.max(0, Math.round((tax - credit) * 100) / 100);
}

function computeBituachLeumi(gross) {
  if (gross <= 0) return 0;
  if (gross <= BL_THRESHOLD) {
    return Math.round(gross * BL_RATE_REDUCED * 100) / 100;
  }
  const low = BL_THRESHOLD * BL_RATE_REDUCED;
  const high = (gross - BL_THRESHOLD) * BL_RATE_FULL;
  return Math.round((low + high) * 100) / 100;
}

function computeMasBriut(gross) {
  if (gross <= 0) return 0;
  if (gross <= BL_THRESHOLD) {
    return Math.round(gross * HEALTH_REDUCED * 100) / 100;
  }
  const low = BL_THRESHOLD * HEALTH_REDUCED;
  const high = (gross - BL_THRESHOLD) * HEALTH_FULL;
  return Math.round((low + high) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════
// Class — IsraeliSeedGenerator
// ═══════════════════════════════════════════════════════════════════════

/**
 * Main generator. Seedable, deterministic, zero-dep.
 *
 *   new IsraeliSeedGenerator({ seed: 42 })
 *
 * Every generateXxx() method draws from the internal RNG, so the order
 * of calls matters for determinism. If you need independent streams,
 * pass a per-call seed: generateSupplier(count, { seed: 99 }).
 */
class IsraeliSeedGenerator {
  constructor(opts = {}) {
    this.seed = Number.isFinite(opts.seed) ? opts.seed : 42;
    this.rng = mulberry32(this.seed);
    this._counters = {
      supplier: 0,
      customer: 0,
      employee: 0,
      item: 0,
      invoice: 0,
      payslip: 0,
    };
  }

  /**
   * Reset the RNG to its original seed. Useful in tests to rewind state.
   */
  reset() {
    this.rng = mulberry32(this.seed);
    this._counters = {
      supplier: 0,
      customer: 0,
      employee: 0,
      item: 0,
      invoice: 0,
      payslip: 0,
    };
  }

  /**
   * Fork a sub-generator with a derived seed. The fork has its own
   * independent RNG stream so that generating, say, invoices doesn't
   * consume randomness reserved for customers.
   */
  fork(subSeedTag) {
    const tag = String(subSeedTag || '');
    let hash = this.seed | 0;
    for (let i = 0; i < tag.length; i++) {
      hash = Math.imul(hash ^ tag.charCodeAt(i), 0x01000193) | 0;
    }
    return new IsraeliSeedGenerator({ seed: hash });
  }

  _tz() {
    // Prefer external validator if present — ensures we stay in sync
    // with any future updates to the algorithm.
    if (externalGenerateValidTZ) {
      return externalGenerateValidTZ({ rng: this.rng });
    }
    return embeddedGenerateValidTZ(this.rng);
  }

  _companyId(prefix = '513') {
    return generateValidCompanyId(this.rng, prefix);
  }

  // ─────────────────────────────────────────────────────────────────
  // generateSupplier
  // ─────────────────────────────────────────────────────────────────

  /**
   * Generate `count` realistic Israeli suppliers. Every supplier is a
   * registered legal entity with a valid company ID, industrial address,
   * Bezeq land-line, and a contact person with a mobile number.
   *
   * @param {number} count
   * @param {object} [opts]
   * @param {number} [opts.seed] — override the internal seed for this call
   * @returns {object[]}
   */
  generateSupplier(count, opts = {}) {
    const rng = Number.isFinite(opts.seed) ? mulberry32(opts.seed) : this.rng;
    const out = [];
    for (let i = 0; i < count; i++) {
      this._counters.supplier += 1;
      const idx = this._counters.supplier;
      const name = (() => {
        // Inline so we can honour an overridden rng
        const pattern = Math.floor(rng() * 3) + 1;
        let n;
        if (pattern === 1) {
          n = `${pickFrom(rng, COMPANY_SURNAMES)} ${pickFrom(rng, COMPANY_SUFFIX_BIZ)}`;
        } else if (pattern === 2) {
          n = `${pickFrom(rng, COMPANY_PREFIX)} ${pickFrom(rng, COMPANY_MIDDLE)}`;
        } else {
          n = `${pickFrom(rng, COMPANY_SUFFIX_BIZ)} ${pickFrom(rng, COMPANY_SURNAMES)}`;
        }
        if (rng() < 0.8) {
          const legal = pickFrom(rng, COMPANY_SUFFIX_LEGAL);
          if (legal) n = `${n} ${legal}`;
        }
        return n;
      })();

      const address = (() => {
        const street = pickFrom(rng, INDUSTRIAL_STREETS);
        const houseNo = Math.floor(rng() * 180) + 1;
        const city = pickFrom(rng, CITIES);
        return {
          street,
          house_number: houseNo,
          street_line: `${street} ${houseNo}`,
          city: city.he,
          zip: city.zip,
          area: city.area,
          country: 'IL',
        };
      })();

      const contactFirst = pickFrom(rng, rng() < 0.8 ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE);
      const contactLast = pickFrom(rng, SURNAMES);

      const companyId = generateValidCompanyId(rng, '513');
      const vatId = companyId; // עוסק מורשה = same 9 digits

      // Area codes map to city area — feels more realistic
      const areaCodeMap = { merkaz: '03', sharon: '09', haifa: '04',
                            tsafon: '04', darom: '08', yerushalayim: '02' };
      const areaCode = areaCodeMap[address.area] || '03';

      const supplier = {
        id: `SUP-${zeroPad(idx, 6)}`,
        name,
        legal_name: name,
        company_id: companyId,
        vat_id: vatId,
        entity_type: 'llc',
        address,
        phone: `${areaCode}-${zeroPad(Math.floor(rng() * 800) + 200, 3)}-${zeroPad(Math.floor(rng() * 10000), 4)}`,
        mobile: (() => {
          const p = pickFrom(rng, ['050','052','053','054','055','058']);
          return `${p}-${zeroPad(Math.floor(rng()*1000),3)}-${zeroPad(Math.floor(rng()*10000),4)}`;
        })(),
        email: `info@${heToLatinSlug(name.split(' ')[0])}.co.il`,
        contact_person: {
          first_name: contactFirst,
          last_name: contactLast,
          full_name: `${contactFirst} ${contactLast}`,
          role: pickFrom(rng, ['מנהל רכש', 'מנהל מכירות', 'בעלים', 'מנהל חשבונות']),
          mobile: (() => {
            const p = pickFrom(rng, ['050','052','053','054','055','058']);
            return `${p}-${zeroPad(Math.floor(rng()*1000),3)}-${zeroPad(Math.floor(rng()*10000),4)}`;
          })(),
        },
        payment_terms_days: pickFrom(rng, [30, 45, 60, 90]),
        bank: {
          bank_code: pickFrom(rng, ['10','11','12','14','20','31']),
          branch: zeroPad(Math.floor(rng()*900)+100, 3),
          account_number: zeroPad(Math.floor(rng()*900000)+100000, 6),
        },
        rating: Math.round((rng() * 2 + 3) * 10) / 10, // 3.0 .. 5.0
        is_active: true,
        created_at: '2026-01-01T08:00:00Z',
      };

      out.push(supplier);
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────
  // generateCustomer
  // ─────────────────────────────────────────────────────────────────

  /**
   * Mix of business customers (B2B) and private customers (B2C). Roughly
   * 60% business, 40% private. Private customers carry a valid ת.ז.
   */
  generateCustomer(count, opts = {}) {
    const rng = Number.isFinite(opts.seed) ? mulberry32(opts.seed) : this.rng;
    const out = [];
    for (let i = 0; i < count; i++) {
      this._counters.customer += 1;
      const idx = this._counters.customer;
      const isBusiness = rng() < 0.60;

      if (isBusiness) {
        const name = (() => {
          const pattern = Math.floor(rng() * 3) + 1;
          let n;
          if (pattern === 1) n = `${pickFrom(rng, COMPANY_SURNAMES)} ${pickFrom(rng, COMPANY_SUFFIX_BIZ)}`;
          else if (pattern === 2) n = `${pickFrom(rng, COMPANY_PREFIX)} ${pickFrom(rng, COMPANY_MIDDLE)}`;
          else n = `${pickFrom(rng, COMPANY_SUFFIX_BIZ)} ${pickFrom(rng, COMPANY_SURNAMES)}`;
          if (rng() < 0.75) {
            const legal = pickFrom(rng, COMPANY_SUFFIX_LEGAL);
            if (legal) n = `${n} ${legal}`;
          }
          return n;
        })();
        const street = pickFrom(rng, STREETS);
        const houseNo = Math.floor(rng()*180)+1;
        const city = pickFrom(rng, CITIES);
        out.push({
          id: `CUS-${zeroPad(idx, 6)}`,
          kind: 'business',
          name,
          legal_name: name,
          company_id: generateValidCompanyId(rng, '513'),
          address: {
            street, house_number: houseNo,
            street_line: `${street} ${houseNo}`,
            city: city.he, zip: city.zip, area: city.area, country: 'IL',
          },
          phone: (() => {
            const areaCodeMap = { merkaz:'03', sharon:'09', haifa:'04',
                                  tsafon:'04', darom:'08', yerushalayim:'02' };
            const a = areaCodeMap[city.area] || '03';
            return `${a}-${zeroPad(Math.floor(rng()*800)+200,3)}-${zeroPad(Math.floor(rng()*10000),4)}`;
          })(),
          email: `info@${heToLatinSlug(name.split(' ')[0])}.co.il`,
          payment_terms_days: pickFrom(rng, [30, 45, 60, 90]),
          credit_limit_nis: Math.floor(rng()*180000)+20000,
          is_active: true,
          created_at: '2026-01-01T08:00:00Z',
        });
      } else {
        const isMale = rng() < 0.5;
        const first = pickFrom(rng, isMale ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE);
        const last = pickFrom(rng, SURNAMES);
        const street = pickFrom(rng, STREETS);
        const houseNo = Math.floor(rng()*180)+1;
        const city = pickFrom(rng, CITIES);
        const tz = externalGenerateValidTZ ? externalGenerateValidTZ({ rng }) : embeddedGenerateValidTZ(rng);
        out.push({
          id: `CUS-${zeroPad(idx, 6)}`,
          kind: 'private',
          name: `${first} ${last}`,
          first_name: first,
          last_name: last,
          teudat_zehut: tz,
          address: {
            street, house_number: houseNo,
            street_line: `${street} ${houseNo}`,
            city: city.he, zip: city.zip, area: city.area, country: 'IL',
          },
          mobile: (() => {
            const p = pickFrom(rng, ['050','052','053','054','055','058']);
            return `${p}-${zeroPad(Math.floor(rng()*1000),3)}-${zeroPad(Math.floor(rng()*10000),4)}`;
          })(),
          email: makeEmail(rng, first, last),
          gender: isMale ? 'male' : 'female',
          payment_terms_days: pickFrom(rng, [0, 30]),
          credit_limit_nis: Math.floor(rng()*20000)+1000,
          is_active: true,
          created_at: '2026-01-01T08:00:00Z',
        });
      }
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────
  // generateEmployee
  // ─────────────────────────────────────────────────────────────────

  /**
   * Realistic employee records: Hebrew first/last name, valid ת.ז,
   * plausible age (20–65), real Israeli city address, a role drawn from
   * the ROLES catalog (weighted toward production staff).
   */
  generateEmployee(count, opts = {}) {
    const rng = Number.isFinite(opts.seed) ? mulberry32(opts.seed) : this.rng;
    const out = [];
    for (let i = 0; i < count; i++) {
      this._counters.employee += 1;
      const idx = this._counters.employee;
      const isMale = rng() < 0.72; // metalworking workforce skew
      const first = pickFrom(rng, isMale ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE);
      const last = pickFrom(rng, SURNAMES);
      const tz = externalGenerateValidTZ ? externalGenerateValidTZ({ rng }) : embeddedGenerateValidTZ(rng);
      const age = Math.floor(rng()*46)+20; // 20..65
      // birth date: today - age years, random day-of-year
      const birthYear = 2026 - age;
      const birthMonth = Math.floor(rng()*12)+1;
      const birthDay = Math.floor(rng()*28)+1;

      // Role weighted: production workers more common
      const role = weightedChoice(rng, ROLES, (r) => {
        if (r.code === 'prod_worker') return 25;
        if (r.code === 'welder') return 10;
        if (r.code === 'cnc_op') return 7;
        if (r.code === 'laser_op') return 5;
        if (r.code === 'crew_lead') return 4;
        if (r.code === 'shift_mgr') return 2;
        if (r.code === 'prod_mgr') return 1;
        if (r.code === 'quality') return 3;
        if (r.code === 'forklift') return 4;
        if (r.code === 'warehouse') return 5;
        if (r.code === 'driver') return 3;
        if (r.code === 'maintenance') return 3;
        if (r.code === 'secretary') return 3;
        if (r.code === 'bookkeeper') return 2;
        if (r.code === 'accountant') return 1;
        if (r.code === 'buyer') return 2;
        if (r.code === 'sales') return 3;
        if (r.code === 'hr') return 1;
        return 1;
      });

      // Wage: base × (0.85..1.15)
      const wageJitter = 0.85 + rng() * 0.3;
      const baseWage = Math.round(role.base * wageJitter / 10) * 10;

      const street = pickFrom(rng, STREETS);
      const houseNo = Math.floor(rng()*180)+1;
      const city = pickFrom(rng, CITIES);

      // Hire date: anywhere from 0 to 15 years ago
      const tenureYears = Math.floor(rng() * Math.min(15, age - 18));
      const hireYear = 2026 - tenureYears;
      const hireMonth = Math.floor(rng()*12)+1;
      const hireDay = Math.floor(rng()*28)+1;

      out.push({
        id: `EMP-${zeroPad(idx, 5)}`,
        employee_number: zeroPad(idx, 5),
        first_name: first,
        last_name: last,
        full_name: `${first} ${last}`,
        teudat_zehut: tz,
        gender: isMale ? 'male' : 'female',
        birth_date: `${birthYear}-${zeroPad(birthMonth,2)}-${zeroPad(birthDay,2)}`,
        age,
        address: {
          street, house_number: houseNo,
          street_line: `${street} ${houseNo}`,
          city: city.he, zip: city.zip, area: city.area, country: 'IL',
        },
        mobile: (() => {
          const p = pickFrom(rng, ['050','052','053','054','055','058']);
          return `${p}-${zeroPad(Math.floor(rng()*1000),3)}-${zeroPad(Math.floor(rng()*10000),4)}`;
        })(),
        email: makeEmail(rng, first, last, 'technokol'),
        role_code: role.code,
        role_he: role.he,
        role_en: role.en,
        department: (() => {
          if (['prod_worker','welder','cnc_op','laser_op','crew_lead','shift_mgr','prod_mgr','quality'].includes(role.code)) return 'ייצור';
          if (['forklift','warehouse','driver','maintenance'].includes(role.code)) return 'לוגיסטיקה';
          if (['secretary','bookkeeper','accountant','buyer','hr'].includes(role.code)) return 'הנהלה';
          if (role.code === 'sales') return 'מכירות';
          return 'כללי';
        })(),
        hire_date: `${hireYear}-${zeroPad(hireMonth,2)}-${zeroPad(hireDay,2)}`,
        base_monthly_wage_nis: baseWage,
        employment_status: 'active',
        tax_credit_points: Math.round((2.25 + rng()*0.5) * 100) / 100,
        pension_percent: 0.06,
        severance_percent: 0.0833,
        bank: {
          bank_code: pickFrom(rng, ['10','11','12','14','20','31']),
          branch: zeroPad(Math.floor(rng()*900)+100, 3),
          account_number: zeroPad(Math.floor(rng()*900000)+100000, 6),
        },
        created_at: '2026-01-01T08:00:00Z',
      });
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────
  // generateItem
  // ─────────────────────────────────────────────────────────────────

  /**
   * Metal fabrication items: realistic Hebrew names, SKUs encoding
   * family + size, dimensions, NIS prices, stock levels.
   */
  generateItem(count, opts = {}) {
    const rng = Number.isFinite(opts.seed) ? mulberry32(opts.seed) : this.rng;
    const out = [];
    for (let i = 0; i < count; i++) {
      this._counters.item += 1;
      const idx = this._counters.item;
      const cat = pickFrom(rng, ITEM_CATEGORIES);
      const dim = pickFrom(rng, cat.dims);
      const dimSlug = dim.replace(/[^A-Za-z0-9]/g, '');
      const sku = `${cat.code}-${dimSlug || zeroPad(idx, 4)}`;

      const price = floatBetween(rng, cat.priceMin, cat.priceMax, 2);
      const cost = Math.round(price * (0.60 + rng() * 0.15) * 100) / 100; // 60–75% of price

      out.push({
        id: `ITM-${zeroPad(idx, 6)}`,
        sku,
        name_he: `${cat.he} ${dim}`,
        name_en: `${cat.en} ${dim}`,
        category_code: cat.code,
        category_he: cat.he,
        category_en: cat.en,
        dimension: dim,
        unit_he: cat.unit,
        unit_price_nis: price,
        unit_cost_nis: cost,
        vat_rate: 0.17,
        stock_qty: Math.floor(rng() * 500),
        reorder_point: Math.floor(rng() * 50) + 10,
        warehouse_bin: `A-${zeroPad(Math.floor(rng()*99)+1,2)}-${zeroPad(Math.floor(rng()*99)+1,2)}`,
        is_active: true,
        created_at: '2026-01-01T08:00:00Z',
      });
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────
  // generateInvoice
  // ─────────────────────────────────────────────────────────────────

  /**
   * Generate invoices linking suppliers and items. Each invoice has 1–8
   * line items, realistic subtotal, 17% VAT, total, and a חשבונית רפורמה
   * allocation number (7-digit government-issued reference used for
   * Israeli tax compliance since the 2024 reform).
   */
  generateInvoice(count, ctx = {}, opts = {}) {
    const rng = Number.isFinite(opts.seed) ? mulberry32(opts.seed) : this.rng;
    const suppliers = Array.isArray(ctx.suppliers) ? ctx.suppliers : [];
    const items = Array.isArray(ctx.items) ? ctx.items : [];

    if (suppliers.length === 0 || items.length === 0) {
      throw new Error(
        'generateInvoice requires non-empty ctx.suppliers and ctx.items ' +
        '(קלט ריק / empty input)'
      );
    }

    const out = [];
    for (let i = 0; i < count; i++) {
      this._counters.invoice += 1;
      const idx = this._counters.invoice;
      const supplier = suppliers[Math.floor(rng() * suppliers.length)];

      const numLines = Math.floor(rng() * 7) + 1; // 1..8 lines
      const lines = [];
      let subtotal = 0;
      for (let j = 0; j < numLines; j++) {
        const item = items[Math.floor(rng() * items.length)];
        const qty = Math.floor(rng() * 25) + 1;
        const unitPrice = item.unit_price_nis;
        const lineTotal = Math.round(qty * unitPrice * 100) / 100;
        subtotal += lineTotal;
        lines.push({
          line_no: j + 1,
          item_id: item.id,
          sku: item.sku,
          description: item.name_he,
          quantity: qty,
          unit_price_nis: unitPrice,
          line_total_nis: lineTotal,
        });
      }
      subtotal = Math.round(subtotal * 100) / 100;
      const vat = Math.round(subtotal * 0.17 * 100) / 100;
      const total = Math.round((subtotal + vat) * 100) / 100;

      // Issue date: spread across 2025-Q4 .. 2026-Q2
      const monthOffset = Math.floor(rng() * 9); // 0..8 months
      const baseMonth = 10; // Oct 2025
      const monthNum = ((baseMonth - 1 + monthOffset) % 12) + 1;
      const yearNum = 2025 + Math.floor((baseMonth - 1 + monthOffset) / 12);
      const day = Math.floor(rng() * 28) + 1;
      const issueDate = `${yearNum}-${zeroPad(monthNum,2)}-${zeroPad(day,2)}`;

      // חשבונית רפורמה allocation number (7 digits, from tax authority)
      const allocation = zeroPad(Math.floor(rng() * 10000000), 7);

      // Invoice number: SUPPREFIX/YYYY/NNNNN
      const invoiceNo = `${supplier.id.slice(-4)}/${yearNum}/${zeroPad(idx, 5)}`;

      out.push({
        id: `INV-${zeroPad(idx, 7)}`,
        invoice_number: invoiceNo,
        invoice_type: 'cheshbonit_mas', // חשבונית מס
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        supplier_company_id: supplier.company_id || supplier.vat_id,
        issue_date: issueDate,
        due_date: (() => {
          const d = new Date(issueDate + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() + (supplier.payment_terms_days || 30));
          return d.toISOString().slice(0, 10);
        })(),
        currency: 'ILS',
        lines,
        subtotal_nis: subtotal,
        vat_rate: 0.17,
        vat_amount_nis: vat,
        total_nis: total,
        allocation_number: allocation,
        payment_status: pickFrom(rng, ['pending', 'pending', 'paid', 'paid', 'partial', 'overdue']),
        created_at: `${issueDate}T09:00:00Z`,
      });
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────
  // generatePayroll
  // ─────────────────────────────────────────────────────────────────

  /**
   * Given an array of employees and a YYYY-MM month string, produce
   * a payslip per employee using the 2026 tax brackets, BL, health,
   * and pension rates defined above. Gross wage is the employee's
   * base_monthly_wage_nis ± ~5% (overtime / hours jitter).
   */
  generatePayroll(employees, month, opts = {}) {
    const rng = Number.isFinite(opts.seed) ? mulberry32(opts.seed) : this.rng;
    if (!Array.isArray(employees)) {
      throw new Error('generatePayroll requires an employees[] array');
    }
    if (!/^\d{4}-\d{2}$/.test(String(month || ''))) {
      throw new Error('generatePayroll requires month in YYYY-MM format');
    }

    const out = [];
    for (const emp of employees) {
      this._counters.payslip += 1;
      const idx = this._counters.payslip;

      // Overtime / hours jitter: ±5% of base
      const jitter = 0.95 + rng() * 0.1;
      const gross = Math.round(emp.base_monthly_wage_nis * jitter * 100) / 100;

      const incomeTax = computeIncomeTax(gross, emp.tax_credit_points || 2.25);
      const bl = computeBituachLeumi(gross);
      const health = computeMasBriut(gross);
      const pensionEmployee = Math.round(gross * PENSION_EMPLOYEE * 100) / 100;
      const pensionEmployer = Math.round(gross * PENSION_EMPLOYER * 100) / 100;
      const severance = Math.round(gross * SEVERANCE_EMPLOYER * 100) / 100;

      const totalDeductions = Math.round(
        (incomeTax + bl + health + pensionEmployee) * 100
      ) / 100;
      const net = Math.round((gross - totalDeductions) * 100) / 100;

      // Working-day count: 21–23 days typical
      const workingDays = Math.floor(rng() * 3) + 21;
      // Hours: 182 ± small delta
      const hours = 182 + Math.floor(rng() * 12) - 6;

      out.push({
        id: `PAY-${month}-${emp.id}`,
        payslip_number: `${month}/${zeroPad(idx, 5)}`,
        employee_id: emp.id,
        employee_name: emp.full_name,
        employee_tz: emp.teudat_zehut,
        month,
        working_days: workingDays,
        hours_worked: hours,
        gross_wage_nis: gross,
        income_tax_nis: incomeTax,
        bituach_leumi_nis: bl,
        mas_briut_nis: health,
        pension_employee_nis: pensionEmployee,
        pension_employer_nis: pensionEmployer,
        severance_employer_nis: severance,
        total_deductions_nis: totalDeductions,
        net_wage_nis: net,
        payment_method: 'bank_transfer',
        payment_date: `${month}-09`,
        tax_credit_points: emp.tax_credit_points || 2.25,
        currency: 'ILS',
        created_at: `${month}-05T16:00:00Z`,
      });
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────
  // generateAll
  // ─────────────────────────────────────────────────────────────────

  /**
   * Generate an entire fixture tree in one call. Counts default to
   * small-but-plausible values; pass explicit counts to scale up.
   *
   * @param {object} opts
   * @param {number} [opts.suppliers=20]
   * @param {number} [opts.customers=50]
   * @param {number} [opts.employees=15]
   * @param {number} [opts.items=40]
   * @param {number} [opts.invoices=100]
   * @param {string[]} [opts.months=['2026-01','2026-02','2026-03']]
   * @returns {{suppliers, customers, employees, items, invoices, payroll}}
   */
  generateAll(opts = {}) {
    const suppliers = this.generateSupplier(opts.suppliers != null ? opts.suppliers : 20);
    const customers = this.generateCustomer(opts.customers != null ? opts.customers : 50);
    const employees = this.generateEmployee(opts.employees != null ? opts.employees : 15);
    const items = this.generateItem(opts.items != null ? opts.items : 40);
    const invoices = this.generateInvoice(
      opts.invoices != null ? opts.invoices : 100,
      { suppliers, items }
    );
    const months = Array.isArray(opts.months) && opts.months.length > 0
      ? opts.months
      : ['2026-01', '2026-02', '2026-03'];
    const payroll = [];
    for (const m of months) {
      const slips = this.generatePayroll(employees, m);
      for (const s of slips) payroll.push(s);
    }
    return {
      seed: this.seed,
      generated_at: '2026-04-11T00:00:00Z',
      suppliers,
      customers,
      employees,
      items,
      invoices,
      payroll,
      counts: {
        suppliers: suppliers.length,
        customers: customers.length,
        employees: employees.length,
        items: items.length,
        invoices: invoices.length,
        payroll: payroll.length,
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  IsraeliSeedGenerator,

  // Expose pools so callers (and tests) can introspect / extend
  POOLS: Object.freeze({
    FIRST_NAMES_MALE,
    FIRST_NAMES_FEMALE,
    SURNAMES,
    CITIES,
    STREETS,
    INDUSTRIAL_STREETS,
    COMPANY_PREFIX,
    COMPANY_MIDDLE,
    COMPANY_SURNAMES,
    COMPANY_SUFFIX_BIZ,
    COMPANY_SUFFIX_LEGAL,
    ITEM_CATEGORIES,
    ROLES,
  }),

  // Expose constants for downstream integration
  TAX_BRACKETS_2026,
  BL_THRESHOLD,
  PENSION_EMPLOYEE,
  PENSION_EMPLOYER,
  SEVERANCE_EMPLOYER,

  // Internal helpers (handy for tests / callers)
  mulberry32,
  embeddedGenerateValidTZ,
  generateValidCompanyId,
  computeIncomeTax,
  computeBituachLeumi,
  computeMasBriut,
  buildCompanyName,
  heToLatinSlug,
};
