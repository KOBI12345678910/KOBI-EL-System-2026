import { Router, type IRouter } from "express";
import { orchestrate, type Provider, type TaskType } from "./orchestrator";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.post("/ai-orchestration/chat", async (req, res) => {
  const {
    messages,
    taskType,
    preferredProvider,
    forceProvider,
    maxTokens,
    systemPrompt,
    actionTaken,
    sessionId,
  } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages is required and must be a non-empty array" });
    return;
  }

  const userId = (req as any).userId || undefined;

  try {
    const result = await orchestrate({
      messages,
      taskType: taskType as TaskType,
      preferredProvider: preferredProvider as Provider,
      forceProvider: forceProvider as Provider,
      maxTokens,
      systemPrompt,
      userId,
      sessionId,
      actionTaken,
    });

    res.json({
      content: result.content,
      provider: result.provider,
      model: result.model,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
      },
      fallbackUsed: result.fallbackUsed,
      originalProvider: result.originalProvider,
    });
  } catch (error: any) {
    res.status(502).json({ error: error?.message || "AI orchestration failed" });
  }
});

router.get("/ai-orchestration/providers", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM ai_provider_settings ORDER BY priority ASC"
    );
    res.json({ providers: result.rows });
  } catch {
    res.json({ providers: [] });
  }
});

router.put("/ai-orchestration/providers/:provider", async (req, res) => {
  const { provider } = req.params;
  const { isEnabled, priority, monthlyBudget, preferredModelForCode, preferredModelForReasoning, preferredModelForFast, preferredModelForHebrew } = req.body;

  try {
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (isEnabled !== undefined) { sets.push(`is_enabled = $${idx++}`); vals.push(isEnabled); }
    if (priority !== undefined) { sets.push(`priority = $${idx++}`); vals.push(priority); }
    if (monthlyBudget !== undefined) { sets.push(`monthly_budget = $${idx++}`); vals.push(monthlyBudget); }
    if (preferredModelForCode !== undefined) { sets.push(`preferred_model_for_code = $${idx++}`); vals.push(preferredModelForCode); }
    if (preferredModelForReasoning !== undefined) { sets.push(`preferred_model_for_reasoning = $${idx++}`); vals.push(preferredModelForReasoning); }
    if (preferredModelForFast !== undefined) { sets.push(`preferred_model_for_fast = $${idx++}`); vals.push(preferredModelForFast); }
    if (preferredModelForHebrew !== undefined) { sets.push(`preferred_model_for_hebrew = $${idx++}`); vals.push(preferredModelForHebrew); }

    sets.push(`updated_at = NOW()`);
    vals.push(provider);

    await pool.query(
      `UPDATE ai_provider_settings SET ${sets.join(", ")} WHERE provider = $${idx}`,
      vals
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/ai-orchestration/health", async (_req, res) => {
  const healthResults: Record<string, any> = {};

  const checks = [
    {
      provider: "claude",
      check: async () => {
        const hasConfig = !!(process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL && process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY);
        return { configured: hasConfig, status: hasConfig ? "healthy" : "unconfigured" };
      },
    },
    {
      provider: "openai",
      check: async () => {
        const hasConfig = !!(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
        return { configured: hasConfig, status: hasConfig ? "healthy" : "unconfigured" };
      },
    },
    {
      provider: "gemini",
      check: async () => {
        const hasConfig = !!(process.env.AI_INTEGRATIONS_GEMINI_BASE_URL && process.env.AI_INTEGRATIONS_GEMINI_API_KEY);
        return { configured: hasConfig, status: hasConfig ? "healthy" : "unconfigured" };
      },
    },
    {
      provider: "kimi",
      check: async () => {
        const hasKey = !!(process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY);
        return { configured: hasKey, status: hasKey ? "healthy" : "unconfigured" };
      },
    },
  ];

  await Promise.all(
    checks.map(async ({ provider, check }) => {
      try {
        healthResults[provider] = await check();
      } catch (e: any) {
        healthResults[provider] = { status: "error", error: e.message };
      }
    })
  );

  res.json({ providers: healthResults, timestamp: new Date().toISOString() });
});

export default router;
