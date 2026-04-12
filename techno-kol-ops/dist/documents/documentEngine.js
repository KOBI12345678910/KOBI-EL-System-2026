"use strict";
// ════════════════════════════════════════════════════════════
//
//   DOCUMENT ENGINE
//   יצירת מסמכים אוטומטית — הצעות מחיר, חוזים, חשבוניות
//
// ════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentEngine = void 0;
const connection_1 = require("../db/connection");
exports.documentEngine = {
    // ── הצעת מחיר מלאה
    async generateQuote(orderId) {
        const { rows } = await (0, connection_1.query)(`
      SELECT wo.*, c.name as client_name, c.phone as client_phone,
        c.address as client_address, c.email as client_email
      FROM work_orders wo
      JOIN clients c ON wo.client_id = c.id
      WHERE wo.id = $1
    `, [orderId]);
        const o = rows[0];
        if (!o)
            throw new Error('Order not found');
        const date = new Date().toLocaleDateString('he-IL');
        const validUntil = new Date(Date.now() + 14 * 86400000).toLocaleDateString('he-IL');
        const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 40px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #1a1a1a; }
  .company-name { font-size: 28px; font-weight: 900; letter-spacing: 0.05em; }
  .company-sub { font-size: 12px; color: #666; margin-top: 4px; }
  .doc-title { font-size: 20px; font-weight: 700; text-align: left; }
  .doc-meta { font-size: 11px; color: #666; text-align: left; margin-top: 4px; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #666; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .field-label { font-size: 11px; color: #999; margin-bottom: 2px; }
  .field-value { font-size: 14px; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a1a1a; color: #fff; padding: 10px 14px; font-size: 12px; text-align: right; }
  td { padding: 10px 14px; border-bottom: 1px solid #eee; font-size: 13px; }
  .total-row td { font-weight: 700; font-size: 16px; background: #f9f9f9; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; }
  .signature-box { border: 1px solid #ccc; height: 80px; width: 200px; display: inline-block; margin-top: 20px; }
  .bank-details { background: #f5f5f5; padding: 16px; border-right: 3px solid #1a1a1a; font-size: 12px; line-height: 2; }
  .valid-badge { background: #1a1a1a; color: #fff; padding: 4px 12px; font-size: 11px; display: inline-block; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="company-name">TECHNO-KOL</div>
    <div class="company-sub">טכנו-קול עוזי בע"מ | מסגרות ברזל ואלומיניום</div>
    <div class="company-sub">ח.פ. 515XXXXXXX | רחוב המלאכה 12, תל אביב</div>
    <div class="company-sub">052-XXXXXXX | info@techno-kol.co.il</div>
  </div>
  <div style="text-align:left">
    <div class="doc-title">הצעת מחיר</div>
    <div class="doc-meta">מספר: ${o.id}</div>
    <div class="doc-meta">תאריך: ${date}</div>
    <div class="doc-meta">
      <span class="valid-badge">בתוקף עד: ${validUntil}</span>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">פרטי לקוח</div>
  <div class="grid-2">
    <div>
      <div class="field-label">שם לקוח</div>
      <div class="field-value">${o.client_name}</div>
    </div>
    <div>
      <div class="field-label">טלפון</div>
      <div class="field-value">${o.client_phone || '—'}</div>
    </div>
    <div>
      <div class="field-label">כתובת</div>
      <div class="field-value">${o.client_address || '—'}</div>
    </div>
    <div>
      <div class="field-label">דוא"ל</div>
      <div class="field-value">${o.client_email || '—'}</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">פרטי העבודה</div>
  <table>
    <thead>
      <tr>
        <th>תיאור</th>
        <th>חומר</th>
        <th>כמות</th>
        <th>יחידה</th>
        <th>מחיר ליחידה</th>
        <th>סה"כ</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${o.product}</td>
        <td>${o.material_primary}</td>
        <td>${o.quantity || 1}</td>
        <td>${o.unit || 'יח׳'}</td>
        <td>₪${o.quantity > 0 ? Math.round(parseFloat(o.price) / o.quantity).toLocaleString('he-IL') : parseFloat(o.price).toLocaleString('he-IL')}</td>
        <td>₪${parseFloat(o.price).toLocaleString('he-IL')}</td>
      </tr>
      ${o.description ? `<tr><td colspan="6" style="color:#666;font-size:12px;font-style:italic">${o.description}</td></tr>` : ''}
    </tbody>
    <tfoot>
      <tr><td colspan="4"></td><td>מע"מ (18%)</td><td>₪${Math.round(parseFloat(o.price) * 0.18).toLocaleString('he-IL')}</td></tr>
      <tr class="total-row"><td colspan="4"></td><td>סה"כ כולל מע"מ</td><td>₪${Math.round(parseFloat(o.price) * 1.18).toLocaleString('he-IL')}</td></tr>
    </tfoot>
  </table>
</div>

<div class="section">
  <div class="section-title">תנאי תשלום</div>
  <div class="bank-details">
    <strong>50% מקדמה בחתימת הסכם | 50% בסיום ומסירה</strong><br>
    בנק לאומי | סניף 800 | חשבון: 12345678<br>
    שם: טכנו-קול עוזי בע"מ
  </div>
</div>

<div class="section">
  <div class="section-title">אישור הצעה</div>
  <div>
    <p style="font-size:12px;margin-bottom:20px">
      אני החתום מטה מאשר כי קראתי והבנתי את תנאי הצעת המחיר ומאשר לבצע את העבודה.
    </p>
    <div style="display:flex;gap:60px;align-items:flex-end">
      <div>
        <div class="signature-box"></div>
        <div style="font-size:11px;color:#999;margin-top:6px">חתימת הלקוח ותאריך</div>
      </div>
      <div>
        <div class="signature-box"></div>
        <div style="font-size:11px;color:#999;margin-top:6px">חתימת החברה ותאריך</div>
      </div>
    </div>
  </div>
</div>

<div class="footer">
  <p>טכנו-קול עוזי בע"מ מתחייבת לאיכות עבודה מעולה ועמידה בלוחות הזמנים המוסכמים.</p>
  <p>הצעה זו בתוקף ל-14 יום מתאריך הנפקתה. לשאלות: 052-XXXXXXX</p>
</div>

</body>
</html>`;
        return html;
    },
    // ── חשבונית מס
    async generateInvoice(projectId, amount, invoiceType) {
        const { rows } = await (0, connection_1.query)(`
      SELECT p.*, c.name as client_name, c.phone, c.address, c.email,
        c.id as client_vat_id
      FROM projects p JOIN clients c ON p.client_id = c.id
      WHERE p.id = $1
    `, [projectId]);
        const p = rows[0];
        if (!p)
            throw new Error('Project not found');
        const invoiceNum = `INV-${Date.now().toString().slice(-6)}`;
        const date = new Date().toLocaleDateString('he-IL');
        const vatAmount = Math.round(amount * 0.18);
        const total = amount + vatAmount;
        const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 40px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 4px solid #000; }
  .company-name { font-size: 32px; font-weight: 900; }
  .invoice-badge { background: #000; color: #fff; padding: 8px 20px; font-size: 18px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th { background: #000; color: #fff; padding: 12px; font-size: 12px; }
  td { padding: 12px; border-bottom: 1px solid #eee; }
  .total-section { background: #f5f5f5; padding: 20px; margin-top: 20px; }
  .total-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
  .grand-total { font-size: 22px; font-weight: 900; border-top: 2px solid #000; padding-top: 10px; margin-top: 10px; }
  .stamp { border: 3px solid #000; border-radius: 50%; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 10px; font-weight: 700; float: left; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="company-name">TECHNO-KOL</div>
    <div style="font-size:12px;color:#666;margin-top:4px">טכנו-קול עוזי בע"מ | ח.פ. 515XXXXXXX</div>
    <div style="font-size:12px;color:#666">רחוב המלאכה 12, תל אביב | 052-XXXXXXX</div>
  </div>
  <div style="text-align:left">
    <div class="invoice-badge">חשבונית מס ${invoiceType === 'advance' ? 'מקדמה' : 'סופית'}</div>
    <div style="font-size:12px;margin-top:8px">מספר: ${invoiceNum}</div>
    <div style="font-size:12px">תאריך: ${date}</div>
  </div>
</div>

<div style="margin-bottom:24px">
  <div style="font-size:11px;color:#999;margin-bottom:4px">חשבונית עבור:</div>
  <div style="font-size:18px;font-weight:700">${p.client_name}</div>
  <div style="font-size:12px;color:#666">${p.address || ''}</div>
</div>

<table>
  <thead>
    <tr><th>תיאור</th><th>כמות</th><th>מחיר</th><th>סה"כ</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>${invoiceType === 'advance' ? 'מקדמה 50%' : 'יתרת תשלום 50%'} — ${p.title}</td>
      <td>1</td>
      <td>₪${amount.toLocaleString('he-IL')}</td>
      <td>₪${amount.toLocaleString('he-IL')}</td>
    </tr>
  </tbody>
</table>

<div class="total-section">
  <div class="total-row"><span>סכום לפני מע"מ</span><span>₪${amount.toLocaleString('he-IL')}</span></div>
  <div class="total-row"><span>מע"מ 18%</span><span>₪${vatAmount.toLocaleString('he-IL')}</span></div>
  <div class="total-row grand-total"><span>סה"כ לתשלום</span><span>₪${total.toLocaleString('he-IL')}</span></div>
</div>

<div style="margin-top:32px;display:flex;justify-content:space-between;align-items:flex-end">
  <div style="font-size:12px;color:#666;line-height:1.8">
    <strong>פרטי בנק להעברה:</strong><br>
    בנק לאומי | סניף 800<br>
    חשבון: 12345678<br>
    שם: טכנו-קול עוזי בע"מ
  </div>
  <div class="stamp">
    טכנו-קול<br>עוזי בע"מ<br>✓
  </div>
</div>

</body>
</html>`;
        // שמור בDB
        await (0, connection_1.query)(`
      INSERT INTO generated_documents (project_id, type, content, invoice_number, amount, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [projectId, `invoice_${invoiceType}`, html, invoiceNum, total]);
        return html;
    },
    // ── חוזה בסיסי
    async generateContract(projectId) {
        const { rows } = await (0, connection_1.query)(`
      SELECT p.*, c.name as client_name, c.phone, c.address, c.id_number
      FROM projects p JOIN clients c ON p.client_id = c.id
      WHERE p.id = $1
    `, [projectId]);
        const p = rows[0];
        const date = new Date().toLocaleDateString('he-IL');
        const deliveryDate = p.installation_date
            ? new Date(p.installation_date).toLocaleDateString('he-IL')
            : '________________';
        const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Times New Roman', serif; color: #000; padding: 60px; font-size: 14px; line-height: 1.8; }
  h1 { text-align: center; font-size: 22px; margin-bottom: 8px; }
  h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin: 24px 0; }
  .party-box { border: 1px solid #000; padding: 16px; }
  .party-title { font-weight: 700; margin-bottom: 8px; font-size: 13px; }
  p { margin-bottom: 12px; }
  .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 60px; }
  .sig-line { border-bottom: 1px solid #000; height: 40px; margin-bottom: 6px; }
  .sig-label { font-size: 12px; color: #666; }
</style>
</head>
<body>

<h1>הסכם לביצוע עבודות מסגרות</h1>
<p style="text-align:center;color:#666">שנערך ונחתם ב-${date}</p>

<h2>בין הצדדים:</h2>
<div class="parties">
  <div class="party-box">
    <div class="party-title">המזמין (הלקוח)</div>
    <div>שם: ${p.client_name}</div>
    <div>כתובת: ${p.address || '________________'}</div>
    <div>טלפון: ${p.phone || '________________'}</div>
  </div>
  <div class="party-box">
    <div class="party-title">הקבלן (טכנו-קול)</div>
    <div>שם: טכנו-קול עוזי בע"מ</div>
    <div>ח.פ.: 515XXXXXXX</div>
    <div>כתובת: רחוב המלאכה 12, תל אביב</div>
    <div>טלפון: 052-XXXXXXX</div>
  </div>
</div>

<h2>סעיף 1 — מהות ההתקשרות</h2>
<p>המזמין מזמין מהקבלן, והקבלן מתחייב לספק ולהתקין את עבודות המסגרות הבאות:</p>
<p><strong>${p.title}</strong></p>
<p>בכתובת: ${p.address}</p>

<h2>סעיף 2 — המחיר ותנאי תשלום</h2>
<p>התמורה הכוללת עבור ביצוע העבודה הינה: <strong>₪${parseFloat(p.total_price).toLocaleString('he-IL')} (כולל מע"מ)</strong></p>
<p>תנאי תשלום:</p>
<p>א. 50% מקדמה בחתימת הסכם זה — ₪${Math.round(parseFloat(p.total_price) * 0.5).toLocaleString('he-IL')}</p>
<p>ב. 50% יתרה בסיום ההתקנה ומסירה — ₪${Math.round(parseFloat(p.total_price) * 0.5).toLocaleString('he-IL')}</p>

<h2>סעיף 3 — לוח זמנים</h2>
<p>הקבלן מתחייב להשלים את העבודה ולמוסרה עד: <strong>${deliveryDate}</strong></p>
<p>איחור של מעל 14 ימי עבודה יזכה את המזמין בפיצוי של 0.5% מהתמורה לכל שבוע איחור, עד לתקרה של 5%.</p>

<h2>סעיף 4 — אחריות</h2>
<p>הקבלן מעניק אחריות לתקינות העבודה לתקופה של <strong>24 חודשים</strong> ממועד ההתקנה.</p>
<p>האחריות אינה חלה על נזקים שנגרמו עקב שימוש לרעה, רשלנות המזמין, או כח עליון.</p>

<h2>סעיף 5 — שינויים</h2>
<p>כל שינוי בהיקף העבודה יבוצע בהסכמה מראש ובכתב ועשוי לשנות את המחיר ולוח הזמנים.</p>

<h2>סעיף 6 — ברירת דין וסמכות שיפוט</h2>
<p>על הסכם זה יחול הדין הישראלי. סמכות השיפוט הבלעדית תהיה לבתי המשפט בתל אביב.</p>

<div class="signature-section">
  <div>
    <div class="sig-line"></div>
    <div class="sig-label">חתימת המזמין ותאריך</div>
    <div style="margin-top:8px;font-size:12px">${p.client_name}</div>
  </div>
  <div>
    <div class="sig-line"></div>
    <div class="sig-label">חתימת הקבלן ותאריך</div>
    <div style="margin-top:8px;font-size:12px">טכנו-קול עוזי בע"מ</div>
  </div>
</div>

</body>
</html>`;
        await (0, connection_1.query)(`
      INSERT INTO generated_documents (project_id, type, content, created_at)
      VALUES ($1, 'contract', $2, NOW())
    `, [projectId, html]);
        return html;
    }
};
