import { db } from "@workspace/db";
import { aiModelsTable, aiProvidersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

interface ModelDef {
  providerSlug: string;
  name: string;
  slug: string;
  description: string;
  modelType: string;
  maxTokens: number;
  costPerInputToken: string;
  costPerOutputToken: string;
}

const MODELS_TO_SEED: ModelDef[] = [
  { providerSlug: "moonshot-kimi", name: "Moonshot v1 8K", slug: "moonshot-v1-8k", description: "מודל Kimi מהיר עם חלון הקשר 8K", modelType: "chat", maxTokens: 8192, costPerInputToken: "0.00000012", costPerOutputToken: "0.00000012" },
  { providerSlug: "moonshot-kimi", name: "Moonshot v1 32K", slug: "moonshot-v1-32k", description: "מודל Kimi מאוזן עם חלון הקשר 32K", modelType: "chat", maxTokens: 32768, costPerInputToken: "0.00000024", costPerOutputToken: "0.00000024" },
  { providerSlug: "moonshot-kimi", name: "Moonshot v1 128K", slug: "moonshot-v1-128k", description: "מודל Kimi רב-עצמה עם חלון הקשר 128K", modelType: "chat", maxTokens: 131072, costPerInputToken: "0.00000060", costPerOutputToken: "0.00000060" },
  { providerSlug: "moonshot-kimi", name: "Kimi 2 Standard", slug: "kimi-2-standard", description: "Kimi 2 — מנוע ראשי של המערכת, ביצועים מעולים", modelType: "chat", maxTokens: 131072, costPerInputToken: "0.00000060", costPerOutputToken: "0.00000060" },
  { providerSlug: "moonshot-kimi", name: "Kimi 2 Long Context", slug: "kimi-2-long", description: "Kimi 2 עם חלון הקשר ארוך במיוחד — 1M tokens", modelType: "chat", maxTokens: 1048576, costPerInputToken: "0.00000120", costPerOutputToken: "0.00000120" },
  { providerSlug: "anthropic", name: "Claude 3 Opus", slug: "claude-3-opus", description: "המודל החזק ביותר של Anthropic למשימות מורכבות", modelType: "chat", maxTokens: 200000, costPerInputToken: "0.00001500", costPerOutputToken: "0.00007500" },
  { providerSlug: "anthropic", name: "Claude 3.5 Haiku", slug: "claude-3-5-haiku", description: "Claude Haiku המהיר והחסכוני ביותר", modelType: "chat", maxTokens: 200000, costPerInputToken: "0.00000080", costPerOutputToken: "0.00000400" },
  { providerSlug: "anthropic", name: "Claude 3.7 Sonnet", slug: "claude-3-7-sonnet", description: "Claude Sonnet 3.7 — חכם ומהיר לשימוש יומיומי", modelType: "chat", maxTokens: 200000, costPerInputToken: "0.00000300", costPerOutputToken: "0.00001500" },
  { providerSlug: "google-ai", name: "Gemini 1.5 Flash", slug: "gemini-1-5-flash", description: "Gemini Flash — מהיר וחסכוני", modelType: "chat", maxTokens: 1048576, costPerInputToken: "0.00000007", costPerOutputToken: "0.00000021" },
  { providerSlug: "google-ai", name: "Gemini 2.0 Flash", slug: "gemini-2-0-flash", description: "Gemini 2.0 Flash — הדור הבא, מהיר ורב-תכליתי", modelType: "chat", maxTokens: 1048576, costPerInputToken: "0.00000010", costPerOutputToken: "0.00000040" },
  { providerSlug: "google-ai", name: "Gemini Pro Vision", slug: "gemini-pro-vision", description: "Gemini Pro עם יכולת עיבוד תמונות ווידאו", modelType: "chat", maxTokens: 16384, costPerInputToken: "0.00000025", costPerOutputToken: "0.00000050" },
  { providerSlug: "open-source", name: "Llama 3.1 70B", slug: "llama-3-1-70b", description: "Meta Llama 3.1 70B — מודל קוד פתוח חזק", modelType: "chat", maxTokens: 131072, costPerInputToken: "0.00000059", costPerOutputToken: "0.00000079" },
  { providerSlug: "open-source", name: "Mistral Large", slug: "mistral-large", description: "Mistral Large — מודל Mistral AI חזק", modelType: "chat", maxTokens: 131072, costPerInputToken: "0.00000300", costPerOutputToken: "0.00000900" },
  { providerSlug: "open-source", name: "Mixtral 8x7B", slug: "mixtral-8x7b", description: "Mixtral 8x7B — מודל Mixture of Experts", modelType: "chat", maxTokens: 32768, costPerInputToken: "0.00000024", costPerOutputToken: "0.00000024" },
];

export async function seedAiModels(): Promise<void> {
  try {
    const existingModels = await db.select({ slug: aiModelsTable.slug }).from(aiModelsTable);
    const existingSlugs = new Set(existingModels.map((m) => m.slug));

    const newModels = MODELS_TO_SEED.filter((m) => !existingSlugs.has(m.slug));

    if (newModels.length === 0) {
      logger.info("ai_models_already_seeded", { count: existingModels.length });
      return;
    }

    const providers = await db.select({ id: aiProvidersTable.id, slug: aiProvidersTable.slug }).from(aiProvidersTable);
    const providerMap = new Map(providers.map((p) => [p.slug, p.id]));

    const openSourceProviderId = providerMap.get("open-source");
    if (!openSourceProviderId) {
      const [newProvider] = await db
        .insert(aiProvidersTable)
        .values({
          name: "Open Source Models",
          slug: "open-source",
          description: "מודלי AI קוד פתוח כגון Llama, Mistral ו-Mixtral",
          website: "https://huggingface.co",
          apiBaseUrl: "https://api.groq.com/v1",
          isActive: true,
        })
        .returning();
      providerMap.set("open-source", newProvider.id);
      logger.info("open_source_provider_created", { providerId: newProvider.id });
    }

    for (const model of newModels) {
      const providerId = providerMap.get(model.providerSlug);
      if (!providerId) {
        logger.warn("ai_model_seed_skip_no_provider", { slug: model.slug, providerSlug: model.providerSlug });
        continue;
      }

      await db.insert(aiModelsTable).values({
        providerId,
        name: model.name,
        slug: model.slug,
        description: model.description,
        modelType: model.modelType,
        maxTokens: model.maxTokens,
        costPerInputToken: model.costPerInputToken,
        costPerOutputToken: model.costPerOutputToken,
        isActive: true,
      });
    }

    logger.info("ai_models_seeded", { count: newModels.length, total: existingModels.length + newModels.length });
  } catch (error: any) {
    logger.error("ai_models_seed_failed", { error: error?.message });
  }
}
