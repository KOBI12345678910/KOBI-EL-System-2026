# QA Agent #78 — RAG (Retrieval Augmented Generation) Architecture

**Cross-project QA:** `onyx-ai`
**Dimension:** RAG / Retrieval / Knowledge Graph
**Date:** 2026-04-11
**Analysis type:** Static analysis only

---

## Files in scope

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-ai\src\onyx-platform.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-ai\src\index.ts` (duplicate / mirror of `onyx-platform.ts`)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-ai\src\integrations.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-ai\src\onyx-integrations.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-ai\src\modules\dms.ts`

---

## Executive Summary

`onyx-ai` does **not** implement a real RAG pipeline.
What exists is:

1. A **`KnowledgeGraph`** class (`onyx-platform.ts:996`) that is an in-memory entity/relationship store with an inverted **text index** (word -> Set of entity IDs) — this is a **lexical** full-text index, not a vector index.
2. A **`DocumentStore`** inside `modules/dms.ts:568` with its own inverted text index over `extractedText`, tags, metadata — again lexical only.
3. A single low-level tool wrapper `openai_embedding` (`integrations.ts:1299`) that *can* generate embeddings on demand — but **nothing in the codebase stores, indexes or queries those embeddings**. The returned vector is handed back to the caller and forgotten.
4. No re-ranker, no generation-time context assembly, no hallucination guardrails, no Hebrew-aware tokenizer.

The comment at `onyx-platform.ts:61` (`"Embeddings · Semantic search · Versioned"`) is **aspirational** — the knowledge layer is keyword + graph-traversal, not semantic vectors.

Severity baseline for the whole dimension: **HIGH gap** — any claim of "RAG" or "semantic search" in product copy is currently unsupported by code.

---

## 1. Vector Store Implementation

### Findings

- **No vector store exists.**
- `KnowledgeGraph` (`onyx-platform.ts:996-1321`) uses four Maps only:
  - `entities: Map<string, Entity>`
  - `relationships: Map<string, Relationship>`
  - `typeIndex`, `tagIndex`, `adjacencyList`
  - `textIndex: Map<string, Set<string>>` — **word -> entity IDs** (line 1002)
- No `embedding: number[]` field on `Entity` (`onyx-platform.ts:954-970`); the schema has no place for a vector at all.
- `integrations.ts:1299-1320` registers `openai_embedding` as a tool that calls `POST /embeddings`. The result is returned to the caller; it is not persisted into `KnowledgeGraph`, `DocumentStore`, or any other index.
- No FAISS / HNSW / pgvector / Qdrant / Weaviate / Pinecone / Chroma / LanceDB / Annoy integration anywhere under `src/`.
- No cosine similarity, dot product, or L2 distance function defined.

### Risks

- **[CRITICAL]** The platform brands itself with "Embeddings · Semantic search" (line 61) but semantic search is not implemented. This is a documentation/code truth mismatch.
- **[HIGH]** In-memory `Map` storage means that even the lexical index is lost on restart — there is no persistence layer for retrieval.
- **[HIGH]** No dimensionality control, no model-version tag on vectors (since no vectors).

### Recommendations

1. Add an `embedding?: Float32Array` field to `Entity` and to `DocumentVersion`.
2. Add a `VectorIndex` component (flat cosine to start; upgrade to HNSW later).
3. Wire `openai_embedding` into `upsertEntity` and `DocumentStore.store()` so every write is embedded.
4. Add a `semanticQuery(text, topK)` method returning `{entity, score}[]`.

---

## 2. Document Chunking Strategy

### Findings

- No chunking at all. `DocumentVersion.extractedText` (`modules/dms.ts:218`) holds the **entire** extracted text as a single string.
- `DocumentStore.indexText` (`modules/dms.ts:603-620`) concatenates name + description + tags + entity.name + all versions' extractedText + notes + `JSON.stringify(metadata)` into **one flat string**, lower-cases it, splits on `/\s+/`, and stores `word -> docId`.
- No sliding window, no recursive character splitter, no sentence/paragraph segmentation, no token-aware boundaries, no overlap logic.
- No awareness of Markdown headings, PDF page breaks, DOCX sections, or table boundaries.

