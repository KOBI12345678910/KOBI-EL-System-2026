/**
 * ONYX PROCUREMENT — Bilingual Email Template System
 * ───────────────────────────────────────────────────
 * Agent-73 contribution.  Law: DO NOT DELETE.
 *
 * Purpose:
 *   A dependency-free, purely additive module that generates HTML + plain-text
 *   email bodies for every transactional email the Onyx platform sends.  Every
 *   template is bilingual (Hebrew primary / English secondary) and ships with
 *   RTL-correct HTML, mobile-friendly inlined CSS, a Hebrew subject, an English
 *   subject, and a matching plain-text fallback for clients that strip HTML.
 *
 *   This module has ZERO external dependencies — it composes strings only.
 *   It must remain safe to require from anywhere in the codebase (server
 *   routes, workers, unit tests, preview generators) without side effects.
 *
 * Template catalogue (10):
 *    1. wage_slip_issued             — תלוש שכר חדש נשלח לעובד
 *    2. invoice_received             — חשבונית ספק נקלטה במערכת
 *    3. invoice_overdue              — חשבונית לקוח באיחור (תזכורת)
 *    4. payment_confirmation         — אישור ביצוע תשלום
 *    5. vat_report_ready             — דוח מע"מ מוכן לחתימה
 *    6. annual_tax_report            — דוח שנתי (מס הכנסה) מוכן
 *    7. po_approval_needed           — הזמנת רכש ממתינה לאישור
 *    8. low_cash_alert               — התראת מלאי מזומנים נמוך
 *    9. bank_reconciliation_completed — התאמת בנק הסתיימה
 *   10. failed_payroll_calculation   — חישוב שכר נכשל
 *
 * Public API:
 *   renderTemplate(name, vars)       → { subject, subject_en, html, text, missing }
 *   listTemplates()                  → array of { name, subject_he, subject_en, variables }
 *   getTemplate(name)                → raw template descriptor (read-only clone)
 *   renderAll(vars)                  → map of name → rendered object
 *   escapeHtml(str)                  → HTML-entity-escape helper
 *   replaceVariables(text, vars)     → substitute {{var}} placeholders
 *   DEFAULT_BRAND                    → { name, logo_url, support_email, … }
 *   TEMPLATES                        → frozen map of all descriptors
 *
 * Variable syntax:
 *   {{variable_name}} inside any string field is substituted via
 *   replaceVariables().  Missing variables stay as the literal token and are
 *   reported in the `missing` array of the render result so callers can fail
 *   loudly in tests while still producing an inspectable preview.
 */

'use strict';

// ───────────────────────────────────────────────────────────────
// Branding defaults.  Callers may override via vars.brand.*
// ───────────────────────────────────────────────────────────────
const DEFAULT_BRAND = Object.freeze({
  name: 'Onyx Procurement',
  name_he: 'אוניקס פרוקיורמנט',
  logo_url: 'https://onyx.local/assets/logo.png',
  logo_alt: 'Onyx Procurement Logo',
  support_email: 'support@onyx.local',
  support_phone: '+972-3-000-0000',
  website: 'https://onyx.local',
  address_he: 'רחוב המלאכה 1, תל אביב',
  address_en: '1 HaMelacha St, Tel Aviv, Israel',
  primary_color: '#1f3a5f',
  accent_color: '#c5a572',
  unsubscribe_url: 'https://onyx.local/unsubscribe',
});

// ───────────────────────────────────────────────────────────────
// Small utilities — intentionally tiny, no deps
// ───────────────────────────────────────────────────────────────

/**
 * Escape a string for safe interpolation inside HTML text / attribute context.
 * Handles the canonical five metacharacters and non-string inputs.
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
 * Resolve a dotted path inside an object; returns undefined when any segment
 * is missing so replaceVariables() can record it in the `missing` array.
 */
function resolvePath(obj, path) {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Replace all {{var}} tokens inside a string.  Returns { text, missing }.
 * Never throws; unknown variables remain as their literal token.
 * The `escape` flag HTML-escapes the substituted value (used for HTML output).
 */
function replaceVariables(text, vars, { escape = false } = {}) {
  if (text === null || text === undefined) return { text: '', missing: [] };
  const source = String(text);
  const missing = [];
  const out = source.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key) => {
    const val = resolvePath(vars || {}, key);
    if (val === undefined || val === null || val === '') {
      missing.push(key);
      return match;
    }
    return escape ? escapeHtml(val) : String(val);
  });
  return { text: out, missing };
}

/**
 * Format a number as ILS currency for display inside plain text / HTML.
 * Kept tiny to avoid Intl dependency issues in older Node versions.
 */
function formatCurrency(amount, currency = 'ILS') {
  if (amount === undefined || amount === null || amount === '') return '';
  const n = Number(amount);
  if (Number.isNaN(n)) return String(amount);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs).toString();
  const withSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = Math.round((abs - Math.floor(abs)) * 100)
    .toString()
    .padStart(2, '0');
  const sym = currency === 'ILS' ? '₪' : currency + ' ';
  return `${sign}${sym}${withSep}.${frac}`;
}

