# IPP Printing — Onyx Procurement

A zero-dependency printing stack for Onyx Procurement. Implements the
Internet Printing Protocol (IPP/1.1, RFC 8011) from scratch over Node's
built-in `http` module and wraps it with a priority print queue that also
routes to the existing thermal (ESC/POS) and ZPL (label) backends.

This document is the operator / developer reference for:

- `src/printing/ipp-client.js` — IPP codec and high-level client
- `src/printing/print-queue.js` — priority queue + smart dispatch + offline fallback
- `src/printing/ipp-client.test.js` — unit tests with an in-process mock printer

---

## 1. Architecture overview

```
                    +-----------------------------+
                    |       print-queue.js        |
                    |   PrintQueue.print(dest, c) |
                    +-------------+---------------+
                                  |
                                  |   (infer: type + contentType)
                                  v
        +----------------+    +----------------+    +--------------+
        |    IPP path    |    |  Thermal path  |    |   ZPL path   |
        | ipp-client.js  |    | thermal-printer|    | zpl-printer  |
        +----------------+    +----------------+    +--------------+
                |                     |                     |
                v                     v                     v
         +----------------+    +----------------+    +--------------+
         | HTTP POST      |    | TCP / USB      |    | TCP / HTTP   |
         | application/ipp|    | ESC/POS bytes  |    | ZPL bytes    |
         | port 631       |    | port 9100      |    | port 9100    |
         +----------------+    +----------------+    +--------------+
```

The queue is the only public entry point for application code. It:

- Enforces **priority** ordering (urgent > high > normal > low).
- Persists jobs to disk (optional) so restarts don't lose work.
- Watches for printers coming back online and re-sends **stored-offline** jobs.
- Dispatches to the correct backend via content-type sniffing or explicit hints.

---

## 2. `ipp-client.js` — IPP protocol client

### 2.1 Supported operations

| Operation               | Code   | Function                                |
|-------------------------|--------|-----------------------------------------|
| Print-Job               | 0x0002 | `printPdf(...)`, `printRawText(...)`    |
| Validate-Job            | 0x0004 | `validateJob(...)`                      |
| Cancel-Job              | 0x0008 | `cancelJob(...)`                        |
| Get-Job-Attributes      | 0x0009 | `getJobAttributes(...)`                 |
| Get-Jobs                | 0x000A | `listJobs(...)`                         |
| Get-Printer-Attributes  | 0x000B | `getPrinterInfo(...)`                   |

The request/response framing follows RFC 8011 exactly:

```
byte 0-1   : version            (0x01 0x01)
byte 2-3   : operation-id / status-code
byte 4-7   : request-id
byte 8..   : attribute groups
             - delimiter tag (0x01 operation / 0x02 job / 0x04 printer / ...)
             - attributes: value-tag | name-length | name | value-length | value
byte N     : END_OF_ATTRIBUTES (0x03)
byte N+1.. : document data (for Print-Job / Send-Document)
```

### 2.2 Public API

```js
const ipp = require('./printing/ipp-client');

// Discovery (stub unless you inject an mDNS browser)
const disc = await ipp.discoverPrinters({ browser: myMdnsBrowser, timeout: 3000 });
//   => { transport: 'mdns', printers: [{ ip, port, name, ... }] }

// Printer info
const info = await ipp.getPrinterInfo('10.0.0.5');
//   => { name, make, model, makeAndModel, state, supportedFormats,
//        mediaSupported, mediaDefault, sidesSupported, isAcceptingJobs,
//        stateReasons, queuedJobCount, raw }

// Validate before printing
await ipp.validateJob('10.0.0.5', 'invoice-123', {
  paperSize: 'A4', duplex: true, color: false,
});

// Print a PDF buffer (e.g. produced by pdfkit)
const job = await ipp.printPdf('10.0.0.5', pdfBuffer, {
  jobName: 'invoice-123',
  copies:  2,
  duplex:  true,        // false or 'tumble' are also accepted
  color:   false,
  paperSize: 'A4',      // 'A3', 'A4', 'A5', 'LETTER', 'LEGAL', 'TABLOID'
  quality: 'normal',    // 'draft' | 'normal' | 'high'
  orientation: 'portrait',
  user: 'kobi',
});
// => { jobId, jobUri, jobState, jobStateReasons, statusName }

// Print plain text
await ipp.printRawText('10.0.0.5', 'hello world\n', { jobName: 'hi' });

// Active jobs
const jobs = await ipp.listJobs('10.0.0.5', { which: 'not-completed' });

// Cancel
await ipp.cancelJob('10.0.0.5', job.jobId);

// Per-job attributes
const j = await ipp.getJobAttributes('10.0.0.5', job.jobId);
```

