// Agent 74 — Unit tests for whatsapp-templates.js + send-whatsapp.js
// Uses plain Node asserts so it runs with `node` or any test harness.
// No external deps.

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  TEMPLATES,
  getTemplate,
  listTemplates,
  countPlaceholders,
  renderTemplatePayload,
} = require('./whatsapp-templates');

// Redirect opt-in + audit logs to a tmp dir before loading sender.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-test-'));
process.env.WHATSAPP_OPTIN_STORE = path.join(TMP, 'optin.json');
process.env.WHATSAPP_AUDIT_LOG = path.join(TMP, 'audit.log');
process.env.WHATSAPP_PHONE_NUMBER_ID = 'TEST_PHONE_ID';
process.env.WHATSAPP_ACCESS_TOKEN = 'TEST_TOKEN';
process.env.WHATSAPP_RETRY_BASE_MS = '5';

const sender = require('./send-whatsapp');
const webhook = require('./whatsapp-webhook');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    // eslint-disable-next-line no-console
    console.log('  ok  ' + name);
  } catch (err) {
    failed += 1;
    // eslint-disable-next-line no-console
    console.error('  FAIL ' + name);
    // eslint-disable-next-line no-console
    console.error('       ' + (err && err.stack ? err.stack : err));
  }
}

(async function run() {
  // -----------------------------------------------------------
  // whatsapp-templates.js
  // -----------------------------------------------------------
  console.log('whatsapp-templates');

  await test('all 6 required templates exist', () => {
    const required = [
      'wage_slip_ready',
      'invoice_reminder',
      'payment_received',
      'po_status_update',
      'appointment_reminder',
      'urgent_action_needed',
    ];
    for (const n of required) {
      assert.ok(TEMPLATES[n], 'missing template ' + n);
      assert.strictEqual(TEMPLATES[n].language, 'he');
      assert.ok(['UTILITY', 'MARKETING', 'AUTHENTICATION'].includes(TEMPLATES[n].category));
      assert.ok(Array.isArray(TEMPLATES[n].components));
    }
  });

  await test('getTemplate returns null for unknown', () => {
    assert.strictEqual(getTemplate('does_not_exist'), null);
    assert.strictEqual(getTemplate(null), null);
    assert.ok(getTemplate('wage_slip_ready'));
  });

  await test('listTemplates returns an array of names', () => {
    const names = listTemplates();
    assert.ok(Array.isArray(names));
    assert.ok(names.length >= 6);
    assert.ok(names.includes('payment_received'));
  });

  await test('countPlaceholders returns highest {{n}}', () => {
    const tpl = TEMPLATES.wage_slip_ready;
    // body has {{1}}{{2}}{{3}} and url button has {{4}}
    assert.strictEqual(countPlaceholders(tpl), 4);
    assert.strictEqual(countPlaceholders(TEMPLATES.payment_received), 3);
  });

  await test('renderTemplatePayload builds a valid Cloud API payload', () => {
    const p = renderTemplatePayload(
      'wage_slip_ready',
      '972501234567',
      ['קובי', 'מרץ 2026', '12,345', 'https://x.example/slip/1']
    );
    assert.strictEqual(p.messaging_product, 'whatsapp');
    assert.strictEqual(p.to, '972501234567');
    assert.strictEqual(p.type, 'template');
    assert.strictEqual(p.template.name, 'wage_slip_ready');
    assert.strictEqual(p.template.language.code, 'he');
    // One body component + one button component.
    const body = p.template.components.find((c) => c.type === 'body');
    const btn = p.template.components.find((c) => c.type === 'button');
    assert.strictEqual(body.parameters.length, 3);
    assert.strictEqual(btn.sub_type, 'url');
    assert.strictEqual(btn.parameters[0].text, 'https://x.example/slip/1');
  });

  await test('renderTemplatePayload rejects wrong param count', () => {
    assert.throws(() =>
      renderTemplatePayload('wage_slip_ready', '972501234567', ['only-one'])
    );
  });

  await test('renderTemplatePayload rejects unknown template', () => {
    assert.throws(() => renderTemplatePayload('nope', '972501234567', []));
  });

  // -----------------------------------------------------------
  // send-whatsapp.js — opt-in + queue + retry
  // -----------------------------------------------------------
  console.log('send-whatsapp');

  await test('recordOptIn / hasOptIn / recordOptOut round-trip', () => {
    sender.recordOptIn('972501234567', 'test');
    assert.strictEqual(sender.hasOptIn('972501234567'), true);
    sender.recordOptOut('972501234567', 'unit_test');
    assert.strictEqual(sender.hasOptIn('972501234567'), false);
    // data still on disk for audit
    const raw = JSON.parse(fs.readFileSync(process.env.WHATSAPP_OPTIN_STORE, 'utf8'));
    assert.ok(raw.entries['972501234567'].opted_out_at);
    assert.ok(raw.entries['972501234567'].opted_in_at); // preserved
  });

  await test('sendTemplate blocks recipients without opt-in', async () => {
    sender.__resetState();
    let threw = false;
    try {
      await sender.sendTemplate('972507777777', 'payment_received', ['א', '100', 'R1']);
    } catch (err) {
      threw = /opted in/.test(err.message);
    }
    assert.strictEqual(threw, true, 'should have refused to send');
  });

  await test('sendTemplate queues + retries on 500 then succeeds', async () => {
    sender.__resetState();
    sender.recordOptIn('972508888888', 'test');
    let calls = 0;
    sender.__setHttpImpl(async (payload) => {
      calls += 1;
      assert.strictEqual(payload.template.name, 'payment_received');
      if (calls < 2) {
        return { status: 500, headers: {}, body: { error: 'boom' }, raw: '' };
      }
      return {
        status: 200,
        headers: {},
        body: { messages: [{ id: 'wamid.TEST123' }] },
        raw: '',
      };
    });
    const res = await sender.sendTemplate(
      '972508888888',
      'payment_received',
      ['קובי', '5,000', 'R-42']
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.messages[0].id, 'wamid.TEST123');
    assert.ok(calls >= 2);
    sender.__setHttpImpl(null);
  });

  await test('sendTemplate rejects non-retryable 4xx', async () => {
    sender.__resetState();
    sender.recordOptIn('972509999999', 'test');
    sender.__setHttpImpl(async () => ({
      status: 400,
      headers: {},
      body: { error: { code: 132001, message: 'template not found' } },
      raw: '',
    }));
    let threw = false;
    try {
      await sender.sendTemplate('972509999999', 'payment_received', ['א', '1', 'R']);
    } catch (err) {
      threw = /rejected 400/.test(err.message);
    }
    sender.__setHttpImpl(null);
    assert.strictEqual(threw, true);
  });

  await test('rate limiter enforces ~80/sec ceiling (smoke)', async () => {
    sender.__resetState();
    sender.recordOptIn('972501010101', 'test');
    sender.__setHttpImpl(async () => ({
      status: 200,
      headers: {},
      body: { messages: [{ id: 'wamid.rate' }] },
      raw: '',
    }));
    // Fire 10 sends in parallel — should all resolve.
    const start = Date.now();
    await Promise.all(
      Array.from({ length: 10 }, () =>
        sender.sendTemplate('972501010101', 'payment_received', ['a', '1', 'R'])
      )
    );
    const elapsed = Date.now() - start;
    // 10 calls at 80/s is well under 1s; just sanity-check it finished.
    assert.ok(elapsed < 2000, 'rate limiter deadlocked: ' + elapsed + 'ms');
    sender.__setHttpImpl(null);
  });

  // -----------------------------------------------------------
  // whatsapp-webhook.js
  // -----------------------------------------------------------
  console.log('whatsapp-webhook');

  await test('handleWebhookPayload records delivered status', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: 'wamid.ABC',
                    status: 'delivered',
                    recipient_id: '972501234567',
                    timestamp: '1700000000',
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const r = webhook.handleWebhookPayload(payload);
    assert.strictEqual(r.processed, 1);
    const s = webhook.getStatus('wamid.ABC');
    assert.strictEqual(s.status, 'delivered');
    assert.strictEqual(s.recipient, '972501234567');
  });

  await test('handleWebhookPayload records failed status with error', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: 'wamid.FAIL',
                    status: 'failed',
                    recipient_id: '972501234567',
                    timestamp: '1700000000',
                    errors: [{ code: 131051, title: 'message_undeliverable' }],
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    webhook.handleWebhookPayload(payload);
    const s = webhook.getStatus('wamid.FAIL');
    assert.strictEqual(s.status, 'failed');
    assert.ok(Array.isArray(s.errors));
  });

  await test('STOP keyword triggers opt-out', () => {
    sender.recordOptIn('972501112222', 'test');
    assert.strictEqual(sender.hasOptIn('972501112222'), true);
    webhook.handleWebhookPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.IN',
                    from: '972501112222',
                    type: 'text',
                    text: { body: 'STOP' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    assert.strictEqual(sender.hasOptIn('972501112222'), false);
  });

  await test('verifySignature rejects bad signatures', () => {
    // No appSecret configured in tests → verifySignature returns false.
    const ok = webhook.verifySignature('{"x":1}', 'sha256=abc');
    assert.strictEqual(ok, false);
  });

  // -----------------------------------------------------------
  console.log('\nresults: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
})();
