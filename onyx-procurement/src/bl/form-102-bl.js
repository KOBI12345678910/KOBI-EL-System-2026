/**
 * form-102-bl.js — טופס 102 למוסד לביטוח לאומי (BL-specific)
 * Agent Y-012 — Israeli National Insurance (NII) dedicated Form 102 exporter.
 *
 * Complements the Income-Tax version (Y-003 / tax-exports/form-102-xml.js).
 * This module focuses on the NII (מוסד לביטוח לאומי) portion only:
 *   - Per-employee דמי ביטוח לאומי (employee + employer)
 *   - Per-employee מס בריאות (employee only)
 *   - Sectoral rate adjustments (קיבוץ, אבטחה, חקלאות)
 *   - Status codes (בעל שליטה / עצמאי במעמד שכיר / עובד זר /
 *     אשרת ת.ז ביקור / נוער / גמלאי)
 *   - Fixed-width payroll file export (BL required format)
 *   - Response-file parser (ack / reject)
 *   - Late-payment interest calculator
 *
 * Rule: לא מוחקים — רק משדרגים ומגדלים (additive-only).
 * Zero dependencies. Pure Node. Bilingual (Hebrew + English) constants.
 *
 * Sources: תקנות הביטוח הלאומי, לוח א' 2026; חוק ביטוח בריאות ממלכתי;
 *          הנחיות מוסד לביטוח לאומי — מבנה קובץ דיווח שכר 102 (2026).
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// 2026 STATUTORY CONSTANTS — Bituach Leumi / Health Tax
// Values match onyx-procurement/src/payroll/wage-slip-calculator.js
// (kept in sync — single source of truth for rates)
// ═══════════════════════════════════════════════════════════════

const BL_CONSTANTS_2026 = Object.freeze({
  // Period validity
  YEAR: 2026,

  // ─── Thresholds (per-month) ────────────────────────────────
  // סף מופחת: 60% של השכר הממוצע במשק ≈ ₪7,522/חודש
  MONTHLY_THRESHOLD: 7522,
  // תקרה מרבית לחיוב דמי ביטוח ≈ ₪49,030/חודש (5 × שכר ממוצע)
  MONTHLY_CEILING: 49030,

  // ─── Employee rates (דמי ביטוח לאומי — עובד) ──────────────
  EMPLOYEE: Object.freeze({
    LOW_RATE: 0.004,   // 0.4% (עד הסף המופחת)
    HIGH_RATE: 0.07,   // 7%   (מעל הסף ועד התקרה)
  }),

  // ─── Employer rates (דמי ביטוח לאומי — מעסיק) ─────────────
  EMPLOYER: Object.freeze({
    LOW_RATE: 0.0355,  // 3.55%
    HIGH_RATE: 0.076,  // 7.6%
  }),

  // ─── Health tax rates (מס בריאות — עובד בלבד) ─────────────
  HEALTH: Object.freeze({
    LOW_RATE: 0.031,   // 3.1%
    HIGH_RATE: 0.05,   // 5%
  }),

  // ─── Interest (ריבית פיגורים) ──────────────────────────────
  // סעיף 359 לחוק הביטוח הלאומי — ריבית פיגורים בגין חוב
  // בפועל ≈ 4% לשנה (ריבית פריים פחות 2%) לחישוב בסיסי.
  INTEREST_ANNUAL_RATE: 0.04,
  INTEREST_DAYS_IN_YEAR: 365,

  ROUND_TO: 2,
});

// ═══════════════════════════════════════════════════════════════
// STATUS CODES (סיווג מבוטח)
// ═══════════════════════════════════════════════════════════════

const STATUS_CODES = Object.freeze({
  /** עובד שכיר רגיל */
  REGULAR:        { code: '01', he: 'שכיר רגיל',            en: 'Regular employee' },
  /** בעל שליטה בחברת מעטים */
  CONTROLLING:    { code: '02', he: 'בעל שליטה',             en: 'Controlling shareholder' },
  /** עצמאי במעמד שכיר (חברת יחיד) */
  SELF_AS_EMP:    { code: '03', he: 'עצמאי במעמד שכיר',      en: 'Self-employed as employee' },
  /** עובד זר (חוק עובדים זרים) */
  FOREIGN:        { code: '04', he: 'עובד זר',                en: 'Foreign worker' },
  /** מחזיק אשרת ת.ז. ביקור (B-1) */
  VISITOR_VISA:   { code: '05', he: 'אשרת ת.ז. ביקור',        en: 'Visitor visa (B-1)' },
  /** נוער עד גיל 18 */
  YOUTH:          { code: '06', he: 'נוער',                    en: 'Youth (under 18)' },
  /** גמלאי / פנסיונר */
  RETIREE:        { code: '07', he: 'גמלאי',                   en: 'Retiree / pensioner' },
});

