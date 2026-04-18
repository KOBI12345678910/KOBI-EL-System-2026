import { query, getClient } from '../../db/connection';
import { broadcastToAll } from '../../realtime/websocket';

// ════════════════════════════════════════════
// ENGINE 14: PAYROLL ENGINE
// מנוע שכר לעובדים — חישוב אוטומטי מלא
// ════════════════════════════════════════════

export const payrollEngine = {

  // חישוב שכר חודשי מלא
  async calculateMonthlyPayroll(month: string, year: number) {
    const { rows: employees } = await query(`
      SELECT e.*,
        SUM(a.hours_worked) FILTER (
          WHERE EXTRACT(MONTH FROM a.date)=$1
            AND EXTRACT(YEAR FROM a.date)=$2
        ) as hours_this_month,
        COUNT(a.id) FILTER (
          WHERE EXTRACT(MONTH FROM a.date)=$1
            AND EXTRACT(YEAR FROM a.date)=$2
            AND a.location IN ('factory','field')
        ) as days_present,
        COUNT(a.id) FILTER (
          WHERE EXTRACT(MONTH FROM a.date)=$1
            AND EXTRACT(YEAR FROM a.date)=$2
            AND a.location='sick'
        ) as sick_days,
        COUNT(t.id) FILTER (WHERE t.status='done'
          AND EXTRACT(MONTH FROM t.completed_at)=$1
          AND EXTRACT(YEAR FROM t.completed_at)=$2) as tasks_done,
        COUNT(t.id) FILTER (WHERE t.status='done'
          AND t.completed_at <= t.scheduled_date::TIMESTAMP+INTERVAL '1 day'
          AND EXTRACT(MONTH FROM t.completed_at)=$1
          AND EXTRACT(YEAR FROM t.completed_at)=$2) as on_time_tasks
      FROM employees e
      LEFT JOIN attendance a ON e.id=a.employee_id
      LEFT JOIN tasks t ON e.id=t.employee_id
      WHERE e.is_active=true
      GROUP BY e.id
    `, [parseInt(month), year]);

    const payrollRun = await Promise.all(
      employees.map(emp => this.calculateEmployeePayroll(emp, month, year))
    );

    const totalGross = payrollRun.reduce((s, p) => s + p.gross, 0);
    const totalNet = payrollRun.reduce((s, p) => s + p.net, 0);
    const totalEmployerCost = payrollRun.reduce((s, p) => s + p.employer_total_cost, 0);

    // שמור פריסה
    await query(`
      INSERT INTO payroll_runs (month, year, employees_count, total_gross, total_net, total_employer_cost, details, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      ON CONFLICT (month, year) DO UPDATE SET
        total_gross=$4, total_net=$5, total_employer_cost=$6, details=$7
    `, [month, year, payrollRun.length, totalGross, totalNet, totalEmployerCost, JSON.stringify(payrollRun)]);

    broadcastToAll('PAYROLL_CALCULATED', {
      month, year, total_gross: totalGross, employees: payrollRun.length
    });

    return {
      month, year,
      summary: {
        employees: payrollRun.length,
        total_gross: Math.round(totalGross),
        total_net: Math.round(totalNet),
        total_employer_cost: Math.round(totalEmployerCost),
        avg_salary: Math.round(totalGross / payrollRun.length)
      },
      employees: payrollRun
    };
  },

  // חישוב שכר עובד בודד
  async calculateEmployeePayroll(emp: any, month: string, year: number) {
    const salary = parseFloat(emp.salary);
    const workingDays = 22; // ימי עבודה בחודש
    const daysPresent = parseInt(emp.days_present || '0');
    const hoursThisMonth = parseFloat(emp.hours_this_month || '0');

    // שכר בסיס (לפי ימי עבודה)
    const dailyRate = salary / workingDays;
    const baseSalary = Math.round(dailyRate * daysPresent);

    // שעות נוספות (מעל 186 שעות/חודש)
    const normalHours = 186;
    const overtimeHours = Math.max(0, hoursThisMonth - normalHours);
    const hourlyRate = salary / normalHours;
    const overtimePay = Math.round(overtimeHours * hourlyRate * 1.25);

    // בונוס ביצועים
    const tasksScore = emp.tasks_done > 0
      ? parseInt(emp.on_time_tasks || '0') / parseInt(emp.tasks_done) : 0;
    const performanceBonus = tasksScore > 0.9 ? Math.round(salary * 0.05) : 0;

    // ניכויי ביטוח לאומי (ישראל 2026)
    const BITUACH_LEUMI_RATE = 0.035; // 3.5% עובד
    const BITUACH_LEUMI_EMPLOYER = 0.055; // 5.5% מעסיק
    const INCOME_TAX_RATE = baseSalary > 7000 ? 0.12 : 0.08; // פשטני

    const grossSalary = baseSalary + overtimePay + performanceBonus;
    const bituachLeumi = Math.round(grossSalary * BITUACH_LEUMI_RATE);
    const incomeTax = Math.round(Math.max(0, grossSalary - 5000) * INCOME_TAX_RATE);
    const pensionEmployee = Math.round(grossSalary * 0.06); // 6% פנסיה עובד

    const totalDeductions = bituachLeumi + incomeTax + pensionEmployee;
    const netSalary = grossSalary - totalDeductions;

    // עלות מעסיק
    const pensionEmployer = Math.round(grossSalary * 0.065); // 6.5%
    const severanceFund = Math.round(grossSalary * 0.0833); // 8.33%
    const bituachEmployer = Math.round(grossSalary * BITUACH_LEUMI_EMPLOYER);
    const educationFund = Math.round(grossSalary * 0.075); // 7.5% קרן השתלמות

    const employerTotalCost = grossSalary + pensionEmployer + severanceFund +
                              bituachEmployer + educationFund;

    return {
      employee_id: emp.id,
      name: emp.name,
      role: emp.role,
      base_salary: salary,
      days_present: daysPresent,
      hours_worked: Math.round(hoursThisMonth),
      overtime_hours: Math.round(overtimeHours),

      earnings: {
        base: baseSalary,
        overtime: overtimePay,
        performance_bonus: performanceBonus,
        gross: grossSalary
      },
      deductions: {
        bituach_leumi: bituachLeumi,
        income_tax: incomeTax,
        pension_employee: pensionEmployee,
        total: totalDeductions
      },
      net: netSalary,

      employer_costs: {
        pension_employer: pensionEmployer,
        severance_fund: severanceFund,
        bituach_leumi_employer: bituachEmployer,
        education_fund: educationFund
      },
      employer_total_cost: employerTotalCost,

      gross: grossSalary,
      payslip_date: `01/${month}/${year}`,
      performance_score: Math.round(tasksScore * 100)
    };
  },

  // תלוש שכר
  generatePayslip(payroll: any): string {
    return `
════════════════════════════════
    טכנו-קול עוזי בע"מ
    תלוש שכר — ${payroll.payslip_date}
════════════════════════════════
עובד: ${payroll.name}
תפקיד: ${payroll.role}
ימי עבודה: ${payroll.days_present} | שעות: ${payroll.hours_worked}

הכנסות:
  שכר בסיס:        ₪${payroll.earnings.base.toLocaleString('he-IL')}
  שעות נוספות:     ₪${payroll.earnings.overtime.toLocaleString('he-IL')}
  בונוס ביצועים:   ₪${payroll.earnings.performance_bonus.toLocaleString('he-IL')}
  ──────────────────────────────
  ברוטו:           ₪${payroll.gross.toLocaleString('he-IL')}

ניכויים:
  ביטוח לאומי:     ₪${payroll.deductions.bituach_leumi.toLocaleString('he-IL')}
  מס הכנסה:        ₪${payroll.deductions.income_tax.toLocaleString('he-IL')}
  פנסיה עובד:      ₪${payroll.deductions.pension_employee.toLocaleString('he-IL')}
  ──────────────────────────────
  סה"כ ניכויים:    ₪${payroll.deductions.total.toLocaleString('he-IL')}

  נטו לתשלום:     ₪${payroll.net.toLocaleString('he-IL')}
════════════════════════════════
עלות מעסיק כוללת: ₪${payroll.employer_total_cost.toLocaleString('he-IL')}
════════════════════════════════
    `.trim();
  }
};
