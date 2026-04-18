/**
 * arnona-tracker.js — מעקב ארנונה ישראלית (Israeli Municipal Property Tax Tracker)
 * Agent Y-054 / Swarm 3C / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Israeli municipal property tax (ארנונה עירונית) tracker per
 * pkudat ha-arnona (תקנות ההסדרים במשק המדינה — ארנונה כללית ברשויות המקומיות, התשנ"ג-1993)
 * and the annual arnona order of each reshut mekomit.
 *
 * Rule of the house: לא מוחקים רק משדרגים ומגדלים —
 * this module never deletes, never mutates caller data, and is additive only.
 *
 *   • Classification  (סיווג נכס)       — residential / commercial / industrial / office / storage / vacant
 *   • Rate            (תעריף)           — ILS per sqm per year, per zone
 *   • Computation     (חישוב חיוב)      — sqm × rate × (1 − discounts)
 *   • Payment schedule (לוח תשלומים)    — annual / bi-monthly (דו-חודשי) / monthly
 *   • Early-payment discount (הנחת מזומן) — ~2-5% for annual lump-sum
 *   • Social discounts (הנחות סוציאליות) — pensioner, disabled, lone parent,
 *                                         reserve soldier, new immigrant, student
 *   • Payment tracking (רישום תשלומים)  — registerPayment + ledger
 *   • Appeal form      (השגה על ארנונה) — generateAppeal (סעיף 3 לחוק הרשויות המקומיות — ערר על קביעת ארנונה כללית)
 *   • Overdue alert    (התראת פיגור)    — ריבית פיגורים after grace period
 *   • Municipality catalog — embedded rates for top 30 reshuyot 2026
 *
 * Zero external dependencies. Pure functions unless explicitly noted
 * (registerPayment and defineClassification are the only stateful methods on
 * the tracker instance — they append to the in-memory ledgers). Bilingual
 * (Hebrew + English) labels and citations throughout.
 *
 * ---------------------------------------------------------------------------
 * Legal references:
 *
 *   חוק הסדרים במשק המדינה (תיקוני חקיקה להשגת יעדי תקציב), התשנ"ג-1992
 *     סעיף 7      — ארנונה כללית
 *     סעיף 8      — תעריפי ארנונה ועדכונם
 *     סעיף 9      — הנחות בארנונה
 *
 *   חוק הרשויות המקומיות (ערר על קביעת ארנונה כללית), התשל"ו-1976
 *     סעיף 3      — עילות השגה:
 *                    (א) הנכס שבנדון אינו מצוי באזור כפי שנקבע בהודעת תשלום
 *                    (ב) נפלה בהודעת תשלום טעות בציון סוג הנכס, גודלו או השימוש בו
 *                    (ג) המחזיק בנכס הוא איננו נישום כהגדרתו
 *                    (ד) היה הנכס עומד ריק
 *     סעיף 4      — זכות ערר על החלטת מנהל הארנונה
 *     סעיף 6      — ערעור בפני ועדת הערר
 *
 *   תקנות ההסדרים במשק המדינה (הנחה מארנונה), התשנ"ג-1993
 *     תקנה 2(א)(1)  — אזרח ותיק (פנסיונר)
 *     תקנה 2(א)(2)  — נכה נפש / רפואי
 *     תקנה 2(א)(3)  — הורה עצמאי
 *     תקנה 2(א)(4)  — חייל מילואים פעיל
 *     תקנה 2(א)(5)  — עולה חדש (בטווח 12-24 חודשים)
 *     תקנה 2(א)(6)  — סטודנט
 *     תקנה 2(ג)     — שיעורי ההנחה נקבעים על ידי מועצת הרשות המקומית
 *
 * ---------------------------------------------------------------------------
 * Exports:
 *
 *   ArnonaTracker                  (class — stateful, instance-per-portfolio)
 *   computeArnonaCharge(params)    (stateless helper — called internally)
 *   MUNICIPALITY_CATALOG_2026      (frozen rate table, 30 reshuyot)
 *   SOCIAL_DISCOUNT_CATALOG        (frozen discount catalog, by type)
 *   PROPERTY_TYPES                 (enum)
 *   PAYMENT_SCHEDULES              (enum)
 *   APPEAL_GROUNDS                 (catalog of השגה grounds with citations)
 *   LAW_CITATIONS                  (bilingual legal citations)
 *   HEBREW_GLOSSARY                (term translations for UI layer)
 *   _internals                     (testing shims)
 *
 * ---------------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// Constants & enums
// ═══════════════════════════════════════════════════════════════

/** Property type enum — סוגי נכסים לצורך ארנונה */
const PROPERTY_TYPES = Object.freeze({
  RESIDENTIAL: 'residential', // מגורים
  COMMERCIAL: 'commercial',   // מסחרי
  INDUSTRIAL: 'industrial',   // תעשייה
  OFFICE: 'office',           // משרדים
  STORAGE: 'storage',         // מחסן
  VACANT: 'vacant',           // קרקע פנויה / נכס ריק
});

const VALID_PROPERTY_TYPES = Object.freeze(Object.values(PROPERTY_TYPES));

/** Payment schedules — לוחות תשלום */
const PAYMENT_SCHEDULES = Object.freeze({
  ANNUAL: 'annual',         // חד פעמי
  BIMONTHLY: 'bimonthly',   // דו-חודשי (6 תשלומים)
  MONTHLY: 'monthly',       // חודשי (12 תשלומים)
});

const VALID_SCHEDULES = Object.freeze(Object.values(PAYMENT_SCHEDULES));

/** Law citations — bilingual (Hebrew + English) */
const LAW_CITATIONS = Object.freeze({
  HESDARIM_7: Object.freeze({
    he: 'סעיף 7 לחוק הסדרים במשק המדינה (תיקוני חקיקה להשגת יעדי תקציב), התשנ"ג-1992',
    en: 'Section 7, Economy Arrangements Law (Legislative Amendments for Meeting Budget Targets), 1992',
  }),
  HESDARIM_8: Object.freeze({
    he: 'סעיף 8 לחוק הסדרים במשק המדינה — תעריפי ארנונה ועדכונם',
    en: 'Section 8, Economy Arrangements Law — arnona tariffs and updates',
  }),
  HESDARIM_9: Object.freeze({
    he: 'סעיף 9 לחוק הסדרים במשק המדינה — הנחות בארנונה',
    en: 'Section 9, Economy Arrangements Law — arnona discounts',
  }),
  APPEAL_LAW_3: Object.freeze({
    he: 'סעיף 3 לחוק הרשויות המקומיות (ערר על קביעת ארנונה כללית), התשל"ו-1976',
    en: 'Section 3, Local Authorities Law (Appeal on General Arnona Assessment), 1976',
  }),
  APPEAL_LAW_4: Object.freeze({
    he: 'סעיף 4 לחוק הרשויות המקומיות (ערר על קביעת ארנונה כללית) — ערעור בפני ועדת ערר',
    en: 'Section 4, Local Authorities Law — appeal before arnona appeal committee',
  }),
  DISCOUNT_REGS_2A: Object.freeze({
    he: 'תקנה 2(א) לתקנות ההסדרים במשק המדינה (הנחה מארנונה), התשנ"ג-1993',
    en: 'Regulation 2(a), Economy Arrangements Regulations (Arnona Discount), 1993',
  }),
});

/** Early-payment (lump-sum) discount range for annual schedule — הנחת מזומן */
const EARLY_PAYMENT_DISCOUNT = Object.freeze({
  MIN: 0.02, // 2%
  MAX: 0.05, // 5%
  DEFAULT: 0.02,
  CITATION: LAW_CITATIONS.HESDARIM_9,
  label_he: 'הנחת מזומן — תשלום חד פעמי מראש',
  label_en: 'Early-payment (lump-sum) discount',
});

