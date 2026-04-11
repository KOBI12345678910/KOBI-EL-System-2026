import { query } from '../../db/connection';
import { broadcastToAll } from '../../realtime/websocket';

// ════════════════════════════════════════════
// ENGINE 13: FRAUD DETECTION ENGINE
// מנוע זיהוי הונאות
// ════════════════════════════════════════════

export const fraudEngine = {

  async runFullScan() {
    const [
      materialFraud,
      timeFraud,
      financialFraud,
      supplierFraud,
      gpsAnomalies
    ] = await Promise.all([
      this.detectMaterialFraud(),
      this.detectTimeFraud(),
      this.detectFinancialFraud(),
      this.detectSupplierCollusion(),
      this.detectGPSAnomalies()
    ]);

    const allAlerts = [
      ...materialFraud,
      ...timeFraud,
      ...financialFraud,
      ...supplierFraud,
      ...gpsAnomalies
    ];

    const highRisk = allAlerts.filter(a => a.risk === 'HIGH');

    if (highRisk.length > 0) {
      broadcastToAll('FRAUD_ALERT', {
        count: highRisk.length,
        alerts: highRisk
      });
    }

    // שמור לDB
    for (const alert of allAlerts) {
      await query(`
        INSERT INTO fraud_alerts (type, risk, title, description, entity_id, entity_type, metadata, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
        ON CONFLICT DO NOTHING
      `, [alert.type, alert.risk, alert.title, alert.description,
          alert.entity_id, alert.entity_type, JSON.stringify(alert.metadata || {})]);
    }

    return {
      total_alerts: allAlerts.length,
      high_risk: highRisk.length,
      by_category: {
        material: materialFraud.length,
        time: timeFraud.length,
        financial: financialFraud.length,
        supplier: supplierFraud.length,
        gps: gpsAnomalies.length
      },
      alerts: allAlerts
    };
  },

  // הונאת חומרי גלם — ייצוא/גרעין
  async detectMaterialFraud() {
    const alerts: any[] = [];

    // צריכה גבוהה מהצפוי
    const { rows } = await query(`
      SELECT mi.name, mi.category,
        SUM(mm.qty) FILTER (WHERE mm.type='consume') as consumed,
        SUM(mm.qty) FILTER (WHERE mm.type='receive') as received,
        COUNT(DISTINCT mm.employee_id) as employees_handling
      FROM material_items mi
      JOIN material_movements mm ON mi.id=mm.item_id
      WHERE mm.created_at > NOW()-INTERVAL '30 days'
      GROUP BY mi.id, mi.name, mi.category
      HAVING SUM(mm.qty) FILTER (WHERE mm.type='consume') >
             SUM(mm.qty) FILTER (WHERE mm.type='receive') * 1.5
    `);

    rows.forEach((r: any) => {
      alerts.push({
        type: 'MATERIAL_OVERCONSUMPTION',
        risk: 'HIGH',
        title: `צריכת יתר חריגה — ${r.name}`,
        description: `נצרכו ${r.consumed} יחידות אבל התקבלו רק ${r.received}. פער חריג.`,
        entity_type: 'material',
        metadata: r
      });
    });

    // תנועות גדולות בלילה
    const { rows: nightMovements } = await query(`
      SELECT mm.*, mi.name as item_name, e.name as employee_name
      FROM material_movements mm
      JOIN material_items mi ON mm.item_id=mi.id
      LEFT JOIN employees e ON mm.employee_id=e.id
      WHERE EXTRACT(HOUR FROM mm.created_at) NOT BETWEEN 6 AND 20
        AND mm.qty > 50
        AND mm.created_at > NOW()-INTERVAL '30 days'
    `);

    nightMovements.forEach((r: any) => {
      alerts.push({
        type: 'NIGHT_MOVEMENT',
        risk: 'MEDIUM',
        title: `תנועת מלאי בשעות לא רגילות`,
        description: `${r.employee_name || 'לא ידוע'} ביצע תנועה של ${r.qty} יחידות ${r.item_name} ב-${new Date(r.created_at).toLocaleTimeString('he-IL')}`,
        entity_type: 'material',
        entity_id: r.id,
        metadata: r
      });
    });

    return alerts;
  },

  // הונאת שעות עבודה
  async detectTimeFraud() {
    const alerts: any[] = [];

    // עובד מדווח נוכחות אבל GPS מראה אחרת
    const { rows } = await query(`
      SELECT a.employee_id, e.name, a.date, a.location,
        ecl.last_seen, ecl.lat, ecl.lng,
        ecl.status as gps_status
      FROM attendance a
      JOIN employees e ON a.employee_id=e.id
      LEFT JOIN employee_current_location ecl ON a.employee_id=ecl.employee_id
      WHERE a.location='factory'
        AND a.date = CURRENT_DATE
        AND ecl.last_seen > NOW()-INTERVAL '2 hours'
        AND ecl.status = 'offline'
    `);

    rows.forEach((r: any) => {
      alerts.push({
        type: 'GPS_ATTENDANCE_MISMATCH',
        risk: 'HIGH',
        title: `אי-התאמה נוכחות/GPS — ${r.name}`,
        description: `${r.name} מסומן כנוכח במפעל אבל GPS לא פעיל/מחוץ לאזור`,
        entity_type: 'employee',
        entity_id: r.employee_id,
        metadata: r
      });
    });

    // שעות נוספות חריגות
    const { rows: overtimeRows } = await query(`
      SELECT employee_id, e.name,
        SUM(hours_worked) as total_hours,
        COUNT(*) as days
      FROM attendance a
      JOIN employees e ON a.employee_id=e.id
      WHERE date >= CURRENT_DATE-INTERVAL '7 days'
      GROUP BY employee_id, e.name
      HAVING SUM(hours_worked) > 60
    `);

    overtimeRows.forEach((r: any) => {
      alerts.push({
        type: 'EXCESSIVE_OVERTIME',
        risk: 'MEDIUM',
        title: `שעות נוספות חריגות — ${r.name}`,
        description: `${r.total_hours} שעות ב-7 ימים — מעל הנורמה`,
        entity_type: 'employee',
        entity_id: r.employee_id,
        metadata: r
      });
    });

    return alerts;
  },

  // הונאה פיננסית
  async detectFinancialFraud() {
    const alerts: any[] = [];

    // עסקאות עגולות חשודות
    const { rows: roundAmounts } = await query(`
      SELECT ft.*, c.name as client_name
      FROM financial_transactions ft
      LEFT JOIN clients c ON ft.client_id=c.id
      WHERE ft.amount % 1000 = 0
        AND ft.amount > 10000
        AND ft.type='income'
        AND ft.is_paid=true
        AND ft.created_at > NOW()-INTERVAL '30 days'
        AND ft.reference IS NULL
    `);

    roundAmounts.forEach((r: any) => {
      alerts.push({
        type: 'ROUND_AMOUNT_NO_REFERENCE',
        risk: 'LOW',
        title: `תשלום עגול ללא אסמכתה — ${r.client_name}`,
        description: `תשלום ₪${r.amount.toLocaleString()} ללא מספר אסמכתה`,
        entity_type: 'transaction',
        entity_id: r.id,
        metadata: r
      });
    });

    // תשלום כפול
    const { rows: duplicates } = await query(`
      SELECT amount, client_id, date, COUNT(*) as count
      FROM financial_transactions
      WHERE created_at > NOW()-INTERVAL '30 days'
      GROUP BY amount, client_id, date
      HAVING COUNT(*) > 1
    `);

    duplicates.forEach((r: any) => {
      alerts.push({
        type: 'DUPLICATE_PAYMENT',
        risk: 'HIGH',
        title: `תשלום כפול חשוד`,
        description: `סכום ₪${r.amount} מלקוח הופיע ${r.count} פעמים באותו יום`,
        entity_type: 'transaction',
        metadata: r
      });
    });

    return alerts;
  },

  // קנוניה עם ספקים
  async detectSupplierCollusion() {
    const alerts: any[] = [];

    // עלויות גבוהות מהממוצע ב-30%+
    const { rows } = await query(`
      SELECT mm.supplier_id, s.name as supplier_name, mi.name as item_name,
        mm.cost_per_unit, mi.cost_per_unit as standard_cost,
        (mm.cost_per_unit - mi.cost_per_unit)/NULLIF(mi.cost_per_unit,0)*100 as overprice_pct,
        mm.employee_id, e.name as employee_name
      FROM material_movements mm
      JOIN material_items mi ON mm.item_id=mi.id
      JOIN suppliers s ON mm.supplier_id=s.id
      LEFT JOIN employees e ON mm.employee_id=e.id
      WHERE mm.type='receive'
        AND mm.cost_per_unit > mi.cost_per_unit * 1.30
        AND mm.created_at > NOW()-INTERVAL '60 days'
    `);

    rows.forEach((r: any) => {
      alerts.push({
        type: 'SUPPLIER_OVERPRICE',
        risk: 'HIGH',
        title: `מחיר גבוה מהנורמה — ${r.supplier_name}`,
        description: `${r.item_name} נרכש ב-${Math.round(r.overprice_pct)}% מעל המחיר הרגיל. עובד: ${r.employee_name}`,
        entity_type: 'supplier',
        entity_id: r.supplier_id,
        metadata: r
      });
    });

    return alerts;
  },

  // חריגות GPS
  async detectGPSAnomalies() {
    const alerts: any[] = [];

    // GPS קפץ מיקום — טלפורטציה
    const { rows } = await query(`
      SELECT g1.employee_id, e.name,
        g1.lat as lat1, g1.lng as lng1, g1.timestamp as t1,
        g2.lat as lat2, g2.lng as lng2, g2.timestamp as t2,
        SQRT(POW(g2.lat-g1.lat,2)+POW(g2.lng-g1.lng,2))*111 as km_jump,
        EXTRACT(EPOCH FROM (g2.timestamp-g1.timestamp))/60 as minutes
      FROM gps_locations g1
      JOIN gps_locations g2 ON g1.employee_id=g2.employee_id
        AND g2.timestamp > g1.timestamp
        AND g2.timestamp < g1.timestamp+INTERVAL '5 minutes'
      JOIN employees e ON g1.employee_id=e.id
      WHERE g1.timestamp > NOW()-INTERVAL '24 hours'
        AND SQRT(POW(g2.lat-g1.lat,2)+POW(g2.lng-g1.lng,2))*111 > 20
    `);

    rows.forEach((r: any) => {
      alerts.push({
        type: 'GPS_TELEPORT',
        risk: 'HIGH',
        title: `קפיצת GPS חריגה — ${r.name}`,
        description: `קפיצה של ${Math.round(r.km_jump)} ק"מ תוך ${Math.round(r.minutes)} דקות — בלתי אפשרי`,
        entity_type: 'employee',
        entity_id: r.employee_id,
        metadata: r
      });
    });

    return alerts;
  }
};
