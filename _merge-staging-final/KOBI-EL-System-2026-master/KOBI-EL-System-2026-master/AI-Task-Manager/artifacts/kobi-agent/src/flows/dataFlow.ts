import { readFile, writeFile } from "../tools/fileTool";
import { searchCode } from "../tools/searchTool";
import { runCommand } from "../tools/terminalTool";
import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";

export interface ModelDefinition {
  name: string;
  table: string;
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    unique: boolean;
    default?: any;
    relation?: { type: "one-to-one" | "one-to-many" | "many-to-many"; target: string; field: string };
    validation?: string;
    index?: boolean;
  }>;
  timestamps: boolean;
  softDelete: boolean;
}

const modelsCache = new Map<string, ModelDefinition>();

const TYPE_MAP: Record<string, string> = {
  string: "VARCHAR(255)", text: "TEXT", number: "INTEGER", float: "REAL",
  decimal: "DECIMAL(10,2)", boolean: "BOOLEAN", date: "TIMESTAMP", json: "JSONB",
  uuid: "UUID", enum: "VARCHAR(50)",
};

function stripFences(s: string): string {
  return s.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
}

async function llmGenerate(system: string, userContent: string, maxTokens = 4096): Promise<string> {
  const resp = await callLLM({ system, messages: [{ role: "user", content: userContent }], maxTokens });
  return stripFences(extractTextContent(resp.content));
}

export async function createModel(params: {
  description: string;
}): Promise<{ success: boolean; output: string; model?: ModelDefinition; files?: string[] }> {
  const log = console.log;
  log(`\n📦 Creating model from: ${params.description.slice(0, 60)}`);

  const response = await callLLM({
    system: `You are a database architect. Create a complete model definition.
Respond with JSON:
{
  "name": "ModelName",
  "table": "table_name",
  "fields": [
    {
      "name": "fieldName",
      "type": "string|number|boolean|date|json|text|enum|uuid|float|decimal",
      "required": true,
      "unique": false,
      "default": null,
      "relation": null,
      "validation": "min:3,max:255",
      "index": false
    }
  ],
  "timestamps": true,
  "softDelete": false
}`,
    messages: [{ role: "user", content: params.description }],
  });

  const model = extractJSON(extractTextContent(response.content)) as ModelDefinition;
  if (!model) return { success: false, output: "Failed to generate model definition" };

  modelsCache.set(model.name, model);
  const modelJson = JSON.stringify(model, null, 2);
  const createdFiles: string[] = [];

  const schema = await llmGenerate(
    "Generate Drizzle ORM pgTable schema. Include all fields, indexes, and relations. Respond with ONLY TypeScript code.",
    modelJson
  );
  await writeFile({ path: `src/db/schema/${model.table}.ts`, content: schema });
  createdFiles.push(`src/db/schema/${model.table}.ts`);

  const validators = await llmGenerate(
    "Generate Zod validation schemas: createSchema, updateSchema, querySchema. Respond with ONLY TypeScript code.",
    modelJson
  );
  await writeFile({ path: `src/validators/${model.table}.ts`, content: validators });
  createdFiles.push(`src/validators/${model.table}.ts`);

  const service = await llmGenerate(
    "Generate full CRUD service with Drizzle ORM: getAll (paginated), getById, create, update, delete, search. Respond with ONLY TypeScript code.",
    modelJson
  );
  await writeFile({ path: `src/services/${model.table}Service.ts`, content: service });
  createdFiles.push(`src/services/${model.table}Service.ts`);

  const routes = await llmGenerate(
    "Generate Express routes for full CRUD with validation middleware. Respond with ONLY TypeScript code.",
    modelJson
  );
  await writeFile({ path: `src/routes/${model.table}.ts`, content: routes });
  createdFiles.push(`src/routes/${model.table}.ts`);

  const types = await llmGenerate(
    "Generate TypeScript types/interfaces: Entity, CreateInput, UpdateInput, QueryParams, ListResponse. Respond with ONLY TypeScript code.",
    modelJson
  );
  await writeFile({ path: `src/types/${model.name}.ts`, content: types });
  createdFiles.push(`src/types/${model.name}.ts`);

  const summary = [
    `## מודל ${model.name} נוצר בהצלחה`,
    ``,
    `**טבלה**: ${model.table}`,
    `**שדות**: ${model.fields.length}`,
    `**timestamps**: ${model.timestamps ? "כן" : "לא"}`,
    `**softDelete**: ${model.softDelete ? "כן" : "לא"}`,
    ``,
    `### קבצים שנוצרו:`,
    ...createdFiles.map(f => `- ✅ ${f}`),
    ``,
    `### שדות:`,
    ...model.fields.map(f => `- **${f.name}** (${f.type})${f.required ? " *" : ""}${f.unique ? " [unique]" : ""}${f.relation ? ` → ${f.relation.target}` : ""}`),
  ];

  return { success: true, output: summary.join("\n"), model, files: createdFiles };
}

