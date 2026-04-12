/**
 * NCR Tracker — Non-Conformance Report Tracker
 * =============================================
 * מעקב אחר דוחות אי-התאמה (NCR) — מערכת איכות למפעל מתכת Techno-Kol Uzi
 *
 * Agent Y-037  |  Swarm Quality  |  Techno-Kol Uzi Mega-ERP  |  Wave 2026
 *
 * A zero-dependency, in-memory, auditable NCR tracker that covers the full
 * non-conformance lifecycle on the shop floor of a metal fabrication plant:
 *
 *   1. Detection      → createNCR()
 *   2. Triage         → defect severity (minor / major / critical)
 *   3. MRB decision   → disposition() — use-as-is / rework / RTS / scrap / downgrade
 *   4. Root cause     → rootCauseAnalysis() — 5-why / fishbone / FMEA
 *   5. CAPA link      → linkToCAPA() — integrates with Y-038 (CAPA engine)
 *   6. Cost rollup    → costOfPoorQuality()
 *   7. Trend analysis → trendAnalysis() — Pareto by supplier/SKU/defect/work-center
 *   8. Customer RMA   → rmaGeneration() — integrates with X-32
 *   9. Supplier score → supplierScorecard() — integrates with X-05
 *
 * Sources of NCR: 'internal' (in-process), 'customer' (field return),
 *                 'supplier' (incoming inspection), 'audit' (internal audit)
 *
 * Defect catalogs:
 *   • Israeli standard codes (IL-XXX) from תקן ישראלי + מכון התקנים
 *   • Customer-specific catalogs registered via registerCustomerDefectCode()
 *
 * RULES
 *   • Zero dependencies — only `node:crypto` from the standard library
 *   • Bilingual (Hebrew + English) labels on every code / status / event
 *   • NEVER deletes — every mutation is appended to the audit trail
 *   • לא מוחקים רק משדרגים ומגדלים — supersede, never erase
 *   • Pure in-memory — injectable store hook for persistence
 *   • Real code, fully exercised by `test/quality/ncr-tracker.test.js`
 *
 * Public class: NCRTracker
 *   createNCR({source, sku, lotId, qty, defects, detectedBy, detectedAt})
 *   disposition(ncrId, action)
 *   rootCauseAnalysis(ncrId, {method, findings})
 *   linkToCAPA(ncrId, capaId)
 *   costOfPoorQuality(period)
 *   trendAnalysis({dimension, period})
 *   rmaGeneration(ncrId)
 *   supplierScorecard(supplierId)
 *
 * Helper exports:
 *   DEFECT_CODES_IL, SEVERITY, SOURCE, STATUS, DISPOSITION, RCA_METHOD,
 *   COQ_CATEGORY
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════════
// 1.  CONSTANTS — DEFECT CODES / SEVERITY / STATUS / DISPOSITION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Israeli standard defect codes (תקן ישראלי) — metal fabrication catalog.
 * Coded per מכון התקנים families for welding, finishing, dimensioning.
 * Every code is bilingual.
 */
const DEFECT_CODES_IL = Object.freeze({
    // Dimensional / geometry — מידות וגיאומטריה
    'IL-DIM-001': { he: 'מידה מחוץ לסובלנות', en: 'Dimension out of tolerance', family: 'dimensional' },
    'IL-DIM-002': { he: 'קו לא ישר', en: 'Non-straight edge', family: 'dimensional' },
    'IL-DIM-003': { he: 'זווית שגויה', en: 'Incorrect angle', family: 'dimensional' },
    'IL-DIM-004': { he: 'עיוות / פיתול', en: 'Warpage / twist', family: 'dimensional' },

    // Welding — ריתוך (ISO 5817 / ת"י 127)
    'IL-WLD-001': { he: 'חוסר חדירה בריתוך', en: 'Lack of weld penetration', family: 'welding' },
    'IL-WLD-002': { he: 'סדק בריתוך', en: 'Weld crack', family: 'welding' },
    'IL-WLD-003': { he: 'נקבוביות בריתוך', en: 'Weld porosity', family: 'welding' },
    'IL-WLD-004': { he: 'שריפה (undercut)', en: 'Undercut', family: 'welding' },
    'IL-WLD-005': { he: 'התזות (spatter)', en: 'Spatter', family: 'welding' },

    // Surface / finishing — גימור פני השטח
    'IL-SRF-001': { he: 'שריטה', en: 'Scratch', family: 'surface' },
    'IL-SRF-002': { he: 'חלודה / קורוזיה', en: 'Rust / corrosion', family: 'surface' },
    'IL-SRF-003': { he: 'צביעה פגומה', en: 'Paint defect', family: 'surface' },
    'IL-SRF-004': { he: 'גלוון לקוי', en: 'Defective galvanization', family: 'surface' },

    // Material — חומר גלם
    'IL-MAT-001': { he: 'חומר לא תואם למפרט', en: 'Wrong material grade', family: 'material' },
    'IL-MAT-002': { he: 'עובי לוח שגוי', en: 'Wrong sheet thickness', family: 'material' },
    'IL-MAT-003': { he: 'פגם מקור (מהספק)', en: 'Incoming supplier defect', family: 'material' },

    // Assembly — הרכבה
    'IL-ASM-001': { he: 'חלק חסר', en: 'Missing part', family: 'assembly' },
    'IL-ASM-002': { he: 'הרכבה שגויה', en: 'Incorrect assembly', family: 'assembly' },
    'IL-ASM-003': { he: 'הידוק לקוי', en: 'Improper fastening', family: 'assembly' },

    // Documentation — תיעוד
    'IL-DOC-001': { he: 'תעודת משלוח חסרה', en: 'Missing delivery certificate', family: 'documentation' },
    'IL-DOC-002': { he: 'תעודת חומר חסרה', en: 'Missing material cert (mill-cert)', family: 'documentation' },
    'IL-DOC-003': { he: 'חתימת QC חסרה', en: 'Missing QC sign-off', family: 'documentation' },
});

