/**
 * Happy-path tests for `/api/advanced/*` endpoints. Stubs `pool.query` from
 * `@workspace/db` so each route returns a well-formed envelope without
 * touching a live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("@workspace/db", () => ({
  db: {},
  pool: { query: (...args: unknown[]) => queryMock(...args) },
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

let app: Express;

beforeEach(async () => {
  queryMock.mockReset();
  // Default: every query returns empty rows so endpoints never throw.
  queryMock.mockResolvedValue({ rows: [] });

  // Re-import the router after the mock is registered.
  const mod = await import("../routes/advanced");
  app = express();
  app.use("/api/advanced", mod.default);
});

describe("GET /api/advanced/forecasting", () => {
  it("returns history + 3-month forecast envelope", async () => {
    queryMock.mockImplementation((sqlText: string) => {
      if (/FROM sales_orders/i.test(sqlText)) {
        return Promise.resolve({
          rows: [
            { month: "2025-11", total: "1000" },
            { month: "2025-12", total: "1200" },
            { month: "2026-01", total: "1400" },
          ],
        });
      }
      if (/FROM quotes/i.test(sqlText)) {
        return Promise.resolve({
          rows: [{ month: "2026-01", total: "500" }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app).get("/api/advanced/forecasting");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.source).toBe("pg");
    expect(res.body.data.history).toHaveLength(3);
    expect(res.body.data.forecast).toHaveLength(3);
    expect(typeof res.body.data.slope).toBe("number");
  });
});

describe("GET /api/advanced/digital-twin", () => {
  it("returns nodes/edges graph", async () => {
    queryMock.mockImplementation((sqlText: string) => {
      if (/FROM machines/i.test(sqlText)) {
        return Promise.resolve({ rows: [{ id: 1, name: "CNC-A", status: "running" }] });
      }
      if (/FROM work_orders/i.test(sqlText)) {
        return Promise.resolve({ rows: [{ id: 10, status: "in_progress", machine_id: 1 }] });
      }
      if (/FROM mfg_events/i.test(sqlText)) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app).get("/api/advanced/digital-twin");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data.nodes)).toBe(true);
    expect(Array.isArray(res.body.data.edges)).toBe(true);
    expect(res.body.data.counts.machines).toBe(1);
    expect(res.body.data.counts.work_orders).toBe(1);
  });
});

describe("GET /api/advanced/graph-analytics", () => {
  it("returns adjacency map with companies/deals/activities", async () => {
    queryMock.mockImplementation((sqlText: string) => {
      if (/FROM crm_companies/i.test(sqlText)) {
        return Promise.resolve({ rows: [{ id: 1, name: "Acme" }] });
      }
      if (/FROM crm_deals/i.test(sqlText)) {
        return Promise.resolve({
          rows: [{ id: 5, title: "Deal A", company_id: 1, amount: 1000, stage: "open" }],
        });
      }
      if (/FROM crm_activities/i.test(sqlText)) {
        return Promise.resolve({
          rows: [{ id: 9, activity_type: "call", deal_id: 5, company_id: 1 }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app).get("/api/advanced/graph-analytics");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.adjacency["company:1"]).toBeDefined();
    expect(res.body.data.stats.companies).toBe(1);
    expect(res.body.data.stats.deals).toBe(1);
  });
});

describe("GET /api/advanced/anomaly-detection", () => {
  it("returns z-score outliers", async () => {
    queryMock.mockImplementation((sqlText: string) => {
      if (/FROM payments/i.test(sqlText)) {
        return Promise.resolve({
          rows: [
            { id: 1, amount: 100, paid_at: "2026-04-01" },
            { id: 2, amount: 110, paid_at: "2026-04-02" },
            { id: 3, amount: 105, paid_at: "2026-04-03" },
            { id: 4, amount: 5000, paid_at: "2026-04-04" }, // outlier
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app).get("/api/advanced/anomaly-detection");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.sample_size).toBe(4);
    expect(res.body.data.outliers.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.outliers[0].id).toBe(4);
  });
});

describe("GET /api/advanced/nl-query", () => {
  it("returns hint when ai-bridge is not configured", async () => {
    delete process.env.ONYX_AI_URL;
    delete process.env.AI_BRIDGE_URL;
    const res = await request(app).get("/api/advanced/nl-query?q=סך%20מכירות");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.bridge).toBe("unconfigured");
    expect(res.body.hint).toMatch(/ai-bridge/i);
    expect(res.body.data.suggestions.length).toBeGreaterThan(0);
  });
});

describe("Defensive: missing tables return [] not 500", () => {
  it("forecasting still 200 when sales_orders is missing", async () => {
    queryMock.mockRejectedValue(Object.assign(new Error("relation does not exist"), { code: "42P01" }));
    const res = await request(app).get("/api/advanced/forecasting");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.history).toEqual([]);
  });
});
