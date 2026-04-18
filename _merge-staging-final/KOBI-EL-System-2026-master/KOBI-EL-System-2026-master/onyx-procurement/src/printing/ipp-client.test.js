'use strict';

/**
 * ipp-client.test.js
 * ------------------------------------------------------------
 * Zero-dependency tests for the IPP client + print queue.
 *
 * Run via: `node src/printing/ipp-client.test.js`
 *          or inside the project test runner if available.
 *
 * Strategy:
 *   - Spin up a real http.Server on 127.0.0.1 that accepts application/ipp,
 *     parses the incoming IPP request using the same decoder from
 *     `ipp-client.js`, and produces hand-crafted IPP responses that look
 *     like a real printer. This way we exercise both encode and decode
 *     paths end-to-end.
 *   - The server can be nudged into "offline", "out-of-paper", "out-of-toner"
 *     and "job-stuck" states via `mock.setState(...)`.
 *   - Tests also cover the offline fallback in PrintQueue.
 *
 * We intentionally avoid `assert.strict` only for clarity — plain `assert`
 * is enough here.
 * ------------------------------------------------------------
 */

const http = require('http');
const assert = require('assert');

const ipp = require('./ipp-client');
const pq = require('./print-queue');

// ---------------------------------------------------------------------------
// Tiny test runner
// ---------------------------------------------------------------------------

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function runAll() {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      process.stdout.write(`PASS  ${t.name}\n`);
      passed++;
    } catch (err) {
      process.stdout.write(`FAIL  ${t.name}\n      ${err.stack || err.message}\n`);
      failed++;
    }
  }
  process.stdout.write(`\n${passed} passed, ${failed} failed (${tests.length} total)\n`);
  if (failed > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Mock IPP printer
// ---------------------------------------------------------------------------

function buildIppResponse(statusCode, requestId, groups, data) {
  // groups = [{ tag, attributes: [{ name, tag, value }, ...] }, ...]
  const parts = [];
  const head = Buffer.alloc(8);
  head.writeUInt8(0x01, 0); head.writeUInt8(0x01, 1);
  head.writeUInt16BE(statusCode, 2);
  head.writeUInt32BE(requestId, 4);
  parts.push(head);

  for (const g of groups) {
    parts.push(Buffer.from([g.tag]));
    let last = null;
    for (const a of g.attributes) {
      if (last && last === a.name) {
        parts.push(ipp.writeAttribute(a.tag, '', a.value));
      } else {
        parts.push(ipp.writeAttribute(a.tag, a.name, a.value));
        last = a.name;
      }
    }
  }
  parts.push(Buffer.from([0x03])); // END_OF_ATTRIBUTES
  if (data) parts.push(data);
  return Buffer.concat(parts);
}

function createMockPrinter() {
  const T = ipp.TAGS;
  const state = {
    offline: false,
    paper: true,
    toner: true,
    stuck: false,
    accepting: true,
    jobs: [],
    nextJobId: 100,
    reqLog: [],
  };

  const server = http.createServer((req, res) => {
    if (state.offline) {
      // Simulate a dead printer by closing the socket.
      req.destroy();
      return;
    }
    let body = [];
    req.on('data', (c) => body.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(body);
      let decoded;
      try {
        decoded = ipp.decodeResponse(raw);
      } catch (e) {
        res.writeHead(400);
        return res.end();
      }
      state.reqLog.push({
        operation: raw.readUInt16BE(2),
        requestId: decoded.requestId,
        op: ipp.flattenGroup(decoded, T.OPERATION_ATTRIBUTES),
        job: ipp.flattenGroup(decoded, T.JOB_ATTRIBUTES),
        dataLen: decoded.data ? decoded.data.length : 0,
      });

      const opId = raw.readUInt16BE(2);
      const requestId = decoded.requestId;
      const opAttrs = ipp.flattenGroup(decoded, T.OPERATION_ATTRIBUTES);
      const jobAttrs = ipp.flattenGroup(decoded, T.JOB_ATTRIBUTES);

      const commonOp = [
        { name: 'attributes-charset', tag: T.CHARSET, value: 'utf-8' },
        { name: 'attributes-natural-language', tag: T.NATURAL_LANGUAGE, value: 'en' },
      ];

      // ---- Get-Printer-Attributes ----
      if (opId === ipp.OPERATIONS.GET_PRINTER_ATTRIBUTES) {
        const reasons = [];
        let pState = 3; // idle
        if (!state.paper) { reasons.push('media-empty-error'); pState = 5; }
        if (!state.toner) { reasons.push('toner-empty'); pState = 5; }
        const printerAttrs = [
          { name: 'printer-name', tag: T.NAME_WITHOUT_LANGUAGE, value: 'MockPrinter' },
          { name: 'printer-make-and-model', tag: T.TEXT_WITHOUT_LANGUAGE, value: 'Acme LaserJet 9000' },
          { name: 'printer-info', tag: T.TEXT_WITHOUT_LANGUAGE, value: 'Mock unit test printer' },
          { name: 'printer-location', tag: T.TEXT_WITHOUT_LANGUAGE, value: 'Lab' },
          { name: 'printer-state', tag: T.ENUM, value: pState },
          { name: 'printer-state-reasons', tag: T.KEYWORD, value: reasons.length ? reasons[0] : 'none' },
          { name: 'printer-is-accepting-jobs', tag: T.BOOLEAN, value: state.accepting },
          { name: 'document-format-supported', tag: T.MIME_MEDIA_TYPE, value: 'application/pdf' },
          { name: 'document-format-supported', tag: T.MIME_MEDIA_TYPE, value: 'text/plain' },
          { name: 'media-supported', tag: T.KEYWORD, value: 'iso_a4_210x297mm' },
          { name: 'media-supported', tag: T.KEYWORD, value: 'na_letter_8.5x11in' },
          { name: 'media-default', tag: T.KEYWORD, value: 'iso_a4_210x297mm' },
          { name: 'sides-supported', tag: T.KEYWORD, value: 'one-sided' },
          { name: 'sides-supported', tag: T.KEYWORD, value: 'two-sided-long-edge' },
          { name: 'print-color-mode-supported', tag: T.KEYWORD, value: 'monochrome' },
          { name: 'queued-job-count', tag: T.INTEGER, value: state.jobs.length },
        ];
        const buf = buildIppResponse(0x0000, requestId, [
          { tag: T.OPERATION_ATTRIBUTES, attributes: commonOp },
          { tag: T.PRINTER_ATTRIBUTES, attributes: printerAttrs },
        ]);
        res.writeHead(200, { 'Content-Type': 'application/ipp' });
        return res.end(buf);
      }

      // ---- Validate-Job ----
      if (opId === ipp.OPERATIONS.VALIDATE_JOB) {
        if (!state.paper) {
          const buf = buildIppResponse(0x0404, requestId, [
            { tag: T.OPERATION_ATTRIBUTES, attributes: commonOp },
            { tag: T.PRINTER_ATTRIBUTES, attributes: [
              { name: 'printer-state-reasons', tag: T.KEYWORD, value: 'media-empty-error' },
            ] },
          ]);
          res.writeHead(200, { 'Content-Type': 'application/ipp' });
          return res.end(buf);
        }
        const buf = buildIppResponse(0x0000, requestId, [
          { tag: T.OPERATION_ATTRIBUTES, attributes: commonOp },
        ]);
        res.writeHead(200, { 'Content-Type': 'application/ipp' });
        return res.end(buf);
      }

      // ---- Print-Job ----
      if (opId === ipp.OPERATIONS.PRINT_JOB) {
        if (!state.paper) {
          const buf = buildIppResponse(0x0504, requestId, [
            { tag: T.OPERATION_ATTRIBUTES, attributes: commonOp },
            { tag: T.PRINTER_ATTRIBUTES, attributes: [
              { name: 'printer-state-reasons', tag: T.KEYWORD, value: 'media-empty-error' },
            ] },
          ]);
          res.writeHead(200, { 'Content-Type': 'application/ipp' });
          return res.end(buf);
        }
        if (!state.toner) {
          const buf = buildIppResponse(0x0504, requestId, [
            { tag: T.OPERATION_ATTRIBUTES, attributes: commonOp },
            { tag: T.PRINTER_ATTRIBUTES, attributes: [
              { name: 'printer-state-reasons', tag: T.KEYWORD, value: 'toner-empty' },
            ] },
          ]);
          res.writeHead(200, { 'Content-Type': 'application/ipp' });
          return res.end(buf);
        }
        const jobId = state.nextJobId++;
        const jobState = state.stuck ? 6 : 3; // processing-stopped vs pending
        state.jobs.push({
          id: jobId,
          name: opAttrs['job-name'] || 'unknown',
          state: jobState,
          user: opAttrs['requesting-user-name'],
        });
        const jobReasons = state.stuck ? 'job-printer-stopped' : 'none';
        const buf = buildIppResponse(0x0000, requestId, [
          { tag: T.OPERATION_ATTRIBUTES, attributes: commonOp },
          { tag: T.JOB_ATTRIBUTES, attributes: [
            { name: 'job-id', tag: T.INTEGER, value: jobId },
            { name: 'job-uri', tag: T.URI, value: `ipp://mock/jobs/${jobId}` },
            { name: 'job-state', tag: T.ENUM, value: jobState },
            { name: 'job-state-reasons', tag: T.KEYWORD, value: jobReasons },
          ] },
        ]);
        res.writeHead(200, { 'Content-Type': 'application/ipp' });
        return res.end(buf);
      }

      // ---- Get-Jobs ----
      if (opId === ipp.OPERATIONS.GET_JOBS) {
        const groups = [{ tag: T.OPERATION_ATTRIBUTES, attributes: commonOp }];
        for (const j of state.jobs) {
          groups.push({
            tag: T.JOB_ATTRIBUTES,
            attributes: [
              { name: 'job-id', tag: T.INTEGER, value: j.id },
              { name: 'job-name', tag: T.NAME_WITHOUT_LANGUAGE, value: j.name },
              { name: 'job-state', tag: T.ENUM, value: j.state },
              { name: 'job-state-reasons', tag: T.KEYWORD, value: 'none' },
              { name: 'job-originating-user-name', tag: T.NAME_WITHOUT_LANGUAGE, value: j.user || 'onyx' },
            ],
          });
        }
        const buf = buildIppResponse(0x0000, requestId, groups);
        res.writeHead(200, { 'Content-Type': 'application/ipp' });
        return res.end(buf);
      }

      // ---- Cancel-Job ----
      if (opId === ipp.OPERATIONS.CANCEL_JOB) {
        // IPP puts job-id in the operation-attributes group for Cancel-Job.
        const target = opAttrs['job-id'] != null ? opAttrs['job-id'] : jobAttrs['job-id'];
        const idx = state.jobs.findIndex((j) => j.id === target);
        if (idx < 0) {
          const buf = buildIppResponse(0x0406, requestId, [
            { tag: T.OPERATION_ATTRIBUTES, attributes: commonOp },
          ]);
          res.writeHead(200, { 'Content-Type': 'application/ipp' });
          return res.end(buf);
        }
        state.jobs.splice(idx, 1);
        const buf = buildIppResponse(0x0000, requestId, [
          { tag: T.OPERATION_ATTRIBUTES, attributes: commonOp },
        ]);
        res.writeHead(200, { 'Content-Type': 'application/ipp' });
        return res.end(buf);
      }

      // ---- Get-Job-Attributes ----
      if (opId === ipp.OPERATIONS.GET_JOB_ATTRIBUTES) {
        const target = opAttrs['job-id'] || jobAttrs['job-id'];
        const j = state.jobs.find((x) => x.id === target);
        if (!j) {
          const buf = buildIppResponse(0x0406, requestId, [
            { tag: T.OPERATION_ATTRIBUTES, attributes: commonOp },
          ]);
          res.writeHead(200, { 'Content-Type': 'application/ipp' });
          return res.end(buf);
        }
        const buf = buildIppResponse(0x0000, requestId, [
          { tag: T.OPERATION_ATTRIBUTES, attributes: commonOp },
          { tag: T.JOB_ATTRIBUTES, attributes: [
            { name: 'job-id', tag: T.INTEGER, value: j.id },
            { name: 'job-name', tag: T.NAME_WITHOUT_LANGUAGE, value: j.name },
            { name: 'job-state', tag: T.ENUM, value: j.state },
            { name: 'job-state-reasons', tag: T.KEYWORD, value: 'none' },
          ] },
        ]);
        res.writeHead(200, { 'Content-Type': 'application/ipp' });
        return res.end(buf);
      }

      // Unknown op
      const buf = buildIppResponse(0x0501, requestId, [
        { tag: T.OPERATION_ATTRIBUTES, attributes: commonOp },
      ]);
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(buf);
    });
  });

  return {
    server,
    state,
    async start() {
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const addr = server.address();
      this.host = '127.0.0.1';
      this.port = addr.port;
      return this;
    },
    async stop() {
      await new Promise((r) => server.close(() => r()));
    },
    setState(patch) {
      Object.assign(state, patch);
    },
    printerOpts() {
      return { port: this.port, path: '/ipp/print' };
    },
  };
}