const SEVERITY = Object.freeze({
    MINOR:    { code: 'minor',    weight: 1, he: 'קל',     en: 'Minor' },
    MAJOR:    { code: 'major',    weight: 5, he: 'בינוני', en: 'Major' },
    CRITICAL: { code: 'critical', weight: 25, he: 'קריטי', en: 'Critical' },
});

const SOURCE = Object.freeze({
    INTERNAL: { code: 'internal', he: 'פנים-מפעלי',     en: 'Internal / in-process' },
    CUSTOMER: { code: 'customer', he: 'מהלקוח',          en: 'Customer return' },
    SUPPLIER: { code: 'supplier', he: 'בקבלה מהספק',     en: 'Incoming inspection' },
    AUDIT:    { code: 'audit',    he: 'מביקורת פנימית',  en: 'Internal audit' },
});

const STATUS = Object.freeze({
    OPEN:          { code: 'open',          he: 'פתוח',              en: 'Open' },
    TRIAGED:       { code: 'triaged',       he: 'בטיפול',            en: 'Triaged' },
    MRB_PENDING:   { code: 'mrb-pending',   he: 'ממתין ל-MRB',       en: 'Pending MRB' },
    DISPOSITIONED: { code: 'dispositioned', he: 'בוצעה הכרעה',       en: 'Dispositioned' },
    RCA_DONE:      { code: 'rca-done',      he: 'ניתוח שורש הושלם',  en: 'Root-cause complete' },
    LINKED_CAPA:   { code: 'linked-capa',   he: 'מקושר ל-CAPA',      en: 'Linked to CAPA' },
    CLOSED:        { code: 'closed',        he: 'סגור',              en: 'Closed' },
});

const DISPOSITION = Object.freeze({
    USE_AS_IS:          { code: 'use-as-is',          he: 'שימוש כמות-שהוא',    en: 'Use as-is' },
    REWORK:             { code: 'rework',             he: 'תיקון חוזר',          en: 'Rework' },
    RETURN_TO_SUPPLIER: { code: 'return-to-supplier', he: 'החזרה לספק',         en: 'Return to supplier' },
    SCRAP:              { code: 'scrap',               he: 'גריטה',              en: 'Scrap' },
    DOWNGRADE:          { code: 'downgrade',           he: 'שינוי סוג איכות',   en: 'Downgrade' },
});

const RCA_METHOD = Object.freeze({
    FIVE_WHY: { code: '5-why',    he: 'חמש פעמים למה',       en: '5-Why analysis' },
    FISHBONE: { code: 'fishbone', he: 'אדרת דג (Ishikawa)',  en: 'Fishbone / Ishikawa' },
    FMEA:     { code: 'fmea',     he: 'FMEA — ניתוח כשלים',  en: 'FMEA — Failure Mode & Effects' },
});

/**
 * Cost-of-Poor-Quality categories — קטגוריות עלות אי-איכות.
 * Aligned with ASQ / Juran classification.
 */
const COQ_CATEGORY = Object.freeze({
    INTERNAL_FAILURE: { code: 'internal-failure', he: 'כשל פנימי',  en: 'Internal failure' },
    EXTERNAL_FAILURE: { code: 'external-failure', he: 'כשל חיצוני', en: 'External failure' },
    APPRAISAL:        { code: 'appraisal',        he: 'הערכה',      en: 'Appraisal / inspection' },
    PREVENTION:       { code: 'prevention',       he: 'מניעה',      en: 'Prevention' },
});

