# QA-17 — Polyfills Needed

**Agent:** QA-17 Compatibility Agent
**Date:** 2026-04-11
**Companion to:** `QA-17-compatibility.md`

---

## 0. Policy

This list assumes the following **documented browser support matrix** for the web ERP:
- Chrome / Edge / Firefox: last 2 versions
- Safari macOS: **≥ 14** (Big Sur, 2020)
- iOS / iPadOS Safari: **≥ 14**
- Android Chrome: **≥ 90**

If the team decides to drop Safari < 15.4 (iPad OS < 15.4), many polyfills below become unnecessary — see §4 "Decision: polyfill vs. raise-floor".

---

## 1. JavaScript polyfills — **NEEDED** for Safari 14.x

### 1.1 `Array.prototype.at`
- **Used in:** 30+ files across `AI-Task-Manager/artifacts/erp-app/src/pages/**`, `components/bulk-actions.tsx`, `pages/builder/*.tsx`, etc.
- **Missing in:** Safari 14 (added in 15.4), iOS Safari 14 (added in 15.4), iPadOS 14/15.0-15.3.
- **Polyfill:** `core-js/features/array/at` or `array.prototype.at` (npm package).
- **Install:**
  ```bash
  pnpm add core-js
  ```
- **Wire-up:** Add to `erp-app/src/main.tsx` **top of file**:
  ```ts
  import "core-js/features/array/at";
  ```
- **Size impact:** ~0.3 KB gzipped.

### 1.2 `structuredClone`
- **Used in:** `AI-Task-Manager/artifacts/erp-app/src/App.tsx`, `src/main.tsx`.
- **Missing in:** Safari 14 / 15.0-15.3 (added in 15.4), iOS 14/15.0-15.3.
- **Polyfill:** `@ungap/structured-clone` (already a dependency in `erp-mobile/package.json` — reuse).
- **Install:**
  ```bash
  pnpm add @ungap/structured-clone
  ```
- **Wire-up (conditional):**
  ```ts
  // src/polyfills.ts
  if (typeof globalThis.structuredClone !== "function") {
    const { default: structuredClone } = await import("@ungap/structured-clone");
    (globalThis as any).structuredClone = structuredClone;
  }
  ```
  Then in `main.tsx`:
  ```ts
  import "./polyfills";
  ```
- **Size impact:** ~2 KB gzipped (only loaded on old Safari).

### 1.3 `Array.prototype.findLast` / `findLastIndex` *(precautionary)*
- **Used in:** not directly found in grep, but common in `lodash`-less migrations.
- **Missing in:** Safari 14 (added in 15.4).
- **Polyfill:** `core-js/features/array/find-last` — add alongside §1.1.

### 1.4 `Object.hasOwn` *(precautionary)*
- **Missing in:** Safari 14 (added in 15.4).
- **Polyfill:** `core-js/features/object/has-own`.

---

## 2. JavaScript polyfills — **NOT NEEDED** (native in Safari 14+)

| Feature | Supported from | Verdict |
|---|---|---|
| `?.` optional chaining | Safari 13.1 | ✅ native |
| `??` nullish coalescing | Safari 13.1 | ✅ native |
| `Promise.allSettled` | Safari 13 | ✅ native |
| `BigInt` | Safari 14 | ✅ native |
| `globalThis` | Safari 12.1 | ✅ native |
| `Array.prototype.flat` / `flatMap` | Safari 12 | ✅ native |
| `Object.fromEntries` | Safari 12.1 | ✅ native |
| `String.prototype.replaceAll` | Safari 13.1 | ✅ native |
| `Intl.DateTimeFormat` | universal | ✅ native |
| `Intl.NumberFormat` | universal | ✅ native |
| `fetch` | universal since Safari 10 | ✅ native |
| `Promise.any` | Safari 14 | ✅ native |

---

## 3. Web API polyfills

### 3.1 `IntersectionObserver`
- **Used in:** *(not found in grep, but likely via libraries — `framer-motion`, `wouter`, `@radix-ui`)*.
- **Supported:** Safari 12.1+ → **no polyfill needed** at min Safari 14.

