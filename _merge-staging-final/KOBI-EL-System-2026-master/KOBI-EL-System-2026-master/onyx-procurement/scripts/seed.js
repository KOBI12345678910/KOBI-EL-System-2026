#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
 * ONYX PROCUREMENT — Legacy Seed Script
 * ───────────────────────────────────────────────────────────────────────
 * Minimal seed script that inserts basic demo data (customers, suppliers,
 * materials, bank accounts) into Supabase.
 *
 *   USAGE:
 *     node scripts/seed.js
 *
 * ENV (optional — gracefully skips DB operations when unavailable):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * See scripts/seed-data.js for the full deterministic seed generator.
 * ═══════════════════════════════════════════════════════════════════════ */

'use strict';

const path = require('path');

// Load .env if present — tolerate absence.
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

// ─────────────────────────────────────────────────────────────────────
// Demo data
// ─────────────────────────────────────────────────────────────────────

const CUSTOMERS = [
  { name: 'אלקטרו-טק בע"מ',       contact_email: 'info@electrotek.co.il',   phone: '03-5551234', city: 'תל אביב',  status: 'active' },
  { name: 'בניה חכמה ישראל',       contact_email: 'office@smartbuild.co.il', phone: '02-5559876', city: 'ירושלים',   status: 'active' },
  { name: 'תעשיות הנגב',           contact_email: 'sales@negev-ind.co.il',   phone: '08-5554321', city: 'באר שבע',   status: 'active' },
];

const SUPPLIERS = [
  { name: 'חומרי גלם צפון',        contact_email: 'orders@raw-north.co.il',  phone: '04-5551111', city: 'חיפה',      status: 'active', category: 'raw_materials' },
  { name: 'ספק ברזל ופלדה',        contact_email: 'steel@iron-supply.co.il', phone: '03-5552222', city: 'ראשון לציון', status: 'active', category: 'metals' },
  { name: 'לוגיסטיקה דרום',        contact_email: 'info@logistics-s.co.il',  phone: '08-5553333', city: 'אשדוד',     status: 'active', category: 'logistics' },
];

const MATERIALS = [
  { sku: 'MAT-001', name: 'פלדת קונסטרוקציה ST37',  unit: 'טון',  unit_price: 4200,  min_stock: 5,  category: 'metals' },
  { sku: 'MAT-002', name: 'צינורות PVC 110 מ"מ',     unit: 'מטר',  unit_price: 28,    min_stock: 200, category: 'plumbing' },
  { sku: 'MAT-003', name: 'כבל חשמל 3×2.5',          unit: 'מטר',  unit_price: 12,    min_stock: 500, category: 'electrical' },
  { sku: 'MAT-004', name: 'בטון מוכן B30',            unit: 'מ"ק',  unit_price: 380,   min_stock: 20,  category: 'concrete' },
];

const BANK_ACCOUNTS = [
  { bank_name: 'בנק הפועלים',   branch: '600', account_number: '123456', currency: 'ILS', status: 'active', is_primary: true },
  { bank_name: 'בנק לאומי',     branch: '800', account_number: '654321', currency: 'ILS', status: 'active', is_primary: false },
  { bank_name: 'בנק הפועלים',   branch: '600', account_number: '789012', currency: 'USD', status: 'active', is_primary: false },
];

// ─────────────────────────────────────────────────────────────────────
// Supabase helpers
// ─────────────────────────────────────────────────────────────────────

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
           || process.env.SUPABASE_SERVICE_KEY
           || process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    return null;
  }

  const { createClient } = require('@supabase/supabase-js');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function upsertRows(supabase, table, rows, conflictKey) {
  console.log(`  → Seeding ${rows.length} rows into "${table}"...`);
  const { data, error } = await supabase
    .from(table)
    .upsert(rows, { onConflict: conflictKey, ignoreDuplicates: true });

  if (error) {
    console.warn(`    ⚠ ${table}: ${error.message} (code ${error.code})`);
    return false;
  }
  console.log(`    ✓ ${table}: OK`);
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  ONYX PROCUREMENT — Legacy Seed                 ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  const supabase = getSupabaseClient();

  if (!supabase) {
    console.log('[seed] Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).');
    console.log('[seed] Printing demo data summary instead:\n');
    console.log(`  Customers:     ${CUSTOMERS.length} records`);
    console.log(`  Suppliers:     ${SUPPLIERS.length} records`);
    console.log(`  Materials:     ${MATERIALS.length} records`);
    console.log(`  Bank Accounts: ${BANK_ACCOUNTS.length} records`);
    console.log('\n[seed] To seed into Supabase, set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    console.log('[seed] Done (dry-run mode — no database changes).');
    process.exit(0);
  }

  console.log('[seed] Connected to Supabase. Seeding demo data...\n');

  let allOk = true;

  allOk = await upsertRows(supabase, 'customers',     CUSTOMERS,     'contact_email') && allOk;
  allOk = await upsertRows(supabase, 'suppliers',      SUPPLIERS,     'contact_email') && allOk;
  allOk = await upsertRows(supabase, 'materials',      MATERIALS,     'sku')           && allOk;
  allOk = await upsertRows(supabase, 'bank_accounts',  BANK_ACCOUNTS, 'account_number') && allOk;

  console.log('');
  if (allOk) {
    console.log('[seed] All tables seeded successfully.');
  } else {
    console.log('[seed] Completed with warnings — some tables may not exist yet.');
    console.log('[seed] Run `npm run migrate` first, then retry.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] Fatal error:', err.message || err);
  process.exit(1);
});
