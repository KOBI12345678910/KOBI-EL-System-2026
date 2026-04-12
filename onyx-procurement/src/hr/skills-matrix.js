/**
 * Skills Matrix / Competency Tracker — מטריצת כישורים ומעקב מיומנויות
 * ====================================================================
 * Agent Y-070  |  Swarm HR  |  Techno-Kol Uzi Mega-ERP  |  Wave 2026
 *
 * A zero-dependency, in-memory, auditable skills-matrix engine for the
 * Techno-Kol Uzi metal fabrication plant. It captures every competency
 * (technical, management, soft, certification), every employee's level
 * on every skill, and drives the downstream HR decisions:
 *
 *   1. defineSkill()            — catalog a new competency
 *   2. assessEmployee()         — record an assessment (self/mgr/test/peer/cert)
 *   3. skillGap()               — per-skill gap vs. role requirement
 *   4. teamCapability()         — distribution of levels inside a team
 *   5. singlePoint()            — SPOF detector (≤1 person at level ≥ threshold)
 *   6. successionPlanning()     — candidate readiness score for a position
 *   7. trainingRecommendation() — skills an employee needs to develop
 *   8. crossTrainingPlan()      — rotation plan to build redundancy in a team
 *   9. visualizeMatrix()        — heatmap data (employees × skills grid)
 *   10. skillDemandForecast()   — future skills we must develop
 *
 * Level scale (0 None → 5 Master/Teacher) mirrors the Dreyfus model used
 * by the Israeli Ministry of Economy's מסלול הכשרת עובדי ייצור (metal
 * fab production-worker training program):
 *
 *     0  None           — לא מוכר           never exposed to the skill
 *     1  Aware          — מכיר              read a manual, watched a demo
 *     2  Apprentice     — מתלמד             can perform under supervision
 *     3  Practitioner   — עצמאי             works independently on routine jobs
 *     4  Expert         — מומחה             handles exceptions, reviews others
 *     5  Master/Teacher — מורה מומחה        trains others, writes SOPs
 *
 * Single-Point-of-Failure (SPOF) rule:
 *   A skill is SPOF when ≤ 1 active employee is at `level ≥ threshold`.
 *   Default threshold = 3 (Practitioner). Any SPOF is a כשל נקודת
 *   כשל יחידה — single-point-of-failure — and blocks the bus-factor.
 *
 * Hebrew / English bilingual labels throughout; levels come with BOTH
 * locales so the UI can render RTL Hebrew or LTR English on demand.
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade and grow.
 *   - assessments are append-only; a new assessment supersedes but
 *     does NOT erase prior ones (full history retained).
 *   - skills are deactivated, never removed.
 *
 * ZERO DEPENDENCIES — pure Node built-ins only. No external packages.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// 1.  CONSTANTS & CATALOGS
// ═══════════════════════════════════════════════════════════════════════

/** Category enum — קטגוריות כישורים */
const CATEGORY = Object.freeze({
    TECHNICAL:     'technical',     // כישורים טכניים / מקצועיים
    MANAGEMENT:    'management',    // ניהול ומנהיגות
    SOFT:          'soft',          // רכים / בינאישיים
    CERTIFICATION: 'certification', // תעודות / רישיונות
});

/** Assessment method enum — שיטת הערכה */
const METHOD = Object.freeze({
    SELF:    'self',    // הערכה עצמית
    MANAGER: 'manager', // הערכת מנהל
    TEST:    'test',    // מבחן מיומנות
    PEER:    'peer',    // הערכת עמית
    CERT:    'cert',    // תעודה חיצונית
});

/**
 * Method weights — how much we trust each assessment source.
 * Used when multiple sources disagree; we take the highest-weighted score
 * but keep ALL records for audit. Sum irrelevant — weights are relative.
 */
const METHOD_WEIGHT = Object.freeze({
    self:    0.5,  // self-assessments are optimistic
    peer:    0.8,
    manager: 1.0,
    test:    1.2,  // objective test beats opinion
    cert:    1.5,  // external certification is highest trust
});

/** Level scale — סולם רמות (0..5, Dreyfus-based) */
const LEVEL = Object.freeze({
    0: { he: 'לא מוכר',    en: 'None',           short_he: 'לא', short_en: 'N' },
    1: { he: 'מכיר',       en: 'Aware',          short_he: 'מ',  short_en: 'A' },
    2: { he: 'מתלמד',      en: 'Apprentice',     short_he: 'ת',  short_en: 'Ap' },
    3: { he: 'עצמאי',      en: 'Practitioner',   short_he: 'ע',  short_en: 'P' },
    4: { he: 'מומחה',      en: 'Expert',         short_he: 'מ',  short_en: 'E' },
    5: { he: 'מורה מומחה', en: 'Master/Teacher', short_he: 'מ+', short_en: 'M' },
});

const MIN_LEVEL = 0;
const MAX_LEVEL = 5;

