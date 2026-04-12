/**
 * OCR Pipeline Orchestration — צינור OCR פלורליסטי
 * Wave Y — Agent Y111 — 2026-04-11
 * Project: Techno-Kol Uzi mega-ERP (Kobi EL 2026)
 * Rule:   לא מוחקים רק משדרגים ומגדלים (never delete, only upgrade and grow)
 *
 * Pluggable OCR backend orchestrator. The pipeline knows nothing about
 * tesseract / Google Vision / Azure Document Intelligence / AWS Textract —
 * it just knows how to:
 *
 *   1. Register backends with priority and language coverage.
 *   2. Route a document to the best available backend based on hints.
 *   3. Fall through an ordered fallback list on failure or low confidence.
 *   4. Reject results below a configurable confidence threshold.
 *   5. Run document-type-specific post-processing on the raw text.
 *   6. Extract structured fields via a declarative schema.
 *   7. Analyze layout zones, extract tables, detect handwriting.
 *   8. Redact sensitive data (IDs, credit cards, IBAN) before storage.
 *   9. Batch-process files in parallel with a rate limit.
 *  10. Run sanity checks against expected fields.
 *  11. Normalize Hebrew text (niqqud strip, final letter folding).
 *
 * ─────────────────────────────────────────────────────────────────
 *  ZERO-DEP CORE
 * ─────────────────────────────────────────────────────────────────
 * The pipeline is plain JavaScript — no tesseract.js, no SDKs. Every
 * external backend is provided by the caller as a function with the
 * shape `async (file, ctx) => result`. We never import a vendor SDK
 * here. The caller wires the real clients in `server.js` (or similar)
 * and passes them as `config.transport` when calling `addBackend`.
 *
 *     pipeline.addBackend({
 *       name: 'google',
 *       type: 'google',
 *       priority: 10,
 *       languages: ['heb', 'eng'],
 *       config: { transport: myGoogleVisionClient },
 *     });
 *
 * ─────────────────────────────────────────────────────────────────
 *  SUPPORTED BACKEND TYPES
 * ─────────────────────────────────────────────────────────────────
 *   tesseract  — local, zero-cost, slower; best for crisp scans
 *   azure      — Azure Document Intelligence, great for forms & tables
 *   google     — Google Cloud Vision, best overall Hebrew accuracy
 *   aws        — AWS Textract, strong tables + signature detection
 *   custom     — caller-supplied function, used for tests and BYO
 *
 * ─────────────────────────────────────────────────────────────────
 *  HEBREW OCR NOTES
 * ─────────────────────────────────────────────────────────────────
 *   - Hebrew is RTL; mixed LTR numbers and English words flip order.
 *   - Niqqud (ניקוד) must be stripped to let regex anchors match.
 *   - Final letters (ם ן ץ ף ך) should fold to the normal form for
 *     fuzzy matching, but kept as-is for display.
 *   - Teudat zehut (ת.ז) and company id (ח"פ) are both 9 digits.
 *   - Currency ₪ = \u20AA. Accept ₪ / NIS / ש"ח / ILS.
 *   - VAT rate is 18 % from 2025-01-01, 17 % before.
 *
 * ─────────────────────────────────────────────────────────────────
 *  PUBLIC API
 * ─────────────────────────────────────────────────────────────────
 *   const pipeline = new OCRPipeline({ clock, rng });
 *   pipeline.addBackend({ name, type, config, languages, priority });
 *   pipeline.fallbackOrder({ primary, secondary, tertiary });
 *   pipeline.confidenceThreshold({ min });
 *   await pipeline.processDocument({ file, hints });
 *   pipeline.postProcessing({ text, type });
 *   pipeline.structuredExtract({ text, schema });
 *   await pipeline.layoutAnalysis(file);
 *   await pipeline.tableExtraction(file);
 *   await pipeline.handwritingDetect(file);
 *   pipeline.sensitiveRedact({ text, patterns });
 *   await pipeline.batchProcess(files);
 *   pipeline.qualityCheck({ result });
 *   pipeline.hebrewNormalize(text);
 */

'use strict';

// ════════════════════════════════════════════════════════════════
//  1. Constants
// ════════════════════════════════════════════════════════════════

