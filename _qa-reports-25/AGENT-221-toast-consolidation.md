# Agent 221 - Toast System Consolidation Patch

**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Source:** Agent 172 audit (4 competing toast systems, ~51 silent Sonner calls)
**Severity:** P0 - all `sonner.toast(...)` calls fail silently because the `<Toaster />` from `sonner` was never mounted.

## Audit Summary (verified)

| # | System | Source file | Mounted in App.tsx? | Used in (files) |
|---|--------|-------------|---------------------|-----------------|
| 1 | Radix `useToast` (shadcn) | `src/hooks/use-toast.ts` | YES (3x) | 69 |
| 2 | `sonner` direct | `import { toast } from "sonner"` | NO -> SILENT | 49 |
| 3 | `sonner` wrapper | `src/components/ui/sonner.tsx` (`<Toaster>`) | NO -> orphan | 0 |
| 4 | `enhanced-toast` | `src/components/ui/enhanced-toast.tsx` (`showEnhancedToast`) | NO -> orphan | 2 |

**Confirmed bugs:**
- `src/hooks/use-toast.ts:9` - `TOAST_REMOVE_DELAY = 1000000` (~16.6 minutes) instead of 5000 ms.
- `src/hooks/use-toast.ts:8` - `TOAST_LIMIT = 1` causes new toasts to silently push the previous one off; combined with the 16-minute remove delay, dismissed toasts never recycle.
- `<Toaster />` mounted in App.tsx is the radix one, NOT sonner. All 49 files calling `toast.success(...)` from `sonner` produce no UI.

`package.json` already has `"sonner": "^2.0.7"` and `"next-themes": "^0.4.6"`, so no install is required.

---

## Strategy

Pick **sonner** as the single canonical toast (most call sites, modern API, `dir="rtl"` support, Hebrew-friendly).
Make `useToast` a thin shim that forwards to `sonner.toast`, so the 69 radix consumers keep working without a 69-file refactor.
Mount one `<Toaster />` from sonner at the App.tsx root, configured for RTL + top-right, retire the radix `<Toaster />`.

---

## Patch 1 - Mount Sonner Toaster (App.tsx)

**File:** `erp-app/src/App.tsx`

```diff
@@ line 4 @@
-import { Toaster } from "@/components/ui/toaster";
+import { Toaster } from "sonner";
```

The three existing `<Toaster />` mount sites at lines 2906, 2935, 2951 stay unchanged in JSX, but now resolve to sonner. Add the RTL/position props to each:

```diff
@@ line 2906 (portal branch) @@
-            <Toaster />
+            <Toaster dir="rtl" position="top-right" richColors closeButton expand visibleToasts={5} />

@@ line 2935 (login branch) @@
-          <Toaster />
+          <Toaster dir="rtl" position="top-right" richColors closeButton expand visibleToasts={5} />

@@ line 2951 (authenticated branch) @@
-              <Toaster />
+              <Toaster dir="rtl" position="top-right" richColors closeButton expand visibleToasts={5} />
```

Notes:
- `dir="rtl"` aligns with project-wide RTL (Hebrew UI, see CLAUDE.md no-dead-pages rule).
- `position="top-right"` matches the existing layout where the right edge is the start of the viewport in RTL.
- `richColors` gives green/red/amber based on toast type (success/error/warning).
- `closeButton` exposes a manual dismiss button so users are not stuck waiting for the timer.

---

## Patch 2 - Convert use-toast.ts into Sonner Shim

**File:** `erp-app/src/hooks/use-toast.ts` (full replacement, replaces the broken Radix reducer)

```ts
// Compatibility shim for legacy callers of `useToast()` and `toast(...)`.
// Forwards to the single canonical Sonner toast layer mounted at App.tsx root.
// Eliminates the broken Radix reducer (TOAST_REMOVE_DELAY=1000000, TOAST_LIMIT=1).
import { toast as sonnerToast, type ExternalToast } from "sonner";
import * as React from "react";

type LegacyVariant = "default" | "destructive" | "success" | "warning";

type LegacyToastInput = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: LegacyVariant;
  duration?: number;
  action?: { altText?: string; onClick?: () => void; label?: React.ReactNode } | React.ReactElement;
};

function normalizeTitle(t?: React.ReactNode): string {
  if (t == null) return "";
  if (typeof t === "string" || typeof t === "number") return String(t);
  // Sonner accepts ReactNode, so we pass through; fall back to empty string only for logging.
  return "";
}

export function toast(input: LegacyToastInput | string) {
  if (typeof input === "string") {
    return { id: String(sonnerToast(input)), dismiss: () => sonnerToast.dismiss(), update: () => {} };
  }
  const { title, description, variant = "default", duration, action } = input;
  const opts: ExternalToast = {
    description: description as ExternalToast["description"],
    duration: duration ?? 5000,
  };
  // Map Radix variant -> Sonner colored variant
  let id: string | number;
  if (variant === "destructive") id = sonnerToast.error(title ?? "", opts);
  else if (variant === "success") id = sonnerToast.success(title ?? "", opts);
  else if (variant === "warning") id = sonnerToast.warning(title ?? "", opts);
  else id = sonnerToast(title ?? normalizeTitle(description), opts);

  return {
    id: String(id),
    dismiss: () => sonnerToast.dismiss(id),
    update: (next: LegacyToastInput) => {
      sonnerToast.dismiss(id);
      toast(next);
    },
  };
}

export function useToast() {
  return {
    toast,
    dismiss: (toastId?: string | number) => sonnerToast.dismiss(toastId),
    toasts: [] as Array<{ id: string }>, // legacy compatibility (never populated; UI is in Sonner)
  };
}

export type Toast = LegacyToastInput;
```