/** Default SPOF threshold — below this we consider the team at risk. */
const DEFAULT_SPOF_THRESHOLD = 3;

/**
 * Seed catalog of metal-fab skills for Techno-Kol Uzi.
 * Caller may `defineSkill()` more at runtime; this is just the baseline
 * a fresh plant gets on day zero. All Hebrew names are the actual terms
 * used on the Techno-Kol Uzi shop floor.
 */
const METAL_FAB_SKILLS = Object.freeze([
    // ── CNC & cutting ────────────────────────────────────────────────
    { id: 'SKL-LASER-CNC', category: 'technical',
      name_he: 'חיתוך לייזר CNC',          name_en: 'Laser cutting (CNC)',
      description: 'Programming and operating fiber/CO2 laser cutters on sheet metal up to 25 mm' },
    { id: 'SKL-PLASMA', category: 'technical',
      name_he: 'חיתוך פלזמה',              name_en: 'Plasma cutting',
      description: 'Hand-held and CNC plasma cutting on carbon steel, stainless, aluminum' },
    { id: 'SKL-PRESS-BRAKE', category: 'technical',
      name_he: 'מכופף (פרס-ברייק)',         name_en: 'Press brake',
      description: 'CNC press brake setup, bottom/air/coin bending, bend allowance calc' },

    // ── Welding ──────────────────────────────────────────────────────
    { id: 'SKL-MIG', category: 'technical',
      name_he: 'ריתוך MIG',                name_en: 'MIG welding',
      description: 'GMAW process, carbon steel & stainless, all positions (1F-4F, 1G-4G)' },
    { id: 'SKL-TIG', category: 'technical',
      name_he: 'ריתוך TIG',                name_en: 'TIG welding',
      description: 'GTAW process, stainless, aluminum, titanium, orbital welding' },

    // ── Reading & standards ─────────────────────────────────────────
    { id: 'SKL-BLUEPRINT', category: 'technical',
      name_he: 'קריאת שרטוטים',             name_en: 'Blueprint reading',
      description: 'ISO/ASME drawing conventions, views, sections, title block' },
    { id: 'SKL-GDT', category: 'technical',
      name_he: 'ניהול אי-ודאות (GD&T)',    name_en: 'GD&T',
      description: 'ASME Y14.5 geometric dimensioning & tolerancing, datums, MMC/LMC' },

    // ── Quality & certification ─────────────────────────────────────
    { id: 'SKL-ISO-9001', category: 'certification',
      name_he: 'תקן ISO 9001',              name_en: 'ISO 9001',
      description: 'ISO 9001:2015 quality management, internal auditor qualification' },

    // ── Language & communication ────────────────────────────────────
    { id: 'SKL-TECH-HEB', category: 'soft',
      name_he: 'עברית טכנית ישראלית',       name_en: 'Israeli technical Hebrew',
      description: 'Reading Israeli engineering specs, NIOSH/OSHA equivalents in Hebrew, shop-floor vocabulary' },
]);

// ═══════════════════════════════════════════════════════════════════════
// 2.  INTERNAL HELPERS (pure functions)
// ═══════════════════════════════════════════════════════════════════════

function _isInt(n) { return typeof n === 'number' && Number.isFinite(n) && Math.floor(n) === n; }

function _clampLevel(lv) {
    if (!_isInt(lv)) throw new Error(`Level must be integer, got ${lv}`);
    if (lv < MIN_LEVEL || lv > MAX_LEVEL) {
        throw new Error(`Level ${lv} out of range [${MIN_LEVEL}..${MAX_LEVEL}]`);
    }
    return lv;
}

function _nonEmpty(s, field) {
    if (typeof s !== 'string' || s.trim() === '') {
        throw new Error(`${field} must be a non-empty string`);
    }
    return s.trim();
}

