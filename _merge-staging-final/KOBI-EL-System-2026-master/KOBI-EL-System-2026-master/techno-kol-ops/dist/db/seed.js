"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const connection_1 = require("./connection");
const init_1 = require("./init");
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
];
async function runSeed() {
    console.log('[db:seed] Starting seed process...');
    // Ensure the schema exists before seeding.
    await (0, init_1.initDatabase)();
    const seedPath = path_1.default.join(__dirname, 'seed.sql');
    console.log(`[db:seed] Loading seed SQL from ${seedPath}`);
    if (!fs_1.default.existsSync(seedPath)) {
        throw new Error(`seed.sql not found at ${seedPath}`);
    }
    const seedSql = fs_1.default.readFileSync(seedPath, 'utf8');
    if (!seedSql.trim()) {
        throw new Error('seed.sql is empty');
    }
    const client = await connection_1.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(seedSql);
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
    // Collect row counts from the key tables so the operator sees what landed.
    const counts = {};
    for (const table of COUNT_TABLES) {
        try {
            const result = await (0, connection_1.query)(`SELECT '${table}' AS table_name, COUNT(*)::text AS count FROM ${table}`);
            const row = result.rows[0];
            counts[table] = row ? Number(row.count) : 0;
        }
        catch (err) {
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
    await connection_1.pool.end();
    process.exit(0);
})
    .catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[db:seed] Seed failed: ${message}`);
    if (err instanceof Error && err.stack) {
        console.error(err.stack);
    }
    try {
        await connection_1.pool.end();
    }
    catch {
        // ignore pool shutdown errors during failure path
    }
    process.exit(1);
});
