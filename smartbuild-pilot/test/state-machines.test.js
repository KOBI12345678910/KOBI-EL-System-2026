'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { STATE_MACHINES, getMachine, availableTransitions, canTransition } = require('../src/core/state-machines');
const { ENTITY_MAP } = require('../src/core/entity-map');

test('every machine is well-formed', () => {
  const names = Object.keys(STATE_MACHINES);
  assert.ok(names.length >= 17, `expected 17+ machines, got ${names.length}`);
  for (const [type, m] of Object.entries(STATE_MACHINES)) {
    assert.equal(m.entity, type);
    assert.ok(m.states.includes(m.initial), `${type}: initial not in states`);
    for (const tr of m.transitions) {
      assert.ok(m.states.includes(tr.from), `${type}: unknown from-state ${tr.from}`);
      assert.ok(m.states.includes(tr.to), `${type}: unknown to-state ${tr.to}`);
      assert.ok(tr.action, `${type}: transition without action`);
      assert.ok(tr.label, `${type}: transition without Hebrew label`);
    }
  }
});

test('machine states match entity-map statuses', () => {
  for (const [type, m] of Object.entries(STATE_MACHINES)) {
    const def = ENTITY_MAP[type];
    if (!def || !def.statuses.length) continue;
    for (const status of def.statuses) {
      assert.ok(m.states.includes(status), `${type}: entity-map status "${status}" missing from machine`);
    }
  }
});

test('availableTransitions and canTransition', () => {
  const fromSigned = availableTransitions('sale', 'signed');
  assert.ok(fromSigned.length >= 2);
  assert.ok(fromSigned.every((t) => t.from === 'signed'));
  assert.ok(canTransition('sale', 'signed', 'delivered'));
  assert.ok(!canTransition('sale', 'cancelled', 'delivered'), 'cancelled sale cannot be delivered');
  assert.ok(!canTransition('apartment', 'delivered', 'available'), 'delivered apartment is terminal');
  assert.deepEqual(availableTransitions('nope', 'x'), []);
  assert.equal(getMachine('nope'), null);
});

test('every transition action is unique per (from,to) pair', () => {
  for (const [type, m] of Object.entries(STATE_MACHINES)) {
    const seen = new Set();
    for (const tr of m.transitions) {
      const key = `${tr.from}→${tr.to}→${tr.action}`;
      assert.ok(!seen.has(key), `${type}: duplicate transition ${key}`);
      seen.add(key);
    }
  }
});
