# QA AGENT #77 — LLM Token Usage & Cost Analysis

**Project scanned:** `onyx-ai`
**Scope:** Static analysis only
**Date:** 2026-04-11
**Dimension:** LLM Token Usage & Cost

---

## Files analyzed

- `onyx-ai/src/index.ts` (Governor, Budget, RateLimiter, ToolRegistry)
- `onyx-ai/src/integrations.ts` (createAITools — Anthropic/OpenAI/Perplexity + Redis)
- `onyx-ai/src/onyx-integrations.ts` (SECTION 8 AI tools with cost metadata)
- `onyx-ai/src/onyx-platform.ts` (duplicate of index.ts governance/tools)
- `onyx-ai/package.json` — **only `express`, `cors`, `dotenv`** (no `@anthropic-ai/sdk`, no `openai`, no `tiktoken`, no `gpt-tokenizer`)

---

## 1. Token Tracking — Does the code count tokens?

### Findings

| Aspect | Status | Evidence |
|---|---|---|
| Explicit tokenizer (tiktoken / gpt-tokenizer / @dqbd/tiktoken) | **ABSENT** | Not in `package.json`; `grep tiktoken\|tokenize\|count.?token` → 0 matches |
| Pre-call estimation | **NONE** | Code posts `prompt` directly with hard `max_tokens: 4096` fallback |
| Post-call `usage` capture | **PARTIAL PASS-THROUGH** | `onyx-integrations.ts:1322` returns `usage: resBody?.usage ?? {}` — the object is *returned from the handler* but never persisted, aggregated, or billed |
| Token → cost conversion | **NONE** | No per-model rate table; `costPerInvocation: 0.05` is a **flat hard-coded constant** (onyx-integrations.ts:1283) regardless of prompt length or response size |
| Separate input/output counting | **ABSENT** | Neither `input_tokens` nor `output_tokens` are ever referenced by name anywhere in `src/` |

### Verdict
The system does **NOT count tokens**. It only knows *that* an LLM call happened, at a fixed notional cost. A 50-token ping and a 100K-token monster document both cost `0.05` to the governor.

---

## 2. Cost Dashboard

### Findings

| Aspect | Status | Evidence |
|---|---|---|
| Real-time cost counter | **CRUDE** | `Governor.budgetTrackers` (index.ts:606) — `Map<policyId, {spent, resetAt}>` |
| Per-model breakdown | **ABSENT** | Budget bucket keyed by `policy.id`, not by model |
| Daily reset | **PRESENT** | `resetAt: Date.now() + 86400000` (index.ts:777-782) — hard-coded 24h |
| Compliance report | **MINIMAL** | `Governor.getComplianceReport()` returns `budgetUtilization: {spent, limit, percent}` (index.ts:912-943) |
| HTTP/UI endpoint for cost | **NOT FOUND** | No `/cost`, `/usage`, `/billing`, or `/dashboard` route anywhere |
| Historical trend (7d / 30d) | **ABSENT** | Only current-day in-memory counter; no persistence — **restart = data loss** |
| `ToolRegistry.getInvocationStats` | **PARTIAL** | Returns `totalCost` (index.ts:1588) but sums `costPerInvocation`, i.e. flat `0.05 × count`, not real spend |

### Verdict
No actual cost dashboard exists. There is a **governance budget gate** (block/allow), but no telemetry pane, no per-model view, no historical trend, and no persistence beyond the process lifetime.

---

## 3. Per-User / Per-Session Quotas

### Findings

| Scope available | Evidence |
|---|---|
| `global` | `index.ts:567` |
| `agent` | `index.ts:567` |
| `task_type` | `index.ts:567` |
| `tool` | `index.ts:567` |
| `department` | `index.ts:567` |
| **`user`** | **MISSING** |
| **`session`** | **MISSING** |

The `Policy.scope` type literal is:
```ts
scope: 'global' | 'agent' | 'task_type' | 'tool' | 'department';
```

- `integrations.ts:60-61` declares `userId?: string; sessionId?: string` in `HttpClient` context, but **they are not wired** into the `Governor.evaluate()` action object in `ToolRegistry.invoke` (index.ts:1418-1423) — only `toolId`, `estimatedCost`, `riskScore` are passed.
- Result: **a single runaway user or an infinite loop in one session can drain the entire `maxCostPerDay` global budget.** There is no quota isolation.

### Verdict
Per-user and per-session quotas are **NOT IMPLEMENTED**. Scope exists for agents/departments, but not for end-users or conversational sessions.

---

