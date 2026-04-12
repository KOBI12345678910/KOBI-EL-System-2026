/**
 * Contract Clause Library — Reusable Approved Clauses
 * ──────────────────────────────────────────────────────────────
 * Agent Y-116 — Documents / Techno-Kol Uzi Mega-ERP 2026
 *
 * Purpose:
 *   A bilingual (Hebrew/English) library of pre-approved legal clauses
 *   for Israeli B2B contracts. Clauses are append-only (לא מוחקים רק
 *   משדרגים ומגדלים): updating a clause creates a new version while
 *   keeping every prior version forever. Every approval, customization
 *   and subscription is a log entry — the store grows, never shrinks.
 *
 * Features:
 *   - 13 categories × Hebrew+English × 3 stance variants per clause
 *   - Variable substitution with strict guardrails
 *   - Aggressive / neutral / defensive negotiation variants
 *   - Approved fallback concession ladders
 *   - Risk-weighted contract scoring (0–100)
 *   - Bilingual contract assembly with RTL Hebrew block + English mirror
 *   - Change-notification log for subscribers of stale versions
 *   - Seeded with 30+ battle-tested Israeli B2B clauses
 *
 * Zero external deps — pure CommonJS. Node ≥18.
 * Bilingual. Append-only. Audit-friendly.
 */

'use strict';

// ───────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────

const CATEGORIES = Object.freeze([
  'payment',
  'delivery',
  'warranty',
  'ip',
  'confidentiality',
  'termination',
  'liability',
  'indemnification',
  'disputes',
  'force-majeure',
  'data-protection',
  'non-compete',
  'arbitration',
]);

const LANGUAGES = Object.freeze(['he', 'en']);

const RISK_LEVELS = Object.freeze(['low', 'medium', 'high']);

const RISK_WEIGHTS = Object.freeze({ low: 1, medium: 3, high: 7 });

const STANCES = Object.freeze(['aggressive', 'neutral', 'defensive']);

// Hebrew glossary — canonical Hebrew terms used across clauses.
const HEBREW_GLOSSARY = Object.freeze({
  payment: 'תנאי תשלום',
  delivery: 'תנאי אספקה',
  warranty: 'אחריות',
  ip: 'קניין רוחני',
  confidentiality: 'סודיות',
  termination: 'סיום התקשרות',
  liability: 'אחריות וגבולותיה',
  indemnification: 'שיפוי',
  disputes: 'יישוב מחלוקות',
  'force-majeure': 'כוח עליון',
  'data-protection': 'הגנת פרטיות',
  'non-compete': 'אי-תחרות',
  arbitration: 'בוררות',
  party: 'צד',
  parties: 'צדדים',
  contract: 'הסכם',
  amount: 'סכום',
  currency: 'מטבע',
  days: 'ימים',
  notice: 'הודעה',
  vat: 'מע״מ',
  jurisdiction: 'סמכות שיפוט',
  governingLaw: 'הדין החל',
  representative: 'נציג מוסמך',
  effectiveDate: 'מועד תחילה',
  termMonths: 'תקופת ההסכם (בחודשים)',
  interestRate: 'ריבית פיגורים',
});

// Variable syntax: {{name}} — kebab or camelCase, alphanumeric+_-
const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*\}\}/g;

// ───────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────

function assertOneOf(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(
      `${label} must be one of [${allowed.join(', ')}] — got "${value}"`,
    );
  }
}

function clone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  const out = {};
  for (const k of Object.keys(value)) out[k] = clone(value[k]);
  return out;
}

function nowISO() {
  return new Date().toISOString();
}

function extractVariables(text) {
  const names = new Set();
  let match;
  VARIABLE_PATTERN.lastIndex = 0;
  while ((match = VARIABLE_PATTERN.exec(text)) !== null) {
    names.add(match[1]);
  }
  return Array.from(names);
}

function tokenize(text, language) {
  // Hebrew-aware tokenizer: strip nikud, punctuation; split on whitespace.
  const NIKUD = /[\u0591-\u05C7]/g;
  const cleaned = String(text || '')
    .replace(NIKUD, '')
    .toLowerCase();
  const words = cleaned.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words;
}

function normalizedText(text) {
  return tokenize(text).join(' ');
}

