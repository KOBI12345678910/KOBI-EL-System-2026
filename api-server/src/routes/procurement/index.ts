// ============================================================
// Procurement domain — API aggregator
// Mount in parent with: router.use('/api/procurement', procurementRouter)
// ============================================================
import { Router, type IRouter } from "express";
import suppliersRouter from "./suppliers";
import supplierContactsRouter from "./supplier-contacts";
import rfqsRouter from "./rfqs";
import rfqLinesRouter from "./rfq-lines";
import rfqBidsRouter from "./rfq-bids";
import purchaseOrdersRouter from "./purchase-orders";
import poLinesRouter from "./po-lines";
import poReceiptsRouter from "./po-receipts";
import goodsReceiptsRouter from "./goods-receipts";
import goodsReceiptLinesRouter from "./goods-receipt-lines";
import threeWayMatchesRouter from "./three-way-matches";
import approvalStepsRouter from "./approval-steps";
import approvalsRouter from "./approvals";
import procurementApprovalsRouter from "./procurement-approvals";
import contractsRouter from "./contracts";
import supplierEvaluationsRouter from "./supplier-evaluations";
import subcontractorsRouter from "./subcontractors";
import supplierInvoicesRouter from "./supplier-invoices";

const procurementRouter: IRouter = Router();

procurementRouter.use(suppliersRouter);
procurementRouter.use(supplierContactsRouter);
procurementRouter.use(rfqsRouter);
procurementRouter.use(rfqLinesRouter);
procurementRouter.use(rfqBidsRouter);
procurementRouter.use(purchaseOrdersRouter);
procurementRouter.use(poLinesRouter);
procurementRouter.use(poReceiptsRouter);
procurementRouter.use(goodsReceiptsRouter);
procurementRouter.use(goodsReceiptLinesRouter);
procurementRouter.use(threeWayMatchesRouter);
procurementRouter.use(approvalStepsRouter);
procurementRouter.use(approvalsRouter);
procurementRouter.use(procurementApprovalsRouter);
procurementRouter.use(contractsRouter);
procurementRouter.use(supplierEvaluationsRouter);
procurementRouter.use(subcontractorsRouter);
procurementRouter.use(supplierInvoicesRouter);

// Meta health endpoint
procurementRouter.get("/__procurement-health", (_req, res) => {
  res.json({
    ok: true,
    domain: "procurement",
    models: 18,
    models_list: [
      "suppliers", "supplier_contacts", "rfqs", "rfq_lines", "rfq_bids",
      "purchase_orders", "po_lines", "po_receipts", "goods_receipts", "goods_receipt_lines",
      "three_way_matches", "approval_steps", "approvals", "contracts",
      "supplier_evaluations", "subcontractors", "supplier_invoices", "procurement_approvals",
    ],
    generated: "2026-04-18",
  });
});

export default procurementRouter;
