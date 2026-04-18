"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contractorEngine = void 0;
const connection_1 = require("../../db/connection");
// ════════════════════════════════════════════
// ENGINE 3: CONTRACTOR & INSTALLER ENGINE
// מנוע קבלנים ומתקינים — Performance + Compensation
// ════════════════════════════════════════════
exports.contractorEngine = {
    // ניקוד קבלן מלא
    async scoreContractor(employeeId) {
        const [perf, tasks, orders, attendance] = await Promise.all([
            (0, connection_1.query)(`
        SELECT
          COUNT(t.id) as total_tasks,
          COUNT(t.id) FILTER (WHERE t.status='done') as done_tasks,
          COUNT(t.id) FILTER (WHERE t.status='done'
            AND t.completed_at <= t.scheduled_date::TIMESTAMP + INTERVAL '2 hours') as on_time,
          AVG(EXTRACT(EPOCH FROM (t.completed_at - t.arrived_at))/3600) as avg_hours_per_task
        FROM tasks t
        WHERE t.employee_id=$1
          AND t.created_at > NOW()-INTERVAL '90 days'
      `, [employeeId]),
            (0, connection_1.query)(`
        SELECT COUNT(*) as total,
          COUNT(*) FILTER (WHERE status='done') as completed
        FROM tasks WHERE employee_id=$1
          AND created_at > NOW()-INTERVAL '30 days'
      `, [employeeId]),
            (0, connection_1.query)(`
        SELECT COUNT(DISTINCT woe.order_id) as orders,
          SUM(woe.hours_logged) as hours,
          AVG(wo.price) as avg_order_value
        FROM work_order_employees woe
        JOIN work_orders wo ON woe.order_id=wo.id AND wo.status='delivered'
        WHERE woe.employee_id=$1
          AND wo.open_date > NOW()-INTERVAL '90 days'
      `, [employeeId]),
            (0, connection_1.query)(`
        SELECT COUNT(*) as days_present,
          COUNT(*) FILTER (WHERE location='sick') as sick_days,
          COUNT(*) FILTER (WHERE location='vacation') as vacation_days
        FROM attendance WHERE employee_id=$1
          AND date >= CURRENT_DATE - INTERVAL '90 days'
      `, [employeeId])
        ]);
        const p = perf.rows[0];
        const t = tasks.rows[0];
        const o = orders.rows[0];
        const a = attendance.rows[0];
        const completionRate = p.total_tasks > 0
            ? parseInt(p.done_tasks) / parseInt(p.total_tasks) * 100 : 0;
        const onTimeRate = p.done_tasks > 0
            ? parseInt(p.on_time) / parseInt(p.done_tasks) * 100 : 0;
        const attendanceRate = parseInt(a.days_present) > 0
            ? (parseInt(a.days_present) - parseInt(a.sick_days)) / parseInt(a.days_present) * 100 : 0;
        const overallScore = Math.round(completionRate * 0.35 +
            onTimeRate * 0.35 +
            attendanceRate * 0.20 +
            Math.min(100, parseInt(o.orders || '0') * 5) * 0.10);
        return {
            employee_id: employeeId,
            scores: {
                overall: overallScore,
                completion_rate: Math.round(completionRate),
                on_time_rate: Math.round(onTimeRate),
                attendance_rate: Math.round(attendanceRate),
                productivity: Math.round(parseFloat(o.hours || '0'))
            },
            stats: {
                total_tasks: parseInt(p.total_tasks),
                completed_tasks: parseInt(p.done_tasks),
                orders_handled: parseInt(o.orders || '0'),
                hours_logged: Math.round(parseFloat(o.hours || '0')),
                avg_order_value: Math.round(parseFloat(o.avg_order_value || '0')),
                sick_days: parseInt(a.sick_days),
                avg_hours_per_task: parseFloat(p.avg_hours_per_task || '0').toFixed(1)
            },
            bonus_recommendation: this.calculateBonus(overallScore, o),
            tier: overallScore >= 85 ? 'A' : overallScore >= 70 ? 'B' : overallScore >= 50 ? 'C' : 'D',
            insights: this.generateInsights(overallScore, completionRate, onTimeRate, attendanceRate)
        };
    },
    calculateBonus(score, orders) {
        const baseBonus = parseFloat(orders.avg_order_value || '0') * 0.015;
        const multiplier = score >= 90 ? 2.0 : score >= 80 ? 1.5 : score >= 70 ? 1.0 : 0.5;
        return Math.round(baseBonus * multiplier);
    },
    generateInsights(overall, completion, onTime, attendance) {
        const insights = [];
        if (overall >= 85)
            insights.push('ביצועים מצוינים — מועמד להעלאת שכר');
        if (onTime < 70)
            insights.push('בעיית עמידה בזמנים — נדרש שיחה');
        if (attendance < 80)
            insights.push('אחוז נוכחות נמוך — בדוק מצב אישי');
        if (completion > 95)
            insights.push('אחוז השלמה גבוה — שקול תפקיד בכיר');
        if (overall < 50)
            insights.push('ביצועים נמוכים — תוכנית שיפור נדרשת');
        return insights;
    },
    // חבילת תגמול אטרקטיבית
    async designCompensationPackage(employeeId, currentSalary) {
        const score = await this.scoreContractor(employeeId);
        const packages = {
            base: {
                monthly_salary: currentSalary,
                description: 'שכר בסיס'
            },
            performance_bonus: {
                amount: score.bonus_recommendation,
                trigger: 'בונוס לפי ציון ביצועים חודשי',
                current_score: score.scores.overall
            },
            project_bonus: {
                pct: score.scores.overall >= 85 ? 2.5 : 1.5,
                trigger: 'אחוז מכל פרוייקט שהושלם בזמן',
                description: `${score.scores.overall >= 85 ? 2.5 : 1.5}% מערך הפרוייקט`
            },
            attendance_bonus: {
                amount: score.scores.attendance_rate >= 95 ? 800 : 400,
                trigger: 'בונוס נוכחות מלאה',
                current_rate: score.scores.attendance_rate
            },
            annual_bonus: {
                pct: score.tier === 'A' ? 12 : score.tier === 'B' ? 8 : 4,
                description: `${score.tier === 'A' ? 12 : score.tier === 'B' ? 8 : 4}% שכר שנתי`
            },
            total_estimated_monthly: Math.round(currentSalary +
                score.bonus_recommendation +
                (score.scores.overall >= 85 ? 800 : 400)),
            tier: score.tier,
            recommendation: score.tier === 'A'
                ? 'שכר אטרקטיבי ביותר — שמור עליו'
                : score.tier === 'D'
                    ? 'שיחת שיפור לפני כל שינוי שכר'
                    : 'חבילה סטנדרטית'
        };
        return packages;
    }
};
