/**
 * Metadata & Tag Manager  |  מנהל מטא-דאטה ותיוג מסמכים
 * =============================================================
 *
 * Agent Y-113  |  Swarm Documents  |  Techno-Kol Uzi mega-ERP
 *
 * Typed metadata schemas + hierarchical bilingual tag taxonomy
 * for every document / asset the ERP handles (invoices, permits,
 * drawings, contracts, photos, etc.).
 *
 * Zero dependencies. Node built-ins only. Bilingual (HE / EN).
 * Deterministic — no random ids, no wall-clock reads inside pure
 * helpers; all timestamps flow through an injectable `now()` clock
 * so tests can pin time.
 *
 * -------------------------------------------------------------
 * RULE: לא מוחקים רק משדרגים ומגדלים
 * -------------------------------------------------------------
 * Schemas, tag taxonomies, metadata applications and tag
 * assignments are APPEND-ONLY. Every mutation creates a new
 * version / history event; the prior state is preserved and
 * reachable through `metadataHistory()` and `listTagHistory()`.
 *
 *   • defineSchema(...)       upgrades version, keeps history
 *   • defineTagTaxonomy(...)  upgrades version, keeps history
 *   • tagDocument(...)        appends to the tag-history log
 *   • bulkRetag(...)          copies the target tag onto matches,
 *                             marks the source tag as `retired` —
 *                             NEVER removes documents or tags.
 *   • applySchema(...)        stores a new metadata snapshot and
 *                             pushes the previous one onto history.
 *
 * -------------------------------------------------------------
 * DOMAIN MODEL
 * -------------------------------------------------------------
 *
 *   Schema {
 *     name, version, created_at,
 *     fields: Field[]
 *   }
 *
 *   Field {
 *     name,
 *     type      — 'string' | 'number' | 'date' | 'boolean' |
 *                 'enum'   | 'reference' | 'array'
 *     required?          (default false)
 *     default?           (applied when metadata omits the field)
 *     language?          'he' | 'en' | 'both'  (documentation)
 *     validation? {
 *       min?, max?,               // number / string length / date
 *       pattern?,                 // RegExp source (string form)
 *       values?,                  // enum list
 *       itemType?,                // array item type
 *       refSchema?,               // reference target schema name
 *       label_he?, label_en?      // bilingual labels
 *     }
 *   }
 *
 *   Tag {
 *     id, name_he, name_en, parent, children: Set,
 *     synonyms: Set<string>, color,
 *     created_at, retired_at?
 *   }
 *
 *   TagAssignment {
 *     docId, tagId, user, at, source?: 'manual'|'auto'|'bulk'
 *   }
 *
 *   MetadataRecord {
 *     docId, schemaName, metadata, at, user?, previous?
 *   }
 *
 * -------------------------------------------------------------
 * PUBLIC API (class `MetadataManager`)
 * -------------------------------------------------------------
 *
 *   defineSchema({name, fields})
 *   getSchema(name)
 *   getSchemaHistory(name)
 *   listSchemas()
 *   applySchema({docId, schemaName, metadata, user})
 *   getMetadata(docId, schemaName?)
 *   metadataHistory(docId)
 *   enforceRequiredFields({docId, schemaName})
 *   facetValues(schemaName, field)
 *
 *   defineTagTaxonomy({tags})
 *   listTags({includeRetired?})
 *   getTag(id)
 *   getTagTree()
 *   synonymMatch(term)
 *   tagDocument(docId, tagIds, user)
 *   untagDocument(docId, tagIds, user)   // soft, append-only
 *   autoTag({docId, content, rules})
 *   listByTag(tagIds, {mode: 'any'|'all', includeDescendants?})
 *   bulkRetag({sourceTag, targetTag, user})
 *   tagFrequency(period)
 *   unusedTags()
 *   propagateMetadata({docId, toChildren, schemaName, fields?, user})
 *   linkChild(parentDocId, childDocId)
 *
 * -------------------------------------------------------------
 * CONVENTIONS
 * -------------------------------------------------------------
 *
 *   • Timestamps are epoch milliseconds (Number), not Date objects.
 *   • Ids are deterministic when created from (name + version) or
 *     passed explicitly — never random.
 *   • Every Map / Set that represents an aggregate is exposed as a
 *     plain Object / Array from the public API for serialisability.
 *   • Errors are thrown with stable codes on `err.code` so callers
 *     can branch without string-matching.
 */

'use strict';

// ════════════════════════════════════════════════════════════
// Constants & small helpers
// ════════════════════════════════════════════════════════════

const FIELD_TYPES = Object.freeze([
  'string', 'number', 'date', 'boolean', 'enum', 'reference', 'array',
]);

