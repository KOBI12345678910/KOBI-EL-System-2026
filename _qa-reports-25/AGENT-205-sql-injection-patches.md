# AGENT-205 - SQL Injection Patches

**Date:** 2026-04-29 | **Scope:** Concrete patches for 3 SQLi sites flagged by Agent 159

Replace string concatenation / `sql.raw` with Drizzle parameterized `sql\`...\${param}...\`` template tags. For dynamic identifiers (column names, sort directions) use a strict whitelist.

## Summary

| File | Lines | Issue | Severity |
|------|-------|-------|----------|
| `api-server/src/routes/crm-ultimate.ts` | 572-587 | 7 user params concatenated into WHERE | CRITICAL |
| `api-server/src/routes/crm-ultimate.ts` | 827-834 | 4 user params concatenated into WHERE | CRITICAL |
| `api-server/src/routes/ar-enterprise.ts` | 166-217 | INSERT/UPDATE/DELETE with raw concat + `req.params.id` | CRITICAL |
| `api-server/src/routes/finance/payments.ts` | 84-95 | WHERE/ORDER BY composed with raw concat | HIGH |

Required imports already present in all files: `import { sql } from "drizzle-orm";`. Use `sql.join(arr, sep)` for compositions, `sql.identifier("col")` for safe identifier quoting, `sql.raw("ASC")` only for whitelisted constants.

---

## Patch 1 - `crm-ultimate.ts:572-587` (GET /leads)

### Before
```ts
router.get("/leads", async (req: Request, res: Response) => {
  const { status, agent_id, source, city, lead_type, urgency, search, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = '${status}'`;
  if (agent_id) where += ` AND assigned_agent_id = ${agent_id}`;
  if (source) where += ` AND source = '${source}'`;
  if (city) where += ` AND city = '${city}'`;
  if (lead_type) where += ` AND lead_type = '${lead_type}'`;
  if (urgency) where += ` AND urgency = '${urgency}'`;
  if (search) where += ` AND (full_name ILIKE '%${search}%' OR phone ILIKE '%${search}%' OR mobile ILIKE '%${search}%' OR email ILIKE '%${search}%' OR city ILIKE '%${search}%')`;
  const lim = Number(limit) || 200;
  const off = Number(offset) || 0;
  const rows = await q(sql.raw(`SELECT * FROM crm_leads_ultimate ${where} ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`));
  const countR = await q(sql.raw(`SELECT COUNT(*) as total FROM crm_leads_ultimate ${where}`));
  res.json({ data: rows, total: Number((countR[0] as any)?.total || 0) });
});
```

### After
```ts
router.get("/leads", async (req: Request, res: Response) => {
  const { status, agent_id, source, city, lead_type, urgency, search, limit, offset } = req.query;

  const conditions: any[] = [sql`1 = 1`];
  if (status)    conditions.push(sql`status = ${String(status)}`);
  if (agent_id)  conditions.push(sql`assigned_agent_id = ${Number(agent_id)}`);
  if (source)    conditions.push(sql`source = ${String(source)}`);
  if (city)      conditions.push(sql`city = ${String(city)}`);
  if (lead_type) conditions.push(sql`lead_type = ${String(lead_type)}`);
  if (urgency)   conditions.push(sql`urgency = ${String(urgency)}`);
  if (search) {
    const like = `%${String(search)}%`;
    conditions.push(sql`(full_name ILIKE ${like} OR phone ILIKE ${like} OR mobile ILIKE ${like} OR email ILIKE ${like} OR city ILIKE ${like})`);
  }
  const whereSql = sql.join(conditions, sql` AND `);

  const lim = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const off = Math.max(Number(offset) || 0, 0);

  const rows = await q(sql`
    SELECT * FROM crm_leads_ultimate WHERE ${whereSql}
    ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}
  `);
  const countR = await q(sql`SELECT COUNT(*) AS total FROM crm_leads_ultimate WHERE ${whereSql}`);
  res.json({ data: rows, total: Number((countR[0] as any)?.total || 0) });
});
```

`String()` coerces against `req.query` array forms; pagination is clamped (defence-in-depth even though the value is parameterized).

---

## Patch 2 - `crm-ultimate.ts:827-834` (GET /quotes)

### Before
```ts
router.get("/quotes", async (req: Request, res: Response) => {
  const { lead_id, agent_id, status, customer_id } = req.query;
  let where = "WHERE 1=1";
  if (lead_id) where += ` AND lead_id = ${lead_id}`;
  if (agent_id) where += ` AND agent_id = ${agent_id}`;
  if (status) where += ` AND status = '${status}'`;
  if (customer_id) where += ` AND customer_id = ${customer_id}`;
  const rows = await q(sql.raw(`SELECT * FROM crm_quotes ${where} ORDER BY created_at DESC`));
  res.json(rows);
});
```

### After
```ts
router.get("/quotes", async (req: Request, res: Response) => {
  const { lead_id, agent_id, status, customer_id } = req.query;

  const conditions: any[] = [sql`1 = 1`];
  if (lead_id)     conditions.push(sql`lead_id = ${Number(lead_id)}`);
  if (agent_id)    conditions.push(sql`agent_id = ${Number(agent_id)}`);
  if (status)      conditions.push(sql`status = ${String(status)}`);
  if (customer_id) conditions.push(sql`customer_id = ${Number(customer_id)}`);
  const whereSql = sql.join(conditions, sql` AND `);

  const rows = await q(sql`
    SELECT * FROM crm_quotes WHERE ${whereSql} ORDER BY created_at DESC
  `);
  res.json(rows);
});
```

Numeric IDs become `NaN` if non-numeric, which Postgres rejects at bind time — the desired 400-class error.

---

## Patch 3 - `ar-enterprise.ts:166-217` (full receipts block)

The entire block builds raw SQL with a home-rolled `s()` quote-doubler. Throw out `s()` and the `q(string)` helper for these handlers. Add a parameterized helper and a whitelisted `nextNum`.

### Before (representative — 5 handlers all use `s()` + raw concat with `req.params.id`)
```ts
async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("AR query error:", e.message); return []; }
}
async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  // ...
}

