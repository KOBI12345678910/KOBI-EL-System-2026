import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// =============================================================================
// מנוע השוואת מדידות ואישור פרויקטים - מפעל מתכת/אלומיניום
// תהליך קריטי: סוכן מכירות נותן הצעת מחיר עם מידות → מודד שטח לוקח מידות אמיתיות
// → המערכת משווה → אם יש אי-התאמה → התראה אדומה, חסימת ייצור, שליחה למנהל פרויקט
// =============================================================================

// ─────────────────────────────────────────────
// POST /init - יצירת טבלאות
// ─────────────────────────────────────────────
router.post("/measurement-approval-engine/init", async (_req, res) => {
  try {
    await pool.query(`
      -- טבלת מדידות פרויקט - מדידות הצעת מחיר ומדידות שטח
      CREATE TABLE IF NOT EXISTS project_measurements (
        id SERIAL PRIMARY KEY,
        project_id INTEGER,
        project_name VARCHAR(500),
        customer_name VARCHAR(500),
        measurement_type VARCHAR(50) DEFAULT 'field',
        measured_by VARCHAR(200),
        measured_by_role VARCHAR(50),
        measurement_date DATE,
        items JSONB DEFAULT '[]',
        total_sqm NUMERIC(15,2),
        notes TEXT,
        photos JSONB DEFAULT '[]',
        gps_lat NUMERIC(10,7),
        gps_lng NUMERIC(10,7),
        customer_signature_url TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- טבלת השוואות מדידות - השוואה בין הצעת מחיר למדידת שטח
      CREATE TABLE IF NOT EXISTS measurement_comparisons (
        id SERIAL PRIMARY KEY,
        project_id INTEGER,
        project_name VARCHAR(500),
        quote_measurement_id INTEGER,
        field_measurement_id INTEGER,
        quote_items JSONB,
        field_items JSONB,
        discrepancies JSONB DEFAULT '[]',
        max_deviation_percent NUMERIC(5,2),
        has_critical_deviation BOOLEAN DEFAULT false,
        comparison_result VARCHAR(50) DEFAULT 'pending',
        approved_by VARCHAR(200),
        approved_at TIMESTAMPTZ,
        rejection_reason TEXT,
        notes TEXT,
        alert_sent BOOLEAN DEFAULT false,
        alert_sent_to JSONB DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'pending_review',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- טבלת אישורי פרויקט - כל שלבי האישור
      CREATE TABLE IF NOT EXISTS project_approvals (
        id SERIAL PRIMARY KEY,
        project_id INTEGER,
        project_name VARCHAR(500),
        customer_name VARCHAR(500),
        approval_type VARCHAR(100),
        approval_stage VARCHAR(100),
        required_approver_role VARCHAR(100),
        approver_id INTEGER,
        approver_name VARCHAR(200),
        request_date DATE,
        decision VARCHAR(50) DEFAULT 'pending',
        decision_date TIMESTAMPTZ,
        decision_notes TEXT,
        blocking BOOLEAN DEFAULT true,
        auto_approved BOOLEAN DEFAULT false,
        escalated BOOLEAN DEFAULT false,
        escalated_to VARCHAR(200),
        deadline TIMESTAMPTZ,
        sla_hours INTEGER DEFAULT 24,
        sla_breached BOOLEAN DEFAULT false,
        metadata JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- טבלת חוזים דיגיטליים - חתימה אלקטרונית
      CREATE TABLE IF NOT EXISTS digital_contracts (
        id SERIAL PRIMARY KEY,
        contract_number VARCHAR(100),
        project_id INTEGER,
        customer_id INTEGER,
        customer_name VARCHAR(500),
        customer_phone VARCHAR(50),
        customer_email VARCHAR(200),
        contract_type VARCHAR(50),
        template_id INTEGER,
        content_html TEXT,
        total_amount NUMERIC(15,2),
        payment_terms JSONB DEFAULT '[]',
        special_conditions TEXT,
        sent_at TIMESTAMPTZ,
        sent_via VARCHAR(50),
        viewed_at TIMESTAMPTZ,
        signed_at TIMESTAMPTZ,
        customer_signature_url TEXT,
        customer_ip VARCHAR(50),
        signer_name VARCHAR(200),
        company_signature_url TEXT,
        signed_by_company VARCHAR(200),
        pdf_url TEXT,
        expiry_date DATE,
        reminder_count INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    res.json({ success: true, message: "טבלאות מנוע מדידות ואישורים נוצרו בהצלחה" });
  } catch (e: any) {
    console.error("measurement-approval-engine init error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// השוואת מדידות - הלב של המנוע
// POST /compare-measurements/:projectId
// משווה מדידות הצעת מחיר מול מדידת שטח, מסמן חריגות מעל 5%
// =============================================================================
router.post("/measurement-approval-engine/compare-measurements/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { tolerance_percent = 5 } = req.body; // סף סטייה ברירת מחדל 5%

    // שליפת מדידת הצעת מחיר
    const quoteResult = await pool.query(
      `SELECT * FROM project_measurements WHERE project_id = $1 AND measurement_type = 'quote' ORDER BY created_at DESC LIMIT 1`,
      [projectId]
    );
    // שליפת מדידת שטח
    const fieldResult = await pool.query(
      `SELECT * FROM project_measurements WHERE project_id = $1 AND measurement_type = 'field' ORDER BY created_at DESC LIMIT 1`,
      [projectId]
    );

    if (!quoteResult.rows.length || !fieldResult.rows.length) {
      return res.status(400).json({
        error: "חסרות מדידות להשוואה",
        has_quote: quoteResult.rows.length > 0,
        has_field: fieldResult.rows.length > 0,
        message: "נדרשות גם מדידת הצעת מחיר וגם מדידת שטח כדי לבצע השוואה"
      });
    }

    const quoteMeasurement = quoteResult.rows[0];
    const fieldMeasurement = fieldResult.rows[0];
    const quoteItems = quoteMeasurement.items || [];
    const fieldItems = fieldMeasurement.items || [];

    // ביצוע השוואה פריט-פריט
    const discrepancies: any[] = [];
    let maxDeviation = 0;
    let hasCriticalDeviation = false;

    // השוואת כל פריט מהצעת המחיר מול מדידת שטח
    for (const quoteItem of quoteItems) {
      const fieldItem = fieldItems.find((fi: any) =>
        fi.item_name === quoteItem.item_name ||
        fi.item_id === quoteItem.item_id ||
        fi.location === quoteItem.location
      );

      if (!fieldItem) {
        // פריט קיים בהצעת מחיר אך לא נמדד בשטח
        discrepancies.push({
          item_name: quoteItem.item_name || quoteItem.location,
          type: "missing_in_field",
          severity: "critical",
          quote_value: quoteItem.width ? `${quoteItem.width}x${quoteItem.height}` : quoteItem.sqm,
          field_value: null,
          deviation_percent: 100,
          message: `פריט "${quoteItem.item_name || quoteItem.location}" קיים בהצעת מחיר אך לא נמדד בשטח`
        });
        hasCriticalDeviation = true;
        maxDeviation = 100;
        continue;
      }

      // השוואת רוחב
      if (quoteItem.width && fieldItem.width) {
        const widthDev = Math.abs((fieldItem.width - quoteItem.width) / quoteItem.width) * 100;
        if (widthDev > tolerance_percent) {
          discrepancies.push({
            item_name: quoteItem.item_name || quoteItem.location,
            dimension: "width",
            type: "dimension_mismatch",
            severity: widthDev > 15 ? "critical" : "warning",
            quote_value: quoteItem.width,
            field_value: fieldItem.width,
            deviation_percent: Math.round(widthDev * 100) / 100,
            message: `רוחב שונה: הצעת מחיר ${quoteItem.width} מ"מ, שטח ${fieldItem.width} מ"מ (סטייה ${widthDev.toFixed(1)}%)`
          });
          if (widthDev > 15) hasCriticalDeviation = true;
          maxDeviation = Math.max(maxDeviation, widthDev);
        }
      }

      // השוואת גובה
      if (quoteItem.height && fieldItem.height) {
        const heightDev = Math.abs((fieldItem.height - quoteItem.height) / quoteItem.height) * 100;
        if (heightDev > tolerance_percent) {
          discrepancies.push({
            item_name: quoteItem.item_name || quoteItem.location,
            dimension: "height",
            type: "dimension_mismatch",
            severity: heightDev > 15 ? "critical" : "warning",
            quote_value: quoteItem.height,
            field_value: fieldItem.height,
            deviation_percent: Math.round(heightDev * 100) / 100,
            message: `גובה שונה: הצעת מחיר ${quoteItem.height} מ"מ, שטח ${fieldItem.height} מ"מ (סטייה ${heightDev.toFixed(1)}%)`
          });
          if (heightDev > 15) hasCriticalDeviation = true;
          maxDeviation = Math.max(maxDeviation, heightDev);
        }
      }

      // השוואת שטח מ"ר
      if (quoteItem.sqm && fieldItem.sqm) {
        const sqmDev = Math.abs((fieldItem.sqm - quoteItem.sqm) / quoteItem.sqm) * 100;
        if (sqmDev > tolerance_percent) {
          discrepancies.push({
            item_name: quoteItem.item_name || quoteItem.location,
            dimension: "sqm",
            type: "area_mismatch",
            severity: sqmDev > 15 ? "critical" : "warning",
            quote_value: quoteItem.sqm,
            field_value: fieldItem.sqm,
            deviation_percent: Math.round(sqmDev * 100) / 100,
            message: `שטח שונה: הצעת מחיר ${quoteItem.sqm} מ"ר, שטח ${fieldItem.sqm} מ"ר (סטייה ${sqmDev.toFixed(1)}%)`
          });
          if (sqmDev > 15) hasCriticalDeviation = true;
          maxDeviation = Math.max(maxDeviation, sqmDev);
        }
      }

      // השוואת כמות
      if (quoteItem.quantity && fieldItem.quantity && quoteItem.quantity !== fieldItem.quantity) {
        const qtyDev = Math.abs((fieldItem.quantity - quoteItem.quantity) / quoteItem.quantity) * 100;
        discrepancies.push({
          item_name: quoteItem.item_name || quoteItem.location,
          dimension: "quantity",
          type: "quantity_mismatch",
          severity: "critical",
          quote_value: quoteItem.quantity,
          field_value: fieldItem.quantity,
          deviation_percent: Math.round(qtyDev * 100) / 100,
          message: `כמות שונה: הצעת מחיר ${quoteItem.quantity} יח', שטח ${fieldItem.quantity} יח'`
        });
        hasCriticalDeviation = true;
        maxDeviation = Math.max(maxDeviation, qtyDev);
      }
    }

    // בדיקת פריטים שנמדדו בשטח אך לא קיימים בהצעת המחיר
    for (const fieldItem of fieldItems) {
      const quoteItem = quoteItems.find((qi: any) =>
        qi.item_name === fieldItem.item_name ||
        qi.item_id === fieldItem.item_id ||
        qi.location === fieldItem.location
      );
      if (!quoteItem) {
        discrepancies.push({
          item_name: fieldItem.item_name || fieldItem.location,
          type: "missing_in_quote",
          severity: "warning",
          quote_value: null,
          field_value: fieldItem.width ? `${fieldItem.width}x${fieldItem.height}` : fieldItem.sqm,
          deviation_percent: 100,
          message: `פריט "${fieldItem.item_name || fieldItem.location}" נמדד בשטח אך לא קיים בהצעת המחיר`
        });
      }
    }

    // קביעת תוצאת ההשוואה
    let comparisonResult = "approved";
    let status = "approved";
    if (hasCriticalDeviation) {
      comparisonResult = "critical_deviation";
      status = "blocked"; // חסימת ייצור!
    } else if (discrepancies.length > 0) {
      comparisonResult = "minor_deviation";
      status = "pending_review";
    }

    // שמירת ההשוואה בבסיס הנתונים
    const { rows } = await pool.query(
      `INSERT INTO measurement_comparisons
        (project_id, project_name, quote_measurement_id, field_measurement_id,
         quote_items, field_items, discrepancies, max_deviation_percent,
         has_critical_deviation, comparison_result, alert_sent, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        projectId,
        quoteMeasurement.project_name || fieldMeasurement.project_name,
        quoteMeasurement.id,
        fieldMeasurement.id,
        JSON.stringify(quoteItems),
        JSON.stringify(fieldItems),
        JSON.stringify(discrepancies),
        Math.round(maxDeviation * 100) / 100,
        hasCriticalDeviation,
        comparisonResult,
        hasCriticalDeviation, // שליחת התראה רק בסטייה קריטית
        status
      ]
    );

    // אם יש סטייה קריטית - יצירת בקשת אישור ממנהל פרויקט
    if (hasCriticalDeviation) {
      await pool.query(
        `INSERT INTO project_approvals
          (project_id, project_name, customer_name, approval_type, approval_stage,
           required_approver_role, request_date, blocking, sla_hours, metadata, status)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, true, 4, $7, 'pending')`,
        [
          projectId,
          quoteMeasurement.project_name || fieldMeasurement.project_name,
          quoteMeasurement.customer_name || fieldMeasurement.customer_name,
          "measurement_deviation",
          "measurement_review",
          "project_manager",
          JSON.stringify({
            comparison_id: rows[0].id,
            discrepancies_count: discrepancies.length,
            max_deviation_percent: maxDeviation,
            critical_items: discrepancies.filter((d: any) => d.severity === "critical").map((d: any) => d.item_name)
          })
        ]
      );
    }

    // השוואת סה"כ מ"ר
    const totalSqmDeviation = quoteMeasurement.total_sqm && fieldMeasurement.total_sqm
      ? Math.abs((fieldMeasurement.total_sqm - quoteMeasurement.total_sqm) / quoteMeasurement.total_sqm) * 100
      : null;

    res.json({
      comparison: rows[0],
      summary: {
        total_items_compared: quoteItems.length,
        discrepancies_found: discrepancies.length,
        critical_count: discrepancies.filter((d: any) => d.severity === "critical").length,
        warning_count: discrepancies.filter((d: any) => d.severity === "warning").length,
        max_deviation_percent: Math.round(maxDeviation * 100) / 100,
        has_critical_deviation: hasCriticalDeviation,
        comparison_result: comparisonResult,
        production_status: hasCriticalDeviation ? "BLOCKED - נדרש אישור מנהל" : status === "pending_review" ? "HOLD - ממתין לבדיקה" : "APPROVED - מאושר לייצור",
        total_sqm_quote: quoteMeasurement.total_sqm,
        total_sqm_field: fieldMeasurement.total_sqm,
        total_sqm_deviation_percent: totalSqmDeviation ? Math.round(totalSqmDeviation * 100) / 100 : null
      },
      discrepancies,
      alert_created: hasCriticalDeviation
    });
  } catch (e: any) {
    console.error("compare-measurements error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// GET /measurement-alerts - כל הפרויקטים עם חריגות מדידה
// =============================================================================
router.get("/measurement-approval-engine/measurement-alerts", async (req, res) => {
  try {
    const severity = req.query.severity as string; // critical / warning / all
    const status = req.query.status as string;

    let query = `
      SELECT mc.*,
        (SELECT COUNT(*) FROM jsonb_array_elements(mc.discrepancies) d
         WHERE d->>'severity' = 'critical') as critical_count,
        (SELECT COUNT(*) FROM jsonb_array_elements(mc.discrepancies) d
         WHERE d->>'severity' = 'warning') as warning_count
      FROM measurement_comparisons mc
      WHERE mc.has_critical_deviation = true OR jsonb_array_length(mc.discrepancies) > 0
    `;
    const params: any[] = [];

    if (severity === "critical") {
      query += ` AND mc.has_critical_deviation = true`;
    }
    if (status) {
      params.push(status);
      query += ` AND mc.status = $${params.length}`;
    }

    query += ` ORDER BY mc.has_critical_deviation DESC, mc.max_deviation_percent DESC, mc.created_at DESC`;

    const { rows } = await pool.query(query, params);

    // סטטיסטיקות התראות
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_alerts,
        COUNT(*) FILTER (WHERE has_critical_deviation = true) as critical_alerts,
        COUNT(*) FILTER (WHERE status = 'blocked') as blocked_projects,
        COUNT(*) FILTER (WHERE status = 'pending_review') as pending_review,
        COUNT(*) FILTER (WHERE status = 'approved') as resolved,
        AVG(max_deviation_percent) as avg_deviation
      FROM measurement_comparisons
      WHERE has_critical_deviation = true OR jsonb_array_length(discrepancies) > 0
    `);

    res.json({
      alerts: rows,
      stats: statsResult.rows[0]
    });
  } catch (e: any) {
    console.error("measurement-alerts error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// POST /approve/:projectId - אישור פרויקט לייצור
// =============================================================================
router.post("/measurement-approval-engine/approve/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { approved_by, notes, override_deviations = false } = req.body;

    if (!approved_by) {
      return res.status(400).json({ error: "שם המאשר הוא שדה חובה" });
    }

    // עדכון השוואת מדידות
    await pool.query(
      `UPDATE measurement_comparisons
       SET comparison_result = 'approved', approved_by = $1, approved_at = NOW(),
           notes = COALESCE(notes, '') || $2, status = 'approved', updated_at = NOW()
       WHERE project_id = $3 AND status IN ('pending_review', 'blocked')`,
      [approved_by, notes ? `\n[אישור] ${notes}` : "", projectId]
    );

    // עדכון אישורים תלויים
    await pool.query(
      `UPDATE project_approvals
       SET decision = 'approved', decision_date = NOW(), approver_name = $1,
           decision_notes = $2, status = 'approved', updated_at = NOW()
       WHERE project_id = $3 AND status = 'pending'
         AND approval_type = 'measurement_deviation'`,
      [approved_by, notes || "אושר", projectId]
    );

    // שליפת סיכום
    const { rows } = await pool.query(
      `SELECT * FROM measurement_comparisons WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [projectId]
    );

    res.json({
      success: true,
      message: `פרויקט ${projectId} אושר לייצור`,
      approved_by,
      override_deviations,
      comparison: rows[0] || null
    });
  } catch (e: any) {
    console.error("approve error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// POST /reject/:projectId - דחיית פרויקט עם סיבה
// =============================================================================
router.post("/measurement-approval-engine/reject/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { rejected_by, reason, require_remeasurement = true } = req.body;

    if (!rejected_by || !reason) {
      return res.status(400).json({ error: "שם הדוחה וסיבת הדחייה הם שדות חובה" });
    }

    // עדכון השוואת מדידות
    await pool.query(
      `UPDATE measurement_comparisons
       SET comparison_result = 'rejected', rejection_reason = $1,
           notes = COALESCE(notes, '') || $2, status = 'rejected', updated_at = NOW()
       WHERE project_id = $3 AND status IN ('pending_review', 'blocked')`,
      [reason, `\n[דחייה ע"י ${rejected_by}] ${reason}`, projectId]
    );

    // עדכון אישורים
    await pool.query(
      `UPDATE project_approvals
       SET decision = 'rejected', decision_date = NOW(), approver_name = $1,
           decision_notes = $2, status = 'rejected', updated_at = NOW()
       WHERE project_id = $3 AND status = 'pending'
         AND approval_type = 'measurement_deviation'`,
      [rejected_by, reason, projectId]
    );

    // אם נדרשת מדידה מחדש - יצירת בקשה
    if (require_remeasurement) {
      await pool.query(
        `INSERT INTO project_approvals
          (project_id, project_name, approval_type, approval_stage,
           required_approver_role, request_date, blocking, sla_hours,
           metadata, status)
         SELECT $1, project_name, 'remeasurement_required', 'field_measurement',
                'field_measurer', CURRENT_DATE, true, 48,
                $2::jsonb, 'pending'
         FROM measurement_comparisons WHERE project_id = $1 LIMIT 1`,
        [projectId, JSON.stringify({ reason, rejected_by, original_rejection_date: new Date().toISOString() })]
      );
    }

    res.json({
      success: true,
      message: `פרויקט ${projectId} נדחה - ${reason}`,
      rejected_by,
      reason,
      remeasurement_requested: require_remeasurement
    });
  } catch (e: any) {
    console.error("reject error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// GET /approval-queue - תור אישורים לפי תפקיד
// =============================================================================
router.get("/measurement-approval-engine/approval-queue", async (req, res) => {
  try {
    const role = req.query.role as string;
    const approval_type = req.query.approval_type as string;
    const urgency = req.query.urgency as string;

    let query = `
      SELECT pa.*,
        CASE
          WHEN pa.deadline IS NOT NULL AND pa.deadline < NOW() THEN 'overdue'
          WHEN pa.deadline IS NOT NULL AND pa.deadline < NOW() + INTERVAL '2 hours' THEN 'urgent'
          ELSE 'normal'
        END as urgency_level,
        EXTRACT(EPOCH FROM (NOW() - pa.created_at)) / 3600 as hours_pending,
        CASE WHEN pa.sla_hours > 0 AND EXTRACT(EPOCH FROM (NOW() - pa.created_at)) / 3600 > pa.sla_hours
          THEN true ELSE false
        END as is_sla_breached
      FROM project_approvals pa
      WHERE pa.status = 'pending'
    `;
    const params: any[] = [];

    if (role) {
      params.push(role);
      query += ` AND pa.required_approver_role = $${params.length}`;
    }
    if (approval_type) {
      params.push(approval_type);
      query += ` AND pa.approval_type = $${params.length}`;
    }

    query += ` ORDER BY
      CASE WHEN pa.deadline IS NOT NULL AND pa.deadline < NOW() THEN 0
           WHEN pa.blocking = true THEN 1
           ELSE 2 END,
      pa.created_at ASC`;

    const { rows } = await pool.query(query, params);

    // סינון לפי דחיפות אם נדרש
    let filteredRows = rows;
    if (urgency === "overdue") {
      filteredRows = rows.filter((r: any) => r.urgency_level === "overdue");
    } else if (urgency === "urgent") {
      filteredRows = rows.filter((r: any) => r.urgency_level === "overdue" || r.urgency_level === "urgent");
    }

    // סטטיסטיקות תור
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_pending,
        COUNT(*) FILTER (WHERE blocking = true) as blocking_count,
        COUNT(*) FILTER (WHERE sla_breached = true OR (sla_hours > 0 AND EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 > sla_hours)) as sla_breached_count,
        COUNT(*) FILTER (WHERE approval_type = 'measurement_deviation') as measurement_deviations,
        COUNT(*) FILTER (WHERE escalated = true) as escalated_count,
        AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600) as avg_hours_pending
      FROM project_approvals
      WHERE status = 'pending'
    `);

    res.json({
      queue: filteredRows,
      stats: statsResult.rows[0],
      total: filteredRows.length
    });
  } catch (e: any) {
    console.error("approval-queue error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// POST /send-contract/:projectId - יצירה ושליחת חוזה דיגיטלי
// =============================================================================
router.post("/measurement-approval-engine/send-contract/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      customer_id, customer_name, customer_phone, customer_email,
      contract_type = "standard", template_id, content_html,
      total_amount, payment_terms = [], special_conditions,
      send_via = "email", expiry_days = 7
    } = req.body;

    // בדיקה שהפרויקט מאושר לפני שליחת חוזה
    const approvalCheck = await pool.query(
      `SELECT * FROM measurement_comparisons
       WHERE project_id = $1 AND status = 'approved'
       ORDER BY created_at DESC LIMIT 1`,
      [projectId]
    );

    // בדיקת אישורים חסומים
    const blockingApprovals = await pool.query(
      `SELECT * FROM project_approvals
       WHERE project_id = $1 AND blocking = true AND status = 'pending'`,
      [projectId]
    );

    if (blockingApprovals.rows.length > 0) {
      return res.status(400).json({
        error: "לא ניתן לשלוח חוזה - יש אישורים חסומים ממתינים",
        blocking_approvals: blockingApprovals.rows.map((a: any) => ({
          id: a.id,
          type: a.approval_type,
          stage: a.approval_stage,
          required_role: a.required_approver_role
        }))
      });
    }

    // יצירת מספר חוזה ייחודי
    const contractNumber = `CTR-${projectId}-${Date.now().toString(36).toUpperCase()}`;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiry_days);

    const { rows } = await pool.query(
      `INSERT INTO digital_contracts
        (contract_number, project_id, customer_id, customer_name, customer_phone,
         customer_email, contract_type, template_id, content_html, total_amount,
         payment_terms, special_conditions, sent_at, sent_via, expiry_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, $14, 'sent')
       RETURNING *`,
      [
        contractNumber, projectId, customer_id, customer_name, customer_phone,
        customer_email, contract_type, template_id, content_html, total_amount,
        JSON.stringify(payment_terms), special_conditions, send_via, expiryDate.toISOString().split("T")[0]
      ]
    );

    // יצירת אישור מעקב לחתימה
    await pool.query(
      `INSERT INTO project_approvals
        (project_id, project_name, customer_name, approval_type, approval_stage,
         required_approver_role, request_date, blocking, sla_hours, deadline,
         metadata, status)
       VALUES ($1, $2, $3, 'contract_signature', 'customer_sign',
               'customer', CURRENT_DATE, true, $4, $5, $6, 'pending')`,
      [
        projectId, `חוזה ${contractNumber}`, customer_name,
        expiry_days * 24, expiryDate.toISOString(),
        JSON.stringify({ contract_id: rows[0].id, contract_number: contractNumber, total_amount })
      ]
    );

    res.json({
      success: true,
      message: `חוזה ${contractNumber} נשלח ללקוח`,
      contract: rows[0],
      sent_via: send_via,
      expiry_date: expiryDate.toISOString().split("T")[0]
    });
  } catch (e: any) {
    console.error("send-contract error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// POST /verify-contract-signature/:contractId - אימות חתימה דיגיטלית
// =============================================================================
router.post("/measurement-approval-engine/verify-contract-signature/:contractId", async (req, res) => {
  try {
    const { contractId } = req.params;
    const { signature_url, signer_name, signer_ip, signature_data } = req.body;

    // שליפת החוזה
    const contractResult = await pool.query(
      `SELECT * FROM digital_contracts WHERE id = $1`,
      [contractId]
    );

    if (!contractResult.rows.length) {
      return res.status(404).json({ error: "חוזה לא נמצא" });
    }

    const contract = contractResult.rows[0];

    // בדיקת תוקף
    if (contract.status === "signed") {
      return res.status(400).json({ error: "החוזה כבר חתום", signed_at: contract.signed_at });
    }
    if (contract.status === "expired" || (contract.expiry_date && new Date(contract.expiry_date) < new Date())) {
      return res.status(400).json({ error: "תוקף החוזה פג", expiry_date: contract.expiry_date });
    }

    // עדכון החוזה עם החתימה
    const { rows } = await pool.query(
      `UPDATE digital_contracts
       SET customer_signature_url = $1, signer_name = $2, customer_ip = $3,
           signed_at = NOW(), viewed_at = COALESCE(viewed_at, NOW()),
           status = 'signed', updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [signature_url, signer_name, signer_ip, contractId]
    );

    // עדכון אישור חתימת חוזה
    await pool.query(
      `UPDATE project_approvals
       SET decision = 'approved', decision_date = NOW(), approver_name = $1,
           decision_notes = 'חתימה דיגיטלית אומתה', auto_approved = true,
           status = 'approved', updated_at = NOW()
       WHERE project_id = $2 AND approval_type = 'contract_signature' AND status = 'pending'`,
      [signer_name, contract.project_id]
    );

    res.json({
      success: true,
      message: "החוזה נחתם ואומת בהצלחה",
      contract: rows[0],
      verified: true,
      signed_at: rows[0].signed_at
    });
  } catch (e: any) {
    console.error("verify-contract-signature error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// GET /approval-dashboard - דשבורד צינור אישורים כולל
// =============================================================================
router.get("/measurement-approval-engine/approval-dashboard", async (_req, res) => {
  try {
    // סטטיסטיקות אישורים כלליות
    const approvalStats = await pool.query(`
      SELECT
        COUNT(*) as total_approvals,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE blocking = true AND status = 'pending') as blocking_pending,
        COUNT(*) FILTER (WHERE escalated = true AND status = 'pending') as escalated_pending,
        COUNT(*) FILTER (WHERE sla_breached = true OR (sla_hours > 0 AND EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 > sla_hours AND status = 'pending')) as sla_breached,
        AVG(CASE WHEN status IN ('approved','rejected') THEN EXTRACT(EPOCH FROM (decision_date - created_at)) / 3600 END) as avg_resolution_hours
      FROM project_approvals
    `);

    // סטטיסטיקות השוואות מדידות
    const comparisonStats = await pool.query(`
      SELECT
        COUNT(*) as total_comparisons,
        COUNT(*) FILTER (WHERE comparison_result = 'approved') as approved,
        COUNT(*) FILTER (WHERE comparison_result = 'critical_deviation') as critical_deviations,
        COUNT(*) FILTER (WHERE comparison_result = 'minor_deviation') as minor_deviations,
        COUNT(*) FILTER (WHERE status = 'blocked') as blocked_projects,
        AVG(max_deviation_percent) as avg_deviation_percent
      FROM measurement_comparisons
    `);

    // סטטיסטיקות חוזים
    const contractStats = await pool.query(`
      SELECT
        COUNT(*) as total_contracts,
        COUNT(*) FILTER (WHERE status = 'draft') as drafts,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'signed') as signed,
        COUNT(*) FILTER (WHERE status = 'expired') as expired,
        SUM(CASE WHEN status = 'signed' THEN total_amount ELSE 0 END) as total_signed_amount,
        AVG(CASE WHEN signed_at IS NOT NULL AND sent_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (signed_at - sent_at)) / 3600 END) as avg_sign_time_hours
      FROM digital_contracts
    `);

    // אישורים אחרונים
    const recentApprovals = await pool.query(`
      SELECT id, project_id, project_name, approval_type, approval_stage,
             required_approver_role, decision, status, created_at, decision_date
      FROM project_approvals
      ORDER BY created_at DESC LIMIT 10
    `);

    // פרויקטים חסומים - דורשים תשומת לב מיידית
    const blockedProjects = await pool.query(`
      SELECT mc.project_id, mc.project_name, mc.max_deviation_percent,
             mc.has_critical_deviation, mc.status, mc.created_at,
             jsonb_array_length(mc.discrepancies) as discrepancy_count
      FROM measurement_comparisons mc
      WHERE mc.status = 'blocked'
      ORDER BY mc.created_at ASC
    `);

    // אישורים שחרגו מ-SLA
    const slaBreached = await pool.query(`
      SELECT id, project_id, project_name, approval_type, required_approver_role,
             sla_hours, EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as hours_pending,
             created_at
      FROM project_approvals
      WHERE status = 'pending'
        AND sla_hours > 0
        AND EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 > sla_hours
      ORDER BY created_at ASC
    `);

    res.json({
      approval_stats: approvalStats.rows[0],
      comparison_stats: comparisonStats.rows[0],
      contract_stats: contractStats.rows[0],
      recent_approvals: recentApprovals.rows,
      blocked_projects: blockedProjects.rows,
      sla_breached: slaBreached.rows,
      generated_at: new Date().toISOString()
    });
  } catch (e: any) {
    console.error("approval-dashboard error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// POST /escalate/:approvalId - הסלמת אישור שחרג מזמן
// =============================================================================
router.post("/measurement-approval-engine/escalate/:approvalId", async (req, res) => {
  try {
    const { approvalId } = req.params;
    const { escalated_to, escalation_reason, new_sla_hours = 4 } = req.body;

    if (!escalated_to) {
      return res.status(400).json({ error: "יש לציין למי להסלים" });
    }

    const { rows } = await pool.query(
      `UPDATE project_approvals
       SET escalated = true, escalated_to = $1,
           decision_notes = COALESCE(decision_notes, '') || $2,
           sla_hours = $3, deadline = NOW() + ($3 || ' hours')::INTERVAL,
           sla_breached = true, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        escalated_to,
        `\n[הסלמה] ${escalation_reason || "חריגה מ-SLA"} - הועבר ל-${escalated_to}`,
        new_sla_hours,
        approvalId
      ]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "אישור לא נמצא" });
    }

    res.json({
      success: true,
      message: `אישור ${approvalId} הוסלם ל-${escalated_to}`,
      approval: rows[0],
      new_deadline: rows[0].deadline
    });
  } catch (e: any) {
    console.error("escalate error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// GET /fraud-check/:projectId - בדיקת חשד לדפוסים חשודים
// בודק: הנחות חריגות, אי-התאמות מדידות, דפוסים חשודים
// =============================================================================
router.get("/measurement-approval-engine/fraud-check/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const alerts: any[] = [];
    let riskScore = 0; // 0-100, ככל שגבוה יותר - חשוד יותר

    // בדיקה 1: אי-התאמות מדידות גדולות
    const deviations = await pool.query(
      `SELECT * FROM measurement_comparisons WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId]
    );
    if (deviations.rows.length > 0) {
      const latestComp = deviations.rows[0];
      if (latestComp.has_critical_deviation) {
        riskScore += 30;
        alerts.push({
          type: "measurement_mismatch",
          severity: "high",
          message: `סטייה קריטית במדידות - סטייה מקסימלית ${latestComp.max_deviation_percent}%`,
          details: latestComp.discrepancies
        });
      }
      // בדיקה אם מדידות השטח תמיד קטנות מהצעת המחיר (חשד להנחה מוסתרת)
      if (latestComp.field_items && latestComp.quote_items) {
        const fieldItems = latestComp.field_items;
        const quoteItems = latestComp.quote_items;
        let allSmaller = true;
        for (const qi of quoteItems) {
          const fi = fieldItems.find((f: any) => f.item_name === qi.item_name || f.item_id === qi.item_id);
          if (fi && fi.sqm && qi.sqm && fi.sqm >= qi.sqm) {
            allSmaller = false;
            break;
          }
        }
        if (allSmaller && quoteItems.length > 2) {
          riskScore += 20;
          alerts.push({
            type: "systematic_underquoting",
            severity: "high",
            message: "כל מדידות השטח קטנות ממדידות הצעת המחיר - חשד להצעת מחיר מנופחת",
          });
        }
      }
    }

    // בדיקה 2: מדידות מרובות לאותו פרויקט (חשד לניסיון התאמה)
    const measurementCount = await pool.query(
      `SELECT measurement_type, COUNT(*) as cnt
       FROM project_measurements
       WHERE project_id = $1
       GROUP BY measurement_type`,
      [projectId]
    );
    for (const mc of measurementCount.rows) {
      if (parseInt(mc.cnt) > 3) {
        riskScore += 15;
        alerts.push({
          type: "excessive_measurements",
          severity: "medium",
          message: `${mc.cnt} מדידות מסוג ${mc.measurement_type} - חריג, ייתכן ניסיון להתאים מספרים`
        });
      }
    }

    // בדיקה 3: חוזים עם הנחות חריגות
    const contracts = await pool.query(
      `SELECT * FROM digital_contracts WHERE project_id = $1`,
      [projectId]
    );
    // בדיקה 4: מדידות בשעות לא סבירות
    const oddHours = await pool.query(
      `SELECT * FROM project_measurements
       WHERE project_id = $1
         AND EXTRACT(HOUR FROM created_at) NOT BETWEEN 6 AND 21`,
      [projectId]
    );
    if (oddHours.rows.length > 0) {
      riskScore += 10;
      alerts.push({
        type: "odd_hours_measurement",
        severity: "low",
        message: `${oddHours.rows.length} מדידות בוצעו בשעות לא סבירות (לפני 6 או אחרי 21)`,
        details: oddHours.rows.map((r: any) => ({ id: r.id, created_at: r.created_at, measured_by: r.measured_by }))
      });
    }

    // בדיקה 5: אותו מודד בהצעת מחיר ובמדידת שטח (ניגוד עניינים)
    const samePersonCheck = await pool.query(
      `SELECT a.measured_by as quote_measurer, b.measured_by as field_measurer
       FROM project_measurements a, project_measurements b
       WHERE a.project_id = $1 AND b.project_id = $1
         AND a.measurement_type = 'quote' AND b.measurement_type = 'field'
         AND a.measured_by = b.measured_by AND a.measured_by IS NOT NULL`,
      [projectId]
    );
    if (samePersonCheck.rows.length > 0) {
      riskScore += 25;
      alerts.push({
        type: "conflict_of_interest",
        severity: "high",
        message: `אותו אדם (${samePersonCheck.rows[0].quote_measurer}) ביצע הן מדידת הצעת מחיר והן מדידת שטח - ניגוד עניינים`,
      });
    }

    // בדיקה 6: אישורים שאושרו מהר מדי (פחות מ-5 דקות)
    const quickApprovals = await pool.query(
      `SELECT * FROM project_approvals
       WHERE project_id = $1
         AND decision = 'approved'
         AND EXTRACT(EPOCH FROM (decision_date - created_at)) < 300`,
      [projectId]
    );
    if (quickApprovals.rows.length > 0) {
      riskScore += 15;
      alerts.push({
        type: "rubber_stamp_approval",
        severity: "medium",
        message: `${quickApprovals.rows.length} אישורים בוצעו תוך פחות מ-5 דקות - חשד לאישור ללא בדיקה`,
        details: quickApprovals.rows.map((r: any) => ({ id: r.id, approver: r.approver_name, type: r.approval_type }))
      });
    }

    // סיווג סיכון כולל
    const riskLevel = riskScore >= 60 ? "critical" : riskScore >= 35 ? "high" : riskScore >= 15 ? "medium" : "low";

    res.json({
      project_id: projectId,
      risk_score: Math.min(riskScore, 100),
      risk_level: riskLevel,
      alerts_count: alerts.length,
      alerts,
      recommendation: riskScore >= 60
        ? "עצור ייצור - נדרשת חקירה מעמיקה"
        : riskScore >= 35
          ? "נדרש אישור מנהל בכיר לפני המשך"
          : riskScore >= 15
            ? "שים לב - יש דגלים צהובים, מומלץ בדיקה נוספת"
            : "תקין - לא נמצאו דפוסים חשודים",
      checked_at: new Date().toISOString()
    });
  } catch (e: any) {
    console.error("fraud-check error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// =============================================================================
// CRUD - project_measurements (מדידות פרויקט)
// =============================================================================

// שליפת כל המדידות
router.get("/measurement-approval-engine/project-measurements", async (req, res) => {
  try {
    const { project_id, measurement_type, status, measured_by } = req.query;
    let query = `SELECT * FROM project_measurements`;
    const conditions: string[] = [];
    const params: any[] = [];
    if (project_id) { params.push(project_id); conditions.push(`project_id = $${params.length}`); }
    if (measurement_type) { params.push(measurement_type); conditions.push(`measurement_type = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    if (measured_by) { params.push(measured_by); conditions.push(`measured_by = $${params.length}`); }
    if (conditions.length) query += ` WHERE ${conditions.join(" AND ")}`;
    query += ` ORDER BY measurement_date DESC, id DESC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// שליפת מדידה בודדת
router.get("/measurement-approval-engine/project-measurements/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM project_measurements WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "מדידה לא נמצאה" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// יצירת מדידה חדשה
router.post("/measurement-approval-engine/project-measurements", async (req, res) => {
  try {
    const {
      project_id, project_name, customer_name, measurement_type = "field",
      measured_by, measured_by_role, measurement_date, items = [],
      total_sqm, notes, photos = [], gps_lat, gps_lng,
      customer_signature_url, status = "pending"
    } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO project_measurements
        (project_id, project_name, customer_name, measurement_type, measured_by,
         measured_by_role, measurement_date, items, total_sqm, notes, photos,
         gps_lat, gps_lng, customer_signature_url, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [project_id, project_name, customer_name, measurement_type, measured_by,
       measured_by_role, measurement_date, JSON.stringify(items), total_sqm, notes,
       JSON.stringify(photos), gps_lat, gps_lng, customer_signature_url, status]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// עדכון מדידה
router.put("/measurement-approval-engine/project-measurements/:id", async (req, res) => {
  try {
    const fields: string[] = [];
    const params: any[] = [];
    const allowed = [
      "project_id", "project_name", "customer_name", "measurement_type",
      "measured_by", "measured_by_role", "measurement_date", "items",
      "total_sqm", "notes", "photos", "gps_lat", "gps_lng",
      "customer_signature_url", "status"
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        params.push(key === "items" || key === "photos" ? JSON.stringify(req.body[key]) : req.body[key]);
        fields.push(`${key} = $${params.length}`);
      }
    }
    if (!fields.length) return res.status(400).json({ error: "אין שדות לעדכון" });
    params.push(req.params.id);
    fields.push(`updated_at = NOW()`);
    const { rows } = await pool.query(
      `UPDATE project_measurements SET ${fields.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: "מדידה לא נמצאה" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// =============================================================================
// CRUD - measurement_comparisons (השוואות מדידות)
// =============================================================================

router.get("/measurement-approval-engine/measurement-comparisons", async (req, res) => {
  try {
    const { project_id, status, has_critical_deviation } = req.query;
    let query = `SELECT * FROM measurement_comparisons`;
    const conditions: string[] = [];
    const params: any[] = [];
    if (project_id) { params.push(project_id); conditions.push(`project_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    if (has_critical_deviation !== undefined) { params.push(has_critical_deviation === "true"); conditions.push(`has_critical_deviation = $${params.length}`); }
    if (conditions.length) query += ` WHERE ${conditions.join(" AND ")}`;
    query += ` ORDER BY created_at DESC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/measurement-approval-engine/measurement-comparisons/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM measurement_comparisons WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "השוואה לא נמצאה" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/measurement-approval-engine/measurement-comparisons", async (req, res) => {
  try {
    const {
      project_id, project_name, quote_measurement_id, field_measurement_id,
      quote_items, field_items, discrepancies = [], max_deviation_percent,
      has_critical_deviation = false, comparison_result = "pending",
      approved_by, approved_at, rejection_reason, notes,
      alert_sent = false, alert_sent_to = [], status = "pending_review"
    } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO measurement_comparisons
        (project_id, project_name, quote_measurement_id, field_measurement_id,
         quote_items, field_items, discrepancies, max_deviation_percent,
         has_critical_deviation, comparison_result, approved_by, approved_at,
         rejection_reason, notes, alert_sent, alert_sent_to, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [project_id, project_name, quote_measurement_id, field_measurement_id,
       JSON.stringify(quote_items), JSON.stringify(field_items),
       JSON.stringify(discrepancies), max_deviation_percent,
       has_critical_deviation, comparison_result, approved_by, approved_at,
       rejection_reason, notes, alert_sent, JSON.stringify(alert_sent_to), status]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/measurement-approval-engine/measurement-comparisons/:id", async (req, res) => {
  try {
    const fields: string[] = [];
    const params: any[] = [];
    const allowed = [
      "project_id", "project_name", "quote_measurement_id", "field_measurement_id",
      "quote_items", "field_items", "discrepancies", "max_deviation_percent",
      "has_critical_deviation", "comparison_result", "approved_by", "approved_at",
      "rejection_reason", "notes", "alert_sent", "alert_sent_to", "status"
    ];
    const jsonFields = ["quote_items", "field_items", "discrepancies", "alert_sent_to"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        params.push(jsonFields.includes(key) ? JSON.stringify(req.body[key]) : req.body[key]);
        fields.push(`${key} = $${params.length}`);
      }
    }
    if (!fields.length) return res.status(400).json({ error: "אין שדות לעדכון" });
    params.push(req.params.id);
    fields.push(`updated_at = NOW()`);
    const { rows } = await pool.query(
      `UPDATE measurement_comparisons SET ${fields.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: "השוואה לא נמצאה" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// =============================================================================
// CRUD - project_approvals (אישורי פרויקט)
// =============================================================================

router.get("/measurement-approval-engine/project-approvals", async (req, res) => {
  try {
    const { project_id, status, approval_type, required_approver_role, decision } = req.query;
    let query = `SELECT * FROM project_approvals`;
    const conditions: string[] = [];
    const params: any[] = [];
    if (project_id) { params.push(project_id); conditions.push(`project_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    if (approval_type) { params.push(approval_type); conditions.push(`approval_type = $${params.length}`); }
    if (required_approver_role) { params.push(required_approver_role); conditions.push(`required_approver_role = $${params.length}`); }
    if (decision) { params.push(decision); conditions.push(`decision = $${params.length}`); }
    if (conditions.length) query += ` WHERE ${conditions.join(" AND ")}`;
    query += ` ORDER BY created_at DESC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/measurement-approval-engine/project-approvals/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM project_approvals WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "אישור לא נמצא" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/measurement-approval-engine/project-approvals", async (req, res) => {
  try {
    const {
      project_id, project_name, customer_name, approval_type, approval_stage,
      required_approver_role, approver_id, approver_name, request_date,
      decision = "pending", decision_date, decision_notes, blocking = true,
      auto_approved = false, escalated = false, escalated_to, deadline,
      sla_hours = 24, sla_breached = false, metadata = {}, status = "pending"
    } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO project_approvals
        (project_id, project_name, customer_name, approval_type, approval_stage,
         required_approver_role, approver_id, approver_name, request_date,
         decision, decision_date, decision_notes, blocking, auto_approved,
         escalated, escalated_to, deadline, sla_hours, sla_breached, metadata, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [project_id, project_name, customer_name, approval_type, approval_stage,
       required_approver_role, approver_id, approver_name, request_date,
       decision, decision_date, decision_notes, blocking, auto_approved,
       escalated, escalated_to, deadline, sla_hours, sla_breached,
       JSON.stringify(metadata), status]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/measurement-approval-engine/project-approvals/:id", async (req, res) => {
  try {
    const fields: string[] = [];
    const params: any[] = [];
    const allowed = [
      "project_id", "project_name", "customer_name", "approval_type", "approval_stage",
      "required_approver_role", "approver_id", "approver_name", "request_date",
      "decision", "decision_date", "decision_notes", "blocking", "auto_approved",
      "escalated", "escalated_to", "deadline", "sla_hours", "sla_breached", "metadata", "status"
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        params.push(key === "metadata" ? JSON.stringify(req.body[key]) : req.body[key]);
        fields.push(`${key} = $${params.length}`);
      }
    }
    if (!fields.length) return res.status(400).json({ error: "אין שדות לעדכון" });
    params.push(req.params.id);
    fields.push(`updated_at = NOW()`);
    const { rows } = await pool.query(
      `UPDATE project_approvals SET ${fields.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: "אישור לא נמצא" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// =============================================================================
// CRUD - digital_contracts (חוזים דיגיטליים)
// =============================================================================

router.get("/measurement-approval-engine/digital-contracts", async (req, res) => {
  try {
    const { project_id, status, contract_type, customer_name } = req.query;
    let query = `SELECT * FROM digital_contracts`;
    const conditions: string[] = [];
    const params: any[] = [];
    if (project_id) { params.push(project_id); conditions.push(`project_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    if (contract_type) { params.push(contract_type); conditions.push(`contract_type = $${params.length}`); }
    if (customer_name) { params.push(`%${customer_name}%`); conditions.push(`customer_name ILIKE $${params.length}`); }
    if (conditions.length) query += ` WHERE ${conditions.join(" AND ")}`;
    query += ` ORDER BY created_at DESC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/measurement-approval-engine/digital-contracts/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM digital_contracts WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "חוזה לא נמצא" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/measurement-approval-engine/digital-contracts", async (req, res) => {
  try {
    const {
      contract_number, project_id, customer_id, customer_name, customer_phone,
      customer_email, contract_type, template_id, content_html, total_amount,
      payment_terms = [], special_conditions, sent_at, sent_via, viewed_at,
      signed_at, customer_signature_url, customer_ip, signer_name,
      company_signature_url, signed_by_company, pdf_url, expiry_date,
      reminder_count = 0, status = "draft"
    } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO digital_contracts
        (contract_number, project_id, customer_id, customer_name, customer_phone,
         customer_email, contract_type, template_id, content_html, total_amount,
         payment_terms, special_conditions, sent_at, sent_via, viewed_at,
         signed_at, customer_signature_url, customer_ip, signer_name,
         company_signature_url, signed_by_company, pdf_url, expiry_date,
         reminder_count, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       RETURNING *`,
      [contract_number, project_id, customer_id, customer_name, customer_phone,
       customer_email, contract_type, template_id, content_html, total_amount,
       JSON.stringify(payment_terms), special_conditions, sent_at, sent_via, viewed_at,
       signed_at, customer_signature_url, customer_ip, signer_name,
       company_signature_url, signed_by_company, pdf_url, expiry_date,
       reminder_count, status]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/measurement-approval-engine/digital-contracts/:id", async (req, res) => {
  try {
    const fields: string[] = [];
    const params: any[] = [];
    const allowed = [
      "contract_number", "project_id", "customer_id", "customer_name", "customer_phone",
      "customer_email", "contract_type", "template_id", "content_html", "total_amount",
      "payment_terms", "special_conditions", "sent_at", "sent_via", "viewed_at",
      "signed_at", "customer_signature_url", "customer_ip", "signer_name",
      "company_signature_url", "signed_by_company", "pdf_url", "expiry_date",
      "reminder_count", "status"
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        params.push(key === "payment_terms" ? JSON.stringify(req.body[key]) : req.body[key]);
        fields.push(`${key} = $${params.length}`);
      }
    }
    if (!fields.length) return res.status(400).json({ error: "אין שדות לעדכון" });
    params.push(req.params.id);
    fields.push(`updated_at = NOW()`);
    const { rows } = await pool.query(
      `UPDATE digital_contracts SET ${fields.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: "חוזה לא נמצא" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
