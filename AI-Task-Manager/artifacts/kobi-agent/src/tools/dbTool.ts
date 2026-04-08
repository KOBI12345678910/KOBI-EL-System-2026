import { pool } from "@workspace/db";
import { runCommand } from "./terminalTool";

const DANGEROUS = ["DROP DATABASE", "DROP SCHEMA", "TRUNCATE", "ALTER SYSTEM"];

export async function dbQuery(params: { query: string; params?: any[] }): Promise<{ success: boolean; rows?: any[]; rowCount?: number; error?: string }> {
  const q = params.query.trim().toUpperCase();
  if (DANGEROUS.some(d => q.includes(d))) {
    return { success: false, error: "Dangerous command blocked" };
  }

  try {
    const result = await pool.query(params.query, params.params || []);
    const rows = result.rows || [];
    return {
      success: true,
      rows: rows.slice(0, 100),
      rowCount: result.rowCount || rows.length,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function dbDescribe(params: { table: string }): Promise<{ success: boolean; columns?: any[]; error?: string }> {
  try {
    const result = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [params.table]
    );
    return { success: true, columns: result.rows };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function dbListTables(params: { pattern?: string }): Promise<{ success: boolean; tables?: string[]; error?: string }> {
  try {
    let q = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'";
    const vals: any[] = [];
    if (params.pattern) {
      q += " AND table_name ILIKE $1";
      vals.push(`%${params.pattern}%`);
    }
    q += " ORDER BY table_name";
    const result = await pool.query(q, vals);
    return { success: true, tables: result.rows.map((r: any) => r.table_name) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function dbRunMigration(params: { command: string }): Promise<{ success: boolean; output?: string; error?: string }> {
  const result = await runCommand({ command: params.command, timeout: 60000 });
  return { success: result.success, output: result.stdout, error: result.stderr || undefined };
}

export async function dbDrizzlePush(): Promise<{ success: boolean; output?: string; error?: string }> {
  const result = await runCommand({ command: "npx drizzle-kit push", timeout: 60000 });
  return { success: result.success, output: result.stdout, error: result.stderr || undefined };
}

export async function dbDrizzleGenerate(): Promise<{ success: boolean; output?: string; error?: string }> {
  const result = await runCommand({ command: "npx drizzle-kit generate", timeout: 60000 });
  return { success: result.success, output: result.stdout, error: result.stderr || undefined };
}

export async function dbDrizzleMigrate(): Promise<{ success: boolean; output?: string; error?: string }> {
  const result = await runCommand({ command: "npx drizzle-kit migrate", timeout: 60000 });
  return { success: result.success, output: result.stdout, error: result.stderr || undefined };
}

export async function dbSeed(params: { command: string }): Promise<{ success: boolean; output?: string; error?: string }> {
  const result = await runCommand({ command: params.command, timeout: 120000 });
  return { success: result.success, output: result.stdout, error: result.stderr || undefined };
}

export const DB_TOOLS = [
  {
    name: "db_query",
    description: "Run a SQL query on the database.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "SQL query" },
        params: { type: "array", items: {}, description: "Parameters ($1, $2...)" },
      },
      required: ["query"],
    },
  },
  {
    name: "db_describe",
    description: "Describe table structure — columns, data types.",
    input_schema: {
      type: "object" as const,
      properties: {
        table: { type: "string", description: "Table name" },
      },
      required: ["table"],
    },
  },
  {
    name: "db_list_tables",
    description: "List database tables.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Filter by name (ILIKE)" },
      },
    },
  },
  {
    name: "db_run_migration",
    description: "Run a database migration command.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Migration command to run" },
      },
      required: ["command"],
    },
  },
  {
    name: "db_drizzle_push",
    description: "Run drizzle-kit push to sync schema.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "db_drizzle_generate",
    description: "Run drizzle-kit generate to create migration files.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "db_drizzle_migrate",
    description: "Run drizzle-kit migrate to apply migrations.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "db_seed",
    description: "Run a database seed command.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Seed command to run" },
      },
      required: ["command"],
    },
  },
];