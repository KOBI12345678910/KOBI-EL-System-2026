/**
 * onyx-procurement/src/documents/templates.js
 * ------------------------------------------------------------------
 * Document Templates Manager — Mega-ERP Techno-Kol Uzi
 *
 * Agent Y108 — לא מוחקים רק משדרגים ומגדלים
 *
 * Mini-handlebars implementation with zero dependencies.
 *
 * Supported syntax:
 *   {{variable}}                        — variable substitution (HTML-escaped)
 *   {{{variable}}}                      — raw (unescaped) substitution
 *   {{#if cond}}...{{/if}}              — conditional blocks
 *   {{#if cond}}...{{else}}...{{/if}}   — conditional with else
 *   {{#unless cond}}...{{/unless}}      — inverse conditional
 *   {{#each items}}...{{/each}}         — iteration over arrays
 *       - {{this}}                      — current item
 *       - {{@index}}, {{@first}},
 *         {{@last}}, {{@count}}         — iteration metadata
 *   {{> partialName}}                   — include a partial template
 *   {{! this is a comment }}            — comments (stripped)
 *   {{helper arg1 arg2 ...}}            — helper invocation
 *   {{path.to.nested.value}}            — dot-path lookup
 *
 * Built-in helpers:
 *   formatCurrency amount [currency]
 *   formatDate date [format]
 *   formatNumber number [decimals]
 *   upper string
 *   lower string
 *   uppercase string (alias)
 *   lowercase string (alias)
 *   trim string
 *   length collection
 *   eq a b
 *   neq a b
 *   gt a b
 *   lt a b
 *   gte a b
 *   lte a b
 *   and a b
 *   or a b
 *   not a
 *   default value fallback
 *   t key                               — i18n key lookup
 *
 * Public API:
 *   class DocumentTemplates {
 *     registerTemplate(spec)
 *     render({templateId, context})
 *     renderBilingual({templateId, context})
 *     validate({templateId, context})
 *     testTemplate(templateId, fixtures)
 *     versionTemplate(templateId)
 *     dependencies(templateId)
 *     renderFormats({templateId, format})
 *     approvalWorkflow({templateId, approvers})
 *     languageFallback(templateId, lang)
 *   }
 *
 * Rule: NEVER delete templates — only version / supersede.
 * ------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════
// TOKENIZER
// ═══════════════════════════════════════════════════════════════════

const TOKEN_TEXT = 'text';
const TOKEN_VAR = 'var';
const TOKEN_RAW = 'raw';
const TOKEN_BLOCK_OPEN = 'block_open';
const TOKEN_BLOCK_CLOSE = 'block_close';
const TOKEN_ELSE = 'else';
const TOKEN_PARTIAL = 'partial';
const TOKEN_COMMENT = 'comment';

/**
 * Tokenize a template string into a flat list of tokens.
 *
 * We deliberately scan character-by-character rather than regex —
 * this keeps us safe from catastrophic backtracking on large
 * templates and gives clean error positions on malformed input.
 */
function tokenize(src) {
  const tokens = [];
  let i = 0;
  const len = src.length;
  let text = '';

  while (i < len) {
    // Detect {{{ (raw) before {{ — must check length-3 opener first.
    if (src[i] === '{' && src[i + 1] === '{' && src[i + 2] === '{') {
      if (text) {
        tokens.push({ type: TOKEN_TEXT, value: text });
        text = '';
      }
      const end = src.indexOf('}}}', i + 3);
      if (end === -1) {
        throw new Error(`Unterminated {{{ at position ${i}`);
      }
      const expr = src.slice(i + 3, end).trim();
      tokens.push({ type: TOKEN_RAW, expr, pos: i });
      i = end + 3;
      continue;
    }

    if (src[i] === '{' && src[i + 1] === '{') {
      if (text) {
        tokens.push({ type: TOKEN_TEXT, value: text });
        text = '';
      }
      const end = src.indexOf('}}', i + 2);
      if (end === -1) {
        throw new Error(`Unterminated {{ at position ${i}`);
      }
      const rawExpr = src.slice(i + 2, end);
      const expr = rawExpr.trim();

      if (expr.startsWith('!')) {
        tokens.push({ type: TOKEN_COMMENT, expr: expr.slice(1), pos: i });
      } else if (expr.startsWith('#')) {
        // {{#if cond}} or {{#each items}} or {{#unless cond}}
        const inner = expr.slice(1).trim();
        const spaceAt = inner.search(/\s/);
        const name = spaceAt === -1 ? inner : inner.slice(0, spaceAt);
        const args = spaceAt === -1 ? '' : inner.slice(spaceAt + 1).trim();
        tokens.push({ type: TOKEN_BLOCK_OPEN, name, args, pos: i });
      } else if (expr.startsWith('/')) {
        tokens.push({ type: TOKEN_BLOCK_CLOSE, name: expr.slice(1).trim(), pos: i });
      } else if (expr === 'else') {
        tokens.push({ type: TOKEN_ELSE, pos: i });
      } else if (expr.startsWith('>')) {
        tokens.push({ type: TOKEN_PARTIAL, name: expr.slice(1).trim(), pos: i });
      } else {
        tokens.push({ type: TOKEN_VAR, expr, pos: i });
      }
      i = end + 2;
      continue;
    }

    text += src[i];
    i += 1;
  }

  if (text) {
    tokens.push({ type: TOKEN_TEXT, value: text });
  }
  return tokens;
}

// ═══════════════════════════════════════════════════════════════════
// PARSER — builds an AST from the token list
// ═══════════════════════════════════════════════════════════════════

const NODE_TEXT = 'text';
const NODE_VAR = 'var';
const NODE_RAW = 'raw';
const NODE_IF = 'if';
const NODE_UNLESS = 'unless';
const NODE_EACH = 'each';
const NODE_PARTIAL = 'partial';

function parse(tokens) {
  let pos = 0;

  function parseBlock(stopNames) {
    const nodes = [];
    while (pos < tokens.length) {
      const tok = tokens[pos];
      if (tok.type === TOKEN_BLOCK_CLOSE) {
        if (stopNames && stopNames.includes(tok.name)) {
          return nodes;
        }
        throw new Error(`Unexpected {{/${tok.name}}} at position ${tok.pos}`);
      }
      if (tok.type === TOKEN_ELSE && stopNames) {
        return nodes;
      }
      pos += 1;
      if (tok.type === TOKEN_TEXT) {
        nodes.push({ type: NODE_TEXT, value: tok.value });
      } else if (tok.type === TOKEN_COMMENT) {
        // skip
      } else if (tok.type === TOKEN_VAR) {
        nodes.push({ type: NODE_VAR, expr: tok.expr });
      } else if (tok.type === TOKEN_RAW) {
        nodes.push({ type: NODE_RAW, expr: tok.expr });
      } else if (tok.type === TOKEN_PARTIAL) {
        nodes.push({ type: NODE_PARTIAL, name: tok.name });
      } else if (tok.type === TOKEN_BLOCK_OPEN) {
        if (tok.name === 'if') {
          const consequent = parseBlock(['if']);
          let alternate = [];
          // Peek — did we stop on {{else}} or {{/if}}?
          if (pos < tokens.length && tokens[pos].type === TOKEN_ELSE) {
            pos += 1;
            alternate = parseBlock(['if']);
          }
          if (pos >= tokens.length || tokens[pos].type !== TOKEN_BLOCK_CLOSE || tokens[pos].name !== 'if') {
            throw new Error(`Missing {{/if}} for block at position ${tok.pos}`);
          }
          pos += 1;
          nodes.push({ type: NODE_IF, cond: tok.args, consequent, alternate });
        } else if (tok.name === 'unless') {
          const consequent = parseBlock(['unless']);
          let alternate = [];
          if (pos < tokens.length && tokens[pos].type === TOKEN_ELSE) {
            pos += 1;
            alternate = parseBlock(['unless']);
          }
          if (pos >= tokens.length || tokens[pos].type !== TOKEN_BLOCK_CLOSE || tokens[pos].name !== 'unless') {
            throw new Error(`Missing {{/unless}} for block at position ${tok.pos}`);
          }
          pos += 1;
          nodes.push({ type: NODE_UNLESS, cond: tok.args, consequent, alternate });
        } else if (tok.name === 'each') {
          const body = parseBlock(['each']);
          if (pos >= tokens.length || tokens[pos].type !== TOKEN_BLOCK_CLOSE || tokens[pos].name !== 'each') {
            throw new Error(`Missing {{/each}} for block at position ${tok.pos}`);
          }
          pos += 1;
          nodes.push({ type: NODE_EACH, iter: tok.args, body });
        } else {
          throw new Error(`Unknown block helper {{#${tok.name}}} at position ${tok.pos}`);
        }
      } else if (tok.type === TOKEN_ELSE) {
        throw new Error(`Stray {{else}} at position ${tok.pos}`);
      }
    }
    if (stopNames) {
      throw new Error(`Unterminated block — expected {{/${stopNames.join('|')}}}`);
    }
    return nodes;
  }

  return parseBlock(null);
}

