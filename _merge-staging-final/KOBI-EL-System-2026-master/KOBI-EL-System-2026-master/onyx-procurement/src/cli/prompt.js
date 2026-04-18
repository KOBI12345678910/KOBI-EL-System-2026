/**
 * onyx-cli — synchronous confirmation prompt using readline.
 *
 * We use readline (from node core) rather than readline/promises so we
 * can resolve via a single callback and keep the handler synchronous.
 * When ONYX_CLI_ASSUME_YES=1 (or --yes is passed) the prompt is skipped.
 *
 * The prompt is bilingual: "Continue? (y/N) / להמשיך? (כן/לא)".
 */
'use strict';

const readline = require('node:readline');

/**
 * Ask a yes/no question. Returns a promise that resolves with boolean.
 * Accepts Hebrew "כן" and English "y / yes"; everything else is no.
 *
 * @param {string} message
 * @param {object} opts
 * @param {boolean} [opts.assumeYes]
 * @param {NodeJS.ReadableStream} [opts.input]
 * @param {NodeJS.WritableStream} [opts.output]
 */
function confirm(message, opts = {}) {
  if (opts.assumeYes || process.env.ONYX_CLI_ASSUME_YES === '1') {
    return Promise.resolve(true);
  }
  const input = opts.input || process.stdin;
  const output = opts.output || process.stdout;
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input, output, terminal: false });
    const prompt = `${message} (y/N) / להמשיך? (כן/לא) `;
    rl.question(prompt, (answer) => {
      rl.close();
      const norm = String(answer || '').trim().toLowerCase();
      const yes = norm === 'y' || norm === 'yes' || norm === 'כן';
      resolve(yes);
    });
  });
}

module.exports = { confirm };