const TAG_SOURCES = Object.freeze(['manual', 'auto', 'bulk', 'propagate']);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Shallow check: value is a non-null plain object (not array). */
function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** Deep clone via JSON (sufficient for plain metadata payloads). */
function clone(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

/** Strict error helper — attaches `code` for programmatic checks. */
function mkErr(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * Normalise a term for synonym matching: lowercases Latin, strips
 * Hebrew nikud, trims punctuation/whitespace. Preserves Hebrew
 * letters themselves.
 */
function normTerm(s) {
  if (s == null) return '';
  return String(s)
    .normalize('NFKC')
    .replace(/[\u0591-\u05C7]/g, '')   // Hebrew nikud
    .replace(/[^\p{L}\p{N}]+/gu, ' ')  // punct/whitespace → space
    .trim()
    .toLowerCase();
}

/**
 * Dot-path getter: `get(obj, 'a.b.c')`. Tolerates missing segments.
 */
function getPath(obj, path) {
  if (obj == null || !path) return undefined;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Validate a single value against a schema field. Returns
 * `{ok, value, error?}`. Applies `default` if value is undefined
 * and no default is set, `ok:false` when required.
 */
function validateField(field, rawValue) {
  const v = field.validation || {};
  let value = rawValue;

  if (value === undefined) {
    if (field.default !== undefined) value = clone(field.default);
    else if (field.required) {
      return {
        ok: false,
        value: undefined,
        error: `required field "${field.name}" missing`,
      };
    } else {
      return { ok: true, value: undefined };
    }
  }

  if (value === null) {
    if (field.required) {
      return {
        ok: false,
        value: null,
        error: `required field "${field.name}" is null`,
      };
    }
    return { ok: true, value: null };
  }

  switch (field.type) {
    case 'string': {
      if (typeof value !== 'string') {
        return { ok: false, value, error: `"${field.name}" must be string` };
      }
      if (v.min != null && value.length < v.min) {
        return { ok: false, value, error: `"${field.name}" shorter than ${v.min}` };
      }
      if (v.max != null && value.length > v.max) {
        return { ok: false, value, error: `"${field.name}" longer than ${v.max}` };
      }
      if (v.pattern) {
        const re = v.pattern instanceof RegExp ? v.pattern : new RegExp(v.pattern);
        if (!re.test(value)) {
          return { ok: false, value, error: `"${field.name}" failed pattern` };
        }
      }
      return { ok: true, value };
    }
    case 'number': {
      const num = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(num)) {
        return { ok: false, value, error: `"${field.name}" must be finite number` };
      }
      if (v.min != null && num < v.min) {
        return { ok: false, value, error: `"${field.name}" < ${v.min}` };
      }
      if (v.max != null && num > v.max) {
        return { ok: false, value, error: `"${field.name}" > ${v.max}` };
      }
      return { ok: true, value: num };
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        return { ok: false, value, error: `"${field.name}" must be boolean` };
      }
      return { ok: true, value };
    }
    case 'date': {
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) {
        return { ok: false, value, error: `"${field.name}" must be valid date` };
      }
      const ts = d.getTime();
      if (v.min != null) {
        const minTs = v.min instanceof Date ? v.min.getTime() : new Date(v.min).getTime();
        if (Number.isFinite(minTs) && ts < minTs) {
          return { ok: false, value, error: `"${field.name}" before minimum date` };
        }
      }
      if (v.max != null) {
        const maxTs = v.max instanceof Date ? v.max.getTime() : new Date(v.max).getTime();
        if (Number.isFinite(maxTs) && ts > maxTs) {
          return { ok: false, value, error: `"${field.name}" after maximum date` };
        }
      }
      return { ok: true, value: ts };
    }
    case 'enum': {
      const list = Array.isArray(v.values) ? v.values : [];
      if (!list.includes(value)) {
        return {
          ok: false,
          value,
          error: `"${field.name}" not in enum [${list.join('|')}]`,
        };
      }
      return { ok: true, value };
    }
    case 'reference': {
      if (typeof value !== 'string' || value.length === 0) {
        return { ok: false, value, error: `"${field.name}" reference must be non-empty string` };
      }
      return { ok: true, value };
    }
    case 'array': {
      if (!Array.isArray(value)) {
        return { ok: false, value, error: `"${field.name}" must be array` };
      }
      if (v.min != null && value.length < v.min) {
        return { ok: false, value, error: `"${field.name}" array shorter than ${v.min}` };
      }
      if (v.max != null && value.length > v.max) {
        return { ok: false, value, error: `"${field.name}" array longer than ${v.max}` };
      }
      if (v.itemType) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          const t = typeof item;
          if (v.itemType === 'string' && t !== 'string') {
            return { ok: false, value, error: `"${field.name}[${i}]" must be string` };
          }
          if (v.itemType === 'number' && t !== 'number') {
            return { ok: false, value, error: `"${field.name}[${i}]" must be number` };
          }
          if (v.itemType === 'boolean' && t !== 'boolean') {
            return { ok: false, value, error: `"${field.name}[${i}]" must be boolean` };
          }
        }
      }
      return { ok: true, value: value.slice() };
    }
    default:
      return { ok: false, value, error: `unknown field type "${field.type}"` };
  }
}