// ═══════════════════════════════════════════════════════════════════
// EVALUATION — walk AST with a runtime context + helpers
// ═══════════════════════════════════════════════════════════════════

function htmlEscape(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Resolve a dot-path like "user.address.city" or "items.0.name"
 * against a context object. Returns undefined on miss.
 */
function resolvePath(ctx, path) {
  if (path === 'this' || path === '.') return ctx.__this;
  if (path.startsWith('@')) return ctx[path]; // metadata like @index
  const parts = path.split('.');
  let cur;
  // First segment — look in this scope then parent chain.
  if (parts[0] === 'this') {
    cur = ctx.__this;
    parts.shift();
  } else if (parts[0].startsWith('@')) {
    cur = ctx[parts[0]];
    parts.shift();
  } else {
    cur = ctx[parts[0]];
    // Walk up parent scopes if first segment not found locally.
    if (cur === undefined && ctx.__parent) {
      let p = ctx.__parent;
      while (p && cur === undefined) {
        cur = p[parts[0]];
        p = p.__parent;
      }
    }
    parts.shift();
  }
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Parse a space-separated expression into the head symbol and
 * an array of argument strings, respecting single and double quotes.
 */
function tokenizeExpr(expr) {
  const out = [];
  let i = 0;
  const s = expr.trim();
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i += 1;
    if (i >= s.length) break;
    if (s[i] === "'" || s[i] === '"') {
      const quote = s[i];
      i += 1;
      let str = '';
      while (i < s.length && s[i] !== quote) {
        if (s[i] === '\\' && i + 1 < s.length) {
          str += s[i + 1];
          i += 2;
        } else {
          str += s[i];
          i += 1;
        }
      }
      i += 1;
      out.push({ kind: 'string', value: str });
    } else {
      let tok = '';
      while (i < s.length && !/\s/.test(s[i])) {
        tok += s[i];
        i += 1;
      }
      // Distinguish numeric literal, path lookup, or keyword.
      if (/^-?\d+(\.\d+)?$/.test(tok)) {
        out.push({ kind: 'number', value: Number(tok) });
      } else if (tok === 'true' || tok === 'false') {
        out.push({ kind: 'bool', value: tok === 'true' });
      } else if (tok === 'null') {
        out.push({ kind: 'null', value: null });
      } else {
        out.push({ kind: 'path', value: tok });
      }
    }
  }
  return out;
}

function resolveToken(tok, ctx) {
  if (tok.kind === 'string' || tok.kind === 'number' || tok.kind === 'bool' || tok.kind === 'null') {
    return tok.value;
  }
  return resolvePath(ctx, tok.value);
}

/**
 * Evaluate an inline expression. The head may be a helper name, in
 * which case the tail tokens are its arguments; otherwise head is a
 * value path resolved straight against the context.
 */
function evalExpr(expr, ctx, helpers) {
  const toks = tokenizeExpr(expr);
  if (toks.length === 0) return undefined;
  const [head, ...rest] = toks;
  if (head.kind === 'path' && helpers[head.value]) {
    const args = rest.map((t) => resolveToken(t, ctx));
    return helpers[head.value].apply(null, args);
  }
  // Plain value — just resolve the single path/literal.
  return resolveToken(head, ctx);
}

function isTruthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === 'object') return Object.keys(v).length > 0;
  return Boolean(v);
}

function evalNodes(nodes, ctx, helpers, partials, escape) {
  let out = '';
  for (const node of nodes) {
    if (node.type === NODE_TEXT) {
      out += node.value;
    } else if (node.type === NODE_VAR) {
      const val = evalExpr(node.expr, ctx, helpers);
      out += escape ? htmlEscape(val) : (val === null || val === undefined ? '' : String(val));
    } else if (node.type === NODE_RAW) {
      const val = evalExpr(node.expr, ctx, helpers);
      out += val === null || val === undefined ? '' : String(val);
    } else if (node.type === NODE_IF) {
      const val = evalExpr(node.cond, ctx, helpers);
      const branch = isTruthy(val) ? node.consequent : node.alternate;
      out += evalNodes(branch, ctx, helpers, partials, escape);
    } else if (node.type === NODE_UNLESS) {
      const val = evalExpr(node.cond, ctx, helpers);
      const branch = !isTruthy(val) ? node.consequent : node.alternate;
      out += evalNodes(branch, ctx, helpers, partials, escape);
    } else if (node.type === NODE_EACH) {
      const coll = evalExpr(node.iter, ctx, helpers);
      if (Array.isArray(coll)) {
        coll.forEach((item, idx) => {
          const child = {
            __this: item,
            __parent: ctx,
            '@index': idx,
            '@first': idx === 0,
            '@last': idx === coll.length - 1,
            '@count': coll.length,
          };
          // Spread object fields so {{field}} works directly inside {{#each}}.
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            Object.assign(child, item);
          }
          out += evalNodes(node.body, child, helpers, partials, escape);
        });
      }
    } else if (node.type === NODE_PARTIAL) {
      const partial = partials[node.name];
      if (partial) {
        out += evalNodes(partial, ctx, helpers, partials, escape);
      } else {
        out += `[missing partial: ${node.name}]`;
      }
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// BUILT-IN HELPERS
// ═══════════════════════════════════════════════════════════════════

function formatCurrency(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return '';
  const n = Number(amount);
  if (Number.isNaN(n)) return String(amount);
  const cur = currency || 'ILS';
  const symbol = cur === 'ILS' ? '₪' : cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur + ' ';
  // Thousands separators, two decimals — locale-agnostic so tests are stable.
  const fixed = n.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return symbol + withCommas + '.' + decPart;
}

function formatDate(date, format) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());
  const yy = yyyy.slice(-2);
  const HH = String(d.getUTCHours()).padStart(2, '0');
  const MM = String(d.getUTCMinutes()).padStart(2, '0');
  const fmt = format || 'dd/mm/yyyy';
  return fmt
    .replace(/yyyy/g, yyyy)
    .replace(/yy/g, yy)
    .replace(/mm/g, mm)
    .replace(/dd/g, dd)
    .replace(/HH/g, HH)
    .replace(/MM/g, MM);
}

function formatNumber(n, decimals) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  const d = decimals === undefined || decimals === null ? 2 : Number(decimals);
  const fixed = num.toFixed(d);
  const [i, f] = fixed.split('.');
  const withCommas = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return f ? withCommas + '.' + f : withCommas;
}

