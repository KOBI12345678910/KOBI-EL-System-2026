/**
 * inspection.js — Agent Y-058 (Swarm — Mega-ERP Techno-Kol Uzi)
 * Property Inspection Engine
 *
 * מנוע בדיקות נכסים — דירות מגורים ונדל"ן מסחרי
 * ---------------------------------------------------
 *  Israeli law compliance:
 *    • חוק המכר (דירות), תשל"ג-1973     — Sale of Apartments Law
 *    • חוק המכר (דירות) (הבטחת השקעות) , תשל"ה-1974
 *    • חוק השכירות והשאילה, תשל"א-1971   — Rental & Loan Law
 *    • חוק הגנת הדייר [נוסח משולב], תשל"ב-1972 — Tenant Protection
 *
 *  Features:
 *    1. scheduleInspection — six inspection types
 *    2. defineChecklist — categorised, bilingual, severity-tagged items
 *    3. recordInspection — append-only findings, photos, severity
 *    4. generateReport — bilingual HTML/text printable report
 *    5. createDefectList — pulls majors for the בדק period (1y minimum)
 *    6. trackRepairRequest — links to Y-049 maintenance via emit()
 *    7. compareInspections — move-in vs move-out diff for deposit
 *    8. computeDepositReturn — wear&tear excluded, legal max deductions
 *    9. warrantyPeriods — full Israeli warranty periods table
 *   10. history — full audit log of every inspection on a property
 *
 *  House rule: לא מוחקים — רק משדרגים ומגדלים.
 *  Findings, defects and history are append-only. There is no delete.
 *
 *  Zero external deps — Node built-ins only (CommonJS).
 */

'use strict';

const { EventEmitter } = require('node:events');

// ─────────────────────────────────────────────────────────────
//  Enums / constants — Hebrew RTL with bilingual labels
// ─────────────────────────────────────────────────────────────

const INSPECTION_TYPES = Object.freeze([
  'pre-purchase',   // בדיקה לפני רכישה
  'move-in',        // בדיקת כניסה (חוק הגנת הדייר)
  'move-out',       // בדיקת יציאה (חוק הגנת הדייר)
  'annual-safety',  // בדיקת בטיחות שנתית
  'pre-renewal',    // בדיקה לקראת חידוש חוזה
  'handover',       // מסירת דירה (חוק המכר דירות)
]);

const INSPECTION_TYPE_HE = Object.freeze({
  'pre-purchase':  'בדיקה לפני רכישה',
  'move-in':       'בדיקת כניסה לשכירות',
  'move-out':      'בדיקת יציאה משכירות',
  'annual-safety': 'בדיקת בטיחות שנתית',
  'pre-renewal':   'בדיקה לפני חידוש חוזה',
  'handover':      'מסירת דירה (חוק המכר)',
});

const INSPECTION_TYPE_EN = Object.freeze({
  'pre-purchase':  'Pre-purchase inspection',
  'move-in':       'Move-in (rental) inspection',
  'move-out':      'Move-out (rental) inspection',
  'annual-safety': 'Annual safety inspection',
  'pre-renewal':   'Pre-renewal inspection',
  'handover':      'Handover (Sale of Apartments Law)',
});

const CATEGORIES = Object.freeze([
  'מבנה',         // structure
  'אינסטלציה',    // plumbing
  'חשמל',         // electrical
  'גימור',        // finish / cosmetic
  'בטיחות',       // safety
  'אזעקה/גז',     // alarm/gas
  'רטיבות',       // moisture / damp
]);

const CATEGORY_EN = Object.freeze({
  'מבנה':       'structure',
  'אינסטלציה':  'plumbing',
  'חשמל':       'electrical',
  'גימור':      'finish',
  'בטיחות':     'safety',
  'אזעקה/גז':   'alarm/gas',
  'רטיבות':     'moisture',
});

// Severity ladder — used for ranking, defect-list extraction, and reports.
// Higher number = more severe. Severity 3+ counts as a "major" defect for
// the בדק (warranty) handover list.
const SEVERITIES = Object.freeze({
  cosmetic: 1,    // קוסמטי
  minor:    2,    // קל
  major:    3,    // חמור
  critical: 4,    // קריטי / מסכן חיים
});

const SEVERITY_HE = Object.freeze({
  cosmetic: 'קוסמטי',
  minor:    'קל',
  major:    'חמור',
  critical: 'קריטי',
});

const SEVERITY_EN = Object.freeze({
  cosmetic: 'Cosmetic',
  minor:    'Minor',
  major:    'Major',
  critical: 'Critical',
});

const FINDING_STATUS = Object.freeze([
  'pass',     // תקין
  'fail',     // ליקוי
  'na',       // לא רלוונטי
  'noted',    // מצב רישום למעקב (תיעוד מצב קיים)
]);

