import { useEffect } from "react";
import { entityFilter, entityCreate, entityUpdate } from "@/lib/entity-api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProductionOrder {
  id: string;
  order_number?: string;
  status?: string;
  current_stage?: string;
  cutting_completed?: boolean;
  target_date?: string;
  stage_history?: Array<{ stage: string; started_at: string; status: string }>;
}

interface Task {
  id?: string;
  title: string;
  description?: string;
  priority: string;
  category: string;
  status: string;
  assigned_to?: string;
  metadata?: Record<string, unknown>;
}

interface OrderDelay {
  id?: string;
  order_id: string;
  order_number?: string;
  delay_type: string;
  days_delayed: number;
  current_stage?: string;
  target_date?: string;
  severity: string;
  status: string;
}

interface Alert {
  id?: string;
  title: string;
  message: string;
  severity: string;
  category: string;
  status: string;
}

/* ------------------------------------------------------------------ */
/*  Component (background)                                             */
/* ------------------------------------------------------------------ */

export default function ProductionFlowAutomation() {
  useEffect(() => {
    const interval = setInterval(runProductionAutomation, 3 * 60 * 1000);
    runProductionAutomation();
    return () => clearInterval(interval);
  }, []);

  const runProductionAutomation = async () => {
    try {
      await autoProgressStages();
      await detectDelays();
      await optimizeWorkload();
      await qualityCheckReminders();
    } catch (error) {
      console.error("Production automation error:", error);
    }
  };

  const autoProgressStages = async () => {
    const orders = await entityFilter<ProductionOrder>("production-order", {
      status: "in_progress",
    });

    for (const order of orders) {
      if (order.current_stage === "cutting" && order.cutting_completed) {
        await entityUpdate<ProductionOrder>("production-order", order.id, {
          current_stage: "welding",
          stage_history: [
            ...(order.stage_history || []),
            { stage: "welding", started_at: new Date().toISOString(), status: "started" },
          ],
        } as Partial<ProductionOrder>);

        await entityCreate<Task>("task", {
          title: `Welding - Order ${order.order_number}`,
          description: "Welding stage started",
          priority: "medium",
          category: "production",
          status: "todo",
          metadata: { production_order_id: order.id },
        } as Task);
      }
    }
  };

  const detectDelays = async () => {
    const orders = await entityFilter<ProductionOrder>("production-order", {
      status: "in_progress",
    });

    for (const order of orders) {
      if (!order.target_date) continue;

      const daysUntilTarget = Math.floor(
        (new Date(order.target_date).getTime() - Date.now()) / 86_400_000
      );

      if (daysUntilTarget < 3 && daysUntilTarget >= 0) {
        const existing = await entityFilter<OrderDelay>("order-delay", {
          order_id: order.id,
          status: "open",
        });

        if (existing.length === 0) {
          await entityCreate<OrderDelay>("order-delay", {
            order_id: order.id,
            order_number: order.order_number,
            delay_type: "approaching_deadline",
            days_delayed: 0,
            current_stage: order.current_stage,
            target_date: order.target_date,
            severity: "medium",
            status: "open",
          } as OrderDelay);
        }
      }
    }
  };

  const optimizeWorkload = async () => {
    const tasks = await entityFilter<Task>("task", {
      category: "production",
      status: "todo",
    });

    const workloadMap: Record<string, number> = {};
    tasks.forEach((task) => {
      const assignee = task.assigned_to || "unassigned";
      workloadMap[assignee] = (workloadMap[assignee] || 0) + 1;
    });

    for (const [assignee, count] of Object.entries(workloadMap)) {
      if (count > 15) {
        await entityCreate<Alert>("alert", {
          title: "Worker overload",
          message: `Worker ${assignee} has ${count} open tasks`,
          severity: "high",
          category: "workload",
          status: "active",
        } as Alert);
      }
    }
  };

  const qualityCheckReminders = async () => {
    const orders = await entityFilter<ProductionOrder>("production-order", {
      current_stage: "qc",
      status: "in_progress",
    });

    for (const order of orders) {
      const qcTasks = await entityFilter<Task>("task", {
        category: "qc",
        metadata: { production_order_id: order.id },
      });

      if (qcTasks.length === 0) {
        await entityCreate<Task>("task", {
          title: `Quality check - ${order.order_number}`,
          description: "Full quality inspection required",
          priority: "high",
          category: "qc",
          status: "todo",
          metadata: { production_order_id: order.id },
        } as Task);
      }
    }
  };

  return null;
}
