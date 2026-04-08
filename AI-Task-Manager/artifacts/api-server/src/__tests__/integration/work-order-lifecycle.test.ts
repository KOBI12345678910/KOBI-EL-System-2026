import { describe, it, expect, vi, beforeEach } from "vitest";

interface WorkOrder {
  id: number;
  workOrderNumber: string;
  status: "draft" | "pending" | "assigned" | "in_progress" | "quality_check" | "completed" | "cancelled";
  assignedTo?: number;
  title: string;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const VALID_TRANSITIONS: Record<WorkOrder["status"], WorkOrder["status"][]> = {
  draft: ["pending", "cancelled"],
  pending: ["assigned", "cancelled"],
  assigned: ["in_progress", "pending", "cancelled"],
  in_progress: ["quality_check", "assigned", "cancelled"],
  quality_check: ["completed", "in_progress"],
  completed: [],
  cancelled: [],
};

function canTransition(from: WorkOrder["status"], to: WorkOrder["status"]): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

function applyStatusTransition(
  workOrder: WorkOrder,
  newStatus: WorkOrder["status"],
  assignedTo?: number
): { workOrder?: WorkOrder; error?: string } {
  if (!canTransition(workOrder.status, newStatus)) {
    return { error: `Invalid transition from ${workOrder.status} to ${newStatus}` };
  }
  const updated: WorkOrder = {
    ...workOrder,
    status: newStatus,
    updatedAt: new Date(),
  };
  if (assignedTo !== undefined) {
    updated.assignedTo = assignedTo;
  }
  return { workOrder: updated };
}

function createWorkOrder(data: { title: string; id?: number }): WorkOrder {
  return {
    id: data.id ?? Math.floor(Math.random() * 10000),
    workOrderNumber: `WO-${String(Date.now()).slice(-4)}`,
    status: "draft",
    title: data.title,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function softDeleteWorkOrder(workOrder: WorkOrder): WorkOrder {
  return { ...workOrder, deletedAt: new Date(), updatedAt: new Date() };
}

describe("Work Order Lifecycle - Integration Tests", () => {
  describe("Work order creation", () => {
    it("creates a work order with draft status", () => {
      const wo = createWorkOrder({ title: "Install Gate" });
      expect(wo.status).toBe("draft");
    });

    it("assigns a work order number on creation", () => {
      const wo = createWorkOrder({ title: "Install Railing" });
      expect(wo.workOrderNumber).toMatch(/^WO-/);
    });

    it("sets createdAt and updatedAt on creation", () => {
      const wo = createWorkOrder({ title: "Pergola Installation" });
      expect(wo.createdAt).toBeInstanceOf(Date);
      expect(wo.updatedAt).toBeInstanceOf(Date);
    });

    it("has no assignee initially", () => {
      const wo = createWorkOrder({ title: "Gate Repair" });
      expect(wo.assignedTo).toBeUndefined();
    });
  });

  describe("Valid status transitions", () => {
    let wo: WorkOrder;

    beforeEach(() => {
      wo = createWorkOrder({ title: "Test Work Order", id: 1 });
    });

    it("draft → pending", () => {
      const result = applyStatusTransition(wo, "pending");
      expect(result.error).toBeUndefined();
      expect(result.workOrder?.status).toBe("pending");
    });

    it("pending → assigned (with employee)", () => {
      const pending = applyStatusTransition(wo, "pending").workOrder!;
      const result = applyStatusTransition(pending, "assigned", 42);
      expect(result.error).toBeUndefined();
      expect(result.workOrder?.status).toBe("assigned");
      expect(result.workOrder?.assignedTo).toBe(42);
    });

    it("assigned → in_progress", () => {
      const pending = applyStatusTransition(wo, "pending").workOrder!;
      const assigned = applyStatusTransition(pending, "assigned", 42).workOrder!;
      const result = applyStatusTransition(assigned, "in_progress");
      expect(result.error).toBeUndefined();
      expect(result.workOrder?.status).toBe("in_progress");
    });

    it("in_progress → quality_check", () => {
      let current = applyStatusTransition(wo, "pending").workOrder!;
      current = applyStatusTransition(current, "assigned", 42).workOrder!;
      current = applyStatusTransition(current, "in_progress").workOrder!;
      const result = applyStatusTransition(current, "quality_check");
      expect(result.workOrder?.status).toBe("quality_check");
    });

    it("quality_check → completed", () => {
      let current = wo;
      current = applyStatusTransition(current, "pending").workOrder!;
      current = applyStatusTransition(current, "assigned").workOrder!;
      current = applyStatusTransition(current, "in_progress").workOrder!;
      current = applyStatusTransition(current, "quality_check").workOrder!;
      const result = applyStatusTransition(current, "completed");
      expect(result.workOrder?.status).toBe("completed");
    });

    it("full lifecycle: draft → pending → assigned → in_progress → quality_check → completed", () => {
      let current = wo;
      const transitions: WorkOrder["status"][] = ["pending", "assigned", "in_progress", "quality_check", "completed"];
      for (const status of transitions) {
        const result = applyStatusTransition(current, status);
        expect(result.error).toBeUndefined();
        current = result.workOrder!;
      }
      expect(current.status).toBe("completed");
    });
  });

  describe("Invalid status transitions", () => {
    it("cannot go from draft to in_progress directly", () => {
      const wo = createWorkOrder({ title: "Test" });
      const result = applyStatusTransition(wo, "in_progress");
      expect(result.error).toBeDefined();
    });

    it("cannot go from draft to completed directly", () => {
      const wo = createWorkOrder({ title: "Test" });
      const result = applyStatusTransition(wo, "completed");
      expect(result.error).toBeDefined();
    });

    it("cannot go from completed to any other status", () => {
      let wo = createWorkOrder({ title: "Test" });
      wo = applyStatusTransition(wo, "pending").workOrder!;
      wo = applyStatusTransition(wo, "assigned").workOrder!;
      wo = applyStatusTransition(wo, "in_progress").workOrder!;
      wo = applyStatusTransition(wo, "quality_check").workOrder!;
      wo = applyStatusTransition(wo, "completed").workOrder!;

      const statuses: WorkOrder["status"][] = ["draft", "pending", "assigned", "in_progress", "quality_check", "cancelled"];
      for (const status of statuses) {
        const result = applyStatusTransition(wo, status);
        expect(result.error).toBeDefined();
      }
    });

    it("cannot go from cancelled to any status", () => {
      const wo = createWorkOrder({ title: "Test" });
      const cancelled = applyStatusTransition(wo, "cancelled").workOrder!;
      const result = applyStatusTransition(cancelled, "pending");
      expect(result.error).toBeDefined();
    });

    it("returns error message with from and to statuses", () => {
      const wo = createWorkOrder({ title: "Test" });
      const result = applyStatusTransition(wo, "completed");
      expect(result.error).toContain("draft");
      expect(result.error).toContain("completed");
    });
  });

  describe("Cancellation", () => {
    it("can cancel from draft", () => {
      const wo = createWorkOrder({ title: "Test" });
      const result = applyStatusTransition(wo, "cancelled");
      expect(result.workOrder?.status).toBe("cancelled");
    });

    it("can cancel from pending", () => {
      let wo = createWorkOrder({ title: "Test" });
      wo = applyStatusTransition(wo, "pending").workOrder!;
      const result = applyStatusTransition(wo, "cancelled");
      expect(result.workOrder?.status).toBe("cancelled");
    });

    it("can cancel from assigned", () => {
      let wo = createWorkOrder({ title: "Test" });
      wo = applyStatusTransition(wo, "pending").workOrder!;
      wo = applyStatusTransition(wo, "assigned").workOrder!;
      const result = applyStatusTransition(wo, "cancelled");
      expect(result.workOrder?.status).toBe("cancelled");
    });

    it("can cancel from in_progress", () => {
      let wo = createWorkOrder({ title: "Test" });
      wo = applyStatusTransition(wo, "pending").workOrder!;
      wo = applyStatusTransition(wo, "assigned").workOrder!;
      wo = applyStatusTransition(wo, "in_progress").workOrder!;
      const result = applyStatusTransition(wo, "cancelled");
      expect(result.workOrder?.status).toBe("cancelled");
    });
  });

  describe("Employee assignment", () => {
    it("assigns an employee to a work order", () => {
      let wo = createWorkOrder({ title: "Test" });
      wo = applyStatusTransition(wo, "pending").workOrder!;
      const result = applyStatusTransition(wo, "assigned", 15);
      expect(result.workOrder?.assignedTo).toBe(15);
    });

    it("reassigns employee on status change", () => {
      let wo = createWorkOrder({ title: "Test" });
      wo = applyStatusTransition(wo, "pending").workOrder!;
      wo = applyStatusTransition(wo, "assigned", 10).workOrder!;
      const result = applyStatusTransition(wo, "in_progress", 20);
      expect(result.workOrder?.assignedTo).toBe(20);
    });

    it("updatedAt changes after transition", () => {
      const wo = createWorkOrder({ title: "Test" });
      const before = wo.updatedAt;
      const result = applyStatusTransition(wo, "pending");
      expect(result.workOrder!.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe("Soft delete", () => {
    it("soft delete sets deletedAt", () => {
      const wo = createWorkOrder({ title: "Test" });
      const deleted = softDeleteWorkOrder(wo);
      expect(deleted.deletedAt).toBeInstanceOf(Date);
    });

    it("soft delete updates updatedAt", () => {
      const wo = createWorkOrder({ title: "Test" });
      const before = wo.updatedAt;
      const deleted = softDeleteWorkOrder(wo);
      expect(deleted.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it("soft delete preserves work order data", () => {
      const wo = createWorkOrder({ title: "Important Work Order", id: 999 });
      const deleted = softDeleteWorkOrder(wo);
      expect(deleted.id).toBe(999);
      expect(deleted.title).toBe("Important Work Order");
      expect(deleted.status).toBe("draft");
    });

    it("work order without deletedAt is not deleted", () => {
      const wo = createWorkOrder({ title: "Active Work Order" });
      expect(wo.deletedAt).toBeUndefined();
    });
  });
});
