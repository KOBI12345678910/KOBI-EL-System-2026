/**
 * Tests — IaCGenerator (Agent Y-174)
 * Zero-dep (node:assert + node:test). Built-ins only.
 *
 * Covers:
 *   - Terraform HCL rendering
 *   - Pulumi TypeScript rendering
 *   - Israeli region support (AWS il-central-1, Azure israelcentral, GCP me-west1)
 *   - Hebrew UTF-8 business name in tags
 *   - Compliance tags (PCI-DSS / ISR-SOC2 / ISO-27001)
 *   - Module versioning (pinned with ?ref=vX.Y.Z)
 *   - Remote state backend config (s3 / azurerm / gcs)
 *   - "Never delete" enforcement (prevent_destroy / protect:true)
 *   - String output only (no disk I/O)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  IaCGenerator,
  ISRAELI_REGIONS,
  REGION_DISPLAY,
  COMPLIANCE_FRAMEWORKS,
  RESOURCE_TYPES,
  VALID_CLOUDS,
  VALID_ENVS,
  MODULE_VERSIONS,
  DEFAULTS,
  sanitizeId,
  hclQuote,
  tsQuote,
  buildTags,
  mergeCompliance,
  moduleKey,
  resolveModuleVersion,
  validateResource,
} = require('../../src/devops/iac-generator');

// ---- helpers ----------------------------------------------------------------

function makeGen(overrides) {
  return new IaCGenerator(overrides || {});
}

function awsBucket(overrides) {
  return Object.assign({
    type: 'bucket',
    name: 'erp-documents',
    cloud: 'aws',
    environment: 'prod',
    size: 'STANDARD',
  }, overrides || {});
}

function azureDb(overrides) {
  return Object.assign({
    type: 'database',
    name: 'erp-main',
    cloud: 'azure',
    environment: 'prod',
    size: 'GP_S_Gen5_2',
  }, overrides || {});
}

function gcpVpc(overrides) {
  return Object.assign({
    type: 'vpc',
    name: 'erp-network',
    cloud: 'gcp',
    environment: 'prod',
  }, overrides || {});
}

// ---- tests ------------------------------------------------------------------

test('constants: Israeli regions map to correct cloud slugs', () => {
  assert.equal(ISRAELI_REGIONS.aws,   'il-central-1');
  assert.equal(ISRAELI_REGIONS.azure, 'israelcentral');
  assert.equal(ISRAELI_REGIONS.gcp,   'me-west1');
  assert.ok(REGION_DISPLAY.aws.includes('Tel Aviv'));
  assert.ok(REGION_DISPLAY.azure.includes('Israel'));
  assert.ok(REGION_DISPLAY.gcp.includes('Tel Aviv'));
});

test('constants: compliance frameworks include PCI, SOC2, ISO', () => {
  assert.ok(COMPLIANCE_FRAMEWORKS.includes('PCI-DSS'));
  assert.ok(COMPLIANCE_FRAMEWORKS.includes('ISR-SOC2'));
  assert.ok(COMPLIANCE_FRAMEWORKS.includes('ISO-27001'));
});

test('constants: resource types and valid clouds', () => {
  assert.ok(RESOURCE_TYPES.includes('vpc'));
  assert.ok(RESOURCE_TYPES.includes('bucket'));
  assert.ok(RESOURCE_TYPES.includes('database'));
  assert.ok(RESOURCE_TYPES.includes('vm'));
  assert.ok(RESOURCE_TYPES.includes('kubernetes'));
  assert.ok(RESOURCE_TYPES.includes('keyvault'));
  assert.ok(RESOURCE_TYPES.includes('loadbalancer'));
  assert.deepEqual([...VALID_CLOUDS].sort(), ['aws', 'azure', 'gcp']);
  assert.deepEqual([...VALID_ENVS].sort(), ['dev', 'prod', 'staging']);
});

test('helpers: sanitizeId strips invalid chars and leads with letter', () => {
  assert.equal(sanitizeId('erp-main'),      'erp_main');
  assert.equal(sanitizeId('123abc'),        'res_123abc');
  // Hebrew chars are stripped — each Hebrew code point becomes an underscore
  assert.match(sanitizeId('חשבוניות_2026'), /^res_[_]+2026$/);
  assert.equal(sanitizeId('ok_name'),       'ok_name');
});

test('helpers: hclQuote escapes quotes, backslashes, newlines', () => {
  assert.equal(hclQuote('plain'),      '"plain"');
  assert.equal(hclQuote('a"b'),        '"a\\"b"');
  assert.equal(hclQuote('a\\b'),       '"a\\\\b"');
  assert.equal(hclQuote('a\nb'),       '"a\\nb"');
  // Hebrew must pass through unchanged (UTF-8)
  assert.equal(hclQuote('טכנו-קול'),   '"טכנו-קול"');
});

test('helpers: tsQuote uses single quotes and preserves Hebrew', () => {
  assert.equal(tsQuote('plain'),       "'plain'");
  assert.equal(tsQuote("a'b"),         "'a\\'b'");
  assert.equal(tsQuote('טכנו-קול'),    "'טכנו-קול'");
});

test('helpers: mergeCompliance dedupes and sorts', () => {
  const out = mergeCompliance(['ISO-27001', 'PCI-DSS'], ['PCI-DSS', 'ISR-SOC2', 'HIPAA']);
  assert.deepEqual(out, ['HIPAA', 'ISO-27001', 'ISR-SOC2', 'PCI-DSS']);
});

test('helpers: buildTags includes Hebrew business name and compliance CSV', () => {
  const gen = makeGen({ businessNameHe: 'טכנו-קול עוזי בע"מ', businessNameEn: 'Techno-Kol Uzi Ltd' });
  const tags = buildTags(gen.config, awsBucket());
  assert.equal(tags['business-name-he'], 'טכנו-קול עוזי בע"מ');
  assert.equal(tags['business-name-en'], 'Techno-Kol Uzi Ltd');
  assert.equal(tags['data-residency'],  'israel');
  assert.equal(tags['environment'],     'prod');
  assert.ok(tags['compliance'].includes('PCI-DSS'));
  assert.ok(tags['compliance'].includes('ISR-SOC2'));
  assert.ok(tags['compliance'].includes('ISO-27001'));
  assert.equal(tags['managed-by'],      'iac-generator-agent-y174');
});

test('helpers: buildTags respects caller tag overrides', () => {
  const gen = makeGen();
  const tags = buildTags(gen.config, awsBucket({ tags: { 'cost-center': 'CC-CUSTOM', owner: 'devops' } }));
  assert.equal(tags['cost-center'], 'CC-CUSTOM');
  assert.equal(tags['owner'], 'devops');
});

test('helpers: moduleKey + resolveModuleVersion return pinned versions', () => {
  assert.equal(moduleKey('aws', 'vpc'),              'aws-vpc');
  assert.equal(moduleKey('azure', 'keyvault'),       'azure-keyvault');
  assert.equal(moduleKey('gcp', 'kubernetes'),       'gcp-gke');
  assert.equal(resolveModuleVersion('aws', 'bucket'),MODULE_VERSIONS['aws-s3-bucket']);
  assert.equal(resolveModuleVersion('gcp', 'vpc'),   MODULE_VERSIONS['gcp-vpc']);
  // override wins
  assert.equal(resolveModuleVersion('aws', 'vpc', '9.9.9'), '9.9.9');
});

test('helpers: moduleKey throws for unsupported combinations', () => {
  assert.throws(() => moduleKey('digitalocean', 'vpc'), /unknown cloud/);
  assert.throws(() => moduleKey('aws', 'spaceship'),    /does not support type/);
});

test('validateResource: rejects invalid type/cloud/name/environment', () => {
  assert.throws(() => validateResource(null, 0),                               /must be an object/);
  assert.throws(() => validateResource({ type: 'x', cloud: 'aws', name: 'n' }, 0), /type 'x' invalid/);
  assert.throws(() => validateResource({ type: 'vpc', cloud: 'z', name: 'n' }, 0), /cloud 'z' invalid/);
  assert.throws(() => validateResource({ type: 'vpc', cloud: 'aws', name: '' }, 0), /name must be a non-empty string/);
  assert.throws(
    () => validateResource({ type: 'vpc', cloud: 'aws', name: 'n', environment: 'qa' }, 0),
    /environment 'qa' invalid/
  );
});

test('generateTerraform: rejects empty resources array', () => {
  const gen = makeGen();
  assert.throws(() => gen.generateTerraform([]),      /non-empty array/);
  assert.throws(() => gen.generateTerraform(null),    /non-empty array/);
});

test('generateTerraform: emits HCL header with Hebrew principle + business name', () => {
  const gen = makeGen({ businessNameHe: 'טכנו-קול עוזי בע"מ' });
  const hcl = gen.generateTerraform([awsBucket()]);
  assert.equal(typeof hcl, 'string');
  assert.ok(hcl.includes('לא מוחקים רק משדרגים ומגדלים'));
  assert.ok(hcl.includes('טכנו-קול עוזי בע"מ'));
  assert.ok(hcl.includes('Agent Y-174'));
  assert.ok(hcl.includes('terraform {'));
  assert.ok(hcl.includes('required_version'));
});

test('generateTerraform: backend config uses Israeli region per cloud', () => {
  const gen = makeGen();
  const hcl = gen.generateTerraform([awsBucket(), azureDb(), gcpVpc()]);
  // AWS S3 backend with il-central-1
  assert.ok(hcl.includes('backend "s3"'));
  assert.ok(hcl.includes('il-central-1'));
  assert.ok(hcl.includes('dynamodb_table'));
  // Azure backend
  assert.ok(hcl.includes('backend "azurerm"'));
  // GCP backend with me-west1
  assert.ok(hcl.includes('backend "gcs"'));
  assert.ok(hcl.includes('me-west1'));
});

test('generateTerraform: renders all three Israeli regions correctly', () => {
  const gen = makeGen();
  const hcl = gen.generateTerraform([awsBucket(), azureDb(), gcpVpc()]);
  assert.ok(hcl.includes('"il-central-1"'));
  assert.ok(hcl.includes('"israelcentral"') || hcl.includes('israelcentral'));
  assert.ok(hcl.includes('"me-west1"'));
  // Providers emitted
  assert.ok(hcl.includes('provider "aws"'));
  assert.ok(hcl.includes('provider "azurerm"'));
  assert.ok(hcl.includes('provider "google"'));
});

test('generateTerraform: tags include bilingual business name (UTF-8)', () => {
  const gen = makeGen({
    businessNameHe: 'טכנו-קול עוזי בע"מ',
    businessNameEn: 'Techno-Kol Uzi Ltd',
  });
  const hcl = gen.generateTerraform([awsBucket()]);
  assert.ok(hcl.includes('"business-name-he" = "טכנו-קול עוזי בע\\"מ"'));
  assert.ok(hcl.includes('"business-name-en" = "Techno-Kol Uzi Ltd"'));
});

test('generateTerraform: compliance tag includes PCI + ISR-SOC2 + ISO-27001', () => {
  const gen = makeGen();
  const hcl = gen.generateTerraform([awsBucket()]);
  assert.ok(hcl.includes('"compliance" = "ISO-27001,ISR-SOC2,PCI-DSS"'));
});

test('generateTerraform: caller can add extra compliance (e.g. HIPAA)', () => {
  const gen = makeGen();
  const hcl = gen.generateTerraform([awsBucket({ compliance: ['HIPAA'] })]);
  assert.ok(hcl.includes('HIPAA'));
  assert.ok(hcl.includes('PCI-DSS'));
});

test('generateTerraform: module version is pinned with ?ref=v and version = ', () => {
  const gen = makeGen();
  const hcl = gen.generateTerraform([awsBucket()]);
  const pinned = MODULE_VERSIONS['aws-s3-bucket'];
  assert.ok(hcl.includes(`?ref=v${pinned}`));
  assert.ok(hcl.includes(`version = "${pinned}"`));
  // git immutable source
  assert.ok(hcl.includes('git::https://github.com/techno-kol-uzi/iac-modules.git'));
});

test('generateTerraform: lifecycle prevent_destroy enforces "never delete"', () => {
  const gen = makeGen();
  const hcl = gen.generateTerraform([awsBucket()]);
  assert.ok(hcl.includes('lifecycle {'));
  assert.ok(hcl.includes('prevent_destroy = true'));
});

test('generateTerraform: output is deterministic for identical inputs', () => {
  const gen = makeGen();
  const a = gen.generateTerraform([awsBucket(), gcpVpc()]);
  const b = gen.generateTerraform([awsBucket(), gcpVpc()]);
  assert.equal(a, b);
});

test('generatePulumiTS: emits TypeScript with Pulumi imports and Hebrew header', () => {
  const gen = makeGen({ businessNameHe: 'טכנו-קול עוזי בע"מ' });
  const ts = gen.generatePulumiTS([awsBucket()]);
  assert.equal(typeof ts, 'string');
  assert.ok(ts.includes("import * as pulumi from '@pulumi/pulumi'"));
  assert.ok(ts.includes("import * as aws from '@pulumi/aws'"));
  assert.ok(ts.includes("import * as azure from '@pulumi/azure-native'"));
  assert.ok(ts.includes("import * as gcp from '@pulumi/gcp'"));
  assert.ok(ts.includes('לא מוחקים רק משדרגים ומגדלים'));
  assert.ok(ts.includes('טכנו-קול עוזי בע"מ'));
});

test('generatePulumiTS: hardcodes Israeli region constants', () => {
  const gen = makeGen();
  const ts = gen.generatePulumiTS([awsBucket()]);
  assert.ok(ts.includes("AWS_REGION   = 'il-central-1'"));
  assert.ok(ts.includes("AZURE_REGION = 'israelcentral'"));
  assert.ok(ts.includes("GCP_REGION   = 'me-west1'"));
});

test('generatePulumiTS: resource tags include Hebrew business name', () => {
  const gen = makeGen({ businessNameHe: 'טכנו-קול עוזי בע"מ' });
  const ts = gen.generatePulumiTS([awsBucket()]);
  assert.ok(ts.includes("'business-name-he': 'טכנו-קול עוזי בע\"מ'"));
  assert.ok(ts.includes("'data-residency': 'israel'"));
});

test('generatePulumiTS: protect:true enforces "never delete"', () => {
  const gen = makeGen();
  const ts = gen.generatePulumiTS([awsBucket()]);
  assert.ok(ts.includes('protect: true'));
});

test('generatePulumiTS: module version is pinned in moduleVersion field', () => {
  const gen = makeGen();
  const ts = gen.generatePulumiTS([awsBucket()]);
  const pinned = MODULE_VERSIONS['aws-s3-bucket'];
  assert.ok(ts.includes(`moduleVersion: '${pinned}'`));
});

test('generatePulumiTS: ComponentResource uses techno-kol-uzi namespace', () => {
  const gen = makeGen();
  const ts = gen.generatePulumiTS([azureDb()]);
  assert.ok(ts.includes("'techno-kol-uzi:azure-mssql'"));
});

test('generatePulumiTS: rejects empty resources array', () => {
  const gen = makeGen();
  assert.throws(() => gen.generatePulumiTS([]),    /non-empty array/);
  assert.throws(() => gen.generatePulumiTS(null),  /non-empty array/);
});

test('generatePulumiTS: renders multiple clouds in one output', () => {
  const gen = makeGen();
  const ts = gen.generatePulumiTS([awsBucket(), azureDb(), gcpVpc()]);
  // All three region constants should appear
  assert.ok(ts.includes('il-central-1'));
  assert.ok(ts.includes('israelcentral'));
  assert.ok(ts.includes('me-west1'));
  // All three resources should become exports
  assert.ok(ts.includes('export const erp_documents'));
  assert.ok(ts.includes('export const erp_main'));
  assert.ok(ts.includes('export const erp_network'));
});

test('generateAll: returns both main.tf and index.ts strings', () => {
  const gen = makeGen();
  const all = gen.generateAll([awsBucket(), gcpVpc()]);
  assert.equal(typeof all['main.tf'],  'string');
  assert.equal(typeof all['index.ts'], 'string');
  assert.ok(all['main.tf'].length > 100);
  assert.ok(all['index.ts'].length > 100);
});

test('output strings only — no disk writes (fs.writeFileSync not used)', () => {
  // Guard: the module source must not import 'fs' for writing.
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'devops', 'iac-generator.js'),
    'utf8'
  );
  assert.ok(!src.includes('fs.writeFileSync'), 'generator must not call fs.writeFileSync');
  assert.ok(!src.includes('fs.writeFile('),    'generator must not call fs.writeFile');
  assert.ok(!src.includes('fs.appendFile'),    'generator must not call fs.appendFile');
});

test('comparison: Terraform and Pulumi outputs share the same tag keys', () => {
  const gen = makeGen();
  const hcl = gen.generateTerraform([awsBucket()]);
  const ts  = gen.generatePulumiTS([awsBucket()]);
  // Both outputs must carry the canonical tag keys.
  for (const key of ['business-name-he', 'business-name-en', 'compliance',
                     'managed-by', 'environment', 'data-residency', 'cost-center']) {
    assert.ok(hcl.includes(`"${key}"`), `HCL missing tag ${key}`);
    assert.ok(ts.includes(`'${key}'`),  `TS missing tag ${key}`);
  }
});

test('DEFAULTS: business name defaults to Hebrew Techno-Kol Uzi', () => {
  assert.equal(DEFAULTS.businessNameHe, 'טכנו-קול עוזי בע"מ');
  assert.equal(DEFAULTS.businessNameEn, 'Techno-Kol Uzi Ltd');
  assert.equal(DEFAULTS.dataResidency,  'israel');
  assert.ok(Array.isArray(DEFAULTS.compliance));
  assert.ok(DEFAULTS.compliance.includes('PCI-DSS'));
});
