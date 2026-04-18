/**
 * Unit tests for CIGenerator — CI/CD pipeline configuration generator
 * Agent Y-166 — written 2026-04-11
 *
 * Run:   node --test test/devops/ci-generator.test.js
 *
 * 22 tests covering:
 *   - default + custom configuration
 *   - GitHub Actions / GitLab CI / Jenkins Declarative outputs
 *   - secrets masking (add-mask, credentials bindings, GitLab vars)
 *   - Israel timezone cron (UTC conversion + passthrough)
 *   - manual approval gates for prod
 *   - artifact retention (days + paths)
 *   - notification webhooks (curl on failure)
 *   - input validation (unknown target, language, stage, empty name)
 *   - generateAll() returning all three canonical file paths
 *   - language switch (node, ts)
 *
 * Assertions rely on exact substring matches to catch regressions
 * in the generator's output shape. These tests DO NOT exec any CI
 * tooling; they only string-compare the generator's output.
 */

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  CIGenerator,
  DEFAULTS,
  VALID_TARGETS,
  VALID_STAGES,
  VALID_LANGS,
  israelCronToUtc,
  validateConfig,
  mergeConfig,
} = require('../../src/devops/ci-generator.js');

/* ------------------------------------------------------------------ *
 *  01 — Defaults exposed + frozen                                    *
 * ------------------------------------------------------------------ */
test('01. DEFAULTS exposes the documented keys and is frozen', () => {
  assert.equal(typeof DEFAULTS, 'object');
  assert.equal(Object.isFrozen(DEFAULTS), true);
  assert.equal(DEFAULTS.target, 'github');
  assert.equal(DEFAULTS.name, 'onyx-pipeline');
  assert.equal(DEFAULTS.language, 'node');
  assert.equal(DEFAULTS.nodeVersion, '20');
  assert.deepEqual([...DEFAULTS.stages], ['lint', 'test', 'build', 'deploy']);
  assert.equal(DEFAULTS.manualApprovalProd, true);
  assert.equal(DEFAULTS.artifactRetention, 30);
  assert.equal(DEFAULTS.prodEnvironment, 'production');
});

test('02. VALID_TARGETS / STAGES / LANGS are enumerated', () => {
  assert.deepEqual([...VALID_TARGETS], ['github', 'gitlab', 'jenkins']);
  assert.deepEqual([...VALID_STAGES], ['lint', 'test', 'build', 'deploy']);
  assert.deepEqual([...VALID_LANGS], ['node', 'ts']);
});

/* ------------------------------------------------------------------ *
 *  03 — GitHub Actions baseline                                      *
 * ------------------------------------------------------------------ */
test('03. GitHub Actions output has canonical structure', () => {
  const gen = new CIGenerator();
  const out = gen.generate({ target: 'github' });

  assert.ok(out.includes('# Target: GitHub Actions'),             'target banner');
  assert.ok(out.includes('name: onyx-pipeline'),                  'workflow name');
  assert.ok(out.includes('on:'),                                  'trigger block');
  assert.ok(out.includes('push:'),                                'push trigger');
  assert.ok(out.includes('pull_request:'),                        'pr trigger');
  assert.ok(out.includes('jobs:'),                                'jobs block');
  assert.ok(out.includes('lint:'),                                'lint job');
  assert.ok(out.includes('test:'),                                'test job');
  assert.ok(out.includes('build:'),                               'build job');
  assert.ok(out.includes('deploy:'),                              'deploy job');
  assert.ok(out.includes('actions/checkout@v4'),                  'checkout action');
  assert.ok(out.includes('actions/setup-node@v4'),                'setup-node action');
  assert.ok(out.includes("node-version: '20'"),                   'node version');
  assert.ok(out.includes('npm ci'),                               'install command');
  assert.ok(out.includes('לא מוחקים רק משדרגים ומגדלים'),          'bilingual principle');
});

/* ------------------------------------------------------------------ *
 *  04 — GitHub secrets masking                                       *
 * ------------------------------------------------------------------ */
test('04. GitHub — secrets are masked with ::add-mask::', () => {
  const gen = new CIGenerator();
  const out = gen.generate({
    target: 'github',
    secrets: ['DB_PASSWORD', 'API_KEY'],
  });

  assert.ok(out.includes('DB_PASSWORD: ${{ secrets.DB_PASSWORD }}'),
    'env binding for DB_PASSWORD');
  assert.ok(out.includes('API_KEY: ${{ secrets.API_KEY }}'),
    'env binding for API_KEY');
  assert.ok(out.includes('echo "::add-mask::${{ secrets.DB_PASSWORD }}"'),
    'add-mask for DB_PASSWORD');
  assert.ok(out.includes('echo "::add-mask::${{ secrets.API_KEY }}"'),
    'add-mask for API_KEY');
});

