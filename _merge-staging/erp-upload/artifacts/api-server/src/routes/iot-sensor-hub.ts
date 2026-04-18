import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

/* ================================================================
   IoT & Sensor Integration Hub  --  TechnoKoluzi ERP
   Beyond SAP/Oracle -- real-time industrial telemetry engine
   ================================================================ */

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS iot_devices (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(120) UNIQUE NOT NULL,
      name VARCHAR(300) NOT NULL,
      device_type VARCHAR(40) NOT NULL CHECK (device_type IN ('temperature','humidity','vibration','pressure','energy','weight','flow','gas','light','proximity')),
      location VARCHAR(300),
      machine_id VARCHAR(120),
      status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online','offline','error','maintenance')),
      last_reading TIMESTAMPTZ,
      config JSONB DEFAULT '{}',
      firmware_version VARCHAR(60),
      battery_level NUMERIC,
      ip_address VARCHAR(50),
      protocol VARCHAR(30) DEFAULT 'mqtt',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS iot_readings (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(120) NOT NULL,
      value NUMERIC NOT NULL,
      unit VARCHAR(30) NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      quality VARCHAR(20) DEFAULT 'good' CHECK (quality IN ('good','suspect','bad')),
      metadata JSONB DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_iot_readings_device_ts ON iot_readings(device_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_iot_readings_ts ON iot_readings(timestamp DESC);

    CREATE TABLE IF NOT EXISTS iot_rules (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(120) NOT NULL,
      rule_name VARCHAR(300) NOT NULL,
      condition_type VARCHAR(30) NOT NULL CHECK (condition_type IN ('above','below','range','rate_of_change','anomaly','dead_band','pattern')),
      threshold_value NUMERIC,
      threshold_high NUMERIC,
      duration_seconds INT DEFAULT 0,
      action VARCHAR(30) DEFAULT 'alert' CHECK (action IN ('alert','stop_machine','notify','log','escalate','webhook')),
      action_config JSONB DEFAULT '{}',
      enabled BOOLEAN DEFAULT true,
      cooldown_seconds INT DEFAULT 300,
      last_triggered TIMESTAMPTZ,
      trigger_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS iot_alerts (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(120) NOT NULL,
      rule_id INT,
      alert_type VARCHAR(40) NOT NULL CHECK (alert_type IN ('threshold_exceeded','device_offline','anomaly','trend_warning','battery_low','connection_lost','maintenance_due')),
      severity VARCHAR(20) NOT NULL CHECK (severity IN ('info','warning','critical','emergency')),
      message TEXT NOT NULL,
      value NUMERIC,
      threshold NUMERIC,
      acknowledged BOOLEAN DEFAULT false,
      acknowledged_by VARCHAR(200),
      acknowledged_at TIMESTAMPTZ,
      resolved BOOLEAN DEFAULT false,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_iot_alerts_device ON iot_alerts(device_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_iot_alerts_severity ON iot_alerts(severity, acknowledged);
  `);
}
ensureTables();

// ======================== DEVICES ========================

router.get("/iot/devices", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM iot_devices ORDER BY status='online' DESC, name ASC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/iot/devices/:deviceId", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM iot_devices WHERE device_id=$1`, [req.params.deviceId]);
    if (!rows.length) return res.status(404).json({ error: "Device not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/iot/devices", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO iot_devices (device_id, name, device_type, location, machine_id, status, config, firmware_version, battery_level, ip_address, protocol)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [d.device_id, d.name, d.device_type, d.location, d.machine_id, d.status || 'offline', d.config || {}, d.firmware_version, d.battery_level, d.ip_address, d.protocol || 'mqtt']
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/iot/devices/:id", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `UPDATE iot_devices SET name=$1, device_type=$2, location=$3, machine_id=$4, status=$5, config=$6, firmware_version=$7, battery_level=$8, ip_address=$9, protocol=$10, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [d.name, d.device_type, d.location, d.machine_id, d.status, d.config, d.firmware_version, d.battery_level, d.ip_address, d.protocol, req.params.id]
    );
    res.json(rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/iot/devices/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM iot_devices WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== READINGS (batch ingest) ========================

router.post("/iot/readings", async (req, res) => {
  try {
    const readings = Array.isArray(req.body) ? req.body : [req.body];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const r of readings) {
        await client.query(
          `INSERT INTO iot_readings (device_id, value, unit, timestamp, quality, metadata) VALUES ($1,$2,$3,$4,$5,$6)`,
          [r.device_id, r.value, r.unit, r.timestamp || new Date(), r.quality || 'good', r.metadata || {}]
        );
        // Update device last_reading + status
        await client.query(
          `UPDATE iot_devices SET last_reading=NOW(), status='online', updated_at=NOW() WHERE device_id=$1`,
          [r.device_id]
        );
        // Check rules for this device
        const rules = await client.query(
          `SELECT * FROM iot_rules WHERE device_id=$1 AND enabled=true`, [r.device_id]
        );
        for (const rule of rules.rows) {
          let triggered = false;
          if (rule.condition_type === 'above' && r.value > rule.threshold_value) triggered = true;
          if (rule.condition_type === 'below' && r.value < rule.threshold_value) triggered = true;
          if (rule.condition_type === 'range' && (r.value < rule.threshold_value || r.value > rule.threshold_high)) triggered = true;

          if (triggered) {
            // Respect cooldown
            if (rule.last_triggered) {
              const elapsed = (Date.now() - new Date(rule.last_triggered).getTime()) / 1000;
              if (elapsed < rule.cooldown_seconds) continue;
            }
            const severity = rule.condition_type === 'anomaly' ? 'critical' : r.value > (rule.threshold_high || rule.threshold_value) * 1.5 ? 'emergency' : 'warning';
            await client.query(
              `INSERT INTO iot_alerts (device_id, rule_id, alert_type, severity, message, value, threshold)
               VALUES ($1,$2,'threshold_exceeded',$3,$4,$5,$6)`,
              [r.device_id, rule.id, severity, `${rule.rule_name}: value ${r.value} ${rule.condition_type} threshold ${rule.threshold_value}`, r.value, rule.threshold_value]
            );
            await client.query(
              `UPDATE iot_rules SET last_triggered=NOW(), trigger_count=trigger_count+1 WHERE id=$1`, [rule.id]
            );
          }
        }
      }
      await client.query("COMMIT");
      res.json({ success: true, ingested: readings.length });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally { client.release(); }
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/iot/readings/:deviceId", async (req, res) => {
  try {
    const from = req.query.from || new Date(Date.now() - 24 * 3600000).toISOString();
    const to = req.query.to || new Date().toISOString();
    const limit = Math.min(Number(req.query.limit) || 500, 5000);
    const { rows } = await pool.query(
      `SELECT * FROM iot_readings WHERE device_id=$1 AND timestamp BETWEEN $2 AND $3 ORDER BY timestamp DESC LIMIT $4`,
      [req.params.deviceId, from, to, limit]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== RULES ========================

router.get("/iot/rules", async (req, res) => {
  try {
    const deviceId = req.query.device_id;
    const query = deviceId
      ? `SELECT r.*, d.name as device_name FROM iot_rules r LEFT JOIN iot_devices d ON d.device_id=r.device_id WHERE r.device_id=$1 ORDER BY r.created_at DESC`
      : `SELECT r.*, d.name as device_name FROM iot_rules r LEFT JOIN iot_devices d ON d.device_id=r.device_id ORDER BY r.created_at DESC`;
    const { rows } = deviceId ? await pool.query(query, [deviceId]) : await pool.query(query);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/iot/rules", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO iot_rules (device_id, rule_name, condition_type, threshold_value, threshold_high, duration_seconds, action, action_config, enabled, cooldown_seconds)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [d.device_id, d.rule_name, d.condition_type, d.threshold_value, d.threshold_high, d.duration_seconds || 0, d.action || 'alert', d.action_config || {}, d.enabled !== false, d.cooldown_seconds || 300]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/iot/rules/:id", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `UPDATE iot_rules SET rule_name=$1, condition_type=$2, threshold_value=$3, threshold_high=$4, duration_seconds=$5, action=$6, action_config=$7, enabled=$8, cooldown_seconds=$9, updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [d.rule_name, d.condition_type, d.threshold_value, d.threshold_high, d.duration_seconds, d.action, d.action_config, d.enabled, d.cooldown_seconds, req.params.id]
    );
    res.json(rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/iot/rules/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM iot_rules WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== ALERTS ========================

router.get("/iot/alerts", async (req, res) => {
  try {
    const severity = req.query.severity;
    const acknowledged = req.query.acknowledged;
    let query = `SELECT a.*, d.name as device_name FROM iot_alerts a LEFT JOIN iot_devices d ON d.device_id=a.device_id WHERE 1=1`;
    const params: any[] = [];
    if (severity) { params.push(severity); query += ` AND a.severity=$${params.length}`; }
    if (acknowledged !== undefined) { params.push(acknowledged === 'true'); query += ` AND a.acknowledged=$${params.length}`; }
    query += ` ORDER BY a.created_at DESC LIMIT 200`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/iot/alerts/:id/acknowledge", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE iot_alerts SET acknowledged=true, acknowledged_by=$1, acknowledged_at=NOW() WHERE id=$2 RETURNING *`,
      [req.body.acknowledged_by || 'system', req.params.id]
    );
    res.json(rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/iot/alerts/:id/resolve", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE iot_alerts SET resolved=true, resolved_at=NOW(), acknowledged=true, acknowledged_by=COALESCE(acknowledged_by,$1), acknowledged_at=COALESCE(acknowledged_at,NOW()) WHERE id=$2 RETURNING *`,
      [req.body.resolved_by || 'system', req.params.id]
    );
    res.json(rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== DASHBOARD ========================

router.get("/iot/dashboard", async (_req, res) => {
  try {
    const [devices, alerts, readings, rules] = await Promise.all([
      pool.query(`SELECT
        COUNT(*) as total_devices,
        COUNT(*) FILTER(WHERE status='online') as online,
        COUNT(*) FILTER(WHERE status='offline') as offline,
        COUNT(*) FILTER(WHERE status='error') as error_count,
        COUNT(*) FILTER(WHERE status='maintenance') as maintenance,
        COUNT(DISTINCT device_type) as device_types,
        COUNT(DISTINCT location) as locations
        FROM iot_devices`),
      pool.query(`SELECT
        COUNT(*) as total_alerts,
        COUNT(*) FILTER(WHERE severity='emergency') as emergencies,
        COUNT(*) FILTER(WHERE severity='critical') as critical,
        COUNT(*) FILTER(WHERE severity='warning') as warnings,
        COUNT(*) FILTER(WHERE acknowledged=false) as unacknowledged,
        COUNT(*) FILTER(WHERE resolved=false AND created_at >= NOW() - INTERVAL '24 hours') as active_24h
        FROM iot_alerts`),
      pool.query(`SELECT
        COUNT(*) as total_readings,
        COUNT(*) FILTER(WHERE timestamp >= NOW() - INTERVAL '1 hour') as last_hour,
        COUNT(*) FILTER(WHERE quality='bad') as bad_quality,
        AVG(value) FILTER(WHERE timestamp >= NOW() - INTERVAL '1 hour') as avg_value_1h
        FROM iot_readings`),
      pool.query(`SELECT COUNT(*) as total_rules, COUNT(*) FILTER(WHERE enabled=true) as active_rules FROM iot_rules`)
    ]);

    // Recent readings by device type
    const { rows: byType } = await pool.query(`
      SELECT d.device_type, COUNT(r.id) as reading_count, AVG(r.value) as avg_value, MAX(r.value) as max_value, MIN(r.value) as min_value
      FROM iot_devices d LEFT JOIN iot_readings r ON r.device_id=d.device_id AND r.timestamp >= NOW() - INTERVAL '1 hour'
      GROUP BY d.device_type ORDER BY reading_count DESC
    `);

    // Top alerting devices
    const { rows: topAlerting } = await pool.query(`
      SELECT a.device_id, d.name, COUNT(*) as alert_count, MAX(a.severity) as max_severity
      FROM iot_alerts a LEFT JOIN iot_devices d ON d.device_id=a.device_id
      WHERE a.created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY a.device_id, d.name ORDER BY alert_count DESC LIMIT 10
    `);

    res.json({
      devices: devices.rows[0],
      alerts: alerts.rows[0],
      readings: readings.rows[0],
      rules: rules.rows[0],
      byType,
      topAlerting,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== ANALYTICS ========================

router.get("/iot/analytics/:deviceId", async (req, res) => {
  try {
    const hours = Number(req.query.hours) || 24;
    const { rows: timeseries } = await pool.query(`
      SELECT date_trunc('hour', timestamp) as hour, AVG(value) as avg_val, MIN(value) as min_val, MAX(value) as max_val, COUNT(*) as readings
      FROM iot_readings WHERE device_id=$1 AND timestamp >= NOW() - INTERVAL '${hours} hours'
      GROUP BY hour ORDER BY hour ASC
    `, [req.params.deviceId]);

    const { rows: stats } = await pool.query(`
      SELECT AVG(value) as mean, STDDEV(value) as stddev, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) as median,
             MIN(value) as min_val, MAX(value) as max_val, COUNT(*) as total
      FROM iot_readings WHERE device_id=$1 AND timestamp >= NOW() - INTERVAL '${hours} hours'
    `, [req.params.deviceId]);

    res.json({ timeseries, stats: stats[0] || {} });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
