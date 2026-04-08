/**
 * TechnoKoluzi ERP - AI Autonomous Agent API Routes
 * נתיבי API לסוכן AI אוטונומי
 */

import { Router } from "express";
import {
  startAgent,
  stopAgent,
  getAgentStatus,
  getRules,
  toggleRule,
  executeRule,
  runAllRules,
  submitFeedback,
  seedDefaultRules,
} from "../lib/ai-workflow-agent";

const router = Router();

/** POST /api/ai-agent/start - הפעלת הסוכן */
router.post("/start", async (_req, res, next) => {
  try {
    const result = await startAgent();
    res.json(result);
  } catch (e) { next(e); }
});

/** POST /api/ai-agent/stop - עצירת הסוכן */
router.post("/stop", async (_req, res, next) => {
  try {
    const result = stopAgent();
    res.json(result);
  } catch (e) { next(e); }
});

/** GET /api/ai-agent/status - סטטוס הסוכן */
router.get("/status", async (_req, res, next) => {
  try {
    const status = await getAgentStatus();
    res.json(status);
  } catch (e) { next(e); }
});

/** GET /api/ai-agent/rules - כל החוקים */
router.get("/rules", async (_req, res, next) => {
  try {
    const rules = await getRules();
    res.json({ count: rules.length, rules });
  } catch (e) { next(e); }
});

/** PATCH /api/ai-agent/rules/:id/toggle - הפעלה/השבתה של חוק */
router.patch("/rules/:id/toggle", async (req, res, next) => {
  try {
    const { enabled } = req.body;
    await toggleRule(req.params.id, enabled);
    res.json({ message: `חוק ${req.params.id} ${enabled ? "הופעל" : "הושבת"}` });
  } catch (e) { next(e); }
});

/** POST /api/ai-agent/rules/:id/execute - הרצת חוק ספציפי */
router.post("/rules/:id/execute", async (req, res, next) => {
  try {
    const log = await executeRule(req.params.id);
    res.json(log);
  } catch (e) { next(e); }
});

/** POST /api/ai-agent/run-all - הרצת כל החוקים */
router.post("/run-all", async (_req, res, next) => {
  try {
    const logs = await runAllRules();
    res.json({ executed: logs.length, logs });
  } catch (e) { next(e); }
});

/** POST /api/ai-agent/feedback - משוב על פעולת הסוכן */
router.post("/feedback", async (req, res, next) => {
  try {
    const { logId, approved, comment, userId } = req.body;
    await submitFeedback({ logId, approved, comment, userId });
    res.json({ message: "משוב נשמר" });
  } catch (e) { next(e); }
});

/** POST /api/ai-agent/seed - יצירת חוקי ברירת מחדל */
router.post("/seed", async (_req, res, next) => {
  try {
    const seeded = await seedDefaultRules();
    res.json({ message: `נוצרו ${seeded} חוקים חדשים` });
  } catch (e) { next(e); }
});

export default router;
