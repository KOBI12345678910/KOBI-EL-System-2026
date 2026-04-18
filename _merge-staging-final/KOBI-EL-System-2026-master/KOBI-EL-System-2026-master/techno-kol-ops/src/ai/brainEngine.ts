import cron from 'node-cron';
import { query } from '../db/connection';
import { broadcastToAll, broadcast } from '../realtime/websocket';
import { notificationService } from '../services/notifications';
import { projectPricingEngine } from './engines/pricingEngine';
import { materialCostEngine } from './engines/materialCostEngine';
import { riskEngine } from './engines/riskEngine';
import { fraudEngine } from './engines/fraudEngine';
import { payrollEngine } from './engines/payrollEngine';
import { goalsEngine } from './engines/goalsEngine';
import { growthEngine } from './engines/growthEngine';
import { employeeAnalyticsEngine } from './engines/employeeAnalyticsEngine';

// ════════════════════════════════════════════════════════════
//
//   TECHNO-KOL BRAIN ENGINE
//   המוח המרכזי — מנהל, מחליט, מזרים, פותר, מתריע
//
//   ארכיטקטורה:
//   ┌─────────────────────────────────────────┐
//   │           BRAIN ENGINE                  │
//   │  ┌──────────┐  ┌──────────┐             │
//   │  │ PERCEIVE │→ │  THINK   │             │
//   │  └──────────┘  └────┬─────┘             │
//   │                     ↓                   │
//   │  ┌──────────┐  ┌──────────┐             │
//   │  │   ACT    │← │  DECIDE  │             │
//   │  └──────────┘  └──────────┘             │
//   └─────────────────────────────────────────┘
//
// ════════════════════════════════════════════════════════════

interface BrainState {
  lastAnalysis: Date;
  activeProblems: Problem[];
  activeSolutions: Solution[];
  pendingActions: Action[];
  systemHealth: SystemHealth;
  dataFlows: DataFlow[];
  goals: Goal[];
  decisions: Decision[];
}

interface Problem {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  detected_at: Date;
  entity_type: string;
  entity_id?: string;
  resolved: boolean;
  resolution?: string;
  auto_resolved: boolean;
}

interface Solution {
  problem_id: string;
  action: string;
  executed: boolean;
  result?: string;
  executed_at?: Date;
}

interface Action {
  id: string;
  type: string;
  priority: number;
  payload: any;
  scheduled_at: Date;
  executed: boolean;
}

interface SystemHealth {
  score: number;
  status: 'healthy' | 'warning' | 'critical';
  modules: Record<string, { status: string; last_check: Date; score: number }>;
}

interface DataFlow {
  from: string;
  to: string;
  data_type: string;
  last_sync: Date;
  records_synced: number;
  status: 'ok' | 'stale' | 'error';
}

interface Goal {
  id: string;
  type: string;
  target: number;
  current: number;
  deadline: Date;
  owner: string;
  status: 'on_track' | 'at_risk' | 'behind' | 'achieved';
}

interface Decision {
  id: string;
  context: string;
  decision: string;
  reasoning: string;
  impact: string;
  executed_at: Date;
  outcome?: string;
}

// ── STATE
let brainState: BrainState = {
  lastAnalysis: new Date(),
  activeProblems: [],
  activeSolutions: [],
  pendingActions: [],
  systemHealth: {
    score: 100,
    status: 'healthy',
    modules: {}
  },
  dataFlows: [],
  goals: [],
  decisions: []
};

// ════════════════════════════════════════════
// MAIN BRAIN LOOP
// ════════════════════════════════════════════

