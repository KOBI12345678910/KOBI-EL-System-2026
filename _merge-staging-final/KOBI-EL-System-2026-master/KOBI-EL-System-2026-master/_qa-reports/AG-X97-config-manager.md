# AG-X97 — Unified Config Manager
**Agent:** X-97 | **Swarm:** 4 | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 55/55 tests green

---

## 1. Scope

A zero-dependency unified configuration manager for the Techno-Kol Uzi
mega-ERP. Loads configuration from heterogeneous sources, deep-merges them
with well-defined precedence, validates against a JSON-Schema-lite spec,
encrypts/decrypts secrets transparently, watches for changes, and produces
audit-safe dumps — all using only Node.js built-ins.

Delivered files
- `onyx-procurement/src/config/config-manager.js` — the library (~1,050 LOC)
- `onyx-procurement/test/config/config-manager.test.js` — 55 tests
- `_qa-reports/AG-X97-config-manager.md` — this report

RULES respected
- **Zero external dependencies** — only `node:fs`, `node:path`, `node:crypto`,
  `node:http`, `node:https`, `node:events`.
- **Bilingual errors** — every error carries `message_he` + `message_en` +
  a stable `.code`.
- **לא מוחקים רק משדרגים ומגדלים** — the deep-merge is strictly additive
  for untouched keys. Validation defaults are *filled in*, never removed.
  Schema violations keep the coerced/defaulted tree on disk so a rollback
  is always clean.
- **No secret leakage** — `dump()` redacts by default; `get()` auto-decrypts
  only with an explicit encryption key in-scope.

---

## 2. Public API

```js
const { ConfigManager } = require('./src/config/config-manager.js');

const cfg = new ConfigManager({ env, encryptionKey, debounceMs });

await cfg.load({ sources, schema });

cfg.get(key, default);    // auto-decrypts "enc:v1:..." values
cfg.getRaw(key, default); // never auto-decrypts
cfg.set(key, value);
cfg.has(key);
cfg.keys();               // dotted leaves
cfg.toJSON();

cfg.validate(schema);
const off = cfg.watch(cb);
cfg.unwatch(cb);

cfg.encrypt(plaintext);   // → "enc:v1:<iv>:<tag>:<ct>"
cfg.decrypt(ciphertext);
cfg.decryptTree();

cfg.dump({ redactSecrets, format });
cfg.diff(other);          // other: plain obj OR another ConfigManager

cfg.close();              // stops watchers, clears listeners
```

All dot-notation keys support escaping a literal dot with a backslash —
e.g. `cfg.get('hosts.api\\.example\\.com.ip')`.

---

## 3. Source types & precedence

Sources are applied **in array order**; later sources deep-merge ON TOP of
earlier ones (last wins). Object leaves merge key-by-key; scalars and
arrays are replaced.

```js
await cfg.load({
  sources: [
    { type: 'env',    prefix: 'ONYX__', separator: '__', lowerCase: true },
    { type: 'file',   path: './config/default.yaml' },
    { type: 'file',   path: './config/prod.json', optional: true },
    { type: 'remote', url:  'https://config.example.com/app.json',
                       pollMs: 30000, headers: { Authorization: '...' } },
    { type: 'inline', data: { featureFlags: { newUI: true } } },
  ],
});
```

| Source   | How it's loaded                                  | Coercion            |
|----------|--------------------------------------------------|---------------------|
| `env`    | `process.env` (or injected map) filtered by prefix, `__`→`.`, lower-cased by default | string → bool/num/JSON |
| `file`   | `fs.readFileSync` + format dispatch by extension | format-aware        |
| `remote` | `http(s).request` (no fetch polyfill); UTF-8 body; format from `Content-Type` or URL suffix | format-aware |
| `inline` | `deepClone` of provided object                   | as-is               |

`{ optional:true }` on a file source suppresses `FILE_NOT_FOUND`.

### Recommended production precedence

```
defaults.yaml  <  env vars  <  prod.{yaml,json}  <  secrets/remote  <  runtime inline
```

Env comes *after* defaults so operators can override baked-in values, and
*before* prod files so prod config wins decisively. Secrets/remote come
last so rotated credentials always win.

---

## 4. Supported file formats

### YAML (minimal parser)

**Supported:**
- Scalars: strings, numbers, booleans (`true`/`false`), null (`null`, `~`)
- Quoted strings (`'…'`, `"…"`) — `#` safe inside quotes
- Maps by indentation (any consistent indent width)
- Sequences of scalars (`- foo`)
- Flow-style maps and arrays (`{a: 1, b: 2}`, `[1, 2, 3]`)
- `#` line comments and inline comments (only after whitespace)
- Tabs converted to 2 spaces for indentation