### 2.3 Low-level codec

The codec is exposed for advanced users and tests:

```js
ipp.encodeRequest(operation, { requestId, operationAttributes, jobAttributes, data })
ipp.decodeResponse(buffer)
ipp.writeAttribute(tag, name, value)
ipp.flattenGroup(decoded, ipp.TAGS.PRINTER_ATTRIBUTES)
```

All tag / operation constants live in `ipp.TAGS`, `ipp.OPERATIONS`,
`ipp.STATUS_CODES`, `ipp.JOB_STATE`, `ipp.PRINTER_STATE`.

### 2.4 Error model

All client errors throw `IppError`:

```js
try {
  await ipp.printPdf(ip, buf);
} catch (err) {
  if (err instanceof ipp.IppError) {
    console.error(err.code, err.statusName, err.stateReasons);
  }
}
```

Error codes:

| Code                    | When                                                         |
|-------------------------|--------------------------------------------------------------|
| `IPP_PRINTER_OFFLINE`   | `ECONNREFUSED` / `EHOSTUNREACH` / `ENOTFOUND`                |
| `IPP_NETWORK_ERROR`     | Any other network error                                     |
| `IPP_TIMEOUT`           | HTTP timeout or `ETIMEDOUT`                                  |
| `IPP_HTTP_ERROR`        | Printer returned HTTP 4xx/5xx                                |
| `IPP_DECODE_ERROR`      | Malformed IPP response                                       |
| `IPP_OUT_OF_PAPER`      | `media-empty` / `media-empty-error`                          |
| `IPP_OUT_OF_TONER`      | `toner-empty` / `marker-supply-empty*`                       |
| `IPP_PAPER_JAM`         | `media-jam*`                                                 |
| `IPP_COVER_OPEN`        | `cover-open*` / `door-open*`                                 |
| `IPP_OUTPUT_FULL`       | `output-area-full` / `output-tray-missing`                   |
| `IPP_SHUTDOWN`          | `shutdown`                                                   |
| `IPP_STATUS_ERROR`      | Any other non-success IPP status code                        |
| `IPP_BAD_INPUT`         | Caller supplied an invalid argument                          |

A "stuck job" is a job whose state is `processing-stopped` (6) with one of
the critical reasons above. The queue retries it with exponential backoff
unless it exhausts `maxAttempts`.

### 2.5 mDNS discovery

Full Bonjour/mDNS requires a multicast transport we cannot ship zero-deps.
`discoverPrinters()` accepts a pluggable `browser` that exposes the common
`mdns` / `bonjour` surface:

```js
// Example using the `bonjour` package if it's installed elsewhere:
const bonjour = require('bonjour')();
const browser = bonjour.find({ type: 'ipp' });
const { printers } = await ipp.discoverPrinters({ browser, timeout: 3000 });
```

Without a browser, the function returns a stub response that documents the
service types to look for: `_ipp._tcp`, `_ipps._tcp`, `_printer._tcp`,
`_pdl-datastream._tcp`. A caller can still pass a static list of known
printers via `opts.staticList` and treat the result uniformly.

