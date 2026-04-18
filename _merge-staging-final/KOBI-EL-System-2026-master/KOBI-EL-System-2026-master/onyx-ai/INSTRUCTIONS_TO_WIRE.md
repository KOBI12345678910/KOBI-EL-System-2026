# INSTRUCTIONS_TO_WIRE — onyx-ai hardening hooks

**Author:** Agent-16 audit
**Date:** 2026-04-11
**Status:** Suggested. *Nothing has been applied to existing source files.* This document is a review-ready patch plan.

Two new modules have been dropped into `src/` alongside the existing code:

- `src/health.ts` — exports `registerHealthRoutes(app, opts)`, plus pure helpers `buildHealthPayload`, `buildReadyPayload`, and a raw-http adapter `handleRawHealthRoute(method, path, platform)`.
- `src/security.ts` — exports `apiKeyMiddleware(opts)` (Express-style) plus a raw-http adapter `checkRawApiKey(req, opts)`.

Both modules are **leaf modules**: they depend on nothing inside `src/` and can be imported from anywhere without risking circular references.

Below is a zero-edit review plan showing *where* each integration point should go. **Do not edit `src/index.ts` until you, the operator, have reviewed this file.**

---

## 0. Environment variables introduced

Add these to your `.env` (a future task should ship `.env.example`):

```ini
# Comma-separated list of accepted API keys. If omitted in production,
# the gate CLOSES (all requests 401). If omitted in dev (NODE_ENV != production)
# the gate BYPASSES so local DX stays frictionless.
ONYX_AI_API_KEYS=dev_key_1,dev_key_2

# Optional: override the version string surfaced at /health.
# If unset, /health falls back to package.json#version.
ONYX_AI_VERSION=2.0.1
```

The existing bootstrap variables are unchanged:

```ini
PORT=3200
ONYX_EVENT_STORE_PATH=./data/events.jsonl
ONYX_DAILY_BUDGET=500
ONYX_GLOBAL_BUDGET=1000
```

---

## 1. Wiring `/health` and `/ready` into the existing raw `APIServer`

`src/index.ts` builds an `APIServer` using the raw `node:http` module. It routes inside a method called `route(method, path, body, params)` around line 2303. The surgical addition is two lines at the top of that method.

### 1a. Add an import at the top of `src/index.ts`

```ts
// ADD near the other imports (around line 66-71):
import { handleRawHealthRoute } from './health';
import { checkRawApiKey } from './security';
```

### 1b. Add the health adapter as the first thing inside `APIServer.route(...)`

```ts
private async route(
  method: string,
  path: string,
  body: Record<string, unknown>,
  params: URLSearchParams,
): Promise<{ status: number; body: Record<string, unknown> }> {
  // ↓↓↓ NEW — health probes first, unauthenticated by design ↓↓↓
  const healthHit = handleRawHealthRoute(method, path, {
    governor: this.governor as any,
    eventStore: this.eventStore as any,
  });
  if (healthHit) return healthHit;
  // ↑↑↑ NEW ↑↑↑

  // ... existing routes follow unchanged ...
```

That is the ONLY required change for health/readiness. The two routes `GET /health` and `GET /ready` will now respond on port 3200.

---

## 2. Wiring API-key auth into the existing raw `APIServer`

The gate goes inside the top of the http request handler (line ~2274) so that auth failures are returned before routing. Health probes are allow-listed so uptime monitors don't need a key.

### 2a. Inside `APIServer.start(port)`, just after the CORS headers are set

```ts
start(port: number = 3100): void {
  this.server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ↓↓↓ NEW — API key gate (health/ready are allow-listed) ↓↓↓
    const denied = checkRawApiKey(req, {
      allowPaths: ['/health', '/ready'],
    });
    if (denied) {
      res.writeHead(denied.status);
      res.end(JSON.stringify(denied.body));
      return;
    }
    // ↑↑↑ NEW ↑↑↑

    try {
      const body = req.method !== 'GET' ? await this.readBody(req) : {};
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const response = await this.route(req.method ?? 'GET', url.pathname, body, url.searchParams);
      // ... unchanged ...
```

Also add `X-API-Key` to the `Access-Control-Allow-Headers` value so browser clients can send it.

### 2b. (Optional) Tighten CORS in the same block

