// ============================================================
// Advanced Optimization Laboratory - מעבדת אופטימיזציה מתקדמת
// תזמון ייצור, ניתוב, הקצאת משאבים, חיתוך, תמחור
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';

const router = Router();

// ============================================================
// אתחול טבלאות
// ============================================================
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS optimization_problems (
      id SERIAL PRIMARY KEY,
      problem_number VARCHAR(100) UNIQUE,
      problem_type VARCHAR(100) NOT NULL CHECK (problem_type IN (
        'production_scheduling','crew_routing','inventory_allocation','cut_optimization',
        'price_optimization','delivery_routing','resource_leveling','bin_packing','job_shop','knapsack'
      )),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      constraints JSONB DEFAULT '[]',
      objective VARCHAR(100) DEFAULT 'minimize_cost' CHECK (objective IN (
        'minimize_cost','maximize_throughput','minimize_lateness','maximize_utilization',
        'minimize_waste','maximize_profit','minimize_distance','balance_load'
      )),
      input_data JSONB DEFAULT '{}',
      status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft','ready','running','completed','archived')),
      best_score NUMERIC,
      best_run_id INTEGER,
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS optimization_runs (
      id SERIAL PRIMARY KEY,
      problem_id INTEGER REFERENCES optimization_problems(id) ON DELETE CASCADE,
      run_number VARCHAR(100),
      algorithm VARCHAR(100) NOT NULL CHECK (algorithm IN (
        'greedy','genetic','simulated_annealing','linear_programming',
        'constraint_satisfaction','tabu_search','particle_swarm','ant_colony','branch_and_bound','random'
      )),
      runtime_ms INTEGER DEFAULT 0,
      iterations INTEGER DEFAULT 0,
      best_score NUMERIC,
      initial_score NUMERIC,
      improvement_pct REAL DEFAULT 0,
      status VARCHAR(50) DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled')),
      config JSONB DEFAULT '{}',
      convergence_history JSONB DEFAULT '[]',
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS optimization_results (
      id SERIAL PRIMARY KEY,
      run_id INTEGER REFERENCES optimization_runs(id) ON DELETE CASCADE,
      solution JSONB DEFAULT '{}',
      score NUMERIC,
      feasible BOOLEAN DEFAULT TRUE,
      violations JSONB DEFAULT '[]',
      metrics JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

ensureTables().catch(err => console.error('[Optimization Lab] Table init error:', err));

// ============================================================
// פונקציות עזר
// ============================================================
async function generateProblemNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM optimization_problems');
  return `OPT-${year}-${String(parseInt(rows[0]?.c || '0') + 1).padStart(4, '0')}`;
}

// ============================================================
// CRUD - בעיות אופטימיזציה
// ============================================================
router.get('/optimization/problems', async (req: Request, res: Response) => {
  try {
    const type = req.query.type;
    const status = req.query.status;
    let query = `SELECT p.*,
      (SELECT COUNT(*) FROM optimization_runs WHERE problem_id = p.id) as total_runs,
      (SELECT COUNT(*) FROM optimization_runs WHERE problem_id = p.id AND status = 'completed') as completed_runs
      FROM optimization_problems p WHERE 1=1`;
    const params: any[] = [];
    if (type) { params.push(type); query += ` AND p.problem_type = $${params.length}`; }
    if (status) { params.push(status); query += ` AND p.status = $${params.length}`; }
    query += ' ORDER BY p.created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/optimization/problems/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM optimization_problems WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Problem not found' });
    const { rows: runs } = await pool.query(
      'SELECT * FROM optimization_runs WHERE problem_id = $1 ORDER BY started_at DESC',
      [req.params.id]
    );
    res.json({ ...rows[0], runs });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/optimization/problems', async (req: Request, res: Response) => {
  try {
    const { problem_type, name, description, constraints, objective, input_data, created_by } = req.body;
    const num = await generateProblemNumber();
    const { rows } = await pool.query(
      `INSERT INTO optimization_problems (problem_number, problem_type, name, description, constraints, objective, input_data, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [num, problem_type, name, description, JSON.stringify(constraints || []), objective || 'minimize_cost', JSON.stringify(input_data || {}), created_by]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/optimization/problems/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, constraints, objective, input_data, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE optimization_problems SET name=$1, description=$2, constraints=$3, objective=$4,
       input_data=$5, status=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name, description, JSON.stringify(constraints || []), objective, JSON.stringify(input_data || {}), status, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/optimization/problems/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM optimization_problems WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// הרצת אופטימיזציה - סימולציה של אלגוריתמים
// ============================================================
router.post('/optimization/run/:problemId', async (req: Request, res: Response) => {
  try {
    const { rows: problems } = await pool.query('SELECT * FROM optimization_problems WHERE id = $1', [req.params.problemId]);
    if (!problems[0]) return res.status(404).json({ error: 'Problem not found' });
    const problem = problems[0];

    const algorithm = req.body.algorithm || 'genetic';
    const config = req.body.config || {};
    const maxIterations = config.max_iterations || 500;

    // סימולציית הרצת אלגוריתם
    const startTime = Date.now();
    const initialScore = 10000 + Math.random() * 90000;
    let currentScore = initialScore;
    const convergence: any[] = [];

    for (let i = 0; i < maxIterations; i++) {
      const improvement = Math.random() * (initialScore * 0.01) * Math.exp(-i / (maxIterations * 0.3));
      const direction = problem.objective?.startsWith('minimize') ? -1 : 1;
      currentScore += improvement * direction;
      if (i % Math.max(1, Math.floor(maxIterations / 50)) === 0) {
        convergence.push({ iteration: i, score: Math.round(currentScore * 100) / 100 });
      }
    }

    const runtimeMs = Date.now() - startTime + Math.round(Math.random() * 2000);
    const bestScore = Math.round(currentScore * 100) / 100;
    const improvementPct = Math.round(Math.abs((bestScore - initialScore) / initialScore) * 10000) / 100;

    const runNum = `RUN-${Date.now()}`;
    const { rows: runRows } = await pool.query(
      `INSERT INTO optimization_runs (problem_id, run_number, algorithm, runtime_ms, iterations, best_score, initial_score, improvement_pct, status, config, convergence_history, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed',$9,$10,NOW()) RETURNING *`,
      [problem.id, runNum, algorithm, runtimeMs, maxIterations, bestScore, Math.round(initialScore * 100) / 100, improvementPct, JSON.stringify(config), JSON.stringify(convergence)]
    );

    // יצירת תוצאה (פתרון)
    const solution = _generateSolution(problem.problem_type, problem.input_data);
    const feasible = Math.random() > 0.15;
    const violations = feasible ? [] : [{ constraint: 'capacity', message: 'חריגה קלה בקיבולת', severity: 'warning' }];

    const { rows: resultRows } = await pool.query(
      `INSERT INTO optimization_results (run_id, solution, score, feasible, violations, metrics)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [runRows[0].id, JSON.stringify(solution), bestScore, feasible, JSON.stringify(violations), JSON.stringify({
        gap_to_optimal: Math.round(Math.random() * 5 * 100) / 100,
        computation_efficiency: Math.round((100 - runtimeMs / 100) * 10) / 10,
      })]
    );

    // עדכון best score בבעיה
    if (!problem.best_score || (problem.objective?.startsWith('minimize') ? bestScore < problem.best_score : bestScore > problem.best_score)) {
      await pool.query('UPDATE optimization_problems SET best_score = $1, best_run_id = $2, status = $3 WHERE id = $4',
        [bestScore, runRows[0].id, 'completed', problem.id]);
    }

    res.json({ run: runRows[0], result: resultRows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

function _generateSolution(problemType: string, inputData: any): any {
  switch (problemType) {
    case 'production_scheduling':
      return {
        schedule: Array.from({ length: 5 }, (_, i) => ({
          job_id: `JOB-${i + 1}`,
          machine: `M${(i % 3) + 1}`,
          start_time: i * 120,
          end_time: (i + 1) * 120 - 10,
          priority: Math.ceil(Math.random() * 5),
        })),
        makespan: 590,
        utilization: Math.round(Math.random() * 30 + 70),
      };
    case 'delivery_routing':
      return {
        routes: Array.from({ length: 3 }, (_, i) => ({
          vehicle: `V-${i + 1}`,
          stops: Array.from({ length: 4 }, (_, j) => `STOP-${i * 4 + j + 1}`),
          distance_km: Math.round(Math.random() * 200 + 50),
          duration_min: Math.round(Math.random() * 300 + 60),
        })),
        total_distance: Math.round(Math.random() * 500 + 200),
      };
    case 'cut_optimization':
      return {
        cuts: Array.from({ length: 8 }, (_, i) => ({
          piece_id: `PC-${i + 1}`,
          length: Math.round(Math.random() * 2000 + 200),
          width: Math.round(Math.random() * 1000 + 100),
          stock_sheet: `SHEET-${Math.ceil((i + 1) / 3)}`,
        })),
        waste_pct: Math.round(Math.random() * 10 * 100) / 100,
        sheets_used: 3,
      };
    default:
      return {
        assignments: Array.from({ length: 6 }, (_, i) => ({
          resource: `R-${i + 1}`,
          task: `T-${i + 1}`,
          value: Math.round(Math.random() * 1000),
        })),
      };
  }
}

// ============================================================
// תוצאות הרצה
// ============================================================
router.get('/optimization/results/:runId', async (req: Request, res: Response) => {
  try {
    const { rows: run } = await pool.query(
      `SELECT r.*, p.name as problem_name, p.problem_type, p.objective
       FROM optimization_runs r JOIN optimization_problems p ON r.problem_id = p.id WHERE r.id = $1`,
      [req.params.runId]
    );
    if (!run[0]) return res.status(404).json({ error: 'Run not found' });
    const { rows: results } = await pool.query(
      'SELECT * FROM optimization_results WHERE run_id = $1 ORDER BY score',
      [req.params.runId]
    );
    res.json({ run: run[0], results });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// השוואת הרצות
// ============================================================
router.post('/optimization/compare', async (req: Request, res: Response) => {
  try {
    const { run_ids } = req.body;
    if (!run_ids || !run_ids.length) return res.status(400).json({ error: 'run_ids required' });

    const placeholders = run_ids.map((_: any, i: number) => `$${i + 1}`).join(',');
    const { rows: runs } = await pool.query(
      `SELECT r.*, p.name as problem_name, p.problem_type, p.objective
       FROM optimization_runs r JOIN optimization_problems p ON r.problem_id = p.id
       WHERE r.id IN (${placeholders}) ORDER BY r.best_score`,
      run_ids
    );

    const comparison = runs.map((r: any) => ({
      run_id: r.id,
      algorithm: r.algorithm,
      best_score: r.best_score,
      initial_score: r.initial_score,
      improvement_pct: r.improvement_pct,
      runtime_ms: r.runtime_ms,
      iterations: r.iterations,
    }));

    const bestRun = runs[0];
    const worstRun = runs[runs.length - 1];

    res.json({
      runs: comparison,
      best: { run_id: bestRun?.id, algorithm: bestRun?.algorithm, score: bestRun?.best_score },
      spread: Math.abs(parseFloat(bestRun?.best_score || 0) - parseFloat(worstRun?.best_score || 0)),
      avg_runtime: Math.round(runs.reduce((s: number, r: any) => s + (r.runtime_ms || 0), 0) / runs.length),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// דשבורד
// ============================================================
router.get('/optimization/dashboard', async (_req: Request, res: Response) => {
  try {
    const problemsQ = pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER(WHERE status='completed') as completed,
        COUNT(*) FILTER(WHERE status='running') as running,
        COUNT(*) FILTER(WHERE status='draft') as draft
      FROM optimization_problems
    `);
    const runsQ = pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER(WHERE status='completed') as completed,
        COALESCE(AVG(improvement_pct),0) as avg_improvement,
        COALESCE(AVG(runtime_ms),0) as avg_runtime,
        COALESCE(MAX(improvement_pct),0) as best_improvement
      FROM optimization_runs
    `);
    const byTypeQ = pool.query(`
      SELECT problem_type, COUNT(*) as count, COALESCE(AVG(best_score),0) as avg_best
      FROM optimization_problems GROUP BY problem_type ORDER BY count DESC
    `);
    const byAlgorithmQ = pool.query(`
      SELECT algorithm, COUNT(*) as runs, COALESCE(AVG(improvement_pct),0) as avg_improvement,
        COALESCE(AVG(runtime_ms),0) as avg_runtime
      FROM optimization_runs WHERE status = 'completed'
      GROUP BY algorithm ORDER BY avg_improvement DESC
    `);
    const recentQ = pool.query(`
      SELECT r.*, p.name as problem_name, p.problem_type
      FROM optimization_runs r JOIN optimization_problems p ON r.problem_id = p.id
      ORDER BY r.started_at DESC LIMIT 10
    `);

    const [problems, runs, byType, byAlgorithm, recent] = await Promise.all([
      problemsQ, runsQ, byTypeQ, byAlgorithmQ, recentQ
    ]);
    res.json({
      problems: problems.rows[0],
      runs: runs.rows[0],
      by_type: byType.rows,
      by_algorithm: byAlgorithm.rows,
      recent_runs: recent.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