/* ------------------------------------------------------------------ *
 *  05 — GitHub Israel cron → UTC                                      *
 * ------------------------------------------------------------------ */
test('05. GitHub — Israel cron "0 9 * * 1" becomes "0 7 * * 1" UTC', () => {
  const gen = new CIGenerator();
  const out = gen.generate({
    target: 'github',
    cronIsrael: '0 9 * * 1',
  });
  assert.ok(out.includes('schedule:'),                        'schedule block');
  assert.ok(out.includes("Cron authored in Asia/Jerusalem: '0 9 * * 1'"), 'comment annotation');
  assert.ok(out.includes("cron: '0 7 * * 1'"),                'UTC-converted expr');
});

/* ------------------------------------------------------------------ *
 *  06 — GitHub manual approval gate                                   *
 * ------------------------------------------------------------------ */
test('06. GitHub — deploy job declares a protected environment', () => {
  const gen = new CIGenerator();
  const out = gen.generate({
    target: 'github',
    manualApprovalProd: true,
    prodEnvironment: 'prod-ilse',
  });
  assert.ok(out.includes('environment:'),       'environment key');
  assert.ok(out.includes('name: prod-ilse'),    'custom prod environment');
});

/* ------------------------------------------------------------------ *
 *  07 — GitHub artifact retention                                    *
 * ------------------------------------------------------------------ */
test('07. GitHub — artifact retention days and paths honoured', () => {
  const gen = new CIGenerator();
  const out = gen.generate({
    target: 'github',
    artifactRetention: 7,
    artifactPaths: ['out/', 'logs/'],
  });
  assert.ok(out.includes('actions/upload-artifact@v4'), 'upload-artifact action');
  assert.ok(out.includes('retention-days: 7'),          'retention days');
  assert.ok(out.includes('out/'),                       'custom path 1');
  assert.ok(out.includes('logs/'),                      'custom path 2');
});

/* ------------------------------------------------------------------ *
 *  08 — GitHub notification webhook on failure                       *
 * ------------------------------------------------------------------ */
test('08. GitHub — notification webhooks are called with curl on failure', () => {
  const gen = new CIGenerator();
  const out = gen.generate({
    target: 'github',
    notifyWebhooks: ['https://hooks.example.com/ci'],
  });
  assert.ok(out.includes('if: failure()'),                              'failure condition');
  assert.ok(out.includes('https://hooks.example.com/ci'),               'webhook url');
  assert.ok(out.includes("curl -X POST"),                               'curl invocation');
});

/* ------------------------------------------------------------------ *
 *  09 — GitLab CI baseline                                           *
 * ------------------------------------------------------------------ */
test('09. GitLab output has canonical structure', () => {
  const gen = new CIGenerator();
  const out = gen.generate({ target: 'gitlab' });
  assert.ok(out.includes('# Target: GitLab CI'),                  'target banner');
  assert.ok(out.includes('image: node:20'),                       'image');
  assert.ok(out.includes('stages:'),                              'stages block');
  assert.ok(out.includes('- lint'),                               'lint stage');
  assert.ok(out.includes('- test'),                               'test stage');
  assert.ok(out.includes('- build'),                              'build stage');
  assert.ok(out.includes('- deploy'),                             'deploy stage');
  assert.ok(out.includes('lint-job:'),                            'lint job');
  assert.ok(out.includes('deploy-job:'),                          'deploy job');
  assert.ok(out.includes('before_script:'),                       'before_script');
  assert.ok(out.includes('npm ci'),                               'install cmd');
});

/* ------------------------------------------------------------------ *
 *  10 — GitLab manual approval + secrets                             *
 * ------------------------------------------------------------------ */
test('10. GitLab — manual approval gate on deploy + secret variables', () => {
  const gen = new CIGenerator();
  const out = gen.generate({
    target: 'gitlab',
    secrets: ['SLACK_TOKEN'],
    manualApprovalProd: true,
    prodEnvironment: 'production',
  });
  assert.ok(out.includes('SLACK_TOKEN: "$SLACK_TOKEN"'), 'secret var binding');
  assert.ok(out.includes('when: manual'),                'manual gate');
  assert.ok(out.includes('environment:'),                'environment block');
  assert.ok(out.includes('name: production'),            'env name');
});

