# AGENT-178 — User Onboarding Audit

**Scope:** signup -> email verify -> tenant setup -> first user -> product tour
**Date:** 2026-04-29
**Branch:** claude/objective-merkle-40ff93

## TL;DR

The system has a sophisticated multi-step **OnboardingWizard** (welcome -> organization -> industry -> recommended modules -> customize -> launch) plus a **Driver.js product tour**, but the canonical `AI-Task-Manager` deployment is missing the wizard, the wizard's API contract, public signup, and email verification. What ships today is an **admin-provisioned** model: SuperAdmin creates accounts, a Hebrew "welcome" email goes out (only if Gmail OAuth is connected), users log in, and a 12-step Driver.js tour fires once. There is a working sample-data option behind a flag.

## 1. Files inventory

| Concern | Path | Status |
|---|---|---|
| Server signup | `AI-Task-Manager/artifacts/api-server/src/routes/auth.ts` (lines 104-136) | Admin-only; `/auth/public-register` returns 403 (line 259-261) |
| Register impl | `AI-Task-Manager/artifacts/api-server/src/lib/auth.ts` (lines 180-232) | OK; sends welcome email via Gmail OAuth |
| Welcome email | `AI-Task-Manager/artifacts/api-server/src/lib/gmail-service.ts` (line 439 `sendWelcomeEmail`) | Skips silently if no Gmail connection (line 455) |
| Login + MFA | `AI-Task-Manager/artifacts/erp-app/src/pages/login.tsx` | OK (login, Google SSO, forgot-password, MFA) |
| Tenant wizard (UI) | `_merge-incoming/.../mrkt-mpqdt-tknv-kl-vzy-2026/artifacts/erp-app/src/pages/onboarding-wizard.tsx` | **NOT in canonical `AI-Task-Manager`** |
| Product tour | `AI-Task-Manager/artifacts/erp-app/src/components/onboarding-tour.tsx` | OK; mounted in `App.tsx:462` |
| Onboarding center (admin) | `AI-Task-Manager/artifacts/erp-app/src/pages/settings/sections/onboarding-center.tsx` | OK; FALLBACK static data + `/api/settings/onboarding_center` |
| HR onboarding-tasks | `AI-Task-Manager/artifacts/erp-app/src/pages/hr/onboarding.tsx` | New-employee checklists (HR scope, not user signup) |
| DB schema | `AI-Task-Manager/lib/db/src/schema/onboarding-checklists.ts` | Per-employee onboarding only |
| `email_verified` column | `AI-Task-Manager/lib/db/src/schema/security.ts:11` | Exists ONLY on `user_mfa.email_verified` (MFA email factor), not on `users` |
| Sample data | `AI-Task-Manager/artifacts/api-server/src/seed-data.ts` | Gated by `ENABLE_SEED=true` env + admin route `/seed-data` (`module-path-aliases.ts:984`) |
| Seed SQL | `AI-Task-Manager/artifacts/api-server/seed-factory-data.sql` | 200 employees, 19 INSERT blocks (factory demo) |

## 2. Flow walkthrough vs spec

### 2.1 Signup
- **Spec ask:** public signup
- **Reality:** `POST /api/auth/register` requires SuperAdmin token (auth.ts:104-118). `/auth/public-register` is a stub returning 403. There is **no self-service signup form** in `erp-app/src/pages/`.
- **Drop-off:** New tenants must contact a sysadmin out-of-band before they ever see the UI.

### 2.2 Email verify
- **Spec ask:** signup -> verify email link
- **Reality:** No verification token table, no `/api/auth/verify-email` route, no `email_verified` column on `users`. The only email-verification logic is for the MFA *email factor* (`user_mfa.email_verified`, `mfa.ts:50`). Welcome email contains the user's *plaintext password* (auth.ts:217-222 -> `sendWelcomeEmail({ password })`).
- **Drop-off:** Anyone can register a typo'd email and the account still works. Welcome email also a security smell (plaintext password in transit).

### 2.3 Tenant setup
- **Spec ask:** new tenant picks org / creates workspace
- **Reality:** A polished 6-step `OnboardingWizard` exists (welcome -> organization -> industry -> recommended modules -> customize -> launch) with domain auto-match, "join existing org" with admin-approval flow, and pending-request handling (lines 142-213) — but it lives only in the legacy Replit artifact (`_merge-incoming/.../mrkt-mpqdt-tknv-kl-vzy-2026/...`). **It is not imported anywhere in the canonical `AI-Task-Manager/artifacts/erp-app/src/App.tsx`** (grep for `OnboardingWizard` returns nothing in the active codebase).
- **Required APIs (none of which exist in canonical api-server):**
  - `GET /api/auth/onboarding/organizations` — domain match + joinable list
  - `POST /api/auth/onboarding/organization` — attach to org or request join
  - `POST /api/auth/onboarding/cancel-join-request`
  - `GET /api/marketplace/recommended/:industry`
  - `POST /api/marketplace/onboarding`