const SUPPORTED_BACKEND_TYPES = Object.freeze([
  'tesseract',
  'azure',
  'google',
  'aws',
  'custom',
]);

const SUPPORTED_DOC_TYPES = Object.freeze([
  'invoice',
  'receipt',
  'id-card',
  'teudat-zehut',
  'rishiyon-esek',
  'mill-cert',
  'general',
]);

const SUPPORTED_LANGUAGES = Object.freeze([
  'heb',
  'eng',
  'auto',
]);

const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;
const DEFAULT_BATCH_CONCURRENCY = 4;
const DEFAULT_BACKEND_TIMEOUT_MS = 30_000;

// Hebrew niqqud (vowel marks) — U+0591 .. U+05C7 inclusive.
const HEBREW_NIQQUD_RE = /[\u0591-\u05C7]/g;

// Final letters and their normal form counterparts.
const HEBREW_FINAL_LETTERS = Object.freeze({
  'ך': 'כ',
  'ם': 'מ',
  'ן': 'נ',
  'ף': 'פ',
  'ץ': 'צ',
});

// Bidi control characters we strip as noise.
const BIDI_CONTROL_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

// Redaction patterns (keyed by slug).
const DEFAULT_REDACT_PATTERNS = Object.freeze({
  // Israeli teudat-zehut / company-id: 9 digits, optionally 3-3-3 or 5-4 grouped.
  'israeli-id': /\b\d{9}\b|\b\d{3}[- ]\d{3}[- ]\d{3}\b|\b\d{5}[- ]\d{4}\b/g,
  // Credit card: 13-19 digits, optionally grouped by spaces or dashes.
  'credit-card': /\b(?:\d[ -]?){13,19}\b/g,
  // Israeli bank IBAN.
  'iban-il': /\bIL\d{2}[A-Z0-9]{19}\b/gi,
  // Generic email.
  'email': /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  // Israeli phone (mobile + landline, with or without country code).
  'il-phone': /\b(?:\+?972[- ]?|0)(?:[23489]|5\d|7[2-9])[- ]?\d{3}[- ]?\d{4}\b/g,
});


// ════════════════════════════════════════════════════════════════
//  2. Errors
// ════════════════════════════════════════════════════════════════

class OCRPipelineError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'OCRPipelineError';
    this.code = code;
    this.meta = meta;
  }
}


// ════════════════════════════════════════════════════════════════
//  3. Hebrew helpers (pure, stateless)
// ════════════════════════════════════════════════════════════════

/**
 * Strip niqqud, bidi controls and normalise final letters.
 * Leaves ASCII, digits and spaces intact.
 * @param {string} text
 * @returns {string}
 */
function hebrewNormalize(text) {
  if (text == null) return '';
  const s = String(text);
  // 1. NFC so composed niqqud sits on its base letter.
  const nfc = s.normalize('NFC');
  // 2. Strip niqqud.
  const stripped = nfc.replace(HEBREW_NIQQUD_RE, '');
  // 3. Strip bidi marks.
  const noBidi = stripped.replace(BIDI_CONTROL_RE, '');
  // 4. Fold final letters.
  let out = '';
  for (const ch of noBidi) {
    out += HEBREW_FINAL_LETTERS[ch] || ch;
  }
  // 5. Collapse runs of whitespace but keep newlines.
  return out.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}


// ════════════════════════════════════════════════════════════════
//  4. OCRPipeline — the orchestrator
// ════════════════════════════════════════════════════════════════

class OCRPipeline {
  /**
   * @param {object} [options]
   * @param {() => Date} [options.clock] injected for deterministic tests
   * @param {{random: () => number}} [options.rng] injected randomness
   * @param {number} [options.confidenceMin]
   * @param {number} [options.concurrency]
   * @param {number} [options.backendTimeoutMs]
   */
  constructor(options = {}) {
    this._clock = typeof options.clock === 'function' ? options.clock : () => new Date();
    this._rng = options.rng && typeof options.rng.random === 'function'
      ? options.rng
      : { random: Math.random };
    this._backends = new Map();            // name -> backend descriptor
    this._fallbackOrder = [];              // ordered array of backend names
    this._confidenceMin = typeof options.confidenceMin === 'number'
      ? options.confidenceMin
      : DEFAULT_CONFIDENCE_THRESHOLD;
    this._concurrency = typeof options.concurrency === 'number' && options.concurrency > 0
      ? options.concurrency
      : DEFAULT_BATCH_CONCURRENCY;
    this._backendTimeoutMs = typeof options.backendTimeoutMs === 'number' && options.backendTimeoutMs > 0
      ? options.backendTimeoutMs
      : DEFAULT_BACKEND_TIMEOUT_MS;
    this._metrics = {
      total_calls: 0,
      successes: 0,
      failures: 0,
      fallback_hops: 0,
      low_confidence_rejections: 0,
      per_backend: Object.create(null),
    };
  }

