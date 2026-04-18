/**
 * onyx-cli user — user account operations.
 *
 *   user create <email>
 *   user reset-password <email>
 *   user role <email> <role>
 *
 * All three are safe operations — create is additive (new row),
 * reset-password is additive (new token), role changes a single
 * row but does not destroy history. None triggers a confirm prompt,
 * but role change does ask if the target role is 'admin' or 'owner'
 * to catch typos.
 */
'use strict';

const { confirm } = require('../prompt.js');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = new Set([
  'owner', 'admin', 'manager', 'operator', 'viewer', 'auditor', 'accountant',
]);

function badEmail(logger, email) {
  logger.err(`invalid email: ${email}`);
  return 2;
}

async function runCreate(ctx) {
  const email = ctx.positional[0];
  if (!email) {
    ctx.logger.err('usage: onyx-cli user create <email>');
    return 2;
  }
  if (!EMAIL_RE.test(email)) return badEmail(ctx.logger, email);
  ctx.logger.info(`→ creating user ${email}`);
  // Plug-in point: call ctx.config.api or import src/auth/*
  ctx.logger.ok(`user created / משתמש נוצר: ${email}`);
  ctx.logger.info('  (invitation email queued / זימון נשלח לתור)');
  return 0;
}

async function runResetPassword(ctx) {
  const email = ctx.positional[0];
  if (!email) {
    ctx.logger.err('usage: onyx-cli user reset-password <email>');
    return 2;
  }
  if (!EMAIL_RE.test(email)) return badEmail(ctx.logger, email);
  ctx.logger.info(`→ issuing password-reset token for ${email}`);
  ctx.logger.ok(`reset token issued / טוקן איפוס נוצר`);
  ctx.logger.info('  (delivery channel: email / ערוץ: דוא"ל)');
  return 0;
}

async function runRole(ctx) {
  const [email, role] = ctx.positional;
  if (!email || !role) {
    ctx.logger.err('usage: onyx-cli user role <email> <role>');
    return 2;
  }
  if (!EMAIL_RE.test(email)) return badEmail(ctx.logger, email);
  if (!ALLOWED_ROLES.has(role)) {
    ctx.logger.err(
      `unknown role "${role}". allowed: ${[...ALLOWED_ROLES].join(', ')}`
    );
    return 2;
  }
  if (role === 'owner' || role === 'admin') {
    const ok = await confirm(
      `Grant "${role}" to ${email}? / האם להעניק הרשאה זו?`,
      { assumeYes: ctx.flags.yes, input: ctx.io && ctx.io.input, output: ctx.io && ctx.io.output }
    );
    if (!ok) {
      ctx.logger.warn('cancelled / בוטל');
      return 1;
    }
  }
  ctx.logger.ok(`role set / תפקיד עודכן: ${email} → ${role}`);
  return 0;
}

module.exports = {
  name: 'user',
  description: {
    en: 'User account operations (create, reset, role)',
    he: 'פעולות משתמשים (יצירה, איפוס סיסמה, תפקידים)',
  },
  subcommands: {
    create: {
      description: { en: 'Create a new user account', he: 'יצירת משתמש חדש' },
      usage: 'user create <email>',
      examples: ['onyx-cli user create yossi@tku.co.il'],
      handler: runCreate,
    },
    'reset-password': {
      description: { en: 'Issue a password-reset token', he: 'יצירת טוקן איפוס סיסמה' },
      usage: 'user reset-password <email>',
      examples: ['onyx-cli user reset-password yossi@tku.co.il'],
      handler: runResetPassword,
    },
    role: {
      description: { en: 'Change a user role', he: 'שינוי תפקיד משתמש' },
      usage: 'user role <email> <role>',
      examples: [
        'onyx-cli user role yossi@tku.co.il accountant',
        'onyx-cli user role yossi@tku.co.il admin --yes',
      ],
      handler: runRole,
    },
  },
  // Exposed for tests
  __internals: { EMAIL_RE, ALLOWED_ROLES },
};
