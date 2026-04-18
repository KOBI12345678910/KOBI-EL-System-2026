// ============================================================
// Commercial domain aggregator router
// Mounted at /api/commercial (see routes/index.ts)
// ============================================================
import { Router } from "express";
import leadSourcesRouter from "./lead-sources";
import customerSegmentsRouter from "./customer-segments";
import salesOrdersRouter from "./sales-orders";
import pricingRulesRouter from "./pricing-rules";

const commercialRouter = Router();

commercialRouter.use("/lead-sources", leadSourcesRouter);
commercialRouter.use("/customer-segments", customerSegmentsRouter);
commercialRouter.use("/sales-orders", salesOrdersRouter);
commercialRouter.use("/pricing-rules", pricingRulesRouter);

export default commercialRouter;
