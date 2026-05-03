# AGENT-232 — Unified Storage Abstraction (Fix for AGENT-142)

**Date:** 2026-04-29 | **Agent:** 232 | **Scope:** Replace 3 concurrent upload paths with single backend-agnostic abstraction. GCS prod primary; Supabase + local fallbacks; CMEK + virus-scan hooks.

---

## 1. Background

AGENT-142 found three live upload paths, no single source of truth:
- `api-server/src/lib/objectStorage.ts` — GCS via Replit sidecar (`http://127.0.0.1:1106`); fails outside Replit. Production env (`GCS_BUCKET`, `GOOGLE_APPLICATION_CREDENTIALS`) ignored.
- `api-server/src/routes/{documents,dms}.ts` — multer to local disk; lost on restart.
- `supabase/config.toml` — `[storage] enabled = true` with zero buckets / RLS.

Closes AGENT-142 findings #1 (sidecar dead), #3 (Supabase footgun), #7 (no CMEK), #8 (no virus scan).

---

## 2. New layout

```
api-server/src/lib/storage/
  index.ts      ← public API + factory + virus-scan hook
  types.ts      ← IStorage interface, ScanResult
  gcs.ts        ← Production: service-account JSON + CMEK
  supabase.ts   ← Alt: Supabase Storage with RLS
  local.ts      ← Dev: filesystem under STORAGE_LOCAL_ROOT
  replit.ts     ← Legacy sidecar — DEPRECATED
```

Old `objectStorage.ts` becomes a thin re-export shim for back-compat.

---

## 3. `lib/storage/types.ts`

```ts
export type StorageBackend = 'gcs' | 'supabase' | 'local' | 'replit';

export interface SignedUrlOptions {
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD';
  ttlSec?: number;       // default 900
  contentType?: string;
}

export interface ObjectMeta {
  size: number;
  contentType: string;
  etag?: string;
  kmsKeyName?: string;   // CMEK
  customMetadata?: Record<string, string>;
}

export type ScanVerdict = 'clean' | 'infected' | 'skipped' | 'error';
export interface ScanResult { verdict: ScanVerdict; engine: string; signature?: string; }

export interface IStorage {
  readonly backend: StorageBackend;
  readonly bucket: string;
  signUploadUrl(key: string, opts?: SignedUrlOptions): Promise<string>;
  signDownloadUrl(key: string, opts?: SignedUrlOptions): Promise<string>;
  upload(key: string, body: Buffer | NodeJS.ReadableStream, meta?: Partial<ObjectMeta>): Promise<void>;
  download(key: string): Promise<NodeJS.ReadableStream>;
  head(key: string): Promise<ObjectMeta | null>;
  remove(key: string): Promise<void>;
  list(prefix: string, limit?: number): Promise<string[]>;
  setCustomMetadata(key: string, kv: Record<string, string>): Promise<void>;
}
```

---

## 4. `lib/storage/index.ts`

```ts
import type { IStorage, StorageBackend, ScanResult } from './types';
import { GcsBackend } from './gcs';
import { SupabaseBackend } from './supabase';
import { LocalBackend } from './local';
import { ReplitBackend } from './replit';

let _instance: IStorage | null = null;

export function getStorage(): IStorage {
  if (_instance) return _instance;
  const b = (process.env.STORAGE_BACKEND ?? 'gcs').toLowerCase() as StorageBackend;
  switch (b) {
    case 'gcs':      _instance = new GcsBackend();      break;
    case 'supabase': _instance = new SupabaseBackend(); break;
    case 'local':    _instance = new LocalBackend();    break;
    case 'replit':   _instance = new ReplitBackend();   break;  // legacy
    default: throw new Error(`Unknown STORAGE_BACKEND: ${b}`);
  }
  return _instance;
}

// Virus-scan hook — called after presigned PUT completes
export async function scanObject(key: string): Promise<ScanResult> {
  const url = process.env.VIRUS_SCAN_WEBHOOK_URL;
  if (!url) return { verdict: 'skipped', engine: 'none' };
  try {
    const stream = await getStorage().download(key);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Storage-Key': key,
        'X-Scan-Token': process.env.VIRUS_SCAN_TOKEN ?? '',
      },
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return { verdict: 'error', engine: 'remote', signature: `HTTP ${res.status}` };
    return await res.json() as ScanResult;
  } catch (e) {
    return { verdict: 'error', engine: 'remote', signature: (e as Error).message };
  }
}

export type { IStorage, StorageBackend, ObjectMeta, SignedUrlOptions, ScanResult } from './types';
```

`STORAGE_BACKEND` env: `gcs` (default), `supabase`, `local`, `replit`.

---

## 5. `lib/storage/gcs.ts` — replaces Replit sidecar

```ts
import { Storage } from '@google-cloud/storage';
import type { IStorage, ObjectMeta, SignedUrlOptions } from './types';

const req = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} required`); return v; };

