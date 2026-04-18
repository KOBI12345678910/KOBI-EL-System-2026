// ============================================================
// Blockchain Supply Chain Traceability - מעקב שרשרת אספקה
// אירועים, שרשראות, תעודות, הוכחות תאימות
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';
import crypto from 'crypto';

const router = Router();

// ============================================================
// אתחול טבלאות
// ============================================================
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS traceability_chains (
      id SERIAL PRIMARY KEY,
      chain_number VARCHAR(100) UNIQUE,
      product_id VARCHAR(255),
      product_name VARCHAR(255),
      serial_number VARCHAR(255),
      origin_supplier VARCHAR(255),
      origin_country VARCHAR(100),
      chain_status VARCHAR(50) DEFAULT 'active' CHECK (chain_status IN ('active','complete','disputed','recalled')),
      integrity_verified BOOLEAN DEFAULT TRUE,
      total_events INTEGER DEFAULT 0,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS traceability_events (
      id SERIAL PRIMARY KEY,
      chain_id INTEGER REFERENCES traceability_chains(id) ON DELETE CASCADE,
      event_type VARCHAR(100) NOT NULL CHECK (event_type IN (
        'sourced','received','processed','tested','shipped','delivered','installed','inspected','certified','recalled'
      )),
      entity_type VARCHAR(255),
      entity_id VARCHAR(255),
      location VARCHAR(500),
      actor VARCHAR(255),
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      data JSONB DEFAULT '{}',
      hash VARCHAR(128),
      prev_hash VARCHAR(128),
      sequence_number INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS material_certificates (
      id SERIAL PRIMARY KEY,
      chain_id INTEGER REFERENCES traceability_chains(id) ON DELETE CASCADE,
      cert_type VARCHAR(100) NOT NULL CHECK (cert_type IN ('material','test','origin','compliance','quality','environmental','safety')),
      issuer VARCHAR(255) NOT NULL,
      cert_number VARCHAR(255),
      issued_date DATE,
      valid_until DATE,
      document_url VARCHAR(500),
      document_name VARCHAR(255),
      verified BOOLEAN DEFAULT FALSE,
      verified_by VARCHAR(255),
      verified_at TIMESTAMPTZ,
      data JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS compliance_proofs (
      id SERIAL PRIMARY KEY,
      chain_id INTEGER REFERENCES traceability_chains(id) ON DELETE CASCADE,
      standard VARCHAR(255) NOT NULL,
      requirement TEXT,
      proof_type VARCHAR(100),
      proof_data JSONB DEFAULT '{}',
      status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','verified','failed','expired')),
      verified_by VARCHAR(255),
      verified_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

ensureTables().catch(err => console.error('[Traceability] Table init error:', err));

// ============================================================
// פונקציות עזר
// ============================================================
function computeHash(data: any, prevHash: string): string {
  const payload = JSON.stringify({ ...data, prev_hash: prevHash });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function generateChainNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM traceability_chains');
  const num = parseInt(rows[0]?.c || '0') + 1;
  return `TRC-${year}-${String(num).padStart(5, '0')}`;
}

// ============================================================
// CRUD - שרשראות
// ============================================================
router.get('/traceability/chains', async (req: Request, res: Response) => {
  try {
    const status = req.query.status;
    let query = `SELECT c.*,
      (SELECT COUNT(*) FROM traceability_events WHERE chain_id = c.id) as event_count,
      (SELECT COUNT(*) FROM material_certificates WHERE chain_id = c.id) as cert_count
      FROM traceability_chains c WHERE 1=1`;
    const params: any[] = [];
    if (status) { params.push(status); query += ` AND c.chain_status = $${params.length}`; }
    query += ' ORDER BY c.created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/traceability/chains', async (req: Request, res: Response) => {
  try {
    const { product_id, product_name, serial_number, origin_supplier, origin_country, metadata } = req.body;
    const chainNumber = await generateChainNumber();
    const { rows } = await pool.query(
      `INSERT INTO traceability_chains (chain_number, product_id, product_name, serial_number, origin_supplier, origin_country, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [chainNumber, product_id, product_name, serial_number, origin_supplier, origin_country, JSON.stringify(metadata || {})]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// הוספת אירוע לשרשרת (Append to chain with hash)
// ============================================================
router.post('/traceability/events', async (req: Request, res: Response) => {
  try {
    const { chain_id, event_type, entity_type, entity_id, location, actor, data: eventData } = req.body;

    // שליפת hash אחרון בשרשרת
    const { rows: lastEvents } = await pool.query(
      'SELECT hash, sequence_number FROM traceability_events WHERE chain_id = $1 ORDER BY sequence_number DESC LIMIT 1',
      [chain_id]
    );
    const prevHash = lastEvents[0]?.hash || '0'.repeat(64);
    const seqNum = (lastEvents[0]?.sequence_number || 0) + 1;

    const eventPayload = { chain_id, event_type, entity_type, entity_id, location, actor, data: eventData, sequence_number: seqNum };
    const hash = computeHash(eventPayload, prevHash);

    const { rows } = await pool.query(
      `INSERT INTO traceability_events (chain_id, event_type, entity_type, entity_id, location, actor, data, hash, prev_hash, sequence_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [chain_id, event_type, entity_type, entity_id, location, actor, JSON.stringify(eventData || {}), hash, prevHash, seqNum]
    );

    // עדכון מונה אירועים בשרשרת
    await pool.query('UPDATE traceability_chains SET total_events = $1, updated_at = NOW() WHERE id = $2', [seqNum, chain_id]);

    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// היסטוריה מלאה של שרשרת
// ============================================================
router.get('/traceability/chain/:chainId', async (req: Request, res: Response) => {
  try {
    const { rows: chain } = await pool.query('SELECT * FROM traceability_chains WHERE id = $1', [req.params.chainId]);
    if (!chain[0]) return res.status(404).json({ error: 'Chain not found' });

    const { rows: events } = await pool.query(
      'SELECT * FROM traceability_events WHERE chain_id = $1 ORDER BY sequence_number ASC',
      [req.params.chainId]
    );
    const { rows: certs } = await pool.query(
      'SELECT * FROM material_certificates WHERE chain_id = $1 ORDER BY created_at',
      [req.params.chainId]
    );
    const { rows: proofs } = await pool.query(
      'SELECT * FROM compliance_proofs WHERE chain_id = $1 ORDER BY created_at',
      [req.params.chainId]
    );

    res.json({ chain: chain[0], events, certificates: certs, compliance_proofs: proofs });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// שליפה לפי מוצר
// ============================================================
router.get('/traceability/product/:productId', async (req: Request, res: Response) => {
  try {
    const { rows: chains } = await pool.query(
      `SELECT c.*, (SELECT COUNT(*) FROM traceability_events WHERE chain_id = c.id) as event_count
       FROM traceability_chains c WHERE c.product_id = $1 ORDER BY c.created_at DESC`,
      [req.params.productId]
    );
    res.json(chains);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// אימות תקינות שרשרת (Integrity verification)
// ============================================================
router.post('/traceability/verify/:chainId', async (req: Request, res: Response) => {
  try {
    const { rows: events } = await pool.query(
      'SELECT * FROM traceability_events WHERE chain_id = $1 ORDER BY sequence_number ASC',
      [req.params.chainId]
    );

    if (events.length === 0) {
      return res.json({ chain_id: req.params.chainId, valid: true, message: 'שרשרת ריקה', events_checked: 0 });
    }

    let valid = true;
    const issues: any[] = [];
    let expectedPrevHash = '0'.repeat(64);

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      // בדיקת prev_hash
      if (event.prev_hash !== expectedPrevHash) {
        valid = false;
        issues.push({
          event_id: event.id,
          sequence: event.sequence_number,
          issue: 'prev_hash mismatch',
          expected: expectedPrevHash,
          actual: event.prev_hash,
        });
      }

      // בדיקת hash עצמי
      const payload = {
        chain_id: event.chain_id,
        event_type: event.event_type,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        location: event.location,
        actor: event.actor,
        data: event.data,
        sequence_number: event.sequence_number,
      };
      const computedHash = computeHash(payload, event.prev_hash);
      if (computedHash !== event.hash) {
        valid = false;
        issues.push({
          event_id: event.id,
          sequence: event.sequence_number,
          issue: 'hash mismatch - possible tampering',
          expected: computedHash,
          actual: event.hash,
        });
      }

      expectedPrevHash = event.hash;
    }

    // עדכון סטטוס integrity
    await pool.query('UPDATE traceability_chains SET integrity_verified = $1 WHERE id = $2', [valid, req.params.chainId]);

    res.json({
      chain_id: parseInt(req.params.chainId),
      valid,
      events_checked: events.length,
      issues,
      verified_at: new Date().toISOString(),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// CRUD - תעודות
// ============================================================
router.get('/traceability/certificates/:chainId', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM material_certificates WHERE chain_id = $1 ORDER BY created_at DESC',
      [req.params.chainId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/traceability/certificates', async (req: Request, res: Response) => {
  try {
    const { chain_id, cert_type, issuer, cert_number, issued_date, valid_until, document_url, document_name, data: certData } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO material_certificates (chain_id, cert_type, issuer, cert_number, issued_date, valid_until, document_url, document_name, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [chain_id, cert_type, issuer, cert_number, issued_date, valid_until, document_url, document_name, JSON.stringify(certData || {})]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/traceability/certificates/:id/verify', async (req: Request, res: Response) => {
  try {
    const { verified_by } = req.body;
    const { rows } = await pool.query(
      `UPDATE material_certificates SET verified = TRUE, verified_by = $1, verified_at = NOW() WHERE id = $2 RETURNING *`,
      [verified_by, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// דשבורד
// ============================================================
router.get('/traceability/dashboard', async (_req: Request, res: Response) => {
  try {
    const chainsQ = pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER(WHERE chain_status='active') as active,
        COUNT(*) FILTER(WHERE chain_status='complete') as complete,
        COUNT(*) FILTER(WHERE chain_status='disputed') as disputed,
        COUNT(*) FILTER(WHERE integrity_verified = FALSE) as integrity_issues
      FROM traceability_chains
    `);
    const eventsQ = pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER(WHERE timestamp >= NOW() - INTERVAL '24 hours') as today,
        COUNT(DISTINCT chain_id) as chains_with_activity
      FROM traceability_events
    `);
    const certsQ = pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER(WHERE verified = TRUE) as verified,
        COUNT(*) FILTER(WHERE valid_until < CURRENT_DATE) as expired,
        COUNT(*) FILTER(WHERE valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as expiring_soon
      FROM material_certificates
    `);
    const recentEventsQ = pool.query(`
      SELECT e.*, c.chain_number, c.product_name
      FROM traceability_events e
      JOIN traceability_chains c ON e.chain_id = c.id
      ORDER BY e.timestamp DESC LIMIT 15
    `);
    const byTypeQ = pool.query(`
      SELECT event_type, COUNT(*) as count FROM traceability_events GROUP BY event_type ORDER BY count DESC
    `);

    const [chains, events, certs, recentEvents, byType] = await Promise.all([
      chainsQ, eventsQ, certsQ, recentEventsQ, byTypeQ
    ]);
    res.json({
      chains: chains.rows[0],
      events: events.rows[0],
      certificates: certs.rows[0],
      recent_events: recentEvents.rows,
      events_by_type: byType.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
