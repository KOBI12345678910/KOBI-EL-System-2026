// Agent Y-123 — Tests for WhatsAppBusiness adapter
// =============================================================
// File: onyx-procurement/test/comms/whatsapp-business.test.js
//
// Zero-dep test runner. Run with:
//   cd onyx-procurement
//   node --test test/comms/whatsapp-business.test.js
//
// Coverage (>= 18 tests):
//   * Israeli phone normalisation
//   * template submission, approval & send path
//   * free-text blocked outside 24h window
//   * free-text allowed inside 24h window
//   * opt-out via webhook STOP keyword
//   * opt-out via explicit optOut() call
//   * rate-limit tier check
//   * interactive buttons
//   * interactive lists
//   * webhook: text parsing
//   * webhook: media parsing
//   * webhook: status update
//   * reply-in-thread
//   * markAsRead
//   * media send
//   * delivery report state machine
//   * conversation window helper
//   * daily cost report
//   * mock transport injection

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  WhatsAppBusiness,
  TIER_LIMITS,
  TEMPLATE_STATUS,
  PRICING_ISRAEL_USD,
  OPT_OUT_KEYWORDS,
  WINDOW_MS,
  normalisePhone,
  textContainsOptOut,
} = require('../../src/comms/whatsapp-business');

// -------------------------------------------------------------
// Test utilities
// -------------------------------------------------------------
function makeMockTransport() {
  const calls = [];
  const transport = function (method, path, body) {
    calls.push({ method: method, path: path, body: body });
    let json;
    if (/\/messages$/.test(path)) {
      json = {
        messaging_product: 'whatsapp',
        contacts: [{ input: body && body.to, wa_id: body && body.to }],
        messages: [{ id: 'wamid.TEST.' + calls.length }],
      };
    } else if (/message_templates/.test(path)) {
      json = { id: 'tpl_' + calls.length, status: 'PENDING' };
    } else if (/\/media$/.test(path)) {
      json = { id: 'media_' + calls.length };
    } else {
      json = { ok: true };
    }
    return Promise.resolve({ status: 200, json: json });
  };
  transport.calls = calls;
  return transport;
}

function fresh(overrides) {
  const transport = makeMockTransport();
  const wa = new WhatsAppBusiness({
    apiKey: 'TEST-KEY',
    phoneNumberId: 'PHONE_TEST',
    businessId: 'WABA_TEST',
    injectTransport: transport,
    tier: 'TIER_1K',
    ...(overrides || {}),
  });
  wa._mockTransport = transport;
  return wa;
}

/** Simulate an inbound user message to open the 24h window. */
function openWindowFor(wa, phone) {
  wa.webhookHandler({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA_TEST',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          messages: [{
            id: 'wamid.USER.' + phone + '.' + Date.now(),
            from: phone,
            type: 'text',
            text: { body: 'שלום, אני מתעניין במוצר' },
            timestamp: String(Math.floor(Date.now() / 1000)),
          }],
        },
      }],
    }],
  });
}

/** Register + approve a template in one shot. */
async function registerApproved(wa, name, lang, category) {
  await wa.templateApproval({
    name: name,
    lang: lang,
    category: category || 'UTILITY',
    components: [{
      type: 'BODY',
      text: 'שלום {{1}}, ההזמנה שלך {{2}} ממתינה.',
    }],
  });
  wa.setTemplateStatus(name, lang, TEMPLATE_STATUS.APPROVED);
}

// =============================================================
// Tests begin
// =============================================================

// 1. Israeli phone normalisation
test('normalisePhone handles Israeli formats', function () {
  assert.equal(normalisePhone('054-1234567'), '972541234567');
  assert.equal(normalisePhone('0541234567'), '972541234567');
  assert.equal(normalisePhone('+972-54-123-4567'), '972541234567');
  assert.equal(normalisePhone('972541234567'), '972541234567');
  assert.equal(normalisePhone(' 02-1234567 '), '97221234567');
  assert.throws(function () { normalisePhone('abc'); }, /invalid phone/);
  assert.throws(function () { normalisePhone(''); }, /required/);
});

