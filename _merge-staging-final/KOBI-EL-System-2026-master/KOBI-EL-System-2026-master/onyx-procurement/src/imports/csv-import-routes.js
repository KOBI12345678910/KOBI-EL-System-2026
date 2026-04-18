/**
 * ONYX CSV Import — Express routes
 * ─────────────────────────────────────────────────────────────
 * Agent 67
 *
 * Mount from server.js:
 *
 *     const { registerCsvImportRoutes } = require('./src/imports/csv-import-routes');
 *     registerCsvImportRoutes(app, { supabase, audit });
 *
 * Routes:
 *   POST /api/imports/csv/upload    — body: {content, entity, encoding?, delimiter?}
 *                                       → schema preview + fuzzy column mapping
 *   POST /api/imports/csv/validate  — body: {content, entity, mapping?}
 *                                       → per-row validation errors
 *   POST /api/imports/csv/commit    — body: {content, entity, mapping?, upsert?, onConflict?}
 *                                       → final import (batched, 100/batch)
 *   GET  /api/imports/csv/history   — last N import runs
 *   GET  /api/imports/csv/entities  — list supported entities + field defs
 *
 * Rule: NEVER delete. Commits are insert or upsert only.
 */

'use strict';

const {
  parseCSV,
  autoDetectDelimiter,
  autoDetectEncoding,
  inferSchema,
  mapColumns,
  validateRows,
  importRows,
  importReport,
  TARGET_SCHEMAS,
} = require('./csv-import');

// In-memory history for when no `import_runs` table exists.
// Persisted runs are also written to supabase when available.
const recentRuns = [];
const MAX_RECENT = 50;

function pushRun(entry) {
  recentRuns.unshift(entry);
  while (recentRuns.length > MAX_RECENT) recentRuns.pop();
}

function ensureEntity(entity) {
  if (!entity || !TARGET_SCHEMAS[entity]) {
    const err = new Error(`unknown entity "${entity}". supported: ${Object.keys(TARGET_SCHEMAS).join(', ')}`);
    err.status = 400;
    throw err;
  }
}

/**
 * Normalize the `content` input on a request: accepts either a raw
 * string or an object { data, encoding } where data may be base64.
 */
function normalizeContent(body) {
  if (!body || body.content === undefined) {
    const err = new Error('content is required');
    err.status = 400;
    throw err;
  }
  const { content } = body;
  if (typeof content === 'string') return { content, wasBuffer: false };

  if (content && typeof content === 'object') {
    if (content.base64) {
      const buf = Buffer.from(content.base64, 'base64');
      return { content: buf, wasBuffer: true };
    }
    if (content.data) {
      return { content: String(content.data), wasBuffer: false };
    }
  }
  const err = new Error('invalid content');
  err.status = 400;
  throw err;
}

