# AG-Y113 — Metadata & Tag Manager

**Agent:** Y-113 — Swarm Documents
**System:** Techno-Kol Uzi Mega-ERP (Israeli) — Wave 2026
**Module:** `onyx-procurement/src/documents/metadata-manager.js`
**Test:** `onyx-procurement/test/documents/metadata-manager.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — מטרה

Every document and asset that flows through the ERP (invoices,
permits, drawings, contracts, photos, subcontractor CVs, bank
statements, customs papers, ...) needs two things the core file
store does not provide on its own:

1. **Typed metadata** — a schema with strong per-field validation
   so a user cannot file an invoice missing its `amount` or a
   permit without an `issued_on` date.
2. **Bilingual tags** — a hierarchical taxonomy where the same tag
   is addressable by Hebrew and English names (`חשבונית` ↔
   `Invoice`), with synonyms, auto-tagging and re-tagging.

This module delivers both in one zero-dependency class
(`MetadataManager`). It is storage-agnostic (pure in-memory) and
designed to be wrapped later by a persistence adapter without
changing the public API.

### Characteristics

- **Zero dependencies.** Node built-ins only — no npm packages,
  no imports.
- **Bilingual.** Every tag carries `name_he` / `name_en`; schemas
  support a `language` marker per field; synonym index matches
  Hebrew with nikud stripped and Latin case-folded.
- **Deterministic.** All timestamps flow through an injectable
  `now()` clock so tests can pin time.
- **Append-only.** Schemas, taxonomy versions, metadata records
  and tag assignments are never dropped — upgrades bump a version
  number and keep the prior state in history.
- **Fail-soft.** Validation errors carry a stable `err.code` plus
  an `err.errors[]` array so callers can branch without
  string-matching.

---

## 2. Public API — ממשק ציבורי

```js
const { MetadataManager } = require(
  './src/documents/metadata-manager.js',
);

const mm = new MetadataManager();         // default clock = Date.now

// — Schemas —
mm.defineSchema({ name, fields });        // upgrade-aware
mm.getSchema(name);                       // current compiled schema
mm.getSchemaHistory(name);                // all versions
mm.listSchemas();                         // sorted name list

// — Metadata —
mm.applySchema({ docId, schemaName, metadata, user });
mm.getMetadata(docId, schemaName?);
mm.metadataHistory(docId);
mm.enforceRequiredFields({ docId, schemaName });
mm.facetValues(schemaName, field);

// — Taxonomy / tags —
mm.defineTagTaxonomy({ tags });           // upgrade-aware
mm.listTags({ includeRetired? });
mm.getTag(id);
mm.getTagTree();
mm.synonymMatch(term);
mm.tagDocument(docId, tagIds, user);
mm.untagDocument(docId, tagIds, user);
mm.autoTag({ docId, content, rules, user });
mm.listByTag(tagIds, { mode:'any'|'all', includeDescendants? });
mm.bulkRetag({ sourceTag, targetTag, user });
mm.tagFrequency(period);
mm.unusedTags();
mm.listTagHistory(docId);

// — Cascading metadata —
mm.linkChild(parentDocId, childDocId);
mm.propagateMetadata({ docId, toChildren:true,
                       schemaName, fields?, user });
