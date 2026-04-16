'use strict';

/**
 * shared-audit -- Barrel export for the audit package.
 *
 * Provides:
 *   - AuditWriter          : writes audit_logs entries for every critical mutation
 *   - StateHistoryWriter   : writes state_history rows on every state transition
 *   - buildDiff            : builds a before/after diff object (changed / added / removed)
 *   - isDiffEmpty          : checks whether a diff is empty
 *   - summarizeDiff        : human-readable Hebrew + English diff summary
 */

const { AuditWriter } = require('./audit-writer');
const { StateHistoryWriter } = require('./state-history-writer');
const { buildDiff, isDiffEmpty, summarizeDiff } = require('./diff-builder');

module.exports = {
  AuditWriter,
  StateHistoryWriter,
  buildDiff,
  isDiffEmpty,
  summarizeDiff,
};
