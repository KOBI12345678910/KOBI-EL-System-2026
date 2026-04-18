// ============================================================
// Duplicate Resolution Center - מרכז איחוד כפילויות
// סריקה, זיהוי ומיזוג רשומות כפולות
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';

const router = Router();

// ============================================================
// אתחול טבלאות
// ============================================================
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS duplicate_groups (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'open',
      survivor_id INTEGER,
      resolved_by VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS duplicate_candidates (
      id SERIAL PRIMARY KEY,
      group_id INTEGER REFERENCES duplicate_groups(id) ON DELETE CASCADE,
      entity_id INTEGER NOT NULL,
      match_score REAL DEFAULT 0,
      data_preview JSONB DEFAULT '{}'
    )
  `);
}

ensureTables().catch(err => console.error('Duplicate resolution table init error:', err));

// ============================================================
// POST /duplicates/scan/:entityType - סריקת כפילויות
// ============================================================
router.post('/duplicates/scan/:entityType', async (req: Request, res: Response) => {
  try {
    const { entityType } = req.params;
    const { field, threshold } = req.body;
    const matchField = field || 'name';
    const matchThreshold = threshold || 0.8;

    // חיפוש ישות רלוונטית
    const entityCheck = await pool.query(`
      SELECT id FROM module_entities WHERE slug = $1 LIMIT 1
    `, [entityType]);

    let groups_created = 0;
    let candidates_found = 0;

    if (entityCheck.rows.length > 0) {
      const entityId = entityCheck.rows[0].id;
      // חיפוש רשומות עם ערכים דומים
      const records = await pool.query(`
        SELECT id, data FROM entity_records
        WHERE entity_id = $1 AND status != 'deleted'
        ORDER BY id ASC LIMIT 500
      `, [entityId]);

      const processed = new Set<number>();

      for (let i = 0; i < records.rows.length; i++) {
        if (processed.has(records.rows[i].id)) continue;
        const duplicates: any[] = [];
        const valA = records.rows[i].data?.[matchField]?.toString().toLowerCase() || '';
        if (!valA) continue;

        for (let j = i + 1; j < records.rows.length; j++) {
          if (processed.has(records.rows[j].id)) continue;
          const valB = records.rows[j].data?.[matchField]?.toString().toLowerCase() || '';
          if (!valB) continue;

          const score = similarity(valA, valB);
          if (score >= matchThreshold) {
            duplicates.push({ record: records.rows[j], score });
            processed.add(records.rows[j].id);
          }
        }

        if (duplicates.length > 0) {
          processed.add(records.rows[i].id);
          const group = await pool.query(`
            INSERT INTO duplicate_groups (entity_type, status)
            VALUES ($1, 'open') RETURNING *
          `, [entityType]);
          const groupId = group.rows[0].id;
          groups_created++;

          await pool.query(`
            INSERT INTO duplicate_candidates (group_id, entity_id, match_score, data_preview)
            VALUES ($1, $2, 1.0, $3)
          `, [groupId, records.rows[i].id, JSON.stringify(records.rows[i].data || {})]);
          candidates_found++;

          for (const dup of duplicates) {
            await pool.query(`
              INSERT INTO duplicate_candidates (group_id, entity_id, match_score, data_preview)
              VALUES ($1, $2, $3, $4)
            `, [groupId, dup.record.id, dup.score, JSON.stringify(dup.record.data || {})]);
            candidates_found++;
          }
        }
      }
    }

    res.json({ groups_created, candidates_found, entity_type: entityType });
  } catch (err: any) {
    console.error('Error scanning duplicates:', err);
    res.status(500).json({ error: 'שגיאה בסריקת כפילויות' });
  }
});

// פונקציית דמיון מחרוזות פשוטה
function similarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  const dist = editDistance(longer, shorter);
  return (longerLength - dist) / longerLength;
}

function editDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// ============================================================
// GET /duplicates/groups - רשימת קבוצות כפילויות
// ============================================================
router.get('/duplicates/groups', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    let query = `
      SELECT dg.*,
        (SELECT COUNT(*) FROM duplicate_candidates dc WHERE dc.group_id = dg.id) as candidate_count
      FROM duplicate_groups dg
    `;
    const params: any[] = [];
    if (status) {
      query += ` WHERE dg.status = $1`;
      params.push(status);
    }
    query += ` ORDER BY dg.created_at DESC`;
    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (err: any) {
    console.error('Error fetching duplicate groups:', err);
    res.status(500).json({ error: 'שגיאה בטעינת קבוצות כפילויות' });
  }
});

// ============================================================
// POST /duplicates/:groupId/merge - מיזוג קבוצה
// ============================================================
router.post('/duplicates/:groupId/merge', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { survivor_id, resolved_by } = req.body;
    if (!survivor_id) {
      res.status(400).json({ error: 'נדרש לבחור רשומה שורדת' });
      return;
    }
    await pool.query(`
      UPDATE duplicate_groups
      SET status = 'resolved', survivor_id = $1, resolved_by = $2
      WHERE id = $3
    `, [survivor_id, resolved_by || null, groupId]);

    // סימון הרשומות האחרות כמוזגות
    const candidates = await pool.query(`
      SELECT entity_id FROM duplicate_candidates WHERE group_id = $1 AND entity_id != $2
    `, [groupId, survivor_id]);

    for (const c of candidates.rows) {
      await pool.query(`
        UPDATE entity_records SET status = 'merged' WHERE id = $1
      `, [c.entity_id]).catch(() => {});
    }

    res.json({ success: true, status: 'resolved', survivor_id });
  } catch (err: any) {
    console.error('Error merging duplicates:', err);
    res.status(500).json({ error: 'שגיאה במיזוג כפילויות' });
  }
});

// ============================================================
// POST /duplicates/:groupId/false-positive - סימון כלא-כפילות
// ============================================================
router.post('/duplicates/:groupId/false-positive', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { resolved_by } = req.body;
    await pool.query(`
      UPDATE duplicate_groups SET status = 'false_positive', resolved_by = $1 WHERE id = $2
    `, [resolved_by || null, groupId]);
    res.json({ success: true, status: 'false_positive' });
  } catch (err: any) {
    console.error('Error marking false positive:', err);
    res.status(500).json({ error: 'שגיאה בסימון כלא-כפילות' });
  }
});

// ============================================================
// GET /duplicates/dashboard - דשבורד כפילויות
// ============================================================
router.get('/duplicates/dashboard', async (_req: Request, res: Response) => {
  try {
    const total = await pool.query('SELECT COUNT(*) as count FROM duplicate_groups');
    const open = await pool.query(`SELECT COUNT(*) as count FROM duplicate_groups WHERE status = 'open'`);
    const resolved = await pool.query(`SELECT COUNT(*) as count FROM duplicate_groups WHERE status = 'resolved'`);
    const falsePos = await pool.query(`SELECT COUNT(*) as count FROM duplicate_groups WHERE status = 'false_positive'`);
    const byType = await pool.query(`
      SELECT entity_type, status, COUNT(*) as count
      FROM duplicate_groups GROUP BY entity_type, status ORDER BY count DESC
    `);
    const totalCandidates = await pool.query('SELECT COUNT(*) as count FROM duplicate_candidates');

    res.json({
      total_groups: parseInt(total.rows[0].count),
      open: parseInt(open.rows[0].count),
      resolved: parseInt(resolved.rows[0].count),
      false_positive: parseInt(falsePos.rows[0].count),
      total_candidates: parseInt(totalCandidates.rows[0].count),
      by_type: byType.rows
    });
  } catch (err: any) {
    console.error('Error fetching dashboard:', err);
    res.status(500).json({ error: 'שגיאה בטעינת דשבורד' });
  }
});

export default router;
