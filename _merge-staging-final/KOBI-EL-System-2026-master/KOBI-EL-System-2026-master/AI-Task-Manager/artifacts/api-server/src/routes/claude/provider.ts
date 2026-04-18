import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { claudeConnectionTestsTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";
const router: IRouter = Router();

const AVAILABLE_MODELS = [
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    description: "Balanced performance and speed, recommended for most use cases",
    maxTokens: 8192,
    capabilities: ["chat", "analysis", "coding", "reasoning"],
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    description: "Fastest and most compact, ideal for simple tasks",
    maxTokens: 8192,
    capabilities: ["chat", "simple-analysis", "quick-tasks"],
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    description: "Most capable, best for complex reasoning and coding tasks",
    maxTokens: 8192,
    capabilities: ["chat", "complex-reasoning", "coding", "analysis", "research"],
  },
];

const DEFAULT_MODEL = "claude-sonnet-4-6";

let _anthropicClient: any = null;

async function getAnthropicClient(): Promise<any> {
  if (!_anthropicClient) {
    const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    if (!baseURL || !apiKey) {
      throw new Error("Anthropic integration is not configured. AI_INTEGRATIONS_ANTHROPIC_BASE_URL and AI_INTEGRATIONS_ANTHROPIC_API_KEY must be set.");
    }
    const mod = await import("@workspace/integrations-anthropic-ai");
    _anthropicClient = mod.anthropic;
  }
  return _anthropicClient;
}

function isIntegrationConfigured(): boolean {
  return !!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL && !!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
}

router.post("/claude/provider/test-connection", async (_req, res) => {
  const startTime = Date.now();
  const model = DEFAULT_MODEL;

  if (!isIntegrationConfigured()) {
    res.status(503).json({
      success: false,
      error: "Anthropic integration is not configured",
      model,
      responseTimeMs: Date.now() - startTime,
    });
    return;
  }

  try {
    const client = await getAnthropicClient();
    const message = await client.messages.create({
      model,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: "Respond with a brief confirmation that you are operational. Include the current date if you know it.",
        },
      ],
    });

    const responseTimeMs = Date.now() - startTime;
    const block = message.content[0];
    const responseSummary = block.type === "text" ? block.text : "";

    const [testResult] = await db
      .insert(claudeConnectionTestsTable)
      .values({
        status: "success",
        model,
        responseTimeMs,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        responseSummary: responseSummary.substring(0, 500),
      })
      .returning();

    res.json({
      success: true,
      testId: testResult.id,
      model,
      responseTimeMs,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
      response: responseSummary,
      testedAt: testResult.testedAt,
    });
  } catch (error: any) {
    const responseTimeMs = Date.now() - startTime;
    const errorMessage = error?.message || "Unknown error";
    const errorCode = error?.status?.toString() || error?.code || "UNKNOWN";

    const [testResult] = await db
      .insert(claudeConnectionTestsTable)
      .values({
        status: "failure",
        model,
        responseTimeMs,
        errorMessage: errorMessage.substring(0, 1000),
        errorCode,
      })
      .returning();

    res.status(502).json({
      success: false,
      testId: testResult.id,
      model,
      responseTimeMs,
      error: errorMessage,
      errorCode,
      testedAt: testResult.testedAt,
    });
  }
});

router.get("/claude/provider/health", async (_req, res) => {
  const [latestTest] = await db
    .select()
    .from(claudeConnectionTestsTable)
    .orderBy(desc(claudeConnectionTestsTable.testedAt))
    .limit(1);

  res.json({
    status: latestTest?.status === "success" ? "healthy" : "unknown",
    integrationConfigured: isIntegrationConfigured(),
    lastTest: latestTest
      ? {
          id: latestTest.id,
          status: latestTest.status,
          responseTimeMs: latestTest.responseTimeMs,
          testedAt: latestTest.testedAt,
          model: latestTest.model,
        }
      : null,
    uptime: process.uptime(),
  });
});

router.get("/claude/provider/status", async (_req, res) => {
  const [latestTest] = await db
    .select()
    .from(claudeConnectionTestsTable)
    .orderBy(desc(claudeConnectionTestsTable.testedAt))
    .limit(1);

  res.json({
    provider: "anthropic",
    integration: "replit-ai-integrations",
    configured: isIntegrationConfigured(),
    defaultModel: DEFAULT_MODEL,
    availableModels: AVAILABLE_MODELS.map((m) => m.id),
    lastActivity: latestTest?.testedAt || null,
    lastTestStatus: latestTest?.status || null,
  });
});

router.get("/claude/provider/models", async (_req, res) => {
  res.json({
    models: AVAILABLE_MODELS,
    defaultModel: DEFAULT_MODEL,
  });
});

export default router;
