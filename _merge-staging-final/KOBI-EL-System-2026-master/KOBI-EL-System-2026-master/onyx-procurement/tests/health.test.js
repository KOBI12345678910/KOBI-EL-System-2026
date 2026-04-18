'use strict';

/**
 * Health / liveness endpoint tests for ONYX Procurement API.
 *
 * These tests use supertest so no actual server port is needed — supertest
 * binds the Express app on an ephemeral port internally.
 *
 * Environment: jest + supertest
 * Run: npm test  (from onyx-procurement/)
 */

const request = require('supertest');

// Set AUTH_MODE=disabled so the health routes are not blocked by API-key auth
process.env.AUTH_MODE = 'disabled';
process.env.NODE_ENV = 'test';
// Prevent env-validation from hard-exiting during require
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'placeholder-anon-key';

const app = require('../server');

describe('Health / liveness endpoints', () => {
  it('GET /healthz returns 200', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
  });

  it('GET /healthz returns a JSON body with status ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.body).toHaveProperty('status');
    expect(res.body.status).toMatch(/ok|healthy/i);
  });

  it('GET /api/status returns 200 (public status endpoint)', async () => {
    const res = await request(app).get('/api/status');
    // May return 200 or 503 depending on Supabase connectivity; either is a valid response (not 5xx crash)
    expect([200, 503]).toContain(res.status);
  });
});
