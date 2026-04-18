import { query } from '../db/connection';

export async function getFactorySnapshot() {
  const [
    ordersResult,
    attendanceResult,
    materialsResult,
    alertsResult,
    revenueResult,
    eventsResult
  ] = await Promise.all([
    query(`
      SELECT wo.*, c.name as client_name
      FROM work_orders wo
      JOIN clients c ON wo.client_id = c.id
      WHERE wo.status NOT IN ('delivered', 'cancelled')
      ORDER BY wo.delivery_date ASC
    `),
    query(`
      SELECT
        COUNT(*) FILTER (WHERE location = 'factory') as factory,
        COUNT(*) FILTER (WHERE location = 'field') as field,
        COUNT(*) FILTER (WHERE location IN ('sick','vacation','absent')) as absent,
        COUNT(*) as total
      FROM attendance WHERE date = CURRENT_DATE
    `),
    query(`
      SELECT COUNT(*) as count
      FROM material_items
      WHERE qty <= min_threshold AND is_active = true
    `),
    query(`
      SELECT * FROM alerts
      WHERE is_resolved = false
      ORDER BY created_at DESC
      LIMIT 20
    `),
    query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE type IN ('income','advance')), 0) as revenue,
        COALESCE(SUM(amount) FILTER (WHERE type IN ('expense','material_cost','salary')), 0) as costs
      FROM financial_transactions
      WHERE date >= date_trunc('month', CURRENT_DATE)
        AND is_paid = true
    `),
    query(`
      SELECT oe.*, wo.product, wo.id as order_ref
      FROM order_events oe
      JOIN work_orders wo ON oe.order_id = wo.id
      ORDER BY oe.created_at DESC
      LIMIT 10
    `)
  ]);

  const attendance = attendanceResult.rows[0];
  const revenue = revenueResult.rows[0];
  const activeOrders = ordersResult.rows;

  const utilizationPct = Math.round(
    (activeOrders.filter(o => o.status === 'production').length / Math.max(activeOrders.length, 1)) * 100
  );

  return {
    activeOrders,
    attendance: {
      factory: parseInt(attendance.factory || '0'),
      field: parseInt(attendance.field || '0'),
      absent: parseInt(attendance.absent || '0'),
      total: parseInt(attendance.total || '0')
    },
    materialAlerts: parseInt(materialsResult.rows[0]?.count || '0'),
    openAlerts: alertsResult.rows,
    monthlyRevenue: parseFloat(revenue.revenue || '0'),
    monthlyCosts: parseFloat(revenue.costs || '0'),
    utilizationPct,
    recentEvents: eventsResult.rows,
    timestamp: new Date().toISOString()
  };
}
