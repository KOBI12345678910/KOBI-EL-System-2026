# `src/logger.js` — Wiring Instructions

Owner: Agent-01 (logging foundation)
Status: Additive only. **Never remove existing `console.log` / `console.error` calls.**
Target file to edit: `onyx-procurement/server.js` (~1206 lines).

---

## Guarantees

1. **Nothing existing is deleted.** Every current `console.log` and `console.error` in
   `server.js` keeps firing exactly as today. `pino` runs *in parallel*, writing
   structured JSON (prod) or pretty output (dev) to the same stdout.
2. **No new required env vars.** If `LOG_LEVEL` / `LOG_FORMAT` are unset the module
   picks sane defaults (`info`, and `pretty` unless `NODE_ENV=production`).
3. **No route handlers are touched.** Logging is added at the middleware layer, so
   every existing `app.get/post/put/delete` continues to work unmodified.
4. **Existing global error handler keeps its job.** `errorLogger` calls `next(err)`,
   so the handler at `server.js:1140` (`app.use((err, req, res, _next) => ...)`)
   still sends the response.

---

## Required imports (top of `server.js`)

**Add** after the existing `require('dotenv').config();` line (currently line 25).
Do **not** remove any existing `require` statements.

```js
// ═══ STRUCTURED LOGGING (Agent-01) ═══
// Pino logger runs in parallel with existing console.* calls.
// Controlled via LOG_LEVEL / LOG_FORMAT env vars. See src/logger.js.
const { logger, requestLogger, errorLogger } = require('./src/logger');
```

---

## Middleware wiring

### 1. `requestLogger` — mount **before** any route handlers

Mount immediately after `app.use('/webhook/', webhookLimiter);` (currently line 83)
and **before** the API-key auth middleware at line 123. This guarantees every
request (including the ones rejected by auth or rate limit) gets a log entry.

**Insert after line 83:**

```js
// Attach child logger + request id to every request.
// Must come AFTER body parser (so req.body redaction works) and BEFORE
// any route so 4xx/5xx responses are still logged.
app.use(requestLogger);
```

> Note: `express.json()` is already mounted at line 62, so by the time
> `requestLogger` runs the body parser has already populated `req.body`. Good.

### 2. `errorLogger` — mount **before** the existing global error handler

The existing global error handler lives at `server.js:1140`:

```js
app.use((err, req, res, _next) => {
  console.error(`[ERR] ${req.method} ${req.path}:`, err);
  ...
});
```

**Insert immediately before line 1140:**

```js
// Pino error logger — logs err + stack at level='error' then forwards
// via next(err) so the existing global handler below still runs.
app.use(errorLogger);
```

Because Express runs error middleware in registration order, `errorLogger`
fires first (structured log), then the existing handler fires (human log +
HTTP response). No behaviour change for clients.

---

## Optional: use `logger` at boot time

Purely additive — you can keep `console.log` **and** emit a structured boot
event next to it. Example, inside the existing `app.listen` callback at
line 1155:

```js
const server = app.listen(PORT, () => {
  console.log(`... existing banner ...`);   // ← keep as-is
  logger.info({ msg: 'server.listen', port: PORT }); // ← add this line
});
```

Do the same pattern anywhere else you want structured telemetry — for
example, next to the WhatsApp load errors at lines 1007 / 1014 / 1021 / 1028:

```js
console.error('⚠️  VAT module failed to load:', err.message);  // keep
logger.error({ msg: 'module.load.failed', module: 'vat', err }); // add
```

**Again: do not delete the console lines.** The rule is ADD-ONLY.

---

## Order of operations (TL;DR)

1. Add the `require('./src/logger')` line after `dotenv`.
2. Add `app.use(requestLogger);` after the webhook rate limiter.
3. Add `app.use(errorLogger);` immediately before the global error handler.
4. (Optional) Sprinkle `logger.info/error/...` calls next to existing
   `console.*` calls at boot, module load, and shutdown.
5. Run `node server.js` — you should see pretty output in dev and raw JSON
   when `NODE_ENV=production` or `LOG_FORMAT=json`.

---

## Env var cheat sheet

| Var          | Default                               | Effect                                |
|--------------|---------------------------------------|---------------------------------------|
| `LOG_LEVEL`  | `info`                                | pino level: trace/debug/info/warn/error/fatal |
| `LOG_FORMAT` | `pretty` (dev) / `json` (prod)        | `pretty` → pino-pretty, `json` → raw  |
| `NODE_ENV`   | `development`                         | Drives `base.env` + default `LOG_FORMAT` |

---

## Redacted fields

Set in `src/logger.js`:

- `req.headers.authorization`
- `req.headers["x-api-key"]`
- `req.headers.cookie`
- `*.password`
- `*.token`
- `*.api_key`

These are replaced with `[REDACTED]` in every log line. Extend the list by
editing `REDACT_PATHS` in `src/logger.js` (or by passing `{ redact: [...] }`
to `createLogger({...})` for isolated instances).