function _toDate(v) {
    if (v instanceof Date) return new Date(v.getTime());
    if (typeof v === 'string' || typeof v === 'number') {
        const d = new Date(v);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

function _round2(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

function _round4(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 10000) / 10000;
}

// ═══════════════════════════════════════════════════════════════════════
// 3.  PUBLIC CLASS — SkillsMatrix
// ═══════════════════════════════════════════════════════════════════════

class SkillsMatrix {
    /**
     * @param {object} [opts]
     * @param {Iterable} [opts.seedSkills]   Initial skill catalog (defaults to METAL_FAB_SKILLS)
     * @param {Map|object} [opts.teams]      teamId → Set<employeeId> OR plain object
     * @param {function} [opts.clock]        () => Date  (deterministic tests)
     * @param {number} [opts.spofThreshold]  SPOF level threshold (default 3)
     * @param {boolean} [opts.seedMetalFab]  Pre-load METAL_FAB_SKILLS (default true)
     */
    constructor(opts = {}) {
        this.clock = opts.clock || (() => new Date());
        this.spofThreshold = Number.isInteger(opts.spofThreshold)
            ? opts.spofThreshold
            : DEFAULT_SPOF_THRESHOLD;

        /** @type {Map<string, object>}  skillId → skill definition */
        this._skills = new Map();

        /**
         * Assessment store. Key = skillId; value = Map<employeeId, Array<assessment>>
         * Assessments are APPEND-ONLY — we never erase history.
         * @type {Map<string, Map<string, Array>>}
         */
        this._assessments = new Map();

        /** @type {Map<string, Set<string>>} teamId → Set<employeeId> */
        this._teams = new Map();

        /** Append-only audit trail. @type {Array<object>} */
        this._audit = [];

        // Seed metal-fab skill catalog unless explicitly disabled.
        const seed = opts.seedSkills != null
            ? opts.seedSkills
            : (opts.seedMetalFab === false ? [] : METAL_FAB_SKILLS);
        for (const s of seed) this.defineSkill(s);

        // Seed teams if provided.
        if (opts.teams) {
            const entries = opts.teams instanceof Map
                ? Array.from(opts.teams.entries())
                : Object.entries(opts.teams);
            for (const [teamId, members] of entries) {
                this.registerTeam(teamId, members);
            }
        }
    }

    // ───────────────────────────────────────────────────────────────────
    // 3.1  defineSkill — catalog a new competency
    // ───────────────────────────────────────────────────────────────────

    /**
     * Register (or UPGRADE — never erase) a skill definition.
     *
     * @param {object} params
     * @param {string} params.id
     * @param {string} params.name_he
     * @param {string} params.name_en
     * @param {'technical'|'management'|'soft'|'certification'} params.category
     * @param {string} [params.description]
     * @returns {object} the stored skill record
     */
    defineSkill({ id, name_he, name_en, category, description } = {}) {
        const sid = _nonEmpty(id, 'id');
        const nhe = _nonEmpty(name_he, 'name_he');
        const nen = _nonEmpty(name_en, 'name_en');
        if (!Object.values(CATEGORY).includes(category)) {
            throw new Error(`Invalid category "${category}". Must be one of ${Object.values(CATEGORY).join(', ')}`);
        }

        const now = this.clock();
        const existing = this._skills.get(sid);
        const rec = {
            id:          sid,
            name_he:     nhe,
            name_en:     nen,
            category,
            description: (description || '').trim(),
            active:      true,
            createdAt:   existing ? existing.createdAt : now,
            updatedAt:   now,
        };
        this._skills.set(sid, rec);

        // ensure the assessment bucket exists
        if (!this._assessments.has(sid)) this._assessments.set(sid, new Map());

        this._audit.push({
            ts: now, kind: 'defineSkill', skillId: sid,
            action: existing ? 'update' : 'create',
        });
        return { ...rec };
    }

    /** List every currently active (or ALL) skills. */
    listSkills({ includeInactive = false } = {}) {
        const out = [];
        for (const s of this._skills.values()) {
            if (includeInactive || s.active) out.push({ ...s });
        }
        return out;
    }

    /** Retrieve one skill by id (or null). */
    getSkill(id) {
        const s = this._skills.get(id);
        return s ? { ...s } : null;
    }

    // ───────────────────────────────────────────────────────────────────
    // 3.2  registerTeam — teams are first-class for capability analysis
    // ───────────────────────────────────────────────────────────────────

    /**
     * Register a team and its members. Upgrades an existing team (merges
     * members) rather than replacing — "only grow".
     */
    registerTeam(teamId, members = []) {
        const tid = _nonEmpty(teamId, 'teamId');
        if (!this._teams.has(tid)) this._teams.set(tid, new Set());
        const set = this._teams.get(tid);
        for (const m of members) {
            if (m != null && String(m).trim() !== '') set.add(String(m));
        }
        return { teamId: tid, size: set.size, members: Array.from(set) };
    }

    /** List all teams. */
    listTeams() {
        const out = [];
        for (const [tid, set] of this._teams) {
            out.push({ teamId: tid, size: set.size, members: Array.from(set) });
        }
        return out;
    }

    // ───────────────────────────────────────────────────────────────────
    // 3.3  assessEmployee — record an assessment (append-only)
    // ───────────────────────────────────────────────────────────────────

    /**
     * Record an assessment. Never erases previous assessments.
     *
     * @param {object} params
     * @param {string} params.employeeId
     * @param {string} params.skillId
     * @param {0|1|2|3|4|5} params.level
     * @param {'self'|'manager'|'test'|'peer'|'cert'} params.method
     * @param {Date|string} [params.date]
     * @param {string} [params.note]
     * @param {string} [params.assessorId]
     * @param {Date|string} [params.expiresAt]  For certs only — expiry date.
     * @returns {object} the full assessment record as stored
     */
    assessEmployee({ employeeId, skillId, level, method, date, note, assessorId, expiresAt } = {}) {
        const eid = _nonEmpty(employeeId, 'employeeId');
        const sid = _nonEmpty(skillId, 'skillId');
        const lvl = _clampLevel(level);
        if (!Object.values(METHOD).includes(method)) {
            throw new Error(`Invalid method "${method}". Must be one of ${Object.values(METHOD).join(', ')}`);
        }
        if (!this._skills.has(sid)) {
            throw new Error(`Unknown skillId "${sid}" — defineSkill() first`);
        }
        const d = _toDate(date) || this.clock();
        const exp = expiresAt != null ? _toDate(expiresAt) : null;

        const rec = {
            employeeId: eid,
            skillId:    sid,
            level:      lvl,
            method,
            weight:     METHOD_WEIGHT[method],
            date:       d,
            note:       note ? String(note) : '',
            assessorId: assessorId ? String(assessorId) : null,
            expiresAt:  exp,
            recordedAt: this.clock(),
            seq:        this._audit.length + 1,
        };

        if (!this._assessments.has(sid)) this._assessments.set(sid, new Map());
        const skillBucket = this._assessments.get(sid);
        if (!skillBucket.has(eid)) skillBucket.set(eid, []);
        skillBucket.get(eid).push(rec);

        this._audit.push({
            ts: rec.recordedAt, kind: 'assessEmployee',
            employeeId: eid, skillId: sid, level: lvl, method,
        });

        return { ...rec };
    }

    /**
     * Return the authoritative current level for (employee, skill).
     * Resolution rule:
     *   1. drop expired cert records
     *   2. keep the record with the highest (weight × recency) score
     *   3. tie-break: latest date wins
     * Returns null if no valid assessment exists.
     */
    currentLevel(employeeId, skillId) {
        const bucket = this._assessments.get(skillId);
        if (!bucket) return null;
        const recs = bucket.get(employeeId);
        if (!recs || recs.length === 0) return null;

        const now = this.clock();
        const valid = recs.filter((r) => !r.expiresAt || r.expiresAt >= now);
        if (valid.length === 0) return null;

        // pick by weight, then by date
        let best = valid[0];
        for (let i = 1; i < valid.length; i++) {
            const r = valid[i];
            if (r.weight > best.weight) { best = r; continue; }
            if (r.weight === best.weight && r.date > best.date) { best = r; }
        }
        return {
            level:      best.level,
            method:     best.method,
            date:       best.date,
            weight:     best.weight,
            assessorId: best.assessorId,
            expiresAt:  best.expiresAt,
        };
    }

    /** Return all assessments (full history) for an (employee, skill). */
    history(employeeId, skillId) {
        const bucket = this._assessments.get(skillId);
        if (!bucket) return [];
        const recs = bucket.get(employeeId);
        return recs ? recs.slice().sort((a, b) => a.date - b.date) : [];
    }

    /** Return all employees we have any assessment for. */
    listEmployees() {
        const set = new Set();
        for (const bucket of this._assessments.values()) {
            for (const eid of bucket.keys()) set.add(eid);
        }
        return Array.from(set).sort();
    }

    // ───────────────────────────────────────────────────────────────────
    // 3.4  skillGap — gap per required skill
    // ───────────────────────────────────────────────────────────────────

    /**
     * Compare required vs. actual levels for a set of skills.
     *
     * @param {object} params
     * @param {object} params.roleRequirements   { [skillId]: requiredLevel }
     * @param {object|string} params.employeeActual
     *     Either a plain object { [skillId]: actualLevel }
     *     OR an employeeId — we'll look up currentLevel() for each required skill.
     * @returns {{
     *   rows: Array<{skillId, skill, required, actual, gap, met, weight}>,
     *   totalRequired:number, totalActual:number, totalGap:number,
     *   fitScore:number, unmetCritical:number
     * }}
     */
    skillGap({ roleRequirements, employeeActual } = {}) {
        if (!roleRequirements || typeof roleRequirements !== 'object') {
            throw new Error('roleRequirements must be an object { skillId: level }');
        }
        const rows = [];
        let totReq = 0, totAct = 0, totGap = 0, unmetCritical = 0;

        for (const [sid, req] of Object.entries(roleRequirements)) {
            const required = _clampLevel(req);
            const skill = this._skills.get(sid);
            let actual = 0;

            if (typeof employeeActual === 'string') {
                const lv = this.currentLevel(employeeActual, sid);
                actual = lv ? lv.level : 0;
            } else if (employeeActual && typeof employeeActual === 'object') {
                actual = _isInt(employeeActual[sid]) ? employeeActual[sid] : 0;
            } else {
                throw new Error('employeeActual must be an employeeId string or a {skillId: level} object');
            }

            const gap = Math.max(0, required - actual);
            const met = actual >= required;
            // certifications & technicals with gap ≥ 2 are critical
            const cat = skill ? skill.category : 'technical';
            const weight = (cat === CATEGORY.CERTIFICATION || cat === CATEGORY.TECHNICAL) ? 1.0 : 0.7;
            if (!met && gap >= 2) unmetCritical++;

            rows.push({
                skillId: sid,
                skill:   skill ? { name_he: skill.name_he, name_en: skill.name_en, category: skill.category } : null,
                required,
                actual,
                gap,
                met,
                weight,
            });
            totReq += required;
            totAct += Math.min(actual, required);  // overshoot doesn't count toward fit
            totGap += gap;
        }

        const fitScore = totReq > 0 ? _round4(totAct / totReq) : 1;
        return {
            rows,
            totalRequired: totReq,
            totalActual:   totAct,
            totalGap:      totGap,
            fitScore,        // 0..1 — fraction of required coverage
            unmetCritical,   // count of hard blockers
        };
    }

    // ───────────────────────────────────────────────────────────────────
    // 3.5  teamCapability — level histogram for a team × skill
    // ───────────────────────────────────────────────────────────────────

    /**
     * How many employees in a team are at each level for a given skill?
     *
     * @param {string} teamId
     * @param {string} skillId
     * @returns {{
     *   teamId, skillId, skill, size:number,
     *   histogram: {0:number,1:number,2:number,3:number,4:number,5:number},
     *   atOrAbove: {1:number,2:number,3:number,4:number,5:number},
     *   avg:number, max:number, members:Array<{employeeId,level,method}>
     * }}
     */
    teamCapability(teamId, skillId) {
        const set = this._teams.get(teamId);
        if (!set) throw new Error(`Unknown team "${teamId}"`);
        if (!this._skills.has(skillId)) throw new Error(`Unknown skillId "${skillId}"`);

        const histogram = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const members = [];
        let total = 0, count = 0, max = 0;

        for (const eid of set) {
            const lv = this.currentLevel(eid, skillId);
            const level = lv ? lv.level : 0;
            histogram[level]++;
            members.push({
                employeeId: eid,
                level,
                method: lv ? lv.method : null,
            });
            total += level;
            count++;
            if (level > max) max = level;
        }

        const atOrAbove = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        for (let k = 1; k <= 5; k++) {
            for (let lv = k; lv <= 5; lv++) atOrAbove[k] += histogram[lv];
        }

        const skill = this._skills.get(skillId);
        return {
            teamId,
            skillId,
            skill: skill ? { name_he: skill.name_he, name_en: skill.name_en, category: skill.category } : null,
            size: count,
            histogram,
            atOrAbove,
            avg: count > 0 ? _round2(total / count) : 0,
            max,
            members,
        };
    }

    // ───────────────────────────────────────────────────────────────────
    // 3.6  singlePoint — SPOF detector
    // ───────────────────────────────────────────────────────────────────

    /**
     * A skill is a single-point-of-failure when ≤ 1 active employees
     * reach `threshold` (default 3, Practitioner).
     *
     * @param {object} [params]
     * @param {string} [params.skillId]   If omitted, scans ALL skills.
     * @param {number} [params.threshold]
     * @param {string} [params.teamId]    If set, scope to team.
     * @returns {object|object[]} — one report or an array of them.
     */
    singlePoint({ skillId, threshold, teamId } = {}) {
        const thr = _clampLevel(Number.isInteger(threshold) ? threshold : this.spofThreshold);

        const scopeEmployees = teamId
            ? this._teams.has(teamId)
                ? Array.from(this._teams.get(teamId))
                : []
            : this.listEmployees();

        const scanOne = (sid) => {
            const skill = this._skills.get(sid);
            if (!skill) return null;
            const qualified = [];
            for (const eid of scopeEmployees) {
                const lv = this.currentLevel(eid, sid);
                if (lv && lv.level >= thr) qualified.push({ employeeId: eid, level: lv.level, method: lv.method });
            }
            const count = qualified.length;
            let severity = 'ok';
            if (count === 0) severity = 'critical'; // nobody — bus factor 0
            else if (count === 1) severity = 'high';  // SPOF
            else if (count === 2) severity = 'medium'; // thin
            return {
                skillId: sid,
                skill: { name_he: skill.name_he, name_en: skill.name_en, category: skill.category },
                threshold: thr,
                qualifiedCount: count,
                isSPOF: count <= 1,
                severity,
                qualified,
                teamId: teamId || null,
                recommendation: count <= 1
                    ? { he: 'הכשר לפחות שני עובדים נוספים לרמה ' + thr, en: `Cross-train at least ${2 - count} more employee(s) to level ≥${thr}` }
                    : null,
            };
        };

        if (skillId) {
            if (!this._skills.has(skillId)) throw new Error(`Unknown skillId "${skillId}"`);
            return scanOne(skillId);
        }
        const all = [];
        for (const sid of this._skills.keys()) {
            const r = scanOne(sid);
            if (r) all.push(r);
        }
        // sort worst first
        all.sort((a, b) => {
            const order = { critical: 0, high: 1, medium: 2, ok: 3 };
            return (order[a.severity] - order[b.severity]) || (a.qualifiedCount - b.qualifiedCount);
        });
        return all;
    }

    // ───────────────────────────────────────────────────────────────────
    // 3.7  successionPlanning — readiness score per candidate
    // ───────────────────────────────────────────────────────────────────

    /**
     * Given a target position (its skill requirements) and a list of
     * candidate employee IDs, return each candidate's readiness score and
     * rank them. Score = fitScore × (1 − critGapPenalty).
     *
     * @param {object} params
     * @param {object} params.position                { id, name_he?, name_en?, requirements: {skillId: level} }
     * @param {string[]} params.candidates            employeeIds
     * @returns {{
     *   positionId, candidates: Array<{
     *     employeeId, fitScore, unmetCritical, gaps:Array, readiness:string, ready:boolean
     *   }>
     * }}
     */
    successionPlanning({ position, candidates } = {}) {
        if (!position || typeof position !== 'object' || !position.requirements) {
            throw new Error('position must be { id, requirements: {skillId: level} }');
        }
        if (!Array.isArray(candidates)) {
            throw new Error('candidates must be an array of employeeIds');
        }
        const rows = [];
        for (const eid of candidates) {
            const gap = this.skillGap({
                roleRequirements: position.requirements,
                employeeActual: eid,
            });
            const penalty = Math.min(1, gap.unmetCritical * 0.25);
            const raw = gap.fitScore * (1 - penalty);
            const score = _round4(raw);

            let readiness, ready;
            if (score >= 0.95 && gap.unmetCritical === 0)      { readiness = 'ready_now';        ready = true; }
            else if (score >= 0.80)                            { readiness = 'ready_6_months';   ready = false; }
            else if (score >= 0.60)                            { readiness = 'ready_1_year';     ready = false; }
            else if (score >= 0.40)                            { readiness = 'ready_2_plus_yr'; ready = false; }
            else                                               { readiness = 'not_candidate';    ready = false; }

            rows.push({
                employeeId:    eid,
                fitScore:      gap.fitScore,
                unmetCritical: gap.unmetCritical,
                penalty:       _round4(penalty),
                readinessScore: score,
                readiness,
                ready,
                gaps: gap.rows.filter((r) => r.gap > 0).map((r) => ({
                    skillId:  r.skillId,
                    required: r.required,
                    actual:   r.actual,
                    gap:      r.gap,
                })),
            });
        }
        rows.sort((a, b) => b.readinessScore - a.readinessScore);
        return {
            positionId: position.id || null,
            position: {
                name_he: position.name_he || null,
                name_en: position.name_en || null,
            },
            candidates: rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────
    // 3.8  trainingRecommendation — what to learn next
    // ───────────────────────────────────────────────────────────────────

    /**
     * Given an employee and a target role (either inline requirements
     * or a named role we already know), return the ordered training plan
     * with priority, estimated hours, and bilingual action text.
     *
     * @param {object} params
     * @param {string} params.employeeId
     * @param {object} params.targetRole   { id?, requirements: {skillId:level} }
     * @returns {{employeeId, targetRoleId, totalGapLevels, totalEstHours, plan:Array}}
     */
    trainingRecommendation({ employeeId, targetRole } = {}) {
        const eid = _nonEmpty(employeeId, 'employeeId');
        if (!targetRole || !targetRole.requirements) {
            throw new Error('targetRole must include .requirements');
        }
        const gap = this.skillGap({
            roleRequirements: targetRole.requirements,
            employeeActual: eid,
        });

        const plan = [];
        let totalLevels = 0;
        let totalHours = 0;

        for (const row of gap.rows) {
            if (row.gap <= 0) continue;
            // Rough estimation: 40h per level for technical, 20h for soft,
            // 80h per level for cert (exam + prep), 30h for management.
            const cat = row.skill ? row.skill.category : 'technical';
            const perLevelHours = cat === CATEGORY.CERTIFICATION ? 80
                                : cat === CATEGORY.TECHNICAL     ? 40
                                : cat === CATEGORY.MANAGEMENT    ? 30
                                : 20;
            const estHours = perLevelHours * row.gap;
            const priority = row.gap >= 3 ? 'critical'
                           : row.gap >= 2 ? 'high'
                           : 'medium';
            const actionHe = (LEVEL[row.actual].he) + ' → ' + (LEVEL[row.required].he);
            const actionEn = (LEVEL[row.actual].en) + ' → ' + (LEVEL[row.required].en);
            plan.push({
                skillId:  row.skillId,
                skill:    row.skill,
                fromLevel: row.actual,
                toLevel:   row.required,
                gap:       row.gap,
                estHours,
                priority,
                action:    { he: actionHe, en: actionEn },
            });
            totalLevels += row.gap;
            totalHours  += estHours;
        }

        // sort: priority first, then by gap size
        const rank = { critical: 0, high: 1, medium: 2 };
        plan.sort((a, b) => rank[a.priority] - rank[b.priority] || b.gap - a.gap);

        return {
            employeeId: eid,
            targetRoleId: targetRole.id || null,
            fitScore:     gap.fitScore,
            totalGapLevels: totalLevels,
            totalEstHours:  totalHours,
            plan,
        };
    }

    // ───────────────────────────────────────────────────────────────────
    // 3.9  crossTrainingPlan — redundancy through rotation
    // ───────────────────────────────────────────────────────────────────

    /**
     * Propose rotation pairings inside a team so that every skill has at
     * least two practitioners. Mentor = anyone at ≥ 4 (Expert); apprentice
     * = someone in the team whose current level is < threshold.
     *
     * @param {string} teamId
     * @param {object} [opts]
     * @param {number} [opts.threshold]  Redundancy target (default 3)
     * @returns {{teamId, rotations:Array, skillsAtRisk:number}}
     */
    crossTrainingPlan(teamId, { threshold } = {}) {
        if (!this._teams.has(teamId)) throw new Error(`Unknown team "${teamId}"`);
        const thr = _clampLevel(Number.isInteger(threshold) ? threshold : this.spofThreshold);
        const members = Array.from(this._teams.get(teamId));
        const rotations = [];
        let skillsAtRisk = 0;

        for (const sid of this._skills.keys()) {
            const skill = this._skills.get(sid);
            if (!skill.active) continue;

            const levels = members.map((eid) => {
                const lv = this.currentLevel(eid, sid);
                return { eid, level: lv ? lv.level : 0 };
            });

            const qualified = levels.filter((m) => m.level >= thr);
            if (qualified.length >= 2) continue;  // redundancy OK

            skillsAtRisk++;
            // Find mentor: prefer level 5, then 4, then the max if >= threshold.
            const mentors = levels
                .filter((m) => m.level >= Math.max(4, thr))
                .sort((a, b) => b.level - a.level);
            const mentor = mentors[0] || qualified[0] || null;

            // Find apprentices: members below threshold, ordered by current level desc.
            const apprentices = levels
                .filter((m) => m.level < thr && (!mentor || m.eid !== mentor.eid))
                .sort((a, b) => b.level - a.level)
                .slice(0, 2); // up to 2 apprentices per skill

            rotations.push({
                skillId: sid,
                skill: { name_he: skill.name_he, name_en: skill.name_en, category: skill.category },
                currentRedundancy: qualified.length,
                targetRedundancy: 2,
                mentor: mentor ? { employeeId: mentor.eid, level: mentor.level } : null,
                apprentices: apprentices.map((a) => ({ employeeId: a.eid, currentLevel: a.level, targetLevel: thr })),
                recommendation: mentor
                    ? { he: 'סיבוב עבודה עם חונך', en: 'Rotate with mentor' }
                    : { he: 'הכשרה חיצונית נדרשת', en: 'External training required' },
            });
        }

        rotations.sort((a, b) => a.currentRedundancy - b.currentRedundancy);
        return { teamId, skillsAtRisk, rotations };
    }

    // ───────────────────────────────────────────────────────────────────
    // 3.10  visualizeMatrix — heatmap data (employees × skills)
    // ───────────────────────────────────────────────────────────────────

    /**
     * Build a heatmap-friendly grid. Rows = employees, cols = skills,
     * cells = { level, method, dateISO }.
     *
     * @param {object} [scope]
     * @param {string} [scope.teamId]          Scope to one team
     * @param {string[]} [scope.employeeIds]   Explicit employees
     * @param {string[]} [scope.skillIds]      Explicit skills
     * @param {string} [scope.category]        Filter skills by category
     * @returns {{rows:Array, cols:Array, matrix:Array<Array<object>>}}
     */
    visualizeMatrix(scope = {}) {
        let employeeIds;
        if (scope.employeeIds && Array.isArray(scope.employeeIds)) {
            employeeIds = scope.employeeIds.slice();
        } else if (scope.teamId) {
            const t = this._teams.get(scope.teamId);
            employeeIds = t ? Array.from(t) : [];
        } else {
            employeeIds = this.listEmployees();
        }
        employeeIds.sort();

        let skills = scope.skillIds
            ? scope.skillIds.map((id) => this._skills.get(id)).filter(Boolean)
            : Array.from(this._skills.values()).filter((s) => s.active);
        if (scope.category) skills = skills.filter((s) => s.category === scope.category);

        const cols = skills.map((s) => ({
            skillId: s.id,
            name_he: s.name_he,
            name_en: s.name_en,
            category: s.category,
        }));
        const rows = employeeIds.map((eid) => ({ employeeId: eid }));
        const matrix = [];

        for (const eid of employeeIds) {
            const row = [];
            for (const s of skills) {
                const lv = this.currentLevel(eid, s.id);
                row.push(lv
                    ? {
                        level:  lv.level,
                        method: lv.method,
                        date:   lv.date instanceof Date ? lv.date.toISOString() : null,
                        label:  LEVEL[lv.level],
                      }
                    : { level: 0, method: null, date: null, label: LEVEL[0] }
                );
            }
            matrix.push(row);
        }

        return { rows, cols, matrix, legend: { ...LEVEL } };
    }

    // ───────────────────────────────────────────────────────────────────
    // 3.11  skillDemandForecast — what we must develop
    // ───────────────────────────────────────────────────────────────────

    /**
     * Forecast which skills we will need in the next 12 months.
     *
     * @param {object} params
     * @param {Array<{positionId, count, requirements:{skillId:level}, weight?:number}>} params.openPositions
     *   `weight` defaults to 1 — use fractions for "likely" hires.
     * @param {Array<{employeeId, risk:number, skills?:Array<string>}>} [params.attritionRisk]
     *   `risk` ∈ [0..1]. We model expected loss of coverage for each skill
     *   the at-risk employee currently covers (level ≥ threshold).
     * @param {number} [params.threshold]   SPOF threshold (default this.spofThreshold)
     * @returns {{
     *   generatedAt, horizon,
     *   forecast: Array<{
     *     skillId, skill,
     *     demandFromHiring:number, expectedLossFromAttrition:number, netDemand:number,
     *     priority:string
     *   }>
     * }}
     */
    skillDemandForecast({ openPositions = [], attritionRisk = [], threshold } = {}) {
        const thr = _clampLevel(Number.isInteger(threshold) ? threshold : this.spofThreshold);
        /** @type {Map<string, {demandFromHiring:number, expectedLossFromAttrition:number}>} */
        const bySkill = new Map();

        const bump = (sid, key, amount) => {
            if (!bySkill.has(sid)) bySkill.set(sid, { demandFromHiring: 0, expectedLossFromAttrition: 0 });
            const row = bySkill.get(sid);
            row[key] += amount;
        };

        // 1) Demand from open positions
        for (const pos of openPositions) {
            const count = Number.isFinite(pos.count) ? pos.count : 1;
            const weight = Number.isFinite(pos.weight) ? pos.weight : 1;
            const reqs = pos.requirements || {};
            for (const [sid, lv] of Object.entries(reqs)) {
                if (!this._skills.has(sid)) continue;
                if (!_isInt(lv) || lv < 1) continue;
                bump(sid, 'demandFromHiring', count * weight);
            }
        }

        // 2) Expected loss from attrition.
        //    For each at-risk employee, for each skill they cover at ≥ thr,
        //    expected coverage loss = risk × 1 (one head).
        for (const a of attritionRisk) {
            const eid = a.employeeId;
            const risk = Number.isFinite(a.risk) ? Math.max(0, Math.min(1, a.risk)) : 0;
            if (!eid || risk === 0) continue;

            const scope = Array.isArray(a.skills) && a.skills.length > 0
                ? a.skills
                : Array.from(this._skills.keys());

            for (const sid of scope) {
                const lv = this.currentLevel(eid, sid);
                if (lv && lv.level >= thr) bump(sid, 'expectedLossFromAttrition', risk);
            }
        }

        // 3) Compose forecast
        const forecast = [];
        for (const [sid, vals] of bySkill) {
            const skill = this._skills.get(sid);
            if (!skill) continue;
            const netDemand = _round2(vals.demandFromHiring + vals.expectedLossFromAttrition);
            let priority;
            if (netDemand >= 3) priority = 'critical';
            else if (netDemand >= 1.5) priority = 'high';
            else if (netDemand >= 0.5) priority = 'medium';
            else priority = 'low';
            forecast.push({
                skillId: sid,
                skill: { name_he: skill.name_he, name_en: skill.name_en, category: skill.category },
                demandFromHiring:         _round2(vals.demandFromHiring),
                expectedLossFromAttrition: _round2(vals.expectedLossFromAttrition),
                netDemand,
                priority,
            });
        }
        forecast.sort((a, b) => b.netDemand - a.netDemand);

        return {
            generatedAt: this.clock(),
            horizon: '12_months',
            threshold: thr,
            forecast,
        };
    }

    // ───────────────────────────────────────────────────────────────────
    // 3.12  auditTrail — read-only access to the append-only audit log
    // ───────────────────────────────────────────────────────────────────

    auditTrail() {
        return this._audit.slice();
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 4.  EXPORTS
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
    SkillsMatrix,
    CATEGORY,
    METHOD,
    METHOD_WEIGHT,
    LEVEL,
    MIN_LEVEL,
    MAX_LEVEL,
    DEFAULT_SPOF_THRESHOLD,
    METAL_FAB_SKILLS,
};