/** Interest rate on overdue payments — ריבית פיגורים (monthly, Ministry of Finance default) */
const OVERDUE_INTEREST = Object.freeze({
  MONTHLY_RATE: 0.006,   // 0.6% per month ≈ 7.2% annual — typical reshut default
  DEFAULT_GRACE_DAYS: 30, // First 30 days after the period due date are grace
  label_he: 'ריבית פיגורים על חוב ארנונה',
  label_en: 'Interest on overdue arnona',
});

// ═══════════════════════════════════════════════════════════════
// Social discounts catalog — per תקנה 2(א)
// ═══════════════════════════════════════════════════════════════

/**
 * Social-discount catalog. Each entry has a default percentage (the מליאת
 * הרשות may grant up to "upTo"), a sqm ceiling when applicable, and bilingual
 * labels. The actual rate per reshut can be overridden via defineClassification
 * or an explicit discount rate in computeArnona — this catalog is the fallback.
 */
const SOCIAL_DISCOUNT_CATALOG = Object.freeze({
  pensioner: Object.freeze({
    key: 'pensioner',
    label_he: 'אזרח ותיק (פנסיונר)',
    label_en: 'Senior citizen / pensioner',
    regulation: 'תקנה 2(א)(1)',
    defaultRate: 0.25,        // 25% — core eligibility
    upTo: 1.00,               // up to 100% for low-income bituach leumi recipient
    sqmCeiling: 100,          // typically first 100 sqm
    citation: LAW_CITATIONS.DISCOUNT_REGS_2A,
    conditions_he: [
      'גיל פרישה חוקית (זכר — 67, נקבה — 62)',
      'גר בנכס העיקרי שלו',
      'עד לתקרה השטחית שנקבעה על ידי הרשות',
    ],
    conditions_en: [
      'Legal retirement age (male 67, female 62)',
      'Resides in primary residence',
      'Up to the sqm ceiling set by the local authority',
    ],
  }),
  pensionerLowIncome: Object.freeze({
    key: 'pensionerLowIncome',
    label_he: 'אזרח ותיק מקבל השלמת הכנסה',
    label_en: 'Senior citizen with income supplement',
    regulation: 'תקנה 2(א)(1)(ב)',
    defaultRate: 1.00,        // full 100%
    upTo: 1.00,
    sqmCeiling: 100,
    citation: LAW_CITATIONS.DISCOUNT_REGS_2A,
    conditions_he: [
      'אזרח ותיק המקבל קצבת השלמת הכנסה מביטוח לאומי',
      'הנכס העיקרי לפי תשלומי הדואר / ארנונה',
    ],
    conditions_en: [
      'Senior citizen receiving income supplement from Bituach Leumi',
      'Primary residence per postal / arnona records',
    ],
  }),
  disabled: Object.freeze({
    key: 'disabled',
    label_he: 'נכה בעל דרגת אי-כושר של 75% ומעלה',
    label_en: 'Disabled (75%+ work incapacity rating)',
    regulation: 'תקנה 2(א)(2)',
    defaultRate: 0.80,        // 80%
    upTo: 0.80,
    sqmCeiling: 100,
    citation: LAW_CITATIONS.DISCOUNT_REGS_2A,
    conditions_he: [
      'דרגת אי-כושר קבועה של 75% ומעלה לפי ביטוח לאומי',
      'או: נכה רפואי 90% ומעלה',
      'הנכס מגורים עיקרי',
    ],
    conditions_en: [
      'Permanent work-incapacity rating of 75%+ per Bituach Leumi',
      'Or: medical disability 90%+',
      'Primary residence',
    ],
  }),
  loneParent: Object.freeze({
    key: 'loneParent',
    label_he: 'הורה עצמאי (חד-הורי)',
    label_en: 'Lone parent (single-parent household)',
    regulation: 'תקנה 2(א)(3)',
    defaultRate: 0.20,        // 20%
    upTo: 0.20,
    sqmCeiling: 100,
    citation: LAW_CITATIONS.DISCOUNT_REGS_2A,
    conditions_he: [
      'הורה המגדל את ילדיו לבד עד גיל 18',
      'מכוח חוק משפחות חד הוריות, התשנ"ב-1992',
    ],
    conditions_en: [
      'Parent raising children alone (up to age 18)',
      'Under Single-Parent Families Law, 1992',
    ],
  }),
  reserveSoldier: Object.freeze({
    key: 'reserveSoldier',
    label_he: 'חייל מילואים פעיל',
    label_en: 'Active reserve soldier (miluim)',
    regulation: 'תקנה 2(א)(4)',
    defaultRate: 0.05,        // 5% base — raised to 25%+ during campaigns
    upTo: 0.50,
    sqmCeiling: 100,
    citation: LAW_CITATIONS.DISCOUNT_REGS_2A,
    conditions_he: [
      'חייל מילואים פעיל בעל אישור מצה"ל',
      'תקופת שירות מינימלית נקבעת על ידי הרשות',
      'בעת מבצעים שיעור ההנחה יכול להגיע ל-100%',
    ],
    conditions_en: [
      'Active reservist with IDF certification',
      'Minimum service duration set by the local authority',
      'During operations the rate may reach 100%',
    ],
  }),
  newImmigrant: Object.freeze({
    key: 'newImmigrant',
    label_he: 'עולה חדש (במהלך 12 חודשים מתוך 24)',
    label_en: 'New immigrant (within 12 of first 24 months)',
    regulation: 'תקנה 2(א)(5)',
    defaultRate: 0.90,        // 90%
    upTo: 0.90,
    sqmCeiling: 100,
    citation: LAW_CITATIONS.DISCOUNT_REGS_2A,
    conditions_he: [
      'עולה בתוך שנתיים הראשונות לעלייתו לישראל',
      'ההנחה ניתנת עד 12 חודשים מצטברים מתוך 24',
      'לפי תעודת עולה של משרד הקליטה',
    ],
    conditions_en: [
      'Within the first 24 months after aliyah',
      'Discount for up to 12 cumulative months of the first 24',
      'Per Ministry of Aliyah immigrant certificate',
    ],
  }),
  student: Object.freeze({
    key: 'student',
    label_he: 'סטודנט',
    label_en: 'Student',
    regulation: 'תקנה 2(א)(6)',
    defaultRate: 0.10,        // 10% — varies widely by reshut
    upTo: 0.25,
    sqmCeiling: 100,
    citation: LAW_CITATIONS.DISCOUNT_REGS_2A,
    conditions_he: [
      'סטודנט לתואר במוסד מוכר',
      'שיעור ההנחה משתנה לפי הרשות',
      'חלק מהרשויות מתנות זאת בתרומה לקהילה',
    ],
    conditions_en: [
      'Student in a recognized degree-granting institution',
      'Rate varies per local authority',
      'Some authorities condition it on community volunteering',
    ],
  }),
  holocaustSurvivor: Object.freeze({
    key: 'holocaustSurvivor',
    label_he: 'ניצול שואה',
    label_en: 'Holocaust survivor',
    regulation: 'תקנה 2(א)(1א)',
    defaultRate: 0.66,
    upTo: 1.00,
    sqmCeiling: 100,
    citation: LAW_CITATIONS.DISCOUNT_REGS_2A,
    conditions_he: [
      'ניצול שואה לפי חוק נכי רדיפות הנאצים, התשי"ז-1957',
      'או: מקבל קצבת השלמת הכנסה מביטוח לאומי',
    ],
    conditions_en: [
      'Holocaust survivor per Nazi Persecution Disabled Persons Law, 1957',
      'Or: recipient of Bituach Leumi income supplement',
    ],
  }),
});

