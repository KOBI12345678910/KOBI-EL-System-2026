# AGENT-172 — Toast / Notification / Banner UX Audit

**Date:** 2026-04-29 | **Scope:** `erp-app/` (primary client). Findings apply to all sibling `mockup-sandbox` / `gps-app` / `cloud-ide` packages that share the stack (sonner ^2.0.7).

## 1. Library inventory — FOUR competing toast systems mounted simultaneously

| # | System | File | Mechanism | Status |
|---|--------|------|-----------|--------|
| 1 | **shadcn/Radix `useToast`** | `src/hooks/use-toast.ts` + `src/components/ui/toaster.tsx` + `src/components/ui/toast.tsx` | `@radix-ui/react-toast`, in-memory reducer, `<Toaster />` mounted **3x** in `App.tsx` (portal / login / authed). | Primary — `toast({title, description, variant})` used by ~30 files |
| 2 | **Sonner** | `src/components/ui/sonner.tsx` (re-export) | `sonner` ^2.0.7 — `<Toaster />` component exists but **NOT mounted anywhere in `App.tsx` or `layout.tsx`**. | DEAD CODE — installed, themed, never rendered. `toast.success/error/info` calls in 20 files **silently no-op**. |
| 3 | **EnhancedToast (custom)** | `src/components/ui/enhanced-toast.tsx` | Module-level singleton + framer-motion. Mounted via `<EnhancedToastContainer />` in `layout.tsx:2355`. | Active — `showEnhancedToast({type,title,message,actions})` |
| 4 | **AlertToast (custom)** | `src/components/notifications/alert-toast.tsx` | Driven by `useRealtimeAlerts` SSE/WS hook + framer-motion + WebAudio beeps. Mounted in `layout.tsx:2354`. | Active — pushes server-side notifications |

**Critical:** the Sonner re-export is consumed by `pages/settings/api-keys.tsx`, `quality/*`, `production/work-order-manager.tsx`, `automation/smart-*.tsx`, `ai/quick-actions.tsx`, `ai/prompt-library.tsx`, `module-builder/*`, etc. (51 calls across 20 files counted). None of these toasts ever appear on screen.

## 2. Position / RTL audit

| System | Viewport position | RTL handling |
|--------|-------------------|--------------|
| Radix Toaster | `top-0 ... sm:bottom-0 sm:right-0` (toast.tsx:17) | NO `dir="rtl"` on viewport. Swipe-out animation slides to `right-full` — wrong side for Hebrew. |
| Sonner | Default top-right (unconfigured) | No `dir="rtl"`, no `position` prop. Would mount in LTR top-right if ever rendered. |
| EnhancedToast | `fixed top-20 left-6` (good for RTL — top-start in he) | `dir="rtl"` set on each toast (line 104). Container itself missing `dir`. |
| AlertToast | `fixed bottom-4 left-4` (consistent with Hebrew start-edge) | `dir="rtl"` on container (line 92). |

Inconsistency: messages from the **same user action** can appear in 3 different screen corners depending on which API the developer reached for.

## 3. Accessibility (WCAG 2.1 / aria-live)

| System | `role` / `aria-live` | Status |
|--------|----------------------|--------|
| Radix Toaster | Provided by Radix primitive (`role=status` / `aria-live=polite` injected by `<ToastProvider>`). | OK by default. |
| Sonner | Provided by sonner internals when mounted. | Moot — never mounted. |
| **EnhancedToast** | NO `role`, NO `aria-live`, NO `aria-atomic` on container or toast. Close button has no `aria-label`. | FAIL — invisible to screen readers. |
| **AlertToast** | Same. WebAudio beep is the only non-visual signal; users with audio off get no feedback. Close button no `aria-label`. Hebrew "קריטי" badge has no `aria-label`/`role`. | FAIL — critical alerts inaudible to AT. |

Grep across `erp-app/src` for `aria-live` returns **zero** results in any toast-related file. Only `ui/alert.tsx`, `ui/field.tsx`, `ui/spinner.tsx` use `role="alert"`/`role="status"`.

## 4. Dismissibility & queue behavior

