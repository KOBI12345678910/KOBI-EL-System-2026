// ============================================================
// Customer Service AI Engine - מנוע AI לשירות לקוחות
// ניהול פניות, כרטיסי שירות, מאגר ידע ו-SLA
// עם קטגוריזציה אוטומטית וניתוח סנטימנט
// ============================================================

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ============================================================
// POST /init - יצירת טבלאות ונתוני התחלה
// ============================================================
router.post("/init", async (_req: Request, res: Response) => {
  try {
    // יצירת טבלת כרטיסי שירות
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_tickets (
        id SERIAL PRIMARY KEY,
        ticket_number VARCHAR(50) UNIQUE,
        customer_id INTEGER,
        customer_name VARCHAR(255),
        customer_phone VARCHAR(50),
        customer_email VARCHAR(100),
        project_id INTEGER,
        project_name VARCHAR(255),
        channel VARCHAR(30) DEFAULT 'phone',
        category VARCHAR(50),
        subcategory VARCHAR(50),
        priority VARCHAR(20) DEFAULT 'medium',
        subject VARCHAR(255),
        description TEXT,
        ai_summary TEXT,
        ai_sentiment VARCHAR(20),
        ai_suggested_solution TEXT,
        ai_category_confidence NUMERIC(3,2),
        assigned_to_id INTEGER,
        assigned_to_name VARCHAR(255),
        department VARCHAR(100),
        sla_response_hours INTEGER,
        sla_resolve_hours INTEGER,
        first_response_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        resolution TEXT,
        satisfaction_score INTEGER,
        satisfaction_feedback TEXT,
        reopened_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'open',
        tags JSONB DEFAULT '[]',
        attachments JSONB DEFAULT '[]',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת טבלת תגובות לכרטיסים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_ticket_comments (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES service_tickets(id),
        author_name VARCHAR(255),
        author_role VARCHAR(50),
        content TEXT,
        is_internal BOOLEAN DEFAULT false,
        is_ai_generated BOOLEAN DEFAULT false,
        attachments JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת טבלת מאגר ידע
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_knowledge_base (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        title_he VARCHAR(255),
        category VARCHAR(50),
        subcategory VARCHAR(50),
        problem_description TEXT,
        solution TEXT,
        solution_he TEXT,
        keywords JSONB DEFAULT '[]',
        helpful_count INTEGER DEFAULT 0,
        not_helpful_count INTEGER DEFAULT 0,
        auto_suggest BOOLEAN DEFAULT true,
        status VARCHAR(20) DEFAULT 'published',
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת טבלת הגדרות SLA
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_sla_config (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50),
        priority VARCHAR(20),
        response_hours INTEGER,
        resolve_hours INTEGER,
        escalation_after_hours INTEGER,
        notify_manager BOOLEAN DEFAULT true,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת אינדקסים לביצועים מיטביים
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_svc_tickets_status ON service_tickets(status);
      CREATE INDEX IF NOT EXISTS idx_svc_tickets_category ON service_tickets(category);
      CREATE INDEX IF NOT EXISTS idx_svc_tickets_priority ON service_tickets(priority);
      CREATE INDEX IF NOT EXISTS idx_svc_tickets_assigned ON service_tickets(assigned_to_id);
      CREATE INDEX IF NOT EXISTS idx_svc_tickets_customer ON service_tickets(customer_id);
      CREATE INDEX IF NOT EXISTS idx_svc_tickets_created ON service_tickets(created_at);
      CREATE INDEX IF NOT EXISTS idx_svc_tickets_number ON service_tickets(ticket_number);
      CREATE INDEX IF NOT EXISTS idx_svc_comments_ticket ON service_ticket_comments(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_svc_kb_category ON service_knowledge_base(category);
      CREATE INDEX IF NOT EXISTS idx_svc_kb_status ON service_knowledge_base(status);
      CREATE INDEX IF NOT EXISTS idx_svc_sla_cat_pri ON service_sla_config(category, priority);
    `);

    // זריעת 12 מאמרי מאגר ידע - בעיות נפוצות במפעל מתכת
    const knowledgeArticles = [
      {
        title: "Rusted Gate",
        title_he: "שער חלוד",
        category: "quality_complaint",
        subcategory: "rust",
        problem: "לקוח מדווח על חלודה בשער מתכת שהותקן לאחרונה. החלודה מופיעה בדרך כלל באזורים חשופים ללחות.",
        solution: "Inspect the gate for rust damage. Sand the affected area, apply rust converter, prime with anti-rust primer, and repaint with weather-resistant paint.",
        solution_he: "לבדוק את השער לנזקי חלודה. לשייף את האזור הפגוע, למרוח ממיר חלודה, לצבוע יסוד עם פריימר נגד חלודה, ולצבוע מחדש עם צבע עמיד למזג אוויר. אם הנזק נרחב - להחליף את הפאנל.",
        keywords: '["חלודה","שער","rust","gate","התחמצנות","שיוף"]',
      },
      {
        title: "Crooked Railing",
        title_he: "מעקה עקום",
        category: "installation_issue",
        subcategory: "alignment",
        problem: "מעקה שהותקן לא ישר, ניכרת עקמומיות או אי-יישור עם הקיר/מדרגות.",
        solution: "Send an installation team to reassess the railing alignment. Use a laser level to verify. Loosen mounting bolts, realign, and re-tighten.",
        solution_he: "לשלוח צוות התקנה לבדיקה מחדש של יישור המעקה. להשתמש בפלס לייזר לווידוא. לשחרר בורגי הרכבה, ליישר מחדש ולהדק. אם הבעיה מבנית - להחליף את התושבות.",
        keywords: '["מעקה","עקום","יישור","alignment","railing","פלס"]',
      },
      {
        title: "Glass Crack",
        title_he: "סדק בזכוכית",
        category: "quality_complaint",
        subcategory: "glass",
        problem: "סדק בזכוכית של מעקה, דלת או חלון. יכול להיות תוצאה של מכה, מתח תרמי או פגם ביצור.",
        solution: "Assess if the crack is a safety hazard. If tempered glass - must be fully replaced. If laminated - can be monitored short-term but replace within 2 weeks.",
        solution_he: "לבדוק אם הסדק מהווה סכנה בטיחותית. אם זכוכית מחוסמת - חובה להחליף במלואה. אם למינציה - ניתן לנטר לטווח קצר אך להחליף תוך שבועיים. לתעד לצורך אחריות.",
        keywords: '["זכוכית","סדק","שבר","glass","crack","מעקה זכוכית"]',
      },
      {
        title: "Paint Peeling",
        title_he: "התקלפות צבע",
        category: "quality_complaint",
        subcategory: "paint",
        problem: "צבע מתקלף ממוצרי מתכת - שערים, מעקות, גדרות. בדרך כלל בגלל הכנה לקויה של המשטח או צבע לא מתאים.",
        solution: "Sand the peeling area, clean thoroughly, apply etching primer, then two coats of high-quality outdoor metal paint.",
        solution_he: "לשייף את האזור המתקלף, לנקות היטב, למרוח פריימר חריטה, ואז שתי שכבות צבע מתכת חיצוני איכותי. לתת אחריות מורחבת של שנה על התיקון.",
        keywords: '["צבע","התקלפות","שיוף","paint","peeling","צביעה"]',
      },
      {
        title: "Measurement Error",
        title_he: "טעות מדידה",
        category: "installation_issue",
        subcategory: "measurement",
        problem: "מוצר שיוצר אינו תואם את המידות בשטח. פער בין המדידה ליצור.",
        solution: "Send a measurement engineer to re-measure. Compare with original measurements. If factory error - reproduce at no cost. If field changed - provide new quote.",
        solution_he: "לשלוח מהנדס מדידות למדידה מחדש. להשוות למדידות המקוריות. אם טעות מפעל - לייצר מחדש ללא עלות. אם השטח השתנה - לספק הצעת מחיר חדשה. לעדכן את הלקוח בלוח זמנים.",
        keywords: '["מדידה","טעות","מידות","measurement","error","פער"]',
      },
      {
        title: "Installation Delay",
        title_he: "עיכוב בהתקנה",
        category: "delivery_delay",
        subcategory: "scheduling",
        problem: "ההתקנה לא בוצעה במועד שתוכנן. עיכוב בייצור, בלוגיסטיקה או בזמינות צוות.",
        solution: "Check production status and logistics. Reschedule at earliest availability. Offer compensation if delay exceeds SLA.",
        solution_he: "לבדוק סטטוס ייצור ולוגיסטיקה. לתזמן מחדש במועד הקרוב ביותר. להציע פיצוי אם העיכוב חורג מה-SLA. לעדכן את הלקוח באופן יזום ולהתנצל.",
        keywords: '["עיכוב","התקנה","delay","installation","לוח זמנים","תזמון"]',
      },
      {
        title: "Wrong Color",
        title_he: "צבע שגוי",
        category: "quality_complaint",
        subcategory: "color",
        problem: "המוצר הגיע בצבע שונה ממה שהוזמן. אי-התאמה בין הדגימה לייצור.",
        solution: "Compare delivered product with order specification. If wrong - repaint or reproduce. Always use RAL color reference.",
        solution_he: "להשוות את המוצר שסופק למפרט ההזמנה. אם הצבע שגוי - לצבוע מחדש או לייצר מחדש. תמיד להשתמש בהתייחסות RAL. לשלוח דגימת צבע ללקוח לאישור לפני תיקון.",
        keywords: '["צבע","שגוי","RAL","color","wrong","דגימה","אי-התאמה"]',
      },
      {
        title: "Missing Parts",
        title_he: "חלקים חסרים",
        category: "delivery_delay",
        subcategory: "parts",
        problem: "חלקים חסרים במשלוח - ברגים, תושבות, אביזרי חיבור, פאנלים.",
        solution: "Check delivery manifest against order. Identify missing items. Ship missing parts express within 24-48 hours.",
        solution_he: "לבדוק את רשימת המשלוח מול ההזמנה. לזהות פריטים חסרים. לשלוח חלקים חסרים במשלוח מהיר תוך 24-48 שעות. לוודא שהצוות בשטח יכול להשלים את ההתקנה.",
        keywords: '["חלקים","חסרים","missing","parts","משלוח","ברגים"]',
      },
      {
        title: "Noise in Sliding Door",
        title_he: "רעש בדלת הזזה",
        category: "installation_issue",
        subcategory: "mechanical",
        problem: "דלת הזזה מפיקה רעשים חריקים, חריקות או רעש מתכתי בעת פתיחה/סגירה.",
        solution: "Inspect the sliding mechanism, rollers, and track. Lubricate with silicone spray. Replace worn rollers. Adjust track alignment.",
        solution_he: "לבדוק את מנגנון ההחלקה, הגלגלים והמסילה. לשמן עם ספריי סיליקון. להחליף גלגלים שחוקים. ליישר את המסילה. אם הבעיה חוזרת - לשדרג למנגנון שקט.",
        keywords: '["רעש","דלת הזזה","noise","sliding","גלגלים","מסילה","שימון"]',
      },
      {
        title: "Water Leak",
        title_he: "נזילת מים",
        category: "emergency",
        subcategory: "sealing",
        problem: "נזילת מים דרך חלון, דלת או מעקה מתכת. בעיה באיטום או בניקוז.",
        solution: "Emergency response within 4 hours. Inspect sealing and drainage. Apply waterproof sealant. If structural - schedule full repair.",
        solution_he: "תגובת חירום תוך 4 שעות. לבדוק איטום וניקוז. למרוח חומר איטום עמיד למים. אם הבעיה מבנית - לתזמן תיקון מלא. לתעד לביטוח.",
        keywords: '["נזילה","מים","water","leak","איטום","ניקוז","חירום"]',
      },
      {
        title: "Warranty Claim Process",
        title_he: "תהליך תביעת אחריות",
        category: "warranty",
        subcategory: "process",
        problem: "לקוח מבקש לממש אחריות על מוצר פגום. צריך לבדוק תנאי אחריות ותוקף.",
        solution: "Verify warranty period and terms. Document the issue with photos. Process claim within 5 business days.",
        solution_he: "לוודא תקופת אחריות ותנאים. לתעד את הבעיה עם תמונות. לטפל בתביעה תוך 5 ימי עסקים. לעדכן את הלקוח בכל שלב. אם האחריות בתוקף - תיקון/החלפה ללא עלות.",
        keywords: '["אחריות","תביעה","warranty","claim","תיקון","החלפה"]',
      },
      {
        title: "Modification After Installation",
        title_he: "שינוי לאחר התקנה",
        category: "modification_request",
        subcategory: "post_install",
        problem: "לקוח מבקש שינוי/תוספת למוצר שכבר הותקן - שינוי גובה, הוספת פאנל, שינוי צבע.",
        solution: "Assess feasibility of modification on-site. Provide quote for changes. Schedule modification work separately.",
        solution_he: "לבדוק היתכנות השינוי בשטח. לספק הצעת מחיר לשינויים. לתזמן עבודת שינוי בנפרד. לוודא שהשינוי לא פוגע באחריות המקורית.",
        keywords: '["שינוי","התקנה","modification","תוספת","שדרוג","התאמה"]',
      },
    ];

    for (const article of knowledgeArticles) {
      await pool.query(
        `INSERT INTO service_knowledge_base (title, title_he, category, subcategory, problem_description, solution, solution_he, keywords, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'מערכת')
         ON CONFLICT DO NOTHING`,
        [article.title, article.title_he, article.category, article.subcategory, article.problem, article.solution, article.solution_he, article.keywords]
      );
    }

    // זריעת הגדרות SLA לכל שילוב קטגוריה + עדיפות
    const categories = [
      "installation_issue",
      "quality_complaint",
      "delivery_delay",
      "billing",
      "warranty",
      "modification_request",
      "general_inquiry",
      "emergency",
    ];
    const priorities = [
      { name: "low", response: 24, resolve: 120, escalation: 72 },
      { name: "medium", response: 8, resolve: 72, escalation: 48 },
      { name: "high", response: 4, resolve: 48, escalation: 24 },
      { name: "critical", response: 1, resolve: 24, escalation: 4 },
    ];

    for (const cat of categories) {
      for (const pri of priorities) {
        // חירום תמיד מקבל עדיפות גבוהה יותר
        const multiplier = cat === "emergency" ? 0.5 : 1;
        await pool.query(
          `INSERT INTO service_sla_config (category, priority, response_hours, resolve_hours, escalation_after_hours, notify_manager)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [
            cat,
            pri.name,
            Math.ceil(pri.response * multiplier),
            Math.ceil(pri.resolve * multiplier),
            Math.ceil(pri.escalation * multiplier),
            pri.name === "critical" || pri.name === "high" || cat === "emergency",
          ]
        );
      }
    }

    res.json({
      success: true,
      message: "טבלאות שירות לקוחות AI נוצרו בהצלחה, 12 מאמרי ידע ו-SLA הוגדרו",
    });
  } catch (error: any) {
    console.error("שגיאה ביצירת טבלאות שירות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /tickets - יצירת כרטיס שירות עם קטגוריזציה אוטומטית
// ============================================================
router.post("/tickets", async (req: Request, res: Response) => {
  try {
    const {
      customer_id, customer_name, customer_phone, customer_email,
      project_id, project_name, channel, category, subcategory,
      priority, subject, description, assigned_to_id, assigned_to_name,
      department, tags, attachments, notes,
    } = req.body;

    // קטגוריזציה אוטומטית על בסיס מילות מפתח
    let autoCategory = category || "general_inquiry";
    let autoSubcategory = subcategory || "";
    let aiConfidence = 0.5;
    const lowerDesc = (description || "").toLowerCase() + " " + (subject || "").toLowerCase();

    if (!category) {
      if (/חלודה|rust|התחמצנות/.test(lowerDesc)) {
        autoCategory = "quality_complaint"; autoSubcategory = "rust"; aiConfidence = 0.88;
      } else if (/התקנה|מעקה עקום|יישור|alignment/.test(lowerDesc)) {
        autoCategory = "installation_issue"; autoSubcategory = "alignment"; aiConfidence = 0.85;
      } else if (/זכוכית|סדק|שבר|glass|crack/.test(lowerDesc)) {
        autoCategory = "quality_complaint"; autoSubcategory = "glass"; aiConfidence = 0.87;
      } else if (/צבע|התקלפות|paint|peeling/.test(lowerDesc)) {
        autoCategory = "quality_complaint"; autoSubcategory = "paint"; aiConfidence = 0.86;
      } else if (/מדידה|מידות|measurement/.test(lowerDesc)) {
        autoCategory = "installation_issue"; autoSubcategory = "measurement"; aiConfidence = 0.84;
      } else if (/עיכוב|delay|לוח זמנים/.test(lowerDesc)) {
        autoCategory = "delivery_delay"; autoSubcategory = "scheduling"; aiConfidence = 0.82;
      } else if (/צבע שגוי|wrong color|RAL/.test(lowerDesc)) {
        autoCategory = "quality_complaint"; autoSubcategory = "color"; aiConfidence = 0.9;
      } else if (/חלקים חסרים|missing parts/.test(lowerDesc)) {
        autoCategory = "delivery_delay"; autoSubcategory = "parts"; aiConfidence = 0.85;
      } else if (/רעש|noise|חריקה|sliding/.test(lowerDesc)) {
        autoCategory = "installation_issue"; autoSubcategory = "mechanical"; aiConfidence = 0.83;
      } else if (/נזילה|water|leak|איטום/.test(lowerDesc)) {
        autoCategory = "emergency"; autoSubcategory = "sealing"; aiConfidence = 0.92;
      } else if (/אחריות|warranty|claim/.test(lowerDesc)) {
        autoCategory = "warranty"; autoSubcategory = "process"; aiConfidence = 0.88;
      } else if (/שינוי|modification|תוספת|שדרוג/.test(lowerDesc)) {
        autoCategory = "modification_request"; autoSubcategory = "post_install"; aiConfidence = 0.8;
      } else if (/חשבונית|תשלום|billing|חיוב/.test(lowerDesc)) {
        autoCategory = "billing"; autoSubcategory = ""; aiConfidence = 0.85;
      }
    }

    // ניתוח סנטימנט
    let aiSentiment = "neutral";
    if (/מאוכזב|נורא|גרוע|זוועה|כעס|תלונה|בושה/.test(lowerDesc)) aiSentiment = "negative";
    else if (/תודה|מרוצה|מעולה|אדיר|שמח|מצוין/.test(lowerDesc)) aiSentiment = "positive";

    // סיכום AI
    const aiSummary = `פנייה בנושא ${autoCategory === "general_inquiry" ? "כללי" : autoCategory} | ${aiSentiment === "negative" ? "לקוח לא מרוצה" : aiSentiment === "positive" ? "לקוח מרוצה" : "סנטימנט ניטרלי"} | ביטחון: ${(aiConfidence * 100).toFixed(0)}%`;

    // שליפת SLA
    const effectivePriority = priority || (autoCategory === "emergency" ? "critical" : "medium");
    const slaResult = await pool.query(
      `SELECT * FROM service_sla_config WHERE category = $1 AND priority = $2 AND is_active = true LIMIT 1`,
      [autoCategory, effectivePriority]
    );
    const sla = slaResult.rows[0];

    // חיפוש פתרון מוצע ממאגר הידע
    let aiSuggestedSolution = null;
    const kbResult = await pool.query(
      `SELECT solution_he FROM service_knowledge_base
       WHERE category = $1 AND auto_suggest = true AND status = 'published'
       LIMIT 1`,
      [autoCategory]
    );
    if (kbResult.rows.length > 0) {
      aiSuggestedSolution = kbResult.rows[0].solution_he;
    }

    // יצירת מספר כרטיס ייחודי
    const ticketNumber = `TK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const result = await pool.query(
      `INSERT INTO service_tickets (
        ticket_number, customer_id, customer_name, customer_phone, customer_email,
        project_id, project_name, channel, category, subcategory, priority,
        subject, description, ai_summary, ai_sentiment, ai_suggested_solution,
        ai_category_confidence, assigned_to_id, assigned_to_name, department,
        sla_response_hours, sla_resolve_hours, tags, attachments, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
      RETURNING *`,
      [
        ticketNumber, customer_id, customer_name, customer_phone, customer_email,
        project_id, project_name, channel || "phone", autoCategory, autoSubcategory || null,
        effectivePriority, subject, description, aiSummary, aiSentiment,
        aiSuggestedSolution, aiConfidence, assigned_to_id, assigned_to_name,
        department, sla?.response_hours || 8, sla?.resolve_hours || 72,
        JSON.stringify(tags || []), JSON.stringify(attachments || []), notes,
      ]
    );

    res.json({
      success: true,
      message: `כרטיס שירות ${ticketNumber} נוצר בהצלחה`,
      data: {
        ticket: result.rows[0],
        ai_analysis: {
          auto_category: autoCategory,
          auto_subcategory: autoSubcategory,
          confidence: aiConfidence,
          sentiment: aiSentiment,
          suggested_solution: aiSuggestedSolution,
          sla: sla || null,
        },
      },
    });
  } catch (error: any) {
    console.error("שגיאה ביצירת כרטיס שירות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /tickets - רשימת כרטיסים עם סינון
// ============================================================
router.get("/tickets", async (req: Request, res: Response) => {
  try {
    const {
      status, category, priority, assigned_to_id, customer_id,
      from_date, to_date, search, channel, department,
      page = 1, limit = 50,
    } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `SELECT * FROM service_tickets WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;

    if (status) { query += ` AND status = $${paramIdx++}`; params.push(status); }
    if (category) { query += ` AND category = $${paramIdx++}`; params.push(category); }
    if (priority) { query += ` AND priority = $${paramIdx++}`; params.push(priority); }
    if (assigned_to_id) { query += ` AND assigned_to_id = $${paramIdx++}`; params.push(assigned_to_id); }
    if (customer_id) { query += ` AND customer_id = $${paramIdx++}`; params.push(customer_id); }
    if (channel) { query += ` AND channel = $${paramIdx++}`; params.push(channel); }
    if (department) { query += ` AND department = $${paramIdx++}`; params.push(department); }
    if (from_date) { query += ` AND created_at >= $${paramIdx++}`; params.push(from_date); }
    if (to_date) { query += ` AND created_at <= $${paramIdx++}`; params.push(to_date); }
    if (search) {
      query += ` AND (subject ILIKE $${paramIdx} OR description ILIKE $${paramIdx} OR ticket_number ILIKE $${paramIdx} OR customer_name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const countResult = await pool.query(query.replace("SELECT *", "SELECT COUNT(*)"), params);

    query += ` ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END, created_at DESC`;
    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת כרטיסים:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /tickets/:id - כרטיס מלא עם תגובות ופתרונות מוצעים
// ============================================================
router.get("/tickets/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const ticketResult = await pool.query(`SELECT * FROM service_tickets WHERE id = $1`, [id]);
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "כרטיס לא נמצא" });
    }

    const commentsResult = await pool.query(
      `SELECT * FROM service_ticket_comments WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    // חיפוש פתרונות מוצעים ממאגר הידע
    const ticket = ticketResult.rows[0];
    const suggestedSolutions = await pool.query(
      `SELECT * FROM service_knowledge_base
       WHERE (category = $1 OR subcategory = $2) AND auto_suggest = true AND status = 'published'
       ORDER BY helpful_count DESC LIMIT 3`,
      [ticket.category, ticket.subcategory]
    );

    // חישוב SLA status
    const now = new Date();
    const createdAt = new Date(ticket.created_at);
    const hoursElapsed = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    const slaStatus = {
      response: {
        target_hours: ticket.sla_response_hours,
        elapsed_hours: parseFloat(hoursElapsed.toFixed(1)),
        met: ticket.first_response_at !== null,
        overdue: !ticket.first_response_at && hoursElapsed > ticket.sla_response_hours,
      },
      resolution: {
        target_hours: ticket.sla_resolve_hours,
        elapsed_hours: parseFloat(hoursElapsed.toFixed(1)),
        met: ticket.resolved_at !== null,
        overdue: !ticket.resolved_at && hoursElapsed > ticket.sla_resolve_hours,
      },
    };

    res.json({
      success: true,
      data: {
        ticket: ticket,
        comments: commentsResult.rows,
        suggested_solutions: suggestedSolutions.rows,
        sla_status: slaStatus,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת כרטיס:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// PUT /tickets/:id - עדכון כרטיס
// ============================================================
router.put("/tickets/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      category, subcategory, priority, subject, description,
      assigned_to_id, assigned_to_name, department, status,
      tags, notes,
    } = req.body;

    const result = await pool.query(
      `UPDATE service_tickets
       SET category = COALESCE($1, category),
           subcategory = COALESCE($2, subcategory),
           priority = COALESCE($3, priority),
           subject = COALESCE($4, subject),
           description = COALESCE($5, description),
           assigned_to_id = COALESCE($6, assigned_to_id),
           assigned_to_name = COALESCE($7, assigned_to_name),
           department = COALESCE($8, department),
           status = COALESCE($9, status),
           tags = COALESCE($10, tags),
           notes = COALESCE($11, notes),
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [category, subcategory, priority, subject, description, assigned_to_id, assigned_to_name, department, status, tags ? JSON.stringify(tags) : null, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "כרטיס לא נמצא" });
    }

    res.json({ success: true, message: "כרטיס עודכן בהצלחה", data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בעדכון כרטיס:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /tickets/:id/comment - הוספת תגובה לכרטיס
// ============================================================
router.post("/tickets/:id/comment", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { author_name, author_role, content, is_internal, is_ai_generated, attachments } = req.body;

    // בדיקה שהכרטיס קיים
    const ticketCheck = await pool.query(`SELECT id, first_response_at FROM service_tickets WHERE id = $1`, [id]);
    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: "כרטיס לא נמצא" });
    }

    const result = await pool.query(
      `INSERT INTO service_ticket_comments (ticket_id, author_name, author_role, content, is_internal, is_ai_generated, attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, author_name, author_role, content, is_internal || false, is_ai_generated || false, JSON.stringify(attachments || [])]
    );

    // עדכון תגובה ראשונה אם טרם נרשמה
    if (!ticketCheck.rows[0].first_response_at && !is_internal) {
      await pool.query(
        `UPDATE service_tickets SET first_response_at = NOW(), status = 'in_progress', updated_at = NOW() WHERE id = $1`,
        [id]
      );
    } else {
      await pool.query(`UPDATE service_tickets SET updated_at = NOW() WHERE id = $1`, [id]);
    }

    res.json({ success: true, message: "תגובה נוספה בהצלחה", data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בהוספת תגובה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /tickets/:id/assign - הקצאת כרטיס לנציג
// ============================================================
router.post("/tickets/:id/assign", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { assigned_to_id, assigned_to_name, department } = req.body;

    const result = await pool.query(
      `UPDATE service_tickets
       SET assigned_to_id = $1, assigned_to_name = $2, department = COALESCE($3, department), updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [assigned_to_id, assigned_to_name, department, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "כרטיס לא נמצא" });
    }

    res.json({ success: true, message: `כרטיס הוקצה ל-${assigned_to_name}`, data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בהקצאת כרטיס:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /tickets/:id/escalate - הסלמת כרטיס
// ============================================================
router.post("/tickets/:id/escalate", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, escalate_to_name, escalate_to_id } = req.body;

    const result = await pool.query(
      `UPDATE service_tickets
       SET status = 'escalated',
           priority = CASE WHEN priority = 'low' THEN 'medium' WHEN priority = 'medium' THEN 'high' ELSE 'critical' END,
           assigned_to_id = COALESCE($1, assigned_to_id),
           assigned_to_name = COALESCE($2, assigned_to_name),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [escalate_to_id, escalate_to_name, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "כרטיס לא נמצא" });
    }

    // הוספת תגובה פנימית על ההסלמה
    await pool.query(
      `INSERT INTO service_ticket_comments (ticket_id, author_name, author_role, content, is_internal)
       VALUES ($1, 'מערכת', 'system', $2, true)`,
      [id, `הסלמה: ${reason || "לא צוינה סיבה"}. עדיפות שודרגה.`]
    );

    res.json({ success: true, message: "כרטיס הוסלם בהצלחה", data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בהסלמת כרטיס:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /tickets/:id/resolve - סגירת כרטיס עם פתרון
// ============================================================
router.post("/tickets/:id/resolve", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolution } = req.body;

    const result = await pool.query(
      `UPDATE service_tickets
       SET status = 'resolved', resolved_at = NOW(), resolution = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [resolution, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "כרטיס לא נמצא" });
    }

    // הוספת תגובה על הפתרון
    await pool.query(
      `INSERT INTO service_ticket_comments (ticket_id, author_name, author_role, content, is_internal)
       VALUES ($1, 'מערכת', 'system', $2, false)`,
      [id, `כרטיס נסגר. פתרון: ${resolution}`]
    );

    res.json({ success: true, message: "כרטיס נסגר בהצלחה", data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בסגירת כרטיס:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /tickets/:id/satisfaction - רישום שביעות רצון לקוח
// ============================================================
router.post("/tickets/:id/satisfaction", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { score, feedback } = req.body;

    if (score < 1 || score > 5) {
      return res.status(400).json({ success: false, error: "ציון חייב להיות בין 1 ל-5" });
    }

    const result = await pool.query(
      `UPDATE service_tickets
       SET satisfaction_score = $1, satisfaction_feedback = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [score, feedback, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "כרטיס לא נמצא" });
    }

    res.json({ success: true, message: "שביעות רצון נרשמה", data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה ברישום שביעות רצון:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /tickets/:id/ai-suggest - AI מציע פתרון ממאגר הידע
// ============================================================
router.get("/tickets/:id/ai-suggest", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const ticketResult = await pool.query(`SELECT * FROM service_tickets WHERE id = $1`, [id]);
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "כרטיס לא נמצא" });
    }

    const ticket = ticketResult.rows[0];

    // חיפוש ישיר לפי קטגוריה
    const directMatch = await pool.query(
      `SELECT * FROM service_knowledge_base
       WHERE category = $1 AND auto_suggest = true AND status = 'published'
       ORDER BY helpful_count DESC LIMIT 3`,
      [ticket.category]
    );

    // חיפוש לפי תת-קטגוריה
    const subMatch = await pool.query(
      `SELECT * FROM service_knowledge_base
       WHERE subcategory = $1 AND auto_suggest = true AND status = 'published'
       ORDER BY helpful_count DESC LIMIT 2`,
      [ticket.subcategory]
    );

    // חיפוש לפי מילות מפתח מהתיאור
    const keywords = (ticket.description || "").split(/\s+/).filter((w: string) => w.length > 3).slice(0, 5);
    let keywordMatches: any[] = [];
    if (keywords.length > 0) {
      const keywordResult = await pool.query(
        `SELECT * FROM service_knowledge_base
         WHERE status = 'published' AND auto_suggest = true
         AND (problem_description ILIKE ANY($1) OR solution_he ILIKE ANY($1))
         ORDER BY helpful_count DESC LIMIT 3`,
        [keywords.map((k: string) => `%${k}%`)]
      );
      keywordMatches = keywordResult.rows;
    }

    // מיזוג וייחוד תוצאות
    const allSuggestions = [...directMatch.rows, ...subMatch.rows, ...keywordMatches];
    const uniqueIds = new Set<number>();
    const uniqueSuggestions = allSuggestions.filter((s) => {
      if (uniqueIds.has(s.id)) return false;
      uniqueIds.add(s.id);
      return true;
    });

    res.json({
      success: true,
      data: {
        ticket_id: id,
        ticket_category: ticket.category,
        ticket_subcategory: ticket.subcategory,
        suggestions: uniqueSuggestions.map((s: any) => ({
          id: s.id,
          title_he: s.title_he,
          category: s.category,
          problem_description: s.problem_description,
          solution_he: s.solution_he,
          helpful_count: s.helpful_count,
        })),
        total_suggestions: uniqueSuggestions.length,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בהצעת AI:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /dashboard - לוח בקרה ראשי שירות לקוחות
// ============================================================
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    // כרטיסים פתוחים
    const openTickets = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'open') as open_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'waiting_customer') as waiting_customer,
        COUNT(*) FILTER (WHERE status = 'waiting_parts') as waiting_parts,
        COUNT(*) FILTER (WHERE status = 'escalated') as escalated_count,
        COUNT(*) FILTER (WHERE status IN ('open','in_progress','waiting_customer','waiting_parts','escalated')) as total_open
       FROM service_tickets`
    );

    // זמן פתרון ממוצע
    const avgResolution = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_hours
       FROM service_tickets WHERE resolved_at IS NOT NULL`
    );

    // עמידה ב-SLA
    const slaCompliance = await pool.query(
      `SELECT
        COUNT(*) as total_resolved,
        COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600 <= sla_resolve_hours) as within_sla
       FROM service_tickets WHERE resolved_at IS NOT NULL`
    );
    const slaRate = slaCompliance.rows[0].total_resolved > 0
      ? ((slaCompliance.rows[0].within_sla / slaCompliance.rows[0].total_resolved) * 100).toFixed(1)
      : "N/A";

    // ממוצע שביעות רצון
    const avgSatisfaction = await pool.query(
      `SELECT AVG(satisfaction_score) as avg_score, COUNT(satisfaction_score) as total_rated
       FROM service_tickets WHERE satisfaction_score IS NOT NULL`
    );

    // כרטיסים לפי קטגוריה
    const byCategory = await pool.query(
      `SELECT category, COUNT(*) as count
       FROM service_tickets WHERE status NOT IN ('resolved','closed')
       GROUP BY category ORDER BY count DESC`
    );

    // כרטיסים חריגי SLA
    const overdueTickets = await pool.query(
      `SELECT COUNT(*) as count
       FROM service_tickets
       WHERE status NOT IN ('resolved','closed')
       AND EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 > sla_resolve_hours`
    );

    // כרטיסים לפי עדיפות
    const byPriority = await pool.query(
      `SELECT priority, COUNT(*) as count
       FROM service_tickets WHERE status NOT IN ('resolved','closed')
       GROUP BY priority`
    );

    res.json({
      success: true,
      data: {
        open_tickets: openTickets.rows[0],
        avg_resolution_hours: parseFloat(avgResolution.rows[0]?.avg_hours || "0").toFixed(1),
        sla_compliance_percent: slaRate,
        avg_satisfaction: parseFloat(avgSatisfaction.rows[0]?.avg_score || "0").toFixed(1),
        total_rated: parseInt(avgSatisfaction.rows[0]?.total_rated || "0"),
        tickets_by_category: byCategory.rows,
        tickets_by_priority: byPriority.rows,
        overdue_tickets: parseInt(overdueTickets.rows[0]?.count || "0"),
      },
    });
  } catch (error: any) {
    console.error("שגיאה בלוח הבקרה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /sla-report - דוח עמידה ב-SLA לפי קטגוריה ונציג
// ============================================================
router.get("/sla-report", async (req: Request, res: Response) => {
  try {
    // עמידה ב-SLA לפי קטגוריה
    const byCategory = await pool.query(
      `SELECT
        category,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600 <= sla_resolve_hours) as within_sla,
        COUNT(*) FILTER (WHERE first_response_at IS NOT NULL AND EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600 <= sla_response_hours) as response_within_sla,
        AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - created_at)) / 3600) as avg_resolution_hours
       FROM service_tickets
       GROUP BY category ORDER BY category`
    );

    // עמידה ב-SLA לפי נציג
    const byAgent = await pool.query(
      `SELECT
        assigned_to_id,
        assigned_to_name,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600 <= sla_resolve_hours) as within_sla,
        AVG(satisfaction_score) as avg_satisfaction,
        AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - created_at)) / 3600) as avg_resolution_hours
       FROM service_tickets
       WHERE assigned_to_id IS NOT NULL
       GROUP BY assigned_to_id, assigned_to_name
       ORDER BY total DESC`
    );

    // הגדרות SLA נוכחיות
    const slaConfig = await pool.query(
      `SELECT * FROM service_sla_config WHERE is_active = true ORDER BY category, priority`
    );

    res.json({
      success: true,
      data: {
        by_category: byCategory.rows.map((row: any) => ({
          ...row,
          sla_compliance: row.total > 0 ? ((row.within_sla / row.total) * 100).toFixed(1) + "%" : "N/A",
          response_sla_compliance: row.total > 0 ? ((row.response_within_sla / row.total) * 100).toFixed(1) + "%" : "N/A",
          avg_resolution_hours: parseFloat(row.avg_resolution_hours || "0").toFixed(1),
        })),
        by_agent: byAgent.rows.map((row: any) => ({
          ...row,
          sla_compliance: row.total > 0 ? ((row.within_sla / row.total) * 100).toFixed(1) + "%" : "N/A",
          avg_satisfaction: parseFloat(row.avg_satisfaction || "0").toFixed(1),
          avg_resolution_hours: parseFloat(row.avg_resolution_hours || "0").toFixed(1),
        })),
        sla_config: slaConfig.rows,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בדוח SLA:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /knowledge-base - חיפוש מאמרים במאגר הידע
// ============================================================
router.get("/knowledge-base", async (req: Request, res: Response) => {
  try {
    const { search, category, subcategory, status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `SELECT * FROM service_knowledge_base WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;

    if (category) { query += ` AND category = $${paramIdx++}`; params.push(category); }
    if (subcategory) { query += ` AND subcategory = $${paramIdx++}`; params.push(subcategory); }
    if (status) { query += ` AND status = $${paramIdx++}`; params.push(status); }
    if (search) {
      query += ` AND (title_he ILIKE $${paramIdx} OR problem_description ILIKE $${paramIdx} OR solution_he ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const countResult = await pool.query(query.replace("SELECT *", "SELECT COUNT(*)"), params);

    query += ` ORDER BY helpful_count DESC, created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error("שגיאה בחיפוש מאגר ידע:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /knowledge-base - יצירת מאמר חדש במאגר הידע
// ============================================================
router.post("/knowledge-base", async (req: Request, res: Response) => {
  try {
    const { title, title_he, category, subcategory, problem_description, solution, solution_he, keywords, auto_suggest, created_by } = req.body;

    const result = await pool.query(
      `INSERT INTO service_knowledge_base (title, title_he, category, subcategory, problem_description, solution, solution_he, keywords, auto_suggest, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [title, title_he, category, subcategory, problem_description, solution, solution_he, JSON.stringify(keywords || []), auto_suggest !== false, created_by || "מערכת"]
    );

    res.json({ success: true, message: "מאמר נוצר בהצלחה", data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה ביצירת מאמר:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /knowledge-base/:id - שליפת מאמר בודד
// ============================================================
router.get("/knowledge-base/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM service_knowledge_base WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "מאמר לא נמצא" });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בשליפת מאמר:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// PUT /knowledge-base/:id - עדכון מאמר
// ============================================================
router.put("/knowledge-base/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, title_he, category, subcategory, problem_description, solution, solution_he, keywords, auto_suggest, status } = req.body;

    const result = await pool.query(
      `UPDATE service_knowledge_base
       SET title = COALESCE($1, title),
           title_he = COALESCE($2, title_he),
           category = COALESCE($3, category),
           subcategory = COALESCE($4, subcategory),
           problem_description = COALESCE($5, problem_description),
           solution = COALESCE($6, solution),
           solution_he = COALESCE($7, solution_he),
           keywords = COALESCE($8, keywords),
           auto_suggest = COALESCE($9, auto_suggest),
           status = COALESCE($10, status),
           updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [title, title_he, category, subcategory, problem_description, solution, solution_he, keywords ? JSON.stringify(keywords) : null, auto_suggest, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "מאמר לא נמצא" });
    }

    res.json({ success: true, message: "מאמר עודכן בהצלחה", data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בעדכון מאמר:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /knowledge-base/:id/helpful - דירוג מאמר כמועיל/לא מועיל
// ============================================================
router.post("/knowledge-base/:id/helpful", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { helpful } = req.body;

    const column = helpful ? "helpful_count" : "not_helpful_count";
    const result = await pool.query(
      `UPDATE service_knowledge_base SET ${column} = ${column} + 1, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "מאמר לא נמצא" });
    }

    res.json({ success: true, message: helpful ? "סומן כמועיל" : "סומן כלא מועיל", data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בדירוג מאמר:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /agent-stats/:agentId - סטטיסטיקות נציג
// ============================================================
router.get("/agent-stats/:agentId", async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    const stats = await pool.query(
      `SELECT
        assigned_to_name,
        COUNT(*) as total_tickets,
        COUNT(*) FILTER (WHERE status = 'resolved' OR status = 'closed') as resolved_tickets,
        COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed')) as open_tickets,
        AVG(satisfaction_score) FILTER (WHERE satisfaction_score IS NOT NULL) as avg_satisfaction,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_hours,
        COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600 <= sla_resolve_hours) as within_sla,
        COUNT(*) FILTER (WHERE status = 'escalated') as escalated_count
       FROM service_tickets
       WHERE assigned_to_id = $1
       GROUP BY assigned_to_name`,
      [agentId]
    );

    if (stats.rows.length === 0) {
      return res.json({ success: true, data: { message: "לא נמצאו כרטיסים לנציג זה" } });
    }

    const row = stats.rows[0];

    // כרטיסים לפי קטגוריה
    const byCategory = await pool.query(
      `SELECT category, COUNT(*) as count
       FROM service_tickets WHERE assigned_to_id = $1
       GROUP BY category ORDER BY count DESC`,
      [agentId]
    );

    // כרטיסים לפי חודש
    const byMonth = await pool.query(
      `SELECT DATE_TRUNC('month', created_at) as month, COUNT(*) as count
       FROM service_tickets WHERE assigned_to_id = $1
       GROUP BY DATE_TRUNC('month', created_at)
       ORDER BY month DESC LIMIT 12`,
      [agentId]
    );

    res.json({
      success: true,
      data: {
        agent_name: row.assigned_to_name,
        total_tickets: parseInt(row.total_tickets),
        resolved_tickets: parseInt(row.resolved_tickets),
        open_tickets: parseInt(row.open_tickets),
        avg_satisfaction: parseFloat(row.avg_satisfaction || "0").toFixed(1),
        avg_resolution_hours: parseFloat(row.avg_resolution_hours || "0").toFixed(1),
        sla_compliance: row.resolved_tickets > 0 ? ((row.within_sla / row.resolved_tickets) * 100).toFixed(1) + "%" : "N/A",
        escalated_count: parseInt(row.escalated_count),
        by_category: byCategory.rows,
        by_month: byMonth.rows,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בסטטיסטיקות נציג:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /trends - מגמות כרטיסים לאורך זמן, בעיות חוזרות
// ============================================================
router.get("/trends", async (req: Request, res: Response) => {
  try {
    const { period = "30" } = req.query;

    // מגמות לפי יום
    const dailyTrend = await pool.query(
      `SELECT DATE(created_at) as date, COUNT(*) as count,
        COUNT(*) FILTER (WHERE status IN ('resolved','closed')) as resolved
       FROM service_tickets
       WHERE created_at >= NOW() - INTERVAL '${Number(period)} days'
       GROUP BY DATE(created_at)
       ORDER BY date`
    );

    // בעיות חוזרות - קטגוריות שעולות
    const recurringIssues = await pool.query(
      `SELECT category, subcategory, COUNT(*) as count,
        AVG(satisfaction_score) FILTER (WHERE satisfaction_score IS NOT NULL) as avg_satisfaction
       FROM service_tickets
       WHERE created_at >= NOW() - INTERVAL '${Number(period)} days'
       GROUP BY category, subcategory
       HAVING COUNT(*) > 1
       ORDER BY count DESC LIMIT 10`
    );

    // לקוחות עם הכי הרבה פניות
    const topCustomers = await pool.query(
      `SELECT customer_id, customer_name, COUNT(*) as ticket_count
       FROM service_tickets
       WHERE created_at >= NOW() - INTERVAL '${Number(period)} days'
       AND customer_id IS NOT NULL
       GROUP BY customer_id, customer_name
       ORDER BY ticket_count DESC LIMIT 10`
    );

    // השוואה לתקופה קודמת
    const currentPeriod = await pool.query(
      `SELECT COUNT(*) as count FROM service_tickets WHERE created_at >= NOW() - INTERVAL '${Number(period)} days'`
    );
    const previousPeriod = await pool.query(
      `SELECT COUNT(*) as count FROM service_tickets
       WHERE created_at >= NOW() - INTERVAL '${Number(period) * 2} days'
       AND created_at < NOW() - INTERVAL '${Number(period)} days'`
    );

    const currentCount = parseInt(currentPeriod.rows[0].count);
    const previousCount = parseInt(previousPeriod.rows[0].count);
    const changePercent = previousCount > 0
      ? (((currentCount - previousCount) / previousCount) * 100).toFixed(1)
      : "N/A";

    // התפלגות לפי ערוץ
    const byChannel = await pool.query(
      `SELECT channel, COUNT(*) as count
       FROM service_tickets
       WHERE created_at >= NOW() - INTERVAL '${Number(period)} days'
       GROUP BY channel ORDER BY count DESC`
    );

    res.json({
      success: true,
      data: {
        period_days: Number(period),
        daily_trend: dailyTrend.rows,
        recurring_issues: recurringIssues.rows,
        top_customers: topCustomers.rows,
        period_comparison: {
          current: currentCount,
          previous: previousCount,
          change_percent: changePercent,
        },
        by_channel: byChannel.rows,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת מגמות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /auto-check-sla - בדיקת הפרות SLA ויצירת התראות
// ============================================================
router.post("/auto-check-sla", async (_req: Request, res: Response) => {
  try {
    // כרטיסים שחרגו מ-SLA תגובה
    const responseViolations = await pool.query(
      `SELECT id, ticket_number, customer_name, category, priority, sla_response_hours, created_at,
        EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as hours_elapsed
       FROM service_tickets
       WHERE status IN ('open')
       AND first_response_at IS NULL
       AND EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 > sla_response_hours`
    );

    // כרטיסים שחרגו מ-SLA פתרון
    const resolveViolations = await pool.query(
      `SELECT id, ticket_number, customer_name, category, priority, sla_resolve_hours, created_at,
        EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as hours_elapsed
       FROM service_tickets
       WHERE status NOT IN ('resolved','closed')
       AND EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 > sla_resolve_hours`
    );

    // כרטיסים שמתקרבים לחריגה (80% מהזמן)
    const nearViolation = await pool.query(
      `SELECT id, ticket_number, customer_name, category, priority, sla_resolve_hours, created_at,
        EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as hours_elapsed
       FROM service_tickets
       WHERE status NOT IN ('resolved','closed')
       AND resolved_at IS NULL
       AND EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 > sla_resolve_hours * 0.8
       AND EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 <= sla_resolve_hours`
    );

    // הוספת תגובות פנימיות על הפרות SLA
    for (const v of responseViolations.rows) {
      await pool.query(
        `INSERT INTO service_ticket_comments (ticket_id, author_name, author_role, content, is_internal)
         VALUES ($1, 'מערכת SLA', 'system', $2, true)`,
        [v.id, `התראת SLA: חריגה מזמן תגובה (${parseFloat(v.hours_elapsed).toFixed(1)} שעות מתוך ${v.sla_response_hours} מותרות)`]
      );
    }

    for (const v of resolveViolations.rows) {
      await pool.query(
        `INSERT INTO service_ticket_comments (ticket_id, author_name, author_role, content, is_internal)
         VALUES ($1, 'מערכת SLA', 'system', $2, true)`,
        [v.id, `התראת SLA: חריגה מזמן פתרון (${parseFloat(v.hours_elapsed).toFixed(1)} שעות מתוך ${v.sla_resolve_hours} מותרות)`]
      );
    }

    res.json({
      success: true,
      message: `בדיקת SLA הושלמה`,
      data: {
        response_violations: {
          count: responseViolations.rows.length,
          tickets: responseViolations.rows,
        },
        resolve_violations: {
          count: resolveViolations.rows.length,
          tickets: resolveViolations.rows,
        },
        near_violation_warning: {
          count: nearViolation.rows.length,
          tickets: nearViolation.rows,
        },
        total_alerts_created: responseViolations.rows.length + resolveViolations.rows.length,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בבדיקת SLA:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /sla-config - שליפת הגדרות SLA
// ============================================================
router.get("/sla-config", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM service_sla_config ORDER BY category, priority`
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error("שגיאה בשליפת הגדרות SLA:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// PUT /sla-config/:id - עדכון הגדרת SLA
// ============================================================
router.put("/sla-config/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { response_hours, resolve_hours, escalation_after_hours, notify_manager, is_active } = req.body;

    const result = await pool.query(
      `UPDATE service_sla_config
       SET response_hours = COALESCE($1, response_hours),
           resolve_hours = COALESCE($2, resolve_hours),
           escalation_after_hours = COALESCE($3, escalation_after_hours),
           notify_manager = COALESCE($4, notify_manager),
           is_active = COALESCE($5, is_active)
       WHERE id = $6
       RETURNING *`,
      [response_hours, resolve_hours, escalation_after_hours, notify_manager, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "הגדרת SLA לא נמצאה" });
    }

    res.json({ success: true, message: "הגדרת SLA עודכנה", data: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בעדכון SLA:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ייצוא ברירת מחדל של הראוטר
export default router;
