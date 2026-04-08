import { pool } from "@workspace/db";

export type TaskType = "code" | "reasoning" | "fast" | "hebrew" | "general";
export type Provider = "claude" | "openai" | "gemini" | "kimi";

export interface OrchestrationRequest {
  messages: Array<{ role: string; content: string }>;
  taskType?: TaskType;
  preferredProvider?: Provider;
  forceProvider?: Provider;
  maxTokens?: number;
  systemPrompt?: string;
  userId?: string;
  sessionId?: string;
  actionTaken?: string;
}

export interface OrchestrationResult {
  content: string;
  provider: Provider;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  latencyMs: number;
  fallbackUsed: boolean;
  originalProvider?: Provider;
}

const PROVIDER_ORDER: Provider[] = ["claude", "openai", "gemini", "kimi"];

const MODEL_MAP: Record<Provider, Record<TaskType | "general", string>> = {
  claude: { code: "claude-sonnet-4-6", reasoning: "claude-opus-4-6", fast: "claude-haiku-4-5", hebrew: "claude-sonnet-4-6", general: "claude-sonnet-4-6" },
  openai: { code: "gpt-5.2", reasoning: "gpt-5.2", fast: "gpt-5-mini", hebrew: "gpt-5.2", general: "gpt-5.2" },
  gemini: { code: "gemini-2.5-pro", reasoning: "gemini-3.1-pro-preview", fast: "gemini-3-flash-preview", hebrew: "gemini-3-flash-preview", general: "gemini-3-flash-preview" },
  kimi: { code: "kimi-k2.5", reasoning: "kimi-k2-thinking", fast: "moonshot-v1-8k", hebrew: "kimi-k2.5", general: "kimi-k2.5" },
};

function classifyTaskType(messages: Array<{ role: string; content: string }>): TaskType {
  const lastUserMsg = messages.filter(m => m.role === "user").slice(-1)[0]?.content || "";
  const lower = lastUserMsg.toLowerCase();

  const hebrewPattern = /[\u0590-\u05FF]/;
  if (hebrewPattern.test(lastUserMsg) && lastUserMsg.replace(/[a-zA-Z0-9\s]/g, "").length > lastUserMsg.length * 0.3) {
    return "hebrew";
  }
  if (/\b(code|function|class|implement|bug|debug|typescript|javascript|python|sql|algorithm|refactor)\b/.test(lower)) {
    return "code";
  }
  if (/\b(analyze|analysis|explain|reason|compare|evaluate|strategy|plan|complex|architecture)\b/.test(lower)) {
    return "reasoning";
  }
  if (lastUserMsg.length < 200) {
    return "fast";
  }
  return "general";
}

async function getEnabledProviders(): Promise<Array<{ provider: Provider; priority: number }>> {
  try {
    const result = await pool.query(
      "SELECT provider, priority FROM ai_provider_settings WHERE is_enabled = true ORDER BY priority ASC"
    );
    if (result.rows.length === 0) {
      return PROVIDER_ORDER.map((p, i) => ({ provider: p, priority: (i + 1) * 10 }));
    }
    return result.rows.map(r => ({ provider: r.provider as Provider, priority: r.priority }));
  } catch {
    return PROVIDER_ORDER.map((p, i) => ({ provider: p, priority: (i + 1) * 10 }));
  }
}

async function callClaude(messages: Array<{ role: string; content: string }>, model: string, maxTokens: number, systemPrompt?: string): Promise<{ content: string; inputTokens?: number; outputTokens?: number }> {
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!baseURL || !apiKey) throw new Error("Claude integration not configured");

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, baseURL });

  const claudeMessages = messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: claudeMessages,
  });

  const content = response.content[0]?.type === "text" ? response.content[0].text : "";
  return { content, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
}

async function callOpenAI(messages: Array<{ role: string; content: string }>, model: string, maxTokens: number, systemPrompt?: string): Promise<{ content: string; inputTokens?: number; outputTokens?: number }> {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) throw new Error("OpenAI integration not configured");

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey, baseURL });

  const openaiMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  if (systemPrompt) openaiMessages.push({ role: "system", content: systemPrompt });
  openaiMessages.push(...messages.filter(m => m.role === "user" || m.role === "assistant").map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  })));

  const isLegacyModel = !model.startsWith("gpt-5") && !model.startsWith("o4") && !model.startsWith("o3");

  const response = await client.chat.completions.create({
    model,
    max_completion_tokens: maxTokens,
    messages: openaiMessages,
    ...(isLegacyModel ? { temperature: 0.7 } : {}),
  });

  const content = response.choices[0]?.message?.content || "";
  return {
    content,
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
  };
}

async function callGemini(messages: Array<{ role: string; content: string }>, model: string, maxTokens: number, systemPrompt?: string): Promise<{ content: string; inputTokens?: number; outputTokens?: number }> {
  const baseURL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!baseURL || !apiKey) throw new Error("Gemini integration not configured");

  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey, httpOptions: { baseUrl: baseURL } });

  const contents = messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const response = await client.models.generateContent({
    model,
    contents,
    config: {
      maxOutputTokens: maxTokens,
      systemInstruction: systemPrompt,
    },
  });

  const content = response.text || "";
  return { content };
}

async function callKimi(messages: Array<{ role: string; content: string }>, model: string, maxTokens: number, systemPrompt?: string): Promise<{ content: string; inputTokens?: number; outputTokens?: number }> {
  const apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  if (!apiKey) throw new Error("Kimi API key not configured");

  const baseUrl = process.env.KIMI_API_URL || "https://api.moonshot.ai/v1";
  const kimiMessages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) kimiMessages.push({ role: "system", content: systemPrompt });
  kimiMessages.push(...messages);

  const isK2 = model.startsWith("kimi-k2");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: kimiMessages, temperature: isK2 ? 1 : 0.4, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kimi API error ${response.status}: ${text}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content || "";
  return {
    content,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
  };
}

