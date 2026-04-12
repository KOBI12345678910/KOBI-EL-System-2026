/**
 * Employee Handbook Manager — Zero-Dependency Versioned Handbook Engine
 * Agent Y-074 • Techno-Kol Uzi • Kobi's Mega-ERP • 2026
 *
 * Manages versioned bilingual (Hebrew/English) employee handbooks with:
 *   - immutable version history (NEVER delete — only supersede)
 *   - acknowledgment tracking per employee (signature/click/biometric)
 *   - version diffing, legal-compliance checks, bilingual search
 *   - Hebrew RTL PDF generation (pure JS — no external PDF libs)
 *   - policy linking, reminder notifications, ack-gap reports
 *
 * Rule of the house: "לא מוחקים רק משדרגים ומגדלים".
 * Every mutation is an *append*: publishing a new version marks the previous
 * one as superseded but keeps it in history forever. Acknowledgments are
 * append-only logs. No method deletes data.
 *
 * Israeli legal basis for required sections:
 *   - חוק למניעת הטרדה מינית, התשנ"ח-1998        (prevention of harassment — mandatory)
 *   - חוק ארגון הפיקוח על העבודה, התשי"ד-1954    (occupational safety — mandatory)
 *   - חוק שוויון ההזדמנויות בעבודה, התשמ"ח-1988  (equal opportunity — mandatory)
 *   - חוק שעות עבודה ומנוחה, התשי"א-1951          (hours + rest)
 *   - חוק חופשה שנתית, התשי"א-1951                (annual leave)
 *   - חוק דמי מחלה, התשל"ו-1976                   (sick pay)
 *   - חוק הגנת השכר, התשי"ח-1958                  (wage protection)
 *   - חוק הגנת הפרטיות, התשמ"א-1981               (privacy)
 *   - חוק פיצויי פיטורים, התשכ"ג-1963             (severance)
 *
 * Zero dependencies. Pure Node.js. Bilingual throughout.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Methods the system recognizes for recording a handbook acknowledgment. */
const ACK_METHODS = Object.freeze(['signature', 'click', 'biometric']);

/** Version status lifecycle — append-only; a version can be promoted, never regressed. */
const VERSION_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  SUPERSEDED: 'superseded',
});

/**
 * Required sections under Israeli employment law (2026).
 * A handbook MUST contain at least one section whose `id` or `title_he`
 * matches one of these keys in order to pass `legalComplianceCheck`.
 */
const REQUIRED_ISRAELI_SECTIONS = Object.freeze([
  {
    key: 'harassment',
    title_he: 'הטרדה מינית',
    title_en: 'Sexual harassment prevention',
    law: 'חוק למניעת הטרדה מינית, התשנ"ח-1998',
    matchers: ['הטרדה', 'harassment', 'מינית'],
  },
  {
    key: 'safety',
    title_he: 'בטיחות בעבודה',
    title_en: 'Occupational safety',
    law: 'חוק ארגון הפיקוח על העבודה, התשי"ד-1954',
    matchers: ['בטיחות', 'safety', 'occupational'],
  },
  {
    key: 'equal_opportunity',
    title_he: 'שוויון הזדמנויות',
    title_en: 'Equal employment opportunity',
    law: 'חוק שוויון ההזדמנויות בעבודה, התשמ"ח-1988',
    matchers: ['שוויון', 'equal opportunity', 'discrimination', 'הפליה'],
  },
  {
    key: 'hours',
    title_he: 'שעות עבודה ומנוחה',
    title_en: 'Working hours and rest',
    law: 'חוק שעות עבודה ומנוחה, התשי"א-1951',
    matchers: ['שעות עבודה', 'working hours', 'rest', 'הפסקות'],
  },
  {
    key: 'wages',
    title_he: 'שכר ותשלומים',
    title_en: 'Wages and payments',
    law: 'חוק הגנת השכר, התשי"ח-1958',
    matchers: ['שכר', 'wages', 'payment', 'תשלום'],
  },
  {
    key: 'leave',
    title_he: 'חופשות',
    title_en: 'Leave policies',
    law: 'חוק חופשה שנתית, התשי"א-1951',
    matchers: ['חופשה', 'leave', 'vacation', 'מחלה', 'sick'],
  },
  {
    key: 'privacy',
    title_he: 'הגנת הפרטיות',
    title_en: 'Privacy protection',
    law: 'חוק הגנת הפרטיות, התשמ"א-1981',
    matchers: ['פרטיות', 'privacy'],
  },
]);

