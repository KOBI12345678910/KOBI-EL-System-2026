// ============================================================
// Data Import Staging - ייבוא נתונים מדורג
// העלאה, אימות, אישור וייבוא נתונים בצורה מבוקרת
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';

const router = Router();

// ============================================================
// אתחול טבלאות
// ============================================================
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_batches (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(255) NOT NULL,
      file_name VARCHAR(500),
      total_rows INTEGER DEFAULT 0,
      valid_rows INTEGER DEFAULT 0,
      error_rows INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'uploaded',
      uploaded_by VARCHAR(255),
      approved_by VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_staging_rows (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER REFERENCES import_batches(id) ON DELETE CASCADE,
      row_number INTEGER NOT NULL,
      data JSONB DEFAULT '{}',
      validation_errors JSONB DEFAULT '[]',
      status VARCHAR(50) DEFAULT 'valid'
    )
  `);
}

ensureTables().catch(err => console.error('Import staging table init error:', err));

// ============================================================
// GET /import-staging/batches - רשימת אצוות
// ============================================================
router.get('/import-staging/batches', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT * FROM import_batches ORDER BY created_at DESC
    `);
    res.json({ data: result.rows });
  } catch (err: any) {
    console.error('Error fetching batches:', err);
    res.status(500).json({ error: 'שגיאה בטעינת אצוות' });
  }
});

// ============================================================
// POST /import-staging/upload - העלאת קובץ (multipart JSON body)
// ============================================================
router.post('/import-staging/upload', async (req: Request, res: Response) => {
  try {
    const { entity_type, file_name, rows, uploaded_by } = req.body;
    if (!entity_type || !rows || !Array.isArray(rows)) {
      res.status(400).json({ error: 'סוג ישות ושורות נדרשים' });
      return;
    }
    const batch = await pool.query(`
      INSERT INTO import_batches (entity_type, file_name, total_rows, uploaded_by)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [entity_type, file_name || 'upload.csv', rows.length, uploaded_by || null]);
    const batchId = batch.rows[0].id;

    for (let i = 0; i < rows.length; i++) {
      await pool.query(`
        INSERT INTO import_staging_rows (batch_id, row_number, data, status)
        VALUES ($1, $2, $3, 'valid')
      `, [batchId, i + 1, JSON.stringify(rows[i])]);
    }

    res.json({ data: batch.rows[0] });
  } catch (err: any) {
    console.error('Error uploading batch:', err);
    res.status(500).json({ error: 'שגיאה בהעלאת אצווה' });
  }
});

// ============================================================
// POST /import-staging/:batchId/validate - אימות שורות
// ============================================================
router.post('/import-staging/:batchId/validate', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    await pool.query(`UPDATE import_batches SET status = 'validating' WHERE id = $1`, [batchId]);

    const rows = await pool.query(`SELECT * FROM import_staging_rows WHERE batch_id = $1`, [batchId]);
    let validCount = 0;
    let errorCount = 0;

    for (const row of rows.rows) {
      const errors: string[] = [];
      const data = row.data;
      if (!data || Object.keys(data).length === 0) {
        errors.push('שורה ריקה');
      }
      const status = errors.length > 0 ? 'error' : 'valid';
      if (errors.length > 0) errorCount++; else validCount++;
      await pool.query(`
        UPDATE import_staging_rows SET status = $1, validation_errors = $2 WHERE id = $3
      `, [status, JSON.stringify(errors), row.id]);
    }

    await pool.query(`
      UPDATE import_batches SET status = 'validated', valid_rows = $1, error_rows = $2 WHERE id = $3
    `, [validCount, errorCount, batchId]);

    res.json({ valid_rows: validCount, error_rows: errorCount, status: 'validated' });
  } catch (err: any) {
    console.error('Error validating batch:', err);
    res.status(500).json({ error: 'שגיאה באימות אצווה' });
  }
});

// ============================================================
// POST /import-staging/:batchId/approve - אישור אצווה
// ============================================================
router.post('/import-staging/:batchId/approve', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { approved_by } = req.body;
    const batch = await pool.query(`SELECT * FROM import_batches WHERE id = $1`, [batchId]);
    if (batch.rows.length === 0) { res.status(404).json({ error: 'אצווה לא נמצאה' }); return; }
    if (batch.rows[0].status !== 'validated') {
      res.status(400).json({ error: 'האצווה חייבת להיות מאומתת לפני אישור' });
      return;
    }
    await pool.query(`
      UPDATE import_batches SET status = 'approved', approved_by = $1 WHERE id = $2
    `, [approved_by || null, batchId]);
    res.json({ success: true, status: 'approved' });
  } catch (err: any) {
    console.error('Error approving batch:', err);
    res.status(500).json({ error: 'שגיאה באישור אצווה' });
  }
});

// ============================================================
// POST /import-staging/:batchId/import - ייבוא סופי
// ============================================================
router.post('/import-staging/:batchId/import', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const batch = await pool.query(`SELECT * FROM import_batches WHERE id = $1`, [batchId]);
    if (batch.rows.length === 0) { res.status(404).json({ error: 'אצווה לא נמצאה' }); return; }
    if (batch.rows[0].status !== 'approved') {
      res.status(400).json({ error: 'האצווה חייבת להיות מאושרת לפני ייבוא' });
      return;
    }

    const validRows = await pool.query(`
      SELECT * FROM import_staging_rows WHERE batch_id = $1 AND status = 'valid'
    `, [batchId]);

    let importedCount = 0;
    for (const row of validRows.rows) {
      await pool.query(`
        UPDATE import_staging_rows SET status = 'imported' WHERE id = $1
      `, [row.id]);
      importedCount++;
    }

    await pool.query(`
      UPDATE import_batches SET status = 'imported' WHERE id = $1
    `, [batchId]);

    res.json({ success: true, imported_rows: importedCount, status: 'imported' });
  } catch (err: any) {
    console.error('Error importing batch:', err);
    res.status(500).json({ error: 'שגיאה בייבוא אצווה' });
  }
});

// ============================================================
// POST /import-staging/:batchId/reject - דחיית אצווה
// ============================================================
router.post('/import-staging/:batchId/reject', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    await pool.query(`UPDATE import_batches SET status = 'rejected' WHERE id = $1`, [batchId]);
    res.json({ success: true, status: 'rejected' });
  } catch (err: any) {
    console.error('Error rejecting batch:', err);
    res.status(500).json({ error: 'שגיאה בדחיית אצווה' });
  }
});

// ============================================================
// GET /import-staging/:batchId/rows - שורות של אצווה
// ============================================================
router.get('/import-staging/:batchId/rows', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const status = req.query.status as string;
    let query = `SELECT * FROM import_staging_rows WHERE batch_id = $1`;
    const params: any[] = [batchId];
    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }
    query += ` ORDER BY row_number ASC`;
    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (err: any) {
    console.error('Error fetching rows:', err);
    res.status(500).json({ error: 'שגיאה בטעינת שורות' });
  }
});

// ============================================================
// DELETE /import-staging/:batchId/rollback - ביטול ייבוא
// ============================================================
router.delete('/import-staging/:batchId/rollback', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    await pool.query(`
      UPDATE import_staging_rows SET status = 'valid' WHERE batch_id = $1 AND status = 'imported'
    `, [batchId]);
    await pool.query(`UPDATE import_batches SET status = 'validated' WHERE id = $1`, [batchId]);
    res.json({ success: true, status: 'rolled_back' });
  } catch (err: any) {
    console.error('Error rolling back batch:', err);
    res.status(500).json({ error: 'שגיאה בביטול ייבוא' });
  }
});

export default router;