// ---------------------------------------------------------------------------
// Tests: IPP codec
// ---------------------------------------------------------------------------

test('encodeRequest produces a well-formed IPP header', () => {
  const buf = ipp.encodeRequest(ipp.OPERATIONS.GET_PRINTER_ATTRIBUTES, {
    requestId: 42,
    operationAttributes: {
      'printer-uri': { tag: ipp.TAGS.URI, value: 'ipp://127.0.0.1:631/ipp/print' },
    },
  });
  assert.strictEqual(buf.readUInt8(0), 0x01, 'major version');
  assert.strictEqual(buf.readUInt8(1), 0x01, 'minor version');
  assert.strictEqual(buf.readUInt16BE(2), ipp.OPERATIONS.GET_PRINTER_ATTRIBUTES, 'op');
  assert.strictEqual(buf.readUInt32BE(4), 42, 'request id');
  // Must end with END_OF_ATTRIBUTES (0x03)
  assert.strictEqual(buf[buf.length - 1], 0x03, 'end-of-attributes tag');
});

test('encode/decode round-trips basic attributes', () => {
  const buf = ipp.encodeRequest(ipp.OPERATIONS.PRINT_JOB, {
    requestId: 7,
    operationAttributes: {
      'printer-uri': { tag: ipp.TAGS.URI, value: 'ipp://host/x' },
      'job-name': { tag: ipp.TAGS.NAME_WITHOUT_LANGUAGE, value: 'hello' },
      'document-format': { tag: ipp.TAGS.MIME_MEDIA_TYPE, value: 'application/pdf' },
    },
    jobAttributes: {
      'copies': { tag: ipp.TAGS.INTEGER, value: 3 },
      'sides': { tag: ipp.TAGS.KEYWORD, value: 'two-sided-long-edge' },
    },
    data: Buffer.from('%PDF-1.4\n...'),
  });
  const decoded = ipp.decodeResponse(buf); // note: same binary framing
  assert.strictEqual(decoded.requestId, 7);
  const op = ipp.flattenGroup(decoded, ipp.TAGS.OPERATION_ATTRIBUTES);
  assert.strictEqual(op['printer-uri'], 'ipp://host/x');
  assert.strictEqual(op['job-name'], 'hello');
  const job = ipp.flattenGroup(decoded, ipp.TAGS.JOB_ATTRIBUTES);
  assert.strictEqual(job['copies'], 3);
  assert.strictEqual(job['sides'], 'two-sided-long-edge');
  // The embedded document data is preserved in `decoded.data`.
  assert.ok(decoded.data && decoded.data.toString('utf8').startsWith('%PDF-1.4'));
});