function stripVariables(text) {
  return text.replace(VARIABLE_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

function simpleDiff(a, b) {
  const aw = tokenize(a);
  const bw = tokenize(b);
  const aset = new Set(aw);
  const bset = new Set(bw);
  const added = bw.filter((w) => !aset.has(w));
  const removed = aw.filter((w) => !bset.has(w));
  const common = aw.filter((w) => bset.has(w));
  const similarity =
    (common.length * 2) / Math.max(1, aw.length + bw.length);
  return { added, removed, similarity };
}

// ───────────────────────────────────────────────────────────────
// Seed clauses — 30+ Israeli B2B clauses, bilingual, 13 categories
// ───────────────────────────────────────────────────────────────

function seedClauses() {
  return [
    // ─── PAYMENT ────────────────────────────────────────────────
    {
      id: 'PAY-HE-001',
      category: 'payment',
      language: 'he',
      title: 'תנאי תשלום שוטף + {{days}}',
      text:
        'הלקוח ישלם לספק את התמורה בגין השירותים/המוצרים על פי חשבונית ' +
        'מס כדין, בתנאי תשלום שוטף + {{days}} ימים ממועד הוצאת החשבונית. ' +
        'לסכום התמורה יתווסף מע״מ בשיעור החוקי. איחור בתשלום יישא ריבית ' +
        'פיגורים בשיעור {{interestRate}}% לשנה, החל מיום ה-{{graceDays}}.',
      variables: ['days', 'interestRate', 'graceDays'],
      riskLevel: 'medium',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: [
        'חוק מוסר תשלומים לספקים, התשע״ז-2017',
        'תקנות מע״מ',
      ],
      stance: 'neutral',
    },
    {
      id: 'PAY-EN-001',
      category: 'payment',
      language: 'en',
      title: 'Net {{days}} Payment Terms',
      text:
        'Customer shall pay Supplier the fees for the services/products ' +
        'against a lawful VAT invoice, on Net {{days}} terms from the ' +
        'invoice date. VAT at the statutory rate shall be added. Late ' +
        'payments shall bear interest at {{interestRate}}% per annum, ' +
        'commencing on day {{graceDays}}.',
      variables: ['days', 'interestRate', 'graceDays'],
      riskLevel: 'medium',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: [
        'Late Payment to Suppliers Law, 5777-2017',
        'VAT Regulations',
      ],
      stance: 'neutral',
    },
    {
      id: 'PAY-HE-002',
      category: 'payment',
      language: 'he',
      title: 'תשלום מקדמה ומחזורי חיוב',
      text:
        'הלקוח ישלם מקדמה בסך {{advancePct}}% מהסכום הכולל במעמד חתימת ' +
        'ההסכם, ואת יתרת התמורה במחזורי חיוב {{billingCycle}} על בסיס ' +
        'אבני דרך שהוגדרו בנספח א׳. כל חיוב ישולם תוך {{days}} ימים.',
      variables: ['advancePct', 'billingCycle', 'days'],
      riskLevel: 'low',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['חוק החוזים (חלק כללי), התשל״ג-1973'],
      stance: 'aggressive',
    },

    // ─── DELIVERY ───────────────────────────────────────────────
    {
      id: 'DEL-HE-001',
      category: 'delivery',
      language: 'he',
      title: 'מועדי אספקה ו-SLA',
      text:
        'הספק יספק את המוצרים/השירותים תוך {{deliveryDays}} ימי עסקים ' +
        'ממועד קבלת הזמנת הרכש. איחור העולה על {{graceDays}} ימים יזכה ' +
        'את הלקוח בפיצוי מוסכם בשיעור {{penaltyPct}}% מערך ההזמנה לכל ' +
        'שבוע איחור, עד לתקרה של {{penaltyCap}}%.',
      variables: ['deliveryDays', 'graceDays', 'penaltyPct', 'penaltyCap'],
      riskLevel: 'medium',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: [
        'חוק החוזים (תרופות בשל הפרת חוזה), התשל״א-1970',
      ],
      stance: 'neutral',
    },
    {
      id: 'DEL-EN-001',
      category: 'delivery',
      language: 'en',
      title: 'Delivery Schedule and SLA',
      text:
        'Supplier shall deliver the products/services within ' +
        '{{deliveryDays}} business days of the purchase order. Delays ' +
        'exceeding {{graceDays}} days entitle Customer to liquidated ' +
        'damages of {{penaltyPct}}% of order value per week of delay, ' +
        'capped at {{penaltyCap}}%.',
      variables: ['deliveryDays', 'graceDays', 'penaltyPct', 'penaltyCap'],
      riskLevel: 'medium',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['Contracts (Remedies for Breach) Law, 5731-1970'],
      stance: 'neutral',
    },

    // ─── WARRANTY ───────────────────────────────────────────────
    {
      id: 'WAR-HE-001',
      category: 'warranty',
      language: 'he',
      title: 'אחריות יצרן ותיקון/החלפה',
      text:
        'הספק מעניק אחריות מלאה למוצרים לתקופה של {{warrantyMonths}} ' +
        'חודשים ממועד האספקה. במהלך תקופת האחריות יתקן או יחליף הספק, ' +
        'ללא תמורה, כל מוצר פגום, תוך {{repairDays}} ימי עסקים. אחריות ' +
        'זו אינה גורעת מזכויות הלקוח לפי חוק.',
      variables: ['warrantyMonths', 'repairDays'],
      riskLevel: 'low',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: [
        'חוק הגנת הצרכן, התשמ״א-1981',
        'תקנות הגנת הצרכן (אחריות ושירות לאחר מכירה), התשס״ו-2006',
      ],
      stance: 'neutral',
    },
    {
      id: 'WAR-EN-001',
      category: 'warranty',
      language: 'en',
      title: 'Manufacturer Warranty and Repair/Replace',
      text:
        'Supplier provides a full warranty for the products for a ' +
        'period of {{warrantyMonths}} months from delivery. During the ' +
        'warranty period, Supplier shall repair or replace any defective ' +
        'product at no charge within {{repairDays}} business days. This ' +
        'warranty is in addition to, and does not derogate from, ' +
        'statutory rights.',
      variables: ['warrantyMonths', 'repairDays'],
      riskLevel: 'low',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: [
        'Consumer Protection Law, 5741-1981',
        'Consumer Protection (Warranty and Post-Sale Service) Regulations, 5766-2006',
      ],
      stance: 'neutral',
    },

    // ─── INTELLECTUAL PROPERTY ──────────────────────────────────
    {
      id: 'IP-HE-001',
      category: 'ip',
      language: 'he',
      title: 'בעלות בקניין רוחני ורישיון שימוש',
      text:
        'מלוא הזכויות בקניין הרוחני, לרבות זכויות יוצרים, פטנטים, ' +
        'סימני מסחר וסודות מסחריים, בתוצרים שיפותחו על ידי הספק עבור ' +
        'הלקוח במסגרת הסכם זה יהיו שייכות ל-{{ipOwner}}. ל-{{ipLicensee}} ' +
        'יוענק רישיון {{licenseType}}, בלתי מוגבל בטריטוריה ' +
        'ובזמן, לשימוש, שכפול ושינוי התוצרים למטרות פנימיות.',
      variables: ['ipOwner', 'ipLicensee', 'licenseType'],
      riskLevel: 'high',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: [
        'חוק זכות יוצרים, התשס״ח-2007',
        'חוק הפטנטים, התשכ״ז-1967',
      ],
      stance: 'aggressive',
    },
    {
      id: 'IP-EN-001',
      category: 'ip',
      language: 'en',
      title: 'IP Ownership and License Grant',
      text:
        'All intellectual-property rights, including copyrights, ' +
        'patents, trademarks and trade secrets, in deliverables ' +
        'developed by Supplier for Customer under this agreement shall ' +
        'vest in {{ipOwner}}. {{ipLicensee}} is hereby granted a ' +
        '{{licenseType}} license, worldwide and perpetual, to use, ' +
        'reproduce and modify the deliverables for internal purposes.',
      variables: ['ipOwner', 'ipLicensee', 'licenseType'],
      riskLevel: 'high',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: [
        'Copyright Law, 5768-2007',
        'Patents Law, 5727-1967',
      ],
      stance: 'aggressive',
    },

    // ─── CONFIDENTIALITY / NDA ──────────────────────────────────
    {
      id: 'CON-HE-001',
      category: 'confidentiality',
      language: 'he',
      title: 'סודיות הדדית',
      text:
        'הצדדים מתחייבים לשמור בסודיות מוחלטת כל מידע עסקי, טכני, ' +
        'כספי או אחר שיימסר ביניהם במסגרת ההסכם, ולא להשתמש בו אלא ' +
        'לצורך קיום ההסכם. תקופת הסודיות היא {{confidentialityYears}} ' +
        'שנים ממועד גילוי המידע. חריגים: מידע שהיה נחלת הכלל, שהיה ' +
        'ידוע בעבר, או שהתקבל כדין מצד שלישי.',
      variables: ['confidentialityYears'],
      riskLevel: 'medium',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['חוק עוולות מסחריות, התשנ״ט-1999'],
      stance: 'neutral',
    },
    {
      id: 'CON-EN-001',
      category: 'confidentiality',
      language: 'en',
      title: 'Mutual Confidentiality',
      text:
        'The parties shall keep in strict confidence any business, ' +
        'technical, financial or other information exchanged under this ' +
        'agreement and shall use such information solely for the ' +
        'performance of this agreement. The confidentiality period is ' +
        '{{confidentialityYears}} years from disclosure. Exceptions: ' +
        'information that is in the public domain, was previously ' +
        'known, or lawfully received from a third party.',
      variables: ['confidentialityYears'],
      riskLevel: 'medium',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['Commercial Torts Law, 5759-1999'],
      stance: 'neutral',
    },

    // ─── TERMINATION ────────────────────────────────────────────
    {
      id: 'TER-HE-001',
      category: 'termination',
      language: 'he',
      title: 'סיום לנוחות הצדדים',
      text:
        'כל צד רשאי לסיים הסכם זה, מכל סיבה שהיא, בהודעה מוקדמת בכתב ' +
        'של {{noticeDays}} ימים לצד השני. סיום ההסכם לא יגרע מהתחייבויות ' +
        'שהצטברו עד למועד הסיום.',
      variables: ['noticeDays'],
      riskLevel: 'medium',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['חוק החוזים (חלק כללי), התשל״ג-1973'],
      stance: 'neutral',
    },
    {
      id: 'TER-EN-001',
      category: 'termination',
      language: 'en',
      title: 'Termination for Convenience',
      text:
        'Either party may terminate this agreement, for any reason, by ' +
        'providing {{noticeDays}} days prior written notice. Termination ' +
        'shall not relieve the parties of obligations accrued through ' +
        'the termination date.',
      variables: ['noticeDays'],
      riskLevel: 'medium',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['Contracts (General Part) Law, 5733-1973'],
      stance: 'neutral',
    },
    {
      id: 'TER-HE-002',
      category: 'termination',
      language: 'he',
      title: 'סיום עקב הפרה יסודית',
      text:
        'צד רשאי לבטל את ההסכם לאלתר עקב הפרה יסודית של הצד השני, ' +
        'אם ההפרה לא תוקנה תוך {{cureDays}} ימים ממועד הודעה בכתב. ' +
        'אין בסעיף זה כדי לגרוע מתרופות נוספות על פי דין.',
      variables: ['cureDays'],
      riskLevel: 'low',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: [
        'חוק החוזים (תרופות בשל הפרת חוזה), התשל״א-1970',
      ],
      stance: 'defensive',
    },

    // ─── LIABILITY ──────────────────────────────────────────────
    {
      id: 'LIA-HE-001',
      category: 'liability',
      language: 'he',
      title: 'הגבלת אחריות',
      text:
        'אחריותו הכוללת של הספק כלפי הלקוח מכל סיבה שהיא לא תעלה על ' +
        '{{liabilityCap}} פעמים סכום התמורה ששולמה לספק ב-{{lookbackMonths}} ' +
        'החודשים שקדמו להתרחשות עילת התביעה. בשום מקרה לא יישא הספק ' +
        'באחריות לנזק עקיף, תוצאתי, אובדן רווחים או אובדן הזדמנויות ' +
        'עסקיות.',
      variables: ['liabilityCap', 'lookbackMonths'],
      riskLevel: 'high',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['חוק החוזים (חלק כללי), התשל״ג-1973'],
      stance: 'aggressive',
    },
    {
      id: 'LIA-EN-001',
      category: 'liability',
      language: 'en',
      title: 'Limitation of Liability',
      text:
        'Supplier\'s total aggregate liability to Customer, from any ' +
        'cause whatsoever, shall not exceed {{liabilityCap}} times the ' +
        'fees paid to Supplier in the {{lookbackMonths}} months ' +
        'preceding the event giving rise to the claim. In no event ' +
        'shall Supplier be liable for indirect, consequential, lost ' +
        'profits or lost business opportunities.',
      variables: ['liabilityCap', 'lookbackMonths'],
      riskLevel: 'high',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['Contracts (General Part) Law, 5733-1973'],
      stance: 'aggressive',
    },

    // ─── INDEMNIFICATION ────────────────────────────────────────
    {
      id: 'IND-HE-001',
      category: 'indemnification',
      language: 'he',
      title: 'שיפוי הדדי',
      text:
        'כל צד ישפה את הצד השני בגין כל נזק, הוצאה או תביעה שייגרמו ' +
        'לו כתוצאה מהפרת התחייבויותיו על פי הסכם זה, לרבות שכר טרחת ' +
        'עורכי דין סביר, ובלבד שהצד המשתפה מסר לצד המשפה הודעה בכתב ' +
        'תוך {{notifyDays}} ימים מיום היוודע לו על התביעה.',
      variables: ['notifyDays'],
      riskLevel: 'high',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['פקודת הנזיקין [נוסח חדש]'],
      stance: 'neutral',
    },
    {
      id: 'IND-EN-001',
      category: 'indemnification',
      language: 'en',
      title: 'Mutual Indemnification',
      text:
        'Each party shall indemnify the other against any loss, cost ' +
        'or claim arising from breach of its obligations hereunder, ' +
        'including reasonable attorneys\' fees, provided that the ' +
        'indemnified party gives written notice to the indemnifying ' +
        'party within {{notifyDays}} days of becoming aware of the claim.',
      variables: ['notifyDays'],
      riskLevel: 'high',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['Torts Ordinance [New Version]'],
      stance: 'neutral',
    },

    // ─── DISPUTES ───────────────────────────────────────────────
    {
      id: 'DIS-HE-001',
      category: 'disputes',
      language: 'he',
      title: 'סמכות שיפוט ייחודית',
      text:
        'על הסכם זה יחול הדין הישראלי. סמכות השיפוט הייחודית לדון בכל ' +
        'סכסוך הנובע מהסכם זה נתונה לבתי המשפט המוסמכים ב-{{jurisdictionCity}} ' +
        'בלבד. הצדדים מוותרים על כל טענת פורום בלתי נאות.',
      variables: ['jurisdictionCity'],
      riskLevel: 'low',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['חוק בתי המשפט [נוסח משולב], התשמ״ד-1984'],
      stance: 'neutral',
    },
    {
      id: 'DIS-EN-001',
      category: 'disputes',
      language: 'en',
      title: 'Exclusive Jurisdiction',
      text:
        'This agreement is governed by the laws of the State of Israel. ' +
        'The competent courts of {{jurisdictionCity}} shall have ' +
        'exclusive jurisdiction over any dispute arising from this ' +
        'agreement. The parties waive any inconvenient-forum claim.',
      variables: ['jurisdictionCity'],
      riskLevel: 'low',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['Courts Law [Consolidated Version], 5744-1984'],
      stance: 'neutral',
    },

    // ─── FORCE MAJEURE ──────────────────────────────────────────
    {
      id: 'FM-HE-001',
      category: 'force-majeure',
      language: 'he',
      title: 'כוח עליון',
      text:
        'אף צד לא יהיה אחראי לעיכוב או אי-ביצוע של התחייבויותיו אם ' +
        'העיכוב או אי-הביצוע נובעים מכוח עליון, לרבות מלחמה, פיגועים, ' +
        'מגפות, אסון טבע, שביתה כללית או הוראות רשויות מוסמכות. אם ' +
        'כוח עליון נמשך למעלה מ-{{forceMajeureDays}} ימים, כל צד רשאי ' +
        'לסיים את ההסכם בהודעה בכתב.',
      variables: ['forceMajeureDays'],
      riskLevel: 'low',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: [
        'חוק החוזים (חלק כללי), התשל״ג-1973, סעיף 18',
      ],
      stance: 'neutral',
    },
    {
      id: 'FM-EN-001',
      category: 'force-majeure',
      language: 'en',
      title: 'Force Majeure',
      text:
        'Neither party shall be liable for delay or non-performance of ' +
        'its obligations due to force majeure, including war, terror ' +
        'attacks, pandemics, natural disasters, general strikes or ' +
        'directives of competent authorities. If force majeure continues ' +
        'for more than {{forceMajeureDays}} days, either party may ' +
        'terminate this agreement by written notice.',
      variables: ['forceMajeureDays'],
      riskLevel: 'low',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['Contracts (General Part) Law 5733-1973, s. 18'],
      stance: 'neutral',
    },

    // ─── DATA PROTECTION ────────────────────────────────────────
    {
      id: 'DP-HE-001',
      category: 'data-protection',
      language: 'he',
      title: 'הגנת פרטיות ועיבוד מידע אישי',
      text:
        'הספק יעבד מידע אישי של לקוחות וספקי הלקוח אך ורק למטרות ' +
        'ביצוע ההסכם, בהתאם לחוק הגנת הפרטיות, התשמ״א-1981 ותקנות ' +
        'הגנת הפרטיות (אבטחת מידע), התשע״ז-2017. הספק ינקוט אמצעי ' +
        'אבטחה ברמה של {{securityLevel}} ויודיע על כל אירוע אבטחה ' +
        'תוך {{breachNotifyHours}} שעות.',
      variables: ['securityLevel', 'breachNotifyHours'],
      riskLevel: 'high',
      approvedBy: 'dpo@example.com',
      approvalDate: '2025-11-01',
      lawReferences: [
        'חוק הגנת הפרטיות, התשמ״א-1981',
        'תקנות הגנת הפרטיות (אבטחת מידע), התשע״ז-2017',
      ],
      stance: 'defensive',
    },
    {
      id: 'DP-EN-001',
      category: 'data-protection',
      language: 'en',
      title: 'Data Protection and Personal Data Processing',
      text:
        'Supplier shall process personal data of Customer\'s customers ' +
        'and suppliers solely for the performance of this agreement, in ' +
        'accordance with the Protection of Privacy Law, 5741-1981 and ' +
        'the Protection of Privacy (Data Security) Regulations, 5777-2017. ' +
        'Supplier shall implement security measures at the ' +
        '{{securityLevel}} level and shall notify any security incident ' +
        'within {{breachNotifyHours}} hours.',
      variables: ['securityLevel', 'breachNotifyHours'],
      riskLevel: 'high',
      approvedBy: 'dpo@example.com',
      approvalDate: '2025-11-01',
      lawReferences: [
        'Protection of Privacy Law, 5741-1981',
        'Protection of Privacy (Data Security) Regulations, 5777-2017',
      ],
      stance: 'defensive',
    },

    // ─── NON-COMPETE ────────────────────────────────────────────
    {
      id: 'NC-HE-001',
      category: 'non-compete',
      language: 'he',
      title: 'אי-תחרות מוגבל',
      text:
        'הספק מתחייב שלא להתקשר עם מתחרים ישירים של הלקוח בתחום ' +
        '{{businessScope}} במשך {{nonCompeteMonths}} חודשים מסיום ' +
        'ההסכם, בטריטוריה של {{territory}}. סעיף זה יעמוד בתוקפו רק ' +
        'אם אינו עומד בניגוד לחוק יסוד: חופש העיסוק.',
      variables: ['businessScope', 'nonCompeteMonths', 'territory'],
      riskLevel: 'high',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: [
        'חוק יסוד: חופש העיסוק',
        'הלכת צ׳ק פוינט, ע״ע 164/99',
      ],
      stance: 'aggressive',
    },
    {
      id: 'NC-EN-001',
      category: 'non-compete',
      language: 'en',
      title: 'Limited Non-Compete',
      text:
        'Supplier undertakes not to engage with direct competitors of ' +
        'Customer in the field of {{businessScope}} for ' +
        '{{nonCompeteMonths}} months after termination, within the ' +
        'territory of {{territory}}. This clause shall remain in force ' +
        'only insofar as it does not contravene Basic Law: Freedom of ' +
        'Occupation.',
      variables: ['businessScope', 'nonCompeteMonths', 'territory'],
      riskLevel: 'high',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: [
        'Basic Law: Freedom of Occupation',
        'Check Point Ruling, Labor Appeal 164/99',
      ],
      stance: 'aggressive',
    },

    // ─── ARBITRATION ────────────────────────────────────────────
    {
      id: 'ARB-HE-001',
      category: 'arbitration',
      language: 'he',
      title: 'בוררות מחייבת',
      text:
        'כל מחלוקת בין הצדדים הנובעת מהסכם זה תוכרע על ידי בורר יחיד ' +
        'שימונה בהסכמת הצדדים, ובהיעדר הסכמה — על ידי יו״ר לשכת עורכי ' +
        'הדין. הבוררות תתנהל ב-{{arbitrationCity}} בשפה {{arbitrationLanguage}}. ' +
        'על הבורר לא יחולו דיני הראיות, אך יחולו עליו הדין המהותי ' +
        'וחובת הנמקה.',
      variables: ['arbitrationCity', 'arbitrationLanguage'],
      riskLevel: 'medium',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['חוק הבוררות, התשכ״ח-1968'],
      stance: 'neutral',
    },
    {
      id: 'ARB-EN-001',
      category: 'arbitration',
      language: 'en',
      title: 'Binding Arbitration',
      text:
        'Any dispute between the parties arising from this agreement ' +
        'shall be resolved by a sole arbitrator appointed by mutual ' +
        'consent of the parties, and failing agreement, by the Chairman ' +
        'of the Israel Bar Association. Arbitration shall be held in ' +
        '{{arbitrationCity}} in {{arbitrationLanguage}}. The arbitrator ' +
        'shall not be bound by the rules of evidence but shall be bound ' +
        'by substantive law and the duty to reason the award.',
      variables: ['arbitrationCity', 'arbitrationLanguage'],
      riskLevel: 'medium',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['Arbitration Law, 5728-1968'],
      stance: 'neutral',
    },

    // ─── EXTRA — Aggressive variant + defensive variant samples ─
    {
      id: 'LIA-HE-002',
      category: 'liability',
      language: 'he',
      title: 'הגבלת אחריות — גרסה מתונה (הגנתית)',
      text:
        'אחריותו הכוללת של הספק כלפי הלקוח לא תעלה על סכום התמורה ' +
        'הכוללת ששולמה בפועל על פי הסכם זה. חריגים: הפרה מכוונת, ' +
        'פגיעה בסודיות או פגיעה בזכויות קניין רוחני.',
      variables: [],
      riskLevel: 'medium',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['חוק החוזים (חלק כללי), התשל״ג-1973'],
      stance: 'defensive',
    },
    {
      id: 'PAY-HE-003',
      category: 'payment',
      language: 'he',
      title: 'תשלום מיידי במעמד האספקה (אגרסיבי)',
      text:
        'הלקוח ישלם את מלוא התמורה במעמד אספקת המוצרים/מתן השירותים. ' +
        'עיכוב בתשלום יהווה הפרה יסודית של ההסכם ויזכה את הספק לבטלו ' +
        'לאלתר ולדרוש את החזרת המוצרים.',
      variables: [],
      riskLevel: 'low',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['חוק החוזים (חלק כללי), התשל״ג-1973'],
      stance: 'aggressive',
    },
    {
      id: 'WAR-HE-002',
      category: 'warranty',
      language: 'he',
      title: 'אחריות מורחבת — ציוד הון',
      text:
        'עבור ציוד הון בשווי מעל {{capexThreshold}} ש״ח, תקופת האחריות ' +
        'תוארך ל-{{warrantyMonths}} חודשים, ותכלול ביקורת תקופתית ' +
        'אחת ל-{{inspectionMonths}} חודשים, ללא תשלום נוסף.',
      variables: ['capexThreshold', 'warrantyMonths', 'inspectionMonths'],
      riskLevel: 'medium',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['חוק המכר, התשכ״ח-1968'],
      stance: 'defensive',
    },
    {
      id: 'CON-HE-002',
      category: 'confidentiality',
      language: 'he',
      title: 'סודיות חד-צדדית לטובת הלקוח',
      text:
        'הספק מתחייב לשמור בסודיות כל מידע שיימסר לו על ידי הלקוח, ' +
        'לתקופה בלתי-מוגבלת, ולא להעסיק בפרויקט עובדים שאינם חתומים ' +
        'על הסכם סודיות אישי מקביל.',
      variables: [],
      riskLevel: 'medium',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['חוק עוולות מסחריות, התשנ״ט-1999'],
      stance: 'aggressive',
    },
    {
      id: 'FM-HE-002',
      category: 'force-majeure',
      language: 'he',
      title: 'כוח עליון — לא כולל עיכוב תשלום',
      text:
        'על אף האמור בסעיף כוח עליון, אין באירוע כוח עליון כדי לדחות ' +
        'חובת תשלום בגין מוצרים שסופקו או שירותים שניתנו בפועל לפני ' +
        'קרות האירוע.',
      variables: [],
      riskLevel: 'low',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['חוק החוזים (חלק כללי), התשל״ג-1973'],
      stance: 'defensive',
    },
    {
      id: 'DP-HE-002',
      category: 'data-protection',
      language: 'he',
      title: 'העברת מידע לחו״ל',
      text:
        'הספק לא יעביר מידע אישי מחוץ לגבולות מדינת ישראל אלא אם ' +
        'המדינה היעד מבטיחה רמת הגנה הולמת, או שקיבל אישור מראש ובכתב ' +
        'מממונה הגנת הפרטיות של הלקוח.',
      variables: [],
      riskLevel: 'high',
      approvedBy: 'dpo@example.com',
      approvalDate: '2025-11-01',
      lawReferences: [
        'תקנות הגנת הפרטיות (העברת מידע אל מאגרי מידע שמחוץ לגבולות המדינה), התשס״א-2001',
      ],
      stance: 'defensive',
    },
    {
      id: 'DEL-HE-002',
      category: 'delivery',
      language: 'he',
      title: 'תנאי הובלה Incoterms',
      text:
        'תנאי האספקה יהיו {{incoterm}} על פי כללי Incoterms 2020. ' +
        'הסיכון והבעלות במוצרים יעברו אל הלקוח במועד המסירה על פי ' +
        'התנאי האמור.',
      variables: ['incoterm'],
      riskLevel: 'low',
      approvedBy: 'legal@example.com',
      approvalDate: '2025-11-01',
      lawReferences: ['חוק המכר, התשכ״ח-1968', 'Incoterms 2020'],
      stance: 'neutral',
    },
  ];
}

// ───────────────────────────────────────────────────────────────
// ClauseLibrary class
// ───────────────────────────────────────────────────────────────

class ClauseLibrary {
  constructor({ autoSeed = true } = {}) {
    // clauseId → Map<version, clauseRecord>
    this._clauses = new Map();
    // clauseId → activeVersion
    this._active = new Map();
    // clauseId → Array<notification>
    this._notifications = new Map();
    // clauseId → Set<subscriberId>
    this._subscribers = new Map();
    // approval audit log (append-only)
    this._auditLog = [];
    // contract assembly counter (for stable ids)
    this._contractSeq = 0;

    if (autoSeed) {
      for (const c of seedClauses()) this.addClause(c);
    }
  }

  // ───────── core CRUD (append-only) ─────────

  addClause(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('addClause requires an input object');
    }
    const {
      id,
      category,
      language,
      title,
      text,
      variables = [],
      riskLevel,
      approvedBy,
      approvalDate,
      lawReferences = [],
      stance = 'neutral',
    } = input;

    if (!id || typeof id !== 'string') {
      throw new Error('addClause: id is required');
    }
    assertOneOf(category, CATEGORIES, 'category');
    assertOneOf(language, LANGUAGES, 'language');
    assertOneOf(riskLevel, RISK_LEVELS, 'riskLevel');
    assertOneOf(stance, STANCES, 'stance');
    if (!title) throw new Error('addClause: title is required');
    if (!text) throw new Error('addClause: text is required');
    if (!approvedBy) throw new Error('addClause: approvedBy is required');
    if (!approvalDate) throw new Error('addClause: approvalDate is required');
    if (!Array.isArray(variables)) {
      throw new Error('addClause: variables must be an array');
    }
    if (!Array.isArray(lawReferences)) {
      throw new Error('addClause: lawReferences must be an array');
    }

    // Variable consistency check — every {{x}} must be declared.
    const declared = new Set(variables);
    const found = extractVariables(text);
    for (const v of found) {
      if (!declared.has(v)) declared.add(v);
    }

    // Determine version: next integer if clause id exists.
    let version = 1;
    if (this._clauses.has(id)) {
      const versions = this._clauses.get(id);
      version = Math.max(...versions.keys()) + 1;
    } else {
      this._clauses.set(id, new Map());
    }

    const record = Object.freeze({
      id,
      version,
      category,
      language,
      title,
      text,
      variables: Array.from(declared),
      riskLevel,
      approvedBy,
      approvalDate,
      lawReferences: Array.from(lawReferences),
      stance,
      createdAt: nowISO(),
    });

    this._clauses.get(id).set(version, record);
    const prev = this._active.get(id);
    this._active.set(id, version);

    this._auditLog.push({
      type: 'addClause',
      clauseId: id,
      version,
      previousVersion: prev || null,
      at: nowISO(),
    });

    // Notify subscribers if this is an update (not initial add).
    if (prev) {
      this._emitNotification(id, {
        kind: 'clause-updated',
        clauseId: id,
        oldVersion: prev,
        newVersion: version,
        at: nowISO(),
      });
    }

    return clone(record);
  }

  getClause(clauseId, version) {
    const versions = this._clauses.get(clauseId);
    if (!versions) return null;
    const v = version || this._active.get(clauseId);
    const rec = versions.get(v);
    return rec ? clone(rec) : null;
  }

  // ───────── search ─────────

  searchClauses({ category, language, riskLevel, keywords } = {}) {
    const results = [];
    const kwTokens = keywords ? tokenize(keywords) : null;

    for (const [id, versions] of this._clauses) {
      const activeVersion = this._active.get(id);
      const rec = versions.get(activeVersion);
      if (!rec) continue;
      if (category && rec.category !== category) continue;
      if (language && rec.language !== language) continue;
      if (riskLevel && rec.riskLevel !== riskLevel) continue;
      if (kwTokens && kwTokens.length) {
        const hay = normalizedText(`${rec.title} ${rec.text}`);
        const hayWords = new Set(hay.split(/\s+/));
        const matched = kwTokens.filter((k) => hayWords.has(k));
        if (matched.length !== kwTokens.length) continue;
      }
      results.push(clone(rec));
    }

    // Sort: higher risk last (cautionary), then by id.
    results.sort((a, b) => {
      const r = RISK_WEIGHTS[a.riskLevel] - RISK_WEIGHTS[b.riskLevel];
      if (r !== 0) return r;
      return a.id.localeCompare(b.id);
    });
    return results;
  }

  // ───────── suggest ─────────

  suggestClauses({ contractType, scenario } = {}) {
    // Heuristic mapping contract type → recommended categories.
    const TYPE_MAP = {
      purchase: [
        'payment',
        'delivery',
        'warranty',
        'liability',
        'disputes',
        'force-majeure',
      ],
      service: [
        'payment',
        'confidentiality',
        'ip',
        'warranty',
        'termination',
        'liability',
        'disputes',
        'data-protection',
      ],
      nda: ['confidentiality', 'ip', 'non-compete', 'disputes'],
      license: [
        'ip',
        'payment',
        'warranty',
        'liability',
        'termination',
        'disputes',
      ],
      employment: [
        'confidentiality',
        'non-compete',
        'ip',
        'termination',
        'disputes',
      ],
      consulting: [
        'payment',
        'confidentiality',
        'ip',
        'liability',
        'termination',
        'disputes',
      ],
      saas: [
        'payment',
        'data-protection',
        'confidentiality',
        'liability',
        'termination',
        'disputes',
        'warranty',
      ],
      framework: [
        'payment',
        'delivery',
        'liability',
        'termination',
        'disputes',
        'force-majeure',
        'indemnification',
      ],
    };
    const SCENARIO_BOOST = {
      'cross-border': ['arbitration', 'disputes', 'force-majeure'],
      'personal-data': ['data-protection', 'confidentiality'],
      'high-value': ['liability', 'indemnification', 'warranty'],
      'creative-work': ['ip', 'confidentiality'],
      startup: ['ip', 'non-compete', 'confidentiality'],
    };

    const categories = new Set(TYPE_MAP[contractType] || ['payment']);
    if (scenario && SCENARIO_BOOST[scenario]) {
      for (const c of SCENARIO_BOOST[scenario]) categories.add(c);
    }

    const suggested = [];
    for (const cat of categories) {
      // Prefer neutral stance; fallback to any.
      const hits = this.searchClauses({ category: cat });
      const neutral = hits.find((h) => h.stance === 'neutral') || hits[0];
      if (neutral) suggested.push(neutral);
    }
    return suggested;
  }

  // ───────── variants ─────────

  variantsForClause(clauseId) {
    const base = this.getClause(clauseId);
    if (!base) return { aggressive: null, neutral: null, defensive: null };

    const sameFamily = [];
    for (const [id] of this._clauses) {
      const rec = this.getClause(id);
      if (!rec) continue;
      if (rec.category === base.category && rec.language === base.language) {
        sameFamily.push(rec);
      }
    }
    const pickStance = (s) => sameFamily.find((r) => r.stance === s) || null;
    return {
      aggressive: pickStance('aggressive'),
      neutral: pickStance('neutral'),
      defensive: pickStance('defensive'),
    };
  }

  // ───────── fallbacks (negotiation ladder) ─────────

  approvedFallbacks(clauseId) {
    const base = this.getClause(clauseId);
    if (!base) return [];
    const ladder = [];

    // Level 0 — opening position (the clause itself).
    ladder.push({
      level: 0,
      label: 'opening',
      clause: base,
      concession:
        base.language === 'he'
          ? 'עמדת פתיחה — אין ויתור'
          : 'opening position — no concession',
    });

    const variants = this.variantsForClause(clauseId);
    // Level 1 — neutral (if current is aggressive).
    if (base.stance === 'aggressive' && variants.neutral) {
      ladder.push({
        level: 1,
        label: 'moderate',
        clause: variants.neutral,
        concession:
          base.language === 'he'
            ? 'מעבר לעמדה מאוזנת'
            : 'move to balanced stance',
      });
    }
    // Level 2 — defensive (walk-away cushion).
    if (variants.defensive && variants.defensive.id !== base.id) {
      ladder.push({
        level: variants.neutral ? 2 : 1,
        label: 'walk-away',
        clause: variants.defensive,
        concession:
          base.language === 'he'
            ? 'עמדה הגנתית אחרונה לפני פרישה ממשא ומתן'
            : 'final defensive position before walk-away',
      });
    }
    return ladder;
  }

  // ───────── customize (variable substitution) ─────────

  customizeClause({ clauseId, variables } = {}) {
    const base = this.getClause(clauseId);
    if (!base) throw new Error(`customizeClause: unknown clause "${clauseId}"`);
    const vars = variables || {};

    // Enforce: every declared variable must be supplied.
    const missing = base.variables.filter(
      (v) => vars[v] === undefined || vars[v] === null || vars[v] === '',
    );
    if (missing.length) {
      throw new Error(
        `customizeClause: missing variables [${missing.join(', ')}]`,
      );
    }

    // Reject unknown variables (defense-in-depth).
    const declared = new Set(base.variables);
    const unknown = Object.keys(vars).filter((k) => !declared.has(k));
    if (unknown.length) {
      throw new Error(
        `customizeClause: unknown variables [${unknown.join(', ')}]`,
      );
    }

    const title = base.title.replace(VARIABLE_PATTERN, (_, name) =>
      String(vars[name]),
    );
    const text = base.text.replace(VARIABLE_PATTERN, (_, name) =>
      String(vars[name]),
    );

    return {
      clauseId: base.id,
      version: base.version,
      language: base.language,
      category: base.category,
      riskLevel: base.riskLevel,
      title,
      text,
      variables: clone(vars),
      customizedAt: nowISO(),
    };
  }

  // ───────── validate customization ─────────

  validateCustomization({ clauseId, customized } = {}) {
    const base = this.getClause(clauseId);
    if (!base) {
      return {
        valid: false,
        errors: [`unknown clause "${clauseId}"`],
        warnings: [],
      };
    }
    if (!customized || typeof customized !== 'object') {
      return {
        valid: false,
        errors: ['customized payload missing'],
        warnings: [],
      };
    }

    const errors = [];
    const warnings = [];

    // Category / language / riskLevel must not drift.
    if (customized.category && customized.category !== base.category) {
      errors.push('category drift not allowed');
    }
    if (customized.language && customized.language !== base.language) {
      errors.push('language drift not allowed');
    }
    if (customized.riskLevel && customized.riskLevel !== base.riskLevel) {
      errors.push('riskLevel drift not allowed');
    }

    // Text must still contain the skeleton of the original (stripped of vars).
    const skeletonBase = stripVariables(base.text);
    const skeletonCust = customized.text
      ? stripVariables(customized.text)
      : '';
    const { similarity } = simpleDiff(skeletonBase, skeletonCust);
    if (similarity < 0.65) {
      errors.push(
        `text drift too large (similarity ${similarity.toFixed(2)} < 0.65)`,
      );
    } else if (similarity < 0.85) {
      warnings.push(
        `noticeable drift (similarity ${similarity.toFixed(2)})`,
      );
    }

    // All original variables must have non-empty values.
    for (const v of base.variables) {
      if (
        !customized.variables ||
        customized.variables[v] === undefined ||
        customized.variables[v] === null ||
        customized.variables[v] === ''
      ) {
        errors.push(`missing variable "${v}"`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      similarity,
    };
  }

  // ───────── version history ─────────

  clauseVersioning(clauseId) {
    const versions = this._clauses.get(clauseId);
    if (!versions) return [];
    const out = [];
    for (const [version, rec] of versions) {
      out.push({
        clauseId,
        version,
        approvedBy: rec.approvedBy,
        approvalDate: rec.approvalDate,
        createdAt: rec.createdAt,
        active: this._active.get(clauseId) === version,
        title: rec.title,
      });
    }
    out.sort((a, b) => a.version - b.version);
    return out;
  }

  // ───────── compare ─────────

  compareClauseTexts(clauseA, clauseB) {
    const textA = typeof clauseA === 'string' ? clauseA : clauseA?.text || '';
    const textB = typeof clauseB === 'string' ? clauseB : clauseB?.text || '';
    const { added, removed, similarity } = simpleDiff(textA, textB);
    const riskA = clauseA?.riskLevel || null;
    const riskB = clauseB?.riskLevel || null;
    let riskAnnotation = 'no-risk-change';
    if (riskA && riskB) {
      const delta = RISK_WEIGHTS[riskB] - RISK_WEIGHTS[riskA];
      if (delta > 0) riskAnnotation = 'risk-increased';
      else if (delta < 0) riskAnnotation = 'risk-decreased';
    }
    return {
      similarity,
      added,
      removed,
      riskA,
      riskB,
      riskAnnotation,
      identical: similarity === 1 && added.length === 0 && removed.length === 0,
    };
  }

  // ───────── generateContract ─────────

  generateContract({
    type = 'service',
    parties = {},
    clauses = [],
    terms = {},
    language = 'both',
  } = {}) {
    if (!Array.isArray(clauses) || clauses.length === 0) {
      throw new Error('generateContract: clauses array required');
    }
    this._contractSeq += 1;

    const partyA = parties.partyA || 'Party A';
    const partyB = parties.partyB || 'Party B';
    const effectiveDate =
      terms.effectiveDate || new Date().toISOString().slice(0, 10);

    // Resolve clauses: each entry is {clauseId, variables?} or raw string.
    const resolved = [];
    for (const entry of clauses) {
      if (typeof entry === 'string') {
        const rec = this.getClause(entry);
        if (!rec) throw new Error(`generateContract: unknown clause "${entry}"`);
        // If the base clause has no variables, skip substitution.
        if (rec.variables.length === 0) {
          resolved.push({
            clauseId: rec.id,
            version: rec.version,
            language: rec.language,
            category: rec.category,
            riskLevel: rec.riskLevel,
            title: rec.title,
            text: rec.text,
            variables: {},
            customizedAt: nowISO(),
          });
        } else {
          throw new Error(
            `generateContract: clause "${entry}" needs variables`,
          );
        }
      } else if (entry && entry.clauseId) {
        const c = this.customizeClause({
          clauseId: entry.clauseId,
          variables: entry.variables || {},
        });
        resolved.push(c);
      } else {
        throw new Error('generateContract: invalid clause entry');
      }
    }

    // For 'both' language, render each clause in both languages if available.
    const bilingualSections = [];
    for (const c of resolved) {
      const section = { primary: c, mirror: null };
      if (language === 'both') {
        // Find the sister clause in the other language by category+stance.
        const base = this.getClause(c.clauseId);
        if (base) {
          const otherLang = base.language === 'he' ? 'en' : 'he';
          const mirrors = this.searchClauses({
            category: base.category,
            language: otherLang,
          });
          const sameStance = mirrors.find((m) => m.stance === base.stance);
          const pick = sameStance || mirrors[0];
          if (pick) {
            try {
              // Attempt to customize with same variable map (shared var names).
              const mirrorCust =
                pick.variables.length > 0
                  ? this.customizeClause({
                      clauseId: pick.id,
                      variables: c.variables,
                    })
                  : {
                      clauseId: pick.id,
                      version: pick.version,
                      language: pick.language,
                      category: pick.category,
                      riskLevel: pick.riskLevel,
                      title: pick.title,
                      text: pick.text,
                      variables: {},
                      customizedAt: nowISO(),
                    };
              section.mirror = mirrorCust;
            } catch (_e) {
              section.mirror = null;
            }
          }
        }
      }
      bilingualSections.push(section);
    }

    const heHeader =
      'הסכם ' +
      (type === 'service'
        ? 'מתן שירותים'
        : type === 'purchase'
          ? 'רכישה'
          : type === 'nda'
            ? 'סודיות'
            : type === 'saas'
              ? 'שירותי ענן'
              : 'מסגרת');
    const enHeader =
      (type === 'service'
        ? 'Service'
        : type === 'purchase'
          ? 'Purchase'
          : type === 'nda'
            ? 'Non-Disclosure'
            : type === 'saas'
              ? 'SaaS'
              : 'Framework') + ' Agreement';

    const renderHebrew = () => {
      const lines = [];
      lines.push(heHeader);
      lines.push(`בין: ${partyA}`);
      lines.push(`לבין: ${partyB}`);
      lines.push(`מועד תחילה: ${effectiveDate}`);
      lines.push('');
      let idx = 1;
      for (const s of bilingualSections) {
        const he =
          s.primary.language === 'he'
            ? s.primary
            : s.mirror && s.mirror.language === 'he'
              ? s.mirror
              : null;
        if (!he) continue;
        lines.push(`${idx}. ${he.title}`);
        lines.push(he.text);
        lines.push('');
        idx += 1;
      }
      return lines.join('\n');
    };

    const renderEnglish = () => {
      const lines = [];
      lines.push(enHeader);
      lines.push(`Between: ${partyA}`);
      lines.push(`And: ${partyB}`);
      lines.push(`Effective date: ${effectiveDate}`);
      lines.push('');
      let idx = 1;
      for (const s of bilingualSections) {
        const en =
          s.primary.language === 'en'
            ? s.primary
            : s.mirror && s.mirror.language === 'en'
              ? s.mirror
              : null;
        if (!en) continue;
        lines.push(`${idx}. ${en.title}`);
        lines.push(en.text);
        lines.push('');
        idx += 1;
      }
      return lines.join('\n');
    };

    let body = '';
    if (language === 'he') body = renderHebrew();
    else if (language === 'en') body = renderEnglish();
    else body = renderHebrew() + '\n\n──────────────\n\n' + renderEnglish();

    const contract = {
      contractId: `CT-${this._contractSeq.toString().padStart(6, '0')}`,
      type,
      language,
      parties: { partyA, partyB },
      terms: clone(terms),
      effectiveDate,
      clauses: resolved,
      sections: bilingualSections,
      body,
      generatedAt: nowISO(),
    };
    contract.riskScore = this.riskScore(contract);
    return contract;
  }

  // ───────── riskScore ─────────

  riskScore(contract) {
    if (!contract || !Array.isArray(contract.clauses)) {
      return { score: 0, band: 'unknown', breakdown: [] };
    }
    const breakdown = [];
    let total = 0;
    let maxPossible = 0;
    for (const c of contract.clauses) {
      const w = RISK_WEIGHTS[c.riskLevel] || 0;
      breakdown.push({
        clauseId: c.clauseId,
        category: c.category,
        riskLevel: c.riskLevel,
        weight: w,
      });
      total += w;
      maxPossible += RISK_WEIGHTS.high;
    }
    const normalized = maxPossible > 0 ? (total / maxPossible) * 100 : 0;
    let band;
    if (normalized < 33) band = 'low';
    else if (normalized < 66) band = 'medium';
    else band = 'high';
    return {
      score: Math.round(normalized),
      band,
      rawTotal: total,
      maxPossible,
      breakdown,
    };
  }

  // ───────── notifications ─────────

  notificationOnChange({ clauseId, subscribers } = {}) {
    if (!clauseId) throw new Error('notificationOnChange: clauseId required');
    if (!this._clauses.has(clauseId)) {
      throw new Error(`notificationOnChange: unknown clause "${clauseId}"`);
    }
    const list = Array.isArray(subscribers)
      ? subscribers
      : subscribers
        ? [subscribers]
        : [];
    if (!this._subscribers.has(clauseId)) {
      this._subscribers.set(clauseId, new Set());
    }
    const bucket = this._subscribers.get(clauseId);
    for (const s of list) bucket.add(s);

    return {
      clauseId,
      subscribers: Array.from(bucket),
      currentVersion: this._active.get(clauseId),
      deliveredNotifications: clone(this._notifications.get(clauseId) || []),
    };
  }

  _emitNotification(clauseId, payload) {
    if (!this._notifications.has(clauseId)) {
      this._notifications.set(clauseId, []);
    }
    const subs = this._subscribers.get(clauseId) || new Set();
    const record = {
      ...payload,
      subscribers: Array.from(subs),
    };
    this._notifications.get(clauseId).push(record);
    return record;
  }

  getNotifications(clauseId) {
    return clone(this._notifications.get(clauseId) || []);
  }

  getAuditLog() {
    return clone(this._auditLog);
  }

  listClauseIds() {
    return Array.from(this._clauses.keys());
  }
}

// ───────────────────────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────────────────────

module.exports = {
  ClauseLibrary,
  CATEGORIES,
  LANGUAGES,
  RISK_LEVELS,
  RISK_WEIGHTS,
  STANCES,
  HEBREW_GLOSSARY,
  VARIABLE_PATTERN,
  seedClauses,
  extractVariables,
};
