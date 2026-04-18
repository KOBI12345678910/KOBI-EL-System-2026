# Chaos Engineering Harness — `test/chaos/`

> Agent 55 / 2026-04-11
> Rule: **never delete anything**. Every fault is additive and fully reverted
> on dispose.

## What is chaos engineering?

Chaos engineering is the discipline of **deliberately injecting faults into a
running system in order to build confidence that it can survive them in
production**. It is the exact opposite of hoping the system stays up — instead
you push on it in controlled ways and observe whether its behaviour matches a
*steady-state hypothesis* you stated up front.

The canonical loop (Netflix Principles of Chaos, 2014) is:

1. **Define steady state.** Pick measurable outputs that indicate the system
   is healthy — error rate, p95 latency, successful writes per minute, etc.
2. **Hypothesise that steady state holds under fault.** Example: *"If 10% of
   requests fail, overall error rate observed by users stays below 15%."*
3. **Introduce real-world events.** Latency spikes, dropped connections,
   disk-full errors, memory pressure, broken external services — anything
   your production system actually sees.
4. **Try to disprove the hypothesis.** If the system *degrades* or *fails*,
   you've found a weakness before your users did.
5. **Minimise blast radius.** Start small (staging, dry-run, one route),
   widen once you trust the harness.

This directory implements that loop for `onyx-procurement`, end to end, using
**only Node.js built-ins**. No `k6`, no `chaos-mesh`, no `toxiproxy`, no
`autocannon`.

## Files

| File                    | Role                                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| `chaos-runner.js`       | The fault library. Monkey-patches `http`, `fs`, DB stubs, memory, CPU. Every patch captures the original reference and returns a dispose function. |
| `chaos-scenarios.js`    | Pre-baked scenarios (Slow DB, Flaky network, Disk full, Memory starved, Broken external, CPU starved, Latency storm). Scenario = `{ id, steadyState, faults, abortConditions }`. |
| `chaos-tests.js`        | The test harness. For each scenario: sample steady state → inject fault → burst probe requests → dispose → re-sample → verify hypothesis. |
| `chaos-report.js`       | Renders `RunResult[]` into text + JSON and emits recommendations.    |
| `README.md`             | This file.                                                           |
| `hypotheses.md`         | One written hypothesis per scenario, with the exact metric.          |

## Principles we honour

1. **Nothing is deleted.** The runner never removes or renames any source
   file. Faults only override symbols in memory, always reversibly.
2. **Dispose is mandatory.** Every scenario runs in a `try { … } finally
   { runner.disposeAll() }`. The self-test in `chaos-runner.js` asserts that
   after dispose, a fresh `http.createServer` behaves normally.
3. **Determinism where possible.** All randomness flows through a seeded
   `mulberry32` PRNG inside the runner. Same seed → same injection pattern.
4. **Dry-run is default.** `chaos-tests.js` does **not** actually fire at a
   real server unless `CHAOS_DRY_RUN=0` is explicitly set. CI runs the wiring
   check; humans run the live experiment on a supervised environment.
5. **No dependencies.** Every file `require`s only `node:*` built-ins.
6. **Minimum blast radius.** Scenarios target a single concern at a time,
   have an explicit `abortConditions`, and default durations are short
   (30–60 seconds).

## Faults available

| Name              | What it does                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| `latency`         | Delays every incoming HTTP request by a random 500 ms – 5 s.                 |
| `error-injection` | Rewrites a configurable % of responses to 500 (or any status).               |
| `connection-drop` | Destroys the underlying socket mid-response on a % of requests.              |
| `db-slow-query`   | Wraps a user-supplied `query()`-shaped function with an `extraMs` sleep.     |
| `disk-full`       | `fs.writeFile` / `fs.createWriteStream` reject with `ENOSPC` for matched paths. |
| `memory-pressure` | Allocates ~500 MB of retained buffers. Disposed on `disposeAll()`.           |
| `cpu-spike`       | Busy loop on the main thread at a configurable duty cycle.                   |