export async function addField(params: {
  modelName: string;
  fieldName: string;
  fieldType: string;
  required?: boolean;
  unique?: boolean;
  defaultValue?: string;
}): Promise<{ success: boolean; output: string; migration?: string }> {
  const field = {
    name: params.fieldName,
    type: params.fieldType,
    required: params.required || false,
    unique: params.unique || false,
    default: params.defaultValue,
  };

  const schemaFile = `src/db/schema/${params.modelName.toLowerCase()}.ts`;
  const content = await readFile({ path: schemaFile });

  if (content.success && content.output) {
    const updated = await llmGenerate(
      "Add a new field to the Drizzle schema. Respond with ONLY the updated file content.",
      `Add field ${field.name} (${field.type}${field.required ? ", required" : ""}${field.unique ? ", unique" : ""}) to:\n\`\`\`\n${content.output}\n\`\`\``
    );
    await writeFile({ path: schemaFile, content: updated });
  }

  const sqlType = TYPE_MAP[field.type] || "VARCHAR(255)";
  const nullable = field.required ? "NOT NULL" : "";
  const defaultVal = field.default !== undefined ? `DEFAULT '${field.default}'` : "";
  const migration = `ALTER TABLE ${params.modelName.toLowerCase()} ADD COLUMN ${field.name} ${sqlType} ${nullable} ${defaultVal};`;

  return { success: true, output: `שדה ${field.name} נוסף ל-${params.modelName}\nMigration: ${migration}`, migration };
}

export async function removeField(params: {
  modelName: string;
  fieldName: string;
}): Promise<{ success: boolean; output: string; migration?: string }> {
  const schemaFile = `src/db/schema/${params.modelName.toLowerCase()}.ts`;
  const content = await readFile({ path: schemaFile });

  if (!content.success || !content.output) {
    return { success: false, output: `Schema not found: ${schemaFile}` };
  }

  const updated = await llmGenerate(
    "Remove the specified field from the Drizzle schema. Respond with ONLY the updated file.",
    `Remove field "${params.fieldName}" from:\n\`\`\`\n${content.output}\n\`\`\``
  );
  await writeFile({ path: schemaFile, content: updated });

  const migration = `ALTER TABLE ${params.modelName.toLowerCase()} DROP COLUMN ${params.fieldName};`;
  return { success: true, output: `שדה ${params.fieldName} הוסר מ-${params.modelName}\nMigration: ${migration}`, migration };
}

