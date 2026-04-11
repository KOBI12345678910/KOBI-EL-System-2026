import cron from 'node-cron';
import { query } from '../db/connection';
import { broadcastToAll } from './websocket';

export function startAlertEngine() {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await checkMaterialAlerts();
    await checkOrderDelays();
    await broadcastFactorySnapshot();
  });

  // Factory snapshot every 30 seconds
  cron.schedule('*/30 * * * * *', async () => {
    await broadcastFactorySnapshot();
  });

  console.log('Alert engine started');
}

async function checkMaterialAlerts() {
  const { rows } = await query(`
    SELECT id, name, qty, min_threshold, unit
    FROM material_items
    WHERE qty <= min_threshold AND is_active = true
  `);

  for (const item of rows) {
    const existing = await query(`
      SELECT id FROM alerts
      WHERE entity_type = 'material'
        AND entity_id = $1
        AND is_resolved = false
        AND type = 'material_low'
    `, [item.id]);

    if (existing.rows.length === 0) {
      const severity = item.qty <= item.min_threshold * 0.3 ? 'danger' : 'warning';
      await query(`
        INSERT INTO alerts (type, severity, title, message, entity_type, entity_id)
        VALUES ('material_low', $1, $2, $3, 'material', $4)
      `, [
        severity,
        `מלאי נמוך — ${item.name}`,
        `נותרו ${item.qty} ${item.unit}. סף מינימום ${item.min_threshold} ${item.unit}.`,
        item.id
      ]);

      broadcastToAll('ALERT_CREATED', {
        type: 'material_low',
        severity,
        title: `מלאי נמוך — ${item.name}`,
        message: `נותרו ${item.qty} ${item.unit}`
      });
    }
  }
}

async function checkOrderDelays() {
  const { rows } = await query(`
    SELECT id, product, delivery_date, client_id
    FROM work_orders
    WHERE delivery_date < CURRENT_DATE
      AND status NOT IN ('delivered', 'cancelled')
      AND progress < 100
  `);

  for (const order of rows) {
    const existing = await query(`
      SELECT id FROM alerts
      WHERE entity_type = 'order'
        AND entity_id = $1
        AND is_resolved = false
        AND type = 'order_delayed'
    `, [order.id]);

    if (existing.rows.length === 0) {
      await query(`
        INSERT INTO alerts (type, severity, title, message, entity_type, entity_id)
        VALUES ('order_delayed', 'danger', $1, $2, 'order', $3)
      `, [
        `הזמנה ${order.id} עברה מועד אספקה`,
        `${order.product} — מועד אספקה ${new Date(order.delivery_date).toLocaleDateString('he-IL')}`,
        order.id
      ]);

      broadcastToAll('ALERT_CREATED', {
        type: 'order_delayed',
        severity: 'danger',
        title: `הזמנה ${order.id} מאוחרת`,
        orderId: order.id
      });
    }
  }
}

async function broadcastFactorySnapshot() {
  try {
    const [orders, materials, attendance, revenue] = await Promise.all([
      query(`SELECT status, COUNT(*) as count FROM work_orders GROUP BY status`),
      query(`SELECT COUNT(*) as count FROM material_items WHERE qty <= min_threshold AND is_active = true`),
      query(`SELECT location, COUNT(*) as count FROM attendance WHERE date = CURRENT_DATE GROUP BY location`),
      query(`SELECT COALESCE(SUM(amount), 0) as total FROM financial_transactions WHERE type IN ('income','advance') AND date >= date_trunc('month', CURRENT_DATE) AND is_paid = true`)
    ]);

    broadcastToAll('FACTORY_SNAPSHOT', {
      orders: orders.rows,
      materialAlerts: parseInt(materials.rows[0]?.count || '0'),
      attendance: attendance.rows,
      monthlyRevenue: parseFloat(revenue.rows[0]?.total || '0'),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Snapshot error:', err);
  }
}
