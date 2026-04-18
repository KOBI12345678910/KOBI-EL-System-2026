import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fleet_vehicles (
      id SERIAL PRIMARY KEY,
      vehicle_number VARCHAR(30) UNIQUE NOT NULL,
      vehicle_type VARCHAR(50) NOT NULL DEFAULT 'truck',
      make VARCHAR(100),
      model VARCHAR(100),
      year INTEGER,
      plate VARCHAR(20) UNIQUE NOT NULL,
      capacity_kg DECIMAL(10,2) DEFAULT 0,
      capacity_cbm DECIMAL(10,2) DEFAULT 0,
      fuel_type VARCHAR(30) DEFAULT 'diesel',
      odometer INTEGER DEFAULT 0,
      status VARCHAR(30) DEFAULT 'available',
      color VARCHAR(50),
      assigned_driver_id INTEGER,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fleet_drivers (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(200) NOT NULL,
      phone VARCHAR(30),
      email VARCHAR(200),
      license_number VARCHAR(50),
      license_type VARCHAR(20) DEFAULT 'B',
      license_expiry DATE,
      assigned_vehicle_id INTEGER,
      status VARCHAR(30) DEFAULT 'active',
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fleet_fuel_logs (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER REFERENCES fleet_vehicles(id),
      driver_id INTEGER REFERENCES fleet_drivers(id),
      log_date DATE DEFAULT CURRENT_DATE,
      liters DECIMAL(10,2) DEFAULT 0,
      cost_per_liter DECIMAL(10,2) DEFAULT 0,
      total_cost DECIMAL(10,2) DEFAULT 0,
      odometer INTEGER DEFAULT 0,
      fuel_station VARCHAR(200),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fleet_maintenance_schedules (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER REFERENCES fleet_vehicles(id),
      maintenance_type VARCHAR(100) NOT NULL,
      interval_km INTEGER,
      interval_days INTEGER,
      last_service_date DATE,
      last_service_odometer INTEGER,
      next_due_date DATE,
      next_due_odometer INTEGER,
      status VARCHAR(30) DEFAULT 'upcoming',
      cost DECIMAL(10,2) DEFAULT 0,
      service_provider VARCHAR(200),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fleet_insurance_policies (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER REFERENCES fleet_vehicles(id),
      policy_number VARCHAR(100) UNIQUE NOT NULL,
      provider VARCHAR(200) NOT NULL,
      coverage_type VARCHAR(50) DEFAULT 'comprehensive',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      premium_amount DECIMAL(10,2) DEFAULT 0,
      contact_phone VARCHAR(30),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS delivery_routes (
      id SERIAL PRIMARY KEY,
      route_name VARCHAR(200) NOT NULL,
      stops JSONB DEFAULT '[]',
      total_distance_km DECIMAL(10,2) DEFAULT 0,
      estimated_duration_min INTEGER DEFAULT 0,
      vehicle_id INTEGER REFERENCES fleet_vehicles(id),
      driver_id INTEGER REFERENCES fleet_drivers(id),
      optimization_score DECIMAL(5,2) DEFAULT 0,
      status VARCHAR(30) DEFAULT 'planned',
      scheduled_date DATE DEFAULT CURRENT_DATE,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS delivery_schedules (
      id SERIAL PRIMARY KEY,
      schedule_number VARCHAR(30) UNIQUE,
      order_id INTEGER,
      customer_id INTEGER,
      customer_name VARCHAR(200),
      delivery_address TEXT,
      time_window_start TIMESTAMP,
      time_window_end TIMESTAMP,
      appointment_type VARCHAR(30) DEFAULT 'morning',
      driver_id INTEGER REFERENCES fleet_drivers(id),
      vehicle_id INTEGER REFERENCES fleet_vehicles(id),
      route_id INTEGER REFERENCES delivery_routes(id),
      status VARCHAR(30) DEFAULT 'scheduled',
      priority VARCHAR(20) DEFAULT 'normal',
      contact_phone VARCHAR(30),
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS warehouse_delivery_triggers (
      id SERIAL PRIMARY KEY,
      pick_order_id INTEGER NOT NULL,
      auto_scheduled BOOLEAN DEFAULT false,
      delivery_schedule_id INTEGER REFERENCES delivery_schedules(id),
      triggered_at TIMESTAMP DEFAULT NOW(),
      processed_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

export { ensureTables as ensureFleetLogisticsTables };

// ===== VEHICLES =====
router.get("/fleet/vehicles", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT fv.*, fd.full_name as driver_name
      FROM fleet_vehicles fv
      LEFT JOIN fleet_drivers fd ON fd.id = fv.assigned_driver_id
      WHERE fv.is_active = true
      ORDER BY fv.created_at DESC
    `);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/fleet/vehicles/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='available') as available,
        COUNT(*) FILTER (WHERE status='in_use') as in_use,
        COUNT(*) FILTER (WHERE status='maintenance') as maintenance,
        COUNT(*) FILTER (WHERE status='inactive') as inactive
      FROM fleet_vehicles WHERE is_active=true
    `);
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/fleet/vehicles", async (req, res) => {
  try {
    const b = req.body;
    const num = b.vehicle_number || `VEH-${Date.now()}`;
    const r = await pool.query(`
      INSERT INTO fleet_vehicles (vehicle_number, vehicle_type, make, model, year, plate, capacity_kg, capacity_cbm, fuel_type, odometer, status, color, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [num, b.vehicle_type || 'truck', b.make, b.model, b.year, b.plate, b.capacity_kg || 0, b.capacity_cbm || 0, b.fuel_type || 'diesel', b.odometer || 0, b.status || 'available', b.color, b.notes]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/fleet/vehicles/:id", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      UPDATE fleet_vehicles SET
        vehicle_type=COALESCE($1,vehicle_type), make=COALESCE($2,make), model=COALESCE($3,model),
        plate=COALESCE($4,plate), capacity_kg=COALESCE($5,capacity_kg), capacity_cbm=COALESCE($6,capacity_cbm),
        fuel_type=COALESCE($7,fuel_type), odometer=COALESCE($8,odometer), status=COALESCE($9,status),
        assigned_driver_id=$10, notes=COALESCE($11,notes), updated_at=NOW()
      WHERE id=$12 RETURNING *`,
      [b.vehicle_type, b.make, b.model, b.plate, b.capacity_kg, b.capacity_cbm, b.fuel_type, b.odometer, b.status, b.assigned_driver_id, b.notes, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/fleet/vehicles/:id", async (req, res) => {
  try {
    await pool.query("UPDATE fleet_vehicles SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ===== DRIVERS =====
router.get("/fleet/drivers", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT fd.*, fv.plate as vehicle_plate, fv.vehicle_type
      FROM fleet_drivers fd
      LEFT JOIN fleet_vehicles fv ON fv.id = fd.assigned_vehicle_id
      WHERE fd.is_active = true
      ORDER BY fd.full_name
    `);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/fleet/drivers", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO fleet_drivers (full_name, phone, email, license_number, license_type, license_expiry, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.full_name, b.phone, b.email, b.license_number, b.license_type || 'B', b.license_expiry, b.status || 'active', b.notes]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/fleet/drivers/:id", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      UPDATE fleet_drivers SET
        full_name=COALESCE($1,full_name), phone=COALESCE($2,phone),
        license_type=COALESCE($3,license_type), license_expiry=$4,
        assigned_vehicle_id=$5, status=COALESCE($6,status), notes=COALESCE($7,notes), updated_at=NOW()
      WHERE id=$8 RETURNING *`,
      [b.full_name, b.phone, b.license_type, b.license_expiry, b.assigned_vehicle_id, b.status, b.notes, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/fleet/drivers/:id", async (req, res) => {
  try {
    await pool.query("UPDATE fleet_drivers SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ===== FUEL LOGS =====
router.get("/fleet/fuel-logs", async (req, res) => {
  try {
    const vehicleId = req.query.vehicle_id;
    const where = vehicleId ? "WHERE fl.vehicle_id=$1" : "";
    const params = vehicleId ? [vehicleId] : [];
    const r = await pool.query(`
      SELECT fl.*, fv.plate as vehicle_plate, fd.full_name as driver_name
      FROM fleet_fuel_logs fl
      LEFT JOIN fleet_vehicles fv ON fv.id = fl.vehicle_id
      LEFT JOIN fleet_drivers fd ON fd.id = fl.driver_id
      ${where}
      ORDER BY fl.log_date DESC, fl.created_at DESC
    `, params);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/fleet/fuel-logs", async (req, res) => {
  try {
    const b = req.body;
    const total = (parseFloat(b.liters) || 0) * (parseFloat(b.cost_per_liter) || 0);
    const r = await pool.query(`
      INSERT INTO fleet_fuel_logs (vehicle_id, driver_id, log_date, liters, cost_per_liter, total_cost, odometer, fuel_station, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.vehicle_id, b.driver_id, b.log_date || new Date(), b.liters || 0, b.cost_per_liter || 0, b.total_cost || total, b.odometer || 0, b.fuel_station, b.notes]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/fleet/fuel-logs/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM fleet_fuel_logs WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ===== MAINTENANCE =====
router.get("/fleet/maintenance", async (req, res) => {
  try {
    const vehicleId = req.query.vehicle_id;
    const where = vehicleId ? "WHERE ms.vehicle_id=$1" : "";
    const params = vehicleId ? [vehicleId] : [];
    const r = await pool.query(`
      SELECT ms.*, fv.plate as vehicle_plate, fv.make, fv.model
      FROM fleet_maintenance_schedules ms
      LEFT JOIN fleet_vehicles fv ON fv.id = ms.vehicle_id
      ${where}
      ORDER BY ms.next_due_date ASC NULLS LAST
    `, params);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/fleet/maintenance/alerts", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT ms.*, fv.plate, fv.make, fv.model,
        CASE
          WHEN ms.next_due_date <= CURRENT_DATE + 30 THEN 'urgent'
          WHEN ms.next_due_date <= CURRENT_DATE + 60 THEN 'warning'
          WHEN ms.next_due_date <= CURRENT_DATE + 90 THEN 'notice'
          ELSE 'ok'
        END as alert_level,
        (ms.next_due_date - CURRENT_DATE) as days_until_due
      FROM fleet_maintenance_schedules ms
      LEFT JOIN fleet_vehicles fv ON fv.id = ms.vehicle_id
      WHERE ms.next_due_date IS NOT NULL AND ms.next_due_date <= CURRENT_DATE + 90
      ORDER BY ms.next_due_date ASC
    `);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/fleet/maintenance", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO fleet_maintenance_schedules (vehicle_id, maintenance_type, interval_km, interval_days, last_service_date, last_service_odometer, next_due_date, next_due_odometer, status, cost, service_provider, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [b.vehicle_id, b.maintenance_type, b.interval_km, b.interval_days, b.last_service_date, b.last_service_odometer, b.next_due_date, b.next_due_odometer, b.status || 'upcoming', b.cost || 0, b.service_provider, b.notes]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/fleet/maintenance/:id", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      UPDATE fleet_maintenance_schedules SET
        maintenance_type=COALESCE($1,maintenance_type), last_service_date=$2,
        last_service_odometer=COALESCE($3,last_service_odometer), next_due_date=$4,
        next_due_odometer=COALESCE($5,next_due_odometer), status=COALESCE($6,status),
        cost=COALESCE($7,cost), service_provider=COALESCE($8,service_provider), notes=COALESCE($9,notes), updated_at=NOW()
      WHERE id=$10 RETURNING *`,
      [b.maintenance_type, b.last_service_date, b.last_service_odometer, b.next_due_date, b.next_due_odometer, b.status, b.cost, b.service_provider, b.notes, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/fleet/maintenance/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM fleet_maintenance_schedules WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ===== INSURANCE =====
router.get("/fleet/insurance", async (req, res) => {
  try {
    const vehicleId = req.query.vehicle_id;
    const where = vehicleId ? "WHERE ip.vehicle_id=$1" : "";
    const params = vehicleId ? [vehicleId] : [];
    const r = await pool.query(`
      SELECT ip.*, fv.plate as vehicle_plate, fv.make, fv.model,
        CASE
          WHEN ip.end_date <= CURRENT_DATE + 30 THEN 'urgent'
          WHEN ip.end_date <= CURRENT_DATE + 60 THEN 'warning'
          WHEN ip.end_date <= CURRENT_DATE + 90 THEN 'notice'
          ELSE 'ok'
        END as alert_level,
        (ip.end_date - CURRENT_DATE) as days_until_expiry
      FROM fleet_insurance_policies ip
      LEFT JOIN fleet_vehicles fv ON fv.id = ip.vehicle_id
      ${where}
      ORDER BY ip.end_date ASC
    `, params);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/fleet/insurance", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO fleet_insurance_policies (vehicle_id, policy_number, provider, coverage_type, start_date, end_date, premium_amount, contact_phone, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.vehicle_id, b.policy_number, b.provider, b.coverage_type || 'comprehensive', b.start_date, b.end_date, b.premium_amount || 0, b.contact_phone, b.notes]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/fleet/insurance/:id", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      UPDATE fleet_insurance_policies SET
        provider=COALESCE($1,provider), coverage_type=COALESCE($2,coverage_type),
        start_date=COALESCE($3,start_date), end_date=COALESCE($4,end_date),
        premium_amount=COALESCE($5,premium_amount), contact_phone=COALESCE($6,contact_phone), notes=COALESCE($7,notes), updated_at=NOW()
      WHERE id=$8 RETURNING *`,
      [b.provider, b.coverage_type, b.start_date, b.end_date, b.premium_amount, b.contact_phone, b.notes, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/fleet/insurance/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM fleet_insurance_policies WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ===== DELIVERY ROUTES =====
router.get("/fleet/routes", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT dr.*, fv.plate as vehicle_plate, fd.full_name as driver_name
      FROM delivery_routes dr
      LEFT JOIN fleet_vehicles fv ON fv.id = dr.vehicle_id
      LEFT JOIN fleet_drivers fd ON fd.id = dr.driver_id
      WHERE dr.is_active = true
      ORDER BY dr.scheduled_date DESC, dr.created_at DESC
    `);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/fleet/routes", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO delivery_routes (route_name, stops, total_distance_km, estimated_duration_min, vehicle_id, driver_id, optimization_score, status, scheduled_date, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.route_name, JSON.stringify(b.stops || []), b.total_distance_km || 0, b.estimated_duration_min || 0, b.vehicle_id, b.driver_id, b.optimization_score || 0, b.status || 'planned', b.scheduled_date || new Date(), b.notes]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/fleet/routes/:id", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      UPDATE delivery_routes SET
        route_name=COALESCE($1,route_name), stops=COALESCE($2::jsonb,stops),
        total_distance_km=COALESCE($3,total_distance_km), estimated_duration_min=COALESCE($4,estimated_duration_min),
        vehicle_id=$5, driver_id=$6, status=COALESCE($7,status),
        scheduled_date=COALESCE($8,scheduled_date), notes=COALESCE($9,notes), updated_at=NOW()
      WHERE id=$10 RETURNING *`,
      [b.route_name, b.stops ? JSON.stringify(b.stops) : null, b.total_distance_km, b.estimated_duration_min, b.vehicle_id, b.driver_id, b.status, b.scheduled_date, b.notes, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/fleet/routes/:id", async (req, res) => {
  try {
    await pool.query("UPDATE delivery_routes SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ===== ROUTE OPTIMIZATION =====
router.post("/fleet/routes/optimize", async (req, res) => {
  try {
    const { stops, vehicle_id } = req.body;
    if (!stops || stops.length === 0) {
      return res.json({ optimized: [], total_distance_km: 0, estimated_duration_min: 0, optimization_score: 0 });
    }

    let vehicle = null;
    if (vehicle_id) {
      const vr = await pool.query("SELECT * FROM fleet_vehicles WHERE id=$1", [vehicle_id]);
      vehicle = vr.rows[0];
    }

    const optimized = optimizeRoute(stops, vehicle);
    res.json(optimized);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

function calcDistance(a: any, b: any): number {
  const lat1 = parseFloat(a.lat) || 0, lon1 = parseFloat(a.lng) || 0;
  const lat2 = parseFloat(b.lat) || 0, lon2 = parseFloat(b.lng) || 0;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a2 = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1-a2));
}

function optimizeRoute(stops: any[], vehicle: any) {
  if (stops.length <= 1) {
    return { optimized: stops, total_distance_km: 0, estimated_duration_min: 0, optimization_score: 100 };
  }

  const hasCoords = stops.every(s => s.lat && s.lng);
  let optimized: any[];

  if (hasCoords) {
    const unvisited = [...stops];
    const result: any[] = [];
    let current = unvisited.shift()!;
    result.push(current);
    while (unvisited.length > 0) {
      const timeNow = new Date(current.time_window_start || Date.now());
      const feasible = unvisited.filter(s => {
        if (!s.time_window_end) return true;
        const tw = new Date(s.time_window_end);
        return tw >= timeNow;
      });
      const pool2 = feasible.length > 0 ? feasible : unvisited;
      let nearest = pool2[0];
      let minDist = calcDistance(current, nearest);
      for (const s of pool2.slice(1)) {
        const d = calcDistance(current, s);
        if (d < minDist) { minDist = d; nearest = s; }
      }
      result.push(nearest);
      unvisited.splice(unvisited.indexOf(nearest), 1);
      current = nearest;
    }
    optimized = result;
  } else {
    optimized = stops.map((s, i) => ({ ...s, sequence: i + 1 }));
  }

  let totalDist = 0;
  for (let i = 1; i < optimized.length; i++) {
    if (optimized[i].lat && optimized[i-1].lat) {
      totalDist += calcDistance(optimized[i-1], optimized[i]);
    } else {
      totalDist += 15;
    }
  }

  const avgSpeedKph = 40;
  const stopTimeMin = 15;
  const durationMin = Math.round((totalDist / avgSpeedKph) * 60 + (optimized.length * stopTimeMin));

  const maxCapKg = vehicle?.capacity_kg || Infinity;
  const totalWeightKg = optimized.reduce((s: number, st: any) => s + (parseFloat(st.weight_kg) || 0), 0);
  const capacityOk = totalWeightKg <= maxCapKg;

  const score = Math.min(100, Math.round(80 + (optimized.length > 1 ? 10 : 0) + (capacityOk ? 10 : 0)));

  return {
    optimized: optimized.map((s, i) => ({ ...s, sequence: i + 1 })),
    total_distance_km: Math.round(totalDist * 10) / 10,
    estimated_duration_min: durationMin,
    optimization_score: score,
    capacity_warning: !capacityOk
  };
}

// ===== DELIVERY SCHEDULES =====
router.get("/fleet/schedules", async (req, res) => {
  try {
    const date = req.query.date as string;
    const driverId = req.query.driver_id;
    const conditions = ["ds.is_active=true"];
    const params: any[] = [];
    if (date) { params.push(date); conditions.push(`ds.time_window_start::date=$${params.length}`); }
    if (driverId) { params.push(driverId); conditions.push(`ds.driver_id=$${params.length}`); }
    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const r = await pool.query(`
      SELECT ds.*, fd.full_name as driver_name, fv.plate as vehicle_plate
      FROM delivery_schedules ds
      LEFT JOIN fleet_drivers fd ON fd.id = ds.driver_id
      LEFT JOIN fleet_vehicles fv ON fv.id = ds.vehicle_id
      ${where}
      ORDER BY ds.time_window_start ASC
    `, params);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/fleet/schedules", async (req, res) => {
  try {
    const b = req.body;
    const num = b.schedule_number || `SCH-${Date.now()}`;
    const r = await pool.query(`
      INSERT INTO delivery_schedules (schedule_number, order_id, customer_id, customer_name, delivery_address, time_window_start, time_window_end, appointment_type, driver_id, vehicle_id, route_id, status, priority, contact_phone, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [num, b.order_id, b.customer_id, b.customer_name, b.delivery_address, b.time_window_start, b.time_window_end, b.appointment_type || 'morning', b.driver_id, b.vehicle_id, b.route_id, b.status || 'scheduled', b.priority || 'normal', b.contact_phone, b.notes]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/fleet/schedules/:id", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      UPDATE delivery_schedules SET
        customer_name=COALESCE($1,customer_name), delivery_address=COALESCE($2,delivery_address),
        time_window_start=COALESCE($3,time_window_start), time_window_end=COALESCE($4,time_window_end),
        appointment_type=COALESCE($5,appointment_type), driver_id=$6, vehicle_id=$7, route_id=$8,
        status=COALESCE($9,status), priority=COALESCE($10,priority), notes=COALESCE($11,notes), updated_at=NOW()
      WHERE id=$12 RETURNING *`,
      [b.customer_name, b.delivery_address, b.time_window_start, b.time_window_end, b.appointment_type, b.driver_id, b.vehicle_id, b.route_id, b.status, b.priority, b.notes, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/fleet/schedules/:id", async (req, res) => {
  try {
    await pool.query("UPDATE delivery_schedules SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ===== TIME WINDOW AVAILABILITY =====
router.get("/fleet/schedules/availability", async (req, res) => {
  try {
    const date = req.query.date as string;
    if (!date) return res.status(400).json({ error: "date required" });
    const r = await pool.query(`
      SELECT driver_id, fd.full_name as driver_name,
        array_agg(appointment_type ORDER BY time_window_start) as booked_slots,
        COUNT(*) as booking_count
      FROM delivery_schedules ds
      LEFT JOIN fleet_drivers fd ON fd.id = ds.driver_id
      WHERE ds.time_window_start::date = $1 AND ds.is_active=true AND ds.status != 'cancelled'
      GROUP BY ds.driver_id, fd.full_name
    `, [date]);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ===== WAREHOUSE->DELIVERY AUTOMATION =====
router.post("/fleet/warehouse-trigger", async (req, res) => {
  try {
    const { pick_order_id, customer_name, delivery_address, customer_id, order_id } = req.body;

    const existingTrigger = await pool.query(
      "SELECT * FROM warehouse_delivery_triggers WHERE pick_order_id=$1", [pick_order_id]
    );
    if (existingTrigger.rows.length > 0) {
      return res.json({ already_processed: true, trigger: existingTrigger.rows[0] });
    }

    const availableDrivers = await pool.query(`
      SELECT fd.*, COUNT(ds.id) as schedule_count
      FROM fleet_drivers fd
      LEFT JOIN delivery_schedules ds ON ds.driver_id=fd.id AND ds.time_window_start::date=CURRENT_DATE AND ds.is_active=true
      WHERE fd.is_active=true AND fd.status='active'
      GROUP BY fd.id
      ORDER BY schedule_count ASC, fd.id ASC
      LIMIT 1
    `);

    const suggestedDriver = availableDrivers.rows[0];

    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    const windowStart = new Date(nextDay);
    windowStart.setHours(8, 0, 0, 0);
    const windowEnd = new Date(nextDay);
    windowEnd.setHours(12, 0, 0, 0);

    const schedNum = `SCH-AUTO-${Date.now()}`;
    const schedule = await pool.query(`
      INSERT INTO delivery_schedules (schedule_number, order_id, customer_id, customer_name, delivery_address, time_window_start, time_window_end, appointment_type, driver_id, status, priority, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'morning',$8,'scheduled','normal',$9) RETURNING *`,
      [schedNum, order_id, customer_id, customer_name, delivery_address, windowStart, windowEnd, suggestedDriver?.id, `יצירה אוטומטית ממחסן — הזמנה #${pick_order_id}`]
    );

    const trigger = await pool.query(`
      INSERT INTO warehouse_delivery_triggers (pick_order_id, auto_scheduled, delivery_schedule_id, processed_at)
      VALUES ($1, true, $2, NOW()) RETURNING *`,
      [pick_order_id, schedule.rows[0].id]
    );

    res.json({
      trigger: trigger.rows[0],
      schedule: schedule.rows[0],
      suggested_driver: suggestedDriver
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/fleet/warehouse-triggers", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT wdt.*, ds.schedule_number, ds.customer_name, ds.status as schedule_status
      FROM warehouse_delivery_triggers wdt
      LEFT JOIN delivery_schedules ds ON ds.id = wdt.delivery_schedule_id
      ORDER BY wdt.created_at DESC
    `);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
