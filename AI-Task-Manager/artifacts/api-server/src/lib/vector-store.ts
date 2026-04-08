/**
 * TechnoKoluzi ERP - Vector Store & RAG Engine
 * מנוע חיפוש סמנטי מבוסס pgvector עם RAG (Retrieval Augmented Generation)
 *
 * Features:
 * - pgvector extension for PostgreSQL vector similarity search
 * - Automatic embedding generation via AI provider
 * - Semantic search across all ERP records, documents, chat history
 * - Auto-index new records on INSERT
 * - Hybrid search: vector similarity + full-text + metadata filters
 * - RAG pipeline: query → retrieve → augment → generate
 */

import { pool } from "@workspace/db";

// ============== Types ==============

export interface EmbeddingRecord {
  id: number;
  source_table: string;
  source_id: string;
  content_text: string;
  content_type: "record" | "document" | "chat" | "note" | "comment" | "email" | "knowledge";
  metadata: Record<string, any>;
  embedding: number[];
  created_at: string;
  updated_at: string;
}

export interface SemanticSearchResult {
  id: number;
  source_table: string;
  source_id: string;
  content_text: string;
  content_type: string;
  metadata: Record<string, any>;
  similarity: number;
}

export interface RAGContext {
  query: string;
  results: SemanticSearchResult[];
  augmentedPrompt: string;
}

// ============== Configuration ==============

const EMBEDDING_DIMENSION = 1536; // OpenAI ada-002 / compatible
const MAX_CONTENT_LENGTH = 8000;
const DEFAULT_TOP_K = 10;
const SIMILARITY_THRESHOLD = 0.65;

// In-memory embedding cache (LRU)
const embeddingCache = new Map<string, { embedding: number[]; ts: number }>();
const CACHE_MAX = 500;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ============== Schema Setup ==============

export async function ensureVectorExtension(): Promise<void> {
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    console.log("[VectorStore] pgvector extension ready");
  } catch (e: any) {
    console.warn("[VectorStore] pgvector extension not available, using cosine fallback:", e.message);
  }
}

