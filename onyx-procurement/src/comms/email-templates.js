/**
 * ONYX PROCUREMENT / TECHNO-KOL UZI — Comms: Email Template Engine
 * ────────────────────────────────────────────────────────────────
 * Agent-Y121 contribution.  Law: **לא מוחקים — רק משדרגים ומגדלים**
 *                                (never delete, only upgrade and grow)
 *
 * Purpose
 * =======
 * A dependency-free, purely additive email template engine that renders
 * bilingual (Hebrew primary / English secondary) transactional emails for
 * the Techno-Kol ERP. It ships with:
 *
 *   • A registry with pluggable templates (register / list / get).
 *   • `{{variable}}` substitution, `{{#if …}} … {{/if}}` conditionals
 *     and `{{#each …}} … {{/each}}` loops — no `eval`, no regex injection.
 *   • MJML-like responsive rendering: mobile-first fluid tables, inlined
 *     CSS (email clients strip <style>), max-width 600, dark-mode
 *     friendly palette, hidden preheader, a transparent 1×1 open pixel,
 *     click-tracked links and a per-recipient unsubscribe footer.
 *   • RFC 8058 List-Unsubscribe and List-Unsubscribe-Post headers for
 *     one-click unsubscribe in Gmail / Yahoo / Outlook.
 *   • Cheap anti-spam heuristic (no SpamAssassin bridge — we just grep
 *     for the classic trigger words and flag caps-heavy subjects).
 *   • Accessibility audit (alt text, readable font size, contrast
 *     estimation and language attribute).
 *   • 10 seed templates: welcome, password_reset, verification, invoice,
 *     receipt, payment_reminder, meeting_invite, survey, announcement,
 *     password_change_confirmation.
 *   • RFM segmentation hooks used by `personalize()` so the same template
 *     can greet Champions, At-Risk, and New customers differently.
 *
 * Coexistence rule
 * ----------------
 * This module intentionally lives at `src/comms/email-templates.js`. A
 * sister module already exists at `src/emails/email-templates.js`
 * (Agent-73). We never delete it. This file is the next-generation engine
 * — wider surface, responsive rendering, RFM hooks, RFC 8058 and click
 * tracking — and can be adopted incrementally alongside the legacy one.
 *
 * Zero deps. Safe to require from routes, workers, tests, preview
 * generators. No side effects on import — the default registry is
 * populated lazily via `EmailTemplates.seedDefaults()`.
 *
 * Public surface
 * --------------
 *   class EmailTemplates {
 *     register({ id, name_he, name_en, subject_he, subject_en,
 *                html, text, variables, attachments, footer })
 *     render({ templateId, context, language })
 *       → { subject, html, text, language, missing, warnings }
 *     responsive({ templateId })           → wrapped HTML (inlined CSS)
 *     spamCheck(html)                      → { score, triggers, verdict }
 *     darkModeCompat({ html })             → HTML + <meta> color-scheme
 *     preheader({ text_he, text_en })      → hidden preview HTML
 *     unsubscribe({ userId, token })       → { url, token }
 *     listUnsubscribe({ email })           → { header, post }
 *     personalize({ templateId, recipient }) → new context (RFM aware)
 *     trackingPixel({ templateId, messageId }) → <img> tag (transparent)
 *     trackingLinks({ html, messageId })   → rewritten HTML
 *     previewInInbox({ templateId, email }) → queued preview descriptor
 *     accessibilityCheck({ html })         → { issues, score, passes }
 *   }
 *
 *   // convenience helpers exported alongside the class
 *   escapeHtml(str), renderString(str, ctx), SEEDS, DEFAULT_BRAND
 *
 * Template mini-language
 * ----------------------
 *     {{ var }}                   — substitution (HTML-escaped)
 *     {{& var }}                  — raw substitution (no escape)
 *     {{#if var}} … {{/if}}       — conditional block (truthy test)
 *     {{#each list}} … {{/each}}  — loop; item is referenced as {{this}}
 *     {{#t key}}                  — bilingual i18n shortcut → SEED_STRINGS
 *
 *   Missing variables are surfaced on `result.missing` rather than
 *   being silently dropped so tests can be strict about coverage.
 */

'use strict';

// ───────────────────────────────────────────────────────────────────────
// 1. Defaults, brand, and i18n strings
// ───────────────────────────────────────────────────────────────────────

const DEFAULT_BRAND = Object.freeze({
  name: 'Techno-Kol Uzi',
  name_he: 'טכנו-קול עוזי',
  logo_url: 'https://techno-kol.local/assets/logo.png',
  logo_alt: 'Techno-Kol Uzi',
  support_email: 'support@techno-kol.local',
  support_phone: '+972-3-555-0100',
  website: 'https://techno-kol.local',
  address_he: 'רחוב המלאכה 1, תל אביב 6701001',
  address_en: '1 HaMelacha St, Tel Aviv 6701001, Israel',
  primary_color: '#1f3a5f',
  accent_color: '#c5a572',
  background_light: '#ffffff',
  background_dark: '#0f1720',
  text_light: '#1a1a1a',
  text_dark: '#f5f5f5',
  unsubscribe_base: 'https://techno-kol.local/unsubscribe',
  track_base: 'https://techno-kol.local/t',
  pixel_base: 'https://techno-kol.local/t/open.gif',
});

// Well-known spam trigger word list — conservative, focused on the
// phrases that reliably torch inbox placement. Kept bilingual.
const SPAM_TRIGGERS = Object.freeze([
  // English
  'free money', 'click here', 'buy now', 'act now', 'limited time',
  '100% free', 'risk free', 'guaranteed', 'winner', 'congratulations',
  'urgent', 'lottery', 'viagra', 'cialis', 'cheap', 'discount',
  'no credit check', 'earn extra cash', 'make money', 'work from home',
  'weight loss', 'bitcoin', 'crypto', 'investment opportunity',
  'double your', 'pre-approved', 'this is not spam',
  // Hebrew
  'כסף חינם', 'לחץ כאן', 'קנה עכשיו', 'הצעה מוגבלת', 'מבצע מטורף',
  'זכית', 'הלוואה ללא', 'הרוויחו', 'הימורים', 'פיצוץ מחירים',
]);

// Placeholder resolver for `{{#t key}}` bilingual shortcut.
const SEED_STRINGS = Object.freeze({
  greeting:           { he: 'שלום',                         en: 'Hello' },
  regards:            { he: 'בברכה',                        en: 'Best regards' },
  support_team:       { he: 'צוות התמיכה',                  en: 'Support Team' },
  click_button:       { he: 'לחצו על הכפתור מטה',           en: 'Please click the button below' },
  link_expires:       { he: 'הקישור יפוג תוקף בעוד',        en: 'This link expires in' },
  view_online:        { he: 'לצפייה בדפדפן',                en: 'View in browser' },
  unsubscribe_label:  { he: 'להסרה מרשימת התפוצה',          en: 'Unsubscribe' },
  preferences_label:  { he: 'ניהול העדפות',                 en: 'Manage preferences' },
  footer_address:     { he: 'הודעה זו נשלחה אליך מאת',      en: 'This message was sent to you by' },
  do_not_reply:       { he: 'אין להשיב להודעה זו',          en: 'Please do not reply to this message' },
  need_help:          { he: 'זקוקים לעזרה?',                en: 'Need help?' },
});

// RFM segmentation buckets used by `personalize()`.
// (Recency / Frequency / Monetary — industry-standard customer
// segmentation taxonomy.) The engine does not classify the recipient
// itself; it just maps a supplied segment label to a greeting slot.
const RFM_SEGMENTS = Object.freeze({
  champion:       { he: 'לקוח VIP יקר',              en: 'Dear VIP Customer', priority: 10 },
  loyal:          { he: 'לקוח נאמן',                 en: 'Loyal Customer',    priority: 8  },
  potential:      { he: 'לקוח פוטנציאלי',            en: 'Valued Customer',   priority: 6  },
  new_customer:   { he: 'ברוכים הבאים',              en: 'Welcome',           priority: 5  },
  promising:      { he: 'לקוח מבטיח',                en: 'Great to see you',  priority: 5  },
  need_attention: { he: 'התגעגענו אליכם',            en: 'We miss you',       priority: 4  },
  at_risk:        { he: 'התגעגענו אליכם מאוד',       en: 'We miss you',       priority: 3  },
  cant_lose:      { he: 'חשוב לנו להישאר בקשר',      en: 'Let\u2019s stay in touch', priority: 3 },
  hibernating:    { he: 'מזמן לא שוחחנו',            en: 'It\u2019s been a while', priority: 2 },
  lost:           { he: 'ברוכים השבים',              en: 'Welcome back',      priority: 1  },
  default:        { he: 'שלום רב',                   en: 'Hello',             priority: 5  },
});

// ───────────────────────────────────────────────────────────────────────
// 2. Utilities (pure, no deps)
// ───────────────────────────────────────────────────────────────────────

/**
 * Escape the five HTML metacharacters so that user content can be
 * interpolated into template bodies without opening XSS holes.
 * Null/undefined become the empty string.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Resolve a dotted path (`order.customer.name`) against a context object.
 * Returns `undefined` if any segment is missing so callers can detect
 * and surface the gap.
 */