---

## 3. `print-queue.js` — the smart queue

### 3.1 Why a queue?

Printers are the single least reliable peripheral in a retail/office stack.
Anything that calls IPP directly will eventually have to handle:

- The printer being offline at the wrong moment.
- Two services printing to the same device at once.
- Urgent jobs (customer receipts) getting stuck behind long office prints.
- A bad cover-open state that clears on its own a few seconds later.

`PrintQueue` owns this concern end-to-end.

### 3.2 Constructing

```js
const { PrintQueue, print } = require('./printing/print-queue');

const queue = new PrintQueue({
  concurrency: 1,                       // jobs per backend
  maxAttempts: 5,                       // retry ceiling for transient errors
  retryDelayMs: 1000,                   // base retry delay
  retryBackoff: 2,                      // multiplier per attempt
  offlineRescanIntervalMs: 30_000,      // rescan stored-offline jobs
  persistPath: '/var/lib/onyx/queue.json', // optional durable queue
});
```

`print(destination, content, opts)` is a module-level shortcut that uses a
process-wide default queue — handy for scripts, worse for server code where
you should own the instance.

### 3.3 Smart `print(destination, content, opts)`

```js
// 1. Office laser PDF over IPP — the default for anything PDF-shaped
queue.print({ type: 'ipp', ip: '10.0.0.5' }, pdfBuffer, {
  jobName: 'invoice-0001', copies: 1, duplex: true, color: false,
  paperSize: 'A4', priority: 'normal',
});

// 2. Thermal receipt — ESC/POS bytes from thermal-printer.js
queue.print({ type: 'thermal', ip: '10.0.0.20', port: 9100 }, escposBuffer, {
  priority: 'urgent',
});

// 3. Zebra label — ZPL string from zpl-printer.js
queue.print({ type: 'zpl', ip: '10.0.0.30' }, '^XA^FO50,50^A0N,50,50^FDItem^FS^XZ', {
  priority: 'high',
});

// 4. No explicit type — the queue sniffs it:
//    %PDF -> ipp, ^XA -> zpl, 0x1B prefix -> thermal.
queue.print('10.0.0.5', pdfBuffer);
```

Priority labels: `urgent` < `high` < `normal` < `low`. Within the same
priority, jobs run in FIFO order by `createdAt`.

### 3.4 Lifecycle

```
             +-----------+
             |  queued   |
             +-----+-----+
                   |
             _pump v
             +-----+-----+
             |  sending  |
             +-----+-----+
           ok |    |      fail(offline)    fail(transient)    fail(fatal)
              v    v             v                 v                v
          +------+ +------+  +----------+    +-----------+    +--------+
          | done | | done |  | stored_  |--->|  queued   |--->| failed |
          +------+ +------+  | offline  |    +-----------+    +--------+
                             +----------+
                                  ^
                                  |
                        offline rescan every N ms
```

### 3.5 Events

```js
queue.on('enqueued',       (job) => {});
queue.on('sending',        (job) => {});
queue.on('done',           (job) => {});
queue.on('retry',          (job) => {});   // transient failure, will retry
queue.on('stored_offline', (job) => {});   // printer unreachable
queue.on('offline_rescan', (n)   => {});
queue.on('canceled',       (job) => {});
queue.on('failed',         (job) => {});
queue.on('persist_error',  (err) => {});
```

Every emitted job is a *safe snapshot* with a `contentLength` instead of the
raw payload — the binary content is kept internally but never leaked through
events.

### 3.6 Offline / store-and-forward

A job whose first attempt produces `IPP_PRINTER_OFFLINE` / `IPP_TIMEOUT` /
`IPP_HTTP_ERROR` is moved to `stored_offline` and persisted (if `persistPath`
is configured). An interval timer (`offlineRescanIntervalMs`) scans for these
jobs and requeues them. When the printer comes back, the queue drains them
in priority order.