/* ------------------------------------------------------------------ *
 *  11 — GitLab artifact retention                                   *
 * ------------------------------------------------------------------ */
test('11. GitLab — artifacts expire_in honours retention days', () => {
  const gen = new CIGenerator();
  const out = gen.generate({
    target: 'gitlab',
    artifactRetention: 14,
    artifactPaths: ['dist/'],
  });
  assert.ok(out.includes('artifacts:'),             'artifacts key');
  assert.ok(out.includes('expire_in: 14 days'),     'retention value');
  assert.ok(out.includes('- dist/'),                'artifact path');
});

/* ------------------------------------------------------------------ *
 *  12 — GitLab cron Israel comment                                  *
 * ------------------------------------------------------------------ */
test('12. GitLab — cron expression left as Asia/Jerusalem comment', () => {
  const gen = new CIGenerator();
  const out = gen.generate({
    target: 'gitlab',
    cronIsrael: '30 4 * * *',
  });
  assert.ok(out.includes("cron:     '30 4 * * *'"),        'cron comment line');
  assert.ok(out.includes("timezone: 'Asia/Jerusalem'"),    'tz comment line');
});

/* ------------------------------------------------------------------ *
 *  13 — Jenkins Declarative baseline                                *
 * ------------------------------------------------------------------ */
test('13. Jenkins output has canonical Declarative structure', () => {
  const gen = new CIGenerator();
  const out = gen.generate({ target: 'jenkins' });
  assert.ok(out.includes('// Target: Jenkins Declarative'), 'target banner');
  assert.ok(out.includes('pipeline {'),                    'pipeline block');
  assert.ok(out.includes('agent any'),                     'agent');
  assert.ok(out.includes('stages {'),                      'stages');
  assert.ok(out.includes('stage("Lint")'),                 'lint stage');
  assert.ok(out.includes('stage("Test")'),                 'test stage');
  assert.ok(out.includes('stage("Build")'),                'build stage');
  assert.ok(out.includes('stage("Deploy")'),               'deploy stage');
  assert.ok(out.includes('tools {'),                       'tools block');
  assert.ok(out.includes('nodejs "node-20"'),              'nodejs tool');
});

/* ------------------------------------------------------------------ *
 *  14 — Jenkins credentials + manual input                           *
 * ------------------------------------------------------------------ */
test('14. Jenkins — credentials binding and manual approval on deploy', () => {
  const gen = new CIGenerator();
  const out = gen.generate({
    target: 'jenkins',
    secrets: ['AWS_ACCESS_KEY'],
    manualApprovalProd: true,
    prodEnvironment: 'prod',
  });
  assert.ok(out.includes('AWS_ACCESS_KEY = credentials("AWS_ACCESS_KEY")'),
    'credentials() binding');
  assert.ok(out.includes('input {'),                   'manual input block');
  assert.ok(out.includes('message "Deploy to prod?"'), 'input message');
});

/* ------------------------------------------------------------------ *
 *  15 — Jenkins Israel cron                                         *
 * ------------------------------------------------------------------ */
test('15. Jenkins — cron uses TZ=Asia/Jerusalem prefix', () => {
  const gen = new CIGenerator();
  const out = gen.generate({
    target: 'jenkins',
    cronIsrael: '15 3 * * *',
  });
  assert.ok(out.includes('triggers {'),             'triggers block');
  assert.ok(out.includes('TZ=Asia/Jerusalem'),      'tz prefix');
  assert.ok(out.includes('15 3 * * *'),             'cron expr');
});

/* ------------------------------------------------------------------ *
 *  16 — Jenkins artifact archiving                                  *
 * ------------------------------------------------------------------ */
test('16. Jenkins — archiveArtifacts and build discarder retention', () => {
  const gen = new CIGenerator();
  const out = gen.generate({
    target: 'jenkins',
    artifactRetention: 5,
    artifactPaths: ['build/', 'reports/'],
  });
  assert.ok(out.includes('archiveArtifacts'),               'archiveArtifacts');
  assert.ok(out.includes('build/**'),                       'glob path 1');
  assert.ok(out.includes('reports/**'),                     'glob path 2');
  assert.ok(out.includes('daysToKeepStr: "5"'),             'log rotator retention');
});