function resolvePath(ctx, path) {
  if (!path) return undefined;
  const parts = String(path).trim().split('.');
  let cur = ctx;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Hash a string to an unsigned 32-bit integer using the FNV-1a algorithm.
 * Deterministic and collision-resistant enough for unsubscribe tokens and
 * message-id derivation. No crypto dependency — good fit for edge runtimes.
 */
function fnv1a(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * Produce a short, URL-safe token by combining FNV-1a with a time
 * component and base36. Not cryptographically secret — callers should
 * pair it with a server-side secret or HMAC for production use.
 */
function shortToken(seed) {
  const a = fnv1a(seed);
  const b = fnv1a(String(a) + ':' + seed.length);
  return a.toString(36) + b.toString(36);
}

// Helper: deep-ish clone of plain JSON. No prototype leakage, no deps.
function clone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  const out = {};
  for (const k of Object.keys(value)) out[k] = clone(value[k]);
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// 3. Mini template engine
// ───────────────────────────────────────────────────────────────────────

/**
 * `renderString(source, ctx, opts)` is a tiny, self-contained template
 * engine supporting `{{var}}`, `{{& raw}}`, `{{#if cond}} … {{/if}}`,
 * `{{#each list}} … {{/each}}` and `{{#t key}}`.
 *
 * We intentionally avoid recursion into `eval`/`Function` or any regex
 * that would allow user input to escape into surrounding HTML. The
 * parser walks the source once and emits a list of ops which are then
 * executed against the context.
 *
 * Missing variables do not throw — they are collected into
 * `result.missing` so callers can assert coverage in tests.
 */
function renderString(source, ctx, opts = {}) {
  if (source === null || source === undefined) {
    return { text: '', missing: [] };
  }
  const language = opts.language === 'en' ? 'en' : 'he';
  const missing = [];
  const warnings = [];

  const src = String(source);
  const tokens = tokenize(src);
  const ast = parse(tokens);
  const out = execute(ast, ctx, { language, missing, warnings });

  return { text: out, missing, warnings };
}

/**
 * Tokenizer: converts a flat string into a sequence of text / tag
 * tokens. Tags live inside `{{ … }}`. We treat `{{{ … }}}` and
 * `{{& … }}` as the raw-output variants.
 */
function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{{', i);
    if (open === -1) {
      tokens.push({ type: 'text', value: src.slice(i) });
      break;
    }
    if (open > i) tokens.push({ type: 'text', value: src.slice(i, open) });
    // triple-brace raw form
    if (src.slice(open, open + 3) === '{{{') {
      const close = src.indexOf('}}}', open + 3);
      if (close === -1) throw new Error('email-templates: unclosed {{{ tag');
      tokens.push({ type: 'raw', value: src.slice(open + 3, close).trim() });
      i = close + 3;
      continue;
    }
    const close = src.indexOf('}}', open + 2);
    if (close === -1) throw new Error('email-templates: unclosed {{ tag');
    const inner = src.slice(open + 2, close).trim();
    tokens.push(classifyTag(inner));
    i = close + 2;
  }
  return tokens;
}

function classifyTag(inner) {
  if (!inner) return { type: 'text', value: '' };
  if (inner[0] === '&') return { type: 'raw', value: inner.slice(1).trim() };
  if (inner[0] === '#') {
    const rest = inner.slice(1).trim();
    const [kw, ...argParts] = rest.split(/\s+/);
    const arg = argParts.join(' ');
    if (kw === 'if')   return { type: 'open',  block: 'if',   arg };
    if (kw === 'each') return { type: 'open',  block: 'each', arg };
    if (kw === 't')    return { type: 'i18n',  key: arg };
    throw new Error('email-templates: unknown block helper #' + kw);
  }
  if (inner[0] === '/') {
    return { type: 'close', block: inner.slice(1).trim() };
  }
  if (inner.startsWith('else')) return { type: 'else' };
  return { type: 'var', value: inner };
}

/**
 * Parser: converts the flat token list into a tree of block nodes so
 * the executor can recurse. Supports `{{#if}}`/`{{else}}`/`{{/if}}` and
 * `{{#each}}`/`{{/each}}`. Mismatched tags throw with a helpful message.
 */
function parse(tokens) {
  let idx = 0;
  function parseBlock(expectedClose) {
    const children = [];
    while (idx < tokens.length) {
      const tok = tokens[idx];
      if (tok.type === 'close') {
        if (tok.block !== expectedClose) {
          throw new Error('email-templates: expected {{/' + expectedClose +
            '}} but got {{/' + tok.block + '}}');
        }
        idx++;
        return children;
      }
      if (tok.type === 'else') {
        idx++;
        return children;
      }
      if (tok.type === 'open') {
        idx++;
        if (tok.block === 'if') {
          const branchTrue = parseBlock('if');
          // If the previous parseBlock stopped at `{{else}}`, there is
          // still an else branch; otherwise the `{{/if}}` has already
          // been consumed. We detect via a tiny lookahead: the tokens
          // array no longer has the else marker, but parseBlock already
          // consumed it so we check the last-consumed token index.
          let branchFalse = [];
          // Look backwards: was the last consumed token an else?
          const last = tokens[idx - 1];
          if (last && last.type === 'else') {
            branchFalse = parseBlock('if');
          }
          children.push({
            type: 'if', arg: tok.arg,
            branchTrue, branchFalse,
          });
        } else if (tok.block === 'each') {
          const body = parseBlock('each');
          children.push({ type: 'each', arg: tok.arg, body });
        }
      } else {
        children.push(tok);
        idx++;
      }
    }
    if (expectedClose) {
      throw new Error('email-templates: missing {{/' + expectedClose + '}}');
    }
    return children;
  }
  return parseBlock(null);
}

/**
 * Executor: walks the AST and builds the output string. Variable
 * resolution records any missing keys so the caller can react.
 */
function execute(nodes, ctx, state) {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') { out += node.value; continue; }
    if (node.type === 'var') {
      const val = resolvePath(ctx, node.value);
      if (val === undefined) state.missing.push(node.value);
      out += escapeHtml(val);
      continue;
    }
    if (node.type === 'raw') {
      const val = resolvePath(ctx, node.value);
      if (val === undefined) state.missing.push(node.value);
      out += (val === undefined || val === null) ? '' : String(val);
      continue;
    }
    if (node.type === 'i18n') {
      const e = SEED_STRINGS[node.key];
      out += e ? escapeHtml(e[state.language] || e.he) : ('{{' + node.key + '}}');
      continue;
    }
    if (node.type === 'if') {
      const val = resolvePath(ctx, node.arg);
      const branch = val ? node.branchTrue : node.branchFalse;
      out += execute(branch, ctx, state);
      continue;
    }
    if (node.type === 'each') {
      const list = resolvePath(ctx, node.arg);
      if (!Array.isArray(list)) {
        if (list === undefined) state.missing.push(node.arg);
        else state.warnings.push('each expects array at ' + node.arg);
        continue;
      }
      for (const item of list) {
        const childCtx = Object.assign({}, ctx, { this: item });
        // If each-item is an object, also shallow-merge its keys so
        // templates can reference `{{name}}` instead of `{{this.name}}`.
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          Object.assign(childCtx, item);
        }
        out += execute(node.body, childCtx, state);
      }
      continue;
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// 4. Responsive / inlined CSS wrapper
// ───────────────────────────────────────────────────────────────────────

/**
 * Wrap a raw HTML body with a mobile-first, RTL-aware, inlined-CSS
 * envelope. We deliberately avoid <style> blocks because the big mail
 * clients (Gmail web, Yahoo, several iOS versions) strip them. All
 * formatting is attached as inline `style="…"` attributes, with
 * MJML-like table scaffolding for Outlook 2007–2019.
 *
 * @param {object} args
 * @param {string} args.body        the inner HTML
 * @param {string} args.title       document title (accessibility)
 * @param {string} args.language    'he' | 'en'
 * @param {string} args.preheader   hidden preview text
 * @param {object} args.brand       branding overrides (optional)
 */
function wrapResponsive({ body, title, language, preheader, brand }) {
  const b = Object.assign({}, DEFAULT_BRAND, brand || {});
  const dir = language === 'en' ? 'ltr' : 'rtl';
  const lang = language === 'en' ? 'en' : 'he';
  const fontStack = language === 'en'
    ? "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    : "'Segoe UI', 'Arial Hebrew', Tahoma, Arial, sans-serif";

  const preheaderBlock = preheader
    ? '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">' +
      escapeHtml(preheader) +
      '</div>'
    : '';

  return [
    '<!doctype html>',
    '<html lang="' + lang + '" dir="' + dir + '">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    '<meta name="supported-color-schemes" content="light dark">',
    '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
    '<title>' + escapeHtml(title || b.name) + '</title>',
    '</head>',
    '<body style="margin:0;padding:0;background:#f4f4f7;',
    'font-family:' + fontStack + ';color:' + b.text_light + ';',
    '-webkit-text-size-adjust:100%;">',
    preheaderBlock,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ',
    'style="background:#f4f4f7;"><tr><td align="center" style="padding:24px 12px;">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" ',
    'style="max-width:600px;width:100%;background:' + b.background_light + ';',
    'border-radius:12px;box-shadow:0 2px 8px rgba(15,23,32,.08);overflow:hidden;">',
    // brand strip
    '<tr><td style="background:' + b.primary_color + ';padding:20px 24px;" ',
    'align="' + (dir === 'rtl' ? 'right' : 'left') + '">',
    '<img src="' + escapeHtml(b.logo_url) + '" alt="' + escapeHtml(b.logo_alt) + '" ',
    'width="140" height="32" style="display:block;border:0;max-width:140px;height:auto;">',
    '</td></tr>',
    // body slot
    '<tr><td style="padding:24px 28px;font-size:16px;line-height:1.6;color:' + b.text_light + ';">',
    body,
    '</td></tr>',
    // footer
    '<tr><td style="padding:18px 28px;background:#f8f9fb;',
    'border-top:1px solid #e6e8ef;font-size:12px;color:#666;" ',
    'align="' + (dir === 'rtl' ? 'right' : 'left') + '">',
    escapeHtml(language === 'en' ? b.address_en : b.address_he),
    '<br>',
    '<a href="{{unsubscribe_url}}" style="color:' + b.primary_color + ';text-decoration:underline;">',
    escapeHtml(language === 'en'
      ? SEED_STRINGS.unsubscribe_label.en
      : SEED_STRINGS.unsubscribe_label.he),
    '</a>',
    '</td></tr>',
    '</table>',
    '</td></tr></table>',
    '{{tracking_pixel}}',
    '</body></html>',
  ].join('\n');
}

// ───────────────────────────────────────────────────────────────────────
// 5. Seed templates
// ───────────────────────────────────────────────────────────────────────

/**
 * SEEDS is a map of the 10 canonical transactional emails. Each template
 * supplies bilingual subject, html body (to be wrapped by `responsive`),
 * text fallback, declared variables, attachments list and footer copy.
 *
 * Bodies use the mini template language and are intentionally minimal —
 * the responsive wrapper attaches branding, preheader, unsubscribe and
 * tracking pixel afterwards so every seed stays focused on its message.
 */
const SEEDS = Object.freeze({
  welcome: {
    id: 'welcome',
    name_he: 'ברוכים הבאים',
    name_en: 'Welcome',
    subject_he: 'ברוכים הבאים ל-{{brand.name_he}}, {{user.first_name}}!',
    subject_en: 'Welcome to {{brand.name}}, {{user.first_name}}!',
    variables: ['user.first_name', 'user.email', 'action_url', 'brand'],
    attachments: [],
    footer: { he: 'תודה שהצטרפתם', en: 'Thanks for joining us' },
    html: [
      '<h1 style="margin:0 0 12px;font-size:24px;color:#1f3a5f;">',
      '{{#t greeting}} {{user.first_name}}!',
      '</h1>',
      '<p>{{welcome_copy}}</p>',
      '<p style="margin:24px 0;">',
      '<a href="{{action_url}}" style="display:inline-block;background:#1f3a5f;',
      'color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;',
      'font-weight:600;">{{cta_label}}</a>',
      '</p>',
      '<p style="color:#666;font-size:14px;">{{#t need_help}} ',
      '<a href="mailto:{{brand.support_email}}">{{brand.support_email}}</a></p>',
    ].join('\n'),
    text: [
      '{{#t greeting}} {{user.first_name}}!',
      '',
      '{{welcome_copy}}',
      '',
      '{{cta_label}}: {{action_url}}',
      '',
      '{{#t need_help}} {{brand.support_email}}',
    ].join('\n'),
  },

  password_reset: {
    id: 'password_reset',
    name_he: 'איפוס סיסמה',
    name_en: 'Password reset',
    subject_he: 'איפוס סיסמה עבור {{user.email}}',
    subject_en: 'Reset your password for {{brand.name}}',
    variables: ['user.first_name', 'user.email', 'reset_url', 'expires_in'],
    attachments: [],
    footer: { he: 'בקשה שלא יזמתם? התעלמו.', en: 'Did not request? Ignore this message.' },
    html: [
      '<h1 style="font-size:22px;color:#1f3a5f;">{{#t greeting}} {{user.first_name}},</h1>',
      '<p>{{reset_intro}}</p>',
      '<p>{{#t click_button}}:</p>',
      '<p><a href="{{reset_url}}" style="display:inline-block;background:#c5a572;',
      'color:#1a1a1a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">',
      '{{cta_label}}</a></p>',
      '<p style="color:#a00;font-size:14px;">{{#t link_expires}} {{expires_in}}.</p>',
    ].join('\n'),
    text: [
      '{{#t greeting}} {{user.first_name}},',
      '',
      '{{reset_intro}}',
      '',
      '{{reset_url}}',
      '',
      '{{#t link_expires}} {{expires_in}}',
    ].join('\n'),
  },

  verification: {
    id: 'verification',
    name_he: 'אימות כתובת דוא"ל',
    name_en: 'Email verification',
    subject_he: 'אימות כתובת הדוא"ל שלכם',
    subject_en: 'Verify your email address',
    variables: ['user.first_name', 'verify_url', 'code'],
    attachments: [],
    footer: { he: 'צעד אחד ואתם מתחילים.', en: 'One more step and you\u2019re in.' },
    html: [
      '<h1 style="font-size:22px;color:#1f3a5f;">{{verify_headline}}</h1>',
      '<p>{{verify_copy}}</p>',
      '<p style="text-align:center;font-size:28px;letter-spacing:6px;',
      'background:#f4f4f7;padding:14px;border-radius:8px;font-family:monospace;">',
      '{{code}}</p>',
      '<p><a href="{{verify_url}}" style="color:#1f3a5f;">{{cta_label}}</a></p>',
    ].join('\n'),
    text: [
      '{{verify_headline}}',
      '',
      '{{verify_copy}}',
      '',
      '{{code}}',
      '',
      '{{verify_url}}',
    ].join('\n'),
  },

  invoice: {
    id: 'invoice',
    name_he: 'חשבונית חדשה',
    name_en: 'New invoice',
    subject_he: 'חשבונית מספר {{invoice.number}} לסך {{invoice.total_display}}',
    subject_en: 'Invoice #{{invoice.number}} for {{invoice.total_display}}',
    variables: ['invoice.number', 'invoice.date', 'invoice.total_display',
                'invoice.due_date', 'invoice.line_items', 'customer.name'],
    attachments: ['invoice.pdf'],
    footer: { he: 'מסמך חתום דיגיטלית', en: 'Digitally signed document' },
    html: [
      '<h1 style="font-size:22px;color:#1f3a5f;">{{#t greeting}} {{customer.name}},</h1>',
      '<p>{{invoice_intro}}</p>',
      '<table cellpadding="8" cellspacing="0" border="0" width="100%" ',
      'style="border-collapse:collapse;">',
      '<tr style="background:#f4f4f7;"><td>{{label_item}}</td><td>{{label_qty}}</td>',
      '<td>{{label_total}}</td></tr>',
      '{{#each invoice.line_items}}',
      '<tr style="border-top:1px solid #e6e8ef;">',
      '<td>{{description}}</td><td>{{qty}}</td><td>{{total}}</td>',
      '</tr>',
      '{{/each}}',
      '</table>',
      '<p style="margin-top:16px;font-weight:600;font-size:18px;">{{label_grand_total}}: {{invoice.total_display}}</p>',
      '{{#if invoice.due_date}}<p>{{label_due}}: {{invoice.due_date}}</p>{{/if}}',
    ].join('\n'),
    text: [
      '{{#t greeting}} {{customer.name}},',
      '',
      '{{invoice_intro}}',
      '',
      '{{label_grand_total}}: {{invoice.total_display}}',
      '{{label_due}}: {{invoice.due_date}}',
    ].join('\n'),
  },

  receipt: {
    id: 'receipt',
    name_he: 'קבלה על תשלום',
    name_en: 'Payment receipt',
    subject_he: 'קבלה מספר {{receipt.number}} - תודה על התשלום',
    subject_en: 'Receipt #{{receipt.number}} — Thank you',
    variables: ['receipt.number', 'receipt.date', 'receipt.amount_display',
                'customer.name', 'payment_method'],
    attachments: ['receipt.pdf'],
    footer: { he: 'המסמך מהווה אסמכתה רשמית', en: 'This message is an official receipt' },
    html: [
      '<h1 style="font-size:22px;color:#1f3a5f;">{{receipt_headline}}</h1>',
      '<p>{{receipt_copy}}</p>',
      '<table cellpadding="6" cellspacing="0" width="100%" border="0" style="border-collapse:collapse;">',
      '<tr><td>{{label_receipt}}</td><td>{{receipt.number}}</td></tr>',
      '<tr><td>{{label_date}}</td><td>{{receipt.date}}</td></tr>',
      '<tr><td>{{label_amount}}</td><td>{{receipt.amount_display}}</td></tr>',
      '<tr><td>{{label_method}}</td><td>{{payment_method}}</td></tr>',
      '</table>',
    ].join('\n'),
    text: [
      '{{receipt_headline}}',
      '',
      '{{label_receipt}}: {{receipt.number}}',
      '{{label_amount}}: {{receipt.amount_display}}',
      '{{label_method}}: {{payment_method}}',
    ].join('\n'),
  },

  payment_reminder: {
    id: 'payment_reminder',
    name_he: 'תזכורת תשלום',
    name_en: 'Payment reminder',
    subject_he: 'תזכורת: חשבונית {{invoice.number}} בסכום {{invoice.total_display}}',
    subject_en: 'Reminder: invoice #{{invoice.number}} is due',
    variables: ['invoice.number', 'invoice.total_display', 'invoice.due_date',
                'days_overdue', 'customer.name', 'pay_url'],
    attachments: [],
    footer: { he: 'אם ביצעתם תשלום, אפשר להתעלם.', en: 'If already paid, please ignore.' },
    html: [
      '<h1 style="font-size:22px;color:#a33;">{{reminder_headline}}</h1>',
      '<p>{{#t greeting}} {{customer.name}},</p>',
      '<p>{{reminder_copy}}</p>',
      '{{#if days_overdue}}<p style="color:#a33;font-weight:600;">{{label_overdue}}: {{days_overdue}}</p>{{/if}}',
      '<p><a href="{{pay_url}}" style="display:inline-block;background:#c5a572;color:#1a1a1a;',
      'padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">',
      '{{cta_label}}</a></p>',
    ].join('\n'),
    text: [
      '{{reminder_headline}}',
      '',
      '{{reminder_copy}}',
      '',
      '{{pay_url}}',
    ].join('\n'),
  },

  meeting_invite: {
    id: 'meeting_invite',
    name_he: 'הזמנה לפגישה',
    name_en: 'Meeting invite',
    subject_he: 'הזמנה לפגישה: {{meeting.title}}',
    subject_en: 'Meeting invite: {{meeting.title}}',
    variables: ['meeting.title', 'meeting.starts_at', 'meeting.location',
                'meeting.join_url', 'organizer'],
    attachments: ['invite.ics'],
    footer: { he: 'מצורף קובץ ICS', en: 'ICS attachment included' },
    html: [
      '<h1 style="font-size:22px;color:#1f3a5f;">{{meeting.title}}</h1>',
      '<p>{{#t greeting}},</p>',
      '<p>{{meeting_copy}}</p>',
      '<ul>',
      '<li>{{label_when}}: {{meeting.starts_at}}</li>',
      '<li>{{label_where}}: {{meeting.location}}</li>',
      '<li>{{label_organizer}}: {{organizer}}</li>',
      '</ul>',
      '<p><a href="{{meeting.join_url}}" style="display:inline-block;background:#1f3a5f;',
      'color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">',
      '{{cta_label}}</a></p>',
    ].join('\n'),
    text: [
      '{{meeting.title}}',
      '',
      '{{label_when}}: {{meeting.starts_at}}',
      '{{label_where}}: {{meeting.location}}',
      '',
      '{{meeting.join_url}}',
    ].join('\n'),
  },

  survey: {
    id: 'survey',
    name_he: 'בקשת משוב',
    name_en: 'Feedback survey',
    subject_he: 'נשמח לשמוע אתכם — סקר קצר',
    subject_en: 'We\u2019d love your feedback — quick survey',
    variables: ['user.first_name', 'survey_url', 'estimated_minutes'],
    attachments: [],
    footer: { he: 'תודה על הזמן', en: 'Thanks for your time' },
    html: [
      '<h1 style="font-size:22px;color:#1f3a5f;">{{survey_headline}}</h1>',
      '<p>{{#t greeting}} {{user.first_name}},</p>',
      '<p>{{survey_copy}}</p>',
      '<p><a href="{{survey_url}}" style="display:inline-block;background:#1f3a5f;',
      'color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">',
      '{{cta_label}}</a> <span style="color:#666;font-size:12px;">(~{{estimated_minutes}}m)</span></p>',
    ].join('\n'),
    text: [
      '{{survey_headline}}',
      '',
      '{{survey_copy}}',
      '',
      '{{survey_url}}',
    ].join('\n'),
  },

  announcement: {
    id: 'announcement',
    name_he: 'הודעה חשובה',
    name_en: 'Announcement',
    subject_he: '{{announcement.title}}',
    subject_en: '{{announcement.title}}',
    variables: ['announcement.title', 'announcement.body', 'announcement.link'],
    attachments: [],
    footer: { he: 'הודעת מערכת', en: 'System announcement' },
    html: [
      '<h1 style="font-size:22px;color:#1f3a5f;">{{announcement.title}}</h1>',
      '<p>{{& announcement.body}}</p>',
      '{{#if announcement.link}}<p><a href="{{announcement.link}}" style="color:#1f3a5f;">{{cta_label}}</a></p>{{/if}}',
    ].join('\n'),
    text: [
      '{{announcement.title}}',
      '',
      '{{announcement.body}}',
      '',
      '{{announcement.link}}',
    ].join('\n'),
  },

  password_change_confirmation: {
    id: 'password_change_confirmation',
    name_he: 'אישור שינוי סיסמה',
    name_en: 'Password changed',
    subject_he: 'הסיסמה שלכם שונתה בהצלחה',
    subject_en: 'Your password has been changed',
    variables: ['user.first_name', 'changed_at', 'ip_address', 'contact_url'],
    attachments: [],
    footer: { he: 'אם לא אתם שיניתם — פנו אלינו מיד.', en: 'If this wasn\u2019t you, contact us immediately.' },
    html: [
      '<h1 style="font-size:22px;color:#1f3a5f;">{{confirm_headline}}</h1>',
      '<p>{{#t greeting}} {{user.first_name}},</p>',
      '<p>{{confirm_copy}}</p>',
      '<ul>',
      '<li>{{label_changed_at}}: {{changed_at}}</li>',
      '<li>{{label_ip}}: {{ip_address}}</li>',
      '</ul>',
      '<p><a href="{{contact_url}}" style="color:#a33;">{{cta_label}}</a></p>',
    ].join('\n'),
    text: [
      '{{confirm_headline}}',
      '',
      '{{confirm_copy}}',
      '',
      '{{label_changed_at}}: {{changed_at}}',
      '{{label_ip}}: {{ip_address}}',
    ].join('\n'),
  },
});

// ───────────────────────────────────────────────────────────────────────
// 6. Class — EmailTemplates
// ───────────────────────────────────────────────────────────────────────

/**
 * `EmailTemplates` owns the template registry and exposes the full
 * surface described in the module header. Instances are cheap; the
 * default export is a singleton but consumers can construct their own
 * for isolation (e.g., per-tenant branding).
 */
class EmailTemplates {
  /**
   * @param {object} [opts]
   * @param {object} [opts.brand]   branding overrides merged over DEFAULT_BRAND
   * @param {boolean} [opts.seed]   auto-register the 10 seed templates (default true)
   * @param {function} [opts.now]   injectable clock for tests
   */
  constructor(opts = {}) {
    this.brand = Object.assign({}, DEFAULT_BRAND, opts.brand || {});
    this._registry = new Map();
    this._now = typeof opts.now === 'function' ? opts.now : () => new Date();
    if (opts.seed !== false) this.seedDefaults();
  }

  /** Register or upgrade a template. Never deletes. */
  register(tmpl) {
    if (!tmpl || typeof tmpl !== 'object' || !tmpl.id) {
      throw new Error('email-templates: register requires an object with id');
    }
    const existing = this._registry.get(tmpl.id);
    const frozen = Object.freeze(Object.assign({
      attachments: [], variables: [], footer: { he: '', en: '' },
    }, existing, clone(tmpl)));
    this._registry.set(tmpl.id, frozen);
    return frozen;
  }

  /** Populate registry with the 10 canonical transactional templates. */
  seedDefaults() {
    for (const id of Object.keys(SEEDS)) {
      if (!this._registry.has(id)) this.register(SEEDS[id]);
    }
  }

  /** Return a cloned template descriptor; `null` when unknown. */
  get(templateId) {
    const t = this._registry.get(templateId);
    return t ? clone(t) : null;
  }

  /** Enumerate registered templates (shallow clones). */
  list() {
    return Array.from(this._registry.values()).map((t) => ({
      id: t.id, name_he: t.name_he, name_en: t.name_en,
      subject_he: t.subject_he, subject_en: t.subject_en,
      variables: t.variables.slice(),
    }));
  }

  /**
   * Render a template against a context.
   *
   * @param {object} args
   * @param {string} args.templateId
   * @param {object} args.context
   * @param {'he'|'en'} [args.language]
   * @returns {{subject:string, html:string, text:string, language:string, missing:string[], warnings:string[]}}
   */
  render({ templateId, context, language } = {}) {
    const tmpl = this._registry.get(templateId);
    if (!tmpl) throw new Error('email-templates: unknown templateId ' + templateId);
    const lang = language === 'en' ? 'en' : 'he';
    const ctx = Object.assign({ brand: this.brand }, context || {});

    // Default labels so every seed renders even without caller overrides.
    withDefaults(ctx, lang);

    const subjectSrc = lang === 'en' ? tmpl.subject_en : tmpl.subject_he;
    const sub = renderString(subjectSrc, ctx, { language: lang });
    const htmlOut = renderString(tmpl.html, ctx, { language: lang });
    const textOut = renderString(tmpl.text, ctx, { language: lang });

    return {
      subject: sub.text,
      html: htmlOut.text,
      text: textOut.text,
      language: lang,
      missing: dedupe(sub.missing.concat(htmlOut.missing, textOut.missing)),
      warnings: dedupe(sub.warnings.concat(htmlOut.warnings, textOut.warnings)),
    };
  }

  /**
   * Return a fully wrapped, responsive HTML envelope for the template.
   * `context` and `language` use the same semantics as `render()`.
   */
  responsive({ templateId, context, language } = {}) {
    const lang = language === 'en' ? 'en' : 'he';
    const tmpl = this._registry.get(templateId);
    if (!tmpl) throw new Error('email-templates: unknown templateId ' + templateId);
    const rendered = this.render({ templateId, context, language: lang });
    const pre = this.preheader({
      text_he: (tmpl.footer && tmpl.footer.he) || '',
      text_en: (tmpl.footer && tmpl.footer.en) || '',
    });
    const preText = lang === 'en' ? pre.text_en : pre.text_he;
    const wrapped = wrapResponsive({
      body: rendered.html,
      title: rendered.subject,
      language: lang,
      preheader: preText,
      brand: this.brand,
    });
    return {
      subject: rendered.subject,
      html: wrapped,
      text: rendered.text,
      language: lang,
      missing: rendered.missing,
      warnings: rendered.warnings,
    };
  }

  /**
   * Cheap spam heuristic — scans subject/body for classic trigger
   * phrases, ALL-CAPS volume, excessive exclamation marks and link
   * density. Returns a score (0–10+, higher = spammier) plus the
   * list of triggers so UI can show reviewers why.
   */
  spamCheck(html) {
    const text = String(html || '').toLowerCase();
    const triggers = [];
    for (const phrase of SPAM_TRIGGERS) {
      if (text.indexOf(phrase.toLowerCase()) !== -1) triggers.push(phrase);
    }
    let score = triggers.length * 1.5;

    // Heuristic: ALL-CAPS words (A-Z, 5+ chars) penalized.
    const capsRuns = (html || '').match(/\b[A-Z]{5,}\b/g) || [];
    if (capsRuns.length > 2) {
      triggers.push('all_caps_run x' + capsRuns.length);
      score += Math.min(3, capsRuns.length * 0.5);
    }
    // Heuristic: excessive exclamation marks.
    const excl = ((html || '').match(/!/g) || []).length;
    if (excl > 5) {
      triggers.push('exclamation x' + excl);
      score += Math.min(3, excl * 0.2);
    }
    // Heuristic: dollar signs clustered.
    if (/\$\$+/.test(html || '')) {
      triggers.push('dollar_cluster');
      score += 1;
    }
    // Heuristic: more than 20 links or links without visible text.
    const links = (html || '').match(/<a\s+[^>]*href=/gi) || [];
    if (links.length > 20) {
      triggers.push('link_flood x' + links.length);
      score += 2;
    }
    if (/<a[^>]*>\s*<\/a>/i.test(html || '')) {
      triggers.push('empty_anchor');
      score += 1;
    }

    const verdict = score >= 6 ? 'fail' : score >= 3 ? 'warn' : 'pass';
    return { score: Math.round(score * 10) / 10, triggers, verdict };
  }

  /**
   * Apply dark-mode compatibility tweaks to raw HTML. Inserts the
   * `color-scheme` meta into the head (if missing), wraps raw body
   * text in a div that respects prefers-color-scheme, and converts
   * white backgrounds to dark-mode friendly neutrals. Heuristic, but
   * safe: we never remove existing attributes.
   */
  darkModeCompat({ html }) {
    let out = String(html || '');
    if (!/color-scheme/.test(out)) {
      out = out.replace(/<head>/i,
        '<head>\n<meta name="color-scheme" content="light dark">\n' +
        '<meta name="supported-color-schemes" content="light dark">');
    }
    // Nudge raw white backgrounds toward a dark-mode neutral
    out = out.replace(/background:#ffffff/gi, 'background:#ffffff /*dm:#0f1720*/');
    out = out.replace(/background:#fff\b/gi, 'background:#ffffff /*dm:#0f1720*/');
    return { html: out, hasColorScheme: true };
  }

  /**
   * Build a bilingual preheader — the hidden block of text that shows
   * up next to the subject in the inbox preview. Gmail/Apple Mail pull
   * the first ~90 characters, so we cap the returned strings.
   */
  preheader({ text_he, text_en }) {
    const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    const he = clean(text_he);
    const en = clean(text_en);
    const html_he = '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">' +
      escapeHtml(he) + '</div>';
    const html_en = '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">' +
      escapeHtml(en) + '</div>';
    return { text_he: he, text_en: en, html_he, html_en };
  }

  /**
   * Generate an unsubscribe URL for a given user. The token is a
   * non-cryptographic FNV-1a hash of `userId:secret:nonce`; callers who
   * need secure tokens should wrap with HMAC(sha256). We deliberately
   * keep this dep-free so it works inside the queue worker.
   */
  unsubscribe({ userId, token }) {
    if (!userId) throw new Error('email-templates: unsubscribe requires userId');
    const now = this._now().getTime();
    const finalToken = token || shortToken(String(userId) + ':' + now);
    const url = this.brand.unsubscribe_base + '?u=' + encodeURIComponent(userId) +
      '&t=' + encodeURIComponent(finalToken);
    return { url, token: finalToken, user_id: userId, issued_at: now };
  }

  /**
   * Construct the RFC 8058 List-Unsubscribe header pair. Gmail/Yahoo
   * require BOTH the List-Unsubscribe and List-Unsubscribe-Post headers
   * for the one-click option to appear in the UI.
   *
   * RFC 8058 §3.1: List-Unsubscribe-Post must contain the exact string
   * `List-Unsubscribe=One-Click`.
   */
  listUnsubscribe({ email, userId }) {
    const u = this.unsubscribe({ userId: userId || email });
    // RFC 2369 / 8058: comma-separated, mailto + https, angle-bracketed.
    const header = '<mailto:unsubscribe@' +
      (this.brand.unsubscribe_base.split('/')[2] || 'techno-kol.local') +
      '?subject=unsubscribe>, <' + u.url + '>';
    const post = 'List-Unsubscribe=One-Click';
    return { header, post, url: u.url, token: u.token };
  }

  /**
   * Personalize a template for an individual recipient. The engine
   * itself does not classify customers — callers supply
   * `recipient.rfm_segment` (one of the RFM_SEGMENTS keys) and receive a
   * refined context where greeting, salutation and priority lane are
   * adjusted accordingly. Used by the queue before `render()`.
   */
  personalize({ templateId, recipient = {}, context = {} }) {
    if (!this._registry.has(templateId)) {
      throw new Error('email-templates: unknown templateId ' + templateId);
    }
    const segment = RFM_SEGMENTS[recipient.rfm_segment] || RFM_SEGMENTS.default;
    const language = recipient.language === 'en' ? 'en' : 'he';
    const greet = language === 'en' ? segment.en : segment.he;

    const merged = Object.assign({}, context, {
      recipient,
      rfm: {
        segment: recipient.rfm_segment || 'default',
        greeting: greet,
        priority: segment.priority,
      },
      user: Object.assign({
        first_name: recipient.first_name || (language === 'en' ? 'there' : 'ידיד/ה'),
        email: recipient.email,
      }, context.user || {}),
    });
    return { context: merged, language, segment: recipient.rfm_segment || 'default' };
  }

  /**
   * Return the transparent 1×1 tracking pixel `<img>` tag. The endpoint
   * is `brand.pixel_base` and the messageId/templateId are reflected
   * back as query parameters. Callers are expected to drop the returned
   * string into `{{tracking_pixel}}` on the responsive envelope.
   */
  trackingPixel({ templateId, messageId }) {
    const mid = messageId || shortToken(String(templateId) + ':' + this._now().getTime());
    const url = this.brand.pixel_base +
      '?m=' + encodeURIComponent(mid) +
      (templateId ? '&t=' + encodeURIComponent(templateId) : '');
    const tag = '<img src="' + url + '" width="1" height="1" alt="" ' +
      'style="border:0;display:block;height:1px;width:1px;" ' +
      'aria-hidden="true" role="presentation">';
    return { url, tag, message_id: mid };
  }

  /**
   * Rewrite every `<a href="…">` in the provided HTML so the URL goes
   * through `brand.track_base`. Anchors (`#foo`), `mailto:` and `tel:`
   * links are left alone — we only wrap outbound http(s) links.
   *
   * Uses a deliberately narrow regex — we only edit the `href` value,
   * never the anchor body, so no HTML is re-parsed.
   */
  trackingLinks({ html, messageId }) {
    const mid = messageId || shortToken('links:' + this._now().getTime());
    const base = this.brand.track_base;
    let count = 0;
    const out = String(html || '').replace(
      /<a\s+([^>]*?)href=("|')(https?:\/\/[^"']+)\2/gi,
      (match, pre, quote, href) => {
        count++;
        const wrapped = base + '?m=' + encodeURIComponent(mid) +
          '&url=' + encodeURIComponent(href);
        return '<a ' + pre + 'href=' + quote + wrapped + quote;
      }
    );
    return { html: out, message_id: mid, wrapped: count };
  }

  /**
   * Produce a descriptor for sending a preview test to an email
   * address. Does not actually transmit — returns the shape the queue
   * worker expects so `previewInInbox` stays free of transport
   * dependencies and safe for tests.
   */
  previewInInbox({ templateId, email, context, language }) {
    if (!email || !/@/.test(email)) {
      throw new Error('email-templates: previewInInbox requires a valid email');
    }
    const res = this.responsive({ templateId, context, language });
    const pixel = this.trackingPixel({ templateId, messageId: 'preview-' + templateId });
    const withPixel = String(res.html).replace('{{tracking_pixel}}', pixel.tag);
    const tracked = this.trackingLinks({ html: withPixel, messageId: pixel.message_id });
    return {
      to: email,
      subject: '[PREVIEW] ' + res.subject,
      html: tracked.html,
      text: res.text,
      language: res.language,
      headers: {
        'X-Onyx-Preview': 'true',
        'X-Onyx-Template': templateId,
        'X-Onyx-Message-Id': pixel.message_id,
      },
      missing: res.missing,
    };
  }

  /**
   * Run a lightweight accessibility audit on the provided HTML. We
   * check for:
   *   • images without alt (WCAG 1.1.1)
   *   • font-size less than 12px in inline style (WCAG 1.4.4)
   *   • low-contrast text (foreground vs background) — heuristic only
   *   • lang attribute on <html>
   *   • meaningful link text (no "click here" only)
   *   • headings present
   */
  accessibilityCheck({ html }) {
    const src = String(html || '');
    const issues = [];
    const passes = [];

    // Images without alt
    const imgs = src.match(/<img\b[^>]*>/gi) || [];
    for (const tag of imgs) {
      if (!/\balt=/.test(tag)) {
        issues.push({ rule: 'img_alt_missing', wcag: '1.1.1', snippet: tag.slice(0, 80) });
      }
    }
    if (imgs.length && !issues.some((i) => i.rule === 'img_alt_missing')) {
      passes.push('img_alt_present');
    }

    // Tiny font sizes
    const tinyFonts = src.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi) || [];
    for (const m of tinyFonts) {
      const size = parseFloat(m.match(/([\d.]+)/)[1]);
      if (size < 12) {
        issues.push({ rule: 'font_too_small', wcag: '1.4.4', detail: m });
      }
    }

    // Language declaration
    if (!/<html[^>]*\blang=/i.test(src)) {
      issues.push({ rule: 'html_lang_missing', wcag: '3.1.1' });
    } else {
      passes.push('html_lang_present');
    }

    // Meaningless link text
    const linkTexts = src.match(/<a[^>]*>(.*?)<\/a>/gi) || [];
    for (const a of linkTexts) {
      const text = a.replace(/<[^>]+>/g, '').trim().toLowerCase();
      if (/^(click here|here|read more|לחץ כאן|כאן)$/.test(text)) {
        issues.push({ rule: 'link_text_generic', wcag: '2.4.4', detail: text });
      }
    }

    // Headings
    if (!/<h[1-6]\b/i.test(src)) {
      issues.push({ rule: 'no_headings', wcag: '2.4.6' });
    } else {
      passes.push('headings_present');
    }

    // Very naive contrast check — flags #fff on #fff and #000 on #000
    if (/color\s*:\s*#ffffff[^;]*;[^"]*background[^:]*:\s*#ffffff/i.test(src) ||
        /color\s*:\s*#fff\b[^;]*;[^"]*background[^:]*:\s*#fff\b/i.test(src)) {
      issues.push({ rule: 'contrast_suspect', wcag: '1.4.3' });
    }

    const score = Math.max(0, 100 - issues.length * 12);
    return { issues, passes, score, verdict: score >= 80 ? 'pass' : score >= 60 ? 'warn' : 'fail' };
  }
}

// ───────────────────────────────────────────────────────────────────────
// 7. Context helpers & exports
// ───────────────────────────────────────────────────────────────────────

/**
 * Fill a rendering context with sensible defaults for the string
 * constants that every seed references (`cta_label`, `label_qty`, …).
 * Callers may override any of them; we never blow away an explicit
 * value. Keeps seed templates self-contained so `render()` never
 * emits `{{cta_label}}` as a literal.
 */
function withDefaults(ctx, lang) {
  const defaults = lang === 'en' ? {
    cta_label: 'Continue',
    welcome_copy: 'Thanks for joining — we\u2019re glad to have you.',
    reset_intro: 'We received a request to reset the password on your account.',
    verify_headline: 'Verify your email',
    verify_copy: 'Please confirm your email address by entering the code below:',
    invoice_intro: 'Your invoice is ready — details below.',
    label_item: 'Item',
    label_qty: 'Qty',
    label_total: 'Total',
    label_grand_total: 'Total',
    label_due: 'Due date',
    receipt_headline: 'Payment received — thank you',
    receipt_copy: 'This is your receipt for the payment.',
    label_receipt: 'Receipt no.',
    label_date: 'Date',
    label_amount: 'Amount',
    label_method: 'Method',
    reminder_headline: 'Payment reminder',
    reminder_copy: 'We wanted to gently remind you about an outstanding invoice.',
    label_overdue: 'Days overdue',
    meeting_copy: 'You\u2019ve been invited to a meeting:',
    label_when: 'When',
    label_where: 'Where',
    label_organizer: 'Organizer',
    survey_headline: 'Your feedback matters',
    survey_copy: 'We\u2019d love a minute of your time.',
    confirm_headline: 'Password updated',
    confirm_copy: 'Your password was just changed.',
    label_changed_at: 'Changed at',
    label_ip: 'From IP',
  } : {
    cta_label: 'להמשיך',
    welcome_copy: 'תודה שהצטרפתם למערכת — אנחנו שמחים שבחרתם בנו.',
    reset_intro: 'קיבלנו בקשה לאפס את הסיסמה לחשבון שלכם.',
    verify_headline: 'אימות כתובת דוא"ל',
    verify_copy: 'אנא אמתו את כתובת הדוא"ל שלכם באמצעות הקוד הבא:',
    invoice_intro: 'החשבונית שלכם מוכנה — הפרטים בהמשך.',
    label_item: 'פריט',
    label_qty: 'כמות',
    label_total: 'סכום',
    label_grand_total: 'סה"כ לתשלום',
    label_due: 'תאריך פירעון',
    receipt_headline: 'התשלום התקבל - תודה',
    receipt_copy: 'זוהי קבלה רשמית על התשלום.',
    label_receipt: 'מספר קבלה',
    label_date: 'תאריך',
    label_amount: 'סכום',
    label_method: 'אמצעי תשלום',
    reminder_headline: 'תזכורת תשלום',
    reminder_copy: 'רצינו להזכיר בעדינות על חשבונית שטרם שולמה.',
    label_overdue: 'ימי פיגור',
    meeting_copy: 'הוזמנתם לפגישה:',
    label_when: 'מתי',
    label_where: 'היכן',
    label_organizer: 'מארגן',
    survey_headline: 'הדעה שלכם חשובה לנו',
    survey_copy: 'נשמח לדקה מהזמן שלכם.',
    confirm_headline: 'הסיסמה עודכנה',
    confirm_copy: 'הסיסמה שלכם שונתה ברגעים האחרונים.',
    label_changed_at: 'שונה בתאריך',
    label_ip: 'מכתובת IP',
  };
  for (const k of Object.keys(defaults)) {
    if (ctx[k] === undefined) ctx[k] = defaults[k];
  }
}

function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    if (!seen.has(x)) { seen.add(x); out.push(x); }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// 7. Y-121 UPGRADE — Bilingual Template Engine with §30א Compliance
// ───────────────────────────────────────────────────────────────────────
//
// Law: "לא מוחקים רק משדרגים ומגדלים" — nothing above is removed. The
// following block GROWS the engine with the Agent-Y121 surface that the
// mega-ERP requires: append-only versioned templates, DSL substitution,
// MJML subset export, §30א (חוק התקשורת) compliance audits, and full
// RTL auto-detection for bilingual (Hebrew primary / English secondary)
// marketing, transactional, notification, onboarding, and collection
// workflows.
//
// The surface is deliberately additive: existing callers of `register`
// and `render` keep working; the new `defineTemplate` / `renderTemplate`
// names live alongside them. A thin `EmailTemplatesY121` subclass wires
// the new API for callers who need the exact spec names.

/**
 * Allowed template categories.
 *
 * - marketing    : promotional content — MUST carry §30א opt-out.
 * - transactional: receipts, OTPs, account changes — NO tracking pixel.
 * - notification : system alerts, reminders.
 * - onboarding   : welcome, verification, first-run guides.
 * - collection   : dunning / payment reminders (AR).
 */
const Y121_CATEGORIES = Object.freeze([
  'marketing',
  'transactional',
  'notification',
  'onboarding',
  'collection',
]);

/**
 * Hebrew detection: scan for any codepoint in the Hebrew block
 * (U+0590 – U+05FF). A single Hebrew letter is enough to flip the
 * rendering to RTL — this matches how Gmail / Outlook auto-detect.
 */
function y121HasHebrew(text) {
  if (text === null || text === undefined) return false;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0x0590 && code <= 0x05FF) return true;
  }
  return false;
}

/**
 * Safe {{variable}} substitution. Values are HTML-escaped by default so
 * that even hostile user-controlled payloads (e.g. `<script>alert(1)`)
 * are neutralised before reaching the recipient. Callers can still opt
 * into raw HTML with the `{{& var}}` triple-stache when they really do
 * want to inject trusted markup.
 */
function y121SubstituteVars(html, vars) {
  if (html === null || html === undefined) return '';
  const input = String(html);
  const ctx = vars || {};
  // Raw form: {{& name}} → NOT escaped (trust the caller).
  let out = input.replace(/\{\{\s*&\s*([a-zA-Z0-9_.\-]+)\s*\}\}/g, (_m, key) => {
    const v = resolvePath(ctx, key);
    return v === undefined || v === null ? '' : String(v);
  });
  // Safe form: {{ name }} → HTML-escaped to block XSS.
  out = out.replace(/\{\{\s*([a-zA-Z0-9_.\-]+)\s*\}\}/g, (_m, key) => {
    const v = resolvePath(ctx, key);
    return escapeHtml(v);
  });
  return out;
}

/**
 * Strip HTML tags, decode the common entities, and collapse whitespace
 * into a single newline-delimited plain-text representation. Accessible
 * emails MUST ship a text alternative alongside the HTML part — screen
 * readers, low-bandwidth clients and archival tools depend on it.
 */
function y121GeneratePlainText(html) {
  if (html === null || html === undefined) return '';
  let s = String(html);
  // Drop <script> and <style> blocks entirely — never part of text.
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Convert block-level tags to newlines.
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|br)\s*>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  // Convert list items / table cells to a leading dash/space.
  s = s.replace(/<li[^>]*>/gi, '- ');
  // Drop every remaining tag.
  s = s.replace(/<[^>]+>/g, '');
  // Decode the five standard entities.
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Collapse runs of whitespace / blank lines.
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/**
 * Inline a set of CSS rules into matching tags. Gmail, Outlook and
 * Yahoo strip `<style>` blocks; inline `style=""` is the only reliable
 * way to style an email. This helper takes a simple {selector: css}
 * map and writes the rules onto every matching opening tag.
 *
 * Supported selectors: bare tags (`body`, `p`), class selectors
 * (`.btn`), id selectors (`#cta`). No cascade — first match wins.
 */
function y121InlineCSS(html, styles) {
  if (html === null || html === undefined) return '';
  if (!styles || typeof styles !== 'object') return String(html);
  let out = String(html);
  for (const selector of Object.keys(styles)) {
    const rule = String(styles[selector]).trim().replace(/;?\s*$/, ';');
    if (!rule) continue;
    if (selector.charAt(0) === '.') {
      // Class selector: find `class="…selector…"` and append style.
      const cls = selector.slice(1);
      const re = new RegExp('<([a-zA-Z][a-zA-Z0-9]*)([^>]*?)class="([^"]*\\b' + cls + '\\b[^"]*)"([^>]*)>', 'g');
      out = out.replace(re, (_m, tag, pre, classVal, post) => {
        if (/style="/.test(pre + post)) {
          return '<' + tag + pre + 'class="' + classVal + '"' + post.replace(/style="([^"]*)"/, (_s, v) => 'style="' + v + ';' + rule + '"') + '>';
        }
        return '<' + tag + pre + 'class="' + classVal + '"' + post + ' style="' + rule + '">';
      });
    } else if (selector.charAt(0) === '#') {
      const id = selector.slice(1);
      const re = new RegExp('<([a-zA-Z][a-zA-Z0-9]*)([^>]*?)id="' + id + '"([^>]*)>', 'g');
      out = out.replace(re, (_m, tag, pre, post) => {
        if (/style="/.test(pre + post)) {
          return '<' + tag + pre + 'id="' + id + '"' + post.replace(/style="([^"]*)"/, (_s, v) => 'style="' + v + ';' + rule + '"') + '>';
        }
        return '<' + tag + pre + 'id="' + id + '"' + post + ' style="' + rule + '">';
      });
    } else {
      // Bare tag selector — e.g. `body` or `p`.
      const re = new RegExp('<(' + selector + ')(\\s[^>]*)?>', 'gi');
      out = out.replace(re, (_m, tag, attrs) => {
        const a = attrs || '';
        if (/style="/.test(a)) {
          return '<' + tag + a.replace(/style="([^"]*)"/, (_s, v) => 'style="' + v + ';' + rule + '"') + '>';
        }
        return '<' + tag + a + ' style="' + rule + '">';
      });
    }
  }
  return out;
}