export async function ensureEmbeddingsTable(): Promise<void> {
  await ensureVectorExtension();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS embeddings (
      id SERIAL PRIMARY KEY,
      source_table VARCHAR(200) NOT NULL,
      source_id VARCHAR(200) NOT NULL,
      content_text TEXT NOT NULL,
      content_type VARCHAR(50) NOT NULL DEFAULT 'record',
      metadata JSONB DEFAULT '{}',
      embedding vector(${EMBEDDING_DIMENSION}),
      tokens_used INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(source_table, source_id)
    )
  `);

  // Indexes for fast search
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_embeddings_source
    ON embeddings(source_table, source_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_embeddings_type
    ON embeddings(content_type)
  `);

  // IVFFlat index for vector similarity search (faster for large datasets)
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_vector
      ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    `);
  } catch {
    // If not enough rows for IVFFlat, create HNSW index instead
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_embeddings_vector_hnsw
        ON embeddings USING hnsw (embedding vector_cosine_ops)
      `);
    } catch {
      console.warn("[VectorStore] Vector index creation deferred (need more data)");
    }
  }

  // Full-text search index
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_embeddings_fts
    ON embeddings USING gin(to_tsvector('simple', content_text))
  `);

  console.log("[VectorStore] Embeddings table ready");
}

// ============== Embedding Generation ==============

/**
 * Generate embedding vector for text content.
 * Uses Anthropic's model or falls back to a lightweight local approach.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const truncated = text.slice(0, MAX_CONTENT_LENGTH);

  // Check cache
  const cacheKey = truncated.slice(0, 200);
  const cached = embeddingCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.embedding;
  }

  let embedding: number[];

  // Try OpenAI-compatible embedding API if available
  const embeddingApiKey = process.env.OPENAI_API_KEY || process.env.EMBEDDING_API_KEY;
  const embeddingBaseUrl = process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1";

  if (embeddingApiKey) {
    try {
      const res = await fetch(`${embeddingBaseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${embeddingApiKey}`,
        },
        body: JSON.stringify({
          model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
          input: truncated,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        embedding = data.data[0].embedding;
      } else {
        embedding = localHashEmbedding(truncated);
      }
    } catch {
      embedding = localHashEmbedding(truncated);
    }
  } else {
    // Fallback: local hash-based embedding (deterministic, not semantic but functional)
    embedding = localHashEmbedding(truncated);
  }

  // Update cache
  if (embeddingCache.size >= CACHE_MAX) {
    const oldest = [...embeddingCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) embeddingCache.delete(oldest[0]);
  }
  embeddingCache.set(cacheKey, { embedding, ts: Date.now() });

  return embedding;
}

/**
 * Local hash-based embedding fallback.
 * Not semantic, but provides deterministic vectors for similarity comparison.
 * Useful when no embedding API is available.
 */
function localHashEmbedding(text: string): number[] {
  const vec = new Float32Array(EMBEDDING_DIMENSION);
  const words = text.toLowerCase().split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash + word.charCodeAt(j)) | 0;
    }
    // Distribute word hash across vector dimensions
    for (let d = 0; d < EMBEDDING_DIMENSION; d++) {
      const seed = hash ^ (d * 2654435761);
      vec[d] += Math.sin(seed * 0.0001) * (1 / Math.sqrt(words.length));
    }
  }

  // Normalize to unit vector
  let norm = 0;
  for (let d = 0; d < EMBEDDING_DIMENSION; d++) norm += vec[d] * vec[d];
  norm = Math.sqrt(norm) || 1;
  const result: number[] = [];
  for (let d = 0; d < EMBEDDING_DIMENSION; d++) result.push(vec[d] / norm);

  return result;
}

// ============== CRUD Operations ==============

/**
 * Upsert an embedding record - auto-generates embedding from content.
 */
export async function upsertEmbedding(
  sourceTable: string,
  sourceId: string,
  contentText: string,
  contentType: EmbeddingRecord["content_type"] = "record",
  metadata: Record<string, any> = {}
): Promise<{ id: number; isNew: boolean }> {
  await ensureEmbeddingsTable();

  const embedding = await generateEmbedding(contentText);
  const vecStr = `[${embedding.join(",")}]`;

  const res = await pool.query(
    `INSERT INTO embeddings (source_table, source_id, content_text, content_type, metadata, embedding, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::vector, NOW())
     ON CONFLICT (source_table, source_id) DO UPDATE SET
       content_text = EXCLUDED.content_text,
       content_type = EXCLUDED.content_type,
       metadata = EXCLUDED.metadata,
       embedding = EXCLUDED.embedding,
       updated_at = NOW()
     RETURNING id, (xmax = 0) AS is_new`,
    [sourceTable, sourceId, contentText.slice(0, MAX_CONTENT_LENGTH), contentType, JSON.stringify(metadata), vecStr]
  );

  return { id: res.rows[0].id, isNew: res.rows[0].is_new };
}

/**
 * Delete embedding for a specific record.
 */
export async function deleteEmbedding(sourceTable: string, sourceId: string): Promise<boolean> {
  const res = await pool.query(
    "DELETE FROM embeddings WHERE source_table = $1 AND source_id = $2",
    [sourceTable, sourceId]
  );
  return (res.rowCount ?? 0) > 0;
}

// ============== Search ==============

/**
 * Semantic vector search - find most similar content.
 */
export async function semanticSearch(
  query: string,
  options: {
    topK?: number;
    threshold?: number;
    contentTypes?: string[];
    sourceTables?: string[];
    metadataFilter?: Record<string, any>;
  } = {}
): Promise<SemanticSearchResult[]> {
  await ensureEmbeddingsTable();

  const {
    topK = DEFAULT_TOP_K,
    threshold = SIMILARITY_THRESHOLD,
    contentTypes,
    sourceTables,
    metadataFilter,
  } = options;

  const queryEmbedding = await generateEmbedding(query);
  const vecStr = `[${queryEmbedding.join(",")}]`;

  let sql = `
    SELECT id, source_table, source_id, content_text, content_type, metadata,
           1 - (embedding <=> $1::vector) AS similarity
    FROM embeddings
    WHERE 1 - (embedding <=> $1::vector) >= $2
  `;
  const params: any[] = [vecStr, threshold];
  let paramIdx = 3;

  if (contentTypes?.length) {
    sql += ` AND content_type = ANY($${paramIdx})`;
    params.push(contentTypes);
    paramIdx++;
  }

  if (sourceTables?.length) {
    sql += ` AND source_table = ANY($${paramIdx})`;
    params.push(sourceTables);
    paramIdx++;
  }

  if (metadataFilter) {
    sql += ` AND metadata @> $${paramIdx}::jsonb`;
    params.push(JSON.stringify(metadataFilter));
    paramIdx++;
  }

  sql += ` ORDER BY similarity DESC LIMIT $${paramIdx}`;
  params.push(topK);

  const res = await pool.query(sql, params);

  return res.rows.map((r: any) => ({
    id: r.id,
    source_table: r.source_table,
    source_id: r.source_id,
    content_text: r.content_text,
    content_type: r.content_type,
    metadata: r.metadata,
    similarity: parseFloat(r.similarity),
  }));
}

/**
 * Hybrid search: combines vector similarity with full-text search.
 */
export async function hybridSearch(
  query: string,
  options: {
    topK?: number;
    vectorWeight?: number;  // 0-1, weight for vector vs text search
    contentTypes?: string[];
    sourceTables?: string[];
  } = {}
): Promise<SemanticSearchResult[]> {
  await ensureEmbeddingsTable();

  const { topK = DEFAULT_TOP_K, vectorWeight = 0.7, contentTypes, sourceTables } = options;
  const textWeight = 1 - vectorWeight;

  const queryEmbedding = await generateEmbedding(query);
  const vecStr = `[${queryEmbedding.join(",")}]`;

  let sql = `
    SELECT id, source_table, source_id, content_text, content_type, metadata,
           (
             $3 * (1 - (embedding <=> $1::vector)) +
             $4 * COALESCE(ts_rank(to_tsvector('simple', content_text), plainto_tsquery('simple', $2)), 0)
           ) AS similarity
    FROM embeddings
    WHERE (
      1 - (embedding <=> $1::vector) >= 0.4
      OR to_tsvector('simple', content_text) @@ plainto_tsquery('simple', $2)
    )
  `;
  const params: any[] = [vecStr, query, vectorWeight, textWeight];
  let paramIdx = 5;

  if (contentTypes?.length) {
    sql += ` AND content_type = ANY($${paramIdx})`;
    params.push(contentTypes);
    paramIdx++;
  }

  if (sourceTables?.length) {
    sql += ` AND source_table = ANY($${paramIdx})`;
    params.push(sourceTables);
    paramIdx++;
  }

  sql += ` ORDER BY similarity DESC LIMIT $${paramIdx}`;
  params.push(topK);

  const res = await pool.query(sql, params);

  return res.rows.map((r: any) => ({
    id: r.id,
    source_table: r.source_table,
    source_id: r.source_id,
    content_text: r.content_text,
    content_type: r.content_type,
    metadata: r.metadata,
    similarity: parseFloat(r.similarity),
  }));
}

// ============== RAG Pipeline ==============

/**
 * RAG (Retrieval Augmented Generation) - build context-enriched prompt.
 */
export async function buildRAGContext(
  query: string,
  options: {
    topK?: number;
    contentTypes?: string[];
    sourceTables?: string[];
    maxContextLength?: number;
  } = {}
): Promise<RAGContext> {
  const { topK = 8, maxContextLength = 6000 } = options;

  const results = await hybridSearch(query, { topK, ...options });

  // Build augmented context from results
  let contextParts: string[] = [];
  let totalLength = 0;

  for (const result of results) {
    const part = `[${result.content_type}] ${result.source_table}#${result.source_id} (דמיון: ${(result.similarity * 100).toFixed(0)}%):\n${result.content_text}`;
    if (totalLength + part.length > maxContextLength) break;
    contextParts.push(part);
    totalLength += part.length;
  }

  const augmentedPrompt = contextParts.length > 0
    ? `הנה מידע רלוונטי מהמערכת שנמצא עבור השאילתה "${query}":\n\n${contextParts.join("\n\n---\n\n")}\n\n---\nבהתבסס על המידע הזה, ענה על השאלה: ${query}`
    : query;

  return { query, results, augmentedPrompt };
}