Transient printer conditions (out-of-paper, toner-low, cover-open, jam, output
full) are retried with exponential backoff up to `maxAttempts`. "Job stuck"
(`processing-stopped`) is modeled as a transient condition — the queue
retries the job but does not fight the printer forever.

### 3.7 Persistence

Set `persistPath` to a JSON file. Binary content is stored base64-encoded so
you can restart the process without losing queued work. Only jobs in terminal
states (`done` / `failed` / `canceled`) stay out of the rehydration path; on
reload any `sending` job is reset to `queued`.

> Tip: `queue.clearDone()` trims finished entries — run it on a timer if you
> print a lot.

---

## 4. Integrations

### 4.1 With pdfkit

```js
const PDFDocument = require('pdfkit'); // assuming pdfkit is available
const chunks = [];
const doc = new PDFDocument();
doc.on('data', (c) => chunks.push(c));
doc.on('end', async () => {
  const pdfBuffer = Buffer.concat(chunks);
  queue.print({ type: 'ipp', ip: '10.0.0.5' }, pdfBuffer, {
    jobName: 'invoice',
    paperSize: 'A4',
    contentType: 'application/pdf',
  });
});
doc.text('Hello printer');
doc.end();
```

### 4.2 With `thermal-printer.js`

The queue treats the thermal backend as a black box and forwards:

```js
// thermal-printer.js exposes one of:
//   print(destination, content, opts)
//   printReceipt(destination, content, opts)
//   send(destination, content, opts)
```

The queue finds the first available method by name. If you rename your API,
the queue keeps working as long as the name is one of the three.

### 4.3 With `zpl-printer.js`

Same pattern, with the preferred names `print`, `printZpl`, or `sendLabel`.

---

## 5. Testing

Run the unit suite:

```bash
node src/printing/ipp-client.test.js
```

The suite spins up a **real** `http.Server` on `127.0.0.1` that speaks IPP and
lets you poke it into failure states via `mock.setState({ paper: false })`,
`{ toner: false }`, `{ stuck: true }` or `{ offline: true }`. That gives us
end-to-end coverage of encode + decode + error classification + queue
behavior without any external printer.

Covered scenarios:

- IPP header framing
- Encode/decode round-trip with multi-value attributes
- `getPrinterInfo` / `printPdf` / `printRawText` happy paths
- `validateJob`, `listJobs`, `cancelJob`
- Out-of-paper, out-of-toner surfaced as typed errors
- Offline printer surfaced as `IPP_PRINTER_OFFLINE`
- Queue priority ordering
- Queue store-and-forward offline fallback
- Smart `print()` router type / content inference

---

## 6. Operations notes

- **Default port is 631** (`ipp://`). TLS (`ipps://` on 443) is not
  implemented here — wire a TLS-terminating proxy in front of the printer
  if you need confidentiality; the IPP framing is the same.
- **Path** defaults to `/ipp/print`. Some printers use `/printers/<name>` —
  pass it via `opts.path`.
- **Timeouts** default to 15s; short enough to avoid wedging the queue but
  long enough to survive slow print servers.
- **Concurrency** should stay at `1` unless you've confirmed the printer can
  actually pipeline jobs. Most office devices cannot.
- **Persistence file** is the only thing that survives a restart — keep it
  on a durable disk, not `/tmp`.
- **Secrets**: none required. IPP print jobs are unauthenticated on most
  LANs; lock them down at the network layer.

---

## 7. Roadmap

Items deliberately left out of this initial cut:

- `Create-Job` + `Send-Document` for chunked uploads of very large PDFs
- `ipps://` (IPP over TLS) with cert pinning
- Actual mDNS/SSDP transport (would pull in `dgram` + multicast plumbing)
- Per-tenant quotas + audit logging (belongs in an API layer above the queue)

When you get to any of these, the encoder/decoder and the queue will not
need to change — only the transport and the router have to grow.