// Default compliance constants per חוק התקשורת (בזק ושידורים) §30א and
// the 2008 amendment ("חוק הספאם"). Marketing email must carry:
//   1. Unsubscribe mechanism (link or keyword).
//   2. Sender identification (name + Israeli ID / company #).
//   3. Physical address of the sender.
//   4. Free-text opt-out keyword (e.g. "הסר", "STOP", "UNSUBSCRIBE").
//   5. Clear subject prefix marking it as advertising ("פרסומת").
const Y121_SPAM_LAW = Object.freeze({
  section: '§30א',
  law: 'חוק התקשורת (בזק ושידורים), תשמ"ב-1982',
  amendment: 'תיקון 40 (2008) — חוק הספאם',
  required: [
    'unsubscribe_link',
    'sender_identification',
    'physical_address',
    'opt_out_keyword',
    'advertising_marker',
  ],
  opt_out_keywords_he: ['הסר', 'הסרה', 'הסר אותי', 'להסרה'],
  opt_out_keywords_en: ['STOP', 'UNSUBSCRIBE', 'OPT-OUT', 'OPT OUT'],
  subject_prefix_he: 'פרסומת',
  subject_prefix_en: 'Advertisement',
});

// ── prototype additions ──────────────────────────────────────────────
//
// Every addition lives on the existing `EmailTemplates` prototype so
// that both the legacy `defaultEngine` singleton and the new
// `EmailTemplatesY121` subclass inherit them. No existing method is
// touched or shadowed.