/**
 * Compile a normalised schema from user input. Throws on bad input.
 */
function compileSchema(input) {
  if (!isPlainObject(input)) {
    throw mkErr('E_SCHEMA_INVALID', 'schema input must be an object');
  }
  if (!input.name || typeof input.name !== 'string') {
    throw mkErr('E_SCHEMA_NAME', 'schema requires a string `name`');
  }
  if (!Array.isArray(input.fields) || input.fields.length === 0) {
    throw mkErr('E_SCHEMA_FIELDS', 'schema requires non-empty `fields` array');
  }
  const seen = new Set();
  const fields = input.fields.map((f, idx) => {
    if (!isPlainObject(f)) {
      throw mkErr('E_SCHEMA_FIELD', `field[${idx}] must be an object`);
    }
    if (!f.name || typeof f.name !== 'string') {
      throw mkErr('E_SCHEMA_FIELD', `field[${idx}] requires a string name`);
    }
    if (seen.has(f.name)) {
      throw mkErr('E_SCHEMA_FIELD', `duplicate field name "${f.name}"`);
    }
    seen.add(f.name);
    if (!FIELD_TYPES.includes(f.type)) {
      throw mkErr('E_SCHEMA_FIELD',
        `field "${f.name}" type must be one of ${FIELD_TYPES.join('|')}`);
    }
    const language = f.language == null ? 'both' : String(f.language);
    if (!['he', 'en', 'both'].includes(language)) {
      throw mkErr('E_SCHEMA_FIELD',
        `field "${f.name}" language must be he|en|both`);
    }
    // Validate enum field has `values`
    if (f.type === 'enum') {
      const values = f.validation && Array.isArray(f.validation.values)
        ? f.validation.values
        : null;
      if (!values || values.length === 0) {
        throw mkErr('E_SCHEMA_FIELD',
          `enum field "${f.name}" requires validation.values[]`);
      }
    }
    return {
      name: f.name,
      type: f.type,
      required: !!f.required,
      default: f.default === undefined ? undefined : clone(f.default),
      language,
      validation: f.validation ? clone(f.validation) : {},
    };
  });
  return { name: input.name, fields };
}

/**
 * Build a deterministic, human-readable document id when caller
 * doesn't provide one (used in rare test helpers — most callers
 * pass docId explicitly).
 */
function autoId(prefix, n) {
  return `${prefix}-${String(n).padStart(6, '0')}`;
}

// ════════════════════════════════════════════════════════════
// MetadataManager class
// ════════════════════════════════════════════════════════════

class MetadataManager {
  /**
   * @param {object} [opts]
   * @param {() => number} [opts.now] injectable clock (epoch ms)
   */
  constructor(opts) {
    const o = opts || {};
    this._now = typeof o.now === 'function' ? o.now : Date.now;

    // name → latest compiled schema { name, version, created_at, fields[] }
    this._schemas = new Map();
    // name → [ schema snapshots in insertion order, newest last ]
    this._schemaHistory = new Map();

    // docId → { schemaName → MetadataRecord }
    this._metadata = new Map();
    // docId → MetadataRecord[]  (append-only, newest last)
    this._metaHistory = new Map();

    // Tag taxonomy — newest version; previous ones live in _taxonomyHistory
    // tagId → Tag
    this._tags = new Map();
    this._taxonomyVersion = 0;
    this._taxonomyHistory = []; // array of {version, at, tags:[...]}

    // Synonyms — normalised term → tagId
    this._synonymIndex = new Map();

    // docId → Set<tagId>
    this._docTags = new Map();
    // tagId → Set<docId>
    this._tagDocs = new Map();
    // full assignment log (append-only)
    this._tagLog = []; // {docId, tagId, user, at, source, action:'add'|'retire'}

    // Document parent→children index (for propagation)
    // parentDocId → Set<childDocId>
    this._children = new Map();

    // internal id counter for assignments (deterministic)
    this._logSeq = 0;
  }

  // ──────────────────────────────────────────────────────────
  // SCHEMA management
  // ──────────────────────────────────────────────────────────

  /**
   * Define (or upgrade) a typed metadata schema. Upgrading is
   * additive: prior versions remain in `getSchemaHistory(name)`.
   */
  defineSchema(input) {
    const compiled = compileSchema(input);
    const prior = this._schemas.get(compiled.name);
    const version = prior ? prior.version + 1 : 1;
    const schema = {
      name: compiled.name,
      version,
      created_at: this._now(),
      fields: compiled.fields,
    };
    this._schemas.set(schema.name, schema);
    const hist = this._schemaHistory.get(schema.name) || [];
    hist.push(schema);
    this._schemaHistory.set(schema.name, hist);
    return clone(schema);
  }

