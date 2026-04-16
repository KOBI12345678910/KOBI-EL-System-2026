'use strict';

/**
 * Build a before/after diff object for audit logging.
 * Only includes fields that actually changed.
 *
 * Usage:
 *   const diff = buildDiff(
 *     { status: 'Draft', amount: 1000, notes: 'initial' },
 *     { status: 'Approved', amount: 1500, notes: 'initial', approvedBy: 'u-123' }
 *   );
 *   // => {
 *   //   changed: { status: { from: 'Draft', to: 'Approved' }, amount: { from: 1000, to: 1500 } },
 *   //   added: ['approvedBy'],
 *   //   removed: []
 *   // }
 *
 * @param {object|null} oldObj - Previous state (or null for creates)
 * @param {object|null} newObj - New state (or null for deletes)
 * @returns {{ changed: Record<string, {from: *, to: *}>, added: string[], removed: string[] }}
 */
function buildDiff(oldObj, newObj) {
  const old = oldObj || {};
  const cur = newObj || {};

  const allKeys = new Set([...Object.keys(old), ...Object.keys(cur)]);

  /** @type {Record<string, {from: *, to: *}>} */
  const changed = {};

  /** @type {string[]} */
  const added = [];

  /** @type {string[]} */
  const removed = [];

  for (const key of allKeys) {
    const hadKey = Object.prototype.hasOwnProperty.call(old, key);
    const hasKey = Object.prototype.hasOwnProperty.call(cur, key);

    if (hadKey && !hasKey) {
      removed.push(key);
      continue;
    }

    if (!hadKey && hasKey) {
      added.push(key);
      continue;
    }

    // Both have the key -- compare deep-ish with JSON for JSONB parity
    if (!_deepEqual(old[key], cur[key])) {
      changed[key] = { from: old[key], to: cur[key] };
    }
  }

  return { changed, added, removed };
}

/**
 * Return true when a diff object represents no actual change.
 *
 * @param {{ changed: Record<string, {from: *, to: *}>, added: string[], removed: string[] }} diff
 * @returns {boolean}
 */
function isDiffEmpty(diff) {
  if (!diff) return true;
  return (
    Object.keys(diff.changed).length === 0 &&
    diff.added.length === 0 &&
    diff.removed.length === 0
  );
}

/**
 * Build a human-readable Hebrew + English summary of a diff.
 *
 * Example output:
 *   "Changed status (Draft -> Approved), amount (1000 -> 1500). Added approvedBy."
 *   "שונה status (Draft -> Approved), amount (1000 -> 1500). נוסף approvedBy."
 *
 * @param {{ changed: Record<string, {from: *, to: *}>, added: string[], removed: string[] }} diff
 * @returns {{ en: string, he: string }}
 */
function summarizeDiff(diff) {
  if (!diff || isDiffEmpty(diff)) {
    return { en: 'No changes.', he: 'אין שינויים.' };
  }

  const parts_en = [];
  const parts_he = [];

  // -- Changed fields --
  const changedKeys = Object.keys(diff.changed);
  if (changedKeys.length > 0) {
    const details = changedKeys.map((key) => {
      const { from, to } = diff.changed[key];
      return `${key} (${_display(from)} -> ${_display(to)})`;
    });
    parts_en.push('Changed ' + details.join(', '));
    parts_he.push('שונה ' + details.join(', '));
  }

  // -- Added fields --
  if (diff.added.length > 0) {
    parts_en.push('Added ' + diff.added.join(', '));
    parts_he.push('נוסף ' + diff.added.join(', '));
  }

  // -- Removed fields --
  if (diff.removed.length > 0) {
    parts_en.push('Removed ' + diff.removed.join(', '));
    parts_he.push('הוסר ' + diff.removed.join(', '));
  }

  return {
    en: parts_en.join('. ') + '.',
    he: parts_he.join('. ') + '.',
  };
}

// ---------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------

/**
 * Deep-equal comparison that handles plain objects, arrays, and primitives.
 * Uses JSON serialisation for JSONB column parity (undefined becomes null, etc.).
 *
 * @private
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function _deepEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;

  // Fast path for primitives
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  // JSON comparison -- matches Postgres JSONB semantics
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Display a value for human-readable summaries.
 *
 * @private
 * @param {*} value
 * @returns {string}
 */
function _display(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

module.exports = { buildDiff, isDiffEmpty, summarizeDiff };