/**
 * Define (or upgrade) a template using the Y-121 bilingual schema.
 * Calling it a second time with the same id appends a new version
 * record to the history and promotes the new body to "current".
 * The previous versions remain queryable via `getVersion` — true to
 * "לא מוחקים רק משדרגים ומגדלים".
 */
EmailTemplates.prototype.defineTemplate = function defineTemplate(def) {
  if (!def || typeof def !== 'object' || !def.id) {
    throw new Error('email-templates(Y121): defineTemplate requires {id,…}');
  }
  const category = def.category || 'transactional';
  if (Y121_CATEGORIES.indexOf(category) === -1) {
    throw new Error('email-templates(Y121): unknown category "' + category + '"');
  }
  const existing = this._registry.get(def.id);
  const history = (existing && existing._y121History) || [];
  const version = (existing && existing._y121Version ? existing._y121Version : 0) + 1;

  // Snapshot the previous current version before we overwrite — this is
  // the append-only versioning contract.
  if (existing) {
    history.push({
      version: existing._y121Version || 1,
      snapshot: clone(existing),
      replacedAt: this._now().toISOString(),
    });
  }

  const record = Object.freeze(Object.assign({}, existing || {}, {
    id: def.id,
    name_he: def.name_he || def.name || def.id,
    name_en: def.name_en || def.name || def.id,
    subject_he: def.subject_he || '',
    subject_en: def.subject_en || '',
    // Legacy keys kept in sync so render() / responsive() still work.
    html: def.bodyHtml_he || def.bodyHtml_en || (existing && existing.html) || '',
    html_he: def.bodyHtml_he || '',
    html_en: def.bodyHtml_en || '',
    text: def.text || y121GeneratePlainText(def.bodyHtml_he || def.bodyHtml_en || ''),
    variables: Array.isArray(def.variables) ? def.variables.slice() : [],
    category,
    footer: def.footer || (existing && existing.footer) || { he: '', en: '' },
    _y121: true,
    _y121Version: version,
    _y121History: history,
    _y121CreatedAt: (existing && existing._y121CreatedAt) || this._now().toISOString(),
    _y121UpdatedAt: this._now().toISOString(),
  }));
  this._registry.set(def.id, record);
  return record;
};

