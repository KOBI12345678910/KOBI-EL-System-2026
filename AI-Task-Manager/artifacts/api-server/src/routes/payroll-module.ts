import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

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


function q(query: ReturnType<typeof sql>) {
  return db.execute(query).then((r: any) => (r?.rows || r || []));
}

router.get("/payroll/dashboard", async (req: Request, res: Response) => {
  try {
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const [empStats] = await q(sql`
      SELECT COUNT(*) as count,
        COALESCE(SUM(gross_salary),0) as total_gross,
        COALESCE(SUM(net_salary),0) as total_net,
        COALESCE(SUM(total_deductions),0) as total_deductions,
        COALESCE(SUM(employer_cost),0) as employer_cost,
        COALESCE(SUM(overtime_pay),0) as total_overtime_pay,
        COALESCE(SUM(overtime_hours),0) as total_overtime_hours,
        COALESCE(SUM(bonus),0) as total_bonus,
        COALESCE(SUM(commission),0) as total_commission,
        COALESCE(AVG(gross_salary),0) as avg_gross,
        COALESCE(AVG(net_salary),0) as avg_net
      FROM payroll_records
      WHERE period_month = ${month} AND period_year = ${year}
    `);

    const [contStats] = await q(sql`
      SELECT COUNT(DISTINCT contractor_id) as count,
        COALESCE(SUM(gross_amount),0) as total_gross,
        COALESCE(SUM(net_amount),0) as total_net,
        COALESCE(SUM(withholding_tax),0) as total_tax,
        COALESCE(SUM(hours_worked),0) as total_hours,
        COALESCE(AVG(gross_amount),0) as avg_gross
      FROM contractor_work_log
      WHERE period_month = ${month} AND period_year = ${year}
    `);

    const [attStats] = await q(sql`
      SELECT
        COUNT(*) FILTER (WHERE status='absent') as absences,
        COUNT(*) FILTER (WHERE status='sick') as sick_days,
        COUNT(*) FILTER (WHERE status='late') as late_count,
        COUNT(*) FILTER (WHERE status='vacation') as vacations,
        COUNT(*) FILTER (WHERE status='present') as present,
        COUNT(DISTINCT employee_name) as unique_employees,
        COALESCE(SUM(late_minutes) FILTER (WHERE late_minutes > 0), 0) as total_late_minutes
      FROM attendance_records
      WHERE EXTRACT(MONTH FROM attendance_date) = ${month}
        AND EXTRACT(YEAR FROM attendance_date) = ${year}
    `);

    const deptBreakdown = await q(sql`
      SELECT department,
        COUNT(*) as count,
        COALESCE(SUM(gross_salary),0) as total_gross,
        COALESCE(SUM(net_salary),0) as total_net,
        COALESCE(SUM(overtime_pay),0) as overtime_pay
      FROM payroll_records
      WHERE period_month = ${month} AND period_year = ${year}
      GROUP BY department ORDER BY total_gross DESC
    `);

    const absentees = await q(sql`
      SELECT employee_name, status, attendance_date, notes, department
      FROM attendance_records
      WHERE status IN ('absent','sick','late','vacation')
        AND EXTRACT(MONTH FROM attendance_date) = ${month}
        AND EXTRACT(YEAR FROM attendance_date) = ${year}
      ORDER BY attendance_date DESC
    `);

    const contBreakdown = await q(sql`
      SELECT c.contractor_name, c.work_type,
        COUNT(*) as jobs,
        COALESCE(SUM(c.gross_amount),0) as total_gross,
        COALESCE(SUM(c.net_amount),0) as total_net,
        COALESCE(SUM(c.hours_worked),0) as total_hours
      FROM contractor_work_log c
      WHERE c.period_month = ${month} AND c.period_year = ${year}
      GROUP BY c.contractor_name, c.work_type
      ORDER BY total_gross DESC
    `);

    const totalCombined = Number(empStats?.total_gross || 0) + Number(contStats?.total_gross || 0);

    res.json({
      period: { month, year },
      employees: {
        count: Number(empStats?.count || 0),
        totalGross: Number(empStats?.total_gross || 0),
        totalNet: Number(empStats?.total_net || 0),
        totalDeductions: Number(empStats?.total_deductions || 0),
        employerCost: Number(empStats?.employer_cost || 0),
        overtimePay: Number(empStats?.total_overtime_pay || 0),
        overtimeHours: Number(empStats?.total_overtime_hours || 0),
        totalBonus: Number(empStats?.total_bonus || 0),
        totalCommission: Number(empStats?.total_commission || 0),
        avgGross: Number(empStats?.avg_gross || 0),
        avgNet: Number(empStats?.avg_net || 0),
      },
      contractors: {
        count: Number(contStats?.count || 0),
        totalGross: Number(contStats?.total_gross || 0),
        totalNet: Number(contStats?.total_net || 0),
        totalTax: Number(contStats?.total_tax || 0),
        totalHours: Number(contStats?.total_hours || 0),
        avgGross: Number(contStats?.avg_gross || 0),
      },
      attendance: {
        absences: Number(attStats?.absences || 0),
        sickDays: Number(attStats?.sick_days || 0),
        lateCount: Number(attStats?.late_count || 0),
        vacations: Number(attStats?.vacations || 0),
        present: Number(attStats?.present || 0),
        totalLateMinutes: Number(attStats?.total_late_minutes || 0),
      },
      totalCombined,
      departmentBreakdown: deptBreakdown,
      absentees,
      contractorBreakdown: contBreakdown,
    });
  } catch (err) {
    console.error("payroll dashboard error:", err);
    res.status(500).json({ error: "שגיאה בטעינת דשבורד שכר" });
  }
});