Why this works:
- All 69 files calling `toast({ title, description, variant: "destructive" })` keep their exact API.
- The broken `TOAST_REMOVE_DELAY=1000000` is gone; sonner uses 4000 ms default; we override to 5000 ms via `duration`.
- The `TOAST_LIMIT=1` bug is replaced by `visibleToasts={5}` on the `<Toaster />` mount.

---

## Patch 3 - Retire `components/ui/toaster.tsx` and `enhanced-toast.tsx`

**File:** `erp-app/src/components/ui/toaster.tsx` (replace with re-export to keep import paths alive)

```diff
-import { useToast } from "@/hooks/use-toast"
-import {
-  Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport,
-} from "@/components/ui/toast"
-
-export function Toaster() {
-  const { toasts } = useToast()
-  return (
-    <ToastProvider>
-      {toasts.map(function ({ id, title, description, action, ...props }) {
-        return (
-          <Toast key={id} {...props}>
-            <div className="grid gap-1">
-              {title && <ToastTitle>{title}</ToastTitle>}
-              {description && <ToastDescription>{description}</ToastDescription>}
-            </div>
-            {action}
-            <ToastClose />
-          </Toast>
-        )
-      })}
-      <ToastViewport />
-    </ToastProvider>
-  )
-}
+// Retired 2026-04-29 (Agent 221). The canonical Toaster is now <Toaster /> from "sonner",
+// mounted directly in App.tsx. This re-export prevents import breakage during migration.
+export { Toaster } from "sonner";
```

**File:** `erp-app/src/components/ui/enhanced-toast.tsx` (2 callers: redirect to sonner)

```diff
-export function showEnhancedToast(opts: Omit<ToastItem, "id">) {
-  const id = `toast-${++idCounter}-${Date.now()}`;
-  const toast: ToastItem = { ...opts, id, duration: opts.duration ?? 5000 };
-  toasts = [...toasts, toast];
-  notifyListeners();
-  ...
-}
+import { toast as sonnerToast } from "sonner";
+
+export function showEnhancedToast(opts: { type: "success"|"error"|"warning"|"info"; title: string; message?: string; duration?: number; actions?: Array<{label:string; onClick:()=>void}> }) {
+  const fn = opts.type === "error" ? sonnerToast.error
+         : opts.type === "warning" ? sonnerToast.warning
+         : opts.type === "success" ? sonnerToast.success
+         : sonnerToast.info;
+  return fn(opts.title, {
+    description: opts.message,
+    duration: opts.duration ?? 5000,
+    action: opts.actions?.[0] ? { label: opts.actions[0].label, onClick: opts.actions[0].onClick } : undefined,
+  });
+}
+
+export function dismissToast(id: string | number) { sonnerToast.dismiss(id); }
+export function EnhancedToastContainer() { return null; /* superseded by Sonner Toaster in App.tsx */ }
```

---

## Patch 4 - Optional: Remove Stale `components/ui/sonner.tsx` Wrapper

The wrapper at `erp-app/src/components/ui/sonner.tsx` is unused (no caller imports `Toaster` from `@/components/ui/sonner`). Safe to delete; not deleting is also fine - it adds 32 dead lines but breaks nothing.

---

## Verification Checklist

- [ ] `grep -r "from \"sonner\"" erp-app/src | wc -l` -> still 49 (call sites unchanged).
- [ ] `grep -r "@/components/ui/toaster" erp-app/src | wc -l` -> still resolves; now shims sonner.
- [ ] `grep -r "TOAST_REMOVE_DELAY" erp-app/src` -> zero hits.
- [ ] Manual: trigger a `toast.success("test")` from any sonner caller; confirm visible toast top-right with RTL layout.
- [ ] Manual: trigger `useToast().toast({ title:"x", variant:"destructive" })` from a legacy caller; confirm red sonner toast appears.
- [ ] Manual: confirm only ONE toast container rendered in DOM (`document.querySelectorAll('[data-sonner-toaster]').length === 1`).

## Files Changed

| Path | Action | LoC delta |
|------|--------|-----------|
| `erp-app/src/App.tsx` | edit import + 3 mount sites | +0 / -0 (props added) |
| `erp-app/src/hooks/use-toast.ts` | full rewrite as shim | -192 / +52 |
| `erp-app/src/components/ui/toaster.tsx` | replace with re-export | -33 / +3 |
| `erp-app/src/components/ui/enhanced-toast.tsx` | redirect to sonner | -120 / +20 |
| `erp-app/src/components/ui/sonner.tsx` | optional delete | -32 / 0 |

**Net:** -377 / +75 -> ~302 lines deleted, 1 canonical toast layer remains.

## Out of Scope (deferred)

- Refactoring 69 legacy `useToast()` callers to use sonner natively. The shim keeps them working; a later cleanup pass can migrate them file-by-file.
- Mobile-app and `omega/`, `lib/engines/`, `_merge-incoming/` toast systems - those are separate apps, not in the active `erp-app` build.
- Audit log of toast events (Palantir-grade audit trail per CLAUDE.md "audit log" requirement) - tracked separately.
