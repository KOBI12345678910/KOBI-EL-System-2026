"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.goalsEngine = void 0;
const connection_1 = require("../../db/connection");
const websocket_1 = require("../../realtime/websocket");
// ════════════════════════════════════════════
// ENGINE 10: GOALS & OKR ENGINE
// מנוע יעדים ומטרות
// ════════════════════════════════════════════
exports.goalsEngine = {
    async setCompanyOKRs(quarter, year) {
        const [current] = await Promise.all([
            (0, connection_1.query)(`
        SELECT
          SUM(amount) FILTER (WHERE type IN ('income','advance') AND is_paid=true
            AND date >= date_trunc('quarter', CURRENT_DATE)) as q_revenue,
          COUNT(DISTINCT client_id) FILTER (WHERE date >= date_trunc('quarter', CURRENT_DATE)) as q_clients,
          AVG(amount) FILTER (WHERE type='income' AND is_paid=true) as avg_deal
        FROM financial_transactions
      `)
        ]);
        const curr = current.rows[0];
        const currentRevenue = parseFloat(curr?.q_revenue || '0');
        const okrs = {
            quarter, year,
            objectives: [
                {
                    id: 'O1',
                    title: 'הכנסות ורווחיות',
                    key_results: [
                        {
                            kr: 'KR1.1',
                            metric: 'הכנסות רבעוניות',
                            current: Math.round(currentRevenue),
                            target: Math.round(currentRevenue * 1.20),
                            unit: '₪',
                            progress: 0
                        },
                        {
                            kr: 'KR1.2',
                            metric: 'מרג\'ין גולמי',
                            current: 32,
                            target: 36,
                            unit: '%',
                            progress: 0
                        },
                        {
                            kr: 'KR1.3',
                            metric: 'ממוצע עסקה',
                            current: Math.round(parseFloat(curr?.avg_deal || '0')),
                            target: Math.round(parseFloat(curr?.avg_deal || '0') * 1.15),
                            unit: '₪',
                            progress: 0
                        }
                    ]
                },
                {
                    id: 'O2',
                    title: 'לקוחות ומכירות',
                    key_results: [
                        { kr: 'KR2.1', metric: 'לקוחות חדשים', current: 0, target: 8, unit: 'לקוחות', progress: 0 },
                        { kr: 'KR2.2', metric: 'שיעור המרת לידים', current: 35, target: 50, unit: '%', progress: 0 },
                        { kr: 'KR2.3', metric: 'NPS לקוחות', current: 0, target: 8, unit: '/10', progress: 0 }
                    ]
                },
                {
                    id: 'O3',
                    title: 'תפעול ויעילות',
                    key_results: [
                        { kr: 'KR3.1', metric: 'ניצולת מפעל', current: 65, target: 85, unit: '%', progress: 0 },
                        { kr: 'KR3.2', metric: 'הזמנות שנמסרו בזמן', current: 70, target: 90, unit: '%', progress: 0 },
                        { kr: 'KR3.3', metric: 'זמן מעסקה לייצור', current: 14, target: 7, unit: 'ימים', progress: 0, direction: 'down' }
                    ]
                },
                {
                    id: 'O4',
                    title: 'כוח אדם',
                    key_results: [
                        { kr: 'KR4.1', metric: 'שביעות רצון עובדים', current: 0, target: 8, unit: '/10', progress: 0 },
                        { kr: 'KR4.2', metric: 'תחלופת עובדים', current: 20, target: 10, unit: '%', progress: 0, direction: 'down' },
                        { kr: 'KR4.3', metric: 'שעות הכשרה', current: 0, target: 40, unit: 'שעות/עובד', progress: 0 }
                    ]
                }
            ]
        };
        await (0, connection_1.query)(`
      INSERT INTO company_goals (quarter, year, okrs, created_at)
      VALUES ($1,$2,$3,NOW())
      ON CONFLICT (quarter, year) DO UPDATE SET okrs=$3
    `, [quarter, year, JSON.stringify(okrs)]);
        return okrs;
    },
    async trackProgress(quarter, year) {
        const { rows: goals } = await (0, connection_1.query)(`
      SELECT okrs FROM company_goals WHERE quarter=$1 AND year=$2
    `, [quarter, year]);
        if (!goals[0])
            return null;
        const okrs = goals[0].okrs;
        const actuals = await this.calculateActuals();
        // עדכן התקדמות
        okrs.objectives.forEach((obj) => {
            obj.key_results.forEach((kr) => {
                const actual = actuals[kr.kr] || kr.current;
                const direction = kr.direction === 'down' ? -1 : 1;
                const progress = direction === 1
                    ? Math.min(100, Math.round((actual - kr.current) / (kr.target - kr.current) * 100))
                    : Math.min(100, Math.round((kr.current - actual) / (kr.current - kr.target) * 100));
                kr.actual = actual;
                kr.progress = Math.max(0, progress);
            });
            obj.progress = Math.round(obj.key_results.reduce((s, kr) => s + kr.progress, 0) / obj.key_results.length);
        });
        (0, websocket_1.broadcastToAll)('OKR_UPDATE', { quarter, year, okrs });
        return okrs;
    },
    async calculateActuals() {
        const { rows } = await (0, connection_1.query)(`
      SELECT
        SUM(ft.amount) FILTER (WHERE ft.type IN ('income','advance') AND ft.is_paid=true
          AND ft.date >= date_trunc('quarter', CURRENT_DATE)) as q_revenue,
        COUNT(DISTINCT wo.client_id) FILTER (
          WHERE wo.open_date >= date_trunc('quarter', CURRENT_DATE)
        ) as active_clients,
        COUNT(*) FILTER (WHERE wo.status='delivered'
          AND wo.delivered_date <= wo.delivery_date
          AND wo.open_date >= date_trunc('quarter', CURRENT_DATE)) * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE wo.status='delivered'
            AND wo.open_date >= date_trunc('quarter', CURRENT_DATE)), 0) as on_time_rate
      FROM financial_transactions ft
      CROSS JOIN work_orders wo
    `);
        const r = rows[0];
        return {
            'KR1.1': Math.round(parseFloat(r?.q_revenue || '0')),
            'KR2.1': parseInt(r?.active_clients || '0'),
            'KR3.2': Math.round(parseFloat(r?.on_time_rate || '0'))
        };
    }
};