/** Hebrew label → canonical code */
const HE_STATUS_ALIASES = Object.freeze({
  'שכיר':               STATUS_CODES.REGULAR.code,
  'שכיר רגיל':           STATUS_CODES.REGULAR.code,
  'רגיל':                STATUS_CODES.REGULAR.code,
  'בעל שליטה':           STATUS_CODES.CONTROLLING.code,
  'עצמאי במעמד שכיר':    STATUS_CODES.SELF_AS_EMP.code,
  'עובד זר':             STATUS_CODES.FOREIGN.code,
  'אשרת ת.ז ביקור':      STATUS_CODES.VISITOR_VISA.code,
  'אשרת ת.ז. ביקור':     STATUS_CODES.VISITOR_VISA.code,
  'נוער':                STATUS_CODES.YOUTH.code,
  'גמלאי':               STATUS_CODES.RETIREE.code,
  'פנסיונר':             STATUS_CODES.RETIREE.code,
});

// ═══════════════════════════════════════════════════════════════
// SECTORAL RATE ADJUSTMENTS
// (תעריפים מיוחדים לענפים / מגזרים)
// ═══════════════════════════════════════════════════════════════

const SECTORS = Object.freeze({
  STANDARD: {
    code: 'STD', he: 'רגיל', en: 'Standard',
    employerMul: 1.0, employeeMul: 1.0, healthMul: 1.0,
  },
  KIBBUTZ: {
    code: 'KIB', he: 'קיבוץ', en: 'Kibbutz',
    // קיבוץ: תעריף מעסיק מופחת בשיעור ~7% (הנחה היסטורית)
    employerMul: 0.93, employeeMul: 1.0, healthMul: 1.0,
  },
  SECURITY: {
    code: 'SEC', he: 'אבטחה', en: 'Security',
    // חברות שמירה/אבטחה — תוספת מעסיק עקב חשיפה מוגברת (0.2%)
    employerMul: 1.0, employeeMul: 1.0, healthMul: 1.0,
    employerAddRate: 0.002,
  },
  AGRICULTURE: {
    code: 'AGR', he: 'חקלאות', en: 'Agriculture',
    // חקלאות — תעריף מעסיק מופחת בשיעור ~15%
    employerMul: 0.85, employeeMul: 1.0, healthMul: 1.0,
  },
});

