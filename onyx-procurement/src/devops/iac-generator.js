/**
 * iac-generator.js — Infrastructure-as-Code generator
 * Agent Y-174 — Techno-Kol Uzi mega-ERP — written 2026-04-11
 *
 * Zero dependencies. Built-ins only. Pure Node.js. No disk I/O —
 * every generator method returns a string. The caller is responsible
 * for writing the result to main.tf, backend.tf, or *.ts as needed.
 *
 * Principle: "לא מוחקים רק משדרגים ומגדלים" — we never delete an
 * existing resource; callers may only add resources. The generator
 * itself is additive by design: every emitted resource is rendered
 * with a `lifecycle { prevent_destroy = true }` block in Terraform
 * and with `{ protect: true }` in Pulumi TS, so an accidental
 * `terraform destroy` or `pulumi destroy` cannot wipe production.
 *
 * Supports three Israeli-hosted regions:
 *   - AWS     → il-central-1   (Tel Aviv)
 *   - Azure   → israelcentral  (Israel Central)
 *   - GCP     → me-west1       (Tel Aviv)
 *
 * Every resource is tagged with:
 *   - business-name-he    — Hebrew business name (UTF-8)
 *   - business-name-en    — English business name
 *   - compliance          — CSV of PCI-DSS / ISR-SOC2 / ISO-27001
 *   - managed-by          — "iac-generator-agent-y174"
 *   - environment         — prod / staging / dev
 *   - data-residency      — "israel"
 *   - cost-center         — caller-provided
 *
 * Module versioning: every Terraform module reference is pinned with
 * `?ref=vX.Y.Z` (or `version = "X.Y.Z"` for registry modules).
 *
 * Backend config: Terraform uses `terraform { backend "s3" {} }` /
 * `backend "azurerm" {}` / `backend "gcs" {}` for remote state with
 * bucket names that embed the region slug and an ISR-hosted lock
 * table. Pulumi uses `@pulumi/pulumi` self-managed backend hints.
 *
 * Public API:
 *   const { IaCGenerator, ISRAELI_REGIONS, COMPLIANCE_FRAMEWORKS,
 *           RESOURCE_TYPES, DEFAULTS } = require('./iac-generator');
 *   const gen = new IaCGenerator({ businessNameHe: 'טכנו-קול עוזי בע"מ' });
 *   const hcl = gen.generateTerraform(resources);
 *   const ts  = gen.generatePulumiTS(resources);
 *
 * Supported resource shapes (tool-agnostic):
 *   {
 *     type:       'vpc' | 'bucket' | 'database' | 'vm' | 'kubernetes' | 'keyvault' | 'loadbalancer',
 *     name:       string,                         // logical name, required
 *     cloud:      'aws' | 'azure' | 'gcp',        // required
 *     environment:'prod' | 'staging' | 'dev',     // optional, default 'prod'
 *     size:       string,                         // optional, cloud-specific SKU/type
 *     tags:       { [key:string]: string },       // optional, merged with defaults
 *     compliance: string[],                       // optional, added to compliance tag
 *     moduleVersion: string,                      // optional, overrides default
 *   }
 */

'use strict';

/* ------------------------------------------------------------------ *
 *  Constants                                                         *
 * ------------------------------------------------------------------ */

const ISRAELI_REGIONS = Object.freeze({
  aws:   'il-central-1',    // AWS Tel Aviv region (GA 2023)
  azure: 'israelcentral',   // Azure Israel Central (GA 2023)
  gcp:   'me-west1',        // GCP Tel Aviv region  (GA 2022)
});

const REGION_DISPLAY = Object.freeze({
  aws:   'AWS Israel (Tel Aviv) — il-central-1',
  azure: 'Azure Israel Central — israelcentral',
  gcp:   'GCP Tel Aviv — me-west1',
});

const COMPLIANCE_FRAMEWORKS = Object.freeze([
  'PCI-DSS',     // Payment Card Industry Data Security Standard
  'ISR-SOC2',    // Israeli SOC2 adaptation
  'ISO-27001',   // International information-security standard
]);

