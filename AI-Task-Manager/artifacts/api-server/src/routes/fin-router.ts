import { Router } from "express";
import finDocumentsRouter from "./fin-documents";
import finPaymentsRouter from "./fin-payments";
import finMasterDataRouter from "./fin-master-data";
import { seedFinancialModule } from "./fin-seed";

const router = Router();

// Master data (statuses, document types, payment methods, categories, links, attachments, etc.)
router.use("/", finMasterDataRouter);

// Documents CRUD
router.use("/documents", finDocumentsRouter);

// Payments
router.use("/payments", finPaymentsRouter);

// Seed endpoint (one-time setup)
router.post("/seed", async (_req, res) => {
  try {
    await seedFinancialModule();
    res.json({ success: true, message: "Financial module seeded" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
