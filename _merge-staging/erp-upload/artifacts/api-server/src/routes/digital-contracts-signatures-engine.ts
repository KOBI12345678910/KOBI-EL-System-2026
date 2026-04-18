// =====================================================
// מנוע חוזים דיגיטליים, חתימות וניהול מסמכים
// מערכת חוזים מלאה למפעל מתכת - TechnoKoluzi
// =====================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';

const router = Router();

// =====================================================
// סוגי חוזים נתמכים
// =====================================================
const CONTRACT_TYPES = [
  'customer_agreement',
  'supplier_agreement',
  'employee_contract',
  'subcontractor_agreement',
  'nda',
  'service_agreement',
  'installation_agreement',
  'measurement_agreement'
] as const;

type ContractType = typeof CONTRACT_TYPES[number];

// =====================================================
// שמות סוגי חוזים בעברית
// =====================================================
const CONTRACT_TYPE_NAMES_HE: Record<string, string> = {
  customer_agreement: 'הסכם לקוח',
  supplier_agreement: 'הסכם ספק',
  employee_contract: 'חוזה עובד',
  subcontractor_agreement: 'הסכם קבלן משנה',
  nda: 'הסכם סודיות',
  service_agreement: 'הסכם שירות',
  installation_agreement: 'הסכם התקנה',
  measurement_agreement: 'הסכם מדידה'
};

// =====================================================
// סטטוסי חתימה
// =====================================================
const SIGNING_STATUSES = [
  'draft',
  'pending_review',
  'sent',
  'viewed',
  'signed',
  'countersigned',
  'completed',
  'expired',
  'cancelled'
] as const;