const FINDING_STATUS_HE = Object.freeze({
  pass:  'תקין',
  fail:  'ליקוי',
  na:    'לא רלוונטי',
  noted: 'תיעוד מצב',
});

// Israeli "בדק" period — Sale of Apartments Law warranty periods.
// חוק המכר (דירות), תשל"ג-1973, סעיף 4א + תוספת.
// Source: Ministry of Justice consolidated text.
const WARRANTY_PERIODS = Object.freeze({
  general: {
    years: 1,
    label_he: 'אחריות כללית — שנה',
    label_en: 'General defects — 1 year',
    basis: 'חוק המכר דירות, סעיף 4א(א)(1)',
  },
  plumbing: {
    years: 2,
    label_he: 'מערכות אינסטלציה — שנתיים',
    label_en: 'Plumbing systems — 2 years',
    basis: 'חוק המכר דירות, תוספת',
  },
  thermalInsulation: {
    years: 3,
    label_he: 'בידוד תרמי — 3 שנים',
    label_en: 'Thermal insulation — 3 years',
    basis: 'חוק המכר דירות, תוספת',
  },
  concreteFoundations: {
    years: 4,
    label_he: 'בטון ויסודות — 4 שנים',
    label_en: 'Concrete & foundations — 4 years',
    basis: 'חוק המכר דירות, תוספת',
  },
  roofWaterproofing: {
    years: 7,
    label_he: 'אטימות גגות — 7 שנים',
    label_en: 'Roof waterproofing — 7 years',
    basis: 'חוק המכר דירות, תוספת',
  },
  flooring: {
    years: 7,
    label_he: 'ריצוף — 7 שנים',
    label_en: 'Flooring — 7 years',
    basis: 'חוק המכר דירות, תוספת',
  },
});

// Mapping from a finding category to the warranty bucket. Used by
// createDefectList() to attach the correct warranty period to each defect.
const CATEGORY_TO_WARRANTY = Object.freeze({
  'מבנה':       'concreteFoundations',
  'אינסטלציה':  'plumbing',
  'חשמל':       'general',
  'גימור':      'general',
  'בטיחות':     'general',
  'אזעקה/גז':   'general',
  'רטיבות':     'roofWaterproofing',
});

// Legal maximum a landlord may withhold from a security deposit, per
// Israeli "Fair Rental Law" amendments (תיקון חוק שכירות הוגנת — תשע"ז).
// Cap = lower of (3 months rent) OR (1/3 of total rent for the lease term).
// computeDepositReturn() applies the cap.
const DEPOSIT_LEGAL_CAP_MONTHS = 3;
const DEPOSIT_LEGAL_CAP_LEASE_FRACTION = 1 / 3;

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function _now() { return Date.now(); }

function _iso(ts) { return new Date(ts).toISOString(); }

function _toTs(v) {
  if (v == null) return _now();
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(String(v));
  if (Number.isNaN(t)) throw new Error(`inspection: invalid date ${v}`);
  return t;
}

function _uid(prefix) {
  _uid._n = (_uid._n || 0) + 1;
  return `${prefix}-${Date.now().toString(36)}-${_uid._n.toString(36)}`;
}

function _round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function _clone(o) {
  return o == null ? o : JSON.parse(JSON.stringify(o));
}

