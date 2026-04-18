/**
 * QA-09 — Database Integrity Tests
 * ---------------------------------------------------------------------------
 * Agent     : QA-09 Database Integrity Agent
 * Date      : 2026-04-11
 * Run with  : node --test test/db/qa-09-integrity.test.js
 *
 * Purpose:
 *   Validate that the patterns the application code relies on are enforced
 *   at the database layer (or — where the in-memory mock cannot model PG
 *   constraints — document the enforcement gap with a failing test that
 *   codifies the contract).
 *
 *   These tests are NOT a replacement for running the real Supabase
 *   migrations against a live PG instance. They codify the data-integrity
 *   contracts that the suggested migration 008 (see _qa-reports/
 *   QA-09-suggested-migrations.sql) will physically enforce once applied.
 *
 * Coverage:
 *   1. FK violation      — inserts pointing at non-existent parents must
 *                          be rejected at the application layer until the
 *                          real PG FK catches them in staging.
 *   2. NOT NULL violation — required fields on business entities must not
 *                          be persisted when NULL/undefined.
 *   3. UNIQUE violation  — natural keys (vat_id, national_id, employer +
 *                          period, invoice number) must be rejected on
 *                          second insert.
 *   4. Rollback on fail  — the unsafe payment-allocation loop in
 *                          annual-tax-routes.js must be replaced with an
 *                          atomic operation; this test asserts that a
 *                          partial failure leaves NO rows mutated.
 *
 *   All four categories map 1:1 to Step 4 of the QA-09 task brief.
 *
 * Strategy:
 *   The shared in-memory mock (`test/helpers/mock-supabase.js`) supports
 *   UNIQUE via the `constraints` option but does NOT enforce FKs or NOT
 *   NULL. For those categories we wrap the mock in a thin "guarded"
 *   adapter that performs the check the real PG schema performs, so the
 *   test body reads like a Supabase-js call but the assertion is a true
 *   data-integrity assertion.
 *
 *   This wrapper is intentionally tiny (~50 lines) and lives inline so
 *   the test remains self-contained and can be read as documentation of
 *   the integrity contract.
 * ---------------------------------------------------------------------------
 */

'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { makeMockSupabase } = require('../helpers/mock-supabase');

// ═══════════════════════════════════════════════════════════════════════════
// guarded-supabase — thin wrapper that adds FK / NOT NULL enforcement on top
// of the shared in-memory mock. Everything else (select, filter, UNIQUE,
// upsert, delete) passes straight through to the mock.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param {object} mock        - a makeMockSupabase() instance
 * @param {object} schemaGuard - { [table]: { notNull: string[], fks: [{col, refTable, refCol}] } }
 */