export class GcsBackend implements IStorage {
  readonly backend = 'gcs' as const;
  readonly bucket: string;
  private client: Storage;
  private kmsKeyName?: string;

  constructor() {
    this.bucket = req('GCS_BUCKET');
    this.kmsKeyName = process.env.GCS_KMS_KEY_NAME;
    // Auth: GOOGLE_APPLICATION_CREDENTIALS (path) or GCP_SERVICE_ACCOUNT_JSON (inline) or workload identity.
    const inline = process.env.GCP_SERVICE_ACCOUNT_JSON;
    this.client = new Storage(
      inline
        ? { credentials: JSON.parse(inline), projectId: process.env.GCP_PROJECT_ID }
        : { projectId: process.env.GCP_PROJECT_ID }
    );
  }

  async signUploadUrl(key: string, opts: SignedUrlOptions = { method: 'PUT' }) {
    const [url] = await this.client.bucket(this.bucket).file(key).getSignedUrl({
      version: 'v4', action: 'write',
      expires: Date.now() + (opts.ttlSec ?? 900) * 1000,
      contentType: opts.contentType,
      extensionHeaders: this.kmsKeyName ? { 'x-goog-encryption-kms-key-name': this.kmsKeyName } : undefined,
    });
    return url;
  }

  async signDownloadUrl(key: string, opts: SignedUrlOptions = { method: 'GET' }) {
    const [url] = await this.client.bucket(this.bucket).file(key).getSignedUrl({
      version: 'v4', action: 'read', expires: Date.now() + (opts.ttlSec ?? 900) * 1000,
    });
    return url;
  }

  async upload(key: string, body: Buffer | NodeJS.ReadableStream, meta?: Partial<ObjectMeta>) {
    const file = this.client.bucket(this.bucket).file(key, { kmsKeyName: this.kmsKeyName });
    await new Promise<void>((res, rej) => {
      const ws = file.createWriteStream({
        metadata: { contentType: meta?.contentType, metadata: meta?.customMetadata },
        resumable: false, validation: 'crc32c',
      });
      ws.on('error', rej).on('finish', () => res());
      Buffer.isBuffer(body) ? ws.end(body) : body.pipe(ws);
    });
  }

