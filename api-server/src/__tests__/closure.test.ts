// Smoke tests for closure CRUD endpoints (api-server/src/routes/closure.ts)
// Stubs @workspace/db pool — no live DB.
import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";

// ── stub pool BEFORE importing the router ──────────────────────────────────
const queryMock = vi.fn();
vi.mock("@workspace/db", () => ({
  pool: { query: (...args: unknown[]) => queryMock(...args) },
  db: {},
  withRetry: (fn: () => Promise<unknown>) => fn(),
}));

// Helper: build an isolated express app and a closure router
async function buildApp(): Promise<Express> {
  const closureRouter = (await import("../routes/closure")).default;
  const app = express();
  app.use(express.json());
  app.use("/api", closureRouter);
  return app;
}

// Minimal supertest-lite helper (avoids extra dep) — wraps app in a real http
// listener and uses fetch.
async function reqJson(app: Express, method: string, path: string, body?: unknown) {
  const http = await import("node:http");
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("Closure CRUD smoke", () => {
  beforeEach(() => {
    queryMock.mockReset();
    // Default: ensureTables() and any unknown query → empty rows OK
    queryMock.mockResolvedValue({ rows: [] });
  });

  it("GET /api/closure — returns list (empty)", async () => {
    const app = await buildApp();
    queryMock.mockResolvedValueOnce({ rows: [] }); // ensureTables CREATE TABLE
    queryMock.mockResolvedValueOnce({ rows: [] }); // SELECT list
    const r = await reqJson(app, "GET", "/api/closure");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
  });

  it("GET /api/closure/:id — 404 when not found", async () => {
    const app = await buildApp();
    queryMock.mockResolvedValue({ rows: [] });
    const r = await reqJson(app, "GET", "/api/closure/9999");
    expect(r.status).toBe(404);
    expect(r.body.error).toMatch(/לא נמצאה/);
  });

  it("POST /api/closure — creates record (Hebrew error path tested separately)", async () => {
    const app = await buildApp();
    // ensureTables, count for nextClosureNumber, project lookup, INSERT
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ cnt: "0" }] })
      .mockResolvedValueOnce({ rows: [{ project_name: "Demo Project" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            closure_number: "CLS-2026-00001",
            project_id: 42,
            project_name: "Demo Project",
            status: "draft",
          },
        ],
      });
    const r = await reqJson(app, "POST", "/api/closure", {
      project_id: 42,
      satisfaction_score: 9,
      lessons_learned: "Worked well",
    });
    expect(r.status).toBe(201);
    expect(r.body.data?.closure_number).toBe("CLS-2026-00001");
  });

  it("PUT /api/closure/:id — rejects empty body with 400 (Hebrew message)", async () => {
    const app = await buildApp();
    queryMock.mockResolvedValue({ rows: [] });
    const r = await reqJson(app, "PUT", "/api/closure/1", {});
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/אין שדות לעדכון/);
  });

  it("POST /api/closure/:id/finalize — 404 when closure missing", async () => {
    const app = await buildApp();
    queryMock.mockResolvedValueOnce({ rows: [] }); // ensureTables
    queryMock.mockResolvedValueOnce({ rows: [] }); // SELECT closure
    const r = await reqJson(app, "POST", "/api/closure/123/finalize", {});
    expect(r.status).toBe(404);
    expect(r.body.error).toMatch(/לא נמצאה/);
  });

  it("GET /api/closure/:id/checklist — returns merged checklist with progress", async () => {
    const app = await buildApp();
    queryMock.mockResolvedValueOnce({ rows: [] }); // ensureTables
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 7,
          closure_number: "CLS-2026-00007",
          project_id: 88,
          status: "draft",
          checklist: [],
          punch_list_resolved: true,
          punch_list_open_count: 0,
          satisfaction_score: 8.5,
          lessons_learned: null,
          retention_until: null,
        },
      ],
    });
    const r = await reqJson(app, "GET", "/api/closure/7/checklist");
    expect(r.status).toBe(200);
    expect(r.body.data.total_count).toBe(5);
    expect(r.body.data.done_count).toBeGreaterThanOrEqual(2); // punch_list + satisfaction
    expect(r.body.data.progress_pct).toBeGreaterThan(0);
  });
});