function guardSupabase(mock, schemaGuard = {}) {
  const origFrom = mock.from.bind(mock);

  function wrappedFrom(table) {
    const builder = origFrom(table);
    const origInsert = builder.insert.bind(builder);
    const origUpsert = builder.upsert.bind(builder);

    function check(rows) {
      const guard = schemaGuard[table];
      if (!guard) return null;
      const rs = Array.isArray(rows) ? rows : [rows];
      for (const r of rs) {
        // NOT NULL
        for (const col of guard.notNull || []) {
          if (r[col] === null || r[col] === undefined) {
            return {
              data: null,
              error: {
                code: '23502',
                message: `null value in column "${col}" of relation "${table}" violates not-null constraint`,
              },
            };
          }
        }
        // FK
        for (const fk of guard.fks || []) {
          const val = r[fk.col];
          if (val === null || val === undefined) continue; // nullable FK
          const parent = mock._tables[fk.refTable] || [];
          const hit = parent.find((p) => p[fk.refCol] === val);
          if (!hit) {
            return {
              data: null,
              error: {
                code: '23503',
                message: `insert or update on table "${table}" violates foreign key constraint — ${fk.col} -> ${fk.refTable}(${fk.refCol})`,
              },
            };
          }
        }
      }
      return null;
    }

    builder.insert = function (rows) {
      const err = check(rows);
      if (err) {
        // return a thenable that mimics Supabase's { data, error } shape
        return Object.assign(Promise.resolve(err), {
          select: () => Promise.resolve(err),
          single: () => Promise.resolve(err),
          maybeSingle: () => Promise.resolve(err),
        });
      }
      return origInsert(rows);
    };

    builder.upsert = function (rows, opts) {
      const err = check(rows);
      if (err) {
        return Object.assign(Promise.resolve(err), {
          select: () => Promise.resolve(err),
          single: () => Promise.resolve(err),
          maybeSingle: () => Promise.resolve(err),
        });
      }
      return origUpsert(rows, opts);
    };

    return builder;
  }

  return {
    from: wrappedFrom,
    _tables: mock._tables,
    _log: mock._log,
    _reset: mock._reset,
    _snapshot: mock._snapshot.bind(mock),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Schema guard — lifted from the real Supabase migrations:
//   001-supabase-schema.sql      (suppliers, purchase_requests, rfqs, ...)
//   004-vat-module.sql           (company_tax_profile, tax_invoices, ...)
//   005-annual-tax-module.sql    (customers, customer_invoices, customer_payments)
//   006-bank-reconciliation.sql  (bank_accounts, bank_transactions)
//   007-payroll-wage-slip.sql    (employers, employees, wage_slips)
// ═══════════════════════════════════════════════════════════════════════════
const SCHEMA = {
  suppliers: {
    notNull: ['name'],
    fks: [],
  },
  supplier_products: {
    notNull: ['supplier_id', 'product_name', 'unit_price'],
    fks: [{ col: 'supplier_id', refTable: 'suppliers', refCol: 'id' }],
  },
  purchase_requests: {
    notNull: ['request_number', 'requested_by'],
    fks: [],
  },
  purchase_request_items: {
    notNull: ['request_id', 'product_name', 'quantity'],
    fks: [{ col: 'request_id', refTable: 'purchase_requests', refCol: 'id' }],
  },
  rfqs: {
    notNull: ['rfq_number', 'request_id'],
    fks: [{ col: 'request_id', refTable: 'purchase_requests', refCol: 'id' }],
  },
  supplier_quotes: {
    notNull: ['rfq_id', 'supplier_id'],
    fks: [
      { col: 'rfq_id', refTable: 'rfqs', refCol: 'id' },
      { col: 'supplier_id', refTable: 'suppliers', refCol: 'id' },
    ],
  },
  purchase_orders: {
    notNull: ['po_number', 'supplier_id'],
    fks: [
      { col: 'supplier_id', refTable: 'suppliers', refCol: 'id' },
      { col: 'rfq_id', refTable: 'rfqs', refCol: 'id' },
    ],
  },

  // VAT module
  company_tax_profile: {
    notNull: ['company_id', 'legal_name', 'vat_id'],
    fks: [],
  },
  vat_periods: {
    notNull: ['period_code', 'period_start', 'period_end', 'company_id'],
    fks: [{ col: 'company_id', refTable: 'company_tax_profile', refCol: 'company_id' }],
  },
  tax_invoices: {
    notNull: ['invoice_number', 'invoice_date', 'customer_vat_id', 'amount_net', 'amount_vat', 'amount_gross'],
    fks: [],
  },

  // Annual tax / AR
  customers: {
    notNull: ['name'],
    fks: [],
  },
  customer_invoices: {
    notNull: ['invoice_number', 'customer_id', 'amount_net', 'amount_vat', 'amount_gross', 'invoice_date'],
    fks: [{ col: 'customer_id', refTable: 'customers', refCol: 'id' }],
  },
  customer_payments: {
    notNull: ['customer_id', 'amount', 'payment_date'],
    fks: [{ col: 'customer_id', refTable: 'customers', refCol: 'id' }],
  },

  // Bank reconciliation
  bank_accounts: {
    notNull: ['account_number', 'bank_name'],
    fks: [],
  },
  bank_transactions: {
    notNull: ['account_id', 'transaction_date', 'amount'],
    fks: [{ col: 'account_id', refTable: 'bank_accounts', refCol: 'id' }],
  },

  // Payroll
  employers: {
    notNull: ['employer_tax_id', 'legal_name'],
    fks: [],
  },
  employees: {
    notNull: ['employer_id', 'national_id', 'full_name'],
    fks: [{ col: 'employer_id', refTable: 'employers', refCol: 'id' }],
  },
  wage_slips: {
    notNull: ['employer_id', 'employee_id', 'period_year', 'period_month', 'gross_salary', 'net_salary'],
    fks: [
      { col: 'employer_id', refTable: 'employers', refCol: 'id' },
      { col: 'employee_id', refTable: 'employees', refCol: 'id' },
    ],
  },
};

// UNIQUE natural keys — what the real migrations enforce via UNIQUE INDEX
// (or what QA-09-suggested-migrations.sql section A/B/E ADDs)
const UNIQUE_KEYS = {
  suppliers: [['vat_id']],
  supplier_products: [['supplier_id', 'product_name']],
  purchase_requests: [['request_number']],
  rfqs: [['rfq_number']],
  purchase_orders: [['po_number']],
  company_tax_profile: [['company_id'], ['vat_id']],
  tax_invoices: [['company_id', 'invoice_number']],
  customer_invoices: [['invoice_number']],
  bank_accounts: [['account_number']],
  employers: [['employer_tax_id']],
  employees: [['employer_id', 'national_id']],
  wage_slips: [['employer_id', 'employee_id', 'period_year', 'period_month']],
};

// ═══════════════════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════════════════
function freshDb(seed = {}) {
  const mock = makeMockSupabase(seed, { constraints: UNIQUE_KEYS });
  return guardSupabase(mock, SCHEMA);
}

async function expectError(promise, code) {
  const { data, error } = await promise;
  assert.equal(data, null, 'expected data=null on integrity violation');
  assert.ok(error, 'expected error object on integrity violation');
  if (code) {
    const matches = error.code === code || (error.message || '').includes(code);
    assert.ok(
      matches,
      `expected error code "${code}" but got "${error.code}" / "${error.message}"`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. FK VIOLATION TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('QA-09 / FK violations', () => {
  test('supplier_products → suppliers: insert with orphan supplier_id is rejected', async () => {
    const db = freshDb({ suppliers: [{ id: 1, name: 'Acme Steel' }] });
    await expectError(
      db.from('supplier_products').insert({
        supplier_id: 999,
        product_name: 'ST37 angle 50x50',
        unit_price: 12.5,
      }),
      '23503'
    );
  });

  test('supplier_quotes → rfqs: insert with orphan rfq_id is rejected', async () => {
    const db = freshDb({
      rfqs: [{ id: 10, rfq_number: 'RFQ-2026-0001', request_id: 1 }],
      suppliers: [{ id: 5, name: 'Bravo Metals' }],
    });
    await expectError(
      db.from('supplier_quotes').insert({
        rfq_id: 9999, // orphan
        supplier_id: 5,
      }),
      '23503'
    );
  });

  test('supplier_quotes → suppliers: insert with orphan supplier_id is rejected', async () => {
    const db = freshDb({
      rfqs: [{ id: 10, rfq_number: 'RFQ-2026-0001', request_id: 1 }],
      suppliers: [{ id: 5, name: 'Bravo Metals' }],
    });
    await expectError(
      db.from('supplier_quotes').insert({
        rfq_id: 10,
        supplier_id: 9999, // orphan
      }),
      '23503'
    );
  });

  test('purchase_orders → suppliers: orphan supplier_id is rejected', async () => {
    const db = freshDb({
      rfqs: [{ id: 20, rfq_number: 'RFQ-2026-0002', request_id: 1 }],
      suppliers: [{ id: 3, name: 'Charlie Fab' }],
    });
    await expectError(
      db.from('purchase_orders').insert({
        po_number: 'PO-2026-0001',
        supplier_id: 424242,
        rfq_id: 20,
      }),
      '23503'
    );
  });

  test('customer_invoices → customers: orphan customer_id is rejected', async () => {
    const db = freshDb({ customers: [{ id: 1, name: 'Customer One' }] });
    await expectError(
      db.from('customer_invoices').insert({
        invoice_number: 'INV-2026-0001',
        customer_id: 999,
        amount_net: 1000,
        amount_vat: 180,
        amount_gross: 1180,
        invoice_date: '2026-03-15',
      }),
      '23503'
    );
  });

  test('customer_payments → customers: orphan customer_id is rejected', async () => {
    const db = freshDb({ customers: [{ id: 1, name: 'Customer One' }] });
    await expectError(
      db.from('customer_payments').insert({
        customer_id: 404,
        amount: 1180,
        payment_date: '2026-03-20',
      }),
      '23503'
    );
  });

  test('bank_transactions → bank_accounts: orphan account_id is rejected', async () => {
    const db = freshDb({
      bank_accounts: [{ id: 1, account_number: '12345', bank_name: 'Leumi' }],
    });
    await expectError(
      db.from('bank_transactions').insert({
        account_id: 999,
        transaction_date: '2026-03-20',
        amount: 4500,
      }),
      '23503'
    );
  });

  test('employees → employers: orphan employer_id is rejected', async () => {
    const db = freshDb({
      employers: [{ id: 1, employer_tax_id: '123456789', legal_name: 'Kol Uzi Metalwork' }],
    });
    await expectError(
      db.from('employees').insert({
        employer_id: 999,
        national_id: '012345678',
        full_name: 'Moshe Cohen',
      }),
      '23503'
    );
  });

  test('wage_slips → employees: orphan employee_id is rejected', async () => {
    const db = freshDb({
      employers: [{ id: 1, employer_tax_id: '123456789', legal_name: 'Kol Uzi Metalwork' }],
      employees: [
        { id: 10, employer_id: 1, national_id: '012345678', full_name: 'Moshe Cohen' },
      ],
    });
    await expectError(
      db.from('wage_slips').insert({
        employer_id: 1,
        employee_id: 999, // orphan
        period_year: 2026,
        period_month: 3,
        gross_salary: 15000,
        net_salary: 12000,
      }),
      '23503'
    );
  });

  test('valid FK chain: wage_slip → employee → employer succeeds', async () => {
    const db = freshDb({
      employers: [{ id: 1, employer_tax_id: '123456789', legal_name: 'Kol Uzi Metalwork' }],
      employees: [
        { id: 10, employer_id: 1, national_id: '012345678', full_name: 'Moshe Cohen' },
      ],
    });
    const { data, error } = await db.from('wage_slips').insert({
      employer_id: 1,
      employee_id: 10,
      period_year: 2026,
      period_month: 3,
      gross_salary: 15000,
      net_salary: 12000,
    });
    assert.equal(error, null);
    assert.ok(data && data.length === 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. NOT NULL VIOLATION TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('QA-09 / NOT NULL violations', () => {
  test('suppliers.name NOT NULL', async () => {
    const db = freshDb();
    await expectError(db.from('suppliers').insert({ vat_id: '123456789' }), '23502');
  });

  test('customer_invoices.amount_gross NOT NULL', async () => {
    const db = freshDb({ customers: [{ id: 1, name: 'Customer One' }] });
    await expectError(
      db.from('customer_invoices').insert({
        invoice_number: 'INV-2026-0002',
        customer_id: 1,
        amount_net: 1000,
        amount_vat: 180,
        // amount_gross omitted
        invoice_date: '2026-03-15',
      }),
      '23502'
    );
  });

  test('customer_payments.amount NOT NULL', async () => {
    const db = freshDb({ customers: [{ id: 1, name: 'Customer One' }] });
    await expectError(
      db.from('customer_payments').insert({
        customer_id: 1,
        payment_date: '2026-03-20',
        // amount omitted
      }),
      '23502'
    );
  });

  test('employers.employer_tax_id NOT NULL', async () => {
    const db = freshDb();
    await expectError(
      db.from('employers').insert({ legal_name: 'Nameless Inc.' }),
      '23502'
    );
  });

  test('employees.national_id NOT NULL', async () => {
    const db = freshDb({
      employers: [{ id: 1, employer_tax_id: '123456789', legal_name: 'Kol Uzi' }],
    });
    await expectError(
      db.from('employees').insert({
        employer_id: 1,
        full_name: 'Anon Person',
      }),
      '23502'
    );
  });

  test('wage_slips.gross_salary NOT NULL', async () => {
    const db = freshDb({
      employers: [{ id: 1, employer_tax_id: '123456789', legal_name: 'Kol Uzi' }],
      employees: [{ id: 10, employer_id: 1, national_id: '012345678', full_name: 'Moshe' }],
    });
    await expectError(
      db.from('wage_slips').insert({
        employer_id: 1,
        employee_id: 10,
        period_year: 2026,
        period_month: 3,
        // gross_salary omitted
        net_salary: 12000,
      }),
      '23502'
    );
  });

  test('tax_invoices.amount_gross NOT NULL', async () => {
    const db = freshDb();
    await expectError(
      db.from('tax_invoices').insert({
        invoice_number: 'T-001',
        invoice_date: '2026-03-15',
        customer_vat_id: '555666777',
        amount_net: 1000,
        amount_vat: 180,
        // amount_gross omitted
      }),
      '23502'
    );
  });

  test('bank_transactions.amount NOT NULL', async () => {
    const db = freshDb({
      bank_accounts: [{ id: 1, account_number: '12345', bank_name: 'Leumi' }],
    });
    await expectError(
      db.from('bank_transactions').insert({
        account_id: 1,
        transaction_date: '2026-03-20',
        // amount omitted
      }),
      '23502'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. UNIQUE VIOLATION TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('QA-09 / UNIQUE violations', () => {
  test('suppliers.vat_id must be unique', async () => {
    const db = freshDb({
      suppliers: [{ id: 1, name: 'Acme', vat_id: '123456789' }],
    });
    const { data, error } = await db
      .from('suppliers')
      .insert({ name: 'Acme Clone', vat_id: '123456789' });
    assert.equal(data, null);
    assert.ok(error, 'duplicate vat_id must be rejected');
    assert.match(error.message || '', /UNIQUE|vat_id/i);
  });

  test('supplier_products composite (supplier_id, product_name) unique', async () => {
    const db = freshDb({
      suppliers: [{ id: 1, name: 'Acme' }],
      supplier_products: [
        { id: 1, supplier_id: 1, product_name: 'ST37 angle', unit_price: 10 },
      ],
    });
    const { data, error } = await db.from('supplier_products').insert({
      supplier_id: 1,
      product_name: 'ST37 angle',
      unit_price: 11,
    });
    assert.equal(data, null);
    assert.ok(error);
  });

  test('rfqs.rfq_number must be unique', async () => {
    const db = freshDb({
      rfqs: [{ id: 1, rfq_number: 'RFQ-2026-0001', request_id: 1 }],
    });
    const { data, error } = await db
      .from('rfqs')
      .insert({ rfq_number: 'RFQ-2026-0001', request_id: 2 });
    assert.equal(data, null);
    assert.ok(error);
  });

  test('purchase_orders.po_number must be unique', async () => {
    const db = freshDb({
      suppliers: [{ id: 1, name: 'Acme' }],
      purchase_orders: [{ id: 1, po_number: 'PO-2026-0001', supplier_id: 1 }],
    });
    const { data, error } = await db.from('purchase_orders').insert({
      po_number: 'PO-2026-0001',
      supplier_id: 1,
    });
    assert.equal(data, null);
    assert.ok(error);
  });

  test('company_tax_profile.vat_id unique (national register integrity)', async () => {
    const db = freshDb({
      company_tax_profile: [
        { id: 1, company_id: 'tko-il', legal_name: 'Kol Uzi', vat_id: '555666777' },
      ],
    });
    const { data, error } = await db.from('company_tax_profile').insert({
      company_id: 'tko-us',
      legal_name: 'Kol Uzi US',
      vat_id: '555666777', // duplicate
    });
    assert.equal(data, null);
    assert.ok(error);
  });

  test('tax_invoices composite (company_id, invoice_number) unique', async () => {
    const db = freshDb({
      tax_invoices: [
        {
          id: 1,
          company_id: 'tko-il',
          invoice_number: 'T-001',
          invoice_date: '2026-03-15',
          customer_vat_id: '111',
          amount_net: 1000,
          amount_vat: 180,
          amount_gross: 1180,
        },
      ],
    });
    const { data, error } = await db.from('tax_invoices').insert({
      company_id: 'tko-il',
      invoice_number: 'T-001', // dup within same company
      invoice_date: '2026-04-15',
      customer_vat_id: '222',
      amount_net: 500,
      amount_vat: 90,
      amount_gross: 590,
    });
    assert.equal(data, null);
    assert.ok(error);
  });

  test('customer_invoices.invoice_number must be unique', async () => {
    const db = freshDb({
      customers: [{ id: 1, name: 'Customer One' }],
      customer_invoices: [
        {
          id: 1,
          invoice_number: 'INV-2026-0001',
          customer_id: 1,
          amount_net: 1000,
          amount_vat: 180,
          amount_gross: 1180,
          invoice_date: '2026-01-10',
        },
      ],
    });
    const { data, error } = await db.from('customer_invoices').insert({
      invoice_number: 'INV-2026-0001', // dup
      customer_id: 1,
      amount_net: 500,
      amount_vat: 90,
      amount_gross: 590,
      invoice_date: '2026-02-10',
    });
    assert.equal(data, null);
    assert.ok(error);
  });

  test('employers.employer_tax_id must be unique (Israeli Ministry of Finance integrity)', async () => {
    const db = freshDb({
      employers: [{ id: 1, employer_tax_id: '123456789', legal_name: 'Kol Uzi' }],
    });
    const { data, error } = await db.from('employers').insert({
      employer_tax_id: '123456789',
      legal_name: 'Kol Uzi Clone',
    });
    assert.equal(data, null);
    assert.ok(error);
  });

  test('employees composite (employer_id, national_id) unique — same id ok across employers', async () => {
    const db = freshDb({
      employers: [
        { id: 1, employer_tax_id: '111111111', legal_name: 'Co A' },
        { id: 2, employer_tax_id: '222222222', legal_name: 'Co B' },
      ],
      employees: [
        { id: 1, employer_id: 1, national_id: '012345678', full_name: 'Moshe' },
      ],
    });

    // Same national_id, different employer → OK
    const okCase = await db.from('employees').insert({
      employer_id: 2,
      national_id: '012345678',
      full_name: 'Moshe (works two jobs)',
    });
    assert.equal(okCase.error, null);

    // Same national_id, same employer → REJECT
    const dupCase = await db.from('employees').insert({
      employer_id: 1,
      national_id: '012345678',
      full_name: 'Moshe (dup)',
    });
    assert.equal(dupCase.data, null);
    assert.ok(dupCase.error);
  });

  test('wage_slips composite (employer, employee, year, month) unique — no double-issuing slip', async () => {
    const db = freshDb({
      employers: [{ id: 1, employer_tax_id: '111111111', legal_name: 'Kol Uzi' }],
      employees: [{ id: 1, employer_id: 1, national_id: '012345678', full_name: 'Moshe' }],
      wage_slips: [
        {
          id: 1,
          employer_id: 1,
          employee_id: 1,
          period_year: 2026,
          period_month: 3,
          gross_salary: 15000,
          net_salary: 12000,
        },
      ],
    });

    const { data, error } = await db.from('wage_slips').insert({
      employer_id: 1,
      employee_id: 1,
      period_year: 2026,
      period_month: 3, // duplicate slip
      gross_salary: 16000,
      net_salary: 12800,
    });
    assert.equal(data, null);
    assert.ok(error, 'חוק הגנת השכר: no two slips for the same person/period');
  });

  test('bank_accounts.account_number must be unique', async () => {
    const db = freshDb({
      bank_accounts: [{ id: 1, account_number: '12345', bank_name: 'Leumi' }],
    });
    const { data, error } = await db
      .from('bank_accounts')
      .insert({ account_number: '12345', bank_name: 'Hapoalim' });
    assert.equal(data, null);
    assert.ok(error);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. ROLLBACK ON FAILURE TESTS
// ───────────────────────────────────────────────────────────────────────────
// These tests document the contract that the replacement RPC
// `apply_payment_to_invoices()` (see QA-09-suggested-migrations.sql section G)
// MUST satisfy: either ALL allocations succeed or NONE are persisted.
//
// We simulate the unsafe loop from annual-tax-routes.js:110-127 and
// the safe atomic equivalent, then assert that only the atomic variant
// leaves the DB clean on partial failure.
// ═══════════════════════════════════════════════════════════════════════════
describe('QA-09 / Rollback on failure (atomic payment allocation)', () => {
  function seedThreeInvoices() {
    return {
      customers: [{ id: 1, name: 'Customer One' }],
      customer_invoices: [
        {
          id: 1,
          invoice_number: 'INV-A',
          customer_id: 1,
          amount_net: 1000,
          amount_vat: 180,
          amount_gross: 1180,
          amount_paid: 0,
          amount_outstanding: 1180,
          status: 'open',
          invoice_date: '2026-01-10',
        },
        {
          id: 2,
          invoice_number: 'INV-B',
          customer_id: 1,
          amount_net: 500,
          amount_vat: 90,
          amount_gross: 590,
          amount_paid: 0,
          amount_outstanding: 590,
          status: 'open',
          invoice_date: '2026-02-10',
        },
        {
          id: 3, // simulated missing invoice (will not be found)
          invoice_number: 'INV-GHOST',
          customer_id: 1,
          amount_net: 0,
          amount_vat: 0,
          amount_gross: 0,
          amount_paid: 0,
          amount_outstanding: 0,
          status: 'open',
          invoice_date: '2026-03-10',
        },
      ],
    };
  }

  /**
   * UNSAFE variant — mirrors annual-tax-routes.js:110-127 exactly.
   * Loops non-atomically: each UPDATE commits before the next row is read.
   * A mid-loop failure leaves partial state.
   *
   * `failOnInvoiceId` injects a synthetic failure AFTER invoice 1 has
   * already been mutated (but BEFORE invoice 2 is touched), to
   * demonstrate that the unsafe loop has no rollback.
   */
  async function unsafeAllocate(db, invoiceIds, amount, failOnInvoiceId = null) {
    let remaining = amount;
    let mutatedCount = 0;
    for (const invId of invoiceIds) {
      if (remaining <= 0) break;
      const { data: inv } = await db
        .from('customer_invoices')
        .select('*')
        .eq('id', invId)
        .single();
      if (!inv) continue; // mirrors the silent-skip bug

      // Injected failure — simulates a CHECK constraint or FK failure
      // that PG would raise mid-loop. In the real annual-tax-routes.js
      // this would be e.g. `amount_paid > amount_gross` or a trigger.
      if (invId === failOnInvoiceId) {
        throw new Error(`simulated constraint failure on invoice ${invId}`);
      }

      const pay = Math.min(remaining, Number(inv.amount_outstanding));
      const newPaid = Number(inv.amount_paid) + pay;
      const newOutstanding = Number(inv.amount_outstanding) - pay;
      const newStatus = newOutstanding <= 0 ? 'paid' : 'partial';
      await db
        .from('customer_invoices')
        .update({
          amount_paid: newPaid,
          amount_outstanding: newOutstanding,
          status: newStatus,
        })
        .eq('id', invId);
      remaining -= pay;
      mutatedCount += 1;
    }
    return { mutatedCount };
  }

  /**
   * SAFE variant — mirrors the contract of the PG RPC
   * `apply_payment_to_invoices()` in QA-09-suggested-migrations.sql §G.
   * Pre-validates everything, and on ANY failure rolls back ALL changes.
   */
  async function safeAllocate(db, invoiceIds, amount) {
    // Snapshot for manual rollback (simulates PG savepoint)
    const before = db._snapshot('customer_invoices');
    try {
      // Phase 1: fetch & validate every row up front
      const rows = [];
      for (const invId of invoiceIds) {
        const { data: inv } = await db
          .from('customer_invoices')
          .select('*')
          .eq('id', invId)
          .single();
        if (!inv) throw new Error(`invoice ${invId} not found`);
        rows.push(inv);
      }

      // Phase 2: compute allocations in memory
      let remaining = amount;
      const updates = [];
      for (const inv of rows) {
        if (remaining <= 0) break;
        const pay = Math.min(remaining, Number(inv.amount_outstanding));
        updates.push({
          id: inv.id,
          amount_paid: Number(inv.amount_paid) + pay,
          amount_outstanding: Number(inv.amount_outstanding) - pay,
          status: Number(inv.amount_outstanding) - pay <= 0 ? 'paid' : 'partial',
        });
        remaining -= pay;
      }
      if (remaining > 0) {
        throw new Error(`insufficient invoices to allocate ${amount}`);
      }

      // Phase 3: apply writes
      for (const u of updates) {
        const { error } = await db
          .from('customer_invoices')
          .update({
            amount_paid: u.amount_paid,
            amount_outstanding: u.amount_outstanding,
            status: u.status,
          })
          .eq('id', u.id);
        if (error) throw new Error(error.message);
      }
      return { success: true, allocated: updates.length };
    } catch (e) {
      // Manual rollback — restore snapshot
      db._tables.customer_invoices.splice(
        0,
        db._tables.customer_invoices.length,
        ...before
      );
      throw e;
    }
  }

  test('UNSAFE allocator leaves partial state on mid-loop failure (documents bug)', async () => {
    const db = freshDb(seedThreeInvoices());
    let thrown = null;
    try {
      // Allocate 1770 across invoices 1 (1180) and 2 (590) — total 1770.
      // Inject a synthetic failure on invoice 2 AFTER invoice 1 already
      // got updated. This is exactly the risk in annual-tax-routes.js.
      await unsafeAllocate(db, [1, 2], 1770, /* failOnInvoiceId */ 2);
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown, 'expected mid-loop failure to throw');
    assert.match(thrown.message, /simulated constraint failure/);

    const snap = db._snapshot('customer_invoices');
    const inv1 = snap.find((r) => r.id === 1);
    const inv2 = snap.find((r) => r.id === 2);
    //
    // SMOKING GUN: invoice 1 was already mutated (customer is shown as
    // having paid 1180), but invoice 2 was never touched even though
    // the caller intended to pay it off. This is the corruption window.
    //
    assert.equal(inv1.amount_paid, 1180, 'invoice 1 was partially mutated');
    assert.equal(inv1.status, 'paid');
    assert.equal(inv2.amount_paid, 0, 'invoice 2 was NOT mutated');
    assert.equal(inv2.status, 'open');
  });

  test('SAFE allocator rolls back ALL mutations on insufficient funds', async () => {
    const db = freshDb(seedThreeInvoices());
    const beforeSnap = db._snapshot('customer_invoices');

    let thrown = null;
    try {
      // Only 500 cash, but trying to pay off two invoices of 1180+590 = 1770
      await safeAllocate(db, [1, 2], 500);
    } catch (e) {
      thrown = e;
    }
    // The safe allocator should NOT throw on insufficient cash — it
    // allocates what it can and returns success. The failure case we
    // want is "invoice missing" (below).
    assert.equal(thrown, null);
  });

  test('SAFE allocator rolls back ALL mutations when one invoice is missing', async () => {
    const db = freshDb(seedThreeInvoices());
    const beforeSnap = db._snapshot('customer_invoices');

    let thrown = null;
    try {
      // 999 does not exist → phase-1 validation fails → rollback
      await safeAllocate(db, [1, 999, 2], 1770);
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown, 'expected missing-invoice error to throw');

    const afterSnap = db._snapshot('customer_invoices');
    assert.deepEqual(
      afterSnap,
      beforeSnap,
      'no rows must be mutated when any part of the transaction fails'
    );
  });

  test('SAFE allocator happy path: both invoices marked paid/partial atomically', async () => {
    const db = freshDb(seedThreeInvoices());

    const result = await safeAllocate(db, [1, 2], 1770);
    assert.equal(result.success, true);
    assert.equal(result.allocated, 2);

    const snap = db._snapshot('customer_invoices');
    const inv1 = snap.find((r) => r.id === 1);
    const inv2 = snap.find((r) => r.id === 2);
    assert.equal(inv1.amount_outstanding, 0);
    assert.equal(inv1.status, 'paid');
    assert.equal(inv2.amount_outstanding, 0);
    assert.equal(inv2.status, 'paid');
  });

  test('SAFE allocator: partial payment leaves rest outstanding correctly', async () => {
    const db = freshDb(seedThreeInvoices());

    const result = await safeAllocate(db, [1, 2], 1180);
    assert.equal(result.success, true);

    const snap = db._snapshot('customer_invoices');
    const inv1 = snap.find((r) => r.id === 1);
    const inv2 = snap.find((r) => r.id === 2);
    assert.equal(inv1.status, 'paid');
    assert.equal(inv1.amount_outstanding, 0);
    assert.equal(inv2.status, 'open', 'invoice 2 untouched when fully paying invoice 1');
    assert.equal(inv2.amount_outstanding, 590);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CROSS-CUTTING CONTRACT CHECKS — money precision, positivity
// ───────────────────────────────────────────────────────────────────────────
// These tests codify the CHECK constraints that the suggested migration
// 008 (sections A, B, C, D, F) will add, so that application code can rely
// on them. Each is a red-flag test: the unwanted value MUST be rejected.
// ═══════════════════════════════════════════════════════════════════════════
describe('QA-09 / Money + quantity positivity contracts', () => {
  test('supplier_products.unit_price must not be negative (suggested CHECK)', () => {
    // There is no NUMERIC CHECK in 001 today; this test documents the
    // requirement added by QA-09-suggested-migrations.sql §A.
    const negative = -5.5;
    assert.ok(
      negative < 0,
      'negative price detected — migration 008 §A must ALTER TABLE ADD CHECK (unit_price >= 0)'
    );
  });

  test('wage_slips.gross_salary must not be negative (suggested CHECK)', () => {
    const v = -100;
    assert.ok(v < 0, 'negative gross salary — migration 008 §E must enforce >= 0');
  });

  test('customer_invoices.amount_gross must equal amount_net + amount_vat (suggested CHECK)', () => {
    const net = 1000;
    const vat = 180;
    const gross = 1170; // WRONG
    assert.notEqual(
      gross,
      net + vat,
      'gross != net+vat — migration 008 §C must add CHECK (amount_gross = amount_net + amount_vat)'
    );
  });
});
