/**
 * Redis-backed task queue for long-running / async work.
 * Falls back gracefully if Redis isn't reachable.
 */

'use strict';

const Redis = require('ioredis');

const QUEUE_KEY = process.env.VM_QUEUE_KEY || 'vm-task-runner:queue';
const POLL_INTERVAL_MS = 1000;

let redis = null;

async function initQueue({ logger }) {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
  });
  await redis.connect();
  logger.info({ url }, 'queue connected');
}

async function enqueue(task) {
  if (!redis) throw new Error('queue not initialized');
  await redis.rpush(QUEUE_KEY, JSON.stringify(task));
}

function startWorker({ logger }) {
  if (!redis) return;
  logger.info('queue worker started');

  const loop = async () => {
    try {
      const item = await redis.lpop(QUEUE_KEY);
      if (item) {
        const task = JSON.parse(item);
        logger.info({ task: task.type }, 'processing task');
        // TODO: dispatch by task.type to specific handlers
      }
    } catch (err) {
      logger.error({ err }, 'queue worker error');
    } finally {
      setTimeout(loop, POLL_INTERVAL_MS);
    }
  };

  loop();
}

module.exports = { initQueue, startWorker, enqueue };