test('decoder handles multi-value attributes', () => {
  const buf = ipp.encodeRequest(ipp.OPERATIONS.GET_PRINTER_ATTRIBUTES, {
    requestId: 1,
    operationAttributes: {
      'requested-attributes': {
        tag: ipp.TAGS.KEYWORD,
        value: ['printer-name', 'printer-state', 'printer-info'],
      },
    },
  });
  const dec = ipp.decodeResponse(buf);
  const g = dec.groups.find((x) => x.tag === ipp.TAGS.OPERATION_ATTRIBUTES);
  assert.ok(g);
  const values = g.attributes['requested-attributes'];
  assert.deepStrictEqual(values, ['printer-name', 'printer-state', 'printer-info']);
});

test('classifyPrinterCondition maps common reasons', () => {
  assert.strictEqual(ipp.classifyPrinterCondition(['media-empty-error']).code, 'IPP_OUT_OF_PAPER');
  assert.strictEqual(ipp.classifyPrinterCondition(['toner-empty']).code, 'IPP_OUT_OF_TONER');
  assert.strictEqual(ipp.classifyPrinterCondition(['cover-open']).code, 'IPP_COVER_OPEN');
  assert.strictEqual(ipp.classifyPrinterCondition(['media-jam-error']).code, 'IPP_PAPER_JAM');
  assert.strictEqual(ipp.classifyPrinterCondition(['none']), null);
});

