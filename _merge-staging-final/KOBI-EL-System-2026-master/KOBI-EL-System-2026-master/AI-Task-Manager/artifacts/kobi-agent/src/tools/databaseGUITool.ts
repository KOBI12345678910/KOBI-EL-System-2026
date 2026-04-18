import { runCommand } from "./terminalTool";
import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";

const DB_URL = process.env.DATABASE_URL || "";

async function execPsql(query: string, timeout = 30000): Promise<{ success: boolean; output: string; rows?: string[][] }> {
  const escaped = query.replace(/'/g, "'\\''");
  const result = await runCommand({ command: `psql "${DB_URL}" -t -A -F '|' -c '${escaped}'`, timeout });
  const lines = (result.output || "").trim().split("\n").filter(Boolean);
  const rows = lines.map(line => line.split("|"));
  return { success: result.success !== false, output: result.output || "", rows };
}

export async function dbGetTables(): Promise<{ success: boolean; output: string; tables?: string[] }> {
  const result = await execPsql("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;");
  const tables = (result.rows || []).map(r => r[0]).filter(Boolean);
  return { success: true, output: `Tables (${tables.length}):\n${tables.join("\n")}`, tables };
}

export async function dbGetTableInfo(params: { table: string }): Promise<{ success: boolean; output: string; info?: any }> {
  const t = params.table;
  const [colRes, idxRes, cntRes] = await Promise.all([
    execPsql(`SELECT c.column_name, c.data_type, c.is_nullable, c.column_default, CASE WHEN pk.column_name IS NOT NULL THEN 'PK' ELSE '' END, CASE WHEN fk.column_name IS NOT NULL THEN 'FK' ELSE '' END FROM information_schema.columns c LEFT JOIN (SELECT ku.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = '${t}') pk ON c.column_name = pk.column_name LEFT JOIN (SELECT ku.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = '${t}') fk ON c.column_name = fk.column_name WHERE c.table_name = '${t}' AND c.table_schema = 'public' ORDER BY c.ordinal_position;`),
    execPsql(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '${t}';`),
    execPsql(`SELECT COUNT(*) FROM "${t}";`),
  ]);

  const columns = (colRes.rows || []).map(r => ({ name: r[0], type: r[1], nullable: r[2] === "YES", default: r[3] || null, isPK: r[4] === "PK", isFK: r[5] === "FK" }));
  const indexes = (idxRes.rows || []).map(r => ({ name: r[0], definition: r[1] }));
  const rowCount = parseInt((cntRes.rows || [])[0]?.[0]) || 0;

  const info = { name: t, columns, indexes, rowCount };
  const colList = columns.map(c => `  ${c.name} ${c.type}${c.isPK ? " PK" : ""}${c.isFK ? " FK" : ""}${c.nullable ? "" : " NOT NULL"}`).join("\n");
  return { success: true, output: `Table: ${t} (${rowCount} rows)\nColumns:\n${colList}\nIndexes: ${indexes.length}`, info };
}

export async function dbQuery(params: { table: string; page?: number; pageSize?: number; orderBy?: string; orderDir?: string; where?: string; columns?: string[] }): Promise<{ success: boolean; output: string; rows?: string[][] }> {
  const page = params.page || 1;
  const pageSize = Math.min(params.pageSize || 50, 200);
  const offset = (page - 1) * pageSize;
  const cols = params.columns?.join(", ") || "*";
  const order = params.orderBy ? `ORDER BY "${params.orderBy}" ${params.orderDir || "ASC"}` : "";
  const where = params.where ? `WHERE ${params.where}` : "";

  const query = `SELECT ${cols} FROM "${params.table}" ${where} ${order} LIMIT ${pageSize} OFFSET ${offset};`;
  const result = await execPsql(query);
  return { success: true, output: `Query returned ${(result.rows || []).length} rows (page ${page}):\n${result.output}`, rows: result.rows };
}

export async function dbExecuteSQL(params: { sql: string }): Promise<{ success: boolean; output: string; rows?: string[][] }> {
  if (/^\s*(DROP|TRUNCATE|ALTER)\s/i.test(params.sql)) {
    return { success: false, output: "Dangerous DDL operations (DROP/TRUNCATE/ALTER) are blocked for safety." };
  }
  const result = await execPsql(params.sql);
  return { success: result.success, output: result.output, rows: result.rows };
}

export async function dbInsertRow(params: { table: string; data: Record<string, any> }): Promise<{ success: boolean; output: string }> {
  const columns = Object.keys(params.data).map(k => `"${k}"`).join(", ");
  const values = Object.values(params.data).map(v => typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : v === null ? "NULL" : v).join(", ");
  const result = await execPsql(`INSERT INTO "${params.table}" (${columns}) VALUES (${values}) RETURNING *;`);
  return { success: result.success, output: result.output };
}

export async function dbUpdateRow(params: { table: string; id: number | string; data: Record<string, any>; idColumn?: string }): Promise<{ success: boolean; output: string }> {
  const idCol = params.idColumn || "id";
  const setClauses = Object.entries(params.data).map(([k, v]) => `"${k}" = ${typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : v === null ? "NULL" : v}`).join(", ");
  const idVal = typeof params.id === "string" ? `'${params.id}'` : params.id;
  const result = await execPsql(`UPDATE "${params.table}" SET ${setClauses} WHERE "${idCol}" = ${idVal} RETURNING *;`);
  return { success: result.success, output: result.output };
}

export async function dbDeleteRow(params: { table: string; id: number | string; idColumn?: string }): Promise<{ success: boolean; output: string }> {
  const idCol = params.idColumn || "id";
  const idVal = typeof params.id === "string" ? `'${params.id}'` : params.id;
  const result = await execPsql(`DELETE FROM "${params.table}" WHERE "${idCol}" = ${idVal};`);
  return { success: result.success, output: `Deleted row from ${params.table} where ${idCol}=${params.id}` };
}

export async function dbGetSchema(): Promise<{ success: boolean; output: string }> {
  const result = await runCommand({ command: `pg_dump "${DB_URL}" --schema-only --no-owner --no-privileges 2>/dev/null | head -500`, timeout: 15000 });
  return { success: true, output: result.output || "No schema output" };
}

export async function dbGenerateSeed(params: { table: string; count?: number }): Promise<{ success: boolean; output: string }> {
  const info = await dbGetTableInfo({ table: params.table });
  if (!info.info) return { success: false, output: `Table ${params.table} not found` };

  const count = params.count || 10;
  const colList = info.info.columns.map((c: any) => `  ${c.name} ${c.type}${c.isPK ? " PK" : ""}${c.nullable ? " NULLABLE" : " NOT NULL"}`).join("\n");

  const response = await callLLM({
    system: "Generate realistic seed data INSERT statements. Respond with ONLY SQL.",
    messages: [{ role: "user", content: `Generate ${count} INSERT statements for table "${params.table}" with columns:\n${colList}\n\nGenerate realistic, diverse data. Use proper SQL syntax.` }],
  });

  let sql = extractTextContent(response.content).replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  return { success: true, output: sql };
}

export const DATABASE_GUI_TOOLS = [
  { name: "db_get_tables", description: "List all database tables in the public schema", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "db_get_table_info", description: "Get detailed table info: columns, types, PKs, FKs, indexes, row count", input_schema: { type: "object" as const, properties: { table: { type: "string" } }, required: ["table"] as string[] } },
  { name: "db_query", description: "Query a table with pagination, sorting, filtering, and column selection", input_schema: { type: "object" as const, properties: { table: { type: "string" }, page: { type: "number" }, pageSize: { type: "number" }, orderBy: { type: "string" }, orderDir: { type: "string", enum: ["ASC", "DESC"] }, where: { type: "string", description: "SQL WHERE clause (without WHERE keyword)" }, columns: { type: "array", items: { type: "string" } } }, required: ["table"] as string[] } },
  { name: "db_execute_sql", description: "Execute raw SQL query (blocks DROP/TRUNCATE/ALTER for safety)", input_schema: { type: "object" as const, properties: { sql: { type: "string" } }, required: ["sql"] as string[] } },
  { name: "db_insert_row", description: "Insert a row into a table", input_schema: { type: "object" as const, properties: { table: { type: "string" }, data: { type: "object", description: "Column-value pairs" } }, required: ["table", "data"] as string[] } },
  { name: "db_update_row", description: "Update a row in a table by ID", input_schema: { type: "object" as const, properties: { table: { type: "string" }, id: { type: "number" }, data: { type: "object" }, idColumn: { type: "string" } }, required: ["table", "id", "data"] as string[] } },
  { name: "db_delete_row", description: "Delete a row from a table by ID", input_schema: { type: "object" as const, properties: { table: { type: "string" }, id: { type: "number" }, idColumn: { type: "string" } }, required: ["table", "id"] as string[] } },
  { name: "db_get_schema", description: "Get the full database schema (pg_dump --schema-only)", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "db_generate_seed", description: "AI-generate realistic seed data INSERT statements for a table", input_schema: { type: "object" as const, properties: { table: { type: "string" }, count: { type: "number", description: "Number of rows to generate (default 10)" } }, required: ["table"] as string[] } },
];