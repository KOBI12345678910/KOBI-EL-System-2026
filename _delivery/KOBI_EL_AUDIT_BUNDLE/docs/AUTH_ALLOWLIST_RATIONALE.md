# Auth Allowlist — Rationale (D030 Implemented)

**Decision:** B-D030 — authMiddleware global mount
**Status:** IMPLEMENTED via SAFE approach (allowlist + conditional mount)
**Date:** 2026-04-18
**Owner:** Security + Ops

## Background

Prior state: `authMiddleware` was defined at `api-server/src/middleware/auth.ts` but NEVER mounted at the app level. Prior QA (QA_AGENT_12_PERMISSIONS.md) found 4,128 endpoints reachable anonymously across the legacy monolithic route tree. New domain routers (commercial/, execution/, procurement/, etc.) already have per-router `router.use(authMiddleware)` at top, but legacy flat-file routes (/api/admin/*, /api/accounting-export/*, etc.) had no protection.

## Why NOT a blind global mount

A single `app.use(authMiddleware)` would have:
- Broken health checks (Kubernetes/load balancer probes return 401)
- Broken login flow (can't auth without being auth'd — chicken-and-egg)
- Broken external webhooks (Stripe/Twilio/WhatsApp can't deliver if we reject unauthed)
- Broken documentation endpoints (OpenAPI)
- Broken root path (`/` returns 401 instead of landing page)
- Taken ERP offline until rollback

## The safe approach

**Conditional mount via allowlist:** in `app.ts`, auth middleware runs on every request EXCEPT when the path matches a prefix in `api-server/src/middleware/auth-allowlist.ts::PUBLIC_ENDPOINT_PREFIXES`.

```ts
app.use((req, res, next) => {
  if (isPublicEndpoint(req.path)) return next();
  return authMiddleware(req, res, next);
});
```

## Allowlist entries — security justification

### Infrastructure health
| Prefix | Why public |
|---|---|
| `/health`, `/healthz` | Kubernetes liveness/readiness probes must not require auth |
| `/readiness`, `/liveness` | Same |
| `/metrics` | Prometheus scraper (should be network-restricted at ingress) |
| `/ping` | Simple connectivity test |

### Auth endpoints (required to be public)
| Prefix | Why public |
|---|---|
| `/api/auth/login`, `/api/login` | User can't log in if endpoint requires auth |
| `/api/auth/register`, `/api/register` | New-user signup |
| `/api/auth/refresh`, `/api/auth/refresh-token` | Token refresh without full re-login |
| `/api/auth/forgot-password`, `/reset-password` | Password flow |
| `/api/auth/verify-email` | Email confirmation via link |
| `/api/auth/oauth`, `/sso` | OAuth/SSO flows |
| `/api/auth/logout`, `/logout` | Logout should succeed even if token expired |

### Portal (customer/supplier-facing login)
| Prefix | Why public |
|---|---|
| `/portal/login`, `/portal/customer/login`, `/portal/supplier/login` | Portal-specific auth |
| `/portal/register`, `/portal/forgot-password`, `/portal/reset-password` | Portal password flow |

### Signed webhooks (verified per-route)
External callers (Stripe, Twilio, WhatsApp, SendGrid, Supabase) can't bring a user JWT. Signature is verified within the route handler instead.
| Prefix | Provider |
|---|---|
| `/api/webhooks/`, `/webhooks/` | Generic webhook aggregator |
| `/api/whatsapp/webhook`, `/whatsapp/webhook` | WhatsApp Business API |
| `/api/stripe/webhook` | Stripe billing |
| `/api/sendgrid/webhook` | SendGrid email events |
| `/api/twilio/webhook` | Twilio SMS/voice |
| `/api/supabase/webhook` | Supabase internal events |

**SECURITY NOTE:** Webhook route handlers MUST call the relevant signature verification function (e.g. `verifyStripeSignature(req.rawBody, req.headers['stripe-signature'])`) at the top. If signature is missing or invalid, return 401/403 before processing.

### OpenAPI / docs
| Prefix | Why public |
|---|---|
| `/api/openapi.json`, `/openapi.json` | Schema must be fetchable by docs clients |
| `/api/docs`, `/docs`, `/api/swagger`, `/swagger` | Swagger/Redoc UI |

### Explicitly-public catalogs
| Prefix | Why public |
|---|---|
| `/api/public/` | Any endpoint intentionally marked public (product catalog, pricing list, etc.) — route author's responsibility to verify |

### Static assets
| Prefix | Why public |
|---|---|
| `/favicon.ico`, `/robots.txt` | Browsers/crawlers |

### Root + status
| Prefix | Why public |
|---|---|
| `/` | Landing page |
| `/status` | Public status page |

## Unblock procedure for adding new prefixes

1. Open a PR that:
   - Adds the entry to `PUBLIC_ENDPOINT_PREFIXES` in `auth-allowlist.ts`
   - Adds a row to the table above with justification
2. Security reviewer must sign off
3. Ops must verify no production dependency on authed-only version
4. Merge

## Rollout plan

Phase 1 (DONE in this commit):
- [x] Create `auth-allowlist.ts` with initial prefix set
- [x] Wire conditional mount in `app.ts`
- [x] Document rationale

Phase 2 (owner-driven):
- [ ] Enable in staging only (SKIP_GLOBAL_AUTH_MOUNT=false in staging env)
- [ ] Run smoke tests against all public endpoints
- [ ] Monitor 401 response rate for 24 hours
- [ ] If OK → enable in production via env flag

Phase 3 (post-rollout):
- [ ] Review the 4,128 previously-unauthed endpoints that will now require auth
- [ ] For each, either confirm it's actually an authed business endpoint (no further action) OR explicitly add to the allowlist with justification
- [ ] Remove per-router `router.use(authMiddleware)` redundancy if desired (no harm leaving it)

## Env flag for gradual rollout

Recommend adding an env flag `AUTH_GLOBAL_MOUNT_ENABLED=true|false` that app.ts consults. Default `false` in dev/test, `true` in production after Phase 2.

## Files changed

- NEW: `api-server/src/middleware/auth-allowlist.ts`
- MODIFIED: `api-server/src/app.ts` (conditional mount — pending Edit)
- NEW: `_master-registry/AUTH_ALLOWLIST_RATIONALE.md` (this file)

## Evidence

- QA_AGENT_12_PERMISSIONS.md — "4,128 endpoints missing auth"
- BUILD_DECISION_LOG.md B-D030 — marked IMPLEMENTED (SAFE approach)