const DISPOSITION_COQ_MAP = Object.freeze({
    'use-as-is':          'internal-failure', // concession
    'rework':             'internal-failure',
    'return-to-supplier': 'external-failure', // supplier-caused cost
    'scrap':              'internal-failure',
    'downgrade':          'internal-failure',
});

// Baseline disposition unit-cost (ILS per unit) — used when the caller does
// not supply an explicit unit cost. These are conservative plant averages.
const DEFAULT_UNIT_COST_ILS = Object.freeze({
    'use-as-is':           5,
    'rework':             45,
    'return-to-supplier': 12,
    'scrap':             120,
    'downgrade':          60,
});

// ═══════════════════════════════════════════════════════════════════════
// 2.  TRACKER CLASS
// ═══════════════════════════════════════════════════════════════════════

class NCRTracker {
    /**
     * @param {object} [opts]
     * @param {object} [opts.rmaEngine]        Injected RMA engine (X-32)
     * @param {object} [opts.capaEngine]       Injected CAPA engine (Y-038)
     * @param {object} [opts.supplierEngine]   Injected supplier scoring (X-05)
     * @param {function} [opts.clock]          () => Date — for deterministic tests
     * @param {function} [opts.idGen]          () => string — for deterministic tests
     * @param {object} [opts.customerCatalogs] { [customerId]: { [code]: {he,en,family} } }
     */
    constructor(opts = {}) {
        this.rmaEngine      = opts.rmaEngine      || null;
        this.capaEngine     = opts.capaEngine     || null;
        this.supplierEngine = opts.supplierEngine || null;
        this.clock          = opts.clock          || (() => new Date());
        this.idGen          = opts.idGen          || (() => `NCR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`);

        /** @type {Map<string, object>} */
        this._ncrs = new Map();
        /** @type {object[]} append-only audit trail */
        this._audit = [];
        /** @type {Map<string, Map<string, object>>} customerId → (code → meta) */
        this._customerCatalogs = new Map();
        if (opts.customerCatalogs) {
            for (const [cid, catalog] of Object.entries(opts.customerCatalogs)) {
                this.registerCustomerDefectCatalog(cid, catalog);
            }
        }
    }

    // ───────────────────────────────────────────────────────────────────
    // 2.1  createNCR — open a new report
    // ───────────────────────────────────────────────────────────────────

    /**
     * Create a new non-conformance report.
     *
     * @param {object} params
     * @param {'internal'|'customer'|'supplier'|'audit'} params.source
     * @param {string} params.sku
     * @param {string} params.lotId
     * @param {number} params.qty          Quantity of affected units
     * @param {Array<{code:string, severity?:string, description?:string, photo?:string}>} params.defects
     * @param {string} params.detectedBy   Employee / workstation identifier
     * @param {Date|string} [params.detectedAt]
     * @param {string} [params.supplierId] Required if source === 'supplier'
     * @param {string} [params.customerId] Required if source === 'customer'
     * @param {string} [params.workCenter] Metal-shop work center
     * @param {string} [params.poId]       Linked PO (for supplier NCRs)
     * @param {string} [params.salesOrderId] Linked SO (for customer NCRs)
     * @returns {string} ncrId
     */
    createNCR(params) {
        const p = params || {};
        if (!p.source || !SOURCE[p.source.toUpperCase()]) {
            throw new Error(`createNCR: invalid source "${p.source}"`);
        }
        if (!p.sku)   throw new Error('createNCR: sku is required');
        if (!p.lotId) throw new Error('createNCR: lotId is required');
        if (typeof p.qty !== 'number' || p.qty <= 0) {
            throw new Error('createNCR: qty must be a positive number');
        }
        if (!Array.isArray(p.defects) || p.defects.length === 0) {
            throw new Error('createNCR: defects array is required and cannot be empty');
        }
        if (!p.detectedBy) throw new Error('createNCR: detectedBy is required');

        // Validate / enrich each defect
        const enrichedDefects = p.defects.map((d, i) => {
            if (!d || !d.code) {
                throw new Error(`createNCR: defects[${i}].code is required`);
            }
            const sevKey = (d.severity || 'minor').toString().toUpperCase();
            if (!SEVERITY[sevKey]) {
                throw new Error(`createNCR: defects[${i}].severity "${d.severity}" is invalid`);
            }
            const meta = this._lookupDefectMeta(d.code, p.customerId);
            return {
                code:        d.code,
                codeMeta:    meta,              // bilingual labels + family
                severity:    SEVERITY[sevKey],
                description: d.description || null,
                photo:       d.photo || null,
            };
        });

        const ncrId = this.idGen();
        const now   = this.clock();
        const detectedAt = p.detectedAt ? new Date(p.detectedAt) : now;

        const ncr = {
            id:              ncrId,
            source:          SOURCE[p.source.toUpperCase()],
            sku:             p.sku,
            lotId:           p.lotId,
            qty:             p.qty,
            defects:         enrichedDefects,
            detectedBy:      p.detectedBy,
            detectedAt:      detectedAt.toISOString(),
            supplierId:      p.supplierId || null,
            customerId:      p.customerId || null,
            workCenter:      p.workCenter || null,
            poId:            p.poId       || null,
            salesOrderId:    p.salesOrderId || null,
            status:          STATUS.OPEN,
            disposition:     null,
            dispositionedAt: null,
            dispositionBy:   null,
            rca:             null,
            capaId:          null,
            rmaId:           null,
            cost:            null,          // ILS, set on disposition
            createdAt:       now.toISOString(),
            events:          [],
            // Worst severity across all defects — drives SLA + scorecard weight
            worstSeverity:   this._worstSeverity(enrichedDefects),
        };

        // Auto-advance to triaged — we now know the source + severity
        ncr.status = STATUS.TRIAGED;

        this._ncrs.set(ncrId, ncr);
        this._appendEvent(ncr, 'created', { source: ncr.source.code, worstSeverity: ncr.worstSeverity.code });
        this._audit.push({ at: now.toISOString(), op: 'createNCR', ncrId, by: p.detectedBy });
        return ncrId;
    }

