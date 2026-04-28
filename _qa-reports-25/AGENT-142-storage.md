# AGENT-142 — Object Storage Audit

**Date:** 2026-04-29 | **Agent:** 142 | **Scope:** Supabase Storage, S3, GCS — bucket policies, signed URLs, lifecycle, encryption at rest

---

## 1. Storage Backends Detected

| Backend | Status | Where | Used by |
|---|---|---|---|
| **GCS via Replit sidecar** | Active (primary) | `api-server/src/lib/objectStorage.ts` | Presigned-URL upload + private/public download |
| **Supabase Storage** | Enabled in `supabase/config.toml` (`[storage] enabled = true`), no buckets/policies in repo | client `@supabase/supabase-js` | None — only DB calls; storage API never invoked |
| **AWS S3** | Generator-only (template); not wired | `onyx-ai/agents/src/tools/fileUploadTool.ts` (`generateS3Storage`) | None at runtime |
| **Local disk (multer)** | Active (legacy) | `api-server/src/routes/{documents,dms}.ts` | Document/DMS uploads → `./uploads/documents` |
| **In-memory + local FS** | Active (dev tools) | `onyx-ai/agents/src/tools/fileUploadTool.ts` `uploadFile` | Workspace uploads |

The system has **two parallel upload paths in production code** (GCS presigned + multer-to-disk) with no single source of truth. The Supabase Storage capability is enabled but no bucket creation, RLS policy, or `storage.objects` rule lives anywhere in `supabase/migrations/` or repo SQL.

---

## 2. GCS (Replit Object Storage) — `api-server/src/lib/objectStorage.ts`

**Auth:** External-account credentials minted by Replit sidecar at `http://127.0.0.1:1106/token`. Hard-coded; will **fail outside Replit** with no fallback (sign call returns "make sure you're running on Replit"). Production deploy on GCP (per `DEPLOYMENT-RUNBOOK.md`) sets `GCS_BUCKET=bash44-uploads` + `GOOGLE_APPLICATION_CREDENTIALS=/opt/erp/sa-key.json` — those vars are NOT consumed by `objectStorage.ts`. **Gap: prod code path is dead unless Replit sidecar is reachable.**

**Bucket layout:**
- `PUBLIC_OBJECT_SEARCH_PATHS` — comma-separated GCS paths, served unauth via `GET /storage/public-objects/*`. No ACL check, no auth, `Cache-Control: public`.
- `PRIVATE_OBJECT_DIR` — single path; uploads go to `<dir>/uploads/<uuid>`.

**Bucket-level policy:** None defined in repo. Visibility is enforced **per-object via custom GCS metadata** (`custom:aclPolicy` JSON blob with `{owner, visibility}`). The bucket itself is assumed private; if misconfigured as public-read, ACL check is bypassed.

**Signed URLs:**
- PUT presigned via Replit sidecar `/object-storage/signed-object-url`, **TTL 900 s (15 min)**. Reasonable.
- No GET presigning — private downloads stream through Express (`GET /storage/objects/*` with auth + ACL check). Good (no URL leakage), bad (proxy bandwidth + no Range support beyond what `createReadStream` gives).
- 30-second `AbortSignal.timeout` on sign call. OK.

**ACL enforcement (`api-server/src/lib/objectAcl.ts`):**
- ACL written to object metadata **after** upload via async retry loop (5 attempts, 2s..10s backoff). **Race window:** until ACL lands, object exists with `null` policy. `canAccessObject` returns `false` on null policy → fails closed for non-owners. Owner check passes only if `aclPolicy.owner === userId` — but during the gap, owner can't read either. Acceptable but noisy.
- Owner stored as freeform string (`auth.userId || "anonymous"`). No tenant/org scoping — single-org assumption.
- `routes/storage.ts` has a **second** authorization branch for portal users: matches `supplier_documents.file_url LIKE %objectPath%`. Substring match on URL is fragile and could be spoofed if any other table column ever stores attacker-controllable similar strings — defense in depth weak.

**Lifecycle rules:** None. No bucket lifecycle config in repo (no `gcloud storage buckets update --lifecycle-file`, no Terraform/IaC). Orphan upload cleanup is not scheduled — failed uploads leave objects forever.

**Encryption at rest:** Implicit via GCS default (Google-managed keys, AES-256). No CMEK / KMS configuration. No `kmsKeyName` set on bucket or object. **Acceptable for default tier**, **insufficient for regulated data** (Israeli `tikun 13` / personal data).

---

## 3. Supabase Storage

`supabase/config.toml` enables storage but **zero artifacts**:
- No `storage.buckets` insert in any migration.
- No RLS policy on `storage.objects`.
- No `bucket_policies` / `allowed_mime_types` / `file_size_limit` config.
- Client (`techno-kol-ops/client/src/lib/supabase.ts`) uses `VITE_SUPABASE_ANON_KEY` directly in browser — fine for DB-with-RLS, but if storage is ever enabled here without policies, anon key would have full bucket access by default.

