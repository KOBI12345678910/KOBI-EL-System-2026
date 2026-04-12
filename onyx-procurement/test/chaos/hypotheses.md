# Chaos scenarios — steady-state hypotheses

> Agent 55 / 2026-04-11
>
> Every experiment in `chaos-tests.js` must start with a **written hypothesis
> about steady state** — the claim we expect the system to continue to
> satisfy while the fault is active. If the claim turns out to be false, we
> have learned something about `onyx-procurement` that we did not know before.
>
> Each entry below follows the same shape:
>
> * **Fault** — what we inject.
> * **Steady state** — the measurable property that defines "healthy".
> * **Hypothesis** — the exact quantitative claim.
> * **Signal** — how we observe it in `chaos-tests.js`.
> * **Expected failure mode** — what we'd see if the hypothesis is wrong.
> * **Blast radius** — what the fault must *not* touch.

---

## 1. `slow-db` — Slow DB

* **Fault.** Every call into the DB abstraction takes `+2000 ms`
  (`db-slow-query` with `extraMs: 2000`).
* **Steady state.** Read-only API routes still respond within a bounded
  budget and the health endpoint remains fast because it does no I/O.
* **Hypothesis.**
  * `p95` of read-only routes **≤ 3500 ms** under fault.
  * `/api/health` **≤ 1000 ms** after dispose (liveness unaffected).
  * Error rate **≤ 2%** (fault adds latency, not errors).
* **Signal.** `run.underChaos.p95Ms`, `run.steadyAfter.routes['/api/health'].durationMs`.
* **Expected failure mode.** Sockets back up, queue grows without bound,
  OS file-descriptor exhaustion, event-loop lag climbing.
* **Blast radius.** Health check must not be behind the DB. If it is — that
  is itself a finding.

---

## 2. `flaky-network` — Flaky network

* **Fault.** 10% of outgoing HTTP responses are rewritten to `500`
  (`error-injection` with `rate: 0.10`).
* **Steady state.** Retries mask most of the injected errors so the **observed**
  error rate stays within a modest envelope. The error tracker fires for
  each failed attempt, and the process never exits.
* **Hypothesis.**
  * Observed error rate **≤ 15%** (≈ 10% injected + 5% slack).
  * `/api/health` ≤ 1500 ms.
  * `process.uptime()` is monotonically increasing during the run
    (no restart).
* **Signal.** `run.underChaos.errorRate`, `run.observations.after.uptimeSec`.
* **Expected failure mode.** Retry budget exceeded → 5xx cascade → clients
  give up. Or, worse, retries *are not implemented*, in which case error
  rate is ≥ 10% exactly — a signal to add a retry layer.
* **Blast radius.** The error injection is stateless; no persistent data
  should change. The only allowed side-effect is the error tracker being
  incremented.

---

## 3. `disk-full` — Disk full

* **Fault.** `fs.writeFile` / `fs.createWriteStream` reject with `ENOSPC`
  for any path under `test/tmp-pdfs*` or ending in `.pdf` (`disk-full`).
* **Steady state.** PDF routes surface the failure as a structured
  error (ideally HTTP `507`) and clean up any tmp artefacts. Non-PDF
  routes are **completely unaffected**.
* **Hypothesis.**
  * Non-PDF error rate **≤ 2%**.
  * PDF routes return a JSON body with `error.code === 'ENOSPC'` or
    equivalent, not an HTML stack trace.
  * Leaked tmp files after dispose **= 0**.
* **Signal.** Route-level status codes + file-system scan in the test
  harness.
* **Expected failure mode.** Uncaught `ENOSPC` crashes the worker, or
  a half-written PDF is served to the client, or the tmp directory fills
  with zombie files.
* **Blast radius.** Only file-system writes are affected. DB, HTTP, and
  memory are untouched.

---

## 4. `memory-starved` — Memory starved

* **Fault.** Allocate ~`500 MB` of retained `Buffer` chunks with
  `memory-pressure { sizeMB: 500 }`.
* **Steady state.** V8 still has enough headroom to process requests.
  Response caches shrink on demand, large operations stream instead of
  buffering. No OOM.