const DEFAULT_HELPERS = {
  formatCurrency,
  formatDate,
  formatNumber,
  upper: (s) => (s == null ? '' : String(s).toUpperCase()),
  lower: (s) => (s == null ? '' : String(s).toLowerCase()),
  uppercase: (s) => (s == null ? '' : String(s).toUpperCase()),
  lowercase: (s) => (s == null ? '' : String(s).toLowerCase()),
  trim: (s) => (s == null ? '' : String(s).trim()),
  length: (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : v == null ? 0 : String(v).length),
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  gt: (a, b) => Number(a) > Number(b),
  lt: (a, b) => Number(a) < Number(b),
  gte: (a, b) => Number(a) >= Number(b),
  lte: (a, b) => Number(a) <= Number(b),
  and: (a, b) => Boolean(a) && Boolean(b),
  or: (a, b) => Boolean(a) || Boolean(b),
  not: (a) => !a,
  default: (v, fb) => (v === null || v === undefined || v === '' ? fb : v),
  concat: (...args) => args.slice(0, -1).join(''),
  t: (key) => key, // overridden per-render when i18n provided
};

// ═══════════════════════════════════════════════════════════════════
// COMPILER — tokenize → parse → cache
// ═══════════════════════════════════════════════════════════════════

function compile(src) {
  return parse(tokenize(src));
}

// ═══════════════════════════════════════════════════════════════════
// SEED TEMPLATES — lease, invoice, quote, PO, offer, termination,
// NDA, MSA, SOW, credit memo, receipt.
//
// These are deliberately compact, accurate to Israeli business
// practice, and bilingual where it makes sense. Do not delete —
// only version up.
// ═══════════════════════════════════════════════════════════════════

