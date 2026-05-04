"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.employeeAnalyticsEngine = void 0;
const connection_1 = require("../../db/connection");
const websocket_1 = require("../../realtime/websocket");
// ════════════════════════════════════════════
// ENGINE 12: EMPLOYEE ANALYTICS ENGINE
// מנוע ניתוח עובדים — Deep HR Analytics
// ════════════════════════════════════════════
exports.employeeAnalyticsEngine = {
    async fullEmployeeAnalysis(employeeId) {
        const [profile, attendance, tasks, productivity, salary, risk] = await Promise.all([
            (0, connection_1.query)(`SELECT * FROM employees WHERE id=$1`, [employeeId]),
            this.attendanceAnalysis(employeeId),
            this.taskAnalysis(employeeId),
            this.productivityTrend(employeeId),
            this.salaryAnalysis(employeeId),
            this.attritionRisk(employeeId)
        ]);
        return {
            profile: profile.rows[0],
            attendance,
            tasks,
            productivity,
            salary,
            attrition_risk: risk,
            overall_score: Math.round(attendance.score * 0.2 +
                tasks.score * 0.35 +
                productivity.trend_score * 0.25 +
                (100 - risk.risk_score) * 0.20)
        };
    },
    async attendanceAnalysis(empId) {
        const { rows } = await (0, connection_1.query)(`
      SELECT
        COUNT(*) as total_days,
        COUNT(*) FILTER (WHERE location IN ('factory','field')) as present_days,
        COUNT(*) FILTER (WHERE location='sick') as sick_days,
        COUNT(*) FILTER (WHERE location='vacation') as vacation_days,
        COUNT(*) FILTER (WHERE location='absent') as absent_days,
        AVG(CASE WHEN check_in IS NOT NULL
          THEN EXTRACT(EPOCH FROM (check_in - '08:00:00'::TIME))/60 ELSE 0 END) as avg_late_minutes
      FROM attendance
      WHERE employee_id=$1
        AND date >= CURRENT_DATE-INTERVAL '90 days'
    `, [empId]);
        const a = rows[0];
        const presentRate = parseInt(a.total_days) > 0
            ? parseInt(a.present_days) / parseInt(a.total_days) * 100 : 0;
        return {
            ...a,
            present_rate: Math.round(presentRate),
            score: presentRate > 95 ? 100 : presentRate > 90 ? 80 : presentRate > 80 ? 60 : 30,
            avg_lateness_minutes: Math.round(parseFloat(a.avg_late_minutes || '0')),
            pattern: parseInt(a.sick_days) > 8 ? 'HIGH_SICK_DAYS' :
                parseFloat(a.avg_late_minutes) > 15 ? 'CHRONIC_LATENESS' : 'NORMAL'
        };
    },
    async taskAnalysis(empId) {
        const { rows } = await (0, connection_1.query)(`
      SELECT
        COUNT(*) as total, COUNT(*) FILTER (WHERE status='done') as done,
        COUNT(*) FILTER (WHERE status='done'
          AND completed_at < scheduled_date::TIMESTAMP+INTERVAL '1 day') as on_time,
        AVG(EXTRACT(EPOCH FROM (completed_at-arrived_at))/3600)
          FILTER (WHERE status='done') as avg_hours,
        COUNT(*) FILTER (WHERE status='done'
          AND created_at > NOW()-INTERVAL '30 days') as last_month_done
      FROM tasks WHERE employee_id=$1
        AND created_at > NOW()-INTERVAL '90 days'
    `, [empId]);
        const t = rows[0];
        const completionRate = t.total > 0 ? parseInt(t.done) / parseInt(t.total) * 100 : 0;
        const onTimeRate = t.done > 0 ? parseInt(t.on_time) / parseInt(t.done) * 100 : 0;
        return {
            ...t,
            completion_rate: Math.round(completionRate),
            on_time_rate: Math.round(onTimeRate),
            avg_hours_per_task: parseFloat(t.avg_hours || '0').toFixed(1),
            score: Math.round(completionRate * 0.5 + onTimeRate * 0.5)
        };
    },
    async productivityTrend(empId) {
        const { rows } = await (0, connection_1.query)(`
      SELECT DATE_TRUNC('week', created_at) as week,
        COUNT(*) FILTER (WHERE status='done') as done_tasks
      FROM tasks WHERE employee_id=$1
        AND created_at > NOW()-INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', created_at)
      ORDER BY week ASC
    `, [empId]);
        const values = rows.map((r) => parseInt(r.done_tasks));
        const trend = values.length >= 2
            ? (values[values.length - 1] - values[0]) / Math.max(1, values[0]) * 100
            : 0;
        return {
            weekly_data: rows,
            trend_pct: Math.round(trend),
            trend_score: trend > 10 ? 90 : trend > 0 ? 70 : trend > -10 ? 50 : 20,
            direction: trend > 5 ? 'IMPROVING' : trend < -5 ? 'DECLINING' : 'STABLE'
        };
    },
    async salaryAnalysis(empId) {
        const { rows } = await (0, connection_1.query)(`
      SELECT e.salary, e.role,
        AVG(e2.salary) as role_avg_salary,
        MIN(e2.salary) as role_min_salary,
        MAX(e2.salary) as role_max_salary,
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, e.start_date)) as years_employed
      FROM employees e
      LEFT JOIN employees e2 ON e2.role=e.role AND e2.is_active=true AND e2.id!=e.id
      WHERE e.id=$1
      GROUP BY e.salary, e.role, e.start_date
    `, [empId]);
        const s = rows[0];
        const percentile = parseFloat(s.role_avg_salary) > 0
            ? Math.round((parseFloat(s.salary) - parseFloat(s.role_min_salary)) /
                (parseFloat(s.role_max_salary) - parseFloat(s.role_min_salary)) * 100)
            : 50;
        return {
            current_salary: parseFloat(s.salary),
            role_avg: Math.round(parseFloat(s.role_avg_salary || '0')),
            role_min: Math.round(parseFloat(s.role_min_salary || '0')),
            role_max: Math.round(parseFloat(s.role_max_salary || '0')),
            percentile_in_role: percentile,
            years_employed: parseFloat(s.years_employed || '0'),
            raise_recommendation: (years_employed) => {
                const yoe = years_employed;
                if (yoe >= 3 && percentile < 60)
                    return { pct: 8, reason: 'ותק + מתחת לממוצע' };
                if (yoe >= 5 && percentile < 75)
                    return { pct: 10, reason: 'ותק משמעותי' };
                return { pct: 3, reason: 'עדכון שוטף' };
            }
        };
    },
    async attritionRisk(empId) {
        const { rows } = await (0, connection_1.query)(`
      SELECT e.*,
        COUNT(t.id) FILTER (WHERE t.status='done'
          AND t.created_at > NOW()-INTERVAL '30 days') as recent_tasks,
        COUNT(t.id) FILTER (WHERE t.status='done'
          AND t.created_at BETWEEN NOW()-INTERVAL '60 days' AND NOW()-INTERVAL '30 days') as prev_tasks,
        COUNT(a.id) FILTER (WHERE a.location='sick'
          AND a.date > CURRENT_DATE-30) as recent_sick
      FROM employees e
      LEFT JOIN tasks t ON e.id=t.employee_id
      LEFT JOIN attendance a ON e.id=a.employee_id
      WHERE e.id=$1
      GROUP BY e.id
    `, [empId]);
        const e = rows[0];
        if (!e)
            return { risk_score: 0 };
        let riskScore = 0;
        // ירידה בפרודוקטיביות
        const recentTasks = parseInt(e.recent_tasks || '0');
        const prevTasks = parseInt(e.prev_tasks || '0');
        if (prevTasks > 0 && recentTasks < prevTasks * 0.6)
            riskScore += 30;
        // ימי מחלה
        if (parseInt(e.recent_sick || '0') > 4)
            riskScore += 25;
        // שנות ותק — בשנתיים הראשונות סיכון גבוה
        const yearsEmployed = new Date().getFullYear() - new Date(e.start_date).getFullYear();
        if (yearsEmployed < 2)
            riskScore += 20;
        // שכר מתחת לשוק
        // (בדיקה נוספת)
        const risk = Math.min(100, riskScore);
        if (risk > 60) {
            (0, websocket_1.broadcastToAll)('ATTRITION_RISK', {
                employee_id: empId,
                name: e.name,
                risk_score: risk
            });
        }
        return {
            risk_score: risk,
            risk_level: risk > 60 ? 'HIGH' : risk > 35 ? 'MEDIUM' : 'LOW',
            factors: {
                productivity_drop: prevTasks > 0 && recentTasks < prevTasks * 0.6,
                high_sick_days: parseInt(e.recent_sick || '0') > 4,
                early_tenure: yearsEmployed < 2
            },
            recommended_action: risk > 60 ? 'שיחת שימור דחופה' : risk > 35 ? 'בדיקה חודשית' : 'מעקב רגיל'
        };
    }
};
