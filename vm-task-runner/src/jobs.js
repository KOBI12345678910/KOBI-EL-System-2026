/**
 * Cron job registry for vm-task-runner.
 *
 * Each job references a step in the Master Flow or a periodic ERP routine.
 * See CLAUDE.md → Master Flow & workflow-flows.js for the broader context.
 */

'use strict';

const jobs = [
  {
    name: 'daily-kpi-snapshot',
    cron: '5 0 * * *', // 00:05 daily
    description: 'Write daily KPI snapshot into techno-kol-ops',
    handler: async ({ logger }) => {
      logger.info('daily-kpi-snapshot — placeholder; wire to OPS /api/kpi/snapshot');
      // TODO: fetch('http://techno-kol-ops:3200/api/kpi/snapshot', { method: 'POST' })
    },
  },
  {
    name: 'payroll-monthly-close',
    cron: '0 2 1 * *', // 02:00 on the 1st of each month
    description: 'Trigger monthly payroll close in payroll-autonomous',
    handler: async ({ logger }) => {
      logger.info('payroll-monthly-close — placeholder');
    },
  },
  {
    name: 'vat-period-reminder',
    cron: '0 9 14 * *', // 09:00 on the 14th — Israeli VAT cycle reminder
    description: 'VAT period reminder (Israeli bi-monthly cycle)',
    handler: async ({ logger }) => {
      logger.info('vat-period-reminder — placeholder; wire to onyx-procurement');
    },
  },
  {
    name: 'procurement-rfq-followup',
    cron: '0 10 * * 1-5', // 10:00 weekdays
    description: 'Follow up on open RFQs without supplier response',
    handler: async ({ logger }) => {
      logger.info('procurement-rfq-followup — placeholder');
    },
  },
  {
    name: 'ai-nightly-recommendations',
    cron: '0 3 * * *', // 03:00 daily
    description: 'Ask ONYX_AI to generate next-day recommendations',
    handler: async ({ logger }) => {
      logger.info('ai-nightly-recommendations — placeholder; wire to onyx-ai:3300');
    },
  },
];

const registered = [];

function init({ cron, logger }) {
  for (const job of jobs) {
    if (!cron.validate(job.cron)) {
      logger.warn({ job: job.name, cron: job.cron }, 'invalid cron, skipping');
      continue;
    }
    cron.schedule(job.cron, async () => {
      const started = Date.now();
      try {
        logger.info({ job: job.name }, 'job start');
        await job.handler({ logger });
        logger.info({ job: job.name, ms: Date.now() - started }, 'job done');
      } catch (err) {
        logger.error({ job: job.name, err }, 'job failed');
      }
    });
    registered.push({ name: job.name, cron: job.cron, description: job.description });
    logger.info({ job: job.name, cron: job.cron }, 'registered');
  }
}

async function trigger(name, payload) {
  const job = jobs.find((j) => j.name === name);
  if (!job) throw new Error(`unknown job: ${name}`);
  return job.handler({ logger: console, payload });
}

module.exports = {
  registerJobs: { init, trigger, registered },
};
