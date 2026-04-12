/**
 * AG-Y171 — Tests for Service Mesh Generator
 * Mega-ERP Techno-Kol Uzi · לא מוחקים רק משדרגים ומגדלים
 *
 * 20 unit tests covering:
 *   - YAML emitter sanity
 *   - VirtualService routing (default + explicit)
 *   - Traffic splitting (canary %) + weight validation
 *   - Header-based routing
 *   - Retry policy
 *   - Per-route timeout
 *   - Fault injection (delay / abort / both)
 *   - DestinationRule + circuit breaker + outlier detection
 *   - mTLS / PeerAuthentication (STRICT / PERMISSIVE / DISABLE)
 *   - EnvoyFilter patches
 *   - generateAll() bundle
 *   - Error paths (bad weights, invalid status, invalid mode)
 *
 * Run with:  node --test test/devops/service-mesh.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  ServiceMesh,
  getDefaultConfig,
  yamlEmit,
  msToDuration,
  mergeDefaults,
  assertWeightsSumTo100
} = require('../../src/devops/service-mesh');

// ═════════════════════════════════════════════════════════════════════════
describe('AG-Y171 ServiceMesh — primitives', () => {
  test('01 yamlEmit: scalar map', () => {
    const out = yamlEmit({ a: 1, b: 'two', c: true });
    assert.equal(out, 'a: 1\nb: two\nc: true\n');
  });

  test('02 yamlEmit: nested list of maps', () => {
    const out = yamlEmit({ items: [{ name: 'x', weight: 10 }, { name: 'y', weight: 90 }] });
    assert.match(out, /items:/);
    assert.match(out, /- name: x/);
    assert.match(out, /weight: 90/);
  });

  test('03 msToDuration: common values', () => {
    assert.equal(msToDuration(0), '0s');
    assert.equal(msToDuration(1000), '1s');
    assert.equal(msToDuration(5000), '5s');
    assert.equal(msToDuration(1500), '1.500s');
  });

  test('04 mergeDefaults: deep merge preserves existing keys (never delete)', () => {
    const base = { a: 1, nested: { x: 10, y: 20 } };
    const overlay = { nested: { y: 99, z: 7 } };
    const merged = mergeDefaults(base, overlay);
    assert.deepEqual(merged, { a: 1, nested: { x: 10, y: 99, z: 7 } });
  });

  test('05 assertWeightsSumTo100: passes for 90/10', () => {
    assert.doesNotThrow(() =>
      assertWeightsSumTo100([
        { subset: 'stable', weight: 90 },
        { subset: 'canary', weight: 10 }
      ])
    );
  });

  test('06 assertWeightsSumTo100: throws for 95/10', () => {
    assert.throws(
      () =>
        assertWeightsSumTo100([
          { subset: 'stable', weight: 95 },
          { subset: 'canary', weight: 10 }
        ]),
      /sum to 100, got 105/
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('AG-Y171 ServiceMesh — VirtualService', () => {
  test('07 default VirtualService contains service host and kind', () => {
    const mesh = new ServiceMesh();
    const yaml = mesh.generateVirtualService();
    assert.match(yaml, /kind: VirtualService/);
    assert.match(yaml, /apiVersion: networking\.istio\.io\/v1beta1/);
    assert.match(yaml, /onyx-procurement\.technokol\.svc\.cluster\.local/);
    assert.match(yaml, /לא מוחקים רק משדרגים ומגדלים/);
  });

  test('08 traffic splitting 80/20 canary renders both weights', () => {
    const mesh = new ServiceMesh();
    const yaml = mesh.generateVirtualService([
      {
        name: 'canary-80-20',
        match: [{ uri: { prefix: '/api' } }],
        split: [
          { subset: 'stable', weight: 80 },
          { subset: 'canary', weight: 20 }
        ]
      }
    ]);
    assert.match(yaml, /subset: stable/);
    assert.match(yaml, /subset: canary/);
    assert.match(yaml, /weight: 80/);
    assert.match(yaml, /weight: 20/);
  });

  test('09 header-based routing: x-release header match', () => {
    const mesh = new ServiceMesh();
    const yaml = mesh.generateVirtualService([
      {
        name: 'header-route',
        match: [{ headers: { 'x-release': { exact: 'canary' } } }],
        split: [{ subset: 'canary', weight: 100 }]
      }
    ]);
    assert.match(yaml, /headers:/);
    assert.match(yaml, /x-release:/);
    assert.match(yaml, /exact: canary/);
  });

  test('10 retry policy renders attempts + perTryTimeout + retryOn', () => {
    const mesh = new ServiceMesh();
    const yaml = mesh.generateVirtualService([
      {
        name: 'with-retries',
        split: [{ subset: 'stable', weight: 100 }],
        retries: { attempts: 5, perTryTimeoutMs: 2500, retryOn: 'gateway-error,5xx' }
      }
    ]);
    assert.match(yaml, /attempts: 5/);
    assert.match(yaml, /perTryTimeout: 2\.500s/);
    assert.match(yaml, /retryOn: gateway-error,5xx/);
  });

  test('11 per-route timeout renders as seconds', () => {
    const mesh = new ServiceMesh();
    const yaml = mesh.generateVirtualService([
      {
        name: 'slow-path',
        split: [{ subset: 'stable', weight: 100 }],
        timeoutMs: 8000
      }
    ]);
    assert.match(yaml, /timeout: 8s/);
  });

  test('12 fault injection: delay + abort for chaos testing', () => {
    const mesh = new ServiceMesh();
    const yaml = mesh.generateVirtualService([
      {
        name: 'chaos',
        split: [{ subset: 'stable', weight: 100 }],
        fault: {
          delay: { percentage: 25, fixedDelayMs: 3000 },
          abort: { percentage: 10, httpStatus: 503 }
        }
      }
    ]);
    assert.match(yaml, /fault:/);
    assert.match(yaml, /delay:/);
    assert.match(yaml, /fixedDelay: 3s/);
    assert.match(yaml, /abort:/);
    assert.match(yaml, /httpStatus: 503/);
    assert.match(yaml, /value: 25/);
    assert.match(yaml, /value: 10/);
  });

  test('13 invalid weight total throws', () => {
    const mesh = new ServiceMesh();
    assert.throws(
      () =>
        mesh.generateVirtualService([
          {
            name: 'bad',
            split: [
              { subset: 'a', weight: 50 },
              { subset: 'b', weight: 49 }
            ]
          }
        ]),
      /sum to 100/
    );
  });

  test('14 invalid fault abort status throws', () => {
    const mesh = new ServiceMesh();
    assert.throws(
      () =>
        mesh.generateVirtualService([
          {
            name: 'bad-fault',
            split: [{ subset: 'stable', weight: 100 }],
            fault: { abort: { percentage: 10, httpStatus: 42 } }
          }
        ]),
      /HTTP status code/
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('AG-Y171 ServiceMesh — DestinationRule', () => {
  test('15 default DestinationRule contains circuit breaker fields', () => {
    const mesh = new ServiceMesh();
    const yaml = mesh.generateDestinationRule();
    assert.match(yaml, /kind: DestinationRule/);
    assert.match(yaml, /outlierDetection:/);
    assert.match(yaml, /consecutive5xxErrors: 5/);
    assert.match(yaml, /interval: 30s/);
    assert.match(yaml, /baseEjectionTime: 30s/);
    assert.match(yaml, /maxEjectionPercent: 50/);
  });

  test('16 connection pool limits are present', () => {
    const mesh = new ServiceMesh();
    const yaml = mesh.generateDestinationRule();
    assert.match(yaml, /connectionPool:/);
    assert.match(yaml, /maxConnections: 1024/);
    assert.match(yaml, /http1MaxPendingRequests: 1024/);
    assert.match(yaml, /maxRetries: 3/);
  });

  test('17 custom subsets override defaults without deleting them', () => {
    const mesh = new ServiceMesh();
    const yaml = mesh.generateDestinationRule([
      { name: 'v1', labels: { version: 'v1' } },
      { name: 'v2', labels: { version: 'v2' } },
      { name: 'v3', labels: { version: 'v3' } }
    ]);
    assert.match(yaml, /name: v1/);
    assert.match(yaml, /name: v2/);
    assert.match(yaml, /name: v3/);
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('AG-Y171 ServiceMesh — mTLS + EnvoyFilter + bundle', () => {
  test('18 PeerAuthentication STRICT is emitted', () => {
    const mesh = new ServiceMesh();
    const yaml = mesh.generatePeerAuthentication({ mode: 'STRICT' });
    assert.match(yaml, /kind: PeerAuthentication/);
    assert.match(yaml, /mode: STRICT/);
    assert.match(yaml, /selector:/);
  });

  test('19 PeerAuthentication invalid mode throws', () => {
    const mesh = new ServiceMesh();
    assert.throws(() => mesh.generatePeerAuthentication({ mode: 'OFF' }), /invalid mode/);
  });

  test('20 EnvoyFilter renders workloadSelector and configPatches', () => {
    const mesh = new ServiceMesh();
    const yaml = mesh.generateEnvoyFilter([
      {
        applyTo: 'HTTP_FILTER',
        match: { context: 'SIDECAR_INBOUND' },
        patch: {
          operation: 'INSERT_BEFORE',
          value: { name: 'envoy.filters.http.lua' }
        }
      }
    ]);
    assert.match(yaml, /kind: EnvoyFilter/);
    assert.match(yaml, /workloadSelector:/);
    assert.match(yaml, /configPatches:/);
    assert.match(yaml, /applyTo: HTTP_FILTER/);
    assert.match(yaml, /operation: INSERT_BEFORE/);
  });

  test('21 generateAll returns a bundle keyed by filename', () => {
    const mesh = new ServiceMesh();
    const bundle = mesh.generateAll();
    assert.equal(typeof bundle, 'object');
    assert.ok(bundle['onyx-procurement-virtualservice.yaml']);
    assert.ok(bundle['onyx-procurement-destinationrule.yaml']);
    assert.ok(bundle['onyx-procurement-peerauthentication.yaml']);
    assert.match(bundle['onyx-procurement-virtualservice.yaml'], /kind: VirtualService/);
    assert.match(bundle['onyx-procurement-destinationrule.yaml'], /kind: DestinationRule/);
    assert.match(
      bundle['onyx-procurement-peerauthentication.yaml'],
      /kind: PeerAuthentication/
    );
  });

  test('22 getDefaultConfig is a fresh object each call (no shared state)', () => {
    const a = getDefaultConfig();
    const b = getDefaultConfig();
    assert.notEqual(a, b);
    a.namespace = 'MUTATED';
    assert.equal(b.namespace, 'technokol');
  });
});
