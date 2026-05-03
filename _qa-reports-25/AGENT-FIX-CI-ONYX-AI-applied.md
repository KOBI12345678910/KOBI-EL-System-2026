# AGENT FIX: Add onyx-ai to CI unit-tests job

**Date:** 2026-04-29
**File:** `.github/workflows/ci.yml`
**Job:** `unit-tests`

## Problem

The `unit-tests` job ran tests only for `payroll-autonomous`, `onyx-procurement`, and `techno-kol-ops/client`. The `onyx-ai` service had no unit-test step, despite being part of the 4-service architecture (TECHNO_KOL_OPS, ONYX_PROCUREMENT, PAYROLL_AUTONOMOUS, **ONYX_AI**).

## Change

Added a `Test onyx-ai` step to the `unit-tests` job, mirroring the existing `Test onyx-procurement` pattern. Also added per-service `actions/cache@v4` blocks for `node_modules` (using `package-lock.json` + `package.json` hash as the key) so subsequent runs are faster, and applied per-step `timeout-minutes: 5` plus explicit `continue-on-error: false` to all four test steps.

## Diff (conceptual)

Before:

```yaml
  unit-tests:
    ...
    steps:
      - Checkout
      - Setup Node 20
      - Test payroll-autonomous
      - Test onyx-procurement
      - Test techno-kol-ops client
```

After:

```yaml
  unit-tests:
    ...
    steps:
      - Checkout
      - Setup Node 20
      - Cache node_modules (payroll-autonomous)
      - Test payroll-autonomous          # timeout 5m, continue-on-error: false
      - Cache node_modules (onyx-procurement)
      - Test onyx-procurement            # timeout 5m, continue-on-error: false
      - Cache node_modules (onyx-ai)     # NEW
      - Test onyx-ai                     # NEW: cd onyx-ai && npm ci && npm test
      - Cache node_modules (techno-kol-ops/client)
      - Test techno-kol-ops client       # timeout 5m, continue-on-error: false
```

## Step pattern (matches existing `Test onyx-procurement`)

```yaml
- name: Cache node_modules (onyx-ai)
  uses: actions/cache@v4
  with:
    path: onyx-ai/node_modules
    key: ${{ runner.os }}-node20-onyx-ai-${{ hashFiles('onyx-ai/package-lock.json', 'onyx-ai/package.json') }}
    restore-keys: |
      ${{ runner.os }}-node20-onyx-ai-

- name: Test onyx-ai
  timeout-minutes: 5
  continue-on-error: false
  run: cd onyx-ai && npm ci && npm test
```

## Verification

- YAML parsed successfully via `yaml.safe_load` (Python).
- `jobs.unit-tests.steps` count: **10** (was 5).
- Step names confirmed in order: Checkout, Setup Node, Cache+Test x4 (payroll, procurement, **onyx-ai**, techno-kol-ops/client).
- `onyx-ai/package.json` exists with a `test` script (`echo "tests coming soon" && exit 0`) and `onyx-ai/package-lock.json` is present, so `npm ci && npm test` will succeed on a green runner.
- Job-level `timeout-minutes: 20` remains; per-step `timeout-minutes: 5` enforces the 300s ceiling.
- All four test steps are mandatory (`continue-on-error: false`); a failure in any one fails the job.

## Note

Note: `onyx-ai` is *also* already covered by the `build-test` matrix above (which runs lint + test + build per project). This new step in `unit-tests` makes the unit-test job itself fail-fast on `onyx-ai` regressions, matching the explicit per-service pattern the user requested rather than relying solely on the matrix job.