// 2. Configure requires the three core fields + accepts injected transport
test('configure() requires credentials and accepts injectTransport', function () {
  const wa = new WhatsAppBusiness();
  assert.throws(function () { wa.configure({ apiKey: 'k' }); }, /phoneNumberId/);
  const tx = makeMockTransport();
  const cfg = wa.configure({
    apiKey: 'K', phoneNumberId: 'P', businessId: 'B', injectTransport: tx,
  });
  assert.equal(cfg.phoneNumberId, 'P');
  assert.equal(cfg.businessId, 'B');
});

// 3. Template registration -> pending status and transport call
test('templateApproval submits PENDING template', async function () {
  const wa = fresh();
  const rec = await wa.templateApproval({
    name: 'order_ready_he',
    lang: 'he',
    category: 'UTILITY',
    components: [{ type: 'BODY', text: 'ההזמנה {{1}} מוכנה' }],
  });
  assert.equal(rec.status, TEMPLATE_STATUS.PENDING);
  assert.equal(rec.name, 'order_ready_he');
  assert.equal(rec.category, 'UTILITY');
  assert.ok(wa._mockTransport.calls.some(function (c) {
    return /message_templates/.test(c.path);
  }));
});

// 4. sendTemplate rejects non-approved template
test('sendTemplate refuses if template not approved', async function () {
  const wa = fresh();
  await wa.templateApproval({
    name: 'pending_tpl', lang: 'he', category: 'MARKETING',
    components: [{ type: 'BODY', text: 'hi {{1}}' }],
  });
  await assert.rejects(function () {
    return wa.sendTemplate({
      to: '0541234567', templateName: 'pending_tpl', lang: 'he', variables: ['Kobi'],
    });
  }, /not approved/);
});

// 5. sendTemplate works after approval, records send
test('sendTemplate dispatches when approved', async function () {
  const wa = fresh();
  await registerApproved(wa, 'order_ready', 'he', 'UTILITY');
  const rec = await wa.sendTemplate({
    to: '0541234567', templateName: 'order_ready', lang: 'he', variables: ['קובי', 'INV-42'],
  });
  assert.equal(rec.kind, 'template');
  assert.equal(rec.status, 'sent');
  assert.ok(rec.msgId);
  assert.equal(wa.getSends().length, 1);
});

// 6. Free-text refused outside 24h window
test('sendText refused outside 24h window', async function () {
  const wa = fresh();
  await assert.rejects(function () {
    return wa.sendText({ to: '0541234567', message: 'hi' });
  }, /24h window closed/);
});

// 7. Free-text allowed inside 24h window
test('sendText allowed after inbound opens window', async function () {
  const wa = fresh();
  openWindowFor(wa, '972541234567');
  const rec = await wa.sendText({ to: '0541234567', message: 'תודה על פנייתך' });
  assert.equal(rec.kind, 'text');
  assert.equal(rec.status, 'sent');
  assert.equal(rec.pricingCategory, 'service');
});

// 8. conversationWindow helper reports open/closed
test('conversationWindow() reports session state', function () {
  const wa = fresh();
  const cold = wa.conversationWindow('0541234567');
  assert.equal(cold.open, false);
  openWindowFor(wa, '972541234567');
  const hot = wa.conversationWindow('0541234567');
  assert.equal(hot.open, true);
  assert.ok(hot.remainingMs > 0 && hot.remainingMs <= WINDOW_MS);
});

// 9. Opt-out via STOP keyword in webhook
test('webhook STOP keyword triggers statutory opt-out', function () {
  const wa = fresh();
  const result = wa.webhookHandler({
    entry: [{
      changes: [{
        value: {
          messages: [{
            id: 'wamid.USER.STOP',
            from: '972541234567',
            type: 'text',
            text: { body: 'עצור' },
            timestamp: String(Math.floor(Date.now() / 1000)),
          }],
        },
      }],
    }],
  });
  assert.equal(result.optOuts.length, 1);
  assert.ok(wa.isOptedOut('0541234567'));
  assert.equal(wa.getOptOuts()[0].legalBasis.includes('30א'), true);
});

