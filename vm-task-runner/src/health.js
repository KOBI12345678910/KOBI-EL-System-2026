'use strict';

async function getHealth() {
  return {
    ok: true,
    service: 'vm-task-runner',
    version: require('../package.json').version,
    timestamp: new Date().toISOString(),
    uptime_sec: Math.round(process.uptime()),
  };
}

module.exports = { getHealth };
