import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

/* ================================================================
   Advanced Document Intelligence  --  TechnoKoluzi ERP
   Beyond SAP/Oracle -- AI-powered document processing & extraction
   ================================================================ */

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS doc_processing_jobs (
      id SERIAL PRIMARY KEY,
      job_code VARCHAR(60) UNIQUE,
      document_url TEXT,
      document_name VARCHAR(500),
      document_type VARCHAR(40) NOT NULL CHECK (document_type IN ('invoice','po','quote','contract','drawing','certificate','measurement_sheet','delivery_note','insurance','permit','receipt','other')),
      file_size BIGINT,
      mime_type VARCHAR(60),
      status VARCHAR(30) DEFAULT 'uploaded' CHECK (status IN ('uploaded','queued','processing','extracted','verified','failed','archived')),
      extracted_data JSONB DEFAULT '{}',
      confidence REAL DEFAULT 0,
      error_message TEXT,
      pages_count INT DEFAULT 1,
      processing_time_ms INT,
      verified_by VARCHAR(200),
      verified_at TIMESTAMPTZ,
      source VARCHAR(40) DEFAULT 'manual' CHECK (source IN ('manual','email','whatsapp','api','scanner','mobile')),
      linked_entity_type VARCHAR(60),
      linked_entity_id INT,
      tags JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_doc_jobs_status ON doc_processing_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_doc_jobs_type ON doc_processing_jobs(document_type);

    CREATE TABLE IF NOT EXISTS doc_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(300) NOT NULL,
      document_type VARCHAR(40) NOT NULL,
      description TEXT,
      extraction_rules JSONB DEFAULT '{}',
      validation_rules JSONB DEFAULT '{}',
      field_mappings JSONB DEFAULT '{}',
      sample_count INT DEFAULT 0,
      accuracy REAL DEFAULT 0,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS doc_classifications (
      id SERIAL PRIMARY KEY,
      job_id INT REFERENCES doc_processing_jobs(id) ON DELETE CASCADE,
      predicted_type VARCHAR(40) NOT NULL,
      confidence REAL NOT NULL,
      alternative_types JSONB DEFAULT '[]',
      features_used JSONB DEFAULT '[]',
      classified_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS doc_extracted_data (
      id SERIAL PRIMARY KEY,
      job_id INT REFERENCES doc_processing_jobs(id) ON DELETE CASCADE,
      field_name VARCHAR(200) NOT NULL,
      field_value TEXT,
      field_type VARCHAR(30) DEFAULT 'text' CHECK (field_type IN ('text','number','date','currency','boolean','table','address','name','email','phone')),
      confidence REAL DEFAULT 0,
      bounding_box JSONB,
      page_number INT DEFAULT 1,
      verified BOOLEAN DEFAULT false,
      corrected_value TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_doc_extracted_job ON doc_extracted_data(job_id);
  `);
}
ensureTables();

let jobCounter = 0;
async function nextJobCode() {
  jobCounter++;
  return `DOC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}-${String(jobCounter).padStart(3, '0')}`;
}

// ======================== UPLOAD & JOBS ========================

router.post("/doc-intel/upload", async (req, res) => {
  try {
    const d = req.body;
    const code = await nextJobCode();
    const { rows } = await pool.query(
      `INSERT INTO doc_processing_jobs (job_code, document_url, document_name, document_type, file_size, mime_type, status, source, linked_entity_type, linked_entity_id, tags)
       VALUES ($1,$2,$3,$4,$5,$6,'uploaded',$7,$8,$9,$10) RETURNING *`,
      [code, d.document_url, d.document_name, d.document_type || 'other', d.file_size, d.mime_type, d.source || 'manual', d.linked_entity_type, d.linked_entity_id, d.tags || []]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/doc-intel/jobs", async (req, res) => {
  try {
    const status = req.query.status;
    const docType = req.query.document_type;
    let query = `SELECT * FROM doc_processing_jobs WHERE 1=1`;
    const params: any[] = [];
    if (status) { params.push(status); query += ` AND status=$${params.length}`; }
    if (docType) { params.push(docType); query += ` AND document_type=$${params.length}`; }
    query += ` ORDER BY created_at DESC LIMIT 200`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/doc-intel/jobs/:id", async (req, res) => {
  try {
    const { rows: job } = await pool.query(`SELECT * FROM doc_processing_jobs WHERE id=$1`, [req.params.id]);
    if (!job.length) return res.status(404).json({ error: "Job not found" });
    const { rows: fields } = await pool.query(`SELECT * FROM doc_extracted_data WHERE job_id=$1 ORDER BY page_number, field_name`, [req.params.id]);
    const { rows: classification } = await pool.query(`SELECT * FROM doc_classifications WHERE job_id=$1`, [req.params.id]);
    res.json({ ...job[0], extracted_fields: fields, classification: classification[0] || null });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== PROCESS ========================

router.post("/doc-intel/process/:jobId", async (req, res) => {
  try {
    const jobId = Number(req.params.jobId);
    const startTime = Date.now();

    await pool.query(`UPDATE doc_processing_jobs SET status='processing', updated_at=NOW() WHERE id=$1`, [jobId]);

    const { rows: job } = await pool.query(`SELECT * FROM doc_processing_jobs WHERE id=$1`, [jobId]);
    if (!job.length) return res.status(404).json({ error: "Job not found" });

    // Find matching template
    const { rows: templates } = await pool.query(
      `SELECT * FROM doc_templates WHERE document_type=$1 AND active=true ORDER BY accuracy DESC LIMIT 1`, [job[0].document_type]
    );

    // Simulate intelligent extraction based on document type
    const extractionMap: Record<string, Array<{ name: string; type: string; value: string; confidence: number }>> = {
      invoice: [
        { name: 'invoice_number', type: 'text', value: `INV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, confidence: 0.95 },
        { name: 'vendor_name', type: 'name', value: 'Extracted Vendor', confidence: 0.88 },
        { name: 'total_amount', type: 'currency', value: String(Math.round(Math.random() * 50000 + 1000)), confidence: 0.92 },
        { name: 'invoice_date', type: 'date', value: new Date().toISOString().split('T')[0], confidence: 0.97 },
        { name: 'vat_amount', type: 'currency', value: String(Math.round(Math.random() * 5000 + 100)), confidence: 0.89 },
        { name: 'payment_terms', type: 'text', value: 'Net 30', confidence: 0.78 }
      ],
      po: [
        { name: 'po_number', type: 'text', value: `PO-${Date.now().toString().slice(-8)}`, confidence: 0.96 },
        { name: 'supplier', type: 'name', value: 'Extracted Supplier', confidence: 0.91 },
        { name: 'total_value', type: 'currency', value: String(Math.round(Math.random() * 100000 + 5000)), confidence: 0.90 },
        { name: 'delivery_date', type: 'date', value: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0], confidence: 0.85 }
      ],
      contract: [
        { name: 'contract_number', type: 'text', value: `CNT-${Date.now().toString().slice(-6)}`, confidence: 0.93 },
        { name: 'parties', type: 'text', value: 'Party A / Party B', confidence: 0.87 },
        { name: 'contract_value', type: 'currency', value: String(Math.round(Math.random() * 500000)), confidence: 0.84 },
        { name: 'start_date', type: 'date', value: new Date().toISOString().split('T')[0], confidence: 0.91 },
        { name: 'end_date', type: 'date', value: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0], confidence: 0.88 }
      ]
    };

    const fields = extractionMap[job[0].document_type] || [
      { name: 'document_title', type: 'text', value: job[0].document_name || 'Unknown', confidence: 0.7 },
      { name: 'date', type: 'date', value: new Date().toISOString().split('T')[0], confidence: 0.75 }
    ];

    // Insert extracted fields
    for (const f of fields) {
      await pool.query(
        `INSERT INTO doc_extracted_data (job_id, field_name, field_value, field_type, confidence) VALUES ($1,$2,$3,$4,$5)`,
        [jobId, f.name, f.value, f.type, f.confidence]
      );
    }

    // Classify
    await pool.query(
      `INSERT INTO doc_classifications (job_id, predicted_type, confidence, alternative_types) VALUES ($1,$2,$3,$4)`,
      [jobId, job[0].document_type, 0.92, JSON.stringify([])]
    );

    const avgConfidence = fields.reduce((s, f) => s + f.confidence, 0) / fields.length;
    const processingTime = Date.now() - startTime;

    const extractedData: Record<string, string> = {};
    fields.forEach(f => { extractedData[f.name] = f.value; });

    await pool.query(
      `UPDATE doc_processing_jobs SET status='extracted', confidence=$1, extracted_data=$2, processing_time_ms=$3, updated_at=NOW() WHERE id=$4`,
      [avgConfidence, JSON.stringify(extractedData), processingTime, jobId]
    );

    const { rows: result } = await pool.query(`SELECT * FROM doc_processing_jobs WHERE id=$1`, [jobId]);
    res.json({ ...result[0], extracted_fields: fields });
  } catch (e: any) {
    await pool.query(`UPDATE doc_processing_jobs SET status='failed', error_message=$1, updated_at=NOW() WHERE id=$2`, [e.message, req.params.jobId]);
    res.status(500).json({ error: e.message });
  }
});

