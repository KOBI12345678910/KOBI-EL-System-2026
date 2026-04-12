/**
 * ci-generator.js — CI/CD pipeline configuration generator
 * Agent Y-166 — Techno-Kol Uzi mega-ERP — written 2026-04-11
 *
 * Zero dependencies. Pure Node.js. No disk I/O — every generator
 * method returns a string. The caller is responsible for writing
 * the result to .github/workflows/*.yml, .gitlab-ci.yml, or
 * Jenkinsfile as appropriate.
 *
 * Principle: "לא מוחקים רק משדרגים ומגדלים" — we never delete an
 * existing stage; callers may only add stages. The generator
 * itself is additive by design: every config field has a default,
 * and every optional feature (secrets masking, manual gates,
 * notification webhooks, artifact retention, Israel-timezone cron)
 * is layered on top of the base pipeline without removing anything.
 *
 * Public API:
 *   const { CIGenerator, DEFAULTS } = require('./ci-generator');
 *   const gen = new CIGenerator();
 *   const gha   = gen.generate({ target: 'github', ...config });
 *   const glci  = gen.generate({ target: 'gitlab', ...config });
 *   const jnks  = gen.generate({ target: 'jenkins', ...config });
 *
 * Supported config keys:
 *   target              : 'github' | 'gitlab' | 'jenkins'  (default 'github')
 *   name                : pipeline / workflow name          (default 'onyx-pipeline')
 *   language            : 'node' | 'ts'                      (default 'node')
 *   nodeVersion         : string                             (default '20')
 *   stages              : string[]                           (default ['lint','test','build','deploy'])
 *   secrets             : string[] (env var names to mask)   (default [])
 *   cronIsrael          : string (cron minute hour dom mon dow — Asia/Jerusalem)
 *   manualApprovalProd  : boolean                            (default true)
 *   artifactRetention   : integer (days)                     (default 30)
 *   artifactPaths       : string[]                           (default ['dist/','coverage/'])
 *   notifyWebhooks      : string[] (URLs to POST on failure) (default [])
 *   branches            : string[] (trigger branches)        (default ['main','master'])
 *   prodEnvironment     : string                             (default 'production')
 */

'use strict';

/* ------------------------------------------------------------------ *
 *  Defaults                                                          *
 * ------------------------------------------------------------------ */

const DEFAULTS = Object.freeze({
  target: 'github',
  name: 'onyx-pipeline',
  language: 'node',
  nodeVersion: '20',
  stages: Object.freeze(['lint', 'test', 'build', 'deploy']),
  secrets: Object.freeze([]),
  cronIsrael: '', // empty = no schedule
  manualApprovalProd: true,
  artifactRetention: 30,
  artifactPaths: Object.freeze(['dist/', 'coverage/']),
  notifyWebhooks: Object.freeze([]),
  branches: Object.freeze(['main', 'master']),
  prodEnvironment: 'production',
});

const VALID_TARGETS = Object.freeze(['github', 'gitlab', 'jenkins']);
const VALID_STAGES  = Object.freeze(['lint', 'test', 'build', 'deploy']);
const VALID_LANGS   = Object.freeze(['node', 'ts']);

/* ------------------------------------------------------------------ *
 *  Helpers                                                           *
 * ------------------------------------------------------------------ */

function assertType(value, type, name) {
  if (typeof value !== type) {
    throw new TypeError(`CIGenerator: '${name}' must be ${type}, got ${typeof value}`);
  }
}

function assertArray(value, name) {
  if (!Array.isArray(value)) {
    throw new TypeError(`CIGenerator: '${name}' must be an array`);
  }
}

function mergeConfig(input) {
  const cfg = { ...DEFAULTS, ...(input || {}) };
  // defensive copies of arrays so callers can't mutate
  cfg.stages         = [...cfg.stages];
  cfg.secrets        = [...cfg.secrets];
  cfg.artifactPaths  = [...cfg.artifactPaths];
  cfg.notifyWebhooks = [...cfg.notifyWebhooks];
  cfg.branches       = [...cfg.branches];
  return cfg;
}