/* ------------------------------------------------------------------ *
 *  17 — Language switch (ts)                                         *
 * ------------------------------------------------------------------ */
test('17. Language ts uses npm run test and npm run build', () => {
  const gen = new CIGenerator();
  const out = gen.generate({ target: 'github', language: 'ts' });
  assert.ok(out.includes('npm run test'),  'ts test cmd');
  assert.ok(out.includes('npm run build'), 'ts build cmd');
  assert.ok(out.includes('Language: ts'),  'language banner');
});

/* ------------------------------------------------------------------ *
 *  18 — Validation errors                                            *
 * ------------------------------------------------------------------ */
test('18. generate() rejects unknown target / stage / language / empty name', () => {
  const gen = new CIGenerator();
  assert.throws(() => gen.generate({ target: 'circleci' }),       /unknown target/);
  assert.throws(() => gen.generate({ language: 'rust' }),         /unknown language/);
  assert.throws(() => gen.generate({ stages: ['hack'] }),         /unknown stage/);
  assert.throws(() => gen.generate({ name: '' }),                 /cannot be empty/);
  assert.throws(() => gen.generate({ artifactRetention: 0 }),     /positive integer/);
  assert.throws(() => gen.generate({ stages: [] }),               /cannot be empty/);
});

/* ------------------------------------------------------------------ *
 *  19 — generateAll returns all three files                          *
 * ------------------------------------------------------------------ */
test('19. generateAll returns three canonical file paths', () => {
  const gen = new CIGenerator();
  const map = gen.generateAll({ name: 'my-flow', secrets: ['TOKEN'] });

  assert.equal(typeof map, 'object');
  assert.ok('.github/workflows/my-flow.yml' in map, 'github path');
  assert.ok('.gitlab-ci.yml'            in map,     'gitlab path');
  assert.ok('Jenkinsfile'               in map,     'jenkins path');

  // every output is a non-empty string mentioning the secret
  for (const key of Object.keys(map)) {
    assert.equal(typeof map[key], 'string', `${key} is a string`);
    assert.ok(map[key].length > 0, `${key} not empty`);
    assert.ok(map[key].includes('TOKEN'), `${key} mentions TOKEN`);
  }
});

/* ------------------------------------------------------------------ *
 *  20 — israelCronToUtc passthrough + midnight wrap                  *
 * ------------------------------------------------------------------ */
test('20. israelCronToUtc handles midnight wrap and invalid input', () => {
  assert.equal(israelCronToUtc('0 1 * * *'),   '0 23 * * *', 'IST 01:00 = UTC 23:00');
  assert.equal(israelCronToUtc('30 2 * * *'),  '30 0 * * *', 'IST 02:30 = UTC 00:30');
  assert.equal(israelCronToUtc('15 12 * * 1'), '15 10 * * 1', 'IST noon monday');
  // invalid — return unchanged
  assert.equal(israelCronToUtc('nope'), 'nope');
  assert.equal(israelCronToUtc('1 2 3'), '1 2 3');
});

/* ------------------------------------------------------------------ *
 *  21 — mergeConfig + validateConfig return clean copies             *
 * ------------------------------------------------------------------ */
test('21. mergeConfig clones arrays so caller mutation does not leak', () => {
  const stages = ['lint', 'test'];
  const merged = mergeConfig({ stages });
  merged.stages.push('build');
  assert.deepEqual(stages, ['lint', 'test'], 'caller array untouched');
  assert.deepEqual(merged.stages, ['lint', 'test', 'build']);
  // also validate works on merged
  const v = validateConfig(merged);
  assert.equal(v.target, 'github');
});

/* ------------------------------------------------------------------ *
 *  22 — stages subset — only build + deploy                          *
 * ------------------------------------------------------------------ */
test('22. stages subset: only build + deploy generates the minimal pipeline', () => {
  const gen = new CIGenerator();
  const out = gen.generate({
    target: 'github',
    stages: ['build', 'deploy'],
  });
  // build + deploy present
  assert.ok(out.includes('build:'),  'build job');
  assert.ok(out.includes('deploy:'), 'deploy job');
  // lint + test NOT present as top-level jobs
  // (use a prefix match against the 'jobs:' block to avoid false
  // hits on the banner or documentation comments)
  const jobsBlock = out.slice(out.indexOf('jobs:'));
  assert.ok(!/\n  lint:\n/.test(jobsBlock), 'no lint job');
  assert.ok(!/\n  test:\n/.test(jobsBlock), 'no test job');
});
