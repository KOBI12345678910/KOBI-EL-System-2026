/**
 * Micro-benchmark: PCN836 bulk export performance.
 *
 * Measures buildPcn836File() throughput across transaction volumes
 * (100, 1k, 10k, 50k) using perf_hooks.performance.now().
 *
 * Run:
 *   node test/bench/bulk-pcn836.bench.js
 *
 * Baseline SLA (single-threaded, commodity laptop CPU circa 2024):
 *   - 10,000 records must build in < 500 ms.
 *   - If slower, a warning is printed; the process still exits 0 so CI
 *     pipelines on under-provisioned runners do not flap.
 *
 * This file does NOT modify any source under src/vat/. It only imports
 * the public module and exercises it with synthetic fixtures.
 */
'use strict';

const { performance } = require('node:perf_hooks');
const path = require('node:path');

const pcn836 = require(path.join(__dirname, '..', '..', 'src', 'vat', 'pcn836.js'));
const { buildPcn836File, validatePcn836File } = pcn836;

// ═══ CONFIG ═══

const SIZES = [100, 1000, 10000, 50000];
const SLA_10K_MS = 500; // spec: 10k records must build in < 500ms on baseline hardware
const INPUT_OUTPUT_RATIO = 0.5; // 50% input invoices, 50% output invoices

// ═══ FIXTURE FACTORIES ═══

const companyProfile = {
  legal_name: 'Benchmark Co. Ltd.',
  vat_file_number: '123456789',
  reporting_frequency: 'monthly',
};

const period = {
  period_label: '2026-04',
  period_start: '2026-04-01',
  period_end: '2026-04-30',
  taxable_sales: 1000000,
  vat_on_sales: 170000,
  zero_rate_sales: 0,
  exempt_sales: 0,
  taxable_purchases: 500000,
  vat_on_purchases: 85000,
  asset_purchases: 10000,
  vat_on_assets: 1700,
  net_vat_payable: 85000,
  is_refund: false,
};

/**
 * Build a synthetic invoice. Deterministic (seeded by `seed`) so runs
 * are comparable and so the string output size is stable across runs.
 */
function makeInvoice(seed, kind) {
  // Pseudo-random but deterministic per seed (no Math.random to keep
  // benchmarks reproducible across CI machines).
  const idx = seed + 1;
  const cp = String(100000000 + (idx * 37) % 899999999).slice(0, 9);
  const net = 1000 + (idx * 13) % 9000 + 0.17 * (idx % 5);
  const vat = Math.round(net * 0.17 * 100) / 100;
  const day = 1 + (idx % 28);
  return {
    counterparty_id: cp,
    counterparty_tax_id: cp,
    invoice_number: `${kind}-${String(idx).padStart(7, '0')}`,
    invoice_date: `2026-04-${String(day).padStart(2, '0')}`,
    net_amount: net,
    vat_amount: vat,
    gross_amount: net + vat,
    is_asset: idx % 50 === 0,
    allocation_number: idx % 3 === 0 ? String(900000000 + idx).slice(0, 9) : '',
  };
}

function makeInvoiceArrays(total) {
  const inputCount = Math.floor(total * INPUT_OUTPUT_RATIO);
  const outputCount = total - inputCount;
  const inputInvoices = new Array(inputCount);
  for (let i = 0; i < inputCount; i++) {
    inputInvoices[i] = makeInvoice(i, 'INV');
  }
  const outputInvoices = new Array(outputCount);
  for (let i = 0; i < outputCount; i++) {
    outputInvoices[i] = makeInvoice(i + inputCount, 'SAL');
  }
  return { inputInvoices, outputInvoices };
}

// ═══ MEASUREMENT ═══

/**
 * Run one trial: build the fixtures, time the build, measure output,
 * validate structure. Returns a row suitable for the results table.
 */
function runTrial(size) {
  const { inputInvoices, outputInvoices } = makeInvoiceArrays(size);

  // Warm the function once at this size (outside the timer) so the
  // measurement is not dominated by V8 tier-up on the very first call.
  // We keep this small to avoid skewing the "cold" characterization.
  if (size <= 10000) {
    buildPcn836File({
      companyProfile,
      period,
      inputInvoices: inputInvoices.slice(0, Math.min(10, inputInvoices.length)),
      outputInvoices: outputInvoices.slice(0, Math.min(10, outputInvoices.length)),
    });
  }

  const t0 = performance.now();
  const file = buildPcn836File({
    companyProfile,
    period,
    inputInvoices,
    outputInvoices,
  });
  const t1 = performance.now();

  const buildMs = t1 - t0;
  const bytes = Buffer.byteLength(file.content, 'utf8');
  const throughput = size > 0 ? size / (buildMs / 1000) : 0;

  // Validate: the existing validator enforces equal line widths, but
  // real PCN836 records intentionally have different widths (A=92,
  // B=113, C/D=76, Z=60). We filter those width errors out and only
  // assert the STRUCTURAL checks (A/B/Z presence, min record count)
  // so this bench does not misreport a validator limitation as a bug.
  const allErrors = validatePcn836File(file);
  const structuralErrors = allErrors.filter(
    (e) =>
      /Missing content/.test(e) ||
      /Missing metadata/.test(e) ||
      /Too few records/.test(e) ||
      /First record must be header/.test(e) ||
      /Second record must be summary/.test(e) ||
      /Last record must be trailer/.test(e),
  );

  if (structuralErrors.length > 0) {
    throw new Error(
      `Structural validation failed at size=${size}: ${structuralErrors.join('; ')}`,
    );
  }

  return {
    size,
    records: file.lines.length,
    buildMs,
    bytes,
    throughput,
    checksum: file.metadata.fileChecksum.slice(0, 8),
    valid: structuralErrors.length === 0,
  };
}