function validateConfig(cfg) {
  if (!VALID_TARGETS.includes(cfg.target)) {
    throw new Error(
      `CIGenerator: unknown target '${cfg.target}' — must be one of ${VALID_TARGETS.join(', ')}`
    );
  }
  if (!VALID_LANGS.includes(cfg.language)) {
    throw new Error(
      `CIGenerator: unknown language '${cfg.language}' — must be one of ${VALID_LANGS.join(', ')}`
    );
  }
  assertType(cfg.name, 'string', 'name');
  if (cfg.name.length === 0) {
    throw new Error("CIGenerator: 'name' cannot be empty");
  }
  assertType(cfg.nodeVersion, 'string', 'nodeVersion');
  assertArray(cfg.stages, 'stages');
  if (cfg.stages.length === 0) {
    throw new Error("CIGenerator: 'stages' cannot be empty");
  }
  for (const s of cfg.stages) {
    if (!VALID_STAGES.includes(s)) {
      throw new Error(
        `CIGenerator: unknown stage '${s}' — must be one of ${VALID_STAGES.join(', ')}`
      );
    }
  }
  assertArray(cfg.secrets, 'secrets');
  assertArray(cfg.artifactPaths, 'artifactPaths');
  assertArray(cfg.notifyWebhooks, 'notifyWebhooks');
  assertArray(cfg.branches, 'branches');
  assertType(cfg.cronIsrael, 'string', 'cronIsrael');
  assertType(cfg.manualApprovalProd, 'boolean', 'manualApprovalProd');
  if (!Number.isInteger(cfg.artifactRetention) || cfg.artifactRetention < 1) {
    throw new Error("CIGenerator: 'artifactRetention' must be a positive integer");
  }
  assertType(cfg.prodEnvironment, 'string', 'prodEnvironment');
  return cfg;
}

/**
 * Convert a human cron expression that was authored in
 * Asia/Jerusalem local time to a UTC cron expression for GitHub
 * Actions (which only accepts UTC). IST = UTC+2, IDT = UTC+3; we
 * use the conservative UTC+2 offset as the baseline and annotate
 * the fact in a YAML comment so human reviewers know.
 *
 * Returns the UTC cron string. Invalid expressions are returned
 * unchanged so the generator never crashes on user input.
 */
function israelCronToUtc(expr) {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hourRaw, dom, mon, dow] = parts;
  const hourNum = parseInt(hourRaw, 10);
  if (!Number.isFinite(hourNum)) return expr;
  // IST offset = +2 hours. Subtract 2 from the local hour to get UTC.
  let utcHour = hourNum - 2;
  if (utcHour < 0) utcHour += 24;
  return `${min} ${utcHour} ${dom} ${mon} ${dow}`;
}

/* ------------------------------------------------------------------ *
 *  Language snippets                                                 *
 * ------------------------------------------------------------------ */

function installCommand(lang) {
  return 'npm ci';
}

function lintCommand(lang) {
  return 'npm run lint';
}

function testCommand(lang) {
  if (lang === 'ts') return 'npm run test';
  return 'npm test';
}

function buildCommand(lang) {
  if (lang === 'ts') return 'npm run build';
  return 'npm run build';
}

function deployCommand(_lang) {
  return 'npm run deploy';
}

function stageCommand(stage, lang) {
  switch (stage) {
    case 'lint':   return lintCommand(lang);
    case 'test':   return testCommand(lang);
    case 'build':  return buildCommand(lang);
    case 'deploy': return deployCommand(lang);
    default:       return `echo "unknown stage ${stage}"`;
  }
}

/* ------------------------------------------------------------------ *
 *  GitHub Actions generator                                          *
 * ------------------------------------------------------------------ */

