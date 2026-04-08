/**
 * BASH44 Costing Engine — Production & Project Cost Control
 *
 * SAP-like costing:
 * 1. Standard cost vs actual cost tracking
 * 2. Production cost rollup (materials + labor + overhead)
 * 3. Variance analysis (price, quantity, efficiency)
 * 4. Absorption costing with overhead rates
 * 5. Project costing with WBS elements
 */

// ═══════════════════════════════════════════════════════════════
// STANDARD COST ROLLUP
// ═══════════════════════════════════════════════════════════════
export interface CostComponent {
  type: "MATERIAL" | "LABOR" | "OVERHEAD" | "SUBCONTRACTOR" | "OTHER";
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  costCenter?: string;
}

export interface StandardCostRollup {
  itemId: number;
  itemCode: string;
  components: CostComponent[];
  totalMaterial: number;
  totalLabor: number;
  totalOverhead: number;
  totalSubcontractor: number;
  totalStandardCost: number;
  currency: string;
  effectiveDate: string;
}

export function calculateStandardCostRollup(
  bomLines: Array<{ itemId: number; itemCode: string; quantityPer: number; unitCost: number; scrapPct: number }>,
  laborOperations: Array<{ operationName: string; setupHours: number; runHoursPerUnit: number; laborRate: number; quantity: number }>,
  overheadRate: number = 0.35,
  subcontractorCosts: Array<{ description: string; cost: number }> = []
): StandardCostRollup {
  // Material costs
  const materialComponents: CostComponent[] = bomLines.map((line) => {
    const grossQty = line.quantityPer * (1 + (line.scrapPct || 0) / 100);
    return {
      type: "MATERIAL" as const,
      description: line.itemCode,
      quantity: Number(grossQty.toFixed(4)),
      unitCost: line.unitCost,
      totalCost: Number((grossQty * line.unitCost).toFixed(2)),
    };
  });

  // Labor costs
  const laborComponents: CostComponent[] = laborOperations.map((op) => {
    const totalHours = op.setupHours + op.runHoursPerUnit * op.quantity;
    return {
      type: "LABOR" as const,
      description: op.operationName,
      quantity: Number(totalHours.toFixed(2)),
      unitCost: op.laborRate,
      totalCost: Number((totalHours * op.laborRate).toFixed(2)),
    };
  });

  const totalMaterial = materialComponents.reduce((sum, c) => sum + c.totalCost, 0);
  const totalLabor = laborComponents.reduce((sum, c) => sum + c.totalCost, 0);
  const totalSubcontractor = subcontractorCosts.reduce((sum, c) => sum + c.cost, 0);

  // Overhead = percentage of (material + labor)
  const totalOverhead = Number(((totalMaterial + totalLabor) * overheadRate).toFixed(2));

  const overheadComponent: CostComponent = {
    type: "OVERHEAD",
    description: `עלות עקיפה (${(overheadRate * 100).toFixed(0)}%)`,
    quantity: 1,
    unitCost: totalOverhead,
    totalCost: totalOverhead,
  };

  const subComponents: CostComponent[] = subcontractorCosts.map((sc) => ({
    type: "SUBCONTRACTOR" as const,
    description: sc.description,
    quantity: 1,
    unitCost: sc.cost,
    totalCost: sc.cost,
  }));

  return {
    itemId: 0,
    itemCode: "",
    components: [...materialComponents, ...laborComponents, overheadComponent, ...subComponents],
    totalMaterial: Number(totalMaterial.toFixed(2)),
    totalLabor: Number(totalLabor.toFixed(2)),
    totalOverhead,
    totalSubcontractor: Number(totalSubcontractor.toFixed(2)),
    totalStandardCost: Number((totalMaterial + totalLabor + totalOverhead + totalSubcontractor).toFixed(2)),
    currency: "ILS",
    effectiveDate: new Date().toISOString().slice(0, 10),
  };
}

