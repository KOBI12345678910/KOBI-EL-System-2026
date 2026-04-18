import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { supplyChainIntelligence } from '../ai/supplyChainIntelligence';

const router = Router();
router.use(authenticate);

// Full dashboard — single call, all 9 metrics computed from REAL data
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const [
      suppliers,
      eoq,
      bottlenecks,
      leadTime,
      stockoutRisk,
      abc,
      carryingCost,
      turnover,
      deadStock,
    ] = await Promise.all([
      supplyChainIntelligence.scoreSuppliers(),
      supplyChainIntelligence.computeEOQ(),
      supplyChainIntelligence.detectBottlenecks(),
      supplyChainIntelligence.leadTimeVariance(),
      supplyChainIntelligence.stockoutRisk(),
      supplyChainIntelligence.abcAnalysis(),
      supplyChainIntelligence.carryingCost(),
      supplyChainIntelligence.inventoryTurnover(),
      supplyChainIntelligence.deadStock(90),
    ]);

    res.json({
      suppliers, eoq, bottlenecks, leadTime, stockoutRisk,
      abc, carryingCost, turnover, deadStock,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/suppliers', async (_req, res) => {
  try { res.json(await supplyChainIntelligence.scoreSuppliers()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/eoq', async (_req, res) => {
  try { res.json(await supplyChainIntelligence.computeEOQ()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/bottlenecks', async (_req, res) => {
  try { res.json(await supplyChainIntelligence.detectBottlenecks()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/lead-time', async (_req, res) => {
  try { res.json(await supplyChainIntelligence.leadTimeVariance()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/stockout-risk', async (_req, res) => {
  try { res.json(await supplyChainIntelligence.stockoutRisk()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/abc', async (_req, res) => {
  try { res.json(await supplyChainIntelligence.abcAnalysis()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/carrying-cost', async (_req, res) => {
  try { res.json(await supplyChainIntelligence.carryingCost()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/turnover', async (_req, res) => {
  try { res.json(await supplyChainIntelligence.inventoryTurnover()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/dead-stock', async (req: AuthRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 90;
    res.json(await supplyChainIntelligence.deadStock(days));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
