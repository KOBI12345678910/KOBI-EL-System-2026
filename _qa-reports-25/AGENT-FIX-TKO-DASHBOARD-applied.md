# AGENT-FIX-TKO-DASHBOARD — Applied

## Error
TS2345 in `techno-kol-ops/client/src/pages/Dashboard.tsx` line 36:26
```
Argument of type '(prev: any[]) => any[]' is not assignable to parameter of type 'Alert[]'.
```

## Root Cause
`Dashboard.tsx` line 36 calls `setAlerts((prev: any[]) => [alert, ...prev])` (functional updater form), but `useStore`'s `setAlerts` was declared as `(a: Alert[]) => void` — array-only, not React-style.

## Fix (in `techno-kol-ops/client/src/store/useStore.ts`)

### Diff
```diff
   // Alerts
   alerts: Alert[];
-  setAlerts: (a: Alert[]) => void;
+  setAlerts: (a: Alert[] | ((prev: Alert[]) => Alert[])) => void;
   addAlert: (a: Alert) => void;
   resolveAlert: (id: string) => void;
...
   alerts: [],
-  setAlerts: (a) => set({ alerts: a }),
+  setAlerts: (a) => set((state) => ({ alerts: typeof a === 'function' ? a(state.alerts) : a })),
```

Two-line change. Type signature accepts both array and updater fn; implementation branches on `typeof a === 'function'`. `Alert` type structure unchanged. Existing `setAlerts(d)` call sites (Dashboard.tsx:51 etc.) continue to work since `Alert[]` is still accepted.

## Build Status

### Before
- `npx tsc --noEmit` → **TS2345** at Dashboard.tsx:36:26 (and a transitive failure in build).

### After
- `npx tsc --noEmit` → **clean (no output, exit 0)**. TS2345 resolved.
- `npm run build` → `tsc` step passes. `vite build` compiles successfully (1072 modules, dist emitted in 15s).
- Build still exits non-zero due to an **unrelated** vite-plugin-pwa error: `assets/index-DJ2G5b6F.js is 2.94 MB`, exceeds the 2 MiB workbox precache default. Pre-existing infrastructure issue requiring `workbox.maximumFileSizeToCacheInBytes` config (or code-splitting), not a TS issue and out of scope for this fix.

## Constraints Honored
- Minimal: 2 lines changed.
- `Alert` interface untouched.
- Functionality preserved (array path identical; new functional path mirrors React's `setState`).
