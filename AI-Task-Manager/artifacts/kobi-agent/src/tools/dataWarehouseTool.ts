import { writeFile } from "./fileTool";
import { runCommand } from "./terminalTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

export async function setupSnowflake(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n❄️ מגדיר Snowflake...");

  await runCommand({ command: `cd ${WORKSPACE} && npm install snowflake-sdk`, timeout: 30000 });
  await runCommand({ command: `mkdir -p ${WORKSPACE}/src/connectors`, timeout: 5000 });

  const code = `import snowflake from 'snowflake-sdk';

const connection = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  username: process.env.SNOWFLAKE_USERNAME!,
  password: process.env.SNOWFLAKE_PASSWORD!,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'COMPUTE_WH',
  database: process.env.SNOWFLAKE_DATABASE,
  schema: process.env.SNOWFLAKE_SCHEMA || 'PUBLIC',
});

let isConnected = false;

export async function connect(): Promise<void> {
  if (isConnected) return;
  return new Promise((resolve, reject) => {
    connection.connect((err) => {
      if (err) reject(err);
      else { isConnected = true; resolve(); }
    });
  });
}

export async function query<T = any>(sql: string, binds?: any[]): Promise<T[]> {
  await connect();
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: sql,
      binds,
      complete: (err, stmt, rows) => {
        if (err) reject(err);
        else resolve((rows || []) as T[]);
      },
    });
  });
}

export async function getTables(): Promise<string[]> {
  const rows = await query("SHOW TABLES");
  return rows.map((r: any) => r.name);
}

export async function getTableSchema(tableName: string): Promise<Array<{ name: string; type: string }>> {
  const rows = await query(\`DESCRIBE TABLE \${tableName}\`);
  return rows.map((r: any) => ({ name: r.name, type: r.type }));
}

export async function disconnect(): Promise<void> {
  return new Promise((resolve) => {
    connection.destroy((err) => { isConnected = false; resolve(); });
  });
}
`;

  await writeFile({ path: `${WORKSPACE}/src/connectors/snowflake.ts`, content: code });

  return {
    success: true,
    output: `❄️ Snowflake connector מוכן:\n  📄 src/connectors/snowflake.ts\n  נדרש: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_PASSWORD`,
  };
}

export async function setupBigQuery(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n📊 מגדיר BigQuery...");

  await runCommand({ command: `cd ${WORKSPACE} && npm install @google-cloud/bigquery`, timeout: 30000 });
  await runCommand({ command: `mkdir -p ${WORKSPACE}/src/connectors`, timeout: 5000 });

  const code = `import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

export async function query<T = any>(sql: string, params?: Record<string, any>): Promise<T[]> {
  const [rows] = await bigquery.query({ query: sql, params, location: process.env.BQ_LOCATION || 'US' });
  return rows as T[];
}

export async function getDatasets(): Promise<string[]> {
  const [datasets] = await bigquery.getDatasets();
  return datasets.map((d) => d.id || '');
}

export async function getTables(datasetId: string): Promise<string[]> {
  const [tables] = await bigquery.dataset(datasetId).getTables();
  return tables.map((t) => t.id || '');
}

export async function getTableSchema(datasetId: string, tableId: string) {
  const [metadata] = await bigquery.dataset(datasetId).table(tableId).getMetadata();
  return metadata.schema?.fields || [];
}

export async function insertRows(datasetId: string, tableId: string, rows: any[]) {
  await bigquery.dataset(datasetId).table(tableId).insert(rows);
}

export async function createView(datasetId: string, viewName: string, sql: string) {
  const [view] = await bigquery.dataset(datasetId).createTable(viewName, { view: { query: sql, useLegacySql: false } });
  return view;
}
`;

  await writeFile({ path: `${WORKSPACE}/src/connectors/bigquery.ts`, content: code });

  return {
    success: true,
    output: `📊 BigQuery connector מוכן:\n  📄 src/connectors/bigquery.ts\n  נדרש: GCP_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS`,
  };
}

export async function setupDatabricks(params: {}): Promise<{ success: boolean; output: string }> {
  console.log("\n🧱 מגדיר Databricks...");

  await runCommand({ command: `cd ${WORKSPACE} && npm install @databricks/sql`, timeout: 30000 });
  await runCommand({ command: `mkdir -p ${WORKSPACE}/src/connectors`, timeout: 5000 });

  const code = `import { DBSQLClient } from '@databricks/sql';

const client = new DBSQLClient();

let session: any = null;

export async function connect(): Promise<void> {
  if (session) return;
  const connection = await client.connect({
    host: process.env.DATABRICKS_HOST!,
    path: process.env.DATABRICKS_HTTP_PATH!,
    token: process.env.DATABRICKS_TOKEN!,
  });
  session = await connection.openSession();
}

export async function query<T = any>(sql: string): Promise<T[]> {
  await connect();
  const operation = await session.executeStatement(sql);
  const result = await operation.fetchAll();
  await operation.close();
  return result as T[];
}

export async function getTables(catalog?: string, schema?: string): Promise<string[]> {
  await connect();
  const operation = await session.getTables({ catalogName: catalog, schemaName: schema });
  const tables = await operation.fetchAll();
  await operation.close();
  return tables.map((t: any) => t.TABLE_NAME);
}

export async function disconnect(): Promise<void> {
  if (session) { await session.close(); session = null; }
  await client.close();
}
`;

  await writeFile({ path: `${WORKSPACE}/src/connectors/databricks.ts`, content: code });

  return {
    success: true,
    output: `🧱 Databricks connector מוכן:\n  📄 src/connectors/databricks.ts\n  נדרש: DATABRICKS_HOST, DATABRICKS_HTTP_PATH, DATABRICKS_TOKEN`,
  };
}

export const DATA_WAREHOUSE_TOOLS = [
  {
    name: "setup_snowflake",
    description: "הגדרת Snowflake connector — connect, query, getTables, getSchema",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "setup_bigquery",
    description: "הגדרת BigQuery connector — query, datasets, tables, insert, views",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "setup_databricks",
    description: "הגדרת Databricks connector — connect, query, getTables",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