## 4. Caching Layer for Repeated Queries

### Findings

| Aspect | Status | Evidence |
|---|---|---|
| Generic Redis GET/SET tool | **EXISTS** | `integrations.ts:1510-1560` — `redis_get`, `redis_set`, `redis_delete`, `redis_incr` (Upstash REST) |
| Hash of `(model, prompt, system, temperature)` as cache key | **ABSENT** | No such helper anywhere |
| LLM handler checks cache before `http.post` | **NO** | `onyx-integrations.ts:1301-1325` (Claude) and `1354-1377` (OpenAI) call the provider **unconditionally** — zero cache probe |
| Semantic cache (embedding-similarity lookup) | **ABSENT** | `openai_embedding` exists (integrations.ts:1299) but isn't used as a cache index |
| In-memory LRU | **ABSENT** | No `Map` + eviction for prompts |
| Anthropic prompt caching headers (`cache_control`) | **ABSENT** | Body built at `onyx-integrations.ts:1305` has no `cache_control` block |
| OpenAI prompt caching / response id reuse | **ABSENT** | Not set |

### Verdict
**No LLM caching whatsoever.** Identical prompts 10,000 times/day pay 10,000× full price. The Redis primitives are available but unused for this purpose.

---

## 5. Embedding Reuse

### Findings

- `openai_embedding` tool exists (`integrations.ts:1299-1320`) producing `text-embedding-3-small` vectors.
- Returns `{ embedding, usage }` but **never stores** the vector anywhere. No `VectorStore`, no `EmbeddingIndex`, no `pgvector` call, no Supabase `rpc` for ANN search wired up.
- The `README`/header comments on `onyx-ai/src/index.ts:61` advertise "Embeddings • Semantic search • Versioned" — but the actual implementation is not present in the source.
- Consequence: every semantic query **re-embeds the same strings** on every call. For a RAG workload this is a 10–100× cost multiplier.

### Verdict
Embedding reuse is **architected in the comments, not in the code.** Zero persistence, zero lookup, zero deduplication.

---

## 6. Streaming vs Blocking Calls

### Findings

| Aspect | Status | Evidence |
|---|---|---|
| `stream: true` flag passed to provider | **NEVER** | Not present in Anthropic body (`onyx-integrations.ts:1305`), not in OpenAI body (`1362`), not in Perplexity body (`1401`) |
| SSE parser / chunked reader | **ABSENT** | `req.on('data', chunk=>…)` is only used for *incoming webhook bodies*, not for provider responses |
| 120-second blocking timeout | **PRESENT** | `timeout: 120000` (onyx-integrations.ts:1285, 1339; integrations.ts:1255, 1291) |
| Backpressure / abort on budget exhaustion mid-stream | **N/A** (no streaming) | — |

### Verdict
**100% blocking calls.** The request thread sits idle for up to 120 seconds per call. No streaming, no TTFB optimization, no mid-response cancellation. This dramatically harms UX and, for Anthropic, prevents benefiting from their streaming cost/cache features.

---

## 7. Estimated Monthly Cost (Low / Medium / High Usage)

### Pricing assumptions (April 2026 public rates)
- Claude Sonnet 4.5 — input ≈ **$3/M tok**, output ≈ **$15/M tok**
- GPT-4o — input ≈ **$2.50/M tok**, output ≈ **$10/M tok**
- `text-embedding-3-small` — ≈ **$0.02/M tok**

### Observed defaults in code
- `max_tokens: 4096` output hardcoded (onyx-integrations.ts:1307, 1365)
- `temperature: 0.7` (no deterministic dedup)
- **No cache** → every call hits provider at full price
- **No token counting** → we must assume ~2K input / ~2K output average per call (typical for procurement prompts with context)

### Assumed per-call average
- Input: 2,000 tokens
- Output: 2,000 tokens (well below the 4096 cap)
- Claude blended: `(2K × $3 + 2K × $15) / 1M = $0.036` per call
- GPT-4o blended: `(2K × $2.50 + 2K × $10) / 1M = $0.025` per call
- Average mix ~$0.030 per LLM call

### Cost scenarios

| Tier | Calls/day | Calls/month | LLM cost/month | + Embeddings (~30%) | **Total monthly** |
|---|---:|---:|---:|---:|---:|
| **Low** (pilot, 1 office, 20 users) | 200 | 6,000 | $180 | $54 | **~$234** |
| **Medium** (full prod, 100 users, 10 agents) | 2,000 | 60,000 | $1,800 | $540 | **~$2,340** |
| **High** (scaled, 500 users + automation loops) | 15,000 | 450,000 | $13,500 | $4,050 | **~$17,550** |
| **Worst case** (runaway loop, no quota) | ∞ | — | — | — | **unbounded** |