    // ───────────────────────────────────────────────────────────────────
    // 2.2  disposition — MRB decision
    // ───────────────────────────────────────────────────────────────────

    /**
     * Record the Material Review Board (MRB) decision.
     *
     * @param {string} ncrId
     * @param {'use-as-is'|'rework'|'return-to-supplier'|'scrap'|'downgrade'} action
     * @param {object} [opts]
     * @param {string} [opts.decidedBy]
     * @param {number} [opts.unitCost]  ILS per unit — overrides default
     * @param {string} [opts.note]
     * @returns {object} snapshot of the dispositioned NCR
     */
    disposition(ncrId, action, opts = {}) {
        const ncr = this._requireNcr(ncrId);
        const dispKey = this._dispositionKey(action);
        if (!dispKey) {
            throw new Error(`disposition: invalid action "${action}"`);
        }
        if (ncr.disposition) {
            // לא מוחקים — supersede, do not erase. Record the override.
            this._appendEvent(ncr, 'disposition-superseded', {
                previous: ncr.disposition.code,
                next:     action,
            });
        }

        const dispo = DISPOSITION[dispKey];
        const unitCost = typeof opts.unitCost === 'number'
            ? opts.unitCost
            : DEFAULT_UNIT_COST_ILS[dispo.code];
        const totalCost = +(unitCost * ncr.qty).toFixed(2);

        ncr.disposition     = dispo;
        ncr.dispositionedAt = this.clock().toISOString();
        ncr.dispositionBy   = opts.decidedBy || 'MRB';
        ncr.cost            = {
            unitCost,
            totalCost,
            currency: 'ILS',
            category: COQ_CATEGORY[this._coqKey(dispo.code, ncr.source.code)],
        };
        ncr.status = STATUS.DISPOSITIONED;

        this._appendEvent(ncr, 'dispositioned', {
            action:   dispo.code,
            by:       ncr.dispositionBy,
            cost:     totalCost,
            category: ncr.cost.category.code,
            note:     opts.note || null,
        });
        this._audit.push({ at: ncr.dispositionedAt, op: 'disposition', ncrId, action: dispo.code });

        // Side-effect: bump supplier scorecard if caused by supplier
        if (ncr.source.code === 'supplier' && ncr.supplierId && this.supplierEngine && typeof this.supplierEngine.recordQualityEvent === 'function') {
            try {
                this.supplierEngine.recordQualityEvent({
                    supplierId: ncr.supplierId,
                    ncrId,
                    severity:   ncr.worstSeverity.code,
                    cost:       totalCost,
                    at:         ncr.dispositionedAt,
                });
            } catch (e) {
                this._appendEvent(ncr, 'supplier-score-sync-failed', { error: e.message });
            }
        }

        return this._snapshot(ncr);
    }

    // ───────────────────────────────────────────────────────────────────
    // 2.3  rootCauseAnalysis — 5-why / fishbone / FMEA
    // ───────────────────────────────────────────────────────────────────

