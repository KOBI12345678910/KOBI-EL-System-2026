// ============================================================
// Finance domain aggregator router
// Mounted at /api/v2/finance (see routes/index.ts). The legacy
// monolith /api/finance (finance.ts) continues to serve old pages
// — new Tier 1 endpoints live here under /api/v2/finance.
// ============================================================
import { Router } from "express";
import invoicesRouter from "./invoices";
import paymentsRouter from "./payments";
import vatRecordsRouter from "./vat-records";
import glAccountsRouter from "./gl-accounts";
import journalEntriesRouter from "./journal-entries";

const financeRouter = Router();

// Tier 1 — Option 1 deliverables
financeRouter.use("/invoices", invoicesRouter);
financeRouter.use("/payments", paymentsRouter);
financeRouter.use("/vat-records", vatRecordsRouter);

// Existing finance subroutes (pre-existing)
financeRouter.use("/gl-accounts", glAccountsRouter);
financeRouter.use("/journal-entries", journalEntriesRouter);

export default financeRouter;
