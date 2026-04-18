/**
 * ============================================================================
 * Agent Y-173 — VaultClient unit tests / בדיקות יחידה ל-VaultClient
 * ============================================================================
 *
 * EN: Runs on node:test — no external deps. Uses a mock transport to avoid
 *     touching a real Vault/OpenBao server. Covers KV v2, Transit, PKI, token
 *     lifecycle, retry/backoff, namespace, audit log, injectTransport, errors.
 *
 * HE: רץ על node:test — ללא תלויות חיצוניות. משתמש ב-mock transport כדי לא
 *     לגשת לשרת Vault/OpenBao אמיתי. מכסה KV גרסה 2, Transit, PKI, מחזור חיי
 *     טוקן, retry/backoff, namespace, יומן audit, injectTransport, שגיאות.
 *
 * Run with: node --test onyx-procurement/test/devops/vault-client.test.js
 * הפעלה:    node --test onyx-procurement/test/devops/vault-client.test.js
 * ============================================================================
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VaultClient,
  VaultError,
  _internals,
} = require('../../src/devops/vault-client.js');

// ---------------------------------------------------------------------------
// Mock transport factory / יצרן mock transport
// ---------------------------------------------------------------------------

/**
 * EN: Build a mock transport that captures every request and returns a
 *     pre-programmed queue of responses. Each response may be an object
 *     `{ status, body, headers }` or a function `(req) => response`.
 * HE: בונה mock transport שלוכד כל בקשה ומחזיר תור קבוע מראש של תגובות.
 *     כל תגובה יכולה להיות אובייקט או פונקציה.
 */
function makeMock(queue = []) {
  const calls = [];
  const responses = [...queue];
  async function mock(req) {
    calls.push({
      url: req.url,
      method: req.method,
      headers: { ...req.headers },
      body: req.body,
    });
    if (responses.length === 0) {
      return { status: 500, headers: {}, body: JSON.stringify({ errors: ['no mock response'] }) };
    }
    const next = responses.shift();
    const r = typeof next === 'function' ? next(req) : next;
    const resolved = r instanceof Promise ? await r : r;
    return {
      status: resolved.status || 200,
      headers: resolved.headers || {},
      body:
        typeof resolved.body === 'string'
          ? resolved.body
          : JSON.stringify(resolved.body || {}),
    };
  }
  return { mock, calls, responses };
}

/** EN: Standard client factory (fast sleep + deterministic RNG for retry tests).
 *  HE: יצרן לקוח סטנדרטי (sleep מהיר ו-RNG דטרמיניסטי לבדיקות retry). */