```

Static exports:

| Name | Meaning |
|---|---|
| `FIELD_TYPES` | Frozen list of supported field types |
| `TAG_SOURCES` | Origin of a tag assignment: manual/auto/bulk/propagate |
| `MS_PER_DAY` | Convenience constant |
| `_internal` | `compileSchema`, `validateField`, `normTerm`, `getPath`, `autoId` for unit tests |

---

## 3. Schema Format — פורמט סכמה

A schema is a named, versioned collection of typed fields.

```js
mm.defineSchema({
  name: 'invoice',
  fields: [
    { name: 'number',   type: 'string',  required: true,
      validation: { min: 1, pattern: '^[A-Z0-9-]+$' } },
    { name: 'amount',   type: 'number',  required: true,
      validation: { min: 0 } },
    { name: 'currency', type: 'enum',    required: true,
      default: 'ILS',
      validation: { values: ['ILS','USD','EUR'] } },
    { name: 'issued_on', type: 'date',   required: true },
    { name: 'vat_registered', type: 'boolean', default: true },
    { name: 'supplier_ref', type: 'reference', required: true,
      validation: { refSchema: 'supplier' } },
    { name: 'tags', type: 'array',
      validation: { itemType: 'string', max: 20 } },
    { name: 'notes_he', type: 'string', language: 'he' },
  ],
});
```

### 3.1 Supported field types

| Type | Validation keys | Hebrew meaning |
|---|---|---|
| `string`    | `min`, `max`, `pattern`            | טקסט |
| `number`    | `min`, `max`                       | מספר |
| `date`      | `min`, `max` (ISO or Date)         | תאריך |
| `boolean`   | — | בוליאני |
| `enum`      | `values` (**required**)            | אופציה |
| `reference` | `refSchema` (documentation)        | הפניה |
| `array`     | `min`, `max`, `itemType`           | מערך |

### 3.2 Field options

| Key | Meaning |
|---|---|
| `required` | Reject metadata missing this field when applying |
| `default`  | Filled in when input omits the field |
| `language` | `he` / `en` / `both` — documentation for UI layer |
| `validation.label_he`, `.label_en` | Bilingual human labels |

### 3.3 Upgrade semantics

`defineSchema({ name: 'invoice', fields: [...new fields] })`
bumps `version` from `1 → 2 → 3` and pushes the previous
compiled schema onto `getSchemaHistory('invoice')`.
Old schema snapshots are **never** removed. Prior metadata
records remember the `schemaVersion` they were validated
against, so a form can show "this record was filed against
v1 of the schema".

---

## 4. Tag Taxonomy — טקסונומיית תגיות

The taxonomy is a forest of parent/child nodes, each with
Hebrew + English names, colour, and synonyms.

```js
mm.defineTagTaxonomy({
  tags: [
    { id: 'finance', name_he: 'כספים',    name_en: 'Finance',
      color: '#0B5FFF', synonyms: ['financial', 'כסף'] },
    { id: 'invoice', name_he: 'חשבונית',  name_en: 'Invoice',
      parent: 'finance', synonyms: ['bill', 'receipt', 'חשבון'] },
    { id: 'quote',   name_he: 'הצעת מחיר', name_en: 'Quote',
      parent: 'finance', synonyms: ['quotation', 'הצעה'] },
    { id: 'site',    name_he: 'אתר',       name_en: 'Site' },
    { id: 'permit',  name_he: 'היתר',      name_en: 'Permit',
      parent: 'site', synonyms: ['building permit', 'היתר בנייה'] },
    { id: 'drawing', name_he: 'תרשים',     name_en: 'Drawing',
      parent: 'site', synonyms: ['blueprint', 'שרטוט'] },
  ],
});
```

Rules:

- A tag requires at least one of `name_he` / `name_en`. The
  canonical names are automatically added to its synonym set.
- `id` is stable. When omitted it is derived from
  `normTerm(name_en || name_he)` with spaces → `-`.
- `parent` must reference a tag that already exists **or** is
  declared earlier in the same `defineTagTaxonomy` call.
- A second call is additive: new tags are inserted, existing
  tags get additional synonyms/colour/name, nothing is removed.

### 4.1 Hierarchy example

```
finance (כספים)
├── invoice (חשבונית)
├── quote   (הצעת מחיר)
└── contract (חוזה)     ← added in a later defineTagTaxonomy call
site (אתר)
├── drawing (תרשים)
└── permit  (היתר)
```

### 4.2 Synonym matching

`synonymMatch('bill')` returns the `invoice` tag.
`synonymMatch('חשבונית')` returns the same tag.
Input is normalised by `normTerm()`:

1. Unicode NFKC normalisation
2. Strip Hebrew nikud (`\u0591`–`\u05C7`)
3. Replace non-letter / non-digit sequences with single spaces
4. Trim and lowercase Latin

If no direct synonym hit is found, the matcher falls back to
token-by-token lookup so `synonymMatch('building permit for haifa')`
still returns `permit`.

### 4.3 Auto-tagging rules

`autoTag({ docId, content, rules })` where each rule is:

```js
{
  tagId: 'invoice',
  match: { any: ['invoice', 'חשבונית'],     // OR set
           all: ['paid', 'verified'] },     // AND set
  caseSensitive: false,
}
```

- Both `any` and `all` evaluate against `normTerm(content)` by
  default (Hebrew + English work uniformly).
- Rules that reference unknown or retired tags are silently
  skipped.
- When `rules` is omitted, the manager iterates the synonym
  index and applies every tag whose synonym appears in the
  content — a zero-config fallback useful for seed data.

### 4.4 Re-tagging (`bulkRetag`)

Bulk re-tagging is how we upgrade a naming decision without
breaking the audit trail:

```js
mm.bulkRetag({ sourceTag: 'old-inv', targetTag: 'new-inv',
               user: 'admin' });
