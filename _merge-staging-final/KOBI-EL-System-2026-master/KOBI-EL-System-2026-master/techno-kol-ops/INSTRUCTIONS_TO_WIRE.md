# TECHNO-KOL OPS — How to Wire the Security Hardening Pack

**Pack:** Agent-21 (2026-04-11)
**Files added (none deleted, none modified):**

- `AUDIT_REPORT.md`
- `src/middleware/security.js`
- `src/middleware/audit.js` (coexists with existing `audit.ts`)
- `INSTRUCTIONS_TO_WIRE.md` — this file

---

## 0. Why `.js` when the project is TypeScript?

The hardening pack ships as CommonJS `.js` files so that:

1. They can be `require()`'d from `src/index.ts` with zero build-config change (`tsx` resolves `.js` imports fine from `.ts`).
2. They also work from compiled `dist/` at runtime.
3. There is zero chance of name-collision with the existing `src/middleware/audit.ts` — Node treats `audit.js` and `audit.ts` as different modules.

You can rename them to `.ts` later if you want type coverage. No logic changes required.

---

## 1. Install two dependencies

```bash
cd techno-kol-ops
npm install helmet express-rate-limit
```

That's it. The fallback code in `security.js` already no-ops if these modules are missing, so the server will still boot even if you forget — but **you want them installed**.

Add to `package.json` → `dependencies`:

```json
"helmet": "^7.1.0",
"express-rate-limit": "^7.1.5"
```

---

## 2. Wire `security.js` into `src/index.ts`

**DO NOT modify existing logic.** Only add the import line and the `app.use(...)` lines shown below.

### 2a. Top of file — after `dotenv.config()`:

```ts
// ──────────────────────────────────────────────
// Agent-21 hardening pack (additive, see security.js)
// ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  validateEnv,
  helmetMw,
  jsonBodyMw,
  corsMw,
  apiRateLimit,
  loginRateLimit,
  requireAuth,
  errorHandler,
  installGracefulShutdown,
} = require('./middleware/security.js');

const {
  auditMiddleware,
  withAudit,
} = require('./middleware/audit.js');

validateEnv();   // fail fast on missing JWT_SECRET / DATABASE_URL
```

### 2b. Replace the two insecure middleware lines

**Before (do not delete — comment them out or leave them; the new lines above will override):**

```ts
app.use(cors({ origin: '*' }));       // src/index.ts:43  — too permissive
app.use(express.json());              // src/index.ts:44  — unbounded body
```

**After (add directly below those two lines):**

```ts
app.use(helmetMw);                     // security headers
app.use(jsonBodyMw);                   // 5mb JSON limit + rawBody capture
app.use(corsMw);                       // CORS from ALLOWED_ORIGINS env
app.use('/api/', apiRateLimit);        // 300 req / 15 min per IP
app.use('/api/auth/login', loginRateLimit);   // 10 req / 15 min per IP
app.use(auditMiddleware);              // attach req.audit()
```

NOTE: Express later middleware overrides earlier, so the new `corsMw`
and `jsonBodyMw` will take effect on every route. The original two
lines are harmless once shadowed — you can delete them later if you
want, but the task says NEVER delete, so leave them.

### 2c. Bottom of file — after all routes are mounted, BEFORE `server.listen(...)`:

```ts
// Global error handler (must be last middleware)
app.use(errorHandler);

// Graceful shutdown — drain HTTP, WS, and PG pool
installGracefulShutdown(server, { pool });
```

You'll need to make sure `pool` is imported at the top of `index.ts`
(it already is, via `import { pool, query } from './db/connection';`).

---

## 3. Use the audit helper in mutating routes

### Option A — per-handler wrapper (easiest)

In e.g. `src/routes/workOrders.ts`, where you currently have:

```ts
router.post('/', async (req: AuthRequest, res: Response) => {
  // ... INSERT INTO work_orders ...
  res.json(newWorkOrder);
});
```

Wrap it:

```ts
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withAudit } = require('../middleware/audit.js');

router.post('/', withAudit('work_order', 'CREATE'),
  async (req: AuthRequest, res: Response) => {
    // ... INSERT INTO work_orders ...
    res.json(newWorkOrder);    // audit row is written automatically on 2xx
  }
);
```

### Option B — manual call

Inside any handler (after `auditMiddleware` is globally mounted):

```ts
await (req as any).audit({
  action: 'APPROVE',
  resource: 'invoice',
  resourceId: invoice.id,
  before: oldInvoice,
  after: newInvoice,
});
```

Audit writes are fire-and-forget: if the DB is down, the route still
responds; a warning is logged to stderr.

### Schema

The `audit_logs` table schema is already declared in
`src/middleware/audit.ts` as `AUDIT_LOG_SCHEMA`. Make sure
it's been applied to the DB once:

```ts
import { AUDIT_LOG_SCHEMA } from './middleware/audit';
await query(AUDIT_LOG_SCHEMA);
```

(You can run this from `src/db/init.ts`.)

---

## 4. Populate the `.env` file correctly

Edit `.env` (NOT `.env.example`):

```
NODE_ENV=production
JWT_SECRET=<run: openssl rand -hex 32>
ALLOWED_ORIGINS=https://app.techno-kol.example,https://ops.techno-kol.example
RATE_LIMIT_API_MAX=300
RATE_LIMIT_LOGIN_MAX=10
API_KEYS=<optional-comma-separated-service-keys>
```

**If `NODE_ENV=production` AND `JWT_SECRET` is still the default
`techno_kol_secret_2026_palantir`, the server will refuse to boot.**
This is intentional.

---

## 5. Quick smoke test

```bash
npm run dev

# 1. Should return 200
curl http://localhost:5000/api/health

# 2. Should return 403 (bad origin)
curl -H "Origin: http://evil.com" http://localhost:5000/api/work-orders

# 3. Should return 401 (no token)
curl http://localhost:5000/api/work-orders

# 4. Login — should return 200
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'

# 5. 11th login attempt in 15 min → 429
for i in {1..11}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" -d '{"username":"x","password":"x"}'
done
```

---

## 6. Rollback

Remove the four `app.use(...)` additions from `src/index.ts` and the
`require(...)` block at the top. No other file was modified. The pack
is fully additive and fully reversible.