### Reality check against code defaults
- Governor `maxCostPerTask: 10, maxCostPerDay: 1000 USD` (index.ts:2634 example) translates to ≈$30K/month ceiling — but the tracker is **in-memory only**; a process restart resets `spent` to zero. An operator restart at 09:00 + another at 15:00 = **2× daily budget** actually spent.
- The flat `costPerInvocation: 0.05` (onyx-integrations.ts:1283) is **higher than real blended cost ($0.030)** — so the governor *over-estimates* when calls are small and *severely under-estimates* when prompts are large (100K-token docs would cost $0.30+ real but still charge $0.05 to the budget).

### Hidden cost multipliers not caught by current code
1. **Retry storms** — `retryable: true` (onyx-integrations.ts:1286) with `maxAttempts = 3` means a transient 5xx **triples the bill** for that call.
2. **No cache on identical prompts** — worst offender in real workloads.
3. **No deduplication of embeddings** — same supplier description re-embedded per product.
4. **4096-token output ceiling** always requested even when the answer is 2 words.
5. **Perplexity's `sonar`/`sonar-pro`** (default `sonar-pro` in `integrations.ts:1330`) costs ~3× vanilla `sonar`.

---

## 8. Recommendation

### Severity: **HIGH**
The system is **operationally exposed to cost runaway**. Governance exists on paper but lacks the three instruments that matter most: real token counting, caching, and per-user quotas.

### Must-fix (before production)

1. **Add `tiktoken` / `@anthropic-ai/tokenizer` to `package.json`.** Estimate `input_tokens` from the prompt *before* sending. Fail fast if estimate > remaining budget.
2. **Persist `usage` from every response** to an event (`EventStore.append({ type: 'llm.usage', payload: { model, input_tokens, output_tokens, priceUsd } })`) and feed it into `Governor.budgetTrackers`. Stop using flat `costPerInvocation`.
3. **Add `'user'` and `'session'` to `Policy.scope`** (index.ts:567) and pipe `userId`/`sessionId` into `ToolRegistry.invoke`'s governance action.
4. **Persist budget trackers to Redis** (`integrations.ts` already has `redis_get`/`redis_set`) — do NOT keep them in-memory. Restart = loss = bypass.
5. **Cache identical prompts in Redis** keyed by `sha256(model|system|prompt|temperature)`, 24-hour TTL. Expected hit rate ≥ 30% → immediate 30% bill reduction.
6. **Enable Anthropic prompt caching** — add `"cache_control": {"type": "ephemeral"}` to the system prompt block for repeated system messages (90% discount on cached tokens).
7. **Switch to streaming** (`stream: true`) and implement an SSE reader. Benefits: better UX, mid-stream cancellation when a user aborts, and the ability to kill runaway generations before they cost the full `max_tokens: 4096` output.
8. **Tighten `max_tokens`** — drop the default from 4096 to **1024** for classification/routing tasks, 2048 for summaries. Expose `maxTokens` as required input for premium models.
9. **Deduplicate embeddings** — before calling `openai_embedding`, check `redis_get('emb:'+sha256(text))`. Store on cache-miss. This one change alone saves 40–70% on embedding spend.
10. **Add a `/cost/dashboard` HTTP endpoint** returning 24h/7d/30d spend per `(user, agent, model)`. Persist the underlying data in Supabase (`integrations.ts` already has `supabase_insert`).

### Nice-to-have
- Route "cheap" questions to GPT-4o-mini or Haiku automatically based on complexity score.
- Alert when daily spend > 80% (already feasible via `intelligent-alert-system.ts`'s `project_budget_usage` signal category — just needs a new signal for `llm_budget_usage`).
- Circuit-breaker the LLM tool specifically when cost/hour > threshold (not just when error rate > 50%).

### Bottom line
The platform's governance *framework* is solid (kill switch, policies, circuit breakers, rate limiters). But on the **LLM cost dimension**, the governance is a **façade** — it enforces a fixed nominal cost per call, with no connection to actual token billing. At the medium tier (~$2,340/mo) this is tolerable; at the high tier (~$17K/mo) a single misconfigured agent loop can burn through the monthly budget in hours.

**Recommended immediate action:** items 1, 2, 4, 5, 9 from the Must-fix list. Estimated effort: 2–3 developer-days. Estimated savings: **30–60% on LLM spend from day one.**