### 3.2 `ResizeObserver`
- **Used in:** *(via Radix UI, recharts)*.
- **Supported:** Safari 13.1+ → **no polyfill needed**.

### 3.3 `PointerEvent`
- **Used in:** drag-n-drop builders (`form-field-components.tsx`, `dynamic-data-view.tsx`).
- **Supported:** Safari 13+ → **no polyfill needed**.

### 3.4 Service Worker / Workbox (PWA)
- **Used in:** `vite-plugin-pwa` + `workbox-*` in `erp-app/package.json`.
- **Supported:** Safari 11.1+ → **no polyfill needed**. But SW install on iOS < 16.4 is limited (no push).

### 3.5 `Clipboard API` (`navigator.clipboard.writeText`)
- **Supported:** Safari 13.1+ → **no polyfill needed**. But some iOS PWA modes need user gesture.

---

## 4. CSS polyfills / fallbacks — **NEEDED**

### 4.1 `env(safe-area-inset-*)` — **missing, not polyfill but code**
- **Status:** Not used in web ERP → **iPhone notch breaks PWA layout** (see BUG-QA17-004).
- **Action (not a polyfill, a code change):**
  1. Add `viewport-fit=cover` to `<meta name="viewport">` in `erp-app/index.html`:
     ```html
     <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
     ```
     (also remove `maximum-scale=1` per BUG-QA17-013).
  2. Apply to layout roots:
     ```css
     .app-shell {
       padding-top: env(safe-area-inset-top);
       padding-bottom: env(safe-area-inset-bottom);
       padding-left: env(safe-area-inset-left);
       padding-right: env(safe-area-inset-right);
     }
     ```
- **No polyfill needed** — `env()` is supported since Safari 11.

### 4.2 Logical properties (`margin-inline-*`, `padding-inline-*`)
- **Status:** Not used — erp-app uses physical-property RTL shim (see BUG-QA17-006).
- **Action:** Migrate Tailwind utilities to logical versions (Tailwind 3.3+ ships `ps-*`/`pe-*`/`ms-*`/`me-*`). **No polyfill** — supported since Safari 14.5.

### 4.3 `:focus-visible` pseudo-class
- **Supported:** Safari 15.4+.
- **Missing in:** Safari 14 / 15.0-15.3.
- **Polyfill:** `focus-visible` npm package.
- **Install & wire:**
  ```bash
  pnpm add focus-visible
  ```
  ```ts
  // src/main.tsx
  import "focus-visible";
  ```
- **Or raise floor** to Safari 15.4.

