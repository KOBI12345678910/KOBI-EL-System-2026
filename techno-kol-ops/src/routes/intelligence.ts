import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { intelligenceEngine } from '../ai/intelligenceEngine';
import { qualityEngine } from '../ai/qualityControl';
import { whatsappBot } from '../ai/whatsappBot';

const router = Router();

// ── DASHBOARD KPIs
router.get('/kpis', authenticate, async (req: AuthRequest, res: Response) => {
  try { res.json(await intelligenceEngine.getRealtimeKPIs()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── AUTO QUOTE
router.post('/quote', authenticate, async (req: AuthRequest, res: Response) => {
  try { res.json(await intelligenceEngine.generateQuote(req.body)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── ANOMALIES
router.get('/anomalies', authenticate, async (req: AuthRequest, res: Response) => {
  try { res.json(await intelligenceEngine.detectAnomalies()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── REVENUE FORECAST
router.get('/forecast/revenue', authenticate, async (req: AuthRequest, res: Response) => {
  try { res.json(await intelligenceEngine.forecastRevenue()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── MATERIAL FORECAST
router.get('/forecast/materials', authenticate, async (req: AuthRequest, res: Response) => {
  try { res.json(await intelligenceEngine.forecastMaterials()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── EMPLOYEE ROI
router.get('/roi/employees', authenticate, async (req: AuthRequest, res: Response) => {
  try { res.json(await intelligenceEngine.employeeROI()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── CLIENT SCORING
router.get('/scoring/clients', authenticate, async (req: AuthRequest, res: Response) => {
  try { res.json(await intelligenceEngine.clientScoring()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── CASH FLOW FORECAST
router.get('/cashflow', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    res.json(await intelligenceEngine.cashFlowForecast(days));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── SCHEDULE OPTIMIZATION
router.get('/optimize/schedule', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    res.json(await intelligenceEngine.optimizeSchedule(date));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── QUALITY CHECKLIST
router.get('/quality/checklist', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { stage, category } = req.query as any;
    const checklist = qualityEngine.getQualityChecklist(stage, category);
    res.json({ checklist });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── WHATSAPP WEBHOOK (Twilio) — public (no auth)
router.post('/whatsapp/webhook', async (req: any, res: Response) => {
  try {
    const { From, Body } = req.body;
    const reply = await whatsappBot.handleIncoming(From, Body);
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Message>${reply}</Message>\n</Response>`);
  } catch (err: any) {
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>שגיאה במערכת. נסה שוב.</Message></Response>`);
  }
});

export default router;