// ============== Batch Operations ==============

/**
 * Index all records from a specific table.
 */
export async function indexTable(
  tableName: string,
  options: {
    contentField?: string;
    idField?: string;
    contentType?: EmbeddingRecord["content_type"];
    metadataFields?: string[];
    batchSize?: number;
    limit?: number;
  } = {}
): Promise<{ indexed: number; errors: number }> {
  const {
    contentField = "name",
    idField = "id",
    contentType = "record",
    metadataFields = [],
    batchSize = 50,
    limit = 10000,
  } = options;

  let indexed = 0;
  let errors = 0;
  let offset = 0;

  while (offset < limit) {
    const metaSelect = metadataFields.length > 0
      ? `, ${metadataFields.map(f => `"${f}"`).join(", ")}`
      : "";

    const res = await pool.query(
      `SELECT "${idField}", "${contentField}"${metaSelect} FROM "${tableName}"
       ORDER BY "${idField}" LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    );

    if (res.rows.length === 0) break;

    for (const row of res.rows) {
      try {
        const content = String(row[contentField] || "");
        if (content.length < 3) continue;

        const metadata: Record<string, any> = {};
        for (const f of metadataFields) {
          metadata[f] = row[f];
        }

        await upsertEmbedding(tableName, String(row[idField]), content, contentType, metadata);
        indexed++;
      } catch (e: any) {
        errors++;
        console.warn(`[VectorStore] Error indexing ${tableName}#${row[idField]}: ${e.message}`);
      }
    }

    offset += batchSize;
  }

  return { indexed, errors };
}

