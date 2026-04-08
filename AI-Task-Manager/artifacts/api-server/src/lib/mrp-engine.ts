/**
 * BASH44 MRP Engine — Material Requirements Planning
 *
 * SAP-like MRP logic:
 * 1. Explode BOM to raw materials
 * 2. Check available stock
 * 3. Calculate net requirements
 * 4. Generate planned purchase requisitions
 * 5. Consider lead times for scheduling
 * 6. Support safety stock and reorder points
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════
export interface BomLine {
  itemId: number;
  itemCode: string;
  itemName: string;
  quantityPer: number;
  uom: string;
  scrapPct: number;
  leadTimeDays: number;
  supplierId?: number;
}

export interface StockPosition {
  itemId: number;
  onHand: number;
  onOrder: number;
  reserved: number;
  available: number;
  safetyStock: number;
  reorderPoint: number;
  reorderQty: number;
  lastCost: number;
}

export interface DemandEntry {
  itemId: number;
  quantity: number;
  requiredDate: string;
  sourceType: "WORK_ORDER" | "SALES_ORDER" | "FORECAST" | "MANUAL";
  sourceId: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export interface PlannedOrder {
  itemId: number;
  itemCode: string;
  itemName: string;
  quantity: number;
  uom: string;
  orderDate: string;
  requiredDate: string;
  supplierId?: number;
  estimatedCost: number;
  priority: string;
  sourceType: string;
  sourceId: number;
  status: "PLANNED" | "FIRMED" | "RELEASED";
}

export interface MrpResult {
  plannedOrders: PlannedOrder[];
  shortages: Array<{
    itemId: number;
    itemCode: string;
    shortageQty: number;
    requiredDate: string;
    impact: string;
  }>;
  excessStock: Array<{
    itemId: number;
    itemCode: string;
    excessQty: number;
    excessValue: number;
  }>;
  stats: {
    totalDemandLines: number;
    totalPlannedOrders: number;
    totalShortages: number;
    totalExcessItems: number;
    totalPlannedCost: number;
    runDate: string;
  };
}

// ═══════════════════════════════════════════════════════════════
// BOM EXPLOSION — recursively explode BOM to raw materials
// ═══════════════════════════════════════════════════════════════
export function explodeBom(
  finishedGoodQty: number,
  bomLines: BomLine[],
  nestedBoms: Map<number, BomLine[]> = new Map()
): Array<{ itemId: number; itemCode: string; itemName: string; totalQty: number; uom: string; leadTimeDays: number; supplierId?: number }> {
  const requirements: Map<number, { itemId: number; itemCode: string; itemName: string; totalQty: number; uom: string; leadTimeDays: number; supplierId?: number }> = new Map();

  for (const line of bomLines) {
    const grossQty = finishedGoodQty * line.quantityPer;
    const withScrap = grossQty * (1 + (line.scrapPct || 0) / 100);

    // Check if this component has its own BOM (sub-assembly)
    const subBom = nestedBoms.get(line.itemId);
    if (subBom && subBom.length > 0) {
      // Recursive explosion
      const subReqs = explodeBom(withScrap, subBom, nestedBoms);
      for (const sub of subReqs) {
        const existing = requirements.get(sub.itemId);
        if (existing) {
          existing.totalQty += sub.totalQty;
          existing.leadTimeDays = Math.max(existing.leadTimeDays, sub.leadTimeDays);
        } else {
          requirements.set(sub.itemId, { ...sub });
        }
      }
    } else {
      // Raw material — add to requirements
      const existing = requirements.get(line.itemId);
      if (existing) {
        existing.totalQty += withScrap;
        existing.leadTimeDays = Math.max(existing.leadTimeDays, line.leadTimeDays);
      } else {
        requirements.set(line.itemId, {
          itemId: line.itemId,
          itemCode: line.itemCode,
          itemName: line.itemName,
          totalQty: withScrap,
          uom: line.uom,
          leadTimeDays: line.leadTimeDays,
          supplierId: line.supplierId,
        });
      }
    }
  }

  return Array.from(requirements.values());
}

// ═══════════════════════════════════════════════════════════════
// NET REQUIREMENTS — stock - demand = net
// ═══════════════════════════════════════════════════════════════
export function calculateNetRequirements(
  grossRequirements: Array<{ itemId: number; totalQty: number }>,
  stockPositions: Map<number, StockPosition>
): Array<{ itemId: number; grossQty: number; available: number; netQty: number; needsOrder: boolean }> {
  return grossRequirements.map((req) => {
    const stock = stockPositions.get(req.itemId);
    const available = stock ? stock.available : 0;
    const netQty = Math.max(0, req.totalQty - available);

    return {
      itemId: req.itemId,
      grossQty: Number(req.totalQty.toFixed(4)),
      available: Number(available.toFixed(4)),
      netQty: Number(netQty.toFixed(4)),
      needsOrder: netQty > 0,
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULING — calculate order dates based on lead times
// ═══════════════════════════════════════════════════════════════
export function calculateOrderDate(requiredDate: string, leadTimeDays: number): string {
  const date = new Date(requiredDate);
  date.setDate(date.getDate() - leadTimeDays);
  // Skip weekends (Friday/Saturday in Israel)
  while (date.getDay() === 5 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════
// EOQ — Economic Order Quantity
// ═══════════════════════════════════════════════════════════════
export function calculateEOQ(annualDemand: number, orderCost: number, holdingCostPerUnit: number): number {
  if (holdingCostPerUnit <= 0 || annualDemand <= 0) return annualDemand;
  return Math.ceil(Math.sqrt((2 * annualDemand * orderCost) / holdingCostPerUnit));
}

// ═══════════════════════════════════════════════════════════════
// SAFETY STOCK — calculate based on demand variability
// ═══════════════════════════════════════════════════════════════
export function calculateSafetyStock(
  avgDailyDemand: number,
  leadTimeDays: number,
  demandStdDev: number,
  serviceLevel: number = 0.95
): number {
  // Z-score for service level (approximation)
  const zScores: Record<number, number> = { 0.9: 1.28, 0.95: 1.65, 0.97: 1.88, 0.99: 2.33 };
  const z = zScores[serviceLevel] || 1.65;
  return Math.ceil(z * demandStdDev * Math.sqrt(leadTimeDays));
}

// ═══════════════════════════════════════════════════════════════
// REORDER POINT
// ═══════════════════════════════════════════════════════════════
export function calculateReorderPoint(avgDailyDemand: number, leadTimeDays: number, safetyStock: number): number {
  return Math.ceil(avgDailyDemand * leadTimeDays + safetyStock);
}

// ═══════════════════════════════════════════════════════════════
// FULL MRP RUN
// ═══════════════════════════════════════════════════════════════
export function runMrp(input: {
  demands: DemandEntry[];
  stockPositions: Map<number, StockPosition>;
  bomData: Map<number, BomLine[]>;
  itemMaster: Map<number, { code: string; name: string; uom: string; leadTimeDays: number; lastCost: number; supplierId?: number }>;
}): MrpResult {
  const { demands, stockPositions, bomData, itemMaster } = input;
  const plannedOrders: PlannedOrder[] = [];
  const shortages: MrpResult["shortages"] = [];
  let totalPlannedCost = 0;

  // Group demands by item
  const demandByItem = new Map<number, DemandEntry[]>();
  for (const d of demands) {
    const arr = demandByItem.get(d.itemId) || [];
    arr.push(d);
    demandByItem.set(d.itemId, arr);
  }

  // Process each demanded item
  for (const [itemId, itemDemands] of demandByItem) {
    const totalDemand = itemDemands.reduce((sum, d) => sum + d.quantity, 0);
    const earliestDate = itemDemands.reduce((min, d) => (d.requiredDate < min ? d.requiredDate : min), "9999-12-31");
    const highestPriority = itemDemands.some((d) => d.priority === "HIGH") ? "HIGH" : itemDemands.some((d) => d.priority === "MEDIUM") ? "MEDIUM" : "LOW";

    // Check if item has BOM (semi-finished) — explode
    const bom = bomData.get(itemId);
    if (bom && bom.length > 0) {
      const exploded = explodeBom(totalDemand, bom, bomData);
      for (const req of exploded) {
        const stock = stockPositions.get(req.itemId);
        const available = stock ? stock.available : 0;
        const netQty = Math.max(0, req.totalQty - available);

        if (netQty > 0) {
          const item = itemMaster.get(req.itemId);
          const orderQty = stock?.reorderQty ? Math.max(netQty, stock.reorderQty) : netQty;
          const cost = (item?.lastCost || 0) * orderQty;
          totalPlannedCost += cost;

          plannedOrders.push({
            itemId: req.itemId,
            itemCode: item?.code || req.itemCode,
            itemName: item?.name || req.itemName,
            quantity: Number(orderQty.toFixed(4)),
            uom: item?.uom || req.uom,
            orderDate: calculateOrderDate(earliestDate, req.leadTimeDays),
            requiredDate: earliestDate,
            supplierId: req.supplierId || item?.supplierId,
            estimatedCost: Number(cost.toFixed(2)),
            priority: highestPriority,
            sourceType: itemDemands[0].sourceType,
            sourceId: itemDemands[0].sourceId,
            status: "PLANNED",
          });
        }
      }
    } else {
      // Raw material — direct check
      const stock = stockPositions.get(itemId);
      const available = stock ? stock.available : 0;
      const netQty = Math.max(0, totalDemand - available);

      if (netQty > 0) {
        const item = itemMaster.get(itemId);
        const orderQty = stock?.reorderQty ? Math.max(netQty, stock.reorderQty) : netQty;
        const cost = (item?.lastCost || 0) * orderQty;
        totalPlannedCost += cost;

        plannedOrders.push({
          itemId,
          itemCode: item?.code || `ITEM-${itemId}`,
          itemName: item?.name || "",
          quantity: Number(orderQty.toFixed(4)),
          uom: item?.uom || "יח'",
          orderDate: calculateOrderDate(earliestDate, item?.leadTimeDays || 14),
          requiredDate: earliestDate,
          supplierId: item?.supplierId,
          estimatedCost: Number(cost.toFixed(2)),
          priority: highestPriority,
          sourceType: itemDemands[0].sourceType,
          sourceId: itemDemands[0].sourceId,
          status: "PLANNED",
        });
      }

      // Check for critical shortage
      if (netQty > 0 && available <= 0) {
        shortages.push({
          itemId,
          itemCode: itemMaster.get(itemId)?.code || `ITEM-${itemId}`,
          shortageQty: Number(netQty.toFixed(4)),
          requiredDate: earliestDate,
          impact: highestPriority === "HIGH" ? "עיכוב ייצור צפוי" : "ניתן לנהל",
        });
      }
    }
  }

  // Find excess stock items
  const excessStock: MrpResult["excessStock"] = [];
  for (const [itemId, stock] of stockPositions) {
    if (stock.available > stock.reorderPoint * 3 && !demandByItem.has(itemId)) {
      const item = itemMaster.get(itemId);
      const excessQty = stock.available - stock.reorderPoint;
      excessStock.push({
        itemId,
        itemCode: item?.code || `ITEM-${itemId}`,
        excessQty: Number(excessQty.toFixed(4)),
        excessValue: Number((excessQty * stock.lastCost).toFixed(2)),
      });
    }
  }

  return {
    plannedOrders,
    shortages,
    excessStock,
    stats: {
      totalDemandLines: demands.length,
      totalPlannedOrders: plannedOrders.length,
      totalShortages: shortages.length,
      totalExcessItems: excessStock.length,
      totalPlannedCost: Number(totalPlannedCost.toFixed(2)),
      runDate: new Date().toISOString(),
    },
  };
}
