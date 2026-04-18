import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use(requireAuth as any);

async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("Remnant-Management query error:", e.message); return []; }
}

async function ensureTables() {
  await q(`CREATE TABLE IF NOT EXISTS remnants (
    id SERIAL PRIMARY KEY,
    material_type VARCHAR(64),
    material_id INT,
    length NUMERIC(12,2),
    width NUMERIC(12,2),
    thickness NUMERIC(8,2),
    weight_kg NUMERIC(10,3),
    location VARCHAR(128),
    status VARCHAR(32) DEFAULT 'available' CHECK (status IN ('available','reserved','used','scrapped')),
    source_job_id INT,
    quality_grade VARCHAR(32) DEFAULT 'A',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS remnant_usage_log (
    id SERIAL PRIMARY KEY,
    remnant_id INT REFERENCES remnants(id) ON DELETE CASCADE,
    used_in_job_id INT,
    used_length NUMERIC(12,2),
    used_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

let tablesReady = false;
router.use(async (_req: Request, _res: Response, next: NextFunction) => {
  if (!tablesReady) { await ensureTables(); tablesReady = true; }
  next();
});

const s = (v: any) => v != null ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
const n = (v: any) => v != null && v !== "" ? Number(v) : "NULL";

// ========== REMNANTS CRUD ==========
router.get("/", async (req, res) => {
  const status = req.query.status as string;
  const matType = req.query.material_type as string;
  let where = "1=1";
  if (status) where += ` AND status='${status.replace(/'/g, "''")}'`;
  if (matType) where += ` AND material_type='${matType.replace(/'/g, "''")}'`;
  res.json(await q(`SELECT * FROM remnants WHERE ${where} ORDER BY created_at DESC`));
});

router.get("/dashboard", async (_req, res) => {
  const stats = await q(`SELECT
    (SELECT COUNT(*) FROM remnants WHERE status='available') as total_available,
    (SELECT COUNT(*) FROM remnants WHERE status='reserved') as total_reserved,
    (SELECT COUNT(*) FROM remnants WHERE status='used') as total_used,
    (SELECT COUNT(*) FROM remnants WHERE status='scrapped') as total_scrapped,
    (SELECT COALESCE(SUM(length * COALESCE(NULLIF(width,0),1) * COALESCE(NULLIF(thickness,0),1)), 0) FROM remnants WHERE status='available') as total_available_volume,
    (SELECT COALESCE(SUM(weight_kg), 0) FROM remnants WHERE status='available') as total_available_weight_kg,
    (SELECT COUNT(DISTINCT material_type) FROM remnants WHERE status='available') as material_types_count,
    (SELECT COALESCE(
      ROUND(COUNT(*) FILTER (WHERE status='used')::numeric / NULLIF(COUNT(*),0) * 100, 1), 0
    ) FROM remnants) as usage_rate_pct
  `);

  const topMaterials = await q(`SELECT material_type, COUNT(*) as count, SUM(weight_kg) as total_weight
    FROM remnants WHERE status='available' GROUP BY material_type ORDER BY count DESC LIMIT 10`);

  res.json({ ...(stats[0] || {}), top_materials: topMaterials });
});

router.get("/available", async (req, res) => {
  const matType = req.query.material_type as string;
  const minLen = req.query.min_length as string;
  const minWid = req.query.min_width as string;
  const grade = req.query.quality_grade as string;

  let where = "status='available'";
  if (matType) where += ` AND material_type='${matType.replace(/'/g, "''")}'`;
  if (minLen) where += ` AND length >= ${Number(minLen)}`;
  if (minWid) where += ` AND width >= ${Number(minWid)}`;
  if (grade) where += ` AND quality_grade='${grade.replace(/'/g, "''")}'`;

  res.json(await q(`SELECT * FROM remnants WHERE ${where} ORDER BY length DESC, width DESC`));
});

router.get("/:id", async (req, res) => {
  const rows = await q(`SELECT * FROM remnants WHERE id=${Number(req.params.id)}`);
  if (!rows.length) return res.status(404).json({ error: "שארית לא נמצאה" });
  res.json(rows[0]);
});

