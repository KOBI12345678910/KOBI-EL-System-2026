import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { brainEngine } from '../ai/brainEngine';
import { query } from '../db/connection';

const router = Router();
router.use(authenticate);

// GET מצב המוח
router.get('/state', async (req: AuthRequest, res: Response) => {
  try {
    const cycle = await brainEngine.runFullCycle();
    res.json(cycle);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET דוח אחרון
router.get('/report/latest', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT * FROM brain_reports ORDER BY created_at DESC LIMIT 1`
    );
    res.json(rows[0]?.report_data || {});
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET היסטוריית החלטות
router.get('/decisions', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT * FROM brain_decisions ORDER BY created_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET יומן למידה
router.get('/learning', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT * FROM brain_learning_log ORDER BY created_at DESC LIMIT 30`
    );
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST הפעל מחזור ידנית
router.post('/run', async (req: AuthRequest, res: Response) => {
  try {
    const result = await brainEngine.runFullCycle();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET בריפינג בוקר
router.get('/briefing/morning', async (req: AuthRequest, res: Response) => {
  try {
    const briefing = await brainEngine.sendDailyBriefing();
    res.json(briefing);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET agenda
router.get('/agenda', async (req: AuthRequest, res: Response) => {
  try {
    const agenda = await brainEngine.buildDailyAgenda();
    res.json(agenda);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET goals status
router.get('/goals', async (req: AuthRequest, res: Response) => {
  try {
    const goals = await brainEngine.getGoalsStatus();
    res.json(goals);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
