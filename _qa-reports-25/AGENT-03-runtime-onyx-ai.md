# AGENT 03 — Terminal Runtime Audit: `onyx-ai`

**Auditor:** Agent 03 — Terminal Runtime
**Date:** 2026-04-29
**Scope:** `onyx-ai/` (TypeScript, CommonJS, ES2022, Node 20+)
**Mode:** Static audit only — no `npm install`, no `tsc`, no execution.
**Verdict:** **DO NOT SHIP.** Runtime will boot, but the wired code path is a stale duplicate that ignores most of the recent fixes. Multiple production-blocking gaps.

---

## 0. TL;DR — top 10 problems, ranked

1. **Wrong file is the runtime entrypoint.** `src/index.ts` bootstrap `require('./onyx-platform')` (line 2990). Every fix added to `index.ts` (port-clash fix banner, /healthz, /livez, /readyz, /evaluate, /events, /budget, /api/notifications/*, ai-bridge shims) is **not present** in `onyx-platform.ts`. Procurement → AI bridge contract is broken in production.
2. **Port chaos across three layers.** `.env.example` says `PORT=3200`, CLAUDE.md says `3300`, `Dockerfile` `ENV PORT=3300` + `EXPOSE 3300`, `entrypoint.js` listens on `PORT||3300` and proxies to `+1` (3301), bootstrap default is `3200`, `APIServer.start` default is `3100`. Healthcheck targets `/livez` on `:3300` — works in container but bridge clients hit the wrong port locally.
3. **No `dotenv` ever loaded.** `dotenv` is in `package.json` but `grep` finds **zero imports** in `src/`. `.env` is never read at runtime — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `WHATSAPP_TOKEN`, `SUPABASE_*`, `ONYX_VAULT_KEY`, etc. are all undefined unless the operator manually exports them. Every AI integration silently no-ops.
4. **Auth modules built but not wired.** `src/security.ts` (`apiKeyMiddleware`, `checkRawApiKey`) and `src/health.ts` (`registerHealthRoutes`, `handleRawHealthRoute`) exist with full INSTRUCTIONS_TO_WIRE.md, but **no source file imports either**. `/api/kill`, `/api/resume`, `/api/knowledge/entity`, `/api/notifications/*` remain unauthenticated.
5. **CORS still wildcard in the runtime path.** `onyx-platform.ts` HAS env-driven origin allowlist + helmet-equivalent headers + per-IP rate limit (200 req/15min, 20 for AI paths). `index.ts` STILL has `Access-Control-Allow-Origin: *` and zero security headers. The `*` server is the dead one — but the live `onyx-platform.ts` lacks the new endpoints.
6. **AI provider call sites swallow rate limits and errors.** `agents/src/llm/client.ts` calls `anthropic.messages.create(...)` four times with **no try/catch, no retry, no rate limiter, no circuit breaker**. The platform's own `RateLimiter`, `CircuitBreaker`, and `BackoffCalculator` primitives are never imported here. A 429 from Anthropic propagates as an unhandled rejection straight to `process.on('unhandledRejection')` which only logs.
7. **Strict TypeScript will not pass.** `tsconfig.json` weakens `noImplicitAny: false`, `noUnusedLocals: false`, `noUnusedParameters: false`. `tsconfig.strict.json` is documented as "expected to produce errors on first run" and per `TYPESCRIPT_STRICT_PLAN.md` steps 1–7 are not done. The codebase has dozens of `body as any`, `params.action as Record<string, unknown>`, raw `try { ... } catch(e: any)` patterns.
8. **Two parallel platform files = drift.** `src/index.ts` (3045 lines) and `src/onyx-platform.ts` (2744 lines) both export `OnyxPlatform`. Diff shows divergent `EventStore.append` signatures (`onyx-platform.ts` makes `aggregateId/aggregateType` mandatory, `index.ts` makes them optional + accepts `subject`), divergent `APIServer.start`, divergent route tables. Any caller importing `from './index'` vs `from './onyx-platform'` gets a different platform.
9. **`require.main === module` guard on the wrong file.** Bootstrap at `index.ts:2978` only runs when `node dist/index.js` is invoked. But `onyx-platform.ts` (loaded via `require('./onyx-platform')`) **also has its own `require.main === module` block** that will never fire. Fine, but it means the bootstrap belongs in one of these files, not split between them.
10. **`entrypoint.js` is a 1-line minified proxy** that listens on `PORT` (3300), forwards to `PORT+1`, and then `require('./dist/index.js')`. Health checks route through this proxy — but the proxy returns its own canned `{service:'onyx-ai',version:'2.0.0',status:'running'}` for `/`, `/healthz`, `/livez` and never asks the real platform. Liveness is meaningless in this container shape.

---

## 1. Files audited

| File | Bytes | Notes |
|---|---:|---|
| `package.json` | 1050 | Deps: cors, dotenv, express, express-rate-limit, helmet, nodemailer + types |
| `tsconfig.json` | 874 | strict + 3 strict flags **disabled** (`noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`) |
| `tsconfig.strict.json` | 1883 | Diagnostic only — extends and turns ALL strict flags on. Documented as failing today. |
| `entrypoint.js` | 568 | 1-line minified proxy (PORT→PORT+1) with canned health responses |
| `Dockerfile` | 866 | `ENV PORT=3300`, `EXPOSE 3300`, healthcheck on `/livez` |
| `.env.example` | 2581 | Has ALL provider keys but NEVER LOADED (no dotenv import) |
| `INSTRUCTIONS_TO_WIRE.md` | 8836 | Plan to wire `health.ts` + `security.ts` — **NOT applied** |
| `audit-report.md` | 17183 | Agent-16 audit, mostly still accurate |
| `src/index.ts` | 3045 lines | Has new fixes (`/healthz`, `/livez`, `/readyz`, `/evaluate`, `/events`, `/budget`, `/api/notifications/*`) |
| `src/onyx-platform.ts` | 2744 lines | Has helmet headers + CORS allowlist + per-IP rate-limit. Missing all new endpoints. **THIS IS THE FILE BOOTSTRAPED AT RUNTIME** |
| `src/integrations.ts` | 2553 lines | `IntegrationRegistry`, AI tools, `HttpClient` (has retry/timeout/429-backoff) |
| `src/onyx-integrations.ts` | 2387 lines | Yet ANOTHER duplicate platform file. Three platform files in src/ |
| `src/procurement-bridge.ts` | 367 lines | Solid — fail-open, retry, X-API-Key auth, AbortController timeouts |
| `src/health.ts` | 281 lines | Pure leaf module. NEVER IMPORTED |
| `src/security.ts` | 294 lines | Pure leaf module. NEVER IMPORTED |
| `src/services/notificationService.ts` | 8704 b | WhatsApp via raw https; silently no-ops if env missing |
| `src/services/emailService.ts` | 5760 b | Nodemailer SMTP |
| `src/modules/*.ts` | 9 files, ~520 KB | procurement-engine, procurement-hyperintelligence, financial-autonomy, hr-autonomy, dms, data-flow, intelligent-alert, situation-engine, subcontractor-decision |
| `src/{anomaly,forecast,insights,ml,nlp,nlq,quality,seasonality,stats,trends}/*.ts` | many | Domain ML/NLP — **never imported by index.ts/onyx-platform.ts**. Dead code unless something else loads them. |
| `agents/` | sub-project | Separate `@workspace/kobi-agent` — uses `@anthropic-ai/sdk@^0.30.0`, NOT in onyx-ai package.json. Effectively orphaned. |

---

## 2. Broken imports / missing deps

### 2a. Production deps NOT in `package.json`
The `agents/` sub-package declares deps the parent does not:

- `@anthropic-ai/sdk@^0.30.0` — used in `agents/src/llm/client.ts` and many `agents/src/tools/*Tool.ts`
- `@workspace/db` — `workspace:*` (pnpm workspace ref; no pnpm-workspace.yaml at this level)
- `chokidar`, `diff`, `glob`, `tree-kill`, `uuid`, `ws`
- `tsx`, `@types/diff`, `@types/uuid`, `@types/ws`

If `agents/` is launched standalone it will fail `npm install` because `@workspace/db` resolves to nothing.

### 2b. `onyx-ai/package.json` declares but does NOT use
- `cors` — never imported (raw `http` server)
- `helmet` — never imported (manually-set headers in `onyx-platform.ts`)
- `express-rate-limit` — never imported (custom in-memory map in `onyx-platform.ts`)
- `dotenv` — never imported anywhere in `src/`. **Critical — see §4.**

### 2c. Imports that exist but are dead
- `src/health.ts` and `src/security.ts` — exported, no consumer
- `src/insights/auto-insights.ts`, `src/ml/*`, `src/nlp/*`, `src/nlq/nlq-engine.ts`, `src/anomaly/*`, etc. — none referenced by either `index.ts` or `onyx-platform.ts`

### 2d. Cross-file drift
`EventStore.append` signature differs between `index.ts` and `onyx-platform.ts`:

```
index.ts          aggregateId?, aggregateType?, subject?  → optional, fallback to 'unknown' / 'event'
onyx-platform.ts  aggregateId , aggregateType            → REQUIRED, no subject support
```

Every `eventStore.append({ type, payload })` (no aggregate*) call in `index.ts` will compile against the loose signature, then **break at runtime** because `onyx-platform.ts`'s `EventStore` is what actually runs. (Many call sites in route handlers omit `aggregateId/aggregateType`.)

---

## 3. Type errors expected on `tsc --noEmit`

Cannot run, but high-confidence predictions from grep:

| Pattern | Where | Strict-mode failure |
|---|---|---|
| `body as any` casts | `index.ts:2599`, `:2657`, `:2670`, `:2679` | implicit-any when `noImplicitAny=true` |
| `error: any` catch blocks | `index.ts:2303`, `:2540`, `:2353` | `useUnknownInCatchVariables` will reject |
| `(report as any).daily_spent` | `index.ts:2478` | `noPropertyAccessFromIndexSignature` |
| `as Record<string, unknown>` | `index.ts:2477` | tolerated by current loose config |
| `agents/src/llm/client.ts:6` `process.env.ANTHROPIC_API_KEY!` | non-null assertion on undefined env | `strictNullChecks` would force null check |
| `agents/src/llm/client.ts:19,52,53` | `input?: any`, `messages: ... as any`, `tools: ... as any` | implicit-any cascade |
| `agents/src/llm/client.ts:94` | `const contentBlocks: any[]` | implicit-any |
| `apiPort ?? 3100` (still 3100 in `OnyxPlatform.start`) | `index.ts:2762` | not a type error, but contradicts the 3200/3300 chaos |

`tsconfig.strict.json` is explicitly documented as "expected to produce errors on first run." `TYPESCRIPT_STRICT_PLAN.md` lists steps 1–7 not done. Treat strict-mode green as a non-goal today.

---

## 4. AI provider keys — how loaded vs how used

### 4a. Loading (broken)

`.env.example` declares: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `WHATSAPP_TOKEN`, `SUPABASE_*`, `STRIPE_*`, `SENDGRID_*`, `GOOGLE_*`, `TELEGRAM_*`, `SLACK_*`, `ONYX_VAULT_KEY`.

**No file in `onyx-ai/src/` imports `dotenv`.** Confirmed by grep. The bootstrap at `index.ts:2978–3045` reads `process.env.PORT`, `process.env.ONYX_EVENT_STORE_PATH`, `process.env.ONYX_DAILY_BUDGET` directly — but if the process did not have those exported by the shell or container, `.env` is invisible.

The `agents/` sub-project DOES load dotenv (`agents/src/llm/client.ts:2-3`) but that's a separate process tree.

**Result:** in `dev` mode (`npm run dev` → `ts-node src/index.ts`) without an explicit `--env-file` or shell export, every API key is `undefined`. The `IntegrationRegistry.fromEnv` block at `integrations.ts:2460–2468` returns an empty config. `createAITools` sees `null/null/null` and returns `[]`. The platform happily starts with zero AI tools registered and no warning.

### 4b. Usage paths

Once keys ARE present (somehow), there are three independent code paths:

**Path A: `onyx-ai/src/integrations.ts` (raw HTTP via `HttpClient`):**
- `https://api.anthropic.com/v1/messages` — uses `x-api-key` + `anthropic-version: 2023-06-01`. Default model `claude-sonnet-4-5`. timeout 120s. Goes through `HttpClient` (lines 68–187) which **does** retry on 429/5xx with exponential backoff (`retryDelayMs * 2^attempt`).
- `${baseUrl}/chat/completions` (OpenAI) — Bearer auth, default model `gpt-4o-mini`, 120s timeout, same retry path.
- `https://api.perplexity.ai/chat/completions` — 60s timeout, retry path.

This path is the only one with proper retry + 429 handling. Good. But: keys come from `vault.retrieve('openai_api_key')` in `onyx-integrations.ts:1372` — and the vault is constructed only if `ONYX_VAULT_KEY` is set (`integrations.ts:2501–2502`). If you set `OPENAI_API_KEY` in env but no `ONYX_VAULT_KEY`, `vault` is `undefined`, vault path falls through to direct env read at `integrations.ts:2463`. OK.

**Path B: `onyx-ai/src/onyx-integrations.ts` (yet another duplicate):**
- Same Anthropic/OpenAI/Perplexity surface, but reads the key from `vault.retrieve('anthropic_api_key')` etc. **No fallback to `process.env`.** If the operator never wrote keys to the vault, this path 401s every call. Confirmed by reading `onyx-integrations.ts:1306–1320, 1372`.

**Path C: `agents/src/llm/client.ts` (direct SDK):**
- `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })` — non-null assertion. If env is missing, the SDK constructor receives `undefined` and 401s on first call.
- Default model `claude-sonnet-4-20250514`. (Note: `multiModelRouterTool.ts` references newer `claude-haiku-4-5-20251001`, `claude-opus-4-20250514`. `tokenTrackerTool.ts` has pricing for those three. But `agentModeTool.ts` line 25 uses `claude-haiku-4-5-20251001` — check if that model is actually published yet; pricing in `tokenTrackerTool.ts:18-20` is **client-side hard-coded** `{ "claude-sonnet-4-20250514": { input: 3, output: 15 } }` etc. Will drift the moment Anthropic changes prices.)
- **Zero error handling on the `anthropic.messages.create(...)` calls.** No try/catch wraps any of the four call sites (lines 48, 69, 100, 120). A 429 / 529 / network failure becomes an unhandled rejection.

### 4c. Hard-coded fallbacks
`agents/src/tools/selfCheckTool.ts:192` writes `ANTHROPIC_API_KEY=` (empty) into a freshly-generated `.env` if missing. Fine, but `:204–205` reads `process.env.ANTHROPIC_API_KEY` and returns `fail` if not set. Self-check tool is the only place that surfaces "missing key" to a user.

---

## 5. Rate limiting / error handling in AI calls

### 5a. Where rate limiting EXISTS
- `src/index.ts:128–168` (and identical in `onyx-platform.ts:128–168`) defines a `RateLimiter` token-bucket primitive.
- `Governor.evaluatePolicy` uses one per-policy `RateLimiter` for `rate_limit` rule type (`index.ts:606, 635, 759`).
- `ToolRegistry.execute` has `tool.rateLimiter.tryAcquire()` per registered tool (`index.ts:1393, 1438`). Every tool gets its own bucket.
- `onyx-platform.ts:2275–2289` — per-IP HTTP rate limit: 200 req / 15 min general, 20 req / 15 min on `/api/agent`, `/api/dag`, `/api/tasks`, `/api/orchestrat*`. Returns 429 with `Retry-After`.
- `src/integrations.ts:99–187` (`HttpClient`) — retry on 429/5xx with exponential backoff, `AbortController` timeout, `retries=3`, default `retryDelayMs=500`.

### 5b. Where rate limiting is MISSING
- `agents/src/llm/client.ts` — direct SDK, no limiter. Highest-volume Anthropic caller in the repo.
- `entrypoint.js` proxy layer — no rate limit.
- `index.ts` `APIServer.start` — no per-IP limit. **Only `onyx-platform.ts` has it, and that's the only file actually used at boot, so… technically OK, accidentally.** But the dead `index.ts` `APIServer` has zero limit — if anyone imports `OnyxPlatform` from `./index` and starts it, they get an unprotected server.

### 5c. Error handling holes
- `APIServer` (both files) `try { ... } catch (error: any) { res.writeHead(500); res.end(JSON.stringify({ error: error.message })) }` — leaks Error messages to clients, no correlation ID, no logging.
- `readBody` rejects on invalid JSON with `Error('Invalid JSON body')` — no body size limit. Unbounded.
- `process.on('unhandledRejection', ...)` only logs; `uncaughtException` triggers `shutdown('uncaughtException')` — inconsistent. A failed `anthropic.messages.create` from `agents/` would be unhandledRejection → log → continue → state drift.
- `src/services/notificationService.ts:46–49` silently `console.warn` and returns when WhatsApp creds missing. No event emitted, no metric — the platform thinks the notification went out.

---

## 6. INSTRUCTIONS_TO_WIRE.md vs reality

| Step in INSTRUCTIONS | Status | Evidence |
|---|---|---|
| 1a. Add `import { handleRawHealthRoute } from './health'` in `src/index.ts` | **NOT DONE** | grep finds zero imports of `./health` from any source file |
| 1b. Add `handleRawHealthRoute(...)` as first call in `APIServer.route` | **NOT DONE** | `index.ts:2314` `route()` starts with the root-route check, not the health adapter |
| 2a. Add `checkRawApiKey(...)` after CORS in `APIServer.start` | **NOT DONE** | `index.ts:2279–2307` has zero auth check |
| 2b. Tighten CORS to env allow-list | **PARTIAL** | Done in `onyx-platform.ts:2297–2329` (good). NOT done in `index.ts:2280–2284` (still wildcard). |
| `ONYX_AI_API_KEYS`, `ONYX_AI_VERSION` env vars in `.env` | **NOT DONE** | `.env.example` has no `ONYX_AI_API_KEYS`. |
| Express variant migration (§3) | NOT DONE | Still raw `http.createServer` |

Both `health.ts` and `security.ts` are well-written (timing-safe compare via SHA-256 + `crypto.timingSafeEqual`, fail-closed in prod, dev bypass with warn), but they are **dead code** until the imports happen.

---

## 7. State of "fixes added by other agents"

`index.ts` shows multiple "Agent-Y-QA03" / "Agent 41" comments adding endpoints needed by procurement's `ai-bridge.js`:

- `GET /` → `{service, version, status}` (line 2286, 2321)
- `GET /healthz`, `/livez`, `/readyz` (lines 2331, 2345, 2493)
- `GET /health` (alias) (line 2358)
- `POST /evaluate` (line 2376)
- `POST /events` (line 2444)
- `GET /budget` (line 2476)
- `POST /api/notifications/*` (lines 2641–2687)

**None of these exist in `onyx-platform.ts`** (the file actually loaded at boot — see `index.ts:2990` `require('./onyx-platform')`). So in production:

- procurement's `ai-bridge.js` POST to `/evaluate` → 404
- procurement's `ai-bridge.js` GET `/budget` → 404
- procurement's `ai-bridge.js` POST `/events` → 404
- Cloud Run / k8s liveness `GET /livez` → 404 (but `entrypoint.js` shadows this with its canned response, so the platform **looks** alive while the platform is actually broken)
- Payslip / work-order / invoice notification webhooks → 404

This is the single biggest live bug. It defeats the point of the bridge. Either delete `onyx-platform.ts` and load `./index`, or port every fix into `onyx-platform.ts`.

---

## 8. Security posture

| # | Sev | Issue | Location |
|---|---|---|---|
| R1 | **CRIT** | Wrong file loaded at boot — all bridge endpoints 404 | `index.ts:2990` |
| R2 | **CRIT** | `dotenv` never loaded — every API key undefined unless shell-exported | all of `src/` |
| R3 | **CRIT** | `/api/kill`, `/api/resume`, `/api/knowledge/entity` unauthenticated (both files) | `index.ts:2604–2615`, `onyx-platform.ts:2430–2441` |
| R4 | High | `index.ts` APIServer wildcard CORS + zero security headers | `:2280–2284` |
| R5 | High | `agents/src/llm/client.ts` AI calls have no try/catch, no retry, no rate-limit | `:48, :69, :100, :120` |
| R6 | High | `readBody` no Content-Length limit | `index.ts:2692, onyx-platform.ts:2467` |
| R7 | Med | Error messages leaked to client unfiltered | `index.ts:2303, onyx-platform.ts:2353` |
| R8 | Med | EventStore append signature mismatch between two platform files → runtime breakage | §2d |
| R9 | Med | Hard-coded model pricing in `tokenTrackerTool.ts` will drift | `agents/src/tools/tokenTrackerTool.ts:17–21` |
| R10 | Med | `entrypoint.js` returns canned health response, masking real platform failure | `entrypoint.js:1` |
| R11 | Med | Port chaos: 3100/3200/3300/3301 across files. CLAUDE.md says 3300, code says 3200, Docker says 3300, proxy uses +1 | §0.2 |
| R12 | Low | `Math.random()` in `BackoffCalculator.calculate` jitter despite "no Math.random" banner | `index.ts:122` |
| R13 | Low | `ONYX_GLOBAL_BUDGET` env var declared but `Governor` constructor doesn't accept it (silently dropped) | `index.ts:3004` (matches Agent-16 finding §4) |
| R14 | Low | `whitelist` policy type declared in union but no case in `evaluatePolicy` — silent pass | (Agent-16 finding §3) |
| R15 | Low | `agents/` sub-project depends on `@workspace/db` workspace alias not configured at this level | `agents/package.json:12` |

---

## 9. Recommended fixes (ordered by blast radius)

1. **Decide which platform file is the runtime, delete the other.** Recommended: keep `onyx-platform.ts` (it has the rate limiter + helmet headers + CORS allowlist) and port the new endpoints (`/evaluate`, `/events`, `/budget`, `/healthz`, `/livez`, `/readyz`, `/api/notifications/*`) from `index.ts` into it. Then change `index.ts:2990` to `require('./onyx-platform')` (already does) and either re-export from `index.ts` or delete `index.ts`'s body. Also delete `onyx-integrations.ts` (the third copy).
2. **Wire `dotenv` at the top of the bootstrap.** Add `import 'dotenv/config'` as the first import of whichever file becomes canonical.
3. **Apply INSTRUCTIONS_TO_WIRE.md.** Two-line import + one block in `route()` and one in `start()`. Adds /health, /ready, X-API-Key auth.
4. **Pick one port and stick to it.** CLAUDE.md says 3300 — make `Dockerfile` ENV PORT=3300, `.env.example` PORT=3300, `OnyxPlatform.start` default 3300, kill the `entrypoint.js` `+1` proxy or document why it exists. Right now the entrypoint listens on `3300` and proxies to `3301` while the inner platform thinks it's on `3300` (because env says so) — collision is likely.
5. **Wrap every `anthropic.messages.create` and `openai.chat.completions.create` in a circuit breaker + retry-with-backoff.** Reuse the existing `CircuitBreaker` and `BackoffCalculator` primitives. `agents/src/llm/client.ts` is the highest-priority file.
6. **Bound the request body** at `readBody` (e.g., 1 MB) with a 413 response, before parsing.
7. **Persist rate-limiter state** (or accept that restarts reset the bucket — document it).
8. **Strict TS migration:** turn on `noImplicitAny` first, fix the dozens of `body as any`, then `noUnusedLocals`. Defer `exactOptionalPropertyTypes` until last.
9. **Add at least one smoke test** that boots the platform and asserts `/livez`, `/api/status`, `POST /evaluate`, `GET /budget` all respond 200. Right now `npm test` is a literal `echo`.
10. **Delete `src/onyx-integrations.ts`** unless someone confirms it's a deliberate fork. Three copies of the platform is the worst of all worlds.

---

## 10. What's actually good

- `src/procurement-bridge.ts` is clean: AbortController timeouts, retry with exponential backoff (250/500/1000ms), `RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}`, X-API-Key auth, fail-open semantics. Use this as the template for the AI-side outbound clients.
- `src/integrations.ts` `HttpClient` retry logic (429/5xx with backoff) is correct and reusable.
- `src/security.ts` and `src/health.ts` are correctly authored: SHA-256 + `crypto.timingSafeEqual`, dev-bypass + fail-closed-in-prod, structural types so no @types/express coupling. They just need to be plugged in.
- The Governor's policy DSL (rate_limit / budget / approval_required / blacklist / whitelist / time_window / risk_limit) is rich, even if `whitelist` and per-agent budget enforcement are unfinished.
- Event-sourced design with hash-chain integrity (`auditReport()`, `verifyIntegrity()`) is real and not a sham.

---

## 11. Bottom line

The `onyx-ai` service has real bones — Governor, EventStore, KnowledgeGraph, DAG, ToolRegistry, RateLimiter, CircuitBreaker. But the runtime is broken in a non-obvious way: **the file loaded at boot is missing every endpoint procurement actually calls**, dotenv is silently absent, two security modules are sitting unused, and three copies of the same platform are drifting. Fix #1 (`require('./onyx-platform')` + endpoint port) is a 30-minute job that unblocks the entire procurement → AI integration. Everything else can follow.

Static audit only — no code was executed.

---
*End of AGENT-03-runtime-onyx-ai.md*
