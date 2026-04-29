/**
 * Vendor Score Persistence — AGENT-223 Patch 3
 * ============================================
 *
 * Writes a vendor scoring result to the canonical
 *   procurement.suppliers.performance_score (numeric(9,4))
 * and procurement.suppliers.risk_level (text)
 * columns (verified: supabase/migrations/00000_master_schema.sql:561-562)
 * and appends a snapshot row to procurement.vendor_score_history
 * (created by migration 00092_vendor_score_history.sql).
 *
 * Pure / additive — never mutates the score-result object.
 * Idempotent on repeated as_of (Postgres unique-violation 23505 swallowed).
 *
 * Contract:
 *   persistScore(supabase, supplierId, scoreResult) -> { composite, riskLevel }
 *   riskLevelFor(composite, risks) -> 'low'|'medium'|'high'|'critical'
 *
 * Risk derivation (matches AGENT-183 §6 and Patch 3 spec):
 *   composite < 50  OR any risks[].severity === 'high'  -> 'critical'
 *   composite < 70                                      -> 'high'
 *   composite < 85                                      -> 'medium'
 *   else                                                -> 'low'
 */

'use strict';

/**
 * Persist a vendor score:
 *   - UPDATE procurement.suppliers SET performance_score, risk_level, updated_at
 *   - INSERT INTO procurement.vendor_score_history snapshot row
 *
 * @param {object} supabase                 Supabase client (PostgREST)
 * @param {string|number} supplierId        suppliers.id
 * @param {object} scoreResult              return value of scoreVendor()
 * @returns {Promise<{composite:number, riskLevel:string}>}
 */
async function persistScore(supabase, supplierId, scoreResult) {
  if (!supabase || !supplierId || !scoreResult) {
    throw new Error('persistScore: required args missing');
  }

  const composite = Number(scoreResult.composite) || 0;
  const riskLevel = riskLevelFor(composite, scoreResult.risks);
  const nowIso = new Date().toISOString();

  // 1. Update parent supplier row
  const { error: e1 } = await supabase
    .from('procurement.suppliers')
    .update({
      performance_score: composite,
      risk_level: riskLevel,
      updated_at: nowIso,
    })
    .eq('id', supplierId);

  if (e1) throw e1;

  // 2. Append history snapshot
  const { error: e2 } = await supabase
    .from('procurement.vendor_score_history')
    .insert({
      supplier_id: supplierId,
      composite,
      badge: scoreResult.badge,
      badge_en: scoreResult.badgeEn,
      risk_level: riskLevel,
      dimensions: scoreResult.dimensions,
      risks: scoreResult.risks || [],
      recommendations: scoreResult.recommendations || [],
      samples: scoreResult.samples || 0,
      as_of: scoreResult.asOf || nowIso,
      created_at: nowIso,
    });

  // 23505 = unique-violation on (supplier_id, as_of) -> idempotent: swallow.
  if (e2 && e2.code !== '23505') throw e2;

  return { composite, riskLevel };
}

/**
 * Map composite + risks[] to a 4-bucket risk level used by
 * procurement.suppliers.risk_level (and the Supplier360 header badge).
 *
 * @param {number} composite                 0..100
 * @param {Array<{severity:string}>=} risks  may be undefined
 * @returns {'low'|'medium'|'high'|'critical'}
 */
function riskLevelFor(composite, risks) {
  const list = Array.isArray(risks) ? risks : [];
  if (composite < 50 || list.some((r) => r && r.severity === 'high')) {
    return 'critical';
  }
  if (composite < 70) return 'high';
  if (composite < 85) return 'medium';
  return 'low';
}

module.exports = { persistScore, riskLevelFor };