const SEED_TEMPLATES = [
  {
    id: 'lease_agreement',
    name_he: 'הסכם שכירות',
    name_en: 'Lease Agreement',
    category: 'legal',
    language: 'bilingual',
    content: {
      he: `הסכם שכירות

שנערך ונחתם ביום {{formatDate agreement_date 'dd/mm/yyyy'}} בין:

המשכיר: {{landlord.name}}, ת.ז./ח.פ. {{landlord.id_number}}
הכתובת: {{landlord.address}}

לבין:

השוכר: {{tenant.name}}, ת.ז./ח.פ. {{tenant.id_number}}
הכתובת: {{tenant.address}}

הואיל והמשכיר הוא הבעלים של הנכס הממוקם ב-{{property.address}}
והואיל והשוכר מעוניין לשכור את הנכס לתקופת שכירות מוסכמת,

1. תקופת השכירות: מיום {{formatDate lease_start 'dd/mm/yyyy'}} ועד יום {{formatDate lease_end 'dd/mm/yyyy'}}.
2. דמי השכירות: {{formatCurrency monthly_rent 'ILS'}} לחודש.
3. ערבויות: {{formatCurrency deposit 'ILS'}}.
{{#if includes_utilities}}4. דמי השכירות כוללים חשמל, מים וארנונה.{{/if}}
{{#if pet_allowed}}5. מותרת החזקת חיית מחמד.{{/if}}

חתימות:
המשכיר: ____________      השוכר: ____________`,
      en: `LEASE AGREEMENT

Made and entered into on {{formatDate agreement_date 'dd/mm/yyyy'}} by and between:

Landlord: {{landlord.name}}, ID/Company No. {{landlord.id_number}}
Address: {{landlord.address}}

and

Tenant: {{tenant.name}}, ID/Company No. {{tenant.id_number}}
Address: {{tenant.address}}

Whereas the Landlord is the owner of the property located at {{property.address}}
and the Tenant wishes to lease the property for an agreed term,

1. Lease Term: From {{formatDate lease_start 'dd/mm/yyyy'}} to {{formatDate lease_end 'dd/mm/yyyy'}}.
2. Monthly Rent: {{formatCurrency monthly_rent 'ILS'}}.
3. Security Deposit: {{formatCurrency deposit 'ILS'}}.
{{#if includes_utilities}}4. Rent includes electricity, water, and municipal tax.{{/if}}
{{#if pet_allowed}}5. Pets are allowed on the premises.{{/if}}

Signatures:
Landlord: ____________      Tenant: ____________`,
    },
    variables: [
      { name: 'agreement_date', type: 'date', required: true },
      { name: 'landlord', type: 'object', required: true },
      { name: 'tenant', type: 'object', required: true },
      { name: 'property', type: 'object', required: true },
      { name: 'lease_start', type: 'date', required: true },
      { name: 'lease_end', type: 'date', required: true },
      { name: 'monthly_rent', type: 'number', required: true },
      { name: 'deposit', type: 'number', required: true, default: 0 },
      { name: 'includes_utilities', type: 'boolean', required: false, default: false },
      { name: 'pet_allowed', type: 'boolean', required: false, default: false },
    ],
    sections: [
      { id: 'parties', conditional: null },
      { id: 'term', conditional: null },
      { id: 'utilities', conditional: 'includes_utilities' },
      { id: 'pets', conditional: 'pet_allowed' },
    ],
  },

  {
    id: 'invoice',
    name_he: 'חשבונית מס',
    name_en: 'Tax Invoice',
    category: 'financial',
    language: 'bilingual',
    content: {
      he: `חשבונית מס מס' {{invoice_number}}
תאריך: {{formatDate issue_date 'dd/mm/yyyy'}}

ספק: {{supplier.name}} ח.פ. {{supplier.tax_id}}
לקוח: {{customer.name}} ח.פ. {{customer.tax_id}}

פריטים:
{{#each items}}  {{@index}}. {{description}} — {{quantity}} × {{formatCurrency unit_price 'ILS'}} = {{formatCurrency total 'ILS'}}
{{/each}}
סכום ביניים: {{formatCurrency subtotal 'ILS'}}
מע"מ ({{vat_rate}}%): {{formatCurrency vat_amount 'ILS'}}
סה"כ לתשלום: {{formatCurrency total_amount 'ILS'}}

{{#if notes}}הערות: {{notes}}{{/if}}`,
      en: `TAX INVOICE #{{invoice_number}}
Date: {{formatDate issue_date 'dd/mm/yyyy'}}

Supplier: {{supplier.name}} Tax ID {{supplier.tax_id}}
Customer: {{customer.name}} Tax ID {{customer.tax_id}}

Items:
{{#each items}}  {{@index}}. {{description}} — {{quantity}} × {{formatCurrency unit_price 'ILS'}} = {{formatCurrency total 'ILS'}}
{{/each}}
Subtotal: {{formatCurrency subtotal 'ILS'}}
VAT ({{vat_rate}}%): {{formatCurrency vat_amount 'ILS'}}
Total due: {{formatCurrency total_amount 'ILS'}}

{{#if notes}}Notes: {{notes}}{{/if}}`,
    },
    variables: [
      { name: 'invoice_number', type: 'string', required: true },
      { name: 'issue_date', type: 'date', required: true },
      { name: 'supplier', type: 'object', required: true },
      { name: 'customer', type: 'object', required: true },
      { name: 'items', type: 'array', required: true },
      { name: 'subtotal', type: 'number', required: true },
      { name: 'vat_rate', type: 'number', required: true, default: 18 },
      { name: 'vat_amount', type: 'number', required: true },
      { name: 'total_amount', type: 'number', required: true },
      { name: 'notes', type: 'string', required: false, default: '' },
    ],
    sections: [
      { id: 'header', conditional: null },
      { id: 'items', conditional: null },
      { id: 'totals', conditional: null },
      { id: 'notes', conditional: 'notes' },
    ],
  },

  {
    id: 'quote',
    name_he: 'הצעת מחיר',
    name_en: 'Price Quote',
    category: 'sales',
    language: 'bilingual',
    content: {
      he: `הצעת מחיר מס' {{quote_number}}
תאריך: {{formatDate issue_date 'dd/mm/yyyy'}}
תוקף עד: {{formatDate valid_until 'dd/mm/yyyy'}}

לכבוד: {{customer.name}}

הננו מתכבדים להגיש לכם הצעת מחיר עבור:
{{#each items}}  - {{description}}: {{formatCurrency unit_price 'ILS'}}
{{/each}}
סה"כ לפני מע"מ: {{formatCurrency subtotal 'ILS'}}
מע"מ: {{formatCurrency vat_amount 'ILS'}}
סה"כ כולל מע"מ: {{formatCurrency total_amount 'ILS'}}

{{#if terms}}תנאים: {{terms}}{{/if}}`,
      en: `QUOTE #{{quote_number}}
Date: {{formatDate issue_date 'dd/mm/yyyy'}}
Valid until: {{formatDate valid_until 'dd/mm/yyyy'}}

To: {{customer.name}}

We are pleased to offer you the following:
{{#each items}}  - {{description}}: {{formatCurrency unit_price 'ILS'}}
{{/each}}
Subtotal: {{formatCurrency subtotal 'ILS'}}
VAT: {{formatCurrency vat_amount 'ILS'}}
Total inc. VAT: {{formatCurrency total_amount 'ILS'}}

{{#if terms}}Terms: {{terms}}{{/if}}`,
    },
    variables: [
      { name: 'quote_number', type: 'string', required: true },
      { name: 'issue_date', type: 'date', required: true },
      { name: 'valid_until', type: 'date', required: true },
      { name: 'customer', type: 'object', required: true },
      { name: 'items', type: 'array', required: true },
      { name: 'subtotal', type: 'number', required: true },
      { name: 'vat_amount', type: 'number', required: true },
      { name: 'total_amount', type: 'number', required: true },
      { name: 'terms', type: 'string', required: false, default: '' },
    ],
    sections: [
      { id: 'header', conditional: null },
      { id: 'items', conditional: null },
      { id: 'terms', conditional: 'terms' },
    ],
  },

  {
    id: 'purchase_order',
    name_he: 'הזמנת רכש',
    name_en: 'Purchase Order',
    category: 'procurement',
    language: 'bilingual',
    content: {
      he: `הזמנת רכש מס' {{po_number}}
תאריך: {{formatDate po_date 'dd/mm/yyyy'}}

לספק: {{supplier.name}} ח.פ. {{supplier.tax_id}}
מאת: {{buyer.name}}

אנא ספקו את הפריטים הבאים:
{{#each items}}  {{@index}}. {{description}} — כמות: {{quantity}} — מחיר יחידה: {{formatCurrency unit_price 'ILS'}}
{{/each}}
סה"כ הזמנה: {{formatCurrency total_amount 'ILS'}}

תאריך אספקה נדרש: {{formatDate delivery_date 'dd/mm/yyyy'}}
כתובת אספקה: {{delivery_address}}

{{#if special_instructions}}הוראות מיוחדות: {{special_instructions}}{{/if}}`,
      en: `PURCHASE ORDER #{{po_number}}
Date: {{formatDate po_date 'dd/mm/yyyy'}}

To Supplier: {{supplier.name}} Tax ID {{supplier.tax_id}}
From: {{buyer.name}}

Please supply the following items:
{{#each items}}  {{@index}}. {{description}} — Qty: {{quantity}} — Unit: {{formatCurrency unit_price 'ILS'}}
{{/each}}
Order Total: {{formatCurrency total_amount 'ILS'}}

Required delivery: {{formatDate delivery_date 'dd/mm/yyyy'}}
Ship to: {{delivery_address}}

{{#if special_instructions}}Special instructions: {{special_instructions}}{{/if}}`,
    },
    variables: [
      { name: 'po_number', type: 'string', required: true },
      { name: 'po_date', type: 'date', required: true },
      { name: 'supplier', type: 'object', required: true },
      { name: 'buyer', type: 'object', required: true },
      { name: 'items', type: 'array', required: true },
      { name: 'total_amount', type: 'number', required: true },
      { name: 'delivery_date', type: 'date', required: true },
      { name: 'delivery_address', type: 'string', required: true },
      { name: 'special_instructions', type: 'string', required: false, default: '' },
    ],
    sections: [
      { id: 'header', conditional: null },
      { id: 'items', conditional: null },
      { id: 'delivery', conditional: null },
      { id: 'instructions', conditional: 'special_instructions' },
    ],
  },

  {
    id: 'offer_letter',
    name_he: 'מכתב הצעת עבודה',
    name_en: 'Offer Letter',
    category: 'hr',
    language: 'bilingual',
    content: {
      he: `מכתב הצעת עבודה

לכבוד {{candidate.name}},

אנו שמחים להציע לך את תפקיד {{position.title}} במחלקת {{position.department}}.

תנאי העסקה:
- תאריך תחילת עבודה: {{formatDate start_date 'dd/mm/yyyy'}}
- משכורת חודשית: {{formatCurrency salary 'ILS'}}
- שעות עבודה: {{work_hours}} שעות שבועיות
{{#if has_equity}}- הקצאת אופציות: {{equity_shares}} מניות{{/if}}
{{#if has_bonus}}- בונוס שנתי: עד {{formatCurrency max_bonus 'ILS'}}{{/if}}

ההצעה תקפה עד {{formatDate offer_valid_until 'dd/mm/yyyy'}}.

בברכה,
{{hiring_manager.name}}
{{hiring_manager.title}}`,
      en: `OFFER LETTER

Dear {{candidate.name}},

We are pleased to offer you the position of {{position.title}} in the {{position.department}} department.

Terms of employment:
- Start date: {{formatDate start_date 'dd/mm/yyyy'}}
- Monthly salary: {{formatCurrency salary 'ILS'}}
- Work hours: {{work_hours}} hours per week
{{#if has_equity}}- Equity grant: {{equity_shares}} shares{{/if}}
{{#if has_bonus}}- Annual bonus: up to {{formatCurrency max_bonus 'ILS'}}{{/if}}

This offer is valid until {{formatDate offer_valid_until 'dd/mm/yyyy'}}.

Sincerely,
{{hiring_manager.name}}
{{hiring_manager.title}}`,
    },
    variables: [
      { name: 'candidate', type: 'object', required: true },
      { name: 'position', type: 'object', required: true },
      { name: 'start_date', type: 'date', required: true },
      { name: 'salary', type: 'number', required: true },
      { name: 'work_hours', type: 'number', required: true, default: 42 },
      { name: 'has_equity', type: 'boolean', required: false, default: false },
      { name: 'equity_shares', type: 'number', required: false, default: 0 },
      { name: 'has_bonus', type: 'boolean', required: false, default: false },
      { name: 'max_bonus', type: 'number', required: false, default: 0 },
      { name: 'offer_valid_until', type: 'date', required: true },
      { name: 'hiring_manager', type: 'object', required: true },
    ],
    sections: [
      { id: 'greeting', conditional: null },
      { id: 'terms', conditional: null },
      { id: 'equity', conditional: 'has_equity' },
      { id: 'bonus', conditional: 'has_bonus' },
    ],
  },

  {
    id: 'termination_letter',
    name_he: 'מכתב סיום העסקה',
    name_en: 'Termination Letter',
    category: 'hr',
    language: 'bilingual',
    content: {
      he: `מכתב סיום העסקה

לכבוד {{employee.name}},

בהמשך לשיחה שנערכה בין הצדדים, אנו מאשרים את סיום העסקתך בחברה החל מיום {{formatDate termination_date 'dd/mm/yyyy'}}.

עובד יקבל:
- פיצויי פיטורין: {{formatCurrency severance 'ILS'}}
- דמי הודעה מוקדמת: {{notice_period}} ימים
- פדיון חופשה: {{formatCurrency vacation_payout 'ILS'}}

{{#if reason}}סיבת סיום: {{reason}}{{/if}}

אנו מאחלים לך הצלחה רבה בהמשך דרכך.

בברכה,
{{hr_manager.name}}
מחלקת משאבי אנוש`,
      en: `TERMINATION LETTER

Dear {{employee.name}},

Following our discussion, we confirm the termination of your employment with the company effective {{formatDate termination_date 'dd/mm/yyyy'}}.

You will receive:
- Severance pay: {{formatCurrency severance 'ILS'}}
- Notice period: {{notice_period}} days
- Vacation payout: {{formatCurrency vacation_payout 'ILS'}}

{{#if reason}}Reason: {{reason}}{{/if}}

We wish you success in your future endeavors.

Sincerely,
{{hr_manager.name}}
Human Resources`,
    },
    variables: [
      { name: 'employee', type: 'object', required: true },
      { name: 'termination_date', type: 'date', required: true },
      { name: 'severance', type: 'number', required: true, default: 0 },
      { name: 'notice_period', type: 'number', required: true, default: 30 },
      { name: 'vacation_payout', type: 'number', required: true, default: 0 },
      { name: 'reason', type: 'string', required: false, default: '' },
      { name: 'hr_manager', type: 'object', required: true },
    ],
    sections: [
      { id: 'header', conditional: null },
      { id: 'entitlements', conditional: null },
      { id: 'reason', conditional: 'reason' },
    ],
  },

  {
    id: 'nda',
    name_he: 'הסכם סודיות',
    name_en: 'Non-Disclosure Agreement',
    category: 'legal',
    language: 'bilingual',
    content: {
      he: `הסכם סודיות (NDA)

בין: {{disclosing_party.name}} ("הצד המגלה")
ובין: {{receiving_party.name}} ("הצד המקבל")

בתוקף מיום: {{formatDate effective_date 'dd/mm/yyyy'}}
תקופת תוקף: {{term_years}} שנים

1. הצדדים מסכימים להחליף מידע סודי לצורך {{purpose}}.
2. הצד המקבל מתחייב לשמור בסודיות את המידע ולא להשתמש בו אלא לצורך המטרה המוגדרת.
3. הסכם זה יישאר בתוקף למשך {{term_years}} שנים.
{{#if includes_non_compete}}4. הצד המקבל מתחייב שלא להתחרות בצד המגלה למשך {{non_compete_months}} חודשים.{{/if}}

חתימות:
{{disclosing_party.name}}: ____________
{{receiving_party.name}}: ____________`,
      en: `NON-DISCLOSURE AGREEMENT

Between: {{disclosing_party.name}} ("Disclosing Party")
And: {{receiving_party.name}} ("Receiving Party")

Effective date: {{formatDate effective_date 'dd/mm/yyyy'}}
Term: {{term_years}} years

1. The parties agree to exchange confidential information for the purpose of {{purpose}}.
2. The Receiving Party shall keep the information confidential and use it only for the stated purpose.
3. This agreement shall remain in effect for {{term_years}} years.
{{#if includes_non_compete}}4. The Receiving Party agrees not to compete with the Disclosing Party for {{non_compete_months}} months.{{/if}}

Signatures:
{{disclosing_party.name}}: ____________
{{receiving_party.name}}: ____________`,
    },
    variables: [
      { name: 'disclosing_party', type: 'object', required: true },
      { name: 'receiving_party', type: 'object', required: true },
      { name: 'effective_date', type: 'date', required: true },
      { name: 'term_years', type: 'number', required: true, default: 3 },
      { name: 'purpose', type: 'string', required: true },
      { name: 'includes_non_compete', type: 'boolean', required: false, default: false },
      { name: 'non_compete_months', type: 'number', required: false, default: 0 },
    ],
    sections: [
      { id: 'parties', conditional: null },
      { id: 'terms', conditional: null },
      { id: 'non_compete', conditional: 'includes_non_compete' },
    ],
  },

  {
    id: 'msa',
    name_he: 'הסכם מסגרת לשירותים',
    name_en: 'Master Services Agreement',
    category: 'legal',
    language: 'bilingual',
    content: {
      he: `הסכם מסגרת לשירותים (MSA)

בין: {{client.name}} ח.פ. {{client.tax_id}} ("הלקוח")
ובין: {{vendor.name}} ח.פ. {{vendor.tax_id}} ("הספק")

בתוקף מיום: {{formatDate effective_date 'dd/mm/yyyy'}}

1. היקף: הספק יספק ללקוח שירותים בהתאם להצהרות עבודה (SOW) שייחתמו מעת לעת.
2. תנאי תשלום: {{payment_terms}}
3. תקופה: הסכם זה ייכנס לתוקף ביום האפקטיבי ויישאר בתוקף למשך {{term_years}} שנים.
4. קניין רוחני: כל קניין רוחני שייווצר במסגרת עבודה זו יהיה רכוש הלקוח.
{{#if has_sla}}5. רמת שירות: {{sla_description}}{{/if}}

חתימות:
הלקוח: ____________      הספק: ____________`,
      en: `MASTER SERVICES AGREEMENT (MSA)

Between: {{client.name}} Tax ID {{client.tax_id}} ("Client")
And: {{vendor.name}} Tax ID {{vendor.tax_id}} ("Vendor")

Effective date: {{formatDate effective_date 'dd/mm/yyyy'}}

1. Scope: Vendor will provide Client with services pursuant to Statements of Work (SOWs) signed from time to time.
2. Payment terms: {{payment_terms}}
3. Term: This Agreement shall take effect on the Effective Date and remain in force for {{term_years}} years.
4. Intellectual Property: All IP created in the course of this work shall be the property of the Client.
{{#if has_sla}}5. Service Level: {{sla_description}}{{/if}}

Signatures:
Client: ____________      Vendor: ____________`,
    },
    variables: [
      { name: 'client', type: 'object', required: true },
      { name: 'vendor', type: 'object', required: true },
      { name: 'effective_date', type: 'date', required: true },
      { name: 'payment_terms', type: 'string', required: true, default: 'Net 30' },
      { name: 'term_years', type: 'number', required: true, default: 2 },
      { name: 'has_sla', type: 'boolean', required: false, default: false },
      { name: 'sla_description', type: 'string', required: false, default: '' },
    ],
    sections: [
      { id: 'parties', conditional: null },
      { id: 'terms', conditional: null },
      { id: 'sla', conditional: 'has_sla' },
    ],
  },

  {
    id: 'sow',
    name_he: 'הצהרת עבודה',
    name_en: 'Statement of Work',
    category: 'legal',
    language: 'bilingual',
    content: {
      he: `הצהרת עבודה (SOW) מס' {{sow_number}}
תאריך: {{formatDate sow_date 'dd/mm/yyyy'}}
הסכם מסגרת: {{msa_reference}}

לקוח: {{client.name}}
ספק: {{vendor.name}}

פרויקט: {{project.name}}

היקף עבודה:
{{project.description}}

אבני דרך:
{{#each milestones}}  {{@index}}. {{name}} — תאריך יעד: {{formatDate due_date 'dd/mm/yyyy'}} — סכום: {{formatCurrency amount 'ILS'}}
{{/each}}
סה"כ עלות הפרויקט: {{formatCurrency total_cost 'ILS'}}

תאריך התחלה: {{formatDate start_date 'dd/mm/yyyy'}}
תאריך סיום: {{formatDate end_date 'dd/mm/yyyy'}}`,
      en: `STATEMENT OF WORK #{{sow_number}}
Date: {{formatDate sow_date 'dd/mm/yyyy'}}
Master Agreement: {{msa_reference}}

Client: {{client.name}}
Vendor: {{vendor.name}}

Project: {{project.name}}

Scope of work:
{{project.description}}

Milestones:
{{#each milestones}}  {{@index}}. {{name}} — Due: {{formatDate due_date 'dd/mm/yyyy'}} — Amount: {{formatCurrency amount 'ILS'}}
{{/each}}
Total project cost: {{formatCurrency total_cost 'ILS'}}

Start date: {{formatDate start_date 'dd/mm/yyyy'}}
End date: {{formatDate end_date 'dd/mm/yyyy'}}`,
    },
    variables: [
      { name: 'sow_number', type: 'string', required: true },
      { name: 'sow_date', type: 'date', required: true },
      { name: 'msa_reference', type: 'string', required: true },
      { name: 'client', type: 'object', required: true },
      { name: 'vendor', type: 'object', required: true },
      { name: 'project', type: 'object', required: true },
      { name: 'milestones', type: 'array', required: true },
      { name: 'total_cost', type: 'number', required: true },
      { name: 'start_date', type: 'date', required: true },
      { name: 'end_date', type: 'date', required: true },
    ],
    sections: [
      { id: 'header', conditional: null },
      { id: 'scope', conditional: null },
      { id: 'milestones', conditional: null },
    ],
  },

  {
    id: 'credit_memo',
    name_he: 'חשבונית זיכוי',
    name_en: 'Credit Memo',
    category: 'financial',
    language: 'bilingual',
    content: {
      he: `חשבונית זיכוי מס' {{credit_memo_number}}
תאריך: {{formatDate issue_date 'dd/mm/yyyy'}}
חשבונית מקורית: {{original_invoice_number}}

ספק: {{supplier.name}} ח.פ. {{supplier.tax_id}}
לקוח: {{customer.name}} ח.פ. {{customer.tax_id}}

סיבת הזיכוי: {{reason}}

פריטים לזיכוי:
{{#each items}}  {{@index}}. {{description}} — {{quantity}} × {{formatCurrency unit_price 'ILS'}} = {{formatCurrency total 'ILS'}}
{{/each}}
סכום ביניים: {{formatCurrency subtotal 'ILS'}}
מע"מ: {{formatCurrency vat_amount 'ILS'}}
סה"כ לזיכוי: {{formatCurrency total_amount 'ILS'}}`,
      en: `CREDIT MEMO #{{credit_memo_number}}
Date: {{formatDate issue_date 'dd/mm/yyyy'}}
Original invoice: {{original_invoice_number}}

Supplier: {{supplier.name}} Tax ID {{supplier.tax_id}}
Customer: {{customer.name}} Tax ID {{customer.tax_id}}

Reason for credit: {{reason}}

Items credited:
{{#each items}}  {{@index}}. {{description}} — {{quantity}} × {{formatCurrency unit_price 'ILS'}} = {{formatCurrency total 'ILS'}}
{{/each}}
Subtotal: {{formatCurrency subtotal 'ILS'}}
VAT: {{formatCurrency vat_amount 'ILS'}}
Total credit: {{formatCurrency total_amount 'ILS'}}`,
    },
    variables: [
      { name: 'credit_memo_number', type: 'string', required: true },
      { name: 'issue_date', type: 'date', required: true },
      { name: 'original_invoice_number', type: 'string', required: true },
      { name: 'supplier', type: 'object', required: true },
      { name: 'customer', type: 'object', required: true },
      { name: 'reason', type: 'string', required: true },
      { name: 'items', type: 'array', required: true },
      { name: 'subtotal', type: 'number', required: true },
      { name: 'vat_amount', type: 'number', required: true },
      { name: 'total_amount', type: 'number', required: true },
    ],
    sections: [
      { id: 'header', conditional: null },
      { id: 'reason', conditional: null },
      { id: 'items', conditional: null },
    ],
  },

  {
    id: 'receipt',
    name_he: 'קבלה',
    name_en: 'Receipt',
    category: 'financial',
    language: 'bilingual',
    content: {
      he: `קבלה מס' {{receipt_number}}
תאריך: {{formatDate issue_date 'dd/mm/yyyy'}}

התקבל מאת: {{customer.name}}
ח.פ./ת.ז.: {{customer.tax_id}}

עבור: {{description}}

אמצעי תשלום: {{payment_method}}
{{#if reference_number}}אסמכתא: {{reference_number}}{{/if}}

סכום: {{formatCurrency amount 'ILS'}}

תודה על התשלום.

{{company.name}}
ח.פ. {{company.tax_id}}`,
      en: `RECEIPT #{{receipt_number}}
Date: {{formatDate issue_date 'dd/mm/yyyy'}}

Received from: {{customer.name}}
Tax ID: {{customer.tax_id}}

For: {{description}}

Payment method: {{payment_method}}
{{#if reference_number}}Reference: {{reference_number}}{{/if}}

Amount: {{formatCurrency amount 'ILS'}}

Thank you for your payment.

{{company.name}}
Tax ID {{company.tax_id}}`,
    },
    variables: [
      { name: 'receipt_number', type: 'string', required: true },
      { name: 'issue_date', type: 'date', required: true },
      { name: 'customer', type: 'object', required: true },
      { name: 'description', type: 'string', required: true },
      { name: 'payment_method', type: 'string', required: true },
      { name: 'reference_number', type: 'string', required: false, default: '' },
      { name: 'amount', type: 'number', required: true },
      { name: 'company', type: 'object', required: true },
    ],
    sections: [
      { id: 'header', conditional: null },
      { id: 'payment', conditional: null },
      { id: 'reference', conditional: 'reference_number' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// MAIN CLASS
// ═══════════════════════════════════════════════════════════════════

class DocumentTemplates {
  constructor(options) {
    const opts = options || {};
    this._templates = new Map(); // id → current template
    this._versions = new Map(); // id → [{version, template, timestamp, note}]
    this._approvals = new Map(); // id → [{approver, status, timestamp}]
    this._partials = new Map(); // name → compiled AST
    this._rawPartials = new Map(); // name → source
    this._helpers = Object.assign({}, DEFAULT_HELPERS, opts.helpers || {});
    this._compileCache = new Map(); // key → AST
    this._nowFn = opts.now || (() => new Date().toISOString());

    if (opts.seed !== false) {
      for (const seed of SEED_TEMPLATES) {
        this.registerTemplate(seed);
      }
    }
  }

  // ----------------------------------------------------------------
  // registerTemplate: validates shape, versions prior if present.
  // Legal-sensitive templates require an approval workflow before
  // they can be used in production — but the registration itself
  // always succeeds, since we never delete anything.
  // ----------------------------------------------------------------
  registerTemplate(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('registerTemplate: spec object required');
    }
    const id = spec.id;
    if (!id || typeof id !== 'string') {
      throw new Error('registerTemplate: spec.id required');
    }
    if (!spec.content) {
      throw new Error(`registerTemplate(${id}): spec.content required`);
    }

    // Normalize content: always store as { he, en } map even if caller
    // passed a plain string for a single-language template.
    let content;
    if (typeof spec.content === 'string') {
      const lang = spec.language === 'en' ? 'en' : 'he';
      content = { [lang]: spec.content };
    } else {
      content = Object.assign({}, spec.content);
    }

    // Compile all languages up-front to catch syntax errors during
    // registration — fail loud on bad templates.
    const compiled = {};
    for (const [lang, src] of Object.entries(content)) {
      compiled[lang] = compile(src);
    }

    const record = {
      id,
      name_he: spec.name_he || id,
      name_en: spec.name_en || id,
      category: spec.category || 'general',
      language: spec.language || 'bilingual',
      content,
      compiled,
      variables: Array.isArray(spec.variables) ? spec.variables.slice() : [],
      sections: Array.isArray(spec.sections) ? spec.sections.slice() : [],
      version: 1,
      created_at: this._nowFn(),
      updated_at: this._nowFn(),
      legal_sensitive: ['legal', 'hr'].includes(spec.category || 'general'),
    };

    const prior = this._templates.get(id);
    if (prior) {
      record.version = prior.version + 1;
      record.created_at = prior.created_at;
      this._snapshotVersion(id, prior, 'superseded');
    }

    this._templates.set(id, record);
    return { id, version: record.version };
  }

  _snapshotVersion(id, template, note) {
    const list = this._versions.get(id) || [];
    list.push({
      version: template.version,
      template: JSON.parse(JSON.stringify({
        id: template.id,
        name_he: template.name_he,
        name_en: template.name_en,
        category: template.category,
        language: template.language,
        content: template.content,
        variables: template.variables,
        sections: template.sections,
      })),
      timestamp: this._nowFn(),
      note: note || '',
    });
    this._versions.set(id, list);
  }

  // ----------------------------------------------------------------
  // render: fills variables, evaluates conditionals + loops, runs
  // helpers. `context.lang` or `options.lang` selects the language
  // variant (default: Hebrew). Raises on missing required vars.
  // ----------------------------------------------------------------
  render({ templateId, context, lang, escape }) {
    const tpl = this._templates.get(templateId);
    if (!tpl) throw new Error(`Template not found: ${templateId}`);

    const validation = this.validate({ templateId, context });
    if (!validation.valid) {
      throw new Error(`Missing required variables: ${validation.missing.join(', ')}`);
    }

    const chosenLang = lang || (context && context.lang) || this._defaultLang(tpl);
    const ast = tpl.compiled[chosenLang] || tpl.compiled[this._fallbackLang(tpl, chosenLang)];
    if (!ast) {
      throw new Error(`No content for language "${chosenLang}" on template ${templateId}`);
    }

    // Apply defaults without mutating caller's context.
    const ctx = this._applyDefaults(tpl, context || {});

    // Resolve partials lazily — compile source on first use.
    const partials = {};
    for (const [name, src] of this._rawPartials.entries()) {
      if (!this._partials.has(name)) {
        this._partials.set(name, compile(src));
      }
      partials[name] = this._partials.get(name);
    }

    const doEscape = escape === true;
    return evalNodes(ast, ctx, this._helpers, partials, doEscape);
  }

  _defaultLang(tpl) {
    if (tpl.content.he) return 'he';
    if (tpl.content.en) return 'en';
    const keys = Object.keys(tpl.content);
    return keys[0];
  }

  _fallbackLang(tpl, requested) {
    // Hebrew-first fallback: if requested not present, try he, then en,
    // then any other language.
    if (requested !== 'he' && tpl.content.he) return 'he';
    if (requested !== 'en' && tpl.content.en) return 'en';
    const keys = Object.keys(tpl.content).filter((k) => k !== requested);
    return keys[0];
  }

  _applyDefaults(tpl, context) {
    const ctx = Object.assign({}, context);
    for (const v of tpl.variables) {
      if ((ctx[v.name] === undefined || ctx[v.name] === null) && v.default !== undefined) {
        ctx[v.name] = v.default;
      }
    }
    return ctx;
  }

  // ----------------------------------------------------------------
  // renderBilingual: side-by-side Hebrew / English columns, with
  // sane fallback if one language is missing.
  // ----------------------------------------------------------------
  renderBilingual({ templateId, context, separator }) {
    const tpl = this._templates.get(templateId);
    if (!tpl) throw new Error(`Template not found: ${templateId}`);
    const sep = separator || '\n\n─────────────────────────────\n\n';
    const he = this.render({ templateId, context, lang: 'he' });
    const en = this.render({ templateId, context, lang: 'en' });
    return {
      he,
      en,
      combined: he + sep + en,
    };
  }

  // ----------------------------------------------------------------
  // validate: checks all required variables are supplied (after
  // applying declared defaults). Returns {valid, missing, warnings}.
  // ----------------------------------------------------------------
  validate({ templateId, context }) {
    const tpl = this._templates.get(templateId);
    if (!tpl) {
      return { valid: false, missing: [], warnings: [], error: `Template not found: ${templateId}` };
    }
    const missing = [];
    const warnings = [];
    const ctx = context || {};
    for (const v of tpl.variables) {
      if (!v.required) continue;
      const hasDefault = v.default !== undefined;
      const raw = ctx[v.name];
      if ((raw === undefined || raw === null || raw === '') && !hasDefault) {
        missing.push(v.name);
      } else if (v.type === 'array' && raw !== undefined && !Array.isArray(raw)) {
        warnings.push(`${v.name}: expected array, got ${typeof raw}`);
      } else if (v.type === 'object' && raw !== undefined && (typeof raw !== 'object' || Array.isArray(raw))) {
        warnings.push(`${v.name}: expected object, got ${Array.isArray(raw) ? 'array' : typeof raw}`);
      } else if (v.type === 'number' && raw !== undefined && raw !== null && raw !== '' && Number.isNaN(Number(raw))) {
        warnings.push(`${v.name}: expected number, got ${typeof raw}`);
      }
    }
    return {
      valid: missing.length === 0,
      missing,
      warnings,
    };
  }

  // ----------------------------------------------------------------
  // testTemplate: runs each fixture through render() and returns a
  // summary. Used in CI to catch template regressions.
  // ----------------------------------------------------------------
  testTemplate(templateId, fixtures) {
    const tpl = this._templates.get(templateId);
    if (!tpl) {
      return { templateId, passed: 0, failed: 1, errors: [`Template not found: ${templateId}`] };
    }
    const fixtureList = Array.isArray(fixtures) ? fixtures : [fixtures];
    const results = [];
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < fixtureList.length; i += 1) {
      const f = fixtureList[i] || {};
      const name = f.name || `fixture_${i}`;
      try {
        const validation = this.validate({ templateId, context: f.context });
        if (!validation.valid && f.expect_valid !== false) {
          failed += 1;
          results.push({
            name,
            passed: false,
            error: `Missing required: ${validation.missing.join(', ')}`,
          });
          continue;
        }
        if (validation.valid && f.expect_valid === false) {
          failed += 1;
          results.push({
            name,
            passed: false,
            error: 'Expected validation failure, but validation passed',
          });
          continue;
        }
        if (validation.valid) {
          const output = this.render({ templateId, context: f.context, lang: f.lang });
          if (f.expect_contains) {
            const substrings = Array.isArray(f.expect_contains) ? f.expect_contains : [f.expect_contains];
            const missing = substrings.filter((s) => !output.includes(s));
            if (missing.length > 0) {
              failed += 1;
              results.push({
                name,
                passed: false,
                error: `Output missing substrings: ${missing.join(', ')}`,
                output,
              });
              continue;
            }
          }
          if (f.expect_not_contains) {
            const substrings = Array.isArray(f.expect_not_contains) ? f.expect_not_contains : [f.expect_not_contains];
            const found = substrings.filter((s) => output.includes(s));
            if (found.length > 0) {
              failed += 1;
              results.push({
                name,
                passed: false,
                error: `Output contained forbidden substrings: ${found.join(', ')}`,
                output,
              });
              continue;
            }
          }
          passed += 1;
          results.push({ name, passed: true, output });
        } else {
          passed += 1;
          results.push({ name, passed: true });
        }
      } catch (err) {
        failed += 1;
        results.push({ name, passed: false, error: err.message });
      }
    }

    return {
      templateId,
      passed,
      failed,
      total: fixtureList.length,
      results,
    };
  }

  // ----------------------------------------------------------------
  // versionTemplate: returns full version history including current.
  // Never mutates — used for audit / diff UI.
  // ----------------------------------------------------------------
  versionTemplate(templateId) {
    const tpl = this._templates.get(templateId);
    if (!tpl) return { templateId, current: null, history: [] };
    const history = (this._versions.get(templateId) || []).slice();
    return {
      templateId,
      current: {
        version: tpl.version,
        created_at: tpl.created_at,
        updated_at: tpl.updated_at,
        name_he: tpl.name_he,
        name_en: tpl.name_en,
      },
      history,
      total_versions: history.length + 1,
    };
  }

  // ----------------------------------------------------------------
  // dependencies: find every template whose content references the
  // target as a {{> partial}}. Invoiced as an impact analysis when
  // a partial is updated.
  // ----------------------------------------------------------------
  dependencies(templateId) {
    const deps = [];
    const target = templateId;
    for (const [id, tpl] of this._templates.entries()) {
      if (id === target) continue;
      let usesAsPartial = false;
      for (const src of Object.values(tpl.content)) {
        // Look for {{> target}} with optional whitespace.
        const regex = new RegExp('\\{\\{\\s*>\\s*' + escapeRegex(target) + '\\s*\\}\\}');
        if (regex.test(src)) {
          usesAsPartial = true;
          break;
        }
      }
      if (usesAsPartial) {
        deps.push({ id, name_he: tpl.name_he, name_en: tpl.name_en, category: tpl.category });
      }
    }
    return {
      templateId,
      isPartial: this._rawPartials.has(templateId),
      dependents: deps,
      count: deps.length,
    };
  }

  // Register a reusable fragment that can be pulled into other
  // templates via {{> name}}.
  registerPartial(name, source) {
    if (!name || typeof name !== 'string') {
      throw new Error('registerPartial: name required');
    }
    this._rawPartials.set(name, source);
    this._partials.set(name, compile(source));
    return { name };
  }

  // ----------------------------------------------------------------
  // renderFormats: wraps the rendered content in a format-appropriate
  // envelope (html / pdf / docx / txt / md). The docx / pdf branches
  // return structured objects that a downstream renderer can consume;
  // the goal here is to keep templates.js zero-dep.
  // ----------------------------------------------------------------
  renderFormats({ templateId, context, format, lang }) {
    const fmt = (format || 'txt').toLowerCase();
    const plain = this.render({ templateId, context, lang });
    const tpl = this._templates.get(templateId);
    const name = (tpl && (lang === 'en' ? tpl.name_en : tpl.name_he)) || templateId;

    if (fmt === 'txt') {
      return { format: 'txt', content: plain, mime: 'text/plain' };
    }

    if (fmt === 'md') {
      const heading = `# ${name}\n\n`;
      return { format: 'md', content: heading + plain, mime: 'text/markdown' };
    }

    if (fmt === 'html') {
      const escaped = this.render({ templateId, context, lang, escape: true });
      const isHebrew = (lang || this._defaultLang(tpl)) === 'he';
      const dir = isHebrew ? 'rtl' : 'ltr';
      const body = escaped
        .split(/\r?\n/)
        .map((line) => (line.trim() === '' ? '<br/>' : `<p>${line}</p>`))
        .join('\n');
      const html = `<!doctype html>
<html lang="${isHebrew ? 'he' : 'en'}" dir="${dir}">
<head><meta charset="utf-8"><title>${htmlEscape(name)}</title></head>
<body>
<h1>${htmlEscape(name)}</h1>
${body}
</body>
</html>`;
      return { format: 'html', content: html, mime: 'text/html' };
    }

    if (fmt === 'pdf') {
      // Zero-dep policy: emit a spec the downstream PDF writer can consume.
      return {
        format: 'pdf',
        content: plain,
        mime: 'application/pdf',
        pdf_spec: {
          title: name,
          language: lang || this._defaultLang(tpl),
          direction: (lang || this._defaultLang(tpl)) === 'he' ? 'rtl' : 'ltr',
          page_size: 'A4',
          font: 'Arial',
          body: plain,
        },
      };
    }

    if (fmt === 'docx') {
      return {
        format: 'docx',
        content: plain,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        docx_spec: {
          title: name,
          language: lang || this._defaultLang(tpl),
          direction: (lang || this._defaultLang(tpl)) === 'he' ? 'rtl' : 'ltr',
          paragraphs: plain.split(/\r?\n/),
        },
      };
    }

    throw new Error(`Unsupported format: ${format}`);
  }

  // ----------------------------------------------------------------
  // approvalWorkflow: gates legal-sensitive template changes behind
  // a reviewer sign-off list. Stores a proposal; does NOT mutate the
  // template — a separate `applyApproved` call would promote it.
  // ----------------------------------------------------------------
  approvalWorkflow({ templateId, approvers, action, reviewer, decision, note }) {
    const tpl = this._templates.get(templateId);
    if (!tpl) throw new Error(`Template not found: ${templateId}`);

    const state = this._approvals.get(templateId) || {
      templateId,
      required_approvers: [],
      approvals: [],
      status: 'not_required',
    };

    // "propose" — open a new approval round.
    if (action === 'propose' || approvers) {
      if (!Array.isArray(approvers) || approvers.length === 0) {
        throw new Error('approvalWorkflow: approvers array required on propose');
      }
      state.required_approvers = approvers.slice();
      state.approvals = [];
      state.status = 'pending';
      state.proposed_at = this._nowFn();
      this._approvals.set(templateId, state);
      return {
        templateId,
        status: state.status,
        required_approvers: state.required_approvers,
        approvals: state.approvals,
        legal_sensitive: tpl.legal_sensitive,
      };
    }

    // "review" — a specific reviewer registers their decision.
    if (action === 'review') {
      if (!reviewer) throw new Error('approvalWorkflow: reviewer required on review');
      if (!state.required_approvers.includes(reviewer)) {
        throw new Error(`approvalWorkflow: ${reviewer} is not a required approver`);
      }
      if (state.approvals.find((a) => a.reviewer === reviewer)) {
        throw new Error(`approvalWorkflow: ${reviewer} has already reviewed`);
      }
      state.approvals.push({
        reviewer,
        decision: decision || 'approve',
        note: note || '',
        timestamp: this._nowFn(),
      });
      const all_approved = state.required_approvers.every((r) =>
        state.approvals.find((a) => a.reviewer === r && a.decision === 'approve'),
      );
      const any_rejected = state.approvals.some((a) => a.decision === 'reject');
      if (any_rejected) state.status = 'rejected';
      else if (all_approved) state.status = 'approved';
      else state.status = 'pending';
      this._approvals.set(templateId, state);
      return {
        templateId,
        status: state.status,
        required_approvers: state.required_approvers,
        approvals: state.approvals,
      };
    }

    // Default: return current state.
    return {
      templateId,
      status: state.status,
      required_approvers: state.required_approvers,
      approvals: state.approvals,
      legal_sensitive: tpl.legal_sensitive,
    };
  }

  // ----------------------------------------------------------------
  // languageFallback: graceful selection — if the requested language
  // is missing, walk the fallback chain (he ↔ en ↔ any other lang)
  // and return both the chosen lang and a flag indicating fallback.
  // ----------------------------------------------------------------
  languageFallback(templateId, lang) {
    const tpl = this._templates.get(templateId);
    if (!tpl) throw new Error(`Template not found: ${templateId}`);
    const available = Object.keys(tpl.content);
    if (available.includes(lang)) {
      return {
        requested: lang,
        resolved: lang,
        fallback: false,
        available,
      };
    }
    // Walk chain: explicit → he → en → anything.
    let resolved = null;
    if (tpl.content.he && lang !== 'he') resolved = 'he';
    else if (tpl.content.en && lang !== 'en') resolved = 'en';
    else resolved = available[0];
    return {
      requested: lang,
      resolved,
      fallback: true,
      available,
    };
  }

  // ----------------------------------------------------------------
  // Helpers the tests reach for — listing, lookup, compile cache.
  // ----------------------------------------------------------------
  listTemplates() {
    return Array.from(this._templates.values()).map((t) => ({
      id: t.id,
      name_he: t.name_he,
      name_en: t.name_en,
      category: t.category,
      language: t.language,
      version: t.version,
    }));
  }

  getTemplate(templateId) {
    return this._templates.get(templateId) || null;
  }

  registerHelper(name, fn) {
    if (!name || typeof fn !== 'function') {
      throw new Error('registerHelper: name and fn required');
    }
    this._helpers[name] = fn;
  }

  listHelpers() {
    return Object.keys(this._helpers).sort();
  }
}

// ═══════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  DocumentTemplates,
  // Pure helpers exported for direct use / testing.
  tokenize,
  parse,
  compile,
  evalExpr,
  evalNodes,
  htmlEscape,
  resolvePath,
  formatCurrency,
  formatDate,
  formatNumber,
  DEFAULT_HELPERS,
  SEED_TEMPLATES,
};
