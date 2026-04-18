import { db } from "@workspace/db";
import { autoNumberCountersTable, entityFieldsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

export interface AutoNumberConfig {
  prefix: string;
  suffix: string;
  padding: number;
  startValue: number;
  incrementBy: number;
}

export function formatAutoNumber(config: AutoNumberConfig, value: number): string {
  const paddedNumber = String(value).padStart(config.padding, "0");
  return `${config.prefix}${paddedNumber}${config.suffix}`;
}

export async function getNextAutoNumber(entityId: number, fieldSlug: string): Promise<string> {
  const [field] = await db
    .select()
    .from(entityFieldsTable)
    .where(
      and(
        eq(entityFieldsTable.entityId, entityId),
        eq(entityFieldsTable.slug, fieldSlug)
      )
    );

  const settings = (field?.settings as Record<string, unknown>) || {};
  const config: AutoNumberConfig = {
    prefix: typeof settings.prefix === "string" ? settings.prefix : "",
    suffix: typeof settings.suffix === "string" ? settings.suffix : "",
    padding: typeof settings.padding === "number" ? settings.padding : 4,
    startValue: typeof settings.startValue === "number" ? settings.startValue : 1,
    incrementBy: typeof settings.incrementBy === "number" ? settings.incrementBy : 1,
  };

  const rows = await db
    .insert(autoNumberCountersTable)
    .values({
      entityId,
      fieldSlug,
      prefix: config.prefix,
      suffix: config.suffix,
      padding: config.padding,
      currentValue: config.startValue,
      startValue: config.startValue,
      incrementBy: config.incrementBy,
    })
    .onConflictDoUpdate({
      target: [autoNumberCountersTable.entityId, autoNumberCountersTable.fieldSlug],
      set: {
        currentValue: sql`${autoNumberCountersTable.currentValue} + ${autoNumberCountersTable.incrementBy}`,
        updatedAt: new Date(),
      },
    })
    .returning({
      currentValue: autoNumberCountersTable.currentValue,
      prefix: autoNumberCountersTable.prefix,
      suffix: autoNumberCountersTable.suffix,
      padding: autoNumberCountersTable.padding,
    });

  const row = rows[0];
  if (!row) {
    throw new Error(`Failed to generate auto number for entity ${entityId}, field ${fieldSlug}`);
  }

  return formatAutoNumber(
    {
      prefix: row.prefix,
      suffix: row.suffix,
      padding: row.padding,
      startValue: config.startValue,
      incrementBy: config.incrementBy,
    },
    row.currentValue
  );
}

export async function generateAutoNumberFields(
  entityId: number,
  data: Record<string, any>,
  fields: Array<{ slug: string; fieldType: string }>
): Promise<Record<string, any>> {
  const result = { ...data };
  const autoNumberFields = fields.filter((f) => f.fieldType === "auto_number");

  for (const field of autoNumberFields) {
    if (!result[field.slug]) {
      result[field.slug] = await getNextAutoNumber(entityId, field.slug);
    }
  }

  return result;
}