// 10. Opt-out blocks all future sends
test('opted-out phone cannot receive anything', async function () {
  const wa = fresh();
  await registerApproved(wa, 'blocked_tpl', 'he');
  wa.optOut('0541234567', 'unit test');
  await assert.rejects(function () {
    return wa.sendTemplate({
      to: '0541234567', templateName: 'blocked_tpl', lang: 'he', variables: [],
    });
  }, /opted out/);
});

// 11. Rate limit tier check
test('rateLimitCheck returns tier info', function () {
  const wa = fresh({ tier: 'TIER_1K' });
  const check = wa.rateLimitCheck('0541234567');
  assert.equal(check.tier, 'TIER_1K');
  assert.equal(check.limit, TIER_LIMITS.TIER_1K);
  assert.equal(check.used, 0);
  assert.equal(check.allowed, true);
});

// 12. Interactive buttons
test('sendInteractive renders buttons within 24h window', async function () {
  const wa = fresh();
  openWindowFor(wa, '972541234567');
  const rec = await wa.sendInteractive({
    to: '0541234567',
    type: 'button',
    payload: {
      body: 'האם לאשר את ההזמנה?',
      buttons: [
        { id: 'yes', title: 'כן' },
        { id: 'no', title: 'לא' },
      ],
    },
  });
  assert.equal(rec.kind, 'interactive');
  assert.equal(rec.interactiveType, 'button');
  assert.equal(rec.body.interactive.action.buttons.length, 2);
  assert.equal(rec.body.interactive.action.buttons[0].reply.title, 'כן');
});

// 13. Interactive list
test('sendInteractive renders a list within 24h window', async function () {
  const wa = fresh();
  openWindowFor(wa, '972541234567');
  const rec = await wa.sendInteractive({
    to: '0541234567',
    type: 'list',
    payload: {
      body: 'בחר מוצר',
      buttonText: 'פתח רשימה',
      sections: [{
        title: 'קטגוריה',
        rows: [{ id: 'r1', title: 'פריט 1' }, { id: 'r2', title: 'פריט 2' }],
      }],
    },
  });
  assert.equal(rec.interactiveType, 'list');
  assert.equal(rec.body.interactive.action.sections.length, 1);
});

// 14. Webhook parses inbound media
test('webhook parses image media', function () {
  const wa = fresh();
  const result = wa.webhookHandler({
    entry: [{
      changes: [{
        value: {
          messages: [{
            id: 'wamid.IMG',
            from: '972541234567',
            type: 'image',
            image: { id: 'M123', mime_type: 'image/jpeg', caption: 'תמונה' },
            timestamp: String(Math.floor(Date.now() / 1000)),
          }],
        },
      }],
    }],
  });
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].type, 'image');
  assert.equal(result.messages[0].mediaId, 'M123');
  assert.equal(result.messages[0].mimeType, 'image/jpeg');
});

// 15. Webhook parses delivery status
test('webhook updates delivery status', function () {
  const wa = fresh();
  const result = wa.webhookHandler({
    entry: [{
      changes: [{
        value: {
          statuses: [{
            id: 'wamid.OUT.1',
            status: 'delivered',
            timestamp: String(Math.floor(Date.now() / 1000)),
            recipient_id: '972541234567',
            pricing: { category: 'utility', billable: true },
          }],
        },
      }],
    }],
  });
  assert.equal(result.statuses.length, 1);
  const rpt = wa.deliveryReport('wamid.OUT.1');
  assert.equal(rpt.current, 'delivered');
  assert.equal(rpt.delivered, true);
});

