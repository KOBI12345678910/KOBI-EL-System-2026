/**
 * InternalWiki — Internal Wiki / Knowledge Base (Markdown)
 * ──────────────────────────────────────────────────────────
 * Agent Y-132 — Techno-Kol Uzi mega-ERP
 *
 * Sibling to Agent X-22 `kb-engine.js`:
 *   • X-22 is an article/FAQ help-center (rich content, bilingual body/title).
 *   • Y-132 is a wiki UX with MARKDOWN editing, append-only history, diffs,
 *     TF-IDF search, wiki-link graph `[[Page Name]]` and multi-space layout.
 *
 * Immutable rules:
 *   1. "לא מוחקים רק משדרגים ומגדלים" — append-only; `archivePage` flips
 *      a status flag, never removes data. Versions + diff log + watchers are
 *      all append-only.
 *   2. Zero external dependencies — Node built-ins only (and nothing even
 *      from that, really; this file is pure JS).
 *   3. Hebrew RTL + bilingual labels everywhere.
 *
 * Public API (class InternalWiki):
 *   createPage({title_he, title_en, slug, markdown, spaces, tags, author})
 *   updatePage(pageId, {markdown, editor, summary})
 *   getPage(pageId, {version?})
 *   listVersions(pageId)
 *   diffVersions(pageId, v1, v2)
 *   search(query, {spaces?, tags?, authors?})
 *   linkGraph(pageId)
 *   broken_links()
 *   tableOfContents(space)
 *   exportMarkdown(pageId)
 *   importMarkdown(content, meta)
 *   recentChanges(limit)
 *   watchers(pageId)              // subscribe / list (no notifications)
 *   archivePage(pageId)
 *
 * Markdown mini-parser (to AST):
 *   headings H1-H6, ordered/unordered lists, bold/italic/inline code, links,
 *   wiki-links [[Page Name]], fenced code blocks ``` ``` — enough to render
 *   a wiki page and to extract references for the graph.
 *
 * File:
 *   onyx-procurement/src/comms/internal-wiki.js
 */

'use strict';

// ───────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────

const SPACES = Object.freeze({
  engineering: { he: 'הנדסה',        en: 'Engineering' },
  hr:          { he: 'משאבי אנוש',   en: 'HR' },
  finance:     { he: 'כספים',        en: 'Finance' },
  ops:         { he: 'תפעול',        en: 'Operations' },
  onboarding:  { he: 'קליטת עובדים', en: 'Onboarding' },
  compliance:  { he: 'רגולציה',      en: 'Compliance' },
});

const PAGE_STATUS = Object.freeze({
  ACTIVE:   'active',
  ARCHIVED: 'archived',
});

const BILINGUAL_LABELS = Object.freeze({
  page:           { he: 'דף',                 en: 'Page' },
  pages:          { he: 'דפים',               en: 'Pages' },
  version:        { he: 'גרסה',               en: 'Version' },
  history:        { he: 'היסטוריה',           en: 'History' },
  diff:           { he: 'השוואה',             en: 'Diff' },
  search:         { he: 'חיפוש',              en: 'Search' },
  tableOfContents:{ he: 'תוכן עניינים',      en: 'Table of Contents' },
  recentChanges:  { he: 'שינויים אחרונים',    en: 'Recent Changes' },
  watchers:       { he: 'עוקבים',             en: 'Watchers' },
  brokenLinks:    { he: 'קישורים שבורים',     en: 'Broken Links' },
  archive:        { he: 'העבר לארכיון',       en: 'Archive' },
  active:         { he: 'פעיל',               en: 'Active' },
  archived:       { he: 'בארכיון',            en: 'Archived' },
  space:          { he: 'מרחב',               en: 'Space' },
  author:         { he: 'מחבר',               en: 'Author' },
  editor:         { he: 'עורך',               en: 'Editor' },
  summary:        { he: 'תקציר',              en: 'Summary' },
  tags:           { he: 'תגיות',              en: 'Tags' },
  wikiLinks:      { he: 'קישורי ויקי',        en: 'Wiki Links' },
  forwardLinks:   { he: 'קישורים יוצאים',     en: 'Forward Links' },
  backLinks:      { he: 'קישורים נכנסים',     en: 'Back Links' },
});

