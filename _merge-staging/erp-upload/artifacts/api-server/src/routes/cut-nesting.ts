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
  catch (e: any) { console.error("Cut-Nesting query error:", e.message); return []; }
}

async function ensureTables() {
  await q(`CREATE TABLE IF NOT EXISTS nesting_jobs (
    id SERIAL PRIMARY KEY,
    job_number VARCHAR(64) UNIQUE,
    material_type VARCHAR(32) CHECK (material_type IN ('profile','sheet','glass')),
    source_material_id INT,
    raw_length NUMERIC(12,2),
    raw_width NUMERIC(12,2),
    parts_to_cut JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(32) DEFAULT 'pending' CHECK (status IN ('pending','optimizing','optimized','cutting','completed')),
    waste_percentage REAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS nesting_results (
    id SERIAL PRIMARY KEY,
    job_id INT REFERENCES nesting_jobs(id) ON DELETE CASCADE,
    pattern_data JSONB DEFAULT '{}'::jsonb,
    total_waste NUMERIC(12,2),
    remnants JSONB DEFAULT '[]'::jsonb,
    estimated_time_min INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS nesting_patterns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    material_type VARCHAR(32),
    pattern_data JSONB DEFAULT '{}'::jsonb,
    efficiency_score REAL,
    usage_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

let tablesReady = false;
router.use(async (_req: Request, _res: Response, next: NextFunction) => {
  if (!tablesReady) { await ensureTables(); tablesReady = true; }
  next();
});

const s = (v: any) => v != null ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
const n = (v: any) => v != null && v !== "" ? Number(v) : "NULL";
const j = (v: any) => v != null ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : "'[]'::jsonb";

async function nextJobNumber() {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT job_number FROM nesting_jobs WHERE job_number LIKE 'NJ${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.job_number;
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `NJ${year}-${String(seq).padStart(4, "0")}`;
}

// ========== NESTING JOBS ==========
router.get("/jobs", async (_req, res) => {
  res.json(await q(`SELECT * FROM nesting_jobs ORDER BY created_at DESC`));
});

router.get("/dashboard", async (_req, res) => {
  const stats = await q(`SELECT
    (SELECT COUNT(*) FROM nesting_jobs) as total_jobs,
    (SELECT COUNT(*) FROM nesting_jobs WHERE status='pending') as pending,
    (SELECT COUNT(*) FROM nesting_jobs WHERE status='optimizing') as optimizing,
    (SELECT COUNT(*) FROM nesting_jobs WHERE status='optimized') as optimized,
    (SELECT COUNT(*) FROM nesting_jobs WHERE status='cutting') as cutting,
    (SELECT COUNT(*) FROM nesting_jobs WHERE status='completed') as completed,
    (SELECT COALESCE(AVG(waste_percentage), 0) FROM nesting_jobs WHERE waste_percentage IS NOT NULL) as avg_waste,
    (SELECT COALESCE(MIN(waste_percentage), 0) FROM nesting_jobs WHERE waste_percentage IS NOT NULL) as best_waste
  `);
  res.json(stats[0] || {});
});

router.get("/jobs/:id", async (req, res) => {
  const rows = await q(`SELECT * FROM nesting_jobs WHERE id=${Number(req.params.id)}`);
  if (!rows.length) return res.status(404).json({ error: "עבודה לא נמצאה" });
  res.json(rows[0]);
});

router.post("/jobs", async (req, res) => {
  const d = req.body;
  const num = await nextJobNumber();
  await q(`INSERT INTO nesting_jobs (job_number, material_type, source_material_id, raw_length, raw_width, parts_to_cut, status)
    VALUES ('${num}', ${s(d.material_type || 'profile')}, ${n(d.source_material_id)}, ${n(d.raw_length)}, ${n(d.raw_width)}, ${j(d.parts_to_cut)}, 'pending')`);
  res.json((await q(`SELECT * FROM nesting_jobs WHERE job_number='${num}'`))[0]);
});

router.put("/jobs/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.material_type) sets.push(`material_type=${s(d.material_type)}`);
  if (d.source_material_id != null) sets.push(`source_material_id=${n(d.source_material_id)}`);
  if (d.raw_length != null) sets.push(`raw_length=${n(d.raw_length)}`);
  if (d.raw_width != null) sets.push(`raw_width=${n(d.raw_width)}`);
  if (d.parts_to_cut) sets.push(`parts_to_cut=${j(d.parts_to_cut)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.waste_percentage != null) sets.push(`waste_percentage=${n(d.waste_percentage)}`);
  if (!sets.length) return res.status(400).json({ error: "אין שדות לעדכון" });
  await q(`UPDATE nesting_jobs SET ${sets.join(",")} WHERE id=${Number(req.params.id)}`);
  res.json((await q(`SELECT * FROM nesting_jobs WHERE id=${Number(req.params.id)}`))[0]);
});

