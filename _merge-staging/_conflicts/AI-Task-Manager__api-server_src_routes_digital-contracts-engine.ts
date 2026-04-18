/**
 * ============================================================
 * מנוע חוזים דיגיטליים וחתימות - Digital Contracts Engine
 * ============================================================
 * ניהול חוזים דיגיטליים עם חתימות אלקטרוניות
 * עבור לקוחות, עובדים, קבלנים וספקים
 * כולל תבניות בעברית עם משתנים דינמיים
 * ============================================================
 */

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ===== POST /init - יצירת טבלאות וזריעת תבניות =====
router.post("/init", async (req: Request, res: Response) => {
  try {
    // יצירת טבלת חוזים דיגיטליים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS digital_contracts (
        id SERIAL PRIMARY KEY,
        contract_number VARCHAR(50) UNIQUE,
        contract_type VARCHAR(50),
        template_id INTEGER,
        title VARCHAR(255),
        title_he VARCHAR(255),
        parties JSONB DEFAULT '[]',
        content TEXT,
        content_html TEXT,
        variables JSONB DEFAULT '{}',
        total_amount NUMERIC(15,2),
        currency VARCHAR(10) DEFAULT 'ILS',
        attachments JSONB DEFAULT '[]',
        signing_order JSONB DEFAULT '[]',
        current_signer INTEGER DEFAULT 0,
        all_signed BOOLEAN DEFAULT false,
        signed_date TIMESTAMPTZ,
        expires_at DATE,
        reminder_sent BOOLEAN DEFAULT false,
        status VARCHAR(20) DEFAULT 'draft',
        created_by VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת טבלת חתימות
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contract_signatures (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER REFERENCES digital_contracts(id),
        signer_name VARCHAR(255),
        signer_email VARCHAR(100),
        signer_phone VARCHAR(50),
        signer_role VARCHAR(100),
        signer_id_number VARCHAR(20),
        ip_address VARCHAR(50),
        user_agent TEXT,
        signature_data TEXT,
        signed_at TIMESTAMPTZ,
        reminder_count INTEGER DEFAULT 0,
        last_reminder TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת טבלת תבניות חוזים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contract_templates (
        id SERIAL PRIMARY KEY,
        template_name VARCHAR(255),
        template_name_he VARCHAR(255),
        contract_type VARCHAR(50),
        content_template TEXT,
        content_template_html TEXT,
        variables JSONB DEFAULT '[]',
        is_default BOOLEAN DEFAULT false,
        version INTEGER DEFAULT 1,
        status VARCHAR(20) DEFAULT 'active',
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ===== זריעת 4 תבניות חוזים בעברית =====

    // תבנית 1: חוזה פרויקט ללקוח
    await pool.query(
      `INSERT INTO contract_templates
        (template_name, template_name_he, contract_type, content_template, content_template_html, variables, is_default, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING`,
      [
        "Customer Project Contract",
        "חוזה פרויקט ללקוח",
        "customer_project",
        `חוזה מספר: {{contract_number}}
תאריך: {{date}}

בין:
טכנוקולוזי בע"מ (להלן: "החברה")
כתובת: {{company_address}}
ח.פ.: {{company_id}}

לבין:
{{customer_name}} (להלן: "הלקוח")
ת.ז.: {{customer_id_number}}
כתובת: {{customer_address}}
טלפון: {{customer_phone}}
דוא"ל: {{customer_email}}

הואיל והחברה עוסקת בייצור והתקנת מוצרי אלומיניום ומתכת;
והואיל והלקוח מעוניין להזמין את השירותים המפורטים להלן;

לפיכך הוסכם בין הצדדים כדלקמן:

1. מהות העבודה
החברה תבצע עבור הלקוח את העבודות הבאות בכתובת: {{project_address}}
תיאור העבודה: {{project_description}}
שטח כולל: {{total_sqm}} מ"ר

2. מחיר ותנאי תשלום
סה"כ מחיר העבודה: {{total_amount}} ש"ח (לא כולל מע"מ)
מע"מ (17%): {{vat_amount}} ש"ח
סה"כ כולל מע"מ: {{total_with_vat}} ש"ח

תנאי תשלום: {{payment_terms}}
- מקדמה: {{advance_payment}} ש"ח - בחתימת החוזה
- תשלום ביניים: {{interim_payment}} ש"ח - בסיום הייצור
- יתרה סופית: {{final_payment}} ש"ח - בסיום ההתקנה

3. לוח זמנים
תאריך התחלה משוער: {{start_date}}
תאריך סיום משוער: {{end_date}}
תקופת אחריות: {{warranty_period}}

4. אחריות
החברה מעניקה אחריות למשך {{warranty_period}} מיום ההתקנה.
האחריות כוללת: תיקון או החלפה של חלקים פגומים עקב ייצור לקוי.
האחריות אינה כוללת: נזק שנגרם משימוש לא סביר, פגעי מזג אוויר קיצוניים, או שינויים שבוצעו שלא על ידי החברה.

5. ביטול
ביטול העסקה יתאפשר בהתאם לחוק הגנת הצרכן.
ביטול לאחר תחילת הייצור: קיזוז של 30% מערך ההזמנה.

חתימת החברה: _________________
חתימת הלקוח: _________________
תאריך: {{date}}`,
        `<div dir="rtl" style="font-family: Arial, sans-serif; padding: 40px;">
<h1 style="text-align: center;">חוזה פרויקט</h1>
<p><strong>חוזה מספר:</strong> {{contract_number}}</p>
<p><strong>תאריך:</strong> {{date}}</p>
<hr/>
<h3>בין:</h3>
<p>טכנוקולוזי בע"מ (להלן: "החברה")<br/>כתובת: {{company_address}}<br/>ח.פ.: {{company_id}}</p>
<h3>לבין:</h3>
<p>{{customer_name}} (להלן: "הלקוח")<br/>ת.ז.: {{customer_id_number}}<br/>כתובת: {{customer_address}}<br/>טלפון: {{customer_phone}}<br/>דוא"ל: {{customer_email}}</p>
<hr/>
<h3>1. מהות העבודה</h3>
<p>כתובת הפרויקט: {{project_address}}<br/>תיאור: {{project_description}}<br/>שטח: {{total_sqm}} מ"ר</p>
<h3>2. מחיר ותנאי תשלום</h3>
<table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%;">
<tr><td>סה"כ לפני מע"מ</td><td>{{total_amount}} ש"ח</td></tr>
<tr><td>מע"מ (17%)</td><td>{{vat_amount}} ש"ח</td></tr>
<tr><td><strong>סה"כ כולל מע"מ</strong></td><td><strong>{{total_with_vat}} ש"ח</strong></td></tr>
</table>
<p>תנאי תשלום: {{payment_terms}}</p>
<h3>3. לוח זמנים</h3>
<p>התחלה: {{start_date}} | סיום: {{end_date}}<br/>אחריות: {{warranty_period}}</p>
<h3>4. חתימות</h3>
<table style="width: 100%;"><tr>
<td style="width: 50%; text-align: center; padding-top: 50px; border-top: 1px solid #000;">חתימת החברה</td>
<td style="width: 50%; text-align: center; padding-top: 50px; border-top: 1px solid #000;">חתימת הלקוח</td>
</tr></table>
</div>`,
        JSON.stringify([
          "contract_number", "date", "company_address", "company_id",
          "customer_name", "customer_id_number", "customer_address", "customer_phone", "customer_email",
          "project_address", "project_description", "total_sqm",
          "total_amount", "vat_amount", "total_with_vat", "payment_terms",
          "advance_payment", "interim_payment", "final_payment",
          "start_date", "end_date", "warranty_period",
        ]),
        true,
        "system",
      ]
    );

    // תבנית 2: הסכם עובד
    await pool.query(
      `INSERT INTO contract_templates
        (template_name, template_name_he, contract_type, content_template, content_template_html, variables, is_default, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING`,
      [
        "Employee Agreement",
        "הסכם העסקת עובד",
        "employee_agreement",
        `הסכם העסקה

תאריך: {{date}}
מספר הסכם: {{contract_number}}

בין:
טכנוקולוזי בע"מ (להלן: "המעסיק")
ח.פ.: {{company_id}}

לבין:
{{employee_name}} (להלן: "העובד")
ת.ז.: {{employee_id_number}}
כתובת: {{employee_address}}
טלפון: {{employee_phone}}

1. תפקיד ותיאור משרה
תפקיד: {{job_title}}
מחלקה: {{department}}
כפיפות ל: {{reports_to}}
היקף משרה: {{employment_scope}}

2. תנאי שכר
שכר בסיס חודשי (ברוטו): {{base_salary}} ש"ח
תוספות: {{salary_additions}}
שעות עבודה שבועיות: {{weekly_hours}}

3. תאריכי התחלה
תאריך תחילת העסקה: {{start_date}}
תקופת ניסיון: {{probation_period}}

4. הטבות
ימי חופשה שנתיים: {{vacation_days}}
ימי מחלה: בהתאם לחוק
קרן פנסיה: {{pension_fund}}
קרן השתלמות: {{education_fund}}

5. סודיות
העובד מתחייב לשמור על סודיות מלאה בנוגע לכל מידע עסקי, טכני, או מסחרי של המעסיק.

6. אי-תחרות
העובד מתחייב שלא לעבוד אצל מתחרה למשך {{non_compete_period}} לאחר סיום העסקתו.

7. סיום העסקה
כל צד רשאי לסיים את ההסכם בהודעה מוקדמת בהתאם לחוק.

חתימת המעסיק: _________________
חתימת העובד: _________________
תאריך: {{date}}`,
        `<div dir="rtl" style="font-family: Arial, sans-serif; padding: 40px;">
<h1 style="text-align: center;">הסכם העסקת עובד</h1>
<p><strong>מספר הסכם:</strong> {{contract_number}} | <strong>תאריך:</strong> {{date}}</p>
<hr/>
<h3>פרטי העובד</h3>
<p>שם: {{employee_name}}<br/>ת.ז.: {{employee_id_number}}<br/>כתובת: {{employee_address}}<br/>טלפון: {{employee_phone}}</p>
<h3>1. תפקיד</h3>
<p>תפקיד: {{job_title}} | מחלקה: {{department}} | כפיפות: {{reports_to}}<br/>היקף: {{employment_scope}}</p>
<h3>2. שכר</h3>
<p>שכר בסיס: {{base_salary}} ש"ח<br/>תוספות: {{salary_additions}}<br/>שעות שבועיות: {{weekly_hours}}</p>
<h3>3. תאריכים</h3>
<p>תחילת העסקה: {{start_date}}<br/>ניסיון: {{probation_period}}</p>
<h3>4. הטבות</h3>
<p>חופשה: {{vacation_days}} ימים<br/>פנסיה: {{pension_fund}}<br/>השתלמות: {{education_fund}}</p>
<h3>חתימות</h3>
<table style="width: 100%;"><tr>
<td style="width: 50%; text-align: center; padding-top: 50px; border-top: 1px solid #000;">חתימת המעסיק</td>
<td style="width: 50%; text-align: center; padding-top: 50px; border-top: 1px solid #000;">חתימת העובד</td>
</tr></table>
</div>`,
        JSON.stringify([
          "contract_number", "date", "company_id",
          "employee_name", "employee_id_number", "employee_address", "employee_phone",
          "job_title", "department", "reports_to", "employment_scope",
          "base_salary", "salary_additions", "weekly_hours",
          "start_date", "probation_period",
          "vacation_days", "pension_fund", "education_fund", "non_compete_period",
        ]),
        true,
        "system",
      ]
    );

    // תבנית 3: הסכם קבלן
    await pool.query(
      `INSERT INTO contract_templates
        (template_name, template_name_he, contract_type, content_template, content_template_html, variables, is_default, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING`,
      [
        "Contractor Agreement",
        "הסכם קבלן משנה",
        "contractor_agreement",
        `הסכם קבלן משנה

תאריך: {{date}}
מספר הסכם: {{contract_number}}

בין:
טכנוקולוזי בע"מ (להלן: "החברה")
ח.פ.: {{company_id}}

לבין:
{{contractor_name}} (להלן: "הקבלן")
ת.ז./ח.פ.: {{contractor_id_number}}
כתובת: {{contractor_address}}
טלפון: {{contractor_phone}}
דוא"ל: {{contractor_email}}

1. סוג הקבלן
סוג: {{contractor_type}}
תחום התמחות: {{specialization}}

2. תעריפים
תעריף למ"ר: {{rate_per_sqm}} ש"ח
תעריף באחוזים: {{rate_percentage}}% מערך הפרויקט
מודל תשלום מועדף: {{payment_model}}

3. בונוסים
אחוז בונוס: {{bonus_percentage}}%
סף בונוס חודשי: {{bonus_threshold}} ש"ח

4. תנאי תשלום
מועד תשלום: {{payment_terms}}
ניכוי מס במקור: {{withholding_rate}}%
הקבלן יגיש חשבונית מס כדין.

5. ביטוח
הקבלן מתחייב להחזיק ביטוח צד שלישי וביטוח עובדים בהיקף מינימלי של {{insurance_amount}} ש"ח.

6. אחריות ואיכות
הקבלן מתחייב לבצע את העבודה ברמה מקצועית גבוהה ובהתאם לתקנים הישראליים.
תקופת אחריות על עבודות: {{warranty_period}}

7. תקופת ההסכם
תחילה: {{start_date}}
סיום: {{end_date}}
הסכם זה ניתן להארכה בהסכמת שני הצדדים.

8. סיום ההסכם
כל צד רשאי לסיים את ההסכם בהודעה מוקדמת של {{notice_period}}.

חתימת החברה: _________________
חתימת הקבלן: _________________
תאריך: {{date}}`,
        `<div dir="rtl" style="font-family: Arial, sans-serif; padding: 40px;">
<h1 style="text-align: center;">הסכם קבלן משנה</h1>
<p><strong>מספר הסכם:</strong> {{contract_number}} | <strong>תאריך:</strong> {{date}}</p>
<hr/>
<h3>פרטי הקבלן</h3>
<p>שם: {{contractor_name}}<br/>ת.ז./ח.פ.: {{contractor_id_number}}<br/>כתובת: {{contractor_address}}<br/>טלפון: {{contractor_phone}}<br/>דוא"ל: {{contractor_email}}</p>
<h3>1. סוג: {{contractor_type}}</h3>
<p>התמחות: {{specialization}}</p>
<h3>2. תעריפים</h3>
<table border="1" cellpadding="8" style="border-collapse: collapse;">
<tr><td>למ"ר</td><td>{{rate_per_sqm}} ש"ח</td></tr>
<tr><td>אחוזים</td><td>{{rate_percentage}}%</td></tr>
<tr><td>מודל מועדף</td><td>{{payment_model}}</td></tr>
</table>
<h3>3. בונוסים</h3>
<p>בונוס: {{bonus_percentage}}% | סף: {{bonus_threshold}} ש"ח</p>
<h3>4. תשלום</h3>
<p>מועד: {{payment_terms}} | ניכוי מס: {{withholding_rate}}%</p>
<h3>5. תקופה</h3>
<p>מ-{{start_date}} עד {{end_date}} | הודעה מוקדמת: {{notice_period}}</p>
<h3>חתימות</h3>
<table style="width: 100%;"><tr>
<td style="width: 50%; text-align: center; padding-top: 50px; border-top: 1px solid #000;">חתימת החברה</td>
<td style="width: 50%; text-align: center; padding-top: 50px; border-top: 1px solid #000;">חתימת הקבלן</td>
</tr></table>
</div>`,
        JSON.stringify([
          "contract_number", "date", "company_id",
          "contractor_name", "contractor_id_number", "contractor_address", "contractor_phone", "contractor_email",
          "contractor_type", "specialization",
          "rate_per_sqm", "rate_percentage", "payment_model",
          "bonus_percentage", "bonus_threshold",
          "payment_terms", "withholding_rate",
          "insurance_amount", "warranty_period",
          "start_date", "end_date", "notice_period",
        ]),
        true,
        "system",
      ]
    );

    // תבנית 4: הסכם ספק
    await pool.query(
      `INSERT INTO contract_templates
        (template_name, template_name_he, contract_type, content_template, content_template_html, variables, is_default, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING`,
      [
        "Supplier Agreement",
        "הסכם ספק",
        "supplier_agreement",
        `הסכם ספק

תאריך: {{date}}
מספר הסכם: {{contract_number}}

בין:
טכנוקולוזי בע"מ (להלן: "הרוכש")
ח.פ.: {{company_id}}
כתובת: {{company_address}}

לבין:
{{supplier_name}} (להלן: "הספק")
ח.פ.: {{supplier_id_number}}
כתובת: {{supplier_address}}
טלפון: {{supplier_phone}}
דוא"ל: {{supplier_email}}
איש קשר: {{supplier_contact_person}}

1. מהות ההסכם
הספק יספק לרוכש את המוצרים/שירותים הבאים:
{{products_description}}

2. מחירים
סה"כ ערך ההסכם: {{total_amount}} ש"ח (לא כולל מע"מ)
מע"מ: {{vat_amount}} ש"ח
סה"כ כולל מע"מ: {{total_with_vat}} ש"ח
מטבע: {{currency}}

תנאי מחיר: {{pricing_terms}}
הנחת כמות: {{volume_discount}}

3. תנאי תשלום
{{payment_terms}}
ימי אשראי: {{credit_days}}

4. אספקה
זמן אספקה: {{delivery_time}}
מקום אספקה: {{delivery_location}}
עלות הובלה: {{shipping_cost}}

5. איכות ואחריות
הספק מתחייב לספק מוצרים העומדים בתקנים: {{quality_standards}}
תקופת אחריות: {{warranty_period}}
מדיניות החזרות: {{return_policy}}

6. תקופת ההסכם
תחילה: {{start_date}}
סיום: {{end_date}}

7. סודיות
שני הצדדים מתחייבים לשמור על סודיות מלאה בנוגע לתנאי הסכם זה.

חתימת הרוכש: _________________
חתימת הספק: _________________
תאריך: {{date}}`,
        `<div dir="rtl" style="font-family: Arial, sans-serif; padding: 40px;">
<h1 style="text-align: center;">הסכם ספק</h1>
<p><strong>מספר הסכם:</strong> {{contract_number}} | <strong>תאריך:</strong> {{date}}</p>
<hr/>
<h3>פרטי הספק</h3>
<p>שם: {{supplier_name}}<br/>ח.פ.: {{supplier_id_number}}<br/>כתובת: {{supplier_address}}<br/>טלפון: {{supplier_phone}}<br/>דוא"ל: {{supplier_email}}<br/>איש קשר: {{supplier_contact_person}}</p>
<h3>1. מוצרים/שירותים</h3>
<p>{{products_description}}</p>
<h3>2. מחירים</h3>
<table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%;">
<tr><td>סה"כ לפני מע"מ</td><td>{{total_amount}} ש"ח</td></tr>
<tr><td>מע"מ</td><td>{{vat_amount}} ש"ח</td></tr>
<tr><td><strong>סה"כ</strong></td><td><strong>{{total_with_vat}} ש"ח</strong></td></tr>
</table>
<p>הנחת כמות: {{volume_discount}} | מטבע: {{currency}}</p>
<h3>3. תשלום</h3>
<p>{{payment_terms}} | אשראי: {{credit_days}} ימים</p>
<h3>4. אספקה</h3>
<p>זמן: {{delivery_time}} | מקום: {{delivery_location}} | הובלה: {{shipping_cost}}</p>
<h3>5. איכות</h3>
<p>תקנים: {{quality_standards}}<br/>אחריות: {{warranty_period}}<br/>החזרות: {{return_policy}}</p>
<h3>6. תקופה</h3>
<p>מ-{{start_date}} עד {{end_date}}</p>
<h3>חתימות</h3>
<table style="width: 100%;"><tr>
<td style="width: 50%; text-align: center; padding-top: 50px; border-top: 1px solid #000;">חתימת הרוכש</td>
<td style="width: 50%; text-align: center; padding-top: 50px; border-top: 1px solid #000;">חתימת הספק</td>
</tr></table>
</div>`,
        JSON.stringify([
          "contract_number", "date", "company_id", "company_address",
          "supplier_name", "supplier_id_number", "supplier_address", "supplier_phone", "supplier_email", "supplier_contact_person",
          "products_description",
          "total_amount", "vat_amount", "total_with_vat", "currency", "pricing_terms", "volume_discount",
          "payment_terms", "credit_days",
          "delivery_time", "delivery_location", "shipping_cost",
          "quality_standards", "warranty_period", "return_policy",
          "start_date", "end_date",
        ]),
        true,
        "system",
      ]
    );

    res.json({
      success: true,
      message: "טבלאות חוזים דיגיטליים נוצרו בהצלחה ו-4 תבניות נזרעו",
      tables: ["digital_contracts", "contract_signatures", "contract_templates"],
      seeded_templates: [
        "חוזה פרויקט ללקוח",
        "הסכם העסקת עובד",
        "הסכם קבלן משנה",
        "הסכם ספק",
      ],
    });
  } catch (error: any) {
    console.error("שגיאה באתחול מנוע חוזים דיגיטליים:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== CRUD - חוזים =====

// קבלת כל החוזים
router.get("/contracts", async (req: Request, res: Response) => {
  try {
    const { status, contract_type } = req.query;
    let query = `SELECT * FROM digital_contracts WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    if (contract_type) {
      params.push(contract_type);
      query += ` AND contract_type = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;
    const result = await pool.query(query, params);

    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error: any) {
    console.error("שגיאה בשליפת חוזים:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// קבלת חוזה לפי ID
router.get("/contracts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM digital_contracts WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "חוזה לא נמצא" });
    }

    // שליפת חתימות
    const signatures = await pool.query(
      `SELECT * FROM contract_signatures WHERE contract_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    res.json({
      success: true,
      data: { ...result.rows[0], signatures: signatures.rows },
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת חוזה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// יצירת חוזה חדש
router.post("/contracts", async (req: Request, res: Response) => {
  try {
    const {
      contract_number, contract_type, template_id, title, title_he,
      parties, content, content_html, variables, total_amount, currency,
      attachments, signing_order, expires_at, created_by, notes,
    } = req.body;

    // יצירת מספר חוזה אוטומטי אם לא סופק
    const contractNum = contract_number || `CTR-${Date.now()}`;

    const result = await pool.query(
      `INSERT INTO digital_contracts
        (contract_number, contract_type, template_id, title, title_he,
         parties, content, content_html, variables, total_amount, currency,
         attachments, signing_order, expires_at, created_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        contractNum, contract_type, template_id, title, title_he,
        JSON.stringify(parties || []), content, content_html,
        JSON.stringify(variables || {}), total_amount, currency || "ILS",
        JSON.stringify(attachments || []), JSON.stringify(signing_order || []),
        expires_at, created_by, notes,
      ]
    );

    res.status(201).json({
      success: true,
      message: "חוזה נוצר בהצלחה",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה ביצירת חוזה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// עדכון חוזה
router.put("/contracts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === "id") continue;
      // המרת אובייקטים ל-JSON
      const val = typeof value === "object" && value !== null ? JSON.stringify(value) : value;
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(val);
      paramIndex++;
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE digital_contracts SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "חוזה לא נמצא" });
    }

    res.json({
      success: true,
      message: "חוזה עודכן בהצלחה",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה בעדכון חוזה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// מחיקה רכה - שינוי סטטוס ל-archived (לעולם לא מוחקים!)
router.delete("/contracts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE digital_contracts SET status = 'archived', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "חוזה לא נמצא" });
    }

    res.json({
      success: true,
      message: "חוזה הועבר לארכיון (לא נמחק - רק שינוי סטטוס)",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה בארכיון חוזה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== CRUD - תבניות =====

// קבלת כל התבניות
router.get("/templates", async (req: Request, res: Response) => {
  try {
    const { contract_type, status } = req.query;
    let query = `SELECT * FROM contract_templates WHERE 1=1`;
    const params: any[] = [];

    if (contract_type) {
      params.push(contract_type);
      query += ` AND contract_type = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY template_name_he ASC`;
    const result = await pool.query(query, params);

    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error: any) {
    console.error("שגיאה בשליפת תבניות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// קבלת תבנית לפי ID
router.get("/templates/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM contract_templates WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "תבנית לא נמצאה" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בשליפת תבנית:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// יצירת תבנית חדשה
router.post("/templates", async (req: Request, res: Response) => {
  try {
    const {
      template_name, template_name_he, contract_type,
      content_template, content_template_html, variables,
      is_default, created_by,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO contract_templates
        (template_name, template_name_he, contract_type, content_template, content_template_html, variables, is_default, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        template_name, template_name_he, contract_type,
        content_template, content_template_html,
        JSON.stringify(variables || []), is_default || false, created_by,
      ]
    );

    res.status(201).json({
      success: true,
      message: "תבנית נוצרה בהצלחה",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה ביצירת תבנית:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// עדכון תבנית
router.put("/templates/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === "id") continue;
      const val = typeof value === "object" && value !== null ? JSON.stringify(value) : value;
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(val);
      paramIndex++;
    }

    setClauses.push(`updated_at = NOW()`);
    // העלאת גרסה אוטומטית
    setClauses.push(`version = version + 1`);
    values.push(id);

    const result = await pool.query(
      `UPDATE contract_templates SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "תבנית לא נמצאה" });
    }

    res.json({
      success: true,
      message: "תבנית עודכנה בהצלחה",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה בעדכון תבנית:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// מחיקה רכה - שינוי סטטוס ל-inactive (לעולם לא מוחקים!)
router.delete("/templates/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE contract_templates SET status = 'inactive', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "תבנית לא נמצאה" });
    }

    res.json({
      success: true,
      message: "תבנית הועברה למצב לא פעיל (לא נמחקה - רק שינוי סטטוס)",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה בביטול תבנית:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== POST /generate-from-template - יצירת חוזה מתבנית =====
router.post("/generate-from-template", async (req: Request, res: Response) => {
  try {
    const { template_id, variables, parties, total_amount, expires_at, created_by, notes } = req.body;

    // שליפת התבנית
    const templateResult = await pool.query(
      `SELECT * FROM contract_templates WHERE id = $1`,
      [template_id]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "תבנית לא נמצאה" });
    }

    const template = templateResult.rows[0];

    // החלפת משתנים בתוכן
    let content = template.content_template || "";
    let content_html = template.content_template_html || "";

    if (variables && typeof variables === "object") {
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        content = content.split(placeholder).join(String(value));
        content_html = content_html.split(placeholder).join(String(value));
      }
    }

    // יצירת מספר חוזה אוטומטי
    const contractNumber = `CTR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const result = await pool.query(
      `INSERT INTO digital_contracts
        (contract_number, contract_type, template_id, title, title_he,
         parties, content, content_html, variables, total_amount,
         expires_at, created_by, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft')
       RETURNING *`,
      [
        contractNumber,
        template.contract_type,
        template.id,
        template.template_name,
        template.template_name_he,
        JSON.stringify(parties || []),
        content,
        content_html,
        JSON.stringify(variables || {}),
        total_amount,
        expires_at,
        created_by,
        notes,
      ]
    );

    res.status(201).json({
      success: true,
      message: `חוזה נוצר מתבנית "${template.template_name_he}" בהצלחה`,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה ביצירת חוזה מתבנית:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== POST /:id/send-for-signing - שליחת חוזה לחתימה =====
router.post("/:id/send-for-signing", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { signers } = req.body;
    // signers: [{ name, email, phone, role, id_number }]

    // בדיקה שהחוזה קיים
    const contractResult = await pool.query(
      `SELECT * FROM digital_contracts WHERE id = $1`,
      [id]
    );

    if (contractResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "חוזה לא נמצא" });
    }

    if (!signers || signers.length === 0) {
      return res.status(400).json({ success: false, error: "יש לספק רשימת חותמים" });
    }

    // יצירת רשומות חתימה לכל חותם
    const signatureRecords: any[] = [];

    for (const signer of signers) {
      const sigResult = await pool.query(
        `INSERT INTO contract_signatures
          (contract_id, signer_name, signer_email, signer_phone, signer_role, signer_id_number, status)
         VALUES ($1,$2,$3,$4,$5,$6,'pending')
         RETURNING *`,
        [id, signer.name, signer.email, signer.phone, signer.role, signer.id_number]
      );
      signatureRecords.push(sigResult.rows[0]);
    }

    // עדכון סטטוס החוזה ל-pending_signatures
    const signingOrder = signers.map((s: any, idx: number) => ({
      order: idx + 1,
      name: s.name,
      email: s.email,
      role: s.role,
    }));

    await pool.query(
      `UPDATE digital_contracts
       SET status = 'pending_signatures',
           signing_order = $1,
           current_signer = 0,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(signingOrder), id]
    );

    res.json({
      success: true,
      message: `חוזה נשלח לחתימה ל-${signers.length} חותמים`,
      data: {
        contract_id: parseInt(id),
        signers: signatureRecords,
        signing_order: signingOrder,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בשליחה לחתימה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== POST /:id/sign - חתימה על חוזה =====
router.post("/:id/sign", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { signer_email, signature_data, ip_address, user_agent } = req.body;

    // מציאת רשומת החתימה
    const sigResult = await pool.query(
      `SELECT * FROM contract_signatures
       WHERE contract_id = $1 AND signer_email = $2 AND status = 'pending'
       LIMIT 1`,
      [id, signer_email]
    );

    if (sigResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "לא נמצאה חתימה ממתינה עבור כתובת דוא\"ל זו בחוזה הנוכחי",
      });
    }

    // עדכון החתימה
    const updatedSig = await pool.query(
      `UPDATE contract_signatures
       SET signature_data = $1,
           ip_address = $2,
           user_agent = $3,
           signed_at = NOW(),
           status = 'signed'
       WHERE id = $4
       RETURNING *`,
      [signature_data, ip_address, user_agent, sigResult.rows[0].id]
    );

    // בדיקה האם כל החתימות הושלמו
    const pendingCount = await pool.query(
      `SELECT COUNT(*) as count FROM contract_signatures
       WHERE contract_id = $1 AND status = 'pending'`,
      [id]
    );

    const allSigned = parseInt(pendingCount.rows[0].count) === 0;

    if (allSigned) {
      // כל החותמים חתמו - עדכון סטטוס החוזה
      await pool.query(
        `UPDATE digital_contracts
         SET all_signed = true,
             signed_date = NOW(),
             status = 'signed',
             updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
    } else {
      // קידום מונה החותם הנוכחי
      await pool.query(
        `UPDATE digital_contracts
         SET current_signer = current_signer + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
    }

    res.json({
      success: true,
      message: allSigned
        ? "כל החותמים חתמו - החוזה הושלם!"
        : `חתימה נרשמה בהצלחה. ממתינים ל-${pendingCount.rows[0].count} חותמים נוספים`,
      data: {
        signature: updatedSig.rows[0],
        all_signed: allSigned,
        remaining_signers: parseInt(pendingCount.rows[0].count),
      },
    });
  } catch (error: any) {
    console.error("שגיאה בחתימה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== GET /:id/status - סטטוס חתימות =====
router.get("/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const contractResult = await pool.query(
      `SELECT * FROM digital_contracts WHERE id = $1`,
      [id]
    );

    if (contractResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "חוזה לא נמצא" });
    }

    const signatures = await pool.query(
      `SELECT id, signer_name, signer_email, signer_role, signed_at, status, reminder_count
       FROM contract_signatures WHERE contract_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    const signed = signatures.rows.filter((s: any) => s.status === "signed");
    const pending = signatures.rows.filter((s: any) => s.status === "pending");

    res.json({
      success: true,
      data: {
        contract_id: parseInt(id),
        contract_status: contractResult.rows[0].status,
        all_signed: contractResult.rows[0].all_signed,
        total_signers: signatures.rows.length,
        signed_count: signed.length,
        pending_count: pending.length,
        signers: signatures.rows,
        signed: signed.map((s: any) => ({ name: s.signer_name, role: s.signer_role, signed_at: s.signed_at })),
        pending: pending.map((s: any) => ({ name: s.signer_name, role: s.signer_role, email: s.signer_email })),
      },
    });
  } catch (error: any) {
    console.error("שגיאה בבדיקת סטטוס חתימות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== POST /:id/remind - שליחת תזכורת לחותמים ממתינים =====
router.post("/:id/remind", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // עדכון מונה תזכורות לחותמים ממתינים
    const result = await pool.query(
      `UPDATE contract_signatures
       SET reminder_count = reminder_count + 1,
           last_reminder = NOW()
       WHERE contract_id = $1 AND status = 'pending'
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: "אין חותמים ממתינים - כל החתימות הושלמו",
      });
    }

    // עדכון דגל תזכורת בחוזה
    await pool.query(
      `UPDATE digital_contracts SET reminder_sent = true, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: `תזכורת נשלחה ל-${result.rows.length} חותמים ממתינים`,
      data: {
        reminded_signers: result.rows.map((s: any) => ({
          name: s.signer_name,
          email: s.signer_email,
          reminder_count: s.reminder_count,
        })),
      },
    });
  } catch (error: any) {
    console.error("שגיאה בשליחת תזכורת:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== GET /pending - חוזים ממתינים לחתימה =====
router.get("/pending", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT dc.*,
         (SELECT COUNT(*) FROM contract_signatures cs WHERE cs.contract_id = dc.id AND cs.status = 'pending') as pending_signatures,
         (SELECT COUNT(*) FROM contract_signatures cs WHERE cs.contract_id = dc.id AND cs.status = 'signed') as signed_signatures,
         (SELECT COUNT(*) FROM contract_signatures cs WHERE cs.contract_id = dc.id) as total_signatures
       FROM digital_contracts dc
       WHERE dc.status = 'pending_signatures'
       ORDER BY dc.created_at DESC`
    );

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת חוזים ממתינים:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== GET /expiring - חוזים שפגים בתוך 30 יום =====
router.get("/expiring", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT *,
         (expires_at - CURRENT_DATE) as days_until_expiry
       FROM digital_contracts
       WHERE expires_at IS NOT NULL
         AND expires_at <= CURRENT_DATE + INTERVAL '30 days'
         AND expires_at >= CURRENT_DATE
         AND status NOT IN ('archived', 'expired')
       ORDER BY expires_at ASC`
    );

    res.json({
      success: true,
      message: "חוזים שפגים בתוך 30 יום",
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת חוזים שפגים:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== GET /dashboard - לוח בקרה חוזים =====
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    // חוזים לפי סטטוס
    const byStatusResult = await pool.query(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total_value
       FROM digital_contracts
       GROUP BY status
       ORDER BY count DESC`
    );

    // חוזים שנחתמו החודש
    const signedThisMonthResult = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total_value
       FROM digital_contracts
       WHERE all_signed = true AND TO_CHAR(signed_date, 'YYYY-MM') = $1`,
      [currentMonth]
    );

    // חוזים ממתינים לחתימה
    const pendingResult = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total_value
       FROM digital_contracts
       WHERE status = 'pending_signatures'`
    );

    // חוזים שפגו
    const expiredResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM digital_contracts
       WHERE expires_at IS NOT NULL AND expires_at < CURRENT_DATE AND status NOT IN ('archived', 'expired')`
    );

    // חוזים לפי סוג
    const byTypeResult = await pool.query(
      `SELECT contract_type, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total_value
       FROM digital_contracts
       GROUP BY contract_type
       ORDER BY count DESC`
    );

    // חוזים שנוצרו החודש
    const createdThisMonthResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM digital_contracts
       WHERE TO_CHAR(created_at, 'YYYY-MM') = $1`,
      [currentMonth]
    );

    // תבניות פעילות
    const templatesResult = await pool.query(
      `SELECT COUNT(*) as count FROM contract_templates WHERE status = 'active'`
    );

    res.json({
      success: true,
      data: {
        month: currentMonth,
        by_status: byStatusResult.rows,
        signed_this_month: signedThisMonthResult.rows[0],
        pending_signatures: pendingResult.rows[0],
        expired: expiredResult.rows[0],
        by_type: byTypeResult.rows,
        created_this_month: createdThisMonthResult.rows[0],
        active_templates: templatesResult.rows[0],
      },
    });
  } catch (error: any) {
    console.error("שגיאה בלוח בקרה חוזים:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