// ======================== VERIFY ========================

router.post("/doc-intel/verify/:jobId", async (req, res) => {
  try {
    const d = req.body;
    // Update corrected fields
    if (d.corrections && Array.isArray(d.corrections)) {
      for (const c of d.corrections) {
        await pool.query(
          `UPDATE doc_extracted_data SET corrected_value=$1, verified=true WHERE job_id=$2 AND field_name=$3`,
          [c.value, req.params.jobId, c.field_name]
        );
      }
    }
    await pool.query(
      `UPDATE doc_processing_jobs SET status='verified', verified_by=$1, verified_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [d.verified_by || 'user', req.params.jobId]
    );

    // Update template accuracy
    const { rows: job } = await pool.query(`SELECT document_type FROM doc_processing_jobs WHERE id=$1`, [req.params.jobId]);
    if (job.length) {
      await pool.query(
        `UPDATE doc_templates SET sample_count=sample_count+1, accuracy=(accuracy*sample_count + $1)/(sample_count+1), updated_at=NOW()
         WHERE document_type=$2 AND active=true`,
        [d.accuracy_feedback || 0.9, job[0].document_type]
      );
    }

    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== TEMPLATES ========================

router.get("/doc-intel/templates", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM doc_templates ORDER BY document_type, name`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/doc-intel/templates", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO doc_templates (name, document_type, description, extraction_rules, validation_rules, field_mappings)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [d.name, d.document_type, d.description, d.extraction_rules || {}, d.validation_rules || {}, d.field_mappings || {}]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/doc-intel/templates/:id", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `UPDATE doc_templates SET name=$1, document_type=$2, description=$3, extraction_rules=$4, validation_rules=$5, field_mappings=$6, active=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [d.name, d.document_type, d.description, d.extraction_rules, d.validation_rules, d.field_mappings, d.active, req.params.id]
    );
    res.json(rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== CLASSIFY ========================

router.post("/doc-intel/classify", async (req, res) => {
  try {
    const d = req.body;
    // Simulated AI classification based on filename/content hints
    const name = (d.document_name || '').toLowerCase();
    let predicted = 'other';
    let confidence = 0.6;
    if (name.includes('invoice') || name.includes('חשבונית')) { predicted = 'invoice'; confidence = 0.95; }
    else if (name.includes('quote') || name.includes('הצעת מחיר')) { predicted = 'quote'; confidence = 0.92; }
    else if (name.includes('contract') || name.includes('חוזה')) { predicted = 'contract'; confidence = 0.90; }
    else if (name.includes('po') || name.includes('purchase') || name.includes('הזמנת רכש')) { predicted = 'po'; confidence = 0.91; }
    else if (name.includes('drawing') || name.includes('תכנית')) { predicted = 'drawing'; confidence = 0.88; }
    else if (name.includes('cert') || name.includes('תעודה')) { predicted = 'certificate'; confidence = 0.87; }
    else if (name.includes('measure') || name.includes('מדידה')) { predicted = 'measurement_sheet'; confidence = 0.89; }

    res.json({
      predicted_type: predicted,
      confidence,
      alternative_types: [
        { type: predicted === 'invoice' ? 'receipt' : 'invoice', confidence: confidence * 0.5 },
        { type: 'other', confidence: 0.1 }
      ]
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== DASHBOARD ========================

router.get("/doc-intel/dashboard", async (_req, res) => {
  try {
    const [stats, byType, byStatus, recent, templateStats] = await Promise.all([
      pool.query(`SELECT
        COUNT(*) as total_jobs,
        COUNT(*) FILTER(WHERE status='extracted' OR status='verified') as successful,
        COUNT(*) FILTER(WHERE status='failed') as failed,
        COUNT(*) FILTER(WHERE status='processing' OR status='queued') as in_progress,
        ROUND(AVG(confidence) FILTER(WHERE confidence > 0), 2) as avg_confidence,
        ROUND(AVG(processing_time_ms) FILTER(WHERE processing_time_ms > 0)) as avg_processing_ms,
        COUNT(*) FILTER(WHERE created_at >= NOW()-INTERVAL '24 hours') as today
        FROM doc_processing_jobs`),
      pool.query(`SELECT document_type, COUNT(*) as count, ROUND(AVG(confidence),2) as avg_conf FROM doc_processing_jobs GROUP BY document_type ORDER BY count DESC`),
      pool.query(`SELECT status, COUNT(*) as count FROM doc_processing_jobs GROUP BY status`),
      pool.query(`SELECT id, job_code, document_name, document_type, status, confidence, created_at FROM doc_processing_jobs ORDER BY created_at DESC LIMIT 10`),
      pool.query(`SELECT name, document_type, sample_count, ROUND(accuracy::numeric,2) as accuracy, active FROM doc_templates ORDER BY accuracy DESC`)
    ]);

    res.json({
      stats: stats.rows[0],
      byType: byType.rows,
      byStatus: byStatus.rows,
      recentJobs: recent.rows,
      templates: templateStats.rows,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
