// ============================================================
// Docs domain — API aggregator
// Mount in parent with: router.use('/api/docs', docsRouter)
// ============================================================
import { Router, type IRouter } from "express";
import documentsRouter from "./documents";
import documentVersionsRouter from "./document-versions";
import attachmentsRouter from "./attachments";
import printJobsRouter from "./print-jobs";
import scanSessionsRouter from "./scan-sessions";
import documentClassificationsRouter from "./document-classifications";
import ocrResultsRouter from "./ocr-results";
import ocrRunsRouter from "./ocr-runs";
import extractionRunsRouter from "./extraction-runs";
import classificationRunsRouter from "./classification-runs";
import documentChunksRouter from "./document-chunks";
import entityExtractionsRouter from "./entity-extractions";
import documentRelationsRouter from "./document-relations";
import signatureRequestsRouter from "./signature-requests";
import knowledgeCardsRouter from "./knowledge-cards";

const docsRouter: IRouter = Router();

docsRouter.use(documentsRouter);
docsRouter.use(documentVersionsRouter);
docsRouter.use(attachmentsRouter);
docsRouter.use(printJobsRouter);
docsRouter.use(scanSessionsRouter);
docsRouter.use(documentClassificationsRouter);
docsRouter.use(ocrResultsRouter);
docsRouter.use(ocrRunsRouter);
docsRouter.use(extractionRunsRouter);
docsRouter.use(classificationRunsRouter);
docsRouter.use(documentChunksRouter);
docsRouter.use(entityExtractionsRouter);
docsRouter.use(documentRelationsRouter);
docsRouter.use(signatureRequestsRouter);
docsRouter.use(knowledgeCardsRouter);

// Meta health endpoint
docsRouter.get("/__docs-health", (_req, res) => {
  res.json({
    ok: true,
    domain: "docs",
    models: 15,
    models_list: [
      "documents", "document_versions", "attachments", "print_jobs",
      "scan_sessions", "document_classifications", "ocr_results",
      "ocr_runs", "extraction_runs", "classification_runs",
      "document_chunks", "entity_extractions", "document_relations",
      "document_signature_requests", "knowledge_cards",
    ],
    generated: "2026-04-18",
  });
});

export default docsRouter;