function makeClient(extra = {}) {
  return new VaultClient({
    endpoint: 'https://vault.example.test:8200',
    token: 's.test-root-token',
    kvMount: 'secret',
    transitMount: 'transit',
    pkiMount: 'pki',
    maxRetries: 3,
    retryBaseMs: 1,
    retryMaxMs: 4,
    sleep: async () => {}, // no real waiting in tests
    random: () => 0, // deterministic backoff
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Tests / בדיקות
// ---------------------------------------------------------------------------

test('01 — constructor validates required endpoint option', () => {
  assert.throws(() => new VaultClient({}), /endpoint/);
  assert.throws(() => new VaultClient({ endpoint: 123 }), /endpoint/);
  const c = new VaultClient({ endpoint: 'https://vault.local:8200/' });
  assert.equal(c.endpoint, 'https://vault.local:8200', 'trailing slash trimmed');
  assert.equal(c.kvMount, 'secret');
  assert.equal(c.transitMount, 'transit');
  assert.equal(c.pkiMount, 'pki');
});

test('02 — injectTransport replaces transport + resetTransport restores it', async () => {
  const client = makeClient();
  const { mock, calls } = makeMock([
    { status: 200, body: { initialized: true, sealed: false } },
  ]);
  client.injectTransport(mock);
  const health = await client.health();
  assert.equal(health.initialized, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.match(calls[0].url, /\/v1\/sys\/health$/);

  // injectTransport with non-function must throw / חייב לזרוק אם לא פונקציה
  assert.throws(() => client.injectTransport('nope'), /function/);
  client.resetTransport();
  assert.notEqual(client._transport, mock, 'transport reset');
});

test('03 — KV v2 write stores data and returns metadata', async () => {
  const client = makeClient();
  const { mock, calls } = makeMock([
    {
      status: 200,
      body: {
        request_id: 'req-1',
        data: { version: 1, created_time: '2026-04-11T00:00:00Z' },
      },
    },
  ]);
  client.injectTransport(mock);

  const meta = await client.kvWrite('apps/erp/db', {
    username: 'uzi',
    password: 'hunter2',
  });
  assert.equal(meta.version, 1);
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].url, /\/v1\/secret\/data\/apps\/erp\/db$/);
  const sentBody = JSON.parse(calls[0].body);
  assert.deepEqual(sentBody.data, { username: 'uzi', password: 'hunter2' });
});

test('04 — KV v2 read returns parsed data + metadata', async () => {
  const client = makeClient();
  const { mock } = makeMock([
    {
      status: 200,
      body: {
        data: {
          data: { api_key: 'abc123', rotated: true },
          metadata: { version: 3, created_time: '2026-04-11T01:00:00Z' },
        },
      },
    },
  ]);
  client.injectTransport(mock);
  const secret = await client.kvRead('apps/erp/api');
  assert.equal(secret.data.api_key, 'abc123');
  assert.equal(secret.metadata.version, 3);
});

test('05 — KV v2 patch uses merge-patch+json content type', async () => {
  const client = makeClient();
  const { mock, calls } = makeMock([
    { status: 200, body: { data: { version: 4 } } },
  ]);
  client.injectTransport(mock);
  await client.kvPatch('apps/erp/api', { rotated_at: '2026-04-11' });
  assert.equal(
    calls[0].headers['Content-Type'],
    'application/merge-patch+json',
    'correct content-type for patch',
  );
});

test('06 — KV v2 list and metadata work independently', async () => {
  const client = makeClient();
  const { mock } = makeMock([
    { status: 200, body: { data: { keys: ['api', 'db', 'smtp'] } } },
    { status: 200, body: { data: { current_version: 5, oldest_version: 1 } } },
  ]);
  client.injectTransport(mock);
  const keys = await client.kvList('apps/erp');
  assert.deepEqual(keys, ['api', 'db', 'smtp']);
  const meta = await client.kvMetadata('apps/erp/api');
  assert.equal(meta.current_version, 5);
});

test('07 — Transit encrypt + decrypt round-trip preserves payload', async () => {
  const client = makeClient();
  const plaintext = 'שלום עולם — hello world';
  // Encrypt returns ciphertext, Decrypt returns plaintext as base64
  const { mock } = makeMock([
    {
      status: 200,
      body: { data: { ciphertext: 'vault:v1:CIPHERTEXT', key_version: 1 } },
    },
    {
      status: 200,
      body: {
        data: { plaintext: Buffer.from(plaintext, 'utf8').toString('base64') },
      },
    },
  ]);
  client.injectTransport(mock);
  const enc = await client.transitEncrypt('erp-key', plaintext);
  assert.equal(enc.ciphertext, 'vault:v1:CIPHERTEXT');
  const dec = await client.transitDecrypt('erp-key', enc.ciphertext, { asString: true });
  assert.equal(dec, plaintext, 'round-trip matches');
});

test('08 — Transit HMAC, rewrap, rotate, random', async () => {
  const client = makeClient();
  const { mock, calls } = makeMock([
    { status: 200, body: { data: { hmac: 'vault:v1:HMAC' } } },
    { status: 200, body: { data: { ciphertext: 'vault:v2:NEW', key_version: 2 } } },
    { status: 204, body: {} },
    {
      status: 200,
      body: { data: { random_bytes: Buffer.from('0123456789abcdef').toString('base64') } },
    },
  ]);
  client.injectTransport(mock);

  const hmac = await client.transitHmac('erp-key', 'payload');
  assert.equal(hmac, 'vault:v1:HMAC');

  const rewrapped = await client.transitRewrap('erp-key', 'vault:v1:OLD');
  assert.equal(rewrapped.key_version, 2);

  const rotated = await client.transitRotateKey('erp-key');
  assert.equal(rotated, true);

  const rnd = await client.transitRandom(16);
  assert.equal(rnd.toString('utf8'), '0123456789abcdef');
  assert.equal(calls.length, 4);
});

test('09 — PKI issueCert returns cert material and requires common_name', async () => {
  const client = makeClient();
  const { mock } = makeMock([
    {
      status: 200,
      body: {
        data: {
          certificate: '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----',
          issuing_ca: '-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----',
          ca_chain: ['-----BEGIN CERTIFICATE-----\nCHAIN\n-----END CERTIFICATE-----'],
          private_key: '-----BEGIN RSA PRIVATE KEY-----\nKEY\n-----END RSA PRIVATE KEY-----',
          serial_number: '01:02:03',
        },
      },
    },
  ]);
  client.injectTransport(mock);

  await assert.rejects(() => client.pkiIssueCert('server', {}), /common_name/);

  const cert = await client.pkiIssueCert('server', {
    common_name: 'api.erp.local',
    ttl: '720h',
  });
  assert.match(cert.certificate, /BEGIN CERTIFICATE/);
  assert.equal(cert.serial_number, '01:02:03');

  const fp = VaultClient.fingerprint(cert.certificate);
  assert.equal(fp.length, 64, 'SHA-256 hex fingerprint');
});

test('10 — PKI signCsr, listRoles, revokeCert', async () => {
  const client = makeClient();
  const { mock } = makeMock([
    {
      status: 200,
      body: {
        data: {
          certificate: '-----BEGIN CERTIFICATE-----\nSIGNED\n-----END CERTIFICATE-----',
          serial_number: '0a:0b',
        },
      },
    },
    { status: 200, body: { data: { keys: ['server', 'client', 'k8s'] } } },
    { status: 200, body: { data: { revocation_time: 1712800000 } } },
  ]);
  client.injectTransport(mock);

  const signed = await client.pkiSignCsr('server', '-----BEGIN CERTIFICATE REQUEST-----\nCSR\n-----END CERTIFICATE REQUEST-----', {
    common_name: 'api.erp.local',
  });
  assert.equal(signed.serial_number, '0a:0b');

  const roles = await client.pkiListRoles();
  assert.deepEqual(roles, ['server', 'client', 'k8s']);

  const rev = await client.pkiRevokeCert('0a:0b');
  assert.equal(rev.revocation_time, 1712800000);
});

test('11 — Token lookupSelf caches result; renewSelf emits event + updates token', async () => {
  const client = makeClient();
  const { mock } = makeMock([
    {
      status: 200,
      body: { data: { id: 's.root', ttl: 3600, renewable: true } },
    },
    {
      status: 200,
      body: {
        auth: { client_token: 's.new-token', lease_duration: 7200, renewable: true },
      },
    },
  ]);
  client.injectTransport(mock);

  const info = await client.lookupSelf();
  assert.equal(info.id, 's.root');
  assert.equal(client._tokenInfo.id, 's.root');

  let renewed = null;
  client.once('token-renewed', (e) => {
    renewed = e;
  });
  const auth = await client.renewSelf(3600);
  assert.equal(auth.client_token, 's.new-token');
  assert.equal(client.token, 's.new-token', 'token rotated in client');
  assert.equal(renewed.lease_duration, 7200);
});

test('12 — Retry with exponential backoff on 503; succeeds on third attempt', async () => {
  const client = makeClient({ maxRetries: 3 });
  const { mock, calls } = makeMock([
    { status: 503, body: { errors: ['vault is sealed'] } },
    { status: 503, body: { errors: ['vault is sealed'] } },
    { status: 200, body: { initialized: true, sealed: false } },
  ]);
  client.injectTransport(mock);
  const h = await client.health();
  assert.equal(h.initialized, true);
  assert.equal(calls.length, 3, 'three total attempts');
  const retryRows = client.getAuditLog({ type: 'retry' });
  assert.equal(retryRows.length, 2, 'two retry audit entries recorded');
});

test('13 — Non-retryable 403 fails fast without retry', async () => {
  const client = makeClient({ maxRetries: 5 });
  const { mock, calls } = makeMock([
    { status: 403, body: { errors: ['permission denied'] } },
  ]);
  client.injectTransport(mock);
  await assert.rejects(
    () => client.kvRead('forbidden/path'),
    (err) => {
      assert.ok(err instanceof VaultError);
      assert.equal(err.status, 403);
      assert.ok(err.errors.includes('permission denied'));
      return true;
    },
  );
  assert.equal(calls.length, 1, 'no retry on 403');
});

test('14 — Namespace header is attached when set', async () => {
  const client = makeClient();
  client.setNamespace('techno-kol/uzi-erp');
  const { mock, calls } = makeMock([{ status: 200, body: { initialized: true } }]);
  client.injectTransport(mock);
  await client.health();
  assert.equal(calls[0].headers['X-Vault-Namespace'], 'techno-kol/uzi-erp');
  assert.equal(calls[0].headers['X-Vault-Token'], 's.test-root-token');
});

test('15 — Audit log records every request, redacts secrets, filters, clears', async () => {
  const client = makeClient({ auditMax: 50 });
  const { mock } = makeMock([
    { status: 200, body: { data: { version: 1 } } }, // kvWrite
    { status: 200, body: { data: { ciphertext: 'vault:v1:CT', key_version: 1 } } }, // encrypt
  ]);
  client.injectTransport(mock);

  const auditEvents = [];
  client.on('audit', (e) => auditEvents.push(e));

  await client.kvWrite('apps/erp/db', { password: 'super-secret-value' });
  await client.transitEncrypt('erp-key', 'shhh-plaintext');

  const all = client.getAuditLog();
  assert.ok(all.length >= 4, 'each call emits request + response audit rows');
  const requests = client.getAuditLog({ type: 'request' });
  assert.equal(requests.length, 2);

  // secret payload must be redacted in the audit body
  const kvRequest = requests.find((r) => r.engine === 'kv');
  assert.ok(kvRequest.redactedBody, 'body present but redacted');
  const s = JSON.stringify(kvRequest.redactedBody);
  assert.ok(!s.includes('super-secret-value'), 'plaintext secret NOT in audit');
  assert.ok(s.includes('REDACTED'), 'REDACTED marker present');

  // filter by engine / סינון לפי מנוע
  const transitRows = client.getAuditLog({ engine: 'transit' });
  assert.ok(transitRows.length >= 2);

  client.clearAuditLog();
  assert.equal(client.getAuditLog().length, 0);
});

test('16 — Invalid input validation for KV and Transit methods', async () => {
  const client = makeClient();
  await assert.rejects(() => client.kvWrite('', { a: 1 }), /path is required/);
  await assert.rejects(() => client.kvWrite('p', null), /data must be an object/);
  await assert.rejects(() => client.kvRead(''), /path is required/);
  await assert.rejects(() => client.kvList(''), /path is required/);
  await assert.rejects(() => client.kvSoftDeleteVersion('p', []), /versions array/);
  await assert.rejects(() => client.kvUndeleteVersion('p', []), /versions array/);
  await assert.rejects(() => client.transitEncrypt('', 'x'), /keyName/);
  await assert.rejects(() => client.transitDecrypt('k', ''), /ciphertext/);
  await assert.rejects(() => client.pkiSignCsr('', 'csr'), /role is required/);
  await assert.rejects(() => client.pkiIssueCert('r', { ttl: '1h' }), /common_name/);
});

test('17 — Transport error is wrapped in VaultError and retried', async () => {
  const client = makeClient({ maxRetries: 2 });
  let failures = 0;
  const transport = async () => {
    failures += 1;
    if (failures < 3) {
      throw new Error('ECONNRESET');
    }
    return { status: 200, headers: {}, body: JSON.stringify({ initialized: true }) };
  };
  client.injectTransport(transport);
  const out = await client.health();
  assert.equal(out.initialized, true);
  assert.equal(failures, 3, 'retried twice then succeeded');
});

test('18 — revokeSelf clears token and nullifies cached tokenInfo', async () => {
  const client = makeClient();
  const { mock } = makeMock([{ status: 204, body: {} }]);
  client.injectTransport(mock);
  client._tokenInfo = { id: 's.root' };
  const ok = await client.revokeSelf();
  assert.equal(ok, true);
  assert.equal(client.token, '');
  assert.equal(client._tokenInfo, null);
});

test('19 — KV soft delete + undelete preserve data (never destroy)', async () => {
  const client = makeClient();
  const { mock, calls } = makeMock([
    { status: 204, body: {} },
    { status: 204, body: {} },
  ]);
  client.injectTransport(mock);
  const delOk = await client.kvSoftDeleteVersion('apps/erp/db', [1, 2]);
  assert.equal(delOk, true);
  const undel = await client.kvUndeleteVersion('apps/erp/db', [1, 2]);
  assert.equal(undel, true);
  // URLs must point to delete/undelete endpoints, not destroy
  assert.match(calls[0].url, /\/v1\/secret\/delete\/apps\/erp\/db$/);
  assert.match(calls[1].url, /\/v1\/secret\/undelete\/apps\/erp\/db$/);
  assert.ok(!calls.some((c) => /\/destroy\//.test(c.url)), 'no destroy call issued');
});

test('20 — Internal helpers: encodePath, redact, safeJsonParse', () => {
  const { encodePath, redact, safeJsonParse, SENSITIVE_KEYS } = _internals;

  assert.equal(encodePath('apps/erp/api'), 'apps/erp/api');
  assert.equal(encodePath('apps/erp with space'), 'apps/erp%20with%20space');
  assert.equal(encodePath(''), '');

  const red = redact({
    username: 'uzi',
    password: 'hunter2',
    nested: { token: 'abc', age: 42 },
    arr: [{ secret: 'x' }, { ok: 'y' }],
  });
  assert.equal(red.username.startsWith('[REDACTED'), true);
  assert.equal(red.password, '[REDACTED]');
  assert.equal(red.nested.token, '[REDACTED]');
  assert.equal(red.nested.age, 42);
  assert.equal(red.arr[0].secret, '[REDACTED]');

  assert.deepEqual(safeJsonParse('{"a":1}'), { a: 1 });
  assert.deepEqual(safeJsonParse(''), {});
  assert.deepEqual(safeJsonParse('not json'), { _raw: 'not json' });
  assert.ok(SENSITIVE_KEYS.has('password'));
  assert.ok(SENSITIVE_KEYS.has('plaintext'));
});

test('21 — Retry gives up after maxRetries and throws last VaultError', async () => {
  const client = makeClient({ maxRetries: 2 });
  const { mock, calls } = makeMock([
    { status: 500, body: { errors: ['server melt'] } },
    { status: 500, body: { errors: ['server melt'] } },
    { status: 500, body: { errors: ['server melt'] } },
  ]);
  client.injectTransport(mock);
  await assert.rejects(
    () => client.health(),
    (err) => err instanceof VaultError && err.status === 500,
  );
  assert.equal(calls.length, 3, 'initial + 2 retries = 3 attempts');
});

test('22 — getConfig exposes non-sensitive configuration snapshot', () => {
  const client = makeClient({ namespace: 'tk/uzi' });
  const cfg = client.getConfig();
  assert.equal(cfg.endpoint, 'https://vault.example.test:8200');
  assert.equal(cfg.namespace, 'tk/uzi');
  assert.equal(cfg.kvMount, 'secret');
  assert.equal(cfg.hasToken, true);
  assert.equal(cfg.token, undefined, 'raw token never exposed');
});