### Risks

- **[HIGH]** A 300-page contract and a 1-line note are indexed identically — retrieval cannot return a *passage*, only the whole document. This is incompatible with any LLM "ground your answer in retrieved context" pattern.
- **[HIGH]** `words.filter(w => w.length > 2)` (line 616) silently drops 1- and 2-character tokens — this discards meaningful Hebrew bigrams (e.g. "לא", "על", "של", "מ-", numbers, abbreviations).
- **[MEDIUM]** `JSON.stringify(metadata)` is tokenised — braces, quotes and keys become "words" polluting the index.

### Recommendations

1. Introduce `DocumentChunk { id, documentId, versionId, text, startOffset, endOffset, embedding }`.
2. Add a chunker utility (recursive: paragraph -> sentence -> sliding window) with `chunkSize ~ 512 tokens`, `overlap ~ 64`.
3. Chunk-level, not doc-level, retrieval.
4. Remove `length > 2` filter or replace with language-aware stopword logic.

---

## 3. Retrieval Ranking

### Findings — `KnowledgeGraph.query()` at `onyx-platform.ts:1126-1215`

- Ranking logic at line 1208-1212:
  ```ts
  results.sort((a, b) => {
    const scoreA = a.confidence * (1 + a.updatedAt / Date.now());
    const scoreB = b.confidence * (1 + b.updatedAt / Date.now());
    return scoreB - scoreA;
  });
  ```
- This is **not** relevance ranking. `updatedAt / Date.now()` is always `~1` (ratio of two timestamps in ms), so the term `(1 + ratio)` is effectively a constant `~2` — the whole expression collapses to `confidence * 2`, i.e. **pure confidence order**, query-independent.
- `fullText` scoring (lines 1164-1185) counts how many query words appear in how many indexed words (`indexed.includes(word)` — substring match, not exact), but the **count is only used as a boolean filter** (`count >= Math.min(2, words.length)`), then sorted descending *only inside the text-match set* — the main sort above then overwrites that order.

### Findings — `DocumentStore.search()` at `modules/dms.ts:622-732`

- Scoring at line 712-714:
  ```ts
  relevanceScore = Math.min(1, (textScores.get(doc.id)! / (params.query?.split(/\s+/).length ?? 1)) * 0.8 + 0.2);
  ```
  This is "fraction of query words matched, scaled to [0.2, 1.0]" — better than the KG version but still:
  - No TF-IDF, no BM25.
  - `indexed.includes(word)` (line 686) matches on substring — "כלי" hits any word containing it.
  - No position/proximity/boost for title vs body matches.

### Risks

- **[HIGH]** Bug: the `(1 + updatedAt / now)` ranking term in `KnowledgeGraph.query()` is a dead formula — likely intended to be a recency decay but mathematically doesn't decay.
- **[MEDIUM]** Substring matching causes false positives especially in Hebrew (rich morphology, prefixes ו/ב/מ/ל/ה).
- **[MEDIUM]** No IDF, so common tokens dominate.

### Recommendations

1. Replace ranker with BM25 over chunks, then optional vector re-score.
2. Fix the recency term to an explicit decay: `exp(-λ * (now - updatedAt))`.
3. Replace `includes` with exact word-match using a proper token set.

---

## 4. Hybrid Search (Vector + Keyword)

### Findings

- **Not implemented.** There is no vector retrieval path at all, so there is nothing to blend keyword scores with.
- No RRF (reciprocal rank fusion), no weighted linear fusion, no fallback strategy.
- The `KnowledgeQuery` interface (`onyx-platform.ts:985-994`) and `DocumentStore.search` params have no `semantic`, `vector`, `k`, `alpha` or similar fields.

### Risks

- **[HIGH]** Keyword-only retrieval on Hebrew documents loses recall dramatically (see §8).

### Recommendations

1. After adding a vector index, implement `hybridQuery({text, topK, alpha})` combining BM25 and cosine scores with RRF.
2. Expose `alpha` (keyword weight) as a query parameter.