    /**
     * Attach structured root-cause analysis.
     *
     * @param {string} ncrId
     * @param {object} params
     * @param {'5-why'|'fishbone'|'fmea'} params.method
     * @param {object} params.findings   structured per method — free-form by design
     * @param {string} [params.analyst]
     * @returns {object} snapshot
     */
    rootCauseAnalysis(ncrId, params) {
        const ncr = this._requireNcr(ncrId);
        if (!params || !params.method) {
            throw new Error('rootCauseAnalysis: method is required');
        }
        const methodKey = this._rcaMethodKey(params.method);
        if (!methodKey) {
            throw new Error(`rootCauseAnalysis: invalid method "${params.method}"`);
        }
        if (!params.findings || typeof params.findings !== 'object') {
            throw new Error('rootCauseAnalysis: findings object is required');
        }

        // Method-specific shallow validation (not enforcing schema, just integrity)
        const method = RCA_METHOD[methodKey];
        if (method.code === '5-why') {
            if (!Array.isArray(params.findings.whys) || params.findings.whys.length < 1) {
                throw new Error('rootCauseAnalysis: 5-why requires findings.whys[]');
            }
        } else if (method.code === 'fishbone') {
            if (!params.findings.categories || typeof params.findings.categories !== 'object') {
                throw new Error('rootCauseAnalysis: fishbone requires findings.categories{}');
            }
        } else if (method.code === 'fmea') {
            if (!Array.isArray(params.findings.failureModes) || params.findings.failureModes.length < 1) {
                throw new Error('rootCauseAnalysis: fmea requires findings.failureModes[]');
            }
            // Compute aggregate RPN when present
            for (const fm of params.findings.failureModes) {
                if (typeof fm.severity === 'number' && typeof fm.occurrence === 'number' && typeof fm.detection === 'number') {
                    fm.rpn = fm.severity * fm.occurrence * fm.detection;
                }
            }
        }

        // לא מוחקים — supersede. Keep history of prior RCAs.
        if (ncr.rca) {
            ncr.rcaHistory = ncr.rcaHistory || [];
            ncr.rcaHistory.push(ncr.rca);
        }

        ncr.rca = {
            method:   method,
            findings: params.findings,
            analyst:  params.analyst || null,
            at:       this.clock().toISOString(),
        };
        ncr.status = STATUS.RCA_DONE;
        this._appendEvent(ncr, 'rca-recorded', { method: method.code, analyst: ncr.rca.analyst });
        this._audit.push({ at: ncr.rca.at, op: 'rca', ncrId, method: method.code });
        return this._snapshot(ncr);
    }

    // ───────────────────────────────────────────────────────────────────
    // 2.4  linkToCAPA — corrective / preventive action
    // ───────────────────────────────────────────────────────────────────

    /**
     * Link an NCR to its CAPA (Corrective / Preventive Action) record.
     * If a CAPA engine is injected, the engine is notified with the back-link.
     *
     * @param {string} ncrId
     * @param {string} capaId
     * @returns {object} snapshot
     */
    linkToCAPA(ncrId, capaId) {
        const ncr = this._requireNcr(ncrId);
        if (!capaId) throw new Error('linkToCAPA: capaId is required');

        // לא מוחקים — history the previous link
        if (ncr.capaId && ncr.capaId !== capaId) {
            ncr.capaHistory = ncr.capaHistory || [];
            ncr.capaHistory.push({ capaId: ncr.capaId, replacedAt: this.clock().toISOString() });
        }
        ncr.capaId = capaId;
        ncr.status = STATUS.LINKED_CAPA;
        this._appendEvent(ncr, 'capa-linked', { capaId });
        this._audit.push({ at: this.clock().toISOString(), op: 'linkToCAPA', ncrId, capaId });

        if (this.capaEngine && typeof this.capaEngine.attachNCR === 'function') {
            try { this.capaEngine.attachNCR(capaId, ncrId); }
            catch (e) { this._appendEvent(ncr, 'capa-backlink-failed', { error: e.message }); }
        }
        return this._snapshot(ncr);
    }

    // ───────────────────────────────────────────────────────────────────
    // 2.5  costOfPoorQuality — roll up NCR cost
    // ───────────────────────────────────────────────────────────────────

    /**
     * Aggregate NCR costs (CoPQ) for a period.
     *
     * @param {object} period
     * @param {Date|string} period.from
     * @param {Date|string} period.to
     * @returns {{
     *   total: number,
     *   currency: 'ILS',
     *   byCategory: object,
     *   bySource: object,
     *   byDisposition: object,
     *   count: number,
     * }}
     */
    costOfPoorQuality(period) {
        const { from, to } = this._normalizePeriod(period);
        const result = {
            total:         0,
            currency:      'ILS',
            byCategory:    {},
            bySource:      {},
            byDisposition: {},
            count:         0,
        };

        // Initialize buckets so Pareto consumers always see all keys
        for (const c of Object.values(COQ_CATEGORY)) result.byCategory[c.code] = 0;
        for (const s of Object.values(SOURCE))       result.bySource[s.code]   = 0;
        for (const d of Object.values(DISPOSITION))  result.byDisposition[d.code] = 0;

        for (const ncr of this._ncrs.values()) {
            if (!ncr.cost || !ncr.dispositionedAt) continue;
            const t = Date.parse(ncr.dispositionedAt);
            if (t < from || t > to) continue;
            result.total += ncr.cost.totalCost;
            result.count += 1;
            result.byCategory[ncr.cost.category.code] += ncr.cost.totalCost;
            result.bySource[ncr.source.code]          += ncr.cost.totalCost;
            result.byDisposition[ncr.disposition.code] += ncr.cost.totalCost;
        }
        result.total = +result.total.toFixed(2);
        return result;
    }

