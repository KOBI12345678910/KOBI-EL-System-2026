/**
 * iot-gateway.ts
 * שער IoT תעשייתי לאינטגרציית מפעל
 * ניהול חיישנים, קליטת נתונים, התראות וניתוח אנומליות
 */

import { pool } from "@workspace/db";

// ──────────────────────────────────────────────
// טיפוסים
// ──────────────────────────────────────────────

/** סוגי מכשירים נתמכים */
export type DeviceType = "sensor" | "plc" | "controller" | "gateway" | "camera" | "rfid";

/** פרוטוקולי תקשורת */
export type DeviceProtocol = "mqtt" | "modbus" | "opcua" | "http" | "websocket";

/** סטטוס מכשיר */
export type DeviceStatus = "online" | "offline" | "error" | "maintenance";

/** סוגי התראות */
export type AlertType = "threshold_exceeded" | "device_offline" | "battery_low" | "anomaly" | "maintenance_due";

/** חומרת התראה */
export type AlertSeverity = "info" | "warning" | "critical" | "emergency";

/** סטטוס התראה */
export type AlertStatus = "active" | "acknowledged" | "resolved";

/** סוג אגרגציה לשאילתות טיימסריז */
export type AggregationType = "minute" | "hour" | "day" | "week" | "month";

/** מבנה מכשיר IoT */
export interface IoTDevice {
  id?: number;
  device_id: string;
  device_name: string;
  device_name_he?: string;
  device_type: DeviceType;
  protocol: DeviceProtocol;
  connection_string?: string;
  location?: string;
  department?: string;
  machine_id?: number;
  machine_name?: string;
  reading_interval_seconds?: number;
  last_reading_at?: string;
  last_value?: Record<string, unknown>;
  battery_level?: number;
  firmware_version?: string;
  status?: DeviceStatus;
  alerts_enabled?: boolean;
  alert_thresholds?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

/** מבנה קריאה מחיישן */
export interface IoTReading {
  id?: number;
  device_id: string;
  reading_type: string;
  value: number;
  unit: string;
  raw_data?: Record<string, unknown>;
  quality?: string;
  timestamp?: string;
  processed?: boolean;
}

/** מבנה התראה */
export interface IoTAlert {
  id?: number;
  device_id: string;
  device_name?: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  value?: number;
  threshold?: number;
  acknowledged?: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  auto_action_taken?: string;
  status?: AlertStatus;
  created_at?: string;
}

// ──────────────────────────────────────────────
// יצירת טבלאות ואינדקסים
// ──────────────────────────────────────────────

/** יצירת כל הטבלאות והאינדקסים של מערכת ה-IoT */
export async function ensureIoTTables(): Promise<void> {
  // טבלת מכשירים - ניהול כל מכשירי ה-IoT במפעל
  await pool.query(`
    CREATE TABLE IF NOT EXISTS iot_devices (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(255) UNIQUE NOT NULL,
      device_name VARCHAR(255) NOT NULL,
      device_name_he VARCHAR(255),
      device_type VARCHAR(50) NOT NULL CHECK (device_type IN ('sensor','plc','controller','gateway','camera','rfid')),
      protocol VARCHAR(50) NOT NULL CHECK (protocol IN ('mqtt','modbus','opcua','http','websocket')),
      connection_string TEXT,
      location VARCHAR(255),
      department VARCHAR(255),
      machine_id INTEGER,
      machine_name VARCHAR(255),
      reading_interval_seconds INTEGER DEFAULT 60,
      last_reading_at TIMESTAMPTZ,
      last_value JSONB,
      battery_level INTEGER CHECK (battery_level >= 0 AND battery_level <= 100),
      firmware_version VARCHAR(100),
      status VARCHAR(50) DEFAULT 'offline' CHECK (status IN ('online','offline','error','maintenance')),
      alerts_enabled BOOLEAN DEFAULT true,
      alert_thresholds JSONB DEFAULT '{}',
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // טבלת קריאות - נתוני טיימסריז מהחיישנים
  await pool.query(`
    CREATE TABLE IF NOT EXISTS iot_readings (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(255) NOT NULL,
      reading_type VARCHAR(100) NOT NULL,
      value NUMERIC NOT NULL,
      unit VARCHAR(50) NOT NULL,
      raw_data JSONB,
      quality VARCHAR(50) DEFAULT 'good',
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      processed BOOLEAN DEFAULT false
    )
  `);

  // טבלת התראות - התראות שנוצרו ממכשירים
  await pool.query(`
    CREATE TABLE IF NOT EXISTS iot_alerts (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(255) NOT NULL,
      device_name VARCHAR(255),
      alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('threshold_exceeded','device_offline','battery_low','anomaly','maintenance_due')),
      severity VARCHAR(50) NOT NULL CHECK (severity IN ('info','warning','critical','emergency')),
      message TEXT NOT NULL,
      value NUMERIC,
      threshold NUMERIC,
      acknowledged BOOLEAN DEFAULT false,
      acknowledged_by VARCHAR(255),
      acknowledged_at TIMESTAMPTZ,
      auto_action_taken TEXT,
      status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active','acknowledged','resolved')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // אינדקסים לשאילתות טיימסריז מהירות על קריאות
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_iot_readings_device_timestamp
    ON iot_readings (device_id, timestamp DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_iot_readings_timestamp
    ON iot_readings (timestamp DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_iot_readings_device_type_timestamp
    ON iot_readings (device_id, reading_type, timestamp DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_iot_readings_processed
    ON iot_readings (processed) WHERE processed = false
  `);

  // אינדקסים לטבלת מכשירים
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_iot_devices_status
    ON iot_devices (status)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_iot_devices_type
    ON iot_devices (device_type)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_iot_devices_department
    ON iot_devices (department)
  `);

  // אינדקסים לטבלת התראות
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_iot_alerts_device_id
    ON iot_alerts (device_id, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_iot_alerts_status
    ON iot_alerts (status) WHERE status = 'active'
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_iot_alerts_severity
    ON iot_alerts (severity, created_at DESC)
  `);
}

// ──────────────────────────────────────────────
// קליטת נתונים ועיבוד
// ──────────────────────────────────────────────

/**
 * קליטת קריאה ממכשיר IoT
 * שומר את הקריאה, מעדכן את המכשיר, ובודק חריגות מסף
 */
export async function ingestReading(
  deviceId: string,
  readingType: string,
  value: number,
  unit: string,
  rawData?: Record<string, unknown>
): Promise<{ reading: IoTReading; alerts: IoTAlert[] }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // שמירת הקריאה בטבלת הקריאות
    const readingResult = await client.query(
      `INSERT INTO iot_readings (device_id, reading_type, value, unit, raw_data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [deviceId, readingType, value, unit, rawData ? JSON.stringify(rawData) : null]
    );

    // עדכון המכשיר - ערך אחרון וזמן קריאה אחרונה
    await client.query(
      `UPDATE iot_devices
       SET last_reading_at = NOW(),
           last_value = $2,
           status = 'online',
           updated_at = NOW()
       WHERE device_id = $1`,
      [deviceId, JSON.stringify({ [readingType]: value, unit })]
    );

    await client.query("COMMIT");

    // בדיקת חריגות מסף - מחוץ לטרנזקציה כדי לא לעכב קליטה
    const alerts = await checkThresholds(deviceId, value);

    return { reading: readingResult.rows[0], alerts };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * בדיקת חריגות מסף עבור מכשיר
 * אם הערך חורג מהסף המוגדר - יוצר התראה
 */
export async function checkThresholds(
  deviceId: string,
  value: number
): Promise<IoTAlert[]> {
  const alerts: IoTAlert[] = [];

  // שליפת הגדרות הסף מהמכשיר
  const deviceResult = await pool.query(
    `SELECT device_id, device_name, alerts_enabled, alert_thresholds
     FROM iot_devices WHERE device_id = $1`,
    [deviceId]
  );

  if (deviceResult.rows.length === 0) return alerts;

  const device = deviceResult.rows[0];

  // אם ההתראות כבויות - לא בודקים
  if (!device.alerts_enabled) return alerts;

  const thresholds = device.alert_thresholds || {};

  // בדיקת סף עליון
  if (thresholds.max !== undefined && value > thresholds.max) {
    const severity: AlertSeverity =
      thresholds.critical_max !== undefined && value > thresholds.critical_max
        ? "critical"
        : "warning";

    const alert = await createAlert({
      device_id: deviceId,
      device_name: device.device_name,
      alert_type: "threshold_exceeded",
      severity,
      message: `ערך ${value} חורג מהסף העליון ${thresholds.max} עבור מכשיר ${device.device_name}`,
      value,
      threshold: thresholds.max,
    });
    alerts.push(alert);
  }

  // בדיקת סף תחתון
  if (thresholds.min !== undefined && value < thresholds.min) {
    const severity: AlertSeverity =
      thresholds.critical_min !== undefined && value < thresholds.critical_min
        ? "critical"
        : "warning";

    const alert = await createAlert({
      device_id: deviceId,
      device_name: device.device_name,
      alert_type: "threshold_exceeded",
      severity,
      message: `ערך ${value} מתחת לסף התחתון ${thresholds.min} עבור מכשיר ${device.device_name}`,
      value,
      threshold: thresholds.min,
    });
    alerts.push(alert);
  }

  return alerts;
}

/**
 * יצירת התראה חדשה
 */
export async function createAlert(
  alert: Omit<IoTAlert, "id" | "created_at">
): Promise<IoTAlert> {
  const result = await pool.query(
    `INSERT INTO iot_alerts (device_id, device_name, alert_type, severity, message, value, threshold, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      alert.device_id,
      alert.device_name || null,
      alert.alert_type,
      alert.severity,
      alert.message,
      alert.value ?? null,
      alert.threshold ?? null,
      alert.status || "active",
    ]
  );
  return result.rows[0];
}

/**
 * שליפת היסטוריית קריאות של מכשיר עם אגרגציה
 * תומך בטווחי זמן ואגרגציה לפי דקה/שעה/יום/שבוע/חודש
 */
export async function getDeviceHistory(
  deviceId: string,
  from: string,
  to: string,
  aggregation?: AggregationType
): Promise<unknown[]> {
  // אם אין אגרגציה - מחזיר נתונים גולמיים
  if (!aggregation) {
    const result = await pool.query(
      `SELECT id, device_id, reading_type, value, unit, raw_data, quality, timestamp
       FROM iot_readings
       WHERE device_id = $1 AND timestamp >= $2 AND timestamp <= $3
       ORDER BY timestamp ASC`,
      [deviceId, from, to]
    );
    return result.rows;
  }

  // מיפוי אגרגציה לפונקציית date_trunc של PostgreSQL
  const truncMap: Record<AggregationType, string> = {
    minute: "minute",
    hour: "hour",
    day: "day",
    week: "week",
    month: "month",
  };

  const trunc = truncMap[aggregation];

  // שליפה עם אגרגציה - מינימום, מקסימום, ממוצע, ספירה
  const result = await pool.query(
    `SELECT
       date_trunc($4, timestamp) AS bucket,
       reading_type,
       MIN(value) AS min_value,
       MAX(value) AS max_value,
       AVG(value) AS avg_value,
       COUNT(*) AS reading_count
     FROM iot_readings
     WHERE device_id = $1 AND timestamp >= $2 AND timestamp <= $3
     GROUP BY bucket, reading_type
     ORDER BY bucket ASC`,
    [deviceId, from, to, trunc]
  );
  return result.rows;
}

/**
 * אגרגציית קריאות לתקופה נתונה
 * מחזיר מינימום, מקסימום, ממוצע וספירת קריאות
 */
export async function aggregateReadings(
  deviceId: string,
  period: AggregationType
): Promise<{
  device_id: string;
  period: string;
  readings: Array<{
    reading_type: string;
    min_value: number;
    max_value: number;
    avg_value: number;
    count: number;
  }>;
}> {
  // חישוב טווח הזמן לפי התקופה המבוקשת
  const intervalMap: Record<AggregationType, string> = {
    minute: "1 minute",
    hour: "1 hour",
    day: "1 day",
    week: "1 week",
    month: "1 month",
  };

  const interval = intervalMap[period];

  const result = await pool.query(
    `SELECT
       reading_type,
       MIN(value) AS min_value,
       MAX(value) AS max_value,
       AVG(value)::NUMERIC(12,4) AS avg_value,
       COUNT(*)::INTEGER AS count
     FROM iot_readings
     WHERE device_id = $1 AND timestamp >= NOW() - $2::INTERVAL
     GROUP BY reading_type`,
    [deviceId, interval]
  );

  return {
    device_id: deviceId,
    period,
    readings: result.rows,
  };
}

// ──────────────────────────────────────────────
// ניהול מכשירים
// ──────────────────────────────────────────────

/**
 * רישום מכשיר IoT חדש במערכת
 */
export async function registerDevice(device: IoTDevice): Promise<IoTDevice> {
  const result = await pool.query(
    `INSERT INTO iot_devices (
       device_id, device_name, device_name_he, device_type, protocol,
       connection_string, location, department, machine_id, machine_name,
       reading_interval_seconds, battery_level, firmware_version, status,
       alerts_enabled, alert_thresholds, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      device.device_id,
      device.device_name,
      device.device_name_he || null,
      device.device_type,
      device.protocol,
      device.connection_string || null,
      device.location || null,
      device.department || null,
      device.machine_id ?? null,
      device.machine_name || null,
      device.reading_interval_seconds ?? 60,
      device.battery_level ?? null,
      device.firmware_version || null,
      device.status || "offline",
      device.alerts_enabled ?? true,
      JSON.stringify(device.alert_thresholds || {}),
      JSON.stringify(device.metadata || {}),
    ]
  );
  return result.rows[0];
}

/**
 * עדכון סטטוס מכשיר - שימוש כ-heartbeat
 * מעדכן סטטוס ובודק אם סוללה נמוכה
 */
export async function updateDeviceStatus(
  deviceId: string,
  status: DeviceStatus,
  batteryLevel?: number
): Promise<IoTDevice | null> {
  const fields = ["status = $2", "updated_at = NOW()"];
  const params: unknown[] = [deviceId, status];
  let idx = 3;

  if (batteryLevel !== undefined) {
    fields.push(`battery_level = $${idx}`);
    params.push(batteryLevel);
    idx++;

    // בדיקת סוללה נמוכה - התראה אם מתחת ל-15%
    if (batteryLevel < 15) {
      const deviceResult = await pool.query(
        `SELECT device_name, alerts_enabled FROM iot_devices WHERE device_id = $1`,
        [deviceId]
      );
      if (deviceResult.rows.length > 0 && deviceResult.rows[0].alerts_enabled) {
        await createAlert({
          device_id: deviceId,
          device_name: deviceResult.rows[0].device_name,
          alert_type: "battery_low",
          severity: batteryLevel < 5 ? "critical" : "warning",
          message: `סוללת מכשיר ${deviceResult.rows[0].device_name} נמוכה: ${batteryLevel}%`,
          value: batteryLevel,
          threshold: 15,
        });
      }
    }
  }

  const result = await pool.query(
    `UPDATE iot_devices SET ${fields.join(", ")} WHERE device_id = $1 RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

/**
 * דשבורד מכשירים - כל המכשירים עם סטטוס, קריאה אחרונה והתראות פעילות
 */
export async function getDevicesDashboard(): Promise<
  Array<IoTDevice & { active_alerts_count: number }>
> {
  const result = await pool.query(`
    SELECT
      d.*,
      COALESCE(a.alert_count, 0)::INTEGER AS active_alerts_count
    FROM iot_devices d
    LEFT JOIN (
      SELECT device_id, COUNT(*) AS alert_count
      FROM iot_alerts
      WHERE status = 'active'
      GROUP BY device_id
    ) a ON a.device_id = d.device_id
    ORDER BY
      CASE d.status
        WHEN 'error' THEN 0
        WHEN 'maintenance' THEN 1
        WHEN 'online' THEN 2
        WHEN 'offline' THEN 3
      END,
      d.device_name ASC
  `);
  return result.rows;
}

// ──────────────────────────────────────────────
// סטטיסטיקות וניתוח
// ──────────────────────────────────────────────

/**
 * סטטיסטיקות כלליות של מערכת ה-IoT
 * סה"כ מכשירים, אונליין/אופליין, קריאות היום, התראות פעילות
 */
export async function getIoTStats(): Promise<{
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  error_devices: number;
  maintenance_devices: number;
  readings_today: number;
  active_alerts: number;
  critical_alerts: number;
}> {
  // שאילתה אחת מאוחדת לכל הנתונים - ביצועים טובים יותר
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::INTEGER FROM iot_devices) AS total_devices,
      (SELECT COUNT(*)::INTEGER FROM iot_devices WHERE status = 'online') AS online_devices,
      (SELECT COUNT(*)::INTEGER FROM iot_devices WHERE status = 'offline') AS offline_devices,
      (SELECT COUNT(*)::INTEGER FROM iot_devices WHERE status = 'error') AS error_devices,
      (SELECT COUNT(*)::INTEGER FROM iot_devices WHERE status = 'maintenance') AS maintenance_devices,
      (SELECT COUNT(*)::INTEGER FROM iot_readings WHERE timestamp >= CURRENT_DATE) AS readings_today,
      (SELECT COUNT(*)::INTEGER FROM iot_alerts WHERE status = 'active') AS active_alerts,
      (SELECT COUNT(*)::INTEGER FROM iot_alerts WHERE status = 'active' AND severity = 'critical') AS critical_alerts
  `);

  return result.rows[0];
}

/**
 * זיהוי אנומליות - קריאות שחורגות יותר מ-2 סטיות תקן מהממוצע
 * מחזיר קריאות חריגות עם הערך, הממוצע וסטיית התקן
 */
export async function getAnomalies(
  deviceId: string,
  lookbackHours: number = 24
): Promise<
  Array<{
    id: number;
    device_id: string;
    reading_type: string;
    value: number;
    unit: string;
    timestamp: string;
    mean: number;
    stddev: number;
    deviation_factor: number;
  }>
> {
  // חישוב ממוצע וסטיית תקן לכל סוג קריאה, ואז מציאת ערכים חריגים
  const result = await pool.query(
    `WITH stats AS (
       SELECT
         reading_type,
         AVG(value) AS mean,
         STDDEV_POP(value) AS stddev
       FROM iot_readings
       WHERE device_id = $1
         AND timestamp >= NOW() - ($2 || ' hours')::INTERVAL
       GROUP BY reading_type
       HAVING STDDEV_POP(value) > 0
     )
     SELECT
       r.id,
       r.device_id,
       r.reading_type,
       r.value,
       r.unit,
       r.timestamp,
       s.mean::NUMERIC(12,4) AS mean,
       s.stddev::NUMERIC(12,4) AS stddev,
       ABS(r.value - s.mean) / s.stddev AS deviation_factor
     FROM iot_readings r
     JOIN stats s ON s.reading_type = r.reading_type
     WHERE r.device_id = $1
       AND r.timestamp >= NOW() - ($2 || ' hours')::INTERVAL
       AND ABS(r.value - s.mean) > 2 * s.stddev
     ORDER BY deviation_factor DESC`,
    [deviceId, lookbackHours.toString()]
  );

  return result.rows;
}

// ──────────────────────────────────────────────
// פונקציות עזר נוספות
// ──────────────────────────────────────────────

/**
 * אישור התראה - סימון שהתראה טופלה על ידי משתמש
 */
export async function acknowledgeAlert(
  alertId: number,
  acknowledgedBy: string
): Promise<IoTAlert | null> {
  const result = await pool.query(
    `UPDATE iot_alerts
     SET acknowledged = true,
         acknowledged_by = $2,
         acknowledged_at = NOW(),
         status = 'acknowledged'
     WHERE id = $1
     RETURNING *`,
    [alertId, acknowledgedBy]
  );
  return result.rows[0] || null;
}

/**
 * סגירת התראה - סימון שהבעיה נפתרה
 */
export async function resolveAlert(alertId: number): Promise<IoTAlert | null> {
  const result = await pool.query(
    `UPDATE iot_alerts
     SET status = 'resolved'
     WHERE id = $1
     RETURNING *`,
    [alertId]
  );
  return result.rows[0] || null;
}

/**
 * שליפת התראות פעילות - לפי מכשיר ספציפי או כולם
 */
export async function getActiveAlerts(deviceId?: string): Promise<IoTAlert[]> {
  if (deviceId) {
    const result = await pool.query(
      `SELECT * FROM iot_alerts
       WHERE device_id = $1 AND status = 'active'
       ORDER BY
         CASE severity WHEN 'emergency' THEN 0 WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
         created_at DESC`,
      [deviceId]
    );
    return result.rows;
  }

  const result = await pool.query(
    `SELECT * FROM iot_alerts
     WHERE status = 'active'
     ORDER BY
       CASE severity WHEN 'emergency' THEN 0 WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
       created_at DESC`
  );
  return result.rows;
}

/**
 * זיהוי מכשירים לא-פעילים
 * מחזיר מכשירים שלא שלחו קריאה מעבר למרווח הזמן המוגדר שלהם (כפול 3)
 */
export async function detectOfflineDevices(): Promise<IoTDevice[]> {
  const result = await pool.query(`
    SELECT * FROM iot_devices
    WHERE status = 'online'
      AND last_reading_at IS NOT NULL
      AND last_reading_at < NOW() - (reading_interval_seconds * 3 || ' seconds')::INTERVAL
    ORDER BY last_reading_at ASC
  `);

  // יצירת התראות עבור מכשירים שהפכו לא-פעילים
  for (const device of result.rows) {
    await pool.query(
      `UPDATE iot_devices SET status = 'offline', updated_at = NOW() WHERE device_id = $1`,
      [device.device_id]
    );

    if (device.alerts_enabled) {
      await createAlert({
        device_id: device.device_id,
        device_name: device.device_name,
        alert_type: "device_offline",
        severity: "warning",
        message: `מכשיר ${device.device_name} לא פעיל מאז ${device.last_reading_at}`,
      });
    }
  }

  return result.rows;
}

/**
 * שליפת מכשיר לפי מזהה
 */
export async function getDevice(deviceId: string): Promise<IoTDevice | null> {
  const result = await pool.query(
    `SELECT * FROM iot_devices WHERE device_id = $1`,
    [deviceId]
  );
  return result.rows[0] || null;
}

/**
 * עדכון הגדרות מכשיר - שינוי סף התראות, מרווח קריאה, מטא-דאטא וכו'
 */
export async function updateDevice(
  deviceId: string,
  updates: Partial<IoTDevice>
): Promise<IoTDevice | null> {
  const allowed = [
    "device_name", "device_name_he", "device_type", "protocol",
    "connection_string", "location", "department", "machine_id",
    "machine_name", "reading_interval_seconds", "battery_level",
    "firmware_version", "alerts_enabled", "alert_thresholds", "metadata",
  ];

  const sets: string[] = [];
  const params: unknown[] = [deviceId];
  let idx = 2;

  for (const key of allowed) {
    if (key in updates) {
      let val = (updates as Record<string, unknown>)[key];
      // המרת אובייקטים ל-JSON string
      if (key === "alert_thresholds" || key === "metadata") {
        val = JSON.stringify(val);
      }
      sets.push(`${key} = $${idx}`);
      params.push(val);
      idx++;
    }
  }

  if (sets.length === 0) return getDevice(deviceId);

  sets.push("updated_at = NOW()");

  const result = await pool.query(
    `UPDATE iot_devices SET ${sets.join(", ")} WHERE device_id = $1 RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

/**
 * מחיקה רכה - העברה לסטטוס maintenance במקום מחיקה
 * כלל: לעולם לא מוחקים
 */
export async function decommissionDevice(deviceId: string): Promise<IoTDevice | null> {
  const result = await pool.query(
    `UPDATE iot_devices
     SET status = 'maintenance',
         alerts_enabled = false,
         metadata = metadata || '{"decommissioned": true, "decommissioned_at": "${new Date().toISOString()}"}'::jsonb,
         updated_at = NOW()
     WHERE device_id = $1
     RETURNING *`,
    [deviceId]
  );
  return result.rows[0] || null;
}
