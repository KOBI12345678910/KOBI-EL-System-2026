import { db } from "@workspace/db";
import { aiProvidersTable, aiApiKeysTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { seedKimiAgents } from "./kimi-agents-seed";

const KIMI_SLUG = "moonshot-kimi";

export async function seedKimiProvider(): Promise<void> {
  try {
    let provider: typeof aiProvidersTable.$inferSelect | undefined;

    const existing = await db
      .select()
      .from(aiProvidersTable)
      .where(eq(aiProvidersTable.slug, KIMI_SLUG))
      .limit(1);

    if (existing.length > 0) {
      provider = existing[0];
      logger.info("kimi_provider_exists", { providerId: provider.id });
    } else {
      const [inserted] = await db
        .insert(aiProvidersTable)
        .values({
          name: "Kimi / Moonshot AI",
          slug: KIMI_SLUG,
          description: JSON.stringify({
            organizationId: "org-e84639ad07f543029b5d8545f663a400",
            creatorId: "d6t072d9f1khvj148as0",
            note: "Kimi 2 by Moonshot AI — מנוע ראשי של המערכת",
          }),
          website: "https://moonshot.ai",
          apiBaseUrl: "https://api.moonshot.ai/v1",
          isActive: true,
        })
        .returning();
      provider = inserted;
      logger.info("kimi_provider_seeded", { providerId: provider?.id });
    }

    if (provider) {
      const existingKey = await db
        .select()
        .from(aiApiKeysTable)
        .where(
          and(
            eq(aiApiKeysTable.providerId, provider.id),
            eq(aiApiKeysTable.keyName, "MOONSHOT_API_KEY (env secret)"),
          ),
        )
        .limit(1);

      if (existingKey.length === 0) {
        await db.insert(aiApiKeysTable).values({
          providerId: provider.id,
          keyName: "MOONSHOT_API_KEY (env secret)",
          apiKey: "stored-as-env-secret",
          isActive: true,
        });
        logger.info("kimi_api_key_linked", { providerId: provider.id });
      }
    }
    await seedKimiAgents();
  } catch (error: any) {
    logger.error("kimi_provider_seed_failed", { error: error?.message });
  }
}