const PROVIDER_CALL_MAP: Record<Provider, (messages: Array<{ role: string; content: string }>, model: string, maxTokens: number, systemPrompt?: string) => Promise<{ content: string; inputTokens?: number; outputTokens?: number }>> = {
  claude: callClaude,
  openai: callOpenAI,
  gemini: callGemini,
  kimi: callKimi,
};

async function logToAuditLog(params: {
  userId?: string;
  provider: Provider;
  model: string;
  taskType?: string;
  inputSummary?: string;
  outputSummary?: string;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  latencyMs: number;
  statusCode: number;
  errorMessage?: string;
  actionTaken?: string;
  fallbackUsed: boolean;
  originalProvider?: Provider;
  sessionId?: string;
}) {
  try {
    await pool.query(
      `INSERT INTO ai_audit_logs (user_id, provider, model, task_type, input_summary, output_summary, input_tokens, output_tokens, total_tokens, latency_ms, status_code, error_message, action_taken, fallback_used, original_provider, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        params.userId || null,
        params.provider,
        params.model,
        params.taskType || null,
        params.inputSummary || null,
        params.outputSummary || null,
        params.inputTokens || null,
        params.outputTokens || null,
        params.inputTokens && params.outputTokens ? params.inputTokens + params.outputTokens : null,
        params.latencyMs,
        params.statusCode,
        params.errorMessage || null,
        params.actionTaken || null,
        params.fallbackUsed,
        params.originalProvider || null,
        params.sessionId || null,
      ]
    );

    if (params.statusCode === 200) {
      await pool.query(
        `UPDATE ai_provider_settings SET requests_this_month = COALESCE(requests_this_month, 0) + 1, updated_at = NOW() WHERE provider = $1`,
        [params.provider]
      );
    }
  } catch (e) {
    console.warn("[Orchestrator] Failed to log audit:", e);
  }
}

export async function orchestrate(req: OrchestrationRequest): Promise<OrchestrationResult> {
  const taskType = req.taskType || classifyTaskType(req.messages);
  const enabledProviders = await getEnabledProviders();
  const maxTokens = req.maxTokens || 8192;

  let providerOrder: Provider[] = enabledProviders.map(p => p.provider);

  if (req.forceProvider) {
    providerOrder = [req.forceProvider];
  } else if (req.preferredProvider && providerOrder.includes(req.preferredProvider)) {
    providerOrder = [req.preferredProvider, ...providerOrder.filter(p => p !== req.preferredProvider)];
  } else {
    if (taskType === "code") {
      const preferred: Provider[] = ["openai", "claude", "gemini", "kimi"];
      providerOrder = [...preferred.filter(p => providerOrder.includes(p)), ...providerOrder.filter(p => !preferred.includes(p))];
    } else if (taskType === "reasoning") {
      const preferred: Provider[] = ["claude", "openai", "gemini", "kimi"];
      providerOrder = [...preferred.filter(p => providerOrder.includes(p)), ...providerOrder.filter(p => !preferred.includes(p))];
    } else if (taskType === "hebrew") {
      const preferred: Provider[] = ["kimi", "claude", "openai", "gemini"];
      providerOrder = [...preferred.filter(p => providerOrder.includes(p)), ...providerOrder.filter(p => !preferred.includes(p))];
    } else if (taskType === "fast") {
      const preferred: Provider[] = ["gemini", "openai", "claude", "kimi"];
      providerOrder = [...preferred.filter(p => providerOrder.includes(p)), ...providerOrder.filter(p => !preferred.includes(p))];
    }
  }

  const originalProvider = providerOrder[0];
  let lastError: Error | null = null;

  for (let i = 0; i < providerOrder.length; i++) {
    const provider = providerOrder[i];
    const model = MODEL_MAP[provider][taskType];
    const callFn = PROVIDER_CALL_MAP[provider];
    const startTime = Date.now();
    const isFallback = i > 0;

    try {
      const result = await callFn(req.messages, model, maxTokens, req.systemPrompt);
      const latencyMs = Date.now() - startTime;

      await logToAuditLog({
        userId: req.userId,
        provider,
        model,
        taskType,
        inputSummary: req.messages.slice(-1)[0]?.content?.slice(0, 500),
        outputSummary: result.content.slice(0, 500),
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs,
        statusCode: 200,
        actionTaken: req.actionTaken,
        fallbackUsed: isFallback,
        originalProvider: isFallback ? originalProvider : undefined,
        sessionId: req.sessionId,
      });

      return {
        content: result.content,
        provider,
        model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs,
        fallbackUsed: isFallback,
        originalProvider: isFallback ? originalProvider : undefined,
      };
    } catch (error: any) {
      lastError = error;
      const latencyMs = Date.now() - startTime;
      console.error(`[Orchestrator] Provider ${provider} failed (attempt ${i + 1}): ${error?.message}`);

      await logToAuditLog({
        userId: req.userId,
        provider,
        model,
        taskType,
        inputSummary: req.messages.slice(-1)[0]?.content?.slice(0, 500),
        latencyMs,
        statusCode: 500,
        errorMessage: error?.message,
        fallbackUsed: isFallback,
        originalProvider: isFallback ? originalProvider : undefined,
        sessionId: req.sessionId,
      });

      if (i < providerOrder.length - 1) {
        console.log(`[Orchestrator] Falling back to ${providerOrder[i + 1]}`);
      }
    }
  }

  throw lastError || new Error("All AI providers failed");
}