---

## 5. Re-ranker Layer

### Findings

- **No re-ranker of any kind.**
- No cross-encoder, no Cohere Rerank, no Jina Reranker, no LLM-as-judge re-ranking, no MMR diversification.
- Final results are sliced by `q.limit ?? 100` (line 1214) or `params.limit ?? 50` (`dms.ts:731`) with zero post-processing.

### Risks

- **[MEDIUM]** Without re-ranking, precision@k is bounded by the single-stage retriever quality — and the retriever is weak (see §3).
- **[MEDIUM]** Duplicate near-identical documents will all float to the top (no MMR).

### Recommendations

1. Add a second-stage re-ranker interface `IReranker { rerank(query, docs) -> scored[] }`.
2. Add MMR diversification for `topK > 5` queries.

---

## 6. Context Window Management

### Findings

- `runTaskLogic` (`onyx-platform.ts:1787-1839`) gathers "context" from the KG:
  ```ts
  const relatedKnowledge = this.knowledgeGraph.query({
    fullText: task.type,
    limit: 5,
    minConfidence: 0.5,
  });
  ```
  but **`relatedKnowledge` is never used** — it is fetched and then the function proceeds to call the tool chain with raw `task.input`. The context fetch is dead code / leftover scaffold.
- No prompt assembler, no token counter, no `MAX_CONTEXT_TOKENS`, no context truncation/compression.
- No "lost in the middle" mitigation (reordering, summarisation of middle chunks).
- `openai_chat` / `anthropic_messages` tool wrappers (in `integrations.ts`) take `messages` verbatim from the caller — the platform does not enforce any context budget.

### Risks

- **[CRITICAL]** Dead context-gathering call: the KG lookup at line 1796 is wasted compute and a misleading comment ("1. Gather context from knowledge graph") — a reader assumes context is being used.
- **[HIGH]** No budget enforcement -> any agent task can blow the model context window, causing 400s in production.

### Recommendations

1. Either use `relatedKnowledge` (inject into the prompt) or remove the dead call.
2. Add a `PromptBuilder` with per-model token limits and automatic truncation of retrieved context.
3. Log retrieved-vs-used token ratio per call.

---

## 7. Hallucination Defense

### Findings

- No grounding-score, no "answer is supported by source X" check, no citation extraction, no answer-vs-context NLI check.
- No confidence gating on generations — the only `confidence` field is on `Entity` (writer-asserted), not on LLM outputs.
- No "refuse if retrieval returned nothing" guard. If `query()` returns `[]`, the task still runs and the LLM may confabulate.
- The Perplexity tool (`integrations.ts:1323-1348`) does return `citations` but nothing in the platform stores or verifies them.
- No fact-check re-query step, no structured-output JSON schema enforcement at the RAG layer.

### Risks

- **[CRITICAL]** Any agent that answers from the KG has zero guardrails against hallucination. Given the domain (procurement, HR contracts, financial documents), this is a compliance and liability risk.
- **[HIGH]** `Entity.confidence` is user-set and never decays or gets verified — stale/wrong facts accumulate.

### Recommendations

1. Add a `groundingCheck(answer, retrievedChunks)` stage — minimum lexical overlap + NLI model or LLM critic.
2. Refuse-to-answer path when retrieval confidence < threshold.
3. Persist citations alongside every generated answer (traceability for audits).
4. Add confidence decay on `Entity` when not re-validated within N days.

---

## 8. Hebrew Document Handling

### Findings

- Tokeniser everywhere is `text.toLowerCase().split(/\s+/).filter(w => w.length > 2)`:
  - `onyx-platform.ts:1165` — KG full-text query
  - `onyx-platform.ts:1306` — KG text indexing
  - `modules/dms.ts:616` — DMS text indexing
  - `modules/dms.ts:683` — DMS search (length > 1 here, slightly better)