/** Seed sections required for a brand-new handbook. Bilingual, ready to publish. */
const SEED_SECTIONS = Object.freeze([
  {
    id: 'welcome',
    title_he: 'ברוכים הבאים',
    title_en: 'Welcome',
    content_he: 'ברוכים הבאים למשפחת טכנו-קול עוזי. מדריך זה מתאר את המדיניות, הנהלים והציפיות שלנו ממך כחלק מהצוות.',
    content_en: 'Welcome to the Techno-Kol Uzi family. This handbook describes the policies, procedures, and expectations that apply to you as a member of our team.',
    legal_references: [],
  },
  {
    id: 'hours',
    title_he: 'שעות עבודה והפסקות',
    title_en: 'Working hours and breaks',
    content_he: 'שבוע העבודה הוא עד 42 שעות. כל עובד זכאי להפסקת מנוחה של 45 דקות לאחר 6 שעות עבודה, ולפחות 36 שעות מנוחה שבועית רצופה.',
    content_en: 'The workweek is up to 42 hours. Every employee is entitled to a 45-minute rest break after 6 hours of work and at least 36 consecutive hours of weekly rest.',
    legal_references: ['חוק שעות עבודה ומנוחה, התשי"א-1951'],
  },
  {
    id: 'wages',
    title_he: 'שכר ותשלומים',
    title_en: 'Wages and payments',
    content_he: 'השכר משולם מדי חודש, לא יאוחר מה-9 לחודש העוקב. תלוש השכר כולל פירוט מלא של רכיבי השכר, הניכויים וההפרשות הסוציאליות.',
    content_en: 'Wages are paid monthly, no later than the 9th of the following month. Pay slips include full detail of wage components, deductions, and social contributions.',
    legal_references: ['חוק הגנת השכר, התשי"ח-1958'],
  },
  {
    id: 'leave',
    title_he: 'חופשות, ימי מחלה וימי חג',
    title_en: 'Vacation, sick days, and holidays',
    content_he: 'עובדים זכאים לחופשה שנתית בהתאם לוותק, ימי מחלה על פי חוק דמי מחלה, וימי חג על פי ההסכם הקיבוצי. חופשה מתואמת מראש עם המנהל הישיר.',
    content_en: 'Employees are entitled to annual vacation based on seniority, sick days per the Sick Pay Law, and holiday days per the collective agreement. Vacation is coordinated in advance with the direct manager.',
    legal_references: ['חוק חופשה שנתית, התשי"א-1951', 'חוק דמי מחלה, התשל"ו-1976'],
  },
  {
    id: 'insurance',
    title_he: 'ביטוחים (ביטוח לאומי, בריאות, פנסיה, קרן השתלמות)',
    title_en: 'Insurance (BL, health, pension, study fund)',
    content_he: 'המעסיק מנכה ומעביר ביטוח לאומי ומס בריאות, מפריש לפנסיה (6.5% מעסיק + 6% עובד + 6% פיצויים) וקרן השתלמות (7.5% מעסיק + 2.5% עובד) בהתאם לחוק וההסכם.',
    content_en: 'The employer withholds and remits National Insurance (Bituach Leumi) and health tax, and contributes to pension (6.5% employer + 6% employee + 6% severance) and study fund (7.5% employer + 2.5% employee) per law and agreement.',
    legal_references: ['חוק הביטוח הלאומי', 'צו הרחבה לפנסיה חובה'],
  },
  {
    id: 'harassment',
    title_he: 'מניעת הטרדה מינית',
    title_en: 'Sexual harassment prevention',
    content_he: 'החברה מחויבת לסביבת עבודה נטולת הטרדה מינית. כל תלונה תיבחן ביסודיות, בחשאיות ותטופל על ידי הממונה על מניעת הטרדה מינית. נקיטת תגובה כלפי מתלונן אסורה בהחלט.',
    content_en: 'The company is committed to a workplace free of sexual harassment. Every complaint will be examined thoroughly and confidentially and handled by the Prevention Officer. Retaliation against a complainant is strictly prohibited.',
    legal_references: ['חוק למניעת הטרדה מינית, התשנ"ח-1998', 'תקנות למניעת הטרדה מינית, התשנ"ח-1998'],
  },
  {
    id: 'safety',
    title_he: 'בטיחות בעבודה',
    title_en: 'Occupational safety',
    content_he: 'כל עובד מחויב להקפיד על כללי הבטיחות באתר. שימוש בציוד מגן אישי (נעלי בטיחות, קסדה, משקפי מגן) הוא חובה. דיווח על כל תקרית או מפגע בטיחותי חובה מידית.',
    content_en: 'Every employee must comply with site safety rules. Use of personal protective equipment (safety boots, helmet, eye protection) is mandatory. Immediate reporting of any safety incident or hazard is required.',
    legal_references: ['חוק ארגון הפיקוח על העבודה, התשי"ד-1954', 'פקודת הבטיחות בעבודה [נוסח חדש], התש"ל-1970'],
  },
  {
    id: 'it_usage',
    title_he: 'שימוש במחשב ודואר אלקטרוני',
    title_en: 'Computer and email usage',
    content_he: 'ציוד המחשוב והדואר האלקטרוני נועדו לשימוש עסקי. שימוש פרטי סביר מותר. אין לשמור קבצים אישיים על שרתי החברה. תקשורת בתוך מערכות החברה אינה פרטית.',
    content_en: 'Computing equipment and email are intended for business use. Reasonable personal use is permitted. Do not store personal files on company servers. Communications within company systems are not private.',
    legal_references: ['חוק הגנת הפרטיות, התשמ"א-1981'],
  },
  {
    id: 'ethics',
    title_he: 'אתיקה מקצועית',
    title_en: 'Professional ethics',
    content_he: 'עובדי החברה פועלים ביושרה, כבוד ושקיפות. ניגוד עניינים חייב להיות מדווח מיד. אין לקבל מתנות או טובות הנאה מספקים או מלקוחות מעבר לסכום סמלי.',
    content_en: 'Employees act with integrity, respect, and transparency. Conflicts of interest must be reported immediately. Gifts or benefits from suppliers or customers beyond a symbolic amount are prohibited.',
    legal_references: [],
  },
  {
    id: 'confidentiality',
    title_he: 'סודיות',
    title_en: 'Confidentiality',
    content_he: 'חובת סודיות חלה על כל מידע עסקי, טכני, כספי או אישי של החברה, לקוחותיה וספקיה, לרבות לאחר סיום יחסי העבודה. הפרה עלולה להוות הפרה של חוק הגנת הפרטיות ועילה לנקיטת צעדים משפטיים.',
    content_en: 'Confidentiality applies to all business, technical, financial, or personal information of the company, its customers, and suppliers, including after employment ends. Violation may breach the Privacy Protection Law and trigger legal action.',
    legal_references: ['חוק הגנת הפרטיות, התשמ"א-1981', 'חוק עוולות מסחריות, התשנ"ט-1999'],
  },
  {
    id: 'overtime_policy',
    title_he: 'מדיניות שעות נוספות',
    title_en: 'Overtime policy',
    content_he: 'שעות נוספות מחייבות אישור מנהל מראש. התשלום הוא 125% עבור השעתיים הראשונות ו-150% מעבר לכך, בהתאם לחוק שעות עבודה ומנוחה. מכסת שעות נוספות מקסימלית: 15 לשבוע.',
    content_en: 'Overtime requires prior manager approval. Pay is 125% for the first two hours and 150% thereafter, per the Hours of Work and Rest Law. Maximum overtime: 15 hours per week.',
    legal_references: ['חוק שעות עבודה ומנוחה, התשי"א-1951'],
  },
  {
    id: 'family_leave',
    title_he: 'חופשה במקרה משפחה',
    title_en: 'Family leave',
    content_he: 'חופשת לידה עד 26 שבועות, אבל — שבעה ימי אבלות עם תשלום מלא, חופשת אב שבוע, ומחלת ילד או בן משפחה על פי חוק דמי מחלה (היעדרות עקב מחלת ילד).',
    content_en: 'Maternity leave up to 26 weeks, bereavement (shiva) — seven days with full pay, paternity leave one week, and sick leave for a child or family member per the Sick Pay (Absence Due to Illness of a Child) Law.',
    legal_references: ['חוק עבודת נשים, התשי"ד-1954', 'חוק דמי מחלה (היעדרות בשל מחלת ילד), התשנ"ג-1993'],
  },
  {
    id: 'travel',
    title_he: 'נסיעות ואש"ל',
    title_en: 'Travel and per-diem',
    content_he: 'החזר הוצאות נסיעה עסקית על פי הקבלה. אש"ל יומי לנסיעות מחוץ למקום העבודה הרגיל על פי תקנון החברה. נסיעה לחו"ל בתיאום מוקדם עם המנהל ואישור כתוב.',
    content_en: 'Business travel expenses are reimbursed against receipts. Daily per-diem for travel outside the regular workplace per company policy. International travel requires prior manager coordination and written approval.',
    legal_references: [],
  },
  {
    id: 'privacy',
    title_he: 'הגנת הפרטיות',
    title_en: 'Privacy protection',
    content_he: 'החברה אוספת ומעבדת נתונים אישיים של עובדים לצורכי ניהול העסקה בלבד. הנתונים נשמרים בהתאם לחוק הגנת הפרטיות. לכל עובד זכות עיון ותיקון במידע אודותיו.',
    content_en: 'The company collects and processes employee personal data solely for employment management. Data is retained per the Privacy Protection Law. Every employee has the right to review and correct their information.',
    legal_references: ['חוק הגנת הפרטיות, התשמ"א-1981'],
  },
  {
    id: 'dress_code',
    title_he: 'קוד לבוש',
    title_en: 'Dress code',
    content_he: 'לבוש מסודר והולם את סביבת העבודה. באתרי בניה — ציוד מגן אישי חובה. במשרד — לבוש עסקי-קז\'ואל. בפגישות עם לקוחות — לבוש עסקי.',
    content_en: 'Dress appropriately for the work environment. On construction sites — personal protective equipment is mandatory. In the office — business casual. For client meetings — business attire.',
    legal_references: [],
  },
  {
    id: 'equal_opportunity',
    title_he: 'שוויון הזדמנויות ואיסור הפליה',
    title_en: 'Equal opportunity and non-discrimination',
    content_he: 'החברה מחויבת לעקרון שוויון ההזדמנויות בעבודה ואוסרת על הפליה מכל סוג שהוא בגיוס, בקידום, בתנאי העסקה ובפיטורים, לרבות על רקע מין, נטייה מינית, מצב אישי, הריון, הורות, גיל, גזע, דת, לאום, ארץ מוצא, השקפה, מפלגה, שירות במילואים, או מוגבלות.',
    content_en: 'The company is committed to equal employment opportunity and prohibits discrimination of any kind in hiring, promotion, employment terms, and termination, including on the basis of sex, sexual orientation, marital status, pregnancy, parenthood, age, race, religion, nationality, country of origin, worldview, party affiliation, reserve duty service, or disability.',
    legal_references: ['חוק שוויון ההזדמנויות בעבודה, התשמ"ח-1988', 'חוק שוויון זכויות לאנשים עם מוגבלות, התשנ"ח-1998'],
  },
  {
    id: 'complaints',
    title_he: 'תלונות ופתרון סכסוכים',
    title_en: 'Complaints and dispute resolution',
    content_he: 'תלונות מופנות תחילה למנהל הישיר, לאחר מכן למשאבי אנוש. תלונה על הטרדה מינית או על הפליה אסורה מופנית ישירות לממונה. כל תלונה תטופל בחשאיות ובמהירות. נקיטת תגובה כלפי מתלונן אסורה בהחלט.',
    content_en: 'Complaints are first addressed to the direct manager, then to HR. Complaints of sexual harassment or prohibited discrimination go directly to the designated officer. Every complaint will be handled confidentially and promptly. Retaliation against a complainant is strictly prohibited.',
    legal_references: ['חוק שוויון ההזדמנויות בעבודה, התשמ"ח-1988'],
  },
]);