// ═══ OUTPUT HELPERS ═══

function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(3)} s` : `${ms.toFixed(2)} ms`;
}

function fmtBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MiB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${n} B`;
}

function fmtThroughput(r) {
  if (r >= 1e6) return `${(r / 1e6).toFixed(2)} M rec/s`;
  if (r >= 1e3) return `${(r / 1e3).toFixed(2)} K rec/s`;
  return `${r.toFixed(0)} rec/s`;
}

function printTable(rows) {
  const header = ['Size', 'Records', 'Build', 'Output', 'Throughput', 'Valid', 'SHA'];
  const data = rows.map((r) => [
    String(r.size),
    String(r.records),
    fmtMs(r.buildMs),
    fmtBytes(r.bytes),
    fmtThroughput(r.throughput),
    r.valid ? 'yes' : 'NO',
    r.checksum,
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...data.map((row) => row[i].length)),
  );
  const sep = '+-' + widths.map((w) => '-'.repeat(w)).join('-+-') + '-+';
  const fmtRow = (row) =>
    '| ' + row.map((cell, i) => cell.padEnd(widths[i])).join(' | ') + ' |';
  console.log(sep);
  console.log(fmtRow(header));
  console.log(sep);
  for (const row of data) console.log(fmtRow(row));
  console.log(sep);
}

// ═══ MAIN ═══

function main() {
  console.log('PCN836 bulk export micro-benchmark');
  console.log(`Node: ${process.version}  Platform: ${process.platform}/${process.arch}`);
  console.log(`Sizes: ${SIZES.join(', ')}`);
  console.log(`Baseline SLA: 10k records in < ${SLA_10K_MS} ms`);
  console.log('');

  const rows = [];
  for (const size of SIZES) {
    try {
      const row = runTrial(size);
      rows.push(row);
      console.log(
        `  size=${String(size).padStart(6)}  ` +
          `build=${fmtMs(row.buildMs).padStart(10)}  ` +
          `out=${fmtBytes(row.bytes).padStart(10)}  ` +
          `thru=${fmtThroughput(row.throughput).padStart(14)}`,
      );
    } catch (err) {
      console.error(`  size=${size}  ERROR: ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log('');
  printTable(rows);

  // SLA check: 10k records must build in < 500ms on baseline hardware.
  // Per task instructions: warn on miss, do not fail the process.
  const row10k = rows.find((r) => r.size === 10000);
  if (row10k) {
    if (row10k.buildMs < SLA_10K_MS) {
      console.log(
        `\nOK: 10k records built in ${fmtMs(row10k.buildMs)} (< ${SLA_10K_MS} ms SLA).`,
      );
    } else {
      console.warn(
        `\nWARNING: 10k records took ${fmtMs(row10k.buildMs)}, exceeding the ` +
          `${SLA_10K_MS} ms SLA. Investigate generator algorithmic complexity ` +
          `(see test/bench/README.md for notes).`,
      );
    }
  }

  // Rough scaling analysis — compare throughput across sizes to flag
  // super-linear behavior (e.g. if the 50k run is > 2x slower per-record
  // than the 1k run, the generator is likely not O(N)).
  const row1k = rows.find((r) => r.size === 1000);
  const row50k = rows.find((r) => r.size === 50000);
  if (row1k && row50k && row1k.throughput > 0) {
    const ratio = row1k.throughput / Math.max(row50k.throughput, 1);
    console.log(
      `\nScaling: per-record throughput at 50k is ${(1 / ratio).toFixed(2)}x of 1k ` +
        `(1.00x would be perfectly linear).`,
    );
    if (ratio > 2) {
      console.warn(
        `WARNING: 50k throughput is < 50% of 1k throughput — generator may ` +
          `be super-linear in input size. The sha256 hash over the full body ` +
          `and the final lines.join('\\r\\n') are both O(N) in total bytes, so ` +
          `a ~1.0-1.3x slowdown is expected; anything higher suggests quadratic ` +
          `string concatenation somewhere.`,
      );
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { runTrial, makeInvoice, makeInvoiceArrays, SIZES };