Still inside `APIServer.start`, replace the wildcard CORS origin with an allow-list driven by env:

```ts
const allowedOrigins = (process.env.ONYX_AI_CORS_ORIGINS || '').split(',').filter(Boolean);
const reqOrigin = req.headers.origin || '';
if (allowedOrigins.length === 0) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // dev
} else if (allowedOrigins.includes(reqOrigin)) {
  res.setHeader('Access-Control-Allow-Origin', reqOrigin);
  res.setHeader('Vary', 'Origin');
}
```

This is listed as optional because it is orthogonal to the two new modules; it is purely a hardening improvement for the same layer.

---

## 3. Alternative wiring — if you later migrate to Express

Both modules already support the Express path, so the migration cost is zero.

```ts
// ── future src/index.ts (Express variant) ────────────────────────────────
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { registerHealthRoutes } from './health';
import { apiKeyMiddleware } from './security';

const app = express();
app.use(helmet());
app.use(cors({ origin: (process.env.ONYX_AI_CORS_ORIGINS || '').split(',').filter(Boolean) }));
app.use(express.json({ limit: '1mb' }));

// Health probes — unauthenticated, mounted BEFORE the gate.
registerHealthRoutes(app, {
  platform: {
    governor: onyx.governor as any,
    eventStore: onyx.eventStore as any,
  },
});

// API key gate — everything mounted after this line requires X-API-Key.
app.use(apiKeyMiddleware({
  allowPaths: ['/health', '/ready'],
  logger: console,
}));

// ... existing routes ...
app.listen(PORT);
```

Notice that `registerHealthRoutes` must be called **before** `apiKeyMiddleware` so that the routes exist before the gate mounts. Alternatively, keep it after but pass `allowPaths: ['/health', '/ready']` to the middleware (either order works because of the allow-list).

---

## 4. Verifying the wiring without starting the platform

Once the edits above are applied, the following hand-checks should pass:

```bash
# Liveness probe — always 200
curl -sS http://localhost:3200/health | jq .

# Readiness probe — 200 when the event store is up
curl -sS http://localhost:3200/ready | jq .

# Mutating endpoint without key → 401
curl -sS -X POST http://localhost:3200/api/kill -d '{"reason":"test"}' -H 'Content-Type: application/json'

# Mutating endpoint with key → 200
curl -sS -X POST http://localhost:3200/api/kill \
  -H "X-API-Key: $ONYX_AI_API_KEYS" \
  -H 'Content-Type: application/json' \
  -d '{"reason":"test"}'
```

---

## 5. Zero-regression guarantees

1. **`src/health.ts` and `src/security.ts` are self-contained**: they `import` only from `node:crypto` and nothing from `src/*`. Importing them does not instantiate any platform state.
2. **Health endpoints degrade gracefully**: if `platform.governor.getComplianceReport()` throws or is absent, `/health` still returns 200 with `budget: null`. It never 5xxs.
3. **Auth fail-closed in prod, bypass in dev**: if `ONYX_AI_API_KEYS` is unset and `NODE_ENV !== 'production'`, `apiKeyMiddleware` bypasses. In production it rejects. Set `requireEvenWithoutKeys: true` to force-close even in dev.
4. **Timing-safe key compare**: `isApiKeyAuthorized` hashes both sides to SHA-256 and uses `crypto.timingSafeEqual`. Never short-circuits on the first miss.
5. **No behaviour change until `src/index.ts` is edited**: the snippets above are the ONLY touch points. Reverting is a three-line delete.

---

## 6. Suggested test coverage (not created by Agent-16)

- `health.test.ts` — `buildHealthPayload()` returns status ok with governor absent / present / throwing; `buildReadyPayload()` flips on event-store presence.
- `security.test.ts` — `loadApiKeys('a, b , c,,a')` de-dupes; `isApiKeyAuthorized('a', ['a','b'])` true; `isApiKeyAuthorized('c', ['a','b'])` false; dev-bypass when `NODE_ENV !== 'production'` and no keys; fail-closed when `NODE_ENV='production'` and no keys.
- `apiserver.integration.test.ts` — boot `OnyxPlatform`, hit `/health`, `/api/status` (401 without key), `/api/status` (200 with key).

---

*End of INSTRUCTIONS_TO_WIRE.md*
