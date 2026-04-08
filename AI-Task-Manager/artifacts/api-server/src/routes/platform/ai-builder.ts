import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiBuilderConfigsTable, aiBuilderExecutionLogsTable, aiProvidersTable, aiModelsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const ConfigBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  entityId: z.number().optional(),
  featureType: z.string().optional(),
  providerId: z.number().optional(),
  modelId: z.number().optional(),
  promptTemplateId: z.number().optional(),
  inputConfig: z.record(z.string(), z.any()).optional(),
  outputConfig: z.record(z.string(), z.any()).optional(),
  systemPrompt: z.string().optional(),
  userPromptTemplate: z.string().optional(),
  triggerType: z.string().optional(),
  triggerConfig: z.record(z.string(), z.any()).optional(),
  isActive: z.boolean().optional(),
});

router.get("/platform/ai-builder", async (_req, res) => {
  try {
    const configs = await db.select().from(aiBuilderConfigsTable).orderBy(desc(aiBuilderConfigsTable.createdAt));
    res.json(configs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/ai-builder", async (req, res) => {
  try {
    const body = ConfigBody.parse(req.body);
    const [config] = await db.insert(aiBuilderConfigsTable).values(body).returning();
    res.status(201).json(config);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/ai-builder/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [config] = await db.select().from(aiBuilderConfigsTable).where(eq(aiBuilderConfigsTable.id, id));
    if (!config) return res.status(404).json({ message: "AI config not found" });
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/ai-builder/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = ConfigBody.partial().parse(req.body);
    const [config] = await db.update(aiBuilderConfigsTable).set({ ...body, updatedAt: new Date() }).where(eq(aiBuilderConfigsTable.id, id)).returning();
    if (!config) return res.status(404).json({ message: "AI config not found" });
    res.json(config);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/ai-builder/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(aiBuilderConfigsTable).where(eq(aiBuilderConfigsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

interface AIProviderConfig {
  providerSlug: string;
  providerName: string;
  modelSlug: string;
  modelName: string;
  maxTokens: number;
  apiBaseUrl: string;
  apiKey: string;
}

async function resolveProviderConfig(providerId?: number | null, modelId?: number | null): Promise<AIProviderConfig> {
  let resolvedProviderSlug = "anthropic";
  let resolvedModelSlug = "claude-haiku-4-5";
  let resolvedProviderName = "Anthropic";
  let resolvedModelName = "claude-haiku-4-5";
  let resolvedMaxTokens = 2048;
  let resolvedApiBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  let resolvedApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || "";

  if (modelId) {
    const [model] = await db.select().from(aiModelsTable).where(eq(aiModelsTable.id, modelId));
    if (model) {
      resolvedModelSlug = model.slug;
      resolvedModelName = model.name;
      if (model.maxTokens) resolvedMaxTokens = model.maxTokens;
      if (model.providerId) {
        const [provider] = await db.select().from(aiProvidersTable).where(eq(aiProvidersTable.id, model.providerId));
        if (provider) {
          resolvedProviderSlug = provider.slug;
          resolvedProviderName = provider.name;
          if (provider.apiBaseUrl) resolvedApiBaseUrl = provider.apiBaseUrl;
        }
      }
    }
  } else if (providerId) {
    const [provider] = await db.select().from(aiProvidersTable).where(eq(aiProvidersTable.id, providerId));
    if (provider) {
      resolvedProviderSlug = provider.slug;
      resolvedProviderName = provider.name;
      if (provider.apiBaseUrl) resolvedApiBaseUrl = provider.apiBaseUrl;
    }
  }

  if (resolvedProviderSlug.includes("openai")) {
    resolvedApiKey = process.env.KIMI_API_KEY || "";
    if (!resolvedApiBaseUrl || resolvedApiBaseUrl === "https://api.openai.com/v1") {
      resolvedApiBaseUrl = process.env.KIMI_API_URL || "https://api.moonshot.ai/v1";
    }
    if (!resolvedModelSlug.startsWith("moonshot-") && !resolvedModelSlug.startsWith("kimi-")) {
      resolvedModelSlug = "kimi-k2.5";
      resolvedModelName = "Kimi K2.5";
    }
    if (!resolvedApiKey) {
      throw new Error("Moonshot (KIMI_API_KEY) not configured");
    }
  } else {
    resolvedApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || "";
    if (!resolvedApiKey) {
      throw new Error("Anthropic API key not configured (AI_INTEGRATIONS_ANTHROPIC_API_KEY)");
    }
  }

  return {
    providerSlug: resolvedProviderSlug,
    providerName: resolvedProviderName,
    modelSlug: resolvedModelSlug,
    modelName: resolvedModelName,
    maxTokens: resolvedMaxTokens,
    apiBaseUrl: resolvedApiBaseUrl,
    apiKey: resolvedApiKey,
  };
}

async function callAnthropicApi(
  providerConfig: AIProviderConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ text: string; tokensUsed: number }> {
  const body = {
    model: providerConfig.modelSlug,
    max_tokens: providerConfig.maxTokens || 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  };

  const response = await fetch(`${providerConfig.apiBaseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": providerConfig.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json() as any;
  const text = data.content?.[0]?.text || "";
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
  return { text, tokensUsed };
}

async function callOpenAIApi(
  providerConfig: AIProviderConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ text: string; tokensUsed: number }> {
  const baseUrl = providerConfig.apiBaseUrl.endsWith("/v1")
    ? providerConfig.apiBaseUrl
    : `${providerConfig.apiBaseUrl}/v1`;

  const body = {
    model: providerConfig.modelSlug,
    max_tokens: providerConfig.maxTokens || 2048,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${providerConfig.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Moonshot API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json() as any;
  const text = data.choices?.[0]?.message?.content || "";
  const tokensUsed = (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0);
  return { text, tokensUsed };
}

async function callAIProvider(
  providerConfig: AIProviderConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ text: string; tokensUsed: number }> {
  if (providerConfig.providerSlug.includes("openai") || providerConfig.providerSlug.includes("gpt")) {
    return callOpenAIApi(providerConfig, systemPrompt, userPrompt);
  }
  return callAnthropicApi(providerConfig, systemPrompt, userPrompt);
}

function buildUserPrompt(
  config: typeof aiBuilderConfigsTable.$inferSelect,
  inputData: Record<string, any>,
  contextData: Record<string, any>,
): string {
  let prompt = config.userPromptTemplate || "עבד את הנתונים הבאים:";

  const allVars = { ...contextData, ...inputData };
  for (const [key, value] of Object.entries(allVars)) {
    prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
  }

  if (Object.keys(inputData).length > 0) {
    prompt += `\n\nנתוני קלט:\n${JSON.stringify(inputData, null, 2)}`;
  }
  if (Object.keys(contextData).length > 0) {
    prompt += `\n\nהקשר נוסף:\n${JSON.stringify(contextData, null, 2)}`;
  }

  return prompt;
}

router.post("/platform/ai-builder/:id/execute", async (req, res) => {
  const id = Number(req.params.id);
  const startTime = Date.now();

  try {
    const [config] = await db.select().from(aiBuilderConfigsTable).where(eq(aiBuilderConfigsTable.id, id));
    if (!config) return res.status(404).json({ message: "AI config not found" });

    const inputData: Record<string, any> = req.body.inputData || {};
    const recordId = req.body.recordId;
    const contextData: Record<string, any> = req.body.contextData || {};

    const providerConfig = await resolveProviderConfig(config.providerId, config.modelId);

    const systemPrompt = config.systemPrompt || "אתה עוזר AI חכם במערכת ERP. ענה בעברית בצורה קצרה, מדויקת ומקצועית.";
    const userPrompt = buildUserPrompt(config, inputData, contextData);

    const { text: generatedText, tokensUsed } = await callAIProvider(providerConfig, systemPrompt, userPrompt);

    const outputData = {
      generatedText,
      prompt: userPrompt,
      configUsed: config.slug,
      provider: providerConfig.providerName,
      model: providerConfig.modelName,
    };

    const [log] = await db.insert(aiBuilderExecutionLogsTable).values({
      configId: id,
      entityId: config.entityId || undefined,
      recordId: recordId || undefined,
      inputData,
      outputData,
      promptUsed: userPrompt,
      status: "completed",
      tokensUsed,
      executionTimeMs: Date.now() - startTime,
    }).returning();

    res.json({ result: outputData, executionLog: log });
  } catch (err: any) {
    const executionTimeMs = Date.now() - startTime;
    try {
      const [config] = await db.select().from(aiBuilderConfigsTable).where(eq(aiBuilderConfigsTable.id, id));
      if (config) {
        await db.insert(aiBuilderExecutionLogsTable).values({
          configId: id,
          inputData: req.body.inputData || {},
          outputData: null,
          promptUsed: null,
          status: "failed",
          errorMessage: err.message,
          tokensUsed: 0,
          executionTimeMs,
        });
      }
    } catch {}
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/ai-builder/:id/logs", async (req, res) => {
  try {
    const configId = Number(req.params.id);
    const logs = await db.select().from(aiBuilderExecutionLogsTable)
      .where(eq(aiBuilderExecutionLogsTable.configId, configId))
      .orderBy(desc(aiBuilderExecutionLogsTable.createdAt));
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
