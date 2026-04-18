import { useEffect } from "react";
import {
  entityList,
  entityFilter,
  entityCreate,
  entityUpdate,
} from "@/lib/entity-api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WorkflowCondition {
  field: string;
  operator: string;
  value: string;
}

interface WorkflowAction {
  type: string;
  value?: string | { subject?: string; body?: string; field?: string; value?: string };
}

interface LeadAutomationRule {
  id: string;
  is_active: boolean;
  priority?: number;
  conditions?: WorkflowCondition[];
  actions: WorkflowAction[];
  execution_count?: number;
  last_executed_at?: string;
}

interface WorkflowExecution {
  id?: string;
  workflow_id: string;
  entity_id: string;
  executed_at?: string;
  status?: string;
}

interface Lead {
  id: string;
  email?: string;
  owner_id?: string;
  assigned_at?: string;
  [key: string]: unknown;
}

interface Task {
  id?: string;
  lead_id: string;
  title: string;
  priority: string;
  status: string;
  category: string;
}

interface LeadActivity {
  id?: string;
  lead_id: string;
  type: string;
  description: string;
}

/* ------------------------------------------------------------------ */
/*  Component (background)                                             */
/* ------------------------------------------------------------------ */

export default function WorkflowAutomationEngine() {
  useEffect(() => {
    const interval = setInterval(executeWorkflows, 60 * 1000);
    executeWorkflows();
    return () => clearInterval(interval);
  }, []);

  const executeWorkflows = async () => {
    try {
      const workflows = await entityFilter<LeadAutomationRule>(
        "lead-automation-rule",
        { is_active: true }
      );

      for (const workflow of workflows) {
        await executeWorkflow(workflow);
      }
    } catch (error) {
      console.error("Workflow execution error:", error);
    }
  };

  const executeWorkflow = async (workflow: LeadAutomationRule) => {
    try {
      const entities = await findMatchingEntities(workflow);

      for (const entity of entities) {
        const executions = await entityFilter<WorkflowExecution>(
          "workflow-execution",
          { workflow_id: workflow.id, entity_id: entity.id }
        );
        if (executions.length > 0) continue;

        for (const action of workflow.actions) {
          await executeAction(action, entity);
        }

        await entityCreate<WorkflowExecution>("workflow-execution", {
          workflow_id: workflow.id,
          entity_id: entity.id,
          executed_at: new Date().toISOString(),
          status: "completed",
        } as WorkflowExecution);

        await entityUpdate<LeadAutomationRule>(
          "lead-automation-rule",
          workflow.id,
          {
            execution_count: (workflow.execution_count || 0) + 1,
            last_executed_at: new Date().toISOString(),
          } as Partial<LeadAutomationRule>
        );
      }
    } catch (error) {
      console.error("Workflow error:", error);
    }
  };

  const findMatchingEntities = async (
    workflow: LeadAutomationRule
  ): Promise<Lead[]> => {
    const leads = await entityList<Lead>("lead");

    return leads.filter((lead) => {
      if (!workflow.conditions || workflow.conditions.length === 0) return false;

      return workflow.conditions.every((condition) => {
        const fieldValue = lead[condition.field];

        switch (condition.operator) {
          case "equals":
            return fieldValue === condition.value;
          case "contains":
            return fieldValue?.toString().includes(condition.value);
          case "starts_with":
            return fieldValue?.toString().startsWith(condition.value);
          case "greater_than":
            return parseFloat(fieldValue as string) > parseFloat(condition.value);
          case "less_than":
            return parseFloat(fieldValue as string) < parseFloat(condition.value);
          case "in":
            return condition.value?.split(",").includes(fieldValue as string);
          default:
            return false;
        }
      });
    });
  };

  const executeAction = async (action: WorkflowAction, entity: Lead) => {
    const val = action.value;

    switch (action.type) {
      case "assign":
        await entityUpdate<Lead>("lead", entity.id, {
          owner_id: val as string,
          assigned_at: new Date().toISOString(),
        } as Partial<Lead>);
        break;

      case "create_task":
        await entityCreate<Task>("task", {
          lead_id: entity.id,
          title: (val as string) || "Automatic task",
          priority: "medium",
          status: "todo",
          category: "follow_up",
        } as Task);
        break;

      case "send_email":
        if (entity.email) {
          // NOTE: SendEmail integration removed. Replace with your own API.
          const emailVal = val as { subject?: string; body?: string } | undefined;
          console.info(
            "[WorkflowAutomation] Would send email to",
            entity.email,
            emailVal?.subject
          );
        }
        break;

      case "update_field": {
        const fieldVal = val as { field?: string; value?: string } | undefined;
        if (fieldVal?.field) {
          await entityUpdate<Lead>("lead", entity.id, {
            [fieldVal.field]: fieldVal.value,
          } as Partial<Lead>);
        }
        break;
      }

      case "create_activity":
        await entityCreate<LeadActivity>("lead-activity", {
          lead_id: entity.id,
          type: "automation",
          description: (val as string) || "Automatic action executed",
        } as LeadActivity);
        break;
    }
  };

  return null;
}