  /** Fetch the latest compiled schema by name, or null. */
  getSchema(name) {
    const s = this._schemas.get(name);
    return s ? clone(s) : null;
  }

  /** Full append-only schema version history. */
  getSchemaHistory(name) {
    const hist = this._schemaHistory.get(name);
    return hist ? hist.map(clone) : [];
  }

  /** All schema names (sorted). */
  listSchemas() {
    return Array.from(this._schemas.keys()).sort();
  }

  // ──────────────────────────────────────────────────────────
  // METADATA application
  // ──────────────────────────────────────────────────────────

  /**
   * Validate `metadata` against `schemaName` and store it against
   * `docId`. Prior metadata for the same (doc, schema) pair is
   * preserved in history. Returns the stored record.
   *
   * Throws E_SCHEMA_MISSING / E_METADATA_INVALID on failure.
   */
  applySchema(input) {
    if (!isPlainObject(input)) {
      throw mkErr('E_METADATA_INVALID', 'applySchema requires an object');
    }
    const { docId, schemaName, metadata, user } = input;
    if (!docId || typeof docId !== 'string') {
      throw mkErr('E_METADATA_INVALID', '`docId` must be a string');
    }
    const schema = this._schemas.get(schemaName);
    if (!schema) {
      throw mkErr('E_SCHEMA_MISSING',
        `schema "${schemaName}" is not defined`);
    }
    const input_md = isPlainObject(metadata) ? metadata : {};
    const out = {};
    const errors = [];
    for (const field of schema.fields) {
      const raw = input_md[field.name];
      const res = validateField(field, raw);
      if (!res.ok) {
        errors.push(res.error);
      } else if (res.value !== undefined) {
        out[field.name] = res.value;
      }
    }
    // Unknown fields are permitted but preserved alongside — they
    // are reported in errors only if the schema explicitly forbids
    // extras (future extension). Keep them:
    for (const k of Object.keys(input_md)) {
      if (!(k in out) && !schema.fields.some((f) => f.name === k)) {
        out[k] = clone(input_md[k]);
      }
    }
    if (errors.length > 0) {
      const err = mkErr('E_METADATA_INVALID',
        `metadata validation failed: ${errors.join('; ')}`);
      err.errors = errors;
      throw err;
    }
    const record = {
      docId,
      schemaName,
      schemaVersion: schema.version,
      metadata: out,
      at: this._now(),
      user: user || null,
    };
    // Preserve previous record (if any) in history
    const perDoc = this._metadata.get(docId) || new Map();
    const prev = perDoc.get(schemaName);
    if (prev) {
      record.previous = { version: prev.schemaVersion, at: prev.at };
    }
    perDoc.set(schemaName, record);
    this._metadata.set(docId, perDoc);

    const hist = this._metaHistory.get(docId) || [];
    hist.push(clone(record));
    this._metaHistory.set(docId, hist);

    return clone(record);
  }

  /**
   * Fetch the current metadata for a document. With `schemaName`
   * returns that single record; without, returns a map of
   * { schemaName → record }.
   */
  getMetadata(docId, schemaName) {
    const perDoc = this._metadata.get(docId);
    if (!perDoc) return schemaName ? null : {};
    if (schemaName) {
      const rec = perDoc.get(schemaName);
      return rec ? clone(rec) : null;
    }
    const out = {};
    for (const [name, rec] of perDoc.entries()) out[name] = clone(rec);
    return out;
  }

  /** All metadata change events for a document. */
  metadataHistory(docId) {
    const hist = this._metaHistory.get(docId) || [];
    return hist.map(clone);
  }

  /**
   * Validate that all required fields for `schemaName` are present
   * in the document's current metadata. Returns
   * `{ ok, missing: string[], invalid: string[] }` without throwing.
   */
  enforceRequiredFields(input) {
    if (!isPlainObject(input)) {
      throw mkErr('E_METADATA_INVALID',
        'enforceRequiredFields requires an object');
    }
    const { docId, schemaName } = input;
    const schema = this._schemas.get(schemaName);
    if (!schema) {
      throw mkErr('E_SCHEMA_MISSING',
        `schema "${schemaName}" is not defined`);
    }
    const perDoc = this._metadata.get(docId);
    const rec = perDoc ? perDoc.get(schemaName) : null;
    const current = rec ? rec.metadata : {};
    const missing = [];
    const invalid = [];
    for (const field of schema.fields) {
      if (!field.required) continue;
      const v = current[field.name];
      if (v === undefined || v === null || v === '') {
        missing.push(field.name);
        continue;
      }
      const res = validateField(field, v);
      if (!res.ok) invalid.push(field.name);
    }
    return { ok: missing.length === 0 && invalid.length === 0, missing, invalid };
  }

