/**
 * @techno-kol/shared-events — barrel-export smoke test
 *
 * Verifies the public surface (createEvent, EventProducer, EventConsumer,
 * TOPIC_MAP, idempotency helpers) is reachable via `require('..')`.
 *
 * Runs via `node --test`. No external dependencies — Supabase clients are
 * never instantiated, only the constructors are introspected.
 *
 * Rule: לא מוחקים, רק משדרגים ומגדלים.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const pkgRoot = path.resolve(__dirname, '..');
const lib = require(pkgRoot);

test('barrel exports the envelope helper', () => {
  assert.equal(typeof lib.createEvent, 'function');
});

test('barrel exports the topic map and lookup helpers', () => {
  assert.equal(typeof lib.TOPIC_MAP, 'object');
  assert.equal(typeof lib.getTopicForEvent, 'function');
  assert.equal(typeof lib.isValidEvent, 'function');
  assert.equal(typeof lib.getAllTopics, 'function');
  assert.equal(typeof lib.getAllEvents, 'function');
  assert.equal(typeof lib.getEventsForTopic, 'function');
});

test('barrel exports producer + consumer constructors', () => {
  assert.equal(typeof lib.EventProducer, 'function');
  assert.equal(typeof lib.EventConsumer, 'function');
});

test('barrel exports idempotency helpers', () => {
  assert.equal(typeof lib.checkIdempotency, 'function');
  assert.equal(typeof lib.markProcessed, 'function');
  assert.equal(typeof lib.markFailed, 'function');
  assert.equal(typeof lib.getDeliveryHistory, 'function');
});

test('package.json declares a test script (idempotency check)', () => {
  const pkg = require(path.join(pkgRoot, 'package.json'));
  assert.ok(pkg.scripts && typeof pkg.scripts.test === 'string',
    'shared-events package.json must declare a "test" script');
});