router.post("/", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO remnants (material_type, material_id, length, width, thickness, weight_kg, location, status, source_job_id, quality_grade)
    VALUES (${s(d.material_type)}, ${n(d.material_id)}, ${n(d.length)}, ${n(d.width)}, ${n(d.thickness)}, ${n(d.weight_kg)}, ${s(d.location)}, ${s(d.status || 'available')}, ${n(d.source_job_id)}, ${s(d.quality_grade || 'A')})`);
  res.json((await q(`SELECT * FROM remnants ORDER BY id DESC LIMIT 1`))[0]);
});

router.put("/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.material_type) sets.push(`material_type=${s(d.material_type)}`);
  if (d.material_id != null) sets.push(`material_id=${n(d.material_id)}`);
  if (d.length != null) sets.push(`length=${n(d.length)}`);
  if (d.width != null) sets.push(`width=${n(d.width)}`);
  if (d.thickness != null) sets.push(`thickness=${n(d.thickness)}`);
  if (d.weight_kg != null) sets.push(`weight_kg=${n(d.weight_kg)}`);
  if (d.location !== undefined) sets.push(`location=${s(d.location)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.quality_grade) sets.push(`quality_grade=${s(d.quality_grade)}`);
  if (!sets.length) return res.status(400).json({ error: "אין שדות לעדכון" });
  await q(`UPDATE remnants SET ${sets.join(",")} WHERE id=${Number(req.params.id)}`);
  res.json((await q(`SELECT * FROM remnants WHERE id=${Number(req.params.id)}`))[0]);
});

router.delete("/:id", async (req, res) => {
  await q(`DELETE FROM remnants WHERE id=${Number(req.params.id)}`);
  res.json({ success: true });
});

// ========== RESERVE / USE / SCRAP ==========
router.post("/:id/reserve", async (req, res) => {
  const id = Number(req.params.id);
  const rem = (await q(`SELECT * FROM remnants WHERE id=${id}`))[0] as any;
  if (!rem) return res.status(404).json({ error: "שארית לא נמצאה" });
  if (rem.status !== "available") return res.status(400).json({ error: "שארית לא זמינה לשריון" });
  await q(`UPDATE remnants SET status='reserved' WHERE id=${id}`);
  res.json((await q(`SELECT * FROM remnants WHERE id=${id}`))[0]);
});

router.post("/:id/use", async (req, res) => {
  const id = Number(req.params.id);
  const d = req.body;
  const rem = (await q(`SELECT * FROM remnants WHERE id=${id}`))[0] as any;
  if (!rem) return res.status(404).json({ error: "שארית לא נמצאה" });
  if (rem.status !== "available" && rem.status !== "reserved") return res.status(400).json({ error: "שארית לא זמינה לשימוש" });

  await q(`UPDATE remnants SET status='used' WHERE id=${id}`);
  await q(`INSERT INTO remnant_usage_log (remnant_id, used_in_job_id, used_length) VALUES (${id}, ${n(d.used_in_job_id)}, ${n(d.used_length)})`);

  // If partial use - create a new smaller remnant
  const usedLen = Number(d.used_length) || 0;
  const origLen = Number(rem.length) || 0;
  if (usedLen > 0 && usedLen < origLen) {
    const newLen = origLen - usedLen;
    if (newLen > 50) {
      await q(`INSERT INTO remnants (material_type, material_id, length, width, thickness, weight_kg, location, status, source_job_id, quality_grade)
        VALUES (${s(rem.material_type)}, ${n(rem.material_id)}, ${newLen}, ${n(rem.width)}, ${n(rem.thickness)}, ${n(rem.weight_kg ? (rem.weight_kg * newLen / origLen).toFixed(3) : null)}, ${s(rem.location)}, 'available', ${n(d.used_in_job_id)}, ${s(rem.quality_grade)})`);
    }
  }

  res.json((await q(`SELECT * FROM remnants WHERE id=${id}`))[0]);
});

router.post("/:id/scrap", async (req, res) => {
  const id = Number(req.params.id);
  await q(`UPDATE remnants SET status='scrapped' WHERE id=${id}`);
  res.json((await q(`SELECT * FROM remnants WHERE id=${id}`))[0]);
});

// ========== USAGE LOG ==========
router.get("/:id/usage-log", async (req, res) => {
  res.json(await q(`SELECT * FROM remnant_usage_log WHERE remnant_id=${Number(req.params.id)} ORDER BY used_at DESC`));
});

router.get("/usage-log/all", async (_req, res) => {
  res.json(await q(`SELECT l.*, r.material_type, r.length as original_length FROM remnant_usage_log l LEFT JOIN remnants r ON l.remnant_id=r.id ORDER BY l.used_at DESC LIMIT 200`));
});

export default router;