Every fault is registered through `ChaosRunner.enable(name, opts)` which
returns a handle whose `.dispose()` perfectly reverts the change.

## Scenarios shipped

| Scenario          | Target                         | Expected outcome                                     |
| ----------------- | ------------------------------ | ---------------------------------------------------- |
| `slow-db`         | Every DB call → +2 s           | Requests time-out cleanly, health endpoint still OK. |
| `flaky-network`   | 10% of responses → 500         | Retries kick in, total error rate < 15%.             |
| `disk-full`       | PDF writes → `ENOSPC`          | Non-PDF routes untouched; PDF routes return 507.     |
| `memory-starved`  | +500 MB retained buffers       | No OOM, caches shrink, process stays up.             |
| `broken-external` | Webhook receivers → 503        | Inbound API healthy, retries / queue observed.       |
| `cpu-starved`     | 80% CPU on main thread         | Health still responds in < 3 s.                      |
| `latency-storm`   | Every request +500 ms – 5 s    | p95 < 6.5 s, no hanging sockets.                     |

## How to run

### Dry run (safe, no server needed, default)

```bash
node test/chaos/chaos-tests.js
```

This validates that every fault patches and un-patches cleanly, renders the
run plan, and exits `0`.

### Live run (supervised environment only)

```bash
CHAOS_DRY_RUN=0 \
  CHAOS_BASE_URL=http://localhost:3100 \
  CHAOS_API_KEY=dev-key \
  node test/chaos/chaos-tests.js
```

Optional:

* `CHAOS_ONLY=slow-db,flaky-network` — restrict to a subset.
* `CHAOS_BURST_SIZE=50` — number of probe requests per scenario.
* `CHAOS_BURST_CONC=10` — burst concurrency.
* `CHAOS_SEED=42` — PRNG seed for reproducibility.
* `CHAOS_TIMEOUT_MS=10000` — per-request client timeout.

### Self-test for the runner only

```bash
node test/chaos/chaos-runner.js
```

Exercises every fault against a local ephemeral server and verifies that
`disposeAll()` restores every patched symbol.

## Outputs

The reporter renders three things from a `RunResult[]`:

1. A text block printed to stdout (compact, CI-friendly).
2. A JSON blob (machine-readable) when you call `writeReport(runs, { outDir })`.
3. A recommendations list derived from violated hypotheses and the faults
   that were active during the violation.

Each result is classified as:

| Status      | Meaning                                                           |
| ----------- | ----------------------------------------------------------------- |
| `resilient` | Hypothesis held — no deviations.                                  |
| `degraded`  | Hypothesis bent but did not break — medium-severity deviations.   |
| `failed`    | Hypothesis broken — high-severity deviation or process exception. |
| `dry-run`   | No live traffic was sent; wiring check passed.                    |

## Why only Node built-ins

* **Reproducible.** No lockfile drift, no transitive supply-chain risk.
* **Portable.** Runs on any machine with Node ≥ 18.
* **Small blast radius.** Fewer moving parts to audit before firing faults at
  a real service.
* **Matches the rest of `test/`** — `load/`, `bench/`, `stress/` also avoid
  external deps.

## Safety checklist before running live

* [ ] Target is a staging environment, not production.
* [ ] You have a way to stop the harness (`Ctrl-C` works; `SIGTERM` also).
* [ ] You have out-of-band monitoring on the target (so you can see the
      damage independently from the harness).
* [ ] You've read `hypotheses.md` and know which metric each scenario
      expects to see change.
* [ ] You've set `CHAOS_SEED` so the run is reproducible.
* [ ] You are ready to `disposeAll()` manually if the process is still
      holding patches (`runner.disposeAll()` in a REPL works).

## References

* Principles of Chaos Engineering — https://principlesofchaos.org/
* Netflix Chaos Monkey — https://github.com/Netflix/chaosmonkey
* Chaos Engineering, Rosenthal & Jones, O'Reilly 2020.
