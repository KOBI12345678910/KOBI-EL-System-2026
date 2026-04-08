/**
 * ===================================================================
 * מנוע אנליטיקה לסוכני שטח - GPS, שיחות וביצועים
 * Field Agent GPS, Call Analytics & Performance Engine
 * מפעל מתכות - ברזל, אלומיניום, זכוכית
 * TechnoKoluzi ERP System
 * ===================================================================
 */

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';

const router = Router();

// ===================================================================
// POST /init - יצירת טבלאות + נתוני דוגמה ל-5 סוכנים
// ===================================================================
router.post('/init', async (_req: Request, res: Response) => {
  try {
    // יצירת טבלת מעקב GPS סוכנים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_gps_tracking (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        agent_name VARCHAR,
        latitude NUMERIC(10,7),
        longitude NUMERIC(10,7),
        address VARCHAR,
        accuracy_meters NUMERIC(6,1),
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        activity_type VARCHAR DEFAULT 'travel',
        associated_customer_id INTEGER,
        associated_customer_name VARCHAR,
        battery_level INTEGER,
        notes TEXT
      )
    `);

    // יצירת טבלת שיחות סוכנים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_call_records (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        agent_name VARCHAR,
        call_type VARCHAR NOT NULL,
        phone_number VARCHAR,
        contact_name VARCHAR,
        customer_id INTEGER,
        direction VARCHAR DEFAULT 'outgoing',
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        duration_seconds INTEGER,
        answered BOOLEAN DEFAULT true,
        recording_url TEXT,
        transcript TEXT,
        transcript_analysis JSONB,
        sentiment VARCHAR,
        keywords JSONB DEFAULT '[]',
        follow_up_required BOOLEAN DEFAULT false,
        follow_up_date DATE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת טבלת דוחות יומיים לסוכנים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_daily_reports (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        agent_name VARCHAR,
        date DATE NOT NULL,
        total_calls_out INTEGER DEFAULT 0,
        total_calls_in INTEGER DEFAULT 0,
        total_calls_missed INTEGER DEFAULT 0,
        total_calls_returned INTEGER DEFAULT 0,
        total_call_duration_minutes NUMERIC(6,1) DEFAULT 0,
        avg_call_duration_seconds INTEGER DEFAULT 0,
        total_meetings INTEGER DEFAULT 0,
        meetings_completed INTEGER DEFAULT 0,
        meetings_cancelled INTEGER DEFAULT 0,
        new_leads INTEGER DEFAULT 0,
        quotes_sent INTEGER DEFAULT 0,
        deals_closed INTEGER DEFAULT 0,
        deals_amount NUMERIC(15,2) DEFAULT 0,
        total_distance_km NUMERIC(8,2) DEFAULT 0,
        locations_visited INTEGER DEFAULT 0,
        first_activity_time TIMESTAMPTZ,
        last_activity_time TIMESTAMPTZ,
        active_hours NUMERIC(5,2) DEFAULT 0,
        productivity_score NUMERIC(5,2),
        risk_flags JSONB DEFAULT '[]',
        ai_summary TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(agent_id, date)
      )
    `);

    // יצירת טבלת ציוני ביצוע סוכנים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_performance_scores (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        agent_name VARCHAR,
        period VARCHAR NOT NULL,
        total_leads_received INTEGER DEFAULT 0,
        total_leads_contacted INTEGER DEFAULT 0,
        contact_rate NUMERIC(5,2) DEFAULT 0,
        total_meetings_set INTEGER DEFAULT 0,
        meeting_rate NUMERIC(5,2) DEFAULT 0,
        total_quotes_sent INTEGER DEFAULT 0,
        quote_rate NUMERIC(5,2) DEFAULT 0,
        total_deals_closed INTEGER DEFAULT 0,
        close_rate NUMERIC(5,2) DEFAULT 0,
        total_revenue NUMERIC(15,2) DEFAULT 0,
        avg_deal_size NUMERIC(15,2) DEFAULT 0,
        avg_time_to_close_days INTEGER,
        total_calls INTEGER DEFAULT 0,
        avg_response_time_minutes INTEGER,
        discount_requests INTEGER DEFAULT 0,
        avg_discount_percent NUMERIC(5,2) DEFAULT 0,
        customer_satisfaction NUMERIC(3,1),
        complaints INTEGER DEFAULT 0,
        follow_up_compliance NUMERIC(5,2) DEFAULT 0,
        sla_compliance NUMERIC(5,2) DEFAULT 0,
        gps_anomalies INTEGER DEFAULT 0,
        overall_score NUMERIC(5,2),
        rank INTEGER,
        value_to_company NUMERIC(15,2) DEFAULT 0,
        cost_to_company NUMERIC(15,2) DEFAULT 0,
        roi NUMERIC(5,2),
        recommendations JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(agent_id, period)
      )
    `);

    // יצירת אינדקסים לשיפור ביצועים
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_gps_agent_timestamp ON agent_gps_tracking(agent_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_gps_timestamp ON agent_gps_tracking(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_calls_agent_start ON agent_call_records(agent_id, start_time DESC);
      CREATE INDEX IF NOT EXISTS idx_calls_customer ON agent_call_records(customer_id);
      CREATE INDEX IF NOT EXISTS idx_daily_agent_date ON agent_daily_reports(agent_id, date DESC);
      CREATE INDEX IF NOT EXISTS idx_perf_agent_period ON agent_performance_scores(agent_id, period);
    `);

    // נתוני דוגמה - 5 סוכני שטח
    const agents = [
      { id: 1, name: 'יוסי כהן' },
      { id: 2, name: 'דנה לוי' },
      { id: 3, name: 'אבי מזרחי' },
      { id: 4, name: 'רונית שמעון' },
      { id: 5, name: 'מיכאל ברק' }
    ];

    // מיקומי לקוחות לדוגמה - מפעלי מתכות
    const customerLocations = [
      { id: 101, name: 'מפעל ברזל צפון', lat: 32.7940, lng: 35.0310, address: 'אזור תעשייה קריית אתא' },
      { id: 102, name: 'אלומיניום הגליל', lat: 32.9646, lng: 35.4967, address: 'אזור תעשייה כרמיאל' },
      { id: 103, name: 'זכוכית השרון', lat: 32.1828, lng: 34.8717, address: 'אזור תעשייה הרצליה' },
      { id: 104, name: 'מתכות הדרום', lat: 31.2530, lng: 34.7915, address: 'אזור תעשייה באר שבע' },
      { id: 105, name: 'ברזל ופלדה מרכז', lat: 32.0853, lng: 34.7818, address: 'אזור תעשייה תל אביב' },
      { id: 106, name: 'אלומיניום ירושלים', lat: 31.7683, lng: 35.2137, address: 'אזור תעשייה ירושלים' },
      { id: 107, name: 'זכוכית נתניה', lat: 32.3215, lng: 34.8532, address: 'אזור תעשייה נתניה' },
      { id: 108, name: 'מסגריית הנגב', lat: 31.3100, lng: 34.4600, address: 'אזור תעשייה אופקים' }
    ];

    // הזנת נתוני GPS לדוגמה - מעקב יומי לכל סוכן
    for (const agent of agents) {
      // נתוני GPS - 8 נקודות ביום לכל סוכן
      const baseDate = new Date();
      baseDate.setHours(7, 30, 0, 0);

      for (let hour = 0; hour < 8; hour++) {
        const timestamp = new Date(baseDate.getTime() + hour * 3600000);
        const custIdx = (agent.id + hour) % customerLocations.length;
        const cust = customerLocations[custIdx];
        // הוספת שונות קטנה למיקום
        const latVar = (Math.random() - 0.5) * 0.01;
        const lngVar = (Math.random() - 0.5) * 0.01;
        const activityTypes = ['travel', 'meeting', 'meeting', 'travel', 'meeting', 'break', 'travel', 'meeting'];

        await pool.query(`
          INSERT INTO agent_gps_tracking
            (agent_id, agent_name, latitude, longitude, address, accuracy_meters, timestamp, activity_type, associated_customer_id, associated_customer_name, battery_level, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT DO NOTHING
        `, [
          agent.id, agent.name,
          cust.lat + latVar, cust.lng + lngVar,
          cust.address,
          Math.round(Math.random() * 15 + 3),
          timestamp.toISOString(),
          activityTypes[hour],
          cust.id, cust.name,
          Math.round(100 - hour * 8 - Math.random() * 5),
          hour === 5 ? 'הפסקת צהריים' : null
        ]);
      }

      // נתוני שיחות לדוגמה - 10 שיחות ביום לכל סוכן
      const callTypes = ['sales', 'follow_up', 'support', 'cold_call', 'quote_follow_up'];
      const sentiments = ['positive', 'neutral', 'negative', 'positive', 'positive'];

      for (let c = 0; c < 10; c++) {
        const startTime = new Date(baseDate.getTime() + c * 2400000 + Math.random() * 1800000);
        const duration = Math.round(Math.random() * 600 + 30);
        const endTime = new Date(startTime.getTime() + duration * 1000);
        const answered = Math.random() > 0.15;
        const custIdx = (agent.id + c) % customerLocations.length;
        const cust = customerLocations[custIdx];
        const direction = c < 7 ? 'outgoing' : 'incoming';

        await pool.query(`
          INSERT INTO agent_call_records
            (agent_id, agent_name, call_type, phone_number, contact_name, customer_id, direction, start_time, end_time, duration_seconds, answered, sentiment, keywords, follow_up_required, notes, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
          ON CONFLICT DO NOTHING
        `, [
          agent.id, agent.name,
          callTypes[c % callTypes.length],
          `05${Math.round(Math.random() * 9)}${String(Math.round(Math.random() * 9999999)).padStart(7, '0')}`,
          `איש קשר ${c + 1} - ${cust.name}`,
          cust.id,
          direction,
          startTime.toISOString(),
          answered ? endTime.toISOString() : null,
          answered ? duration : 0,
          answered,
          sentiments[c % sentiments.length],
          JSON.stringify(['מחיר', 'אלומיניום', 'משלוח', 'הצעה'].slice(0, Math.round(Math.random() * 3) + 1)),
          Math.random() > 0.6,
          answered ? 'שיחה עם לקוח לגבי הזמנת מתכת' : 'לקוח לא ענה'
        ]);
      }

      // דוח יומי לדוגמה
      const dealsAmount = Math.round(Math.random() * 150000 + 20000);
      await pool.query(`
        INSERT INTO agent_daily_reports
          (agent_id, agent_name, date, total_calls_out, total_calls_in, total_calls_missed, total_calls_returned,
           total_call_duration_minutes, avg_call_duration_seconds, total_meetings, meetings_completed, meetings_cancelled,
           new_leads, quotes_sent, deals_closed, deals_amount, total_distance_km, locations_visited,
           first_activity_time, last_activity_time, active_hours, productivity_score, risk_flags, ai_summary)
        VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        ON CONFLICT (agent_id, date) DO NOTHING
      `, [
        agent.id, agent.name,
        7, 3, 1, 1,
        Math.round(Math.random() * 80 + 30),
        Math.round(Math.random() * 200 + 60),
        Math.round(Math.random() * 5 + 2),
        Math.round(Math.random() * 4 + 1),
        Math.round(Math.random() * 2),
        Math.round(Math.random() * 3 + 1),
        Math.round(Math.random() * 4 + 1),
        Math.round(Math.random() * 2),
        dealsAmount,
        Math.round(Math.random() * 80 + 20),
        Math.round(Math.random() * 6 + 3),
        new Date(baseDate).toISOString(),
        new Date(baseDate.getTime() + 8 * 3600000).toISOString(),
        Math.round((Math.random() * 3 + 6) * 100) / 100,
        Math.round(Math.random() * 30 + 60),
        JSON.stringify(agent.id === 3 ? ['low_calls', 'high_discount'] : []),
        `סוכן ${agent.name} ביצע ${7 + 3} שיחות, ${Math.round(Math.random() * 4 + 1)} פגישות, וסגר עסקאות בסך ${dealsAmount} ש"ח`
      ]);

      // ציון ביצוע לדוגמה
      const totalLeads = Math.round(Math.random() * 30 + 20);
      const contacted = Math.round(totalLeads * (0.6 + Math.random() * 0.3));
      const meetings = Math.round(contacted * (0.3 + Math.random() * 0.3));
      const quotes = Math.round(meetings * (0.5 + Math.random() * 0.3));
      const deals = Math.round(quotes * (0.2 + Math.random() * 0.3));
      const revenue = deals * (Math.round(Math.random() * 50000 + 20000));

      await pool.query(`
        INSERT INTO agent_performance_scores
          (agent_id, agent_name, period, total_leads_received, total_leads_contacted, contact_rate,
           total_meetings_set, meeting_rate, total_quotes_sent, quote_rate, total_deals_closed, close_rate,
           total_revenue, avg_deal_size, avg_time_to_close_days, total_calls, avg_response_time_minutes,
           discount_requests, avg_discount_percent, customer_satisfaction, complaints,
           follow_up_compliance, sla_compliance, gps_anomalies, overall_score, rank,
           value_to_company, cost_to_company, roi, recommendations)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
        ON CONFLICT (agent_id, period) DO NOTHING
      `, [
        agent.id, agent.name,
        '2026-03',
        totalLeads, contacted, Math.round((contacted / totalLeads) * 10000) / 100,
        meetings, Math.round((meetings / contacted) * 10000) / 100,
        quotes, Math.round((quotes / meetings) * 10000) / 100,
        deals, Math.round((deals / quotes) * 10000) / 100,
        revenue, deals > 0 ? Math.round(revenue / deals) : 0,
        Math.round(Math.random() * 14 + 7),
        Math.round(Math.random() * 100 + 80),
        Math.round(Math.random() * 30 + 5),
        Math.round(Math.random() * 5),
        Math.round(Math.random() * 10 * 100) / 100,
        Math.round((Math.random() * 2 + 3) * 10) / 10,
        Math.round(Math.random() * 3),
        Math.round((Math.random() * 20 + 70) * 100) / 100,
        Math.round((Math.random() * 15 + 80) * 100) / 100,
        Math.round(Math.random() * 3),
        Math.round(Math.random() * 30 + 60),
        agent.id,
        revenue,
        Math.round(Math.random() * 15000 + 10000),
        revenue > 0 ? Math.round((revenue / (Math.random() * 15000 + 10000)) * 100) / 100 : 0,
        JSON.stringify(agent.id === 3
          ? ['להגביר קצב שיחות', 'להפחית הנחות', 'לשפר מעקב אחרי לידים']
          : ['להמשיך בקו הנוכחי', 'לשפר זמן תגובה'])
      ]);
    }

    res.json({
      success: true,
      message: 'טבלאות סוכני שטח נוצרו בהצלחה עם נתוני דוגמה ל-5 סוכנים',
      tables: ['agent_gps_tracking', 'agent_call_records', 'agent_daily_reports', 'agent_performance_scores'],
      agents_seeded: agents.map(a => ({ id: a.id, name: a.name }))
    });
  } catch (error: any) {
    console.error('שגיאה באתחול טבלאות סוכני שטח:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// CRUD - agent_gps_tracking - מעקב GPS סוכנים
// ===================================================================

// קבלת כל רשומות GPS
router.get('/gps-tracking', async (req: Request, res: Response) => {
  try {
    const { agent_id, from_date, to_date, activity_type, limit = 100, offset = 0 } = req.query;
    let query = `SELECT * FROM agent_gps_tracking WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;

    if (agent_id) { query += ` AND agent_id = $${paramIdx++}`; params.push(agent_id); }
    if (from_date) { query += ` AND timestamp >= $${paramIdx++}`; params.push(from_date); }
    if (to_date) { query += ` AND timestamp <= $${paramIdx++}`; params.push(to_date); }
    if (activity_type) { query += ` AND activity_type = $${paramIdx++}`; params.push(activity_type); }

    query += ` ORDER BY timestamp DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    // ספירת סה"כ רשומות
    let countQuery = `SELECT COUNT(*) FROM agent_gps_tracking WHERE 1=1`;
    const countParams: any[] = [];
    let countIdx = 1;
    if (agent_id) { countQuery += ` AND agent_id = $${countIdx++}`; countParams.push(agent_id); }
    if (from_date) { countQuery += ` AND timestamp >= $${countIdx++}`; countParams.push(from_date); }
    if (to_date) { countQuery += ` AND timestamp <= $${countIdx++}`; countParams.push(to_date); }
    if (activity_type) { countQuery += ` AND activity_type = $${countIdx++}`; countParams.push(activity_type); }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      success: true,
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// קבלת רשומת GPS בודדת
router.get('/gps-tracking/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM agent_gps_tracking WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'רשומת GPS לא נמצאה' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// יצירת רשומת GPS חדשה
router.post('/gps-tracking', async (req: Request, res: Response) => {
  try {
    const {
      agent_id, agent_name, latitude, longitude, address, accuracy_meters,
      activity_type, associated_customer_id, associated_customer_name, battery_level, notes
    } = req.body;

    const result = await pool.query(`
      INSERT INTO agent_gps_tracking
        (agent_id, agent_name, latitude, longitude, address, accuracy_meters, activity_type,
         associated_customer_id, associated_customer_name, battery_level, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [agent_id, agent_name, latitude, longitude, address, accuracy_meters,
        activity_type || 'travel', associated_customer_id, associated_customer_name, battery_level, notes]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// עדכון רשומת GPS
router.put('/gps-tracking/:id', async (req: Request, res: Response) => {
  try {
    const fields = req.body;
    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      setClauses.push(`${key} = $${idx++}`);
      params.push(value);
    }

    if (setClauses.length === 0) return res.status(400).json({ success: false, error: 'אין שדות לעדכון' });

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE agent_gps_tracking SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'רשומת GPS לא נמצאה' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// CRUD - agent_call_records - רשומות שיחות סוכנים
// ===================================================================

// קבלת כל השיחות
router.get('/call-records', async (req: Request, res: Response) => {
  try {
    const { agent_id, customer_id, call_type, direction, sentiment, from_date, to_date, answered, follow_up_required, limit = 100, offset = 0 } = req.query;
    let query = `SELECT * FROM agent_call_records WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;

    if (agent_id) { query += ` AND agent_id = $${paramIdx++}`; params.push(agent_id); }
    if (customer_id) { query += ` AND customer_id = $${paramIdx++}`; params.push(customer_id); }
    if (call_type) { query += ` AND call_type = $${paramIdx++}`; params.push(call_type); }
    if (direction) { query += ` AND direction = $${paramIdx++}`; params.push(direction); }
    if (sentiment) { query += ` AND sentiment = $${paramIdx++}`; params.push(sentiment); }
    if (from_date) { query += ` AND start_time >= $${paramIdx++}`; params.push(from_date); }
    if (to_date) { query += ` AND start_time <= $${paramIdx++}`; params.push(to_date); }
    if (answered !== undefined) { query += ` AND answered = $${paramIdx++}`; params.push(answered === 'true'); }
    if (follow_up_required !== undefined) { query += ` AND follow_up_required = $${paramIdx++}`; params.push(follow_up_required === 'true'); }

    query += ` ORDER BY start_time DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// קבלת שיחה בודדת
router.get('/call-records/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM agent_call_records WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'רשומת שיחה לא נמצאה' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// יצירת רשומת שיחה חדשה
router.post('/call-records', async (req: Request, res: Response) => {
  try {
    const {
      agent_id, agent_name, call_type, phone_number, contact_name, customer_id,
      direction, start_time, end_time, duration_seconds, answered, recording_url,
      transcript, transcript_analysis, sentiment, keywords, follow_up_required,
      follow_up_date, notes
    } = req.body;

    const result = await pool.query(`
      INSERT INTO agent_call_records
        (agent_id, agent_name, call_type, phone_number, contact_name, customer_id,
         direction, start_time, end_time, duration_seconds, answered, recording_url,
         transcript, transcript_analysis, sentiment, keywords, follow_up_required,
         follow_up_date, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *
    `, [agent_id, agent_name, call_type, phone_number, contact_name, customer_id,
        direction || 'outgoing', start_time, end_time, duration_seconds, answered ?? true,
        recording_url, transcript, transcript_analysis, sentiment,
        keywords ? JSON.stringify(keywords) : '[]', follow_up_required ?? false,
        follow_up_date, notes]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// עדכון רשומת שיחה
router.put('/call-records/:id', async (req: Request, res: Response) => {
  try {
    const fields = req.body;
    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === 'keywords' || key === 'transcript_analysis') {
        setClauses.push(`${key} = $${idx++}::jsonb`);
        params.push(JSON.stringify(value));
      } else {
        setClauses.push(`${key} = $${idx++}`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) return res.status(400).json({ success: false, error: 'אין שדות לעדכון' });

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE agent_call_records SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'רשומת שיחה לא נמצאה' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// CRUD - agent_daily_reports - דוחות יומיים
// ===================================================================

// קבלת כל הדוחות היומיים
router.get('/daily-reports', async (req: Request, res: Response) => {
  try {
    const { agent_id, from_date, to_date, limit = 100, offset = 0 } = req.query;
    let query = `SELECT * FROM agent_daily_reports WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;

    if (agent_id) { query += ` AND agent_id = $${paramIdx++}`; params.push(agent_id); }
    if (from_date) { query += ` AND date >= $${paramIdx++}`; params.push(from_date); }
    if (to_date) { query += ` AND date <= $${paramIdx++}`; params.push(to_date); }

    query += ` ORDER BY date DESC, agent_id LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// קבלת דוח יומי בודד
router.get('/daily-reports/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM agent_daily_reports WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'דוח יומי לא נמצא' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// יצירת דוח יומי
router.post('/daily-reports', async (req: Request, res: Response) => {
  try {
    const {
      agent_id, agent_name, date, total_calls_out, total_calls_in, total_calls_missed,
      total_calls_returned, total_call_duration_minutes, avg_call_duration_seconds,
      total_meetings, meetings_completed, meetings_cancelled, new_leads, quotes_sent,
      deals_closed, deals_amount, total_distance_km, locations_visited,
      first_activity_time, last_activity_time, active_hours, productivity_score,
      risk_flags, ai_summary
    } = req.body;

    const result = await pool.query(`
      INSERT INTO agent_daily_reports
        (agent_id, agent_name, date, total_calls_out, total_calls_in, total_calls_missed,
         total_calls_returned, total_call_duration_minutes, avg_call_duration_seconds,
         total_meetings, meetings_completed, meetings_cancelled, new_leads, quotes_sent,
         deals_closed, deals_amount, total_distance_km, locations_visited,
         first_activity_time, last_activity_time, active_hours, productivity_score,
         risk_flags, ai_summary)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
      RETURNING *
    `, [agent_id, agent_name, date, total_calls_out || 0, total_calls_in || 0, total_calls_missed || 0,
        total_calls_returned || 0, total_call_duration_minutes || 0, avg_call_duration_seconds || 0,
        total_meetings || 0, meetings_completed || 0, meetings_cancelled || 0, new_leads || 0,
        quotes_sent || 0, deals_closed || 0, deals_amount || 0, total_distance_km || 0,
        locations_visited || 0, first_activity_time, last_activity_time, active_hours || 0,
        productivity_score, risk_flags ? JSON.stringify(risk_flags) : '[]', ai_summary]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// עדכון דוח יומי
router.put('/daily-reports/:id', async (req: Request, res: Response) => {
  try {
    const fields = req.body;
    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === 'risk_flags') {
        setClauses.push(`${key} = $${idx++}::jsonb`);
        params.push(JSON.stringify(value));
      } else {
        setClauses.push(`${key} = $${idx++}`);
        params.push(value);
      }
    }
    // תמיד עדכון חותמת זמן
    setClauses.push(`updated_at = NOW()`);

    if (setClauses.length === 1) return res.status(400).json({ success: false, error: 'אין שדות לעדכון' });

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE agent_daily_reports SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'דוח יומי לא נמצא' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// CRUD - agent_performance_scores - ציוני ביצוע
// ===================================================================

// קבלת כל ציוני הביצוע
router.get('/performance-scores', async (req: Request, res: Response) => {
  try {
    const { agent_id, period, limit = 100, offset = 0 } = req.query;
    let query = `SELECT * FROM agent_performance_scores WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;

    if (agent_id) { query += ` AND agent_id = $${paramIdx++}`; params.push(agent_id); }
    if (period) { query += ` AND period = $${paramIdx++}`; params.push(period); }

    query += ` ORDER BY overall_score DESC NULLS LAST LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// קבלת ציון ביצוע בודד
router.get('/performance-scores/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM agent_performance_scores WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'ציון ביצוע לא נמצא' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// יצירת ציון ביצוע חדש
router.post('/performance-scores', async (req: Request, res: Response) => {
  try {
    const {
      agent_id, agent_name, period, total_leads_received, total_leads_contacted, contact_rate,
      total_meetings_set, meeting_rate, total_quotes_sent, quote_rate, total_deals_closed,
      close_rate, total_revenue, avg_deal_size, avg_time_to_close_days, total_calls,
      avg_response_time_minutes, discount_requests, avg_discount_percent, customer_satisfaction,
      complaints, follow_up_compliance, sla_compliance, gps_anomalies, overall_score, rank,
      value_to_company, cost_to_company, roi, recommendations
    } = req.body;

    const result = await pool.query(`
      INSERT INTO agent_performance_scores
        (agent_id, agent_name, period, total_leads_received, total_leads_contacted, contact_rate,
         total_meetings_set, meeting_rate, total_quotes_sent, quote_rate, total_deals_closed,
         close_rate, total_revenue, avg_deal_size, avg_time_to_close_days, total_calls,
         avg_response_time_minutes, discount_requests, avg_discount_percent, customer_satisfaction,
         complaints, follow_up_compliance, sla_compliance, gps_anomalies, overall_score, rank,
         value_to_company, cost_to_company, roi, recommendations)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
      RETURNING *
    `, [agent_id, agent_name, period, total_leads_received || 0, total_leads_contacted || 0,
        contact_rate || 0, total_meetings_set || 0, meeting_rate || 0, total_quotes_sent || 0,
        quote_rate || 0, total_deals_closed || 0, close_rate || 0, total_revenue || 0,
        avg_deal_size || 0, avg_time_to_close_days, total_calls || 0, avg_response_time_minutes,
        discount_requests || 0, avg_discount_percent || 0, customer_satisfaction, complaints || 0,
        follow_up_compliance || 0, sla_compliance || 0, gps_anomalies || 0, overall_score, rank,
        value_to_company || 0, cost_to_company || 0, roi,
        recommendations ? JSON.stringify(recommendations) : '[]']);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// עדכון ציון ביצוע
router.put('/performance-scores/:id', async (req: Request, res: Response) => {
  try {
    const fields = req.body;
    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === 'recommendations') {
        setClauses.push(`${key} = $${idx++}::jsonb`);
        params.push(JSON.stringify(value));
      } else {
        setClauses.push(`${key} = $${idx++}`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) return res.status(400).json({ success: false, error: 'אין שדות לעדכון' });

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE agent_performance_scores SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'ציון ביצוע לא נמצא' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// POST /track-location/:agentId - מעקב GPS עם התאמה אוטומטית ללקוח קרוב
// ===================================================================
router.post('/track-location/:agentId', async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const { latitude, longitude, address, accuracy_meters, activity_type, battery_level, notes, agent_name } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'חסרים קורדינטות GPS - latitude ו-longitude נדרשים' });
    }

    // חיפוש לקוח קרוב - רדיוס 500 מטר (בערך 0.005 מעלות)
    // שימוש בנוסחה פשוטה של מרחק אוקלידי - מספיק לרדיוס קטן
    const nearbyCustomerQuery = await pool.query(`
      SELECT DISTINCT ON (associated_customer_id)
        associated_customer_id, associated_customer_name,
        SQRT(POWER(($1::numeric - latitude) * 111320, 2) + POWER(($2::numeric - longitude) * 111320 * COS(RADIANS($1::numeric)), 2)) AS distance_meters
      FROM agent_gps_tracking
      WHERE associated_customer_id IS NOT NULL
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND ABS(latitude - $1::numeric) < 0.005
        AND ABS(longitude - $2::numeric) < 0.005
      ORDER BY associated_customer_id, distance_meters ASC
      LIMIT 1
    `, [latitude, longitude]);

    let associatedCustomerId = null;
    let associatedCustomerName = null;
    let matchedDistance = null;

    if (nearbyCustomerQuery.rows.length > 0) {
      const match = nearbyCustomerQuery.rows[0];
      if (parseFloat(match.distance_meters) <= 500) {
        associatedCustomerId = match.associated_customer_id;
        associatedCustomerName = match.associated_customer_name;
        matchedDistance = Math.round(parseFloat(match.distance_meters));
      }
    }

    // הכנסת רשומת GPS חדשה
    const result = await pool.query(`
      INSERT INTO agent_gps_tracking
        (agent_id, agent_name, latitude, longitude, address, accuracy_meters, activity_type,
         associated_customer_id, associated_customer_name, battery_level, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [agentId, agent_name, latitude, longitude, address, accuracy_meters,
        activity_type || 'travel', associatedCustomerId, associatedCustomerName, battery_level, notes]);

    res.json({
      success: true,
      data: result.rows[0],
      nearby_customer: associatedCustomerId ? {
        customer_id: associatedCustomerId,
        customer_name: associatedCustomerName,
        distance_meters: matchedDistance
      } : null,
      message: associatedCustomerId
        ? `מיקום נרשם - סוכן קרוב ללקוח ${associatedCustomerName} (${matchedDistance}מ')`
        : 'מיקום נרשם - לא נמצא לקוח קרוב'
    });
  } catch (error: any) {
    console.error('שגיאה ברישום מיקום GPS:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// POST /log-call/:agentId - רישום שיחה עם ניתוח בסיסי
// ===================================================================
router.post('/log-call/:agentId', async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const {
      agent_name, call_type, phone_number, contact_name, customer_id,
      direction, start_time, end_time, duration_seconds, answered,
      recording_url, transcript, notes
    } = req.body;

    if (!call_type) {
      return res.status(400).json({ success: false, error: 'סוג שיחה (call_type) נדרש' });
    }

    // ניתוח בסיסי של התמלול אם קיים
    let sentiment = 'neutral';
    let keywords: string[] = [];
    let transcriptAnalysis: any = null;
    let followUpRequired = false;

    if (transcript) {
      // ניתוח סנטימנט פשוט על פי מילות מפתח
      const positiveWords = ['מעולה', 'אשמח', 'מסכים', 'נהדר', 'תודה', 'מצוין', 'בסדר', 'אהבתי', 'מתאים', 'עסקה'];
      const negativeWords = ['בעיה', 'תלונה', 'לא מרוצה', 'מאכזב', 'יקר', 'ביטול', 'עיכוב', 'פגם', 'נזק', 'תקלה'];

      const lowerTranscript = transcript.toLowerCase();
      const posCount = positiveWords.filter((w: string) => lowerTranscript.includes(w)).length;
      const negCount = negativeWords.filter((w: string) => lowerTranscript.includes(w)).length;

      if (posCount > negCount + 1) sentiment = 'positive';
      else if (negCount > posCount + 1) sentiment = 'negative';
      else if (posCount > 0 || negCount > 0) sentiment = 'neutral';

      // חילוץ מילות מפתח רלוונטיות למפעל מתכות
      const metalKeywords = ['ברזל', 'אלומיניום', 'זכוכית', 'פלדה', 'נירוסטה', 'פח', 'מתכת',
        'חיתוך', 'כיפוף', 'ריתוך', 'ליטוש', 'צביעה', 'אנודייז', 'הרכבה',
        'מחיר', 'הצעה', 'הנחה', 'משלוח', 'התקנה', 'מדידה', 'תכנון',
        'פרויקט', 'הזמנה', 'אספקה', 'חשבונית', 'תשלום'];

      keywords = metalKeywords.filter((kw: string) => lowerTranscript.includes(kw));

      // בדיקה אם נדרש פולואפ
      const followUpIndicators = ['נחזור', 'אתקשר', 'נקבע', 'תזכיר', 'שלח', 'בדוק', 'תבדוק'];
      followUpRequired = followUpIndicators.some((w: string) => lowerTranscript.includes(w));

      // סיכום ניתוח
      transcriptAnalysis = {
        sentiment,
        positive_indicators: posCount,
        negative_indicators: negCount,
        keywords_found: keywords.length,
        word_count: transcript.split(/\s+/).length,
        follow_up_detected: followUpRequired,
        analyzed_at: new Date().toISOString()
      };
    }

    // חישוב משך שיחה אם לא סופק
    let calcDuration = duration_seconds;
    if (!calcDuration && start_time && end_time) {
      calcDuration = Math.round((new Date(end_time).getTime() - new Date(start_time).getTime()) / 1000);
    }

    // חישוב תאריך פולואפ - 3 ימי עסקים קדימה
    let followUpDate = null;
    if (followUpRequired) {
      const d = new Date();
      let daysAdded = 0;
      while (daysAdded < 3) {
        d.setDate(d.getDate() + 1);
        // דילוג על שישי-שבת (5=שישי, 6=שבת בישראל)
        if (d.getDay() !== 5 && d.getDay() !== 6) daysAdded++;
      }
      followUpDate = d.toISOString().split('T')[0];
    }

    const result = await pool.query(`
      INSERT INTO agent_call_records
        (agent_id, agent_name, call_type, phone_number, contact_name, customer_id,
         direction, start_time, end_time, duration_seconds, answered, recording_url,
         transcript, transcript_analysis, sentiment, keywords, follow_up_required,
         follow_up_date, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *
    `, [agentId, agent_name, call_type, phone_number, contact_name, customer_id,
        direction || 'outgoing', start_time, end_time, calcDuration, answered ?? true,
        recording_url, transcript, transcriptAnalysis ? JSON.stringify(transcriptAnalysis) : null,
        sentiment, JSON.stringify(keywords), followUpRequired, followUpDate, notes]);

    res.json({
      success: true,
      data: result.rows[0],
      analysis: {
        sentiment,
        keywords,
        follow_up_required: followUpRequired,
        follow_up_date: followUpDate,
        transcript_analyzed: !!transcript
      },
      message: `שיחה נרשמה בהצלחה - סנטימנט: ${sentiment}, מילות מפתח: ${keywords.length}`
    });
  } catch (error: any) {
    console.error('שגיאה ברישום שיחה:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// GET /agent-live-map - מפה חיה של כל הסוכנים - מיקום אחרון
// ===================================================================
router.get('/agent-live-map', async (_req: Request, res: Response) => {
  try {
    // שליפת המיקום האחרון של כל סוכן
    const result = await pool.query(`
      SELECT DISTINCT ON (agent_id)
        agent_id, agent_name, latitude, longitude, address, accuracy_meters,
        timestamp, activity_type, associated_customer_id, associated_customer_name,
        battery_level, notes,
        EXTRACT(EPOCH FROM (NOW() - timestamp)) / 60 AS minutes_since_update
      FROM agent_gps_tracking
      ORDER BY agent_id, timestamp DESC
    `);

    // סטטוס כל סוכן בהתבסס על זמן מאז עדכון אחרון
    const agents = result.rows.map((row: any) => {
      const minutesSince = parseFloat(row.minutes_since_update);
      let status = 'active'; // פעיל
      if (minutesSince > 60) status = 'inactive'; // לא פעיל - יותר משעה
      else if (minutesSince > 15) status = 'idle'; // לא נע - יותר מ-15 דקות

      return {
        ...row,
        status,
        minutes_since_update: Math.round(minutesSince),
        battery_warning: row.battery_level !== null && row.battery_level < 20
      };
    });

    // סיכום כללי
    const summary = {
      total_agents: agents.length,
      active: agents.filter((a: any) => a.status === 'active').length,
      idle: agents.filter((a: any) => a.status === 'idle').length,
      inactive: agents.filter((a: any) => a.status === 'inactive').length,
      low_battery: agents.filter((a: any) => a.battery_warning).length
    };

    res.json({ success: true, data: agents, summary });
  } catch (error: any) {
    console.error('שגיאה בשליפת מפת סוכנים:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// GET /agent-route/:agentId/:date - מסלול מלא ליום עם עצירות
// ===================================================================
router.get('/agent-route/:agentId/:date', async (req: Request, res: Response) => {
  try {
    const { agentId, date } = req.params;

    // שליפת כל נקודות המסלול ליום
    const routeResult = await pool.query(`
      SELECT * FROM agent_gps_tracking
      WHERE agent_id = $1 AND DATE(timestamp) = $2
      ORDER BY timestamp ASC
    `, [agentId, date]);

    if (routeResult.rows.length === 0) {
      return res.json({
        success: true,
        data: { route: [], stops: [], summary: null },
        message: 'לא נמצאו נתוני GPS לתאריך זה'
      });
    }

    const route = routeResult.rows;

    // זיהוי עצירות - נקודות שבהן הסוכן שהה מעל 5 דקות
    const stops: any[] = [];
    let stopStart: any = null;

    for (let i = 0; i < route.length; i++) {
      const point = route[i];
      if (point.activity_type === 'meeting' || point.activity_type === 'break') {
        if (!stopStart) {
          stopStart = point;
        }
      } else {
        if (stopStart) {
          const durationMinutes = Math.round(
            (new Date(point.timestamp).getTime() - new Date(stopStart.timestamp).getTime()) / 60000
          );
          stops.push({
            location: { lat: parseFloat(stopStart.latitude), lng: parseFloat(stopStart.longitude) },
            address: stopStart.address,
            customer_id: stopStart.associated_customer_id,
            customer_name: stopStart.associated_customer_name,
            activity_type: stopStart.activity_type,
            arrival_time: stopStart.timestamp,
            departure_time: point.timestamp,
            duration_minutes: durationMinutes
          });
          stopStart = null;
        }
      }
    }

    // אם עצירה אחרונה עדיין פתוחה
    if (stopStart) {
      const lastPoint = route[route.length - 1];
      const durationMinutes = Math.round(
        (new Date(lastPoint.timestamp).getTime() - new Date(stopStart.timestamp).getTime()) / 60000
      );
      stops.push({
        location: { lat: parseFloat(stopStart.latitude), lng: parseFloat(stopStart.longitude) },
        address: stopStart.address,
        customer_id: stopStart.associated_customer_id,
        customer_name: stopStart.associated_customer_name,
        activity_type: stopStart.activity_type,
        arrival_time: stopStart.timestamp,
        departure_time: lastPoint.timestamp,
        duration_minutes: durationMinutes
      });
    }

    // חישוב מרחק כולל
    let totalDistanceKm = 0;
    for (let i = 1; i < route.length; i++) {
      const lat1 = parseFloat(route[i - 1].latitude);
      const lng1 = parseFloat(route[i - 1].longitude);
      const lat2 = parseFloat(route[i].latitude);
      const lng2 = parseFloat(route[i].longitude);
      // נוסחת Haversine לחישוב מרחק
      const R = 6371; // רדיוס כדור הארץ בק"מ
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      totalDistanceKm += R * c;
    }

    // סיכום מסלול
    const summary = {
      agent_id: parseInt(agentId),
      agent_name: route[0].agent_name,
      date,
      total_points: route.length,
      total_stops: stops.length,
      total_distance_km: Math.round(totalDistanceKm * 100) / 100,
      first_location_time: route[0].timestamp,
      last_location_time: route[route.length - 1].timestamp,
      unique_customers_visited: [...new Set(stops.filter((s: any) => s.customer_id).map((s: any) => s.customer_id))].length
    };

    res.json({
      success: true,
      data: { route, stops, summary }
    });
  } catch (error: any) {
    console.error('שגיאה בשליפת מסלול סוכן:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// POST /generate-daily-report/:agentId/:date - חישוב מדדים יומיים
// ===================================================================
router.post('/generate-daily-report/:agentId/:date', async (req: Request, res: Response) => {
  try {
    const { agentId, date } = req.params;

    // שליפת שם הסוכן
    const agentNameResult = await pool.query(`
      SELECT agent_name FROM agent_gps_tracking WHERE agent_id = $1 LIMIT 1
    `, [agentId]);
    const agentName = agentNameResult.rows[0]?.agent_name || `סוכן ${agentId}`;

    // נתוני שיחות ליום
    const callStats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE direction = 'outgoing') AS calls_out,
        COUNT(*) FILTER (WHERE direction = 'incoming') AS calls_in,
        COUNT(*) FILTER (WHERE answered = false) AS calls_missed,
        COUNT(*) FILTER (WHERE direction = 'outgoing' AND answered = true AND call_type = 'follow_up') AS calls_returned,
        COALESCE(SUM(duration_seconds) / 60.0, 0) AS total_duration_minutes,
        COALESCE(AVG(duration_seconds) FILTER (WHERE answered = true AND duration_seconds > 0), 0) AS avg_duration_seconds,
        MIN(start_time) AS first_call,
        MAX(COALESCE(end_time, start_time)) AS last_call
      FROM agent_call_records
      WHERE agent_id = $1 AND DATE(start_time) = $2
    `, [agentId, date]);

    const cs = callStats.rows[0];

    // נתוני GPS ליום
    const gpsStats = await pool.query(`
      SELECT
        COUNT(*) AS total_points,
        COUNT(DISTINCT associated_customer_id) FILTER (WHERE associated_customer_id IS NOT NULL) AS locations_visited,
        MIN(timestamp) AS first_location,
        MAX(timestamp) AS last_location
      FROM agent_gps_tracking
      WHERE agent_id = $1 AND DATE(timestamp) = $2
    `, [agentId, date]);

    const gs = gpsStats.rows[0];

    // חישוב מרחק מנתוני GPS
    const routePoints = await pool.query(`
      SELECT latitude, longitude FROM agent_gps_tracking
      WHERE agent_id = $1 AND DATE(timestamp) = $2
      ORDER BY timestamp ASC
    `, [agentId, date]);

    let totalDistanceKm = 0;
    for (let i = 1; i < routePoints.rows.length; i++) {
      const lat1 = parseFloat(routePoints.rows[i - 1].latitude);
      const lng1 = parseFloat(routePoints.rows[i - 1].longitude);
      const lat2 = parseFloat(routePoints.rows[i].latitude);
      const lng2 = parseFloat(routePoints.rows[i].longitude);
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      totalDistanceKm += R * c;
    }

    // ספירת פגישות - activity_type = 'meeting' ב-GPS
    const meetingStats = await pool.query(`
      SELECT
        COUNT(DISTINCT associated_customer_id) FILTER (WHERE activity_type = 'meeting') AS total_meetings,
        COUNT(DISTINCT associated_customer_id) FILTER (WHERE activity_type = 'meeting' AND associated_customer_id IS NOT NULL) AS meetings_completed
      FROM agent_gps_tracking
      WHERE agent_id = $1 AND DATE(timestamp) = $2
    `, [agentId, date]);

    const ms = meetingStats.rows[0];

    // חישוב שעות פעילות
    const firstActivity = gs.first_location || cs.first_call;
    const lastActivity = gs.last_location || cs.last_call;
    let activeHours = 0;
    if (firstActivity && lastActivity) {
      activeHours = Math.round(
        (new Date(lastActivity).getTime() - new Date(firstActivity).getTime()) / 3600000 * 100
      ) / 100;
    }

    // חישוב ציון פרודוקטיביות (0-100)
    const callsScore = Math.min(parseInt(cs.calls_out || 0) * 5, 30); // עד 30 נקודות
    const meetingsScore = Math.min(parseInt(ms.total_meetings || 0) * 10, 30); // עד 30 נקודות
    const hoursScore = Math.min(activeHours * 4, 20); // עד 20 נקודות
    const distanceScore = Math.min(totalDistanceKm * 0.5, 20); // עד 20 נקודות
    const productivityScore = Math.round((callsScore + meetingsScore + hoursScore + distanceScore) * 100) / 100;

    // זיהוי דגלי סיכון
    const riskFlags: string[] = [];
    if (parseInt(cs.calls_out || 0) < 3) riskFlags.push('low_outgoing_calls');
    if (parseInt(cs.calls_missed || 0) > 3) riskFlags.push('high_missed_calls');
    if (activeHours < 4) riskFlags.push('low_active_hours');
    if (totalDistanceKm < 10) riskFlags.push('low_travel');
    if (parseInt(ms.total_meetings || 0) === 0) riskFlags.push('no_meetings');

    // סיכום AI
    const aiSummary = `סוכן ${agentName} - ${date}: ` +
      `${cs.calls_out || 0} שיחות יוצאות, ${cs.calls_in || 0} נכנסות, ${cs.calls_missed || 0} שלא נענו. ` +
      `${ms.total_meetings || 0} פגישות. ` +
      `${Math.round(totalDistanceKm)}ק"מ נסיעה, ${gs.locations_visited || 0} מיקומים. ` +
      `${activeHours} שעות פעילות. ` +
      `ציון פרודוקטיביות: ${productivityScore}. ` +
      (riskFlags.length > 0 ? `התראות: ${riskFlags.join(', ')}` : 'ללא התראות');

    // שמירה/עדכון דוח יומי
    const result = await pool.query(`
      INSERT INTO agent_daily_reports
        (agent_id, agent_name, date, total_calls_out, total_calls_in, total_calls_missed,
         total_calls_returned, total_call_duration_minutes, avg_call_duration_seconds,
         total_meetings, meetings_completed, meetings_cancelled,
         new_leads, quotes_sent, deals_closed, deals_amount,
         total_distance_km, locations_visited, first_activity_time, last_activity_time,
         active_hours, productivity_score, risk_flags, ai_summary)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
      ON CONFLICT (agent_id, date) DO UPDATE SET
        total_calls_out = EXCLUDED.total_calls_out,
        total_calls_in = EXCLUDED.total_calls_in,
        total_calls_missed = EXCLUDED.total_calls_missed,
        total_calls_returned = EXCLUDED.total_calls_returned,
        total_call_duration_minutes = EXCLUDED.total_call_duration_minutes,
        avg_call_duration_seconds = EXCLUDED.avg_call_duration_seconds,
        total_meetings = EXCLUDED.total_meetings,
        meetings_completed = EXCLUDED.meetings_completed,
        total_distance_km = EXCLUDED.total_distance_km,
        locations_visited = EXCLUDED.locations_visited,
        first_activity_time = EXCLUDED.first_activity_time,
        last_activity_time = EXCLUDED.last_activity_time,
        active_hours = EXCLUDED.active_hours,
        productivity_score = EXCLUDED.productivity_score,
        risk_flags = EXCLUDED.risk_flags,
        ai_summary = EXCLUDED.ai_summary,
        updated_at = NOW()
      RETURNING *
    `, [
      agentId, agentName, date,
      parseInt(cs.calls_out || 0), parseInt(cs.calls_in || 0), parseInt(cs.calls_missed || 0),
      parseInt(cs.calls_returned || 0), Math.round(parseFloat(cs.total_duration_minutes || 0) * 10) / 10,
      Math.round(parseFloat(cs.avg_duration_seconds || 0)),
      parseInt(ms.total_meetings || 0), parseInt(ms.meetings_completed || 0), 0,
      0, 0, 0, 0,
      Math.round(totalDistanceKm * 100) / 100, parseInt(gs.locations_visited || 0),
      firstActivity, lastActivity, activeHours, productivityScore,
      JSON.stringify(riskFlags), aiSummary
    ]);

    res.json({
      success: true,
      data: result.rows[0],
      message: `דוח יומי נוצר בהצלחה עבור ${agentName} - ${date}`
    });
  } catch (error: any) {
    console.error('שגיאה ביצירת דוח יומי:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// GET /agent-dashboard/:agentId - דשבורד מלא לסוכן
// ===================================================================
router.get('/agent-dashboard/:agentId', async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.agentId);

    // מידע בסיסי - דוח יומי אחרון
    const latestReport = await pool.query(`
      SELECT * FROM agent_daily_reports WHERE agent_id = $1 ORDER BY date DESC LIMIT 1
    `, [agentId]);

    // KPIs - ממוצעים ל-30 יום אחרונים
    const kpis = await pool.query(`
      SELECT
        COALESCE(AVG(total_calls_out + total_calls_in), 0) AS avg_daily_calls,
        COALESCE(AVG(total_meetings), 0) AS avg_daily_meetings,
        COALESCE(AVG(deals_closed), 0) AS avg_daily_deals,
        COALESCE(SUM(deals_amount), 0) AS total_revenue_30d,
        COALESCE(AVG(productivity_score), 0) AS avg_productivity,
        COALESCE(AVG(total_distance_km), 0) AS avg_daily_distance,
        COALESCE(AVG(active_hours), 0) AS avg_active_hours,
        COUNT(*) AS days_tracked
      FROM agent_daily_reports
      WHERE agent_id = $1 AND date >= CURRENT_DATE - INTERVAL '30 days'
    `, [agentId]);

    // שיחות אחרונות - 10 אחרונות
    const recentCalls = await pool.query(`
      SELECT id, call_type, contact_name, customer_id, direction, start_time,
             duration_seconds, answered, sentiment, follow_up_required
      FROM agent_call_records
      WHERE agent_id = $1
      ORDER BY start_time DESC LIMIT 10
    `, [agentId]);

    // מיקום נוכחי
    const currentLocation = await pool.query(`
      SELECT * FROM agent_gps_tracking
      WHERE agent_id = $1 ORDER BY timestamp DESC LIMIT 1
    `, [agentId]);

    // ציון ביצוע אחרון
    const latestScore = await pool.query(`
      SELECT * FROM agent_performance_scores
      WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1
    `, [agentId]);

    // שיחות שדורשות פולואפ
    const pendingFollowUps = await pool.query(`
      SELECT id, contact_name, customer_id, call_type, follow_up_date, notes
      FROM agent_call_records
      WHERE agent_id = $1 AND follow_up_required = true AND follow_up_date >= CURRENT_DATE
      ORDER BY follow_up_date ASC LIMIT 10
    `, [agentId]);

    // מגמת ביצועים - 7 ימים אחרונים
    const trend = await pool.query(`
      SELECT date, total_calls_out + total_calls_in AS total_calls,
             total_meetings, deals_closed, deals_amount, productivity_score
      FROM agent_daily_reports
      WHERE agent_id = $1 AND date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY date ASC
    `, [agentId]);

    res.json({
      success: true,
      data: {
        agent_id: agentId,
        agent_name: latestReport.rows[0]?.agent_name || currentLocation.rows[0]?.agent_name || `סוכן ${agentId}`,
        latest_report: latestReport.rows[0] || null,
        kpis: kpis.rows[0],
        recent_calls: recentCalls.rows,
        current_location: currentLocation.rows[0] || null,
        performance_score: latestScore.rows[0] || null,
        pending_follow_ups: pendingFollowUps.rows,
        trend: trend.rows
      }
    });
  } catch (error: any) {
    console.error('שגיאה בשליפת דשבורד סוכן:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// POST /calculate-performance/:agentId/:period - חישוב מדדי ביצוע
// ===================================================================
router.post('/calculate-performance/:agentId/:period', async (req: Request, res: Response) => {
  try {
    const { agentId, period } = req.params; // period format: '2026-03' או '2026-Q1'

    // קביעת טווח תאריכים על פי תקופה
    let startDate: string;
    let endDate: string;

    if (period.includes('Q')) {
      // רבעון - Q1, Q2, Q3, Q4
      const year = period.split('-')[0];
      const quarter = parseInt(period.split('Q')[1]);
      const startMonth = (quarter - 1) * 3 + 1;
      startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
      const endMonth = startMonth + 2;
      const lastDay = new Date(parseInt(year), endMonth, 0).getDate();
      endDate = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
    } else {
      // חודש
      startDate = `${period}-01`;
      const [year, month] = period.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      endDate = `${period}-${lastDay}`;
    }

    // שליפת שם הסוכן
    const agentNameResult = await pool.query(`
      SELECT agent_name FROM agent_daily_reports WHERE agent_id = $1 LIMIT 1
    `, [agentId]);
    const agentName = agentNameResult.rows[0]?.agent_name || `סוכן ${agentId}`;

    // סטטיסטיקות שיחות
    const callStats = await pool.query(`
      SELECT
        COUNT(*) AS total_calls,
        COUNT(*) FILTER (WHERE answered = false) AS missed_calls,
        COALESCE(AVG(duration_seconds) FILTER (WHERE answered = true), 0) AS avg_duration,
        COALESCE(AVG(EXTRACT(EPOCH FROM (start_time - created_at)) / 60) FILTER (WHERE direction = 'outgoing'), 0) AS avg_response_minutes
      FROM agent_call_records
      WHERE agent_id = $1 AND DATE(start_time) BETWEEN $2 AND $3
    `, [agentId, startDate, endDate]);

    // סטטיסטיקות מדוחות יומיים
    const dailyStats = await pool.query(`
      SELECT
        COALESCE(SUM(new_leads), 0) AS total_leads,
        COALESCE(SUM(total_meetings), 0) AS total_meetings,
        COALESCE(SUM(meetings_completed), 0) AS meetings_completed,
        COALESCE(SUM(quotes_sent), 0) AS total_quotes,
        COALESCE(SUM(deals_closed), 0) AS total_deals,
        COALESCE(SUM(deals_amount), 0) AS total_revenue,
        COALESCE(AVG(productivity_score), 0) AS avg_productivity
      FROM agent_daily_reports
      WHERE agent_id = $1 AND date BETWEEN $2 AND $3
    `, [agentId, startDate, endDate]);

    const cs = callStats.rows[0];
    const ds = dailyStats.rows[0];

    // חישוב שיעורי המרה
    const totalLeads = parseInt(ds.total_leads) || 1; // מניעת חלוקה באפס
    const contacted = parseInt(cs.total_calls) || 0;
    const meetingsSet = parseInt(ds.total_meetings) || 0;
    const quotes = parseInt(ds.total_quotes) || 0;
    const deals = parseInt(ds.total_deals) || 0;
    const revenue = parseFloat(ds.total_revenue) || 0;

    const contactRate = Math.round((contacted / Math.max(totalLeads, 1)) * 10000) / 100;
    const meetingRate = Math.round((meetingsSet / Math.max(contacted, 1)) * 10000) / 100;
    const quoteRate = Math.round((quotes / Math.max(meetingsSet, 1)) * 10000) / 100;
    const closeRate = Math.round((deals / Math.max(quotes, 1)) * 10000) / 100;
    const avgDealSize = deals > 0 ? Math.round(revenue / deals) : 0;

    // חישוב GPS anomalies - בדיקת חריגות
    const gpsAnomalies = await pool.query(`
      SELECT COUNT(*) AS anomalies FROM (
        SELECT agent_id,
          LAG(latitude) OVER (ORDER BY timestamp) AS prev_lat,
          LAG(longitude) OVER (ORDER BY timestamp) AS prev_lng,
          LAG(timestamp) OVER (ORDER BY timestamp) AS prev_time,
          latitude, longitude, timestamp
        FROM agent_gps_tracking
        WHERE agent_id = $1 AND DATE(timestamp) BETWEEN $2 AND $3
      ) sub
      WHERE prev_lat IS NOT NULL
        AND SQRT(POWER((latitude - prev_lat) * 111, 2) + POWER((longitude - prev_lng) * 111, 2)) > 100
        AND EXTRACT(EPOCH FROM (timestamp - prev_time)) < 3600
    `, [agentId, startDate, endDate]);

    // חישוב ציון כולל
    const callScore = Math.min(contacted * 0.5, 20);
    const meetingScore = Math.min(meetingsSet * 2, 20);
    const quoteScore = Math.min(quotes * 3, 15);
    const dealScore = Math.min(deals * 5, 20);
    const revenueScore = Math.min(revenue / 10000, 15);
    const complianceScore = 10; // ציון בסיס
    const overallScore = Math.round((callScore + meetingScore + quoteScore + dealScore + revenueScore + complianceScore) * 100) / 100;

    // עלות סוכן (משוער)
    const costToCompany = 15000; // עלות חודשית משוערת
    const roiCalc = costToCompany > 0 ? Math.round((revenue / costToCompany) * 100) / 100 : 0;

    // המלצות אוטומטיות
    const recommendations: string[] = [];
    if (contactRate < 50) recommendations.push('להגביר קצב יצירת קשר עם לידים');
    if (meetingRate < 30) recommendations.push('לשפר המרת שיחות לפגישות');
    if (closeRate < 20) recommendations.push('לעבוד על שיפור אחוז סגירת עסקאות');
    if (parseInt(cs.missed_calls) > contacted * 0.2) recommendations.push('להפחית שיחות שלא נענות');
    if (parseInt(gpsAnomalies.rows[0].anomalies) > 2) recommendations.push('לבדוק חריגות GPS - ייתכנו בעיות דיווח');
    if (recommendations.length === 0) recommendations.push('ביצועים טובים - להמשיך בקו הנוכחי');

    // שמירה/עדכון
    const result = await pool.query(`
      INSERT INTO agent_performance_scores
        (agent_id, agent_name, period, total_leads_received, total_leads_contacted, contact_rate,
         total_meetings_set, meeting_rate, total_quotes_sent, quote_rate, total_deals_closed,
         close_rate, total_revenue, avg_deal_size, avg_time_to_close_days, total_calls,
         avg_response_time_minutes, discount_requests, avg_discount_percent, customer_satisfaction,
         complaints, follow_up_compliance, sla_compliance, gps_anomalies, overall_score, rank,
         value_to_company, cost_to_company, roi, recommendations)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
      ON CONFLICT (agent_id, period) DO UPDATE SET
        total_leads_received = EXCLUDED.total_leads_received,
        total_leads_contacted = EXCLUDED.total_leads_contacted,
        contact_rate = EXCLUDED.contact_rate,
        total_meetings_set = EXCLUDED.total_meetings_set,
        meeting_rate = EXCLUDED.meeting_rate,
        total_quotes_sent = EXCLUDED.total_quotes_sent,
        quote_rate = EXCLUDED.quote_rate,
        total_deals_closed = EXCLUDED.total_deals_closed,
        close_rate = EXCLUDED.close_rate,
        total_revenue = EXCLUDED.total_revenue,
        avg_deal_size = EXCLUDED.avg_deal_size,
        total_calls = EXCLUDED.total_calls,
        avg_response_time_minutes = EXCLUDED.avg_response_time_minutes,
        gps_anomalies = EXCLUDED.gps_anomalies,
        overall_score = EXCLUDED.overall_score,
        value_to_company = EXCLUDED.value_to_company,
        cost_to_company = EXCLUDED.cost_to_company,
        roi = EXCLUDED.roi,
        recommendations = EXCLUDED.recommendations
      RETURNING *
    `, [
      agentId, agentName, period,
      totalLeads, contacted, contactRate,
      meetingsSet, meetingRate, quotes, quoteRate,
      deals, closeRate, revenue, avgDealSize,
      null, parseInt(cs.total_calls), Math.round(parseFloat(cs.avg_response_minutes)),
      0, 0, null, 0,
      0, 0, parseInt(gpsAnomalies.rows[0].anomalies),
      overallScore, null,
      revenue, costToCompany, roiCalc,
      JSON.stringify(recommendations)
    ]);

    res.json({
      success: true,
      data: result.rows[0],
      message: `ציון ביצוע חושב בהצלחה עבור ${agentName} - תקופה ${period}`
    });
  } catch (error: any) {
    console.error('שגיאה בחישוב ביצועים:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// GET /leaderboard/:period - דירוג סוכנים לפי ציון כולל
// ===================================================================
router.get('/leaderboard/:period', async (req: Request, res: Response) => {
  try {
    const { period } = req.params;

    const result = await pool.query(`
      SELECT
        agent_id, agent_name, period, overall_score,
        total_revenue, total_deals_closed, close_rate,
        total_calls, total_meetings_set, contact_rate,
        avg_deal_size, roi, gps_anomalies, complaints,
        recommendations,
        RANK() OVER (ORDER BY overall_score DESC NULLS LAST) AS calculated_rank
      FROM agent_performance_scores
      WHERE period = $1
      ORDER BY overall_score DESC NULLS LAST
    `, [period]);

    // עדכון דירוג בטבלה
    for (const row of result.rows) {
      await pool.query(`
        UPDATE agent_performance_scores SET rank = $1 WHERE agent_id = $2 AND period = $3
      `, [row.calculated_rank, row.agent_id, period]);
    }

    // סטטיסטיקות כלליות
    const stats = await pool.query(`
      SELECT
        COUNT(*) AS total_agents,
        COALESCE(AVG(overall_score), 0) AS avg_score,
        COALESCE(MAX(overall_score), 0) AS max_score,
        COALESCE(MIN(overall_score), 0) AS min_score,
        COALESCE(SUM(total_revenue), 0) AS total_team_revenue,
        COALESCE(SUM(total_deals_closed), 0) AS total_team_deals,
        COALESCE(AVG(close_rate), 0) AS avg_close_rate
      FROM agent_performance_scores
      WHERE period = $1
    `, [period]);

    res.json({
      success: true,
      data: {
        period,
        leaderboard: result.rows,
        team_stats: stats.rows[0]
      }
    });
  } catch (error: any) {
    console.error('שגיאה בשליפת דירוג:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// GET /call-analytics/:agentId/:period - ניתוח שיחות מפורט
// ===================================================================
router.get('/call-analytics/:agentId/:period', async (req: Request, res: Response) => {
  try {
    const { agentId, period } = req.params;

    // קביעת טווח תאריכים
    let startDate: string;
    let endDate: string;
    if (period.includes('Q')) {
      const year = period.split('-')[0];
      const quarter = parseInt(period.split('Q')[1]);
      const startMonth = (quarter - 1) * 3 + 1;
      startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
      const endMonth = startMonth + 2;
      const lastDay = new Date(parseInt(year), endMonth, 0).getDate();
      endDate = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
    } else {
      startDate = `${period}-01`;
      const [year, month] = period.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      endDate = `${period}-${lastDay}`;
    }

    // סטטיסטיקות כלליות
    const generalStats = await pool.query(`
      SELECT
        COUNT(*) AS total_calls,
        COUNT(*) FILTER (WHERE direction = 'outgoing' AND answered = true) AS outgoing_answered,
        COUNT(*) FILTER (WHERE direction = 'outgoing' AND answered = false) AS outgoing_missed,
        COUNT(*) FILTER (WHERE direction = 'incoming' AND answered = true) AS incoming_answered,
        COUNT(*) FILTER (WHERE direction = 'incoming' AND answered = false) AS incoming_missed,
        COUNT(*) FILTER (WHERE call_type = 'follow_up') AS returned_calls,
        COALESCE(AVG(duration_seconds) FILTER (WHERE answered = true), 0) AS avg_duration,
        COALESCE(MAX(duration_seconds), 0) AS max_duration,
        COALESCE(MIN(duration_seconds) FILTER (WHERE answered = true AND duration_seconds > 0), 0) AS min_duration,
        COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds
      FROM agent_call_records
      WHERE agent_id = $1 AND DATE(start_time) BETWEEN $2 AND $3
    `, [agentId, startDate, endDate]);

    // התפלגות לפי סוג שיחה
    const byType = await pool.query(`
      SELECT call_type, COUNT(*) AS count,
             COALESCE(AVG(duration_seconds) FILTER (WHERE answered = true), 0) AS avg_duration,
             COUNT(*) FILTER (WHERE answered = true) AS answered_count
      FROM agent_call_records
      WHERE agent_id = $1 AND DATE(start_time) BETWEEN $2 AND $3
      GROUP BY call_type ORDER BY count DESC
    `, [agentId, startDate, endDate]);

    // שעות שיא - באיזה שעה הכי הרבה שיחות
    const peakHours = await pool.query(`
      SELECT EXTRACT(HOUR FROM start_time) AS hour,
             COUNT(*) AS call_count,
             COUNT(*) FILTER (WHERE answered = true) AS answered_count,
             COALESCE(AVG(duration_seconds) FILTER (WHERE answered = true), 0) AS avg_duration
      FROM agent_call_records
      WHERE agent_id = $1 AND DATE(start_time) BETWEEN $2 AND $3
      GROUP BY EXTRACT(HOUR FROM start_time)
      ORDER BY hour
    `, [agentId, startDate, endDate]);

    // סנטימנט שיחות
    const sentimentStats = await pool.query(`
      SELECT sentiment, COUNT(*) AS count
      FROM agent_call_records
      WHERE agent_id = $1 AND DATE(start_time) BETWEEN $2 AND $3 AND sentiment IS NOT NULL
      GROUP BY sentiment ORDER BY count DESC
    `, [agentId, startDate, endDate]);

    // מגמה יומית
    const dailyTrend = await pool.query(`
      SELECT DATE(start_time) AS date,
             COUNT(*) AS total_calls,
             COUNT(*) FILTER (WHERE direction = 'outgoing') AS outgoing,
             COUNT(*) FILTER (WHERE direction = 'incoming') AS incoming,
             COUNT(*) FILTER (WHERE answered = false) AS missed,
             COALESCE(AVG(duration_seconds) FILTER (WHERE answered = true), 0) AS avg_duration
      FROM agent_call_records
      WHERE agent_id = $1 AND DATE(start_time) BETWEEN $2 AND $3
      GROUP BY DATE(start_time) ORDER BY date
    `, [agentId, startDate, endDate]);

    // שיחות שדורשות פולואפ
    const pendingFollowUps = await pool.query(`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE follow_up_date < CURRENT_DATE) AS overdue,
             COUNT(*) FILTER (WHERE follow_up_date = CURRENT_DATE) AS today,
             COUNT(*) FILTER (WHERE follow_up_date > CURRENT_DATE) AS upcoming
      FROM agent_call_records
      WHERE agent_id = $1 AND follow_up_required = true
        AND DATE(start_time) BETWEEN $2 AND $3
    `, [agentId, startDate, endDate]);

    res.json({
      success: true,
      data: {
        agent_id: parseInt(agentId),
        period,
        general: generalStats.rows[0],
        by_type: byType.rows,
        peak_hours: peakHours.rows,
        sentiment: sentimentStats.rows,
        daily_trend: dailyTrend.rows,
        follow_ups: pendingFollowUps.rows[0]
      }
    });
  } catch (error: any) {
    console.error('שגיאה בניתוח שיחות:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// GET /conversion-funnel/:agentId/:period - משפך המרה
// ===================================================================
router.get('/conversion-funnel/:agentId/:period', async (req: Request, res: Response) => {
  try {
    const { agentId, period } = req.params;

    // קביעת טווח תאריכים
    let startDate: string;
    let endDate: string;
    if (period.includes('Q')) {
      const year = period.split('-')[0];
      const quarter = parseInt(period.split('Q')[1]);
      const startMonth = (quarter - 1) * 3 + 1;
      startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
      const endMonth = startMonth + 2;
      const lastDay = new Date(parseInt(year), endMonth, 0).getDate();
      endDate = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
    } else {
      startDate = `${period}-01`;
      const [year, month] = period.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      endDate = `${period}-${lastDay}`;
    }

    // נתונים מדוחות יומיים
    const funnelData = await pool.query(`
      SELECT
        COALESCE(SUM(new_leads), 0) AS leads,
        COALESCE(SUM(total_calls_out), 0) AS contacts,
        COALESCE(SUM(total_meetings), 0) AS meetings,
        COALESCE(SUM(meetings_completed), 0) AS meetings_completed,
        COALESCE(SUM(quotes_sent), 0) AS quotes,
        COALESCE(SUM(deals_closed), 0) AS deals,
        COALESCE(SUM(deals_amount), 0) AS revenue
      FROM agent_daily_reports
      WHERE agent_id = $1 AND date BETWEEN $2 AND $3
    `, [agentId, startDate, endDate]);

    const fd = funnelData.rows[0];
    const leads = parseInt(fd.leads) || 0;
    const contacts = parseInt(fd.contacts) || 0;
    const meetings = parseInt(fd.meetings) || 0;
    const meetingsCompleted = parseInt(fd.meetings_completed) || 0;
    const quotes = parseInt(fd.quotes) || 0;
    const deals = parseInt(fd.deals) || 0;
    const revenue = parseFloat(fd.revenue) || 0;

    // חישוב שיעורי המרה בין שלבים
    const funnel = {
      stages: [
        {
          name: 'לידים',
          name_en: 'leads',
          count: leads,
          rate_from_previous: 100,
          rate_from_top: 100
        },
        {
          name: 'יצירת קשר',
          name_en: 'contacts',
          count: contacts,
          rate_from_previous: leads > 0 ? Math.round((contacts / leads) * 10000) / 100 : 0,
          rate_from_top: leads > 0 ? Math.round((contacts / leads) * 10000) / 100 : 0
        },
        {
          name: 'פגישות',
          name_en: 'meetings',
          count: meetings,
          rate_from_previous: contacts > 0 ? Math.round((meetings / contacts) * 10000) / 100 : 0,
          rate_from_top: leads > 0 ? Math.round((meetings / leads) * 10000) / 100 : 0
        },
        {
          name: 'הצעות מחיר',
          name_en: 'quotes',
          count: quotes,
          rate_from_previous: meetingsCompleted > 0 ? Math.round((quotes / meetingsCompleted) * 10000) / 100 : 0,
          rate_from_top: leads > 0 ? Math.round((quotes / leads) * 10000) / 100 : 0
        },
        {
          name: 'עסקאות',
          name_en: 'deals',
          count: deals,
          rate_from_previous: quotes > 0 ? Math.round((deals / quotes) * 10000) / 100 : 0,
          rate_from_top: leads > 0 ? Math.round((deals / leads) * 10000) / 100 : 0
        }
      ],
      total_revenue: revenue,
      avg_deal_size: deals > 0 ? Math.round(revenue / deals) : 0,
      overall_conversion: leads > 0 ? Math.round((deals / leads) * 10000) / 100 : 0
    };

    // השוואה לממוצע הצוות
    const teamAvg = await pool.query(`
      SELECT
        COALESCE(AVG(total_leads_received), 0) AS avg_leads,
        COALESCE(AVG(contact_rate), 0) AS avg_contact_rate,
        COALESCE(AVG(meeting_rate), 0) AS avg_meeting_rate,
        COALESCE(AVG(quote_rate), 0) AS avg_quote_rate,
        COALESCE(AVG(close_rate), 0) AS avg_close_rate
      FROM agent_performance_scores
      WHERE period = $1
    `, [period]);

    res.json({
      success: true,
      data: {
        agent_id: parseInt(agentId),
        period,
        funnel,
        team_comparison: teamAvg.rows[0]
      }
    });
  } catch (error: any) {
    console.error('שגיאה בשליפת משפך המרה:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// GET /risk-alerts - התראות סיכון לכל הסוכנים
// ===================================================================
router.get('/risk-alerts', async (_req: Request, res: Response) => {
  try {
    // סוכנים עם דגלי סיכון בדוחות יומיים
    const dailyRisks = await pool.query(`
      SELECT agent_id, agent_name, date, risk_flags, productivity_score
      FROM agent_daily_reports
      WHERE risk_flags != '[]'::jsonb
        AND date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY date DESC
    `);

    // סוכנים עם פעילות נמוכה - לא דיווחו GPS ב-24 שעות אחרונות
    const inactiveAgents = await pool.query(`
      SELECT agent_id, agent_name, MAX(timestamp) AS last_seen,
             EXTRACT(EPOCH FROM (NOW() - MAX(timestamp))) / 3600 AS hours_since_last
      FROM agent_gps_tracking
      GROUP BY agent_id, agent_name
      HAVING MAX(timestamp) < NOW() - INTERVAL '24 hours'
      ORDER BY last_seen ASC
    `);

    // חריגות GPS - קפיצות מיקום חשודות
    const gpsAnomalies = await pool.query(`
      SELECT agent_id, agent_name, COUNT(*) AS anomaly_count
      FROM (
        SELECT agent_id, agent_name,
          LAG(latitude) OVER (PARTITION BY agent_id ORDER BY timestamp) AS prev_lat,
          LAG(longitude) OVER (PARTITION BY agent_id ORDER BY timestamp) AS prev_lng,
          LAG(timestamp) OVER (PARTITION BY agent_id ORDER BY timestamp) AS prev_time,
          latitude, longitude, timestamp
        FROM agent_gps_tracking
        WHERE timestamp >= NOW() - INTERVAL '7 days'
      ) sub
      WHERE prev_lat IS NOT NULL
        AND SQRT(POWER((latitude - prev_lat) * 111, 2) + POWER((longitude - prev_lng) * 111, 2)) > 100
        AND EXTRACT(EPOCH FROM (timestamp - prev_time)) < 3600
      GROUP BY agent_id, agent_name
      HAVING COUNT(*) > 0
      ORDER BY anomaly_count DESC
    `);

    // סוכנים עם הנחות גבוהות
    const highDiscounts = await pool.query(`
      SELECT agent_id, agent_name, avg_discount_percent, discount_requests
      FROM agent_performance_scores
      WHERE avg_discount_percent > 10
      ORDER BY avg_discount_percent DESC
    `);

    // סוכנים עם תלונות
    const withComplaints = await pool.query(`
      SELECT agent_id, agent_name, complaints, customer_satisfaction
      FROM agent_performance_scores
      WHERE complaints > 2
      ORDER BY complaints DESC
    `);

    // שיחות פולואפ שעברו תאריך יעד
    const overdueFollowUps = await pool.query(`
      SELECT agent_id, agent_name, COUNT(*) AS overdue_count
      FROM agent_call_records
      WHERE follow_up_required = true AND follow_up_date < CURRENT_DATE
      GROUP BY agent_id, agent_name
      HAVING COUNT(*) > 0
      ORDER BY overdue_count DESC
    `);

    // סוכנים עם פרודוקטיביות נמוכה
    const lowProductivity = await pool.query(`
      SELECT agent_id, agent_name, AVG(productivity_score) AS avg_score
      FROM agent_daily_reports
      WHERE date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY agent_id, agent_name
      HAVING AVG(productivity_score) < 40
      ORDER BY avg_score ASC
    `);

    // מיון כל ההתראות
    const alerts: any[] = [];

    for (const r of dailyRisks.rows) {
      const flags = typeof r.risk_flags === 'string' ? JSON.parse(r.risk_flags) : r.risk_flags;
      if (flags.length > 0) {
        alerts.push({
          type: 'daily_risk_flags',
          severity: flags.length >= 3 ? 'high' : flags.length >= 2 ? 'medium' : 'low',
          agent_id: r.agent_id,
          agent_name: r.agent_name,
          date: r.date,
          details: { flags, productivity_score: r.productivity_score },
          message: `${r.agent_name} - דגלי סיכון: ${flags.join(', ')}`
        });
      }
    }

    for (const a of inactiveAgents.rows) {
      alerts.push({
        type: 'inactive_agent',
        severity: parseFloat(a.hours_since_last) > 48 ? 'high' : 'medium',
        agent_id: a.agent_id,
        agent_name: a.agent_name,
        details: { last_seen: a.last_seen, hours_since: Math.round(parseFloat(a.hours_since_last)) },
        message: `${a.agent_name} לא דיווח מיקום ${Math.round(parseFloat(a.hours_since_last))} שעות`
      });
    }

    for (const g of gpsAnomalies.rows) {
      alerts.push({
        type: 'gps_anomaly',
        severity: parseInt(g.anomaly_count) > 5 ? 'high' : 'medium',
        agent_id: g.agent_id,
        agent_name: g.agent_name,
        details: { anomaly_count: parseInt(g.anomaly_count) },
        message: `${g.agent_name} - ${g.anomaly_count} חריגות GPS ב-7 ימים אחרונים`
      });
    }

    for (const d of highDiscounts.rows) {
      alerts.push({
        type: 'high_discount',
        severity: parseFloat(d.avg_discount_percent) > 15 ? 'high' : 'medium',
        agent_id: d.agent_id,
        agent_name: d.agent_name,
        details: { avg_discount: d.avg_discount_percent, requests: d.discount_requests },
        message: `${d.agent_name} - הנחה ממוצעת ${d.avg_discount_percent}%`
      });
    }

    for (const c of withComplaints.rows) {
      alerts.push({
        type: 'complaints',
        severity: parseInt(c.complaints) > 5 ? 'high' : 'medium',
        agent_id: c.agent_id,
        agent_name: c.agent_name,
        details: { complaints: c.complaints, satisfaction: c.customer_satisfaction },
        message: `${c.agent_name} - ${c.complaints} תלונות, שביעות רצון ${c.customer_satisfaction}`
      });
    }

    for (const o of overdueFollowUps.rows) {
      alerts.push({
        type: 'overdue_follow_up',
        severity: parseInt(o.overdue_count) > 5 ? 'high' : 'medium',
        agent_id: o.agent_id,
        agent_name: o.agent_name,
        details: { overdue_count: parseInt(o.overdue_count) },
        message: `${o.agent_name} - ${o.overdue_count} פולואפים באיחור`
      });
    }

    for (const l of lowProductivity.rows) {
      alerts.push({
        type: 'low_productivity',
        severity: parseFloat(l.avg_score) < 25 ? 'high' : 'medium',
        agent_id: l.agent_id,
        agent_name: l.agent_name,
        details: { avg_productivity: Math.round(parseFloat(l.avg_score)) },
        message: `${l.agent_name} - פרודוקטיביות נמוכה: ${Math.round(parseFloat(l.avg_score))}`
      });
    }

    // מיון לפי חומרה
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    alerts.sort((a, b) => (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3));

    res.json({
      success: true,
      data: alerts,
      summary: {
        total_alerts: alerts.length,
        high: alerts.filter(a => a.severity === 'high').length,
        medium: alerts.filter(a => a.severity === 'medium').length,
        low: alerts.filter(a => a.severity === 'low').length
      }
    });
  } catch (error: any) {
    console.error('שגיאה בשליפת התראות סיכון:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// GET /location-vs-quotes/:agentId/:date - השוואת מיקום GPS לכתובות הצעות מחיר
// לזיהוי הונאה - האם הסוכן באמת היה במיקום שדווח
// ===================================================================
router.get('/location-vs-quotes/:agentId/:date', async (req: Request, res: Response) => {
  try {
    const { agentId, date } = req.params;

    // שליפת מיקומי GPS שדווחו כפגישות
    const gpsLocations = await pool.query(`
      SELECT id, latitude, longitude, address, timestamp, activity_type,
             associated_customer_id, associated_customer_name
      FROM agent_gps_tracking
      WHERE agent_id = $1 AND DATE(timestamp) = $2
        AND activity_type = 'meeting'
      ORDER BY timestamp ASC
    `, [agentId, date]);

    // שליפת שיחות שנעשו באותו יום - עם לקוחות
    const calls = await pool.query(`
      SELECT id, customer_id, contact_name, start_time, end_time, duration_seconds, call_type
      FROM agent_call_records
      WHERE agent_id = $1 AND DATE(start_time) = $2 AND customer_id IS NOT NULL
      ORDER BY start_time ASC
    `, [agentId, date]);

    // ניתוח - האם יש התאמה בין מיקום GPS לשיחות/פגישות
    const analysis: any[] = [];
    const issues: any[] = [];

    for (const gps of gpsLocations.rows) {
      // בדיקה אם נעשתה שיחה ללקוח הזה באותו זמן (± 30 דקות)
      const gpsTime = new Date(gps.timestamp).getTime();
      const matchingCall = calls.rows.find((call: any) => {
        if (call.customer_id !== gps.associated_customer_id) return false;
        const callTime = new Date(call.start_time).getTime();
        return Math.abs(callTime - gpsTime) < 1800000; // 30 דקות
      });

      const entry: any = {
        gps_point: {
          id: gps.id,
          lat: gps.latitude,
          lng: gps.longitude,
          address: gps.address,
          time: gps.timestamp,
          customer_id: gps.associated_customer_id,
          customer_name: gps.associated_customer_name
        },
        matching_call: matchingCall || null,
        has_call_match: !!matchingCall,
        status: 'ok'
      };

      // בדיקת חשדות
      if (!matchingCall && gps.associated_customer_id) {
        entry.status = 'suspicious';
        entry.reason = 'פגישה דווחה ב-GPS אך לא נמצאה שיחה מתאימה';
        issues.push({
          type: 'meeting_no_call',
          gps_id: gps.id,
          customer_id: gps.associated_customer_id,
          customer_name: gps.associated_customer_name,
          time: gps.timestamp,
          message: `פגישה אצל ${gps.associated_customer_name} דווחה ב-GPS אך אין שיחה מתאימה`
        });
      }

      analysis.push(entry);
    }

    // בדיקה הפוכה - שיחות בלי מיקום GPS תואם
    for (const call of calls.rows) {
      const callTime = new Date(call.start_time).getTime();
      const matchingGps = gpsLocations.rows.find((gps: any) => {
        if (gps.associated_customer_id !== call.customer_id) return false;
        const gpsTime = new Date(gps.timestamp).getTime();
        return Math.abs(gpsTime - callTime) < 1800000;
      });

      if (!matchingGps && call.call_type === 'sales') {
        issues.push({
          type: 'call_no_location',
          call_id: call.id,
          customer_id: call.customer_id,
          contact_name: call.contact_name,
          time: call.start_time,
          message: `שיחת מכירה ל-${call.contact_name} ללא דיווח מיקום GPS תואם`
        });
      }
    }

    // ציון אמינות
    const totalChecks = analysis.length + calls.rows.length;
    const issueCount = issues.length;
    const reliabilityScore = totalChecks > 0
      ? Math.round(((totalChecks - issueCount) / totalChecks) * 100)
      : 100;

    res.json({
      success: true,
      data: {
        agent_id: parseInt(agentId),
        date,
        analysis,
        issues,
        summary: {
          total_gps_meetings: gpsLocations.rows.length,
          total_calls_with_customers: calls.rows.length,
          matches_found: analysis.filter((a: any) => a.has_call_match).length,
          suspicious_entries: issues.length,
          reliability_score: reliabilityScore
        }
      }
    });
  } catch (error: any) {
    console.error('שגיאה בהשוואת מיקום להצעות:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// POST /analyze-calls/:agentId - ניתוח AI של תמלולי שיחות
// ===================================================================
router.post('/analyze-calls/:agentId', async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.agentId);
    const { from_date, to_date, limit = 50 } = req.body;

    // שליפת שיחות עם תמלולים
    let query = `
      SELECT id, call_type, contact_name, customer_id, direction,
             start_time, duration_seconds, transcript, sentiment, keywords
      FROM agent_call_records
      WHERE agent_id = $1 AND transcript IS NOT NULL AND transcript != ''
    `;
    const params: any[] = [agentId];
    let paramIdx = 2;

    if (from_date) { query += ` AND DATE(start_time) >= $${paramIdx++}`; params.push(from_date); }
    if (to_date) { query += ` AND DATE(start_time) <= $${paramIdx++}`; params.push(to_date); }

    query += ` ORDER BY start_time DESC LIMIT $${paramIdx++}`;
    params.push(limit);

    const calls = await pool.query(query, params);

    if (calls.rows.length === 0) {
      return res.json({
        success: true,
        data: { analyzed: 0, results: [] },
        message: 'לא נמצאו שיחות עם תמלולים לניתוח'
      });
    }

    // ניתוח כל שיחה
    const results: any[] = [];
    const allKeywords: Record<string, number> = {};
    let totalPositive = 0;
    let totalNeutral = 0;
    let totalNegative = 0;
    let totalQualityScore = 0;

    // מילות מפתח למוצרי מתכת
    const productKeywords = ['ברזל', 'אלומיניום', 'זכוכית', 'פלדה', 'נירוסטה', 'פח', 'מתכת', 'פרופיל', 'צינור', 'לוח', 'רשת'];
    const actionKeywords = ['חיתוך', 'כיפוף', 'ריתוך', 'ליטוש', 'צביעה', 'אנודייז', 'הרכבה', 'התקנה'];
    const salesKeywords = ['מחיר', 'הצעה', 'הנחה', 'משלוח', 'הזמנה', 'אספקה', 'חשבונית', 'תשלום', 'עסקה'];
    const qualityIndicators = ['תודה', 'מקצועי', 'אמין', 'מהיר', 'איכותי'];
    const issueIndicators = ['בעיה', 'תלונה', 'עיכוב', 'פגם', 'נזק', 'ביטול', 'החזר'];

    for (const call of calls.rows) {
      const transcript = call.transcript.toLowerCase();
      const words = transcript.split(/\s+/);

      // ניתוח סנטימנט
      const positiveWords = ['מעולה', 'אשמח', 'מסכים', 'נהדר', 'תודה', 'מצוין', 'בסדר', 'אהבתי', 'מתאים', 'עסקה'];
      const negativeWords = ['בעיה', 'תלונה', 'לא מרוצה', 'מאכזב', 'יקר', 'ביטול', 'עיכוב', 'פגם', 'נזק', 'תקלה'];

      const posCount = positiveWords.filter(w => transcript.includes(w)).length;
      const negCount = negativeWords.filter(w => transcript.includes(w)).length;

      let sentiment: string;
      if (posCount > negCount + 1) { sentiment = 'positive'; totalPositive++; }
      else if (negCount > posCount + 1) { sentiment = 'negative'; totalNegative++; }
      else { sentiment = 'neutral'; totalNeutral++; }

      // מילות מפתח
      const foundKeywords: string[] = [];
      [...productKeywords, ...actionKeywords, ...salesKeywords].forEach(kw => {
        if (transcript.includes(kw)) {
          foundKeywords.push(kw);
          allKeywords[kw] = (allKeywords[kw] || 0) + 1;
        }
      });

      // ציון איכות שיחה (0-100)
      let qualityScore = 50; // בסיס
      qualityScore += qualityIndicators.filter(w => transcript.includes(w)).length * 10;
      qualityScore -= issueIndicators.filter(w => transcript.includes(w)).length * 10;
      qualityScore += Math.min(words.length / 10, 20); // שיחות ארוכות = מעורבות
      qualityScore = Math.max(0, Math.min(100, qualityScore));
      totalQualityScore += qualityScore;

      // בניית ניתוח
      const analysis = {
        sentiment,
        positive_indicators: posCount,
        negative_indicators: negCount,
        keywords_found: foundKeywords,
        word_count: words.length,
        quality_score: qualityScore,
        products_mentioned: productKeywords.filter(kw => transcript.includes(kw)),
        actions_mentioned: actionKeywords.filter(kw => transcript.includes(kw)),
        sales_topics: salesKeywords.filter(kw => transcript.includes(kw)),
        issues_detected: issueIndicators.filter(w => transcript.includes(w)),
        analyzed_at: new Date().toISOString()
      };

      // עדכון הרשומה בבסיס הנתונים
      await pool.query(`
        UPDATE agent_call_records
        SET sentiment = $1, keywords = $2, transcript_analysis = $3
        WHERE id = $4
      `, [sentiment, JSON.stringify(foundKeywords), JSON.stringify(analysis), call.id]);

      results.push({
        call_id: call.id,
        call_type: call.call_type,
        contact_name: call.contact_name,
        direction: call.direction,
        start_time: call.start_time,
        analysis
      });
    }

    // מילות מפתח הכי נפוצות
    const topKeywords = Object.entries(allKeywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([keyword, count]) => ({ keyword, count }));

    res.json({
      success: true,
      data: {
        agent_id: agentId,
        analyzed_calls: results.length,
        results,
        summary: {
          sentiment_distribution: {
            positive: totalPositive,
            neutral: totalNeutral,
            negative: totalNegative
          },
          avg_quality_score: results.length > 0 ? Math.round(totalQualityScore / results.length) : 0,
          top_keywords: topKeywords,
          total_issues: results.reduce((sum: number, r: any) => sum + r.analysis.issues_detected.length, 0)
        }
      },
      message: `${results.length} שיחות נותחו בהצלחה`
    });
  } catch (error: any) {
    console.error('שגיאה בניתוח שיחות:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// GET /agent-value/:agentId - שווי סוכן - כמה הוא מכניס מול עלות
// ===================================================================
router.get('/agent-value/:agentId', async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.agentId);

    // הכנסות מצטברות
    const revenue = await pool.query(`
      SELECT
        COALESCE(SUM(deals_amount), 0) AS total_revenue,
        COALESCE(SUM(deals_closed), 0) AS total_deals,
        COALESCE(AVG(deals_amount) FILTER (WHERE deals_closed > 0), 0) AS avg_deal_value,
        COUNT(*) AS days_tracked,
        MIN(date) AS first_day,
        MAX(date) AS last_day
      FROM agent_daily_reports
      WHERE agent_id = $1
    `, [agentId]);

    // ציון ביצוע אחרון
    const latestPerf = await pool.query(`
      SELECT * FROM agent_performance_scores
      WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1
    `, [agentId]);

    // סטטיסטיקות שיחות
    const callStats = await pool.query(`
      SELECT
        COUNT(*) AS total_calls,
        COUNT(*) FILTER (WHERE answered = true) AS answered_calls,
        COALESCE(SUM(duration_seconds), 0) / 3600.0 AS total_call_hours,
        COUNT(DISTINCT customer_id) FILTER (WHERE customer_id IS NOT NULL) AS unique_customers
      FROM agent_call_records
      WHERE agent_id = $1
    `, [agentId]);

    // סטטיסטיקות GPS
    const gpsStats = await pool.query(`
      SELECT
        COUNT(*) AS total_gps_points,
        COUNT(DISTINCT DATE(timestamp)) AS days_in_field,
        COUNT(DISTINCT associated_customer_id) FILTER (WHERE associated_customer_id IS NOT NULL) AS customers_visited
      FROM agent_gps_tracking
      WHERE agent_id = $1
    `, [agentId]);

    const rv = revenue.rows[0];
    const perf = latestPerf.rows[0];
    const cs = callStats.rows[0];
    const gs = gpsStats.rows[0];

    const totalRevenue = parseFloat(rv.total_revenue) || 0;
    const costToCompany = perf ? parseFloat(perf.cost_to_company) : 15000;
    const daysTracked = parseInt(rv.days_tracked) || 1;

    // חישוב שווי
    const monthlyRevenue = totalRevenue / Math.max(daysTracked / 30, 1);
    const monthlyCost = costToCompany;
    const monthlyProfit = monthlyRevenue - monthlyCost;
    const roi = monthlyCost > 0 ? Math.round((monthlyRevenue / monthlyCost) * 100) / 100 : 0;

    // חישוב ערך חיי סוכן (LTV) - הנחה של 24 חודשים
    const agentLTV = monthlyProfit * 24;

    // חישוב עלות החלפה משוערת
    const replacementCost = monthlyCost * 3; // 3 חודשי הכשרה

    res.json({
      success: true,
      data: {
        agent_id: agentId,
        agent_name: perf?.agent_name || `סוכן ${agentId}`,
        financial: {
          total_revenue: totalRevenue,
          total_deals: parseInt(rv.total_deals),
          avg_deal_value: Math.round(parseFloat(rv.avg_deal_value)),
          monthly_revenue_estimate: Math.round(monthlyRevenue),
          monthly_cost: monthlyCost,
          monthly_profit: Math.round(monthlyProfit),
          roi,
          agent_ltv_24m: Math.round(agentLTV),
          replacement_cost: Math.round(replacementCost)
        },
        activity: {
          total_calls: parseInt(cs.total_calls),
          answered_rate: parseInt(cs.total_calls) > 0
            ? Math.round((parseInt(cs.answered_calls) / parseInt(cs.total_calls)) * 100)
            : 0,
          total_call_hours: Math.round(parseFloat(cs.total_call_hours) * 10) / 10,
          unique_customers_called: parseInt(cs.unique_customers),
          days_in_field: parseInt(gs.days_in_field),
          customers_visited: parseInt(gs.customers_visited)
        },
        performance: perf ? {
          overall_score: perf.overall_score,
          close_rate: perf.close_rate,
          contact_rate: perf.contact_rate,
          follow_up_compliance: perf.follow_up_compliance,
          customer_satisfaction: perf.customer_satisfaction,
          rank: perf.rank
        } : null,
        assessment: monthlyProfit > 0
          ? `סוכן רווחי - מכניס ${Math.round(monthlyRevenue)} ש"ח/חודש מול עלות ${monthlyCost} ש"ח. ROI: ${roi}x`
          : `סוכן בהפסד - הכנסה ${Math.round(monthlyRevenue)} ש"ח/חודש מול עלות ${monthlyCost} ש"ח. יש לבחון שיפור או הדרכה`
      }
    });
  } catch (error: any) {
    console.error('שגיאה בחישוב שווי סוכן:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// GET /manager-dashboard - דשבורד מנהל - סקירה כללית של כל הסוכנים
// ===================================================================
router.get('/manager-dashboard', async (_req: Request, res: Response) => {
  try {
    // סטטוס כל הסוכנים - מיקום אחרון ופעילות
    const agentStatus = await pool.query(`
      SELECT DISTINCT ON (agent_id)
        agent_id, agent_name, latitude, longitude, address, activity_type,
        timestamp, battery_level,
        EXTRACT(EPOCH FROM (NOW() - timestamp)) / 60 AS minutes_since_update
      FROM agent_gps_tracking
      ORDER BY agent_id, timestamp DESC
    `);

    const statusList = agentStatus.rows.map((row: any) => {
      const minutesSince = parseFloat(row.minutes_since_update);
      let status = 'active';
      if (minutesSince > 60) status = 'inactive';
      else if (minutesSince > 15) status = 'idle';
      return { ...row, status, minutes_since_update: Math.round(minutesSince) };
    });

    // ביצועי היום - סיכום כל הסוכנים
    const todayStats = await pool.query(`
      SELECT
        COUNT(DISTINCT agent_id) AS active_agents,
        COALESCE(SUM(total_calls_out + total_calls_in), 0) AS total_calls,
        COALESCE(SUM(total_meetings), 0) AS total_meetings,
        COALESCE(SUM(deals_closed), 0) AS total_deals,
        COALESCE(SUM(deals_amount), 0) AS total_revenue,
        COALESCE(AVG(productivity_score), 0) AS avg_productivity
      FROM agent_daily_reports
      WHERE date = CURRENT_DATE
    `);

    // ביצועי השבוע
    const weekStats = await pool.query(`
      SELECT
        COALESCE(SUM(deals_amount), 0) AS week_revenue,
        COALESCE(SUM(deals_closed), 0) AS week_deals,
        COALESCE(SUM(total_calls_out + total_calls_in), 0) AS week_calls,
        COALESCE(SUM(total_meetings), 0) AS week_meetings
      FROM agent_daily_reports
      WHERE date >= CURRENT_DATE - INTERVAL '7 days'
    `);

    // ביצועי החודש
    const monthStats = await pool.query(`
      SELECT
        COALESCE(SUM(deals_amount), 0) AS month_revenue,
        COALESCE(SUM(deals_closed), 0) AS month_deals,
        COALESCE(AVG(productivity_score), 0) AS month_avg_productivity
      FROM agent_daily_reports
      WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
    `);

    // טופ סוכנים - ציון ביצוע אחרון
    const topAgents = await pool.query(`
      SELECT DISTINCT ON (agent_id)
        agent_id, agent_name, overall_score, total_revenue, total_deals_closed, close_rate, rank
      FROM agent_performance_scores
      ORDER BY agent_id, created_at DESC
    `);

    // התראות פעילות
    const alertCount = await pool.query(`
      SELECT COUNT(*) AS total FROM agent_daily_reports
      WHERE risk_flags != '[]'::jsonb AND date >= CURRENT_DATE - INTERVAL '3 days'
    `);

    // פולואפים באיחור
    const overdueCount = await pool.query(`
      SELECT COUNT(*) AS total FROM agent_call_records
      WHERE follow_up_required = true AND follow_up_date < CURRENT_DATE
    `);

    // מגמת הכנסות - 14 ימים אחרונים
    const revenueTrend = await pool.query(`
      SELECT date,
             SUM(deals_amount) AS daily_revenue,
             SUM(deals_closed) AS daily_deals,
             SUM(total_calls_out + total_calls_in) AS daily_calls
      FROM agent_daily_reports
      WHERE date >= CURRENT_DATE - INTERVAL '14 days'
      GROUP BY date ORDER BY date
    `);

    res.json({
      success: true,
      data: {
        agent_status: statusList,
        today: todayStats.rows[0],
        week: weekStats.rows[0],
        month: monthStats.rows[0],
        top_agents: topAgents.rows.sort((a: any, b: any) =>
          parseFloat(b.overall_score || 0) - parseFloat(a.overall_score || 0)
        ),
        alerts: {
          risk_flags_count: parseInt(alertCount.rows[0].total),
          overdue_follow_ups: parseInt(overdueCount.rows[0].total),
          inactive_agents: statusList.filter((a: any) => a.status === 'inactive').length
        },
        revenue_trend: revenueTrend.rows,
        summary: {
          total_agents: statusList.length,
          active_now: statusList.filter((a: any) => a.status === 'active').length,
          idle_now: statusList.filter((a: any) => a.status === 'idle').length,
          inactive_now: statusList.filter((a: any) => a.status === 'inactive').length
        }
      }
    });
  } catch (error: any) {
    console.error('שגיאה בשליפת דשבורד מנהל:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// ייצוא הראוטר
// ===================================================================
export default router;