**Risk: enabled but unconfigured.** If anyone calls `supabase.storage.from('x').upload()` from the client, it will hit a server with no buckets, or worse — auto-created public bucket.

---

## 4. AWS S3

Only present as a **codegen template** (`generateS3Storage` writes `src/storage/s3.ts`). Hardcoded defaults: `S3_BUCKET=my-app-uploads`, `region=us-east-1`, signed URL TTL 3600s. No SSE, no bucket policy, no versioning. **Not deployed**, but if a future agent invokes the generator, the output ships an insecure baseline (no SSE, no public-block).

---

## 5. Local-disk uploads (`multer`) — `api-server/src/routes/{documents,dms}.ts`

- `uploadsDir = ./uploads/documents` — written into the API server container/pod working dir.
- Filename: `Date.now()-<rand>.<ext>` (predictable; not collision-safe across servers).
- 50 MB cap, MIME allowlist (PDF/Office/images). Good.
- **No object storage offload** — files live on the API pod's local disk. **Will be lost on container restart in k8s/Cloud Run**, no replication, no encryption beyond disk-level.
- DMS table has `is_legal_hold` enforcement (good — `routes/dms.ts:74`), but underlying file is on ephemeral disk.

---

## 6. Findings — Priority

| # | Severity | Finding |
|---|---|---|
| 1 | **HIGH** | Production deploy script (`DEPLOYMENT-RUNBOOK.md:305`) configures `GCS_BUCKET` + `GOOGLE_APPLICATION_CREDENTIALS`, but `objectStorage.ts` only knows the Replit sidecar. Outside Replit, all uploads fail. |
| 2 | **HIGH** | `routes/documents.ts` and `routes/dms.ts` write to local disk — files lost on restart, no encryption, no backup. |
| 3 | **MEDIUM** | Supabase Storage enabled in `config.toml` with zero bucket policies / RLS — latent footgun. |
| 4 | **MEDIUM** | No bucket lifecycle rules anywhere — orphan + abandoned uploads accumulate forever. |
| 5 | **MEDIUM** | ACL is per-object metadata, set async after upload. Race window where ACL is null. No tenant/org scoping in `owner` field. |
| 6 | **MEDIUM** | Portal-user authorization uses `LIKE %objectPath%` substring match on `supplier_documents.file_url` — fragile, weak isolation. |
| 7 | **LOW** | No CMEK/KMS encryption — relies on GCS default. Insufficient for Israeli personal-data + tax-doc retention. |
| 8 | **LOW** | No virus scanning, no MIME re-validation server-side after upload (client-declared `Content-Type` trusted). |
| 9 | **LOW** | Public objects served with `Cache-Control: public, max-age=3600` — fine, but no signed-URL fallback if a public path is reclassified private. |
| 10 | **LOW** | `routes/storage.ts:81` references `RequestUploadUrlBody.safeParse` as if Zod schema, but the type is declared as `interface` (line 5) — runtime call will throw. Bug. |

---

## 7. Recommendations

1. **Unify on GCS in production.** Replace Replit sidecar credential block with standard `Storage()` (uses `GOOGLE_APPLICATION_CREDENTIALS`); keep sidecar as dev fallback.
2. **Migrate `documents.ts` + `dms.ts`** to the same presigned-URL pattern instead of writing to local disk.
3. **Define bucket lifecycle:** auto-delete `<dir>/uploads/*` with no ACL after 24 h (catches abandoned presigned uploads); 7-year retention on documents per Israeli tax law.
4. **Either disable Supabase Storage** in `config.toml` or add bucket + RLS migration.
5. **Convert `RequestUploadUrlBody` interface to Zod schema** (or remove `.safeParse`).
6. **Replace LIKE-substring authorization** with explicit FK from `supplier_documents.object_id` → object record.
7. **Add CMEK** for buckets holding payroll/personal data; document key rotation.
8. **Server-side MIME sniff** (`file-type` lib) on the redirect-after-upload step before ACL is set.

---

**Files inspected:**
- `api-server/src/lib/objectStorage.ts`
- `api-server/src/lib/objectAcl.ts`
- `api-server/src/routes/storage.ts`
- `api-server/src/routes/documents.ts`
- `api-server/src/routes/dms.ts`
- `lib-client/object-storage-web/src/use-upload.ts`
- `onyx-ai/agents/src/tools/fileUploadTool.ts`
- `techno-kol-ops/client/src/lib/supabase.ts`
- `supabase/config.toml`
- `supabase/migrations/00055_docs_domain_complete.sql`
- `DEPLOYMENT-RUNBOOK.md` (line 305)
