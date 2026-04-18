# DOMAIN — docs

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Canonical schema | `docs` (plus `documents.*` ML pipeline sub-schema) |
| Evidence | `B-E013` `B-E015` DISCOVERY §A §B §D |

## 1. domain_checklist

### expected_models (15)
documents (canonical=docs.documents), document_versions, attachments, document_classifications, document_signature_requests, ocr_results, print_jobs, scan_sessions, classification_runs, document_chunks, document_relations, entity_extractions, extraction_runs, knowledge_cards, ocr_runs — plus planned: document_links, templates, generated_files, archive_records

### required_pages
DocumentsList, Document360 (primary — versions + attachments + OCR/extraction lineage), DocumentUploadPage, TemplatesAdmin, GeneratedFilesList, PrintJobsList, ScanSessionsList, ClassificationRunsList, KnowledgeCardsPage (decision: admin or internal)

### required_forms
UploadDocument, NewVersion, RequestSignature, GenerateFromTemplate, ClassifyDocument, ExtractEntities

### required_routes
`/documents`, `/document/:id`, `/documents/upload`, `/documents/templates`, `/documents/generated`, `/documents/print-jobs`, `/documents/scan-sessions`, `/documents/classifications`, `/documents/knowledge` (internal)

### required_reports
document_aging_report, classification_accuracy_report, OCR_success_rate_report

### required_dashboards
DocumentOpsDashboard (planned)

### required_flows
- upload → OCR → classify → extract → link → archive

### critical_relations
- documents 1—* document_versions; documents 1—* attachments; documents *—* entities via document_relations
- documents 1—* classification_runs 1—* document_classifications
- documents 1—* ocr_runs 1—* ocr_results
- documents 1—* extraction_runs 1—* entity_extractions
- documents 1—* document_chunks (for vector search)
- documents 1—* document_signature_requests

### completion_gate
- **Document360** MUST show versions + attachments + OCR/extraction lineage
- knowledge_cards needs page OR admin/internal decision

## 2. DISCOVERY

| layer | count |
|---|---:|
| DB tables docs.*+documents.* | 15 |
| Registry models | 0 full + 15 partial |
| API routers | 12 |
| Pages | 40 |
| Menu entries | 40 |
| Coverage | 12% per INVISIBLE_MENU_ITEMS |

## 3. GAPS

| class | items |
|---|---|
| **planned_locked** | document_links, templates, generated_files, archive_records |
| **wrong-schema** | documents, document_versions, attachments, signatures (registry said documents.* → canonical docs.* / execution.signatures) |
| **ghost / built_not_exposed** | document_classifications, document_signature_requests, ocr_results, print_jobs, scan_sessions, classification_runs, document_chunks, document_relations, entity_extractions, extraction_runs, knowledge_cards, ocr_runs |

## 4. ACTIONS

| action | items |
|---|---|
| recover_now | fix registry pointers; build Document360 tabs (versions + OCR + extraction lineage) |
| build_now (Phase 7) | templates + document_links + generated_files + archive_records |
| internal_only | document_chunks (vector store internal), classification_runs / extraction_runs / ocr_runs (ML pipeline steps) |
| postpone | knowledge_cards public UI (admin only for v2) |
| remove_from_registry | N/A |

## 5. DEPLOYMENT

0/15 tables verified; pending.

## 6. COVERAGE

| metric | value |
|---|---|
| completion_percent | 18 |
| business_readiness | blocked |
| gate_status | blocked — Document360 lineage missing |
| red rows | 9 |