// ───────────────────────────────────────────────────────────────
// Shared HTML shell — builds a consistent header / footer around
// the per-template body.  All CSS is inline because most email
// clients (Gmail, Outlook, Apple Mail) strip <style> blocks.
// ───────────────────────────────────────────────────────────────

function buildHtmlShell({
  title,
  preheader,
  bodyInnerHtml,
  brand,
  footerHtml,
}) {
  const b = brand || DEFAULT_BRAND;
  // Mobile-friendly, RTL-native, table-based layout.
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,'Segoe UI',Tahoma,sans-serif;direction:rtl;text-align:right;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;line-height:1px;">${escapeHtml(preheader || '')}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f7;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        <tr>
          <td style="background-color:${escapeHtml(b.primary_color)};padding:24px 32px;text-align:right;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="text-align:right;">
                  <img src="${escapeHtml(b.logo_url)}" alt="${escapeHtml(b.logo_alt)}" width="140" style="display:inline-block;max-width:140px;height:auto;border:0;outline:none;text-decoration:none;">
                </td>
                <td style="text-align:left;color:#ffffff;font-size:13px;">
                  <div style="color:${escapeHtml(b.accent_color)};font-weight:bold;">${escapeHtml(b.name_he)}</div>
                  <div style="color:#ffffff;opacity:0.8;">${escapeHtml(b.name)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;direction:rtl;text-align:right;color:#333333;font-size:15px;line-height:1.7;">
${bodyInnerHtml}
          </td>
        </tr>
        <tr>
          <td style="background-color:#f7f7fa;padding:20px 32px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;direction:rtl;text-align:right;">
${footerHtml}
          </td>
        </tr>
      </table>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="padding:16px 32px;color:#9ca3af;font-size:11px;line-height:1.5;text-align:center;">
            &copy; ${new Date().getFullYear()} ${escapeHtml(b.name_he)} / ${escapeHtml(b.name)}.
            ${escapeHtml(b.address_he)} · ${escapeHtml(b.address_en)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function buildFooterHtml(brand) {
  const b = brand || DEFAULT_BRAND;
  return `
            <div style="margin-bottom:8px;color:#374151;">
              <strong>${escapeHtml(b.name_he)}</strong> · צוות התמיכה<br>
              <span style="color:#6b7280;">${escapeHtml(b.name)} Support Team</span>
            </div>
            <div style="margin-bottom:8px;">
              דוא"ל: <a href="mailto:${escapeHtml(b.support_email)}" style="color:${escapeHtml(b.primary_color)};text-decoration:none;">${escapeHtml(b.support_email)}</a>
              · טלפון: ${escapeHtml(b.support_phone)}
              · <a href="${escapeHtml(b.website)}" style="color:${escapeHtml(b.primary_color)};text-decoration:none;">${escapeHtml(b.website)}</a>
            </div>
            <div style="color:#9ca3af;font-size:11px;margin-top:10px;">
              הודעה זו נשלחה אוטומטית על ידי מערכת אוניקס. אין להשיב להודעה זו ישירות.<br>
              This is an automated message from the Onyx Procurement platform. Please do not reply directly.
              <br>
              <a href="${escapeHtml(b.unsubscribe_url)}" style="color:#6b7280;text-decoration:underline;">להסרה מרשימת התפוצה / Unsubscribe</a>
            </div>`;
}

function buildPlainFooter(brand) {
  const b = brand || DEFAULT_BRAND;
  return [
    '',
    '--',
    `${b.name_he} / ${b.name}`,
    `Email: ${b.support_email} · Phone: ${b.support_phone}`,
    `Web: ${b.website}`,
    `${b.address_he} · ${b.address_en}`,
    '',
    'הודעה אוטומטית — אין להשיב ישירות.',
    'Automated notification — please do not reply.',
    `Unsubscribe: ${b.unsubscribe_url}`,
  ].join('\n');
}

// ───────────────────────────────────────────────────────────────
// Template descriptors.  Each entry declares:
//   subject_he / subject_en — both localized subjects
//   preheader_he            — short hidden preview text
//   variables               — list of required {{vars}} (for tests/docs)
//   body_he_html            — array of HTML paragraphs/blocks (Hebrew)
//   body_en_html            — array of HTML paragraphs/blocks (English)
//   text_he / text_en       — plain-text bodies
// ───────────────────────────────────────────────────────────────

const TEMPLATES = Object.freeze({

  // ── 1. Wage slip issued ────────────────────────────────────────
  wage_slip_issued: {
    name: 'wage_slip_issued',
    category: 'payroll',
    subject_he: 'תלוש השכר שלך לחודש {{period}} מוכן - {{employee_name}}',
    subject_en: 'Your pay slip for {{period}} is ready — {{employee_name}}',
    preheader_he: 'תלוש השכר החתום שלך מצורף כקובץ PDF',
    variables: ['employee_name', 'period', 'net_amount', 'gross_amount', 'pay_date', 'slip_id'],
    body_he_html: [
      '<h2 style="color:#1f3a5f;margin:0 0 16px 0;font-size:22px;">שלום {{employee_name}},</h2>',
      '<p>אנו שמחים להודיע לך כי תלוש השכר שלך עבור חודש <strong>{{period}}</strong> הונפק ומצורף להודעה זו כקובץ PDF חתום דיגיטלית.</p>',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7fa;border-radius:6px;margin:18px 0;">',
      '  <tr><td style="padding:14px 18px;">',
      '    <div style="color:#6b7280;font-size:12px;">מספר תלוש / Slip ID</div>',
      '    <div style="font-weight:bold;color:#1f3a5f;">{{slip_id}}</div>',
      '  </td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;">',
      '    <div style="color:#6b7280;font-size:12px;">תאריך תשלום / Pay Date</div>',
      '    <div style="font-weight:bold;">{{pay_date}}</div>',
      '  </td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;">',
      '    <div style="color:#6b7280;font-size:12px;">שכר ברוטו / Gross</div>',
      '    <div style="font-weight:bold;">{{gross_amount}}</div>',
      '  </td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;">',
      '    <div style="color:#6b7280;font-size:12px;">שכר נטו / Net</div>',
      '    <div style="font-weight:bold;color:#16a34a;font-size:18px;">{{net_amount}}</div>',
      '  </td></tr>',
      '</table>',
      '<p>אנא שמור על קובץ זה לצרכי תיעוד. לשאלות בנוגע לתלוש - פנה למחלקת השכר.</p>',
      '<p style="color:#6b7280;font-size:13px;">הערה: התלוש נחתם דיגיטלית בהתאם לדרישות חוק הגנת השכר וחוק החתימה האלקטרונית.</p>',
    ],
    body_en_html: [
      '<hr style="border:none;border-top:1px dashed #d1d5db;margin:24px 0;">',
      '<p style="color:#6b7280;font-size:13px;"><strong>English:</strong> Hello {{employee_name}}, your pay slip for <strong>{{period}}</strong> has been issued and is attached as a digitally-signed PDF. Net pay: <strong>{{net_amount}}</strong>. Please retain for your records.</p>',
    ],
    text_he: [
      'שלום {{employee_name}},',
      '',
      'תלוש השכר שלך עבור חודש {{period}} הונפק ומצורף כקובץ PDF.',
      '',
      'מספר תלוש: {{slip_id}}',
      'תאריך תשלום: {{pay_date}}',
      'שכר ברוטו: {{gross_amount}}',
      'שכר נטו: {{net_amount}}',
      '',
      'אנא שמור את הקובץ לצרכי תיעוד.',
    ],
    text_en: [
      '',
      'English:',
      'Hello {{employee_name}}, your pay slip for {{period}} is attached (PDF).',
      'Slip ID: {{slip_id}} · Pay date: {{pay_date}}',
      'Gross: {{gross_amount}} · Net: {{net_amount}}',
    ],
  },

  // ── 2. Invoice received ────────────────────────────────────────
  invoice_received: {
    name: 'invoice_received',
    category: 'ap',
    subject_he: 'חשבונית {{invoice_number}} התקבלה מספק {{vendor_name}}',
    subject_en: 'Invoice {{invoice_number}} received from {{vendor_name}}',
    preheader_he: 'החשבונית נקלטה במערכת וממתינה לעיבוד',
    variables: ['vendor_name', 'invoice_number', 'amount', 'due_date', 'received_date'],
    body_he_html: [
      '<h2 style="color:#1f3a5f;margin:0 0 16px 0;">חשבונית חדשה נקלטה</h2>',
      '<p>מערכת אוניקס קלטה חשבונית חדשה מהספק <strong>{{vendor_name}}</strong>. החשבונית עברה OCR ואימות ראשוני וממתינה לשלב הבא של העיבוד.</p>',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7fa;border-radius:6px;margin:18px 0;">',
      '  <tr><td style="padding:14px 18px;"><div style="color:#6b7280;font-size:12px;">מספר חשבונית</div><div style="font-weight:bold;">{{invoice_number}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">ספק</div><div>{{vendor_name}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">סכום כולל מע"מ</div><div style="font-weight:bold;">{{amount}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">תאריך קליטה</div><div>{{received_date}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">תאריך פירעון</div><div style="color:#dc2626;font-weight:bold;">{{due_date}}</div></td></tr>',
      '</table>',
      '<p>לצפייה ולאישור החשבונית ניתן להיכנס למערכת אוניקס.</p>',
    ],
    body_en_html: [
      '<hr style="border:none;border-top:1px dashed #d1d5db;margin:24px 0;">',
      '<p style="color:#6b7280;font-size:13px;"><strong>English:</strong> Invoice <strong>{{invoice_number}}</strong> from <strong>{{vendor_name}}</strong> (amount: {{amount}}) has been received and is awaiting processing. Due date: {{due_date}}.</p>',
    ],
    text_he: [
      'חשבונית חדשה נקלטה',
      '',
      'ספק: {{vendor_name}}',
      'מספר חשבונית: {{invoice_number}}',
      'סכום: {{amount}}',
      'תאריך קליטה: {{received_date}}',
      'תאריך פירעון: {{due_date}}',
      '',
      'החשבונית ממתינה לאישור במערכת אוניקס.',
    ],
    text_en: [
      '',
      'English:',
      'Invoice {{invoice_number}} from {{vendor_name}} (amount {{amount}}) has been received.',
      'Due date: {{due_date}}',
    ],
  },

  // ── 3. Invoice overdue ─────────────────────────────────────────
  invoice_overdue: {
    name: 'invoice_overdue',
    category: 'ar',
    subject_he: 'תזכורת: חשבונית {{invoice_number}} באיחור של {{days_overdue}} ימים',
    subject_en: 'Reminder: Invoice {{invoice_number}} is {{days_overdue}} days overdue',
    preheader_he: 'תזכורת אדיבה לתשלום חשבונית שטרם נפרעה',
    variables: ['customer_name', 'invoice_number', 'amount', 'due_date', 'days_overdue'],
    body_he_html: [
      '<h2 style="color:#b45309;margin:0 0 16px 0;">תזכורת לתשלום חשבונית</h2>',
      '<p>שלום {{customer_name}},</p>',
      '<p>הגיע לידיעתנו שחשבונית מספר <strong>{{invoice_number}}</strong> על סך <strong>{{amount}}</strong>, שפירעונה היה ב-<strong>{{due_date}}</strong>, טרם נפרעה. כיום החשבונית באיחור של <strong>{{days_overdue}} ימים</strong>.</p>',
      '<div style="background:#fef3c7;border-right:4px solid #f59e0b;padding:14px 18px;border-radius:6px;margin:18px 0;">',
      '  <strong>פעולה נדרשת:</strong> נבקש להסדיר את התשלום בהקדם האפשרי. אם התשלום בוצע בימים האחרונים, אנא התעלם מהודעה זו.',
      '</div>',
      '<p>לשאלות ובירורים ניתן לפנות למחלקת הכספים שלנו. תודה על שיתוף הפעולה.</p>',
    ],
    body_en_html: [
      '<hr style="border:none;border-top:1px dashed #d1d5db;margin:24px 0;">',
      '<p style="color:#6b7280;font-size:13px;"><strong>English:</strong> Dear {{customer_name}}, invoice <strong>{{invoice_number}}</strong> for <strong>{{amount}}</strong> was due on {{due_date}} and is now <strong>{{days_overdue}} days overdue</strong>. Kindly arrange settlement at your earliest convenience. If payment has already been made, please disregard this reminder.</p>',
    ],
    text_he: [
      'תזכורת לתשלום חשבונית',
      '',
      'שלום {{customer_name}},',
      'חשבונית מספר {{invoice_number}} על סך {{amount}} טרם נפרעה.',
      'תאריך פירעון: {{due_date}}',
      'ימי איחור: {{days_overdue}}',
      '',
      'נבקש להסדיר את התשלום בהקדם.',
    ],
    text_en: [
      '',
      'English:',
      'Invoice {{invoice_number}} ({{amount}}) is {{days_overdue}} days overdue.',
      'Original due date: {{due_date}}.',
      'Please arrange payment at your earliest convenience.',
    ],
  },

  // ── 4. Payment confirmation ────────────────────────────────────
  payment_confirmation: {
    name: 'payment_confirmation',
    category: 'finance',
    subject_he: 'אישור תשלום - {{payment_reference}} על סך {{amount}}',
    subject_en: 'Payment confirmation — {{payment_reference}} for {{amount}}',
    preheader_he: 'התשלום בוצע בהצלחה',
    variables: ['recipient_name', 'amount', 'payment_date', 'payment_reference', 'payment_method'],
    body_he_html: [
      '<div style="background:#dcfce7;border-right:4px solid #16a34a;padding:14px 18px;border-radius:6px;margin-bottom:20px;">',
      '  <strong style="color:#166534;">התשלום בוצע בהצלחה</strong>',
      '</div>',
      '<h2 style="color:#1f3a5f;margin:0 0 16px 0;">שלום {{recipient_name}},</h2>',
      '<p>אנו מאשרים בזאת כי בוצע תשלום מטעם מערכת אוניקס לפי הפרטים הבאים:</p>',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7fa;border-radius:6px;margin:18px 0;">',
      '  <tr><td style="padding:14px 18px;"><div style="color:#6b7280;font-size:12px;">מספר אסמכתא</div><div style="font-weight:bold;">{{payment_reference}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">סכום</div><div style="font-weight:bold;color:#16a34a;font-size:20px;">{{amount}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">תאריך</div><div>{{payment_date}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">אמצעי תשלום</div><div>{{payment_method}}</div></td></tr>',
      '</table>',
      '<p>יש לשמור אישור זה לצרכי הנהלת חשבונות.</p>',
    ],
    body_en_html: [
      '<hr style="border:none;border-top:1px dashed #d1d5db;margin:24px 0;">',
      '<p style="color:#6b7280;font-size:13px;"><strong>English:</strong> Payment of <strong>{{amount}}</strong> to {{recipient_name}} was executed successfully on {{payment_date}} (reference {{payment_reference}}, method {{payment_method}}).</p>',
    ],
    text_he: [
      'אישור ביצוע תשלום',
      '',
      'שלום {{recipient_name}},',
      'התשלום בוצע בהצלחה.',
      '',
      'אסמכתא: {{payment_reference}}',
      'סכום: {{amount}}',
      'תאריך: {{payment_date}}',
      'אמצעי תשלום: {{payment_method}}',
    ],
    text_en: [
      '',
      'English:',
      'Payment of {{amount}} completed on {{payment_date}}.',
      'Reference: {{payment_reference}} · Method: {{payment_method}}',
    ],
  },

  // ── 5. VAT report ready ────────────────────────────────────────
  vat_report_ready: {
    name: 'vat_report_ready',
    category: 'tax',
    subject_he: 'דוח מע"מ לתקופה {{period}} מוכן לחתימה',
    subject_en: 'VAT report for {{period}} ready for approval',
    preheader_he: 'דוח המע"מ נוצר וממתין לבדיקה וחתימה',
    variables: ['period', 'total_sales', 'total_purchases', 'vat_due', 'submission_deadline'],
    body_he_html: [
      '<h2 style="color:#1f3a5f;margin:0 0 16px 0;">דוח מע"מ מוכן לחתימה</h2>',
      '<p>דוח המע"מ עבור תקופת הדיווח <strong>{{period}}</strong> נוצר במערכת וממתין לבדיקה וחתימה של מורשה החתימה.</p>',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7fa;border-radius:6px;margin:18px 0;">',
      '  <tr><td style="padding:14px 18px;"><div style="color:#6b7280;font-size:12px;">תקופת דיווח</div><div style="font-weight:bold;">{{period}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">מכירות חייבות</div><div>{{total_sales}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">רכישות מוכרות</div><div>{{total_purchases}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">מע"מ לתשלום</div><div style="font-weight:bold;color:#dc2626;font-size:18px;">{{vat_due}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">מועד אחרון לדיווח</div><div style="font-weight:bold;">{{submission_deadline}}</div></td></tr>',
      '</table>',
      '<p>לפני שליחה לרשות המיסים יש לוודא שכל החשבוניות סווגו וסומנו כנדרש.</p>',
    ],
    body_en_html: [
      '<hr style="border:none;border-top:1px dashed #d1d5db;margin:24px 0;">',
      '<p style="color:#6b7280;font-size:13px;"><strong>English:</strong> The VAT return for <strong>{{period}}</strong> is ready for review and signature. VAT due: <strong>{{vat_due}}</strong>. Submission deadline: {{submission_deadline}}.</p>',
    ],
    text_he: [
      'דוח מע"מ מוכן לחתימה',
      '',
      'תקופה: {{period}}',
      'מכירות: {{total_sales}}',
      'רכישות: {{total_purchases}}',
      'מע"מ לתשלום: {{vat_due}}',
      'מועד דיווח: {{submission_deadline}}',
    ],
    text_en: [
      '',
      'English:',
      'VAT return for {{period}} is ready.',
      'VAT due: {{vat_due}} · Deadline: {{submission_deadline}}',
    ],
  },

  // ── 6. Annual tax report ───────────────────────────────────────
  annual_tax_report: {
    name: 'annual_tax_report',
    category: 'tax',
    subject_he: 'דוח שנתי למס הכנסה לשנת {{tax_year}} מוכן',
    subject_en: 'Annual income-tax report for {{tax_year}} is ready',
    preheader_he: 'דוח שנתי מוכן לעיון ולחתימה',
    variables: ['tax_year', 'taxpayer_name', 'gross_income', 'total_tax', 'submission_deadline'],
    body_he_html: [
      '<h2 style="color:#1f3a5f;margin:0 0 16px 0;">דוח שנתי מוכן לעיון</h2>',
      '<p>שלום {{taxpayer_name}},</p>',
      '<p>הדוח השנתי למס הכנסה עבור שנת המס <strong>{{tax_year}}</strong> הושלם על ידי מערכת אוניקס וממתין לבדיקתך ולחתימתך.</p>',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7fa;border-radius:6px;margin:18px 0;">',
      '  <tr><td style="padding:14px 18px;"><div style="color:#6b7280;font-size:12px;">שנת מס</div><div style="font-weight:bold;">{{tax_year}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">הכנסה ברוטו</div><div>{{gross_income}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">חבות מס כוללת</div><div style="font-weight:bold;">{{total_tax}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">מועד הגשה</div><div style="font-weight:bold;color:#dc2626;">{{submission_deadline}}</div></td></tr>',
      '</table>',
      '<p>הדוח מצורף כקובץ PDF. יש לבדוק את הנתונים בקפידה לפני חתימה והגשה.</p>',
      '<p style="color:#6b7280;font-size:13px;">הערה: הדוח הוכן על בסיס הנתונים שהוזנו למערכת. באחריותך לוודא שלמות ונכונות הנתונים.</p>',
    ],
    body_en_html: [
      '<hr style="border:none;border-top:1px dashed #d1d5db;margin:24px 0;">',
      '<p style="color:#6b7280;font-size:13px;"><strong>English:</strong> The annual income-tax return for tax year <strong>{{tax_year}}</strong> is ready for your review. Gross income: {{gross_income}}. Total tax liability: <strong>{{total_tax}}</strong>. Filing deadline: {{submission_deadline}}.</p>',
    ],
    text_he: [
      'דוח שנתי למס הכנסה',
      '',
      'שלום {{taxpayer_name}},',
      'הדוח לשנת המס {{tax_year}} מוכן לחתימה.',
      '',
      'הכנסה ברוטו: {{gross_income}}',
      'חבות מס: {{total_tax}}',
      'מועד הגשה: {{submission_deadline}}',
    ],
    text_en: [
      '',
      'English:',
      'Annual tax return for {{tax_year}} is ready.',
      'Gross income: {{gross_income}} · Total tax: {{total_tax}}',
      'Filing deadline: {{submission_deadline}}',
    ],
  },

  // ── 7. PO approval needed ──────────────────────────────────────
  po_approval_needed: {
    name: 'po_approval_needed',
    category: 'procurement',
    subject_he: 'אישור נדרש: הזמנת רכש {{po_number}} על סך {{amount}}',
    subject_en: 'Approval needed: Purchase Order {{po_number}} for {{amount}}',
    preheader_he: 'הזמנת רכש ממתינה לאישורך',
    variables: ['approver_name', 'po_number', 'vendor_name', 'amount', 'requester_name', 'approval_url'],
    body_he_html: [
      '<h2 style="color:#1f3a5f;margin:0 0 16px 0;">הזמנת רכש ממתינה לאישור</h2>',
      '<p>שלום {{approver_name}},</p>',
      '<p>הזמנת רכש חדשה הוגשה על ידי <strong>{{requester_name}}</strong> וממתינה לאישורך בהתאם למדיניות האישורים של הארגון.</p>',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7fa;border-radius:6px;margin:18px 0;">',
      '  <tr><td style="padding:14px 18px;"><div style="color:#6b7280;font-size:12px;">מספר הזמנה</div><div style="font-weight:bold;">{{po_number}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">ספק</div><div>{{vendor_name}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">סכום</div><div style="font-weight:bold;">{{amount}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">מבקש</div><div>{{requester_name}}</div></td></tr>',
      '</table>',
      '<div style="text-align:center;margin:26px 0;">',
      '  <a href="{{approval_url}}" style="display:inline-block;background:#1f3a5f;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;">צפה ואשר הזמנה</a>',
      '</div>',
      '<p style="color:#6b7280;font-size:13px;">אם אינך אחראי לאישור הזמנה זו, אנא העבר את ההודעה לגורם המתאים.</p>',
    ],
    body_en_html: [
      '<hr style="border:none;border-top:1px dashed #d1d5db;margin:24px 0;">',
      '<p style="color:#6b7280;font-size:13px;"><strong>English:</strong> PO <strong>{{po_number}}</strong> from {{vendor_name}} (<strong>{{amount}}</strong>) was submitted by {{requester_name}} and is awaiting your approval. <a href="{{approval_url}}" style="color:#1f3a5f;">Review &amp; approve</a>.</p>',
    ],
    text_he: [
      'הזמנת רכש ממתינה לאישור',
      '',
      'שלום {{approver_name}},',
      'הזמנה {{po_number}} מ-{{vendor_name}} על סך {{amount}} ממתינה לאישורך.',
      'מבקש: {{requester_name}}',
      '',
      'לאישור: {{approval_url}}',
    ],
    text_en: [
      '',
      'English:',
      'PO {{po_number}} ({{vendor_name}}, {{amount}}) awaits your approval.',
      'Requester: {{requester_name}}',
      'Review: {{approval_url}}',
    ],
  },

  // ── 8. Low cash alert ──────────────────────────────────────────
  low_cash_alert: {
    name: 'low_cash_alert',
    category: 'treasury',
    subject_he: 'התראה: יתרת מזומנים נמוכה - {{current_balance}}',
    subject_en: 'Alert: Low cash balance — {{current_balance}}',
    preheader_he: 'יתרת המזומנים ירדה מתחת לרף ההתראה',
    variables: ['account_name', 'current_balance', 'threshold', 'as_of_date', 'upcoming_outflows'],
    body_he_html: [
      '<div style="background:#fee2e2;border-right:4px solid #dc2626;padding:14px 18px;border-radius:6px;margin-bottom:20px;">',
      '  <strong style="color:#991b1b;">התראת מלאי מזומנים</strong>',
      '</div>',
      '<h2 style="color:#1f3a5f;margin:0 0 16px 0;">יתרת המזומנים נמוכה</h2>',
      '<p>יתרת המזומנים בחשבון <strong>{{account_name}}</strong> ירדה מתחת לרף ההתראה שהוגדר במערכת.</p>',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7fa;border-radius:6px;margin:18px 0;">',
      '  <tr><td style="padding:14px 18px;"><div style="color:#6b7280;font-size:12px;">חשבון</div><div style="font-weight:bold;">{{account_name}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">יתרה נוכחית</div><div style="font-weight:bold;color:#dc2626;font-size:20px;">{{current_balance}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">רף התראה</div><div>{{threshold}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">תשלומים קרובים</div><div>{{upcoming_outflows}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">נכון לתאריך</div><div>{{as_of_date}}</div></td></tr>',
      '</table>',
      '<p>מומלץ לבחון העברת כספים או דחיית תשלומים לא קריטיים כדי להבטיח המשכיות תזרים המזומנים.</p>',
    ],
    body_en_html: [
      '<hr style="border:none;border-top:1px dashed #d1d5db;margin:24px 0;">',
      '<p style="color:#6b7280;font-size:13px;"><strong>English:</strong> Cash balance in <strong>{{account_name}}</strong> has dropped below the configured threshold. Current: <strong>{{current_balance}}</strong> (threshold {{threshold}}). Upcoming outflows: {{upcoming_outflows}}.</p>',
    ],
    text_he: [
      'התראה: יתרת מזומנים נמוכה',
      '',
      'חשבון: {{account_name}}',
      'יתרה נוכחית: {{current_balance}}',
      'רף התראה: {{threshold}}',
      'תשלומים קרובים: {{upcoming_outflows}}',
      'נכון לתאריך: {{as_of_date}}',
    ],
    text_en: [
      '',
      'English:',
      'Low cash alert on {{account_name}}.',
      'Current: {{current_balance}} · Threshold: {{threshold}}',
      'Upcoming outflows: {{upcoming_outflows}}',
    ],
  },

  // ── 9. Bank reconciliation completed ───────────────────────────
  bank_reconciliation_completed: {
    name: 'bank_reconciliation_completed',
    category: 'finance',
    subject_he: 'התאמת בנק {{account_name}} הסתיימה ל-{{period}}',
    subject_en: 'Bank reconciliation for {{account_name}} completed for {{period}}',
    preheader_he: 'תהליך התאמת הבנק הסתיים בהצלחה',
    variables: ['account_name', 'period', 'matched_count', 'unmatched_count', 'reconciled_balance'],
    body_he_html: [
      '<div style="background:#dcfce7;border-right:4px solid #16a34a;padding:14px 18px;border-radius:6px;margin-bottom:20px;">',
      '  <strong style="color:#166534;">התאמת בנק הסתיימה</strong>',
      '</div>',
      '<h2 style="color:#1f3a5f;margin:0 0 16px 0;">סיכום התאמה</h2>',
      '<p>תהליך התאמת הבנק לחשבון <strong>{{account_name}}</strong> לתקופה <strong>{{period}}</strong> הסתיים. להלן סיכום הממצאים:</p>',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7fa;border-radius:6px;margin:18px 0;">',
      '  <tr><td style="padding:14px 18px;"><div style="color:#6b7280;font-size:12px;">חשבון</div><div style="font-weight:bold;">{{account_name}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">תקופה</div><div>{{period}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">תנועות שהותאמו</div><div style="color:#16a34a;font-weight:bold;">{{matched_count}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">תנועות לא מותאמות</div><div style="color:#dc2626;font-weight:bold;">{{unmatched_count}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">יתרה מותאמת</div><div style="font-weight:bold;">{{reconciled_balance}}</div></td></tr>',
      '</table>',
      '<p>אם קיימות תנועות לא מותאמות, אנא היכנס למערכת לבדיקה ידנית.</p>',
    ],
    body_en_html: [
      '<hr style="border:none;border-top:1px dashed #d1d5db;margin:24px 0;">',
      '<p style="color:#6b7280;font-size:13px;"><strong>English:</strong> Bank reconciliation for <strong>{{account_name}}</strong> ({{period}}) is complete. Matched: {{matched_count}}, Unmatched: {{unmatched_count}}, Reconciled balance: {{reconciled_balance}}.</p>',
    ],
    text_he: [
      'התאמת בנק הסתיימה',
      '',
      'חשבון: {{account_name}}',
      'תקופה: {{period}}',
      'תנועות מותאמות: {{matched_count}}',
      'תנועות לא מותאמות: {{unmatched_count}}',
      'יתרה מותאמת: {{reconciled_balance}}',
    ],
    text_en: [
      '',
      'English:',
      'Reconciliation of {{account_name}} ({{period}}) completed.',
      'Matched: {{matched_count}} · Unmatched: {{unmatched_count}}',
      'Reconciled balance: {{reconciled_balance}}',
    ],
  },

  // ── 10. Failed payroll calculation ─────────────────────────────
  failed_payroll_calculation: {
    name: 'failed_payroll_calculation',
    category: 'payroll',
    subject_he: 'כשל בחישוב שכר לתקופה {{period}}',
    subject_en: 'Payroll calculation failed for {{period}}',
    preheader_he: 'תהליך חישוב השכר נכשל ודורש התערבות',
    variables: ['period', 'employee_count', 'failed_count', 'error_code', 'error_message'],
    body_he_html: [
      '<div style="background:#fee2e2;border-right:4px solid #dc2626;padding:14px 18px;border-radius:6px;margin-bottom:20px;">',
      '  <strong style="color:#991b1b;">כשל במערכת השכר</strong>',
      '</div>',
      '<h2 style="color:#1f3a5f;margin:0 0 16px 0;">תהליך חישוב השכר נכשל</h2>',
      '<p>תהליך חישוב השכר עבור תקופה <strong>{{period}}</strong> נכשל ודורש התערבות ידנית של צוות השכר.</p>',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7fa;border-radius:6px;margin:18px 0;">',
      '  <tr><td style="padding:14px 18px;"><div style="color:#6b7280;font-size:12px;">תקופה</div><div style="font-weight:bold;">{{period}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">סך עובדים</div><div>{{employee_count}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">עובדים שנכשלו</div><div style="color:#dc2626;font-weight:bold;">{{failed_count}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">קוד שגיאה</div><div style="font-family:monospace;">{{error_code}}</div></td></tr>',
      '  <tr><td style="padding:14px 18px;border-top:1px solid #e5e7eb;"><div style="color:#6b7280;font-size:12px;">הודעת שגיאה</div><div style="font-family:monospace;color:#991b1b;">{{error_message}}</div></td></tr>',
      '</table>',
      '<p><strong>נדרש לבדוק את יומני המערכת ולהפעיל מחדש את החישוב לאחר תיקון.</strong> עד לתיקון, לא יונפקו תלושים עבור התקופה הזו.</p>',
    ],
    body_en_html: [
      '<hr style="border:none;border-top:1px dashed #d1d5db;margin:24px 0;">',
      '<p style="color:#6b7280;font-size:13px;"><strong>English:</strong> Payroll calculation for <strong>{{period}}</strong> failed. {{failed_count}}/{{employee_count}} employees affected. Error: <code>{{error_code}}</code> — {{error_message}}. Manual intervention required.</p>',
    ],
    text_he: [
      'כשל בחישוב שכר',
      '',
      'תקופה: {{period}}',
      'סך עובדים: {{employee_count}}',
      'עובדים שנכשלו: {{failed_count}}',
      'קוד שגיאה: {{error_code}}',
      'הודעה: {{error_message}}',
      '',
      'נדרשת התערבות ידנית.',
    ],
    text_en: [
      '',
      'English:',
      'Payroll calculation failed for {{period}}.',
      'Failed: {{failed_count}}/{{employee_count}} · Error: {{error_code}}',
      'Message: {{error_message}}',
    ],
  },

});

// ───────────────────────────────────────────────────────────────
// Public render API
// ───────────────────────────────────────────────────────────────

/**
 * Render a single template by name.  Returns an object containing:
 *   - subject    : Hebrew subject (after variable substitution)
 *   - subject_en : English subject
 *   - html       : full HTML body (shell + branding + content)
 *   - text       : plain-text body
 *   - preheader  : hidden preview text
 *   - missing    : array of variable keys that were not supplied
 *   - name       : template name
 */
function renderTemplate(name, vars = {}) {
  const tpl = TEMPLATES[name];
  if (!tpl) {
    throw new Error(`[email-templates] unknown template: ${name}`);
  }

  const brand = Object.assign({}, DEFAULT_BRAND, vars.brand || {});
  const mergedVars = Object.assign({}, vars, { brand });
  const missing = [];

  function substHtml(str) {
    const r = replaceVariables(str, mergedVars, { escape: true });
    for (const m of r.missing) if (!missing.includes(m)) missing.push(m);
    return r.text;
  }
  function substText(str) {
    const r = replaceVariables(str, mergedVars, { escape: false });
    for (const m of r.missing) if (!missing.includes(m)) missing.push(m);
    return r.text;
  }

  const subject = substText(tpl.subject_he);
  const subject_en = substText(tpl.subject_en);
  const preheader = substText(tpl.preheader_he || '');

  const bodyHtmlParts = [];
  for (const block of tpl.body_he_html) bodyHtmlParts.push(substHtml(block));
  for (const block of tpl.body_en_html || []) bodyHtmlParts.push(substHtml(block));

  const html = buildHtmlShell({
    title: subject,
    preheader,
    bodyInnerHtml: bodyHtmlParts.join('\n'),
    brand,
    footerHtml: buildFooterHtml(brand),
  });

  const textLines = [];
  for (const line of tpl.text_he) textLines.push(substText(line));
  for (const line of tpl.text_en || []) textLines.push(substText(line));
  textLines.push(buildPlainFooter(brand));
  const text = textLines.join('\n');

  return {
    name,
    subject,
    subject_en,
    preheader,
    html,
    text,
    missing,
    category: tpl.category,
  };
}

/**
 * List all known templates (name, subjects, declared variables).  Used by
 * the test suite and documentation generator.
 */
function listTemplates() {
  return Object.keys(TEMPLATES).map((name) => {
    const t = TEMPLATES[name];
    return {
      name,
      category: t.category,
      subject_he: t.subject_he,
      subject_en: t.subject_en,
      variables: t.variables.slice(),
    };
  });
}

/**
 * Return a deep-frozen clone of the descriptor for inspection.
 */
function getTemplate(name) {
  const t = TEMPLATES[name];
  if (!t) return null;
  return JSON.parse(JSON.stringify(t));
}

/**
 * Render every template with the same vars — used to generate preview HTML.
 */
function renderAll(vars = {}) {
  const out = {};
  for (const name of Object.keys(TEMPLATES)) {
    out[name] = renderTemplate(name, vars);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────
// Public surface
// ───────────────────────────────────────────────────────────────
module.exports = {
  renderTemplate,
  listTemplates,
  getTemplate,
  renderAll,
  escapeHtml,
  replaceVariables,
  formatCurrency,
  DEFAULT_BRAND,
  TEMPLATES,
  // Internal helpers exposed for tests only
  _internal: {
    buildHtmlShell,
    buildFooterHtml,
    buildPlainFooter,
    resolvePath,
  },
};
