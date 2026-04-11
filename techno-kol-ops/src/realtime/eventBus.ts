// ════════════════════════════════════════════
// EVENT BUS — אוטובוס אירועים
// כל דבר שקורה במערכת עובר כאן
// ════════════════════════════════════════════

import { EventEmitter } from 'events';
import { query } from '../db/connection';
import { broadcastToAll, broadcast } from './websocket';

class TechnoKolEventBus extends EventEmitter {
  private static instance: TechnoKolEventBus;

  static getInstance() {
    if (!this.instance) this.instance = new TechnoKolEventBus();
    return this.instance;
  }
}

export const eventBus = TechnoKolEventBus.getInstance();
export const bus = eventBus;

// ── רישום כל האירועים
export function initEventBus() {

  // ── הזמנה עודכנה
  eventBus.on('order:updated', async (data: any) => {
    await logEvent('order:updated', data);
    broadcastToAll('ORDER_UPDATED', data);

    // אם מאוחר — צור alert
    if (data.delivery_date && new Date(data.delivery_date) < new Date() &&
        !['delivered','cancelled'].includes(data.status)) {
      await createAutoAlert('order_delayed', 'danger',
        `הזמנה ${data.id} עברה מועד אספקה`,
        `לקוח: ${data.client_name || ''} | מוצר: ${data.product}`,
        'order', data.id);
    }
  });

  // ── פרוייקט קידם שלב
  eventBus.on('project:stage_advanced', async (data: any) => {
    await logEvent('project:stage_advanced', data);
    broadcastToAll('PROJECT_STAGE_ADVANCED', data);

    // רישום אוטומטי לעדכון AI
    await query(`
      INSERT INTO pipeline_events (project_id, stage, action, performed_by_role, notes)
      VALUES ($1, $2, 'auto_advanced', 'system', $3)
    `, [data.project_id, data.new_stage, `מעבר אוטומטי ממנוע: ${data.trigger || 'brain'}`]);
  });

  // ── עובד הגיע
  eventBus.on('employee:checked_in', async (data: any) => {
    await logEvent('employee:checked_in', data);
    broadcast(`employee:${data.employee_id}`, 'CHECKED_IN', data);
    broadcastToAll('ATTENDANCE_UPDATED', data);
  });

  // ── GPS עדכון
  eventBus.on('gps:update', async (data: any) => {
    broadcastToAll('LOCATION_UPDATE', data);

    // סוללה נמוכה
    if (data.battery_level < 15) {
      eventBus.emit('alert:create', {
        type: 'low_battery',
        severity: 'warning',
        title: `סוללה נמוכה — ${data.employee_name}`,
        message: `${data.battery_level}% סוללה`,
        entity_type: 'employee',
        entity_id: data.employee_id
      });
    }
  });

  // ── מלאי נמוך
  eventBus.on('material:low', async (data: any) => {
    await logEvent('material:low', data);
    await createAutoAlert('material_low',
      data.qty <= data.min_threshold * 0.2 ? 'critical' : 'warning',
      `מלאי נמוך — ${data.name}`,
      `נותרו ${data.qty} ${data.unit} | סף: ${data.min_threshold}`,
      'material', data.id);
    broadcastToAll('MATERIAL_LOW', data);
  });

  // ── תשלום התקבל
  eventBus.on('payment:received', async (data: any) => {
    await logEvent('payment:received', data);
    broadcastToAll('PAYMENT_RECEIVED', data);

    // עדכן יתרת לקוח
    await query(`
      UPDATE clients SET balance_due = balance_due - $2
      WHERE id = $1
    `, [data.client_id, data.amount]);
  });

  // ── ליד חדש
  eventBus.on('lead:created', async (data: any) => {
    await logEvent('lead:created', data);
    broadcastToAll('LEAD_CREATED', data);

    // הקצה לסוכן פנוי
    const { rows } = await query(`
      SELECT e.id FROM employees e
      LEFT JOIN leads l ON l.assigned_to=e.id AND l.status NOT IN ('won','lost')
      WHERE e.role ILIKE '%מכירות%' AND e.is_active=true
      GROUP BY e.id ORDER BY COUNT(l.id) ASC LIMIT 1
    `);

    if (rows[0]) {
      await query(`UPDATE leads SET assigned_to=$2 WHERE id=$1`, [data.id, rows[0].id]);
      broadcast(`employee:${rows[0].id}`, 'NEW_LEAD_ASSIGNED', data);
    }
  });

  // ── צור alert
  eventBus.on('alert:create', async (data: any) => {
    await createAutoAlert(data.type, data.severity, data.title, data.message, data.entity_type, data.entity_id);
  });

  // ── משימה הושלמה
  eventBus.on('task:completed', async (data: any) => {
    await logEvent('task:completed', data);
    broadcastToAll('TASK_COMPLETED', data);

    // בדוק אם כל משימות הפרוייקט הושלמו
    if (data.order_id) {
      const { rows } = await query(`
        SELECT COUNT(*) FILTER (WHERE status!='done') as remaining
        FROM tasks WHERE order_id=$1 AND scheduled_date=CURRENT_DATE
      `, [data.order_id]);

      if (parseInt(rows[0]?.remaining || '0') === 0) {
        eventBus.emit('order:all_tasks_done', { order_id: data.order_id });
      }
    }
  });

  // ── הצעת מחיר נוצרה
  eventBus.on('quote:generated', async (data: any) => {
    await logEvent('quote:generated', data);
    broadcastToAll('QUOTE_GENERATED', data);
  });

  console.log('[EVENT BUS] Initialized — listening to all system events');
}

async function logEvent(type: string, data: any) {
  await query(`
    INSERT INTO system_events (type, data, created_at)
    VALUES ($1, $2, NOW())
  `, [type, JSON.stringify(data)]).catch(() => {});
}

async function createAutoAlert(
  type: string, severity: string, title: string,
  message: string, entityType: string, entityId?: string
) {
  const existing = await query(`
    SELECT id FROM alerts
    WHERE type=$1 AND entity_id=$2 AND is_resolved=false
      AND created_at > NOW()-INTERVAL '1 hour'
  `, [type, entityId || null]);

  if (existing.rows.length === 0) {
    const { rows } = await query(`
      INSERT INTO alerts (type, severity, title, message, entity_type, entity_id)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [type, severity, title, message, entityType, entityId || null]);

    broadcastToAll('ALERT_CREATED', rows[0]);
  }
}