- **Drop-off:** Tenant setup is dead code. New users land in an empty system with no industry/module preselection.

### 2.4 First user
- **Spec ask:** first user becomes admin and bootstraps the org
- **Reality:** `getUserCount()` exists in `lib/auth.ts` and `auth.ts` references `hasSuperAdminRole`, but there is no first-user-becomes-admin path. SuperAdmin is set explicitly via `isSuperAdmin: true` on register (auth.ts:118, only grantable by an existing SuperAdmin) or via `company_roles.isAdmin` job-title mapping (lib/auth.ts:187-195). Cold-start has chicken-and-egg.
- **Drop-off:** Bootstrap requires DB seeding or running seed scripts before the first login is possible. No "first user creates the workspace" UX.

### 2.5 Product tour
- **Spec ask:** guided tour for first login
- **Reality:** Works. `onboarding-tour.tsx` uses Driver.js v1, has 12 steps for admins / 5 for employees, RTL Hebrew, fires 1.5s after login if not yet completed (effect at line 216-222), persists to `localStorage.erp_onboarding_done_v1_${userId}`, and has a `useRestartTour()` hook for replay (line 227).
- **Drop-off risks:**
  - Tour gating uses `localStorage` only — clearing browser storage replays the tour. No server-side completion record.
  - Tour anchors like `[data-tour='finance']`, `[data-tour='hr']`, `[data-tour='production']` are not verified to exist in the new sidebar; if anchor missing, Driver.js silently skips with no fallback.
  - Tour fires while React is still mounting heavy lazy-loaded routes; the 1500ms timer is fragile under slow first-paint.

## 3. Sample data option

- Working but hidden:
  - File: `AI-Task-Manager/artifacts/api-server/src/seed-data.ts`
  - Gate 1: env `ENABLE_SEED=true` (line 15)
  - Gate 2: admin-only route exposed via `module-path-aliases.ts:984` (`POST /seed-data` or similar)
  - Content: real Hebrew Israeli factory data (200 employees, POs, leave requests, 19 tables)
- **No UI surface** in the wizard or onboarding center exposes "load demo data" as a checkbox during signup. A first-time admin has no documented way to discover this.

## 4. Drop-off summary

| # | Step | Drop-off cause | Severity |
|---|---|---|---|
| 1 | Signup | No public signup; admin must pre-create user | P0 |
| 2 | Email verify | No verification flow; plaintext password emailed | P0 (security) |
| 3 | Tenant setup | Wizard exists but not wired; APIs missing | P0 |
| 4 | First user | No bootstrap path; SuperAdmin must pre-exist | P1 |
| 5 | Product tour | localStorage-only, anchor dependency, fires too early | P2 |
| 6 | Sample data | Hidden behind env + admin route, no UX surface | P1 |

## 5. Recommendations

**P0 — must-fix to onboard a new tenant end-to-end:**
1. Port `_merge-incoming/.../onboarding-wizard.tsx` into `AI-Task-Manager/artifacts/erp-app/src/pages/onboarding-wizard.tsx` and gate it on `user.organization_id == null` in `App.tsx`.
2. Implement the 5 missing APIs (`/auth/onboarding/organizations`, `/auth/onboarding/organization`, `/auth/onboarding/cancel-join-request`, `/marketplace/recommended/:industry`, `/marketplace/onboarding`).
3. Add `users.email_verified` column + `email_verification_tokens` table; gate login on `email_verified=true` for self-signup users.
4. Replace plaintext-password welcome email with a "set your password" magic-link.

**P1:**
5. Enable `/api/auth/public-register` behind a per-tenant feature flag, default off for production but on for trial signups.
6. Add a "Load sample data" toggle on the wizard "launch" step that hits the existing `/seed-data` route.
7. First-user bootstrap: if `getUserCount()==0`, allow `/auth/register` without SuperAdmin token and grant the new user `isSuperAdmin=true` on the same call.

**P2:**
8. Persist tour completion server-side (`users.tour_completed_at`) and fall back to localStorage.
9. Verify all `data-tour` selectors exist in current sidebar; add `onError` callback to Driver.js to skip and continue rather than silently failing.
10. Replace the 1500ms timer with a `requestIdleCallback` + sentinel-element wait.

## 6. Out-of-scope notes

- `pages/hr/onboarding.tsx` and `lib/db/src/schema/onboarding-checklists.ts` are about **employee** onboarding (new-hire HR checklists), not user/tenant onboarding. They are correctly named per HR domain but easily confused.
- `settings/sections/onboarding-center.tsx` is an admin configuration page for training tracks; its checklist UI is fully client-state with optional `/api/settings/onboarding_center` backing — no impact on signup flow.
