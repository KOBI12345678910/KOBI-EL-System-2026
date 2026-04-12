import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pool, query } from './connection';
import { initDatabase } from './init';

interface CountRow {
  table_name: string;
  count: string;
}

const COUNT_TABLES = [
  'clients',
  'suppliers',
  'employees',
  'work_orders',
  'material_items',
  'alerts',
  'financial_transactions',
  'attendance',
  'users',
] as const;

async function runSeed(): Promise<void> {
  console.log('[db:seed] Starting seed process...');

  // Ensure the schema exists before seeding.
  await initDatabase();

  const seedPath = path.join(__dirname, 'seed.sql');
  console.log(`[db:seed] Loading seed SQL from ${seedPath}`);

  if (!fs.existsSync(seedPath)) {
    throw new Error(`seed.sql not found at ${seedPath}`);
  }

  const seedSql = fs.readFileSync(seedPath, 'utf8');

  if (!seedSql.trim()) {
    throw new Error('seed.sql is empty');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(seedSql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Collect row counts from the key tables so the operator sees what landed.
  const counts: Record<string, number> = {};
  for (const table of COUNT_TABLES) {
    try {
      const result = await query(
        `SELECT '${table}' AS table_name, COUNT(*)::text AS count FROM ${table}`
      );
      const row = result.rows[0];
      counts[table] = row ? Number(row.count) : 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[db:seed] Could not count ${table}: ${message}`);
      counts[table] = -1;
    }
  }

  console.log('Seed complete');
  console.log('[db:seed] Row counts:');
  for (const [table, count] of Object.entries(counts)) {
    const display = count === -1 ? 'error' : String(count);
    console.log(`  - ${table}: ${display}`);
  }
}

runSeed()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[db:seed] Seed failed: ${message}`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    try {
      await pool.end();
    } catch {
      // ignore pool shutdown errors during failure path
    }
    process.exit(1);
  });