// ───────────────────────────────────────────────────────────────
// Small utilities
// ───────────────────────────────────────────────────────────────

// Hebrew ranges
const HEBREW_LETTER_RE  = /[\u05D0-\u05EA]/;
const NIKUD_RE          = /[\u0591-\u05C7]/g;
// Tokenizer captures Hebrew words, English words, and digits
const TOKEN_RE          = /[\u05D0-\u05EA]+|[a-z0-9]+/gi;

// Common Hebrew prefixes that attach directly to a word.
// We strip them so "לעובד" and "עובד" match.  Kept short on purpose —
// this is lexical tokenisation, not a grammar engine.
const HEBREW_PREFIXES = ['ול', 'וכש', 'וב', 'וה', 'וכ', 'כש', 'מה',
                          'של', 'ב',  'ל',  'ה',  'מ',  'ו',  'כ',  'ש'];

const STOPWORDS_HE = new Set([
  'של', 'על', 'עם', 'את', 'זה', 'זו', 'הוא', 'היא', 'הם', 'הן',
  'אני', 'אתה', 'אנחנו', 'גם', 'לא', 'כן', 'יש', 'אין', 'או',
  'אם', 'כי', 'אבל', 'רק', 'עד', 'אל', 'מן', 'כל', 'מה', 'איך',
]);
const STOPWORDS_EN = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'for', 'to', 'in',
  'on', 'at', 'by', 'with', 'is', 'are', 'was', 'were', 'be', 'been',
  'this', 'that', 'these', 'those', 'it', 'as', 'if', 'do', 'how',
]);

