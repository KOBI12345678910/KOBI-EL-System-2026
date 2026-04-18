import { query } from '../../db/connection';
import { broadcastToAll } from '../../realtime/websocket';

// ════════════════════════════════════════════
// ENGINE 4: SALES AGENT ENGINE
// מנוע מודל לסוכני מכירות — יעדים + תמריצים
// ════════════════════════════════════════════

export const salesAgentEngine = {

  // יעדים חודשיים לסוכן
  async setMonthlyTargets(agentId: string, month: string) {
    const [history, pipeline] = await Promise.all([
      query(`
        SELECT
          AVG(monthly_revenue) as avg_monthly,
          MAX(monthly_revenue) as best_month,
          AVG(monthly_deals) as avg_deals,
          AVG(conversion_rate) as avg_conversion
        FROM (
          SELECT
            DATE_TRUNC('month', wo.open_date) as m,
            SUM(wo.price) as monthly_revenue,
            COUNT(*) as monthly_deals,
            COUNT(*) FILTER (WHERE wo.status='delivered') / NULLIF(COUNT(*)::float,0) as conversion_rate
          FROM work_orders wo
          JOIN leads l ON l.assigned_to=$1
          WHERE wo.client_id IN (SELECT id FROM clients WHERE 1=1)
          GROUP BY m
          ORDER BY m DESC LIMIT 6
        ) recent
      `, [agentId]),

      query(`
        SELECT COUNT(*) as open_leads, SUM(estimated_value) as pipeline_value
        FROM leads WHERE assigned_to=$1 AND status NOT IN ('won','lost')
      `, [agentId])
    ]);

    const hist = history.rows[0];
    const pipe = pipeline.rows[0];

    const avgMonthly = parseFloat(hist?.avg_monthly || '0');
    const growthTarget = 1.15; // 15% צמיחה

    const targets = {
      agent_id: agentId,
      month,
      revenue_target: Math.round(avgMonthly * growthTarget / 1000) * 1000,
      deals_target: Math.ceil(parseFloat(hist?.avg_deals || '3') * growthTarget),
      pipeline_target: Math.round(parseFloat(pipe?.pipeline_value || '0') * 1.2),
      new_leads_target: 15,
      conversion_target: Math.min(75, Math.round(parseFloat(hist?.avg_conversion || '0.5') * 110)),
      activity_targets: {
        calls_per_day: 8,
        meetings_per_week: 3,
        quotes_per_week: 5,
        follow_ups_per_day: 12
      },
      bonus_tiers: [
        { threshold: 0.8,  bonus_pct: 3,  label: 'בסיס' },
        { threshold: 1.0,  bonus_pct: 6,  label: 'יעד' },
        { threshold: 1.15, bonus_pct: 10, label: 'מצוין' },
        { threshold: 1.30, bonus_pct: 15, label: 'יוצא דופן' },
        { threshold: 1.50, bonus_pct: 22, label: 'מיתולוגי 🏆' }
      ]
    };

    await query(`
      INSERT INTO sales_targets (agent_id, month, targets, created_at)
      VALUES ($1,$2,$3,NOW())
      ON CONFLICT (agent_id, month) DO UPDATE SET targets=$3
    `, [agentId, month, JSON.stringify(targets)]);

    return targets;
  },

  // ניתוח ביצועי סוכן
  async analyzeAgentPerformance(agentId: string) {
    const { rows } = await query(`
      SELECT
        e.name, e.salary,
        COUNT(l.id) as total_leads,
        COUNT(l.id) FILTER (WHERE l.status='won') as won_leads,
        COUNT(l.id) FILTER (WHERE l.status='lost') as lost_leads,
        COUNT(l.id) FILTER (WHERE l.status NOT IN ('won','lost')) as open_leads,
        SUM(l.estimated_value) FILTER (WHERE l.status='won') as won_value,
        SUM(l.estimated_value) FILTER (WHERE l.created_at > NOW()-INTERVAL '30 days') as pipeline_30d,
        AVG(EXTRACT(EPOCH FROM (
          CASE WHEN l.status='won'
          THEN l.updated_at ELSE NOW() END - l.created_at))/86400) as avg_cycle_days
      FROM employees e
      LEFT JOIN leads l ON l.assigned_to=e.id
        AND l.created_at > NOW()-INTERVAL '90 days'
      WHERE e.id=$1
      GROUP BY e.id, e.name, e.salary
    `, [agentId]);

    const agent = rows[0];
    if (!agent) return null;

    const convRate = agent.total_leads > 0
      ? Math.round(parseInt(agent.won_leads) / parseInt(agent.total_leads) * 100) : 0;

    const wonValue = parseFloat(agent.won_value || '0');
    const salary = parseFloat(agent.salary || '0');
    const roi = salary > 0 ? Math.round(wonValue / (salary * 3) * 100) : 0;

    return {
      name: agent.name,
      conversion_rate: convRate,
      won_value: wonValue,
      open_pipeline: parseFloat(agent.pipeline_30d || '0'),
      avg_deal_cycle: Math.round(parseFloat(agent.avg_cycle_days || '0')),
      roi_pct: roi,
      score: Math.round(convRate * 0.4 + Math.min(100, roi * 0.4) + Math.min(100, parseFloat(agent.avg_cycle_days || '30') < 21 ? 100 : 50) * 0.2),
      funnel: {
        total: parseInt(agent.total_leads),
        won: parseInt(agent.won_leads),
        lost: parseInt(agent.lost_leads),
        open: parseInt(agent.open_leads)
      }
    };
  },

  // מעקב פעילות יומית
  async trackActivity(agentId: string, date: string) {
    const { rows } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE type='call') as calls,
        COUNT(*) FILTER (WHERE type='meeting') as meetings,
        COUNT(*) FILTER (WHERE type='quote') as quotes,
        COUNT(*) FILTER (WHERE type='follow_up') as follow_ups,
        COUNT(*) FILTER (WHERE type='demo') as demos
      FROM sales_activities
      WHERE agent_id=$1 AND DATE(created_at)=$2
    `, [agentId, date]);

    const activity = rows[0];

    return {
      date,
      activities: activity,
      score: Math.round(
        parseInt(activity.calls || '0') * 2 +
        parseInt(activity.meetings || '0') * 10 +
        parseInt(activity.quotes || '0') * 8 +
        parseInt(activity.follow_ups || '0') * 3
      )
    };
  }
};
