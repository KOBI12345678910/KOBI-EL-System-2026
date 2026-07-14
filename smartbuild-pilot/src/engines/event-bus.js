/**
 * SmartBuild Pilot 2.0 — Financial Event Bus
 *
 * Every business action publishes a typed financial event. Listeners
 * (engines, alert refresh, cross-service bridges) subscribe by type or '*'.
 */

'use strict';

const { EVENT_TYPES } = require('../core/contracts');

function createEventBus(store) {
  const listeners = new Map(); // eventType|'*' → [fn]
  const published = [];

  function publish(eventType, payload) {
    if (!EVENT_TYPES.includes(eventType)) {
      throw new Error(`Unknown event type: ${eventType}`);
    }
    const event = { ts: new Date().toISOString(), event_type: eventType, payload: payload || {} };
    published.push(event);
    if (store) {
      store.create('audit_event', {
        ts: event.ts,
        actor: 'event-bus',
        action: `event:${eventType}`,
        entity_type: (payload && payload.entity_type) || null,
        entity_id: (payload && payload.entity_id) || null,
        details: payload || {},
      });
    }
    for (const key of [eventType, '*']) {
      for (const fn of listeners.get(key) || []) {
        try { fn(event.payload, event); } catch (err) { /* listener errors never break the flow */ }
      }
    }
    return event;
  }

  function subscribe(eventType, fn) {
    if (eventType !== '*' && !EVENT_TYPES.includes(eventType)) {
      throw new Error(`Unknown event type: ${eventType}`);
    }
    if (!listeners.has(eventType)) listeners.set(eventType, []);
    listeners.get(eventType).push(fn);
    return () => {
      const arr = listeners.get(eventType) || [];
      const i = arr.indexOf(fn);
      if (i !== -1) arr.splice(i, 1);
    };
  }

  return { publish, subscribe, ledger: () => published.slice() };
}

module.exports = { createEventBus };
