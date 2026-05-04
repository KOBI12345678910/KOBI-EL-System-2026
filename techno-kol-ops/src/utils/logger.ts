/**
 * Production-safe logger (Agent 8 fix)
 * Use this instead of raw console.log in production
 */

const isProd = process.env.NODE_ENV === 'production';

export const log = {
    info: (...args: any[]) => {
          if (!isProd) console.log('[INFO]', ...args);
    },
    warn: (...args: any[]) => {
          if (!isProd) console.warn('[WARN]', ...args);
    },
    error: (...args: any[]) => {
          console.error('[ERROR]', ...args);
    },
    debug: (...args: any[]) => {
          if (process.env.LOG_LEVEL === 'debug') console.log('[DEBUG]', ...args);
    },
};

export default log;