  // ──────────────────────────────────────────────────────────────
  //  4.1  Backend registration
  // ──────────────────────────────────────────────────────────────

  /**
   * Register a pluggable backend.
   * @param {object} spec
   * @param {string} spec.name         unique handle
   * @param {('tesseract'|'azure'|'google'|'aws'|'custom')} spec.type
   * @param {object} [spec.config]     arbitrary; must include `transport` for mocks
   * @param {string[]} [spec.languages] e.g. ['heb','eng']
   * @param {number} [spec.priority]    higher wins; default 0
   */
  addBackend(spec = {}) {
    const { name, type, config = {}, languages = ['eng'], priority = 0 } = spec;
    if (!name || typeof name !== 'string') {
      throw new OCRPipelineError('OCR_BACKEND_NAME_REQUIRED', 'addBackend: name is required');
    }
    if (!SUPPORTED_BACKEND_TYPES.includes(type)) {
      throw new OCRPipelineError(
        'OCR_BACKEND_TYPE_UNSUPPORTED',
        `addBackend: type "${type}" is not supported`,
        { supported: SUPPORTED_BACKEND_TYPES.slice() },
      );
    }
    if (!Array.isArray(languages) || languages.length === 0) {
      throw new OCRPipelineError('OCR_BACKEND_LANG_REQUIRED', 'addBackend: languages must be a non-empty array');
    }
    for (const lang of languages) {
      if (!SUPPORTED_LANGUAGES.includes(lang)) {
        throw new OCRPipelineError(
          'OCR_LANGUAGE_UNSUPPORTED',
          `addBackend: language "${lang}" is not supported`,
          { supported: SUPPORTED_LANGUAGES.slice() },
        );
      }
    }
    if (typeof priority !== 'number' || Number.isNaN(priority)) {
      throw new OCRPipelineError('OCR_BACKEND_PRIORITY_INVALID', 'addBackend: priority must be a number');
    }

    // `transport` is the mockable seam: a function `async (file, ctx) => result`.
    // When absent on a non-custom backend we refuse to run — the caller must
    // wire a real SDK or a mock before processDocument is called.
    const transport = config && typeof config.transport === 'function'
      ? config.transport
      : null;

    this._backends.set(name, {
      name,
      type,
      config,
      languages: languages.slice(),
      priority,
      transport,
      enabled: true,
    });
    this._metrics.per_backend[name] = {
      calls: 0,
      successes: 0,
      failures: 0,
      total_latency_ms: 0,
    };
    return this;
  }

  /** List registered backends sorted by priority (desc). */
  listBackends() {
    return Array.from(this._backends.values())
      .sort((a, b) => b.priority - a.priority)
      .map(({ transport, config, ...rest }) => ({ ...rest }));
  }

  /**
   * Configure ordered fallback: primary → secondary → tertiary.
   * Unknown names are rejected.
   */
  fallbackOrder({ primary, secondary, tertiary } = {}) {
    const order = [primary, secondary, tertiary].filter((n) => !!n);
    for (const name of order) {
      if (!this._backends.has(name)) {
        throw new OCRPipelineError(
          'OCR_BACKEND_NOT_REGISTERED',
          `fallbackOrder: backend "${name}" is not registered`,
        );
      }
    }
    this._fallbackOrder = order;
    return this;
  }

  /**
   * Set the minimum acceptable confidence. Results below this are
   * treated as a failure and trigger fallback.
   */
  confidenceThreshold({ min } = {}) {
    if (typeof min !== 'number' || Number.isNaN(min) || min < 0 || min > 1) {
      throw new OCRPipelineError(
        'OCR_CONFIDENCE_INVALID',
        'confidenceThreshold: min must be a number in [0,1]',
      );
    }
    this._confidenceMin = min;
    return this;
  }

