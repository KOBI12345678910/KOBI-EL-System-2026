# QA Agent #75 — AI/ML Model Selection & Architecture (onyx-ai)

**Date:** 2026-04-11
**Scope:** Cross-project static analysis of `onyx-ai`
**Dimension:** AI/ML Model Selection & Architecture
**Method:** Static analysis only (no execution)

---

## 1. Executive Summary

The `onyx-ai` platform exposes a **multi-provider LLM abstraction layer** (Anthropic Claude, OpenAI, Perplexity) rather than hardcoding a single vendor. LLMs are wrapped as **tools** inside a `ToolRegistry`, consumed by a supervised `AgentRuntime` that runs under a `Governor` policy engine, with execution coordinated by a `DAGOrchestrator`. There is **no vector store, no RAG, and no native agent/tool-calling loop** — the platform uses a deterministic ToolChain iterator, not the native function-calling primitives of either provider.

**Files examined:**
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-ai\package.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-ai\src\index.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-ai\src\integrations.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-ai\src\onyx-integrations.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-ai\src\onyx-platform.ts`

**Dependencies (`package.json`):**
```
express ^4.21.2, cors ^2.8.5, dotenv ^16.4.7
```
No `@anthropic-ai/sdk`, no `openai`, no `langchain`, no `pinecone-client`. All LLM calls are raw HTTP via an internal `HttpClient` abstraction.

---

## 2. LLM Providers Found

| Provider  | Config Interface     | Endpoint                                       | File                 |
|-----------|----------------------|------------------------------------------------|----------------------|
| Anthropic | `AnthropicConfig`    | `https://api.anthropic.com/v1/messages`        | `integrations.ts:1205` |
| OpenAI    | `OpenAIConfig`       | `https://api.openai.com/v1/chat/completions`   | `integrations.ts:1210` |
| OpenAI    | `OpenAIConfig`       | `https://api.openai.com/v1/embeddings`         | `integrations.ts:1310` |
| Perplexity| `PerplexityConfig`   | `https://api.perplexity.ai/chat/completions`   | `integrations.ts:1335` |

Factory function `createAITools(anthropic, openai, perplexity, http)` at `integrations.ts:1221` conditionally registers each provider as a tool only if its config is non-null. API keys are loaded from env (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) at `integrations.ts:2460-2464` or from a `Vault` abstraction (`onyx-integrations.ts:1314, 1368`).

**Assessment:** Correct multi-provider design, no vendor lock-in. Keys never hardcoded.

---

## 3. Model Versions

### Anthropic Claude

| Where                          | Default Model                  |
|--------------------------------|--------------------------------|
| `integrations.ts:1237`         | `claude-sonnet-4-5`            |
| `integrations.ts:1245`         | `claude-sonnet-4-5`            |
| `onyx-integrations.ts:1292`    | `claude-sonnet-4-20250514`     |
| `onyx-integrations.ts:1306`    | `claude-sonnet-4-20250514`     |

**Inconsistency:** two different Claude defaults across the two integration modules. `integrations.ts` uses the latest alias `claude-sonnet-4-5`; `onyx-integrations.ts` pins the older dated snapshot `claude-sonnet-4-20250514`. This should be unified into a single `DEFAULT_CLAUDE_MODEL` constant.

**API version header:** `anthropic-version: 2023-06-01` (valid, stable).

### OpenAI GPT

| Where                          | Default Model  |
|--------------------------------|----------------|
| `integrations.ts:1273, 1285`   | `gpt-4o-mini`  |
| `onyx-integrations.ts:1363`    | `gpt-4o`       |

**Inconsistency:** `integrations.ts` defaults to the cheap `gpt-4o-mini`; `onyx-integrations.ts` defaults to the 10x-more-expensive `gpt-4o`. No justification in code comments.

### Perplexity

| Where                          | Default Model |
|--------------------------------|---------------|
| `integrations.ts:1330, 1336`   | `sonar-pro`   |
| `onyx-integrations.ts:1393, 1402` | `sonar`    |

---

## 4. Embedding Model

Only one embedding tool is defined: `openai_embedding` at `integrations.ts:1299-1320`.

- **Model:** `text-embedding-3-small` (default)
- **Endpoint:** `POST https://api.openai.com/v1/embeddings`
- **Dimensions:** 1536 (OpenAI default for `3-small`, not explicitly set via `dimensions` param)
- **Cost tier:** labeled `'cheap'` (line 1307)
- **Return shape:** `{ embedding, usage }`

