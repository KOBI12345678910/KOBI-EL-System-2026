import { Router } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityRecordsTable,
} from "@workspace/db/schema";
import {
  purchaseRequestsTable,
  purchaseRequestItemsTable,
  purchaseRequestApprovalsTable,
  purchaseOrdersTable,
  purchaseOrderItemsTable,
  goodsReceiptsTable,
  goodsReceiptItemsTable,
  inventoryTransactionsTable,
  rawMaterialsTable,
  supplierPriceHistoryTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireBuilderAccess } from "../../lib/permission-middleware";

const router = Router();

async function getEntityIdBySlug(slug: string): Promise<number | null> {
  const [entity] = await db
    .select({ id: moduleEntitiesTable.id })
    .from(moduleEntitiesTable)
    .where(eq(moduleEntitiesTable.slug, slug));
  return entity?.id ?? null;
}

async function getExistingRecordKeys(
  entityId: number,
  keyField: string
): Promise<Set<string>> {
  const records = await db
    .select({ data: entityRecordsTable.data })
    .from(entityRecordsTable)
    .where(eq(entityRecordsTable.entityId, entityId));
  return new Set(
    records
      .map((r) => {
        const d = r.data as Record<string, unknown> | null;
        return d?.[keyField] as string | undefined;
      })
      .filter((v): v is string => !!v)
  );
}

async function buildLegacyIdMap(
  entityId: number,
  legacyIdField: string
): Promise<Map<string, number>> {
  const records = await db
    .select({ id: entityRecordsTable.id, data: entityRecordsTable.data })
    .from(entityRecordsTable)
    .where(eq(entityRecordsTable.entityId, entityId));
  const map = new Map<string, number>();
  for (const r of records) {
    const d = r.data as Record<string, unknown> | null;
    const legacyVal = d?.[legacyIdField];
    if (legacyVal != null) {
      map.set(String(legacyVal), r.id);
    }
  }
  return map;
}

