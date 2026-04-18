import { db } from "./index.js";
import { sql } from "drizzle-orm";

const tables = [
  `CREATE TABLE IF NOT EXISTS kimi_agents (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    default_model TEXT NOT NULL DEFAULT 'moonshot-v1-8k',
    icon TEXT NOT NULL DEFAULT '🤖',
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS kimi_conversations (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER,
    title TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'moonshot-v1-8k',
    status TEXT NOT NULL DEFAULT 'active',
    total_messages INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS kimi_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    model TEXT,
    response_time_ms INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
];

async function run() {
  for (const t of tables) {
    await db.execute(sql.raw(t));
    const match = t.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
    console.log("Created: " + (match ? match[1] : "unknown"));
  }
  console.log("All Kimi tables created successfully");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