// 16. sendMedia inside 24h window
test('sendMedia delivers an image inside the window', async function () {
  const wa = fresh();
  openWindowFor(wa, '972541234567');
  const rec = await wa.sendMedia({
    to: '0541234567', type: 'image', mediaId: 'MEDIA_ID_1', caption: 'צילום מסך',
  });
  assert.equal(rec.kind, 'media');
  assert.equal(rec.mediaType, 'image');
  assert.equal(rec.body.image.caption, 'צילום מסך');
});

// 17. replyToMessage threads correctly
test('replyToMessage adds context.message_id', async function () {
  const wa = fresh();
  openWindowFor(wa, '972541234567');
  const rec = await wa.replyToMessage({
    to: '0541234567',
    originalMessageId: 'wamid.ORIG',
    message: 'מענה בשרשור',
  });
  assert.equal(rec.body.context.message_id, 'wamid.ORIG');
  assert.equal(rec.repliesTo, 'wamid.ORIG');
});

// 18. markAsRead creates an audit record
test('markAsRead appends to read receipts ledger', async function () {
  const wa = fresh();
  const ev = await wa.markAsRead('wamid.ORIG');
  assert.equal(ev.messageId, 'wamid.ORIG');
  assert.equal(wa.getReadReceipts().length, 1);
});

// 19. dailyCostReport sums send ledger by category
test('dailyCostReport sums Israel pricing across sends', async function () {
  const wa = fresh();
  await registerApproved(wa, 'mkt_tpl', 'he', 'MARKETING');
  await registerApproved(wa, 'util_tpl', 'he', 'UTILITY');
  await wa.sendTemplate({
    to: '0541234567', templateName: 'mkt_tpl', lang: 'he', variables: [],
  });
  await wa.sendTemplate({
    to: '0541234568', templateName: 'util_tpl', lang: 'he', variables: [],
  });
  const rpt = wa.dailyCostReport();
  assert.equal(rpt.currency, 'USD');
  assert.equal(rpt.region, 'IL');
  assert.ok(rpt.total > 0);
  assert.ok(rpt.byCategory.marketing > 0);
  assert.ok(rpt.byCategory.utility > 0);
  assert.equal(rpt.unitPrices.marketing, PRICING_ISRAEL_USD.marketing);
});

// 20. Mock transport captures every outbound call
test('mock transport records every outbound request', async function () {
  const wa = fresh();
  await registerApproved(wa, 'tpl_x', 'he');
  await wa.sendTemplate({
    to: '0541234567', templateName: 'tpl_x', lang: 'he', variables: ['foo'],
  });
  const calls = wa._mockTransport.calls;
  // 1 transport call for templateApproval POST, 1 for the send itself.
  assert.ok(calls.length >= 2);
  assert.ok(calls.some(function (c) { return /\/messages$/.test(c.path); }));
  assert.ok(calls.some(function (c) { return /message_templates/.test(c.path); }));
});

// 21. OPT_OUT_KEYWORDS recognised by helper
test('textContainsOptOut recognises Hebrew + English', function () {
  assert.equal(textContainsOptOut('STOP'), true);
  assert.equal(textContainsOptOut('עצור'), true);
  assert.equal(textContainsOptOut('הסר אותי מהרשימה'), true);
  assert.equal(textContainsOptOut('אני רוצה לקנות'), false);
});

// 22. Append-only discipline — nothing is ever popped
test('ledgers are append-only (house rule: לא מוחקים)', async function () {
  const wa = fresh();
  await registerApproved(wa, 'h_tpl', 'he');
  await wa.sendTemplate({ to: '0541234567', templateName: 'h_tpl', lang: 'he', variables: [] });
  const beforeSends = wa.getSends().length;
  const beforeTpls = wa.getTemplates().length;
  // Attempt something that in a mutable API might clear buffers.
  wa.getSends().splice(0);          // returned array is a copy
  wa.getTemplates().splice(0);
  assert.equal(wa.getSends().length, beforeSends);
  assert.equal(wa.getTemplates().length, beforeTpls);
});