const HE_SECTOR_ALIASES = Object.freeze({
  'רגיל':    'STANDARD',
  'קיבוץ':  'KIBBUTZ',
  'מושב':   'KIBBUTZ',
  'אבטחה':  'SECURITY',
  'שמירה':  'SECURITY',
  'חקלאות': 'AGRICULTURE',
});

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function round(n, decimals = BL_CONSTANTS_2026.ROUND_TO) {
  const factor = Math.pow(10, decimals);
  return Math.round(Number(n || 0) * factor) / factor;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function padLeft(s, len, ch = ' ') {
  s = String(s == null ? '' : s);
  if (s.length >= len) return s.slice(-len);
  return ch.repeat(len - s.length) + s;
}

function padRight(s, len, ch = ' ') {
  s = String(s == null ? '' : s);
  if (s.length >= len) return s.slice(0, len);
  return s + ch.repeat(len - s.length);
}

/** Format amount for fixed-width file: agorot, zero-padded, 12 digits. */
function fmtAmount12(n) {
  const agorot = Math.round(num(n) * 100);
  return padLeft(String(agorot), 12, '0');
}

function normalizeStatusCode(input) {
  if (input == null) return STATUS_CODES.REGULAR.code;
  const s = String(input).trim();
  if (!s) return STATUS_CODES.REGULAR.code;
  // exact code?
  for (const k of Object.keys(STATUS_CODES)) {
    if (STATUS_CODES[k].code === s) return STATUS_CODES[k].code;
  }
  // Hebrew alias
  if (HE_STATUS_ALIASES[s]) return HE_STATUS_ALIASES[s];
  // English key (REGULAR / CONTROLLING / ...)
  const up = s.toUpperCase();
  if (STATUS_CODES[up]) return STATUS_CODES[up].code;
  return STATUS_CODES.REGULAR.code;
}

function resolveSector(input) {
  if (input == null) return SECTORS.STANDARD;
  if (typeof input === 'object' && input.code) return input;
  const s = String(input).trim();
  if (!s) return SECTORS.STANDARD;
  const up = s.toUpperCase();
  if (SECTORS[up]) return SECTORS[up];
  if (HE_SECTOR_ALIASES[s]) return SECTORS[HE_SECTOR_ALIASES[s]];
  for (const k of Object.keys(SECTORS)) {
    if (SECTORS[k].code === up) return SECTORS[k];
  }
  return SECTORS.STANDARD;
}

function assertPeriod(period) {
  if (!period || typeof period !== 'object') {
    throw new TypeError('form-102-bl: period is required ({year, month})');
  }
  const y = Number(period.year);
  const m = Number(period.month);
  if (!(y >= 1990 && y <= 2100)) throw new RangeError('form-102-bl: period.year out of range');
  if (!(m >= 1 && m <= 12)) throw new RangeError('form-102-bl: period.month must be 1..12');
  return { year: y, month: m };
}

function periodString(period) {
  const { year, month } = period;
  return `${year}${String(month).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════
// CORE CALCULATION — single employee
// ═══════════════════════════════════════════════════════════════

/**
 * Compute Bituach Leumi + Health tax for one month, one employee.
 *
 * @param {object} emp                   employee record
 * @param {number} emp.grossWage         gross monthly wage in NIS
 * @param {string} [emp.statusCode]      status code or Hebrew alias (default: Regular)
 * @param {string} [emp.sector]          sector code / Hebrew alias (default: STANDARD)
 * @param {boolean} [emp.exemptFromBL]   e.g. youth under 18 may be exempt
 * @param {number} [emp.workDays]        informational (stored in output)
 *
 * @returns {object} per-employee breakdown
 */
function computeEmployeeBL(emp = {}) {
  const gross = Math.max(0, num(emp.grossWage));
  const status = normalizeStatusCode(emp.statusCode);
  const sector = resolveSector(emp.sector);

  const T = BL_CONSTANTS_2026.MONTHLY_THRESHOLD;
  const C = BL_CONSTANTS_2026.MONTHLY_CEILING;

  // clamp insurable base at the ceiling
  const insurable = Math.min(gross, C);
  const lowBase = Math.min(insurable, T);
  const highBase = Math.max(0, insurable - T);

  // ─── employee BL ────────────────────────────────────────
  let employeeBL = lowBase * BL_CONSTANTS_2026.EMPLOYEE.LOW_RATE
                 + highBase * BL_CONSTANTS_2026.EMPLOYEE.HIGH_RATE;
  employeeBL *= sector.employeeMul;

  // ─── employer BL ────────────────────────────────────────
  let employerBL = lowBase * BL_CONSTANTS_2026.EMPLOYER.LOW_RATE
                 + highBase * BL_CONSTANTS_2026.EMPLOYER.HIGH_RATE;
  employerBL *= sector.employerMul;
  if (sector.employerAddRate) {
    employerBL += insurable * sector.employerAddRate;
  }

  // ─── health tax (employee only) ─────────────────────────
  let healthTax = lowBase * BL_CONSTANTS_2026.HEALTH.LOW_RATE
                + highBase * BL_CONSTANTS_2026.HEALTH.HIGH_RATE;
  healthTax *= sector.healthMul;

  // ─── status-code adjustments ────────────────────────────
  // Controlling shareholder — no BL employer portion on self
  // (they pay as self-employed; the company still withholds employee portion).
  if (status === STATUS_CODES.CONTROLLING.code) {
    employerBL = 0;
  }
  // Foreign worker / visitor visa — health tax does NOT apply
  // (foreign workers are not in the national health system).
  if (status === STATUS_CODES.FOREIGN.code || status === STATUS_CODES.VISITOR_VISA.code) {
    healthTax = 0;
  }
  // Youth (under 18) — employer portion reduced to low rate only
  // (historical statutory reduction; employee side unchanged).
  if (status === STATUS_CODES.YOUTH.code) {
    employerBL = lowBase * BL_CONSTANTS_2026.EMPLOYER.LOW_RATE * sector.employerMul;
  }
  // Retiree — only employer portion on pension; no employee BL.
  if (status === STATUS_CODES.RETIREE.code) {
    employeeBL = 0;
    healthTax = lowBase * BL_CONSTANTS_2026.HEALTH.LOW_RATE
              + highBase * BL_CONSTANTS_2026.HEALTH.HIGH_RATE;
  }
  // Explicit exemption flag
  if (emp.exemptFromBL) {
    employeeBL = 0;
    employerBL = 0;
    healthTax = 0;
  }

  employeeBL = round(employeeBL);
  employerBL = round(employerBL);
  healthTax  = round(healthTax);

  return {
    id: emp.id || emp.employeeId || emp.tz || null,
    tz: emp.tz || emp.idNumber || null,
    name: emp.name || emp.fullName || null,
    statusCode: status,
    statusLabel: _statusLabel(status),
    sector: sector.code,
    sectorLabel: sector.he,
    grossWage: round(gross),
    insurableBase: round(insurable),
    lowBase: round(lowBase),
    highBase: round(highBase),
    workDays: num(emp.workDays) || null,
    employeeBL,
    employerBL,
    healthTax,
    totalEmployee: round(employeeBL + healthTax),
    totalBL: round(employeeBL + employerBL),
    totalAll: round(employeeBL + employerBL + healthTax),
  };
}

function _statusLabel(code) {
  for (const k of Object.keys(STATUS_CODES)) {
    if (STATUS_CODES[k].code === code) return STATUS_CODES[k].he;
  }
  return '';
}

// ═══════════════════════════════════════════════════════════════
// generate102BL — the main entry point
// ═══════════════════════════════════════════════════════════════

/**
 * Generate the 102-BL report for a period.
 *
 * @param {object} input
 * @param {{year:number, month:number}} input.period
 * @param {Array<object>} input.employees    list of employee records
 * @param {object} input.employer            employer info (used in file header)
 * @returns {{
 *   period: {year:number,month:number},
 *   employer: object,
 *   employees: Array<object>,
 *   totals: object,
 *   generatedAt: string,
 * }}
 */
function generate102BL({ period, employees, employer } = {}) {
  const p = assertPeriod(period);
  const list = Array.isArray(employees) ? employees : [];
  const emp = employer || {};

  const rows = list.map(e => computeEmployeeBL(e));

  const totals = rows.reduce((t, r) => {
    t.count += 1;
    t.grossWages   = round(t.grossWages   + r.grossWage);
    t.insurable    = round(t.insurable    + r.insurableBase);
    t.employeeBL   = round(t.employeeBL   + r.employeeBL);
    t.employerBL   = round(t.employerBL   + r.employerBL);
    t.healthTax    = round(t.healthTax    + r.healthTax);
    t.totalBL      = round(t.totalBL      + r.totalBL);
    t.totalAll     = round(t.totalAll     + r.totalAll);
    return t;
  }, {
    count: 0,
    grossWages: 0,
    insurable: 0,
    employeeBL: 0,
    employerBL: 0,
    healthTax: 0,
    totalBL: 0,
    totalAll: 0,
  });

  // Grand total the employer must remit to BL this period
  totals.totalToRemit = round(totals.employeeBL + totals.employerBL + totals.healthTax);

  return {
    formCode: '102BL',
    formTitle_he: 'טופס 102 — דיווח חודשי למוסד לביטוח לאומי',
    formTitle_en: 'Form 102 — Monthly National Insurance report',
    period: p,
    periodString: periodString(p),
    employer: {
      employerId:   emp.employerId   || emp.tikNikuyim || null,
      employerName: emp.employerName || emp.name       || null,
      tikNikuyim:   emp.tikNikuyim   || emp.employerId || null,
      branchCode:   emp.branchCode   || null,
      address:      emp.address      || null,
    },
    employees: rows,
    totals,
    generatedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// FIXED-WIDTH FILE EXPORT — BL required format
// ═══════════════════════════════════════════════════════════════
//
// Record layout (per מוסד לביטוח לאומי — מבנה קובץ דיווח שכר):
//
//   HEADER RECORD (type 'H'):
//     pos   1 len  1  record type              'H'
//     pos   2 len  9  tik nikuyim (employer)   9 digits, zero-padded
//     pos  11 len  6  period YYYYMM
//     pos  17 len 50  employer legal name      right-padded spaces
//     pos  67 len  8  generation date YYYYMMDD
//     pos  75 len  6  filler spaces
//     total: 80 chars
//
//   DETAIL RECORD (type 'D'), one per employee:
//     pos   1 len  1  record type              'D'
//     pos   2 len  9  employee tz              9 digits, zero-padded
//     pos  11 len  2  status code              '01'..'07'
//     pos  13 len  3  sector code              'STD'/'KIB'/'SEC'/'AGR'
//     pos  16 len 30  employee name            right-padded spaces
//     pos  46 len 12  gross wage (agorot)      zero-padded
//     pos  58 len 12  employee BL (agorot)     zero-padded
//     pos  70 len 12  employer BL (agorot)     zero-padded
//     pos  82 len 12  health tax (agorot)      zero-padded
//     pos  94 len  2  work days                zero-padded
//     pos  96 len  5  filler spaces
//     total: 100 chars
//
//   FOOTER RECORD (type 'T'):
//     pos   1 len  1  record type              'T'
//     pos   2 len  6  record count             zero-padded
//     pos   8 len 14  total gross (agorot)     zero-padded
//     pos  22 len 14  total employee BL        zero-padded
//     pos  36 len 14  total employer BL        zero-padded
//     pos  50 len 14  total health tax         zero-padded
//     pos  64 len 14  grand total to remit     zero-padded
//     pos  78 len  3  filler spaces
//     total: 80 chars
//
// Lines are separated by CRLF ('\r\n'). File is encoded UTF-8.
// ═══════════════════════════════════════════════════════════════

const FILE_FORMAT = Object.freeze({
  HEADER_LEN: 80,
  DETAIL_LEN: 100,
  FOOTER_LEN: 80,
  EOL: '\r\n',
});

function buildHeaderRecord(report) {
  const empId = String(report.employer.employerId || report.employer.tikNikuyim || '')
    .replace(/\D+/g, '');
  const parts = [
    'H',
    padLeft(empId, 9, '0'),
    report.periodString,
    padRight(report.employer.employerName || '', 50),
    _genDateCompact(report.generatedAt),
    padRight('', 6),
  ];
  return _assembleLine(parts, FILE_FORMAT.HEADER_LEN);
}

function buildDetailRecord(row) {
  const tz = String(row.tz || row.id || '').replace(/\D+/g, '');
  const parts = [
    'D',
    padLeft(tz, 9, '0'),
    padLeft(row.statusCode || '01', 2, '0'),
    padRight(row.sector || 'STD', 3),
    padRight(row.name || '', 30),
    fmtAmount12(row.grossWage),
    fmtAmount12(row.employeeBL),
    fmtAmount12(row.employerBL),
    fmtAmount12(row.healthTax),
    padLeft(String(Math.min(99, Math.max(0, num(row.workDays)))), 2, '0'),
    padRight('', 5),
  ];
  return _assembleLine(parts, FILE_FORMAT.DETAIL_LEN);
}

function buildFooterRecord(totals) {
  const parts = [
    'T',
    padLeft(String(totals.count), 6, '0'),
    _agorot14(totals.grossWages),
    _agorot14(totals.employeeBL),
    _agorot14(totals.employerBL),
    _agorot14(totals.healthTax),
    _agorot14(totals.totalToRemit),
    padRight('', 3),
  ];
  return _assembleLine(parts, FILE_FORMAT.FOOTER_LEN);
}

function _agorot14(n) {
  const ag = Math.round(num(n) * 100);
  return padLeft(String(ag), 14, '0');
}

function _assembleLine(parts, expectedLen) {
  let line = parts.join('');
  if (line.length < expectedLen) line = padRight(line, expectedLen);
  if (line.length > expectedLen) line = line.slice(0, expectedLen);
  return line;
}

function _genDateCompact(iso) {
  try {
    const d = iso ? new Date(iso) : new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${m}${dd}`;
  } catch { return '00000000'; }
}