// =====================================================
// אתחול טבלאות חוזים דיגיטליים
// =====================================================
router.post('/init', async (_req: Request, res: Response) => {
  try {
    // טבלת חוזים דיגיטליים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS digital_contracts (
        id SERIAL PRIMARY KEY,
        contract_number VARCHAR UNIQUE,
        contract_type VARCHAR NOT NULL,
        title VARCHAR NOT NULL,
        title_he VARCHAR,
        party_type VARCHAR,
        party_id INTEGER,
        party_name VARCHAR,
        party_email VARCHAR,
        party_phone VARCHAR,
        party_id_number VARCHAR,
        template_id INTEGER,
        content TEXT,
        content_html TEXT,
        terms JSONB DEFAULT '[]',
        total_amount NUMERIC(15,2),
        currency VARCHAR DEFAULT 'ILS',
        valid_from DATE,
        valid_until DATE,
        auto_renew BOOLEAN DEFAULT false,
        renewal_period_days INTEGER,
        signing_status VARCHAR DEFAULT 'draft',
        sent_at TIMESTAMPTZ,
        viewed_at TIMESTAMPTZ,
        signed_at TIMESTAMPTZ,
        signer_ip VARCHAR,
        signer_device VARCHAR,
        signature_data TEXT,
        countersigned_at TIMESTAMPTZ,
        countersigned_by VARCHAR,
        attachments JSONB DEFAULT '[]',
        related_project_id INTEGER,
        related_deal_id INTEGER,
        audit_trail JSONB DEFAULT '[]',
        reminder_sent_count INTEGER DEFAULT 0,
        last_reminder_at TIMESTAMPTZ,
        notes TEXT,
        created_by VARCHAR,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // טבלת תבניות חוזים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contract_templates (
        id SERIAL PRIMARY KEY,
        template_name VARCHAR,
        template_name_he VARCHAR,
        contract_type VARCHAR,
        content_template TEXT,
        content_template_html TEXT,
        variables JSONB DEFAULT '[]',
        default_terms JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        version INTEGER DEFAULT 1,
        created_by VARCHAR,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // טבלת לוג חתימות
    await pool.query(`
      CREATE TABLE IF NOT EXISTS signature_log (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER REFERENCES digital_contracts(id),
        action VARCHAR NOT NULL,
        performed_by VARCHAR,
        performed_at TIMESTAMPTZ DEFAULT NOW(),
        ip_address VARCHAR,
        user_agent VARCHAR,
        details JSONB DEFAULT '{}'
      );
    `);

    // אינדקסים לשיפור ביצועים
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_dc_contract_type ON digital_contracts(contract_type);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_dc_signing_status ON digital_contracts(signing_status);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_dc_party_id ON digital_contracts(party_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_dc_party_type ON digital_contracts(party_type);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_dc_valid_until ON digital_contracts(valid_until);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ct_contract_type ON contract_templates(contract_type);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ct_is_active ON contract_templates(is_active);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sl_contract_id ON signature_log(contract_id);`);

    // הזנת תבניות ברירת מחדל למפעל מתכת
    await seedDefaultTemplates();

    res.json({ success: true, message: 'טבלאות חוזים דיגיטליים אותחלו בהצלחה עם תבניות ברירת מחדל' });
  } catch (error: any) {
    console.error('שגיאה באתחול טבלאות חוזים:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * הזנת תבניות ברירת מחדל למפעל מתכת
 * חוזה פרויקט ללקוח, הסכם מתקין, הסכם מסגרת עם ספק
 */
async function seedDefaultTemplates(): Promise<void> {
  // תבנית 1: חוזה פרויקט ללקוח - ברזל/אלומיניום/זכוכית
  const customerTemplate = await pool.query(
    `SELECT id FROM contract_templates WHERE template_name = 'customer_project_contract' AND is_active = true LIMIT 1`
  );
  if (customerTemplate.rows.length === 0) {
    await pool.query(`
      INSERT INTO contract_templates (template_name, template_name_he, contract_type, content_template, content_template_html, variables, default_terms, version, created_by)
      VALUES (
        'customer_project_contract',
        'חוזה פרויקט ללקוח',
        'customer_agreement',
        $1, $2, $3::jsonb, $4::jsonb, 1, 'system'
      )
    `, [
      // תוכן טקסט
      `חוזה מספר: {{contract_number}}
תאריך: {{date}}

בין: טכנוקולוזי בע"מ ("החברה")
לבין: {{customer_name}} ת.ז./ח.פ. {{customer_id_number}} ("הלקוח")
כתובת: {{customer_address}}
טלפון: {{customer_phone}}
דוא"ל: {{customer_email}}

הואיל והחברה עוסקת בייצור והתקנת מוצרי מתכת - ברזל, אלומיניום וזכוכית;
והואיל והלקוח מעוניין בביצוע העבודות המפורטות להלן;

לפיכך הוסכם כדלקמן:

1. תיאור העבודה
{{products_description}}

2. מחיר
סה"כ לתשלום: {{total_amount}} ₪ (כולל מע"מ)
תנאי תשלום: {{payment_terms}}

3. לוח זמנים
תאריך מדידה: {{measurement_date}}
משך ייצור משוער: {{production_days}} ימי עבודה
תאריך התקנה משוער: {{installation_date}}

4. אחריות
החברה מעניקה אחריות של {{warranty_months}} חודשים מיום ההתקנה.

5. תנאים נוספים
{{additional_terms}}

חתימת החברה: _____________  תאריך: _______
חתימת הלקוח: _____________  תאריך: _______`,
      // תוכן HTML
      `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
<h1 style="text-align: center;">חוזה פרויקט מספר {{contract_number}}</h1>
<p style="text-align: center;">תאריך: {{date}}</p>
<hr/>
<h3>הצדדים</h3>
<p><strong>בין:</strong> טכנוקולוזי בע"מ ("החברה")</p>
<p><strong>לבין:</strong> {{customer_name}} ת.ז./ח.פ. {{customer_id_number}} ("הלקוח")</p>
<p>כתובת: {{customer_address}} | טלפון: {{customer_phone}} | דוא"ל: {{customer_email}}</p>
<hr/>
<h3>1. תיאור העבודה</h3>
<p>{{products_description}}</p>
<h3>2. מחיר</h3>
<p>סה"כ: <strong>{{total_amount}} ₪</strong> (כולל מע"מ)</p>
<p>תנאי תשלום: {{payment_terms}}</p>
<h3>3. לוח זמנים</h3>
<table border="1" cellpadding="8"><tr><td>מדידה</td><td>{{measurement_date}}</td></tr>
<tr><td>ייצור</td><td>{{production_days}} ימי עבודה</td></tr>
<tr><td>התקנה</td><td>{{installation_date}}</td></tr></table>
<h3>4. אחריות</h3>
<p>{{warranty_months}} חודשים מיום ההתקנה</p>
<h3>5. תנאים נוספים</h3>
<p>{{additional_terms}}</p>
<hr/>
<div style="display: flex; justify-content: space-between; margin-top: 40px;">
<div><p>חתימת החברה: _____________</p><p>תאריך: _______</p></div>
<div><p>חתימת הלקוח: _____________</p><p>תאריך: _______</p></div>
</div></div>`,
      // משתנים
      JSON.stringify([
        'contract_number', 'date', 'customer_name', 'customer_id_number',
        'customer_address', 'customer_phone', 'customer_email',
        'products_description', 'total_amount', 'payment_terms',
        'measurement_date', 'production_days', 'installation_date',
        'warranty_months', 'additional_terms'
      ]),
      // תנאים ברירת מחדל
      JSON.stringify([
        { term: 'ביטול עסקה תוך 14 יום מיום החתימה ללא עלות', term_en: 'Cancellation within 14 days at no cost' },
        { term: 'שינויים בהזמנה לאחר תחילת ייצור יחויבו בעלות נוספת', term_en: 'Changes after production start incur additional costs' },
        { term: 'האחריות אינה מכסה נזקי שימוש לא סביר', term_en: 'Warranty does not cover unreasonable use damage' },
        { term: 'מועד ההתקנה כפוף לתנאי מזג אוויר', term_en: 'Installation date subject to weather conditions' }
      ])
    ]);
  }

  // תבנית 2: הסכם מתקין
  const installerTemplate = await pool.query(
    `SELECT id FROM contract_templates WHERE template_name = 'installer_agreement' AND is_active = true LIMIT 1`
  );
  if (installerTemplate.rows.length === 0) {
    await pool.query(`
      INSERT INTO contract_templates (template_name, template_name_he, contract_type, content_template, content_template_html, variables, default_terms, version, created_by)
      VALUES (
        'installer_agreement',
        'הסכם מתקין',
        'installation_agreement',
        $1, $2, $3::jsonb, $4::jsonb, 1, 'system'
      )
    `, [
      `הסכם התקנה מספר: {{contract_number}}
תאריך: {{date}}

בין: טכנוקולוזי בע"מ ("החברה")
לבין: {{installer_name}} ת.ז. {{installer_id_number}} ("המתקין")
טלפון: {{installer_phone}}

1. תיאור העבודה
המתקין יבצע התקנת {{product_type}} בכתובת: {{installation_address}}
פרויקט: {{project_number}}

2. תמורה
סכום: {{installation_fee}} ₪
תנאי תשלום: {{payment_terms}}

3. לוח זמנים
תאריך התקנה: {{installation_date}}
משך משוער: {{estimated_hours}} שעות

4. אחריות המתקין
המתקין אחראי לטיב העבודה למשך {{warranty_months}} חודשים.

5. ביטוח
המתקין מצהיר כי יש ברשותו ביטוח צד ג' תקף.

חתימת החברה: _____________
חתימת המתקין: _____________`,
      `<div dir="rtl"><h2>הסכם התקנה {{contract_number}}</h2>
<p>{{date}}</p>
<p><strong>בין:</strong> טכנוקולוזי בע"מ <strong>לבין:</strong> {{installer_name}}</p>
<h3>העבודה</h3><p>התקנת {{product_type}} - {{installation_address}}</p>
<h3>תמורה</h3><p>{{installation_fee}} ₪ - {{payment_terms}}</p>
<h3>מועד</h3><p>{{installation_date}} - {{estimated_hours}} שעות</p></div>`,
      JSON.stringify([
        'contract_number', 'date', 'installer_name', 'installer_id_number',
        'installer_phone', 'product_type', 'installation_address',
        'project_number', 'installation_fee', 'payment_terms',
        'installation_date', 'estimated_hours', 'warranty_months'
      ]),
      JSON.stringify([
        { term: 'המתקין אחראי לניקיון האתר לאחר ההתקנה', term_en: 'Installer responsible for site cleanup' },
        { term: 'איחור מעל שעה ידווח מראש', term_en: 'Delay over 1 hour must be reported in advance' },
        { term: 'ביטוח צד ג תקף נדרש', term_en: 'Valid third-party insurance required' }
      ])
    ]);
  }

  // תבנית 3: הסכם מסגרת עם ספק
  const supplierTemplate = await pool.query(
    `SELECT id FROM contract_templates WHERE template_name = 'supplier_framework' AND is_active = true LIMIT 1`
  );
  if (supplierTemplate.rows.length === 0) {
    await pool.query(`
      INSERT INTO contract_templates (template_name, template_name_he, contract_type, content_template, content_template_html, variables, default_terms, version, created_by)
      VALUES (
        'supplier_framework',
        'הסכם מסגרת ספק',
        'supplier_agreement',
        $1, $2, $3::jsonb, $4::jsonb, 1, 'system'
      )
    `, [
      `הסכם מסגרת ספק מספר: {{contract_number}}
תאריך: {{date}}

בין: טכנוקולוזי בע"מ ("החברה")
לבין: {{supplier_name}} ח.פ. {{supplier_id_number}} ("הספק")
כתובת: {{supplier_address}}
טלפון: {{supplier_phone}}
דוא"ל: {{supplier_email}}

1. מהות ההסכם
הספק יספק לחברה את חומרי הגלם/שירותים הבאים:
{{materials_description}}

2. תנאי מחיר
מחירון מצורף כנספח א'.
תנאי תשלום: {{payment_terms}}
מטבע: {{currency}}

3. תקופת ההסכם
מתאריך: {{valid_from}} עד: {{valid_until}}
חידוש אוטומטי: {{auto_renew}}

4. זמני אספקה
זמן אספקה סטנדרטי: {{delivery_days}} ימי עבודה
אספקה דחופה: {{urgent_delivery_days}} ימי עבודה (בתוספת {{urgent_surcharge}}%)

5. איכות
הספק מתחייב לעמוד בתקני האיכות הנדרשים.
בדיקת איכות תבוצע בקבלה.

חתימת החברה: _____________
חתימת הספק: _____________`,
      `<div dir="rtl"><h2>הסכם מסגרת ספק {{contract_number}}</h2>
<p>{{date}}</p>
<p><strong>ספק:</strong> {{supplier_name}} | {{supplier_phone}} | {{supplier_email}}</p>
<h3>חומרים</h3><p>{{materials_description}}</p>
<h3>מחיר ותשלום</h3><p>{{payment_terms}} | {{currency}}</p>
<h3>תקופה</h3><p>{{valid_from}} - {{valid_until}}</p>
<h3>אספקה</h3><p>רגילה: {{delivery_days}} ימים | דחופה: {{urgent_delivery_days}} ימים</p></div>`,
      JSON.stringify([
        'contract_number', 'date', 'supplier_name', 'supplier_id_number',
        'supplier_address', 'supplier_phone', 'supplier_email',
        'materials_description', 'payment_terms', 'currency',
        'valid_from', 'valid_until', 'auto_renew',
        'delivery_days', 'urgent_delivery_days', 'urgent_surcharge'
      ]),
      JSON.stringify([
        { term: 'הספק יעמוד בזמני אספקה מוסכמים', term_en: 'Supplier must meet agreed delivery times' },
        { term: 'פיצוי של 1% ליום עיכוב', term_en: '1% penalty per day of delay' },
        { term: 'החברה רשאית לבטל הזמנה עד 48 שעות לפני האספקה', term_en: 'Company may cancel order up to 48 hours before delivery' },
        { term: 'חומרים פגומים יוחלפו ללא עלות', term_en: 'Defective materials replaced at no cost' }
      ])
    ]);
  }
}

// =====================================================
// יצירת חוזה חדש
// =====================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      contract_number, contract_type, title, title_he, party_type, party_id,
      party_name, party_email, party_phone, party_id_number, template_id,
      content, content_html, terms, total_amount, currency, valid_from,
      valid_until, auto_renew, renewal_period_days, attachments,
      related_project_id, related_deal_id, notes, created_by
    } = req.body;

    // יצירת מספר חוזה אוטומטי אם לא סופק
    const contractNum = contract_number || `CTR-${Date.now()}`;

    // רישום פעולה ביומן ביקורת
    const auditEntry = [{
      action: 'created',
      by: created_by || 'system',
      at: new Date().toISOString(),
      details: 'חוזה נוצר'
    }];

    const result = await pool.query(`
      INSERT INTO digital_contracts (
        contract_number, contract_type, title, title_he, party_type, party_id,
        party_name, party_email, party_phone, party_id_number, template_id,
        content, content_html, terms, total_amount, currency, valid_from,
        valid_until, auto_renew, renewal_period_days, attachments,
        related_project_id, related_deal_id, audit_trail, notes, created_by,
        created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,
        $21::jsonb,$22,$23,$24::jsonb,$25,$26,NOW(),NOW()
      )
      RETURNING *
    `, [
      contractNum, contract_type, title, title_he, party_type, party_id,
      party_name, party_email, party_phone, party_id_number, template_id,
      content, content_html, JSON.stringify(terms || []), total_amount,
      currency || 'ILS', valid_from, valid_until, auto_renew || false,
      renewal_period_days, JSON.stringify(attachments || []),
      related_project_id, related_deal_id, JSON.stringify(auditEntry),
      notes, created_by
    ]);

    // רישום בלוג חתימות
    await pool.query(`
      INSERT INTO signature_log (contract_id, action, performed_by, details)
      VALUES ($1, 'contract_created', $2, $3::jsonb)
    `, [result.rows[0].id, created_by || 'system', JSON.stringify({ contract_type, title })]);

    res.json({ success: true, data: result.rows[0], message: 'חוזה נוצר בהצלחה' });
  } catch (error: any) {
    console.error('שגיאה ביצירת חוזה:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// קבלת כל החוזים - עם סינון ועימוד
// =====================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const { contract_type, signing_status, party_type, search, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (contract_type) {
      conditions.push(`contract_type = $${paramIdx++}`);
      params.push(contract_type);
    }
    if (signing_status) {
      conditions.push(`signing_status = $${paramIdx++}`);
      params.push(signing_status);
    }
    if (party_type) {
      conditions.push(`party_type = $${paramIdx++}`);
      params.push(party_type);
    }
    if (search) {
      conditions.push(`(title ILIKE $${paramIdx} OR party_name ILIKE $${paramIdx} OR contract_number ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await pool.query(`SELECT COUNT(*) FROM digital_contracts ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(Number(limit));
    params.push(offset);
    const result = await pool.query(`
      SELECT * FROM digital_contracts ${where}
      ORDER BY updated_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `, params);

    res.json({ success: true, data: result.rows, total, page: Number(page), limit: Number(limit) });
  } catch (error: any) {
    console.error('שגיאה בשליפת חוזים:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// קבלת חוזה בודד
// =====================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM digital_contracts WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'חוזה לא נמצא' });
    }

    // שליפת לוג חתימות
    const signLog = await pool.query(
      'SELECT * FROM signature_log WHERE contract_id = $1 ORDER BY performed_at ASC', [id]
    );

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        signature_log: signLog.rows
      }
    });
  } catch (error: any) {
    console.error('שגיאה בשליפת חוזה:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// עדכון חוזה
// =====================================================
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    const keys = Object.keys(fields).filter(k => k !== 'id');
    if (keys.length === 0) {
      return res.status(400).json({ success: false, message: 'לא סופקו שדות לעדכון' });
    }

    const setClauses = keys.map((key, i) => {
      if (['terms', 'attachments', 'audit_trail'].includes(key)) {
        return `${key} = $${i + 1}::jsonb`;
      }
      return `${key} = $${i + 1}`;
    });
    setClauses.push('updated_at = NOW()');

    const values = keys.map(k => {
      const val = fields[k];
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    });
    values.push(id);

    const result = await pool.query(`
      UPDATE digital_contracts
      SET ${setClauses.join(', ')}
      WHERE id = $${values.length}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'חוזה לא נמצא' });
    }

    // רישום ביומן ביקורת
    await addAuditEntry(parseInt(id), 'updated', fields.updated_by || 'system', 'חוזה עודכן');

    res.json({ success: true, data: result.rows[0], message: 'חוזה עודכן בהצלחה' });
  } catch (error: any) {
    console.error('שגיאה בעדכון חוזה:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// מחיקת חוזה (סימון כמבוטל - לא מחיקה פיזית)
// =====================================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // לא מוחקים - רק מסמנים כמבוטל
    const result = await pool.query(`
      UPDATE digital_contracts
      SET signing_status = 'cancelled',
          notes = COALESCE(notes, '') || E'\n[בוטל] ' || NOW()::TEXT,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'חוזה לא נמצא' });
    }

    await addAuditEntry(parseInt(id), 'cancelled', 'system', 'חוזה בוטל');

    res.json({ success: true, data: result.rows[0], message: 'חוזה סומן כמבוטל' });
  } catch (error: any) {
    console.error('שגיאה בביטול חוזה:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// יצירת חוזה מתבנית - מילוי משתנים
// =====================================================
router.post('/generate-from-template/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const { variables, party_type, party_id, party_name, party_email,
            party_phone, party_id_number, total_amount, valid_from,
            valid_until, related_project_id, related_deal_id, created_by } = req.body;

    // שליפת תבנית
    const template = await pool.query('SELECT * FROM contract_templates WHERE id = $1 AND is_active = true', [templateId]);
    if (template.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'תבנית לא נמצאה או לא פעילה' });
    }

    const tmpl = template.rows[0];
    const vars = variables || {};

    // מילוי משתנים בתבנית
    let content = tmpl.content_template || '';
    let contentHtml = tmpl.content_template_html || '';

    // החלפת כל המשתנים בערכים שסופקו
    for (const [key, value] of Object.entries(vars)) {
      const placeholder = `{{${key}}}`;
      content = content.split(placeholder).join(String(value));
      contentHtml = contentHtml.split(placeholder).join(String(value));
    }

    // יצירת מספר חוזה אוטומטי
    const contractNumber = `CTR-${tmpl.contract_type.substring(0, 3).toUpperCase()}-${Date.now()}`;

    // יצירת החוזה מהתבנית
    const result = await pool.query(`
      INSERT INTO digital_contracts (
        contract_number, contract_type, title, title_he, party_type, party_id,
        party_name, party_email, party_phone, party_id_number, template_id,
        content, content_html, terms, total_amount, currency, valid_from,
        valid_until, related_project_id, related_deal_id, audit_trail,
        created_by, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,'ILS',$16,$17,$18,$19,
        $20::jsonb,$21,NOW(),NOW()
      )
      RETURNING *
    `, [
      contractNumber, tmpl.contract_type,
      tmpl.template_name, tmpl.template_name_he,
      party_type, party_id, party_name, party_email, party_phone, party_id_number,
      tmpl.id, content, contentHtml,
      JSON.stringify(tmpl.default_terms || []),
      total_amount, valid_from, valid_until,
      related_project_id, related_deal_id,
      JSON.stringify([{
        action: 'generated_from_template',
        by: created_by || 'system',
        at: new Date().toISOString(),
        details: `נוצר מתבנית: ${tmpl.template_name_he} (v${tmpl.version})`
      }]),
      created_by || 'system'
    ]);

    // רישום בלוג
    await pool.query(`
      INSERT INTO signature_log (contract_id, action, performed_by, details)
      VALUES ($1, 'generated_from_template', $2, $3::jsonb)
    `, [result.rows[0].id, created_by || 'system', JSON.stringify({ template_id: tmpl.id, template_name: tmpl.template_name })]);

    res.json({
      success: true,
      data: result.rows[0],
      template_used: tmpl.template_name_he,
      message: `חוזה נוצר בהצלחה מתבנית: ${tmpl.template_name_he}`
    });
  } catch (error: any) {
    console.error('שגיאה ביצירת חוזה מתבנית:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// שליחה לחתימה - סימון כנשלח
// =====================================================
router.post('/send-for-signature/:contractId', async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;
    const { sent_by, send_method } = req.body;

    const contract = await pool.query('SELECT * FROM digital_contracts WHERE id = $1', [contractId]);
    if (contract.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'חוזה לא נמצא' });
    }

    // וידוא שהחוזה במצב שמאפשר שליחה
    if (!['draft', 'pending_review'].includes(contract.rows[0].signing_status)) {
      return res.status(400).json({
        success: false,
        message: `לא ניתן לשלוח חוזה במצב ${contract.rows[0].signing_status}`
      });
    }

    const result = await pool.query(`
      UPDATE digital_contracts
      SET signing_status = 'sent',
          sent_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [contractId]);

    // רישום ביומן ביקורת ולוג חתימות
    await addAuditEntry(parseInt(contractId), 'sent_for_signature', sent_by || 'system',
      `חוזה נשלח לחתימה ל-${contract.rows[0].party_name} (${send_method || 'email'})`);

    await pool.query(`
      INSERT INTO signature_log (contract_id, action, performed_by, details)
      VALUES ($1, 'sent_for_signature', $2, $3::jsonb)
    `, [contractId, sent_by || 'system', JSON.stringify({
      party_name: contract.rows[0].party_name,
      party_email: contract.rows[0].party_email,
      send_method: send_method || 'email'
    })]);

    res.json({
      success: true,
      data: result.rows[0],
      message: `חוזה נשלח לחתימה ל-${contract.rows[0].party_name}`
    });
  } catch (error: any) {
    console.error('שגיאה בשליחת חוזה לחתימה:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// רישום חתימה - עם IP, מכשיר וחותמת זמן
// =====================================================
router.post('/record-signature/:contractId', async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;
    const { signature_data, signer_ip, signer_device, signer_name } = req.body;

    const contract = await pool.query('SELECT * FROM digital_contracts WHERE id = $1', [contractId]);
    if (contract.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'חוזה לא נמצא' });
    }

    // וידוא שהחוזה במצב שמאפשר חתימה
    if (!['sent', 'viewed'].includes(contract.rows[0].signing_status)) {
      return res.status(400).json({
        success: false,
        message: `לא ניתן לחתום על חוזה במצב ${contract.rows[0].signing_status}`
      });
    }

    // לכידת IP מהבקשה אם לא סופק
    const ip = signer_ip || req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const device = signer_device || req.headers['user-agent'] || 'unknown';

    const result = await pool.query(`
      UPDATE digital_contracts
      SET signing_status = 'signed',
          signed_at = NOW(),
          signer_ip = $1,
          signer_device = $2,
          signature_data = $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [ip, device, signature_data, contractId]);

    // רישום בלוג חתימות עם כל הפרטים
    await pool.query(`
      INSERT INTO signature_log (contract_id, action, performed_by, ip_address, user_agent, details)
      VALUES ($1, 'signed', $2, $3, $4, $5::jsonb)
    `, [
      contractId,
      signer_name || contract.rows[0].party_name,
      ip, device,
      JSON.stringify({
        signed_at: new Date().toISOString(),
        has_signature_data: !!signature_data
      })
    ]);

    await addAuditEntry(parseInt(contractId), 'signed',
      signer_name || contract.rows[0].party_name,
      `חוזה נחתם. IP: ${ip}`);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'חתימה נרשמה בהצלחה'
    });
  } catch (error: any) {
    console.error('שגיאה ברישום חתימה:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// חתימה נגדית - אישור מצד החברה
// =====================================================
router.post('/countersign/:contractId', async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;
    const { countersigned_by, ip_address } = req.body;

    const contract = await pool.query('SELECT * FROM digital_contracts WHERE id = $1', [contractId]);
    if (contract.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'חוזה לא נמצא' });
    }

    if (contract.rows[0].signing_status !== 'signed') {
      return res.status(400).json({
        success: false,
        message: 'חתימה נגדית אפשרית רק לאחר חתימת הצד השני'
      });
    }

    const ip = ip_address || req.ip || 'unknown';

    const result = await pool.query(`
      UPDATE digital_contracts
      SET signing_status = 'countersigned',
          countersigned_at = NOW(),
          countersigned_by = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [countersigned_by, contractId]);

    await pool.query(`
      INSERT INTO signature_log (contract_id, action, performed_by, ip_address, user_agent, details)
      VALUES ($1, 'countersigned', $2, $3, $4, $5::jsonb)
    `, [
      contractId, countersigned_by, ip,
      req.headers['user-agent'] || 'unknown',
      JSON.stringify({ countersigned_at: new Date().toISOString() })
    ]);

    await addAuditEntry(parseInt(contractId), 'countersigned', countersigned_by,
      `חתימה נגדית בוצעה על ידי ${countersigned_by}`);

    res.json({
      success: true,
      data: result.rows[0],
      message: `חתימה נגדית נרשמה בהצלחה על ידי ${countersigned_by}`
    });
  } catch (error: any) {
    console.error('שגיאה בחתימה נגדית:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// חוזים ממתינים לחתימה
// =====================================================
router.get('/pending-signatures', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT dc.*,
        EXTRACT(DAY FROM NOW() - dc.sent_at) as days_since_sent,
        dc.reminder_sent_count
      FROM digital_contracts dc
      WHERE dc.signing_status IN ('sent', 'viewed')
      ORDER BY dc.sent_at ASC
    `);

    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error: any) {
    console.error('שגיאה בשליפת חוזים ממתינים:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// חוזים שפגים בקרוב - תוך 30 יום
// =====================================================
router.get('/expiring-soon', async (req: Request, res: Response) => {
  try {
    const { days = 30 } = req.query;

    const result = await pool.query(`
      SELECT *,
        valid_until - CURRENT_DATE as days_until_expiry,
        CASE WHEN auto_renew THEN 'יחודש אוטומטית' ELSE 'לא יחודש' END as renewal_status_he
      FROM digital_contracts
      WHERE valid_until IS NOT NULL
        AND valid_until <= CURRENT_DATE + $1::INTEGER
        AND valid_until >= CURRENT_DATE
        AND signing_status NOT IN ('cancelled', 'expired')
      ORDER BY valid_until ASC
    `, [Number(days)]);

    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error: any) {
    console.error('שגיאה בשליפת חוזים שפגים בקרוב:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// לוח בקרה - סטטיסטיקות חוזים
// =====================================================
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    // לפי סוג חוזה
    const byType = await pool.query(`
      SELECT contract_type, COUNT(*) as count,
             SUM(total_amount) as total_value
      FROM digital_contracts
      WHERE signing_status != 'cancelled'
      GROUP BY contract_type
    `);

    // לפי סטטוס חתימה
    const byStatus = await pool.query(`
      SELECT signing_status, COUNT(*) as count
      FROM digital_contracts
      GROUP BY signing_status
    `);

    // סיכומים כלליים
    const totals = await pool.query(`
      SELECT
        COUNT(*) as total_contracts,
        COUNT(*) FILTER (WHERE signing_status = 'signed' OR signing_status = 'countersigned' OR signing_status = 'completed') as signed_contracts,
        COUNT(*) FILTER (WHERE signing_status IN ('sent', 'viewed')) as pending_contracts,
        COUNT(*) FILTER (WHERE signing_status = 'draft') as draft_contracts,
        COUNT(*) FILTER (WHERE signing_status = 'cancelled') as cancelled_contracts,
        SUM(total_amount) FILTER (WHERE signing_status NOT IN ('cancelled', 'expired')) as total_value,
        COUNT(*) FILTER (WHERE valid_until IS NOT NULL AND valid_until <= CURRENT_DATE + 30 AND valid_until >= CURRENT_DATE) as expiring_soon,
        AVG(EXTRACT(DAY FROM signed_at - sent_at)) FILTER (WHERE signed_at IS NOT NULL AND sent_at IS NOT NULL) as avg_days_to_sign
      FROM digital_contracts
    `);

    // חוזים אחרונים
    const recent = await pool.query(`
      SELECT id, contract_number, title, title_he, party_name, signing_status,
             total_amount, created_at
      FROM digital_contracts
      ORDER BY created_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        by_type: byType.rows.map(r => ({
          ...r,
          type_he: CONTRACT_TYPE_NAMES_HE[r.contract_type] || r.contract_type
        })),
        by_status: byStatus.rows,
        totals: totals.rows[0],
        recent_contracts: recent.rows
      }
    });
  } catch (error: any) {
    console.error('שגיאה בשליפת לוח בקרה חוזים:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// שליחת תזכורת לחתימה
// =====================================================
router.post('/send-reminder/:contractId', async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;
    const { sent_by, reminder_method } = req.body;

    const contract = await pool.query('SELECT * FROM digital_contracts WHERE id = $1', [contractId]);
    if (contract.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'חוזה לא נמצא' });
    }

    if (!['sent', 'viewed'].includes(contract.rows[0].signing_status)) {
      return res.status(400).json({
        success: false,
        message: 'תזכורת רלוונטית רק לחוזים שנשלחו ולא נחתמו'
      });
    }

    const result = await pool.query(`
      UPDATE digital_contracts
      SET reminder_sent_count = COALESCE(reminder_sent_count, 0) + 1,
          last_reminder_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [contractId]);

    await pool.query(`
      INSERT INTO signature_log (contract_id, action, performed_by, details)
      VALUES ($1, 'reminder_sent', $2, $3::jsonb)
    `, [
      contractId,
      sent_by || 'system',
      JSON.stringify({
        reminder_number: result.rows[0].reminder_sent_count,
        method: reminder_method || 'email',
        party_name: contract.rows[0].party_name,
        party_email: contract.rows[0].party_email
      })
    ]);

    await addAuditEntry(parseInt(contractId), 'reminder_sent', sent_by || 'system',
      `תזכורת #${result.rows[0].reminder_sent_count} נשלחה ל-${contract.rows[0].party_name}`);

    res.json({
      success: true,
      data: result.rows[0],
      message: `תזכורת #${result.rows[0].reminder_sent_count} נשלחה ל-${contract.rows[0].party_name}`
    });
  } catch (error: any) {
    console.error('שגיאה בשליחת תזכורת:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// יומן ביקורת של חוזה
// =====================================================
router.get('/audit-trail/:contractId', async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;

    // שליפת יומן מטבלת לוג חתימות
    const signatureLog = await pool.query(`
      SELECT * FROM signature_log
      WHERE contract_id = $1
      ORDER BY performed_at ASC
    `, [contractId]);

    // שליפת יומן מהחוזה עצמו
    const contract = await pool.query(`
      SELECT audit_trail, contract_number, title
      FROM digital_contracts WHERE id = $1
    `, [contractId]);

    if (contract.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'חוזה לא נמצא' });
    }

    res.json({
      success: true,
      data: {
        contract_number: contract.rows[0].contract_number,
        title: contract.rows[0].title,
        audit_trail: contract.rows[0].audit_trail || [],
        signature_log: signatureLog.rows,
        total_events: signatureLog.rows.length
      }
    });
  } catch (error: any) {
    console.error('שגיאה בשליפת יומן ביקורת:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// כל החוזים של צד מסוים (לקוח/ספק/עובד)
// =====================================================
router.get('/party-contracts/:partyType/:partyId', async (req: Request, res: Response) => {
  try {
    const { partyType, partyId } = req.params;

    const result = await pool.query(`
      SELECT * FROM digital_contracts
      WHERE party_type = $1 AND party_id = $2
      ORDER BY created_at DESC
    `, [partyType, partyId]);

    // סיכום לפי סטטוס
    const summary = await pool.query(`
      SELECT signing_status, COUNT(*) as count, SUM(total_amount) as total_value
      FROM digital_contracts
      WHERE party_type = $1 AND party_id = $2
      GROUP BY signing_status
    `, [partyType, partyId]);

    res.json({
      success: true,
      data: result.rows,
      summary: summary.rows,
      total: result.rows.length,
      party_type: partyType,
      party_id: partyId
    });
  } catch (error: any) {
    console.error('שגיאה בשליפת חוזים לפי צד:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// קבלת כל התבניות
// =====================================================
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const { contract_type, active_only } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (contract_type) {
      conditions.push(`contract_type = $${paramIdx++}`);
      params.push(contract_type);
    }
    if (active_only !== 'false') {
      conditions.push(`is_active = true`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(`SELECT * FROM contract_templates ${where} ORDER BY created_at DESC`, params);

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('שגיאה בשליפת תבניות:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// יצירת תבנית חדשה
// =====================================================
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const {
      template_name, template_name_he, contract_type, content_template,
      content_template_html, variables, default_terms, created_by
    } = req.body;

    const result = await pool.query(`
      INSERT INTO contract_templates (
        template_name, template_name_he, contract_type, content_template,
        content_template_html, variables, default_terms, created_by,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,NOW(),NOW())
      RETURNING *
    `, [
      template_name, template_name_he, contract_type, content_template,
      content_template_html, JSON.stringify(variables || []),
      JSON.stringify(default_terms || []), created_by
    ]);

    res.json({ success: true, data: result.rows[0], message: 'תבנית נוצרה בהצלחה' });
  } catch (error: any) {
    console.error('שגיאה ביצירת תבנית:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// עדכון תבנית
// =====================================================
router.put('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      template_name, template_name_he, contract_type, content_template,
      content_template_html, variables, default_terms, is_active
    } = req.body;

    // העלאת גרסה בכל עדכון תוכן
    const result = await pool.query(`
      UPDATE contract_templates
      SET template_name = COALESCE($1, template_name),
          template_name_he = COALESCE($2, template_name_he),
          contract_type = COALESCE($3, contract_type),
          content_template = COALESCE($4, content_template),
          content_template_html = COALESCE($5, content_template_html),
          variables = COALESCE($6::jsonb, variables),
          default_terms = COALESCE($7::jsonb, default_terms),
          is_active = COALESCE($8, is_active),
          version = version + 1,
          updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `, [
      template_name, template_name_he, contract_type, content_template,
      content_template_html,
      variables ? JSON.stringify(variables) : null,
      default_terms ? JSON.stringify(default_terms) : null,
      is_active, id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'תבנית לא נמצאה' });
    }

    res.json({ success: true, data: result.rows[0], message: 'תבנית עודכנה בהצלחה' });
  } catch (error: any) {
    console.error('שגיאה בעדכון תבנית:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// פונקציות עזר פנימיות
// =====================================================

/**
 * הוספת רשומה ליומן הביקורת של חוזה
 */
async function addAuditEntry(contractId: number, action: string, performedBy: string, details: string): Promise<void> {
  try {
    // הוספה ליומן ביקורת בחוזה
    const entry = {
      action,
      by: performedBy,
      at: new Date().toISOString(),
      details
    };

    await pool.query(`
      UPDATE digital_contracts
      SET audit_trail = COALESCE(audit_trail, '[]'::jsonb) || $1::jsonb
      WHERE id = $2
    `, [JSON.stringify([entry]), contractId]);

    // רישום בטבלת לוג חתימות
    await pool.query(`
      INSERT INTO signature_log (contract_id, action, performed_by, details)
      VALUES ($1, $2, $3, $4::jsonb)
    `, [contractId, action, performedBy, JSON.stringify({ details })]);
  } catch (error) {
    console.error('שגיאה ברישום ביומן ביקורת:', error);
  }
}

export default router;