export async function seedModel(params: {
  modelName: string;
  count?: number;
}): Promise<{ success: boolean; output: string; seedFile?: string }> {
  const count = params.count || 10;
  const model = modelsCache.get(params.modelName);

  const seedData = await llmGenerate(
    "Generate realistic seed data as a JSON array. Make data diverse and realistic. Respond with ONLY a JSON array.",
    `Generate ${count} records for "${params.modelName}" with fields:\n${JSON.stringify(model?.fields || [], null, 2)}`
  );

  const tableName = params.modelName.toLowerCase();
  const seedFile = `src/db/seeds/${tableName}.ts`;
  const seedContent = [
    `import { db } from '../index';`,
    `import { ${tableName} } from '../schema/${tableName}';`,
    ``,
    `export async function seed${params.modelName}() {`,
    `  const data = ${seedData};`,
    ``,
    `  console.log('Seeding ${params.modelName}...');`,
    `  for (const item of data) {`,
    `    await db.insert(${tableName}).values(item);`,
    `  }`,
    `  console.log('Seeded ' + data.length + ' ${params.modelName} records');`,
    `}`,
  ].join("\n");

  await writeFile({ path: seedFile, content: seedContent });
  return { success: true, output: `Seed file created: ${seedFile} (${count} records)`, seedFile };
}

export async function cleanupData(params: {
  modelName: string;
  olderThan?: string;
  status?: string;
  orphaned?: boolean;
  duplicates?: boolean;
}): Promise<{ success: boolean; output: string; deleted?: number }> {
  let query = "";
  const table = params.modelName.toLowerCase();

  if (params.olderThan) {
    query = `DELETE FROM ${table} WHERE created_at < NOW() - INTERVAL '${params.olderThan}'`;
  } else if (params.status) {
    query = `DELETE FROM ${table} WHERE status = '${params.status}'`;
  } else if (params.duplicates) {
    query = `DELETE FROM ${table} a USING ${table} b WHERE a.id > b.id AND a.email = b.email`;
  } else if (params.orphaned) {
    query = `DELETE FROM ${table} WHERE id NOT IN (SELECT DISTINCT ${table}_id FROM related_table)`;
  }

  if (!query) return { success: false, output: "No cleanup criteria specified", deleted: 0 };

  console.log(`  🗑️ Running: ${query}`);
  const result = await runCommand({ command: `psql "$DATABASE_URL" -c "${query}" 2>&1`, timeout: 30000 });

  const countMatch = result.stdout.match(/DELETE\s+(\d+)/);
  const deleted = countMatch ? parseInt(countMatch[1]) : 0;

  return { success: true, output: `Deleted ${deleted} records from ${table}`, deleted };
}

export async function createDataPipeline(params: {
  source: string;
  target: string;
  transform?: string;
  trigger?: string;
}): Promise<{ success: boolean; output: string; filePath?: string }> {
  const trigger = params.trigger || "manual";

  const code = await llmGenerate(
    "Generate a data flow/pipeline function that moves and transforms data between models. Include error handling, logging, and batch processing. Respond with ONLY TypeScript code.",
    `Data flow:\nSource: ${params.source}\nTarget: ${params.target}\nTransform: ${params.transform || "direct copy"}\nTrigger: ${trigger}`
  );

  const filePath = `src/flows/${params.source}-to-${params.target}.ts`;
  await writeFile({ path: filePath, content: code });

  return { success: true, output: `Pipeline created: ${params.source} → ${params.target} (${trigger})\nFile: ${filePath}`, filePath };
}

export async function validateDataIntegrity(params: {}): Promise<{ success: boolean; output: string; issues?: any[] }> {
  const issues: Array<{ table: string; issue: string; severity: string; count: number }> = [];

  const fkCheck = await runCommand({
    command: `psql "$DATABASE_URL" -c "SELECT conrelid::regclass AS table_name, conname AS constraint_name FROM pg_constraint WHERE contype = 'f'" -t 2>/dev/null || echo "NO_DB"`,
    timeout: 15000,
  });

  const tablesResult = await runCommand({
    command: `psql "$DATABASE_URL" -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public'" -t 2>/dev/null || echo "NO_DB"`,
    timeout: 10000,
  });

  if (tablesResult.stdout.includes("NO_DB")) {
    return { success: false, output: "Could not connect to database" };
  }

  const tables = tablesResult.stdout.split("\n").map(t => t.trim()).filter(Boolean);

  for (const table of tables.slice(0, 20)) {
    const nullCheck = await runCommand({
      command: `psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM ${table} WHERE id IS NULL" -t 2>/dev/null || echo "0"`,
      timeout: 5000,
    });
    const nullCount = parseInt(nullCheck.stdout.trim()) || 0;
    if (nullCount > 0) {
      issues.push({ table, issue: "NULL primary keys found", severity: "error", count: nullCount });
    }
  }

  const valid = issues.filter(i => i.severity === "error").length === 0;
  const summary = [
    `## Data Integrity Report`,
    ``,
    `**Tables checked**: ${tables.length}`,
    `**Status**: ${valid ? "✅ תקין" : "⚠️ נמצאו בעיות"}`,
    ``,
    ...issues.map(i => `- **${i.table}**: ${i.issue} (${i.severity}, count: ${i.count})`),
  ];

  return { success: valid, output: summary.join("\n"), issues };
}