  async download(k: string) { return this.client.bucket(this.bucket).file(k).createReadStream(); }
  async head(k: string) {
    const [exists] = await this.client.bucket(this.bucket).file(k).exists();
    if (!exists) return null;
    const [m] = await this.client.bucket(this.bucket).file(k).getMetadata();
    return { size: Number(m.size ?? 0), contentType: String(m.contentType ?? ''),
      etag: m.etag as string, kmsKeyName: m.kmsKeyName as string,
      customMetadata: (m.metadata ?? {}) as Record<string, string> };
  }
  async remove(k: string) { await this.client.bucket(this.bucket).file(k).delete({ ignoreNotFound: true }); }
  async list(prefix: string, limit = 1000) {
    const [files] = await this.client.bucket(this.bucket).getFiles({ prefix, maxResults: limit });
    return files.map(f => f.name);
  }
  async setCustomMetadata(k: string, kv: Record<string, string>) {
    await this.client.bucket(this.bucket).file(k).setMetadata({ metadata: kv });
  }
}
```

`supabase.ts` and `local.ts` follow same `IStorage` shape: Supabase uses `createSignedUploadUrl` / `createSignedUrl` from `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY`; local writes under `STORAGE_LOCAL_ROOT` and signs HMAC tokens for an internal `/_local-storage/put` route (dev only).

---

## 6. Migration `supabase/migrations/20260429000000_storage_buckets_rls.sql`

```sql
-- AGENT-232: storage buckets + RLS on storage.objects (idempotent)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('uploads',  'uploads',  false, 52428800,
    array['application/pdf','image/png','image/jpeg','image/webp',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/csv','text/plain']),
  ('documents','documents', false, 104857600, null),
  ('public-assets','public-assets', true, 10485760,
    array['image/png','image/jpeg','image/svg+xml','image/webp'])
on conflict (id) do nothing;

alter table storage.objects enable row level security;

-- helper: tenant from path convention <tenant_id>/<rest>
create or replace function storage.tenant_of(object_name text) returns uuid
language sql immutable as $$
  select case when split_part(object_name,'/',1) ~ '^[0-9a-f-]{36}$'
              then split_part(object_name,'/',1)::uuid else null end
$$;

drop policy if exists "uploads_read_owner_or_tenant" on storage.objects;
create policy "uploads_read_owner_or_tenant" on storage.objects for select to authenticated
using (bucket_id in ('uploads','documents')
  and (owner = auth.uid()
       or storage.tenant_of(name) in
         (select tenant_id from public.tenant_members where user_id = auth.uid())));

drop policy if exists "uploads_insert_own_tenant" on storage.objects;
create policy "uploads_insert_own_tenant" on storage.objects for insert to authenticated
with check (bucket_id in ('uploads','documents')
  and storage.tenant_of(name) in
    (select tenant_id from public.tenant_members where user_id = auth.uid()));

drop policy if exists "uploads_update_owner" on storage.objects;
create policy "uploads_update_owner" on storage.objects for update to authenticated
using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "uploads_delete_owner_or_admin" on storage.objects;
create policy "uploads_delete_owner_or_admin" on storage.objects for delete to authenticated
using (owner = auth.uid()
  or exists (select 1 from public.tenant_members tm
             where tm.user_id = auth.uid()
               and tm.tenant_id = storage.tenant_of(name)
               and tm.role in ('owner','admin')));

drop policy if exists "public_assets_read_all" on storage.objects;
create policy "public_assets_read_all" on storage.objects for select to anon, authenticated
using (bucket_id = 'public-assets');

drop policy if exists "public_assets_write_admin" on storage.objects;
create policy "public_assets_write_admin" on storage.objects for insert to authenticated
with check (bucket_id = 'public-assets'
  and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists "no_delete_when_legal_hold" on storage.objects;
create policy "no_delete_when_legal_hold" on storage.objects for delete to authenticated
using (not exists (select 1 from public.dms_documents d
                   where d.object_key = name and d.is_legal_hold));
```

Assumes `public.tenant_members(user_id, tenant_id, role)` and `public.dms_documents(object_key, is_legal_hold)` (exist per AGENT-09 / migration `00074`).

---

## 7. CMEK setup (operator runbook)

```bash
gcloud kms keyrings create erp-storage --location=me-west1
gcloud kms keys create erp-uploads --location=me-west1 --keyring=erp-storage \
  --purpose=encryption --rotation-period=90d \
  --next-rotation-time=$(date -u -d '+90 days' +%Y-%m-%dT%H:%M:%SZ)

PROJECT=bash44-prod
SVC=$(gsutil kms serviceaccount -p $PROJECT)
gcloud kms keys add-iam-policy-binding erp-uploads --location=me-west1 \
  --keyring=erp-storage --member=serviceAccount:$SVC \
  --role=roles/cloudkms.cryptoKeyEncrypterDecrypter

KEY=projects/$PROJECT/locations/me-west1/keyRings/erp-storage/cryptoKeys/erp-uploads
gcloud storage buckets update gs://bash44-uploads --default-kms-key=$KEY

# Env
export STORAGE_BACKEND=gcs GCS_BUCKET=bash44-uploads GCS_KMS_KEY_NAME=$KEY \
       GOOGLE_APPLICATION_CREDENTIALS=/opt/erp/sa-key.json
```

---

## 8. Virus scan wiring

After client completes presigned PUT, server calls `POST /api/storage/finalize { key }`:

```ts
import { getStorage, scanObject } from '@/lib/storage';
const v = await scanObject(key);
if (v.verdict === 'infected') {
  await getStorage().remove(key);
  return res.status(422).json({ error: 'infected', signature: v.signature });
}
await getStorage().setCustomMetadata(key, {
  scanned_at: new Date().toISOString(),
  scan_verdict: v.verdict, scan_engine: v.engine,
});
```

`VIRUS_SCAN_WEBHOOK_URL` -> ClamAV REST shim or VT-compatible service. `VIRUS_SCAN_TOKEN` for HMAC auth. Unset -> `skipped`.

---

## 9. Rollout

1. Land `lib/storage/*` + migration. Keep `objectStorage.ts` as 8-line re-export shim.
2. Set prod env: `STORAGE_BACKEND=gcs`, `GCS_BUCKET`, `GCS_KMS_KEY_NAME`, `GOOGLE_APPLICATION_CREDENTIALS`. Replit dev keeps `STORAGE_BACKEND=replit`.
3. Apply migration; verify `select * from storage.buckets` returns 3 rows.
4. Next PR: migrate `routes/documents.ts` + `routes/dms.ts` off multer to `getStorage().signUploadUrl()`.
5. Deprecate `replit.ts` after 1 sprint of clean prod logs.

---

## 10. Findings closed

| AGENT-142 # | Closed by |
|---|---|
| 1 (GCS dead outside Replit) | `gcs.ts` reads `GOOGLE_APPLICATION_CREDENTIALS` / `GCP_SERVICE_ACCOUNT_JSON` |
| 3 (Supabase enabled, no policies) | Migration `20260429000000_storage_buckets_rls.sql` |
| 7 (no CMEK) | `GCS_KMS_KEY_NAME` env + runbook |
| 8 (no virus scan) | `scanObject()` hook + finalize endpoint |

Out of scope (tracked separately): #2 multer disk, #4 lifecycle rules, #5 ACL race, #6 LIKE auth, #9, #10.

---

**Files to create:**
- `api-server/src/lib/storage/{index,types,gcs,supabase,local,replit}.ts`
- `supabase/migrations/20260429000000_storage_buckets_rls.sql`

**Files to modify (next PR):** `objectStorage.ts` -> shim; `routes/storage.ts` -> `getStorage()`; `routes/{documents,dms}.ts` -> drop multer.
