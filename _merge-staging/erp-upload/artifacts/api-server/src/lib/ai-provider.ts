export interface AIProvider {
  type: "kimi";
  apiKey: string;
  baseUrl: string;
}

const VALID_MODELS = new Set([
  "kimi-k2.5",
  "kimi-k2-thinking",
  "kimi-k2-thinking-turbo",
  "kimi-k2-0905-preview",
  "kimi-k2-0711-preview",
  "kimi-k2-turbo-preview",
  "moonshot-v1-8k",
  "moonshot-v1-32k",
  "moonshot-v1-128k",
  "moonshot-v1-auto",
]);

function getKimiProvider(): AIProvider | null {
  const key = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  const baseUrl = process.env.KIMI_API_URL || "https://api.moonshot.ai/v1";
  if (key) return { type: "kimi", apiKey: key, baseUrl };
  return null;
}

export function getPrimaryProvider(): AIProvider | null {
  return getKimiProvider();
}

export function getAllProviders(): AIProvider[] {
  const provider = getKimiProvider();
  return provider ? [provider] : [];
}

export function isConfigured(): boolean {
  return !!getKimiProvider();
}

export function resolveModel(requestedModel: string, _provider: AIProvider): string {
  return VALID_MODELS.has(requestedModel) ? requestedModel : "kimi-k2.5";
}

export function validateModel(model: string): string {
  return VALID_MODELS.has(model) ? model : "kimi-k2.5";
}

export interface ChatCompletionOptions {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export async function callWithFailover(
  options: ChatCompletionOptions,
): Promise<Response> {
  const provider = getKimiProvider();
  if (!provider) {
    throw new Error("אין ספק AI מוגדר — יש להגדיר KIMI_API_KEY");
  }

  const actualModel = resolveModel(options.model || "kimi-k2.5", provider);
  const isK2Model = actualModel.startsWith("kimi-k2");
  const temperature = isK2Model ? 1 : (options.temperature ?? 0.4);
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: actualModel,
      messages: options.messages,
      temperature,
      max_tokens: options.max_tokens ?? 16384,
      stream: options.stream ?? false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kimi API error ${response.status}: ${text.slice(0, 200)}`);
  }

  return response;
}
