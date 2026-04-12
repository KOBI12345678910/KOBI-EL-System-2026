/**
 * onyx-cli webhook — webhook utilities.
 *
 *   webhook test <url>  — POST a synthetic payload to a URL and print
 *                         the response status & headers.
 *
 * Uses Node 18+ global fetch so we stay dep-free.
 */
'use strict';

const URL_RE = /^https?:\/\/[^\s]+$/i;

async function runTest(ctx) {
  const url = ctx.positional[0];
  if (!url) {
    ctx.logger.err('usage: onyx-cli webhook test <url>');
    return 2;
  }
  if (!URL_RE.test(url)) {
    ctx.logger.err(`invalid URL: ${url}`);
    return 2;
  }
  if (typeof fetch !== 'function') {
    ctx.logger.err('global fetch() not available — requires Node.js 18+');
    return 2;
  }
  const payload = {
    event: 'onyx.test',
    source: 'onyx-cli',
    timestamp: new Date().toISOString(),
    message: 'This is a webhook test from onyx-cli',
  };
  ctx.logger.info(`→ POST ${url}`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Onyx-Test': '1' },
      body: JSON.stringify(payload),
    });
    ctx.logger.info(`  status: ${res.status} ${res.statusText}`);
    if (res.status >= 200 && res.status < 300) {
      ctx.logger.ok('webhook responded / webhook השיב');
      return 0;
    }
    ctx.logger.err('webhook returned non-2xx');
    return 1;
  } catch (err) {
    ctx.logger.err(`webhook error: ${err.message}`);
    return 1;
  }
}

module.exports = {
  name: 'webhook',
  description: {
    en: 'Webhook utilities',
    he: 'כלי webhook',
  },
  subcommands: {
    test: {
      description: { en: 'POST a test payload to a URL', he: 'שליחת payload לבדיקה' },
      usage: 'webhook test <url>',
      examples: [
        'onyx-cli webhook test https://example.com/hook',
        'onyx-cli webhook test http://localhost:3100/webhooks/test',
      ],
      handler: runTest,
    },
  },
  __internals: { URL_RE },
};
