import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kg_nodes (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(100) NOT NULL,
      entity_id VARCHAR(200),
      label VARCHAR(500) NOT NULL,
      properties JSONB DEFAULT '{}',
      embedding_vector TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS kg_edges (
      id SERIAL PRIMARY KEY,
      source_node_id INTEGER NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
      target_node_id INTEGER NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
      relation_type VARCHAR(200) NOT NULL,
      weight REAL DEFAULT 1.0,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS kg_queries_log (
      id SERIAL PRIMARY KEY,
      query_text TEXT,
      query_type VARCHAR(50) DEFAULT 'search',
      results_count INTEGER DEFAULT 0,
      execution_time_ms INTEGER DEFAULT 0,
      user_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_kg_nodes_entity_type ON kg_nodes(entity_type);
    CREATE INDEX IF NOT EXISTS idx_kg_nodes_entity_id ON kg_nodes(entity_id);
    CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON kg_edges(source_node_id);
    CREATE INDEX IF NOT EXISTS idx_kg_edges_target ON kg_edges(target_node_id);
    CREATE INDEX IF NOT EXISTS idx_kg_edges_relation ON kg_edges(relation_type);
    CREATE INDEX IF NOT EXISTS idx_kg_nodes_label_trgm ON kg_nodes USING gin(label gin_trgm_ops);
  `).catch(() => {
    // trgm index may fail if extension not enabled, that's ok
    pool.query(`
      CREATE INDEX IF NOT EXISTS idx_kg_nodes_entity_type ON kg_nodes(entity_type);
      CREATE INDEX IF NOT EXISTS idx_kg_nodes_entity_id ON kg_nodes(entity_id);
      CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON kg_edges(source_node_id);
      CREATE INDEX IF NOT EXISTS idx_kg_edges_target ON kg_edges(target_node_id);
      CREATE INDEX IF NOT EXISTS idx_kg_edges_relation ON kg_edges(relation_type);
    `).catch(() => {});
  });
}
ensureTables();

// ── Create node ──
router.post("/knowledge-graph/nodes", async (req, res) => {
  try {
    const { entity_type, entity_id, label, properties, embedding_vector } = req.body;
    if (!entity_type || !label) {
      return res.status(400).json({ error: "entity_type ו-label נדרשים" });
    }
    const result = await pool.query(
      `INSERT INTO kg_nodes (entity_type, entity_id, label, properties, embedding_vector)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [entity_type, entity_id || null, label, JSON.stringify(properties || {}), embedding_vector || null]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── List nodes by type ──
router.get("/knowledge-graph/nodes", async (req, res) => {
  try {
    const { type, limit = "100", offset = "0" } = req.query;
    let query = `SELECT * FROM kg_nodes`;
    const params: any[] = [];
    if (type) {
      params.push(type);
      query += ` WHERE entity_type = $1`;
    }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), Number(offset));
    const result = await pool.query(query, params);
    const countQ = type
      ? await pool.query(`SELECT COUNT(*) FROM kg_nodes WHERE entity_type = $1`, [type])
      : await pool.query(`SELECT COUNT(*) FROM kg_nodes`);
    res.json({ nodes: result.rows, total: Number(countQ.rows[0].count) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Create edge ──
router.post("/knowledge-graph/edges", async (req, res) => {
  try {
    const { source_node_id, target_node_id, relation_type, weight, metadata } = req.body;
    if (!source_node_id || !target_node_id || !relation_type) {
      return res.status(400).json({ error: "source_node_id, target_node_id ו-relation_type נדרשים" });
    }
    const result = await pool.query(
      `INSERT INTO kg_edges (source_node_id, target_node_id, relation_type, weight, metadata)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [source_node_id, target_node_id, relation_type, weight ?? 1.0, JSON.stringify(metadata || {})]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── BFS traversal ──
router.get("/knowledge-graph/traverse/:nodeId", async (req, res) => {
  try {
    const nodeId = Number(req.params.nodeId);
    const depth = Math.min(Number(req.query.depth) || 2, 5);
    const startMs = Date.now();

    const result = await pool.query(
      `WITH RECURSIVE graph_walk AS (
        SELECT n.id, n.entity_type, n.label, n.properties, 0 as depth,
               ARRAY[n.id] as path
        FROM kg_nodes n WHERE n.id = $1
        UNION ALL
        SELECT n2.id, n2.entity_type, n2.label, n2.properties, gw.depth + 1,
               gw.path || n2.id
        FROM graph_walk gw
        JOIN kg_edges e ON (e.source_node_id = gw.id OR e.target_node_id = gw.id)
        JOIN kg_nodes n2 ON n2.id = CASE WHEN e.source_node_id = gw.id THEN e.target_node_id ELSE e.source_node_id END
        WHERE gw.depth < $2
          AND NOT (n2.id = ANY(gw.path))
      )
      SELECT DISTINCT ON (id) id, entity_type, label, properties, depth
      FROM graph_walk
      ORDER BY id, depth ASC`,
      [nodeId, depth]
    );

    const edges = await pool.query(
      `SELECT e.* FROM kg_edges e
       WHERE e.source_node_id = ANY($1::int[]) OR e.target_node_id = ANY($1::int[])`,
      [result.rows.map(r => r.id)]
    );

    const execMs = Date.now() - startMs;
    await pool.query(
      `INSERT INTO kg_queries_log (query_text, query_type, results_count, execution_time_ms) VALUES ($1, $2, $3, $4)`,
      [`traverse:${nodeId}:depth=${depth}`, "traverse", result.rows.length, execMs]
    ).catch(() => {});

    res.json({ nodes: result.rows, edges: edges.rows, depth, execution_time_ms: execMs });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Fuzzy search ──
router.get("/knowledge-graph/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "נדרש פרמטר q" });
    const startMs = Date.now();

    const result = await pool.query(
      `SELECT *,
        CASE
          WHEN label ILIKE $1 THEN 100
          WHEN label ILIKE $2 THEN 80
          WHEN entity_type ILIKE $2 THEN 60
          WHEN entity_id ILIKE $2 THEN 50
          ELSE 30
        END as relevance_score
       FROM kg_nodes
       WHERE label ILIKE $2
          OR entity_type ILIKE $2
          OR entity_id ILIKE $2
          OR properties::text ILIKE $2
       ORDER BY relevance_score DESC, created_at DESC
       LIMIT 50`,
      [q, `%${q}%`]
    );

    const execMs = Date.now() - startMs;
    await pool.query(
      `INSERT INTO kg_queries_log (query_text, query_type, results_count, execution_time_ms) VALUES ($1, $2, $3, $4)`,
      [q, "search", result.rows.length, execMs]
    ).catch(() => {});

    res.json({ results: result.rows, total: result.rows.length, query: q, execution_time_ms: execMs });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Auto-build from entity records ──
router.post("/knowledge-graph/build-from-entity", async (req, res) => {
  try {
    const { entity_type, source_table, id_field = "id", label_field = "name", relation_field, relation_type = "related_to" } = req.body;
    if (!entity_type || !source_table) {
      return res.status(400).json({ error: "entity_type ו-source_table נדרשים" });
    }

    // Build nodes from source table
    const records = await pool.query(
      `SELECT * FROM ${source_table} LIMIT 500`
    ).catch(() => ({ rows: [] }));

    let nodesCreated = 0;
    let edgesCreated = 0;

    for (const rec of records.rows) {
      const label = rec[label_field] || rec[id_field] || `${entity_type}_${rec.id}`;
      const nodeResult = await pool.query(
        `INSERT INTO kg_nodes (entity_type, entity_id, label, properties)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING RETURNING id`,
        [entity_type, String(rec[id_field] || rec.id), String(label), JSON.stringify(rec)]
      );
      if (nodeResult.rows.length > 0) nodesCreated++;

      // Build edges if relation field exists
      if (relation_field && rec[relation_field]) {
        const targetNode = await pool.query(
          `SELECT id FROM kg_nodes WHERE entity_id = $1 LIMIT 1`,
          [String(rec[relation_field])]
        );
        if (targetNode.rows.length > 0 && nodeResult.rows.length > 0) {
          await pool.query(
            `INSERT INTO kg_edges (source_node_id, target_node_id, relation_type)
             VALUES ($1, $2, $3)`,
            [nodeResult.rows[0].id, targetNode.rows[0].id, relation_type]
          );
          edgesCreated++;
        }
      }
    }

    res.json({ success: true, nodes_created: nodesCreated, edges_created: edgesCreated, source_records: records.rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard stats ──
router.get("/knowledge-graph/dashboard", async (req, res) => {
  try {
    const [nodeCount, edgeCount, entityTypes, recentQueries, topRelations, recentNodes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM kg_nodes`),
      pool.query(`SELECT COUNT(*) FROM kg_edges`),
      pool.query(`SELECT entity_type, COUNT(*) as count FROM kg_nodes GROUP BY entity_type ORDER BY count DESC LIMIT 20`),
      pool.query(`SELECT * FROM kg_queries_log ORDER BY created_at DESC LIMIT 20`),
      pool.query(`SELECT relation_type, COUNT(*) as count FROM kg_edges GROUP BY relation_type ORDER BY count DESC LIMIT 10`),
      pool.query(`SELECT id, entity_type, label, created_at FROM kg_nodes ORDER BY created_at DESC LIMIT 10`),
    ]);

    res.json({
      total_nodes: Number(nodeCount.rows[0].count),
      total_edges: Number(edgeCount.rows[0].count),
      entity_types: entityTypes.rows,
      recent_queries: recentQueries.rows,
      top_relations: topRelations.rows,
      recent_nodes: recentNodes.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