    // ───────────────────────────────────────────────────────────────────
    // 2.6  trendAnalysis — Pareto
    // ───────────────────────────────────────────────────────────────────

    /**
     * Pareto / trend analysis.
     *
     * @param {object} params
     * @param {'supplier'|'sku'|'defect-code'|'work-center'} params.dimension
     * @param {object} [params.period]  { from, to }
     * @returns {{
     *   dimension: string,
     *   total: number,
     *   items: Array<{key:string, label:string, count:number, qty:number, severityScore:number, cost:number, pct:number, cumPct:number}>,
     *   paretoCutoffIndex: number, // index of last item within 80% cumulative
     * }}
     */
    trendAnalysis(params) {
        const p = params || {};
        if (!p.dimension) throw new Error('trendAnalysis: dimension is required');
        const dim = p.dimension;
        const validDims = new Set(['supplier', 'sku', 'defect-code', 'work-center']);
        if (!validDims.has(dim)) {
            throw new Error(`trendAnalysis: invalid dimension "${dim}"`);
        }
        const { from, to } = this._normalizePeriod(p.period);

        /** @type {Map<string,{key,label,count,qty,severityScore,cost}>} */
        const buckets = new Map();
        const ensure = (key, label) => {
            if (!buckets.has(key)) {
                buckets.set(key, { key, label, count: 0, qty: 0, severityScore: 0, cost: 0 });
            }
            return buckets.get(key);
        };

        for (const ncr of this._ncrs.values()) {
            const t = Date.parse(ncr.detectedAt);
            if (t < from || t > to) continue;

            const sevWeight = ncr.worstSeverity.weight;
            const cost = ncr.cost ? ncr.cost.totalCost : 0;

            if (dim === 'supplier') {
                if (!ncr.supplierId) continue;
                const b = ensure(ncr.supplierId, ncr.supplierId);
                b.count += 1;
                b.qty   += ncr.qty;
                b.severityScore += sevWeight;
                b.cost  += cost;
            } else if (dim === 'sku') {
                const b = ensure(ncr.sku, ncr.sku);
                b.count += 1;
                b.qty   += ncr.qty;
                b.severityScore += sevWeight;
                b.cost  += cost;
            } else if (dim === 'work-center') {
                if (!ncr.workCenter) continue;
                const b = ensure(ncr.workCenter, ncr.workCenter);
                b.count += 1;
                b.qty   += ncr.qty;
                b.severityScore += sevWeight;
                b.cost  += cost;
            } else if (dim === 'defect-code') {
                for (const d of ncr.defects) {
                    const label = d.codeMeta ? `${d.codeMeta.he} / ${d.codeMeta.en}` : d.code;
                    const b = ensure(d.code, label);
                    b.count += 1;
                    b.qty   += ncr.qty;
                    b.severityScore += d.severity.weight;
                    b.cost  += cost / ncr.defects.length; // share cost across defects
                }
            }
        }

        // Sort desc by severity score (primary), count (secondary), cost (tertiary)
        const items = Array.from(buckets.values()).sort((a, b) => {
            if (b.severityScore !== a.severityScore) return b.severityScore - a.severityScore;
            if (b.count !== a.count) return b.count - a.count;
            return b.cost - a.cost;
        });

        const total = items.reduce((s, i) => s + i.severityScore, 0);
        let cum = 0;
        let cutoffIndex = -1;
        for (let i = 0; i < items.length; i++) {
            items[i].pct    = total > 0 ? +(items[i].severityScore / total * 100).toFixed(2) : 0;
            cum += items[i].severityScore;
            items[i].cumPct = total > 0 ? +(cum / total * 100).toFixed(2) : 0;
            if (cutoffIndex === -1 && items[i].cumPct >= 80) cutoffIndex = i;
            // Round costs for presentation
            items[i].cost = +items[i].cost.toFixed(2);
        }

        return {
            dimension:         dim,
            total,
            items,
            paretoCutoffIndex: cutoffIndex,
        };
    }

    // ───────────────────────────────────────────────────────────────────
    // 2.7  rmaGeneration — auto-create RMA for customer-returned defective
    // ───────────────────────────────────────────────────────────────────