const RESOURCE_TYPES = Object.freeze([
  'vpc',
  'bucket',
  'database',
  'vm',
  'kubernetes',
  'keyvault',
  'loadbalancer',
]);

const VALID_CLOUDS = Object.freeze(['aws', 'azure', 'gcp']);
const VALID_ENVS   = Object.freeze(['prod', 'staging', 'dev']);

// Default module versions (pinned) — do not decrease, only increase.
const MODULE_VERSIONS = Object.freeze({
  'aws-vpc':             '5.5.3',
  'aws-s3-bucket':       '4.1.2',
  'aws-rds':             '6.5.4',
  'aws-ec2':             '5.6.1',
  'aws-eks':             '20.8.5',
  'aws-kms':             '2.2.1',
  'aws-alb':             '9.9.0',
  'azure-network':       '5.2.0',
  'azure-storage':       '4.0.0',
  'azure-mssql':         '5.0.0',
  'azure-vm':            '6.0.1',
  'azure-aks':           '9.0.0',
  'azure-keyvault':      '4.0.0',
  'azure-lb':            '4.0.0',
  'gcp-vpc':             '9.1.0',
  'gcp-gcs':             '5.0.0',
  'gcp-sql':             '18.0.0',
  'gcp-compute':         '11.0.0',
  'gcp-gke':             '30.0.0',
  'gcp-kms':             '3.0.0',
  'gcp-lb':              '11.0.0',
});

const DEFAULTS = Object.freeze({
  businessNameHe:  'טכנו-קול עוזי בע"מ',
  businessNameEn:  'Techno-Kol Uzi Ltd',
  costCenter:      'CC-ERP-001',
  compliance:      Object.freeze(['PCI-DSS', 'ISR-SOC2', 'ISO-27001']),
  dataResidency:   'israel',
  managedBy:       'iac-generator-agent-y174',
  stateBucketPrefix: 'tku-tfstate',
  stateLockTable:  'tku-tfstate-lock',
  terraformVersion:'1.7.0',
  providerVersions: Object.freeze({
    aws:   '~> 5.40',
    azure: '~> 3.95',
    gcp:   '~> 5.20',
  }),
});

/* ------------------------------------------------------------------ *
 *  Helpers                                                           *
 * ------------------------------------------------------------------ */

function assertType(value, type, name) {
  if (typeof value !== type) {
    throw new TypeError(`IaCGenerator: '${name}' must be ${type}, got ${typeof value}`);
  }
}

function assertNonEmptyArray(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`IaCGenerator: '${name}' must be a non-empty array`);
  }
}

/**
 * Sanitise a logical name so it is valid as a Terraform identifier
 * (letters, digits, underscores; must start with a letter). Hebrew
 * characters are preserved in tags but stripped from identifiers.
 */
function sanitizeId(raw) {
  const s = String(raw || '').replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z]/.test(s) ? s : `res_${s}`;
}

/**
 * Escape a value for embedding inside a double-quoted HCL string.
 * Preserves Hebrew UTF-8 characters — HCL accepts them natively.
 */
