import { Router, type IRouter } from "express";
import { getFlowDefinitions, getFlowHistory, getFlowStats, runFlow, runAllFlows } from "../lib/data-flow-engine";

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  const user = req.user || (req as any).currentUser;
  if (!user) return res.status(401).json({ message: "נדרשת התחברות" });
  if (!user.isSuperAdmin && user.role !== "admin" && user.role !== "manager") {
    return res.status(403).json({ message: "אין הרשאה — נדרש מנהל מערכת" });
  }
  next();
}

router.get("/data-flows", (_req, res) => {
  try {
    const flows = getFlowDefinitions();
    const stats = getFlowStats();
    const history = getFlowHistory(50);
    res.json({ flows, stats, history });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/data-flows/definitions", (_req, res) => {
  try {
    res.json(getFlowDefinitions());
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/data-flows/stats", (_req, res) => {
  try {
    res.json(getFlowStats());
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/data-flows/history", (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    res.json(getFlowHistory(limit));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/data-flows/run/:flowId", requireAdmin, async (req, res) => {
  try {
    const result = await runFlow(req.params.flowId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/data-flows/run-all", requireAdmin, async (_req, res) => {
  try {
    const results = await runAllFlows();
    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalRecords = results.reduce((s, r) => s + r.recordsAffected, 0);
    res.json({ success, failed, totalRecords, results });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
