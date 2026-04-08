import { Router, type IRouter } from "express";
const router: IRouter = Router();

const MOONSHOT_MODELS = [
  { id: "kimi-k2.5", name: "Kimi K2.5", description: "המודל המתקדם ביותר — תמיכה בתמונות, וידאו וחשיבה מעמיקה (עד 262,000 טוקנים)", maxTokens: 262144, contextWindow: 262144 },
  { id: "kimi-k2-thinking", name: "Kimi K2 Thinking", description: "מודל חשיבה מעמיקה לבעיות מורכבות (עד 262,000 טוקנים)", maxTokens: 262144, contextWindow: 262144 },
  { id: "kimi-k2-thinking-turbo", name: "Kimi K2 Thinking Turbo", description: "חשיבה מעמיקה מהירה (עד 262,000 טוקנים)", maxTokens: 262144, contextWindow: 262144 },
  { id: "moonshot-v1-128k", name: "Moonshot V1 128K", description: "מודל רב-עצמה לניתוח מסמכים גדולים (עד 128,000 טוקנים)", maxTokens: 128000, contextWindow: 128000 },
  { id: "moonshot-v1-32k", name: "Moonshot V1 32K", description: "מודל מאוזן לשיחות ארוכות וניתוח מסמכים (עד 32,000 טוקנים)", maxTokens: 32000, contextWindow: 32000 },
  { id: "moonshot-v1-8k", name: "Moonshot V1 8K", description: "מודל מהיר לשיחות קצרות ושאלות פשוטות (עד 8,000 טוקנים)", maxTokens: 8000, contextWindow: 8000 },
  { id: "moonshot-v1-auto", name: "Moonshot V1 Auto", description: "בחירת מודל אוטומטית לפי גודל ההקשר", maxTokens: 128000, contextWindow: 128000 },
];

const ORG_ID = "org-e84639ad07f543029b5d8545f663a400";
const CREATOR_ID = "d6t072d9f1khvj148as0";

function getApiKey(): string {
  return process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || "";
}

function getBaseUrl(): string {
  return process.env.KIMI_API_URL || "https://api.moonshot.ai/v1";
}

function isProviderConfigured(): boolean {
  return !!getApiKey();
}

const ATTEMPT_TIMEOUT_MS = 55_000;

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3, overallSignal?: AbortSignal): Promise<Response> {
  const makeSignal = (): AbortSignal => {
    const attemptSignal = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
    if (!overallSignal) return attemptSignal;
    const controller = new AbortController();
    const abort = () => controller.abort();
    attemptSignal.addEventListener("abort", abort, { once: true });
    overallSignal.addEventListener("abort", abort, { once: true });
    return controller.signal;
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const signal = makeSignal();
    const response = await fetch(url, { ...options, signal });
    if ((response.status === 429 || response.status === 502) && attempt < maxRetries) {
      const waitMs = response.status === 429
        ? Math.min(1000 * Math.pow(2, attempt), 8000)
        : 2000 * (attempt + 1);
      console.log(`[Kimi] ${response.status} — retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    return response;
  }
  return fetch(url, { ...options, signal: makeSignal() });
}

const OVERALL_TIMEOUT_MS = 60_000;

export async function callAIChat(messages: Array<{ role: string; content: string }>, model?: string, maxTokens = 16384): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("מפתח KIMI_API_KEY לא הוגדר");
  const useModel = model || "kimi-k2.5";
  const baseUrl = getBaseUrl();

  const overallController = new AbortController();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      overallController.abort();
      reject(Object.assign(new Error("קימי לא הגיב בזמן — נסה שוב"), { isTimeout: true }));
    }, OVERALL_TIMEOUT_MS);
  });

  const isK2Model = useModel.startsWith("kimi-k2");
  const fetchPromise = fetchWithRetry(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: useModel, messages, temperature: isK2Model ? 1 : 0.4, max_tokens: maxTokens }),
    },
    3,
    overallController.signal,
  ).then(async (response) => {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Kimi API error ${response.status}: ${text}`);
    }
    return response.json();
  });

  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

router.post("/kimi/test-connection", async (_req, res) => {
  const startTime = Date.now();

  if (!isProviderConfigured()) {
    res.status(503).json({ success: false, error: "ספק AI לא מוגדר", configured: false, responseTimeMs: Date.now() - startTime });
    return;
  }

  try {
    const data = await callAIChat([{ role: "user", content: "Say 'OK' briefly." }], undefined, 64);
    const responseTimeMs = Date.now() - startTime;
    const content = data.choices?.[0]?.message?.content || "";

    res.json({
      success: true,
      configured: true,
      provider: "kimi",
      model: data.model || "kimi-k2.5",
      responseTimeMs,
      response: content,
      usage: data.usage,
      organizationId: ORG_ID,
    });
  } catch (error: any) {
    res.status(502).json({ success: false, configured: true, error: error?.message || "Unknown error", responseTimeMs: Date.now() - startTime });
  }
});

router.post("/kimi/reset-provider", (_req, res) => {
  res.json({ success: true, provider: "kimi", message: "Kimi provider is active." });
});

router.post("/kimi/force-moonshot-test", async (_req, res) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(400).json({ success: false, error: "KIMI_API_KEY is not set" });
    return;
  }
  const baseUrl = getBaseUrl();
  const startTime = Date.now();
  try {
    const response = await fetchWithRetry(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "kimi-k2.5", messages: [{ role: "user", content: "Say OK" }], temperature: 1, max_tokens: 32 }),
    });
    const responseTimeMs = Date.now() - startTime;
    if (!response.ok) {
      const text = await response.text();
      console.error(`[Kimi] force-moonshot-test failed: ${response.status} ${text.slice(0, 200)}`);
      res.json({ success: false, status: response.status, error: text, responseTimeMs });
      return;
    }
    const data = await response.json();
    res.json({ success: true, provider: "kimi", model: data.model, content: data.choices?.[0]?.message?.content, responseTimeMs, usage: data.usage });
  } catch (err: any) {
    res.json({ success: false, error: err?.message, responseTimeMs: Date.now() - startTime });
  }
});

router.get("/kimi/models", (_req, res) => {
  res.json({ models: MOONSHOT_MODELS, defaultModel: MOONSHOT_MODELS[0].id, provider: "kimi" });
});

router.get("/kimi/status", (_req, res) => {
  const baseUrl = getBaseUrl();
  res.json({
    provider: "kimi",
    name: "Kimi AI (Moonshot)",
    configured: isProviderConfigured(),
    baseUrl,
    organizationId: ORG_ID,
    creatorId: CREATOR_ID,
    defaultModel: MOONSHOT_MODELS[0].id,
    availableModels: MOONSHOT_MODELS.map(m => m.id),
  });
});

export default router;