**Not supported (document and use JSON if you need these):**
- Anchors / aliases (`&anchor`, `*alias`)
- YAML tags (`!!str`, `!!int`, …)
- Multi-line folded (`>`) / literal (`|`) blocks
- Explicit document markers (`---`, `...`)
- Complex keys (`? …`)

If you need those, use JSON or split the file into nested maps.

### JSON

Standard `JSON.parse`. Errors surface as `JSON_PARSE` with the parser's
message plus a Hebrew translation.

### `.env` files

```
# comment
KEY=value
export KEY=value
QUOTED="has # hash"
SINGLE='literal'
INLINE=keep # trailing comment stripped
```

Parsed into a flat string map, then nested: `DB__HOST` → `db.host`
(`__` → `.`, lower-cased by default). Values pass through `coerce()`
so `PORT=3100` becomes a number, `DEBUG=true` becomes a boolean, and
`FEATURES=["a","b"]` becomes an array.

### Remote

HTTP/HTTPS GET via `node:http`/`node:https`. Defaults: 10 s timeout,
`User-Agent: onyx-config-manager/1.0`. Format is auto-detected from
`Content-Type` (`application/json` / `text/yaml` / `application/x-yaml`)
or the URL path.

---

## 5. Schema syntax (JSON-Schema-lite)

Flat map of dot-notation paths → rule:

```js
const schema = {
  'server.port': {
    type: 'number',          // string | number | integer | boolean | array | object
    required: true,
    min: 1,
    max: 65535,
    default: 3100,
  },
  'server.host': {
    type: 'string',
    default: '0.0.0.0',
    minLength: 1,
    maxLength: 255,
    pattern: '^[a-z0-9.-]+$', // string OR RegExp
  },
  'logging.level': {
    type: 'string',
    enum: ['debug', 'info', 'warn', 'error'],
  },
  'database.password': {
    type: 'string',
    required: true,
    secret: true,             // → redacted in dump() regardless of key name
  },
  'features': {
    type: 'array',
  },
  'custom.port': {
    type: 'number',
    validator: (v) => (v % 2 === 0 ? true : {
      ok: false,
      en: 'must be even',
      he: 'חייב להיות זוגי',
    }),
  },
};
```

Supported rule keys: `type`, `required`, `default`, `min`, `max`,
`minLength`, `maxLength`, `pattern`, `enum`, `secret`, `validator`.

Type coercion is applied **before** validation, so string `"3100"` passes
`{ type: 'number', min: 1 }`. Boolean coercion accepts
`true/false/1/0/yes/no/on/off`.

Validation errors include `{ path, rule, en, he }` so a single failure
can be rendered in both languages with the exact dotted path to the
offending key.

---

## 6. Encryption notes

- **Algorithm:** AES-256-GCM via `node:crypto`, 12-byte random IV per
  encryption, 16-byte GCM auth tag.
- **Wire format:** `enc:v1:<iv-b64>:<tag-b64>:<ct-b64>` — printable,
  fits any config format.
- **Key source:** `CONFIG_ENCRYPTION_KEY` env var, or `opts.encryptionKey`
  passed to the constructor.
- **Key formats accepted:**
  1. 64-char hex string → 32 bytes
  2. 44-char base64 → 32 bytes
  3. anything else → `sha256(key)` (dev-friendly fallback; warn in prod)
- **Tamper detection:** GCM tag mismatches raise `DECRYPT_FAIL`.
- **Auto-decrypt:** `cfg.get('db.password')` transparently decrypts any
  value that starts with `enc:v1:` if the encryption key is in scope.
  Use `cfg.getRaw()` when you explicitly want the ciphertext (e.g. to
  re-export the sealed tree).
- **Never auto-encrypts.** Ciphertexts only enter the tree via explicit
  `cfg.encrypt()` / pre-encrypted config files.

### Same-plaintext → different-ciphertext

Because the IV is random per call, encrypting the same plaintext twice
yields two distinct ciphertexts. This is a feature (prevents confirmed-
plaintext attacks), and test `34` asserts it.

---

## 7. Redaction rules for `dump()`

`dump({ redactSecrets:true })` (default) masks a leaf when ANY of:

1. Schema rule has `secret: true` for that dotted path.
2. Value already looks encrypted (`enc:v1:…`).
3. Leaf key matches one of the built-in patterns:
   `password`, `passwd`, `secret`, `token`, `apiKey`, `api_key`,
   `private_key`, `client_secret`, `authorization`, `cookie`,
   `session_id`, `access_key`, `credit_card`, `ccNum`, `cvv`, `iban`.

Masking: short strings (≤ 4 chars) become `***`; longer strings show
first 2 + `***` + last 2 so operators can sanity-check which key they
are looking at without revealing the value.

