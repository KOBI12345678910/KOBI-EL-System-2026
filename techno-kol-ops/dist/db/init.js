"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDatabase = initDatabase;
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const connection_1 = require("./connection");
/**
 * Initialize the database by running schema.sql, but only if the `clients`
 * table does not already exist. This makes initDatabase() idempotent —
 * safe to call on every server startup.
 */
async function initDatabase() {
    console.log('[db:init] Checking database schema...');
    try {
        const existsResult = await (0, connection_1.query)(`SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = 'clients'
       ) AS exists`);
        const alreadyInitialized = existsResult.rows[0]?.exists === true;
        if (alreadyInitialized) {
            console.log('[db:init] Schema already present (clients table found). Skipping.');
            return;
        }
        const schemaPath = path_1.default.join(__dirname, 'schema.sql');
        console.log(`[db:init] Loading schema from ${schemaPath}`);
        if (!fs_1.default.existsSync(schemaPath)) {
            throw new Error(`schema.sql not found at ${schemaPath}`);
        }
        const schemaSql = fs_1.default.readFileSync(schemaPath, 'utf8');
        if (!schemaSql.trim()) {
            throw new Error('schema.sql is empty');
        }
        console.log('[db:init] Running schema.sql...');
        const client = await connection_1.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(schemaSql);
            await client.query('COMMIT');
            console.log('[db:init] Schema created successfully.');
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[db:init] Initialization failed: ${message}`);
        throw err;
    }
}