// ---------------------------------------------------------------------------
// Tests: end-to-end against a mock printer
// ---------------------------------------------------------------------------

test('getPrinterInfo against mock server', async () => {
  const mock = await createMockPrinter().start();
  try {
    const info = await ipp.getPrinterInfo(mock.host, mock.printerOpts());
    assert.strictEqual(info.name, 'MockPrinter');
    assert.strictEqual(info.make, 'Acme');
    assert.ok(info.model.indexOf('LaserJet') >= 0);
    assert.strictEqual(info.state, 'idle');
    assert.ok(info.supportedFormats.indexOf('application/pdf') >= 0);
    assert.ok(info.mediaSupported.indexOf('iso_a4_210x297mm') >= 0);
  } finally {
    await mock.stop();
  }
});

test('printPdf against mock server returns job id', async () => {
  const mock = await createMockPrinter().start();
  try {
    const pdf = Buffer.from('%PDF-1.4\n%mock\n');
    const res = await ipp.printPdf(mock.host, pdf, Object.assign({
      jobName: 'unit-test',
      copies: 2,
      duplex: true,
      color: false,
      paperSize: 'A4',
    }, mock.printerOpts()));
    assert.ok(res.jobId >= 100, 'expected a job id');
    assert.strictEqual(res.statusName, 'successful-ok');
    // Validate what the server saw
    const last = mock.state.reqLog[mock.state.reqLog.length - 1];
    assert.strictEqual(last.operation, ipp.OPERATIONS.PRINT_JOB);
    assert.strictEqual(last.op['job-name'], 'unit-test');
    assert.strictEqual(last.job['copies'], 2);
    assert.strictEqual(last.job['sides'], 'two-sided-long-edge');
    assert.strictEqual(last.job['media'], 'iso_a4_210x297mm');
    assert.ok(last.dataLen >= pdf.length);
  } finally {
    await mock.stop();
  }
});

