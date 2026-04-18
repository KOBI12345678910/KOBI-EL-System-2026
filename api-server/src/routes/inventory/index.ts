// ============================================================
// Inventory domain — API aggregator
// Mount in parent with: router.use('/api/inventory', inventoryRouter)
// ============================================================
import { Router, type IRouter } from "express";
import materialsRouter from "./materials";
import materialCategoriesRouter from "./material-categories";
import materialLotsRouter from "./material-lots";
import materialRequestsRouter from "./material-requests";
import materialRequestLinesRouter from "./material-request-lines";
import inventoryRouter from "./inventory";
import inventoryMovementsRouter from "./inventory-movements";
import inventoryReceiptsRouter from "./inventory-receipts";
import inventoryIssuesRouter from "./inventory-issues";
import inventoryTransfersRouter from "./inventory-transfers";
import inventoryReservationsRouter from "./inventory-reservations";
import warehousesRouter from "./warehouses";
import barcodeScansRouter from "./barcode-scans";
import manufacturingBatchesRouter from "./manufacturing-batches";
import reorderRulesRouter from "./reorder-rules";
import shortageSnapshotsRouter from "./shortage-snapshots";
import stockCountsRouter from "./stock-counts";
import stockCountLinesRouter from "./stock-count-lines";

const inventoryDomainRouter: IRouter = Router();

inventoryDomainRouter.use(materialsRouter);
inventoryDomainRouter.use(materialCategoriesRouter);
inventoryDomainRouter.use(materialLotsRouter);
inventoryDomainRouter.use(materialRequestsRouter);
inventoryDomainRouter.use(materialRequestLinesRouter);
inventoryDomainRouter.use(inventoryRouter);
inventoryDomainRouter.use(inventoryMovementsRouter);
inventoryDomainRouter.use(inventoryReceiptsRouter);
inventoryDomainRouter.use(inventoryIssuesRouter);
inventoryDomainRouter.use(inventoryTransfersRouter);
inventoryDomainRouter.use(inventoryReservationsRouter);
inventoryDomainRouter.use(warehousesRouter);
inventoryDomainRouter.use(barcodeScansRouter);
inventoryDomainRouter.use(manufacturingBatchesRouter);
inventoryDomainRouter.use(reorderRulesRouter);
inventoryDomainRouter.use(shortageSnapshotsRouter);
inventoryDomainRouter.use(stockCountsRouter);
inventoryDomainRouter.use(stockCountLinesRouter);

// Meta health endpoint
inventoryDomainRouter.get("/__inventory-health", (_req, res) => {
  res.json({
    ok: true,
    domain: "inventory",
    models: 18,
    models_list: [
      "materials", "material_categories", "material_lots", "material_requests",
      "material_request_lines", "inventory", "inventory_movements", "inventory_receipts",
      "inventory_issues", "inventory_transfers", "inventory_reservations", "warehouses",
      "barcode_scans", "manufacturing_batches", "reorder_rules", "shortage_snapshots",
      "stock_counts", "stock_count_lines",
    ],
    generated: "2026-04-18",
  });
});

export default inventoryDomainRouter;
