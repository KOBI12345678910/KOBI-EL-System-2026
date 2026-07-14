/**
 * SmartBuild Pilot 2.0 — In-Memory Entity Store
 *
 * Single data layer for all 26 entity types. Every mutation is
 * automatically recorded as an audit_event (except audit_event itself).
 */

'use strict';

const { ENTITY_TYPES } = require('../core/contracts');

function createStore() {
  let collections = {};
  let counters = {};

  function initCollections() {
    collections = {};
    counters = {};
    for (const type of ENTITY_TYPES) {
      collections[type] = [];
      counters[type] = 0;
    }
  }
  initCollections();

  function assertType(type) {
    if (!collections[type]) {
      throw new Error(`Unknown entity type: ${type}`);
    }
  }

  function audit(action, entityType, entityId, details) {
    if (entityType === 'audit_event') return;
    counters.audit_event += 1;
    collections.audit_event.push({
      id: `audit_event-${counters.audit_event}`,
      ts: new Date().toISOString(),
      actor: 'system',
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: details || {},
    });
  }

  const store = {
    reset(seedFn) {
      initCollections();
      if (typeof seedFn === 'function') seedFn(store);
    },

    list(type) {
      assertType(type);
      return collections[type].slice();
    },

    get(type, id) {
      assertType(type);
      return collections[type].find((r) => r.id === id) || null;
    },

    create(type, obj) {
      assertType(type);
      const record = Object.assign({}, obj);
      if (!record.id) {
        counters[type] += 1;
        record.id = `${type}-${counters[type]}`;
      } else {
        // keep auto-counter ahead of explicit numeric ids like "<type>-7"
        const m = String(record.id).match(new RegExp(`^${type}-(\\d+)$`));
        if (m) counters[type] = Math.max(counters[type], parseInt(m[1], 10));
      }
      collections[type].push(record);
      audit('create', type, record.id, { snapshot: Object.assign({}, record) });
      return record;
    },

    update(type, id, patch) {
      assertType(type);
      const record = collections[type].find((r) => r.id === id);
      if (!record) return null;
      Object.assign(record, patch);
      audit('update', type, id, { patch: Object.assign({}, patch) });
      return record;
    },

    remove(type, id) {
      assertType(type);
      const idx = collections[type].findIndex((r) => r.id === id);
      if (idx === -1) return false;
      collections[type].splice(idx, 1);
      audit('remove', type, id, {});
      return true;
    },

    find(type, predicateFn) {
      assertType(type);
      return collections[type].filter(predicateFn);
    },

    counts() {
      const out = {};
      for (const type of ENTITY_TYPES) out[type] = collections[type].length;
      return out;
    },
  };

  return store;
}

module.exports = { createStore };