/**
 * Index key ERP tables for RAG.
 */
export async function indexERPData(): Promise<Record<string, { indexed: number; errors: number }>> {
  const results: Record<string, { indexed: number; errors: number }> = {};

  const tables = [
    { name: "customers", contentField: "name", metadataFields: ["phone", "email", "city"] },
    { name: "suppliers", contentField: "name", metadataFields: ["phone", "email", "category"] },
    { name: "raw_materials", contentField: "name", metadataFields: ["category", "unit", "unit_price"] },
    { name: "products", contentField: "name", metadataFields: ["category", "type", "price"] },
    { name: "customer_invoices", contentField: "notes", metadataFields: ["invoice_number", "total", "status"] },
    { name: "sales_orders", contentField: "notes", metadataFields: ["order_number", "total", "status"] },
    { name: "purchase_orders", contentField: "notes", metadataFields: ["po_number", "total", "status"] },
    { name: "work_orders", contentField: "notes", metadataFields: ["wo_number", "status", "product_name"] },
    { name: "employees", contentField: "full_name", metadataFields: ["department", "position", "email"] },
    { name: "projects", contentField: "name", metadataFields: ["status", "budget", "manager"] },
  ];

  for (const table of tables) {
    try {
      results[table.name] = await indexTable(table.name, {
        contentField: table.contentField,
        contentType: "record",
        metadataFields: table.metadataFields,
      });
    } catch (e: any) {
      results[table.name] = { indexed: 0, errors: 1 };
      console.warn(`[VectorStore] Skipped table ${table.name}: ${e.message}`);
    }
  }

  return results;
}

// ============== Statistics ==============

export async function getVectorStoreStats(): Promise<{
  totalEmbeddings: number;
  byType: Record<string, number>;
  byTable: Record<string, number>;
  cacheSize: number;
}> {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM embeddings");
    const byType = await pool.query("SELECT content_type, COUNT(*) as cnt FROM embeddings GROUP BY content_type");
    const byTable = await pool.query("SELECT source_table, COUNT(*) as cnt FROM embeddings GROUP BY source_table ORDER BY cnt DESC LIMIT 20");

    return {
      totalEmbeddings: parseInt(total.rows[0].count),
      byType: Object.fromEntries(byType.rows.map((r: any) => [r.content_type, parseInt(r.cnt)])),
      byTable: Object.fromEntries(byTable.rows.map((r: any) => [r.source_table, parseInt(r.cnt)])),
      cacheSize: embeddingCache.size,
    };
  } catch {
    return { totalEmbeddings: 0, byType: {}, byTable: {}, cacheSize: embeddingCache.size };
  }
}