// ========== OPTIMIZE ==========
router.post("/jobs/:id/optimize", async (req, res) => {
  const jobId = Number(req.params.id);
  const job = (await q(`SELECT * FROM nesting_jobs WHERE id=${jobId}`))[0] as any;
  if (!job) return res.status(404).json({ error: "עבודה לא נמצאה" });

  await q(`UPDATE nesting_jobs SET status='optimizing' WHERE id=${jobId}`);

  // 1D/2D bin-packing simulation
  const parts = (typeof job.parts_to_cut === "string" ? JSON.parse(job.parts_to_cut) : job.parts_to_cut) || [];
  const rawLen = Number(job.raw_length) || 6000;
  const rawWid = Number(job.raw_width) || 0;
  const is2D = rawWid > 0 && job.material_type !== "profile";

  let totalPartArea = 0;
  const expandedParts: any[] = [];
  for (const p of parts) {
    const qty = p.qty || 1;
    for (let i = 0; i < qty; i++) {
      const len = Number(p.length) || 100;
      const wid = is2D ? (Number(p.width) || 100) : 0;
      totalPartArea += is2D ? len * wid : len;
      expandedParts.push({ part_id: p.part_id, length: len, width: wid });
    }
  }

  const totalRaw = is2D ? rawLen * rawWid : rawLen;
  const barsNeeded = Math.ceil(totalPartArea / (totalRaw * 0.92)); // ~8% kerf+waste
  const totalMaterial = totalRaw * Math.max(barsNeeded, 1);
  const wasteAmount = totalMaterial - totalPartArea;
  const wastePct = totalMaterial > 0 ? (wasteAmount / totalMaterial) * 100 : 0;

  // Build pattern layout
  const pattern: any = { bars_used: Math.max(barsNeeded, 1), cuts: [] };
  let currentBar = 1, posInBar = 0;
  for (const p of expandedParts) {
    if (posInBar + p.length > rawLen) { currentBar++; posInBar = 0; }
    pattern.cuts.push({ bar: currentBar, start: posInBar, length: p.length, part_id: p.part_id });
    posInBar += p.length + 3; // 3mm kerf
  }

  // Remnants from each bar
  const remnants: any[] = [];
  for (let b = 1; b <= currentBar; b++) {
    const barCuts = pattern.cuts.filter((c: any) => c.bar === b);
    const usedLen = barCuts.reduce((sum: number, c: any) => sum + c.length + 3, 0);
    const rem = rawLen - usedLen;
    if (rem > 50) remnants.push({ bar: b, remaining_length: rem, remaining_width: rawWid || null });
  }

  const estTime = expandedParts.length * 2 + barsNeeded * 5;

  await q(`INSERT INTO nesting_results (job_id, pattern_data, total_waste, remnants, estimated_time_min)
    VALUES (${jobId}, ${j(pattern)}, ${wasteAmount.toFixed(2)}, ${j(remnants)}, ${estTime})`);

  await q(`UPDATE nesting_jobs SET status='optimized', waste_percentage=${wastePct.toFixed(2)} WHERE id=${jobId}`);

  const result = await q(`SELECT * FROM nesting_results WHERE job_id=${jobId} ORDER BY id DESC LIMIT 1`);
  res.json({ job: (await q(`SELECT * FROM nesting_jobs WHERE id=${jobId}`))[0], result: result[0] });
});

router.get("/jobs/:id/results", async (req, res) => {
  res.json(await q(`SELECT * FROM nesting_results WHERE job_id=${Number(req.params.id)} ORDER BY id DESC`));
});

router.post("/jobs/:id/complete", async (req, res) => {
  await q(`UPDATE nesting_jobs SET status='completed' WHERE id=${Number(req.params.id)}`);
  res.json((await q(`SELECT * FROM nesting_jobs WHERE id=${Number(req.params.id)}`))[0]);
});

export default router;
