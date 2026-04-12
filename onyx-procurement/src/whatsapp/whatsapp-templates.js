// Agent 74 — WhatsApp Business Templates (Meta Cloud API format)
// ---------------------------------------------------------------
// All templates here follow Meta's official template schema:
//   https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
//
// IMPORTANT: every template must be submitted via Meta WhatsApp Manager
// and APPROVED before it can be used in production. Until approval the
// template "status" is PENDING and send attempts will be rejected by
// the Cloud API with error 132001 (template does not exist).
//
// Variables use {{1}}, {{2}}, ... placeholders. Params passed to
// `sendTemplate()` are substituted in order.
//
// Rule: never delete a template. If a template is deprecated mark
// `deprecated: true` so operators still see audit history.

'use strict';

const TEMPLATES = {
  // ---------------------------------------------------------------
  // 1. Wage slip ready — sent to an employee when a new pay slip
  //    is generated in the payroll module.
  //    {{1}} = employee name
  //    {{2}} = month (e.g. "מרץ 2026")
  //    {{3}} = net amount in NIS
  //    {{4}} = signed URL to the PDF slip
  // ---------------------------------------------------------------
  wage_slip_ready: {
    name: 'wage_slip_ready',
    language: 'he',
    category: 'UTILITY',
    components: [
      { type: 'HEADER', text: 'תלוש שכר חדש' },
      {
        type: 'BODY',
        text: 'שלום {{1}}, התלוש לחודש {{2}} מוכן. סכום נטו: {{3}} ₪',
      },
      { type: 'FOOTER', text: 'טכנו-קול עוזי' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'צפה בתלוש', url: '{{4}}' },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------
  // 2. Invoice reminder — nudges a customer whose invoice is due
  //    soon or already overdue.
  //    {{1}} = customer name
  //    {{2}} = invoice number
  //    {{3}} = amount in NIS
  //    {{4}} = due date (DD/MM/YYYY)
  //    {{5}} = payment URL
  // ---------------------------------------------------------------
  invoice_reminder: {
    name: 'invoice_reminder',
    language: 'he',
    category: 'UTILITY',
    components: [
      { type: 'HEADER', text: 'תזכורת תשלום' },
      {
        type: 'BODY',
        text:
          'שלום {{1}}, תזכורת ידידותית: חשבונית מס׳ {{2}} על סך {{3}} ₪ ' +
          'ממתינה לתשלום עד {{4}}. נשמח אם תטפלו בהקדם.',
      },
      { type: 'FOOTER', text: 'טכנו-קול עוזי — מחלקת גבייה' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'לתשלום מקוון', url: '{{5}}' },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------
  // 3. Payment received — thanks a customer once their payment
  //    has cleared.
  //    {{1}} = customer name
  //    {{2}} = amount received
  //    {{3}} = invoice / receipt number
  // ---------------------------------------------------------------
  payment_received: {
    name: 'payment_received',
    language: 'he',
    category: 'UTILITY',
    components: [
      { type: 'HEADER', text: 'תודה על התשלום' },
      {
        type: 'BODY',
        text:
          'שלום {{1}}, קיבלנו את התשלום שלכם בסך {{2}} ₪. ' +
          'אסמכתא: {{3}}. מעריכים את הפרעון המהיר.',
      },
      { type: 'FOOTER', text: 'טכנו-קול עוזי' },
    ],
  },

  // ---------------------------------------------------------------
  // 4. PO status update — notifies a supplier that the status of
  //    one of their purchase orders has changed.
  //    {{1}} = supplier name
  //    {{2}} = PO number
  //    {{3}} = new status (e.g. "אושר", "בייצור", "נשלח")
  //    {{4}} = tracking / portal URL
  // ---------------------------------------------------------------
  po_status_update: {
    name: 'po_status_update',
    language: 'he',
    category: 'UTILITY',
    components: [
      { type: 'HEADER', text: 'עדכון הזמנת רכש' },
      {
        type: 'BODY',
        text:
          'שלום {{1}}, הזמנת הרכש {{2}} שונתה לסטטוס: {{3}}. ' +
          'תוכלו לראות פרטים מלאים בפורטל הספקים.',
      },
      { type: 'FOOTER', text: 'טכנו-קול עוזי — רכש' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'פתח בפורטל', url: '{{4}}' },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------
  // 5. Appointment reminder — reminds a recipient of an upcoming
  //    meeting / appointment / inspection.
  //    {{1}} = recipient name
  //    {{2}} = date (DD/MM/YYYY)
  //    {{3}} = time (HH:mm)
  //    {{4}} = location / address
  // ---------------------------------------------------------------
  appointment_reminder: {
    name: 'appointment_reminder',
    language: 'he',
    category: 'UTILITY',
    components: [
      { type: 'HEADER', text: 'תזכורת לפגישה' },
      {
        type: 'BODY',
        text:
          'שלום {{1}}, תזכורת לפגישה שלך בתאריך {{2}} בשעה {{3}}. ' +
          'מיקום: {{4}}. נשמח אם תאשרו הגעה.',
      },
      { type: 'FOOTER', text: 'טכנו-קול עוזי' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'מאשר הגעה' },
          { type: 'QUICK_REPLY', text: 'לא אוכל להגיע' },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------
  // 6. Urgent action needed — high-priority alert to managers.
  //    This is an ALERT_UPDATE utility template, NOT marketing.
  //    {{1}} = manager name
  //    {{2}} = subject (e.g. "חריגה בתקציב פרוייקט 442")
  //    {{3}} = short description
  //    {{4}} = dashboard URL
  // ---------------------------------------------------------------
  urgent_action_needed: {
    name: 'urgent_action_needed',
    language: 'he',
    category: 'UTILITY',
    components: [
      { type: 'HEADER', text: 'התראה דחופה' },
      {
        type: 'BODY',
        text:
          'שלום {{1}}, נדרשת פעולה דחופה: {{2}}. ' +
          'פרטים: {{3}}. נא לטפל מיידית.',
      },
      { type: 'FOOTER', text: 'טכנו-קול עוזי — מערכת התראות' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'פתח במערכת', url: '{{4}}' },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/**
 * Return a template object by name.
 * @param {string} name
 * @returns {object|null}
 */
function getTemplate(name) {
  if (!name || typeof name !== 'string') return null;
  return TEMPLATES[name] || null;
}

/**
 * List all known template names (including deprecated ones — we
 * never delete them, only mark).
 * @returns {string[]}
 */
function listTemplates() {
  return Object.keys(TEMPLATES);
}

/**
 * Count the number of {{n}} placeholders in a template BODY
 * plus any parametric BUTTONS (URL buttons). Used by
 * send-whatsapp.js to validate caller params.
 * @param {object} template
 * @returns {number}
 */
function countPlaceholders(template) {
  if (!template || !Array.isArray(template.components)) return 0;
  let max = 0;
  const scan = (text) => {
    if (typeof text !== 'string') return;
    const re = /\{\{(\d+)\}\}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const idx = parseInt(m[1], 10);
      if (idx > max) max = idx;
    }
  };
  for (const c of template.components) {
    scan(c.text);
    if (Array.isArray(c.buttons)) {
      for (const b of c.buttons) {
        scan(b.url);
        scan(b.text);
      }
    }
  }
  return max;
}

/**
 * Render a template into the exact JSON payload required by the
 * WhatsApp Cloud API `messages` endpoint. Positional params map
 * 1:1 to {{1}}, {{2}}, ... in the template BODY. If the template
 * also has a URL button with a variable, pass it as the LAST
 * parameter — the function will route it to the buttons section.
 *
 * @param {string} templateName
 * @param {string} toPhoneNumberE164 recipient in E.164 (e.g. "972501234567")
 * @param {Array<string|number>} params
 * @returns {object} ready-to-POST payload
 */
function renderTemplatePayload(templateName, toPhoneNumberE164, params = []) {
  const tpl = getTemplate(templateName);
  if (!tpl) {
    throw new Error(`whatsapp: unknown template "${templateName}"`);
  }

  // Split params into body params and button params based on
  // whether a URL button with variable is defined.
  const bodyComponent = tpl.components.find((c) => c.type === 'BODY');
  const buttonsComponent = tpl.components.find((c) => c.type === 'BUTTONS');

  const bodyPlaceholders = bodyComponent
    ? countPlaceholders({ components: [bodyComponent] })
    : 0;

  const urlButtonIdxs = [];
  if (buttonsComponent && Array.isArray(buttonsComponent.buttons)) {
    buttonsComponent.buttons.forEach((b, idx) => {
      if (b.type === 'URL' && typeof b.url === 'string' && b.url.includes('{{')) {
        urlButtonIdxs.push(idx);
      }
    });
  }

  const bodyParams = params.slice(0, bodyPlaceholders);
  const buttonParams = params.slice(bodyPlaceholders);

  if (bodyParams.length !== bodyPlaceholders) {
    throw new Error(
      `whatsapp: template "${templateName}" expects ${bodyPlaceholders} body params, got ${bodyParams.length}`
    );
  }
  if (buttonParams.length !== urlButtonIdxs.length) {
    throw new Error(
      `whatsapp: template "${templateName}" expects ${urlButtonIdxs.length} URL-button params, got ${buttonParams.length}`
    );
  }

  const components = [];
  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((v) => ({ type: 'text', text: String(v) })),
    });
  }
  urlButtonIdxs.forEach((btnIdx, i) => {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(btnIdx),
      parameters: [{ type: 'text', text: String(buttonParams[i]) }],
    });
  });

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhoneNumberE164,
    type: 'template',
    template: {
      name: tpl.name,
      language: { code: tpl.language },
      components,
    },
  };
}

module.exports = {
  TEMPLATES,
  getTemplate,
  listTemplates,
  countPlaceholders,
  renderTemplatePayload,
};