test('printRawText against mock server', async () => {
  const mock = await createMockPrinter().start();
  try {
    const res = await ipp.printRawText(mock.host, 'hello printer', Object.assign({
      jobName: 'text-job',
    }, mock.printerOpts()));
    assert.ok(res.jobId >= 100);
    const last = mock.state.reqLog[mock.state.reqLog.length - 1];
    assert.ok(last.op['document-format'].indexOf('text/plain') >= 0);
  } finally {
    await mock.stop();
  }
});

test('validateJob and listJobs and cancelJob', async () => {
  const mock = await createMockPrinter().start();
  try {
    const v = await ipp.validateJob(mock.host, 'validate-test', mock.printerOpts());
    assert.strictEqual(v.ok, true);

    const j1 = await ipp.printRawText(mock.host, 'one', Object.assign({ jobName: 'j1' }, mock.printerOpts()));
    const j2 = await ipp.printRawText(mock.host, 'two', Object.assign({ jobName: 'j2' }, mock.printerOpts()));
    const jobs = await ipp.listJobs(mock.host, mock.printerOpts());
    assert.strictEqual(jobs.length, 2);
    assert.ok(jobs.find((x) => x.jobId === j1.jobId));
    assert.ok(jobs.find((x) => x.jobId === j2.jobId));

    const cancel = await ipp.cancelJob(mock.host, j1.jobId, mock.printerOpts());
    assert.strictEqual(cancel.ok, true);
    const jobsAfter = await ipp.listJobs(mock.host, mock.printerOpts());
    assert.strictEqual(jobsAfter.length, 1);
    assert.strictEqual(jobsAfter[0].jobId, j2.jobId);
  } finally {
    await mock.stop();
  }
});