  /**
   * Distinct values of `field` across every doc that has metadata
   * for `schemaName`. Returns `[{ value, count }]` sorted by count
   * descending then value ascending (deterministic).
   */
  facetValues(schemaName, field) {
    const schema = this._schemas.get(schemaName);
    if (!schema) {
      throw mkErr('E_SCHEMA_MISSING',
        `schema "${schemaName}" is not defined`);
    }
    const counts = new Map();
    for (const perDoc of this._metadata.values()) {
      const rec = perDoc.get(schemaName);
      if (!rec) continue;
      const val = rec.metadata[field];
      if (val === undefined) continue;
      if (Array.isArray(val)) {
        for (const item of val) {
          const key = JSON.stringify(item);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      } else {
        const key = JSON.stringify(val);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const out = Array.from(counts.entries()).map(([k, count]) => ({
      value: JSON.parse(k),
      count,
    }));
    out.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const av = String(a.value);
      const bv = String(b.value);
      return av < bv ? -1 : av > bv ? 1 : 0;
    });
    return out;
  }

  // ──────────────────────────────────────────────────────────
  // TAG taxonomy
  // ──────────────────────────────────────────────────────────

  /**
   * Define (or upgrade) the bilingual hierarchical tag taxonomy.
   * Calling a second time is additive: existing tags are kept,
   * new tags are inserted, and parent links are wired.
   *
   * A tag is identified by `id`; if omitted the id defaults to
   * `normTerm(name_en || name_he)`. Providing synonyms indexes
   * them for `synonymMatch`.
   */
  defineTagTaxonomy(input) {
    if (!isPlainObject(input) || !Array.isArray(input.tags)) {
      throw mkErr('E_TAX_INVALID',
        'defineTagTaxonomy requires { tags: [...] }');
    }
    this._taxonomyVersion += 1;
    const at = this._now();
    const inserted = [];
    for (const t of input.tags) {
      if (!isPlainObject(t)) {
        throw mkErr('E_TAX_INVALID', 'each tag must be an object');
      }
      if (!t.name_he && !t.name_en) {
        throw mkErr('E_TAX_INVALID',
          'each tag requires at least one of name_he / name_en');
      }
      const id = t.id || normTerm(t.name_en || t.name_he).replace(/\s+/g, '-');
      if (!id) {
        throw mkErr('E_TAX_INVALID', 'could not derive tag id');
      }
      const parent = t.parent || null;
      if (parent && !this._tags.has(parent)
                 && !input.tags.some((x) => (x.id || normTerm(x.name_en || x.name_he).replace(/\s+/g, '-')) === parent)) {
        throw mkErr('E_TAX_INVALID',
          `tag "${id}" references unknown parent "${parent}"`);
      }
      const existing = this._tags.get(id);
      const tag = existing || {
        id,
        name_he: t.name_he || '',
        name_en: t.name_en || '',
        parent: parent,
        children: new Set(),
        synonyms: new Set(),
        color: t.color || null,
        created_at: at,
        retired_at: null,
      };
      // Upgrade — never remove fields, only fill gaps / extend
      if (t.name_he) tag.name_he = t.name_he;
      if (t.name_en) tag.name_en = t.name_en;
      if (t.color) tag.color = t.color;
      if (parent != null) tag.parent = parent;
      if (Array.isArray(t.synonyms)) {
        for (const syn of t.synonyms) tag.synonyms.add(String(syn));
      }
      // Auto-include primary names as synonyms too
      if (tag.name_he) tag.synonyms.add(tag.name_he);
      if (tag.name_en) tag.synonyms.add(tag.name_en);
      this._tags.set(id, tag);
      inserted.push(id);
    }
    // Second pass: wire children and build synonym index
    for (const id of inserted) {
      const tag = this._tags.get(id);
      if (tag.parent) {
        const parent = this._tags.get(tag.parent);
        if (parent) parent.children.add(id);
      }
      for (const syn of tag.synonyms) {
        const key = normTerm(syn);
        if (!key) continue;
        // Never overwrite an earlier mapping (append-only);
        // but allow a tag's own canonical entry to win over
        // someone else's later synonym for the same term.
        if (!this._synonymIndex.has(key)) {
          this._synonymIndex.set(key, id);
        }
      }
    }
    // Snapshot a version
    this._taxonomyHistory.push({
      version: this._taxonomyVersion,
      at,
      tagIds: inserted.slice(),
    });
    return {
      version: this._taxonomyVersion,
      inserted: inserted.slice(),
    };
  }

  /** Return all tags (optionally including retired). */
  listTags(opts) {
    const o = opts || {};
    const out = [];
    for (const t of this._tags.values()) {
      if (!o.includeRetired && t.retired_at) continue;
      out.push(this._exportTag(t));
    }
    out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return out;
  }

  /** Get a single tag (live — includes retired). */
  getTag(id) {
    const t = this._tags.get(id);
    return t ? this._exportTag(t) : null;
  }

  /**
   * Compute the hierarchical forest view of the taxonomy.
   * Returns an array of roots, each a { ...tag, children: Tree[] }.
   */
  getTagTree() {
    const roots = [];
    const build = (tag) => {
      const node = this._exportTag(tag);
      node.children = [];
      for (const childId of tag.children) {
        const child = this._tags.get(childId);
        if (child) node.children.push(build(child));
      }
      node.children.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return node;
    };
    for (const tag of this._tags.values()) {
      if (!tag.parent) roots.push(build(tag));
    }
    roots.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return roots;
  }

  /**
   * Find a tag by a Hebrew or English synonym / canonical name.
   * Returns the matched tag or null.
   */
  synonymMatch(term) {
    const key = normTerm(term);
    if (!key) return null;
    // 1. exact synonym hit
    const direct = this._synonymIndex.get(key);
    if (direct) {
      const t = this._tags.get(direct);
      if (t) return this._exportTag(t);
    }
    // 2. token-by-token fallback (first token matching any synonym)
    const tokens = key.split(' ').filter(Boolean);
    for (const tok of tokens) {
      const id = this._synonymIndex.get(tok);
      if (id) {
        const t = this._tags.get(id);
        if (t) return this._exportTag(t);
      }
    }
    return null;
  }

  /**
   * Apply `tagIds` to a document. Previously applied tags are
   * preserved — this is additive. Logs an append-only event per
   * tag.
   */
  tagDocument(docId, tagIds, user, source) {
    if (!docId || typeof docId !== 'string') {
      throw mkErr('E_TAG_INVALID', 'docId must be a non-empty string');
    }
    if (!Array.isArray(tagIds)) {
      throw mkErr('E_TAG_INVALID', 'tagIds must be an array');
    }
    const src = TAG_SOURCES.includes(source) ? source : 'manual';
    const at = this._now();
    const docSet = this._docTags.get(docId) || new Set();
    const added = [];
    for (const rawId of tagIds) {
      const id = String(rawId);
      const tag = this._tags.get(id);
      if (!tag) {
        throw mkErr('E_TAG_MISSING', `tag "${id}" is not defined`);
      }
      if (tag.retired_at) {
        throw mkErr('E_TAG_RETIRED',
          `tag "${id}" is retired; use its replacement`);
      }
      if (docSet.has(id)) continue;
      docSet.add(id);
      const tagDocSet = this._tagDocs.get(id) || new Set();
      tagDocSet.add(docId);
      this._tagDocs.set(id, tagDocSet);
      this._logSeq += 1;
      this._tagLog.push({
        seq: this._logSeq,
        action: 'add',
        docId,
        tagId: id,
        user: user || null,
        at,
        source: src,
      });
      added.push(id);
    }
    this._docTags.set(docId, docSet);
    return { docId, added, total: docSet.size };
  }

  /**
   * Soft-remove tags from a document. The tag is still reachable
   * in the append-only log and in `listTagHistory()`. If no tagIds
   * are supplied, all tags on the doc are soft-removed.
   */
  untagDocument(docId, tagIds, user) {
    const docSet = this._docTags.get(docId);
    if (!docSet) return { docId, removed: [] };
    const ids = Array.isArray(tagIds) && tagIds.length > 0
      ? tagIds
      : Array.from(docSet);
    const at = this._now();
    const removed = [];
    for (const rawId of ids) {
      const id = String(rawId);
      if (!docSet.has(id)) continue;
      docSet.delete(id);
      const tagDocSet = this._tagDocs.get(id);
      if (tagDocSet) tagDocSet.delete(docId);
      this._logSeq += 1;
      this._tagLog.push({
        seq: this._logSeq,
        action: 'retire',
        docId,
        tagId: id,
        user: user || null,
        at,
        source: 'manual',
      });
      removed.push(id);
    }
    if (docSet.size === 0) this._docTags.delete(docId);
    else this._docTags.set(docId, docSet);
    return { docId, removed };
  }

  /**
   * Rule-based auto-tagging: given a document's text `content`,
   * evaluate each rule and apply matching tags.
   *
   * Rule shape:
   *   { tagId, match: { any?:[], all?:[] }, caseSensitive?:bool }
   * Each entry in `any` / `all` is a string — substring match
   * against `content` after `normTerm` (so Hebrew + English work).
   *
   * Alternatively, passing `rules` as undefined falls back to
   * matching any tag whose synonym appears in `content`.
   */
  autoTag(input) {
    if (!isPlainObject(input)) {
      throw mkErr('E_AUTOTAG_INVALID', 'autoTag requires an object');
    }
    const { docId, content, rules, user } = input;
    if (!docId) throw mkErr('E_AUTOTAG_INVALID', 'docId required');
    if (typeof content !== 'string') {
      throw mkErr('E_AUTOTAG_INVALID', 'content must be string');
    }
    const norm = normTerm(content);
    const hits = new Set();

    if (Array.isArray(rules) && rules.length > 0) {
      for (const r of rules) {
        if (!isPlainObject(r) || !r.tagId) continue;
        const match = isPlainObject(r.match) ? r.match : {};
        const any = Array.isArray(match.any) ? match.any : [];
        const all = Array.isArray(match.all) ? match.all : [];
        const cs = !!r.caseSensitive;
        const hay = cs ? content : norm;
        const mk = (s) => (cs ? String(s) : normTerm(s));
        const anyOk = any.length === 0
          ? true
          : any.some((s) => hay.includes(mk(s)));
        const allOk = all.length === 0
          ? true
          : all.every((s) => hay.includes(mk(s)));
        if (anyOk && allOk && this._tags.has(r.tagId)) {
          hits.add(r.tagId);
        }
      }
    } else {
      // Fallback: synonym-driven discovery
      for (const [term, tagId] of this._synonymIndex.entries()) {
        if (!term) continue;
        if (norm.includes(term)) hits.add(tagId);
      }
    }

    const tagIds = Array.from(hits).filter(
      (id) => {
        const t = this._tags.get(id);
        return t && !t.retired_at;
      },
    );
    if (tagIds.length === 0) return { docId, added: [], total: 0 };
    return this.tagDocument(docId, tagIds, user || 'auto-tagger', 'auto');
  }

  /**
   * List documents carrying the given tag(s).
   * `mode` = 'any' (union, default) or 'all' (intersection).
   * When `includeDescendants` is true, each queried tag expands to
   * itself + every descendant tag in the taxonomy.
   */
  listByTag(tagIds, options) {
    const o = options || {};
    const mode = o.mode === 'all' ? 'all' : (o.all ? 'all' : (o.any ? 'any' : 'any'));
    const ids = Array.isArray(tagIds) ? tagIds.slice() : [String(tagIds)];
    const expanded = new Set();
    for (const id of ids) {
      if (!this._tags.has(id)) continue;
      if (o.includeDescendants) {
        for (const d of this._descendantIds(id)) expanded.add(d);
      } else {
        expanded.add(id);
      }
    }
    if (expanded.size === 0) return [];
    if (mode === 'all') {
      // intersection of doc sets for the original (unexpanded) ids,
      // each expanded to its descendant union.
      const sets = [];
      for (const id of ids) {
        const descendantIds = o.includeDescendants
          ? Array.from(this._descendantIds(id))
          : [id];
        const union = new Set();
        for (const d of descendantIds) {
          const ds = this._tagDocs.get(d);
          if (ds) for (const x of ds) union.add(x);
        }
        sets.push(union);
      }
      if (sets.length === 0) return [];
      sets.sort((a, b) => a.size - b.size);
      const out = [];
      outer: for (const docId of sets[0]) {
        for (let i = 1; i < sets.length; i++) {
          if (!sets[i].has(docId)) continue outer;
        }
        out.push(docId);
      }
      return out.sort();
    }
    // any
    const seen = new Set();
    for (const id of expanded) {
      const ds = this._tagDocs.get(id);
      if (ds) for (const x of ds) seen.add(x);
    }
    return Array.from(seen).sort();
  }

  /**
   * Re-tag every document that carries `sourceTag` with
   * `targetTag` and mark `sourceTag` as retired. The source tag
   * itself, its history and its prior assignments remain visible
   * — this is an upgrade, not a delete.
   */
  bulkRetag(input) {
    if (!isPlainObject(input)) {
      throw mkErr('E_BULK_INVALID', 'bulkRetag requires an object');
    }
    const { sourceTag, targetTag, user } = input;
    if (!this._tags.has(sourceTag)) {
      throw mkErr('E_TAG_MISSING', `source tag "${sourceTag}" missing`);
    }
    if (!this._tags.has(targetTag)) {
      throw mkErr('E_TAG_MISSING', `target tag "${targetTag}" missing`);
    }
    if (sourceTag === targetTag) {
      throw mkErr('E_BULK_INVALID', 'source and target must differ');
    }
    const src = this._tags.get(sourceTag);
    const tgt = this._tags.get(targetTag);
    if (tgt.retired_at) {
      throw mkErr('E_TAG_RETIRED', 'target tag is retired');
    }
    const at = this._now();
    const srcDocs = this._tagDocs.get(sourceTag) || new Set();
    const touched = [];
    for (const docId of srcDocs) {
      const docSet = this._docTags.get(docId);
      if (!docSet) continue;
      if (!docSet.has(targetTag)) {
        docSet.add(targetTag);
        const tgtDocSet = this._tagDocs.get(targetTag) || new Set();
        tgtDocSet.add(docId);
        this._tagDocs.set(targetTag, tgtDocSet);
        this._logSeq += 1;
        this._tagLog.push({
          seq: this._logSeq,
          action: 'add',
          docId,
          tagId: targetTag,
          user: user || 'bulk',
          at,
          source: 'bulk',
        });
        touched.push(docId);
      }
    }
    // Retire the source — tag itself stays, only marked retired_at
    src.retired_at = at;
    // Synonym index is left intact: synonymMatch will still route
    // callers to the retired tag by name, and `listByTag` still
    // returns its prior documents.
    return {
      source: sourceTag,
      target: targetTag,
      moved: touched.length,
      docs: touched.sort(),
    };
  }

  /**
   * Tag frequency over an optional `period` = { from, to } epoch ms.
   * Returns `[{ tagId, count, name_he, name_en }]` sorted by count
   * descending (ties broken by tagId).
   */
  tagFrequency(period) {
    const from = period && period.from != null ? period.from : -Infinity;
    const to   = period && period.to   != null ? period.to   :  Infinity;
    const counts = new Map();
    for (const ev of this._tagLog) {
      if (ev.action !== 'add') continue;
      if (ev.at < from || ev.at > to) continue;
      counts.set(ev.tagId, (counts.get(ev.tagId) || 0) + 1);
    }
    const out = [];
    for (const [tagId, count] of counts.entries()) {
      const t = this._tags.get(tagId);
      out.push({
        tagId,
        count,
        name_he: t ? t.name_he : '',
        name_en: t ? t.name_en : '',
      });
    }
    out.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.tagId < b.tagId ? -1 : 1;
    });
    return out;
  }

  /** Tags defined in the taxonomy that have never been applied. */
  unusedTags() {
    const out = [];
    for (const t of this._tags.values()) {
      const ds = this._tagDocs.get(t.id);
      if (!ds || ds.size === 0) out.push(this._exportTag(t));
    }
    out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return out;
  }

  /** Full append-only tag event log for a single doc. */
  listTagHistory(docId) {
    return this._tagLog
      .filter((ev) => ev.docId === docId)
      .map((ev) => ({ ...ev }));
  }

  // ──────────────────────────────────────────────────────────
  // Parent/child relationships + propagation
  // ──────────────────────────────────────────────────────────

  /** Record `childDocId` as a child of `parentDocId`. */
  linkChild(parentDocId, childDocId) {
    if (!parentDocId || !childDocId) {
      throw mkErr('E_LINK_INVALID', 'parent and child required');
    }
    const set = this._children.get(parentDocId) || new Set();
    set.add(childDocId);
    this._children.set(parentDocId, set);
    return { parent: parentDocId, child: childDocId };
  }

  /**
   * Propagate the parent's metadata (for a single schema) to every
   * child document linked via `linkChild`. Optionally restrict to a
   * subset of `fields`. Each child receives the merged metadata,
   * which goes through `applySchema` so it gets validated.
   */
  propagateMetadata(input) {
    if (!isPlainObject(input)) {
      throw mkErr('E_PROP_INVALID', 'propagateMetadata requires an object');
    }
    const { docId, toChildren, schemaName, fields, user } = input;
    if (toChildren !== true) return { docId, applied: [] };
    const parentMeta = this.getMetadata(docId, schemaName);
    if (!parentMeta) return { docId, applied: [] };
    const children = this._children.get(docId);
    if (!children || children.size === 0) return { docId, applied: [] };
    const pick = Array.isArray(fields) && fields.length > 0 ? fields : null;
    const applied = [];
    for (const child of children) {
      const childPerDoc = this._metadata.get(child);
      const childRec = childPerDoc ? childPerDoc.get(schemaName) : null;
      const base = childRec ? clone(childRec.metadata) : {};
      const src  = parentMeta.metadata || {};
      if (pick) {
        for (const k of pick) if (src[k] !== undefined) base[k] = clone(src[k]);
      } else {
        for (const k of Object.keys(src)) base[k] = clone(src[k]);
      }
      this.applySchema({
        docId: child,
        schemaName,
        metadata: base,
        user: user || 'propagation',
      });
      applied.push(child);
    }
    return { docId, applied: applied.sort() };
  }

  // ──────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────

  /** Serialise a tag for public consumption. */
  _exportTag(t) {
    return {
      id: t.id,
      name_he: t.name_he,
      name_en: t.name_en,
      parent: t.parent,
      children: Array.from(t.children).sort(),
      synonyms: Array.from(t.synonyms).sort(),
      color: t.color,
      created_at: t.created_at,
      retired_at: t.retired_at,
    };
  }

  /** Collect tagId + every descendant id (inclusive). */
  _descendantIds(tagId) {
    const out = new Set();
    const walk = (id) => {
      if (out.has(id)) return;
      out.add(id);
      const t = this._tags.get(id);
      if (!t) return;
      for (const c of t.children) walk(c);
    };
    walk(tagId);
    return out;
  }
}

// ════════════════════════════════════════════════════════════
// Exports
// ════════════════════════════════════════════════════════════

module.exports = {
  MetadataManager,
  FIELD_TYPES,
  TAG_SOURCES,
  MS_PER_DAY,
  _internal: {
    compileSchema,
    validateField,
    normTerm,
    getPath,
    autoId,
  },
};