// ═══════════════════════════════════════════════════════════════
// VARIANCE ANALYSIS
// ═══════════════════════════════════════════════════════════════
export interface CostVariance {
  type: "PRICE" | "QUANTITY" | "EFFICIENCY" | "OVERHEAD" | "MIX";
  description: string;
  standardValue: number;
  actualValue: number;
  variance: number;
  variancePct: number;
  favorable: boolean;
}

export function calculatePriceVariance(
  actualQty: number,
  standardPrice: number,
  actualPrice: number
): CostVariance {
  const variance = (standardPrice - actualPrice) * actualQty;
  return {
    type: "PRICE",
    description: "סטיית מחיר",
    standardValue: Number((standardPrice * actualQty).toFixed(2)),
    actualValue: Number((actualPrice * actualQty).toFixed(2)),
    variance: Number(variance.toFixed(2)),
    variancePct: standardPrice === 0 ? 0 : Number(((variance / (standardPrice * actualQty)) * 100).toFixed(2)),
    favorable: variance >= 0,
  };
}

export function calculateQuantityVariance(
  standardQty: number,
  actualQty: number,
  standardPrice: number
): CostVariance {
  const variance = (standardQty - actualQty) * standardPrice;
  return {
    type: "QUANTITY",
    description: "סטיית כמות",
    standardValue: Number((standardQty * standardPrice).toFixed(2)),
    actualValue: Number((actualQty * standardPrice).toFixed(2)),
    variance: Number(variance.toFixed(2)),
    variancePct: standardQty === 0 ? 0 : Number(((variance / (standardQty * standardPrice)) * 100).toFixed(2)),
    favorable: variance >= 0,
  };
}