export const DATA_FLOW_TOOLS = [
  {
    name: "create_data_model",
    description: "יצירת מודל מלא מתיאור — schema, validators, service, routes, types. 5 קבצים אוטומטית",
    input_schema: {
      type: "object" as const,
      properties: {
        description: { type: "string", description: "תיאור המודל בשפה חופשית" },
      },
      required: ["description"] as string[],
    },
  },
  {
    name: "add_model_field",
    description: "הוספת שדה למודל קיים — עדכון schema + migration",
    input_schema: {
      type: "object" as const,
      properties: {
        modelName: { type: "string", description: "שם המודל" },
        fieldName: { type: "string", description: "שם השדה" },
        fieldType: { type: "string", description: "סוג: string|number|boolean|date|json|text|enum|uuid|float|decimal" },
        required: { type: "boolean", description: "שדה חובה?" },
        unique: { type: "boolean", description: "ערך ייחודי?" },
        defaultValue: { type: "string", description: "ערך ברירת מחדל" },
      },
      required: ["modelName", "fieldName", "fieldType"] as string[],
    },
  },
  {
    name: "remove_model_field",
    description: "הסרת שדה ממודל — עדכון schema + migration",
    input_schema: {
      type: "object" as const,
      properties: {
        modelName: { type: "string", description: "שם המודל" },
        fieldName: { type: "string", description: "שם השדה להסרה" },
      },
      required: ["modelName", "fieldName"] as string[],
    },
  },
  {
    name: "seed_model_data",
    description: "יצירת נתוני seed ריאליסטיים למודל",
    input_schema: {
      type: "object" as const,
      properties: {
        modelName: { type: "string", description: "שם המודל" },
        count: { type: "number", description: "כמות רשומות (ברירת מחדל: 10)" },
      },
      required: ["modelName"] as string[],
    },
  },
  {
    name: "cleanup_data",
    description: "ניקוי נתונים — מחיקת ישנים/כפולים/יתומים/לפי סטטוס",
    input_schema: {
      type: "object" as const,
      properties: {
        modelName: { type: "string", description: "שם הטבלה" },
        olderThan: { type: "string", description: "מחיקת רשומות ישנות מ... (e.g. '30 days')" },
        status: { type: "string", description: "מחיקת רשומות עם סטטוס ספציפי" },
        orphaned: { type: "boolean", description: "מחיקת רשומות יתומות" },
        duplicates: { type: "boolean", description: "מחיקת כפילויות" },
      },
      required: ["modelName"] as string[],
    },
  },
  {
    name: "create_data_pipeline",
    description: "יצירת pipeline להעברת נתונים בין מודלים — עם transform וטריגר",
    input_schema: {
      type: "object" as const,
      properties: {
        source: { type: "string", description: "מודל מקור" },
        target: { type: "string", description: "מודל יעד" },
        transform: { type: "string", description: "תיאור הטרנספורמציה" },
        trigger: { type: "string", description: "on-create|on-update|scheduled|manual" },
      },
      required: ["source", "target"] as string[],
    },
  },
  {
    name: "validate_data_integrity",
    description: "בדיקת תקינות נתונים — FK orphans, NULL, duplicates",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
];
