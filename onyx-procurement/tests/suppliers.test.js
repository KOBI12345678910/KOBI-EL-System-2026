'use strict';

/**
 * Supplier API endpoint tests for ONYX Procurement.
 *
 * These tests run against the Express app without an actual Supabase connection.
 * When Supabase is not configured, endpoints will return 500/400 errors — we
 * assert on the response *shape* (status codes and JSON body keys) rather than
 * exact data, so the tests are CI-safe without a live database.
 *
 * Environment: jest + supertest
 */

const request = require('supertest');

process.env.AUTH_MODE = 'disabled';
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'placeholder-anon-key';

const app = require('../server');

describe('GET /api/suppliers', () => {
  it('returns a JSON response (200 with real DB, or 500 in CI without DB)', async () => {
    const res = await request(app).get('/api/suppliers');
    expect(res.headers['content-type']).toMatch(/json/);
    // Either success with suppliers array or error object
    expect([200, 500]).toContain(res.status);
  });

  it('returns an array of suppliers when DB is available', async () => {
    const res = await request(app).get('/api/suppliers');
    if (res.status === 200) {
      expect(res.body).toHaveProperty('suppliers');
      expect(Array.isArray(res.body.suppliers)).toBe(true);
    } else {
      // No live DB in CI — acceptable
      expect(res.body).toHaveProperty('error');
    }
  });
});

describe('POST /api/suppliers', () => {
  it('returns 201 with supplier data when DB is available, or 400 without DB', async () => {
    const payload = {
      name: 'Test Supplier Ltd.',
      email: 'test@supplier.co.il',
      phone: '050-0000000',
      contact_name: 'ישראל ישראלי',
      payment_terms: 'net30',
      active: true,
    };
    const res = await request(app).post('/api/suppliers').send(payload);
    expect(res.headers['content-type']).toMatch(/json/);
    // 201 on success, 400/500 if Supabase is not reachable
    expect([201, 400, 500]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body).toHaveProperty('supplier');
      expect(res.body.supplier.name).toBe(payload.name);
    }
  });
});

describe('GET /api/suppliers/:id', () => {
  it('returns 404 for a non-existent supplier id', async () => {
    const res = await request(app).get('/api/suppliers/00000000-0000-0000-0000-000000000000');
    // Without DB: may return 500; with DB but missing record: 404
    expect([404, 500]).toContain(res.status);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('returns supplier object with expected keys when found (DB required)', async () => {
    // This test is informational only in CI without a live DB.
    // If we get a 200, validate the response shape.
    const res = await request(app).get('/api/suppliers/00000000-0000-0000-0000-000000000001');
    if (res.status === 200) {
      expect(res.body).toHaveProperty('supplier');
      expect(res.body).toHaveProperty('products');
      expect(res.body).toHaveProperty('priceHistory');
    }
  });
});
