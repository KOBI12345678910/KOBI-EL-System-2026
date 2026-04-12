# test/bench — performance micro-benchmarks

Lightweight, zero-dependency benchmarks for hot paths. These are NOT
correctness tests (use `test/*.test.js` for that) and they do not run in
the default `node --test` suite. Run them manually when you want to
characterize or regression-check a module's throughput.

## bulk-pcn836.bench.js

Measures `buildPcn836File()` build time, output size, and throughput
across four transaction volumes.

### Run

```bash
node test/bench/bulk-pcn836.bench.js
```

No arguments, no flags. Exits 0 on success. Prints a warning (but does
not fail) if the 10k-record SLA is exceeded.

### What it measures

For each size in `[100, 1000, 10000, 50000]`:

| Metric       | Unit       | How it's measured                                |
| ------------ | ---------- | ------------------------------------------------ |
| Build time   | ms         | `perf_hooks.performance.now()` around the call   |
| Output size  | bytes      | `Buffer.byteLength(file.content, 'utf8')`        |
| Throughput   | records/s  | `size / (buildMs / 1000)`                        |
| Valid        | bool       | `validatePcn836File()` structural checks pass    |

### Baseline SLA

- **10,000 records must build in < 500 ms** on a commodity laptop CPU.
- Slower runs print a `WARNING:` but do NOT fail the process (exit 0).
  This keeps CI runners on under-provisioned hardware from flapping.
- 50k is included for headroom characterization; there is no hard SLA.

### Scaling notes

The generator has three dominant O(N) passes over the input:

1. Two `for ... of` loops that push per-invoice records into `lines[]`.
2. `lines.join('\r\n')` to produce the bytes fed into sha256.
3. `crypto.createHash('sha256').update(...)` over that same body.

Total work is proportional to the byte length of the output. At 50k
records the output is roughly 4 MiB, so per-record throughput should
stay within ~1.0–1.3x of the 1k case. If 50k is more than 2x slower
per-record than 1k, the bench prints a warning — suspected causes:

- Quadratic string concatenation (the `+=` trap).
- Re-hashing in a loop instead of once at the end.
- Per-invoice allocations growing the v8 old-space.

### Validation caveat

`validatePcn836File()` also enforces that every line has the same
width. The current encoder intentionally emits records of DIFFERENT
widths (A=92, B=113, C/D=76, Z=60), so the validator's width check
fires on every real file. The bench filters width errors out and only
asserts on the structural checks (A/B/Z presence, min record count).
This mirrors the approach in `test/pcn836.test.js`.

### What to do if the bench regresses

1. Re-run 3x to rule out GC noise.
2. Compare output size — if bytes jumped unexpectedly the generator is
   emitting extra records, not getting slower.
3. Profile with `node --prof test/bench/bulk-pcn836.bench.js` and
   inspect the resulting `isolate-*.log`.
4. Check for recent changes to `src/vat/pcn836.js` — particularly to
   `buildInvoiceRecord`, the trailer checksum, or any new per-line
   transforms.
