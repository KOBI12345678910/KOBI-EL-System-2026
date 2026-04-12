/**
 * Board Deck Generator — מחולל מצגת דירקטוריון
 * Agent Y-187 — written 2026-04-11
 *
 * Produces a self-contained, bilingual (Hebrew RTL + English LTR) HTML slide
 * deck for quarterly board meetings of Techno-Kol Uzi (טכנו-קול עוזי בע"מ).
 * The deck is generated from aggregated KPI data by the `BoardDeck` class and
 * written to disk as a single HTML file with inline CSS — no external assets,
 * no bundling, no fonts, no images, and no runtime dependencies beyond the
 * Node.js built-ins (`fs`, `path`).
 *
 * Mirror-pair pattern / תבנית זוגות מקבילים:
 *   For every slide we emit TWO <section> elements — one `dir="rtl" lang="he"`
 *   holding the Hebrew version and one `dir="ltr" lang="en"` holding the
 *   English version. The English slide always comes first so LTR is the
 *   document default and the pair is visually balanced when printed / shown.
 *
 * Standard slides (11 pairs = 22 sections):
 *    1. title                — שער
 *    2. agenda               — סדר יום
 *    3. executiveSummary     — תקציר מנהלים
 *    4. financialHighlights  — נקודות פיננסיות
 *    5. operatingMetrics     — מדדי תפעול
 *    6. customerMetrics      — מדדי לקוחות
 *    7. safetyCompliance     — בטיחות ואמנה
 *    8. pipelineBacklog      — צבר הזמנות
 *    9. strategicInitiatives — יוזמות אסטרטגיות
 *   10. risksMitigations     — סיכונים ומיטיגציות
 *   11. asksForBoard         — בקשות לדירקטוריון
 *
 * Visual style:
 *   Palantir-dark palette — bg #0b0d10, panel #13171c, accent #4a9eff.
 *
 * Usage:
 *   const { BoardDeck } = require('./reporting/board-deck');
 *   const deck = new BoardDeck({ company: 'טכנו-קול עוזי', quarter: 'Q1 2026' });
 *   deck.setExecutiveSummary({ he: ['...'], en: ['...'] });
 *   const html = deck.render();
 *   const { path, size } = deck.writeToFile('board-q1-2026.html');
 *
 * Constraints:
 *   - Pure Node built-ins (`fs`, `path`). No templating library, no bundler.
 *   - Law: NEVER DELETE anything — additive only. Unknown sections are
 *     tolerated and placed at the end in a "custom" bucket.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ─────────────────────────────────────────────────────────────
// Constants — palette and defaults
// ─────────────────────────────────────────────────────────────

const PALETTE = Object.freeze({
  bg: '#0b0d10',
  panel: '#13171c',
  panelAlt: '#181d24',
  border: '#23303f',
  accent: '#4a9eff',
  accentSoft: '#2b6bb3',
  text: '#e6edf3',
  textMuted: '#8a97a8',
  danger: '#ff5d5d',
  warn: '#f2c14e',
  ok: '#38d39f',
});

const DEFAULT_TITLES = Object.freeze({
  title:               { he: 'דירקטוריון רבעוני',          en: 'Quarterly Board Meeting'      },
  agenda:              { he: 'סדר יום',                    en: 'Agenda'                       },
  executiveSummary:    { he: 'תקציר מנהלים',               en: 'Executive Summary'            },
  financialHighlights: { he: 'נקודות פיננסיות',            en: 'Financial Highlights'         },
  operatingMetrics:    { he: 'מדדי תפעול',                 en: 'Operating Metrics'            },
  customerMetrics:     { he: 'מדדי לקוחות',                en: 'Customer Metrics'             },
  safetyCompliance:    { he: 'בטיחות ואמנה',               en: 'Safety & Compliance'          },
  pipelineBacklog:     { he: 'צבר הזמנות וצנרת',           en: 'Pipeline & Backlog'           },
  strategicInitiatives:{ he: 'יוזמות אסטרטגיות',           en: 'Strategic Initiatives'        },
  risksMitigations:    { he: 'סיכונים ומיטיגציות',         en: 'Risks & Mitigations'          },
  asksForBoard:        { he: 'בקשות לדירקטוריון',          en: 'Asks for the Board'           },
});

// Canonical slide order — mirror pairs render in this sequence.
const SLIDE_ORDER = Object.freeze([
  'title',
  'agenda',
  'executiveSummary',
  'financialHighlights',
  'operatingMetrics',
  'customerMetrics',
  'safetyCompliance',
  'pipelineBacklog',
  'strategicInitiatives',
  'risksMitigations',
  'asksForBoard',
]);

// ─────────────────────────────────────────────────────────────
// Utilities — HTML escaping and small formatters
// ─────────────────────────────────────────────────────────────

/**
 * Escape untrusted strings so they are safe to embed between tags and inside
 * double-quoted attribute values. Must run on every user-supplied string.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toArray(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function formatNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return escapeHtml(value);
  return value.toLocaleString('en-US');
}

function renderList(items) {
  const list = toArray(items).filter((x) => x !== null && x !== undefined && x !== '');
  if (list.length === 0) return '<p class="empty">—</p>';
  const li = list.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return `<ul class="bulleted">${li}</ul>`;
}

function renderMetricGrid(metrics) {
  const rows = toArray(metrics).filter((m) => m && (m.label || m.labelHe || m.labelEn));
  if (rows.length === 0) return '<p class="empty">—</p>';
  const cards = rows.map((m) => {
    const label = escapeHtml(m.label || m.labelEn || m.labelHe || '');
    const value = escapeHtml(m.value !== undefined ? m.value : '');
    const delta = m.delta !== undefined && m.delta !== null
      ? `<span class="delta ${m.trend === 'down' ? 'down' : m.trend === 'up' ? 'up' : 'flat'}">${escapeHtml(m.delta)}</span>`
      : '';
    return `<div class="metric-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div>${delta}</div>`;
  }).join('');
  return `<div class="metric-grid">${cards}</div>`;
}

function renderTable(rows, headers) {
  const body = toArray(rows);
  if (body.length === 0) return '<p class="empty">—</p>';
  const headCells = toArray(headers).map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const head = headCells ? `<thead><tr>${headCells}</tr></thead>` : '';
  const bodyRows = body.map((row) => {
    const cells = toArray(row).map((c) => `<td>${escapeHtml(c)}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table class="board-table">${head}<tbody>${bodyRows}</tbody></table>`;
}

// ─────────────────────────────────────────────────────────────
// BoardDeck class — builder for a bilingual HTML board deck
// ─────────────────────────────────────────────────────────────

class BoardDeck {
  constructor(options = {}) {
    const opts = options || {};
    this.company = opts.company || 'Techno-Kol Uzi Ltd. / טכנו-קול עוזי בע"מ';
    this.quarter = opts.quarter || '';
    this.fiscalYear = opts.fiscalYear || '';
    this.preparedBy = opts.preparedBy || '';
    this.meetingDate = opts.meetingDate || '';
    this.confidential = opts.confidential !== false;
    // Per-slide data bags. Each bag is { he, en, ...extras }.
    this.sections = {
      title:               null,
      agenda:              null,
      executiveSummary:    null,
      financialHighlights: null,
      operatingMetrics:    null,
      customerMetrics:     null,
      safetyCompliance:    null,
      pipelineBacklog:     null,
      strategicInitiatives:null,
      risksMitigations:    null,
      asksForBoard:        null,
    };
    this.customSections = [];
  }

  // ───── Setters — one per slide, each accepts a { he, en, ...extras } bag.
  setTitle(data)                { this.sections.title               = data || {}; return this; }
  setAgenda(data)               { this.sections.agenda              = data || {}; return this; }
  setExecutiveSummary(data)     { this.sections.executiveSummary    = data || {}; return this; }
  setFinancialHighlights(data)  { this.sections.financialHighlights = data || {}; return this; }
  setOperatingMetrics(data)     { this.sections.operatingMetrics    = data || {}; return this; }
  setCustomerMetrics(data)      { this.sections.customerMetrics     = data || {}; return this; }
  setSafetyCompliance(data)     { this.sections.safetyCompliance    = data || {}; return this; }
  setPipelineBacklog(data)      { this.sections.pipelineBacklog     = data || {}; return this; }
  setStrategicInitiatives(data) { this.sections.strategicInitiatives= data || {}; return this; }
  setRisksMitigations(data)     { this.sections.risksMitigations    = data || {}; return this; }
  setAsksForBoard(data)         { this.sections.asksForBoard        = data || {}; return this; }

  /**
   * Bulk load aggregated data. `data` is an object keyed by slide name —
   * unknown keys are tolerated and queued into `customSections` so nothing
   * is ever dropped.
   */
  loadAggregated(data) {
    if (!data || typeof data !== 'object') return this;
    for (const key of Object.keys(data)) {
      if (key in this.sections) {
        this.sections[key] = data[key] || {};
      } else if (key === 'company' || key === 'quarter' || key === 'fiscalYear' ||
                 key === 'preparedBy' || key === 'meetingDate') {
        this[key] = data[key];
      } else {
        this.customSections.push({ key, data: data[key] || {} });
      }
    }
    return this;
  }

  /**
   * Render the complete deck as a single HTML string.
   */
  render() {
    const head = this._renderHead();
    const slides = SLIDE_ORDER
      .map((key) => this._renderMirrorPair(key, this.sections[key]))
      .filter(Boolean)
      .join('\n');
    const custom = this.customSections
      .map(({ key, data }) => this._renderCustom(key, data))
      .join('\n');
    const footer = this._renderFooter();
    return `<!DOCTYPE html>
<html lang="en" dir="ltr">
${head}
<body>
  <main class="deck">
${slides}
${custom}
  </main>
${footer}
</body>
</html>
`;
  }

  /**
   * Convenience — render and write to disk in one shot. Returns { path, size }.
   */
  writeToFile(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new TypeError('writeToFile requires a non-empty file path');
    }
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    const dir = path.dirname(abs);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const html = this.render();
    fs.writeFileSync(abs, html, 'utf8');
    const size = fs.statSync(abs).size;
    return { path: abs, size };
  }

  // ─────────────────────────────────────────────────────────
  // Internal — head / footer / slides
  // ─────────────────────────────────────────────────────────

  _renderHead() {
    const title = escapeHtml(
      `${this.company} — ${DEFAULT_TITLES.title.en}${this.quarter ? ' — ' + this.quarter : ''}`
    );
    return `<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="BoardDeck / Agent Y-187">
  <meta name="x-confidential" content="${this.confidential ? 'true' : 'false'}">
  <title>${title}</title>
  <style>${this._renderCss()}</style>
</head>`;
  }

  _renderFooter() {
    const tag = this.confidential ? '<span class="confidential">CONFIDENTIAL / סודי</span>' : '';
    return `  <footer class="deck-footer"><span>${escapeHtml(this.company)}</span>${tag}<span>${escapeHtml(this.quarter)}</span></footer>`;
  }

  _renderCss() {
    return `
:root {
  --bg: ${PALETTE.bg};
  --panel: ${PALETTE.panel};
  --panel-alt: ${PALETTE.panelAlt};
  --border: ${PALETTE.border};
  --accent: ${PALETTE.accent};
  --accent-soft: ${PALETTE.accentSoft};
  --text: ${PALETTE.text};
  --text-muted: ${PALETTE.textMuted};
  --danger: ${PALETTE.danger};
  --warn: ${PALETTE.warn};
  --ok: ${PALETTE.ok};
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: var(--bg); color: var(--text);
  font-family: -apple-system, Segoe UI, Roboto, Arial, "Noto Sans Hebrew", sans-serif;
  font-size: 15px; line-height: 1.5;
}
.deck { display: flex; flex-direction: column; gap: 24px; padding: 32px; max-width: 1280px; margin: 0 auto; }
.slide {
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  padding: 36px 44px; min-height: 540px; box-shadow: 0 1px 0 rgba(255,255,255,0.02);
  page-break-after: always;
}
.slide[dir="rtl"] { text-align: right; }
.slide[dir="ltr"] { text-align: left; }
.slide.title-slide { background: linear-gradient(135deg, var(--panel) 0%, var(--panel-alt) 100%); border-color: var(--accent-soft); }
.slide h1 { margin: 0 0 16px; font-size: 32px; color: var(--text); font-weight: 600; }
.slide h2 { margin: 0 0 20px; font-size: 24px; color: var(--accent); font-weight: 600; letter-spacing: 0.3px; }
.slide h3 { margin: 24px 0 10px; font-size: 17px; color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.6px; }
.slide p { margin: 0 0 12px; color: var(--text); }
.slide .subtitle { color: var(--text-muted); font-size: 15px; margin-bottom: 8px; }
.slide .meta-line { color: var(--text-muted); font-size: 13px; }
.slide ul.bulleted { margin: 0; padding-inline-start: 22px; }
.slide ul.bulleted li { margin: 6px 0; }
.slide .empty { color: var(--text-muted); font-style: italic; }
.metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-top: 8px; }
.metric-card { background: var(--panel-alt); border: 1px solid var(--border); border-radius: 6px; padding: 14px 16px; }
.metric-label { color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
.metric-value { color: var(--text); font-size: 22px; font-weight: 600; }
.delta { display: inline-block; margin-top: 4px; font-size: 12px; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.04); }
.delta.up { color: var(--ok); }
.delta.down { color: var(--danger); }
.delta.flat { color: var(--text-muted); }
.board-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
.board-table th, .board-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 13px; }
.board-table th { text-align: inherit; color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.4px; }
.board-table td { color: var(--text); }
.deck-footer { max-width: 1280px; margin: 16px auto 40px; padding: 0 32px;
  display: flex; justify-content: space-between; color: var(--text-muted); font-size: 12px; }
.confidential { color: var(--warn); font-weight: 600; letter-spacing: 0.6px; }
.title-pair, .agenda-pair, .slide-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
@media (max-width: 900px) { .title-pair, .agenda-pair, .slide-pair { grid-template-columns: 1fr; } }
@media print {
  body { background: #fff; color: #000; }
  .slide { page-break-after: always; box-shadow: none; border-color: #999; }
}
.risk-high { color: var(--danger); font-weight: 600; }
.risk-med  { color: var(--warn); font-weight: 600; }
.risk-low  { color: var(--ok); font-weight: 600; }
`;
  }

  /**
   * Render a mirror pair: the English LTR slide followed by the Hebrew RTL
   * slide. This is the "mirror pair pattern" called out in the spec.
   */
  _renderMirrorPair(key, data) {
    const body = data || {};
    const renderer = this._rendererFor(key);
    const enHtml = renderer('en', body);
    const heHtml = renderer('he', body);
    return `    <div class="slide-pair" data-slide="${escapeHtml(key)}">
      <section class="slide slide-${escapeHtml(key)} slide-en" dir="ltr" lang="en">${enHtml}</section>
      <section class="slide slide-${escapeHtml(key)} slide-he" dir="rtl" lang="he">${heHtml}</section>
    </div>`;
  }

  _renderCustom(key, data) {
    const safeKey = escapeHtml(key);
    const d = data || {};
    const en = escapeHtml(d.titleEn || d.en || d.title || key);
    const he = escapeHtml(d.titleHe || d.he || d.title || key);
    const bodyEn = renderList(d.bulletsEn || (Array.isArray(d.en) ? d.en : []));
    const bodyHe = renderList(d.bulletsHe || (Array.isArray(d.he) ? d.he : []));
    return `    <div class="slide-pair" data-slide="${safeKey}">
      <section class="slide slide-custom slide-${safeKey} slide-en" dir="ltr" lang="en"><h2>${en}</h2>${bodyEn}</section>
      <section class="slide slide-custom slide-${safeKey} slide-he" dir="rtl" lang="he"><h2>${he}</h2>${bodyHe}</section>
    </div>`;
  }

  _rendererFor(key) {
    switch (key) {
      case 'title':               return this._renderTitleSlide.bind(this);
      case 'agenda':              return this._renderAgendaSlide.bind(this);
      case 'executiveSummary':    return this._renderBulletSlide.bind(this, 'executiveSummary');
      case 'financialHighlights': return this._renderMetricSlide.bind(this, 'financialHighlights');
      case 'operatingMetrics':    return this._renderMetricSlide.bind(this, 'operatingMetrics');
      case 'customerMetrics':     return this._renderMetricSlide.bind(this, 'customerMetrics');
      case 'safetyCompliance':    return this._renderBulletSlide.bind(this, 'safetyCompliance');
      case 'pipelineBacklog':     return this._renderTableSlide.bind(this, 'pipelineBacklog');
      case 'strategicInitiatives':return this._renderBulletSlide.bind(this, 'strategicInitiatives');
      case 'risksMitigations':    return this._renderRiskSlide.bind(this);
      case 'asksForBoard':        return this._renderBulletSlide.bind(this, 'asksForBoard');
      default:                    return this._renderBulletSlide.bind(this, key);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Slide renderers — each is called twice, once for en and once for he.
  // ─────────────────────────────────────────────────────────

  _renderTitleSlide(lang, body) {
    const t = DEFAULT_TITLES.title;
    const title = lang === 'he'
      ? escapeHtml((body && body.titleHe) || t.he)
      : escapeHtml((body && body.titleEn) || t.en);
    const subtitle = lang === 'he'
      ? escapeHtml((body && body.subtitleHe) || this.quarter || '')
      : escapeHtml((body && body.subtitleEn) || this.quarter || '');
    const meta = lang === 'he'
      ? `${escapeHtml(this.company)} · ${escapeHtml(this.meetingDate || '')}`
      : `${escapeHtml(this.company)} · ${escapeHtml(this.meetingDate || '')}`;
    const prepared = lang === 'he'
      ? (this.preparedBy ? `הוכן ע"י ${escapeHtml(this.preparedBy)}` : '')
      : (this.preparedBy ? `Prepared by ${escapeHtml(this.preparedBy)}` : '');
    return `<h1>${title}</h1>
<p class="subtitle">${subtitle}</p>
<p class="meta-line">${meta}</p>
<p class="meta-line">${prepared}</p>`;
  }

  _renderAgendaSlide(lang, body) {
    const title = this._title('agenda', lang);
    const items = lang === 'he'
      ? toArray(body && (body.itemsHe || body.he))
      : toArray(body && (body.itemsEn || body.en));
    const list = items.length > 0
      ? items
      : this._defaultAgenda(lang);
    return `<h2>${title}</h2>${renderList(list)}`;
  }

  _renderBulletSlide(key, lang, body) {
    const title = this._title(key, lang);
    const bullets = lang === 'he'
      ? toArray(body && (body.he || body.bulletsHe))
      : toArray(body && (body.en || body.bulletsEn));
    return `<h2>${title}</h2>${renderList(bullets)}`;
  }

  _renderMetricSlide(key, lang, body) {
    const title = this._title(key, lang);
    const metrics = lang === 'he'
      ? toArray(body && (body.metricsHe || body.metrics))
      : toArray(body && (body.metricsEn || body.metrics));
    const bullets = lang === 'he'
      ? toArray(body && body.notesHe)
      : toArray(body && body.notesEn);
    const notes = bullets.length > 0
      ? `<h3>${lang === 'he' ? 'הערות' : 'Notes'}</h3>${renderList(bullets)}`
      : '';
    return `<h2>${title}</h2>${renderMetricGrid(metrics)}${notes}`;
  }

  _renderTableSlide(key, lang, body) {
    const title = this._title(key, lang);
    const headers = lang === 'he'
      ? toArray(body && (body.headersHe || body.headers))
      : toArray(body && (body.headersEn || body.headers));
    const rows = toArray(body && (lang === 'he' ? (body.rowsHe || body.rows) : (body.rowsEn || body.rows)));
    const caption = lang === 'he' ? (body && body.captionHe) : (body && body.captionEn);
    const note = caption ? `<p class="meta-line">${escapeHtml(caption)}</p>` : '';
    return `<h2>${title}</h2>${renderTable(rows, headers)}${note}`;
  }

  _renderRiskSlide(lang, body) {
    const title = this._title('risksMitigations', lang);
    const items = toArray(body && (body.items || (lang === 'he' ? body.he : body.en)));
    if (items.length === 0) return `<h2>${title}</h2><p class="empty">—</p>`;
    const rows = items.map((r) => {
      if (typeof r === 'string') return `<li>${escapeHtml(r)}</li>`;
      const severity = (r.severity || r.level || 'med').toString().toLowerCase();
      const cls = severity === 'high' ? 'risk-high' : severity === 'low' ? 'risk-low' : 'risk-med';
      const riskText = lang === 'he' ? (r.riskHe || r.risk || '') : (r.riskEn || r.risk || '');
      const mit = lang === 'he' ? (r.mitigationHe || r.mitigation || '') : (r.mitigationEn || r.mitigation || '');
      const sevLabel = lang === 'he'
        ? (severity === 'high' ? 'גבוה' : severity === 'low' ? 'נמוך' : 'בינוני')
        : severity.charAt(0).toUpperCase() + severity.slice(1);
      return `<li><span class="${cls}">[${escapeHtml(sevLabel)}]</span> <strong>${escapeHtml(riskText)}</strong>${mit ? ' — ' + escapeHtml(mit) : ''}</li>`;
    }).join('');
    return `<h2>${title}</h2><ul class="bulleted">${rows}</ul>`;
  }

  _title(key, lang) {
    const t = DEFAULT_TITLES[key] || { he: key, en: key };
    const override = this.sections[key];
    if (override) {
      if (lang === 'he' && override.titleHe) return escapeHtml(override.titleHe);
      if (lang === 'en' && override.titleEn) return escapeHtml(override.titleEn);
    }
    return escapeHtml(lang === 'he' ? t.he : t.en);
  }

  _defaultAgenda(lang) {
    if (lang === 'he') {
      return [
        'תקציר מנהלים',
        'נקודות פיננסיות',
        'מדדי תפעול ולקוחות',
        'בטיחות ואמנה',
        'צבר הזמנות וצנרת',
        'יוזמות אסטרטגיות',
        'סיכונים ומיטיגציות',
        'בקשות לדירקטוריון',
      ];
    }
    return [
      'Executive Summary',
      'Financial Highlights',
      'Operating & Customer Metrics',
      'Safety & Compliance',
      'Pipeline & Backlog',
      'Strategic Initiatives',
      'Risks & Mitigations',
      'Asks for the Board',
    ];
  }
}

// ─────────────────────────────────────────────────────────────
// Convenience helper — one-shot render from a payload
// ─────────────────────────────────────────────────────────────

function generateBoardDeck(payload, filePath) {
  const deck = new BoardDeck(payload || {});
  deck.loadAggregated(payload || {});
  if (filePath) return deck.writeToFile(filePath);
  return { html: deck.render() };
}

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  BoardDeck,
  generateBoardDeck,
  PALETTE,
  SLIDE_ORDER,
  DEFAULT_TITLES,
  _internals: {
    escapeHtml,
    toArray,
    formatNumber,
    renderList,
    renderMetricGrid,
    renderTable,
  },
};
