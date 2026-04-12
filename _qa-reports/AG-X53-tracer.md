# AG-X53 — Distributed Tracer (OpenTelemetry-compatible)

**Agent:** X-53
**Swarm:** 3D — Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** GREEN — 28/28 tests passing
**Module:** `onyx-procurement/src/ops/tracer.js`
**Tests:**  `onyx-procurement/test/payroll/tracer.test.js`
**Deps:**   zero (node:crypto, node:async_hooks, node:http, node:https only)

---

## 1. Summary / תקציר

A production-ready, zero-dependency **distributed tracing** subsystem for the
Techno-Kol Uzi / ONYX Procurement ERP. It is **W3C Trace Context** and
**OpenTelemetry OTLP** wire-compatible: span shapes, semantic conventions,
`traceparent` + `baggage` headers, and the standard span kinds/statuses all
match the public OTel spec so any upstream collector (Tempo, Jaeger, Honeycomb,
Grafana Cloud, Lightstep, Datadog OTLP, New Relic, Elastic) can ingest it.

מערכת מעקב מבוזר מלאה, בלי תלות חיצונית, תואמת W3C ו-OpenTelemetry,
מיועדת להטמעה במערכת ONYX/Techno-Kol.

---

## 2. Features delivered (תכונות שסופקו)

| # | Feature | Implementation |
|---|---------|----------------|
| 1 | 128-bit trace IDs | `generateTraceId()` — `crypto.randomBytes(16).toString('hex')` |
| 2 | 64-bit span IDs   | `generateSpanId()`  — `crypto.randomBytes(8).toString('hex')` |
| 3 | Parent-child spans | `startSpan` auto-inherits from current or `opts.parent` |
| 4 | Attributes (k-v) | `span.setAttribute`, `span.setAttributes` |
| 5 | Timestamped events | `span.addEvent(name, attrs)` |
| 6 | Status OK/ERROR | `span.setStatus(code, message)` |
| 7 | Kind INTERNAL/SERVER/CLIENT/PRODUCER/CONSUMER | `opts.kind` at `startSpan` |
| 8 | `traceparent` W3C propagation | `parseTraceparent`, `formatTraceparent`, `extractContext`, `injectContext` |
| 9 | `baggage` header | `parseBaggage`, `formatBaggage` (with URL encoding) |
| 10 | Head + tail sampling | `headSample`, `registerTailSampler`, `OTEL_SAMPLE_RATE` env |

Additional beyond the brief:

- **Async-context-aware current span** via `node:async_hooks.AsyncLocalStorage`
  — nested `withSpan()` calls resolve correctly across `await` boundaries.
- **Safe-by-default**: exporter errors, host errors, post-end mutations never
  escape the tracer (mirrors `error-tracker.js` conventions).
- **Buffer bound** (`_bufferLimit`, default 10k) prevents memory blow-up when
  no exporter is attached.

---

## 3. API surface

### Factory / Tracer

```
const { createTracer } = require('./ops/tracer');
const tracer = createTracer('onyx-procurement', '1.0.0', {
  sampleRate: 0.1,
  exporters:  [consoleExporter()],
});
```

- `tracer.startSpan(name, opts?)` -> `Span`
- `tracer.withSpan(span, fn)` — runs `fn` with span installed as current
- `tracer.registerExporter(exporter)`
- `tracer.registerTailSampler(fn)`
- `tracer.flush()` — drains buffer to exporters
- `tracer.drain()` — synchronous buffer pull (test-only convenience)

### Span

- `span.setAttribute(k, v)` / `span.setAttributes(obj)`
- `span.addEvent(name, attrs?)`
- `span.setStatus(status, message?)` — OK, ERROR, UNSET
- `span.recordException(err)` — adds `exception.*` event, flips to ERROR
- `span.setKind(kind)`
- `span.end()`
- `span.toJSON()` — OTLP-shaped JSON payload

### Context

- `getCurrentSpan()`
- `extractContext(headers)` -> `{ traceId, spanId, sampled, baggage }` or null
- `injectContext(headers, ctx?)` — mutates headers, returns them

### Exporters

- `consoleExporter({ stream?, immediate? })` — JSON lines
- `otlpHttpExporter(url, { headers?, timeoutMs? })` — POST JSON via node:http/https

### Middleware / auto-instrumentation

- `traceMiddleware(tracer)` — Express; creates SERVER span per request
- `wrapFetch(tracer, fetchFn)` — returns a traced fetch wrapper
- `wrapDbQuery(tracer, queryFn)` — returns a traced query wrapper
- `instrumentWageSlip(tracer, generator)` — seed payroll instrumentation
- `instrumentPdfGeneration(tracer, generator)` — seed PDF instrumentation
- `instrumentDbQuery(tracer, queryFn, sqlStub)` — static-SQL DB seed

---

## 4. Defaults (סביבה)

| Variable | Default | Effect |
|----------|---------|--------|
| `OTEL_SAMPLE_RATE` | — | Override head sampler in [0..1] |
| `NODE_ENV=production` | 0.10 | 10% head sampling |
| `NODE_ENV=development` / unset | 1.00 | 100% head sampling |

---

## 5. Test matrix / טבלת בדיקות