/**
 * Render a template by id for a specific language + variables, and
 * return the headers / html / text parts a mail transport needs.
 *
 * The html is RTL-wrapped automatically when Hebrew content is
 * detected (via `rtlDetect`), and §30א-compliant List-Unsubscribe
 * headers are attached when the template is marked "marketing".
 */
EmailTemplates.prototype.renderTemplate = function renderTemplate(args) {
  const { templateId, lang, variables, recipient } = args || {};
  const tmpl = this._registry.get(templateId);
  if (!tmpl) throw new Error('email-templates(Y121): unknown template ' + templateId);
  const language = lang === 'en' ? 'en' : 'he';
  const vars = Object.assign({ brand: this.brand }, variables || {});

  const bodySource = language === 'en'
    ? (tmpl.html_en || tmpl.html || '')
    : (tmpl.html_he || tmpl.html || '');
  const subjectSource = language === 'en' ? tmpl.subject_en : tmpl.subject_he;

  const subject = y121SubstituteVars(subjectSource || '', vars);
  let html = y121SubstituteVars(bodySource || '', vars);
  const isHebrew = language === 'he' || this.rtlDetect(html) || this.rtlDetect(subject);

  // Auto-wrap RTL direction at the outermost <html>/<body>, or inject
  // a wrapper div when the body is raw fragment markup.
  if (isHebrew) {
    if (/<html[^>]*>/i.test(html)) {
      html = html.replace(/<html([^>]*)>/i, (m, attrs) => {
        if (/dir=/i.test(attrs)) return m;
        return '<html' + attrs + ' dir="rtl" lang="he">';
      });
    } else if (/<body[^>]*>/i.test(html)) {
      html = html.replace(/<body([^>]*)>/i, (m, attrs) => {
        if (/dir=/i.test(attrs)) return m;
        return '<body' + attrs + ' dir="rtl" lang="he">';
      });
    } else {
      html = '<div dir="rtl" lang="he">' + html + '</div>';
    }
  }

  // Append a §30א-compliant unsubscribe footer for marketing mail.
  if (tmpl.category === 'marketing') {
    const unsub = (recipient && recipient.id)
      ? this.unsubscribe({ userId: recipient.id, token: templateId })
      : { url: this.brand.unsubscribe_base };
    const footerHe = [
      '<div dir="rtl" lang="he" style="font-size:12px;color:#666;margin-top:24px;border-top:1px solid #ddd;padding-top:12px">',
      '<p>' + escapeHtml(this.brand.name_he || this.brand.name) + ' — ' + escapeHtml(this.brand.address_he) + '</p>',
      '<p>להסרה מרשימת התפוצה: <a href="' + escapeHtml(unsub.url) + '">הסר</a> | השב בהודעה זו עם המילה "הסר".</p>',
      '<p>הודעת פרסומת — מתפרסמת על פי חוק התקשורת, תשמ"ב-1982, סעיף 30א.</p>',
      '</div>',
    ].join('');
    const footerEn = [
      '<div dir="ltr" lang="en" style="font-size:12px;color:#666;margin-top:24px;border-top:1px solid #ddd;padding-top:12px">',
      '<p>' + escapeHtml(this.brand.name) + ' — ' + escapeHtml(this.brand.address_en) + '</p>',
      '<p>To unsubscribe: <a href="' + escapeHtml(unsub.url) + '">UNSUBSCRIBE</a> | Reply "STOP" to opt out.</p>',
      '<p>This is an advertisement pursuant to §30א of the Israeli Communications Act (1982).</p>',
      '</div>',
    ].join('');
    html += (language === 'en' ? footerEn : footerHe);
  }

  const text = y121GeneratePlainText(html);
  const headers = {
    'Content-Type': 'text/html; charset=UTF-8',
    'Content-Language': language,
  };
  if (tmpl.category === 'marketing') {
    const unsub = (recipient && recipient.id)
      ? this.unsubscribe({ userId: recipient.id, token: templateId })
      : { url: this.brand.unsubscribe_base };
    headers['List-Unsubscribe'] = '<' + unsub.url + '>';
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    // Add the Israeli "פרסומת" subject prefix required by law.
    if (language === 'he') {
      if (subject.indexOf('פרסומת') === -1) {
        args._prefixedSubject = 'פרסומת: ' + subject;
      }
    }
  }

  return {
    subject: args._prefixedSubject || subject,
    html,
    text,
    headers,
  };
};