/**
 * Build the fixed-width BL payroll file.
 *
 * @param {object} report   output of generate102BL
 * @returns {{filename:string, content:string, bytes:number, lines:number}}
 */
function buildPayrollFile(report) {
  if (!report || !report.employees) {
    throw new TypeError('form-102-bl.buildPayrollFile: report is required');
  }
  const lines = [];
  lines.push(buildHeaderRecord(report));
  for (const row of report.employees) {
    lines.push(buildDetailRecord(row));
  }
  lines.push(buildFooterRecord(report.totals));
  const content = lines.join(FILE_FORMAT.EOL) + FILE_FORMAT.EOL;
  const empId = String(report.employer.employerId || report.employer.tikNikuyim || 'unknown')
    .replace(/\D+/g, '') || 'unknown';
  const filename = `BL102_${empId}_${report.periodString}.txt`;
  return {
    filename,
    content,
    bytes: Buffer.byteLength(content, 'utf8'),
    lines: lines.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// importBLResponse — parse BL acknowledgment response file
// ═══════════════════════════════════════════════════════════════
//
// Response layout (textual; received from בל שירות מקוון):
//   Line 1:  'ACK' | 'REJ' | 'PARTIAL'
//   Line 2:  period YYYYMM
//   Line 3:  tik nikuyim
//   Line 4:  timestamp YYYYMMDDHHMMSS
//   Line 5:  total records processed
//   Line 6+: per-record results — one per rejected/warning record:
//            <type:1> <tz:9> <code:3> <message...>
//            type = 'E' (error) | 'W' (warning) | 'I' (info)
//   Last:    'END' sentinel
//
// Also tolerates JSON payloads with {status, period, records:[...]}
// ═══════════════════════════════════════════════════════════════

function importBLResponse(file) {
  if (file == null) throw new TypeError('form-102-bl.importBLResponse: file required');

  let text;
  if (Buffer.isBuffer(file)) text = file.toString('utf8');
  else if (typeof file === 'string') text = file;
  else if (typeof file === 'object' && typeof file.content === 'string') text = file.content;
  else throw new TypeError('form-102-bl.importBLResponse: unsupported input');

  // strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  // Try JSON first
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return _normalizeJsonResponse(JSON.parse(trimmed)); } catch { /* fall through */ }
  }

  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.length);
  if (!lines.length) {
    return { status: 'UNKNOWN', period: null, tikNikuyim: null, timestamp: null,
      totalRecords: 0, records: [], errors: ['empty file'], warnings: [], ok: false };
  }

  const statusRaw = (lines[0] || '').toUpperCase().trim();
  const status = (/^ACK/.test(statusRaw) ? 'ACK'
                : /^REJ/.test(statusRaw) ? 'REJ'
                : /^PART/.test(statusRaw) ? 'PARTIAL'
                : 'UNKNOWN');
  const period = lines[1] ? _parsePeriod(lines[1]) : null;
  const tikNikuyim = lines[2] ? lines[2].replace(/\D+/g, '') : null;
  const timestamp = lines[3] ? _parseTimestamp(lines[3]) : null;
  const totalRecords = Number((lines[4] || '0').replace(/\D+/g, '')) || 0;

  const records = [];
  const errors = [];
  const warnings = [];

  for (let i = 5; i < lines.length; i++) {
    const l = lines[i];
    if (!l || /^END\b/i.test(l)) continue;
    const m = l.match(/^([EWI])\s+(\d{1,9})\s+(\S+)\s*(.*)$/);
    if (m) {
      const rec = {
        severity: m[1] === 'E' ? 'error' : m[1] === 'W' ? 'warning' : 'info',
        tz: m[2].padStart(9, '0'),
        code: m[3],
        message: (m[4] || '').trim(),
      };
      records.push(rec);
      if (rec.severity === 'error') errors.push(`${rec.tz} ${rec.code}: ${rec.message}`);
      if (rec.severity === 'warning') warnings.push(`${rec.tz} ${rec.code}: ${rec.message}`);
    } else {
      // free-form line — treat as note
      records.push({ severity: 'info', tz: null, code: null, message: l });
    }
  }

  return {
    status,
    ok: status === 'ACK',
    period,
    tikNikuyim,
    timestamp,
    totalRecords,
    records,
    errors,
    warnings,
  };
}