    /**
     * Auto-create an RMA for a customer-source NCR.  Integrates with X-32 if
     * an RMA engine is injected; otherwise records a synthetic RMA stub so
     * the flow is still auditable in isolation.
     *
     * @param {string} ncrId
     * @returns {string} rmaId
     */
    rmaGeneration(ncrId) {
        const ncr = this._requireNcr(ncrId);
        if (ncr.source.code !== 'customer') {
            throw new Error('rmaGeneration: only "customer" NCRs can auto-generate RMAs');
        }
        if (!ncr.customerId) {
            throw new Error('rmaGeneration: customerId is missing on NCR');
        }
        if (ncr.rmaId) {
            return ncr.rmaId; // idempotent
        }

        let rmaId;
        const rmaPayload = {
            customerId:   ncr.customerId,
            invoiceId:    ncr.salesOrderId || null,
            items:        [{ sku: ncr.sku, qty: ncr.qty, lotId: ncr.lotId }],
            reason:       'DEFECTIVE',
            ncrId:        ncr.id,
            worstSeverity: ncr.worstSeverity.code,
        };

        if (this.rmaEngine && typeof this.rmaEngine.createRma === 'function') {
            try {
                rmaId = this.rmaEngine.createRma(rmaPayload);
            } catch (e) {
                this._appendEvent(ncr, 'rma-engine-error', { error: e.message });
                rmaId = `RMA-STUB-${ncr.id}`;
            }
        } else {
            rmaId = `RMA-STUB-${ncr.id}`;
        }

        ncr.rmaId = rmaId;
        this._appendEvent(ncr, 'rma-generated', { rmaId });
        this._audit.push({ at: this.clock().toISOString(), op: 'rmaGeneration', ncrId, rmaId });
        return rmaId;
    }

    // ───────────────────────────────────────────────────────────────────
    // 2.8  supplierScorecard — NCR rate per supplier
    // ───────────────────────────────────────────────────────────────────

    /**
     * Compute a supplier scorecard based on NCRs against that supplier.
     * Score is on a 0–100 scale where 100 = no NCRs.
     *
     * @param {string} supplierId
     * @param {object} [period]
     * @returns {{
     *   supplierId: string,
     *   ncrCount: number,
     *   unitsAffected: number,
     *   severityScore: number,
     *   cost: number,
     *   score: number,          // 0–100 (higher is better)
     *   grade: 'A'|'B'|'C'|'D'|'F',
     *   breakdown: object,
     * }}
     */
    supplierScorecard(supplierId, period) {
        if (!supplierId) throw new Error('supplierScorecard: supplierId is required');
        const { from, to } = this._normalizePeriod(period);

        let ncrCount = 0, unitsAffected = 0, severityScore = 0, cost = 0;
        const bySeverity = { minor: 0, major: 0, critical: 0 };
        const byDefect = {};

        for (const ncr of this._ncrs.values()) {
            if (ncr.supplierId !== supplierId) continue;
            const t = Date.parse(ncr.detectedAt);
            if (t < from || t > to) continue;
            ncrCount      += 1;
            unitsAffected += ncr.qty;
            severityScore += ncr.worstSeverity.weight;
            cost          += ncr.cost ? ncr.cost.totalCost : 0;
            bySeverity[ncr.worstSeverity.code] += 1;
            for (const d of ncr.defects) {
                byDefect[d.code] = (byDefect[d.code] || 0) + 1;
            }
        }

        // Score curve: 100 - severityScore * 2, floored at 0.
        // A perfect supplier (severityScore=0) → 100.
        // 5 major NCRs (5*5=25 weight) → 100 - 50 = 50 = D.
        // 2 critical NCRs (2*25=50) → 100 - 100 = 0 = F.
        const score = Math.max(0, Math.min(100, 100 - severityScore * 2));
        let grade;
        if (score >= 90)      grade = 'A';
        else if (score >= 80) grade = 'B';
        else if (score >= 70) grade = 'C';
        else if (score >= 60) grade = 'D';
        else                  grade = 'F';

        // Push to upstream scoring if engine present
        if (this.supplierEngine && typeof this.supplierEngine.updateQualityScore === 'function') {
            try {
                this.supplierEngine.updateQualityScore(supplierId, { score, grade, ncrCount, cost, period: { from, to } });
            } catch (e) { /* do not throw, just surface via audit */
                this._audit.push({ at: this.clock().toISOString(), op: 'supplier-score-push-failed', supplierId, error: e.message });
            }
        }

        return {
            supplierId,
            ncrCount,
            unitsAffected,
            severityScore,
            cost: +cost.toFixed(2),
            score,
            grade,
            breakdown: { bySeverity, byDefect, period: { from, to } },
        };
    }

    // ───────────────────────────────────────────────────────────────────
    // 2.9  Introspection / helpers
    // ───────────────────────────────────────────────────────────────────