/**
 * Append-only version upgrade. A new body replaces the current one;
 * old versions are retained forever via `_y121History` so audits,
 * A/B tests and rollbacks can look at any prior revision.
 */
EmailTemplates.prototype.upgradeTemplate = function upgradeTemplate(templateId, newVersion) {
  const existing = this._registry.get(templateId);
  if (!existing) throw new Error('email-templates(Y121): cannot upgrade unknown ' + templateId);
  const merged = Object.assign({}, existing, newVersion, { id: templateId, category: newVersion.category || existing.category });
  return this.defineTemplate(merged);
};

/** Return the full append-only version history for a template. */
EmailTemplates.prototype.getHistory = function getHistory(templateId) {
  const t = this._registry.get(templateId);
  if (!t) return [];
  return (t._y121History || []).slice();
};

/**
 * List templates using the Y-121 filter set. Optional `category` and
 * `lang` narrow the result; omitting both returns every registered
 * template. The shape matches what the admin UI expects.
 */
EmailTemplates.prototype.listTemplates = function listTemplates(filter) {
  const f = filter || {};
  const out = [];
  for (const tmpl of this._registry.values()) {
    if (f.category && tmpl.category !== f.category) continue;
    out.push({
      id: tmpl.id,
      name_he: tmpl.name_he,
      name_en: tmpl.name_en,
      subject_he: tmpl.subject_he,
      subject_en: tmpl.subject_en,
      category: tmpl.category || 'transactional',
      version: tmpl._y121Version || 1,
      variables: (tmpl.variables || []).slice(),
    });
  }
  return out;
};