export const brainEngine = {

  // ── BOOT
  async boot() {
    console.log(`
╔══════════════════════════════════════════╗
║       TECHNO-KOL BRAIN ENGINE v2.0      ║
║   Perceive → Think → Decide → Act       ║
╚══════════════════════════════════════════╝`);

    await this.initializeDataFlows();
    await this.loadGoals();
    await this.runFullCycle();

    this.scheduleAllJobs();
    console.log('[BRAIN] Boot complete. All systems nominal.');
  },

  // ── FULL INTELLIGENCE CYCLE
  async runFullCycle() {
    const cycleStart = Date.now();
    console.log('[BRAIN] Starting intelligence cycle...');

    try {
      // PHASE 1: PERCEIVE — אסוף נתונים מכל המערכת
      const perception = await this.perceive();

      // PHASE 2: THINK — נתח, זהה בעיות, מצא דפוסים
      const thoughts = await this.think(perception);

      // PHASE 3: DECIDE — קבל החלטות
      const decisions = await this.decide(thoughts);

      // PHASE 4: ACT — בצע פעולות
      const actions = await this.act(decisions);

      // PHASE 5: LEARN — למד מהתוצאות
      await this.learn(actions);

      // PHASE 6: COMMUNICATE — שדר לכל המערכת
      await this.communicate(perception, thoughts, decisions, actions);

      const duration = Date.now() - cycleStart;
      console.log(`[BRAIN] Cycle complete in ${duration}ms`);

      brainState.lastAnalysis = new Date();

      return { perception, thoughts, decisions, actions, duration };

    } catch (err) {
      console.error('[BRAIN] Cycle error:', err);
      await this.handleBrainError(err);
    }
  },

  // ════════════════════════════════════════════
  // PHASE 1: PERCEIVE
  // קלוט נתונים מכל מקורות המערכת
  // ════════════════════════════════════════════
  async perceive() {
    const [
      orders, projects, employees, materials,
      finance, alerts, gps, pipeline, leads
    ] = await Promise.all([
      this.perceiveOrders(),
      this.perceiveProjects(),
      this.perceiveEmployees(),
      this.percieveMaterials(),
      this.perceiveFinance(),
      this.perceiveAlerts(),
      this.perceiveGPS(),
      this.perceivePipeline(),
      this.perceiveLeads()
    ]);

    const perception = {
      timestamp: new Date(),
      orders, projects, employees, materials,
      finance, alerts, gps, pipeline, leads,
      system_health: await this.checkSystemHealth()
    };

    // שמור snapshot
    await query(`
      INSERT INTO brain_snapshots (data, created_at)
      VALUES ($1, NOW())
    `, [JSON.stringify(perception)]);

    return perception;
  },

  async perceiveOrders() {
    const { rows } = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='production') as in_production,
        COUNT(*) FILTER (WHERE status='pending') as pending,
        COUNT(*) FILTER (WHERE delivery_date < CURRENT_DATE AND status NOT IN ('delivered','cancelled')) as overdue,
        COUNT(*) FILTER (WHERE delivery_date = CURRENT_DATE AND status NOT IN ('delivered','cancelled')) as due_today,
        COUNT(*) FILTER (WHERE delivery_date = CURRENT_DATE + 1 AND status NOT IN ('delivered','cancelled')) as due_tomorrow,
        SUM(price) FILTER (WHERE status NOT IN ('delivered','cancelled')) as pipeline_value,
        AVG(progress) FILTER (WHERE status='production') as avg_progress,
        MAX(price) as biggest_order,
        COUNT(*) FILTER (WHERE cost_actual > price * 0.9) as margin_risk_orders
      FROM work_orders
    `);
    return rows[0];
  },

  async perceiveProjects() {
    const { rows } = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE current_stage='project_closed') as closed_this_month,
        COUNT(*) FILTER (WHERE current_stage NOT IN ('project_closed','deal_closed')) as active,
        COUNT(*) FILTER (WHERE installation_date = CURRENT_DATE) as installing_today,
        COUNT(*) FILTER (WHERE installation_date = CURRENT_DATE + 1) as installing_tomorrow,
        SUM(balance_due) FILTER (WHERE current_stage NOT IN ('project_closed')) as total_receivable,
        AVG(EXTRACT(EPOCH FROM (NOW()-created_at))/86400) FILTER (WHERE current_stage NOT IN ('project_closed','deal_closed')) as avg_days_in_pipeline,
        COUNT(*) FILTER (WHERE current_stage IN ('payment_requested','survey_sent') AND updated_at < NOW()-INTERVAL '7 days') as stuck_projects
      FROM projects
      WHERE created_at > NOW()-INTERVAL '6 months'
    `);
    return rows[0];
  },

  async perceiveEmployees() {
    const { rows } = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE location='factory') as in_factory,
        COUNT(*) FILTER (WHERE location='field') as in_field,
        COUNT(*) FILTER (WHERE location='sick') as sick,
        COUNT(*) FILTER (WHERE location='absent') as absent,
        COUNT(*) FILTER (WHERE location='vacation') as vacation,
        (SELECT COUNT(*) FROM approvals WHERE required_from_employee IS NOT NULL
          AND status='pending' AND deadline < NOW()) as overdue_approvals
      FROM (
        SELECT e.id,
          COALESCE(a.location, 'unknown') as location
        FROM employees e
        LEFT JOIN attendance a ON e.id=a.employee_id AND a.date=CURRENT_DATE
        WHERE e.is_active=true
      ) emp_status
    `);
    return rows[0];
  },

  async percieveMaterials() {
    const { rows } = await query(`
      SELECT
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE qty <= min_threshold) as below_threshold,
        COUNT(*) FILTER (WHERE qty <= min_threshold * 0.3) as critical,
        COUNT(*) FILTER (WHERE qty = 0) as out_of_stock,
        SUM(qty * cost_per_unit) as total_inventory_value,
        COUNT(*) FILTER (WHERE qty > max_stock * 0.9) as overstocked
      FROM material_items WHERE is_active=true
    `);
    return rows[0];
  },

  async perceiveFinance() {
    const { rows } = await query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE type IN ('income','advance') AND is_paid=true
          AND date >= date_trunc('month', CURRENT_DATE)), 0) as revenue_mtd,
        COALESCE(SUM(amount) FILTER (WHERE type IN ('income','advance') AND is_paid=true
          AND date >= date_trunc('month', CURRENT_DATE-INTERVAL '1 month')
          AND date < date_trunc('month', CURRENT_DATE)), 0) as revenue_last_month,
        COALESCE(SUM(amount) FILTER (WHERE type IN ('expense','salary','material_cost')
          AND date >= date_trunc('month', CURRENT_DATE)), 0) as costs_mtd,
        COALESCE(SUM(amount) FILTER (WHERE is_paid=false AND date < CURRENT_DATE), 0) as overdue_receivables,
        COUNT(*) FILTER (WHERE is_paid=false AND date < CURRENT_DATE-INTERVAL '30 days') as aged_invoices,
        COALESCE(SUM(amount) FILTER (WHERE type='salary' AND is_paid=false), 0) as unpaid_salaries
      FROM financial_transactions
    `);
    return rows[0];
  },

  async perceiveAlerts() {
    const { rows } = await query(`
      SELECT
        COUNT(*) as total_open,
        COUNT(*) FILTER (WHERE severity='critical') as critical,
        COUNT(*) FILTER (WHERE severity='danger') as danger,
        COUNT(*) FILTER (WHERE severity='warning') as warning,
        COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '1 hour') as new_last_hour,
        COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '24 hours') as new_last_day
      FROM alerts WHERE is_resolved=false
    `);
    return rows[0];
  },

  async perceiveGPS() {
    const { rows } = await query(`
      SELECT
        COUNT(*) as tracked_employees,
        COUNT(*) FILTER (WHERE status='active') as active_now,
        COUNT(*) FILTER (WHERE status='offline') as offline,
        COUNT(*) FILTER (WHERE last_seen < NOW()-INTERVAL '30 minutes') as lost_signal,
        AVG(battery_level) FILTER (WHERE status='active') as avg_battery,
        COUNT(*) FILTER (WHERE battery_level < 20 AND status='active') as low_battery
      FROM employee_current_location
    `);
    return rows[0];
  },

  async perceivePipeline() {
    const { rows } = await query(`
      SELECT current_stage, COUNT(*) as count,
        SUM(total_price) as value
      FROM projects
      WHERE current_stage NOT IN ('project_closed')
      GROUP BY current_stage
    `);
    return rows;
  },

  async perceiveLeads() {
    const { rows } = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='new') as new_leads,
        COUNT(*) FILTER (WHERE status='contacted') as contacted,
        COUNT(*) FILTER (WHERE status='won') as won_this_month,
        COUNT(*) FILTER (WHERE status='lost') as lost_this_month,
        SUM(estimated_value) FILTER (WHERE status NOT IN ('won','lost')) as pipeline_value,
        COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days' AND status='new') as uncontacted_week
      FROM leads
      WHERE created_at > date_trunc('month', CURRENT_DATE)
    `);
    return rows[0];
  },

  async checkSystemHealth() {
    const modules = {
      database: await this.checkDB(),
      gps: await this.checkGPS(),
      pipeline: await this.checkPipeline(),
      payroll: await this.checkPayroll(),
      alerts: await this.checkAlertSystem()
    };

    const scores = Object.values(modules).map((m: any) => m.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    brainState.systemHealth = {
      score: Math.round(avgScore),
      status: avgScore > 80 ? 'healthy' : avgScore > 50 ? 'warning' : 'critical',
      modules: modules as any
    };

    return brainState.systemHealth;
  },

  async checkDB() {
    try {
      const start = Date.now();
      await query('SELECT 1');
      const latency = Date.now() - start;
      return {
        status: latency < 100 ? 'ok' : 'slow',
        score: latency < 50 ? 100 : latency < 100 ? 85 : latency < 500 ? 60 : 30,
        latency_ms: latency
      };
    } catch {
      return { status: 'error', score: 0 };
    }
  },

  async checkGPS() {
    const { rows } = await query(`
      SELECT COUNT(*) as stale
      FROM employee_current_location
      WHERE last_seen < NOW()-INTERVAL '5 minutes' AND status='active'
    `);
    const stale = parseInt(rows[0]?.stale || '0');
    return { status: stale > 3 ? 'warning' : 'ok', score: Math.max(0, 100 - stale * 20), stale_count: stale };
  },

  async checkPipeline() {
    const { rows } = await query(`
      SELECT COUNT(*) as stuck
      FROM projects
      WHERE current_stage NOT IN ('project_closed','deal_closed')
        AND stage_updated_at < NOW()-INTERVAL '72 hours'
    `);
    const stuck = parseInt(rows[0]?.stuck || '0');
    return { status: stuck > 2 ? 'warning' : 'ok', score: Math.max(0, 100 - stuck * 15), stuck_projects: stuck };
  },

  async checkPayroll() {
    const { rows } = await query(`
      SELECT COUNT(*) as unpaid
      FROM financial_transactions
      WHERE type='salary' AND is_paid=false AND date < CURRENT_DATE
    `);
    const unpaid = parseInt(rows[0]?.unpaid || '0');
    return { status: unpaid > 0 ? 'warning' : 'ok', score: unpaid > 0 ? 60 : 100 };
  },

  async checkAlertSystem() {
    const { rows } = await query(`
      SELECT COUNT(*) as critical_open
      FROM alerts WHERE severity IN ('critical','danger') AND is_resolved=false
        AND created_at > NOW()-INTERVAL '24 hours'
    `);
    const critical = parseInt(rows[0]?.critical_open || '0');
    return { status: critical > 0 ? 'critical' : 'ok', score: Math.max(0, 100 - critical * 25) };
  },

  // ════════════════════════════════════════════
  // PHASE 2: THINK
  // נתח, זהה בעיות, מצא דפוסים
  // ════════════════════════════════════════════
  async think(perception: any) {
    const problems: Problem[] = [];
    const opportunities: any[] = [];
    const insights: any[] = [];

    // ── PROBLEMS DETECTION

    // 1. הזמנות מאוחרות קריטיות
    const overdueOrders = parseInt(perception.orders?.overdue || '0');
    if (overdueOrders > 0) {
      problems.push({
        id: `overdue_orders_${Date.now()}`,
        type: 'OPERATIONAL',
        severity: overdueOrders > 3 ? 'critical' : 'high',
        title: `${overdueOrders} הזמנות עברו מועד אספקה`,
        description: `לקוחות מחכים. סיכון לאובדן מוניטין ופיצויים.`,
        detected_at: new Date(),
        entity_type: 'orders',
        resolved: false,
        auto_resolved: false
      });
    }

    // 2. חומרי גלם קריטיים
    const criticalMaterials = parseInt(perception.materials?.critical || '0');
    const outOfStock = parseInt(perception.materials?.out_of_stock || '0');
    if (outOfStock > 0) {
      problems.push({
        id: `out_of_stock_${Date.now()}`,
        type: 'SUPPLY_CHAIN',
        severity: 'critical',
        title: `${outOfStock} פריטים חסרים לחלוטין במחסן`,
        description: 'עצירת ייצור אפשרית. נדרשת הזמנה דחופה.',
        detected_at: new Date(),
        entity_type: 'materials',
        resolved: false,
        auto_resolved: false
      });
    }

    // 3. תזרים שלילי
    const revenue = parseFloat(perception.finance?.revenue_mtd || '0');
    const costs = parseFloat(perception.finance?.costs_mtd || '0');
    if (costs > revenue * 1.1) {
      problems.push({
        id: `negative_cashflow_${Date.now()}`,
        type: 'FINANCIAL',
        severity: 'critical',
        title: 'הוצאות עולות על הכנסות החודש',
        description: `הכנסות: ₪${Math.round(revenue).toLocaleString('he-IL')} | הוצאות: ₪${Math.round(costs).toLocaleString('he-IL')}`,
        detected_at: new Date(),
        entity_type: 'finance',
        resolved: false,
        auto_resolved: false
      });
    }

    // 4. חובות ישנים
    const agedInvoices = parseInt(perception.finance?.aged_invoices || '0');
    if (agedInvoices > 2) {
      problems.push({
        id: `aged_invoices_${Date.now()}`,
        type: 'FINANCIAL',
        severity: 'high',
        title: `${agedInvoices} חשבוניות פתוחות מעל 30 יום`,
        description: `סכום: ₪${Math.round(parseFloat(perception.finance?.overdue_receivables || '0')).toLocaleString('he-IL')}`,
        detected_at: new Date(),
        entity_type: 'finance',
        resolved: false,
        auto_resolved: false
      });
    }

    // 5. עובדים חסרים
    const sickWorkers = parseInt(perception.employees?.sick || '0');
    const totalWorkers = parseInt(perception.employees?.total || '1');
    if (sickWorkers / totalWorkers > 0.2) {
      problems.push({
        id: `high_absence_${Date.now()}`,
        type: 'HR',
        severity: 'high',
        title: `${sickWorkers} עובדים חולים היום — ${Math.round(sickWorkers/totalWorkers*100)}% היעדרות`,
        description: 'ייתכן עומס יתר על שאר הצוות. שקול קבלן משנה.',
        detected_at: new Date(),
        entity_type: 'employees',
        resolved: false,
        auto_resolved: false
      });
    }

    // 6. פרוייקטים תקועים
    const stuckProjects = parseInt(perception.projects?.stuck_projects || '0');
    if (stuckProjects > 0) {
      problems.push({
        id: `stuck_projects_${Date.now()}`,
        type: 'PIPELINE',
        severity: 'high',
        title: `${stuckProjects} פרוייקטים תקועים ב-7+ ימים`,
        description: 'תשלומים תקועים. לקוחות מחכים.',
        detected_at: new Date(),
        entity_type: 'projects',
        resolved: false,
        auto_resolved: false
      });
    }

    // 7. לידים לא מטופלים
    const untouchedLeads = parseInt(perception.leads?.uncontacted_week || '0');
    if (untouchedLeads > 3) {
      problems.push({
        id: `untouched_leads_${Date.now()}`,
        type: 'SALES',
        severity: 'medium',
        title: `${untouchedLeads} לידים לא טופלו השבוע`,
        description: 'אובדן הכנסה פוטנציאלית. לידים קרים לאחר 48 שעות.',
        detected_at: new Date(),
        entity_type: 'leads',
        resolved: false,
        auto_resolved: false
      });
    }

    // 8. GPS אבד
    const lostSignal = parseInt(perception.gps?.lost_signal || '0');
    if (lostSignal > 0) {
      problems.push({
        id: `gps_lost_${Date.now()}`,
        type: 'OPERATIONAL',
        severity: 'medium',
        title: `${lostSignal} עובדים בשטח ללא GPS`,
        description: 'אי אפשר לנטר מיקום. בטיחות ותיאום לקויים.',
        detected_at: new Date(),
        entity_type: 'gps',
        resolved: false,
        auto_resolved: false
      });
    }

    // 9. סוללה נמוכה
    const lowBattery = parseInt(perception.gps?.low_battery || '0');
    if (lowBattery > 0) {
      problems.push({
        id: `low_battery_${Date.now()}`,
        type: 'OPERATIONAL',
        severity: 'low',
        title: `${lowBattery} עובדים עם סוללה מתחת 20%`,
        description: 'GPS עשוי לנתק בקרוב.',
        detected_at: new Date(),
        entity_type: 'gps',
        resolved: false,
        auto_resolved: false
      });
    }

    // 10. ניתוח מגמה — ירידה בהכנסות
    const revenueMTD = parseFloat(perception.finance?.revenue_mtd || '0');
    const revenueLastMonth = parseFloat(perception.finance?.revenue_last_month || '0');
    const daysInMonth = new Date().getDate();
    const projectedRevenue = (revenueMTD / daysInMonth) * 30;

    if (revenueLastMonth > 0 && projectedRevenue < revenueLastMonth * 0.8) {
      problems.push({
        id: `revenue_decline_${Date.now()}`,
        type: 'FINANCIAL',
        severity: 'high',
        title: 'תחזית הכנסות מתחת לחודש שעבר ב-20%+',
        description: `תחזית: ₪${Math.round(projectedRevenue).toLocaleString('he-IL')} | חודש שעבר: ₪${Math.round(revenueLastMonth).toLocaleString('he-IL')}`,
        detected_at: new Date(),
        entity_type: 'finance',
        resolved: false,
        auto_resolved: false
      });
    }

    // ── OPPORTUNITIES DETECTION

    // לקוחות שלא הזמינו זמן
    const { rows: churnRisk } = await query(`
      SELECT c.name, c.phone, MAX(wo.open_date) as last_order,
        EXTRACT(DAY FROM NOW()-MAX(wo.open_date)) as days_since,
        COUNT(wo.id) as total_orders
      FROM clients c JOIN work_orders wo ON c.id=wo.client_id
      WHERE c.is_active=true GROUP BY c.id, c.name, c.phone
      HAVING MAX(wo.open_date) < NOW()-INTERVAL '60 days'
        AND COUNT(wo.id) >= 2
      ORDER BY days_since ASC LIMIT 5
    `);

    churnRisk.forEach((c: any) => {
      opportunities.push({
        type: 'REACTIVATE_CLIENT',
        title: `לקוח לא פעיל — ${c.name}`,
        description: `${Math.round(c.days_since)} ימים ללא הזמנה | ${c.total_orders} הזמנות היסטוריה`,
        action: 'SEND_REACTIVATION_MESSAGE',
        payload: { client_name: c.name, phone: c.phone, days_since: c.days_since },
        value: 'MEDIUM'
      });
    });

    // פרוייקטים קרובים לסיום שצריך לגבות
    const { rows: nearComplete } = await query(`
      SELECT p.id, p.title, p.balance_due, c.name as client_name, c.phone
      FROM projects p JOIN clients c ON p.client_id=c.id
      WHERE p.current_stage='installation_done'
        AND p.balance_due > 0
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.project_id=p.id AND n.template='PAYMENT_REQUEST'
            AND n.created_at > NOW()-INTERVAL '3 days'
        )
    `);

    nearComplete.forEach((p: any) => {
      opportunities.push({
        type: 'COLLECT_PAYMENT',
        title: `תשלום לגבייה — ${p.title}`,
        description: `₪${Math.round(parseFloat(p.balance_due)).toLocaleString('he-IL')} מחכה`,
        action: 'SEND_PAYMENT_REMINDER',
        payload: { project_id: p.id, client_name: p.client_name, phone: p.phone, amount: p.balance_due },
        value: 'HIGH'
      });
    });

    // ── INSIGHTS
    const monthGrowth = revenueLastMonth > 0
      ? Math.round((revenueMTD - revenueLastMonth) / revenueLastMonth * 100) : 0;

    insights.push({
      type: 'PERFORMANCE',
      title: `הכנסות החודש ${monthGrowth >= 0 ? 'עלו' : 'ירדו'} ב-${Math.abs(monthGrowth)}% לעומת החודש שעבר`,
      data: { current: revenueMTD, previous: revenueLastMonth, change_pct: monthGrowth }
    });

    const utilizationPct = Math.round(
      parseInt(perception.orders?.in_production || '0') / 12 * 100
    );

    insights.push({
      type: 'CAPACITY',
      title: `ניצולת מפעל: ${utilizationPct}%`,
      data: { utilization: utilizationPct, optimal: 75 }
    });

    brainState.activeProblems = problems;

    return { problems, opportunities, insights };
  },

  // ════════════════════════════════════════════
  // PHASE 3: DECIDE
  // קבל החלטות אוטומטיות
  // ════════════════════════════════════════════
  async decide(thoughts: any) {
    const decisions: Decision[] = [];
    const actions: Action[] = [];

    for (const problem of thoughts.problems) {
      const solution = await this.solveAutomatically(problem);
      if (solution) {
        decisions.push({
          id: `decision_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          context: problem.title,
          decision: solution.action,
          reasoning: solution.reasoning,
          impact: solution.impact,
          executed_at: new Date()
        });
        actions.push(...solution.actions);
      }
    }

    for (const opportunity of thoughts.opportunities) {
      const action = await this.capitalizeOpportunity(opportunity);
      if (action) actions.push(action);
    }

    brainState.decisions.push(...decisions);
    brainState.pendingActions.push(...actions);

    return { decisions, actions };
  },

  async solveAutomatically(problem: Problem): Promise<{
    action: string;
    reasoning: string;
    impact: string;
    actions: Action[];
  } | null> {

    switch (problem.type) {

      case 'SUPPLY_CHAIN':
        // הזמן חומרים אוטומטית
        const { rows: critItems } = await query(`
          SELECT mi.*, s.name as supplier_name, s.phone as supplier_phone
          FROM material_items mi
          LEFT JOIN suppliers s ON mi.supplier_id=s.id
          WHERE mi.qty <= mi.min_threshold*0.3 AND mi.is_active=true
        `);

        return {
          action: 'AUTO_ORDER_MATERIALS',
          reasoning: 'חומרים קריטיים — הזמנה אוטומטית נדרשת',
          impact: 'מונע עצירת ייצור',
          actions: critItems.map((item: any) => ({
            id: `action_order_${item.id}`,
            type: 'ORDER_MATERIAL',
            priority: 1,
            payload: {
              item_id: item.id,
              item_name: item.name,
              qty: item.min_threshold * 3,
              supplier: item.supplier_name,
              supplier_phone: item.supplier_phone
            },
            scheduled_at: new Date(),
            executed: false
          }))
        };

      case 'FINANCIAL':
        if (problem.id.includes('aged_invoices')) {
          const { rows: overdueClients } = await query(`
            SELECT DISTINCT c.id, c.name, c.phone,
              SUM(ft.amount) as amount_due
            FROM financial_transactions ft
            JOIN clients c ON ft.client_id=c.id
            WHERE ft.is_paid=false AND ft.date < CURRENT_DATE-INTERVAL '30 days'
              AND ft.type IN ('income','advance')
            GROUP BY c.id, c.name, c.phone
          `);

          return {
            action: 'SEND_PAYMENT_REMINDERS',
            reasoning: 'חשבוניות ישנות — שלח תזכורות תשלום',
            impact: 'גביית חובות ושיפור תזרים',
            actions: overdueClients.map((c: any) => ({
              id: `action_remind_${c.id}`,
              type: 'SEND_PAYMENT_REMINDER',
              priority: 2,
              payload: { client_id: c.id, name: c.name, phone: c.phone, amount: c.amount_due },
              scheduled_at: new Date(),
              executed: false
            }))
          };
        }
        return null;

      case 'SALES':
        if (problem.id.includes('untouched_leads')) {
          const { rows: coldLeads } = await query(`
            SELECT l.*, e.name as agent_name, e.phone as agent_phone
            FROM leads l
            LEFT JOIN employees e ON l.assigned_to=e.id
            WHERE l.status='new'
              AND l.created_at < NOW()-INTERVAL '24 hours'
              AND l.created_at > NOW()-INTERVAL '7 days'
            ORDER BY l.estimated_value DESC LIMIT 10
          `);

          return {
            action: 'ALERT_SALES_AGENTS',
            reasoning: 'לידים לא מטופלים — התרע לסוכנים',
            impact: 'מניעת אובדן לידים',
            actions: [{
              id: `action_leads_${Date.now()}`,
              type: 'NOTIFY_AGENTS_COLD_LEADS',
              priority: 2,
              payload: { leads: coldLeads },
              scheduled_at: new Date(),
              executed: false
            }]
          };
        }
        return null;

      case 'PIPELINE':
        const { rows: stuckProjects } = await query(`
          SELECT p.*, c.name as client_name
          FROM projects p JOIN clients c ON p.client_id=c.id
          WHERE p.current_stage NOT IN ('project_closed','deal_closed')
            AND p.stage_updated_at < NOW()-INTERVAL '7 days'
        `);

        return {
          action: 'ESCALATE_STUCK_PROJECTS',
          reasoning: 'פרוייקטים תקועים — הסלמה למנהלת',
          impact: 'פתיחת צווארי בקבוק',
          actions: stuckProjects.map((p: any) => ({
            id: `action_stuck_${p.id}`,
            type: 'ESCALATE_PROJECT',
            priority: 2,
            payload: {
              project_id: p.id,
              title: p.title,
              stage: p.current_stage,
              days_stuck: Math.floor((Date.now() - new Date(p.stage_updated_at).getTime()) / 86400000),
              client: p.client_name
            },
            scheduled_at: new Date(),
            executed: false
          }))
        };

      default:
        return null;
    }
  },

  async capitalizeOpportunity(opportunity: any): Promise<Action | null> {
    if (opportunity.action === 'SEND_PAYMENT_REMINDER') {
      return {
        id: `action_collect_${Date.now()}`,
        type: 'SEND_PAYMENT_REMINDER',
        priority: 1,
        payload: opportunity.payload,
        scheduled_at: new Date(),
        executed: false
      };
    }

    if (opportunity.action === 'SEND_REACTIVATION_MESSAGE') {
      return {
        id: `action_reactivate_${Date.now()}`,
        type: 'REACTIVATE_CLIENT',
        priority: 3,
        payload: opportunity.payload,
        scheduled_at: new Date(),
        executed: false
      };
    }

    return null;
  },

  // ════════════════════════════════════════════
  // PHASE 4: ACT
  // בצע פעולות אוטומטיות
  // ════════════════════════════════════════════
  async act(decisionResult: any) {
    const results: any[] = [];
    const actions = decisionResult.actions || [];

    // מיין לפי עדיפות
    const sorted = [...actions].sort((a, b) => a.priority - b.priority);

    for (const action of sorted) {
      try {
        const result = await this.executeAction(action);
        action.executed = true;
        results.push({ action_id: action.id, type: action.type, result, success: true });
      } catch (err: any) {
        results.push({ action_id: action.id, type: action.type, error: err.message, success: false });
      }
    }

    return results;
  },

  async executeAction(action: Action) {
    switch (action.type) {

      case 'ORDER_MATERIAL':
        // לוג הזמנה + התראה למנהל
        await query(`
          INSERT INTO alerts (type, severity, title, message, entity_type)
          VALUES ('material_order_needed', 'warning', $1, $2, 'material')
        `, [
          `הזמנת חומר אוטומטית — ${action.payload.item_name}`,
          `כמות: ${action.payload.qty} | ספק: ${action.payload.supplier}`
        ]);

        // שלח WhatsApp לספק (בפרודקשן)
        console.log(`[ACTION] Order material: ${action.payload.item_name} from ${action.payload.supplier}`);
        return { ordered: action.payload.item_name, qty: action.payload.qty };

      case 'SEND_PAYMENT_REMINDER':
        // שלח תזכורת תשלום
        await query(`
          INSERT INTO notifications (recipient_type, recipient_client_id, channel, template, content, status)
          VALUES ('client', $1, 'whatsapp', 'PAYMENT_REMINDER',
            $2, 'sent')
        `, [
          action.payload.client_id,
          `שלום ${action.payload.name}! יש לנו חשבונית פתוחה על סך ₪${Math.round(action.payload.amount).toLocaleString('he-IL')}. נשמח לסגור. 📞`
        ]);
        console.log(`[ACTION] Payment reminder → ${action.payload.name}: ₪${action.payload.amount}`);
        return { reminded: action.payload.name, amount: action.payload.amount };

      case 'REACTIVATE_CLIENT':
        await query(`
          INSERT INTO notifications (recipient_type, recipient_client_id, channel, template, content, status)
          SELECT 'client', c.id, 'whatsapp', 'REACTIVATION',
            $2, 'sent'
          FROM clients c WHERE c.name=$1
        `, [
          action.payload.client_name,
          `שלום ${action.payload.client_name}! זמן רב לא נשמענו 😊 יש לנו הצעות מיוחדות לעבודות ברזל ואלומיניום. נשמח לחזור ולשתף פעולה! טכנו-קול ✨`
        ]);
        return { reactivated: action.payload.client_name };

      case 'NOTIFY_AGENTS_COLD_LEADS':
        broadcastToAll('COLD_LEADS_ALERT', {
          title: 'לידים קרים — פעולה נדרשת',
          leads: action.payload.leads?.length,
          message: 'יש לידים שלא טופלו מעל 24 שעות'
        });
        return { notified: true, leads_count: action.payload.leads?.length };

      case 'ESCALATE_PROJECT':
        broadcastToAll('PROJECT_ESCALATED', {
          project_id: action.payload.project_id,
          title: action.payload.title,
          days_stuck: action.payload.days_stuck,
          client: action.payload.client,
          stage: action.payload.stage
        });

        await query(`
          INSERT INTO alerts (type, severity, title, message, entity_type, entity_id)
          VALUES ('project_stuck', 'danger', $1, $2, 'project', $3)
          ON CONFLICT DO NOTHING
        `, [
          `פרוייקט תקוע — ${action.payload.title}`,
          `${action.payload.days_stuck} ימים בשלב "${action.payload.stage}" | לקוח: ${action.payload.client}`,
          action.payload.project_id
        ]);
        return { escalated: action.payload.project_id };

      default:
        console.log(`[ACTION] Unknown action type: ${action.type}`);
        return { skipped: true };
    }
  },

  // ════════════════════════════════════════════
  // PHASE 5: LEARN
  // למד מהתוצאות
  // ════════════════════════════════════════════
  async learn(actionResults: any[]) {
    const successful = actionResults.filter(r => r.success).length;
    const failed = actionResults.filter(r => !r.success).length;

    await query(`
      INSERT INTO brain_learning_log
        (cycle_date, actions_taken, successful, failed, problems_detected, created_at)
      VALUES (CURRENT_DATE, $1, $2, $3, $4, NOW())
    `, [
      actionResults.length, successful, failed,
      brainState.activeProblems.length
    ]);

    // עדכן ביצועי מנוע
    if (failed > successful) {
      console.warn('[BRAIN] High failure rate — reviewing action strategies');
    }
  },

  // ════════════════════════════════════════════
  // PHASE 6: COMMUNICATE
  // שדר לכל המערכת
  // ════════════════════════════════════════════
  async communicate(perception: any, thoughts: any, decisions: any, actions: any[]) {
    const summary = {
      timestamp: new Date().toISOString(),
      system_health: brainState.systemHealth,
      problems_detected: thoughts.problems.length,
      critical_problems: thoughts.problems.filter((p: Problem) => p.severity === 'critical').length,
      actions_taken: actions.filter(a => a.success).length,
      opportunities: thoughts.opportunities.length,
      insights: thoughts.insights,

      // KPIs
      kpis: {
        revenue_mtd: Math.round(parseFloat(perception.finance?.revenue_mtd || '0')),
        orders_overdue: parseInt(perception.orders?.overdue || '0'),
        employees_present: parseInt(perception.employees?.in_factory || '0') + parseInt(perception.employees?.in_field || '0'),
        materials_critical: parseInt(perception.materials?.critical || '0'),
        pipeline_value: Math.round(parseFloat(perception.orders?.pipeline_value || '0')),
        leads_new: parseInt(perception.leads?.new_leads || '0')
      },

      // TOP PROBLEMS
      top_problems: thoughts.problems
        .sort((a: Problem, b: Problem) => {
          const order = { critical: 0, high: 1, medium: 2, low: 3 };
          return order[a.severity] - order[b.severity];
        })
        .slice(0, 5),

      // GOALS STATUS
      goals: await this.getGoalsStatus(),

      // TODAY'S AGENDA
      agenda: await this.buildDailyAgenda()
    };

    // שדר לכל המחוברים
    broadcastToAll('BRAIN_UPDATE', summary);

    // שמור דוח
    await query(`
      INSERT INTO brain_reports (report_data, created_at)
      VALUES ($1, NOW())
    `, [JSON.stringify(summary)]);

    return summary;
  },

  // ════════════════════════════════════════════
  // DATA FLOW MANAGER
  // מנהל זרימת נתונים בין מודולים
  // ════════════════════════════════════════════
  async initializeDataFlows() {
    brainState.dataFlows = [
      { from: 'work_orders', to: 'financial_transactions', data_type: 'revenue', last_sync: new Date(), records_synced: 0, status: 'ok' },
      { from: 'attendance', to: 'payroll_runs', data_type: 'hours', last_sync: new Date(), records_synced: 0, status: 'ok' },
      { from: 'gps_locations', to: 'employee_current_location', data_type: 'position', last_sync: new Date(), records_synced: 0, status: 'ok' },
      { from: 'tasks', to: 'pipeline_events', data_type: 'completion', last_sync: new Date(), records_synced: 0, status: 'ok' },
      { from: 'material_movements', to: 'alerts', data_type: 'inventory', last_sync: new Date(), records_synced: 0, status: 'ok' },
      { from: 'leads', to: 'work_orders', data_type: 'conversion', last_sync: new Date(), records_synced: 0, status: 'ok' },
    ];

    console.log(`[BRAIN] ${brainState.dataFlows.length} data flows initialized`);
  },

  async syncDataFlows() {
    for (const flow of brainState.dataFlows) {
      try {
        const synced = await this.syncFlow(flow);
        flow.last_sync = new Date();
        flow.records_synced = synced;
        flow.status = 'ok';
      } catch {
        flow.status = 'error';
      }
    }
  },

  async syncFlow(flow: DataFlow): Promise<number> {
    switch (`${flow.from}_${flow.to}`) {
      case 'work_orders_financial_transactions':
        // סנכרן הכנסות מהזמנות שנמסרו
        const { rowCount } = await query(`
          INSERT INTO financial_transactions (order_id, client_id, type, amount, date)
          SELECT wo.id, wo.client_id, 'income',
            wo.price - COALESCE(wo.advance_paid, 0),
            CURRENT_DATE
          FROM work_orders wo
          WHERE wo.status='delivered'
            AND NOT EXISTS (
              SELECT 1 FROM financial_transactions ft
              WHERE ft.order_id=wo.id AND ft.type='income'
            )
        `);
        return rowCount || 0;

      case 'material_movements_alerts':
        // צור התראות אוטומטיות למלאי נמוך
        const { rowCount: alertCount } = await query(`
          INSERT INTO alerts (type, severity, title, message, entity_type, entity_id)
          SELECT 'material_low',
            CASE WHEN qty <= min_threshold*0.2 THEN 'critical'
                 WHEN qty <= min_threshold*0.5 THEN 'danger'
                 ELSE 'warning' END,
            'מלאי נמוך — ' || name,
            'נותרו ' || qty || ' ' || unit,
            'material', id::TEXT
          FROM material_items
          WHERE qty <= min_threshold AND is_active=true
            AND NOT EXISTS (
              SELECT 1 FROM alerts a
              WHERE a.entity_id=id::TEXT
                AND a.type='material_low'
                AND a.is_resolved=false
                AND a.created_at > NOW()-INTERVAL '24 hours'
            )
        `);
        return alertCount || 0;

      default:
        return 0;
    }
  },

  // ════════════════════════════════════════════
  // GOALS ENGINE
  // ════════════════════════════════════════════
  async loadGoals() {
    const now = new Date();
    const quarter = `Q${Math.ceil((now.getMonth() + 1) / 3)}`;

    try {
      await goalsEngine.setCompanyOKRs(quarter, now.getFullYear());
    } catch {}

    const monthlyRevTarget = await this.calculateMonthlyTarget();

    brainState.goals = [
      {
        id: 'G_REVENUE_MONTH',
        type: 'REVENUE',
        target: monthlyRevTarget,
        current: 0,
        deadline: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        owner: 'company',
        status: 'on_track'
      },
      {
        id: 'G_ORDERS_ONTIME',
        type: 'DELIVERY',
        target: 90,
        current: 0,
        deadline: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        owner: 'production',
        status: 'on_track'
      },
      {
        id: 'G_LEADS_CONVERSION',
        type: 'SALES',
        target: 50,
        current: 0,
        deadline: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        owner: 'sales',
        status: 'on_track'
      }
    ];

    console.log(`[BRAIN] ${brainState.goals.length} goals loaded`);
  },

  async calculateMonthlyTarget(): Promise<number> {
    const { rows } = await query(`
      SELECT AVG(monthly_rev) * 1.15 as target
      FROM (
        SELECT DATE_TRUNC('month', date) as m,
          SUM(amount) as monthly_rev
        FROM financial_transactions
        WHERE type IN ('income','advance') AND is_paid=true
          AND date > NOW()-INTERVAL '6 months'
        GROUP BY m
      ) monthly
    `);
    return Math.round(parseFloat(rows[0]?.target || '300000') / 10000) * 10000;
  },

  async getGoalsStatus() {
    const { rows } = await query(`
      SELECT
        SUM(amount) FILTER (WHERE type IN ('income','advance') AND is_paid=true
          AND date >= date_trunc('month', CURRENT_DATE)) as revenue_mtd,
        COUNT(*) FILTER (WHERE status='delivered' AND delivered_date <= delivery_date
          AND open_date >= date_trunc('month', CURRENT_DATE)) * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE status='delivered'
            AND open_date >= date_trunc('month', CURRENT_DATE)), 0) as on_time_rate,
        COUNT(*) FILTER (WHERE status='won'
          AND created_at >= date_trunc('month', CURRENT_DATE)) * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)), 0) as conversion_rate
      FROM financial_transactions
      CROSS JOIN work_orders
      CROSS JOIN leads
    `);

    const r = rows[0];
    return brainState.goals.map(goal => ({
      ...goal,
      current: goal.type === 'REVENUE' ? Math.round(parseFloat(r?.revenue_mtd || '0')) :
               goal.type === 'DELIVERY' ? Math.round(parseFloat(r?.on_time_rate || '0')) :
               Math.round(parseFloat(r?.conversion_rate || '0')),
      progress_pct: goal.type === 'REVENUE'
        ? Math.round(parseFloat(r?.revenue_mtd || '0') / goal.target * 100)
        : Math.round(parseFloat(r?.on_time_rate || goal.target.toString()) / goal.target * 100)
    }));
  },

  // ════════════════════════════════════════════
  // DAILY AGENDA
  // ════════════════════════════════════════════
  async buildDailyAgenda() {
    const [tasksToday, installationsToday, materialsToOrder, pendingApprovals] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM tasks WHERE scheduled_date=CURRENT_DATE`),
      query(`SELECT COUNT(*) as count FROM projects WHERE installation_date=CURRENT_DATE`),
      query(`SELECT COUNT(*) as count FROM material_items WHERE qty<=min_threshold AND is_active=true`),
      query(`SELECT COUNT(*) as count FROM approvals WHERE status='pending' AND deadline < NOW()+INTERVAL '24 hours'`)
    ]);

    return {
      tasks_today: parseInt(tasksToday.rows[0]?.count || '0'),
      installations_today: parseInt(installationsToday.rows[0]?.count || '0'),
      materials_to_order: parseInt(materialsToOrder.rows[0]?.count || '0'),
      pending_approvals: parseInt(pendingApprovals.rows[0]?.count || '0'),
      priorities: await this.getPriorities()
    };
  },

  async getPriorities(): Promise<string[]> {
    const priorities: string[] = [];
    const problems = brainState.activeProblems;

    const critical = problems.filter(p => p.severity === 'critical');
    const high = problems.filter(p => p.severity === 'high');

    critical.forEach(p => priorities.push(`🔴 ${p.title}`));
    high.slice(0, 3).forEach(p => priorities.push(`🟠 ${p.title}`));

    if (priorities.length === 0) priorities.push('✅ כל המערכות תקינות');

    return priorities;
  },

  // ════════════════════════════════════════════
  // SCHEDULER
  // ════════════════════════════════════════════
  scheduleAllJobs() {

    // ── כל דקה: GPS + נוכחות
    cron.schedule('* * * * *', async () => {
      await this.syncDataFlows();
    });

    // ── כל 5 דקות: מחזור מלא
    cron.schedule('*/5 * * * *', async () => {
      await this.runFullCycle();
    });

    // ── כל 30 דקות: דוח מנהלת
    cron.schedule('*/30 * * * *', async () => {
      await this.generateManagerReport();
    });

    // ── כל שעה: סינכרון יעדים
    cron.schedule('0 * * * *', async () => {
      await this.syncGoals();
    });

    // ── כל בוקר 06:30: בריפינג יומי
    cron.schedule('30 6 * * 0-5', async () => {
      await this.sendDailyBriefing();
    });

    // ── כל יום 12:00: דוח אמצע יום
    cron.schedule('0 12 * * 0-5', async () => {
      await this.sendMidDayReport();
    });

    // ── כל יום 17:00: סיכום יומי
    cron.schedule('0 17 * * 0-5', async () => {
      await this.sendEndOfDayReport();
    });

    // ── ראשון כל שבוע 08:00: דוח שבועי
    cron.schedule('0 8 * * 0', async () => {
      await this.sendWeeklyReport();
    });

    // ── 1 לחודש: שכר + יעדים חדשים
    cron.schedule('0 7 1 * *', async () => {
      await this.runMonthlyClose();
    });

    console.log('[BRAIN] All jobs scheduled');
  },

  // ════════════════════════════════════════════
  // REPORTS
  // ════════════════════════════════════════════
  async generateManagerReport() {
    const snapshot = await this.runFullCycle();
    broadcastToAll('MANAGER_REPORT', {
      type: 'PERIODIC',
      timestamp: new Date().toISOString(),
      data: snapshot
    });
  },

  async sendDailyBriefing() {
    const [revenue, tasks, orders, materials] = await Promise.all([
      query(`SELECT COALESCE(SUM(amount),0) as mtd FROM financial_transactions WHERE type IN ('income','advance') AND is_paid=true AND date>=date_trunc('month',CURRENT_DATE)`),
      query(`SELECT COUNT(*) as count FROM tasks WHERE scheduled_date=CURRENT_DATE`),
      query(`SELECT COUNT(*) as overdue FROM work_orders WHERE delivery_date<CURRENT_DATE AND status NOT IN ('delivered','cancelled')`),
      query(`SELECT COUNT(*) as critical FROM material_items WHERE qty<=min_threshold*0.3 AND is_active=true`)
    ]);

    const briefing = {
      type: 'MORNING_BRIEFING',
      time: '06:30',
      date: new Date().toLocaleDateString('he-IL'),
      revenue_mtd: Math.round(parseFloat(revenue.rows[0]?.mtd || '0')),
      tasks_today: parseInt(tasks.rows[0]?.count || '0'),
      overdue_orders: parseInt(orders.rows[0]?.overdue || '0'),
      critical_materials: parseInt(materials.rows[0]?.critical || '0'),
      priorities: await this.getPriorities(),
      goals: await this.getGoalsStatus()
    };

    broadcastToAll('DAILY_BRIEFING', briefing);

    // WhatsApp לקובי
    console.log(`[BRAIN] Morning briefing sent: ${JSON.stringify(briefing)}`);
    return briefing;
  },

  async sendMidDayReport() {
    const snapshot = await this.perceive();
    broadcastToAll('MIDDAY_REPORT', {
      type: 'MIDDAY',
      timestamp: new Date().toISOString(),
      employees_field: snapshot.employees?.in_field,
      tasks_completed: 0,
      revenue_today: Math.round(parseFloat(snapshot.finance?.revenue_mtd || '0')),
      problems: brainState.activeProblems.filter(p => !p.resolved).length
    });
  },

  async sendEndOfDayReport() {
    const [tasksCompleted, ordersAdvanced, alertsResolved] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM tasks WHERE scheduled_date=CURRENT_DATE AND status='done'`),
      query(`SELECT COUNT(*) as count FROM pipeline_events WHERE DATE(created_at)=CURRENT_DATE`),
      query(`SELECT COUNT(*) as count FROM alerts WHERE DATE(resolved_at)=CURRENT_DATE`)
    ]);

    broadcastToAll('EOD_REPORT', {
      type: 'END_OF_DAY',
      date: new Date().toLocaleDateString('he-IL'),
      tasks_completed: parseInt(tasksCompleted.rows[0]?.count || '0'),
      pipeline_advances: parseInt(ordersAdvanced.rows[0]?.count || '0'),
      alerts_resolved: parseInt(alertsResolved.rows[0]?.count || '0'),
      problems_open: brainState.activeProblems.filter(p => !p.resolved).length,
      system_health: brainState.systemHealth.score,
      decisions_today: brainState.decisions.length
    });
  },

  async sendWeeklyReport() {
    const [revenue, topClients, performance] = await Promise.all([
      query(`
        SELECT
          SUM(amount) FILTER (WHERE date >= CURRENT_DATE-7) as week_revenue,
          SUM(amount) FILTER (WHERE date >= CURRENT_DATE-14 AND date < CURRENT_DATE-7) as prev_week
        FROM financial_transactions WHERE type IN ('income','advance') AND is_paid=true
      `),
      query(`
        SELECT c.name, SUM(wo.price) as revenue
        FROM work_orders wo JOIN clients c ON wo.client_id=c.id
        WHERE wo.open_date >= CURRENT_DATE-7
        GROUP BY c.id, c.name ORDER BY revenue DESC LIMIT 5
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status='done') as done,
          COUNT(*) FILTER (WHERE status='done' AND completed_at<=scheduled_date::TIMESTAMP+INTERVAL '2 hours') as on_time
        FROM tasks WHERE scheduled_date >= CURRENT_DATE-7
      `)
    ]);

    const r = revenue.rows[0];
    const weekRevenue = parseFloat(r?.week_revenue || '0');
    const prevWeekRevenue = parseFloat(r?.prev_week || '0');
    const weekGrowth = prevWeekRevenue > 0
      ? Math.round((weekRevenue - prevWeekRevenue) / prevWeekRevenue * 100) : 0;

    broadcastToAll('WEEKLY_REPORT', {
      type: 'WEEKLY',
      week_ending: new Date().toLocaleDateString('he-IL'),
      revenue: Math.round(weekRevenue),
      revenue_growth: weekGrowth,
      top_clients: topClients.rows,
      tasks_done: parseInt(performance.rows[0]?.done || '0'),
      on_time_rate: performance.rows[0]?.done > 0
        ? Math.round(parseInt(performance.rows[0]?.on_time) / parseInt(performance.rows[0]?.done) * 100) : 0,
      insights: await growthEngine.analyzeGrowthOpportunities()
    });
  },

  async runMonthlyClose() {
    const now = new Date();
    const month = String(now.getMonth()).padStart(2, '0') || '12';
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    await payrollEngine.calculateMonthlyPayroll(month, year);

    const quarter = `Q${Math.ceil((now.getMonth() + 1) / 3)}`;
    await goalsEngine.setCompanyOKRs(quarter, now.getFullYear());

    broadcastToAll('MONTHLY_CLOSE', {
      month, year,
      message: 'חישוב שכר הושלם. יעדים חדשים נקבעו.'
    });
  },

  async syncGoals() {
    const goals = await this.getGoalsStatus();
    const atRisk = goals.filter((g: any) =>
      g.progress_pct < (new Date().getDate() / 30 * 100) * 0.8
    );

    if (atRisk.length > 0) {
      broadcastToAll('GOALS_AT_RISK', {
        goals: atRisk,
        message: `${atRisk.length} יעדים בסיכון — נדרשת פעולה`
      });
    }
  },

  async handleBrainError(err: any) {
    await query(`
      INSERT INTO alerts (type, severity, title, message, entity_type)
      VALUES ('brain_error', 'critical', 'שגיאה קריטית במנוע המרכזי', $1, 'system')
    `, [err?.message || 'Unknown error']);

    broadcastToAll('BRAIN_ERROR', {
      error: err?.message,
      timestamp: new Date().toISOString()
    });
  }
};