router.post("/platform/migrate/purchase-inventory", requireBuilderAccess, async (req, res) => {
  try {
    const [procModule] = await db
      .select()
      .from(platformModulesTable)
      .where(eq(platformModulesTable.slug, "procurement"));
    if (!procModule) {
      res.status(400).json({ message: "Procurement module not found. Run seed first." });
      return;
    }

    const purchaseRequestEntityId = await getEntityIdBySlug("purchase-request");
    const purchaseRequestItemEntityId = await getEntityIdBySlug("purchase-request-item");
    const purchaseOrderEntityId = await getEntityIdBySlug("purchase-order");
    const purchaseOrderItemEntityId = await getEntityIdBySlug("purchase-order-item");
    const goodsReceiptEntityId = await getEntityIdBySlug("goods-receipt");
    const goodsReceiptItemEntityId = await getEntityIdBySlug("goods-receipt-item");
    const rawMaterialEntityId = await getEntityIdBySlug("raw-material-procurement");
    const inventoryTransactionEntityId = await getEntityIdBySlug("inventory-transaction");
    const priceHistoryEntityId = await getEntityIdBySlug("price-history");
    const purchaseApprovalEntityId = await getEntityIdBySlug("purchase-approval");

    const results: Record<string, { migrated: number; skipped: number; errors: string[] }> = {};

    const supplierEntityId = await getEntityIdBySlug("supplier");
    const supplierIdMap: Map<string, number> = supplierEntityId
      ? await buildLegacyIdMap(supplierEntityId, "_legacy_id")
      : new Map();
    if (supplierEntityId && supplierIdMap.size === 0) {
      const supplierByNumber = await buildLegacyIdMap(supplierEntityId, "supplier_number");
      for (const [k, v] of supplierByNumber) supplierIdMap.set(k, v);
    }

    const prIdMap = new Map<number, number>();
    if (purchaseRequestEntityId) {
      const existingPrMap = await buildLegacyIdMap(purchaseRequestEntityId, "_legacy_id");
      for (const [k, v] of existingPrMap) prIdMap.set(Number(k), v);
    }

    const poIdMap = new Map<number, number>();
    if (purchaseOrderEntityId) {
      const existingPoMap = await buildLegacyIdMap(purchaseOrderEntityId, "_legacy_id");
      for (const [k, v] of existingPoMap) poIdMap.set(Number(k), v);
    }

    const materialIdMap = new Map<string, number>();
    if (rawMaterialEntityId) {
      const existingMatMap = await buildLegacyIdMap(rawMaterialEntityId, "_legacy_id");
      for (const [k, v] of existingMatMap) materialIdMap.set(k, v);
    }

    const statusMapPR: Record<string, string> = {
      "טיוטה": "draft",
      "ממתין לאישור": "pending_approval",
      "מאושר": "approved",
      "נדחה": "rejected",
      "בוצע": "fulfilled",
      "בוטל": "cancelled",
    };

    if (purchaseRequestEntityId) {
      const existing = await getExistingRecordKeys(purchaseRequestEntityId, "request_number");
      const legacyRequests = await db.select().from(purchaseRequestsTable);
      let migrated = 0, skipped = 0;
      const errors: string[] = [];

      for (const req of legacyRequests) {
        let parentRecordId = prIdMap.get(req.id);
        if (!existing.has(req.requestNumber) && !parentRecordId) {
          try {
            const [record] = await db.insert(entityRecordsTable).values({
              entityId: purchaseRequestEntityId,
              data: {
                _legacy_id: String(req.id),
                request_number: req.requestNumber,
                title: req.title,
                requester_name: req.requesterName,
                department: req.department,
                priority: req.priority,
                total_estimated: req.totalEstimated,
                currency: req.currency,
                needed_by: req.neededBy,
                approved_by: req.approvedBy,
                notes: req.notes,
              },
              status: statusMapPR[req.status] || "draft",
              createdAt: req.createdAt,
              updatedAt: req.updatedAt,
            }).returning();
            parentRecordId = record.id;
            prIdMap.set(req.id, record.id);
            migrated++;
          } catch (err: any) {
            errors.push(`PR ${req.requestNumber}: ${err.message}`);
            continue;
          }
        } else {
          skipped++;
        }

        if (purchaseRequestItemEntityId && parentRecordId) {
          const existingChildKeys = await getExistingRecordKeys(purchaseRequestItemEntityId, "_legacy_id");
          const items = await db.select().from(purchaseRequestItemsTable)
            .where(eq(purchaseRequestItemsTable.requestId, String(req.id)));
          for (const item of items) {
            if (existingChildKeys.has(String(item.id))) continue;
            try {
              await db.insert(entityRecordsTable).values({
                entityId: purchaseRequestItemEntityId,
                data: {
                  _legacy_id: String(item.id),
                  _parent_id: parentRecordId,
                  parent_request_ref: parentRecordId,
                  item_description: item.itemDescription,
                  material_ref: item.materialId,
                  quantity: item.quantity,
                  unit: item.unit,
                  estimated_price: item.estimatedPrice,
                  preferred_supplier: item.preferredSupplierId ? supplierIdMap.get(String(item.preferredSupplierId)) ?? item.preferredSupplierId : null,
                  notes: item.notes,
                },
                status: "published",
                createdAt: item.createdAt,
              });
            } catch (childErr: any) {
              errors.push(`PR-Item for ${req.requestNumber}: ${childErr.message}`);
            }
          }
        }
      }
      results["purchase-requests"] = { migrated, skipped, errors };
    }

    const statusMapApproval: Record<string, string> = {
      "ממתין": "pending",
      "מאושר": "approved",
      "נדחה": "rejected",
    };

    if (purchaseApprovalEntityId) {
      const existingApprovalKeys = await getExistingRecordKeys(purchaseApprovalEntityId, "_legacy_id");
      const legacyApprovals = await db.select().from(purchaseRequestApprovalsTable);
      let migrated = 0, skipped = 0;
      const errors: string[] = [];

      for (const appr of legacyApprovals) {
        const legacyKey = `appr_${appr.id}`;
        if (existingApprovalKeys.has(legacyKey)) { skipped++; continue; }
        try {
          const requestRecordId = appr.requestId ? prIdMap.get(Number(appr.requestId)) ?? null : null;

          await db.insert(entityRecordsTable).values({
            entityId: purchaseApprovalEntityId,
            data: {
              _legacy_id: legacyKey,
              request_ref: requestRecordId,
              approver_name: appr.approverName,
              approval_level: appr.approvalLevel,
              comments: appr.comments,
              approved_at: appr.approvedAt,
            },
            status: statusMapApproval[appr.approvalStatus] || "pending",
            createdAt: appr.createdAt,
          });
          migrated++;
        } catch (err: any) {
          errors.push(`Approval ${appr.id}: ${err.message}`);
        }
      }
      results["purchase-approvals"] = { migrated, skipped, errors };
    }

    const statusMapPO: Record<string, string> = {
      "טיוטה": "draft",
      "ממתין לאישור": "pending_approval",
      "מאושר": "approved",
      "נשלח לספק": "sent_to_supplier",
      "בהזמנה": "ordered",
      "התקבל חלקית": "partially_received",
      "התקבל במלואו": "fully_received",
      "בוטל": "cancelled",
    };

    if (purchaseOrderEntityId) {
      const existing = await getExistingRecordKeys(purchaseOrderEntityId, "order_number");
      const legacyOrders = await db.select().from(purchaseOrdersTable);
      let migrated = 0, skipped = 0;
      const errors: string[] = [];

      for (const ord of legacyOrders) {
        let parentRecordId = poIdMap.get(ord.id);
        if (!existing.has(ord.orderNumber) && !parentRecordId) {
          try {
            const supplierRecordId = ord.supplierId ? supplierIdMap.get(String(ord.supplierId)) ?? null : null;
            const requestRecordId = ord.requestId ? prIdMap.get(ord.requestId) ?? null : null;

            const [record] = await db.insert(entityRecordsTable).values({
              entityId: purchaseOrderEntityId,
              data: {
                _legacy_id: String(ord.id),
                order_number: ord.orderNumber,
                supplier_ref: supplierRecordId,
                request_ref: requestRecordId,
                order_date: ord.orderDate,
                expected_delivery: ord.expectedDelivery,
                total_amount: ord.totalAmount,
                currency: ord.currency,
                payment_terms: ord.paymentTerms,
                shipping_address: ord.shippingAddress,
                approved_by: ord.approvedBy,
                notes: ord.notes,
              },
              status: statusMapPO[ord.status] || "draft",
              createdAt: ord.createdAt,
              updatedAt: ord.updatedAt,
            }).returning();
            parentRecordId = record.id;
            poIdMap.set(ord.id, record.id);
            migrated++;
          } catch (err: any) {
            errors.push(`PO ${ord.orderNumber}: ${err.message}`);
            continue;
          }
        } else {
          skipped++;
        }

        if (purchaseOrderItemEntityId && parentRecordId) {
          const existingChildKeys = await getExistingRecordKeys(purchaseOrderItemEntityId, "_legacy_id");
          const items = await db.select().from(purchaseOrderItemsTable)
            .where(eq(purchaseOrderItemsTable.orderId, ord.id));
          for (const item of items) {
            if (existingChildKeys.has(String(item.id))) continue;
            try {
              await db.insert(entityRecordsTable).values({
                entityId: purchaseOrderItemEntityId,
                data: {
                  _legacy_id: String(item.id),
                  _parent_id: parentRecordId,
                  parent_order_ref: parentRecordId,
                  item_description: item.itemDescription,
                  material_ref: item.materialId,
                  quantity: item.quantity,
                  unit: item.unit,
                  unit_price: item.unitPrice,
                  total_price: item.totalPrice,
                  received_quantity: item.receivedQuantity,
                  notes: item.notes,
                },
                status: "published",
                createdAt: item.createdAt,
              });
            } catch (childErr: any) {
              errors.push(`PO-Item for ${ord.orderNumber}: ${childErr.message}`);
            }
          }
        }
      }
      results["purchase-orders"] = { migrated, skipped, errors };
    }

    const statusMapGR: Record<string, string> = {
      "חדש": "new",
      "בבדיקה": "inspection",
      "מאושר": "approved",
      "התקבל": "received",
      "נדחה חלקית": "partially_rejected",
    };

    if (goodsReceiptEntityId) {
      const existing = await getExistingRecordKeys(goodsReceiptEntityId, "receipt_number");
      const grIdMap = new Map<number, number>();
      const existingGrMap = await buildLegacyIdMap(goodsReceiptEntityId, "_legacy_id");
      for (const [k, v] of existingGrMap) grIdMap.set(Number(k), v);

      const legacyReceipts = await db.select().from(goodsReceiptsTable);
      let migrated = 0, skipped = 0;
      const errors: string[] = [];

      for (const rcpt of legacyReceipts) {
        let parentRecordId = grIdMap.get(rcpt.id);
        if (!existing.has(rcpt.receiptNumber) && !parentRecordId) {
          try {
            const supplierRecordId = rcpt.supplierId ? supplierIdMap.get(String(rcpt.supplierId)) ?? null : null;
            const orderRecordId = rcpt.orderId ? poIdMap.get(rcpt.orderId) ?? null : null;

            const [record] = await db.insert(entityRecordsTable).values({
              entityId: goodsReceiptEntityId,
              data: {
                _legacy_id: String(rcpt.id),
                receipt_number: rcpt.receiptNumber,
                order_ref: orderRecordId,
                supplier_ref: supplierRecordId,
                receipt_date: rcpt.receiptDate,
                received_by: rcpt.receivedBy,
                warehouse_location: rcpt.warehouseLocation,
                notes: rcpt.notes,
              },
              status: statusMapGR[rcpt.status] || "new",
              createdAt: rcpt.createdAt,
              updatedAt: rcpt.updatedAt,
            }).returning();
            parentRecordId = record.id;
            grIdMap.set(rcpt.id, record.id);
            migrated++;
          } catch (err: any) {
            errors.push(`GR ${rcpt.receiptNumber}: ${err.message}`);
            continue;
          }
        } else {
          skipped++;
        }

        if (goodsReceiptItemEntityId && parentRecordId) {
          const existingChildKeys = await getExistingRecordKeys(goodsReceiptItemEntityId, "_legacy_id");
          const items = await db.select().from(goodsReceiptItemsTable)
            .where(eq(goodsReceiptItemsTable.receiptId, rcpt.id));
          for (const item of items) {
            if (existingChildKeys.has(String(item.id))) continue;
            try {
              await db.insert(entityRecordsTable).values({
                entityId: goodsReceiptItemEntityId,
                data: {
                  _legacy_id: String(item.id),
                  _parent_id: parentRecordId,
                  parent_receipt_ref: parentRecordId,
                  item_description: item.itemDescription,
                  material_ref: item.materialId,
                  expected_quantity: item.expectedQuantity,
                  received_quantity: item.receivedQuantity,
                  unit: item.unit,
                  quality_status: item.qualityStatus,
                  notes: item.notes,
                },
                status: "published",
                createdAt: item.createdAt,
              });
            } catch (childErr: any) {
              errors.push(`GR-Item for ${rcpt.receiptNumber}: ${childErr.message}`);
            }
          }
        }
      }
      results["goods-receipts"] = { migrated, skipped, errors };
    }

    if (rawMaterialEntityId) {
      const existing = await getExistingRecordKeys(rawMaterialEntityId, "material_number");
      const legacyMaterials = await db.select().from(rawMaterialsTable);
      let migrated = 0, skipped = 0;
      const errors: string[] = [];

      const statusMapRM: Record<string, string> = {
        "פעיל": "active",
        "לא פעיל": "inactive",
      };

      for (const mat of legacyMaterials) {
        if (existing.has(mat.materialNumber)) { skipped++; continue; }
        try {
          const [record] = await db.insert(entityRecordsTable).values({
            entityId: rawMaterialEntityId,
            data: {
              _legacy_id: String(mat.id),
              material_number: mat.materialNumber,
              material_name: mat.materialName,
              category: mat.category,
              sub_category: mat.subCategory,
              unit: mat.unit,
              description: mat.description,
              standard_price: mat.standardPrice,
              currency: mat.currency,
              current_stock: mat.currentStock,
              minimum_stock: mat.minimumStock,
              reorder_point: mat.reorderPoint,
              weight_per_unit: mat.weightPerUnit,
              dimensions: mat.dimensions,
              material_grade: mat.materialGrade,
              notes: mat.notes,
            },
            status: statusMapRM[mat.status] || "active",
            createdAt: mat.createdAt,
            updatedAt: mat.updatedAt,
          }).returning();
          materialIdMap.set(String(mat.id), record.id);
          migrated++;
        } catch (err: any) {
          errors.push(`MAT ${mat.materialNumber}: ${err.message}`);
        }
      }
      results["raw-materials"] = { migrated, skipped, errors };
    }

    if (inventoryTransactionEntityId) {
      const existingTxKeys = await getExistingRecordKeys(inventoryTransactionEntityId, "_legacy_id");
      const legacyTransactions = await db.select().from(inventoryTransactionsTable);
      let migrated = 0, skipped = 0;
      const errors: string[] = [];

      for (const tx of legacyTransactions) {
        const legacyKey = `tx_${tx.id}`;
        if (existingTxKeys.has(legacyKey)) { skipped++; continue; }
        try {
          const materialRecordId = tx.materialId ? materialIdMap.get(String(tx.materialId)) ?? null : null;

          await db.insert(entityRecordsTable).values({
            entityId: inventoryTransactionEntityId,
            data: {
              _legacy_id: legacyKey,
              material_ref: materialRecordId,
              transaction_type: tx.transactionType,
              quantity: tx.quantity,
              reference_type: tx.referenceType,
              reference_id: tx.referenceId,
              warehouse_location: tx.warehouseLocation,
              performed_by: tx.performedBy,
              notes: tx.notes,
            },
            status: "published",
            createdAt: tx.createdAt,
          });
          migrated++;
        } catch (err: any) {
          errors.push(`TX ${tx.id}: ${err.message}`);
        }
      }
      results["inventory-transactions"] = { migrated, skipped, errors };
    }

    if (priceHistoryEntityId) {
      const existingPhKeys = await getExistingRecordKeys(priceHistoryEntityId, "_legacy_id");
      const legacyPrices = await db.select().from(supplierPriceHistoryTable);
      let migrated = 0, skipped = 0;
      const errors: string[] = [];

      for (const ph of legacyPrices) {
        const legacyKey = `ph_${ph.id}`;
        if (existingPhKeys.has(legacyKey)) { skipped++; continue; }
        try {
          const supplierRecordId = ph.supplierId ? supplierIdMap.get(String(ph.supplierId)) ?? null : null;
          const materialRecordId = ph.materialId ? materialIdMap.get(String(ph.materialId)) ?? null : null;

          await db.insert(entityRecordsTable).values({
            entityId: priceHistoryEntityId,
            data: {
              _legacy_id: legacyKey,
              supplier_ref: supplierRecordId,
              material_ref: materialRecordId,
              price: ph.price,
              currency: ph.currency,
              valid_from: ph.validFrom,
              valid_until: ph.validUntil,
              price_list_name: ph.priceListName,
              discount_percentage: ph.discountPercentage,
              notes: ph.notes,
            },
            status: "published",
            createdAt: ph.createdAt,
          });
          migrated++;
        } catch (err: any) {
          errors.push(`PH ${ph.id}: ${err.message}`);
        }
      }
      results["price-history"] = { migrated, skipped, errors };
    }

    const hasErrors = Object.values(results).some((r) => r.errors.length > 0);
    res.status(hasErrors ? 207 : 200).json({
      message: hasErrors ? "Migration completed with errors" : "Migration completed",
      results,
    });
  } catch (err: any) {
    console.error("Purchase/Inventory migration error:", err);
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/migrate/purchase-inventory/status", requireBuilderAccess, async (req, res) => {
  try {
    const entitySlugs = [
      "purchase-request",
      "purchase-approval",
      "purchase-order",
      "goods-receipt",
      "raw-material-procurement",
      "inventory-transaction",
      "price-history",
    ];

    const status: Record<string, { entityId: number | null; recordCount: number }> = {};

    for (const slug of entitySlugs) {
      const entityId = await getEntityIdBySlug(slug);
      if (!entityId) {
        status[slug] = { entityId: null, recordCount: 0 };
        continue;
      }
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(entityRecordsTable)
        .where(eq(entityRecordsTable.entityId, entityId));
      status[slug] = { entityId, recordCount: countResult?.count || 0 };
    }

    res.json({ status });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
