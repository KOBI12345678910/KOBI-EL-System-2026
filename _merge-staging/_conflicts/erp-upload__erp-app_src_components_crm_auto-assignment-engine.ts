/**
 * Auto Assignment Engine
 *
 * IF source IN (website, facebook) THEN manager_queue
 * ELSE auto_assign()
 */
import {
  entityFilter,
  entityList,
  entityUpdate,
} from "@/lib/entity-api";

interface AssignmentResult {
  method: string;
  assigned_to: string | null;
  rule_id?: string | number;
}

interface Lead {
  [key: string]: unknown;
}

interface RoutingRule {
  id: string | number;
  rule_name: string;
  priority?: number;
  conditions?: { field: string; operator: string; value: string }[];
  assignment_config: {
    type: string;
    user_email?: string;
    users_pool?: string[];
    current_index?: number;
  };
}

export async function autoAssignLead(
  lead: Lead,
  source: string
): Promise<AssignmentResult | null> {
  // Step 1: Check source - website/facebook go to manager
  if (["website", "facebook", "instagram"].includes(source)) {
    console.log("Source requires manager approval:", source);
    return {
      method: "manager_queue",
      assigned_to: null,
    };
  }

  // Step 2: Auto-assign by rules
  const rules = (await entityFilter<RoutingRule>("lead-routing-rules", {
    is_active: true,
  })) as RoutingRule[];

  // Sort by priority
  rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of rules) {
    if (await shouldApplyRule(rule, lead)) {
      console.log("Applying rule:", rule.rule_name);

      if (rule.assignment_config.type === "specific_user") {
        return {
          method: "auto_rules",
          assigned_to: rule.assignment_config.user_email ?? null,
          rule_id: rule.id,
        };
      }

      if (rule.assignment_config.type === "round_robin") {
        return await assignRoundRobin(rule, lead);
      }

      if (rule.assignment_config.type === "load_balanced") {
        return await assignByLoad(rule.assignment_config.users_pool || []);
      }
    }
  }

  // Step 3: Default - Round Robin all agents
  return await assignDefaultRoundRobin();
}

// Round Robin assignment
async function assignRoundRobin(
  rule: RoutingRule,
  _lead: Lead
): Promise<AssignmentResult | null> {
  const pool = rule.assignment_config.users_pool || [];
  if (pool.length === 0) return null;

  const currentIndex = rule.assignment_config.current_index || 0;
  const assignedTo = pool[currentIndex % pool.length];

  // Update rule index
  await entityUpdate("lead-routing-rules", rule.id, {
    assignment_config: {
      ...rule.assignment_config,
      current_index: currentIndex + 1,
    },
  });

  return {
    method: "auto_round_robin",
    assigned_to: assignedTo,
    rule_id: rule.id,
  };
}

// Load-balanced assignment (least busy agent)
async function assignByLoad(usersPool: string[]): Promise<AssignmentResult> {
  const leads = await entityList<Record<string, unknown>>("leads");
  const workload: Record<string, number> = {};

  usersPool.forEach((email) => {
    workload[email] = leads.filter(
      (l) =>
        l.owner_user_id === email &&
        !["won", "lost", "not_relevant"].includes(l.sales_status as string)
    ).length;
  });

  const leastBusy = Object.keys(workload).reduce((a, b) =>
    workload[a] < workload[b] ? a : b
  );

  return {
    method: "auto_load_balanced",
    assigned_to: leastBusy,
  };
}

// Default Round Robin (all users)
async function assignDefaultRoundRobin(): Promise<AssignmentResult | null> {
  const users = await entityList<Record<string, unknown>>("users");
  const agents = users.filter((u) => u.role === "user");

  if (agents.length === 0) return null;

  // Simple round robin based on total leads
  const leads = await entityList<Record<string, unknown>>("leads");
  const counts: Record<string, number> = {};

  agents.forEach((agent) => {
    counts[agent.email as string] = leads.filter(
      (l) => l.owner_user_id === agent.email
    ).length;
  });

  const leastAssigned = agents.reduce((prev, curr) =>
    counts[curr.email as string] < counts[prev.email as string] ? curr : prev
  );

  return {
    method: "auto_round_robin",
    assigned_to: leastAssigned.email as string,
  };
}

// Check if rule conditions match lead
async function shouldApplyRule(rule: RoutingRule, lead: Lead): Promise<boolean> {
  if (!rule.conditions || rule.conditions.length === 0) return true;

  for (const condition of rule.conditions) {
    const fieldValue = lead[condition.field] as string | undefined;

    switch (condition.operator) {
      case "equals":
        if (fieldValue !== condition.value) return false;
        break;
      case "contains":
        if (!fieldValue?.includes(condition.value)) return false;
        break;
      case "in": {
        const values = condition.value.split(",");
        if (!values.includes(fieldValue ?? "")) return false;
        break;
      }
    }
  }

  return true;
}
