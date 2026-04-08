export interface FallbackProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

function getKimiTemperature(model: string): number {
  return model.startsWith("kimi-k2") ? 1 : 0.4;
}

function buildProviders(): FallbackProvider[] {
  const providers: FallbackProvider[] = [
    {
      name: "kimi",
      baseUrl: process.env.KIMI_API_URL || "https://api.moonshot.ai/v1",
      apiKey: process.env.KIMI_API_KEY ?? "",
      model: "kimi-k2.5",
      enabled: true,
    },
  ];

  if (process.env.OPENAI_API_KEY) {
    providers.push({
      name: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
      enabled: true,
    });
  }

  if (process.env.GROQ_API_KEY) {
    providers.push({
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      enabled: true,
    });
  }

  return providers;
}

export async function callWithFallback(
  messages: { role: string; content: string }[],
  options: {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  } = {}
): Promise<{ result: string; provider: string }> {
  const active = buildProviders().filter((p) => p.enabled && p.apiKey);

  for (const provider of active) {
    try {
      console.log(`[Fallback] מנסה ${provider.name}...`);
      const temperature =
        provider.name === "kimi"
          ? getKimiTemperature(provider.model)
          : (options.temperature ?? 0.4);

      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          max_tokens: options.maxTokens ?? 16384,
          temperature,
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });

      if (!res.ok) {
        const text = await res.text();
        console.warn(
          `[Fallback] ${provider.name} נכשל: ${res.status} ${text.slice(0, 100)}`
        );
        continue;
      }

      const data = (await res.json()) as any;
      const content = data?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        console.warn(`[Fallback] ${provider.name} החזיר תשובה ריקה`);
        continue;
      }

      console.log(`[Fallback] ${provider.name} הצליח`);
      return { result: content, provider: provider.name };
    } catch (e) {
      console.warn(
        `[Fallback] שגיאה ב-${provider.name}:`,
        (e as Error).message
      );
    }
  }

  throw new Error(
    `כל הספקים נכשלו: ${active.map((p) => p.name).join(", ")}`
  );
}