  // ──────────────────────────────────────────────────────────────
  //  4.2  Routing
  // ──────────────────────────────────────────────────────────────

  /**
   * Pick the execution order for a document given hints.
   *
   * Rules:
   *   1. If an explicit fallbackOrder is set, use it verbatim.
   *   2. Otherwise:
   *      a. Keep only backends that cover the requested language
   *         (or 'auto'/'eng' if not specified).
   *      b. Sort by priority DESC then name ASC for determinism.
   *   3. Disabled backends are skipped.
   */
  _planRoute(hints = {}) {
    const lang = hints && hints.language ? hints.language : 'auto';
    let candidates;
    if (this._fallbackOrder.length > 0) {
      candidates = this._fallbackOrder
        .map((name) => this._backends.get(name))
        .filter((b) => b && b.enabled);
    } else {
      candidates = Array.from(this._backends.values())
        .filter((b) => b.enabled)
        .filter((b) => {
          if (lang === 'auto') return true;
          return b.languages.includes(lang) || b.languages.includes('auto');
        })
        .sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          return a.name.localeCompare(b.name);
        });
    }
    return candidates;
  }

  // ──────────────────────────────────────────────────────────────
  //  4.3  Backend invocation with timeout
  // ──────────────────────────────────────────────────────────────

  async _invokeBackend(backend, file, ctx) {
    if (!backend.transport) {
      throw new OCRPipelineError(
        'OCR_BACKEND_TRANSPORT_MISSING',
        `backend "${backend.name}" has no transport; inject config.transport`,
      );
    }
    const started = Date.now();
    this._metrics.per_backend[backend.name].calls += 1;
    this._metrics.total_calls += 1;

    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new OCRPipelineError(
          'OCR_BACKEND_TIMEOUT',
          `backend "${backend.name}" exceeded ${this._backendTimeoutMs}ms`,
        ));
      }, this._backendTimeoutMs);
    });

    try {
      const result = await Promise.race([
        Promise.resolve().then(() => backend.transport(file, ctx)),
        timeoutPromise,
      ]);
      this._metrics.per_backend[backend.name].successes += 1;
      this._metrics.per_backend[backend.name].total_latency_ms += Date.now() - started;
      return this._normalizeBackendResult(result, backend);
    } catch (err) {
      this._metrics.per_backend[backend.name].failures += 1;
      this._metrics.per_backend[backend.name].total_latency_ms += Date.now() - started;
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Normalise the wire-format from any backend into a common shape:
   *   { text, confidence, language, backend, raw }
   */
  _normalizeBackendResult(result, backend) {
    if (result == null || typeof result !== 'object') {
      throw new OCRPipelineError(
        'OCR_BACKEND_RESULT_INVALID',
        `backend "${backend.name}" returned non-object result`,
      );
    }
    const text = typeof result.text === 'string' ? result.text : '';
    let confidence;
    if (typeof result.confidence === 'number') {
      // Accept 0..1 or 0..100.
      confidence = result.confidence > 1 ? result.confidence / 100 : result.confidence;
    } else {
      confidence = 0;
    }
    if (confidence < 0) confidence = 0;
    if (confidence > 1) confidence = 1;
    return {
      text,
      confidence,
      language: result.language || null,
      backend: backend.name,
      raw: result,
    };
  }

  // ──────────────────────────────────────────────────────────────
  //  4.4  processDocument — the main entrypoint
  // ──────────────────────────────────────────────────────────────

  /**
   * Run a file through the pipeline.
   * @param {object} args
   * @param {any} args.file — raw bytes / path / stream; passed through to backend
   * @param {object} [args.hints]
   * @param {('heb'|'eng'|'auto')} [args.hints.language]
   * @param {string} [args.hints.docType]
   * @param {number} [args.hints.dpi]
   */
  async processDocument({ file, hints = {} } = {}) {
    if (file == null) {
      throw new OCRPipelineError('OCR_FILE_REQUIRED', 'processDocument: file is required');
    }
    if (hints && hints.language && !SUPPORTED_LANGUAGES.includes(hints.language)) {
      throw new OCRPipelineError(
        'OCR_LANGUAGE_UNSUPPORTED',
        `processDocument: language "${hints.language}" is not supported`,
      );
    }
    if (hints && hints.docType && !SUPPORTED_DOC_TYPES.includes(hints.docType)) {
      throw new OCRPipelineError(
        'OCR_DOC_TYPE_UNSUPPORTED',
        `processDocument: docType "${hints.docType}" is not supported`,
      );
    }

    const route = this._planRoute(hints);
    if (route.length === 0) {
      throw new OCRPipelineError(
        'OCR_NO_BACKEND_AVAILABLE',
        'processDocument: no registered backend matches the requested language',
        { hints },
      );
    }

    const ctx = {
      hints: { language: 'auto', ...hints },
      clock: this._clock,
      rng: this._rng,
    };

    const attempts = [];
    let lastError = null;
    for (let i = 0; i < route.length; i += 1) {
      const backend = route[i];
      if (i > 0) this._metrics.fallback_hops += 1;
      const attempt = {
        backend: backend.name,
        started_at: this._clock().toISOString(),
        ok: false,
        confidence: null,
        error: null,
      };
      try {
        const result = await this._invokeBackend(backend, file, ctx);
        attempt.ok = true;
        attempt.confidence = result.confidence;
        attempts.push(attempt);
        if (result.confidence < this._confidenceMin) {
          this._metrics.low_confidence_rejections += 1;
          lastError = new OCRPipelineError(
            'OCR_CONFIDENCE_TOO_LOW',
            `backend "${backend.name}" returned confidence ${result.confidence.toFixed(3)} < threshold ${this._confidenceMin}`,
            { backend: backend.name, confidence: result.confidence, threshold: this._confidenceMin },
          );
          continue;
        }
        this._metrics.successes += 1;
        // Post-process + normalise.
        const normalized = hebrewNormalize(result.text);
        const docType = hints.docType || 'general';
        const cleaned = this.postProcessing({ text: normalized, type: docType });
        return {
          ok: true,
          backend: backend.name,
          confidence: result.confidence,
          text: cleaned,
          raw_text: result.text,
          language: result.language,
          doc_type: docType,
          attempts,
          processed_at: this._clock().toISOString(),
        };
      } catch (err) {
        attempt.ok = false;
        attempt.error = err instanceof OCRPipelineError
          ? { code: err.code, message: err.message }
          : { code: 'OCR_BACKEND_ERROR', message: err && err.message ? err.message : String(err) };
        attempts.push(attempt);
        lastError = err;
        // continue to the next backend in the route
      }
    }

    this._metrics.failures += 1;
    // All backends failed.
    throw new OCRPipelineError(
      (lastError && lastError.code) || 'OCR_ALL_BACKENDS_FAILED',
      `processDocument: all ${route.length} backend(s) failed`,
      { attempts, last_error: lastError && lastError.message },
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  4.5  postProcessing — per-doc-type cleanup
  // ──────────────────────────────────────────────────────────────

  /**
   * Clean raw OCR text with document-type-specific rules. Pure function.
   */
  postProcessing({ text, type = 'general' } = {}) {
    if (text == null) return '';
    if (!SUPPORTED_DOC_TYPES.includes(type)) {
      throw new OCRPipelineError(
        'OCR_DOC_TYPE_UNSUPPORTED',
        `postProcessing: docType "${type}" is not supported`,
      );
    }
    let t = String(text);

    // Universal passes.
    t = t.replace(BIDI_CONTROL_RE, '');
    t = t.replace(/\r\n?/g, '\n');
    t = t.replace(/\u00A0/g, ' ');               // NBSP → space
    t = t.replace(/[ \t]+/g, ' ');
    t = t.replace(/ ?\n ?/g, '\n');
    t = t.trim();

    switch (type) {
      case 'invoice':
      case 'receipt': {
        // Normalise currency glyphs.
        t = t.replace(/₪|ILS|NIS|ש["']?ח/g, 'ILS');
        // Fix common OCR digit confusions inside numeric runs.
        t = t.replace(/(?<=\d)O(?=\d)/g, '0');
        t = t.replace(/(?<=\d)l(?=\d)/g, '1');
        // Normalise thousands and decimal separators (2,450.00 → 2450.00).
        t = t.replace(/(\d),(\d{3}(?:\D|$))/g, '$1$2');
        // Collapse double spaces around digits.
        t = t.replace(/ (\d)/g, ' $1');
        break;
      }
      case 'id-card':
      case 'teudat-zehut': {
        // Re-group 9-digit id blocks.
        t = t.replace(/\b(\d{3})[ -]?(\d{3})[ -]?(\d{3})\b/g, '$1$2$3');
        break;
      }
      case 'rishiyon-esek': {
        // Israeli business license: keep the license number intact.
        t = t.replace(/רישיון\s*עסק/g, 'רישיון עסק');
        break;
      }
      case 'mill-cert': {
        // Mill certificate / תעודת ייצור — normalise heat number labels.
        t = t.replace(/Heat\s*No[.:]?/gi, 'Heat No.');
        t = t.replace(/מס['"]?\s*היתוך/g, 'מס היתוך');
        break;
      }
      case 'general':
      default:
        // no-op
        break;
    }
    return t;
  }

  // ──────────────────────────────────────────────────────────────
  //  4.6  structuredExtract — schema-driven field pull
  // ──────────────────────────────────────────────────────────────

  /**
   * Pull fields from raw text using a simple schema.
   *
   * Schema shape:
   *   {
   *     fieldName: {
   *       type: 'string'|'number'|'date'|'id',
   *       // One of:
   *       pattern: RegExp,        // first capture group is the value
   *       keywords: string[],     // take the next number/word after a keyword
   *       required: boolean,
   *       default: any,
   *     }
   *   }
   *
   * Returns `{ fields, missing, confidence }`.
   */
  structuredExtract({ text, schema } = {}) {
    if (text == null) {
      throw new OCRPipelineError('OCR_TEXT_REQUIRED', 'structuredExtract: text is required');
    }
    if (!schema || typeof schema !== 'object') {
      throw new OCRPipelineError('OCR_SCHEMA_REQUIRED', 'structuredExtract: schema is required');
    }
    const source = String(text);
    const fields = {};
    const missing = [];
    let hits = 0;
    let total = 0;

    for (const [name, spec] of Object.entries(schema)) {
      total += 1;
      let value = null;
      if (spec.pattern instanceof RegExp) {
        const re = new RegExp(spec.pattern.source, spec.pattern.flags.includes('g') ? spec.pattern.flags : spec.pattern.flags + 'g');
        const match = re.exec(source);
        if (match) value = match[1] != null ? match[1] : match[0];
      }
      if (value == null && Array.isArray(spec.keywords) && spec.keywords.length > 0) {
        for (const kw of spec.keywords) {
          // Match keyword followed by optional punctuation then capture the next numeric/alpha run.
          const re = new RegExp(`${escapeRegex(kw)}\\s*[:\\-]?\\s*([\\p{L}\\d./,-]+)`, 'iu');
          const match = re.exec(source);
          if (match) {
            value = match[1];
            break;
          }
        }
      }
      if (value == null && 'default' in spec) value = spec.default;

      if (value == null) {
        if (spec.required) missing.push(name);
        fields[name] = null;
        continue;
      }
      fields[name] = this._coerceValue(value, spec.type);
      if (fields[name] != null) hits += 1;
    }

    const confidence = total > 0 ? hits / total : 0;
    return { fields, missing, confidence };
  }

  _coerceValue(value, type) {
    const str = String(value).trim();
    switch (type) {
      case 'number': {
        const n = Number(str.replace(/[^\d.-]/g, ''));
        return Number.isFinite(n) ? n : null;
      }
      case 'date': {
        // Accept DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD.
        const m1 = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(str);
        if (m1) {
          const [, d, mo, y] = m1;
          const year = y.length === 2 ? `20${y}` : y;
          return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        const m2 = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str);
        if (m2) {
          const [, y, mo, d] = m2;
          return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return null;
      }
      case 'id': {
        const digits = str.replace(/\D/g, '');
        return digits.length >= 8 && digits.length <= 10 ? digits : null;
      }
      case 'string':
      default:
        return str;
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  4.7  Layout / table / handwriting analyses — delegating stubs
  // ──────────────────────────────────────────────────────────────

  /**
   * Ask a backend (or caller-supplied transport) to segment the page
   * into header / body / footer / tables / signatures.
   * If the configured transport supports `layout(file)` we call it,
   * otherwise we return a trivial single-body zone so downstream code
   * never breaks.
   */
  async layoutAnalysis(file) {
    if (file == null) {
      throw new OCRPipelineError('OCR_FILE_REQUIRED', 'layoutAnalysis: file is required');
    }
    const backend = this._pickCapability('layout');
    if (backend && typeof backend.transport.layout === 'function') {
      const zones = await backend.transport.layout(file);
      return Array.isArray(zones) ? zones : [];
    }
    return [{ kind: 'body', bbox: null, confidence: 0, backend: null }];
  }

  async tableExtraction(file) {
    if (file == null) {
      throw new OCRPipelineError('OCR_FILE_REQUIRED', 'tableExtraction: file is required');
    }
    const backend = this._pickCapability('tables');
    if (backend && typeof backend.transport.tables === 'function') {
      const tables = await backend.transport.tables(file);
      return Array.isArray(tables) ? tables : [];
    }
    return [];
  }

  async handwritingDetect(file) {
    if (file == null) {
      throw new OCRPipelineError('OCR_FILE_REQUIRED', 'handwritingDetect: file is required');
    }
    const backend = this._pickCapability('handwriting');
    if (backend && typeof backend.transport.handwriting === 'function') {
      const regions = await backend.transport.handwriting(file);
      return Array.isArray(regions) ? regions : [];
    }
    return [];
  }

  _pickCapability(methodName) {
    const ordered = Array.from(this._backends.values())
      .filter((b) => b.enabled && b.transport && typeof b.transport[methodName] === 'function')
      .sort((a, b) => b.priority - a.priority);
    return ordered[0] || null;
  }

  // ──────────────────────────────────────────────────────────────
  //  4.8  sensitiveRedact — mask PII before storage
  // ──────────────────────────────────────────────────────────────

  /**
   * Replace matched patterns with a fixed mask.
   * @param {object} args
   * @param {string} args.text
   * @param {string[]|object} [args.patterns] — slug list OR slug->RegExp map
   * @param {string} [args.mask]
   * @returns {{ text: string, redactions: Array<{pattern:string, count:number}> }}
   */
  sensitiveRedact({ text, patterns, mask = '[REDACTED]' } = {}) {
    if (text == null) {
      throw new OCRPipelineError('OCR_TEXT_REQUIRED', 'sensitiveRedact: text is required');
    }
    let selected;
    if (!patterns) {
      selected = DEFAULT_REDACT_PATTERNS;
    } else if (Array.isArray(patterns)) {
      selected = {};
      for (const slug of patterns) {
        if (!DEFAULT_REDACT_PATTERNS[slug]) {
          throw new OCRPipelineError(
            'OCR_REDACT_PATTERN_UNKNOWN',
            `sensitiveRedact: unknown pattern slug "${slug}"`,
            { supported: Object.keys(DEFAULT_REDACT_PATTERNS) },
          );
        }
        selected[slug] = DEFAULT_REDACT_PATTERNS[slug];
      }
    } else if (typeof patterns === 'object') {
      selected = patterns;
    } else {
      throw new OCRPipelineError('OCR_REDACT_PATTERN_INVALID', 'sensitiveRedact: patterns must be array or object');
    }

    let out = String(text);
    const redactions = [];
    for (const [slug, re] of Object.entries(selected)) {
      if (!(re instanceof RegExp)) continue;
      // Ensure `g` flag for a global replacement + count.
      const globalRe = re.global ? re : new RegExp(re.source, re.flags + 'g');
      let count = 0;
      out = out.replace(globalRe, () => {
        count += 1;
        return mask;
      });
      if (count > 0) redactions.push({ pattern: slug, count });
    }
    return { text: out, redactions };
  }

  // ──────────────────────────────────────────────────────────────
  //  4.9  batchProcess — parallel with concurrency cap
  // ──────────────────────────────────────────────────────────────

  /**
   * Process many files in parallel, respecting the concurrency cap.
   * Each file can be either a plain file handle or `{file, hints}`.
   * Returns an array of `{ ok, value?, error? }` tuples in input order.
   */
  async batchProcess(files = []) {
    if (!Array.isArray(files)) {
      throw new OCRPipelineError('OCR_BATCH_INPUT_INVALID', 'batchProcess: files must be an array');
    }
    const results = new Array(files.length);
    let cursor = 0;
    const concurrency = Math.min(this._concurrency, files.length || 1);
    const workers = new Array(concurrency).fill(null).map(async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= files.length) return;
        const item = files[index];
        const payload = item && typeof item === 'object' && 'file' in item
          ? item
          : { file: item, hints: {} };
        try {
          const value = await this.processDocument(payload);
          results[index] = { ok: true, value };
        } catch (err) {
          results[index] = {
            ok: false,
            error: {
              code: err && err.code ? err.code : 'OCR_ERROR',
              message: err && err.message ? err.message : String(err),
            },
          };
        }
      }
    });
    await Promise.all(workers);
    return results;
  }

  // ──────────────────────────────────────────────────────────────
  //  4.10  qualityCheck — sanity assertions on a result
  // ──────────────────────────────────────────────────────────────

  /**
   * Run sanity checks on a processed result.
   * Returns `{ ok, issues, score }` where:
   *   - issues: human-readable problems
   *   - score:  0..1 fraction of checks that passed
   */
  qualityCheck({ result, expected = [] } = {}) {
    const issues = [];
    let checks = 0;
    let passed = 0;

    checks += 1;
    if (!result || typeof result !== 'object') {
      issues.push('result is not an object');
    } else {
      passed += 1;
      checks += 1;
      if (typeof result.text !== 'string' || result.text.length === 0) {
        issues.push('result.text is empty');
      } else {
        passed += 1;
      }
      checks += 1;
      if (typeof result.confidence !== 'number' || result.confidence < this._confidenceMin) {
        issues.push(`confidence ${result.confidence} below threshold ${this._confidenceMin}`);
      } else {
        passed += 1;
      }
      for (const fieldName of expected) {
        checks += 1;
        const text = result.text || '';
        const hit = typeof fieldName === 'string'
          ? text.toLowerCase().includes(fieldName.toLowerCase())
          : (fieldName instanceof RegExp && fieldName.test(text));
        if (hit) passed += 1;
        else issues.push(`expected field "${fieldName}" not found`);
      }
    }
    const score = checks > 0 ? passed / checks : 0;
    return { ok: issues.length === 0, issues, score };
  }

  // ──────────────────────────────────────────────────────────────
  //  4.11  Hebrew normalisation (instance-level thin wrapper)
  // ──────────────────────────────────────────────────────────────

  hebrewNormalize(text) {
    return hebrewNormalize(text);
  }

  // ──────────────────────────────────────────────────────────────
  //  4.12  Metrics
  // ──────────────────────────────────────────────────────────────

  getMetrics() {
    // Deep clone to keep callers from mutating internal state.
    return JSON.parse(JSON.stringify(this._metrics));
  }

  resetMetrics() {
    this._metrics = {
      total_calls: 0,
      successes: 0,
      failures: 0,
      fallback_hops: 0,
      low_confidence_rejections: 0,
      per_backend: Object.create(null),
    };
    for (const name of this._backends.keys()) {
      this._metrics.per_backend[name] = {
        calls: 0,
        successes: 0,
        failures: 0,
        total_latency_ms: 0,
      };
    }
    return this;
  }
}


// ════════════════════════════════════════════════════════════════
//  5. Helpers
// ════════════════════════════════════════════════════════════════

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// ════════════════════════════════════════════════════════════════
//  6. Exports
// ════════════════════════════════════════════════════════════════

module.exports = {
  OCRPipeline,
  OCRPipelineError,
  SUPPORTED_BACKEND_TYPES,
  SUPPORTED_DOC_TYPES,
  SUPPORTED_LANGUAGES,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_REDACT_PATTERNS,
  hebrewNormalize,
  _internal: {
    HEBREW_NIQQUD_RE,
    HEBREW_FINAL_LETTERS,
    BIDI_CONTROL_RE,
    escapeRegex,
  },
};