**Observations:**
- No batching — the tool accepts a single `input: string`, not `string[]`. A bulk embed of 10k docs would cost 10k HTTP calls.
- No caching layer observed (no Redis-backed embedding cache).
- No dimensionality reduction / no `dimensions` param passed.
- No Anthropic embedding fallback (Anthropic does not ship a native embedding model, so this is acceptable).

---

## 5. Vector Store / RAG

**Finding: NO VECTOR STORE.**

Greps for `pinecone`, `weaviate`, `pgvector`, `chroma`, `qdrant`, `milvus`, `faiss`, `hnsw` return zero matches across `onyx-ai/src/**`.

The only `embedding` match is the OpenAI call that **returns** an embedding vector. There is no store, no index, no ANN, no cosine/dot-product search, no RAG retrieval pipeline.

**Semantic search substitute:**
- `src/index.ts:61` comments mention `"Embeddings • Semantic search • Versioned"` as a planned Knowledge subsystem
- Actual implementation: `KnowledgeGraph.query({ fullText, limit, minConfidence })` at `index.ts:1796` — this is **keyword full-text filter**, not vector similarity.

**Assessment:** Architecture claims embeddings/semantic-search in comments, but delivers only a keyword-based KnowledgeGraph. **Gap: the embedding tool has no consumer.** Any code that calls `openai_embedding` will get a 1536-dim array back with nowhere to store it. This is dead code or a placeholder.

---

## 6. Agent Loop Architecture

Classes in `src/index.ts`:

| Class              | Line        | Role                                                  |
|--------------------|-------------|-------------------------------------------------------|
| `Governor`         | 603         | Policy engine — allow/deny every agent action         |
| `AgentManifest`    | 1602        | Declarative agent config (capabilities, budget, etc.) |
| `AgentRuntime`     | 1642        | Single-agent supervised execution context             |
| `DAGOrchestrator`  | 2000        | Multi-agent DAG scheduler                             |
| `CircuitBreaker`   | (referenced) | Per-agent failure isolation                          |
| `WorkerPool`       | (referenced) | Per-agent concurrency control (backpressure)         |

**Execution model (`runTaskLogic` at index.ts:1787):**

1. Pull context from `KnowledgeGraph.query({ fullText, limit: 5, minConfidence: 0.5 })`
2. **Iterate over `task.tools` deterministically** (`for (const toolId of task.tools)`)
3. For each tool: check capability -> invoke via `ToolRegistry.invoke(...)`
4. Store aggregated `results` back in KnowledgeGraph
5. Return results

**Critical finding: this is NOT a classic agent loop.**

There is no:
- LLM → tool_call → tool_result → LLM re-entry cycle
- Max-iteration cap
- ReAct reasoning
- Native tool-calling schema (Anthropic `tools` param, OpenAI `functions`/`tools` param)
- Reflection / self-critique step

The "agent" is effectively a **pre-planned tool pipeline executor** — the caller specifies `task.tools` up front, and the runtime walks them in order. The LLM itself never decides what tool to call next; it is just one of many tools in the list.

**Governance layer (strong):** every task is gated by `Governor.evaluate()` at lines 1729 and 2062 before execution. The `CircuitBreaker` at line 1764 trips after N consecutive failures. The `WorkerPool` provides backpressure. Audit events are written to `EventStore` at every state transition (`agent.started`, `agent.task_started`, `agent.task_completed`, `agent.task_failed`, `agent.degraded`, `agent.suspended`, `agent.resumed`, `agent.terminated`, `agent.heartbeat`).

**Assessment:**
- Control-plane / governance = excellent (Palantir/Foundry-style)
- AI reasoning plane = missing. No agentic loop exists.

---

## 7. Tool Calling Pattern

Neither Anthropic `tools` nor OpenAI `tools`/`function_call` parameters are used. Evidence:

```ts
// integrations.ts:1244
const res = await http.post('https://api.anthropic.com/v1/messages', {
  model: ...,
  max_tokens: ...,
  temperature: ...,
  system: input.system,
  messages: [{ role: 'user', content: input.prompt }],
  //   ^^^ no `tools` field
});
```

```ts
// integrations.ts:1284
const res = await http.post(`${baseUrl}/chat/completions`, {
  model: ...,
  messages,
  max_tokens: ...,
  temperature: ...,
  //   ^^^ no `tools`, no `functions`
});
```

Tools are a **platform primitive** (`ToolConfig` interface, `ToolRegistry` class) but the LLM itself is never told about them. The `claude_complete` / `openai_complete` / `perplexity_search` tools just return plain text completions.