* **Hypothesis.**
  * No `FATAL ERROR: … JavaScript heap out of memory` in the run log.
  * `/api/health` ≤ 2500 ms.
  * Observed error rate ≤ 5%.
  * RSS delta during run **≤ ~800 MB** (the 500 MB fault + some overhead,
    *not* 500 MB + runaway).
* **Signal.** `run.observations.after.rssDeltaMb`, process exit code.
* **Expected failure mode.** A single large response (e.g. an annual VAT
  report) buffered to memory pushes the process over the cliff. Caches do
  not shrink under pressure.
* **Blast radius.** Memory only. HTTP and FS behaviour should remain
  unchanged *at the protocol level* — slower, yes, but not failing.

---

## 5. `broken-external` — Broken external

* **Fault.** Simulated external webhook receivers return `503` for every
  call (`error-injection` with `rate: 1.0, status: 503`).
* **Steady state.** Inbound API traffic is **isolated** from outbound
  webhook failure. Webhook deliveries queue or retry; nothing is silently
  dropped. The main API's error rate and latency are unchanged.
* **Hypothesis.**
  * Inbound error rate **≤ 5%** (unrelated to the 100% outbound failure).
  * At least one retry is observed in the log (runner records
    `error-injection` events — more than one == retry).
  * No growth of in-memory webhook queue without bound (cap ≤ configured
    max).
* **Signal.** Event log + inbound API probe results in `chaos-tests.js`.
* **Expected failure mode.** Webhook dispatcher blocks request handlers
  (shared thread-pool), inbound latency climbs, event-loop lag spikes.
* **Blast radius.** External only. The inbound API must not notice.

---

## 6. `cpu-starved` — CPU starved

* **Fault.** A busy loop on the main thread at 80% duty cycle for 30 s
  (`cpu-spike`).
* **Steady state.** The event loop still gets scheduled often enough to
  respond to `/api/health` in a reasonable time. No requests are
  permanently wedged.
* **Hypothesis.**
  * `/api/health` ≤ 3000 ms (degraded, but not broken).
  * No 5xx spike > 10%.
  * After dispose, p95 returns to baseline within one steady-state sample.
* **Signal.** Route-level latency histogram, post-fault resample.
* **Expected failure mode.** Event-loop lag > 5 s, all in-flight requests
  hit client timeout, keep-alive sockets get reset.
* **Blast radius.** Main-thread CPU only. Worker threads, FS, and DB
  remain untouched. If the app has no worker threads for hot loops, that
  itself is a finding.

---

## 7. `latency-storm` — Latency storm

* **Fault.** Every inbound HTTP request is delayed by a uniform random
  500–5000 ms (`latency`).
* **Steady state.** The server never hangs a socket longer than its own
  deadline. Clients either see a response or a predictable timeout — not
  a silent stall.
* **Hypothesis.**
  * `p95` of probed routes **≤ 6500 ms**.
  * Error rate ≤ 5% (latency, not errors).
  * No FDs leaked after dispose (runner exits with the same number of
    open sockets it started with).
* **Signal.** `run.underChaos.p95Ms`, burst-level error count, OS-level
  FD sanity check in `chaos-tests.js`.
* **Expected failure mode.** Timeouts misconfigured → sockets pile up →
  `EMFILE` → process unresponsive.
* **Blast radius.** Inbound HTTP only.

---

## Cross-cutting invariants

Regardless of which scenario is running, the following must hold — they
apply as a meta-hypothesis over every experiment:

1. **The process does not crash.** A crash is always a `failed` status,
   never `degraded`.
2. **`disposeAll()` fully reverts every fault.** After dispose, a fresh
   `http.createServer` on the target process returns untouched
   200 responses.
3. **Error-tracker integration triggers at least once per fault that
   produces errors.** If it does not, the error-tracking pipeline itself
   is a finding.
4. **Retries are bounded.** No retry loop may exceed the per-request
   timeout or re-queue indefinitely.
5. **Circuit breaker, if present, opens and closes.** If the app has a
   breaker, it must enter `OPEN` under `flaky-network` or
   `broken-external`, then recover to `CLOSED` after dispose.
6. **Cleanup is total.** Tmp files, DB connections, and in-memory caches
   return to their pre-chaos state.

Every deviation from the cross-cutting invariants is reported with a
`high` severity by `chaos-report.js` and forces the overall run into
`failed`.