    /** Return a read-only snapshot of an NCR by id. */
    getNCR(ncrId) {
        const ncr = this._ncrs.get(ncrId);
        return ncr ? this._snapshot(ncr) : null;
    }

    /** List all NCRs (optionally filtered). */
    listNCRs(filter = {}) {
        const rows = [];
        for (const ncr of this._ncrs.values()) {
            if (filter.source   && ncr.source.code !== filter.source)   continue;
            if (filter.supplierId && ncr.supplierId !== filter.supplierId) continue;
            if (filter.customerId && ncr.customerId !== filter.customerId) continue;
            if (filter.status   && ncr.status.code !== filter.status)   continue;
            rows.push(this._snapshot(ncr));
        }
        return rows;
    }

    /** Append-only audit trail. */
    getAuditTrail() { return this._audit.slice(); }

    /**
     * Register a customer-specific defect code catalog.
     * @param {string} customerId
     * @param {object} catalog  { [code]: { he, en, family? } }
     */
    registerCustomerDefectCatalog(customerId, catalog) {
        if (!customerId || !catalog) throw new Error('registerCustomerDefectCatalog: id + catalog required');
        const m = new Map();
        for (const [code, meta] of Object.entries(catalog)) {
            if (!meta || !meta.he || !meta.en) {
                throw new Error(`registerCustomerDefectCatalog: code "${code}" missing bilingual labels`);
            }
            m.set(code, { he: meta.he, en: meta.en, family: meta.family || 'custom' });
        }
        this._customerCatalogs.set(customerId, m);
    }

    /** Close an NCR after CAPA is verified. */
    closeNCR(ncrId, closedBy) {
        const ncr = this._requireNcr(ncrId);
        if (!ncr.disposition) throw new Error('closeNCR: cannot close without disposition');
        ncr.status = STATUS.CLOSED;
        ncr.closedAt = this.clock().toISOString();
        ncr.closedBy = closedBy || null;
        this._appendEvent(ncr, 'closed', { by: closedBy || null });
        this._audit.push({ at: ncr.closedAt, op: 'closeNCR', ncrId, by: closedBy || null });
        return this._snapshot(ncr);
    }

    // ───────────────────────────────────────────────────────────────────
    // 3.  INTERNAL HELPERS
    // ───────────────────────────────────────────────────────────────────

    _requireNcr(id) {
        const ncr = this._ncrs.get(id);
        if (!ncr) throw new Error(`NCR not found: ${id}`);
        return ncr;
    }

    _lookupDefectMeta(code, customerId) {
        if (DEFECT_CODES_IL[code]) return DEFECT_CODES_IL[code];
        if (customerId && this._customerCatalogs.has(customerId)) {
            const cat = this._customerCatalogs.get(customerId);
            if (cat.has(code)) return cat.get(code);
        }
        // Unknown code — return a stub so we do not block; QA can audit later.
        return { he: code, en: code, family: 'unknown' };
    }

    _dispositionKey(action) {
        for (const [key, v] of Object.entries(DISPOSITION)) {
            if (v.code === action) return key;
        }
        return null;
    }

    _rcaMethodKey(method) {
        for (const [key, v] of Object.entries(RCA_METHOD)) {
            if (v.code === method) return key;
        }
        return null;
    }

    _coqKey(dispositionCode, sourceCode) {
        // Customer-source → external failure regardless of disposition
        if (sourceCode === 'customer') return 'EXTERNAL_FAILURE';
        const code = DISPOSITION_COQ_MAP[dispositionCode];
        for (const [key, v] of Object.entries(COQ_CATEGORY)) {
            if (v.code === code) return key;
        }
        return 'INTERNAL_FAILURE';
    }

    _worstSeverity(defects) {
        let worst = SEVERITY.MINOR;
        for (const d of defects) {
            if (d.severity.weight > worst.weight) worst = d.severity;
        }
        return worst;
    }

    _appendEvent(ncr, type, data) {
        ncr.events.push({ at: this.clock().toISOString(), type, data: data || {} });
    }

    _snapshot(ncr) {
        // Shallow clone — avoid exposing mutable internals
        return JSON.parse(JSON.stringify(ncr));
    }

    _normalizePeriod(period) {
        const now = this.clock().getTime();
        if (!period) {
            return { from: 0, to: now };
        }
        const from = period.from ? Date.parse(new Date(period.from).toISOString()) : 0;
        const to   = period.to   ? Date.parse(new Date(period.to).toISOString())   : now;
        if (Number.isNaN(from) || Number.isNaN(to)) {
            throw new Error('Invalid period');
        }
        return { from, to };
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 4.  EXPORTS
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
    NCRTracker,
    DEFECT_CODES_IL,
    SEVERITY,
    SOURCE,
    STATUS,
    DISPOSITION,
    RCA_METHOD,
    COQ_CATEGORY,
};