**Impact:**
- LLMs cannot call out to Supabase, Stripe, HubSpot, etc.
- All tool orchestration is host-side (TypeScript) not model-side.
- To add LLM-driven tool use you would need to:
  1. Convert `ToolConfig.inputSchema` → Anthropic/OpenAI JSON-Schema
  2. Inject them into the request body
  3. Parse `tool_use` blocks and re-invoke the model until `end_turn`

---

## 8. Cost per Call (Static Estimate)

No cost observability in the code beyond the opaque `costTier: 'cheap' | 'free' | 'standard' | 'premium'` tag on each `ToolConfig`. No token counting, no $/call accounting, no budget burn-rate monitoring, though `AgentManifest.budgetPerDay` exists as a declared **limit** without an enforcement path.

**Back-of-envelope (April 2026 public pricing):**

| Tool             | Model                  | Typical call (1k in / 1k out)     |
|------------------|------------------------|-----------------------------------|
| `claude_complete`  | `claude-sonnet-4-5`     | ~$0.003 in + $0.015 out ≈ **$0.018** |
| `claude_complete`  | `claude-sonnet-4-20250514` | ~$0.003 in + $0.015 out ≈ **$0.018** |
| `openai_complete`  | `gpt-4o-mini`           | ~$0.00015 in + $0.00060 out ≈ **$0.00075** |
| `openai_complete`  | `gpt-4o`                | ~$0.0025 in + $0.010 out ≈ **$0.0125** |
| `openai_embedding` | `text-embedding-3-small`| ~$0.00002 per 1k tokens ≈ **$0.00002** |
| `perplexity_search`| `sonar-pro`             | ~$0.003 in + $0.015 out ≈ **$0.018** + search surcharge |

Budget defaults (`AgentManifest.budgetPerDay`) are in abstract "Cost units", not dollars — the mapping units→dollars is **not defined anywhere** in the source. This is a governance gap.

**Recommendation:** add a `CostCalculator` that reads `usage.input_tokens` / `usage.output_tokens` from the `.usage` field (already captured at `integrations.ts:1259` and `1295`) and converts to USD, then increments `AgentState.metrics.totalCostConsumed`.

---

## 9. Latency Target

| Tool                | Client `timeout`        | Source                   |
|---------------------|-------------------------|--------------------------|
| `claude_complete`     | 120,000 ms (120s)       | `integrations.ts:1255`  |
| `openai_complete`     | 120,000 ms (120s)       | `integrations.ts:1291`  |
| `openai_embedding`    | (default — not set)     | `integrations.ts:1310`  |
| `perplexity_search`   | 60,000 ms (60s)         | `integrations.ts:1340`  |
| Agent task deadline | 300,000 ms (5 min) fallback | `index.ts:1814`        |

**No SLO/SLA targets declared.** No p50/p95/p99 histogram. `AgentState.metrics.avgResponseTimeMs` is declared in the state shape (line 1629) but is **never updated** in `onTaskSuccess` or `onTaskFailure` — so the metric is always zero. This is a bug.

**Realistic expected latencies (external reference, not in code):**
- `gpt-4o-mini` chat: p50 ~700 ms, p95 ~2.5 s
- `claude-sonnet-4-5` chat: p50 ~1.5 s, p95 ~6 s
- `text-embedding-3-small`: p50 ~150 ms, p95 ~500 ms
- `perplexity sonar-pro` (with web search): p50 ~4 s, p95 ~15 s

The 120s HTTP timeout is a safety ceiling, not a target. No retry/backoff logic is visible inside the AI tools — if a call fails, the CircuitBreaker is the only defense.

---

## 10. Issues Found (Static Analysis)