function _normalizeJsonResponse(obj) {
  const status = (obj.status || obj.result || 'UNKNOWN').toString().toUpperCase();
  return {
    status,
    ok: status === 'ACK',
    period: obj.period ? _parsePeriod(String(obj.period)) : null,
    tikNikuyim: obj.tikNikuyim || obj.employerId || null,
    timestamp: obj.timestamp || obj.ts || null,
    totalRecords: Number(obj.totalRecords || (obj.records || []).length || 0),
    records: Array.isArray(obj.records) ? obj.records : [],
    errors: Array.isArray(obj.errors) ? obj.errors : [],
    warnings: Array.isArray(obj.warnings) ? obj.warnings : [],
  };
}

function _parsePeriod(s) {
  const d = String(s).replace(/\D+/g, '');
  if (d.length < 6) return null;
  return { year: Number(d.slice(0, 4)), month: Number(d.slice(4, 6)) };
}

function _parseTimestamp(s) {
  const d = String(s).replace(/\D+/g, '');
  if (d.length < 8) return null;
  const y = d.slice(0, 4), m = d.slice(4, 6), dd = d.slice(6, 8);
  const hh = d.slice(8, 10) || '00', mm = d.slice(10, 12) || '00', ss = d.slice(12, 14) || '00';
  return `${y}-${m}-${dd}T${hh}:${mm}:${ss}Z`;
}

