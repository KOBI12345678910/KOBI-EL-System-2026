// ============================================================
// מנוע ניתוח ערך עובדים וחישוב שכר אוטומטי
// מפעל מתכת/אלומיניום - Employee Value Engine
// ============================================================
import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { VAT_RATE } from "../constants";

const router = Router();

// ==================== אימות משתמש ====================
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use(requireAuth as any);

// ==================== פונקציית עזר לשאילתות ====================
function q(query: ReturnType<typeof sql>) {
  return db.execute(query).then((r: any) => (r?.rows || r || []));
}

// ==================== אתחול טבלאות ====================
router.post("/employee-value-engine/init", async (req: Request, res: Response) => {
  try {
    // טבלת ניתוח ערך עובדים
    await q(sql`
      CREATE TABLE IF NOT EXISTS employee_value_analysis (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER,
        employee_name VARCHAR(300),
        employee_type VARCHAR(50),
        department VARCHAR(200),
        analysis_period VARCHAR(20),
        period_start DATE,
        period_end DATE,
        projects_count INTEGER DEFAULT 0,
        projects_value NUMERIC(15,2) DEFAULT 0,
        revenue_generated NUMERIC(15,2) DEFAULT 0,
        cost_to_company NUMERIC(15,2) DEFAULT 0,
        profit_generated NUMERIC(15,2) DEFAULT 0,
        roi_percent NUMERIC(10,2) DEFAULT 0,
        productivity_score INTEGER DEFAULT 0,
        quality_score INTEGER DEFAULT 0,
        punctuality_score INTEGER DEFAULT 0,
        customer_satisfaction INTEGER DEFAULT 0,
        overall_value_score INTEGER DEFAULT 0,
        value_category VARCHAR(50),
        risks JSONB DEFAULT '[]',
        strengths JSONB DEFAULT '[]',
        improvement_areas JSONB DEFAULT '[]',
        targets_met_percent NUMERIC(5,2) DEFAULT 0,
        comparison_to_avg NUMERIC(5,2) DEFAULT 0,
        ai_recommendation TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת חישוב תשלום קבלנים
    await q(sql`
      CREATE TABLE IF NOT EXISTS contractor_payment_calc (
        id SERIAL PRIMARY KEY,
        contractor_id INTEGER,
        contractor_name VARCHAR(300),
        contractor_type VARCHAR(50),
        project_id INTEGER,
        project_name VARCHAR(300),
        customer_name VARCHAR(300),
        payment_model VARCHAR(50),
        percent_rate NUMERIC(5,2),
        sqm_rate NUMERIC(15,2),
        total_sqm NUMERIC(15,2),
        project_value NUMERIC(15,2),
        calculated_by_percent NUMERIC(15,2),
        calculated_by_sqm NUMERIC(15,2),
        recommended_model VARCHAR(50),
        company_savings NUMERIC(15,2),
        final_amount NUMERIC(15,2),
        vat_amount NUMERIC(15,2),
        total_with_vat NUMERIC(15,2),
        payment_status VARCHAR(50) DEFAULT 'pending',
        approved_by VARCHAR(200),
        invoice_number VARCHAR(100),
        paid_date DATE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת חישובי שכר
    await q(sql`
      CREATE TABLE IF NOT EXISTS salary_calculations (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER,
        employee_name VARCHAR(300),
        employee_type VARCHAR(50),
        period_month INTEGER,
        period_year INTEGER,
        base_salary NUMERIC(15,2) DEFAULT 0,
        overtime_hours NUMERIC(5,2) DEFAULT 0,
        overtime_amount NUMERIC(15,2) DEFAULT 0,
        commission_amount NUMERIC(15,2) DEFAULT 0,
        bonus_amount NUMERIC(15,2) DEFAULT 0,
        advance_deduction NUMERIC(15,2) DEFAULT 0,
        tax_deduction NUMERIC(15,2) DEFAULT 0,
        national_insurance NUMERIC(15,2) DEFAULT 0,
        health_insurance NUMERIC(15,2) DEFAULT 0,
        pension_employee NUMERIC(15,2) DEFAULT 0,
        pension_employer NUMERIC(15,2) DEFAULT 0,
        total_deductions NUMERIC(15,2) DEFAULT 0,
        net_salary NUMERIC(15,2) DEFAULT 0,
        employer_total_cost NUMERIC(15,2) DEFAULT 0,
        projects_this_month JSONB DEFAULT '[]',
        calculation_details JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'draft',
        approved_by VARCHAR,
        approved_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // אינדקסים לביצועים
    await q(sql`CREATE INDEX IF NOT EXISTS idx_eva_employee ON employee_value_analysis(employee_id)`);
    await q(sql`CREATE INDEX IF NOT EXISTS idx_eva_period ON employee_value_analysis(period_start, period_end)`);
    await q(sql`CREATE INDEX IF NOT EXISTS idx_eva_score ON employee_value_analysis(overall_value_score DESC)`);
    await q(sql`CREATE INDEX IF NOT EXISTS idx_cpc_contractor ON contractor_payment_calc(contractor_id)`);
    await q(sql`CREATE INDEX IF NOT EXISTS idx_cpc_project ON contractor_payment_calc(project_id)`);
    await q(sql`CREATE INDEX IF NOT EXISTS idx_cpc_status ON contractor_payment_calc(payment_status)`);
    await q(sql`CREATE INDEX IF NOT EXISTS idx_sc_employee ON salary_calculations(employee_id)`);
    await q(sql`CREATE INDEX IF NOT EXISTS idx_sc_period ON salary_calculations(period_month, period_year)`);
    await q(sql`CREATE INDEX IF NOT EXISTS idx_sc_status ON salary_calculations(status)`);

    res.json({ success: true, message: "טבלאות מנוע ערך עובדים אותחלו בהצלחה" });
  } catch (error: any) {
    console.error("שגיאה באתחול מנוע ערך עובדים:", error);
    res.status(500).json({ error: error.message });
  }
});


// ============================================================
// פונקציות חישוב מרכזיות
// ============================================================

/**
 * חישוב ערך עובד - ניתוח מלא של תרומת העובד לחברה
 * כולל: פרויקטים, הכנסות, עלויות, ROI, ציוני איכות ופרודוקטיביות
 */
async function calculateEmployeeValue(employeeId: number, periodStart: string, periodEnd: string) {
  // שליפת פרטי עובד
  const empRows = await q(sql`
    SELECT * FROM employees WHERE id = ${employeeId} LIMIT 1
  `);
  const emp = empRows[0];
  if (!emp) throw new Error(`עובד ${employeeId} לא נמצא`);

  // שליפת פרויקטים של העובד בתקופה
  const projects = await q(sql`
    SELECT p.*,
      COALESCE(p.total_value, p.budget, 0) as proj_value,
      COALESCE(p.status, 'unknown') as proj_status
    FROM projects p
    LEFT JOIN project_assignments pa ON pa.project_id = p.id
    WHERE (pa.employee_id = ${employeeId} OR p.manager_id = ${employeeId})
      AND p.created_at >= ${periodStart}::date
      AND p.created_at <= ${periodEnd}::date
  `);

  // חישוב הכנסות שהעובד ייצר - מהצעות מחיר וחשבוניות
  const revenueRows = await q(sql`
    SELECT
      COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END), 0) as paid_revenue,
      COALESCE(SUM(i.total_amount), 0) as total_revenue,
      COUNT(DISTINCT i.id) as invoice_count
    FROM invoices i
    LEFT JOIN projects p ON i.project_id = p.id
    LEFT JOIN project_assignments pa ON pa.project_id = p.id
    WHERE (pa.employee_id = ${employeeId} OR p.manager_id = ${employeeId})
      AND i.created_at >= ${periodStart}::date
      AND i.created_at <= ${periodEnd}::date
  `);
  const revenue = revenueRows[0] || { paid_revenue: 0, total_revenue: 0, invoice_count: 0 };

  // חישוב עלות העובד לחברה בתקופה
  const costRows = await q(sql`
    SELECT
      COALESCE(SUM(gross_salary + COALESCE(employer_cost, 0)), 0) as total_cost
    FROM payroll
    WHERE employee_id = ${employeeId}
      AND pay_period_start >= ${periodStart}::date
      AND pay_period_end <= ${periodEnd}::date
  `);
  const costToCompany = parseFloat(costRows[0]?.total_cost || '0');

  // חישוב ערך פרויקטים
  const projectsValue = projects.reduce((sum: number, p: any) => sum + parseFloat(p.proj_value || '0'), 0);
  const projectsCount = projects.length;

  // חישוב רווח ו-ROI
  const revenueGenerated = parseFloat(revenue.paid_revenue || '0');
  const profitGenerated = revenueGenerated - costToCompany;
  const roiPercent = costToCompany > 0 ? ((profitGenerated / costToCompany) * 100) : 0;

  // שליפת ציוני איכות מהערכות ביצועים
  const perfRows = await q(sql`
    SELECT
      COALESCE(AVG(productivity_score), 70) as avg_productivity,
      COALESCE(AVG(quality_score), 70) as avg_quality,
      COALESCE(AVG(punctuality_score), 70) as avg_punctuality,
      COALESCE(AVG(customer_satisfaction_score), 70) as avg_satisfaction
    FROM performance_reviews
    WHERE employee_id = ${employeeId}
      AND review_date >= ${periodStart}::date
      AND review_date <= ${periodEnd}::date
  `);
  const perf = perfRows[0] || {};

  const productivityScore = Math.round(parseFloat(perf.avg_productivity || '70'));
  const qualityScore = Math.round(parseFloat(perf.avg_quality || '70'));
  const punctualityScore = Math.round(parseFloat(perf.avg_punctuality || '70'));
  const customerSatisfaction = Math.round(parseFloat(perf.avg_satisfaction || '70'));

  // ציון ערך כולל - שקלול
  const overallValueScore = Math.round(
    (productivityScore * 0.25) +
    (qualityScore * 0.25) +
    (punctualityScore * 0.2) +
    (customerSatisfaction * 0.15) +
    (Math.min(roiPercent, 100) * 0.15)
  );

  // קטגוריית ערך
  let valueCategory = 'average';
  if (overallValueScore >= 90) valueCategory = 'exceptional';
  else if (overallValueScore >= 80) valueCategory = 'high_value';
  else if (overallValueScore >= 70) valueCategory = 'good';
  else if (overallValueScore >= 50) valueCategory = 'average';
  else valueCategory = 'needs_improvement';

  // השוואה לממוצע החברה
  const avgRows = await q(sql`
    SELECT COALESCE(AVG(overall_value_score), 65) as company_avg
    FROM employee_value_analysis
    WHERE period_start >= ${periodStart}::date AND period_end <= ${periodEnd}::date
  `);
  const companyAvg = parseFloat(avgRows[0]?.company_avg || '65');
  const comparisonToAvg = overallValueScore - companyAvg;

  // ניתוח חוזקות, סיכונים ותחומי שיפור
  const strengths: string[] = [];
  const risks: string[] = [];
  const improvementAreas: string[] = [];

  if (productivityScore >= 85) strengths.push("פרודוקטיביות גבוהה");
  if (qualityScore >= 85) strengths.push("איכות עבודה מצוינת");
  if (punctualityScore >= 85) strengths.push("דייקנות ועמידה בלוחות זמנים");
  if (customerSatisfaction >= 85) strengths.push("שביעות רצון לקוחות גבוהה");
  if (roiPercent > 150) strengths.push("תשואה גבוהה על ההשקעה");
  if (projectsCount >= 5) strengths.push("ניהול מספר פרויקטים במקביל");

  if (productivityScore < 50) risks.push("פרודוקטיביות נמוכה - נדרש מעקב");
  if (qualityScore < 50) risks.push("בעיות איכות חוזרות");
  if (roiPercent < 0) risks.push("עלות העובד גבוהה מההכנסה שמייצר");
  if (projectsCount === 0) risks.push("אין פרויקטים פעילים בתקופה");

  if (productivityScore < 70) improvementAreas.push("שיפור פרודוקטיביות - הכשרות ומנטורינג");
  if (qualityScore < 70) improvementAreas.push("שיפור איכות - בקרת איכות מוגברת");
  if (punctualityScore < 70) improvementAreas.push("שיפור דייקנות - ניהול זמן");
  if (customerSatisfaction < 70) improvementAreas.push("שיפור שירות לקוחות - הדרכה");

  // המלצת AI
  let aiRecommendation = '';
  if (valueCategory === 'exceptional') {
    aiRecommendation = `עובד בעל ערך יוצא דופן. מומלץ לשקול העלאת שכר, בונוס ביצועים, או קידום. ROI: ${roiPercent.toFixed(1)}%. חשוב לשמר עובד זה.`;
  } else if (valueCategory === 'high_value') {
    aiRecommendation = `עובד בעל ערך גבוה. תורם משמעותית לרווחיות החברה. ROI: ${roiPercent.toFixed(1)}%. מומלץ לתגמל ולפתח.`;
  } else if (valueCategory === 'good') {
    aiRecommendation = `עובד טוב עם פוטנציאל לצמיחה. ROI: ${roiPercent.toFixed(1)}%. מומלץ להשקיע בהכשרה ופיתוח מקצועי.`;
  } else if (valueCategory === 'average') {
    aiRecommendation = `ביצועים ממוצעים. ROI: ${roiPercent.toFixed(1)}%. נדרש מעקב צמוד ותכנית שיפור ביצועים.`;
  } else {
    aiRecommendation = `נדרש שיפור משמעותי. ROI: ${roiPercent.toFixed(1)}%. מומלץ שיחת משוב, תכנית שיפור, ומעקב חודשי.`;
  }

  // חישוב אחוז יעדים שהושגו
  const targetsMetPercent = projectsCount > 0
    ? (projects.filter((p: any) => p.proj_status === 'completed').length / projectsCount) * 100
    : 0;

  // שמירת הניתוח בבסיס הנתונים
  const analysisRows = await q(sql`
    INSERT INTO employee_value_analysis (
      employee_id, employee_name, employee_type, department,
      analysis_period, period_start, period_end,
      projects_count, projects_value, revenue_generated,
      cost_to_company, profit_generated, roi_percent,
      productivity_score, quality_score, punctuality_score,
      customer_satisfaction, overall_value_score, value_category,
      risks, strengths, improvement_areas,
      targets_met_percent, comparison_to_avg, ai_recommendation
    ) VALUES (
      ${employeeId}, ${emp.name || emp.full_name || ''}, ${emp.employee_type || emp.type || 'employee'},
      ${emp.department || ''},
      ${periodStart + ' - ' + periodEnd}, ${periodStart}::date, ${periodEnd}::date,
      ${projectsCount}, ${projectsValue}, ${revenueGenerated},
      ${costToCompany}, ${profitGenerated}, ${roiPercent},
      ${productivityScore}, ${qualityScore}, ${punctualityScore},
      ${customerSatisfaction}, ${overallValueScore}, ${valueCategory},
      ${JSON.stringify(risks)}::jsonb, ${JSON.stringify(strengths)}::jsonb, ${JSON.stringify(improvementAreas)}::jsonb,
      ${targetsMetPercent}, ${comparisonToAvg}, ${aiRecommendation}
    )
    RETURNING *
  `);

  return analysisRows[0];
}


/**
 * חישוב תשלום קבלן - השוואת מודלים (אחוז מפרויקט מול מחיר למ"ר)
 * מחזיר המלצה למודל הזול ביותר לחברה
 */
async function calculateContractorPayment(
  contractorId: number,
  projectId: number,
  percentRate: number,
  sqmRate: number
) {
  // שליפת פרטי קבלן
  const contractorRows = await q(sql`
    SELECT * FROM contractors WHERE id = ${contractorId} LIMIT 1
  `);
  // אם אין טבלת contractors, ננסה employees
  let contractor = contractorRows[0];
  if (!contractor) {
    const empRows = await q(sql`
      SELECT * FROM employees WHERE id = ${contractorId} AND (employee_type = 'contractor' OR type = 'contractor') LIMIT 1
    `);
    contractor = empRows[0];
  }
  if (!contractor) throw new Error(`קבלן ${contractorId} לא נמצא`);

  // שליפת פרטי פרויקט
  const projRows = await q(sql`
    SELECT p.*, c.name as customer_name, c.company_name as customer_company
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.id = ${projectId} LIMIT 1
  `);
  const project = projRows[0];
  if (!project) throw new Error(`פרויקט ${projectId} לא נמצא`);

  const projectValue = parseFloat(project.total_value || project.budget || '0');
  const totalSqm = parseFloat(project.total_sqm || project.area_sqm || project.sqm || '0');

  // חישוב לפי אחוז מהפרויקט
  const calculatedByPercent = (projectValue * percentRate) / 100;

  // חישוב לפי מ"ר
  const calculatedBySqm = totalSqm * sqmRate;

  // המלצה - המודל הזול ביותר לחברה
  let recommendedModel = 'percent';
  let companySavings = 0;
  let finalAmount = calculatedByPercent;

  if (calculatedBySqm < calculatedByPercent) {
    recommendedModel = 'sqm';
    companySavings = calculatedByPercent - calculatedBySqm;
    finalAmount = calculatedBySqm;
  } else {
    recommendedModel = 'percent';
    companySavings = calculatedBySqm - calculatedByPercent;
    finalAmount = calculatedByPercent;
  }

  const vatAmount = finalAmount * VAT_RATE;
  const totalWithVat = finalAmount + vatAmount;

  // שמירה בבסיס הנתונים
  const resultRows = await q(sql`
    INSERT INTO contractor_payment_calc (
      contractor_id, contractor_name, contractor_type,
      project_id, project_name, customer_name,
      payment_model, percent_rate, sqm_rate, total_sqm,
      project_value, calculated_by_percent, calculated_by_sqm,
      recommended_model, company_savings, final_amount,
      vat_amount, total_with_vat
    ) VALUES (
      ${contractorId}, ${contractor.name || contractor.full_name || ''},
      ${contractor.contractor_type || contractor.type || 'general'},
      ${projectId}, ${project.name || project.title || ''},
      ${project.customer_name || project.customer_company || ''},
      ${recommendedModel}, ${percentRate}, ${sqmRate}, ${totalSqm},
      ${projectValue}, ${calculatedByPercent}, ${calculatedBySqm},
      ${recommendedModel}, ${companySavings}, ${finalAmount},
      ${vatAmount}, ${totalWithVat}
    )
    RETURNING *
  `);

  return resultRows[0];
}


/**
 * חישוב שכר חודשי - כולל כל הניכויים וההפרשות
 * בהתאם לחוקי העבודה בישראל
 */
async function calculateMonthlySalary(employeeId: number, month: number, year: number) {
  // שליפת פרטי עובד
  const empRows = await q(sql`
    SELECT * FROM employees WHERE id = ${employeeId} LIMIT 1
  `);
  const emp = empRows[0];
  if (!emp) throw new Error(`עובד ${employeeId} לא נמצא`);

  const baseSalary = parseFloat(emp.base_salary || emp.salary || '0');
  const employeeType = emp.employee_type || emp.type || 'employee';

  // שליפת שעות נוספות מהתקופה
  const overtimeRows = await q(sql`
    SELECT COALESCE(SUM(overtime_hours), 0) as total_ot
    FROM timesheets
    WHERE employee_id = ${employeeId}
      AND EXTRACT(MONTH FROM work_date) = ${month}
      AND EXTRACT(YEAR FROM work_date) = ${year}
  `);
  const overtimeHours = parseFloat(overtimeRows[0]?.total_ot || '0');

  // חישוב שעות נוספות - 125% ל-2 שעות ראשונות, 150% לשאר
  const hourlyRate = baseSalary / 186; // 186 שעות חודשיות ממוצע
  let overtimeAmount = 0;
  if (overtimeHours <= 2 * 22) { // עד 2 שעות ליום * 22 ימי עבודה
    overtimeAmount = overtimeHours * hourlyRate * 1.25;
  } else {
    const first44 = 44 * hourlyRate * 1.25; // 2 שעות * 22 ימים
    const rest = (overtimeHours - 44) * hourlyRate * 1.5;
    overtimeAmount = first44 + rest;
  }

  // שליפת עמלות מפרויקטים שהושלמו בחודש
  const commissionRows = await q(sql`
    SELECT COALESCE(SUM(commission_amount), 0) as total_commission
    FROM project_commissions
    WHERE employee_id = ${employeeId}
      AND EXTRACT(MONTH FROM created_at) = ${month}
      AND EXTRACT(YEAR FROM created_at) = ${year}
  `);
  const commissionAmount = parseFloat(commissionRows[0]?.total_commission || '0');

  // שליפת בונוסים
  const bonusRows = await q(sql`
    SELECT COALESCE(SUM(amount), 0) as total_bonus
    FROM bonuses
    WHERE employee_id = ${employeeId}
      AND EXTRACT(MONTH FROM bonus_date) = ${month}
      AND EXTRACT(YEAR FROM bonus_date) = ${year}
  `);
  const bonusAmount = parseFloat(bonusRows[0]?.total_bonus || '0');

  // ניכוי מקדמות
  const advanceRows = await q(sql`
    SELECT COALESCE(SUM(amount), 0) as total_advance
    FROM salary_advances
    WHERE employee_id = ${employeeId}
      AND EXTRACT(MONTH FROM advance_date) = ${month}
      AND EXTRACT(YEAR FROM advance_date) = ${year}
      AND status = 'approved'
  `);
  const advanceDeduction = parseFloat(advanceRows[0]?.total_advance || '0');

  // שכר ברוטו כולל
  const grossSalary = baseSalary + overtimeAmount + commissionAmount + bonusAmount;

  // ============ ניכויי חובה - ישראל ============
  // מס הכנסה - מדרגות פשוטות (אפשר לשכלל בהמשך)
  let taxDeduction = 0;
  const annualGross = grossSalary * 12;
  if (annualGross <= 84120) taxDeduction = grossSalary * 0.10;
  else if (annualGross <= 120720) taxDeduction = grossSalary * 0.14;
  else if (annualGross <= 193800) taxDeduction = grossSalary * 0.20;
  else if (annualGross <= 269280) taxDeduction = grossSalary * 0.31;
  else if (annualGross <= 560280) taxDeduction = grossSalary * 0.35;
  else if (annualGross <= 721560) taxDeduction = grossSalary * 0.47;
  else taxDeduction = grossSalary * 0.50;

  // ביטוח לאומי - עובד (~3.5% עד תקרה, 12% מעל)
  const niThreshold = 7122; // סף ביטוח לאומי (משוער)
  let nationalInsurance = 0;
  if (grossSalary <= niThreshold) {
    nationalInsurance = grossSalary * 0.004; // שיעור מופחת
  } else {
    nationalInsurance = (niThreshold * 0.004) + ((grossSalary - niThreshold) * 0.07);
  }

  // ביטוח בריאות - עובד (~3.1% עד תקרה, 5% מעל)
  let healthInsurance = 0;
  if (grossSalary <= niThreshold) {
    healthInsurance = grossSalary * 0.031;
  } else {
    healthInsurance = (niThreshold * 0.031) + ((grossSalary - niThreshold) * 0.05);
  }

  // פנסיה - עובד 6%, מעסיק 6.5%
  const pensionEmployee = grossSalary * 0.06;
  const pensionEmployer = grossSalary * 0.065;

  // סה"כ ניכויים
  const totalDeductions = taxDeduction + nationalInsurance + healthInsurance + pensionEmployee + advanceDeduction;

  // שכר נטו
  const netSalary = grossSalary - totalDeductions;

  // עלות מעסיק כוללת (שכר + הפרשות מעסיק)
  const employerTotalCost = grossSalary + pensionEmployer + (grossSalary * 0.075); // + ביטוח לאומי מעסיק

  // שליפת פרויקטים של החודש
  const monthProjects = await q(sql`
    SELECT p.id, p.name, p.status, COALESCE(p.total_value, p.budget, 0) as value
    FROM projects p
    LEFT JOIN project_assignments pa ON pa.project_id = p.id
    WHERE (pa.employee_id = ${employeeId} OR p.manager_id = ${employeeId})
      AND EXTRACT(MONTH FROM p.created_at) = ${month}
      AND EXTRACT(YEAR FROM p.created_at) = ${year}
  `);

  // פרטי חישוב מלאים
  const calculationDetails = {
    hourly_rate: hourlyRate,
    overtime_rate_125: hourlyRate * 1.25,
    overtime_rate_150: hourlyRate * 1.5,
    gross_salary: grossSalary,
    tax_bracket_annual: annualGross,
    ni_threshold: niThreshold,
    pension_rate_employee: 0.06,
    pension_rate_employer: 0.065,
    vat_rate: VAT_RATE
  };

  // שמירה בבסיס הנתונים
  const salaryRows = await q(sql`
    INSERT INTO salary_calculations (
      employee_id, employee_name, employee_type,
      period_month, period_year, base_salary,
      overtime_hours, overtime_amount, commission_amount,
      bonus_amount, advance_deduction, tax_deduction,
      national_insurance, health_insurance,
      pension_employee, pension_employer,
      total_deductions, net_salary, employer_total_cost,
      projects_this_month, calculation_details, status
    ) VALUES (
      ${employeeId}, ${emp.name || emp.full_name || ''}, ${employeeType},
      ${month}, ${year}, ${baseSalary},
      ${overtimeHours}, ${overtimeAmount}, ${commissionAmount},
      ${bonusAmount}, ${advanceDeduction}, ${taxDeduction},
      ${nationalInsurance}, ${healthInsurance},
      ${pensionEmployee}, ${pensionEmployer},
      ${totalDeductions}, ${netSalary}, ${employerTotalCost},
      ${JSON.stringify(monthProjects)}::jsonb, ${JSON.stringify(calculationDetails)}::jsonb, 'draft'
    )
    RETURNING *
  `);

  return salaryRows[0];
}


/**
 * חישוב שכר לכל העובדים - באצ' חודשי
 */
async function calculateAllSalaries(month: number, year: number) {
  // שליפת כל העובדים הפעילים
  const employees = await q(sql`
    SELECT id, name, full_name, employee_type, type, status
    FROM employees
    WHERE status = 'active' OR status IS NULL
  `);

  const results: any[] = [];
  const errors: any[] = [];

  for (const emp of employees) {
    try {
      const salary = await calculateMonthlySalary(emp.id, month, year);
      results.push(salary);
    } catch (err: any) {
      errors.push({
        employee_id: emp.id,
        employee_name: emp.name || emp.full_name,
        error: err.message
      });
    }
  }

  return {
    month,
    year,
    total_employees: employees.length,
    calculated: results.length,
    errors_count: errors.length,
    total_gross: results.reduce((s, r) => s + parseFloat(r.base_salary || '0') + parseFloat(r.overtime_amount || '0'), 0),
    total_net: results.reduce((s, r) => s + parseFloat(r.net_salary || '0'), 0),
    total_employer_cost: results.reduce((s, r) => s + parseFloat(r.employer_total_cost || '0'), 0),
    results,
    errors
  };
}


/**
 * תיק עובד מלא - 360° - פרויקטים, הכנסות, חשבוניות, מסמכים, חוזים
 */
async function getEmployeePortfolio(employeeId: number) {
  // פרטי עובד
  const empRows = await q(sql`SELECT * FROM employees WHERE id = ${employeeId} LIMIT 1`);
  const emp = empRows[0];
  if (!emp) throw new Error(`עובד ${employeeId} לא נמצא`);

  // פרויקטים
  const projects = await q(sql`
    SELECT p.*, COALESCE(p.total_value, p.budget, 0) as value
    FROM projects p
    LEFT JOIN project_assignments pa ON pa.project_id = p.id
    WHERE pa.employee_id = ${employeeId} OR p.manager_id = ${employeeId}
    ORDER BY p.created_at DESC
    LIMIT 50
  `);

  // הכנסות - חשבוניות
  const invoices = await q(sql`
    SELECT i.*
    FROM invoices i
    LEFT JOIN projects p ON i.project_id = p.id
    LEFT JOIN project_assignments pa ON pa.project_id = p.id
    WHERE pa.employee_id = ${employeeId} OR p.manager_id = ${employeeId}
    ORDER BY i.created_at DESC
    LIMIT 50
  `);

  // הצעות מחיר
  const quotes = await q(sql`
    SELECT pq.*
    FROM price_quotes pq
    WHERE pq.created_by_id = ${employeeId} OR pq.sales_person_id = ${employeeId}
    ORDER BY pq.created_at DESC
    LIMIT 50
  `);

  // מסמכים
  const documents = await q(sql`
    SELECT d.*
    FROM documents d
    WHERE d.employee_id = ${employeeId} OR d.uploaded_by = ${employeeId}
    ORDER BY d.created_at DESC
    LIMIT 30
  `);

  // חוזים
  const contracts = await q(sql`
    SELECT sc.*
    FROM supplier_contracts sc
    WHERE sc.contact_person_id = ${employeeId}
    ORDER BY sc.created_at DESC
    LIMIT 20
  `);

  // היסטוריית שכר
  const salaryHistory = await q(sql`
    SELECT * FROM salary_calculations
    WHERE employee_id = ${employeeId}
    ORDER BY period_year DESC, period_month DESC
    LIMIT 12
  `);

  // ניתוחי ערך אחרונים
  const valueAnalyses = await q(sql`
    SELECT * FROM employee_value_analysis
    WHERE employee_id = ${employeeId}
    ORDER BY created_at DESC
    LIMIT 6
  `);

  // חישובי קבלן (אם רלוונטי)
  const contractorPayments = await q(sql`
    SELECT * FROM contractor_payment_calc
    WHERE contractor_id = ${employeeId}
    ORDER BY created_at DESC
    LIMIT 20
  `);

  // סיכום כספי
  const totalRevenue = invoices.reduce((s: number, i: any) => s + parseFloat(i.total_amount || '0'), 0);
  const totalQuotesValue = quotes.reduce((s: number, q: any) => s + parseFloat(q.total_amount || q.total || '0'), 0);
  const totalSalaryPaid = salaryHistory.reduce((s: number, sc: any) => s + parseFloat(sc.net_salary || '0'), 0);
  const latestValueScore = valueAnalyses[0]?.overall_value_score || null;

  return {
    employee: emp,
    summary: {
      total_projects: projects.length,
      total_revenue: totalRevenue,
      total_quotes_value: totalQuotesValue,
      total_salary_paid: totalSalaryPaid,
      latest_value_score: latestValueScore,
      latest_value_category: valueAnalyses[0]?.value_category || null,
      documents_count: documents.length,
      contracts_count: contracts.length
    },
    projects,
    invoices,
    quotes,
    documents,
    contracts,
    salary_history: salaryHistory,
    value_analyses: valueAnalyses,
    contractor_payments: contractorPayments
  };
}


// ============================================================
// נתיבי API - Endpoints
// ============================================================

// ===== ניתוח ערך עובד =====
router.post("/employee-value-engine/calculate-value/:employeeId", async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const { period_start, period_end } = req.body;

    if (!period_start || !period_end) {
      return res.status(400).json({ error: "נדרשים תאריכי התחלה וסיום לתקופת הניתוח" });
    }

    const analysis = await calculateEmployeeValue(employeeId, period_start, period_end);
    res.json({ success: true, data: analysis });
  } catch (error: any) {
    console.error("שגיאה בניתוח ערך עובד:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== חישוב תשלום קבלן =====
router.post("/employee-value-engine/calculate-contractor-payment", async (req: Request, res: Response) => {
  try {
    const { contractor_id, project_id, percent_rate, sqm_rate } = req.body;

    if (!contractor_id || !project_id) {
      return res.status(400).json({ error: "נדרשים מזהה קבלן ומזהה פרויקט" });
    }
    if (!percent_rate && !sqm_rate) {
      return res.status(400).json({ error: "נדרש לפחות אחד: אחוז מהפרויקט או מחיר למ\"ר" });
    }

    const result = await calculateContractorPayment(
      contractor_id,
      project_id,
      parseFloat(percent_rate || '0'),
      parseFloat(sqm_rate || '0')
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("שגיאה בחישוב תשלום קבלן:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== חישוב שכר חודשי לעובד =====
router.post("/employee-value-engine/calculate-salary/:employeeId", async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const { month, year } = req.body;

    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();

    const salary = await calculateMonthlySalary(employeeId, m, y);
    res.json({ success: true, data: salary });
  } catch (error: any) {
    console.error("שגיאה בחישוב שכר:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== חישוב שכר לכל העובדים - באצ' =====
router.post("/employee-value-engine/calculate-all-salaries", async (req: Request, res: Response) => {
  try {
    const { month, year } = req.body;
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();

    const result = await calculateAllSalaries(m, y);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("שגיאה בחישוב שכר כללי:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== תיק עובד מלא 360° =====
router.get("/employee-value-engine/employee-portfolio/:employeeId", async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const portfolio = await getEmployeePortfolio(employeeId);
    res.json({ success: true, data: portfolio });
  } catch (error: any) {
    console.error("שגיאה בשליפת תיק עובד:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== דירוג עובדים לפי ציון ערך =====
router.get("/employee-value-engine/value-ranking", async (req: Request, res: Response) => {
  try {
    const { period_start, period_end, department, limit: lim } = req.query;
    const limitVal = parseInt(lim as string) || 50;

    let rows;
    if (period_start && period_end) {
      if (department) {
        rows = await q(sql`
          SELECT eva.*,
            RANK() OVER (ORDER BY overall_value_score DESC) as ranking
          FROM employee_value_analysis eva
          WHERE eva.period_start >= ${period_start as string}::date
            AND eva.period_end <= ${period_end as string}::date
            AND eva.department = ${department as string}
          ORDER BY overall_value_score DESC
          LIMIT ${limitVal}
        `);
      } else {
        rows = await q(sql`
          SELECT eva.*,
            RANK() OVER (ORDER BY overall_value_score DESC) as ranking
          FROM employee_value_analysis eva
          WHERE eva.period_start >= ${period_start as string}::date
            AND eva.period_end <= ${period_end as string}::date
          ORDER BY overall_value_score DESC
          LIMIT ${limitVal}
        `);
      }
    } else {
      // ניתוחים אחרונים - הכי עדכני לכל עובד
      rows = await q(sql`
        SELECT DISTINCT ON (employee_id) eva.*,
          RANK() OVER (ORDER BY overall_value_score DESC) as ranking
        FROM employee_value_analysis eva
        ORDER BY employee_id, created_at DESC
        LIMIT ${limitVal}
      `);
    }

    // סטטיסטיקות כלליות
    const stats = await q(sql`
      SELECT
        COUNT(DISTINCT employee_id) as total_analyzed,
        COALESCE(AVG(overall_value_score), 0) as avg_score,
        COALESCE(MAX(overall_value_score), 0) as max_score,
        COALESCE(MIN(overall_value_score), 0) as min_score,
        COALESCE(AVG(roi_percent), 0) as avg_roi,
        COALESCE(SUM(revenue_generated), 0) as total_revenue,
        COALESCE(SUM(profit_generated), 0) as total_profit,
        COUNT(CASE WHEN value_category = 'exceptional' THEN 1 END) as exceptional_count,
        COUNT(CASE WHEN value_category = 'high_value' THEN 1 END) as high_value_count,
        COUNT(CASE WHEN value_category = 'good' THEN 1 END) as good_count,
        COUNT(CASE WHEN value_category = 'average' THEN 1 END) as average_count,
        COUNT(CASE WHEN value_category = 'needs_improvement' THEN 1 END) as needs_improvement_count
      FROM employee_value_analysis
    `);

    res.json({
      success: true,
      data: {
        ranking: rows,
        statistics: stats[0] || {}
      }
    });
  } catch (error: any) {
    console.error("שגיאה בדירוג עובדים:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== חיסכון מבחירת מודל תשלום אופטימלי לקבלנים =====
router.get("/employee-value-engine/contractor-savings", async (req: Request, res: Response) => {
  try {
    const { period_start, period_end } = req.query;

    let rows;
    if (period_start && period_end) {
      rows = await q(sql`
        SELECT
          contractor_id, contractor_name, contractor_type,
          COUNT(*) as projects_count,
          SUM(project_value) as total_project_value,
          SUM(calculated_by_percent) as total_by_percent,
          SUM(calculated_by_sqm) as total_by_sqm,
          SUM(company_savings) as total_savings,
          SUM(final_amount) as total_paid,
          SUM(total_with_vat) as total_with_vat,
          ROUND(AVG(company_savings), 2) as avg_saving_per_project
        FROM contractor_payment_calc
        WHERE created_at >= ${period_start as string}::date
          AND created_at <= ${period_end as string}::date
        GROUP BY contractor_id, contractor_name, contractor_type
        ORDER BY total_savings DESC
      `);
    } else {
      rows = await q(sql`
        SELECT
          contractor_id, contractor_name, contractor_type,
          COUNT(*) as projects_count,
          SUM(project_value) as total_project_value,
          SUM(calculated_by_percent) as total_by_percent,
          SUM(calculated_by_sqm) as total_by_sqm,
          SUM(company_savings) as total_savings,
          SUM(final_amount) as total_paid,
          SUM(total_with_vat) as total_with_vat,
          ROUND(AVG(company_savings), 2) as avg_saving_per_project
        FROM contractor_payment_calc
        GROUP BY contractor_id, contractor_name, contractor_type
        ORDER BY total_savings DESC
      `);
    }

    // סיכום כללי
    const summary = await q(sql`
      SELECT
        COUNT(DISTINCT contractor_id) as total_contractors,
        COUNT(*) as total_calculations,
        COALESCE(SUM(company_savings), 0) as grand_total_savings,
        COALESCE(SUM(final_amount), 0) as grand_total_paid,
        COALESCE(SUM(total_with_vat), 0) as grand_total_with_vat,
        COUNT(CASE WHEN recommended_model = 'percent' THEN 1 END) as percent_model_wins,
        COUNT(CASE WHEN recommended_model = 'sqm' THEN 1 END) as sqm_model_wins
      FROM contractor_payment_calc
    `);

    res.json({
      success: true,
      data: {
        contractors: rows,
        summary: summary[0] || {}
      }
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת חיסכון קבלנים:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== דוח שכר חודשי =====
router.get("/employee-value-engine/salary-report/:month/:year", async (req: Request, res: Response) => {
  try {
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);

    // כל חישובי השכר לחודש
    const salaries = await q(sql`
      SELECT * FROM salary_calculations
      WHERE period_month = ${month} AND period_year = ${year}
      ORDER BY employee_name ASC
    `);

    // סיכום לפי סוג עובד
    const byType = await q(sql`
      SELECT
        employee_type,
        COUNT(*) as count,
        SUM(base_salary) as total_base,
        SUM(overtime_amount) as total_overtime,
        SUM(commission_amount) as total_commissions,
        SUM(bonus_amount) as total_bonuses,
        SUM(total_deductions) as total_deductions,
        SUM(net_salary) as total_net,
        SUM(employer_total_cost) as total_employer_cost,
        AVG(net_salary) as avg_net,
        MAX(net_salary) as max_net,
        MIN(net_salary) as min_net
      FROM salary_calculations
      WHERE period_month = ${month} AND period_year = ${year}
      GROUP BY employee_type
    `);

    // סיכום כללי
    const summary = await q(sql`
      SELECT
        COUNT(*) as total_employees,
        SUM(base_salary) as total_base_salaries,
        SUM(overtime_amount) as total_overtime,
        SUM(commission_amount) as total_commissions,
        SUM(bonus_amount) as total_bonuses,
        SUM(advance_deduction) as total_advances,
        SUM(tax_deduction) as total_tax,
        SUM(national_insurance) as total_ni,
        SUM(health_insurance) as total_health,
        SUM(pension_employee) as total_pension_employee,
        SUM(pension_employer) as total_pension_employer,
        SUM(total_deductions) as total_deductions,
        SUM(net_salary) as total_net_salaries,
        SUM(employer_total_cost) as total_employer_cost,
        AVG(net_salary) as avg_net_salary,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count
      FROM salary_calculations
      WHERE period_month = ${month} AND period_year = ${year}
    `);

    res.json({
      success: true,
      data: {
        month,
        year,
        salaries,
        by_type: byType,
        summary: summary[0] || {}
      }
    });
  } catch (error: any) {
    console.error("שגיאה בדוח שכר:", error);
    res.status(500).json({ error: error.message });
  }
});


// ============================================================
// CRUD בסיסי - ניתוחי ערך
// ============================================================

// שליפת כל הניתוחים
router.get("/employee-value-engine/analyses", async (req: Request, res: Response) => {
  try {
    const { employee_id, department, value_category, limit: lim, offset: off } = req.query;
    const limitVal = parseInt(lim as string) || 50;
    const offsetVal = parseInt(off as string) || 0;

    let rows;
    if (employee_id) {
      rows = await q(sql`
        SELECT * FROM employee_value_analysis
        WHERE employee_id = ${parseInt(employee_id as string)}
        ORDER BY created_at DESC LIMIT ${limitVal} OFFSET ${offsetVal}
      `);
    } else if (department) {
      rows = await q(sql`
        SELECT * FROM employee_value_analysis
        WHERE department = ${department as string}
        ORDER BY overall_value_score DESC LIMIT ${limitVal} OFFSET ${offsetVal}
      `);
    } else if (value_category) {
      rows = await q(sql`
        SELECT * FROM employee_value_analysis
        WHERE value_category = ${value_category as string}
        ORDER BY overall_value_score DESC LIMIT ${limitVal} OFFSET ${offsetVal}
      `);
    } else {
      rows = await q(sql`
        SELECT * FROM employee_value_analysis
        ORDER BY created_at DESC LIMIT ${limitVal} OFFSET ${offsetVal}
      `);
    }

    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ניתוח בודד
router.get("/employee-value-engine/analyses/:id", async (req: Request, res: Response) => {
  try {
    const rows = await q(sql`
      SELECT * FROM employee_value_analysis WHERE id = ${parseInt(req.params.id)}
    `);
    if (!rows[0]) return res.status(404).json({ error: "ניתוח לא נמצא" });
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// עדכון הערות בניתוח
router.put("/employee-value-engine/analyses/:id", async (req: Request, res: Response) => {
  try {
    const { notes, ai_recommendation } = req.body;
    const rows = await q(sql`
      UPDATE employee_value_analysis
      SET notes = COALESCE(${notes}, notes),
          ai_recommendation = COALESCE(${ai_recommendation}, ai_recommendation),
          updated_at = NOW()
      WHERE id = ${parseInt(req.params.id)}
      RETURNING *
    `);
    if (!rows[0]) return res.status(404).json({ error: "ניתוח לא נמצא" });
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// ============================================================
// CRUD בסיסי - חישובי קבלנים
// ============================================================

// שליפת כל חישובי הקבלנים
router.get("/employee-value-engine/contractor-payments", async (req: Request, res: Response) => {
  try {
    const { contractor_id, project_id, payment_status, limit: lim, offset: off } = req.query;
    const limitVal = parseInt(lim as string) || 50;
    const offsetVal = parseInt(off as string) || 0;

    let rows;
    if (contractor_id) {
      rows = await q(sql`
        SELECT * FROM contractor_payment_calc
        WHERE contractor_id = ${parseInt(contractor_id as string)}
        ORDER BY created_at DESC LIMIT ${limitVal} OFFSET ${offsetVal}
      `);
    } else if (project_id) {
      rows = await q(sql`
        SELECT * FROM contractor_payment_calc
        WHERE project_id = ${parseInt(project_id as string)}
        ORDER BY created_at DESC LIMIT ${limitVal} OFFSET ${offsetVal}
      `);
    } else if (payment_status) {
      rows = await q(sql`
        SELECT * FROM contractor_payment_calc
        WHERE payment_status = ${payment_status as string}
        ORDER BY created_at DESC LIMIT ${limitVal} OFFSET ${offsetVal}
      `);
    } else {
      rows = await q(sql`
        SELECT * FROM contractor_payment_calc
        ORDER BY created_at DESC LIMIT ${limitVal} OFFSET ${offsetVal}
      `);
    }

    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// עדכון סטטוס תשלום קבלן
router.put("/employee-value-engine/contractor-payments/:id", async (req: Request, res: Response) => {
  try {
    const { payment_status, approved_by, invoice_number, paid_date, notes } = req.body;
    const rows = await q(sql`
      UPDATE contractor_payment_calc
      SET payment_status = COALESCE(${payment_status}, payment_status),
          approved_by = COALESCE(${approved_by}, approved_by),
          invoice_number = COALESCE(${invoice_number}, invoice_number),
          paid_date = COALESCE(${paid_date}::date, paid_date),
          notes = COALESCE(${notes}, notes),
          updated_at = NOW()
      WHERE id = ${parseInt(req.params.id)}
      RETURNING *
    `);
    if (!rows[0]) return res.status(404).json({ error: "חישוב קבלן לא נמצא" });
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// ============================================================
// CRUD בסיסי - חישובי שכר
// ============================================================

// שליפת חישובי שכר
router.get("/employee-value-engine/salaries", async (req: Request, res: Response) => {
  try {
    const { employee_id, month, year, status, limit: lim, offset: off } = req.query;
    const limitVal = parseInt(lim as string) || 50;
    const offsetVal = parseInt(off as string) || 0;

    let rows;
    if (employee_id) {
      rows = await q(sql`
        SELECT * FROM salary_calculations
        WHERE employee_id = ${parseInt(employee_id as string)}
        ORDER BY period_year DESC, period_month DESC LIMIT ${limitVal} OFFSET ${offsetVal}
      `);
    } else if (month && year) {
      rows = await q(sql`
        SELECT * FROM salary_calculations
        WHERE period_month = ${parseInt(month as string)} AND period_year = ${parseInt(year as string)}
        ORDER BY employee_name ASC LIMIT ${limitVal} OFFSET ${offsetVal}
      `);
    } else if (status) {
      rows = await q(sql`
        SELECT * FROM salary_calculations
        WHERE status = ${status as string}
        ORDER BY created_at DESC LIMIT ${limitVal} OFFSET ${offsetVal}
      `);
    } else {
      rows = await q(sql`
        SELECT * FROM salary_calculations
        ORDER BY created_at DESC LIMIT ${limitVal} OFFSET ${offsetVal}
      `);
    }

    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// אישור חישוב שכר
router.put("/employee-value-engine/salaries/:id/approve", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const rows = await q(sql`
      UPDATE salary_calculations
      SET status = 'approved',
          approved_by = ${user?.name || user?.email || 'system'},
          approved_at = NOW(),
          updated_at = NOW()
      WHERE id = ${parseInt(req.params.id)}
      RETURNING *
    `);
    if (!rows[0]) return res.status(404).json({ error: "חישוב שכר לא נמצא" });
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// עדכון הערות בחישוב שכר
router.put("/employee-value-engine/salaries/:id", async (req: Request, res: Response) => {
  try {
    const { notes, bonus_amount, commission_amount, status } = req.body;

    // אם מעדכנים בונוס או עמלה - נחשב מחדש את הניכויים
    const currentRows = await q(sql`
      SELECT * FROM salary_calculations WHERE id = ${parseInt(req.params.id)}
    `);
    if (!currentRows[0]) return res.status(404).json({ error: "חישוב שכר לא נמצא" });

    const current = currentRows[0];
    const newBonus = bonus_amount !== undefined ? parseFloat(bonus_amount) : parseFloat(current.bonus_amount || '0');
    const newCommission = commission_amount !== undefined ? parseFloat(commission_amount) : parseFloat(current.commission_amount || '0');

    // חישוב ברוטו חדש
    const newGross = parseFloat(current.base_salary || '0') +
      parseFloat(current.overtime_amount || '0') +
      newCommission + newBonus;

    // חישוב ניכויים מחדש (פשוט)
    const newPensionEmployee = newGross * 0.06;
    const newTotalDeductions = parseFloat(current.tax_deduction || '0') +
      parseFloat(current.national_insurance || '0') +
      parseFloat(current.health_insurance || '0') +
      newPensionEmployee +
      parseFloat(current.advance_deduction || '0');
    const newNetSalary = newGross - newTotalDeductions;

    const rows = await q(sql`
      UPDATE salary_calculations
      SET bonus_amount = ${newBonus},
          commission_amount = ${newCommission},
          pension_employee = ${newPensionEmployee},
          total_deductions = ${newTotalDeductions},
          net_salary = ${newNetSalary},
          notes = COALESCE(${notes}, notes),
          status = COALESCE(${status}, status),
          updated_at = NOW()
      WHERE id = ${parseInt(req.params.id)}
      RETURNING *
    `);

    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


export default router;