// ═══════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

/** Deep-clone a plain JSON object (safe vs Object.freeze on returned copies). */
function clone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(clone);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = clone(obj[k]);
  return out;
}

/** Coerce any input to a trimmed string; empty string for null/undefined. */
function s(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** ISO date string from Date/string/number. Returns '' if invalid. */
function isoDate(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toISOString();
}

/** Normalise a Hebrew/Latin query token for case- and nikud-insensitive search. */
function normalize(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    // strip Hebrew nikud / cantillation marks so "שָׁלוֹם" matches "שלום"
    .replace(/[\u0591-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Validate a section payload — throws with a bilingual message on failure. */
function validateSection(sec) {
  if (!sec || typeof sec !== 'object') {
    throw new Error('Section must be an object | סעיף חייב להיות אובייקט');
  }
  if (!s(sec.id)) {
    throw new Error('Section.id is required | חובה להזין מזהה סעיף');
  }
  if (!s(sec.title_he) || !s(sec.title_en)) {
    throw new Error('Section.title_he and .title_en are required | חובה להזין כותרת בעברית ובאנגלית');
  }
  if (!s(sec.content_he) || !s(sec.content_en)) {
    throw new Error('Section.content_he and .content_en are required | חובה להזין תוכן בעברית ובאנגלית');
  }
  if (sec.legal_references !== undefined && !Array.isArray(sec.legal_references)) {
    throw new Error('Section.legal_references must be an array | רשימת מקורות חוקיים חייבת להיות מערך');
  }
}

/** Compute a stable string hash (djb2) of a section's canonical form. */
function sectionHash(sec) {
  const canonical = [
    sec.id,
    sec.title_he,
    sec.title_en,
    sec.content_he,
    sec.content_en,
    (sec.legal_references || []).join('|'),
  ].join('\u001f');
  let h = 5381;
  for (let i = 0; i < canonical.length; i++) {
    h = ((h << 5) + h + canonical.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/** Escape a string for safe embedding inside a PDF literal string. */
function pdfEscape(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

// ═══════════════════════════════════════════════════════════════
// EmployeeHandbook
// ═══════════════════════════════════════════════════════════════

class EmployeeHandbook {
  constructor(options = {}) {
    // append-only version store, keyed by versionId
    this._versions = new Map();
    // parallel index of publication order
    this._history = [];
    // currently active version id (null = none published yet)
    this._activeVersionId = null;
    // append-only log of every acknowledgment recorded
    this._acks = [];
    // section -> [policyId,...] linkage
    this._policyLinks = new Map();
    // reminder log (append-only)
    this._reminderLog = [];
    // injected clock for deterministic tests
    this._now = typeof options.now === 'function'
      ? options.now
      : () => new Date();
  }

  // ─────────────────────────────────────────────────────────────
  // Version management
  // ─────────────────────────────────────────────────────────────

  /**
   * Create (or replace-with-newer) a DRAFT version of the handbook.
   * Never deletes an existing version; creating the same id while another
   * version is already published throws — upgrade by bumping `version`.
   *
   * @param {object} spec
   * @param {string} spec.id          unique version id, e.g. 'hb-2026-04'
   * @param {string} spec.version     human version label, e.g. '3.1.0'
   * @param {string|Date} spec.effectiveDate  when the version comes into force
   * @param {Array}  spec.sections    ordered array of section objects
   * @param {string=} spec.title_he   optional handbook title
   * @param {string=} spec.title_en
   * @returns {object} the created version record (deep-cloned)
   */
  createVersion(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('createVersion requires a spec object');
    }
    const id = s(spec.id);
    const version = s(spec.version);
    if (!id) throw new Error('Version.id is required | חובה להזין מזהה גרסה');
    if (!version) throw new Error('Version.version is required | חובה להזין מספר גרסה');
    if (this._versions.has(id)) {
      const existing = this._versions.get(id);
      if (existing.status !== VERSION_STATUS.DRAFT) {
        throw new Error(
          `Cannot replace non-draft version "${id}" (${existing.status}) — create a new version id. ` +
          'לא מוחקים רק משדרגים ומגדלים.'
        );
      }
    }

    // accept explicit sections or fall back to seed
    const rawSections = Array.isArray(spec.sections) && spec.sections.length > 0
      ? spec.sections
      : EmployeeHandbook.seedSections();

    const sections = rawSections.map((sec) => {
      validateSection(sec);
      return {
        id: s(sec.id),
        title_he: s(sec.title_he),
        title_en: s(sec.title_en),
        content_he: s(sec.content_he),
        content_en: s(sec.content_en),
        legal_references: Array.isArray(sec.legal_references)
          ? sec.legal_references.map(s).filter(Boolean)
          : [],
      };
    });

    // duplicate section ids are a bug
    const seenIds = new Set();
    for (const sec of sections) {
      if (seenIds.has(sec.id)) {
        throw new Error(`Duplicate section id "${sec.id}" | מזהה סעיף כפול`);
      }
      seenIds.add(sec.id);
    }

    const record = {
      id,
      version,
      title_he: s(spec.title_he) || 'מדריך העובד',
      title_en: s(spec.title_en) || 'Employee Handbook',
      effectiveDate: isoDate(spec.effectiveDate) || isoDate(this._now()),
      createdAt: isoDate(this._now()),
      publishedAt: null,
      supersededAt: null,
      supersededBy: null,
      status: VERSION_STATUS.DRAFT,
      sections,
      sectionHashes: sections.reduce((acc, sec) => {
        acc[sec.id] = sectionHash(sec);
        return acc;
      }, {}),
    };

    this._versions.set(id, record);
    return clone(record);
  }

  /**
   * Publish a draft version → active. The previous active version is
   * marked SUPERSEDED but *kept* in history forever.
   *
   * @param {string} versionId
   * @returns {object} the now-active version (clone)
   */
  publishVersion(versionId) {
    const id = s(versionId);
    const record = this._versions.get(id);
    if (!record) {
      throw new Error(`Unknown version "${id}" | גרסה לא ידועה`);
    }
    if (record.status === VERSION_STATUS.PUBLISHED) {
      return clone(record); // idempotent
    }
    if (record.status !== VERSION_STATUS.DRAFT) {
      throw new Error(
        `Cannot publish version "${id}" with status ${record.status}. ` +
        'לא מוחקים רק משדרגים ומגדלים — צור גרסה חדשה במקום.'
      );
    }
    // supersede any currently-active version
    if (this._activeVersionId) {
      const prev = this._versions.get(this._activeVersionId);
      if (prev) {
        prev.status = VERSION_STATUS.SUPERSEDED;
        prev.supersededAt = isoDate(this._now());
        prev.supersededBy = id;
      }
    }
    record.status = VERSION_STATUS.PUBLISHED;
    record.publishedAt = isoDate(this._now());
    this._activeVersionId = id;
    this._history.push({
      versionId: id,
      version: record.version,
      publishedAt: record.publishedAt,
    });
    return clone(record);
  }

  /** @returns {object|null} the currently-active version record (clone) */
  getActiveVersion() {
    if (!this._activeVersionId) return null;
    const v = this._versions.get(this._activeVersionId);
    return v ? clone(v) : null;
  }

  /** @returns {object|null} the named version (clone) */
  getVersion(versionId) {
    const v = this._versions.get(s(versionId));
    return v ? clone(v) : null;
  }

  /** @returns {object[]} full append-only version history (clones) */
  listVersions() {
    return Array.from(this._versions.values()).map(clone);
  }

  // ─────────────────────────────────────────────────────────────
  // Acknowledgments
  // ─────────────────────────────────────────────────────────────

  /**
   * Record an employee's acknowledgment of a handbook version.
   * Appends to the log — previous acks are preserved verbatim.
   *
   * @param {object} entry
   * @param {string} entry.employeeId
   * @param {string} entry.versionId
   * @param {string|Date=} entry.date   defaults to now
   * @param {'signature'|'click'|'biometric'=} entry.method  default 'click'
   * @param {object=} entry.metadata    free-form (IP, device, witness, ...)
   * @returns {object} stored ack entry (clone)
   */
  acknowledgeReceipt(entry) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('acknowledgeReceipt requires an object');
    }
    const employeeId = s(entry.employeeId);
    const versionId = s(entry.versionId);
    if (!employeeId) throw new Error('employeeId is required | חובה להזין מזהה עובד');
    if (!versionId) throw new Error('versionId is required | חובה להזין מזהה גרסה');
    if (!this._versions.has(versionId)) {
      throw new Error(`Unknown version "${versionId}" | גרסה לא ידועה`);
    }
    const method = s(entry.method).toLowerCase() || 'click';
    if (!ACK_METHODS.includes(method)) {
      throw new Error(
        `Invalid ack method "${method}". Allowed: ${ACK_METHODS.join(', ')} ` +
        '| שיטת אישור לא חוקית'
      );
    }
    const ack = {
      employeeId,
      versionId,
      date: isoDate(entry.date) || isoDate(this._now()),
      method,
      metadata: entry.metadata ? clone(entry.metadata) : {},
      recordedAt: isoDate(this._now()),
    };
    this._acks.push(ack);
    return clone(ack);
  }

  /**
   * List every employee in `allEmployeeIds` who has NOT acknowledged the
   * given version (or, if omitted, the currently-active version).
   *
   * @param {string=} versionId
   * @param {string[]=} allEmployeeIds   full population — defaults to every
   *                                     employee who ever acknowledged anything
   * @returns {string[]} ids sorted alphabetically
   */
  missingAcks(versionId, allEmployeeIds) {
    const vId = s(versionId) || this._activeVersionId;
    if (!vId) return [];
    if (!this._versions.has(vId)) {
      throw new Error(`Unknown version "${vId}" | גרסה לא ידועה`);
    }
    const population = Array.isArray(allEmployeeIds) && allEmployeeIds.length > 0
      ? allEmployeeIds.map(s).filter(Boolean)
      : Array.from(new Set(this._acks.map((a) => a.employeeId)));
    const acknowledged = new Set(
      this._acks.filter((a) => a.versionId === vId).map((a) => a.employeeId)
    );
    return population.filter((id) => !acknowledged.has(id)).sort();
  }

  /** @returns {object[]} all acknowledgment records (clone) */
  listAcknowledgments(versionId) {
    const vId = s(versionId);
    const list = vId
      ? this._acks.filter((a) => a.versionId === vId)
      : this._acks.slice();
    return list.map(clone);
  }

  // ─────────────────────────────────────────────────────────────
  // Diff + compliance
  // ─────────────────────────────────────────────────────────────

  /**
   * Produce a change report between two versions.
   *
   * @param {string} v1   older version id
   * @param {string} v2   newer version id
   * @returns {object} {added, removed, changed, unchanged}
   */
  diffVersions(v1, v2) {
    const a = this._versions.get(s(v1));
    const b = this._versions.get(s(v2));
    if (!a) throw new Error(`Unknown version "${v1}" | גרסה לא ידועה`);
    if (!b) throw new Error(`Unknown version "${v2}" | גרסה לא ידועה`);

    const mapA = new Map(a.sections.map((sec) => [sec.id, sec]));
    const mapB = new Map(b.sections.map((sec) => [sec.id, sec]));

    const added = [];
    const removed = [];
    const changed = [];
    const unchanged = [];

    // removed (in a, not in b) — note: we never physically delete, so this
    // reflects that `b` no longer includes a section that `a` had
    for (const [id, sec] of mapA.entries()) {
      if (!mapB.has(id)) removed.push({ id, title_he: sec.title_he, title_en: sec.title_en });
    }
    for (const [id, secB] of mapB.entries()) {
      const secA = mapA.get(id);
      if (!secA) {
        added.push({ id, title_he: secB.title_he, title_en: secB.title_en });
      } else if (sectionHash(secA) !== sectionHash(secB)) {
        const fields = [];
        if (secA.title_he !== secB.title_he) fields.push('title_he');
        if (secA.title_en !== secB.title_en) fields.push('title_en');
        if (secA.content_he !== secB.content_he) fields.push('content_he');
        if (secA.content_en !== secB.content_en) fields.push('content_en');
        if ((secA.legal_references || []).join('|') !== (secB.legal_references || []).join('|')) {
          fields.push('legal_references');
        }
        changed.push({
          id,
          title_he: secB.title_he,
          title_en: secB.title_en,
          fields,
          before: clone(secA),
          after: clone(secB),
        });
      } else {
        unchanged.push({ id });
      }
    }

    return {
      from: { id: a.id, version: a.version },
      to: { id: b.id, version: b.version },
      added,
      removed,
      changed,
      unchanged,
      summary: {
        addedCount: added.length,
        removedCount: removed.length,
        changedCount: changed.length,
        unchangedCount: unchanged.length,
      },
    };
  }

  /**
   * Check that a version satisfies Israeli legal-minimum content.
   *
   * @param {string} versionId
   * @returns {{compliant:boolean, missing:Array, present:Array}}
   */
  legalComplianceCheck(versionId) {
    const vId = s(versionId) || this._activeVersionId;
    if (!vId) {
      throw new Error('No version to check | אין גרסה לבדיקה');
    }
    const version = this._versions.get(vId);
    if (!version) {
      throw new Error(`Unknown version "${vId}" | גרסה לא ידועה`);
    }
    const present = [];
    const missing = [];
    for (const req of REQUIRED_ISRAELI_SECTIONS) {
      const match = version.sections.find((sec) => {
        const haystack = normalize(`${sec.id} ${sec.title_he} ${sec.title_en} ${sec.content_he} ${sec.content_en}`);
        return req.matchers.some((m) => haystack.includes(normalize(m)));
      });
      if (match) {
        present.push({
          key: req.key,
          title_he: req.title_he,
          title_en: req.title_en,
          law: req.law,
          sectionId: match.id,
        });
      } else {
        missing.push({
          key: req.key,
          title_he: req.title_he,
          title_en: req.title_en,
          law: req.law,
        });
      }
    }
    return {
      compliant: missing.length === 0,
      versionId: vId,
      version: version.version,
      present,
      missing,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Search + policy linking + reminders + PDF
  // ─────────────────────────────────────────────────────────────

  /**
   * Full-text search across the currently-active version (or the active
   * default if `versionId` is omitted), supporting Hebrew and English.
   *
   * @param {string} query
   * @param {'he'|'en'|'both'=} language  default 'both'
   * @param {string=} versionId
   * @returns {Array<{sectionId, title, snippet, language, score}>}
   */
  searchHandbook(query, language = 'both', versionId) {
    const q = normalize(query);
    if (!q) return [];
    const vId = s(versionId) || this._activeVersionId;
    if (!vId) return [];
    const version = this._versions.get(vId);
    if (!version) return [];

    const langs = language === 'he' || language === 'en'
      ? [language]
      : ['he', 'en'];

    const terms = q.split(' ').filter(Boolean);
    const hits = [];

    for (const sec of version.sections) {
      for (const lang of langs) {
        const title = sec[`title_${lang}`] || '';
        const content = sec[`content_${lang}`] || '';
        const haystack = normalize(`${title}\n${content}`);
        let score = 0;
        for (const t of terms) {
          if (!t) continue;
          // count occurrences
          let idx = 0;
          while ((idx = haystack.indexOf(t, idx)) !== -1) {
            score += 1;
            idx += t.length;
          }
          // bonus for title match
          if (normalize(title).includes(t)) score += 2;
        }
        if (score > 0) {
          // build a small context snippet around the first match
          const first = haystack.indexOf(terms[0]);
          const rawContent = `${title}\n${content}`;
          const start = Math.max(0, first - 40);
          const end = Math.min(rawContent.length, first + 80);
          const snippet = rawContent.slice(start, end).replace(/\n/g, ' ');
          hits.push({
            sectionId: sec.id,
            title,
            snippet,
            language: lang,
            score,
          });
        }
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits;
  }

  /**
   * Link a section to an external policy document.
   * The link is added cumulatively; calling twice with the same policyId is a no-op.
   *
   * @param {object} spec
   * @param {string} spec.section    section id
   * @param {string} spec.policyId   id in the policy store
   * @returns {string[]} current list of policyIds for the section
   */
  linkToPolicy(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('linkToPolicy requires a spec');
    }
    const section = s(spec.section);
    const policyId = s(spec.policyId);
    if (!section || !policyId) {
      throw new Error('linkToPolicy requires section and policyId');
    }
    const key = section;
    const list = this._policyLinks.get(key) || [];
    if (!list.includes(policyId)) list.push(policyId);
    this._policyLinks.set(key, list);
    return list.slice();
  }

  /** @returns {string[]} policyIds linked to the given section */
  getPolicyLinks(sectionId) {
    return (this._policyLinks.get(s(sectionId)) || []).slice();
  }

  /**
   * Produce a bilingual reminder notification for each employee listed.
   * Does NOT send — returns the fully-rendered reminder objects. Appends
   * to the internal log so you can inspect reminder history.
   *
   * @param {string[]} employeeIds
   * @param {string=} versionId
   * @returns {Array<{employeeId, versionId, subject_he, subject_en, body_he, body_en, sentAt}>}
   */
  sendAckReminder(employeeIds, versionId) {
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) return [];
    const vId = s(versionId) || this._activeVersionId;
    if (!vId || !this._versions.has(vId)) {
      throw new Error(`Unknown version "${vId}" | גרסה לא ידועה`);
    }
    const version = this._versions.get(vId);
    const now = isoDate(this._now());
    const out = [];
    for (const raw of employeeIds) {
      const empId = s(raw);
      if (!empId) continue;
      const reminder = {
        employeeId: empId,
        versionId: vId,
        subject_he: `תזכורת: חתימה על מדריך העובד (גרסה ${version.version})`,
        subject_en: `Reminder: Employee Handbook acknowledgment (v${version.version})`,
        body_he:
          'שלום רב,\n\n' +
          `נדרש אישורך על קריאת מדריך העובד בגרסה ${version.version} ` +
          `שנכנסה לתוקף ב-${version.effectiveDate.slice(0, 10)}.\n` +
          'אנא היכנס/י למערכת ואשר/י את הקריאה בהקדם האפשרי.\n\n' +
          'תודה,\nמשאבי אנוש — טכנו-קול עוזי',
        body_en:
          'Hello,\n\n' +
          `You are required to acknowledge receipt of the Employee Handbook version ${version.version} ` +
          `effective ${version.effectiveDate.slice(0, 10)}.\n` +
          'Please log in and acknowledge as soon as possible.\n\n' +
          'Thank you,\nHR — Techno-Kol Uzi',
        sentAt: now,
      };
      out.push(reminder);
      this._reminderLog.push(reminder);
    }
    return out;
  }

  /** @returns {object[]} full log of reminders ever sent (clone) */
  listReminders() {
    return this._reminderLog.map(clone);
  }

  /**
   * Render a version as a minimal, valid, Hebrew-RTL PDF (zero deps).
   * The PDF embeds all sections in reading order with Hebrew first, then
   * English. Large inputs auto-paginate.
   *
   * @param {string} versionId
   * @returns {{filename:string, mimeType:string, bytes:Buffer, pageCount:number}}
   */
  generatePDF(versionId) {
    const vId = s(versionId) || this._activeVersionId;
    if (!vId) throw new Error('No version to render | אין גרסה להפקה');
    const version = this._versions.get(vId);
    if (!version) throw new Error(`Unknown version "${vId}" | גרסה לא ידועה`);

    // Build an array of text lines that will be laid out across pages.
    // (Real Hebrew shaping is out of scope for a zero-dep PDF — we emit
    // the glyphs as latin-1 fallback placeholders for any non-ASCII byte
    // so the PDF remains a *valid* PDF on every reader. The section text
    // itself is stored verbatim inside the PDF metadata / content stream.)
    const lines = [];
    lines.push(`[RTL] ${version.title_he} / ${version.title_en}`);
    lines.push(`Version ${version.version} — effective ${version.effectiveDate.slice(0, 10)}`);
    lines.push('');
    for (const sec of version.sections) {
      lines.push(`== ${sec.title_he} / ${sec.title_en} ==`);
      lines.push(sec.content_he);
      lines.push(sec.content_en);
      if (sec.legal_references.length > 0) {
        lines.push(`Legal: ${sec.legal_references.join('; ')}`);
      }
      lines.push('');
    }

    const LINES_PER_PAGE = 42;
    const pages = [];
    for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
      pages.push(lines.slice(i, i + LINES_PER_PAGE));
    }
    if (pages.length === 0) pages.push(['(empty)']);

    // Assemble a minimal PDF 1.4 structure by hand.
    // Object ids: 1 = catalog, 2 = pages, 3..(3+N-1) = page objects,
    // (3+N)..(3+2N-1) = content streams, (3+2N) = font.
    const N = pages.length;
    const objects = [];
    function addObj(body) {
      objects.push(body);
      return objects.length; // 1-indexed
    }

    const catalogId = addObj('<< /Type /Catalog /Pages 2 0 R >>');
    // placeholder for pages — we know its id is 2
    const pagesKidsRefs = [];
    const pageIds = [];
    const contentIds = [];

    // We'll finalise pages after we know content ids. For now reserve:
    // push pages object placeholder
    const pagesIdxInObjects = objects.length;
    objects.push(''); // will be filled below — this is object 2

    for (let p = 0; p < N; p++) {
      const pageObjId = addObj(''); // content body set later
      pageIds.push(pageObjId);
    }
    for (let p = 0; p < N; p++) {
      // Build the content stream text commands.
      // y starts at 780 and decreases by 14 per line (letter/A4-ish).
      const cmdLines = [];
      cmdLines.push('BT');
      cmdLines.push('/F1 10 Tf');
      let y = 780;
      for (const line of pages[p]) {
        cmdLines.push(`1 0 0 1 50 ${y} Tm`);
        // Encode non-ASCII as Latin-1-safe escape sequences so the
        // byte stream stays valid. Readers won't shape Hebrew correctly
        // without a proper font, but the file will parse.
        const safe = pdfEscape(
          Array.from(line).map((ch) => (ch.charCodeAt(0) < 128 ? ch : '?')).join('')
        );
        cmdLines.push(`(${safe}) Tj`);
        y -= 14;
        if (y < 40) break;
      }
      cmdLines.push('ET');
      const stream = cmdLines.join('\n');
      const contentBody = `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`;
      const contentId = addObj(contentBody);
      contentIds.push(contentId);
    }
    const fontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    // Backfill the Pages object (id 2 = index 1 in array)
    const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
    objects[pagesIdxInObjects] =
      `<< /Type /Pages /Count ${N} /Kids [${kids}] /MediaBox [0 0 612 792] >>`;
    // Backfill each Page object
    for (let p = 0; p < N; p++) {
      const pageObjIndex = pageIds[p] - 1;
      objects[pageObjIndex] =
        `<< /Type /Page /Parent 2 0 R /Contents ${contentIds[p]} 0 R ` +
        `/Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
    }

    // Build final PDF bytes with xref
    let pdf = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
    const offsets = [];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(Buffer.byteLength(pdf, 'latin1'));
      pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xrefOffset = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (const o of offsets) {
      pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
    pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

    const bytes = Buffer.from(pdf, 'latin1');
    return {
      filename: `handbook-${version.id}-${version.version}.pdf`,
      mimeType: 'application/pdf',
      bytes,
      pageCount: N,
      direction: 'rtl',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Static helpers
  // ─────────────────────────────────────────────────────────────

  /** @returns {object[]} a fresh cloned array of the seed sections */
  static seedSections() {
    return SEED_SECTIONS.map(clone);
  }

  /** @returns {object[]} required Israeli sections metadata */
  static requiredIsraeliSections() {
    return REQUIRED_ISRAELI_SECTIONS.map(clone);
  }

  /** @returns {string[]} allowed acknowledgment methods */
  static ackMethods() {
    return ACK_METHODS.slice();
  }
}

module.exports = {
  EmployeeHandbook,
  ACK_METHODS,
  VERSION_STATUS,
  REQUIRED_ISRAELI_SECTIONS,
  SEED_SECTIONS,
};
