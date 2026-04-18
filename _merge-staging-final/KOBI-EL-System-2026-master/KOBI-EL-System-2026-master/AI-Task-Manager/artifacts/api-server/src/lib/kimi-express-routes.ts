import { Router, type Request, type Response } from "express";
import Kimi, { SYSTEM_PROMPTS } from "./kimi-production";
import { runDiagnostics, formatDiagnostics } from "./kimi-diagnostics";

const router = Router();

router.get("/health", async (_req: Request, res: Response) => {
  const health = await Kimi.health();
  res.status(health.ok ? 200 : 503).json(health);
});

router.get("/status", (_req: Request, res: Response) => {
  res.json(Kimi.status());
});

router.get("/diagnostics", async (_req: Request, res: Response) => {
  const results = await runDiagnostics();
  res.json({ results, formatted: formatDiagnostics(results) });
});

router.post("/ask", async (req: Request, res: Response) => {
  const { prompt, system, priority } = req.body;

  if (!prompt?.trim()) {
    res.status(400).json({ error: "חסר prompt" });
    return;
  }

  try {
    const result = await Kimi.ask(prompt, { system, priority });
    res.json({ ok: true, result });
  } catch (e: unknown) {
    const err = e as { type?: string; message?: string };
    res.status(503).json({ ok: false, error: err.message, type: err.type });
  }
});

router.post("/task", async (req: Request, res: Response) => {
  const { prompt, system, priority } = req.body;

  if (!prompt?.trim()) {
    res.status(400).json({ error: "חסר prompt" });
    return;
  }

  const taskId = `task_${Date.now()}`;
  res.json({ ok: true, taskId, queued: true });

  Kimi.task({
    prompt,
    system,
    priority,
    onError: (err) => {
      console.error(`[KimiTask] ${taskId} נכשל:`, err);
    },
  });
});

router.post("/erp/analyze", async (req: Request, res: Response) => {
  const { data, task } = req.body;
  const prompt = `משימה: ${task}\n\nנתונים:\n${JSON.stringify(data, null, 2)}\n\nהחזר JSON בלבד.`;
  try {
    const result = await Kimi.askJSON(prompt, {
      system: SYSTEM_PROMPTS.json_analyst,
    });
    res.json({ ok: true, result });
  } catch (e: unknown) {
    res.status(503).json({ ok: false, error: (e as Error).message });
  }
});

router.post("/erp/code", async (req: Request, res: Response) => {
  const { requirement } = req.body;
  try {
    const result = await Kimi.ask(requirement, {
      system: SYSTEM_PROMPTS.coder,
      priority: "high",
    });
    res.json({ ok: true, result });
  } catch (e: unknown) {
    res.status(503).json({ ok: false, error: (e as Error).message });
  }
});

router.post("/erp/debug", async (req: Request, res: Response) => {
  const { error, code } = req.body;
  const prompt = `שגיאה:\n${error}\n\nקוד:\n${code ?? "(לא סופק)"}`;
  try {
    const result = await Kimi.ask(prompt, {
      system: SYSTEM_PROMPTS.error_analyst,
      priority: "high",
    });
    res.json({ ok: true, result });
  } catch (e: unknown) {
    res.status(503).json({ ok: false, error: (e as Error).message });
  }
});

export default router;