// ═══════════════════════════════════════════════════════════════
// computeInterest — late-payment interest (ריבית פיגורים)
// ═══════════════════════════════════════════════════════════════

/**
 * Compute BL late-payment interest.
 * Formula (simple daily interest):
 *     interest = amount × annualRate × (daysLate / 365)
 *
 * @param {number} amount       principal (NIS)
 * @param {number} daysLate     number of days past due
 * @param {object} [opts]
 * @param {number} [opts.annualRate]  override annual rate (default: 0.04)
 * @returns {{amount:number, daysLate:number, annualRate:number, interest:number, total:number}}
 */
function computeInterest(amount, daysLate, opts = {}) {
  const principal = Math.max(0, num(amount));
  const days = Math.max(0, Math.floor(num(daysLate)));
  const rate = Number.isFinite(+opts.annualRate) && +opts.annualRate >= 0
    ? +opts.annualRate
    : BL_CONSTANTS_2026.INTEREST_ANNUAL_RATE;
  const daysInYear = BL_CONSTANTS_2026.INTEREST_DAYS_IN_YEAR;
  const interest = round(principal * rate * (days / daysInYear));
  return {
    amount: round(principal),
    daysLate: days,
    annualRate: rate,
    interest,
    total: round(principal + interest),
  };
}

