import { query } from '../db/connection';

// Intelligence Engine — real data, no demo
// All methods return REAL database computations
export const intelligenceEngine = {

  async getRealtimeKPIs() {
    const [orders, revenue, employees, materials] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM work_orders WHERE status IN ('pending','production','finishing','ready')`),
      query(`SELECT COALESCE(SUM(amount),0) as total FROM financial_transactions WHERE type IN ('income','advance') AND is_paid = true AND date >= date_trunc('month', CURRENT_DATE)`),
      query(`SELECT COUNT(*) as count FROM attendance WHERE date = CURRENT_DATE AND location IN ('factory','field')`),
      query(`SELECT COUNT(*) as count FROM material_items WHERE qty <= min_threshold AND is_active = true`),
    ]);
    return {
      activeOrders: parseInt(orders.rows[0].count),
      monthlyRevenue: parseFloat(revenue.rows[0].total),
      employeesPresent: parseInt(employees.rows[0].count),
      materialAlerts: parseInt(materials.rows[0].count),
    };
  },

  async generateQuote(data: any) {
    // Real pricing from material catalog + labor rates
    const { material, qty } = data;
    const { rows } = await query(
      `SELECT AVG(cost_per_unit) as avg_cost FROM material_items WHERE category = $1 AND is_active = true`,
      [material]
    );
    const avgCost = parseFloat(rows[0]?.avg_cost || '0');
    const materialCost = avgCost * (qty || 1);
    const laborCost = materialCost * 0.4;
    const overhead = (materialCost + laborCost) * 0.15;
    const margin = 0.35;
    const subtotal = materialCost + laborCost + overhead;
    const price = Math.round(subtotal / (1 - margin));
    return { materialCost, laborCost, overhead, subtotal, margin, price };
  },

  async detectAnomalies() {
    const anomalies: any[] = [];
    const { rows: delayed } = await query(`
      SELECT id, product, delivery_date FROM work_orders
      WHERE delivery_date < CURRENT_DATE AND status NOT IN ('delivered','cancelled')
    `);
    for (const o of delayed) {
      anomalies.push({ type: 'order_delayed', orderId: o.id, severity: 'high', message: `${o.product} באיחור` });
    }
    const { rows: critical } = await query(`
      SELECT id, name, qty, min_threshold FROM material_items
      WHERE qty <= min_threshold * 0.3 AND is_active = true
    `);
    for (const m of critical) {
      anomalies.push({ type: 'stock_critical', itemId: m.id, severity: 'critical', message: `${m.name}: ${m.qty}/${m.min_threshold}` });
    }
    return anomalies;
  },

  async forecastRevenue() {
    const { rows } = await query(`
      SELECT TO_CHAR(date_trunc('month', date), 'YYYY-MM') as month,
        SUM(amount) FILTER (WHERE type IN ('income','advance')) as revenue
      FROM financial_transactions
      WHERE date >= NOW() - INTERVAL '6 months' AND is_paid = true
      GROUP BY date_trunc('month', date)
      ORDER BY month ASC
    `);
    const avg = rows.length > 0 ? rows.reduce((s: number, r: any) => s + parseFloat(r.revenue || '0'), 0) / rows.length : 0;
    return { history: rows, forecastNext30: Math.round(avg), forecastNext90: Math.round(avg * 3), confidence: rows.length >= 3 ? 0.75 : 0.4 };
  },

  async forecastMaterials() {
    const { rows } = await query(`
      SELECT mi.name, mi.qty, mi.min_threshold, mi.cost_per_unit,
        COALESCE(SUM(mm.qty) FILTER (WHERE mm.type = 'consume' AND mm.created_at > NOW() - INTERVAL '30 days'), 0) as consumed_30d
      FROM material_items mi
      LEFT JOIN material_movements mm ON mi.id = mm.item_id
      WHERE mi.is_active = true
      GROUP BY mi.id, mi.name, mi.qty, mi.min_threshold, mi.cost_per_unit
    `);
    return rows.map((m: any) => {
      const daily = parseFloat(m.consumed_30d) / 30;
      const daysLeft = daily > 0 ? Math.floor(m.qty / daily) : 999;
      return { name: m.name, qty: m.qty, dailyConsumption: daily, daysLeft, action: daysLeft < 14 ? 'reorder_now' : daysLeft < 30 ? 'reorder_soon' : 'ok' };
    });
  },

  async employeeROI() {
    const { rows } = await query(`
      SELECT e.id, e.name, e.salary,
        COALESCE(SUM(woe.hours_logged), 0) as hours_this_month,
        COALESCE(SUM(wo.price) FILTER (WHERE wo.status = 'delivered'), 0) as revenue_contributed
      FROM employees e
      LEFT JOIN work_order_employees woe ON e.id = woe.employee_id
      LEFT JOIN work_orders wo ON woe.order_id = wo.id
      WHERE e.is_active = true
      GROUP BY e.id, e.name, e.salary
    `);
    return rows.map((e: any) => ({
      id: e.id, name: e.name, salary: parseFloat(e.salary),
      hoursThisMonth: parseFloat(e.hours_this_month),
      revenueContributed: parseFloat(e.revenue_contributed),
      roiRatio: parseFloat(e.salary) > 0 ? parseFloat(e.revenue_contributed) / parseFloat(e.salary) : 0,
    }));
  },

  async clientScoring() {
    const { rows } = await query(`
      SELECT c.id, c.name, c.credit_limit, c.balance_due,
        COUNT(wo.id) as total_orders,
        COALESCE(SUM(wo.price), 0) as total_revenue,
        COUNT(wo.id) FILTER (WHERE wo.status = 'delivered') as completed_orders
      FROM clients c
      LEFT JOIN work_orders wo ON c.id = wo.client_id
      WHERE c.is_active = true
      GROUP BY c.id
    `);
    return rows.map((c: any) => {
      const revenue = parseFloat(c.total_revenue) || 0;
      const balance = parseFloat(c.balance_due) || 0;
      const creditUsed = c.credit_limit > 0 ? balance / parseFloat(c.credit_limit) : 0;
      const score = Math.max(0, Math.min(100, 100 - (creditUsed * 40) + (revenue / 10000)));
      return { ...c, score: Math.round(score), tier: score > 80 ? 'gold' : score > 50 ? 'silver' : 'bronze' };
    });
  },

  async cashFlowForecast(days: number = 30) {
    const { rows: inflow } = await query(`
      SELECT date_trunc('day', date) as day, SUM(amount) as amount
      FROM financial_transactions
      WHERE type IN ('income','advance') AND date >= NOW() - INTERVAL '30 days' AND is_paid = true
      GROUP BY date_trunc('day', date) ORDER BY day
    `);
    const avgDaily = inflow.length > 0 ? inflow.reduce((s: number, r: any) => s + parseFloat(r.amount), 0) / inflow.length : 0;
    return { history: inflow, forecastDaily: avgDaily, forecastTotal: avgDaily * days };
  },

  async optimizeSchedule(date: string) {
    const { rows } = await query(`
      SELECT t.*, e.name as employee_name
      FROM tasks t
      LEFT JOIN employees e ON t.employee_id = e.id
      WHERE t.scheduled_date = $1 AND t.status != 'done'
      ORDER BY t.scheduled_time ASC
    `, [date]);
    return { date, tasks: rows, total: rows.length };
  },
};