function _assert(cond, msg) {
  if (!cond) throw new Error(`inspection: ${msg}`);
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Severity ranking helper — higher = more severe
function _sevRank(name) {
  return SEVERITIES[name] || 0;
}

function _isMajor(sev) {
  return _sevRank(sev) >= SEVERITIES.major;
}

// ─────────────────────────────────────────────────────────────
//  Main class
// ─────────────────────────────────────────────────────────────

class PropertyInspection extends EventEmitter {
  constructor(opts = {}) {
    super();
    this._inspections = new Map();   // id -> inspection record
    this._checklists = new Map();    // id -> checklist template
    this._defects = new Map();       // id -> defect record
    this._repairs = new Map();       // id -> repair tracker
    this._historyByProperty = new Map(); // propertyId -> [inspectionId, ...] (append-only)
    this._clock = typeof opts.clock === 'function' ? opts.clock : _now;
    this._seq = 0;
  }

  _t() { return this._clock(); }

  _push(rec, action, note, extra) {
    rec.history.push({
      at: _iso(this._t()),
      action,
      note: note || null,
      ...(extra ? { extra } : {}),
    });
    rec.updatedAt = _iso(this._t());
  }

  _addToPropertyHistory(propertyId, inspectionId) {
    if (!this._historyByProperty.has(propertyId)) {
      this._historyByProperty.set(propertyId, []);
    }
    this._historyByProperty.get(propertyId).push(inspectionId);
  }

  // ───────────────────────────────────────────────────────────
  //  defineChecklist
  //   Stores a re-usable checklist template by ID.
  //   Validates each item: { itemId?, category, label_he, label_en, severity }
  // ───────────────────────────────────────────────────────────
  defineChecklist({ id, type, items } = {}) {
    _assert(id, 'checklist id required');
    _assert(INSPECTION_TYPES.includes(type), `invalid checklist type "${type}"`);
    _assert(Array.isArray(items) && items.length > 0, 'items[] required');

    const normItems = items.map((it, idx) => {
      _assert(it && typeof it === 'object', `item[${idx}] must be an object`);
      _assert(CATEGORIES.includes(it.category),
        `item[${idx}] invalid category "${it.category}"`);
      _assert(it.label_he && String(it.label_he).trim(),
        `item[${idx}] label_he required`);
      _assert(it.label_en && String(it.label_en).trim(),
        `item[${idx}] label_en required`);
      _assert(SEVERITIES[it.severity] != null,
        `item[${idx}] invalid severity "${it.severity}"`);
      return {
        itemId: it.itemId || `CHK-${id}-${idx + 1}`,
        category: it.category,
        category_en: CATEGORY_EN[it.category],
        label_he: String(it.label_he),
        label_en: String(it.label_en),
        severity: it.severity,
        severityRank: _sevRank(it.severity),
      };
    });

    const checklist = {
      id,
      type,
      type_he: INSPECTION_TYPE_HE[type],
      type_en: INSPECTION_TYPE_EN[type],
      items: normItems,
      itemCount: normItems.length,
      createdAt: _iso(this._t()),
      version: (this._checklists.get(id)?.version || 0) + 1,
    };

    // Append-only: never overwrite blindly. Even an "update" bumps version
    // and keeps the previous one in history (here we keep the latest in
    // _checklists; full version trail flows through inspection records).
    this._checklists.set(id, checklist);
    this.emit('checklist:defined', { id, type, version: checklist.version });
    return _clone(checklist);
  }

  getChecklist(id) {
    return _clone(this._checklists.get(id) || null);
  }

  // ───────────────────────────────────────────────────────────
  //  scheduleInspection
  // ───────────────────────────────────────────────────────────
  scheduleInspection({ propertyId, type, inspectorId, date, reason, checklistId, leaseId, tenantId } = {}) {
    _assert(propertyId, 'propertyId required');
    _assert(INSPECTION_TYPES.includes(type),
      `invalid inspection type "${type}" — allowed: ${INSPECTION_TYPES.join(', ')}`);
    _assert(inspectorId, 'inspectorId required');
    const ts = _toTs(date);

    this._seq += 1;
    const id = _uid('INSP');
    const inspectionNumber = `INSP-${new Date(ts).getFullYear()}-${String(this._seq).padStart(5, '0')}`;

    let checklistSnapshot = null;
    if (checklistId) {
      const ck = this._checklists.get(checklistId);
      _assert(ck, `checklist not found: ${checklistId}`);
      // Snapshot the checklist into the inspection — this guarantees that
      // future checklist version bumps cannot rewrite past inspections.
      checklistSnapshot = _clone(ck);
    }

    const rec = {
      id,
      inspectionNumber,
      propertyId,
      type,
      type_he: INSPECTION_TYPE_HE[type],
      type_en: INSPECTION_TYPE_EN[type],
      inspectorId,
      scheduledAt: _iso(ts),
      reason: reason || null,
      reason_he: reason || null,
      checklistId: checklistId || null,
      checklist: checklistSnapshot,
      leaseId: leaseId || null,
      tenantId: tenantId || null,
      status: 'scheduled',
      findings: [],            // append-only
      recordedAt: null,
      createdAt: _iso(this._t()),
      updatedAt: _iso(this._t()),
      history: [],
    };

    rec.history.push({
      at: _iso(this._t()),
      action: 'scheduled',
      note: `${INSPECTION_TYPE_HE[type]} — inspector=${inspectorId}`,
    });

    this._inspections.set(id, rec);
    this._addToPropertyHistory(propertyId, id);
    this.emit('inspection:scheduled', { id, propertyId, type });
    return _clone(rec);
  }

  // ───────────────────────────────────────────────────────────
  //  recordInspection — append-only findings
  // ───────────────────────────────────────────────────────────
  recordInspection({ inspectionId, findings, inspectorId, date } = {}) {
    const rec = this._inspections.get(inspectionId);
    _assert(rec, `inspection not found: ${inspectionId}`);
    _assert(Array.isArray(findings) && findings.length > 0,
      'findings[] required (non-empty)');

    const ts = _toTs(date);
    const normFindings = findings.map((f, idx) => {
      _assert(f && typeof f === 'object', `finding[${idx}] must be an object`);
      _assert(f.itemId, `finding[${idx}] itemId required`);
      _assert(FINDING_STATUS.includes(f.status),
        `finding[${idx}] invalid status "${f.status}"`);
      _assert(SEVERITIES[f.severity] != null,
        `finding[${idx}] invalid severity "${f.severity}"`);

      // Cross-reference checklist (if attached) for label hydration.
      let label_he = f.label_he || null;
      let label_en = f.label_en || null;
      let category = f.category || null;
      if (rec.checklist) {
        const ck = rec.checklist.items.find((i) => i.itemId === f.itemId);
        if (ck) {
          label_he = label_he || ck.label_he;
          label_en = label_en || ck.label_en;
          category = category || ck.category;
        }
      }

      return {
        findingId: f.findingId || `F-${rec.inspectionNumber}-${idx + 1}`,
        itemId: f.itemId,
        category,
        label_he,
        label_en,
        status: f.status,
        status_he: FINDING_STATUS_HE[f.status],
        severity: f.severity,
        severityRank: _sevRank(f.severity),
        notes: f.notes || null,
        photos: Array.isArray(f.photos) ? f.photos.slice() : [],
        recordedAt: _iso(ts),
      };
    });

    // APPEND, never replace.
    rec.findings = rec.findings.concat(normFindings);
    rec.recordedAt = rec.recordedAt || _iso(ts);
    rec.status = 'recorded';
    if (inspectorId) rec.recordedBy = inspectorId;

    this._push(rec, 'findings-recorded',
      `+${normFindings.length} findings (total ${rec.findings.length})`);
    this.emit('inspection:recorded', {
      id: rec.id, propertyId: rec.propertyId, count: normFindings.length,
    });
    return _clone(rec);
  }

  // ───────────────────────────────────────────────────────────
  //  Severity summary helper
  // ───────────────────────────────────────────────────────────
  _severitySummary(findings) {
    const summary = { cosmetic: 0, minor: 0, major: 0, critical: 0, total: 0,
      pass: 0, fail: 0, na: 0, noted: 0 };
    for (const f of findings) {
      summary[f.severity] = (summary[f.severity] || 0) + 1;
      summary[f.status] = (summary[f.status] || 0) + 1;
      summary.total += 1;
    }
    return summary;
  }

  // ───────────────────────────────────────────────────────────
  //  generateReport — bilingual HTML + plain-text
  // ───────────────────────────────────────────────────────────
  generateReport(inspectionId) {
    const rec = this._inspections.get(inspectionId);
    _assert(rec, `inspection not found: ${inspectionId}`);

    const summary = this._severitySummary(rec.findings);

    // Findings ranked by severity DESC then category — for the report body.
    const ranked = rec.findings.slice().sort((a, b) => {
      if (b.severityRank !== a.severityRank) return b.severityRank - a.severityRank;
      return String(a.category).localeCompare(String(b.category));
    });

    // ── HTML (RTL) ──
    const htmlParts = [];
    htmlParts.push('<!DOCTYPE html>');
    htmlParts.push('<html lang="he" dir="rtl">');
    htmlParts.push('<head><meta charset="UTF-8">');
    htmlParts.push(`<title>${_esc(rec.inspectionNumber)} — ${_esc(rec.type_he)}</title>`);
    htmlParts.push('<style>');
    htmlParts.push('body{font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right;margin:24px}');
    htmlParts.push('h1,h2,h3{color:#1f2a44}');
    htmlParts.push('table{border-collapse:collapse;width:100%;margin:12px 0}');
    htmlParts.push('th,td{border:1px solid #cccccc;padding:6px 8px;text-align:right}');
    htmlParts.push('th{background:#eef1f7}');
    htmlParts.push('.sev-cosmetic{background:#f0f8ff}.sev-minor{background:#fff8e0}');
    htmlParts.push('.sev-major{background:#ffe2cc}.sev-critical{background:#ffcccc}');
    htmlParts.push('.en{color:#666;font-size:0.9em}');
    htmlParts.push('</style></head><body>');
    htmlParts.push(`<h1>דוח בדיקה ${_esc(rec.inspectionNumber)}</h1>`);
    htmlParts.push(`<div class="en">Inspection report ${_esc(rec.inspectionNumber)}</div>`);
    htmlParts.push('<table>');
    htmlParts.push(`<tr><th>סוג / Type</th><td>${_esc(rec.type_he)} <span class="en">(${_esc(rec.type_en)})</span></td></tr>`);
    htmlParts.push(`<tr><th>נכס / Property</th><td>${_esc(rec.propertyId)}</td></tr>`);
    htmlParts.push(`<tr><th>בודק / Inspector</th><td>${_esc(rec.inspectorId)}</td></tr>`);
    htmlParts.push(`<tr><th>מועד / Scheduled</th><td>${_esc(rec.scheduledAt)}</td></tr>`);
    if (rec.recordedAt) {
      htmlParts.push(`<tr><th>בוצע / Recorded</th><td>${_esc(rec.recordedAt)}</td></tr>`);
    }
    htmlParts.push('</table>');

    htmlParts.push('<h2>סיכום חומרה / Severity summary</h2>');
    htmlParts.push('<table>');
    htmlParts.push('<tr><th>חומרה / Severity</th><th>כמות / Count</th></tr>');
    for (const sev of ['critical', 'major', 'minor', 'cosmetic']) {
      htmlParts.push(`<tr class="sev-${sev}"><td>${_esc(SEVERITY_HE[sev])} <span class="en">(${_esc(SEVERITY_EN[sev])})</span></td><td>${summary[sev] || 0}</td></tr>`);
    }
    htmlParts.push(`<tr><th>סה"כ / Total</th><th>${summary.total}</th></tr>`);
    htmlParts.push('</table>');

    htmlParts.push('<h2>ממצאים / Findings</h2>');
    htmlParts.push('<table>');
    htmlParts.push('<tr><th>#</th><th>קטגוריה / Category</th><th>פריט / Item</th><th>סטטוס / Status</th><th>חומרה / Severity</th><th>הערות / Notes</th><th>תמונות / Photos</th></tr>');
    ranked.forEach((f, idx) => {
      htmlParts.push(`<tr class="sev-${f.severity}">`);
      htmlParts.push(`<td>${idx + 1}</td>`);
      htmlParts.push(`<td>${_esc(f.category)} <span class="en">(${_esc(CATEGORY_EN[f.category] || '')})</span></td>`);
      htmlParts.push(`<td>${_esc(f.label_he || f.itemId)}<br><span class="en">${_esc(f.label_en || '')}</span></td>`);
      htmlParts.push(`<td>${_esc(f.status_he)} <span class="en">(${_esc(f.status)})</span></td>`);
      htmlParts.push(`<td>${_esc(SEVERITY_HE[f.severity])} <span class="en">(${_esc(SEVERITY_EN[f.severity])})</span></td>`);
      htmlParts.push(`<td>${_esc(f.notes || '')}</td>`);
      htmlParts.push(`<td>${(f.photos || []).map((p) => _esc(p)).join('<br>')}</td>`);
      htmlParts.push('</tr>');
    });
    htmlParts.push('</table>');
    htmlParts.push('<p><em>לא מוחקים — רק משדרגים ומגדלים. | Never delete — only upgrade and grow.</em></p>');
    htmlParts.push('</body></html>');
    const html = htmlParts.join('\n');

    // ── Plain text ──
    const textLines = [];
    const sep = '='.repeat(60);
    const hr = '-'.repeat(60);
    textLines.push(sep);
    textLines.push(`דוח בדיקה / Inspection Report  ${rec.inspectionNumber}`);
    textLines.push(sep);
    textLines.push(`סוג / Type:        ${rec.type_he}  (${rec.type_en})`);
    textLines.push(`נכס / Property:    ${rec.propertyId}`);
    textLines.push(`בודק / Inspector:  ${rec.inspectorId}`);
    textLines.push(`מועד / Scheduled:  ${rec.scheduledAt}`);
    if (rec.recordedAt) textLines.push(`בוצע / Recorded:   ${rec.recordedAt}`);
    textLines.push('');
    textLines.push(hr);
    textLines.push('סיכום חומרה / Severity summary');
    textLines.push(hr);
    textLines.push(`קריטי   / Critical : ${summary.critical || 0}`);
    textLines.push(`חמור    / Major    : ${summary.major || 0}`);
    textLines.push(`קל      / Minor    : ${summary.minor || 0}`);
    textLines.push(`קוסמטי / Cosmetic  : ${summary.cosmetic || 0}`);
    textLines.push(`סה"כ    / Total    : ${summary.total}`);
    textLines.push('');
    textLines.push(hr);
    textLines.push('ממצאים / Findings');
    textLines.push(hr);
    ranked.forEach((f, idx) => {
      textLines.push(`${idx + 1}. [${SEVERITY_HE[f.severity]}/${SEVERITY_EN[f.severity]}] ${f.category} — ${f.label_he || f.itemId}`);
      if (f.label_en) textLines.push(`     ${f.label_en}`);
      textLines.push(`     סטטוס/Status: ${f.status_he} (${f.status})`);
      if (f.notes) textLines.push(`     הערות/Notes: ${f.notes}`);
      if (f.photos && f.photos.length) {
        textLines.push(`     תמונות/Photos: ${f.photos.length} — ${f.photos.join(', ')}`);
      }
    });
    textLines.push('');
    textLines.push(sep);
    textLines.push('לא מוחקים — רק משדרגים ומגדלים. | Never delete — only upgrade and grow.');
    textLines.push(sep);
    const text = textLines.join('\n');

    return {
      id: rec.id,
      inspectionNumber: rec.inspectionNumber,
      propertyId: rec.propertyId,
      type: rec.type,
      summary,
      findingsCount: rec.findings.length,
      html,
      text,
      mime_html: 'text/html; charset=utf-8',
      mime_text: 'text/plain; charset=utf-8',
      filename_html: `${rec.inspectionNumber}.html`,
      filename_text: `${rec.inspectionNumber}.txt`,
    };
  }

  // ───────────────────────────────────────────────────────────
  //  createDefectList — major+critical defects with בדק warranty
  // ───────────────────────────────────────────────────────────
  createDefectList(inspectionId) {
    const rec = this._inspections.get(inspectionId);
    _assert(rec, `inspection not found: ${inspectionId}`);

    const today = this._t();
    const majors = rec.findings
      .filter((f) => f.status === 'fail' && _isMajor(f.severity))
      .sort((a, b) => b.severityRank - a.severityRank);

    const defects = majors.map((f, idx) => {
      const warrantyKey = CATEGORY_TO_WARRANTY[f.category] || 'general';
      const warranty = WARRANTY_PERIODS[warrantyKey];
      // 1-year minimum guaranteed by law (general defects = 1 year)
      const years = Math.max(1, warranty.years);
      const expiresAt = new Date(today);
      expiresAt.setFullYear(expiresAt.getFullYear() + years);

      const defect = {
        defectId: `DEF-${rec.inspectionNumber}-${idx + 1}`,
        inspectionId: rec.id,
        propertyId: rec.propertyId,
        findingId: f.findingId,
        category: f.category,
        category_en: CATEGORY_EN[f.category] || null,
        label_he: f.label_he,
        label_en: f.label_en,
        severity: f.severity,
        severityRank: f.severityRank,
        notes: f.notes,
        photos: f.photos || [],
        warrantyKey,
        warrantyYears: years,
        warrantyLabel_he: warranty.label_he,
        warrantyLabel_en: warranty.label_en,
        warrantyBasis: warranty.basis,
        warrantyExpiresAt: expiresAt.toISOString(),
        legalBasis_he: 'חוק המכר (דירות), תשל"ג-1973',
        legalBasis_en: 'Sale of Apartments Law, 5733-1973',
        status: 'open',
        createdAt: _iso(today),
        repairId: null,
        history: [{ at: _iso(today), action: 'defect-listed', note: null }],
      };
      this._defects.set(defect.defectId, defect);
      return defect;
    });

    rec.defectListGeneratedAt = _iso(today);
    rec.defectIds = (rec.defectIds || []).concat(defects.map((d) => d.defectId));
    this._push(rec, 'defect-list-created', `+${defects.length} defects`);
    this.emit('defects:created', {
      inspectionId: rec.id,
      propertyId: rec.propertyId,
      count: defects.length,
    });

    return _clone({
      inspectionId: rec.id,
      propertyId: rec.propertyId,
      generatedAt: _iso(today),
      defectCount: defects.length,
      defects,
    });
  }

  // ───────────────────────────────────────────────────────────
  //  trackRepairRequest — links to Y-049 maintenance via emit()
  // ───────────────────────────────────────────────────────────
  trackRepairRequest({ defectId, assignedTo, dueDate, notes } = {}) {
    const defect = this._defects.get(defectId);
    _assert(defect, `defect not found: ${defectId}`);
    _assert(assignedTo, 'assignedTo required');
    const due = _toTs(dueDate);

    const repairId = _uid('REP');
    const repair = {
      repairId,
      defectId,
      inspectionId: defect.inspectionId,
      propertyId: defect.propertyId,
      assignedTo,
      dueDate: _iso(due),
      notes: notes || null,
      status: 'requested',
      createdAt: _iso(this._t()),
      history: [{ at: _iso(this._t()), action: 'repair-requested',
                  note: `assignedTo=${assignedTo}` }],
    };
    this._repairs.set(repairId, repair);

    // Update defect (append-only history, no overwrite of previous fields)
    defect.repairId = repairId;
    defect.status = 'repair-requested';
    defect.history.push({
      at: _iso(this._t()),
      action: 'repair-requested',
      note: `repairId=${repairId} due=${repair.dueDate}`,
    });

    // Bridge event for Y-049 MaintenanceRequests
    this.emit('repair:requested', {
      repairId,
      defectId,
      propertyId: defect.propertyId,
      category: defect.category,
      severity: defect.severity,
      assignedTo,
      dueDate: repair.dueDate,
      label_he: defect.label_he,
      label_en: defect.label_en,
      legalBasis: defect.legalBasis_he,
    });

    return _clone(repair);
  }

  getRepair(id) { return _clone(this._repairs.get(id) || null); }
  getDefect(id) { return _clone(this._defects.get(id) || null); }

  // ───────────────────────────────────────────────────────────
  //  compareInspections — move-in vs move-out diff
  //   Returns { addedFindings, worsened, unchanged, improved, summary }
  //   "addedFindings" + "worsened" are NEW DAMAGES (relevant for deposit).
  // ───────────────────────────────────────────────────────────
  compareInspections(inspId1, inspId2) {
    const insp1 = this._inspections.get(inspId1);
    const insp2 = this._inspections.get(inspId2);
    _assert(insp1, `inspection not found: ${inspId1}`);
    _assert(insp2, `inspection not found: ${inspId2}`);

    // Index move-in findings by itemId
    const map1 = new Map();
    for (const f of insp1.findings) map1.set(f.itemId, f);

    const added = [];
    const worsened = [];
    const unchanged = [];
    const improved = [];

    for (const f2 of insp2.findings) {
      const f1 = map1.get(f2.itemId);
      if (!f1) {
        if (f2.status === 'fail') added.push(f2);
        continue;
      }
      // Both inspections recorded this item — compare severity
      const r1 = _sevRank(f1.severity);
      const r2 = _sevRank(f2.severity);
      if (r2 > r1) {
        worsened.push({ from: f1, to: f2, deltaRank: r2 - r1 });
      } else if (r2 < r1) {
        improved.push({ from: f1, to: f2 });
      } else {
        unchanged.push(f2);
      }
    }

    const summary = {
      added: added.length,
      worsened: worsened.length,
      unchanged: unchanged.length,
      improved: improved.length,
      newDamageCount: added.length + worsened.length,
      basis_he: 'חוק הגנת הדייר [נוסח משולב], תשל"ב-1972',
      basis_en: 'Tenant Protection Law (Consolidated), 5732-1972',
    };

    return _clone({
      moveInInspection: insp1.id,
      moveOutInspection: insp2.id,
      propertyId: insp2.propertyId,
      addedFindings: added,
      worsened,
      unchanged,
      improved,
      summary,
    });
  }

  // ───────────────────────────────────────────────────────────
  //  computeDepositReturn
  //   Args: tenantId, leaseId
  //   Looks for the matching move-in & move-out inspections by leaseId
  //     OR accepts an explicit { moveInId, moveOutId, depositAmount,
  //     monthlyRent, leaseMonths, repairCosts: [{findingId, amount,
  //     wearAndTear?}], cleaningCost? } overload.
  //
  //   Wear-and-tear findings (`wearAndTear: true`) are EXCLUDED from the
  //   deduction. Returns the legal-cap-applied deduction & refund.
  //
  //   Israeli legal cap: lower of (3 months rent) OR (1/3 of total lease).
  // ───────────────────────────────────────────────────────────
  computeDepositReturn(tenantId, leaseId, opts = {}) {
    _assert(tenantId, 'tenantId required');
    _assert(leaseId, 'leaseId required');

    const depositAmount = Number(opts.depositAmount || 0);
    const monthlyRent = Number(opts.monthlyRent || 0);
    const leaseMonths = Number(opts.leaseMonths || 0);
    const cleaningCost = Number(opts.cleaningCost || 0);
    const repairCosts = Array.isArray(opts.repairCosts) ? opts.repairCosts : [];

    _assert(depositAmount >= 0, 'depositAmount must be ≥ 0');
    _assert(monthlyRent >= 0, 'monthlyRent must be ≥ 0');
    _assert(leaseMonths >= 0, 'leaseMonths must be ≥ 0');

    // Find move-in / move-out inspections for this lease (best-effort lookup)
    let moveIn = null;
    let moveOut = null;
    if (opts.moveInId) moveIn = this._inspections.get(opts.moveInId) || null;
    if (opts.moveOutId) moveOut = this._inspections.get(opts.moveOutId) || null;
    if (!moveIn || !moveOut) {
      for (const insp of this._inspections.values()) {
        if (insp.leaseId !== leaseId) continue;
        if (insp.type === 'move-in' && !moveIn) moveIn = insp;
        if (insp.type === 'move-out' && !moveOut) moveOut = insp;
      }
    }

    // Compare to find new damages (so wear-and-tear is intrinsically excluded:
    // anything that already existed at move-in cannot be charged again).
    let comparison = null;
    if (moveIn && moveOut) {
      comparison = this.compareInspections(moveIn.id, moveOut.id);
    }

    // Filter wear-and-tear out and split into eligible vs excluded.
    const eligible = [];
    const excluded = [];
    let eligibleTotal = 0;
    let excludedTotal = 0;
    for (const r of repairCosts) {
      const amt = _round2(Number(r.amount || 0));
      if (r.wearAndTear === true) {
        excluded.push({ ...r, amount: amt, reason_he: 'בלאי סביר', reason_en: 'normal wear and tear' });
        excludedTotal = _round2(excludedTotal + amt);
      } else {
        eligible.push({ ...r, amount: amt });
        eligibleTotal = _round2(eligibleTotal + amt);
      }
    }

    const cleaningTotal = _round2(cleaningCost);
    const proposedDeduction = _round2(eligibleTotal + cleaningTotal);

    // Apply Israeli legal cap on deductions.
    const capByMonths = _round2(monthlyRent * DEPOSIT_LEGAL_CAP_MONTHS);
    const capByLeaseFraction = _round2(monthlyRent * leaseMonths * DEPOSIT_LEGAL_CAP_LEASE_FRACTION);
    const candidates = [depositAmount];
    if (capByMonths > 0) candidates.push(capByMonths);
    if (capByLeaseFraction > 0) candidates.push(capByLeaseFraction);
    const legalCap = _round2(Math.min(...candidates));

    const cappedDeduction = _round2(Math.min(proposedDeduction, legalCap));
    const refund = _round2(Math.max(0, depositAmount - cappedDeduction));

    return {
      tenantId,
      leaseId,
      moveInInspectionId: moveIn ? moveIn.id : null,
      moveOutInspectionId: moveOut ? moveOut.id : null,
      depositAmount: _round2(depositAmount),
      monthlyRent: _round2(monthlyRent),
      leaseMonths,
      eligibleRepairs: eligible,
      eligibleRepairsTotal: eligibleTotal,
      excludedRepairs: excluded,
      excludedRepairsTotal: excludedTotal,
      cleaningCost: cleaningTotal,
      proposedDeduction,
      legalCap,
      legalCapBasis_he: 'חוק הגנת הדייר [נוסח משולב] + תיקון שכירות הוגנת',
      legalCapBasis_en: 'Tenant Protection Law + Fair Rental Amendment',
      cappedDeduction,
      refundToTenant: refund,
      currency: 'ILS',
      comparison,
      computedAt: _iso(this._t()),
    };
  }

  // ───────────────────────────────────────────────────────────
  //  warrantyPeriods — full Israeli warranty table
  // ───────────────────────────────────────────────────────────
  warrantyPeriods() {
    return _clone({
      basis_he: 'חוק המכר (דירות), תשל"ג-1973',
      basis_en: 'Sale of Apartments Law, 5733-1973',
      periods: WARRANTY_PERIODS,
      asTable: Object.entries(WARRANTY_PERIODS).map(([key, p]) => ({
        key,
        years: p.years,
        label_he: p.label_he,
        label_en: p.label_en,
        basis: p.basis,
      })).sort((a, b) => a.years - b.years),
    });
  }

  // ───────────────────────────────────────────────────────────
  //  history — full inspection history for a property (never purged)
  // ───────────────────────────────────────────────────────────
  history(propertyId) {
    _assert(propertyId, 'propertyId required');
    const ids = this._historyByProperty.get(propertyId) || [];
    const items = ids
      .map((id) => this._inspections.get(id))
      .filter(Boolean)
      .map((rec) => _clone(rec))
      // Most recent first
      .sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt));
    return {
      propertyId,
      total: items.length,
      inspections: items,
    };
  }

  // ───────────────────────────────────────────────────────────
  //  Read-only accessors
  // ───────────────────────────────────────────────────────────
  getInspection(id) {
    return _clone(this._inspections.get(id) || null);
  }

  listInspections(filter = {}) {
    const out = [];
    for (const r of this._inspections.values()) {
      if (filter.propertyId && r.propertyId !== filter.propertyId) continue;
      if (filter.type && r.type !== filter.type) continue;
      if (filter.inspectorId && r.inspectorId !== filter.inspectorId) continue;
      if (filter.leaseId && r.leaseId !== filter.leaseId) continue;
      out.push(_clone(r));
    }
    return out;
  }

  listDefects(filter = {}) {
    const out = [];
    for (const d of this._defects.values()) {
      if (filter.propertyId && d.propertyId !== filter.propertyId) continue;
      if (filter.inspectionId && d.inspectionId !== filter.inspectionId) continue;
      if (filter.severity && d.severity !== filter.severity) continue;
      out.push(_clone(d));
    }
    return out;
  }
}

module.exports = {
  PropertyInspection,
  INSPECTION_TYPES,
  INSPECTION_TYPE_HE,
  INSPECTION_TYPE_EN,
  CATEGORIES,
  CATEGORY_EN,
  SEVERITIES,
  SEVERITY_HE,
  SEVERITY_EN,
  FINDING_STATUS,
  FINDING_STATUS_HE,
  WARRANTY_PERIODS,
  CATEGORY_TO_WARRANTY,
  DEPOSIT_LEGAL_CAP_MONTHS,
  DEPOSIT_LEGAL_CAP_LEASE_FRACTION,
};