function renderGitHub(cfg) {
  const lines = [];
  lines.push(`# Generated by CIGenerator (Agent Y-166)`);
  lines.push(`# Target: GitHub Actions`);
  lines.push(`# Language: ${cfg.language}`);
  lines.push(`# Principle: לא מוחקים רק משדרגים ומגדלים`);
  lines.push(`name: ${cfg.name}`);
  lines.push('');

  // Triggers
  lines.push('on:');
  lines.push('  push:');
  lines.push('    branches:');
  for (const b of cfg.branches) lines.push(`      - ${b}`);
  lines.push('  pull_request:');
  lines.push('    branches:');
  for (const b of cfg.branches) lines.push(`      - ${b}`);
  if (cfg.cronIsrael && cfg.cronIsrael.length > 0) {
    const utc = israelCronToUtc(cfg.cronIsrael);
    lines.push('  schedule:');
    lines.push(`    # Cron authored in Asia/Jerusalem: '${cfg.cronIsrael}' — converted to UTC`);
    lines.push(`    - cron: '${utc}'`);
  }
  lines.push('');

  // Global env — declares every secret so it's present in the job
  // environment but masked by GitHub's secret-scrubbing middleware.
  if (cfg.secrets.length > 0) {
    lines.push('env:');
    for (const s of cfg.secrets) {
      lines.push(`  ${s}: \${{ secrets.${s} }}`);
    }
    lines.push('');
  }

  // Permissions — least privilege
  lines.push('permissions:');
  lines.push('  contents: read');
  lines.push('  actions: read');
  lines.push('');

  // Jobs
  lines.push('jobs:');
  for (const stage of cfg.stages) {
    const isDeploy = stage === 'deploy';
    lines.push(`  ${stage}:`);
    lines.push(`    name: ${stage}`);
    lines.push('    runs-on: ubuntu-latest');
    lines.push('    timeout-minutes: 30');
    if (isDeploy && cfg.manualApprovalProd) {
      lines.push(`    environment:`);
      lines.push(`      name: ${cfg.prodEnvironment}`);
      lines.push(`      # environment with required reviewers enforces manual approval`);
    }
    lines.push('    steps:');
    lines.push('      - name: Checkout');
    lines.push('        uses: actions/checkout@v4');
    lines.push('      - name: Setup Node.js');
    lines.push('        uses: actions/setup-node@v4');
    lines.push('        with:');
    lines.push(`          node-version: '${cfg.nodeVersion}'`);
    lines.push(`          cache: 'npm'`);
    lines.push('      - name: Install dependencies');
    lines.push(`        run: ${installCommand(cfg.language)}`);
    // Mask every secret so it never appears in logs
    for (const s of cfg.secrets) {
      lines.push(`      - name: Mask secret ${s}`);
      lines.push(`        run: echo "::add-mask::\${{ secrets.${s} }}"`);
    }
    lines.push(`      - name: Run ${stage}`);
    lines.push(`        run: ${stageCommand(stage, cfg.language)}`);
    // Upload artifacts for build + test so we can keep them the
    // retention-days window
    if (stage === 'build' || stage === 'test') {
      lines.push('      - name: Upload artifacts');
      lines.push('        uses: actions/upload-artifact@v4');
      lines.push('        with:');
      lines.push(`          name: ${cfg.name}-${stage}`);
      lines.push('          path: |');
      for (const p of cfg.artifactPaths) lines.push(`            ${p}`);
      lines.push(`          retention-days: ${cfg.artifactRetention}`);
    }
    // Webhook notification on failure
    if (cfg.notifyWebhooks.length > 0) {
      lines.push('      - name: Notify on failure');
      lines.push('        if: failure()');
      lines.push('        run: |');
      for (const url of cfg.notifyWebhooks) {
        lines.push(`          curl -X POST -H 'Content-Type: application/json' -d '{"job":"${stage}","status":"failure"}' ${url}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 *  GitLab CI generator                                               *
 * ------------------------------------------------------------------ */

function renderGitLab(cfg) {
  const lines = [];
  lines.push(`# Generated by CIGenerator (Agent Y-166)`);
  lines.push(`# Target: GitLab CI`);
  lines.push(`# Language: ${cfg.language}`);
  lines.push(`# Principle: לא מוחקים רק משדרגים ומגדלים`);
  lines.push('');

  // Default image
  lines.push(`image: node:${cfg.nodeVersion}`);
  lines.push('');

  // Stages declaration
  lines.push('stages:');
  for (const s of cfg.stages) lines.push(`  - ${s}`);
  lines.push('');

  // Global variables — secrets are referenced via $VAR and GitLab
  // masks them automatically when they're declared as Protected +
  // Masked in the project settings. We declare them here so CI
  // validates the job even when they are unset.
  lines.push('variables:');
  lines.push('  GIT_DEPTH: "10"');
  for (const s of cfg.secrets) {
    lines.push(`  ${s}: "$${s}"`);
  }
  lines.push('');

  // Default cache — keep npm install fast
  lines.push('default:');
  lines.push('  cache:');
  lines.push('    key: ${CI_COMMIT_REF_SLUG}');
  lines.push('    paths:');
  lines.push('      - node_modules/');
  lines.push('  before_script:');
  lines.push(`    - ${installCommand(cfg.language)}`);
  // Echo the masked env so we can audit which secrets were intended
  for (const s of cfg.secrets) {
    lines.push(`    - echo "secret ${s} loaded (masked)"`);
  }
  lines.push('');

  // Israel cron — GitLab doesn't read cron from the YAML, but we
  // leave a comment so humans can create a matching Pipeline Schedule.
  if (cfg.cronIsrael && cfg.cronIsrael.length > 0) {
    lines.push('# Create a Pipeline Schedule in GitLab UI with:');
    lines.push(`#   cron:     '${cfg.cronIsrael}'`);
    lines.push(`#   timezone: 'Asia/Jerusalem'`);
    lines.push('');
  }

  // Job per stage
  for (const stage of cfg.stages) {
    const jobName = `${stage}-job`;
    lines.push(`${jobName}:`);
    lines.push(`  stage: ${stage}`);
    lines.push('  rules:');
    for (const b of cfg.branches) {
      lines.push(`    - if: '$CI_COMMIT_BRANCH == "${b}"'`);
    }
    lines.push(`    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'`);
    lines.push('  script:');
    lines.push(`    - ${stageCommand(stage, cfg.language)}`);

    if (stage === 'deploy' && cfg.manualApprovalProd) {
      lines.push(`  environment:`);
      lines.push(`    name: ${cfg.prodEnvironment}`);
      lines.push('  when: manual');
      lines.push('  allow_failure: false');
    }

    if (stage === 'build' || stage === 'test') {
      lines.push('  artifacts:');
      lines.push(`    expire_in: ${cfg.artifactRetention} days`);
      lines.push('    paths:');
      for (const p of cfg.artifactPaths) lines.push(`      - ${p}`);
      if (stage === 'test') {
        lines.push('    reports:');
        lines.push('      junit: coverage/junit.xml');
      }
    }

    if (cfg.notifyWebhooks.length > 0) {
      lines.push('  after_script:');
      lines.push('    - |');
      lines.push(`      if [ "$CI_JOB_STATUS" = "failed" ]; then`);
      for (const url of cfg.notifyWebhooks) {
        lines.push(`        curl -X POST -H 'Content-Type: application/json' -d "{\\"job\\":\\"${stage}\\",\\"status\\":\\"failure\\"}" ${url}`);
      }
      lines.push(`      fi`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 *  Jenkins Declarative generator                                     *
 * ------------------------------------------------------------------ */

function renderJenkins(cfg) {
  const lines = [];
  lines.push(`// Generated by CIGenerator (Agent Y-166)`);
  lines.push(`// Target: Jenkins Declarative`);
  lines.push(`// Language: ${cfg.language}`);
  lines.push(`// Principle: לא מוחקים רק משדרגים ומגדלים`);
  lines.push('pipeline {');
  lines.push(`  agent any`);
  lines.push('  options {');
  lines.push('    timestamps()');
  lines.push('    ansiColor("xterm")');
  lines.push(`    buildDiscarder(logRotator(daysToKeepStr: "${cfg.artifactRetention}"))`);
  lines.push('    timeout(time: 60, unit: "MINUTES")');
  lines.push('  }');
  lines.push('  tools {');
  lines.push(`    nodejs "node-${cfg.nodeVersion}"`);
  lines.push('  }');

  // Triggers
  if (cfg.cronIsrael && cfg.cronIsrael.length > 0) {
    lines.push('  triggers {');
    lines.push(`    // cron authored in Asia/Jerusalem: ${cfg.cronIsrael}`);
    lines.push(`    cron("TZ=Asia/Jerusalem\\n${cfg.cronIsrael}")`);
    lines.push('  }');
  }

  // Environment — bind Jenkins credentials to env vars so they are
  // automatically masked by the Credentials Binding plugin.
  if (cfg.secrets.length > 0) {
    lines.push('  environment {');
    for (const s of cfg.secrets) {
      lines.push(`    ${s} = credentials("${s}")`);
    }
    lines.push('  }');
  }

  // Stages
  lines.push('  stages {');
  lines.push('    stage("Checkout") {');
  lines.push('      steps {');
  lines.push('        checkout scm');
  lines.push('      }');
  lines.push('    }');
  lines.push('    stage("Install") {');
  lines.push('      steps {');
  lines.push(`        sh "${installCommand(cfg.language)}"`);
  lines.push('      }');
  lines.push('    }');

  for (const stage of cfg.stages) {
    const label = stage.charAt(0).toUpperCase() + stage.slice(1);
    lines.push(`    stage("${label}") {`);
    if (stage === 'deploy' && cfg.manualApprovalProd) {
      lines.push('      input {');
      lines.push(`        message "Deploy to ${cfg.prodEnvironment}?"`);
      lines.push('        ok "Approve"');
      lines.push('      }');
    }
    lines.push(`      when {`);
    lines.push('        anyOf {');
    for (const b of cfg.branches) {
      lines.push(`          branch "${b}"`);
    }
    lines.push('        }');
    lines.push('      }');
    lines.push('      steps {');
    lines.push(`        sh "${stageCommand(stage, cfg.language)}"`);
    lines.push('      }');
    if (stage === 'build' || stage === 'test') {
      lines.push('      post {');
      lines.push('        always {');
      const joined = cfg.artifactPaths.map((p) => `${p}**`).join(',');
      lines.push(`          archiveArtifacts artifacts: "${joined}", fingerprint: true, allowEmptyArchive: true`);
      lines.push('        }');
      lines.push('      }');
    }
    lines.push('    }');
  }
  lines.push('  }');

  // Post — webhook notification on failure
  lines.push('  post {');
  lines.push('    failure {');
  if (cfg.notifyWebhooks.length > 0) {
    for (const url of cfg.notifyWebhooks) {
      lines.push(`      sh "curl -X POST -H 'Content-Type: application/json' -d '{\\"job\\":\\"${cfg.name}\\",\\"status\\":\\"failure\\"}' ${url}"`);
    }
  } else {
    lines.push('      echo "build failed"');
  }
  lines.push('    }');
  lines.push('    success {');
  lines.push('      echo "build succeeded"');
  lines.push('    }');
  lines.push('  }');
  lines.push('}');

  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 *  Class                                                             *
 * ------------------------------------------------------------------ */

class CIGenerator {
  constructor(defaults) {
    // allow a caller-level override of defaults for scenarios where
    // the same generator is used many times with shared settings.
    this._defaults = Object.freeze({ ...DEFAULTS, ...(defaults || {}) });
  }

  get defaults() {
    return this._defaults;
  }

  /**
   * Main entry — returns a single YAML/Groovy string for the
   * requested target. Never writes to disk.
   */
  generate(config) {
    const merged = mergeConfig({ ...this._defaults, ...(config || {}) });
    const cfg = validateConfig(merged);
    switch (cfg.target) {
      case 'github':  return renderGitHub(cfg);
      case 'gitlab':  return renderGitLab(cfg);
      case 'jenkins': return renderJenkins(cfg);
      /* istanbul ignore next — validated above */
      default: throw new Error(`CIGenerator: unreachable target ${cfg.target}`);
    }
  }

  /**
   * Convenience — generate all three targets at once and return a
   * map keyed by the canonical file path.
   */
  generateAll(config) {
    const base = mergeConfig({ ...this._defaults, ...(config || {}) });
    const workflowName = base.name;
    return {
      [`.github/workflows/${workflowName}.yml`]: this.generate({ ...config, target: 'github' }),
      '.gitlab-ci.yml':                           this.generate({ ...config, target: 'gitlab'  }),
      'Jenkinsfile':                              this.generate({ ...config, target: 'jenkins' }),
    };
  }
}

module.exports = {
  CIGenerator,
  DEFAULTS,
  VALID_TARGETS,
  VALID_STAGES,
  VALID_LANGS,
  // exposed for unit-testing only
  israelCronToUtc,
  mergeConfig,
  validateConfig,
};
