/**
 * TechnoKoluzi ERP - Vector Search & RAG API Routes
 * נתיבי API לחיפוש סמנטי ו-RAG
 */

import { Router } from "express";
import {
  semanticSearch,
  hybridSearch,
  buildRAGContext,
  upsertEmbedding,
  deleteEmbedding,
  indexERPData,
  indexTable,
  getVectorStoreStats,
  ensureEmbeddingsTable,
} from "../lib/vector-store";

const router = Router();

// ============== חיפוש סמנטי ==============

/**
 * POST /api/vector/search
 * חיפוש סמנטי על כל המידע ב-ERP
 */
router.post("/search", async (req, res, next) => {
  try {
    const { query, topK, threshold, contentTypes, sourceTables, metadataFilter } = req.body;
    if (!query) return res.status(400).json({ error: "query נדרש" });

    const results = await semanticSearch(query, {
      topK: topK || 10,
      threshold: threshold || 0.65,
      contentTypes,
      sourceTables,
      metadataFilter,
    });

    res.json({ query, count: results.length, results });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/vector/hybrid-search
 * חיפוש היברידי: וקטורי + טקסט מלא
 */
router.post("/hybrid-search", async (req, res, next) => {
  try {
    const { query, topK, vectorWeight, contentTypes, sourceTables } = req.body;
    if (!query) return res.status(400).json({ error: "query נדרש" });

    const results = await hybridSearch(query, {
      topK: topK || 10,
      vectorWeight: vectorWeight || 0.7,
      contentTypes,
      sourceTables,
    });

    res.json({ query, count: results.length, results });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/vector/rag
 * RAG - בניית הקשר מועשר לשאילתת AI
 */
router.post("/rag", async (req, res, next) => {
  try {
    const { query, topK, contentTypes, sourceTables, maxContextLength } = req.body;
    if (!query) return res.status(400).json({ error: "query נדרש" });

    const context = await buildRAGContext(query, {
      topK: topK || 8,
      contentTypes,
      sourceTables,
      maxContextLength: maxContextLength || 6000,
    });

    res.json({
      query: context.query,
      resultsCount: context.results.length,
      augmentedPrompt: context.augmentedPrompt,
      sources: context.results.map(r => ({
        table: r.source_table,
        id: r.source_id,
        type: r.content_type,
        similarity: r.similarity,
        preview: r.content_text.slice(0, 200),
      })),
    });
  } catch (e) {
    next(e);
  }
});

// ============== אינדוקס ==============

/**
 * POST /api/vector/index
 * אינדוקס כל נתוני ה-ERP
 */
router.post("/index", async (req, res, next) => {
  try {
    const results = await indexERPData();
    const total = Object.values(results).reduce((sum, r) => sum + r.indexed, 0);
    res.json({ message: `✅ אונדקסו ${total} רשומות`, details: results });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/vector/index-table
 * אינדוקס טבלה ספציפית
 */
router.post("/index-table", async (req, res, next) => {
  try {
    const { tableName, contentField, idField, contentType, metadataFields, limit } = req.body;
    if (!tableName) return res.status(400).json({ error: "tableName נדרש" });

    const result = await indexTable(tableName, {
      contentField: contentField || "name",
      idField: idField || "id",
      contentType: contentType || "record",
      metadataFields: metadataFields || [],
      limit: limit || 10000,
    });

    res.json({ tableName, ...result });
  } catch (e) {
    next(e);
  }
});

// ============== CRUD ==============

/**
 * POST /api/vector/embed
 * הוספת/עדכון embedding ידני
 */
router.post("/embed", async (req, res, next) => {
  try {
    const { sourceTable, sourceId, contentText, contentType, metadata } = req.body;
    if (!sourceTable || !sourceId || !contentText) {
      return res.status(400).json({ error: "sourceTable, sourceId, contentText נדרשים" });
    }

    const result = await upsertEmbedding(sourceTable, sourceId, contentText, contentType || "record", metadata || {});
    res.json({ ...result, message: result.isNew ? "נוצר embedding חדש" : "עודכן embedding קיים" });
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /api/vector/embed/:table/:id
 * מחיקת embedding
 */
router.delete("/embed/:table/:id", async (req, res, next) => {
  try {
    const deleted = await deleteEmbedding(req.params.table, req.params.id);
    res.json({ deleted });
  } catch (e) {
    next(e);
  }
});

// ============== סטטיסטיקות ==============

/**
 * GET /api/vector/stats
 * סטטיסטיקות Vector Store
 */
router.get("/stats", async (_req, res, next) => {
  try {
    const stats = await getVectorStoreStats();
    res.json(stats);
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/vector/init
 * אתחול ה-Vector Store (יצירת טבלאות ואינדקסים)
 */
router.post("/init", async (_req, res, next) => {
  try {
    await ensureEmbeddingsTable();
    res.json({ message: "✅ Vector Store מאותחל בהצלחה" });
  } catch (e) {
    next(e);
  }
});

export default router;