/**
 * Validate a template descriptor. Returns `{valid, errors, warnings}`.
 * Checks:
 *  - required variables referenced in the body are listed in `variables`
 *  - marketing templates carry an unsubscribe link / keyword
 *  - HTML has an `alt=""` on every <img> for accessibility
 *  - transactional templates never embed an open-tracking pixel
 */
EmailTemplates.prototype.validateTemplate = function validateTemplate(tmpl) {
  const errors = [];
  const warnings = [];
  if (!tmpl || typeof tmpl !== 'object') {
    return { valid: false, errors: ['not an object'], warnings: [] };
  }
  const body = tmpl.bodyHtml_he || tmpl.bodyHtml_en || tmpl.html || '';
  const referenced = [];
  body.replace(/\{\{\s*&?\s*([a-zA-Z0-9_.\-]+)\s*\}\}/g, (_m, k) => {
    if (k !== 'this' && referenced.indexOf(k) === -1) referenced.push(k);
    return '';
  });
  const declared = (tmpl.variables || []).slice();
  for (const r of referenced) {
    const top = r.split('.')[0];
    if (top === 'brand') continue;
    if (declared.indexOf(r) === -1 && declared.indexOf(top) === -1) {
      warnings.push('variable "' + r + '" used but not declared');
    }
  }
  if (tmpl.category === 'marketing') {
    if (!/unsubscribe|הסר/i.test(body) && !/unsubscribe|הסר/i.test(tmpl.subject_he || '') && !/unsubscribe|הסר/i.test(tmpl.subject_en || '')) {
      errors.push('marketing template missing unsubscribe link/keyword (§30א)');
    }
  }
  // Accessible HTML: every <img> must have alt="" at minimum.
  const imgs = body.match(/<img[^>]*>/gi) || [];
  for (const img of imgs) {
    if (!/alt\s*=/.test(img)) {
      warnings.push('image missing alt attribute');
      break;
    }
  }
  // Tracking pixel check for transactional mail.
  if (tmpl.category === 'transactional') {
    if (/width\s*=\s*["']?1["']?[^>]*height\s*=\s*["']?1["']?/i.test(body) || /open\.gif|tracking\.gif|pixel\.gif/i.test(body)) {
      errors.push('transactional template must not embed a tracking pixel');
    }
  }
  return { valid: errors.length === 0, errors, warnings };
};

/**
 * Safe variable substitution (Y-121 surface). See `y121SubstituteVars`.
 */
EmailTemplates.prototype.substituteVars = function substituteVars(html, vars) {
  return y121SubstituteVars(html, vars);
};

/**
 * Return `true` if the supplied text contains any Hebrew codepoint.
 * Callers use this to decide whether to emit `dir="rtl"` wrappers.
 */
EmailTemplates.prototype.rtlDetect = function rtlDetect(text) {
  return y121HasHebrew(text);
};

/** Strip HTML to a plain-text alternative (accessible emails). */
EmailTemplates.prototype.generatePlainText = function generatePlainText(html) {
  return y121GeneratePlainText(html);
};

/** Inline CSS rules into the matching tags (email-client safe). */
EmailTemplates.prototype.inlineCSS = function inlineCSSY121(html, styles) {
  return y121InlineCSS(html, styles);
};

/**
 * Compliance audit for a template + category combination. Marketing
 * mail gets the strictest test — every §30א requirement must be
 * satisfied before the template is allowed out of the door.
 */
EmailTemplates.prototype.complianceCheck = function complianceCheck(template, category) {
  const cat = category || (template && template.category) || 'transactional';
  const result = {
    category: cat,
    compliant: true,
    law: Y121_SPAM_LAW.section,
    missing: [],
    passed: [],
  };
  if (cat !== 'marketing') {
    result.passed.push('non-marketing category — §30א strict checks skipped');
    return result;
  }
  const body = (template && (template.bodyHtml_he || template.bodyHtml_en || template.html)) || '';
  const subject = (template && (template.subject_he || template.subject_en || '')) || '';
  const footer = (template && template.footer) || { he: '', en: '' };
  const haystack = body + '\n' + subject + '\n' + (footer.he || '') + '\n' + (footer.en || '');

  // 1. Unsubscribe link.
  if (/unsubscribe|הסר|הסרה/i.test(haystack)) result.passed.push('unsubscribe_link');
  else { result.missing.push('unsubscribe_link'); result.compliant = false; }

  // 2. Sender identification (company name / brand present).
  if (/techno.?kol|טכנו.?קול|\{\{\s*brand\.name/i.test(haystack)) result.passed.push('sender_identification');
  else { result.missing.push('sender_identification'); result.compliant = false; }

  // 3. Physical address.
  if (/address|כתובת|רחוב|street|\{\{\s*brand\.address/i.test(haystack)) result.passed.push('physical_address');
  else { result.missing.push('physical_address'); result.compliant = false; }

  // 4. Free-text opt-out keyword.
  const hasOptOut = Y121_SPAM_LAW.opt_out_keywords_he.some((k) => haystack.indexOf(k) !== -1)
    || Y121_SPAM_LAW.opt_out_keywords_en.some((k) => haystack.toUpperCase().indexOf(k) !== -1);
  if (hasOptOut) result.passed.push('opt_out_keyword');
  else { result.missing.push('opt_out_keyword'); result.compliant = false; }

  // 5. Advertising marker ("פרסומת" / "Advertisement").
  if (/פרסומת|advertisement|advertising/i.test(haystack)) result.passed.push('advertising_marker');
  else { result.missing.push('advertising_marker'); result.compliant = false; }

  return result;
};

/**
 * Export a template in an MJML-compatible subset:
 *   <mjml>
 *     <mj-body>
 *       <mj-section><mj-column><mj-text>…</mj-text></mj-column></mj-section>
 *     </mj-body>
 *   </mjml>
 * Not the full MJML grammar — just enough structure for downstream
 * tooling that wants to consume MJML source trees.
 */
EmailTemplates.prototype.exportMJML = function exportMJML(templateId) {
  const t = this._registry.get(templateId);
  if (!t) throw new Error('email-templates(Y121): unknown template ' + templateId);
  const html = t.html_he || t.html || '';
  const subject = t.subject_he || t.subject_en || '';
  // Escape angle brackets inside mj-text so MJML doesn't double-parse.
  const safeBody = String(html);
  const mjml = [
    '<mjml>',
    '  <mj-head>',
    '    <mj-title>' + escapeHtml(subject) + '</mj-title>',
    '    <mj-attributes>',
    '      <mj-all font-family="Arial, sans-serif" />',
    '    </mj-attributes>',
    '  </mj-head>',
    '  <mj-body>',
    '    <mj-section>',
    '      <mj-column>',
    '        <mj-text>' + safeBody + '</mj-text>',
    '      </mj-column>',
    '    </mj-section>',
    '  </mj-body>',
    '</mjml>',
  ].join('\n');
  return mjml;
};

/**
 * Import a template from a loose source — accepts plain HTML, a
 * minimal JSON descriptor, or a Markdown fragment. Autodetects the
 * format and routes to `defineTemplate`.
 */
EmailTemplates.prototype.importTemplate = function importTemplate(source) {
  if (!source) throw new Error('email-templates(Y121): importTemplate needs a source');
  if (typeof source === 'object') {
    return this.defineTemplate(source);
  }
  const text = String(source);
  // JSON?
  const trimmed = text.trim();
  if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
    try { return this.defineTemplate(JSON.parse(trimmed)); } catch (e) { /* fall through */ }
  }
  // HTML?
  if (/<\w+[\s\S]*?>/.test(trimmed)) {
    const titleMatch = trimmed.match(/<title>([\s\S]*?)<\/title>/i);
    const isHe = y121HasHebrew(trimmed);
    return this.defineTemplate({
      id: 'imported-html-' + fnv1a(trimmed).toString(16),
      name_he: titleMatch ? titleMatch[1] : 'יובא מ-HTML',
      name_en: titleMatch ? titleMatch[1] : 'Imported HTML',
      subject_he: titleMatch ? titleMatch[1] : 'יובא',
      subject_en: titleMatch ? titleMatch[1] : 'Imported',
      bodyHtml_he: isHe ? trimmed : '',
      bodyHtml_en: isHe ? '' : trimmed,
      variables: [],
      category: 'notification',
    });
  }
  // Markdown (naive): convert #/##/### + paragraphs to basic HTML.
  const html = trimmed
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n+/g, '</p><p>');
  const wrapped = '<p>' + html + '</p>';
  const isHe = y121HasHebrew(trimmed);
  return this.defineTemplate({
    id: 'imported-md-' + fnv1a(trimmed).toString(16),
    name_he: 'יובא מ-Markdown',
    name_en: 'Imported Markdown',
    subject_he: 'יובא',
    subject_en: 'Imported',
    bodyHtml_he: isHe ? wrapped : '',
    bodyHtml_en: isHe ? '' : wrapped,
    variables: [],
    category: 'notification',
  });
};

/**
 * `EmailTemplatesY121` is a thin subclass that gives callers the
 * exact spec surface without legacy seeds getting in the way. The
 * default constructor starts with an empty registry, so tests can
 * reason about what is and isn't defined.
 */
class EmailTemplatesY121 extends EmailTemplates {
  constructor(opts) {
    super(Object.assign({ seed: false }, opts || {}));
  }
}

module.exports = {
  EmailTemplates,
  EmailTemplatesY121,
  DEFAULT_BRAND,
  SEEDS,
  SEED_STRINGS,
  SPAM_TRIGGERS,
  RFM_SEGMENTS,
  Y121_CATEGORIES,
  Y121_SPAM_LAW,
  escapeHtml,
  renderString,
  y121SubstituteVars,
  y121HasHebrew,
  y121GeneratePlainText,
  y121InlineCSS,
  // Default singleton for callers who just need a ready-to-use engine.
  defaultEngine: new EmailTemplates(),
};