function registerCsvImportRoutes(app, deps = {}) {
  const supabase = deps.supabase || null;
  const audit = typeof deps.audit === 'function' ? deps.audit : async () => {};

  // ─────────────────────────────────────────────────────────
  //  GET /api/imports/csv/entities
  // ─────────────────────────────────────────────────────────
  app.get('/api/imports/csv/entities', (_req, res) => {
    const out = {};
    for (const [name, schema] of Object.entries(TARGET_SCHEMAS)) {
      out[name] = {
        table: schema.table,
        fields: Object.fromEntries(
          Object.entries(schema.fields).map(([k, v]) => [k, {
            type: v.type,
            required: !!v.required,
            unique: !!v.unique,
            aliases: v.aliases || [],
          }]),
        ),
      };
    }
    res.json({ entities: out });
  });

  // ─────────────────────────────────────────────────────────
  //  POST /api/imports/csv/upload
  //    Returns schema preview + suggested column mapping.
  // ─────────────────────────────────────────────────────────
  app.post('/api/imports/csv/upload', async (req, res) => {
    try {
      const { entity, delimiter, encoding, hasHeaders } = req.body || {};
      ensureEntity(entity);
      const { content } = normalizeContent(req.body);

      const parsed = parseCSV(content, {
        delimiter: delimiter || 'auto',
        encoding: encoding || 'auto',
        hasHeaders: hasHeaders !== false,
      });

      const inferred = inferSchema(parsed.rows.slice(0, 200));
      const mapped = mapColumns(parsed.headers, entity);

      res.json({
        entity,
        parsed: {
          headers: parsed.headers,
          rowCount: parsed.rows.length,
          sample: parsed.rows.slice(0, 10),
          meta: parsed.meta,
        },
        schema: {
          inferredTypes: inferred,
          suggestedMapping: mapped.mapping,
          unmappedHeaders: mapped.unmapped,
          missingRequired: mapped.missingRequired,
          mappingScore: mapped.score,
        },
        targetFields: TARGET_SCHEMAS[entity].fields,
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  //  POST /api/imports/csv/validate
  //    Runs full validation pipeline. No database writes.
  // ─────────────────────────────────────────────────────────
  app.post('/api/imports/csv/validate', async (req, res) => {
    try {
      const { entity, mapping, delimiter, encoding, hasHeaders } = req.body || {};
      ensureEntity(entity);
      const { content } = normalizeContent(req.body);

      const parsed = parseCSV(content, {
        delimiter: delimiter || 'auto',
        encoding: encoding || 'auto',
        hasHeaders: hasHeaders !== false,
      });

      const effectiveMapping = mapping && Object.keys(mapping).length
        ? mapping
        : mapColumns(parsed.headers, entity).mapping;

      const validation = validateRows(parsed.rows, entity, { mapping: effectiveMapping });

      const report = importReport({ entity, validation });
      res.json({
        entity,
        mapping: effectiveMapping,
        validation: {
          summary: validation.summary,
          invalid: validation.invalid.slice(0, 200),
          validPreview: validation.valid.slice(0, 10),
        },
        report,
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  //  POST /api/imports/csv/commit
  //    Inserts/upserts valid rows (batches of 100).
  //    NEVER deletes.
  // ─────────────────────────────────────────────────────────
  app.post('/api/imports/csv/commit', async (req, res) => {
    try {
      const {
        entity, mapping, upsert = false, onConflict = null,
        delimiter, encoding, hasHeaders,
      } = req.body || {};
      ensureEntity(entity);

      if (!supabase) {
        return res.status(503).json({ error: 'supabase client not configured' });
      }

      const { content } = normalizeContent(req.body);

      const parsed = parseCSV(content, {
        delimiter: delimiter || 'auto',
        encoding: encoding || 'auto',
        hasHeaders: hasHeaders !== false,
      });

      const effectiveMapping = mapping && Object.keys(mapping).length
        ? mapping
        : mapColumns(parsed.headers, entity).mapping;

      const validation = validateRows(parsed.rows, entity, { mapping: effectiveMapping });

      // Refuse to commit if nothing is valid. This prevents accidental
      // "no-op" runs that still show up in history.
      if (validation.valid.length === 0) {
        const report = importReport({ entity, validation });
        return res.status(422).json({
          error: 'no valid rows to import',
          report,
        });
      }

      const tableName = TARGET_SCHEMAS[entity].table;
      const imp = await importRows(validation.valid, {
        tableName,
        supabase,
        upsert,
        onConflict,
      });

      const report = importReport({ entity, validation, imported: imp });

      const runRecord = {
        id: `run-${Date.now()}`,
        entity,
        table: tableName,
        actor: req.actor || (req.headers['x-actor']) || 'api',
        started_at: imp.startedAt,
        finished_at: imp.finishedAt,
        total_rows: parsed.rows.length,
        valid_rows: validation.valid.length,
        invalid_rows: validation.invalid.length,
        inserted: imp.inserted,
        failed: imp.failed,
        upsert,
        on_conflict: onConflict,
      };

      pushRun(runRecord);

      // Best-effort persistence to `import_runs` if the table exists.
      try {
        if (supabase && supabase.from) {
          await supabase.from('import_runs').insert(runRecord);
        }
      } catch { /* non-fatal */ }

      try {
        await audit('csv_import', runRecord.id, 'imported', runRecord.actor,
          `CSV import → ${entity}: ${imp.inserted} inserted, ${validation.invalid.length} rejected`,
          null, runRecord);
      } catch { /* non-fatal */ }

      res.json({ run: runRecord, report });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  //  GET /api/imports/csv/history
  // ─────────────────────────────────────────────────────────
  app.get('/api/imports/csv/history', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 200);

    // Prefer DB if available
    try {
      if (supabase && supabase.from) {
        const { data, error } = await supabase
          .from('import_runs')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(limit);
        if (!error && data) return res.json({ source: 'db', runs: data });
      }
    } catch { /* fall through */ }

    res.json({ source: 'memory', runs: recentRuns.slice(0, limit) });
  });
}

module.exports = {
  registerCsvImportRoutes,
  _test: { recentRuns, pushRun },
};
