// ===== מנוע יצירת PDF - טכנו כל עוזי =====
// מייצר מסמכי PDF מקצועיים בעברית RTL לכל סוגי המסמכים במערכת
// כולל: הצעות מחיר, חשבוניות, קבלות, תעודות משלוח, חוזים, הזמנות עבודה ועוד

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";
import { VAT_RATE } from "../constants";

const router = Router();

// ===== אתחול טבלאות ותבניות =====
router.post("/pdf-generator/init", async (_req: Request, res: Response) => {
  try {
    // יצירת טבלת תבניות PDF
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pdf_templates (
        id SERIAL PRIMARY KEY,
        template_code VARCHAR(100) UNIQUE,
        template_name VARCHAR(255),
        template_name_he VARCHAR(255),
        document_type VARCHAR(100) NOT NULL,
        html_template TEXT NOT NULL,
        css_styles TEXT,
        header_html TEXT,
        footer_html TEXT,
        variables JSONB DEFAULT '[]',
        page_size VARCHAR(20) DEFAULT 'A4',
        orientation VARCHAR(20) DEFAULT 'portrait',
        margin_top INTEGER DEFAULT 20,
        margin_bottom INTEGER DEFAULT 20,
        margin_left INTEGER DEFAULT 15,
        margin_right INTEGER DEFAULT 15,
        logo_url TEXT,
        company_details JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        version INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // יצירת טבלת מסמכים שנוצרו
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pdf_generated (
        id SERIAL PRIMARY KEY,
        template_id INTEGER REFERENCES pdf_templates(id),
        document_type VARCHAR(100),
        reference_id INTEGER,
        reference_number VARCHAR(100),
        title VARCHAR(500),
        generated_for VARCHAR(255),
        generated_for_email VARCHAR(255),
        variables_used JSONB DEFAULT '{}',
        file_url TEXT,
        file_size INTEGER,
        sent_via VARCHAR(50),
        sent_at TIMESTAMPTZ,
        opened_at TIMESTAMPTZ,
        signed BOOLEAN DEFAULT false,
        signed_at TIMESTAMPTZ,
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ===== סגנון CSS משותף לכל התבניות =====
    const sharedCSS = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'David', 'Arial', sans-serif; direction: rtl; text-align: right; color: #1a1a1a; font-size: 13px; line-height: 1.6; }
      .document-container { width: 100%; max-width: 210mm; margin: 0 auto; padding: 15mm; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3a5f; padding-bottom: 15px; margin-bottom: 20px; }
      .logo-section { text-align: right; }
      .logo-section img { max-height: 60px; }
      .company-name { font-size: 24px; font-weight: bold; color: #1e3a5f; }
      .company-subtitle { font-size: 11px; color: #666; }
      .document-title { text-align: center; font-size: 22px; font-weight: bold; color: #1e3a5f; margin: 15px 0; padding: 10px; background: #f0f7ff; border-radius: 5px; }
      .document-number { text-align: center; font-size: 14px; color: #0ea5e9; margin-bottom: 15px; }
      .info-section { display: flex; justify-content: space-between; margin-bottom: 20px; }
      .info-block { width: 48%; background: #fafafa; padding: 12px; border-radius: 5px; border: 1px solid #e0e0e0; }
      .info-block h3 { color: #1e3a5f; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
      .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
      .info-label { color: #666; font-weight: bold; }
      .items-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
      .items-table th { background: #1e3a5f; color: white; padding: 10px 8px; font-size: 12px; text-align: right; }
      .items-table td { padding: 8px; border-bottom: 1px solid #e0e0e0; font-size: 12px; text-align: right; }
      .items-table tr:nth-child(even) { background: #f9f9f9; }
      .items-table .number-col { text-align: left; direction: ltr; }
      .totals-section { width: 45%; margin-right: auto; margin-top: 10px; }
      .total-row { display: flex; justify-content: space-between; padding: 6px 10px; font-size: 13px; }
      .total-row.grand-total { background: #1e3a5f; color: white; font-size: 16px; font-weight: bold; border-radius: 5px; margin-top: 5px; }
      .total-row.vat-row { color: #666; }
      .terms-section { margin-top: 20px; padding: 12px; background: #fff9e6; border: 1px solid #ffe0a0; border-radius: 5px; }
      .terms-section h3 { color: #1e3a5f; margin-bottom: 8px; font-size: 13px; }
      .terms-section ul { padding-right: 20px; font-size: 11px; }
      .signature-section { display: flex; justify-content: space-between; margin-top: 40px; }
      .signature-block { width: 45%; text-align: center; }
      .signature-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 5px; font-size: 12px; }
      .footer { text-align: center; margin-top: 30px; padding-top: 10px; border-top: 2px solid #1e3a5f; font-size: 10px; color: #888; }
      .accent { color: #0ea5e9; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 10px; }
      .badge-paid { background: #d4edda; color: #155724; }
      .badge-pending { background: #fff3cd; color: #856404; }
    `;

    // ===== כותרת עליונה משותפת =====
    const sharedHeader = `
      <div class="header">
        <div class="logo-section">
          <div class="company-name">טכנו כל עוזי</div>
          <div class="company-subtitle">TechnoKoluzi - שערים, מעקות ופרגולות בהתאמה אישית</div>
          <div class="company-subtitle">ח.פ. 514832576 | עוסק מורשה</div>
        </div>
        <div style="text-align:left; font-size:11px; color:#666;">
          <div>{{company_phone}}</div>
          <div>{{company_email}}</div>
          <div>{{company_address}}</div>
        </div>
      </div>
    `;

    // ===== כותרת תחתונה משותפת =====
    const sharedFooter = `
      <div class="footer">
        <div>טכנו כל עוזי | {{company_phone}} | {{company_email}} | {{company_address}}</div>
        <div style="margin-top:3px;">מסמך זה הופק אוטומטית ע"י מערכת TechnoKoluzi ERP</div>
      </div>
    `;

    // ===== פרטי חברה ברירת מחדל =====
    const companyDetails = {
      name: "טכנו כל עוזי",
      name_en: "TechnoKoluzi",
      tax_id: "514832576",
      phone: "050-1234567",
      email: "info@technokoluzi.co.il",
      address: "אזור תעשייה, ישראל",
      bank_name: "בנק לאומי",
      bank_branch: "123",
      bank_account: "456789"
    };

    // ===== תבנית 1: הצעת מחיר =====
    const priceQuoteHTML = `
      <div class="document-container">
        ${sharedHeader}
        <div class="document-title">הצעת מחיר</div>
        <div class="document-number">מספר הצעה: {{quote_number}} | תאריך: {{date}} | תוקף: {{validity_days}} ימים</div>

        <div class="info-section">
          <div class="info-block">
            <h3>פרטי לקוח</h3>
            <div class="info-row"><span class="info-label">שם:</span><span>{{customer_name}}</span></div>
            <div class="info-row"><span class="info-label">טלפון:</span><span>{{customer_phone}}</span></div>
            <div class="info-row"><span class="info-label">דוא"ל:</span><span>{{customer_email}}</span></div>
            <div class="info-row"><span class="info-label">כתובת:</span><span>{{customer_address}}</span></div>
          </div>
          <div class="info-block">
            <h3>פרטי סוכן</h3>
            <div class="info-row"><span class="info-label">שם:</span><span>{{agent_name}}</span></div>
            <div class="info-row"><span class="info-label">טלפון:</span><span>{{agent_phone}}</span></div>
            <div class="info-row"><span class="info-label">מזהה פרויקט:</span><span>{{project_id}}</span></div>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width:5%">#</th>
              <th style="width:25%">פריט</th>
              <th style="width:25%">תיאור</th>
              <th style="width:8%">כמות</th>
              <th style="width:8%">יחידה</th>
              <th style="width:14%" class="number-col">מחיר יחידה</th>
              <th style="width:15%" class="number-col">סה"כ</th>
            </tr>
          </thead>
          <tbody>
            {{#items}}
            <tr>
              <td>{{index}}</td>
              <td>{{item_name}}</td>
              <td>{{description}}</td>
              <td>{{qty}}</td>
              <td>{{unit}}</td>
              <td class="number-col">₪{{unit_price}}</td>
              <td class="number-col">₪{{line_total}}</td>
            </tr>
            {{/items}}
          </tbody>
        </table>

        <div class="totals-section">
          <div class="total-row"><span>סכום ביניים:</span><span class="number-col">₪{{subtotal}}</span></div>
          <div class="total-row"><span>הנחה ({{discount_percent}}%):</span><span class="number-col">-₪{{discount_amount}}</span></div>
          <div class="total-row"><span>סכום לפני מע"מ:</span><span class="number-col">₪{{before_vat}}</span></div>
          <div class="total-row vat-row"><span>מע"מ (17%):</span><span class="number-col">₪{{vat_amount}}</span></div>
          <div class="total-row grand-total"><span>סה"כ לתשלום:</span><span class="number-col">₪{{grand_total}}</span></div>
        </div>

        <div class="terms-section">
          <h3>תנאים והערות</h3>
          <ul>
            <li>תוקף ההצעה: {{validity_days}} ימים מתאריך ההנפקה</li>
            <li>תנאי תשלום: {{payment_terms}}</li>
            <li>זמן אספקה משוער: {{delivery_time}}</li>
            <li>אחריות: {{warranty}}</li>
            {{#notes}}<li>{{note}}</li>{{/notes}}
          </ul>
        </div>

        <div class="signature-section">
          <div class="signature-block">
            <div class="signature-line">חתימת החברה</div>
            <div style="font-size:11px; margin-top:5px;">טכנו כל עוזי</div>
          </div>
          <div class="signature-block">
            <div class="signature-line">חתימת הלקוח</div>
            <div style="font-size:11px; margin-top:5px;">{{customer_name}}</div>
          </div>
        </div>

        ${sharedFooter}
      </div>
    `;

    // ===== תבנית 2: חשבונית מס =====
    const invoiceHTML = `
      <div class="document-container">
        ${sharedHeader}
        <div class="document-title">חשבונית מס</div>
        <div class="document-number">חשבונית מספר: {{invoice_number}} | תאריך: {{date}} | מקור: הצעת מחיר {{quote_number}}</div>

        <div class="info-section">
          <div class="info-block">
            <h3>פרטי לקוח</h3>
            <div class="info-row"><span class="info-label">שם:</span><span>{{customer_name}}</span></div>
            <div class="info-row"><span class="info-label">ח.פ./ת.ז.:</span><span>{{customer_tax_id}}</span></div>
            <div class="info-row"><span class="info-label">כתובת:</span><span>{{customer_address}}</span></div>
            <div class="info-row"><span class="info-label">טלפון:</span><span>{{customer_phone}}</span></div>
          </div>
          <div class="info-block">
            <h3>פרטי תשלום</h3>
            <div class="info-row"><span class="info-label">תנאי תשלום:</span><span>{{payment_terms}}</span></div>
            <div class="info-row"><span class="info-label">מועד פירעון:</span><span>{{due_date}}</span></div>
            <div class="info-row"><span class="info-label">בנק:</span><span>בנק לאומי</span></div>
            <div class="info-row"><span class="info-label">סניף:</span><span>123</span></div>
            <div class="info-row"><span class="info-label">חשבון:</span><span>456789</span></div>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width:5%">#</th>
              <th style="width:30%">פריט</th>
              <th style="width:20%">תיאור</th>
              <th style="width:10%">כמות</th>
              <th style="width:15%" class="number-col">מחיר יחידה</th>
              <th style="width:20%" class="number-col">סה"כ</th>
            </tr>
          </thead>
          <tbody>
            {{#items}}
            <tr>
              <td>{{index}}</td>
              <td>{{item_name}}</td>
              <td>{{description}}</td>
              <td>{{qty}}</td>
              <td class="number-col">₪{{unit_price}}</td>
              <td class="number-col">₪{{line_total}}</td>
            </tr>
            {{/items}}
          </tbody>
        </table>

        <div class="totals-section">
          <div class="total-row"><span>סכום לפני מע"מ:</span><span class="number-col">₪{{before_vat}}</span></div>
          <div class="total-row vat-row"><span>מע"מ (17%):</span><span class="number-col">₪{{vat_amount}}</span></div>
          <div class="total-row grand-total"><span>סה"כ לתשלום:</span><span class="number-col">₪{{grand_total}}</span></div>
        </div>

        <div style="margin-top:20px; padding:10px; background:#e8f4fd; border-radius:5px; font-size:12px;">
          <strong>פרטי בנק להעברה:</strong> בנק לאומי | סניף 123 | חשבון 456789 | ע"ש טכנו כל עוזי
        </div>

        ${sharedFooter}
      </div>
    `;

    // ===== תבנית 3: קבלה =====
    const receiptHTML = `
      <div class="document-container">
        ${sharedHeader}
        <div class="document-title">קבלה</div>
        <div class="document-number">קבלה מספר: {{receipt_number}} | תאריך: {{date}}</div>

        <div class="info-section">
          <div class="info-block">
            <h3>התקבל מאת</h3>
            <div class="info-row"><span class="info-label">שם:</span><span>{{customer_name}}</span></div>
            <div class="info-row"><span class="info-label">ח.פ./ת.ז.:</span><span>{{customer_tax_id}}</span></div>
            <div class="info-row"><span class="info-label">כתובת:</span><span>{{customer_address}}</span></div>
          </div>
          <div class="info-block">
            <h3>פרטי תשלום</h3>
            <div class="info-row"><span class="info-label">עבור חשבונית:</span><span>{{invoice_number}}</span></div>
            <div class="info-row"><span class="info-label">אמצעי תשלום:</span><span>{{payment_method}}</span></div>
            <div class="info-row"><span class="info-label">מספר אסמכתא:</span><span>{{reference_number}}</span></div>
          </div>
        </div>

        <div style="text-align:center; margin:30px 0; padding:20px; background:#d4edda; border-radius:10px;">
          <div style="font-size:16px; color:#155724; margin-bottom:10px;">סכום שהתקבל</div>
          <div style="font-size:36px; font-weight:bold; color:#1e3a5f; direction:ltr;">₪{{amount_received}}</div>
          <div style="font-size:13px; color:#666; margin-top:5px;">{{amount_in_words}}</div>
        </div>

        <div class="total-row" style="justify-content:center; font-size:14px;">
          <span>יתרה לתשלום: <strong>₪{{balance_remaining}}</strong></span>
        </div>

        ${sharedFooter}
      </div>
    `;

    // ===== תבנית 4: תעודת משלוח =====
    const deliveryNoteHTML = `
      <div class="document-container">
        ${sharedHeader}
        <div class="document-title">תעודת משלוח</div>
        <div class="document-number">תעודה מספר: {{delivery_number}} | תאריך: {{date}}</div>

        <div class="info-section">
          <div class="info-block">
            <h3>פרטי לקוח</h3>
            <div class="info-row"><span class="info-label">שם:</span><span>{{customer_name}}</span></div>
            <div class="info-row"><span class="info-label">כתובת משלוח:</span><span>{{delivery_address}}</span></div>
            <div class="info-row"><span class="info-label">טלפון:</span><span>{{customer_phone}}</span></div>
            <div class="info-row"><span class="info-label">איש קשר:</span><span>{{contact_person}}</span></div>
          </div>
          <div class="info-block">
            <h3>פרטי משלוח</h3>
            <div class="info-row"><span class="info-label">הזמנה:</span><span>{{order_number}}</span></div>
            <div class="info-row"><span class="info-label">נהג:</span><span>{{driver_name}}</span></div>
            <div class="info-row"><span class="info-label">רכב:</span><span>{{vehicle_number}}</span></div>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width:5%">#</th>
              <th style="width:30%">פריט</th>
              <th style="width:30%">תיאור</th>
              <th style="width:15%">כמות</th>
              <th style="width:10%">יחידה</th>
              <th style="width:10%">הערות</th>
            </tr>
          </thead>
          <tbody>
            {{#items}}
            <tr>
              <td>{{index}}</td>
              <td>{{item_name}}</td>
              <td>{{description}}</td>
              <td>{{qty}}</td>
              <td>{{unit}}</td>
              <td>{{notes}}</td>
            </tr>
            {{/items}}
          </tbody>
        </table>

        <div class="signature-section">
          <div class="signature-block">
            <div class="signature-line">חתימת המוסר</div>
          </div>
          <div class="signature-block">
            <div class="signature-line">חתימת המקבל</div>
            <div style="font-size:11px; margin-top:5px;">שם: _____________ ת.ז.: _____________</div>
          </div>
        </div>

        ${sharedFooter}
      </div>
    `;

    // ===== תבנית 5: חוזה =====
    const contractHTML = `
      <div class="document-container">
        ${sharedHeader}
        <div class="document-title">חוזה התקשרות</div>
        <div class="document-number">חוזה מספר: {{contract_number}} | תאריך: {{date}}</div>

        <div style="margin:20px 0; font-size:13px; line-height:1.8;">
          <h3 style="color:#1e3a5f; margin-bottom:10px;">שנערך ונחתם ביום {{date}}</h3>

          <div style="margin:15px 0;">
            <strong>בין:</strong> טכנו כל עוזי, ח.פ. 514832576, {{company_address}} (להלן: <strong>"החברה"</strong> או <strong>"הספק"</strong>)
          </div>
          <div style="margin:15px 0;">
            <strong>לבין:</strong> {{customer_name}}, ת.ז./ח.פ. {{customer_tax_id}}, {{customer_address}} (להלן: <strong>"הלקוח"</strong> או <strong>"המזמין"</strong>)
          </div>

          <h3 style="color:#1e3a5f; margin:20px 0 10px;">הואיל:</h3>
          <ul style="padding-right:20px;">
            <li>החברה עוסקת בייצור והתקנת שערים, מעקות, פרגולות ומוצרי מתכת בהתאמה אישית;</li>
            <li>הלקוח מעוניין להזמין את העבודות המפורטות בנספח א';</li>
            <li>הצדדים מעוניינים להסדיר את יחסיהם כמפורט להלן;</li>
          </ul>

          <h3 style="color:#1e3a5f; margin:20px 0 10px;">לפיכך הוסכם והותנה בין הצדדים כדלקמן:</h3>

          <div style="margin:10px 0;">
            <strong>1. מהות העבודה:</strong> {{work_description}}
          </div>
          <div style="margin:10px 0;">
            <strong>2. מחיר:</strong> סה"כ ₪{{grand_total}} כולל מע"מ 17%.
          </div>
          <div style="margin:10px 0;">
            <strong>3. תנאי תשלום:</strong> {{payment_terms}}
          </div>
          <div style="margin:10px 0;">
            <strong>4. לוח זמנים:</strong> {{timeline}}
          </div>
          <div style="margin:10px 0;">
            <strong>5. אחריות:</strong> {{warranty}}
          </div>
          <div style="margin:10px 0;">
            <strong>6. תנאים נוספים:</strong> {{additional_terms}}
          </div>
        </div>

        <div class="signature-section" style="margin-top:60px;">
          <div class="signature-block">
            <div class="signature-line">חתימת החברה</div>
            <div style="font-size:11px; margin-top:5px;">טכנו כל עוזי</div>
            <div style="font-size:10px; color:#666;">תאריך: ___________</div>
          </div>
          <div class="signature-block">
            <div class="signature-line">חתימת הלקוח</div>
            <div style="font-size:11px; margin-top:5px;">{{customer_name}}</div>
            <div style="font-size:10px; color:#666;">תאריך: ___________</div>
          </div>
        </div>

        ${sharedFooter}
      </div>
    `;

    // ===== תבנית 6: הזמנת עבודה =====
    const workOrderHTML = `
      <div class="document-container">
        ${sharedHeader}
        <div class="document-title">הזמנת עבודה</div>
        <div class="document-number">הזמנה מספר: {{work_order_number}} | תאריך: {{date}} | דחיפות: {{urgency}}</div>

        <div class="info-section">
          <div class="info-block">
            <h3>פרטי פרויקט</h3>
            <div class="info-row"><span class="info-label">לקוח:</span><span>{{customer_name}}</span></div>
            <div class="info-row"><span class="info-label">פרויקט:</span><span>{{project_name}}</span></div>
            <div class="info-row"><span class="info-label">כתובת:</span><span>{{project_address}}</span></div>
            <div class="info-row"><span class="info-label">תאריך יעד:</span><span>{{target_date}}</span></div>
          </div>
          <div class="info-block">
            <h3>פרטי ייצור</h3>
            <div class="info-row"><span class="info-label">מוצר:</span><span>{{product_type}}</span></div>
            <div class="info-row"><span class="info-label">חומר:</span><span>{{material}}</span></div>
            <div class="info-row"><span class="info-label">גימור:</span><span>{{finish}}</span></div>
            <div class="info-row"><span class="info-label">צבע:</span><span>{{color}}</span></div>
          </div>
        </div>

        <h3 style="color:#1e3a5f; margin:15px 0 10px;">מפרט טכני</h3>
        <table class="items-table">
          <thead>
            <tr>
              <th>פריט</th>
              <th>מידות (ס"מ)</th>
              <th>חומר</th>
              <th>כמות</th>
              <th>הוראות מיוחדות</th>
            </tr>
          </thead>
          <tbody>
            {{#items}}
            <tr>
              <td>{{item_name}}</td>
              <td>{{dimensions}}</td>
              <td>{{material}}</td>
              <td>{{qty}}</td>
              <td>{{special_instructions}}</td>
            </tr>
            {{/items}}
          </tbody>
        </table>

        <div class="terms-section" style="background:#fff0f0; border-color:#ffcccc;">
          <h3 style="color:#c0392b;">הוראות מיוחדות</h3>
          <div style="font-size:12px; white-space:pre-line;">{{special_notes}}</div>
        </div>

        <div style="margin-top:20px; padding:10px; background:#e8f4fd; border-radius:5px;">
          <strong>שרטוט מצורף:</strong> {{drawing_reference}}
        </div>

        ${sharedFooter}
      </div>
    `;

    // ===== תבנית 7: הוראות התקנה =====
    const installationOrderHTML = `
      <div class="document-container">
        ${sharedHeader}
        <div class="document-title">הוראות התקנה</div>
        <div class="document-number">הוראה מספר: {{installation_number}} | תאריך התקנה: {{installation_date}}</div>

        <div class="info-section">
          <div class="info-block" style="background:#fff3e0; border-color:#ffcc80;">
            <h3 style="color:#e65100;">פרטי מיקום</h3>
            <div class="info-row"><span class="info-label">לקוח:</span><span>{{customer_name}}</span></div>
            <div class="info-row"><span class="info-label">כתובת:</span><span>{{address}}</span></div>
            <div class="info-row"><span class="info-label">קומה:</span><span>{{floor}}</span></div>
            <div class="info-row"><span class="info-label">טלפון:</span><span>{{customer_phone}}</span></div>
            <div class="info-row"><span class="info-label">איש קשר באתר:</span><span>{{site_contact}}</span></div>
          </div>
          <div class="info-block">
            <h3>פרטי מתקין</h3>
            <div class="info-row"><span class="info-label">מתקין:</span><span>{{installer_name}}</span></div>
            <div class="info-row"><span class="info-label">טלפון:</span><span>{{installer_phone}}</span></div>
            <div class="info-row"><span class="info-label">שעת הגעה:</span><span>{{arrival_time}}</span></div>
            <div class="info-row"><span class="info-label">משך משוער:</span><span>{{estimated_duration}}</span></div>
          </div>
        </div>

        <h3 style="color:#1e3a5f; margin:15px 0 10px;">מוצרים להתקנה</h3>
        <table class="items-table">
          <thead>
            <tr>
              <th>מוצר</th>
              <th>מידות</th>
              <th>כמות</th>
              <th>מיקום התקנה</th>
              <th>הערות</th>
            </tr>
          </thead>
          <tbody>
            {{#items}}
            <tr>
              <td>{{product}}</td>
              <td>{{dimensions}}</td>
              <td>{{qty}}</td>
              <td>{{install_location}}</td>
              <td>{{notes}}</td>
            </tr>
            {{/items}}
          </tbody>
        </table>

        <div class="terms-section" style="background:#ffebee; border-color:#ef9a9a;">
          <h3 style="color:#c62828;">הוראות מיוחדות למתקין</h3>
          <div style="font-size:12px; white-space:pre-line;">{{special_instructions}}</div>
        </div>

        <div style="margin-top:15px; padding:10px; background:#e8f4fd; border-radius:5px; font-size:12px;">
          <strong>תמונות מצורפות:</strong> {{attached_photos}} | <strong>שרטוט:</strong> {{drawing_reference}}
        </div>

        ${sharedFooter}
      </div>
    `;

    // ===== תבנית 8: דוח מדידות =====
    const measurementReportHTML = `
      <div class="document-container">
        ${sharedHeader}
        <div class="document-title">דוח מדידות</div>
        <div class="document-number">דוח מספר: {{report_number}} | תאריך מדידה: {{measurement_date}}</div>

        <div class="info-section">
          <div class="info-block">
            <h3>פרטי פרויקט</h3>
            <div class="info-row"><span class="info-label">לקוח:</span><span>{{customer_name}}</span></div>
            <div class="info-row"><span class="info-label">כתובת:</span><span>{{address}}</span></div>
            <div class="info-row"><span class="info-label">פרויקט:</span><span>{{project_name}}</span></div>
          </div>
          <div class="info-block">
            <h3>פרטי מהנדס</h3>
            <div class="info-row"><span class="info-label">מהנדס:</span><span>{{engineer_name}}</span></div>
            <div class="info-row"><span class="info-label">טלפון:</span><span>{{engineer_phone}}</span></div>
            <div class="info-row"><span class="info-label">כלי מדידה:</span><span>{{measurement_tool}}</span></div>
          </div>
        </div>

        <h3 style="color:#1e3a5f; margin:15px 0 10px;">תוצאות מדידה</h3>
        <table class="items-table">
          <thead>
            <tr>
              <th>מיקום</th>
              <th>פריט</th>
              <th>רוחב (ס"מ)</th>
              <th>גובה (ס"מ)</th>
              <th>עומק (ס"מ)</th>
              <th>סטייה</th>
              <th>הערות</th>
            </tr>
          </thead>
          <tbody>
            {{#measurements}}
            <tr>
              <td>{{location}}</td>
              <td>{{item}}</td>
              <td class="number-col">{{width}}</td>
              <td class="number-col">{{height}}</td>
              <td class="number-col">{{depth}}</td>
              <td style="color:{{discrepancy_color}}">{{discrepancy}}</td>
              <td>{{notes}}</td>
            </tr>
            {{/measurements}}
          </tbody>
        </table>

        <div class="terms-section">
          <h3>סטיות שזוהו</h3>
          <div style="font-size:12px; white-space:pre-line;">{{discrepancies_summary}}</div>
        </div>

        <div style="margin-top:15px; padding:10px; background:#e8f4fd; border-radius:5px; font-size:12px;">
          <strong>תמונות:</strong> {{photos_count}} תמונות מצורפות | <strong>שרטוט:</strong> {{sketch_reference}}
        </div>

        ${sharedFooter}
      </div>
    `;

    // ===== תבנית 9: תעודת איכות =====
    const qualityCertificateHTML = `
      <div class="document-container">
        ${sharedHeader}
        <div class="document-title">תעודת איכות</div>
        <div class="document-number">תעודה מספר: {{certificate_number}} | תאריך בדיקה: {{inspection_date}}</div>

        <div class="info-section">
          <div class="info-block">
            <h3>פרטי פרויקט</h3>
            <div class="info-row"><span class="info-label">פרויקט:</span><span>{{project_name}}</span></div>
            <div class="info-row"><span class="info-label">לקוח:</span><span>{{customer_name}}</span></div>
            <div class="info-row"><span class="info-label">מוצר:</span><span>{{product_type}}</span></div>
            <div class="info-row"><span class="info-label">הזמנת עבודה:</span><span>{{work_order_number}}</span></div>
          </div>
          <div class="info-block">
            <h3>פרטי בודק</h3>
            <div class="info-row"><span class="info-label">בודק:</span><span>{{inspector_name}}</span></div>
            <div class="info-row"><span class="info-label">תפקיד:</span><span>{{inspector_role}}</span></div>
          </div>
        </div>

        <div style="text-align:center; margin:20px 0; padding:20px; border-radius:10px; background:{{grade_bg_color}}; border:2px solid {{grade_border_color}};">
          <div style="font-size:14px; color:#333;">תוצאת בדיקה</div>
          <div style="font-size:42px; font-weight:bold; color:{{grade_color}};">{{grade}}</div>
          <div style="font-size:16px; color:#333;">{{grade_label}}</div>
        </div>

        <h3 style="color:#1e3a5f; margin:15px 0 10px;">פירוט בדיקות</h3>
        <table class="items-table">
          <thead>
            <tr>
              <th>בדיקה</th>
              <th>תקן</th>
              <th>תוצאה</th>
              <th>עבר/נכשל</th>
              <th>הערות</th>
            </tr>
          </thead>
          <tbody>
            {{#inspections}}
            <tr>
              <td>{{test_name}}</td>
              <td>{{standard}}</td>
              <td>{{result}}</td>
              <td style="color:{{status_color}}; font-weight:bold;">{{status}}</td>
              <td>{{notes}}</td>
            </tr>
            {{/inspections}}
          </tbody>
        </table>

        <div style="margin-top:20px; text-align:center; font-size:14px; color:#1e3a5f; font-weight:bold;">
          {{#approved}}✓ מאושר לשימוש{{/approved}}
          {{#rejected}}✗ לא מאושר - נדרש תיקון{{/rejected}}
        </div>

        ${sharedFooter}
      </div>
    `;

    // ===== תבנית 10: תלוש שכר =====
    const payslipHTML = `
      <div class="document-container">
        ${sharedHeader}
        <div class="document-title">תלוש שכר</div>
        <div class="document-number">חודש: {{month}}/{{year}} | עובד: {{employee_name}} | ת.ז.: {{employee_id}}</div>

        <div class="info-section">
          <div class="info-block">
            <h3>פרטי עובד</h3>
            <div class="info-row"><span class="info-label">שם:</span><span>{{employee_name}}</span></div>
            <div class="info-row"><span class="info-label">ת.ז.:</span><span>{{employee_id}}</span></div>
            <div class="info-row"><span class="info-label">תפקיד:</span><span>{{position}}</span></div>
            <div class="info-row"><span class="info-label">מחלקה:</span><span>{{department}}</span></div>
            <div class="info-row"><span class="info-label">תאריך תחילה:</span><span>{{start_date}}</span></div>
          </div>
          <div class="info-block">
            <h3>נתוני חודש</h3>
            <div class="info-row"><span class="info-label">ימי עבודה:</span><span>{{work_days}}</span></div>
            <div class="info-row"><span class="info-label">שעות רגילות:</span><span>{{regular_hours}}</span></div>
            <div class="info-row"><span class="info-label">שעות נוספות 125%:</span><span>{{overtime_125}}</span></div>
            <div class="info-row"><span class="info-label">שעות נוספות 150%:</span><span>{{overtime_150}}</span></div>
            <div class="info-row"><span class="info-label">ימי חופשה:</span><span>{{vacation_days}}</span></div>
            <div class="info-row"><span class="info-label">ימי מחלה:</span><span>{{sick_days}}</span></div>
          </div>
        </div>

        <div style="display:flex; gap:15px;">
          <div style="flex:1;">
            <h3 style="color:#155724; margin-bottom:10px;">תשלומים</h3>
            <table class="items-table">
              <thead><tr><th>פריט</th><th class="number-col">סכום</th></tr></thead>
              <tbody>
                <tr><td>שכר בסיס</td><td class="number-col">₪{{base_salary}}</td></tr>
                <tr><td>שעות נוספות</td><td class="number-col">₪{{overtime_pay}}</td></tr>
                <tr><td>בונוס</td><td class="number-col">₪{{bonus}}</td></tr>
                <tr><td>החזר נסיעות</td><td class="number-col">₪{{travel_allowance}}</td></tr>
                <tr><td>אחר</td><td class="number-col">₪{{other_additions}}</td></tr>
                <tr style="background:#d4edda; font-weight:bold;"><td>סה"כ ברוטו</td><td class="number-col">₪{{gross_salary}}</td></tr>
              </tbody>
            </table>
          </div>
          <div style="flex:1;">
            <h3 style="color:#721c24; margin-bottom:10px;">ניכויים</h3>
            <table class="items-table">
              <thead><tr><th>פריט</th><th class="number-col">סכום</th></tr></thead>
              <tbody>
                <tr><td>מס הכנסה</td><td class="number-col">₪{{income_tax}}</td></tr>
                <tr><td>ביטוח לאומי</td><td class="number-col">₪{{national_insurance}}</td></tr>
                <tr><td>ביטוח בריאות</td><td class="number-col">₪{{health_insurance}}</td></tr>
                <tr><td>פנסיה עובד</td><td class="number-col">₪{{pension_employee}}</td></tr>
                <tr><td>אחר</td><td class="number-col">₪{{other_deductions}}</td></tr>
                <tr style="background:#f8d7da; font-weight:bold;"><td>סה"כ ניכויים</td><td class="number-col">₪{{total_deductions}}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="total-row grand-total" style="margin-top:20px; font-size:20px; justify-content:center; gap:20px;">
          <span>שכר נטו:</span><span class="number-col">₪{{net_salary}}</span>
        </div>

        ${sharedFooter}
      </div>
    `;

    // ===== תבנית 11: דוח עמלות =====
    const commissionReportHTML = `
      <div class="document-container">
        ${sharedHeader}
        <div class="document-title">דוח עמלות</div>
        <div class="document-number">תקופה: {{period}} | סוכן: {{agent_name}}</div>

        <div class="info-section">
          <div class="info-block">
            <h3>פרטי סוכן</h3>
            <div class="info-row"><span class="info-label">שם:</span><span>{{agent_name}}</span></div>
            <div class="info-row"><span class="info-label">קוד סוכן:</span><span>{{agent_code}}</span></div>
            <div class="info-row"><span class="info-label">אזור:</span><span>{{region}}</span></div>
          </div>
          <div class="info-block">
            <h3>סיכום תקופה</h3>
            <div class="info-row"><span class="info-label">סה"כ מכירות:</span><span>₪{{total_sales}}</span></div>
            <div class="info-row"><span class="info-label">עסקאות:</span><span>{{deal_count}}</span></div>
            <div class="info-row"><span class="info-label">אחוז עמלה ממוצע:</span><span>{{avg_commission_rate}}%</span></div>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th>#</th>
              <th>לקוח</th>
              <th>פרויקט</th>
              <th class="number-col">סכום עסקה</th>
              <th>% עמלה</th>
              <th class="number-col">עמלה</th>
              <th>סטטוס תשלום</th>
            </tr>
          </thead>
          <tbody>
            {{#deals}}
            <tr>
              <td>{{index}}</td>
              <td>{{customer_name}}</td>
              <td>{{project_name}}</td>
              <td class="number-col">₪{{deal_amount}}</td>
              <td>{{commission_rate}}%</td>
              <td class="number-col">₪{{commission_amount}}</td>
              <td><span class="badge {{status_class}}">{{payment_status}}</span></td>
            </tr>
            {{/deals}}
          </tbody>
        </table>

        <div class="totals-section">
          <div class="total-row"><span>סה"כ עמלות:</span><span class="number-col">₪{{total_commission}}</span></div>
          <div class="total-row"><span>שולם:</span><span class="number-col">₪{{paid_amount}}</span></div>
          <div class="total-row grand-total"><span>יתרה לתשלום:</span><span class="number-col">₪{{balance_due}}</span></div>
        </div>

        ${sharedFooter}
      </div>
    `;

    // ===== תבנית 12: דוח חודשי =====
    const monthlyReportHTML = `
      <div class="document-container">
        ${sharedHeader}
        <div class="document-title">דוח חודשי - סיכום פיננסי</div>
        <div class="document-number">חודש: {{month}}/{{year}} | הופק: {{generated_date}}</div>

        <div style="display:flex; gap:10px; margin:15px 0;">
          <div style="flex:1; padding:15px; background:#d4edda; border-radius:8px; text-align:center;">
            <div style="font-size:11px; color:#155724;">הכנסות</div>
            <div style="font-size:24px; font-weight:bold; color:#155724; direction:ltr;">₪{{total_revenue}}</div>
          </div>
          <div style="flex:1; padding:15px; background:#f8d7da; border-radius:8px; text-align:center;">
            <div style="font-size:11px; color:#721c24;">הוצאות</div>
            <div style="font-size:24px; font-weight:bold; color:#721c24; direction:ltr;">₪{{total_expenses}}</div>
          </div>
          <div style="flex:1; padding:15px; background:#cce5ff; border-radius:8px; text-align:center;">
            <div style="font-size:11px; color:#004085;">רווח נקי</div>
            <div style="font-size:24px; font-weight:bold; color:#004085; direction:ltr;">₪{{net_profit}}</div>
          </div>
          <div style="flex:1; padding:15px; background:#fff3cd; border-radius:8px; text-align:center;">
            <div style="font-size:11px; color:#856404;">חובות פתוחים</div>
            <div style="font-size:24px; font-weight:bold; color:#856404; direction:ltr;">₪{{outstanding_debt}}</div>
          </div>
        </div>

        <h3 style="color:#1e3a5f; margin:15px 0 10px;">פירוט הכנסות</h3>
        <table class="items-table">
          <thead><tr><th>קטגוריה</th><th class="number-col">סכום</th><th>% מסה"כ</th></tr></thead>
          <tbody>
            {{#revenue_breakdown}}
            <tr><td>{{category}}</td><td class="number-col">₪{{amount}}</td><td>{{percentage}}%</td></tr>
            {{/revenue_breakdown}}
          </tbody>
        </table>

        <h3 style="color:#1e3a5f; margin:15px 0 10px;">פירוט הוצאות</h3>
        <table class="items-table">
          <thead><tr><th>קטגוריה</th><th class="number-col">סכום</th><th>% מסה"כ</th></tr></thead>
          <tbody>
            {{#expense_breakdown}}
            <tr><td>{{category}}</td><td class="number-col">₪{{amount}}</td><td>{{percentage}}%</td></tr>
            {{/expense_breakdown}}
          </tbody>
        </table>

        <h3 style="color:#1e3a5f; margin:15px 0 10px;">מע"מ</h3>
        <table class="items-table">
          <thead><tr><th>פריט</th><th class="number-col">סכום</th></tr></thead>
          <tbody>
            <tr><td>מע"מ עסקאות (17%)</td><td class="number-col">₪{{vat_collected}}</td></tr>
            <tr><td>מע"מ תשומות (17%)</td><td class="number-col">₪{{vat_paid}}</td></tr>
            <tr style="font-weight:bold;"><td>מע"מ לתשלום/להחזר</td><td class="number-col">₪{{vat_balance}}</td></tr>
          </tbody>
        </table>

        <h3 style="color:#1e3a5f; margin:15px 0 10px;">סטטיסטיקות</h3>
        <div style="display:flex; gap:15px; flex-wrap:wrap;">
          <div style="flex:1; min-width:120px; padding:10px; background:#f0f7ff; border-radius:5px; text-align:center;">
            <div style="font-size:11px; color:#666;">הצעות מחיר</div>
            <div style="font-size:18px; font-weight:bold; color:#1e3a5f;">{{quotes_count}}</div>
          </div>
          <div style="flex:1; min-width:120px; padding:10px; background:#f0f7ff; border-radius:5px; text-align:center;">
            <div style="font-size:11px; color:#666;">עסקאות שנסגרו</div>
            <div style="font-size:18px; font-weight:bold; color:#1e3a5f;">{{deals_closed}}</div>
          </div>
          <div style="flex:1; min-width:120px; padding:10px; background:#f0f7ff; border-radius:5px; text-align:center;">
            <div style="font-size:11px; color:#666;">התקנות</div>
            <div style="font-size:18px; font-weight:bold; color:#1e3a5f;">{{installations_count}}</div>
          </div>
          <div style="flex:1; min-width:120px; padding:10px; background:#f0f7ff; border-radius:5px; text-align:center;">
            <div style="font-size:11px; color:#666;">אחוז המרה</div>
            <div style="font-size:18px; font-weight:bold; color:#1e3a5f;">{{conversion_rate}}%</div>
          </div>
        </div>

        ${sharedFooter}
      </div>
    `;

    // ===== הזנת כל 12 התבניות =====
    const templates = [
      {
        code: 'price_quote',
        name: 'Price Quote',
        name_he: 'הצעת מחיר',
        doc_type: 'price_quote',
        html: priceQuoteHTML,
        variables: ['quote_number','date','validity_days','customer_name','customer_phone','customer_email','customer_address','agent_name','agent_phone','project_id','items','subtotal','discount_percent','discount_amount','before_vat','vat_amount','grand_total','payment_terms','delivery_time','warranty','notes']
      },
      {
        code: 'invoice',
        name: 'Tax Invoice',
        name_he: 'חשבונית מס',
        doc_type: 'invoice',
        html: invoiceHTML,
        variables: ['invoice_number','date','quote_number','customer_name','customer_tax_id','customer_address','customer_phone','payment_terms','due_date','items','before_vat','vat_amount','grand_total']
      },
      {
        code: 'receipt',
        name: 'Receipt',
        name_he: 'קבלה',
        doc_type: 'receipt',
        html: receiptHTML,
        variables: ['receipt_number','date','customer_name','customer_tax_id','customer_address','invoice_number','payment_method','reference_number','amount_received','amount_in_words','balance_remaining']
      },
      {
        code: 'delivery_note',
        name: 'Delivery Note',
        name_he: 'תעודת משלוח',
        doc_type: 'delivery_note',
        html: deliveryNoteHTML,
        variables: ['delivery_number','date','customer_name','delivery_address','customer_phone','contact_person','order_number','driver_name','vehicle_number','items']
      },
      {
        code: 'contract',
        name: 'Contract',
        name_he: 'חוזה',
        doc_type: 'contract',
        html: contractHTML,
        variables: ['contract_number','date','customer_name','customer_tax_id','customer_address','company_address','work_description','grand_total','payment_terms','timeline','warranty','additional_terms']
      },
      {
        code: 'work_order',
        name: 'Work Order',
        name_he: 'הזמנת עבודה',
        doc_type: 'work_order',
        html: workOrderHTML,
        variables: ['work_order_number','date','urgency','customer_name','project_name','project_address','target_date','product_type','material','finish','color','items','special_notes','drawing_reference']
      },
      {
        code: 'installation_order',
        name: 'Installation Order',
        name_he: 'הוראות התקנה',
        doc_type: 'installation_order',
        html: installationOrderHTML,
        variables: ['installation_number','installation_date','customer_name','address','floor','customer_phone','site_contact','installer_name','installer_phone','arrival_time','estimated_duration','items','special_instructions','attached_photos','drawing_reference']
      },
      {
        code: 'measurement_report',
        name: 'Measurement Report',
        name_he: 'דוח מדידות',
        doc_type: 'measurement_report',
        html: measurementReportHTML,
        variables: ['report_number','measurement_date','customer_name','address','project_name','engineer_name','engineer_phone','measurement_tool','measurements','discrepancies_summary','photos_count','sketch_reference']
      },
      {
        code: 'quality_certificate',
        name: 'Quality Certificate',
        name_he: 'תעודת איכות',
        doc_type: 'quality_certificate',
        html: qualityCertificateHTML,
        variables: ['certificate_number','inspection_date','project_name','customer_name','product_type','work_order_number','inspector_name','inspector_role','grade','grade_label','grade_color','grade_bg_color','grade_border_color','inspections','approved','rejected']
      },
      {
        code: 'payslip',
        name: 'Payslip',
        name_he: 'תלוש שכר',
        doc_type: 'payslip',
        html: payslipHTML,
        variables: ['month','year','employee_name','employee_id','position','department','start_date','work_days','regular_hours','overtime_125','overtime_150','vacation_days','sick_days','base_salary','overtime_pay','bonus','travel_allowance','other_additions','gross_salary','income_tax','national_insurance','health_insurance','pension_employee','other_deductions','total_deductions','net_salary']
      },
      {
        code: 'commission_report',
        name: 'Commission Report',
        name_he: 'דוח עמלות',
        doc_type: 'commission_report',
        html: commissionReportHTML,
        variables: ['period','agent_name','agent_code','region','total_sales','deal_count','avg_commission_rate','deals','total_commission','paid_amount','balance_due']
      },
      {
        code: 'monthly_report',
        name: 'Monthly Report',
        name_he: 'דוח חודשי',
        doc_type: 'monthly_report',
        html: monthlyReportHTML,
        variables: ['month','year','generated_date','total_revenue','total_expenses','net_profit','outstanding_debt','revenue_breakdown','expense_breakdown','vat_collected','vat_paid','vat_balance','quotes_count','deals_closed','installations_count','conversion_rate']
      }
    ];

    // הזנת התבניות לטבלה
    for (const t of templates) {
      await pool.query(`
        INSERT INTO pdf_templates (template_code, template_name, template_name_he, document_type, html_template, css_styles, header_html, footer_html, variables, company_details)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (template_code) DO UPDATE SET
          template_name = EXCLUDED.template_name,
          template_name_he = EXCLUDED.template_name_he,
          html_template = EXCLUDED.html_template,
          css_styles = EXCLUDED.css_styles,
          header_html = EXCLUDED.header_html,
          footer_html = EXCLUDED.footer_html,
          variables = EXCLUDED.variables,
          updated_at = NOW()
      `, [t.code, t.name, t.name_he, t.doc_type, t.html, sharedCSS, sharedHeader, sharedFooter, JSON.stringify(t.variables), JSON.stringify(companyDetails)]);
    }

    res.json({ success: true, message: "טבלאות PDF נוצרו ו-12 תבניות הוזנו בהצלחה" });
  } catch (err: any) {
    console.error("שגיאה באתחול מנוע PDF:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===== יצירת PDF מתבנית =====
router.post("/pdf-generator/generate/:templateCode", async (req: Request, res: Response) => {
  try {
    const { templateCode } = req.params;
    const { variables, generated_for, generated_for_email, reference_id, reference_number, title, created_by } = req.body;

    // שליפת התבנית
    const templateResult = await pool.query(
      `SELECT * FROM pdf_templates WHERE template_code = $1 AND is_active = true`,
      [templateCode]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: "תבנית לא נמצאה" });
    }

    const template = templateResult.rows[0];

    // החלפת משתנים ב-HTML
    let htmlContent = template.html_template;
    if (variables && typeof variables === 'object') {
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        htmlContent = htmlContent.replace(regex, String(value));
      }
    }

    // חישוב מע"מ 17% אם יש סכומים
    if (variables?.subtotal && !variables?.vat_amount) {
      const subtotal = parseFloat(variables.subtotal) || 0;
      const discount = parseFloat(variables.discount_amount) || 0;
      const beforeVat = subtotal - discount;
      const vatAmount = beforeVat * VAT_RATE;
      const grandTotal = beforeVat + vatAmount;

      htmlContent = htmlContent.replace(/\{\{before_vat\}\}/g, beforeVat.toFixed(2));
      htmlContent = htmlContent.replace(/\{\{vat_amount\}\}/g, vatAmount.toFixed(2));
      htmlContent = htmlContent.replace(/\{\{grand_total\}\}/g, grandTotal.toFixed(2));
    }

    // עטיפת ה-HTML עם CSS
    const fullHTML = `
      <!DOCTYPE html>
      <html lang="he" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <style>${template.css_styles || ''}</style>
      </head>
      <body>${htmlContent}</body>
      </html>
    `;

    // שמירת המסמך שנוצר
    const insertResult = await pool.query(`
      INSERT INTO pdf_generated (template_id, document_type, reference_id, reference_number, title, generated_for, generated_for_email, variables_used, file_url, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [template.id, template.document_type, reference_id || null, reference_number || null, title || template.template_name_he, generated_for || null, generated_for_email || null, JSON.stringify(variables || {}), null, created_by || 'system']);

    res.json({
      success: true,
      message: "PDF נוצר בהצלחה",
      generated: insertResult.rows[0],
      html: fullHTML
    });
  } catch (err: any) {
    console.error("שגיאה ביצירת PDF:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===== שליפת כל התבניות =====
router.get("/pdf-generator/templates", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT id, template_code, template_name, template_name_he, document_type, page_size, orientation, is_active, version, created_at, updated_at FROM pdf_templates ORDER BY id`);
    res.json({ success: true, templates: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== שליפת תבנית לפי מזהה =====
router.get("/pdf-generator/template/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM pdf_templates WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "תבנית לא נמצאה" });
    res.json({ success: true, template: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== עדכון תבנית =====
router.put("/pdf-generator/template/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { template_name, template_name_he, html_template, css_styles, header_html, footer_html, variables, page_size, orientation, margin_top, margin_bottom, margin_left, margin_right, logo_url, company_details, is_active } = req.body;

    const result = await pool.query(`
      UPDATE pdf_templates SET
        template_name = COALESCE($1, template_name),
        template_name_he = COALESCE($2, template_name_he),
        html_template = COALESCE($3, html_template),
        css_styles = COALESCE($4, css_styles),
        header_html = COALESCE($5, header_html),
        footer_html = COALESCE($6, footer_html),
        variables = COALESCE($7, variables),
        page_size = COALESCE($8, page_size),
        orientation = COALESCE($9, orientation),
        margin_top = COALESCE($10, margin_top),
        margin_bottom = COALESCE($11, margin_bottom),
        margin_left = COALESCE($12, margin_left),
        margin_right = COALESCE($13, margin_right),
        logo_url = COALESCE($14, logo_url),
        company_details = COALESCE($15, company_details),
        is_active = COALESCE($16, is_active),
        version = version + 1,
        updated_at = NOW()
      WHERE id = $17 RETURNING *
    `, [template_name, template_name_he, html_template, css_styles, header_html, footer_html, variables ? JSON.stringify(variables) : null, page_size, orientation, margin_top, margin_bottom, margin_left, margin_right, logo_url, company_details ? JSON.stringify(company_details) : null, is_active, id]);

    if (result.rows.length === 0) return res.status(404).json({ error: "תבנית לא נמצאה" });
    res.json({ success: true, template: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== שליפת כל המסמכים שנוצרו =====
router.get("/pdf-generator/generated", async (req: Request, res: Response) => {
  try {
    const { document_type, generated_for, page = '1', limit = '50' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = `SELECT pg.*, pt.template_name_he FROM pdf_generated pg LEFT JOIN pdf_templates pt ON pg.template_id = pt.id WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (document_type) {
      query += ` AND pg.document_type = $${paramIndex++}`;
      params.push(document_type);
    }
    if (generated_for) {
      query += ` AND pg.generated_for ILIKE $${paramIndex++}`;
      params.push(`%${generated_for}%`);
    }

    query += ` ORDER BY pg.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), offset);

    const result = await pool.query(query, params);

    // ספירה כוללת
    const countResult = await pool.query(`SELECT COUNT(*) FROM pdf_generated`);

    res.json({ success: true, generated: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== שליפת מסמך שנוצר לפי מזהה =====
router.get("/pdf-generator/generated/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT pg.*, pt.template_name_he, pt.html_template, pt.css_styles
      FROM pdf_generated pg
      LEFT JOIN pdf_templates pt ON pg.template_id = pt.id
      WHERE pg.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: "מסמך לא נמצא" });
    res.json({ success: true, generated: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== שליחה באימייל =====
router.post("/pdf-generator/send-email/:generatedId", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      UPDATE pdf_generated SET sent_via = 'email', sent_at = NOW(), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.generatedId]);

    if (result.rows.length === 0) return res.status(404).json({ error: "מסמך לא נמצא" });
    res.json({ success: true, message: "המסמך סומן כנשלח באימייל", generated: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== שליחה בוואטסאפ =====
router.post("/pdf-generator/send-whatsapp/:generatedId", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      UPDATE pdf_generated SET sent_via = 'whatsapp', sent_at = NOW(), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.generatedId]);

    if (result.rows.length === 0) return res.status(404).json({ error: "מסמך לא נמצא" });
    res.json({ success: true, message: "המסמך סומן כנשלח בוואטסאפ", generated: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== היסטוריית מסמכים לפי מזהה הפניה (פרויקט/לקוח) =====
router.get("/pdf-generator/document-history/:referenceId", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT pg.*, pt.template_name_he
      FROM pdf_generated pg
      LEFT JOIN pdf_templates pt ON pg.template_id = pt.id
      WHERE pg.reference_id = $1
      ORDER BY pg.created_at DESC
    `, [req.params.referenceId]);

    res.json({ success: true, history: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== דשבורד PDF =====
router.get("/pdf-generator/dashboard", async (_req: Request, res: Response) => {
  try {
    // מסמכים שנוצרו היום
    const todayResult = await pool.query(`SELECT COUNT(*) FROM pdf_generated WHERE created_at >= CURRENT_DATE`);

    // מסמכים שנוצרו השבוע
    const weekResult = await pool.query(`SELECT COUNT(*) FROM pdf_generated WHERE created_at >= date_trunc('week', CURRENT_DATE)`);

    // מסמכים שנוצרו החודש
    const monthResult = await pool.query(`SELECT COUNT(*) FROM pdf_generated WHERE created_at >= date_trunc('month', CURRENT_DATE)`);

    // חלוקה לפי סוג מסמך
    const byTypeResult = await pool.query(`
      SELECT document_type, COUNT(*) as count
      FROM pdf_generated
      GROUP BY document_type
      ORDER BY count DESC
    `);

    // הצעות מחיר שלא נחתמו
    const unsignedQuotesResult = await pool.query(`
      SELECT id, reference_number, title, generated_for, created_at
      FROM pdf_generated
      WHERE document_type = 'price_quote' AND signed = false
      ORDER BY created_at DESC
      LIMIT 20
    `);

    // סה"כ תבניות פעילות
    const templatesResult = await pool.query(`SELECT COUNT(*) FROM pdf_templates WHERE is_active = true`);

    res.json({
      success: true,
      dashboard: {
        generated_today: parseInt(todayResult.rows[0].count),
        generated_this_week: parseInt(weekResult.rows[0].count),
        generated_this_month: parseInt(monthResult.rows[0].count),
        by_type: byTypeResult.rows,
        unsigned_quotes: unsignedQuotesResult.rows,
        active_templates: parseInt(templatesResult.rows[0].count)
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