router.post("/ar-receipts", async (req, res) => {
  const d = req.body; const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const receiptNum = d.receiptNumber ? `'${String(d.receiptNumber).replace(/'/g,"''")}'` : `'${await nextNum("RCP-", "ar_receipts", "receipt_number")}'`;
  await q(`INSERT INTO ar_receipts (...) VALUES (${d.invoiceId ? d.invoiceId : 'NULL'}, ${receiptNum}, '${d.receiptDate || ...}', ${d.amountReceived||d.amount||0}, '${d.currency||'ILS'}', ${s(d.paymentMethod)}, ...)`);
  res.json({ success: true });
});
router.put("/ar-receipts/:id",   async (req, res) => { /* same shape, WHERE id=${req.params.id} */ });
router.delete("/ar-receipts/:id",async (req, res) => { await q(`DELETE FROM ar_receipts WHERE id=${req.params.id}`); /* ... */ });
router.get("/ar/:id/receipts",   async (req, res) => { res.json(await q(`SELECT * FROM ar_receipts WHERE ar_id=${req.params.id} ORDER BY receipt_date DESC`)); });
router.post("/ar/:id/collect",   async (req, res) => { /* INSERT + 3 follow-up reads/writes, all using ${req.params.id} and s() */ });
```

### After
```ts
// Parameterized helper alongside legacy q(string)
async function qSql(query: any) {
  try { const r = await db.execute(query); return r.rows || []; }
  catch (e: any) { console.error("AR query error:", e.message); return []; }
}

// Whitelist - identifiers can never come from user input
const NEXT_NUM_TARGETS = {
  ar_receipts_receipt_number: { table: sql.identifier("ar_receipts"), col: sql.identifier("receipt_number") },
} as const;
async function nextNumSafe(prefix: string, target: keyof typeof NEXT_NUM_TARGETS) {
  const year = new Date().getFullYear();
  const t = NEXT_NUM_TARGETS[target];
  const like = `${prefix}${year}-%`;
  const rows = await qSql(sql`
    SELECT ${t.col} AS col_val FROM ${t.table}
    WHERE ${t.col} LIKE ${like} ORDER BY id DESC LIMIT 1
  `);
  const last = (rows[0] as any)?.col_val;
  const seq = last ? parseInt(String(last).split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

router.post("/ar-receipts", async (req, res) => {
  const d = req.body; const user = (req as any).user;
  const receiptNum = d.receiptNumber ? String(d.receiptNumber)
                                     : await nextNumSafe("RCP-", "ar_receipts_receipt_number");
  const receiptDate = d.receiptDate || new Date().toISOString().slice(0, 10);
  const amount = Number(d.amountReceived ?? d.amount ?? 0);
  const currency = String(d.currency || "ILS");
  const invoiceId = d.invoiceId ? Number(d.invoiceId) : null;
  const userId   = user?.id ? Number(user.id) : null;
  const userName = user?.fullName ? String(user.fullName) : null;

  await qSql(sql`
    INSERT INTO ar_receipts
      (ar_id, receipt_number, receipt_date, amount, currency, payment_method,
       bank_account, reference, notes, created_by, created_by_name)
    VALUES
      (${invoiceId}, ${receiptNum}, ${receiptDate}, ${amount}, ${currency},
       ${d.paymentMethod ?? null}, ${d.bankAccount ?? null},
       ${d.referenceNumber ?? d.reference ?? null}, ${d.notes ?? null},
       ${userId}, ${userName})
  `);
  res.json({ success: true });
});

router.put("/ar-receipts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const d = req.body;
  const amount = Number(d.amountReceived ?? d.amount ?? 0);
  const receiptDate = d.receiptDate || new Date().toISOString().slice(0, 10);
  await qSql(sql`
    UPDATE ar_receipts SET
      amount = ${amount},
      payment_method = ${d.paymentMethod ?? null},
      reference = ${d.referenceNumber ?? d.reference ?? null},
      notes = ${d.notes ?? null},
      receipt_date = ${receiptDate},
      updated_at = NOW()
    WHERE id = ${id}
  `);
  res.json({ success: true });
});

router.delete("/ar-receipts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  await qSql(sql`DELETE FROM ar_receipts WHERE id = ${id}`);
  res.json({ success: true });
});