router.get("/payroll/employees", async (req: Request, res: Response) => {
  try {
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const rows = await q(sql`
      SELECT p.*,
        e.job_title, e.employment_type, e.start_date as hire_date,
        (SELECT COUNT(*) FROM attendance_records a
          WHERE a.employee_id_ref = p.employee_id_ref
          AND a.status = 'absent'
          AND EXTRACT(MONTH FROM a.attendance_date) = ${month}
          AND EXTRACT(YEAR FROM a.attendance_date) = ${year}
        ) as absence_days,
        (SELECT COUNT(*) FROM attendance_records a
          WHERE a.employee_id_ref = p.employee_id_ref
          AND a.status = 'sick'
          AND EXTRACT(MONTH FROM a.attendance_date) = ${month}
          AND EXTRACT(YEAR FROM a.attendance_date) = ${year}
        ) as sick_days,
        (SELECT COUNT(*) FROM attendance_records a
          WHERE a.employee_id_ref = p.employee_id_ref
          AND a.status = 'late'
          AND EXTRACT(MONTH FROM a.attendance_date) = ${month}
          AND EXTRACT(YEAR FROM a.attendance_date) = ${year}
        ) as late_days,
        (SELECT COALESCE(SUM(a.late_minutes),0) FROM attendance_records a
          WHERE a.employee_id_ref = p.employee_id_ref
          AND a.late_minutes > 0
          AND EXTRACT(MONTH FROM a.attendance_date) = ${month}
          AND EXTRACT(YEAR FROM a.attendance_date) = ${year}
        ) as total_late_minutes,
        (SELECT COUNT(*) FROM attendance_records a
          WHERE a.employee_id_ref = p.employee_id_ref
          AND a.status = 'vacation'
          AND EXTRACT(MONTH FROM a.attendance_date) = ${month}
          AND EXTRACT(YEAR FROM a.attendance_date) = ${year}
        ) as vacation_days,
        (SELECT COUNT(*) FROM work_orders w
          WHERE w.assigned_to = p.employee_name
          AND w.status = 'completed'
          AND EXTRACT(MONTH FROM w.actual_end_date) = ${month}
          AND EXTRACT(YEAR FROM w.actual_end_date) = ${year}
        ) as completed_work_orders
      FROM payroll_records p
      LEFT JOIN employees e ON e.id = p.employee_id_ref
      WHERE p.period_month = ${month} AND p.period_year = ${year}
      ORDER BY p.department, p.employee_name
    `);

    res.json(rows);
  } catch (err) {
    console.error("payroll employees error:", err);
    res.status(500).json({ error: "שגיאה בטעינת תלושי שכר" });
  }
});

router.get("/payroll/contractors", async (req: Request, res: Response) => {
  try {
    const month = parseInt(req.query.month as string) || 0;
    const year = parseInt(req.query.year as string) || 0;

    if (month && year) {
      const rows = await q(sql`
        SELECT cwl.*, c.phone, c.specialization, c.payment_type,
          c.withholding_tax_percent, c.tax_id, c.contractor_type as type
        FROM contractor_work_log cwl
        JOIN contractors c ON c.id = cwl.contractor_id
        WHERE cwl.period_month = ${month} AND cwl.period_year = ${year}
        ORDER BY cwl.gross_amount DESC
      `);
      res.json(rows);
    } else {
      const rows = await q(sql`SELECT * FROM contractors ORDER BY full_name`);
      res.json(rows);
    }
  } catch (err) {
    console.error("payroll contractors error:", err);
    res.status(500).json({ error: "שגיאה בטעינת קבלנים" });
  }
});

router.get("/payroll/contractors/all", async (_req: Request, res: Response) => {
  try {
    const rows = await q(sql`SELECT * FROM contractors WHERE status='active' ORDER BY full_name`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "שגיאה" });
  }
});

