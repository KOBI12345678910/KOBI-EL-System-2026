/*
 * AG-X93 — manifest-generator.test.js
 * Mega-ERP Techno-Kol Uzi  ·  "לא מוחקים רק משדרגים ומגדלים"
 *
 * Dependency-free test runner (node --test compatible, plus plain-node
 * fallback). Verifies:
 *   1. Module exports the required API
 *   2. YAML emitter output is parseable by the built-in parser (round-trip)
 *   3. Required top-level fields exist on compose + k8s documents
 *   4. Port consistency: for every service, the container port in compose
 *      matches the targetPort in the k8s Service
 *   5. Security hardening is present on every k8s Deployment
 *   6. Every stateful service has a matching PVC
 *   7. Quoting rules in the YAML emitter are correct for tricky strings
 */

'use strict';

const assert = require('assert');
const path = require('path');

const mg = require(path.join(
  __dirname, '..', '..', 'onyx-procurement', 'src', 'deploy', 'manifest-generator.js'
));

// ───────────────────────────────────────────────────────────────────────────
// Tiny test runner (works under `node` or `node --test`)
// ───────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    // eslint-disable-next-line no-console
    console.log('  ok  ' + name);
  } catch (err) {
    failed++;
    failures.push({ name: name, err: err });
    // eslint-disable-next-line no-console
    console.log('  FAIL ' + name + ' -> ' + err.message);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 1. API surface
// ───────────────────────────────────────────────────────────────────────────

test('exports: generateCompose / generateK8s / yamlEmit / yamlParse', () => {
  assert.strictEqual(typeof mg.generateCompose, 'function');
  assert.strictEqual(typeof mg.generateK8s, 'function');
  assert.strictEqual(typeof mg.yamlEmit, 'function');
  assert.strictEqual(typeof mg.yamlParse, 'function');
  assert.strictEqual(typeof mg.getDefaultConfig, 'function');
  assert.strictEqual(typeof mg.getPortMatrix, 'function');
});

// ───────────────────────────────────────────────────────────────────────────
// 2. YAML emitter: quoting rules
// ───────────────────────────────────────────────────────────────────────────

test('yamlEmit: quotes strings when colon is followed by space', () => {
  // `: ` is a YAML flow indicator and MUST be quoted to round-trip safely.
  const y = mg.yamlEmit({ note: 'key: value' });
  assert.ok(y.includes('"key: value"'), 'expected quoted: ' + y);
  // Colon without trailing space (e.g. "host:port") is safe unquoted.
  const p = mg.yamlEmit({ ports: ['3100:3100'] });
  const parsed = mg.yamlParse(p);
  assert.deepStrictEqual(parsed.ports, ['3100:3100'], 'round-trip lost port value');
});

test('yamlEmit: leaves plain strings unquoted', () => {
  const y = mg.yamlEmit({ name: 'onyx-procurement' });
  assert.ok(/name:\s*onyx-procurement/.test(y), y);
});

test('yamlEmit: emits booleans and numbers plainly', () => {
  const y = mg.yamlEmit({ ok: true, count: 42, zero: 0, f: false });
  assert.ok(/ok:\s*true/.test(y));
  assert.ok(/count:\s*42/.test(y));
  assert.ok(/zero:\s*0/.test(y));
  assert.ok(/f:\s*false/.test(y));
});

test('yamlEmit: quotes numeric-looking strings', () => {
  const y = mg.yamlEmit({ tag: '2024' });
  assert.ok(y.includes('"2024"'), y);
});

test('yamlEmit: nested maps produce correct indentation', () => {
  const y = mg.yamlEmit({ a: { b: { c: 1 } } });
  assert.ok(/a:\n {2}b:\n {4}c: 1/.test(y), y);
});

test('yamlEmit: sequence of maps', () => {
  const y = mg.yamlEmit({ items: [{ k: 'v1' }, { k: 'v2' }] });
  assert.ok(y.includes('- k: v1'));
  assert.ok(y.includes('- k: v2'));
});

// ───────────────────────────────────────────────────────────────────────────
// 3. YAML parser: round-trip
// ───────────────────────────────────────────────────────────────────────────

test('yamlParse: parses what yamlEmit produces (map)', () => {
  const original = {
    name: 'erp',
    services: {
      postgres: { image: 'postgres:16-alpine', port: 5432 }
    }
  };
  const parsed = mg.yamlParse(mg.yamlEmit(original));
  assert.strictEqual(parsed.name, 'erp');
  assert.strictEqual(parsed.services.postgres.image, 'postgres:16-alpine');
  assert.strictEqual(parsed.services.postgres.port, 5432);
});

test('yamlParse: round-trip is stable', () => {
  const original = {
    alpha: 1,
    beta: [1, 2, 3],
    gamma: { nested: { deep: 'value' } },
    quoted: 'contains: colon',
    list: [{ k: 'v' }, { k: 'w' }]
  };
  const once = mg.yamlParse(mg.yamlEmit(original));
  const twice = mg.yamlParse(mg.yamlEmit(once));
  assert.deepStrictEqual(once, twice);
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Compose document — required top-level fields
// ───────────────────────────────────────────────────────────────────────────

test('compose: has required top-level keys', () => {
  const compose = mg.yamlParse(mg.generateCompose());
  assert.ok(compose.name, 'name missing');
  assert.ok(compose.services, 'services missing');
  assert.ok(compose.networks, 'networks missing');
  assert.ok(compose.networks.frontend);
  assert.ok(compose.networks.backend);
});

test('compose: every service has image + container_name + restart', () => {
  const compose = mg.yamlParse(mg.generateCompose());
  for (const [name, svc] of Object.entries(compose.services)) {
    assert.ok(svc.image, name + ' missing image');
    assert.ok(svc.container_name, name + ' missing container_name');
    assert.ok(svc.restart, name + ' missing restart');
  }
});

test('compose: every service has a healthcheck', () => {
  const compose = mg.yamlParse(mg.generateCompose());
  for (const [name, svc] of Object.entries(compose.services)) {
    assert.ok(svc.healthcheck, name + ' missing healthcheck');
    assert.ok(svc.healthcheck.test, name + ' missing healthcheck.test');
  }
});

test('compose: every service has resource limits under deploy.resources', () => {
  const compose = mg.yamlParse(mg.generateCompose());
  for (const [name, svc] of Object.entries(compose.services)) {
    assert.ok(svc.deploy, name + ' missing deploy');
    assert.ok(svc.deploy.resources, name + ' missing deploy.resources');
    assert.ok(svc.deploy.resources.limits, name + ' missing limits');
    assert.ok(svc.deploy.resources.reservations, name + ' missing reservations');
  }
});

test('compose: stateful services declare bind-mount volumes', () => {
  const cfg = mg.getDefaultConfig();
  const compose = mg.yamlParse(mg.generateCompose(cfg));
  for (const svc of cfg.services) {
    if (svc.stateful) {
      assert.ok(
        compose.services[svc.name].volumes,
        svc.name + ' (stateful) missing volumes in compose'
      );
    }
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 5. K8s manifests — structural requirements
// ───────────────────────────────────────────────────────────────────────────

function splitDocs(text) {
  return text.split(/\n---\n/).map(t => t.trim()).filter(t => {
    if (!t) return false;
    // A comment-only block is not a YAML doc.
    const onlyComments = t.split(/\r?\n/).every(l => l.trim() === '' || l.trim().startsWith('#'));
    return !onlyComments;
  });
}

function parseDocs(text) {
  return splitDocs(text).map(d => mg.yamlParse(d));
}

test('k8s: every service file has Deployment + Service + NetworkPolicy', () => {
  const cfg = mg.getDefaultConfig();
  const files = mg.generateK8s(cfg);
  for (const svc of cfg.services) {
    const fname = Object.keys(files).find(f => f.endsWith('-' + svc.name + '.yaml'));
    assert.ok(fname, 'no k8s file for ' + svc.name);
    const docs = parseDocs(files[fname]);
    const kinds = docs.map(d => d && d.kind).filter(Boolean);
    assert.ok(kinds.includes('Deployment'), svc.name + ' missing Deployment');
    if (svc.port) {
      assert.ok(kinds.includes('Service'), svc.name + ' missing Service');
    }
    assert.ok(kinds.includes('NetworkPolicy'), svc.name + ' missing NetworkPolicy');
    assert.ok(kinds.includes('ServiceAccount'), svc.name + ' missing ServiceAccount');
    assert.ok(kinds.includes('Role'), svc.name + ' missing Role');
    assert.ok(kinds.includes('RoleBinding'), svc.name + ' missing RoleBinding');
  }
});

test('k8s: stateful services have a PVC', () => {
  const cfg = mg.getDefaultConfig();
  const files = mg.generateK8s(cfg);
  for (const svc of cfg.services) {
    if (!svc.stateful) continue;
    const fname = Object.keys(files).find(f => f.endsWith('-' + svc.name + '.yaml'));
    const docs = parseDocs(files[fname]);
    const kinds = docs.map(d => d && d.kind).filter(Boolean);
    assert.ok(kinds.includes('PersistentVolumeClaim'), svc.name + ' missing PVC');
  }
});

test('k8s: stateless services (>=2 replicas) have HPA + PDB', () => {
  const cfg = mg.getDefaultConfig();
  const files = mg.generateK8s(cfg);
  for (const svc of cfg.services) {
    if (svc.stateful) continue;
    const replicas = (cfg.replicas && cfg.replicas[svc.name]) || 2;
    if (replicas < 2) continue;
    const fname = Object.keys(files).find(f => f.endsWith('-' + svc.name + '.yaml'));
    const docs = parseDocs(files[fname]);
    const kinds = docs.map(d => d && d.kind).filter(Boolean);
    assert.ok(kinds.includes('HorizontalPodAutoscaler'), svc.name + ' missing HPA');
    assert.ok(kinds.includes('PodDisruptionBudget'), svc.name + ' missing PDB');
  }
});

test('k8s: every Deployment has security context with runAsNonRoot', () => {
  const cfg = mg.getDefaultConfig();
  const files = mg.generateK8s(cfg);
  for (const svc of cfg.services) {
    const fname = Object.keys(files).find(f => f.endsWith('-' + svc.name + '.yaml'));
    const docs = parseDocs(files[fname]);
    const dep = docs.find(d => d && d.kind === 'Deployment');
    assert.ok(dep, svc.name + ': no Deployment');
    const podSec = dep.spec.template.spec.securityContext;
    assert.strictEqual(podSec.runAsNonRoot, true, svc.name + ': runAsNonRoot not true');
    const ctrSec = dep.spec.template.spec.containers[0].securityContext;
    assert.strictEqual(ctrSec.readOnlyRootFilesystem, true, svc.name + ': readOnlyRootFilesystem not true');
    assert.strictEqual(ctrSec.allowPrivilegeEscalation, false, svc.name + ': allowPrivilegeEscalation not false');
  }
});

test('k8s: every Deployment has probes (or exec probes for db/cache)', () => {
  const cfg = mg.getDefaultConfig();
  const files = mg.generateK8s(cfg);
  for (const svc of cfg.services) {
    const fname = Object.keys(files).find(f => f.endsWith('-' + svc.name + '.yaml'));
    const docs = parseDocs(files[fname]);
    const dep = docs.find(d => d && d.kind === 'Deployment');
    const ctr = dep.spec.template.spec.containers[0];
    assert.ok(ctr.readinessProbe, svc.name + ': readinessProbe missing');
    assert.ok(ctr.livenessProbe, svc.name + ': livenessProbe missing');
    assert.ok(ctr.startupProbe, svc.name + ': startupProbe missing');
  }
});

test('k8s: topology spread + pod anti-affinity on every Deployment', () => {
  const cfg = mg.getDefaultConfig();
  const files = mg.generateK8s(cfg);
  for (const svc of cfg.services) {
    const fname = Object.keys(files).find(f => f.endsWith('-' + svc.name + '.yaml'));
    const docs = parseDocs(files[fname]);
    const dep = docs.find(d => d && d.kind === 'Deployment');
    const spec = dep.spec.template.spec;
    assert.ok(
      Array.isArray(spec.topologySpreadConstraints) && spec.topologySpreadConstraints.length,
      svc.name + ': missing topologySpreadConstraints'
    );
    assert.ok(spec.affinity && spec.affinity.podAntiAffinity,
      svc.name + ': missing podAntiAffinity');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Port consistency: compose ↔ k8s
// ───────────────────────────────────────────────────────────────────────────

test('ports: compose and k8s agree on container port for every service', () => {
  const cfg = mg.getDefaultConfig();
  const compose = mg.yamlParse(mg.generateCompose(cfg));
  const files = mg.generateK8s(cfg);

  for (const svc of cfg.services) {
    if (!svc.port) continue;

    // Compose side: ports entry should be "host:container"
    const composePorts = compose.services[svc.name].ports || [];
    const hit = composePorts.find(p => String(p).endsWith(':' + svc.port));
    assert.ok(hit, svc.name + ': compose ports missing ' + svc.port);

    // K8s side: Service.spec.ports[0].port should match container port
    const fname = Object.keys(files).find(f => f.endsWith('-' + svc.name + '.yaml'));
    const docs = parseDocs(files[fname]);
    const k8sSvc = docs.find(d => d && d.kind === 'Service');
    if (!k8sSvc) continue;
    const portEntry = k8sSvc.spec.ports[0];
    assert.strictEqual(portEntry.port, svc.port,
      svc.name + ': k8s Service port ' + portEntry.port + ' != container ' + svc.port);
    assert.strictEqual(portEntry.targetPort, svc.port,
      svc.name + ': k8s Service targetPort mismatch');

    // Deployment containerPort also matches
    const dep = docs.find(d => d && d.kind === 'Deployment');
    const ctr = dep.spec.template.spec.containers[0];
    const cport = ctr.ports && ctr.ports[0] && ctr.ports[0].containerPort;
    assert.strictEqual(cport, svc.port,
      svc.name + ': containerPort mismatch ' + cport + ' vs ' + svc.port);
  }
});

test('ports: getPortMatrix returns an entry for every service', () => {
  const cfg = mg.getDefaultConfig();
  const matrix = mg.getPortMatrix(cfg);
  for (const svc of cfg.services) {
    assert.ok(matrix[svc.name], svc.name + ' missing from port matrix');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Observability + networks
// ───────────────────────────────────────────────────────────────────────────

test('compose: frontend/backend networks referenced by services', () => {
  const compose = mg.yamlParse(mg.generateCompose());
  let frontendCount = 0, backendCount = 0;
  for (const svc of Object.values(compose.services)) {
    const nets = Array.isArray(svc.networks) ? svc.networks : [];
    if (nets.includes('frontend')) frontendCount++;
    if (nets.includes('backend')) backendCount++;
  }
  assert.ok(frontendCount >= 1, 'no services on frontend network');
  assert.ok(backendCount >= 1, 'no services on backend network');
});

test('k8s: nginx exposes an Ingress', () => {
  const files = mg.generateK8s();
  const nginxFile = Object.keys(files).find(f => f.endsWith('-nginx.yaml'));
  const kinds = parseDocs(files[nginxFile]).map(d => d && d.kind);
  assert.ok(kinds.includes('Ingress'), 'nginx missing Ingress');
});

test('k8s: prometheus, grafana, loki included in generated output', () => {
  const files = mg.generateK8s();
  assert.ok(Object.keys(files).some(f => f.endsWith('-prometheus.yaml')));
  assert.ok(Object.keys(files).some(f => f.endsWith('-grafana.yaml')));
  assert.ok(Object.keys(files).some(f => f.endsWith('-loki.yaml')));
});

// ───────────────────────────────────────────────────────────────────────────
// Summary
// ───────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line no-console
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  for (const f of failures) {
    // eslint-disable-next-line no-console
    console.error('  - ' + f.name + ': ' + f.err.stack);
  }
  process.exit(1);
}
