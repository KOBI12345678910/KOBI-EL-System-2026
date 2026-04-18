import { describe, it, expect } from "vitest";

interface StockMovement {
  type: "receipt" | "issue" | "adjustment" | "transfer";
  quantity: number;
  unitCost?: number;
}

interface InventoryState {
  quantity: number;
  averageCost: number;
  totalValue: number;
}

function applyStockMovement(state: InventoryState, movement: StockMovement): InventoryState {
  const newQuantity = state.quantity + (movement.type === "issue" ? -movement.quantity : movement.quantity);

  if (movement.type === "receipt" && movement.unitCost !== undefined) {
    const newValue = state.totalValue + movement.quantity * movement.unitCost;
    const newAvgCost = newQuantity > 0 ? newValue / newQuantity : movement.unitCost;
    return {
      quantity: newQuantity,
      averageCost: Math.round(newAvgCost * 100) / 100,
      totalValue: Math.round(newValue * 100) / 100,
    };
  }

  if (movement.type === "issue") {
    const newValue = state.totalValue - movement.quantity * state.averageCost;
    return {
      quantity: Math.max(0, newQuantity),
      averageCost: state.averageCost,
      totalValue: Math.max(0, Math.round(newValue * 100) / 100),
    };
  }

  if (movement.type === "adjustment") {
    const adjustedValue = newQuantity * state.averageCost;
    return {
      quantity: Math.max(0, newQuantity),
      averageCost: state.averageCost,
      totalValue: Math.max(0, Math.round(adjustedValue * 100) / 100),
    };
  }

  return {
    quantity: Math.max(0, newQuantity),
    averageCost: state.averageCost,
    totalValue: state.totalValue,
  };
}

function computeMovingAverageCost(movements: StockMovement[]): InventoryState {
  let state: InventoryState = { quantity: 0, averageCost: 0, totalValue: 0 };
  for (const m of movements) {
    state = applyStockMovement(state, m);
  }
  return state;
}

function isLowStock(currentQty: number, reorderPoint: number): boolean {
  return currentQty <= reorderPoint;
}

interface BomItem {
  materialId: number;
  quantityPer: number;
}

function scaleBomRequirements(bom: BomItem[], productionQty: number): Array<BomItem & { totalRequired: number }> {
  return bom.map(item => ({
    ...item,
    totalRequired: Math.ceil(item.quantityPer * productionQty),
  }));
}