| # | Severity | File:Line                              | Issue                                                              |
|---|----------|----------------------------------------|--------------------------------------------------------------------|
| 1 | HIGH     | `integrations.ts:1237` vs `onyx-integrations.ts:1306` | Conflicting Claude default model across two modules          |
| 2 | HIGH     | `integrations.ts:1285` vs `onyx-integrations.ts:1363` | Conflicting OpenAI default (`gpt-4o-mini` vs `gpt-4o`)       |
| 3 | HIGH     | entire module                          | No vector store, but embedding tool exists → dead code / orphan feature |
| 4 | HIGH     | `index.ts:1787-1839`                   | `runTaskLogic` is a linear for-loop, not an agent loop — LLM cannot decide tool sequence |
| 5 | HIGH     | `index.ts:1629, 1841-1854`             | `avgResponseTimeMs` declared but never updated — dead metric       |
| 6 | MED      | `integrations.ts:1244-1296`            | No native `tools` / function-calling parameter passed to LLMs      |
| 7 | MED      | `index.ts:1611`                        | `budgetPerDay` in abstract units without USD mapping → budget unenforceable |
| 8 | MED      | `integrations.ts:1299-1320`            | No batch embedding API — one HTTP call per input                   |
| 9 | MED      | `integrations.ts:1310`                 | `openai_embedding` missing `timeout`                               |
| 10| LOW      | `integrations.ts:1299-1320`            | No caching of embedding results                                    |
| 11| LOW      | all AI tools                           | No retry/backoff on 429/5xx (only CircuitBreaker at host level)    |
| 12| LOW      | `integrations.ts:1253`                 | Anthropic API version pinned to `2023-06-01` (still valid, but old)|
| 13| LOW      | `package.json`                         | No `@anthropic-ai/sdk` / `openai` — raw HTTP increases maintenance cost and risks missing SDK safety features |

---

## 11. Recommendations (Prioritized)

1. **Unify model defaults.** Create `src/ai-config.ts`:
   ```ts
   export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5';
   export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
   export const DEFAULT_OPENAI_EMBEDDING = 'text-embedding-3-small';
   export const DEFAULT_PERPLEXITY_MODEL = 'sonar-pro';
   ```
   Import from both integration files.

2. **Add a real agent loop.** `runTaskLogic` should call the LLM with `tools: [...]`, parse `tool_use`, invoke host tools, feed results back as `tool_result`, loop until `stop_reason: 'end_turn'` or max iterations (default 10).

3. **Pick a vector store** (pgvector on Supabase is the cheapest path given Supabase is already an integration) and wire the embedding tool to an `IndexedKnowledge` service with `upsert(id, text, metadata)` / `query(text, topK)`.

4. **Cost accounting.** Add `CostCalculator` that maps `usage.input_tokens`/`usage.output_tokens` to USD via a static price table, update `AgentState.metrics.totalCostConsumed` in `onTaskSuccess`, and enforce `budgetPerDay` in `Governor.evaluate()`.

5. **Latency tracking.** Populate `avgResponseTimeMs` on every `onTaskSuccess`. Emit p50/p95 histograms via `EventStore` aggregation.

6. **Batch embeddings.** Change signature to `input: string | string[]` and forward as array to OpenAI's `/embeddings`.

7. **Retry/backoff.** Add exponential backoff on 429/503 inside each AI tool (3 retries, jitter), before the CircuitBreaker trips.

8. **SDK migration (optional).** Swap raw HTTP for `@anthropic-ai/sdk` and `openai` official SDKs — fewer bugs, automatic retries, streaming support.

---

## 12. Strengths Worth Preserving

- Multi-provider abstraction (`createAITools`) is clean and extensible
- `Governor` + `CircuitBreaker` + `WorkerPool` + `EventStore` control plane is well-architected and unusually mature for an internal platform
- All API keys via env/vault, no leaks
- Conditional provider registration — app works with zero, one, two, or three providers configured
- `costTier` field on every tool is the right primitive for future cost routing (route cheap prompts to `gpt-4o-mini`, premium to `claude-sonnet-4-5`)

---

## 13. Verdict

| Category                 | Score    | Note                                             |
|--------------------------|----------|--------------------------------------------------|
| Provider abstraction     | 9/10     | Multi-vendor, config-driven                      |
| Model selection          | 6/10     | Good choices, but inconsistent defaults          |
| Embedding setup          | 3/10     | Exists but orphaned — no store consumes it       |
| Vector store             | 0/10     | Does not exist                                   |
| Agent loop               | 2/10     | Linear executor, not an agent loop               |
| Tool calling             | 2/10     | Host-side only, no native LLM tool-use           |
| Governance/control plane | 10/10    | Exceptionally strong                             |
| Cost observability       | 2/10     | Tag exists, dollars do not                       |
| Latency observability    | 1/10     | Metric declared but never populated              |
| **Overall AI/ML maturity** | **4/10** | **Platform infra excellent, AI reasoning layer thin** |

The project is an **institutional-grade agent control plane with an underdeveloped AI core**. The hard parts (governance, audit, backpressure, DAG orchestration, event sourcing) are done; the easy-but-missing parts (real agent loop, vector store, cost tracking) are what keep the score down.

---

*Generated by QA Agent #75 — static analysis only, no runtime verification.*
