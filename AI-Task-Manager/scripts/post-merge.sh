#!/bin/bash
set -e
pnpm install --frozen-lockfile --prefer-offline 2>/dev/null || pnpm install --prefer-offline

# Skip DB sync if DATABASE_URL is not available (e.g., during publish)
# The API server will create all tables via startup-migrations.ts on startup
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL not set, skipping DB schema sync"
  exit 0
fi

node -e "
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const schemaDir = path.join(__dirname, '..', 'lib', 'db', 'src', 'schema');
if (!fs.existsSync(schemaDir)) { console.log('No schema dir found, skipping DB sync'); process.exit(0); }

const files = fs.readdirSync(schemaDir).filter(f => f.endsWith('.ts') && f !== 'index.ts');
const tableRegex = /pgTable\(['\"]([^'\"]+)['\"]/g;
const tables = [];
for (const file of files) {
  const content = fs.readFileSync(path.join(schemaDir, file), 'utf8');
  let m;
  while ((m = tableRegex.exec(content)) !== null) tables.push(m[1]);
}

try {
  const existing = execSync('psql \"\$DATABASE_URL\" -t -c \"SELECT tablename FROM pg_tables WHERE schemaname=\\\"public\\\"\"', { encoding: 'utf8' })
    .split('\n').map(l => l.trim()).filter(Boolean);
  const missing = tables.filter(t => !existing.includes(t));
  
  if (missing.length === 0) { 
    console.log('All schema tables exist'); 
    process.exit(0); 
  }
  
  console.log('Missing tables:', missing.join(', '));
  console.log('Note: API server will create missing tables via startup-migrations.ts on next start');
  process.exit(0);
} catch(e) {
  console.log('Database connection check failed, tables will be created by API server on startup');
  process.exit(0);
}
"