function hclQuote(value) {
  const s = String(value);
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/**
 * Escape a value for embedding inside a single-quoted TS string.
 * Hebrew UTF-8 is preserved verbatim.
 */
function tsQuote(value) {
  const s = String(value);
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

/**
 * Merge compliance arrays deterministically — sorted + deduped so
 * the output is reproducible regardless of caller ordering.
 */
function mergeCompliance(defaults, extra) {
  const set = new Set();
  for (const c of defaults) set.add(c);
  if (Array.isArray(extra)) {
    for (const c of extra) set.add(c);
  }
  return Array.from(set).sort();
}

/**
 * Build the canonical tag map for a resource. The Hebrew business
 * name is stored under `business-name-he` and rendered UTF-8.
 */
function buildTags(cfg, resource) {
  const compliance = mergeCompliance(cfg.compliance, resource.compliance);
  const base = {
    'business-name-he': cfg.businessNameHe,
    'business-name-en': cfg.businessNameEn,
    'compliance':       compliance.join(','),
    'managed-by':       cfg.managedBy,
    'environment':      resource.environment || 'prod',
    'data-residency':   cfg.dataResidency,
    'cost-center':      cfg.costCenter,
    'region-display':   REGION_DISPLAY[resource.cloud],
  };
  // Merge caller tags last so explicit overrides win.
  if (resource.tags && typeof resource.tags === 'object') {
    for (const [k, v] of Object.entries(resource.tags)) {
      base[k] = String(v);
    }
  }
  return base;
}

/**
 * Map a (cloud, type) pair to the canonical module key used in
 * MODULE_VERSIONS above. Throws for unknown combinations so typos
 * surface immediately.
 */
function moduleKey(cloud, type) {
  const map = {
    aws:   { vpc:'aws-vpc', bucket:'aws-s3-bucket', database:'aws-rds', vm:'aws-ec2',
             kubernetes:'aws-eks', keyvault:'aws-kms', loadbalancer:'aws-alb' },
    azure: { vpc:'azure-network', bucket:'azure-storage', database:'azure-mssql', vm:'azure-vm',
             kubernetes:'azure-aks', keyvault:'azure-keyvault', loadbalancer:'azure-lb' },
    gcp:   { vpc:'gcp-vpc', bucket:'gcp-gcs', database:'gcp-sql', vm:'gcp-compute',
             kubernetes:'gcp-gke', keyvault:'gcp-kms', loadbalancer:'gcp-lb' },
  };
  const inner = map[cloud];
  if (!inner) throw new Error(`IaCGenerator: unknown cloud '${cloud}'`);
  const key = inner[type];
  if (!key) throw new Error(`IaCGenerator: cloud '${cloud}' does not support type '${type}'`);
  return key;
}

function resolveModuleVersion(cloud, type, override) {
  if (typeof override === 'string' && override.length > 0) return override;
  return MODULE_VERSIONS[moduleKey(cloud, type)];
}

function validateResource(r, idx) {
  if (!r || typeof r !== 'object') {
    throw new TypeError(`IaCGenerator: resources[${idx}] must be an object`);
  }
  if (!RESOURCE_TYPES.includes(r.type)) {
    throw new Error(
      `IaCGenerator: resources[${idx}].type '${r.type}' invalid — must be one of ${RESOURCE_TYPES.join(', ')}`
    );
  }
  if (!VALID_CLOUDS.includes(r.cloud)) {
    throw new Error(
      `IaCGenerator: resources[${idx}].cloud '${r.cloud}' invalid — must be one of ${VALID_CLOUDS.join(', ')}`
    );
  }
  if (typeof r.name !== 'string' || r.name.length === 0) {
    throw new Error(`IaCGenerator: resources[${idx}].name must be a non-empty string`);
  }
  if (r.environment !== undefined && !VALID_ENVS.includes(r.environment)) {
    throw new Error(
      `IaCGenerator: resources[${idx}].environment '${r.environment}' invalid — must be one of ${VALID_ENVS.join(', ')}`
    );
  }
  return r;
}

/* ------------------------------------------------------------------ *
 *  Terraform rendering                                               *
 * ------------------------------------------------------------------ */

function renderTerraformHeader(cfg) {
  const lines = [];
  lines.push('# ==================================================================');
  lines.push('# Generated by IaCGenerator (Agent Y-174)');
  lines.push('# נוצר על ידי מחולל ה-IaC — Techno-Kol Uzi mega-ERP');
  lines.push('# Principle: לא מוחקים רק משדרגים ומגדלים');
  lines.push('#            (never delete — only upgrade and grow)');
  lines.push(`# Business:  ${cfg.businessNameHe} / ${cfg.businessNameEn}`);
  lines.push(`# Generated: ${cfg.timestamp || 'deterministic'}`);
  lines.push('# ==================================================================');
  lines.push('');
  lines.push('terraform {');
  lines.push(`  required_version = ">= ${cfg.terraformVersion}"`);
  lines.push('  required_providers {');
  lines.push('    aws = {');
  lines.push('      source  = "hashicorp/aws"');
  lines.push(`      version = ${hclQuote(cfg.providerVersions.aws)}`);
  lines.push('    }');
  lines.push('    azurerm = {');
  lines.push('      source  = "hashicorp/azurerm"');
  lines.push(`      version = ${hclQuote(cfg.providerVersions.azure)}`);
  lines.push('    }');
  lines.push('    google = {');
  lines.push('      source  = "hashicorp/google"');
  lines.push(`      version = ${hclQuote(cfg.providerVersions.gcp)}`);
  lines.push('    }');
  lines.push('  }');
  lines.push('}');
  lines.push('');
  return lines;
}

function renderTerraformBackend(cfg, cloud) {
  const lines = [];
  lines.push('# ---------- Remote state backend ----------');
  lines.push('# מצב מרוחק — נשמר בישראל בלבד, לא יוצא מגבולות המדינה');
  if (cloud === 'aws') {
    lines.push('terraform {');
    lines.push('  backend "s3" {');
    lines.push(`    bucket         = ${hclQuote(`${cfg.stateBucketPrefix}-aws-${ISRAELI_REGIONS.aws}`)}`);
    lines.push('    key            = "onyx-procurement/terraform.tfstate"');
    lines.push(`    region         = ${hclQuote(ISRAELI_REGIONS.aws)}`);
    lines.push('    encrypt        = true');
    lines.push(`    dynamodb_table = ${hclQuote(cfg.stateLockTable)}`);
    lines.push('  }');
    lines.push('}');
  } else if (cloud === 'azure') {
    lines.push('terraform {');
    lines.push('  backend "azurerm" {');
    lines.push(`    resource_group_name  = ${hclQuote(`${cfg.stateBucketPrefix}-rg`)}`);
    lines.push(`    storage_account_name = ${hclQuote(`${cfg.stateBucketPrefix}sa`)}`);
    lines.push('    container_name       = "tfstate"');
    lines.push('    key                  = "onyx-procurement.terraform.tfstate"');
    lines.push('  }');
    lines.push('}');
  } else if (cloud === 'gcp') {
    lines.push('terraform {');
    lines.push('  backend "gcs" {');
    lines.push(`    bucket = ${hclQuote(`${cfg.stateBucketPrefix}-gcp-${ISRAELI_REGIONS.gcp}`)}`);
    lines.push('    prefix = "onyx-procurement/terraform.tfstate"');
    lines.push('  }');
    lines.push('}');
  }
  lines.push('');
  return lines;
}

function renderTerraformProvider(cloud) {
  const lines = [];
  if (cloud === 'aws') {
    lines.push('provider "aws" {');
    lines.push(`  region = ${hclQuote(ISRAELI_REGIONS.aws)}`);
    lines.push('}');
  } else if (cloud === 'azure') {
    lines.push('provider "azurerm" {');
    lines.push('  features {}');
    lines.push('}');
  } else if (cloud === 'gcp') {
    lines.push('provider "google" {');
    lines.push(`  region = ${hclQuote(ISRAELI_REGIONS.gcp)}`);
    lines.push('}');
  }
  lines.push('');
  return lines;
}

function renderTagsHcl(tags, indent) {
  const pad = ' '.repeat(indent);
  const lines = [];
  lines.push(`${pad}tags = {`);
  const keys = Object.keys(tags).sort();
  for (const k of keys) {
    lines.push(`${pad}  ${hclQuote(k)} = ${hclQuote(tags[k])}`);
  }
  lines.push(`${pad}}`);
  return lines;
}

function renderTerraformResource(cfg, r) {
  const lines = [];
  const id = sanitizeId(r.name);
  const tags = buildTags(cfg, r);
  const modVersion = resolveModuleVersion(r.cloud, r.type, r.moduleVersion);
  const modKey = moduleKey(r.cloud, r.type);
  lines.push(`# ---------- ${r.type} "${r.name}" (${REGION_DISPLAY[r.cloud]}) ----------`);
  lines.push(`# Module: ${modKey} v${modVersion} (pinned)`);
  lines.push(`module "${id}" {`);
  // Registry sources are versioned via `version =`, git sources via
  // `?ref=v<X>`. We emit both forms — git source for immutability.
  lines.push(`  source  = ${hclQuote(`git::https://github.com/techno-kol-uzi/iac-modules.git//${modKey}?ref=v${modVersion}`)}`);
  lines.push(`  version = ${hclQuote(modVersion)}`);
  lines.push('');
  lines.push(`  name        = ${hclQuote(r.name)}`);
  lines.push(`  environment = ${hclQuote(r.environment || 'prod')}`);
  lines.push(`  region      = ${hclQuote(ISRAELI_REGIONS[r.cloud])}`);
  if (r.size) {
    lines.push(`  size        = ${hclQuote(r.size)}`);
  }
  lines.push('');
  lines.push.apply(lines, renderTagsHcl(tags, 2));
  lines.push('');
  // Lifecycle — prevent_destroy enforces the "never delete" rule.
  lines.push('  lifecycle {');
  lines.push('    prevent_destroy = true');
  lines.push('    ignore_changes  = [tags["last-modified"]]');
  lines.push('  }');
  lines.push('}');
  lines.push('');
  return lines;
}

/* ------------------------------------------------------------------ *
 *  Pulumi TS rendering                                               *
 * ------------------------------------------------------------------ */

function renderPulumiHeader(cfg) {
  const lines = [];
  lines.push('// ==================================================================');
  lines.push('// Generated by IaCGenerator (Agent Y-174) — Pulumi TypeScript');
  lines.push('// נוצר על ידי מחולל ה-IaC — Techno-Kol Uzi mega-ERP');
  lines.push('// Principle: לא מוחקים רק משדרגים ומגדלים');
  lines.push('//            (never delete — only upgrade and grow)');
  lines.push(`// Business:  ${cfg.businessNameHe} / ${cfg.businessNameEn}`);
  lines.push('// ==================================================================');
  lines.push('');
  lines.push("import * as pulumi from '@pulumi/pulumi';");
  lines.push("import * as aws from '@pulumi/aws';");
  lines.push("import * as azure from '@pulumi/azure-native';");
  lines.push("import * as gcp from '@pulumi/gcp';");
  lines.push('');
  lines.push('// ---------- Israeli regions (data-residency enforced) ----------');
  lines.push(`const AWS_REGION   = ${tsQuote(ISRAELI_REGIONS.aws)};   // Tel Aviv`);
  lines.push(`const AZURE_REGION = ${tsQuote(ISRAELI_REGIONS.azure)}; // Israel Central`);
  lines.push(`const GCP_REGION   = ${tsQuote(ISRAELI_REGIONS.gcp)};   // Tel Aviv`);
  lines.push('');
  lines.push('// ---------- Remote state backend hint ----------');
  lines.push('// Configure via: `pulumi login s3://' + cfg.stateBucketPrefix + '-pulumi?region=' + ISRAELI_REGIONS.aws + '`');
  lines.push(`// Self-managed backend keeps state inside Israel (data-residency: ${cfg.dataResidency}).`);
  lines.push('');
  return lines;
}

function renderTagsTs(tags, indent) {
  const pad = ' '.repeat(indent);
  const lines = [];
  lines.push(`${pad}tags: {`);
  const keys = Object.keys(tags).sort();
  for (const k of keys) {
    lines.push(`${pad}  ${tsQuote(k)}: ${tsQuote(tags[k])},`);
  }
  lines.push(`${pad}},`);
  return lines;
}

function renderPulumiResource(cfg, r) {
  const lines = [];
  const id = sanitizeId(r.name);
  const tags = buildTags(cfg, r);
  const modVersion = resolveModuleVersion(r.cloud, r.type, r.moduleVersion);
  const modKey = moduleKey(r.cloud, r.type);
  lines.push(`// ---------- ${r.type} "${r.name}" (${REGION_DISPLAY[r.cloud]}) ----------`);
  lines.push(`// Module: ${modKey} v${modVersion} (pinned)`);
  lines.push(`export const ${id} = new pulumi.ComponentResource(`);
  lines.push(`  ${tsQuote(`techno-kol-uzi:${modKey}`)},`);
  lines.push(`  ${tsQuote(r.name)},`);
  lines.push('  {');
  lines.push(`    moduleVersion: ${tsQuote(modVersion)},`);
  lines.push(`    region:        ${tsQuote(ISRAELI_REGIONS[r.cloud])},`);
  lines.push(`    environment:   ${tsQuote(r.environment || 'prod')},`);
  if (r.size) {
    lines.push(`    size:          ${tsQuote(r.size)},`);
  }
  lines.push.apply(lines, renderTagsTs(tags, 4));
  lines.push('  },');
  // `protect: true` is Pulumi's equivalent of Terraform's
  // `prevent_destroy = true`. It enforces the "never delete" rule.
  lines.push('  {');
  lines.push('    protect: true,');
  lines.push('  },');
  lines.push(');');
  lines.push('');
  return lines;
}

/* ------------------------------------------------------------------ *
 *  IaCGenerator class                                                *
 * ------------------------------------------------------------------ */

class IaCGenerator {
  constructor(defaults) {
    const merged = Object.assign({}, DEFAULTS, defaults || {});
    merged.compliance = mergeCompliance(DEFAULTS.compliance, (defaults || {}).compliance);
    merged.providerVersions = Object.assign(
      {},
      DEFAULTS.providerVersions,
      (defaults && defaults.providerVersions) || {}
    );
    this._cfg = Object.freeze(merged);
  }

  get config() {
    return this._cfg;
  }

  /**
   * Render a Terraform HCL string for the given resources array.
   * Never writes to disk — returns the string.
   */
  generateTerraform(resources) {
    assertNonEmptyArray(resources, 'resources');
    resources.forEach(validateResource);

    const out = [];
    out.push.apply(out, renderTerraformHeader(this._cfg));

    // Emit one backend block per distinct cloud in the resource list.
    const clouds = Array.from(new Set(resources.map((r) => r.cloud))).sort();
    for (const cloud of clouds) {
      out.push.apply(out, renderTerraformBackend(this._cfg, cloud));
    }

    // Providers
    for (const cloud of clouds) {
      out.push.apply(out, renderTerraformProvider(cloud));
    }

    // Resources
    for (const r of resources) {
      out.push.apply(out, renderTerraformResource(this._cfg, r));
    }

    return out.join('\n');
  }

  /**
   * Render a Pulumi-compatible TypeScript snippet string for the
   * given resources array. Never writes to disk — returns the string.
   */
  generatePulumiTS(resources) {
    assertNonEmptyArray(resources, 'resources');
    resources.forEach(validateResource);

    const out = [];
    out.push.apply(out, renderPulumiHeader(this._cfg));

    for (const r of resources) {
      out.push.apply(out, renderPulumiResource(this._cfg, r));
    }

    return out.join('\n');
  }

  /**
   * Convenience — return both Terraform and Pulumi strings keyed
   * by canonical file name so callers can iterate without needing
   * to know the generator's internal layout.
   */
  generateAll(resources) {
    return {
      'main.tf':   this.generateTerraform(resources),
      'index.ts':  this.generatePulumiTS(resources),
    };
  }
}

module.exports = {
  IaCGenerator,
  ISRAELI_REGIONS,
  REGION_DISPLAY,
  COMPLIANCE_FRAMEWORKS,
  RESOURCE_TYPES,
  VALID_CLOUDS,
  VALID_ENVS,
  MODULE_VERSIONS,
  DEFAULTS,
  // exposed for unit-testing only
  sanitizeId,
  hclQuote,
  tsQuote,
  buildTags,
  mergeCompliance,
  moduleKey,
  resolveModuleVersion,
  validateResource,
};