- **Problems for Hebrew:**
  - `toLowerCase()` is a no-op on Hebrew letters — harmless but it shows the tokenizer was designed for English.
  - `length > 2` throws away very common Hebrew function words that carry 2 letters ("לא", "של", "על", "אם", "כי") — **but also** throws away most meaningful 2-letter roots after prefix stripping. Since there is no prefix stripping, tokens like "הפרויקט" and "פרויקט" are treated as unrelated.
  - **No Niqqud handling** — if any text comes in with vowel points, tokens won't match unpointed queries.
  - **No RTL normalisation** — no stripping of LRM/RLM marks, no `NFC`/`NFKC` Unicode normalisation. Hebrew text that contains directionality marks (common in PDFs) will generate phantom tokens.
  - **No Hebrew stemmer/lemmatiser** (ניתוח מורפולוגי), no root extraction, no stopword list.
  - The comment block on `modules/procurement-hyperintelligence.ts:16` advertises "Hebrew message templates" — retrieval is not Hebrew-aware, only output templating is.
- One positive: `dms.ts:726` does `localeCompare(b.document.name, 'he')` for alphabetic sort — so the team is aware of locale for sorting but not for retrieval.
- Category rules in `DocumentClassifier` (`dms.ts:476+`) appear to use Hebrew keywords (based on surrounding Hebrew comments) — inspect if deeper audit needed.

### Risks

- **[CRITICAL]** Hebrew morphology + prefix-heavy writing means a keyword-only index will routinely miss 40-70% of relevant matches (user searches "חוזה עבודה", document says "חוזי העסקה").
- **[HIGH]** Unicode normalisation missing -> same visible string may index differently depending on source.
- **[HIGH]** Niqqud not stripped -> pointed text is unsearchable from unpointed queries.

### Recommendations

1. Add a Hebrew-aware preprocessor: `NFC` normalise, strip LRM/RLM/ZWJ, strip niqqud (`[\u0591-\u05C7]`), optional prefix stripper (ו/ב/כ/ל/מ/ש/ה).
2. Ship a Hebrew stopword list.
3. Use a real tokenizer (ICU word-break or a Hebrew NLP lib) instead of `split(/\s+/)`.
4. Combine with embeddings (§1) — embedding models handle Hebrew morphology implicitly, which is currently the fastest path to acceptable recall.

---

## Cross-cutting Issues

| # | Issue | Severity | Location |
|---|---|---|---|
| 1 | `src/index.ts` is a full duplicate of `src/onyx-platform.ts` — any fix must be applied twice or the files must be deduplicated. | HIGH (maintenance) | `index.ts` vs `onyx-platform.ts` |
| 2 | Dead context-gathering call in `runTaskLogic` | CRITICAL | `onyx-platform.ts:1795-1800` |
| 3 | Bogus recency term in KG ranker | HIGH | `onyx-platform.ts:1208-1212` |
| 4 | Substring match instead of token match | MEDIUM | `onyx-platform.ts:1169`, `dms.ts:686` |
| 5 | Everything in-memory, no persistence, no restart safety | HIGH | entire KG + DMS |
| 6 | `openai_embedding` tool exists but unused | MEDIUM | `integrations.ts:1299` |
| 7 | No RAG tests / no retrieval quality harness | HIGH | n/a |
| 8 | Hebrew tokenizer = English tokenizer | CRITICAL | 4 locations above |

---

## Verdict

| Dimension | Status |
|---|---|
| Vector store | MISSING |
| Chunking | MISSING |
| Retrieval ranking | BROKEN (no-op recency, substring match) |
| Hybrid search | MISSING |
| Re-ranker | MISSING |
| Context-window mgmt | MISSING (plus dead code) |
| Hallucination defense | MISSING |
| Hebrew handling | BROKEN |

**Overall RAG maturity:** Level 0 — lexical full-text index + graph traversal only. Marketing copy that claims "semantic search / embeddings" is not backed by code.

**Recommended priority order:** (1) fix Hebrew tokenizer + Unicode normalisation, (2) wire `openai_embedding` into a simple persistent vector store, (3) introduce chunking, (4) BM25 + vector hybrid, (5) add grounding/refusal guards before the platform is used for any external-facing answers.

---

*Report generated by QA Agent #78 — static analysis only, no runtime/execution.*