`dump({ redactSecrets:false })` returns an **unredacted deep clone**.
Use with care — only in trusted admin paths.

Output shapes:
- `format: 'object'` (default) — nested tree
- `format: 'flat'` — `{ 'server.port': 3100, … }`
- `format: 'json'` — pretty-printed string

---

## 8. Hot reload

- **File sources:** `fs.watch(path)` with `persistent:false` so the
  watcher never keeps the process alive. Debounced reloads
  (default 150 ms; override via `new ConfigManager({ debounceMs })`)
  collapse editor-save bursts into one event.
- **Remote sources:** polled on `pollMs` interval via
  `setInterval(...).unref()`. Pass `pollMs: 0` (or omit) to disable.
- **Atomicity:** when a reload fires, the manager re-runs **the full
  pipeline** in precedence order so nothing from later sources is lost,
  then re-validates. If validation fails, the `validation-error` event
  fires but the coerced tree is still written (never drop keys).
- **Diff delivered to callbacks:** `watch((newData, meta) => …)` gets
  `{ added, removed, changed, source }` so observers can react narrowly.
- **Cleanup:** `cfg.close()` stops every watcher and clears timers.

---

## 9. Diff algorithm

`cfg.diff(other)` flattens both trees to dotted keys, then:
- `added`   = keys present in *current* but not in `other`
- `removed` = keys present in `other` but not in *current*
- `changed` = keys present in both where the leaf is not `deepEqual`

`other` may be a plain object **or** another `ConfigManager` instance.

---

## 10. Test matrix (55 tests, all green)

| #  | Area                    | Cases |
|----|-------------------------|-------|
| 1  | Dot notation helpers    | 01–06 |
| 2  | Type coercion           | 07–09 |
| 3  | `.env` parser           | 10–11 |
| 4  | YAML parser             | 12–16 |
| 5  | Deep merge              | 17–18 |
| 6  | Source precedence       | 19–22 |
| 7  | Schema validation       | 23–32 |
| 8  | AES-256-GCM round-trip  | 33–38 |
| 9  | Redaction / `dump()`    | 39–44 |
| 10 | `diff()`                | 45–47 |
| 11 | Hot reload              | 48–49 |
| 12 | Bilingual errors        | 50–51 |
| 13 | Format detection        | 52    |
| 14 | E2E ERP scenario        | 53    |
| 15 | `set/has/keys`          | 54–55 |

Run:

```bash
node --test onyx-procurement/test/config/config-manager.test.js
```

---

## 11. Error codes reference

| Code                   | When it fires                                                 |
|------------------------|--------------------------------------------------------------|
| `SOURCE_UNKNOWN`       | `load({ sources:[{type:'…'}]})` with an unsupported type     |
| `FILE_NOT_FOUND`       | File source missing and not `optional`                        |
| `FILE_UNREADABLE`      | `fs.readFileSync` threw (permissions, EIO)                    |
| `FILE_FORMAT_UNKNOWN`  | Extension + `Content-Type` both unrecognised                  |
| `JSON_PARSE`           | `JSON.parse` threw                                            |
| `YAML_PARSE`           | Minimal YAML parser could not tokenize (error has line no.)   |
| `REMOTE_FAIL`          | HTTP error (non-2xx, ECONNREFUSED, DNS, …)                    |
| `REMOTE_TIMEOUT`       | Remote fetch exceeded `timeoutMs` (default 10 s)              |
| `SCHEMA_REQUIRED`      | Required key missing                                          |
| `SCHEMA_TYPE`          | Type mismatch after coercion attempt                          |
| `SCHEMA_MIN` / `MAX`   | Numeric bound violation                                       |
| `SCHEMA_LEN_MIN/MAX`   | String length bound violation                                 |
| `SCHEMA_ENUM`          | Value outside enum                                            |
| `SCHEMA_PATTERN`       | String pattern mismatch                                       |
| `CONFIG_VALIDATION`    | Aggregate error raised by `load()` on any validation failure  |
| `ENCRYPT_NO_KEY`       | `encrypt/decrypt` called with no key and no env var set       |
| `ENCRYPT_BAD_KEY`      | Key resolves to something other than 32 bytes                 |
| `DECRYPT_BAD_INPUT`    | Ciphertext does not match `enc:v1:<iv>:<tag>:<ct>` format     |
| `DECRYPT_FAIL`         | GCM auth tag mismatch (tampered or wrong key)                 |

Every error carries `.code`, `.message_en`, and `.message_he`. The
aggregate `CONFIG_VALIDATION` error additionally exposes `.errors[]`
with per-path `{ path, rule, en, he }`.

---

