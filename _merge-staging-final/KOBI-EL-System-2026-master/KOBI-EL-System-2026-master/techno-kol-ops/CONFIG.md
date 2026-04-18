# Techno-Kol OPS — Environment Configuration

This document is the canonical reference for every environment variable
consumed by `techno-kol-ops`. It is kept in sync with `src/config/env.js`,
which is the runtime source of truth and will refuse to boot if any
**required** variable below is missing.

On startup, `src/config/env.js`:

1. Loads `.env` via `dotenv.config()` (optional — ambient `process.env`
   works too).
2. Validates every variable in the schema.
3. Collects **all** missing/invalid vars and throws a single
   `EnvValidationError` listing every problem at once (no
   first-error-wins).
4. Logs a redacted summary to the console. Secrets are always shown as
   `****` — the raw value never hits stdout.
5. Freezes the resulting config object so downstream code cannot mutate
   it at runtime.

> To regenerate a local `.env`, copy `.env.example` and fill in any
> values marked **Required** below.

---

## Quick reference

| Variable                   | Required | Type    | Default                               | Secret |
| -------------------------- | -------- | ------- | ------------------------------------- | ------ |
| `PORT`                     | Yes      | number  | `5000`                                | No     |
| `NODE_ENV`                 | No       | string  | `development`                         | No     |
| `APP_URL`                  | No       | string  | `http://localhost:5000`               | No     |
| `ALLOWED_ORIGINS`          | Yes      | csv     | —                                     | No     |
| `DATABASE_URL`             | No       | string  | `` (empty)                            | Yes    |
| `SUPABASE_URL`             | Yes      | string  | —                                     | No     |
| `SUPABASE_ANON_KEY`        | Yes      | string  | —                                     | Yes    |
| `JWT_SECRET`               | No       | string  | `techno_kol_secret_2026_palantir`     | Yes    |
| `JWT_EXPIRES_IN`           | No       | string  | `24h`                                 | No     |
| `ONYX_PROCUREMENT_URL`     | No       | string  | `http://localhost:3100`               | No     |
| `ONYX_AI_URL`              | No       | string  | `http://localhost:3200`               | No     |
| `ONYX_PROCUREMENT_API_KEY` | No       | string  | `` (empty)                            | Yes    |
| `LOG_LEVEL`                | No       | string  | `info`                                | No     |

---

## Server

### `PORT` — **Required**
- Type: `number`
- Default: `5000`
- The TCP port the Express server binds to. Must parse as a number
  (`env.js` throws a typed error if it does not).

### `NODE_ENV` — Optional
- Type: `string`
- Default: `development`
- One of `development`, `production`, `test`. Controls logging
  verbosity and whether the env summary is printed during tests.

### `APP_URL` — Optional
- Type: `string`
- Default: `http://localhost:5000`
- Public base URL of the backend. Used in CORS, email links, and
  receipt URLs (B-24 compliance).

### `ALLOWED_ORIGINS` — **Required**
- Type: `csv` (comma-separated list)
- Default: none — boot will abort if unset
- Origins permitted by the CORS middleware. Example:
  `http://localhost:5000,http://localhost:5173,http://localhost:3100`

---

## Database

### `DATABASE_URL` — Optional
- Type: `string` (secret)
- Default: empty
- Postgres connection string used by the `pg` client. Optional because
  Supabase may be used instead; if you deploy without Supabase, you
  should set this.

### `SUPABASE_URL` — **Required**
- Type: `string`
- Default: none
- HTTPS URL of the Supabase project (e.g.
  `https://xxxx.supabase.co`).

### `SUPABASE_ANON_KEY` — **Required**
- Type: `string` (secret)
- Default: none
- Public anon key for Supabase client SDK. Redacted in the boot
  summary.

---

## Auth

### `JWT_SECRET` — Optional (but set it in production!)
- Type: `string` (secret)
- Default: `techno_kol_secret_2026_palantir`
- HMAC secret used to sign/verify JWTs. The default exists only so
  local dev works out-of-the-box — **always override in production**.
  Generate a strong value with `openssl rand -hex 32`.

### `JWT_EXPIRES_IN` — Optional
- Type: `string`
- Default: `24h`
- Expiration window accepted by `jsonwebtoken` (e.g. `15m`, `24h`,
  `7d`).

---

## ONYX Integration

### `ONYX_PROCUREMENT_URL` — Optional
- Type: `string`
- Default: `http://localhost:3100`
- Base URL of the ONYX Procurement service that techno-kol-ops
  interoperates with.

### `ONYX_AI_URL` — Optional
- Type: `string`
- Default: `http://localhost:3200`
- Base URL of the ONYX AI service.

### `ONYX_PROCUREMENT_API_KEY` — Optional
- Type: `string` (secret)
- Default: empty
- Bearer token used when calling ONYX Procurement. If empty,
  unauthenticated calls are attempted (dev only).

---

## Logging

### `LOG_LEVEL` — Optional
- Type: `string`
- Default: `info`
- One of `debug`, `info`, `warn`, `error`.

---

## Error format

If any required variable is missing or invalid, `env.js` throws an
`EnvValidationError` whose `.message` enumerates every problem. Example:

```
Missing required environment variables (3):
  - PORT
  - ALLOWED_ORIGINS
  - SUPABASE_URL
Type errors (1):
  - [env] PORT must be a number, got "abc"

See CONFIG.md for the full environment specification.
```

The error object also exposes `.missing` and `.typeErrors` arrays for
programmatic handling.

---

## Running the tests

```bash
node src/config/env.test.js
```

The test harness verifies:

1. Missing required vars throw an `EnvValidationError` listing **all**
   missing vars at once.
2. Defaults are applied for optional vars and `PORT` is coerced to a
   number.
3. Secrets are redacted in the boot summary (raw value never appears
   in stdout).
4. The exported config object is frozen and cannot be mutated.