function nowISO() { return new Date().toISOString(); }

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function slugify(s) {
  if (!nonEmptyString(s)) return '';
  return String(s)
    .replace(NIKUD_RE, '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\u05D0-\u05EA]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normaliseText(s) {
  if (s == null) return '';
  return String(s).replace(NIKUD_RE, '').toLowerCase();
}

/** Strip 1 Hebrew prefix if present. Returns stripped or original. */
function stripHebrewPrefix(tok) {
  if (!tok || !HEBREW_LETTER_RE.test(tok)) return tok;
  for (const p of HEBREW_PREFIXES) {
    if (tok.length > p.length + 1 && tok.startsWith(p)) {
      return tok.slice(p.length);
    }
  }
  return tok;
}

function tokenize(s, { dropStopwords = true } = {}) {
  const out = [];
  if (!s) return out;
  const norm = normaliseText(s);
  const matches = norm.match(TOKEN_RE);
  if (!matches) return out;
  for (const raw of matches) {
    if (raw.length < 2) continue;
    const t = stripHebrewPrefix(raw);
    if (t.length < 2) continue;
    if (dropStopwords) {
      if (STOPWORDS_HE.has(t)) continue;
      if (STOPWORDS_EN.has(t)) continue;
    }
    out.push(t);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────
// Markdown mini-parser → AST
// ───────────────────────────────────────────────────────────────
/**
 * Supported:
 *   headings    #..###### text
 *   lists       - item   /   * item   /   1. item
 *   fenced code ```lang\n...\n```
 *   inline:
 *     **bold** or __bold__
 *     *italic* or _italic_
 *     `code`
 *     [text](url)
 *     [[Wiki Page Name]]
 *
 * Output AST:
 *   { type: 'document', children: [block, ...] }
 *     block types:
 *       heading       { type, level, children: inline[] }
 *       list          { type, ordered, items: [{children: inline[]}] }
 *       codeblock     { type, lang, value }
 *       paragraph     { type, children: inline[] }
 *       blank         { type }
 *     inline types:
 *       text          { type, value }
 *       strong        { type, children }
 *       em            { type, children }
 *       code          { type, value }
 *       link          { type, url, children }
 *       wikilink      { type, target }
 */

function parseMarkdown(src) {
  const lines = String(src == null ? '' : src).split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```\s*(\S+)?\s*$/);
    if (fence) {
      const lang = fence[1] || '';
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      // consume closing ``` if present
      if (i < lines.length) i++;
      blocks.push({ type: 'codeblock', lang, value: buf.join('\n') });
      continue;
    }

    // Blank line
    if (/^\s*$/.test(line)) {
      blocks.push({ type: 'blank' });
      i++;
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      blocks.push({
        type: 'heading',
        level: h[1].length,
        children: parseInline(h[2].trim()),
      });
      i++;
      continue;
    }

    // List (unordered or ordered) — collect consecutive matching lines
    const uList = line.match(/^[-*]\s+(.*)$/);
    const oList = line.match(/^\d+\.\s+(.*)$/);
    if (uList || oList) {
      const ordered = Boolean(oList);
      const items = [];
      while (i < lines.length) {
        const L = lines[i];
        const u = L.match(/^[-*]\s+(.*)$/);
        const o = L.match(/^\d+\.\s+(.*)$/);
        if (!ordered && u) {
          items.push({ children: parseInline(u[1]) });
          i++;
        } else if (ordered && o) {
          items.push({ children: parseInline(o[1]) });
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // Paragraph — collect until blank/heading/list/fence
    const paraLines = [];
    while (i < lines.length) {
      const L = lines[i];
      if (/^\s*$/.test(L))              break;
      if (/^#{1,6}\s+/.test(L))          break;
      if (/^[-*]\s+/.test(L))            break;
      if (/^\d+\.\s+/.test(L))           break;
      if (/^```/.test(L))                 break;
      paraLines.push(L);
      i++;
    }
    blocks.push({
      type: 'paragraph',
      children: parseInline(paraLines.join(' ')),
    });
  }

  return { type: 'document', children: blocks };
}

/**
 * Inline parser. Handles wiki-links first (so they take priority over plain
 * brackets), then bold, italic, inline code, links, and text.
 */
function parseInline(src) {
  const out = [];
  let text = '';
  let i = 0;
  const flushText = () => {
    if (text.length > 0) { out.push({ type: 'text', value: text }); text = ''; }
  };

  while (i < src.length) {
    const ch = src[i];
    const rest = src.slice(i);

    // [[Wiki Link]]
    if (ch === '[' && src[i + 1] === '[') {
      const end = src.indexOf(']]', i + 2);
      if (end !== -1) {
        flushText();
        out.push({ type: 'wikilink', target: src.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
    }

    // [text](url)
    if (ch === '[') {
      const m = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (m) {
        flushText();
        out.push({
          type: 'link',
          url: m[2],
          children: [{ type: 'text', value: m[1] }],
        });
        i += m[0].length;
        continue;
      }
    }

    // **bold** or __bold__
    if ((ch === '*' && src[i + 1] === '*') || (ch === '_' && src[i + 1] === '_')) {
      const delim = ch + ch;
      const end = src.indexOf(delim, i + 2);
      if (end !== -1) {
        flushText();
        out.push({ type: 'strong', children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    // *italic* or _italic_
    if (ch === '*' || ch === '_') {
      const delim = ch;
      const end = src.indexOf(delim, i + 1);
      if (end !== -1) {
        flushText();
        out.push({ type: 'em', children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    // `inline code`
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end !== -1) {
        flushText();
        out.push({ type: 'code', value: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    text += ch;
    i++;
  }
  flushText();
  return out;
}

/** Extract all [[Wiki Link]] targets from raw markdown (regex, fast path). */
function extractWikiLinks(md) {
  if (!nonEmptyString(md)) return [];
  const out = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

/** Flatten an AST to plain text for search indexing. */
function astToText(ast) {
  if (!ast) return '';
  if (Array.isArray(ast)) return ast.map(astToText).join(' ');
  const t = ast.type;
  if (t === 'text')      return ast.value;
  if (t === 'code')      return ast.value;
  if (t === 'wikilink')  return ast.target;
  if (t === 'codeblock') return ast.value;
  if (ast.children)      return astToText(ast.children);
  return '';
}

// ───────────────────────────────────────────────────────────────
// Line-level diff (O(n*m) LCS, adequate for wiki pages)
// ───────────────────────────────────────────────────────────────
function lineDiff(oldText, newText) {
  const a = String(oldText == null ? '' : oldText).split(/\r?\n/);
  const b = String(newText == null ? '' : newText).split(/\r?\n/);
  const n = a.length, m = b.length;
  // LCS table
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) lcs[i][j] = lcs[i + 1][j + 1] + 1;
      else               lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  // Backtrack
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: 'equal',  line: a[i] });
      i++; j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ op: 'remove', line: a[i] });
      i++;
    } else {
      ops.push({ op: 'add',    line: b[j] });
      j++;
    }
  }
  while (i < n) { ops.push({ op: 'remove', line: a[i++] }); }
  while (j < m) { ops.push({ op: 'add',    line: b[j++] }); }
  const added   = ops.filter(o => o.op === 'add').map(o => o.line);
  const removed = ops.filter(o => o.op === 'remove').map(o => o.line);
  return { ops, added, removed };
}

// ───────────────────────────────────────────────────────────────
// InternalWiki class
// ───────────────────────────────────────────────────────────────

class InternalWiki {
  constructor(opts = {}) {
    this._pages          = new Map();   // id -> page record
    this._slugIndex      = new Map();   // slug -> id
    this._auditLog       = [];          // append-only
    this._diffLog        = [];          // append-only
    this._uidCounter     = 0;
    this._clock          = typeof opts.clock === 'function' ? opts.clock : nowISO;
  }

  // ---------- internal helpers ----------
  _uid(prefix) {
    this._uidCounter += 1;
    return `${prefix}_${this._uidCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  _validateSpaces(spaces) {
    if (!Array.isArray(spaces) || spaces.length === 0) {
      throw new Error('spaces[] required (engineering|hr|finance|ops|onboarding|compliance)');
    }
    for (const s of spaces) {
      if (!Object.prototype.hasOwnProperty.call(SPACES, s)) {
        throw new Error(`unknown space: ${s}`);
      }
    }
  }

  _requirePage(pageId) {
    const p = this._pages.get(pageId);
    if (!p) throw new Error(`page not found: ${pageId}`);
    return p;
  }

  _logAudit(event) {
    this._auditLog.push(Object.assign({ at: this._clock() }, event));
  }

  // ---------- createPage ----------
  createPage({ title_he, title_en, slug, markdown, spaces, tags, author } = {}) {
    if (!nonEmptyString(title_he)) throw new Error('title_he required');
    if (!nonEmptyString(title_en)) throw new Error('title_en required');
    if (!nonEmptyString(author))    throw new Error('author required');
    this._validateSpaces(spaces);
    const md = typeof markdown === 'string' ? markdown : '';
    const safeSlug = nonEmptyString(slug) ? slugify(slug) : slugify(title_en || title_he);
    if (!safeSlug) throw new Error('slug could not be derived');
    if (this._slugIndex.has(safeSlug)) {
      throw new Error(`slug already exists: ${safeSlug}`);
    }

    const now = this._clock();
    const pageId = this._uid('page');
    const firstVersion = {
      version:  1,
      markdown: md,
      editor:   author,
      summary:  'initial',
      at:       now,
    };
    const page = {
      id:        pageId,
      title_he:  String(title_he),
      title_en:  String(title_en),
      slug:      safeSlug,
      spaces:    spaces.slice(),
      tags:      Array.isArray(tags) ? tags.slice() : [],
      author:    String(author),
      status:    PAGE_STATUS.ACTIVE,
      created_at: now,
      updated_at: now,
      versions:  [firstVersion],        // append-only
      watchers:  [],                    // append-only list
    };
    this._pages.set(pageId, page);
    this._slugIndex.set(safeSlug, pageId);
    this._logAudit({ kind: 'create', pageId, slug: safeSlug, author });
    return clone(page);
  }

  // ---------- updatePage (append-only versioning) ----------
  updatePage(pageId, { markdown, editor, summary } = {}) {
    const page = this._requirePage(pageId);
    if (!nonEmptyString(editor)) throw new Error('editor required');
    if (typeof markdown !== 'string') throw new Error('markdown required');
    const prev = page.versions[page.versions.length - 1];
    if (prev.markdown === markdown) {
      // no-op: explicit, but still non-destructive
      return clone(page);
    }
    const diff = lineDiff(prev.markdown, markdown);
    const newVersion = {
      version:  prev.version + 1,
      markdown,
      editor:   String(editor),
      summary:  nonEmptyString(summary) ? String(summary) : '',
      at:       this._clock(),
    };
    page.versions.push(newVersion);       // append only
    page.updated_at = newVersion.at;
    this._diffLog.push({                   // append only
      pageId,
      from_version: prev.version,
      to_version:   newVersion.version,
      editor:       newVersion.editor,
      summary:      newVersion.summary,
      at:           newVersion.at,
      added:        diff.added.length,
      removed:      diff.removed.length,
    });
    this._logAudit({
      kind: 'update', pageId,
      version: newVersion.version, editor, summary: newVersion.summary,
    });
    return clone(page);
  }

  // ---------- getPage ----------
  getPage(pageId, { version } = {}) {
    const page = this._requirePage(pageId);
    if (version == null) {
      const latest = page.versions[page.versions.length - 1];
      return Object.assign(clone(page), {
        currentMarkdown: latest.markdown,
        currentVersion:  latest.version,
      });
    }
    const v = page.versions.find(x => x.version === Number(version));
    if (!v) throw new Error(`version not found: ${version}`);
    return Object.assign(clone(page), {
      currentMarkdown: v.markdown,
      currentVersion:  v.version,
    });
  }

  // ---------- listVersions ----------
  listVersions(pageId) {
    const page = this._requirePage(pageId);
    return page.versions.map(v => ({
      version: v.version,
      editor:  v.editor,
      summary: v.summary,
      at:      v.at,
      size:    v.markdown.length,
    }));
  }

  // ---------- diffVersions ----------
  diffVersions(pageId, v1, v2) {
    const page = this._requirePage(pageId);
    const a = page.versions.find(x => x.version === Number(v1));
    const b = page.versions.find(x => x.version === Number(v2));
    if (!a) throw new Error(`version not found: ${v1}`);
    if (!b) throw new Error(`version not found: ${v2}`);
    const d = lineDiff(a.markdown, b.markdown);
    return {
      pageId,
      from: a.version,
      to:   b.version,
      ops:  d.ops,
      added:   d.added,
      removed: d.removed,
      summary: {
        added:   d.added.length,
        removed: d.removed.length,
        net:     d.added.length - d.removed.length,
      },
    };
  }

  // ---------- search (TF-IDF, bilingual tokeniser) ----------
  search(query, { spaces, tags, authors } = {}) {
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return [];

    // Candidate docs (active + filter)
    const activePages = Array.from(this._pages.values()).filter(p => {
      if (p.status !== PAGE_STATUS.ACTIVE) return false;
      if (Array.isArray(spaces)  && spaces.length  > 0 && !spaces.some(s => p.spaces.includes(s))) return false;
      if (Array.isArray(tags)    && tags.length    > 0 && !tags.some(t => p.tags.includes(t)))     return false;
      if (Array.isArray(authors) && authors.length > 0 && !authors.includes(p.author))             return false;
      return true;
    });

    if (activePages.length === 0) return [];

    // Tokenise each doc (title_he + title_en + markdown + tags)
    const docTokens = new Map();  // pageId -> array of tokens
    for (const p of activePages) {
      const latest = p.versions[p.versions.length - 1];
      const blob = [p.title_he, p.title_en, latest.markdown, (p.tags || []).join(' ')].join(' ');
      docTokens.set(p.id, tokenize(blob));
    }

    // Document frequency
    const df = Object.create(null);
    for (const tokens of docTokens.values()) {
      const seen = new Set(tokens);
      for (const t of seen) df[t] = (df[t] || 0) + 1;
    }
    const N = activePages.length;

    // Score
    const results = [];
    for (const p of activePages) {
      const tokens = docTokens.get(p.id);
      if (tokens.length === 0) continue;

      // Term frequencies
      const tf = Object.create(null);
      for (const t of tokens) tf[t] = (tf[t] || 0) + 1;

      let score = 0;
      let matched = 0;
      for (const q of qTokens) {
        if (!tf[q]) continue;
        matched++;
        const idf = Math.log(1 + (N / (df[q] || 1)));
        const tfnorm = tf[q] / tokens.length;
        score += tfnorm * idf;
      }
      if (matched === 0) continue;

      // Title boost (exact Hebrew or English title substring)
      const qNorm = tokenize(query).join(' ');
      const titleBlob = normaliseText((p.title_he || '') + ' ' + (p.title_en || ''));
      if (qNorm && titleBlob.includes(qNorm)) score *= 2.0;

      results.push({
        pageId:  p.id,
        slug:    p.slug,
        title_he: p.title_he,
        title_en: p.title_en,
        spaces:  p.spaces.slice(),
        score,
        matched,
      });
    }

    results.sort((a, b) => b.score - a.score || b.matched - a.matched);
    return results;
  }

  // ---------- linkGraph ----------
  linkGraph(pageId) {
    const page = this._requirePage(pageId);
    const latest = page.versions[page.versions.length - 1];
    const forwardTargets = extractWikiLinks(latest.markdown);
    const forward = [];
    for (const t of forwardTargets) {
      const slug = slugify(t);
      const targetId = this._slugIndex.get(slug) || null;
      forward.push({
        target:        t,
        slug,
        pageId:        targetId,
        exists:        Boolean(targetId),
      });
    }
    // Back-links: scan every other page
    const back = [];
    for (const p of this._pages.values()) {
      if (p.id === page.id) continue;
      const md = p.versions[p.versions.length - 1].markdown;
      const links = extractWikiLinks(md).map(slugify);
      if (links.includes(page.slug)) {
        back.push({ pageId: p.id, slug: p.slug, title_he: p.title_he, title_en: p.title_en });
      }
    }
    return { pageId: page.id, slug: page.slug, forward, back };
  }

  // ---------- broken_links ----------
  broken_links() {
    const out = [];
    for (const p of this._pages.values()) {
      if (p.status === PAGE_STATUS.ARCHIVED) continue;
      const md = p.versions[p.versions.length - 1].markdown;
      const targets = extractWikiLinks(md);
      for (const t of targets) {
        const s = slugify(t);
        if (!this._slugIndex.has(s)) {
          out.push({ pageId: p.id, slug: p.slug, target: t, targetSlug: s });
        }
      }
    }
    return out;
  }

  // ---------- tableOfContents ----------
  tableOfContents(space) {
    if (!Object.prototype.hasOwnProperty.call(SPACES, space)) {
      throw new Error(`unknown space: ${space}`);
    }
    const pages = Array.from(this._pages.values())
      .filter(p => p.status === PAGE_STATUS.ACTIVE && p.spaces.includes(space));

    // For each page, build heading tree from its current markdown.
    const toc = pages.map(p => {
      const latest = p.versions[p.versions.length - 1];
      const ast = parseMarkdown(latest.markdown);
      const headings = [];
      for (const block of ast.children) {
        if (block.type === 'heading') {
          headings.push({
            level: block.level,
            text:  astToText(block.children).trim(),
          });
        }
      }
      return {
        pageId:   p.id,
        slug:     p.slug,
        title_he: p.title_he,
        title_en: p.title_en,
        headings,
      };
    });

    return {
      space,
      space_label: SPACES[space],
      pages: toc,
    };
  }

  // ---------- exportMarkdown ----------
  exportMarkdown(pageId) {
    const page = this._requirePage(pageId);
    const latest = page.versions[page.versions.length - 1];
    return {
      pageId:  page.id,
      slug:    page.slug,
      title_he: page.title_he,
      title_en: page.title_en,
      markdown: latest.markdown,
      version:  latest.version,
    };
  }

  // ---------- importMarkdown (bulk-import) ----------
  /**
   * content may be:
   *   - a string (one page)
   *   - an array of { title_he, title_en, slug, markdown, spaces?, tags?, author? }
   * meta supplies defaults (spaces, author, tags) when missing from the record.
   */
  importMarkdown(content, meta = {}) {
    const defaults = meta || {};
    const entries = Array.isArray(content)
      ? content
      : [{
          title_he: defaults.title_he || defaults.title || 'ללא שם',
          title_en: defaults.title_en || defaults.title || 'Untitled',
          slug:     defaults.slug,
          markdown: String(content == null ? '' : content),
          spaces:   defaults.spaces,
          tags:     defaults.tags,
          author:   defaults.author,
        }];

    const imported = [];
    for (const rec of entries) {
      const page = this.createPage({
        title_he: rec.title_he || defaults.title_he || rec.title || 'ללא שם',
        title_en: rec.title_en || defaults.title_en || rec.title || 'Untitled',
        slug:     rec.slug,
        markdown: rec.markdown || '',
        spaces:   rec.spaces   || defaults.spaces,
        tags:     rec.tags     || defaults.tags || [],
        author:   rec.author   || defaults.author,
      });
      imported.push(page);
    }
    this._logAudit({ kind: 'import', count: imported.length });
    return { imported_count: imported.length, pages: imported };
  }

  // ---------- recentChanges ----------
  recentChanges(limit = 20) {
    const n = Math.max(1, Math.min(1000, Number(limit) || 20));
    // Use audit log (append-only) for create/update/archive/import events.
    return this._auditLog.slice(-n).reverse().map(ev => clone(ev));
  }

  // ---------- watchers ----------
  /**
   * watchers(pageId)                       → list current watchers
   * watchers(pageId, { subscribe: userId}) → append to watchers, return list
   * watchers(pageId, { unsubscribe: ...})  → logs an unsubscribe event but
   *   does NOT remove the user (append-only rule); it records an "unsub" tag.
   */
  watchers(pageId, opts = {}) {
    const page = this._requirePage(pageId);
    if (opts && nonEmptyString(opts.subscribe)) {
      const existing = page.watchers.find(w => w.user === opts.subscribe && w.active);
      if (!existing) {
        page.watchers.push({ user: opts.subscribe, at: this._clock(), active: true });
        this._logAudit({ kind: 'watch', pageId, user: opts.subscribe });
      }
    }
    if (opts && nonEmptyString(opts.unsubscribe)) {
      // Append-only: mark by appending a new record flagged active=false,
      // never mutate or delete prior active record.
      page.watchers.push({ user: opts.unsubscribe, at: this._clock(), active: false });
      this._logAudit({ kind: 'unwatch', pageId, user: opts.unsubscribe });
    }
    // Resolve effective list (last record per user wins, but history preserved)
    const state = new Map();
    for (const w of page.watchers) state.set(w.user, w.active);
    const active = [];
    for (const [user, isActive] of state) if (isActive) active.push(user);
    return {
      pageId:     page.id,
      active,
      history:    page.watchers.map(clone),
      notifyBridge: 'Y-121 email-templates (delegated)',
    };
  }

  // ---------- archivePage ----------
  archivePage(pageId) {
    const page = this._requirePage(pageId);
    if (page.status === PAGE_STATUS.ARCHIVED) return clone(page);
    page.status = PAGE_STATUS.ARCHIVED;
    page.archived_at = this._clock();
    this._logAudit({ kind: 'archive', pageId });
    return clone(page);
  }

  // ---------- introspection ----------
  stats() {
    let total = 0, active = 0, archived = 0, versions = 0;
    for (const p of this._pages.values()) {
      total++;
      if (p.status === PAGE_STATUS.ACTIVE)   active++;
      if (p.status === PAGE_STATUS.ARCHIVED) archived++;
      versions += p.versions.length;
    }
    return { total, active, archived, versions, diffLog: this._diffLog.length };
  }
}

// ───────────────────────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────────────────────
module.exports = {
  InternalWiki,
  SPACES,
  PAGE_STATUS,
  BILINGUAL_LABELS,
  // exposed for tests and tooling
  parseMarkdown,
  parseInline,
  extractWikiLinks,
  astToText,
  tokenize,
  stripHebrewPrefix,
  slugify,
  lineDiff,
};