## 12. Hebrew-English glossary

| English                   | Hebrew            | Used in           |
|---------------------------|-------------------|-------------------|
| configuration             | תצורה             | error prose       |
| source                    | מקור              | `SOURCE_UNKNOWN`  |
| environment variables     | משתני סביבה       | docs              |
| file                      | קובץ              | `FILE_*`          |
| remote                    | מרחוק             | `REMOTE_*`        |
| schema                    | סכֵמה             | docs              |
| required                  | חובה              | `SCHEMA_REQUIRED` |
| type                      | סוג               | `SCHEMA_TYPE`     |
| value                     | ערך               | all SCHEMA_*      |
| minimum                   | מינימום           | `SCHEMA_MIN`      |
| maximum                   | מקסימום           | `SCHEMA_MAX`      |
| length                    | אורך              | `SCHEMA_LEN_*`    |
| allowed                   | מותרים            | `SCHEMA_ENUM`     |
| pattern                   | דפוס              | `SCHEMA_PATTERN`  |
| encryption key            | מפתח הצפנה        | `ENCRYPT_*`       |
| ciphertext / encrypted    | מוצפן             | `DECRYPT_*`       |
| decryption                | פענוח             | `DECRYPT_FAIL`    |
| validation                | ולידציה           | `CONFIG_VALIDATION` |
| default                   | ברירת מחדל        | docs              |
| hot reload / watch        | טעינה חוזרת       | docs              |
| redaction                 | הסרה/מיסוך        | docs              |
| secret                    | סוד               | `secret:true` rule |
| diff / delta              | שינויים/דלתא      | `diff()`          |
| last wins                 | האחרון קובע       | precedence docs   |
| non-destructive merge     | מיזוג לא-הרסני    | deep-merge docs   |

---

## 13. Design notes & non-goals

### Why no external deps?

- The mega-ERP deploys to bare-metal production boxes where Node upgrades
  are already the only moving part. Avoiding `js-yaml`, `dotenv`, `ajv`,
  `node-fetch`, `lodash` cuts the attack surface and the supply-chain-
  audit surface to zero for this module.
- The minimal YAML parser handles the 95 % we actually write in config
  files (maps, sequences, scalars, flow style). The other 5 % (anchors,
  folded blocks, tags) are explicitly documented as "use JSON instead".

### Why deep-merge instead of full replace?

Because the project rule is "לא מוחקים רק משדרגים ומגדלים". A later
source can override any key it touches, but must never silently erase
keys from earlier sources. This means operators can layer
`default.yaml` → env → `prod.yaml` → runtime inline without worrying
about a sparse `prod.yaml` wiping out defaults.

### Why a JSON-Schema-lite instead of full AJV?

A subset is enough for ERP config (type + required + bounds + enum +
pattern + defaults + per-leaf `secret:true`). Full JSON Schema would
require a dependency or thousands of lines of validator code. The lite
validator is ~100 LOC, reports all errors (not fail-fast), fills
defaults, and emits path-accurate bilingual messages.

### Non-goals

- Distributed locking / consensus on remote config — use Consul or etcd
  for that; this module is a *consumer*.
- Multi-tenant scoping — wrap `ConfigManager` in a factory per tenant.
- Binary / MessagePack payloads — the module is UTF-8 text through and
  through.
- Git-backed config with signed commits — out of scope; stand it up
  separately and point a `file:` source at the checked-out tree.

---

## 14. Integration checklist (for callers)

- [ ] Export the instance from a singleton module (e.g. `src/config/index.js`)
      so every other module imports the same tree.
- [ ] Set `CONFIG_ENCRYPTION_KEY` in the deployment pipeline *before* any
      Node process starts (systemd `Environment=`, Kubernetes `Secret`,
      PM2 `env:`…).
- [ ] Write your schema once, near the singleton; never let a caller pass
      an ad-hoc schema at runtime.
- [ ] Add a `cfg.watch()` hook in `src/index.js` that logs the delta so
      operators see every reload in their structured-log pipeline.
- [ ] In `dump()` audit endpoints, never expose `redactSecrets:false`
      to non-admin roles.
- [ ] In CI, run `node -e "require('./src/config').validate()"` as a
      smoke test to catch drift between the schema and prod config.

---

## 15. Files changed / created

- **Created** `onyx-procurement/src/config/config-manager.js`
- **Created** `onyx-procurement/test/config/config-manager.test.js`
- **Created** `_qa-reports/AG-X97-config-manager.md`

**Nothing was deleted.** Existing config loaders elsewhere in the repo
remain untouched; migration to this unified manager is a follow-up
per-service task.

---

*Agent X-97 — Techno-Kol Uzi mega-ERP — 2026-04-11*
