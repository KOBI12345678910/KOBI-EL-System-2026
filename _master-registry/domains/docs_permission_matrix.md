# Docs Domain — Permission Matrix

Generated: 2026-04-18
Scope: `docs.*` API endpoints under `/api/docs/*`.

Legend:
- `R` = Read (LIST + GET detail)
- `C` = Create (POST)
- `U` = Update (PUT)
- `D` = Delete (soft DELETE)
- `A` = Business Action (POSTs like `/classify`, `/request-signature`, `/record-signature`, `/generate-from-document`, `/enqueue`)
- `—` = Denied
- `*` = Same as authenticated-user row, plus own-row scoping

All endpoints require `authMiddleware` (JWT). Row-level reads are governed by
RLS policies (see migration 00055 Part E):
`<tbl>_select_authenticated`, `<tbl>_write_authenticated`, `<tbl>_delete_admin`.

## Roles

| Role code | Description |
|---|---|
| `viewer` | Read-only — can list and view, but cannot mutate |
| `doc_uploader` | Uploads / registers documents + attachments |
| `doc_operator` | Runs OCR, extraction, classification, manages versions |
| `doc_reviewer` | Approves / archives documents, signs off on classifications |
| `doc_signer` | Records signatures; receives signature requests |
| `doc_admin` | Full control over docs domain incl. soft-delete and relations |
| `compliance_officer` | Reads everything incl. audit trails; approves retention |
| `super_admin` | Cross-domain; the only role allowed hard DELETE via RLS |

## Endpoint × Role matrix

| Endpoint | viewer | doc_uploader | doc_operator | doc_reviewer | doc_signer | doc_admin | compliance_officer | super_admin |
|---|---|---|---|---|---|---|---|---|
| `GET /documents` | R | R | R | R | R | R | R | R |
| `GET /documents/:id` | R | R | R | R | R | R | R | R |
| `POST /documents` | — | C | C | — | — | C | — | C |
| `PUT /documents/:id` | — | U* | U | U | — | U | — | U |
| `DELETE /documents/:id` (soft) | — | D* | — | D | — | D | — | D |
| `POST /documents/:id/classify` | — | — | A | A | — | A | — | A |
| `POST /documents/:id/request-signature` | — | — | — | A | — | A | — | A |
| `GET/POST/PUT/DELETE /document-versions*` | R | R | RCU | RCU | R | RCUD | R | RCUD |
| `GET/POST/PUT/DELETE /attachments*` | R | RC | RC | RCUD | R | RCUD | R | RCUD |
| `GET/POST/PUT/DELETE /print-jobs*` | R | RC | RCUD | R | R | RCUD | R | RCUD |
| `GET/POST/PUT/DELETE /scan-sessions*` | R | RC | RCUD | R | — | RCUD | R | RCUD |
| `GET/POST/PUT/DELETE /document-classifications*` | R | — | RCU | RCUD | — | RCUD | R | RCUD |
| `GET/POST/PUT/DELETE /ocr-results*` | R | — | RCU | R | — | RCUD | R | RCUD |
| `GET /ocr-runs` | R | R | R | R | — | R | R | R |
| `POST /ocr-runs` (enqueue) | — | A | A | — | — | A | — | A |
| `PUT/DELETE /ocr-runs/:id` | — | — | U | — | — | UD | — | UD |
| `GET /extraction-runs` | R | R | R | R | — | R | R | R |
| `POST /extraction-runs` (enqueue) | — | — | A | — | — | A | — | A |
| `PUT/DELETE /extraction-runs/:id` | — | — | U | — | — | UD | — | UD |
| `GET /classification-runs` | R | R | R | R | — | R | R | R |
| `POST /classification-runs` | — | — | A | A | — | A | — | A |
| `PUT/DELETE /classification-runs/:id` | — | — | U | — | — | UD | — | UD |
| `GET/POST/PUT/DELETE /document-chunks*` | R | — | RCUD | R | — | RCUD | R | RCUD |
| `GET/POST/PUT/DELETE /entity-extractions*` | R | — | RCU | R | — | RCUD | R | RCUD |
| `GET/POST/PUT/DELETE /document-relations*` | R | — | RCU | RCUD | — | RCUD | R | RCUD |
| `GET /signature-requests` | R | R | R | R | R | R | R | R |
| `POST /signature-requests` | — | — | — | C | — | C | — | C |
| `PUT /signature-requests/:id` | — | — | — | U | — | U | — | U |
| `DELETE /signature-requests/:id` | — | — | — | D | — | D | — | D |
| `POST /signature-requests/:id/record-signature` | — | — | — | A | A | A | — | A |
| `GET/POST/PUT/DELETE /knowledge-cards*` | R | — | RCU | RCU | — | RCUD | R | RCUD |
| `POST /knowledge-cards/generate-from-document/:id` | — | — | A | A | — | A | — | A |

## State-transition RACI

### Document lifecycle (`docs.documents.status`)

| From → To | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| draft → pending_review | doc_uploader | doc_reviewer | doc_operator | — |
| pending_review → approved | doc_reviewer | doc_admin | doc_operator | doc_uploader |
| pending_review → draft | doc_reviewer | doc_admin | — | doc_uploader |
| approved → archived | doc_admin | compliance_officer | doc_reviewer | — |
| any → deleted (soft) | doc_admin | super_admin | compliance_officer | all owners |

### Signature request lifecycle (`docs.document_signature_requests.status`)

| From → To | Responsible | Accountable | Trigger |
|---|---|---|---|
| sent → partially_signed | doc_signer | doc_reviewer | `POST /signature-requests/:id/record-signature` (count < total) |
| partially_signed → signed | doc_signer | doc_reviewer | `POST /signature-requests/:id/record-signature` (count ≥ total) |
| sent → declined | doc_signer | doc_reviewer | `PUT /signature-requests/:id` with `status=declined` + `decline_reason` |
| sent → expired | system (cron) | doc_admin | `expires_at < now()` sweep |

### Run lifecycle (`docs.{ocr,extraction,classification}_runs.status`)

| From → To | Responsible | Trigger |
|---|---|---|
| queued → running | worker (service_role) | worker pull |
| running → complete | worker | success |
| running → failed | worker | exception |

## Hard DELETE policy (RLS `<tbl>_delete_admin`)

Only `super_admin` (or `service_role`) can physically DELETE rows in docs tables.
All other roles must rely on soft-delete (`is_deleted = true`, `status = 'deleted'`
for `docs.documents`). Enforced at the database layer by the
`<tbl>_delete_admin` policies created in migration 00055 Part E.

## Audit

Every mutation records `created_by` / `updated_by` (from `req.userId` via JWT) on
all tables with audit columns. Trigger `governance.set_updated_at()` keeps
`updated_at` fresh on all docs tables.