### 4.4 Tailwind v4 `@custom-variant`
- **Requires:** Chrome 111+, Edge 111+, Firefox 128+, Safari 16.4+.
- **Conflict:** Stated min is Safari 14 → **Tailwind v4 cannot ship to Safari 14**.
- **Decision:** Either
  - **(a)** raise stated min to Safari 16.4 (most realistic — that's iOS 16.4, Sep 2023), or
  - **(b)** downgrade to Tailwind v3.

  **Recommended: (a)** — raise floor to Safari 16.4 / iOS 16.4.

---

## 5. Node.js polyfills

None required. All backends target Node ≥18 (some ≥20), and native `fetch`, `crypto.webcrypto`, `structuredClone`, `Array.at`, `Object.hasOwn` are all native in Node 18+.

**One-time cleanup:** Remove `node-fetch` imports (BUG-QA17-009) — it's a *polyfill leftover*, not a forward-compat polyfill.

---

## 6. Intl polyfills

### 6.1 `Intl.RelativeTimeFormat`
- **Used in:** *(not found)*. Verdict: **not needed now**. If added later, Safari 14+ has it natively.

### 6.2 `Intl.NumberFormat` with `notation: "compact"` / `unit` style
- **Supported:** Safari 14.1+.
- **Used in:** likely settings / dashboard — not audited individually.
- **Polyfill:** `@formatjs/intl-numberformat` if compact notation is used on Safari 14.0.
- **Install (conditional):**
  ```bash
  pnpm add @formatjs/intl-numberformat
  ```

### 6.3 `Intl.DateTimeFormat` with `dateStyle`/`timeStyle`
- **Supported:** Safari 14.1+.
- **Action:** If targeting Safari 14.0, use `@formatjs/intl-datetimeformat`. Otherwise skip.

### 6.4 Hebrew locale data
- **Status:** All modern browsers ship `he` locale. No polyfill needed.

---

## 7. Recommended `polyfills.ts` file

Suggested content for `AI-Task-Manager/artifacts/erp-app/src/polyfills.ts` (new file):

```ts
// QA-17 polyfills — load before app bootstrap.
// Kept minimal; see _qa-reports/QA-17-polyfills-needed.md for rationale.

import "core-js/features/array/at";
import "core-js/features/array/find-last";
import "core-js/features/array/find-last-index";
import "core-js/features/object/has-own";

// structuredClone polyfill — only on old Safari.
if (typeof globalThis.structuredClone !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sc = require("@ungap/structured-clone").default;
  (globalThis as any).structuredClone = (value: unknown) => sc(value);
}

// focus-visible polyfill — only if Safari <15.4.
import "focus-visible";
```

And in `main.tsx`:
```ts
import "./polyfills";
// ... rest of the bootstrap
```

**Devdependencies to add:**
```json
{
  "core-js": "^3.38.0",
  "@ungap/structured-clone": "^1.3.0",
  "focus-visible": "^5.2.0"
}
```

**Total bundle cost:** ~4-5 KB gzipped (only the tiny slices, not full core-js).

---

## 8. Decision: polyfill vs. raise-floor

The simpler alternative is to **raise the supported-browser floor** and drop all polyfills.

| Option | Min Safari | Min iOS | Polyfills needed | Bundle cost | Users lost |
|---|---|---|---|---|---|
| **A — Current (polyfill)** | 14.0 | 14.0 | core-js/at, structuredClone, focus-visible | +5 KB | 0% |
| **B — Recommended** | **15.4** | **15.4** | *(none)* | 0 | iPad (6th gen) users stuck at iPadOS 15.1 — est. <1% in Israel |
| **C — Tailwind v4 compatible** | **16.4** | **16.4** | *(none)* | 0 | iPhone 7/8/X stuck < 16.4 — est. <3% |

**QA-17 recommendation:** **Option B** — raise floor to Safari 15.4 / iOS 15.4.
- Most Israeli users on modern iPhones (12+) are on iOS 17+.
- Eliminates need for `Array.at` + `structuredClone` + `focus-visible` polyfills.
- Still allows Tailwind 3.x compatibility. **But Tailwind v4 `@custom-variant` in `erp-app/src/index.css:4` already requires Safari 16.4** — so either downgrade Tailwind or pick Option C.

**Final QA-17 recommendation:** **Option C — set floor to Safari 16.4 / iOS 16.4** to match the Tailwind v4 feature already in use. Document it in README and `browserslist`.

```json
"browserslist": [
  "Chrome >= 111",
  "Edge >= 111",
  "Firefox >= 128",
  "Safari >= 16.4",
  "iOS >= 16.4",
  "not dead"
]
```

---

## 9. Summary — What to install

### If keeping floor at Safari 14 (Option A):
```bash
pnpm --filter @workspace/erp-app add core-js @ungap/structured-clone focus-visible
```
Plus create `src/polyfills.ts` (see §7) and import from `main.tsx`.

### If raising floor to Safari 15.4 (Option B):
```bash
# nothing — but downgrade Tailwind to v3 OR raise to Option C.
```

### If raising floor to Safari 16.4 (Option C, **QA-17 recommended**):
```bash
# nothing to install.
```

Just add `browserslist` to `AI-Task-Manager/artifacts/erp-app/package.json` and keep Tailwind v4.

---

*End of QA-17 Polyfills list — 2026-04-11.*
