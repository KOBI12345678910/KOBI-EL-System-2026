// Smoke tests for the 3 CRUD-gap fixes:
//   1) Lead DELETE soft-delete (techno-kol-ops/src/routes/leads.ts) — verified via source inspection
//   2) AP GET /api/ap/:id envelope (api-server/routes/ap-enterprise.ts)
//   3) Unified Payment GET /api/payments/:id (api-server/routes/payments.ts)
//
// Tests run inside api-server's vitest setup (see vitest.config.ts).
// We exercise the Express handlers in-process; cross-package code (techno-kol-ops)
// is verified statically by reading the source file.
import { describe, it, expect, vi } from "vitest";
import express from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";

vi.mock("../../lib/auth", () => ({
  validateSession: vi.fn().mockResolvedValue({
    user: { id: 1, fullName: "Tester" },
    error: null,
  }),
}));

async function httpCall(app: express.Express, method: string, url: string, body?: unknown) {
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await resp.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: resp.status, body: json, raw: text };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

describe("CRUD-GAP-FIX: AP GET /api/ap/:id", () => {
  it("returns 404 envelope when row missing", async () => {
    const dbMod: any = await import("@workspace/db");
    dbMod.db.execute = vi.fn().mockResolvedValue({ rows: [] });

    const apRouter = (await import("../../routes/ap-enterprise")).default;
    const app = express();
    app.use(express.json());
    app.use("/api", apRouter);

    const r = await httpCall(app, "GET", "/api/ap/999999");
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ ok: false });
    expect(typeof r.body.error).toBe("string");
  });

  it("returns ok envelope with payments array on hit", async () => {
    const dbMod: any = await import("@workspace/db");
    let n = 0;
    dbMod.db.execute = vi.fn().mockImplementation(() => {
      n++;
      if (n === 1) return Promise.resolve({ rows: [{ id: 42, supplier_name: "X", amount: "100" }] });
      return Promise.resolve({ rows: [{ id: 7, ap_id: 42, amount: "50" }] });
    });

    const apRouter = (await import("../../routes/ap-enterprise")).default;
    const app = express();
    app.use(express.json());
    app.use("/api", apRouter);

    const r = await httpCall(app, "GET", "/api/ap/42");
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.data.id).toBe(42);
    expect(Array.isArray(r.body.data.payments)).toBe(true);
  });
});

describe("CRUD-GAP-FIX: Unified Payment GET /api/payments/:id", () => {
  it("returns 404 when not in any source table", async () => {
    const dbMod: any = await import("@workspace/db");
    dbMod.db.execute = vi.fn().mockResolvedValue({ rows: [] });

    const paymentsRouter = (await import("../../routes/payments")).default;
    const app = express();
    app.use(express.json());
    app.use("/api", paymentsRouter);

    const r = await httpCall(app, "GET", "/api/payments/9999");
    // 404 when at least one source returned an empty row-set;
    // 503 only if all sources error (table missing).
    expect([404, 503]).toContain(r.status);
    expect(r.body).toMatchObject({ ok: false });
    expect(typeof r.body.error).toBe("string");
  });

  it("finds a customer_payments row and normalizes envelope", async () => {
    const dbMod: any = await import("@workspace/db");
    let attempt = 0;
    dbMod.db.execute = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) return Promise.resolve({ rows: [] }); // payment_schedule
      if (attempt === 2)
        return Promise.resolve({
          rows: [{ id: 5, amount: "250.00", currency: "ILS", customer_name: "Acme", status: "paid" }],
        }); // customer_payments
      return Promise.resolve({ rows: [] });
    });

    const paymentsRouter = (await import("../../routes/payments")).default;
    const app = express();
    app.use(express.json());
    app.use("/api", paymentsRouter);

    const r = await httpCall(app, "GET", "/api/payments/5");
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.data.source).toBe("customer_payments");
    expect(r.body.data.kind).toBe("customer");
    expect(r.body.data.id).toBe(5);
    expect(r.body.data.party_name).toBe("Acme");
  });
});

describe("CRUD-GAP-FIX: Lead DELETE soft delete", () => {
  // techno-kol-ops uses a separate pg pool (not @workspace/db) and its own
  // build pipeline. We verify the handler exists and is wired via static source.
  it("registers DELETE /:id with soft-delete (status='deleted') in leads.ts", () => {
    const leadsPath = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "techno-kol-ops",
      "src",
      "routes",
      "leads.ts",
    );
    expect(fs.existsSync(leadsPath)).toBe(true);
    const src = fs.readFileSync(leadsPath, "utf8");
    expect(src).toMatch(/router\.delete\(['"]\/:id['"]/);
    expect(src).toMatch(/status\s*=\s*'deleted'/);
    expect(src).toMatch(/ok:\s*true,\s*data/);
    expect(src).toMatch(/ok:\s*false,\s*error/);
    // Hebrew error label present
    expect(src).toMatch(/ליד לא נמצא/);
  });
});