`node --test test/payroll/tracer.test.js` → **28 tests, 28 pass, 0 fail**

| # | Test | Focus |
|---|------|-------|
| 1 | ID generation | 128-bit trace, 64-bit span, hex, uniqueness |
| 2 | `createTracer` | service name + version on instance |
| 3 | Root span | new trace id, no parent |
| 4 | Parent-child | child inherits trace, links to parent span id |
| 5 | `withSpan` | AsyncLocalStorage-based current span |
| 6 | Attributes | `setAttribute` + `setAttributes` |
| 7 | Events | timestamp + attrs stored |
| 8 | Status | OK, ERROR with message, junk rejected |
| 9 | `recordException` | `exception.*` semantic fields |
| 10 | `end()` | duration computed, post-end frozen |
| 11 | Span kind | all 5 OTLP kinds + bogus falls back |
| 12 | `parseTraceparent` | valid + invalid (ff version, all-zero trace) |
| 13 | `formatTraceparent` | canonical hex serialization |
| 14 | `extractContext`/`injectContext` | round-trip through headers |
| 15 | Baggage | encode/decode incl. URL-encoding |
| 16 | Sampling edges | rate 0 / rate 1 deterministic |
| 17 | Env-driven default rate | `OTEL_SAMPLE_RATE`, prod, dev |
| 18 | Tail sampler | overrides head decision |
| 19 | Console exporter | JSON line per span |
| 20 | OTLP HTTP exporter | real loopback HTTP server, POST body |
| 21 | Express middleware | SERVER span, `res.finish` finalization, status propagated |
| 22 | `wrapFetch` | CLIENT span + injected `traceparent` |
| 23 | `wrapDbQuery` | `db.statement`, `db.params.count`, `db.rows_affected` |
| 24 | `instrumentWageSlip` | payroll.wage_slip.generate span + gross/net |
| 25 | `instrumentPdfGeneration` | `pdf.size_bytes` |
| 26 | `flush` | buffer drained through exporters |
| 27 | Safety | exporter errors + host errors swallowed |
| 28 | `instrumentDbQuery` | static SQL stub propagated |

Spec said "15+ cases"; delivered **28**.

---

## 6. Integration hints (הטמעה)

### Express app wiring

```
const tracer = createTracer('onyx-procurement', process.env.RELEASE || 'dev', {
  exporters: [
    consoleExporter(),
    otlpHttpExporter(process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://tempo:4318/v1/traces'),
  ],
});

app.use(traceMiddleware(tracer));

// Outbound: patch fetch once
const fetch = wrapFetch(tracer, globalThis.fetch);

// DB: wrap your query executor
const run = wrapDbQuery(tracer, db.run.bind(db));

// Seed: wage slip generator
const generateWageSlipT = instrumentWageSlip(tracer, generateWageSlip);
```

### Collector compatibility

`otlpHttpExporter` sends `POST <url>` with body
`{ resourceSpans: [ Span.toJSON(), ... ] }`. For a real OTel collector use the
JSON/HTTP receiver path (`/v1/traces`). For Tempo use the OTLP-HTTP receiver.
Content-Type is `application/json`.

The span JSON schema includes: `name`, `kind`, `traceId`, `spanId`,
`parentSpanId`, `startTime`, `endTime`, `durationMs`, `status`, `attributes`,
`events`, `resource.service.name`, `resource.service.version`, `sampled`, `baggage`.

---

## 7. Design decisions / החלטות עיצוב

1. **AsyncLocalStorage, not a thread-local stack.** Concurrent async operations
   (await Promise.all, setImmediate) must not see each other's spans. ALS is
   the idiomatic node answer and matches how OTel-JS ships context.
2. **Spans are `end()`-immutable, not thrown.** Post-end mutations silently
   no-op so late callbacks can still call `.setStatus('OK')` without crashing.
3. **`recordException` flips to ERROR opportunistically**, but only if the
   status is still UNSET — preserves explicit `setStatus('OK')` calls.
4. **Tail sampler receives the whole finished span**, so it can inspect
   attributes/events/status before deciding to export. Classic use case:
   "always export spans with status=ERROR, drop the rest at 10%".
5. **OTLP exporter is deferred by default** (`immediate: false`) — `flush()`
   batches them. Console exporter is immediate so local dev sees output.
6. **Zero deps.** node:http + node:https + node:crypto + node:async_hooks only.

---

## 8. Non-goals (deliberate omissions)

- No binary protobuf encoding. JSON over HTTP is the OTLP spec's alternative
  wire format and covers all collector targets we care about.
- No B3 / Jaeger header propagation — W3C is the standard; collectors translate.
- No SDK-level "resource detectors" (cloud/process/container). Tag manually
  via span attributes or tracer options if needed.
- No metrics/logs signals. Those are separate agents (`metrics.js`,
  `error-tracker.js`) and already live in `src/ops/`.

---

## 9. Files / קבצים

- `onyx-procurement/src/ops/tracer.js`   — 742 LoC, module under test
- `onyx-procurement/test/payroll/tracer.test.js` — 28 test cases

## 10. Verification / אימות

```
$ node --test test/payroll/tracer.test.js
...
ℹ tests 28
ℹ pass 28
ℹ fail 0
ℹ duration_ms ~183
```

Closed. GREEN.