```

Effects:

1. Every doc currently tagged `old-inv` gets `new-inv` added
   (old assignment stays in the log).
2. `old-inv` is marked `retired_at = now()` but **remains in
   the taxonomy**. It is still reachable via `getTag('old-inv')`
   and `listTags({ includeRetired: true })`, its history stays
   intact, and its prior documents are still returned by
   `listByTag(['old-inv'])`.
3. New calls to `tagDocument(..., ['old-inv'])` throw
   `E_TAG_RETIRED`.

---

## 5. Append-only Guarantees — התחייבויות

| Operation | What is kept |
|---|---|
| `defineSchema` (2nd+ time) | Previous compiled schemas in `getSchemaHistory(name)` |
| `applySchema` (2nd+ time for same doc+schema) | Every prior record in `metadataHistory(docId)` with `schemaVersion` |
| `defineTagTaxonomy` (2nd+ time) | Previous tags kept, new ones added, synonyms merged |
| `tagDocument` | Append-only `_tagLog`; duplicate additions are no-ops but still a single entry per first add |
| `untagDocument` | `action:'retire'` event logged; the assignment fact stays forever in the log |
| `bulkRetag` | Source tag marked `retired_at`; its doc set is still queryable |
| `propagateMetadata` | Each child gets a new `applySchema` entry — child history grows, never shrinks |

---

## 6. Error Codes — קודי שגיאה

Every error thrown from this module carries a stable code.

| `err.code` | Meaning |
|---|---|
| `E_SCHEMA_INVALID`  | Top-level schema input malformed |
| `E_SCHEMA_NAME`     | Schema name missing |
| `E_SCHEMA_FIELDS`   | `fields[]` missing or empty |
| `E_SCHEMA_FIELD`    | Field-level error (bad type, duplicate name, missing `values` for enum, ...) |
| `E_SCHEMA_MISSING`  | Referenced schema not defined |
| `E_METADATA_INVALID`| Validation failure; `err.errors[]` has per-field messages |
| `E_TAX_INVALID`     | Taxonomy input malformed, bad parent reference |
| `E_TAG_INVALID`     | `tagDocument` input malformed |
| `E_TAG_MISSING`     | Referenced tag id unknown |
| `E_TAG_RETIRED`     | Tried to apply a retired tag |
| `E_BULK_INVALID`    | Bad bulkRetag parameters |
| `E_AUTOTAG_INVALID` | Bad autoTag parameters |
| `E_LINK_INVALID`    | linkChild without both ids |
| `E_PROP_INVALID`    | propagateMetadata input malformed |

---

## 7. Hebrew Glossary — מונחון עברי

| Hebrew | English | Meaning in this module |
|---|---|---|
| מטא-דאטה        | Metadata         | Structured data describing a document |
| סכמה            | Schema           | Typed field definitions for a document class |
| שדה             | Field            | One named, typed slot inside a schema |
| תיוג            | Tagging          | Attaching a taxonomy node to a document |
| תגית            | Tag              | A single taxonomy node |
| טקסונומיה       | Taxonomy         | Hierarchical tree of tags |
| מילה נרדפת      | Synonym          | Alternate name that still resolves to the same tag |
| תיוג אוטומטי    | Auto-tagging     | Rule-based tag assignment from content |
| תיוג מחדש בכמות | Bulk retag       | Swap one tag for another across many docs |
| שדה חובה        | Required field   | Field that must be present on `applySchema` |
| ערך ברירת מחדל  | Default value    | Used when input omits the field |
| גרסה            | Version          | Monotonic number on schema / taxonomy upgrades |
| היסטוריה        | History          | Append-only log of previous states |
| הפניה           | Reference        | Field type pointing to another doc id |
| ציר (facet)     | Facet            | Distinct-value aggregation for a field |
| מקור התיוג      | Tag source       | `manual` / `auto` / `bulk` / `propagate` |
| תגית פורשת      | Retired tag      | Still visible but no longer applicable |
| היתר בנייה      | Building permit  | Example tag in the seed taxonomy |
| חשבונית         | Invoice          | Example tag + example schema name |
| הצעת מחיר       | Quote            | Example tag |
| תרשים / שרטוט   | Drawing / Blueprint | Example tag |

---

## 8. Default Seed Data — נתוני זריעה

The module itself ships with **no** automatic seed (schemas and
tags are project-specific). The test file exercises a realistic
default set that real deployments can copy verbatim:

### 8.1 Invoice schema

See section 3 above — 8 fields covering document number,
amount, currency enum, issue date, VAT flag, supplier reference,
free-form tags array and a Hebrew notes field.

### 8.2 Starter taxonomy (6 tags)

See section 4 — two roots (`finance`, `site`) with four leaves
(`invoice`, `quote`, `permit`, `drawing`). Hebrew + English
synonyms pre-populated.

---

## 9. Test Coverage — כיסוי בדיקות

File: `onyx-procurement/test/documents/metadata-manager.test.js`
Runner: `node --test` (Node ≥ 18)

```
tests 25
suites 0
pass 25
fail 0
```

### Test matrix

| # | Test | Validates |
|---|---|---|
| 1 | defineSchema compiles, assigns version 1 | Basic compile path |
| 2 | defineSchema rejects unknown type + duplicates | E_SCHEMA_FIELD |
| 3 | enum field requires validation.values | Enum guard |
| 4 | defineSchema upgrade keeps history | Append-only schemas |
| 5 | applySchema validates and stores | Happy path |
| 6 | applySchema throws on missing required field | Required enforcement |
| 7 | applySchema rejects bad pattern, enum, date | Per-type validation |
| 8 | applySchema preserves unknown fields | Forward-compat |
| 9 | applySchema keeps metadata history append-only | Append-only records |
| 10 | enforceRequiredFields reports ok vs missing | Save-time validator |
| 11 | facetValues aggregates, unfolds arrays | Faceted search support |
| 12 | defineTagTaxonomy wires parents/children, indexes synonyms | Taxonomy compile |
| 13 | Taxonomy upgrade is append-only | Never delete tags |
| 14 | tagDocument is additive, logs append-only | Tag-log correctness |
| 15 | tagDocument rejects unknown / retired tags | Guard rails |
| 16 | untagDocument is soft-remove | Soft delete semantics |
| 17 | autoTag explicit rules (any / all) | Rule engine |
| 18 | autoTag synonym fallback (Hebrew) | Zero-config auto-tag |
| 19 | listByTag any / all / descendants | Query engine |
| 20 | bulkRetag moves docs and retires source | Re-tag workflow |
| 21 | tagFrequency counts with period filter | Usage stats |
| 22 | unusedTags | Health report |
| 23 | propagateMetadata cascades field subset | Parent→child |
| 24 | normTerm strips nikud + punctuation | i18n helper |
| 25 | FIELD_TYPES frozen and exhaustive | API stability |

### Commands

```
# Run just this file
node --test onyx-procurement/test/documents/metadata-manager.test.js