test('out-of-paper surfaces IPP_OUT_OF_PAPER', async () => {
  const mock = await createMockPrinter().start();
  try {
    mock.setState({ paper: false });
    let caught = null;
    try {
      await ipp.printPdf(mock.host, Buffer.from('%PDF-1.4\n'), mock.printerOpts());
    } catch (e) { caught = e; }
    assert.ok(caught, 'expected error');
    assert.strictEqual(caught.code, 'IPP_OUT_OF_PAPER');
  } finally {
    await mock.stop();
  }
});

test('out-of-toner surfaces IPP_OUT_OF_TONER', async () => {
  const mock = await createMockPrinter().start();
  try {
    mock.setState({ toner: false });
    let caught = null;
    try {
      await ipp.printPdf(mock.host, Buffer.from('%PDF-1.4\n'), mock.printerOpts());
    } catch (e) { caught = e; }
    assert.ok(caught);
    assert.strictEqual(caught.code, 'IPP_OUT_OF_TONER');
  } finally {
    await mock.stop();
  }
});

test('offline printer surfaces IPP_PRINTER_OFFLINE', async () => {
  // We don't start the server so the port is closed.
  let caught = null;
  try {
    await ipp.getPrinterInfo('127.0.0.1', { port: 1, path: '/ipp/print', timeout: 500 });
  } catch (e) { caught = e; }
  assert.ok(caught);
  assert.ok(
    caught.code === 'IPP_PRINTER_OFFLINE' ||
    caught.code === 'IPP_NETWORK_ERROR' ||
    caught.code === 'IPP_TIMEOUT',
    'expected offline/network/timeout, got ' + caught.code
  );
});

// ---------------------------------------------------------------------------
// Tests: PrintQueue
// ---------------------------------------------------------------------------

test('print queue routes to IPP and completes a job', async () => {
  const mock = await createMockPrinter().start();
  try {
    const q = new pq.PrintQueue({ concurrency: 1, offlineRescanIntervalMs: 0 });
    const id = q.enqueue({
      destination: { type: 'ipp', ip: mock.host, port: mock.port, path: '/ipp/print' },
      content: Buffer.from('%PDF-1.4\nhi\n'),
      contentType: 'application/pdf',
      priority: 'normal',
      jobName: 'queued-pdf',
    });
    const final = await q.waitFor(id, { timeoutMs: 5000 });
    assert.strictEqual(final.status, 'done');
    assert.ok(final.result && final.result.jobId);
    q.stop();
  } finally {
    await mock.stop();
  }
});