export function calculateEfficiencyVariance(
  standardHours: number,
  actualHours: number,
  laborRate: number
): CostVariance {
  const variance = (standardHours - actualHours) * laborRate;
  return {
    type: "EFFICIENCY",
    description: "סטיית יעילות",
    standardValue: Number((standardHours * laborRate).toFixed(2)),
    actualValue: Number((actualHours * laborRate).toFixed(2)),
    variance: Number(variance.toFixed(2)),
    variancePct: standardHours === 0 ? 0 : Number(((variance / (standardHours * laborRate)) * 100).toFixed(2)),
    favorable: variance >= 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// WORK ORDER COSTING
// ═══════════════════════════════════════════════════════════════
export interface WorkOrderCost {
  workOrderId: number;
  workOrderNo: string;
  plannedQty: number;
  completedQty: number;
  standardCost: {
    material: number;
    labor: number;
    overhead: number;
    total: number;
  };
  actualCost: {
    material: number;
    labor: number;
    overhead: number;
    total: number;
  };
  variances: CostVariance[];
  costPerUnit: {
    standard: number;
    actual: number;
  };
  completionPct: number;
  wipValue: number;
}

export function calculateWorkOrderCost(input: {
  workOrderId: number;
  workOrderNo: string;
  plannedQty: number;
  completedQty: number;
  standardMaterialCost: number;
  standardLaborCost: number;
  standardOverheadCost: number;
  actualMaterialCost: number;
  actualLaborCost: number;
  actualOverheadCost: number;
  standardLaborHours: number;
  actualLaborHours: number;
  laborRate: number;
}): WorkOrderCost {
  const standardTotal = input.standardMaterialCost + input.standardLaborCost + input.standardOverheadCost;
  const actualTotal = input.actualMaterialCost + input.actualLaborCost + input.actualOverheadCost;
  const completionPct = input.plannedQty === 0 ? 0 : (input.completedQty / input.plannedQty) * 100;

  const variances: CostVariance[] = [
    calculatePriceVariance(input.completedQty, input.standardMaterialCost / Math.max(input.plannedQty, 1), input.actualMaterialCost / Math.max(input.completedQty, 1)),
    calculateEfficiencyVariance(input.standardLaborHours, input.actualLaborHours, input.laborRate),
    {
      type: "OVERHEAD",
      description: "סטיית עקיפה",
      standardValue: input.standardOverheadCost,
      actualValue: input.actualOverheadCost,
      variance: Number((input.standardOverheadCost - input.actualOverheadCost).toFixed(2)),
      variancePct: input.standardOverheadCost === 0 ? 0 : Number((((input.standardOverheadCost - input.actualOverheadCost) / input.standardOverheadCost) * 100).toFixed(2)),
      favorable: input.actualOverheadCost <= input.standardOverheadCost,
    },
  ];

  // WIP = actual cost for incomplete portion
  const wipValue = completionPct < 100 ? Number((actualTotal * (1 - completionPct / 100)).toFixed(2)) : 0;

  return {
    workOrderId: input.workOrderId,
    workOrderNo: input.workOrderNo,
    plannedQty: input.plannedQty,
    completedQty: input.completedQty,
    standardCost: {
      material: Number(input.standardMaterialCost.toFixed(2)),
      labor: Number(input.standardLaborCost.toFixed(2)),
      overhead: Number(input.standardOverheadCost.toFixed(2)),
      total: Number(standardTotal.toFixed(2)),
    },
    actualCost: {
      material: Number(input.actualMaterialCost.toFixed(2)),
      labor: Number(input.actualLaborCost.toFixed(2)),
      overhead: Number(input.actualOverheadCost.toFixed(2)),
      total: Number(actualTotal.toFixed(2)),
    },
    variances,
    costPerUnit: {
      standard: input.plannedQty > 0 ? Number((standardTotal / input.plannedQty).toFixed(2)) : 0,
      actual: input.completedQty > 0 ? Number((actualTotal / input.completedQty).toFixed(2)) : 0,
    },
    completionPct: Number(completionPct.toFixed(1)),
    wipValue,
  };
}

// ═══════════════════════════════════════════════════════════════
// INVENTORY VALUATION — Weighted Average Cost
// ═══════════════════════════════════════════════════════════════
export function calculateWeightedAverageCost(
  currentQty: number,
  currentAvgCost: number,
  receiptQty: number,
  receiptUnitCost: number
): { newAvgCost: number; newTotalQty: number; newTotalValue: number } {
  const currentValue = currentQty * currentAvgCost;
  const receiptValue = receiptQty * receiptUnitCost;
  const newTotalQty = currentQty + receiptQty;
  const newTotalValue = currentValue + receiptValue;
  const newAvgCost = newTotalQty > 0 ? newTotalValue / newTotalQty : 0;

  return {
    newAvgCost: Number(newAvgCost.toFixed(4)),
    newTotalQty,
    newTotalValue: Number(newTotalValue.toFixed(2)),
  };
}

// ═══════════════════════════════════════════════════════════════
// ABSORPTION COSTING — allocate overhead to products
// ═══════════════════════════════════════════════════════════════
export function allocateOverhead(
  totalOverhead: number,
  products: Array<{ productId: number; directLaborHours: number; machineHours: number; units: number }>,
  basis: "LABOR_HOURS" | "MACHINE_HOURS" | "UNITS" = "LABOR_HOURS"
): Array<{ productId: number; allocatedOverhead: number; overheadPerUnit: number }> {
  let totalBasis = 0;
  for (const p of products) {
    totalBasis += basis === "LABOR_HOURS" ? p.directLaborHours : basis === "MACHINE_HOURS" ? p.machineHours : p.units;
  }

  if (totalBasis === 0) return products.map((p) => ({ productId: p.productId, allocatedOverhead: 0, overheadPerUnit: 0 }));

  const rate = totalOverhead / totalBasis;

  return products.map((p) => {
    const basisValue = basis === "LABOR_HOURS" ? p.directLaborHours : basis === "MACHINE_HOURS" ? p.machineHours : p.units;
    const allocated = basisValue * rate;
    return {
      productId: p.productId,
      allocatedOverhead: Number(allocated.toFixed(2)),
      overheadPerUnit: p.units > 0 ? Number((allocated / p.units).toFixed(2)) : 0,
    };
  });
}