// ═══════════════════════════════════════════════════════════════
// VALIDATE — light schema check (non-throwing)
// ═══════════════════════════════════════════════════════════════

function validate(input) {
  const errors = [];
  if (!input || typeof input !== 'object') {
    errors.push('input: object required');
    return errors;
  }
  if (!input.period) errors.push('period: required');
  else {
    try { assertPeriod(input.period); }
    catch (e) { errors.push(`period: ${e.message}`); }
  }
  if (!input.employer || !input.employer.employerId) {
    errors.push('employer.employerId: required');
  }
  if (!Array.isArray(input.employees)) {
    errors.push('employees: array required');
  } else {
    input.employees.forEach((e, i) => {
      if (e == null || typeof e !== 'object') {
        errors.push(`employees[${i}]: object required`);
        return;
      }
      if (!Number.isFinite(+e.grossWage) || +e.grossWage < 0) {
        errors.push(`employees[${i}].grossWage: non-negative number required`);
      }
    });
  }
  return errors;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // constants
  BL_CONSTANTS_2026,
  STATUS_CODES,
  SECTORS,
  FILE_FORMAT,

  // main API
  generate102BL,
  computeEmployeeBL,
  buildPayrollFile,
  importBLResponse,
  computeInterest,
  validate,

  // low-level helpers (exposed for testing)
  _internal: {
    normalizeStatusCode,
    resolveSector,
    buildHeaderRecord,
    buildDetailRecord,
    buildFooterRecord,
    fmtAmount12,
    padLeft,
    padRight,
    round,
  },
};