const VALID_DISCOUNT_KEYS = Object.freeze(Object.keys(SOCIAL_DISCOUNT_CATALOG));

// ═══════════════════════════════════════════════════════════════
// Municipality catalog (rates ILS / sqm / year, 2026)
// ═══════════════════════════════════════════════════════════════

/**
 * MUNICIPALITY_CATALOG_2026 — embedded rate table for 30 largest
 * reshuyot mekomiyot in Israel, 2026 publication.
 *
 * Rates are **illustrative representative values** for the main zone
 * (אזור מגורים/מסחר ראשי) taken from the annual arnona orders; real filings
 * must fetch the current tzav-arnona file published by each reshut, which
 * the `defineClassification` method supports for exact overrides.
 *
 * Keys: latin stable identifier. The Hebrew name is in `name_he`.
 * Zone codes (A/B/C/...) vary per reshut — we store the central zone as
 * `mainZone`, with example alternate zones in `altZones`.
 *
 * All rates are in **ILS per square meter per year** (גולגולת מ"ר לשנה).
 */
const MUNICIPALITY_CATALOG_2026 = Object.freeze({
  'tel-aviv-yafo': Object.freeze({
    key: 'tel-aviv-yafo',
    name_he: 'תל אביב-יפו',
    name_en: 'Tel Aviv-Yafo',
    population: 474_530,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 68.5,
      commercial: 425.0,
      industrial: 150.0,
      office: 315.0,
      storage: 90.0,
      vacant: 22.0,
    }),
    altZones: Object.freeze({
      B: { residential: 62.0, commercial: 380.0 },
      C: { residential: 58.5, commercial: 340.0 },
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'jerusalem': Object.freeze({
    key: 'jerusalem',
    name_he: 'ירושלים',
    name_en: 'Jerusalem',
    population: 981_711,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 61.8,
      commercial: 310.0,
      industrial: 135.0,
      office: 245.0,
      storage: 82.0,
      vacant: 19.0,
    }),
    altZones: Object.freeze({
      B: { residential: 56.0, commercial: 275.0 },
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'haifa': Object.freeze({
    key: 'haifa',
    name_he: 'חיפה',
    name_en: 'Haifa',
    population: 288_640,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 59.9,
      commercial: 295.0,
      industrial: 130.0,
      office: 235.0,
      storage: 78.0,
      vacant: 17.5,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'rishon-le-zion': Object.freeze({
    key: 'rishon-le-zion',
    name_he: 'ראשון לציון',
    name_en: 'Rishon LeZion',
    population: 258_110,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 56.3,
      commercial: 285.0,
      industrial: 128.0,
      office: 215.0,
      storage: 75.0,
      vacant: 16.0,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'petah-tikva': Object.freeze({
    key: 'petah-tikva',
    name_he: 'פתח תקווה',
    name_en: 'Petah Tikva',
    population: 257_970,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 55.8,
      commercial: 278.0,
      industrial: 125.0,
      office: 210.0,
      storage: 73.0,
      vacant: 15.5,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'ashdod': Object.freeze({
    key: 'ashdod',
    name_he: 'אשדוד',
    name_en: 'Ashdod',
    population: 226_310,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 52.4,
      commercial: 265.0,
      industrial: 118.0,
      office: 195.0,
      storage: 70.0,
      vacant: 14.0,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'netanya': Object.freeze({
    key: 'netanya',
    name_he: 'נתניה',
    name_en: 'Netanya',
    population: 228_220,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 54.2,
      commercial: 272.0,
      industrial: 120.0,
      office: 200.0,
      storage: 71.0,
      vacant: 14.5,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.025,
  }),
  'beer-sheva': Object.freeze({
    key: 'beer-sheva',
    name_he: 'באר שבע',
    name_en: 'Beer Sheva',
    population: 214_600,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 48.6,
      commercial: 245.0,
      industrial: 110.0,
      office: 180.0,
      storage: 66.0,
      vacant: 12.5,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'bnei-brak': Object.freeze({
    key: 'bnei-brak',
    name_he: 'בני ברק',
    name_en: 'Bnei Brak',
    population: 217_400,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 44.1,
      commercial: 215.0,
      industrial: 105.0,
      office: 170.0,
      storage: 64.0,
      vacant: 12.0,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'holon': Object.freeze({
    key: 'holon',
    name_he: 'חולון',
    name_en: 'Holon',
    population: 197_260,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 53.7,
      commercial: 268.0,
      industrial: 118.0,
      office: 198.0,
      storage: 70.0,
      vacant: 14.0,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'ramat-gan': Object.freeze({
    key: 'ramat-gan',
    name_he: 'רמת גן',
    name_en: 'Ramat Gan',
    population: 170_880,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 64.1,
      commercial: 385.0,
      industrial: 138.0,
      office: 290.0,
      storage: 85.0,
      vacant: 19.5,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'ashkelon': Object.freeze({
    key: 'ashkelon',
    name_he: 'אשקלון',
    name_en: 'Ashkelon',
    population: 160_600,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 50.2,
      commercial: 250.0,
      industrial: 115.0,
      office: 185.0,
      storage: 68.0,
      vacant: 13.0,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'rehovot': Object.freeze({
    key: 'rehovot',
    name_he: 'רחובות',
    name_en: 'Rehovot',
    population: 151_500,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 53.0,
      commercial: 270.0,
      industrial: 120.0,
      office: 200.0,
      storage: 70.0,
      vacant: 14.0,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'bat-yam': Object.freeze({
    key: 'bat-yam',
    name_he: 'בת ים',
    name_en: 'Bat Yam',
    population: 127_900,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 54.5,
      commercial: 270.0,
      industrial: 118.0,
      office: 200.0,
      storage: 70.0,
      vacant: 14.0,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'beit-shemesh': Object.freeze({
    key: 'beit-shemesh',
    name_he: 'בית שמש',
    name_en: 'Beit Shemesh',
    population: 141_700,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 43.2,
      commercial: 210.0,
      industrial: 102.0,
      office: 165.0,
      storage: 62.0,
      vacant: 11.5,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'kfar-saba': Object.freeze({
    key: 'kfar-saba',
    name_he: 'כפר סבא',
    name_en: 'Kfar Saba',
    population: 109_900,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 58.4,
      commercial: 295.0,
      industrial: 125.0,
      office: 220.0,
      storage: 75.0,
      vacant: 15.5,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'herzliya': Object.freeze({
    key: 'herzliya',
    name_he: 'הרצליה',
    name_en: 'Herzliya',
    population: 107_800,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 63.8,
      commercial: 360.0,
      industrial: 140.0,
      office: 280.0,
      storage: 85.0,
      vacant: 19.0,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.03,
  }),
  'hadera': Object.freeze({
    key: 'hadera',
    name_he: 'חדרה',
    name_en: 'Hadera',
    population: 102_900,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 51.5,
      commercial: 252.0,
      industrial: 115.0,
      office: 188.0,
      storage: 67.0,
      vacant: 13.5,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'modiin': Object.freeze({
    key: 'modiin',
    name_he: 'מודיעין-מכבים-רעות',
    name_en: 'Modi\'in-Maccabim-Re\'ut',
    population: 103_600,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 57.9,
      commercial: 280.0,
      industrial: 125.0,
      office: 210.0,
      storage: 72.0,
      vacant: 15.0,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'raanana': Object.freeze({
    key: 'raanana',
    name_he: 'רעננה',
    name_en: 'Ra\'anana',
    population: 86_900,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 61.2,
      commercial: 330.0,
      industrial: 132.0,
      office: 250.0,
      storage: 78.0,
      vacant: 16.5,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.03,
  }),
  'rishon': Object.freeze({
    key: 'rishon',
    name_he: 'ראשון לציון',
    name_en: 'Rishon (alias)',
    population: 258_110,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 56.3,
      commercial: 285.0,
      industrial: 128.0,
      office: 215.0,
      storage: 75.0,
      vacant: 16.0,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'lod': Object.freeze({
    key: 'lod',
    name_he: 'לוד',
    name_en: 'Lod',
    population: 85_400,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 48.0,
      commercial: 230.0,
      industrial: 108.0,
      office: 175.0,
      storage: 65.0,
      vacant: 12.5,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'ramla': Object.freeze({
    key: 'ramla',
    name_he: 'רמלה',
    name_en: 'Ramla',
    population: 78_600,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 47.5,
      commercial: 225.0,
      industrial: 106.0,
      office: 172.0,
      storage: 64.0,
      vacant: 12.0,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'nazareth': Object.freeze({
    key: 'nazareth',
    name_he: 'נצרת',
    name_en: 'Nazareth',
    population: 77_800,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 44.8,
      commercial: 205.0,
      industrial: 100.0,
      office: 160.0,
      storage: 60.0,
      vacant: 11.0,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'kiryat-gat': Object.freeze({
    key: 'kiryat-gat',
    name_he: 'קריית גת',
    name_en: 'Kiryat Gat',
    population: 62_500,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 46.3,
      commercial: 220.0,
      industrial: 104.0,
      office: 168.0,
      storage: 63.0,
      vacant: 12.0,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'nahariya': Object.freeze({
    key: 'nahariya',
    name_he: 'נהריה',
    name_en: 'Nahariya',
    population: 61_500,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 49.0,
      commercial: 235.0,
      industrial: 108.0,
      office: 178.0,
      storage: 65.0,
      vacant: 12.5,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'givatayim': Object.freeze({
    key: 'givatayim',
    name_he: 'גבעתיים',
    name_en: 'Givatayim',
    population: 60_100,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 62.5,
      commercial: 320.0,
      industrial: 130.0,
      office: 245.0,
      storage: 80.0,
      vacant: 17.0,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'hod-hasharon': Object.freeze({
    key: 'hod-hasharon',
    name_he: 'הוד השרון',
    name_en: 'Hod HaSharon',
    population: 66_200,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 58.8,
      commercial: 298.0,
      industrial: 126.0,
      office: 222.0,
      storage: 74.0,
      vacant: 15.5,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.025,
  }),
  'rosh-haayin': Object.freeze({
    key: 'rosh-haayin',
    name_he: 'ראש העין',
    name_en: 'Rosh HaAyin',
    population: 69_400,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 55.0,
      commercial: 275.0,
      industrial: 122.0,
      office: 205.0,
      storage: 71.0,
      vacant: 14.5,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.02,
  }),
  'eilat': Object.freeze({
    key: 'eilat',
    name_he: 'אילת',
    name_en: 'Eilat',
    population: 53_100,
    mainZone: 'A',
    rates: Object.freeze({
      residential: 45.5,
      commercial: 260.0,
      industrial: 110.0,
      office: 180.0,
      storage: 66.0,
      vacant: 12.5,
    }),
    paymentSchedules: Object.freeze(['annual', 'bimonthly', 'monthly']),
    earlyPaymentDiscount: 0.03,
  }),
});

// ═══════════════════════════════════════════════════════════════
// Appeal grounds — עילות השגה — Section 3 of the Appeal Law
// ═══════════════════════════════════════════════════════════════

const APPEAL_GROUNDS = Object.freeze({
  WRONG_ZONE: Object.freeze({
    key: 'WRONG_ZONE',
    section: '3(א)',
    label_he: 'הנכס לא נמצא באזור כפי שנקבע בהודעת התשלום',
    label_en: 'The property is not in the zone specified in the payment notice',
    citation: LAW_CITATIONS.APPEAL_LAW_3,
  }),
  WRONG_CLASSIFICATION: Object.freeze({
    key: 'WRONG_CLASSIFICATION',
    section: '3(ב)',
    label_he: 'נפלה טעות בסיווג, בגודל או בשימוש בנכס',
    label_en: 'Error in property classification, size, or use',
    citation: LAW_CITATIONS.APPEAL_LAW_3,
  }),
  NOT_HOLDER: Object.freeze({
    key: 'NOT_HOLDER',
    section: '3(ג)',
    label_he: 'המחזיק אינו החייב בארנונה לפי סעיף 8 לחוק ההסדרים',
    label_en: 'The holder is not the liable taxpayer under Section 8 of the Arrangements Law',
    citation: LAW_CITATIONS.APPEAL_LAW_3,
  }),
  VACANT: Object.freeze({
    key: 'VACANT',
    section: '3(ד)',
    label_he: 'הנכס עמד ריק ללא שימוש (עד 6 חודשים בתקופת 3 שנים)',
    label_en: 'The property stood vacant without use (up to 6 months in a 3-year period)',
    citation: LAW_CITATIONS.APPEAL_LAW_3,
  }),
  WRONG_SQM: Object.freeze({
    key: 'WRONG_SQM',
    section: '3(ב)',
    label_he: 'הגודל (מ"ר) שנקבע בחיוב שגוי לעומת מדידה עדכנית',
    label_en: 'The sqm used in the assessment is incorrect per up-to-date measurement',
    citation: LAW_CITATIONS.APPEAL_LAW_3,
  }),
  DOUBLE_CHARGE: Object.freeze({
    key: 'DOUBLE_CHARGE',
    section: '3(ג)',
    label_he: 'חיוב כפול על אותו נכס',
    label_en: 'Duplicate charge for the same property',
    citation: LAW_CITATIONS.APPEAL_LAW_3,
  }),
});

const VALID_APPEAL_GROUNDS = Object.freeze(Object.keys(APPEAL_GROUNDS));

// ═══════════════════════════════════════════════════════════════
// Hebrew glossary (for UI layer)
// ═══════════════════════════════════════════════════════════════

const HEBREW_GLOSSARY = Object.freeze({
  arnona: { he: 'ארנונה', en: 'Municipal property tax' },
  reshutMekomit: { he: 'רשות מקומית', en: 'Local authority / municipality' },
  tzavArnona: { he: 'צו ארנונה', en: 'Arnona tariff order (annual)' },
  nechas: { he: 'נכס', en: 'Property' },
  siug: { he: 'סיווג', en: 'Classification' },
  tariff: { he: 'תעריף', en: 'Tariff / rate' },
  meter: { he: 'מ"ר (מטר מרובע)', en: 'Square meter (sqm)' },
  hazkaIshit: { he: 'החזקה אישית', en: 'Personal holding' },
  hanachat_mezuman: { he: 'הנחת מזומן', en: 'Cash-up-front (early-payment) discount' },
  hanacha: { he: 'הנחה', en: 'Discount' },
  hanachah_soziyalit: { he: 'הנחה סוציאלית', en: 'Social discount' },
  ezrah_vatik: { he: 'אזרח ותיק', en: 'Senior citizen (pensioner)' },
  hore_atzmai: { he: 'הורה עצמאי', en: 'Lone parent' },
  miluim: { he: 'חייל מילואים', en: 'Reserve soldier' },
  nacheh: { he: 'נכה', en: 'Disabled' },
  oleh_hadash: { he: 'עולה חדש', en: 'New immigrant' },
  student: { he: 'סטודנט', en: 'Student' },
  nitzol_shoa: { he: 'ניצול שואה', en: 'Holocaust survivor' },
  ribit_pigurim: { he: 'ריבית פיגורים', en: 'Late-payment interest' },
  hasaga: { he: 'השגה', en: 'Arnona appeal (primary)' },
  erer: { he: 'ערר', en: 'Appeal to the arnona committee' },
  vaadat_erer: { he: 'ועדת ערר לארנונה', en: 'Arnona appeal committee' },
  manhal_hearnona: { he: 'מנהל הארנונה', en: 'Arnona director (reshut mekomit)' },
  hodaat_tashlum: { he: 'הודעת תשלום', en: 'Payment notice / bill' },
  gush: { he: 'גוש', en: 'Block (land register)' },
  helka: { he: 'חלקה', en: 'Parcel (land register)' },
  residential: { he: 'מגורים', en: 'Residential' },
  commercial: { he: 'מסחרי', en: 'Commercial' },
  industrial: { he: 'תעשייה', en: 'Industrial' },
  office: { he: 'משרדים', en: 'Office' },
  storage: { he: 'מחסן', en: 'Storage' },
  vacant: { he: 'קרקע פנויה / ריק', en: 'Vacant' },
});

// ═══════════════════════════════════════════════════════════════
// Internal helpers — pure
// ═══════════════════════════════════════════════════════════════

/** Round to 2 decimals — stable across platforms */
function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Validate non-negative finite number */
function isNonNegativeFinite(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

/** Parse ISO date string to Date — strict */
function parseDate(iso) {
  if (typeof iso !== 'string') {
    throw new TypeError('date must be an ISO string (YYYY-MM-DD)');
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new RangeError(`invalid ISO date: ${iso}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) throw new RangeError(`invalid ISO date: ${iso}`);
  return d;
}

/** Number of full days between two ISO dates (positive = from < to) */
function daysBetween(from, to) {
  const ms = parseDate(to).getTime() - parseDate(from).getTime();
  return Math.floor(ms / 86_400_000);
}

/** Freeze deep (one-level clone freeze for small objects) */
function frozenCopy(obj) {
  return Object.freeze(Object.assign({}, obj));
}

/**
 * Clamp a discount rate to [0, 1] and round to 4 decimals.
 * Any negative, NaN, or > 1 value is snapped into range.
 */
function clampRate(r) {
  if (!Number.isFinite(r)) return 0;
  if (r < 0) return 0;
  if (r > 1) return 1;
  return Math.round(r * 10000) / 10000;
}

/**
 * Combine discount entries multiplicatively — discounts stack as
 * (1 − r1) × (1 − r2) × ... because two 25% discounts don't make 50%.
 * Returns the EFFECTIVE TOTAL RATE (0..1).
 */
function combineDiscounts(entries) {
  let residual = 1;
  for (const e of entries || []) {
    const r = clampRate(e && typeof e === 'object' ? e.rate : e);
    residual *= 1 - r;
  }
  return clampRate(1 - residual);
}

/**
 * Resolve a discount entry to its canonical form. Accepts either:
 *   - a string key from SOCIAL_DISCOUNT_CATALOG ("pensioner")
 *   - an object with { key, rate, sqmCap, reason }
 *   - a bare number 0..1 (rare — treated as an unlabeled rate)
 */
function resolveDiscountEntry(input, ctx) {
  if (input == null) return null;
  if (typeof input === 'number') {
    return { key: 'custom', label_he: 'הנחה מותאמת', label_en: 'Custom discount', rate: clampRate(input) };
  }
  if (typeof input === 'string') {
    const def = SOCIAL_DISCOUNT_CATALOG[input];
    if (!def) return { key: input, label_he: input, label_en: input, rate: 0 };
    return {
      key: def.key,
      label_he: def.label_he,
      label_en: def.label_en,
      regulation: def.regulation,
      rate: clampRate(def.defaultRate),
      sqmCap: def.sqmCeiling,
      citation: def.citation,
    };
  }
  if (typeof input === 'object') {
    const def = input.key ? SOCIAL_DISCOUNT_CATALOG[input.key] : null;
    const rate = clampRate(input.rate != null ? input.rate : (def ? def.defaultRate : 0));
    return {
      key: input.key || 'custom',
      label_he: input.label_he || (def ? def.label_he : input.key || 'הנחה'),
      label_en: input.label_en || (def ? def.label_en : input.key || 'Discount'),
      regulation: input.regulation || (def ? def.regulation : undefined),
      rate,
      sqmCap: input.sqmCap != null ? input.sqmCap : (def ? def.sqmCeiling : null),
      citation: input.citation || (def ? def.citation : undefined),
      reason_he: input.reason_he,
      reason_en: input.reason_en,
    };
  }
  return null;
}

/**
 * Apply a discount entry with sqm-cap logic. Returns the chargeable amount
 * BEFORE discount for the capped portion and the uncapped portion, plus
 * effective savings. Used by computeArnonaCharge.
 */
function applyDiscountWithCap(totalSqm, ratePerSqm, entry) {
  const sqm = Math.max(0, totalSqm);
  const cap = entry.sqmCap != null ? Math.max(0, entry.sqmCap) : Infinity;
  const cappedSqm = Math.min(sqm, cap);
  const uncappedSqm = Math.max(0, sqm - cap);

  const baseCapped = cappedSqm * ratePerSqm;
  const baseUncapped = uncappedSqm * ratePerSqm;
  const saving = baseCapped * entry.rate;

  return {
    cappedSqm,
    uncappedSqm,
    baseCapped: round2(baseCapped),
    baseUncapped: round2(baseUncapped),
    saving: round2(saving),
    effectiveRate: entry.rate,
  };
}

// ═══════════════════════════════════════════════════════════════
// Stateless computation core
// ═══════════════════════════════════════════════════════════════

/**
 * computeArnonaCharge — stateless core charge calculation.
 *
 * @param {Object} params
 * @param {number} params.sqm                     — property area
 * @param {Object} params.classification          — {propertyType, ratePerSqmPerYear, zoneCode?, municipality?}
 * @param {number} params.year                    — tax year (e.g. 2026)
 * @param {Array}  [params.discounts]             — list of discount entries (string key, object, or number)
 * @param {Object} [params.schedule]              — {type: 'annual'|'bimonthly'|'monthly', earlyPaymentDiscountRate?}
 * @returns {Object} deeply structured charge breakdown
 */
function computeArnonaCharge(params) {
  if (!params || typeof params !== 'object') throw new TypeError('params required');
  const { sqm, classification, year } = params;
  if (!isNonNegativeFinite(sqm)) {
    throw new RangeError(`sqm must be a non-negative finite number — got ${sqm}`);
  }
  if (!classification || typeof classification !== 'object') {
    throw new TypeError('classification required');
  }
  const rate = Number(classification.ratePerSqmPerYear);
  if (!isNonNegativeFinite(rate)) {
    throw new RangeError('classification.ratePerSqmPerYear must be a non-negative number');
  }
  if (classification.propertyType && !VALID_PROPERTY_TYPES.includes(classification.propertyType)) {
    throw new RangeError(`unknown propertyType: ${classification.propertyType}`);
  }
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 1900 || year > 3000) {
    throw new RangeError('year must be an integer');
  }

  // Step 1 — gross
  const grossAnnual = round2(sqm * rate);

  // Step 2 — resolve and stack social discounts
  const discountEntries = [];
  for (const d of params.discounts || []) {
    const resolved = resolveDiscountEntry(d);
    if (resolved) discountEntries.push(resolved);
  }

  // Step 3 — apply each discount with sqm cap
  let totalSaving = 0;
  const discountDetails = [];
  for (const entry of discountEntries) {
    const applied = applyDiscountWithCap(sqm, rate, entry);
    totalSaving += applied.saving;
    discountDetails.push(Object.freeze({
      key: entry.key,
      label_he: entry.label_he,
      label_en: entry.label_en,
      regulation: entry.regulation,
      rate: entry.rate,
      sqmCap: entry.sqmCap,
      cappedSqm: applied.cappedSqm,
      uncappedSqm: applied.uncappedSqm,
      baseCapped: applied.baseCapped,
      baseUncapped: applied.baseUncapped,
      saving: applied.saving,
      citation: entry.citation,
    }));
  }

  // Combined effective rate (multiplicative) — used for reporting, not arithmetic,
  // because discounts can have different sqm caps.
  const combinedRate = combineDiscounts(discountEntries);

  const netAfterSocial = round2(Math.max(0, grossAnnual - totalSaving));

  // Step 4 — payment schedule + early-payment discount
  const scheduleType = (params.schedule && params.schedule.type) || PAYMENT_SCHEDULES.BIMONTHLY;
  if (!VALID_SCHEDULES.includes(scheduleType)) {
    throw new RangeError(`unknown schedule: ${scheduleType}`);
  }

  let earlyPaymentRate = 0;
  let annualLumpSum = netAfterSocial;
  if (scheduleType === PAYMENT_SCHEDULES.ANNUAL) {
    earlyPaymentRate = clampRate(
      params.schedule && params.schedule.earlyPaymentDiscountRate != null
        ? params.schedule.earlyPaymentDiscountRate
        : EARLY_PAYMENT_DISCOUNT.DEFAULT,
    );
    if (earlyPaymentRate < EARLY_PAYMENT_DISCOUNT.MIN || earlyPaymentRate > EARLY_PAYMENT_DISCOUNT.MAX) {
      // allow but flag — still apply what was given
    }
    annualLumpSum = round2(netAfterSocial * (1 - earlyPaymentRate));
  }

  const installments = buildInstallments({
    netAfterSocial,
    annualLumpSum,
    scheduleType,
    year,
  });

  // Step 5 — assemble
  return Object.freeze({
    input: Object.freeze({
      sqm,
      year,
      propertyType: classification.propertyType,
      ratePerSqmPerYear: rate,
      zoneCode: classification.zoneCode || null,
      municipality: classification.municipality || null,
    }),
    gross: Object.freeze({
      annual: grossAnnual,
      perSqm: rate,
      sqm,
    }),
    discounts: Object.freeze({
      entries: Object.freeze(discountDetails),
      totalSaving: round2(totalSaving),
      combinedRate,
    }),
    net: Object.freeze({
      afterSocial: netAfterSocial,
      annualLumpSum,
      earlyPaymentRate,
    }),
    schedule: Object.freeze({
      type: scheduleType,
      installments: Object.freeze(installments),
      count: installments.length,
    }),
    meta: Object.freeze({
      engine: 'arnona-tracker',
      version: '1.0.0',
      agent: 'Y-054',
      computedAt: new Date().toISOString(),
      currency: 'ILS',
      citations: Object.freeze([LAW_CITATIONS.HESDARIM_7, LAW_CITATIONS.HESDARIM_8]),
    }),
  });
}

/**
 * Build the installment schedule. Annual → 1 installment. Bi-monthly → 6
 * installments on the 1st of odd months. Monthly → 12 installments on the
 * 1st of each month.
 */
function buildInstallments({ netAfterSocial, annualLumpSum, scheduleType, year }) {
  if (scheduleType === PAYMENT_SCHEDULES.ANNUAL) {
    return [Object.freeze({
      index: 1,
      period: 'annual',
      label_he: 'תשלום חד פעמי',
      label_en: 'Annual lump-sum',
      dueDate: `${year}-01-31`,
      amount: round2(annualLumpSum),
    })];
  }
  if (scheduleType === PAYMENT_SCHEDULES.BIMONTHLY) {
    // Months: Jan, Mar, May, Jul, Sep, Nov — standard reshut cycle
    const months = [1, 3, 5, 7, 9, 11];
    const per = round2(netAfterSocial / 6);
    const list = [];
    let running = 0;
    for (let i = 0; i < 6; i++) {
      const m = months[i];
      const amt = i === 5 ? round2(netAfterSocial - running) : per; // last absorbs rounding
      running += amt;
      list.push(Object.freeze({
        index: i + 1,
        period: `${year}-${String(m).padStart(2, '0')}`,
        label_he: `תשלום דו-חודשי ${i + 1}/6`,
        label_en: `Bi-monthly installment ${i + 1}/6`,
        dueDate: `${year}-${String(m).padStart(2, '0')}-01`,
        amount: amt,
      }));
    }
    return list;
  }
  if (scheduleType === PAYMENT_SCHEDULES.MONTHLY) {
    const per = round2(netAfterSocial / 12);
    const list = [];
    let running = 0;
    for (let i = 0; i < 12; i++) {
      const m = i + 1;
      const amt = i === 11 ? round2(netAfterSocial - running) : per;
      running += amt;
      list.push(Object.freeze({
        index: i + 1,
        period: `${year}-${String(m).padStart(2, '0')}`,
        label_he: `תשלום חודשי ${i + 1}/12`,
        label_en: `Monthly installment ${i + 1}/12`,
        dueDate: `${year}-${String(m).padStart(2, '0')}-01`,
        amount: amt,
      }));
    }
    return list;
  }
  return [];
}

// ═══════════════════════════════════════════════════════════════
// Class — ArnonaTracker (stateful, instance-per-portfolio)
// ═══════════════════════════════════════════════════════════════

class ArnonaTracker {
  /**
   * @param {Object} [options]
   * @param {Object.<string, Object>} [options.customMunicipalityCatalog]
   *        Merge additional municipalities on top of the embedded catalog
   *        (e.g. for non-top-30 reshuyot). Keys override embedded entries.
   * @param {Object.<string, Object>} [options.customDiscountCatalog]
   *        Additional / overriding discount definitions.
   * @param {Function} [options.now] — test shim; defaults to () => new Date()
   */
  constructor(options = {}) {
    this.options = Object.freeze(Object.assign({}, options));

    /** municipalityKey → zoneCode → propertyType → {ratePerSqmPerYear, defined} */
    this._classifications = new Map();

    /** propertyId → ordered list of payment events (additive; never mutated) */
    this._payments = new Map();

    /** propertyId → latest computed charge (cache for overdue checks) */
    this._charges = new Map();

    /** propertyId → appeal history */
    this._appeals = new Map();

    this._now = typeof options.now === 'function' ? options.now : () => new Date();
  }

  // ─────────────────────────────────────────────────
  // Classification — defineClassification
  // ─────────────────────────────────────────────────

  /**
   * Define (or upgrade) a classification row. The house rule is no deletion:
   * calling defineClassification twice for the same (municipality, zoneCode,
   * propertyType) appends a new revision. The most recent revision wins for
   * lookups but history remains inside the revision array.
   *
   * @param {Object} params
   * @param {string} params.municipality — municipality key (e.g. 'tel-aviv-yafo')
   * @param {string} params.zoneCode     — zone code (e.g. 'A', 'B', 'C')
   * @param {string} params.propertyType — one of PROPERTY_TYPES values
   * @param {number} params.ratePerSqmPerYear
   * @param {number} [params.year]       — applicable year
   * @param {Object} [params.meta]       — free-form meta (source, publishedAt, ...)
   * @returns {Object} the frozen classification record
   */
  defineClassification(params) {
    if (!params || typeof params !== 'object') throw new TypeError('params required');
    const { municipality, zoneCode, propertyType, ratePerSqmPerYear } = params;
    if (typeof municipality !== 'string' || !municipality) {
      throw new TypeError('municipality is required (string)');
    }
    if (typeof zoneCode !== 'string' || !zoneCode) {
      throw new TypeError('zoneCode is required (string)');
    }
    if (!VALID_PROPERTY_TYPES.includes(propertyType)) {
      throw new RangeError(`propertyType must be one of ${VALID_PROPERTY_TYPES.join(', ')}`);
    }
    if (!isNonNegativeFinite(ratePerSqmPerYear)) {
      throw new RangeError('ratePerSqmPerYear must be a non-negative finite number');
    }

    let muniMap = this._classifications.get(municipality);
    if (!muniMap) {
      muniMap = new Map();
      this._classifications.set(municipality, muniMap);
    }
    let zoneMap = muniMap.get(zoneCode);
    if (!zoneMap) {
      zoneMap = new Map();
      muniMap.set(zoneCode, zoneMap);
    }
    let revisions = zoneMap.get(propertyType);
    if (!revisions) {
      revisions = [];
      zoneMap.set(propertyType, revisions);
    }

    const record = Object.freeze({
      municipality,
      zoneCode,
      propertyType,
      ratePerSqmPerYear: Number(ratePerSqmPerYear),
      year: params.year || new Date().getUTCFullYear(),
      meta: Object.freeze(Object.assign({}, params.meta || {})),
      revisionIndex: revisions.length,
      definedAt: this._now().toISOString(),
    });
    revisions.push(record);
    return record;
  }

  /**
   * Look up a classification. Returns the latest revision or, failing that,
   * falls back to the embedded MUNICIPALITY_CATALOG_2026.
   */
  lookupClassification({ municipality, zoneCode, propertyType, year }) {
    const muniMap = this._classifications.get(municipality);
    if (muniMap) {
      const zoneMap = muniMap.get(zoneCode);
      if (zoneMap) {
        const revisions = zoneMap.get(propertyType);
        if (revisions && revisions.length > 0) {
          return revisions[revisions.length - 1];
        }
      }
    }
    // Fallback to embedded catalog
    const custom = this.options.customMunicipalityCatalog || {};
    const catalog = Object.assign({}, MUNICIPALITY_CATALOG_2026, custom);
    const muni = catalog[municipality];
    if (!muni) return null;
    const altRates = zoneCode !== muni.mainZone && muni.altZones && muni.altZones[zoneCode]
      ? muni.altZones[zoneCode] : null;
    const rates = altRates || muni.rates;
    const rate = rates[propertyType] != null ? rates[propertyType] : muni.rates[propertyType];
    if (rate == null) return null;
    return Object.freeze({
      municipality,
      zoneCode: zoneCode || muni.mainZone,
      propertyType,
      ratePerSqmPerYear: rate,
      year: year || new Date().getUTCFullYear(),
      source: 'catalog_2026',
      meta: Object.freeze({ name_he: muni.name_he, name_en: muni.name_en }),
    });
  }

  // ─────────────────────────────────────────────────
  // Compute
  // ─────────────────────────────────────────────────

  /**
   * Compute arnona for a property. If classification is a string
   * ('municipality:zone:type') we resolve it via lookupClassification.
   * Otherwise the caller passes a concrete classification object.
   *
   * @param {Object} params
   * @param {string} params.propertyId
   * @param {number} params.sqm
   * @param {Object|string} params.classification
   * @param {number} params.year
   * @param {Array}  [params.discounts]
   * @param {Object} [params.schedule]  — {type, earlyPaymentDiscountRate?}
   */
  computeArnona(params) {
    if (!params || typeof params !== 'object') throw new TypeError('params required');
    const { propertyId, sqm, year } = params;
    if (typeof propertyId !== 'string' || !propertyId) {
      throw new TypeError('propertyId is required (string)');
    }

    let classification = params.classification;
    if (typeof classification === 'string') {
      const parts = classification.split(':');
      if (parts.length !== 3) {
        throw new RangeError('classification string must be "municipality:zone:propertyType"');
      }
      const [municipality, zoneCode, propertyType] = parts;
      classification = this.lookupClassification({ municipality, zoneCode, propertyType, year });
      if (!classification) {
        throw new RangeError(`no classification found for ${params.classification}`);
      }
    }

    const charge = computeArnonaCharge({
      sqm,
      classification,
      year,
      discounts: params.discounts,
      schedule: params.schedule,
    });

    // Cache under propertyId
    const cachedEntry = Object.freeze({
      propertyId,
      year,
      charge,
      cachedAt: this._now().toISOString(),
    });
    const list = this._charges.get(propertyId) || [];
    list.push(cachedEntry);
    this._charges.set(propertyId, list);

    return Object.freeze(Object.assign({}, charge, { propertyId }));
  }

  // ─────────────────────────────────────────────────
  // Payment registration
  // ─────────────────────────────────────────────────

  /**
   * Register a payment against a property and period. Additive only — the
   * ledger never mutates prior entries.
   *
   * @param {string} propertyId
   * @param {string} period       — e.g. '2026-01' or 'annual'
   * @param {number} amount       — ILS
   * @param {string} [method]     — 'cash' | 'credit_card' | 'bank_transfer' | 'check' | 'direct_debit'
   * @param {Object} [options]    — {paidAt?, reference?}
   * @returns {Object} the frozen payment record
   */
  registerPayment(propertyId, period, amount, method, options = {}) {
    if (typeof propertyId !== 'string' || !propertyId) {
      throw new TypeError('propertyId is required');
    }
    if (typeof period !== 'string' || !period) {
      throw new TypeError('period is required');
    }
    if (!isNonNegativeFinite(amount)) {
      throw new RangeError('amount must be a non-negative number');
    }
    const allowedMethods = ['cash', 'credit_card', 'bank_transfer', 'check', 'direct_debit', 'standing_order'];
    const usedMethod = method || 'bank_transfer';
    if (!allowedMethods.includes(usedMethod)) {
      throw new RangeError(`unknown payment method: ${usedMethod}`);
    }

    const list = this._payments.get(propertyId) || [];
    const record = Object.freeze({
      propertyId,
      period,
      amount: round2(amount),
      method: usedMethod,
      paidAt: options.paidAt || this._now().toISOString(),
      reference: options.reference || null,
      sequence: list.length + 1,
    });
    list.push(record);
    this._payments.set(propertyId, list);
    return record;
  }

  /** All payments for a property (chronological, frozen) */
  getPayments(propertyId) {
    const list = this._payments.get(propertyId) || [];
    return Object.freeze(list.slice());
  }

  // ─────────────────────────────────────────────────
  // Appeal — השגה
  // ─────────────────────────────────────────────────

  /**
   * Generate a full השגה (arnona appeal) form. Accepts a ground key (or array)
   * and caller-supplied evidence; returns a bilingual structured form ready
   * for delivery to מנהל הארנונה of the reshut.
   *
   * @param {Object} params
   * @param {string} params.propertyId
   * @param {string|string[]} params.grounds     — APPEAL_GROUNDS keys
   * @param {Array|Object} [params.evidence]     — free-form evidence list
   * @param {Object} [params.holder]             — {name, id, address, phone, email}
   * @param {string} [params.year]
   * @param {string} [params.contestedSqm]
   * @param {string} [params.filedAt]
   * @returns {Object} the frozen appeal record
   */
  generateAppeal(params) {
    if (!params || typeof params !== 'object') throw new TypeError('params required');
    const { propertyId } = params;
    if (typeof propertyId !== 'string' || !propertyId) {
      throw new TypeError('propertyId is required');
    }

    const groundsRaw = Array.isArray(params.grounds) ? params.grounds : (params.grounds ? [params.grounds] : []);
    if (groundsRaw.length === 0) {
      throw new RangeError('at least one ground is required');
    }
    const grounds = [];
    const unknown = [];
    for (const g of groundsRaw) {
      if (APPEAL_GROUNDS[g]) grounds.push(APPEAL_GROUNDS[g]);
      else unknown.push(g);
    }
    if (grounds.length === 0) {
      throw new RangeError(`no valid grounds: ${unknown.join(', ')} — valid: ${VALID_APPEAL_GROUNDS.join(', ')}`);
    }

    const evidenceList = [];
    const evArr = Array.isArray(params.evidence) ? params.evidence : (params.evidence ? [params.evidence] : []);
    for (const ev of evArr) {
      if (typeof ev === 'string') {
        evidenceList.push(Object.freeze({ type: 'text', description: ev }));
      } else if (ev && typeof ev === 'object') {
        evidenceList.push(Object.freeze({
          type: ev.type || 'document',
          description: ev.description || '',
          filename: ev.filename || null,
          url: ev.url || null,
          uploadedAt: ev.uploadedAt || null,
        }));
      }
    }

    const filedAt = params.filedAt || this._now().toISOString();
    const appealId = `APP-${propertyId}-${Date.now()}`;

    const record = Object.freeze({
      appealId,
      propertyId,
      year: params.year || new Date().getUTCFullYear(),
      filedAt,
      holder: Object.freeze(Object.assign({}, params.holder || {})),
      grounds: Object.freeze(grounds.map((g) => frozenCopy(g))),
      evidence: Object.freeze(evidenceList),
      contestedSqm: params.contestedSqm != null ? Number(params.contestedSqm) : null,
      requestedRelief: params.requestedRelief || null,
      status: 'filed',                             // filed | under_review | decided | dismissed | upheld
      legalBasis: Object.freeze({
        primary: LAW_CITATIONS.APPEAL_LAW_3,
        appealBody: LAW_CITATIONS.APPEAL_LAW_4,
      }),
      form: Object.freeze({
        title_he: 'טופס השגה על קביעת ארנונה כללית',
        title_en: 'Appeal on General Arnona Assessment',
        addressedTo_he: 'לכבוד מנהל הארנונה, הרשות המקומית',
        addressedTo_en: 'To: Arnona Director, Local Authority',
        declaration_he:
          'הריני להגיש בזאת השגה על קביעת הארנונה לנכס שבנדון, מהעילות המפורטות לעיל, בהתאם לסעיף 3 לחוק הרשויות המקומיות (ערר על קביעת ארנונה כללית), התשל"ו-1976.',
        declaration_en:
          'I hereby submit this appeal on the arnona assessment of the above property, on the grounds detailed above, under Section 3 of the Local Authorities (Arnona Appeal) Law, 1976.',
        deadlineNote_he:
          'השגה זו מוגשת בתוך 90 ימים ממועד קבלת הודעת התשלום.',
        deadlineNote_en:
          'This appeal is filed within 90 days of receiving the payment notice.',
      }),
      meta: Object.freeze({
        engine: 'arnona-tracker',
        agent: 'Y-054',
        version: '1.0.0',
      }),
    });

    const list = this._appeals.get(propertyId) || [];
    list.push(record);
    this._appeals.set(propertyId, list);
    return record;
  }

  /** All appeals on record for a property */
  getAppeals(propertyId) {
    const list = this._appeals.get(propertyId) || [];
    return Object.freeze(list.slice());
  }

  // ─────────────────────────────────────────────────
  // Municipality catalog
  // ─────────────────────────────────────────────────

  /**
   * Return a combined frozen catalog (embedded 2026 rates + any custom
   * overrides set at construction time). Useful for UIs, autocomplete, etc.
   */
  municipalityCatalog() {
    const custom = this.options.customMunicipalityCatalog || {};
    const merged = {};
    for (const [k, v] of Object.entries(MUNICIPALITY_CATALOG_2026)) merged[k] = v;
    for (const [k, v] of Object.entries(custom)) merged[k] = Object.freeze(Object.assign({}, v));
    return Object.freeze(merged);
  }

  /** Convenience — list municipality keys */
  listMunicipalities() {
    return Object.freeze(Object.keys(this.municipalityCatalog()));
  }

  // ─────────────────────────────────────────────────
  // Overdue alert
  // ─────────────────────────────────────────────────

  /**
   * Flag installments that are overdue beyond the grace period, for the
   * latest charge cached per property. Does NOT mutate state.
   *
   * @param {number} [graceDays=30]
   * @param {string} [asOfIso]   — reference date; defaults to now
   * @returns {Array} frozen overdue records with penalty interest
   */
  alertOverdue(graceDays, asOfIso) {
    const grace = typeof graceDays === 'number' && graceDays >= 0
      ? graceDays
      : OVERDUE_INTEREST.DEFAULT_GRACE_DAYS;
    const asOfDate = asOfIso ? parseDate(asOfIso) : this._now();
    const asOf = asOfDate.toISOString().slice(0, 10);
    const results = [];

    for (const [propertyId, chargeList] of this._charges.entries()) {
      if (!chargeList.length) continue;
      const latest = chargeList[chargeList.length - 1].charge;
      const payments = this._payments.get(propertyId) || [];

      for (const inst of latest.schedule.installments || []) {
        const dueDate = inst.dueDate;
        const daysLate = daysBetween(dueDate, asOf);
        if (daysLate <= grace) continue;

        const paid = payments
          .filter((p) => p.period === inst.period)
          .reduce((s, p) => s + p.amount, 0);
        const outstanding = round2(Math.max(0, inst.amount - paid));
        if (outstanding <= 0) continue;

        // Penalty = outstanding × monthlyRate × full-months past grace
        const monthsLate = Math.max(0, (daysLate - grace) / 30);
        const penalty = round2(outstanding * OVERDUE_INTEREST.MONTHLY_RATE * monthsLate);
        const totalDue = round2(outstanding + penalty);

        results.push(Object.freeze({
          propertyId,
          period: inst.period,
          dueDate,
          daysLate,
          graceDays: grace,
          originalAmount: inst.amount,
          paid: round2(paid),
          outstanding,
          penalty,
          totalDue,
          label_he: `פיגור בתשלום — ${inst.label_he}`,
          label_en: `Overdue — ${inst.label_en}`,
          interestRate: OVERDUE_INTEREST.MONTHLY_RATE,
        }));
      }
    }
    return Object.freeze(results);
  }

  // ─────────────────────────────────────────────────
  // Utilities (no state mutation)
  // ─────────────────────────────────────────────────

  /** List every discount this engine recognises */
  listDiscountKeys() {
    return Object.freeze([...VALID_DISCOUNT_KEYS]);
  }

  /** List every property type enum value */
  listPropertyTypes() {
    return Object.freeze([...VALID_PROPERTY_TYPES]);
  }

  /** List every payment schedule */
  listSchedules() {
    return Object.freeze([...VALID_SCHEDULES]);
  }
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  ArnonaTracker,
  computeArnonaCharge,
  MUNICIPALITY_CATALOG_2026,
  SOCIAL_DISCOUNT_CATALOG,
  PROPERTY_TYPES,
  PAYMENT_SCHEDULES,
  APPEAL_GROUNDS,
  LAW_CITATIONS,
  HEBREW_GLOSSARY,
  EARLY_PAYMENT_DISCOUNT,
  OVERDUE_INTEREST,
  _internals: Object.freeze({
    round2,
    clampRate,
    combineDiscounts,
    resolveDiscountEntry,
    applyDiscountWithCap,
    buildInstallments,
    parseDate,
    daysBetween,
    isNonNegativeFinite,
  }),
};