# Run every document test in the suite
node --test onyx-procurement/test/documents/
```

---

## 10. Known Limitations & Growth Path

Per the `לא מוחקים רק משדרגים ומגדלים` rule, these are growth
slots, not bugs:

1. **No persistence.** Module is pure in-memory; a persistence
   adapter (SQLite / Postgres) can be added without touching the
   public API.
2. **No role-based filtering.** `listByTag` returns every doc the
   caller asks for. An `rbacFilter` hook belongs on the wrapping
   service (Agent X-97 — RBAC).
3. **Reference validation is structural only.** A field typed
   `reference` ensures the value is a non-empty string; it does
   not yet verify that the id exists in the referenced schema.
   Future upgrade: inject a resolver.
4. **autoTag synonym fallback is O(tags × content length).** For
   very large documents, rule-based auto-tagging is the
   recommended path (see 4.3).
5. **Concurrent writes are not atomic.** Callers are responsible
   for their own locking if they share a single `MetadataManager`
   across threads (Node is single-threaded so the common case is
   safe).

---

## 11. File Map

| Path | Role |
|---|---|
| `onyx-procurement/src/documents/metadata-manager.js` | Implementation — class `MetadataManager`, helpers |
| `onyx-procurement/test/documents/metadata-manager.test.js` | Unit tests — 25 cases, all green |
| `_qa-reports/AG-Y113-metadata-manager.md` | This report |

---

**Status:** GREEN — 25/25 tests passing, zero dependencies, bilingual,
append-only, deterministic clock.