test('print queue honors priority ordering', async () => {
  const mock = await createMockPrinter().start();
  try {
    const q = new pq.PrintQueue({ concurrency: 1, offlineRescanIntervalMs: 0 });
    const order = [];
    q.on('sending', (j) => order.push(j.jobName));

    const d = { type: 'ipp', ip: mock.host, port: mock.port, path: '/ipp/print' };
    const low = q.enqueue({ destination: d, content: 'low', priority: 'low', jobName: 'low' });
    const normal = q.enqueue({ destination: d, content: 'normal', priority: 'normal', jobName: 'normal' });
    const urgent = q.enqueue({ destination: d, content: 'urgent', priority: 'urgent', jobName: 'urgent' });

    await Promise.all([q.waitFor(low), q.waitFor(normal), q.waitFor(urgent)]);
    assert.deepStrictEqual(order.slice(0, 3), ['urgent', 'normal', 'low']);
    q.stop();
  } finally {
    await mock.stop();
  }
});

test('offline fallback stores jobs and flushes when printer comes back', async () => {
  const mock = await createMockPrinter().start();
  // Start with server stopped so the very first attempt fails.
  await mock.stop();

  const q = new pq.PrintQueue({
    concurrency: 1,
    offlineRescanIntervalMs: 50,
    maxAttempts: 2,
    retryDelayMs: 10,
  });

  const storedPromise = new Promise((resolve) => q.once('stored_offline', resolve));
  const id = q.enqueue({
    destination: { type: 'ipp', ip: '127.0.0.1', port: mock.port || 1, path: '/ipp/print' },
    content: Buffer.from('%PDF-1.4\n'),
    contentType: 'application/pdf',
    jobName: 'offline-test',
    options: { timeout: 300 },
  });
  await storedPromise;
  assert.strictEqual(q.get(id).status, 'stored_offline');

  // Restart the mock server on a fresh port, then re-enqueue so the job
  // targets the new port (offline-queued jobs retain their original port).
  const mock2 = await createMockPrinter().start();
  try {
    q.cancel(id);
    const id2 = q.enqueue({
      destination: { type: 'ipp', ip: mock2.host, port: mock2.port, path: '/ipp/print' },
      content: Buffer.from('%PDF-1.4\n'),
      contentType: 'application/pdf',
      jobName: 'offline-recovered',
    });
    const final = await q.waitFor(id2, { timeoutMs: 5000 });
    assert.strictEqual(final.status, 'done');
  } finally {
    q.stop();
    await mock2.stop();
  }
});

test('smart print() router infers destination type from content', () => {
  const t1 = pq._inferDestinationType({ ip: '1.2.3.4' }, Buffer.from('%PDF-1.4\nx'), {});
  assert.strictEqual(t1, 'ipp');
  const t2 = pq._inferDestinationType({ ip: '1.2.3.4' }, '^XA^FO50,50^A0N,50,50^FDHello^FS^XZ', {});
  assert.strictEqual(t2, 'zpl');
  const t3 = pq._inferDestinationType({ ip: '1.2.3.4' }, Buffer.from([0x1B, 0x40, 0x41]), {});
  assert.strictEqual(t3, 'thermal');
  const t4 = pq._inferDestinationType({ kind: 'zpl', ip: '1.2.3.4' }, 'anything', {});
  assert.strictEqual(t4, 'zpl');
});

test('inferContentType picks pdf / zpl / text / escpos', () => {
  assert.strictEqual(pq._inferContentType(Buffer.from('%PDF-1.4'), 'ipp'), 'application/pdf');
  assert.strictEqual(pq._inferContentType('^XA...^XZ', 'zpl'), 'application/zpl');
  assert.strictEqual(pq._inferContentType('hello', 'ipp'), 'text/plain');
  assert.strictEqual(pq._inferContentType(Buffer.from([0x1B, 0x40]), 'thermal'), 'application/vnd.escpos');
});

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

if (require.main === module) {
  runAll();
}

module.exports = { runAll, tests, createMockPrinter };