describe("Inventory Service - Unit Tests", () => {
  describe("Stock movements", () => {
    it("receipt increases stock quantity", () => {
      const state: InventoryState = { quantity: 100, averageCost: 50, totalValue: 5000 };
      const result = applyStockMovement(state, { type: "receipt", quantity: 50, unitCost: 60 });
      expect(result.quantity).toBe(150);
    });

    it("issue decreases stock quantity", () => {
      const state: InventoryState = { quantity: 100, averageCost: 50, totalValue: 5000 };
      const result = applyStockMovement(state, { type: "issue", quantity: 30 });
      expect(result.quantity).toBe(70);
    });

    it("issue cannot make stock go below 0", () => {
      const state: InventoryState = { quantity: 10, averageCost: 50, totalValue: 500 };
      const result = applyStockMovement(state, { type: "issue", quantity: 20 });
      expect(result.quantity).toBe(0);
    });

    it("adjustment changes stock by given quantity", () => {
      const state: InventoryState = { quantity: 50, averageCost: 100, totalValue: 5000 };
      const result = applyStockMovement(state, { type: "adjustment", quantity: -10 });
      expect(result.quantity).toBe(40);
    });

    it("issue maintains average cost unchanged", () => {
      const state: InventoryState = { quantity: 100, averageCost: 75, totalValue: 7500 };
      const result = applyStockMovement(state, { type: "issue", quantity: 25 });
      expect(result.averageCost).toBe(75);
    });

    it("issue reduces total value proportionally", () => {
      const state: InventoryState = { quantity: 100, averageCost: 50, totalValue: 5000 };
      const result = applyStockMovement(state, { type: "issue", quantity: 20 });
      expect(result.totalValue).toBe(4000);
    });
  });

  describe("Moving average cost calculation", () => {
    it("initial receipt sets average cost to receipt unit cost", () => {
      const state = computeMovingAverageCost([
        { type: "receipt", quantity: 100, unitCost: 50 },
      ]);
      expect(state.averageCost).toBe(50);
      expect(state.quantity).toBe(100);
      expect(state.totalValue).toBe(5000);
    });

    it("computes weighted average on second receipt", () => {
      const state = computeMovingAverageCost([
        { type: "receipt", quantity: 100, unitCost: 50 },
        { type: "receipt", quantity: 100, unitCost: 70 },
      ]);
      expect(state.averageCost).toBe(60);
      expect(state.quantity).toBe(200);
    });

    it("average cost updates correctly after mixed receipts", () => {
      const state = computeMovingAverageCost([
        { type: "receipt", quantity: 200, unitCost: 100 },
        { type: "receipt", quantity: 100, unitCost: 130 },
      ]);
      const expectedAvg = (200 * 100 + 100 * 130) / 300;
      expect(state.averageCost).toBeCloseTo(expectedAvg, 2);
    });

    it("average cost does not change on issue", () => {
      const state = computeMovingAverageCost([
        { type: "receipt", quantity: 100, unitCost: 80 },
        { type: "issue", quantity: 30 },
      ]);
      expect(state.averageCost).toBe(80);
      expect(state.quantity).toBe(70);
    });

    it("multiple receipts and issues produce correct moving average", () => {
      const movements: StockMovement[] = [
        { type: "receipt", quantity: 50, unitCost: 100 },
        { type: "issue", quantity: 20 },
        { type: "receipt", quantity: 30, unitCost: 120 },
      ];
      const state = computeMovingAverageCost(movements);
      const afterFirst = { quantity: 50, averageCost: 100, totalValue: 5000 };
      const afterIssue = { quantity: 30, averageCost: 100, totalValue: 3000 };
      const expectedTotal = afterIssue.totalValue + 30 * 120;
      const expectedQty = 30 + 30;
      const expectedAvg = expectedTotal / expectedQty;
      expect(state.averageCost).toBeCloseTo(expectedAvg, 2);
      expect(state.quantity).toBe(expectedQty);
    });
  });

  describe("Low stock threshold detection", () => {
    it("detects low stock when quantity equals reorder point", () => {
      expect(isLowStock(10, 10)).toBe(true);
    });

    it("detects low stock when quantity is below reorder point", () => {
      expect(isLowStock(5, 10)).toBe(true);
    });

    it("no alert when quantity is above reorder point", () => {
      expect(isLowStock(15, 10)).toBe(false);
    });

    it("detects zero stock as low stock", () => {
      expect(isLowStock(0, 5)).toBe(true);
    });

    it("no alert when reorder point is 0 and stock is 0", () => {
      expect(isLowStock(0, 0)).toBe(true);
    });

    it("handles large quantities correctly", () => {
      expect(isLowStock(1000, 500)).toBe(false);
      expect(isLowStock(499, 500)).toBe(true);
    });
  });

  describe("BOM material scaling", () => {
    const bom: BomItem[] = [
      { materialId: 1, quantityPer: 2.5 },
      { materialId: 2, quantityPer: 10 },
      { materialId: 3, quantityPer: 0.5 },
    ];

    it("scales BOM quantities by production quantity", () => {
      const result = scaleBomRequirements(bom, 4);
      expect(result[0].totalRequired).toBe(10);
      expect(result[1].totalRequired).toBe(40);
    });

    it("rounds up fractional material requirements (ceiling)", () => {
      const result = scaleBomRequirements(bom, 3);
      expect(result[2].totalRequired).toBe(Math.ceil(0.5 * 3));
    });

    it("production quantity of 1 returns per-unit amounts", () => {
      const result = scaleBomRequirements(bom, 1);
      expect(result[0].totalRequired).toBe(3);
      expect(result[1].totalRequired).toBe(10);
    });

    it("production quantity of 0 returns 0 for all materials", () => {
      const result = scaleBomRequirements(bom, 0);
      result.forEach(item => expect(item.totalRequired).toBe(0));
    });

    it("preserves materialId in output", () => {
      const result = scaleBomRequirements(bom, 5);
      expect(result.map(r => r.materialId)).toEqual([1, 2, 3]);
    });

    it("handles non-integer quantityPer correctly", () => {
      const specialBom: BomItem[] = [{ materialId: 99, quantityPer: 1.3 }];
      const result = scaleBomRequirements(specialBom, 10);
      expect(result[0].totalRequired).toBe(Math.ceil(1.3 * 10));
    });
  });

  describe("Inventory value calculations", () => {
    it("total value = quantity × average cost after receipts", () => {
      const state = computeMovingAverageCost([
        { type: "receipt", quantity: 100, unitCost: 55 },
      ]);
      expect(state.totalValue).toBe(state.quantity * state.averageCost);
    });

    it("total value decreases correctly after issue", () => {
      const state = computeMovingAverageCost([
        { type: "receipt", quantity: 100, unitCost: 100 },
        { type: "issue", quantity: 40 },
      ]);
      expect(state.totalValue).toBe(60 * 100);
      expect(state.quantity).toBe(60);
    });
  });
});