router.get("/ar/:id/receipts", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  res.json(await qSql(sql`
    SELECT * FROM ar_receipts WHERE ar_id = ${id} ORDER BY receipt_date DESC
  `));
});

router.post("/ar/:id/collect", async (req, res) => {
  const arId = Number(req.params.id);
  if (!Number.isInteger(arId) || arId <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const d = req.body; const user = (req as any).user;
  const num = await nextNumSafe("RCT-", "ar_receipts_receipt_number");
  const receiptDate = d.receiptDate || new Date().toISOString().slice(0, 10);
  const amount = Number(d.amount ?? 0);
  const currency = String(d.currency || "ILS");
  const userId   = user?.id ? Number(user.id) : null;
  const userName = user?.fullName ? String(user.fullName) : null;

  await qSql(sql`
    INSERT INTO ar_receipts
      (ar_id, receipt_number, receipt_date, amount, currency, payment_method,
       bank_account, check_number, check_date, reference, notes, created_by, created_by_name)
    VALUES
      (${arId}, ${num}, ${receiptDate}, ${amount}, ${currency},
       ${d.paymentMethod ?? null}, ${d.bankAccount ?? null}, ${d.checkNumber ?? null},
       ${d.checkDate ?? null}, ${d.reference ?? null}, ${d.notes ?? null},
       ${userId}, ${userName})
  `);

  const totalCollected = await qSql(sql`
    SELECT COALESCE(SUM(amount), 0) AS total FROM ar_receipts WHERE ar_id = ${arId}
  `);
  const collectedAmount = Number((totalCollected[0] as any)?.total || 0);
  const ar = await qSql(sql`SELECT amount FROM accounts_receivable WHERE id = ${arId}`);
  const arAmount = Number((ar[0] as any)?.amount || 0);
  const newStatus: "paid" | "partial" | "open" =
    collectedAmount >= arAmount ? "paid" : collectedAmount > 0 ? "partial" : "open";

  await qSql(sql`
    UPDATE accounts_receivable
    SET paid_amount = ${collectedAmount}, status = ${newStatus}, updated_at = NOW()
    WHERE id = ${arId}
  `);
  const updated = await qSql(sql`SELECT * FROM accounts_receivable WHERE id = ${arId}`);
  res.json(updated[0]);
});
```

Key changes: `req.params.id` is integer-validated before binding; `?? null` produces real `NULL`; `newStatus` is a literal-union (no attacker-controlled value reaches it); `sql.identifier` + whitelist for the `nextNum` table/column.

---

## Patch 4 - `finance/payments.ts:84-115` (LIST handler)

Zod-validated input but still uses string concat with manual quote-doubling. Replace with parameterized fragments + a column whitelist for `order_by` (Postgres cannot bind identifiers).

### Before
```ts
const whereParts: string[] = ["coalesce(is_deleted, false) = false"];
if (q) {
  const safe = q.replace(/'/g, "''");
  whereParts.push(`(payment_number ILIKE '%${safe}%' OR reference_number ILIKE '%${safe}%' OR notes ILIKE '%${safe}%')`);
}
if (state)          whereParts.push(`state = '${state}'`);
if (payment_method) whereParts.push(`payment_method = '${payment_method}'`);
if (invoice_id)     whereParts.push(`invoice_id = ${invoice_id}`);
if (customer_id)    whereParts.push(`customer_id = ${customer_id}`);
if (supplier_id)    whereParts.push(`supplier_id = ${supplier_id}`);
if (from_date)      whereParts.push(`payment_date >= '${from_date.replace(/'/g, "''")}'`);
if (to_date)        whereParts.push(`payment_date <= '${to_date.replace(/'/g, "''")}'`);
const whereClause = `where ${whereParts.join(" and ")}`;
const rows = await db.execute(sql.raw(`
  select * from finance.payments ${whereClause}
  order by ${order_by} ${order_dir} limit ${limit} offset ${offset}
`));
const countRes = await db.execute(sql.raw(`select count(*)::int as total from finance.payments ${whereClause}`));
```

### After
```ts
// Whitelist for ORDER BY identifier and direction. Defends in depth even though
// Zod constrains values upstream — a schema regression must not re-open the hole.
const ORDER_BY_COLUMNS: Record<string, ReturnType<typeof sql.identifier>> = {
  id:             sql.identifier("id"),
  payment_number: sql.identifier("payment_number"),
  payment_date:   sql.identifier("payment_date"),
  amount:         sql.identifier("amount"),
  state:          sql.identifier("state"),
  created_at:     sql.identifier("created_at"),
};
const orderCol = ORDER_BY_COLUMNS[order_by as string] ?? ORDER_BY_COLUMNS.created_at;
const orderDir = String(order_dir).toUpperCase() === "ASC" ? sql.raw("ASC") : sql.raw("DESC");

const conditions: any[] = [sql`coalesce(is_deleted, false) = false`];
if (q) {
  const like = `%${q}%`;
  conditions.push(sql`(payment_number ILIKE ${like} OR reference_number ILIKE ${like} OR notes ILIKE ${like})`);
}
if (state)          conditions.push(sql`state = ${state}`);
if (payment_method) conditions.push(sql`payment_method = ${payment_method}`);
if (invoice_id)     conditions.push(sql`invoice_id = ${Number(invoice_id)}`);
if (customer_id)    conditions.push(sql`customer_id = ${Number(customer_id)}`);
if (supplier_id)    conditions.push(sql`supplier_id = ${Number(supplier_id)}`);
if (from_date)      conditions.push(sql`payment_date >= ${from_date}`);
if (to_date)        conditions.push(sql`payment_date <= ${to_date}`);
const whereSql = sql.join(conditions, sql` AND `);

const lim = Math.min(Math.max(Number(limit) || 50, 1), 1000);
const off = Math.max(Number(offset) || 0, 0);

try {
  const rows = await db.execute(sql`
    SELECT * FROM finance.payments WHERE ${whereSql}
    ORDER BY ${orderCol} ${orderDir} LIMIT ${lim} OFFSET ${off}
  `);
  const countRes = await db.execute(sql`
    SELECT COUNT(*)::int AS total FROM finance.payments WHERE ${whereSql}
  `);
  res.json({
    data: rows.rows ?? [], rows: rows.rows ?? [],
    total: Number((countRes.rows?.[0] as { total?: number })?.total ?? 0),
    limit: lim, offset: off,
  });
} catch (err) {
  console.error("[finance:payments:list]", err);
  res.status(500).json({ error: "שגיאה בטעינת תשלומים" });
}
```

`order_by`/`order_dir` are SQL identifiers and cannot be parameter-bound — whitelist is the only safe pattern. `sql.raw("ASC"|"DESC")` is safe because the string source is a literal compile-time constant.

---

## Verification

- `pnpm -w build` (or `tsc --noEmit`) — type-check fragments compile.
- Probe `GET /api/crm/leads?status=' OR 1=1--` — must return 0 rows (literal becomes a bound string equality).
- Probe `GET /api/finance/payments?order_by=id;DROP TABLE finance.payments` — must fall back to `created_at` and succeed.
- AR audit-log calls outside the flagged ranges must still fire after the rewrite.
- Re-run Agent 159's SQLi scanner — expected: 0 findings on the patched ranges.

## Adjacent (out of scope)

- The `s()` helper appears in 30+ other `ar-enterprise.ts` handlers (dunning, write-offs). Same template applies — follow-up sweep.
- `desktop-tutorial-server/src/routes/payments.js` (legacy mirror) shares the shape; confirm deploy graph and port.
- `nextNumber` in `crm-ultimate.ts` already uses `sql\`\``-bound queries and is safe.