- **Radix `useToast`**: `TOAST_LIMIT = 1` (use-toast.ts:8) — **only one toast at a time, all others dropped**. `TOAST_REMOVE_DELAY = 1_000_000` ms (~16.6 minutes) — toasts effectively never auto-dismiss; user must click X. Bug imported verbatim from shadcn boilerplate.
- **Sonner**: defaults (4s, max 3) — irrelevant, not mounted.
- **EnhancedToast**: duration default 5000ms, container caps at last 5 (`slice(-5)`), auto-dismiss via `setTimeout` (no pause-on-hover, no pause-on-focus). Manual close via X button works.
- **AlertToast**: hard-cap of 5 toasts (`slice(0, 5)`), durations per priority (10s critical / 7s high / 5s normal). No queue overflow indicator. No pause-on-hover.

No deduplication anywhere — same realtime event can push multiple identical toasts.

## 5. Hebrew content

- All custom toast UI is built with Hebrew strings (`קריטי`, `התראה חדשה`, `עכשיו`, `עבור לרשומה`).
- Radix/shadcn-driven `toast({title, description})` callers also write Hebrew (34+ matches for `title: "[Hebrew]"`). Works correctly given Radix doesn't impose direction.
- No i18n layer — strings are hard-coded; no English fallback for non-Hebrew users.

## 6. Visual / variant consistency

| Need | Radix toast | Enhanced | AlertToast |
|------|-------------|----------|-----------|
| success | only `default` & `destructive` (toast.tsx:30) — no success variant | success/error/warning/info | priority-based (critical/high/normal/low) |
| icon | none built-in | lucide icon per type | lucide icon per category |
| action button | `ToastAction` exists, rarely used | `actions[]` array | single `actionUrl` link |
| progress bar | none | yes (framer-motion) | none |

A "success" toast via Radix renders as plain bordered card with no green / no checkmark — visually indistinguishable from info.

## 7. Top issues (priority-ordered)

1. **P0 — 51 toast calls silently no-op.** All `import { toast } from "sonner"` callers (e.g. `api-keys.tsx`, `work-order-manager.tsx`, all 4 `quality/*.tsx`, `smart-notification-engine.tsx`) produce nothing because Sonner's `<Toaster>` is never mounted. Pick ONE: either mount Sonner and migrate, or replace these imports with `@/hooks/use-toast`.
2. **P0 — `TOAST_LIMIT = 1` and `TOAST_REMOVE_DELAY ≈ 16 min`** in `use-toast.ts`. Lowers throughput to one message and keeps stale toasts mounted for 16 minutes. Change to ~3 and 5000ms.
3. **P1 — Custom toasts have no `aria-live`/`role`/`aria-label`** on close buttons. Wrap container in `<div role="region" aria-live="polite" aria-label="התראות">`; add `aria-label="סגור התראה"` to X button.
4. **P1 — Radix Toaster viewport not RTL-aware**: swipe direction & corner are LTR. Add `dir="rtl"` to `<ToastViewport>` and flip `slide-out-to-right-full` to `slide-out-to-left-full` for he locale.
5. **P2 — No pause-on-hover/focus** in EnhancedToast or AlertToast — violates WCAG 2.2.1 (timing adjustable) for users who need more reading time.
6. **P2 — Three viewports, three corners** (top-right via Radix, top-left via Enhanced, bottom-left via AlertToast). Consolidate to one position; Hebrew convention = top-start = top-right visually since RTL flips.
7. **P2 — No deduplication** in AlertToast; bursty SSE pushes can flood the queue past the 5-cap.
8. **P3 — `success` variant missing** from Radix `toast.tsx` — devs work around by using default (no green) or pulling from sonner (no-op).

## 8. Recommended consolidation

Pick **Sonner** (already a dep, RTL & a11y supported via `dir`/`position` props):
```tsx
// erp-app/src/App.tsx — replace all <Toaster /> mounts with:
<Toaster dir="rtl" position="top-right" richColors closeButton
         toastOptions={{ duration: 5000 }} expand visibleToasts={3} />
```
Then codemod: `@/hooks/use-toast` → `sonner`, retire `EnhancedToast`/`AlertToast` containers (keep AlertToast's realtime hook but pipe into `toast.custom()`). One position, one queue, one a11y story.

## 9. Files inspected

- `erp-app/src/App.tsx:2906,2935,2951` (3 Radix Toaster mounts)
- `erp-app/src/components/layout.tsx:2354-2355`
- `erp-app/src/hooks/use-toast.ts`
- `erp-app/src/components/ui/{toast.tsx,toaster.tsx,sonner.tsx,enhanced-toast.tsx}`
- `erp-app/src/components/notifications/alert-toast.tsx`
- 20 callers of `toast.*` from sonner; 30+ callers of Radix `toast()`