router.get("/payroll/contractor-work-log", async (req: Request, res: Response) => {
  try {
    const rows = await q(sql`
      SELECT cwl.*, c.specialization, c.contractor_type
      FROM contractor_work_log cwl
      LEFT JOIN contractors c ON c.id = cwl.contractor_id
      ORDER BY cwl.work_date DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "שגיאה בטעינת יומן עבודה" });
  }
});

router.post("/payroll/contractor-work-log", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const [last] = await q(sql`SELECT log_number FROM contractor_work_log ORDER BY id DESC LIMIT 1`);
    const nextNum = last?.log_number
      ? `CWL-${String(parseInt(last.log_number.replace('CWL-', '')) + 1).padStart(3, '0')}`
      : 'CWL-016';

    const gross = Number(b.grossAmount) || (Number(b.quantity || 0) * Number(b.rate || 0)) || (Number(b.hoursWorked || 0) * Number(b.rate || 0));
    const whTax = Number(b.withholdingTax) || (gross * Number(b.withholdingTaxPercent || 0) / 100);
    const deductions = Number(b.deductions) || 0;
    const net = gross - deductions - whTax;

    await q(sql`
      INSERT INTO contractor_work_log (log_number, contractor_id, contractor_name, work_type, work_order_id, work_order_number, description, work_date, quantity, unit, rate, hours_worked, gross_amount, deductions, withholding_tax, net_amount, status, period_month, period_year, notes)
      VALUES (${nextNum}, ${b.contractorId || null}, ${b.contractorName || ''}, ${b.workType || 'production'}, ${b.workOrderId || null}, ${b.workOrderNumber || null}, ${b.description || ''}, ${b.workDate || new Date().toISOString().slice(0, 10)}, ${Number(b.quantity) || 0}, ${b.unit || 'units'}, ${Number(b.rate) || 0}, ${Number(b.hoursWorked) || 0}, ${gross}, ${deductions}, ${whTax}, ${net}, ${b.status || 'pending'}, ${Number(b.periodMonth) || new Date().getMonth() + 1}, ${Number(b.periodYear) || new Date().getFullYear()}, ${b.notes || null})
    `);
    res.json({ message: "נשמר בהצלחה", logNumber: nextNum });
  } catch (err) {
    console.error("contractor work log create error:", err);
    res.status(500).json({ error: "שגיאה בשמירה" });
  }
});

router.put("/payroll/contractor-work-log/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const b = req.body;
    const gross = Number(b.grossAmount) || (Number(b.quantity || 0) * Number(b.rate || 0));
    const whTax = Number(b.withholdingTax) || (gross * Number(b.withholdingTaxPercent || 0) / 100);
    const net = gross - Number(b.deductions || 0) - whTax;

    await q(sql`
      UPDATE contractor_work_log SET
        contractor_name = COALESCE(${b.contractorName}, contractor_name),
        work_type = COALESCE(${b.workType}, work_type),
        description = COALESCE(${b.description}, description),
        work_date = COALESCE(${b.workDate}, work_date),
        quantity = COALESCE(${Number(b.quantity) || null}, quantity),
        rate = COALESCE(${Number(b.rate) || null}, rate),
        hours_worked = COALESCE(${Number(b.hoursWorked) || null}, hours_worked),
        gross_amount = ${gross},
        withholding_tax = ${whTax},
        net_amount = ${net},
        status = COALESCE(${b.status}, status),
        notes = COALESCE(${b.notes}, notes),
        updated_at = NOW()
      WHERE id = ${id}
    `);
    res.json({ message: "עודכן בהצלחה" });
  } catch (err) {
    res.status(500).json({ error: "שגיאה בעדכון" });
  }
});

router.get("/payroll/history", async (req: Request, res: Response) => {
  try {
    const empHistory = await q(sql`
      SELECT period_month, period_year,
        COUNT(*) as emp_count,
        COALESCE(SUM(gross_salary),0) as total_gross,
        COALESCE(SUM(net_salary),0) as total_net,
        COALESCE(SUM(employer_cost),0) as employer_cost,
        COALESCE(SUM(overtime_pay),0) as overtime_pay
      FROM payroll_records
      GROUP BY period_month, period_year
      ORDER BY period_year DESC, period_month DESC
    `);

    const contHistory = await q(sql`
      SELECT period_month, period_year,
        COUNT(DISTINCT contractor_id) as cont_count,
        COALESCE(SUM(gross_amount),0) as total_gross,
        COALESCE(SUM(net_amount),0) as total_net,
        COUNT(*) as job_count
      FROM contractor_work_log
      GROUP BY period_month, period_year
      ORDER BY period_year DESC, period_month DESC
    `);

    res.json({ employeeHistory: empHistory, contractorHistory: contHistory });
  } catch (err) {
    res.status(500).json({ error: "שגיאה בטעינת היסטוריה" });
  }
});

export default router;
