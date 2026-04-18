import { Router, type IRouter } from "express";

const router: IRouter = Router();

interface ExecutionRule {
  id: string;
  action: string;
  mode: "autonomous" | "approval_required" | "blocked";
  description: string;
  conditions?: string[];
}

const EXECUTION_RULES: ExecutionRule[] = [
  { id: "read_metadata", action: "read_metadata", mode: "autonomous", description: "Reading any metadata is always allowed" },
  { id: "read_records", action: "read_records", mode: "autonomous", description: "Reading records is always allowed" },
  { id: "create_draft_module", action: "create_module", mode: "autonomous", description: "Creating draft modules is autonomous" },
  { id: "create_draft_entity", action: "create_entity", mode: "autonomous", description: "Creating draft entities is autonomous" },
  { id: "create_field", action: "create_field", mode: "autonomous", description: "Adding fields to draft entities is autonomous" },
  { id: "create_form", action: "create_form", mode: "autonomous", description: "Creating form definitions is autonomous" },
  { id: "create_view", action: "create_view", mode: "autonomous", description: "Creating view definitions is autonomous" },
  { id: "create_relation", action: "create_relation", mode: "autonomous", description: "Creating relations is autonomous" },
  { id: "create_status", action: "create_status", mode: "autonomous", description: "Creating statuses is autonomous" },
  { id: "update_module", action: "update_module", mode: "autonomous", description: "Updating draft modules is autonomous" },
  { id: "update_entity", action: "update_entity", mode: "autonomous", description: "Updating draft entities is autonomous" },
  { id: "update_field", action: "update_field", mode: "autonomous", description: "Updating draft fields is autonomous" },
  { id: "validate", action: "validate", mode: "autonomous", description: "Running validation is always autonomous" },
  { id: "lint", action: "lint", mode: "autonomous", description: "Running lint checks is always autonomous" },
  { id: "preview_impact", action: "preview_impact", mode: "autonomous", description: "Previewing impact is always autonomous" },
  { id: "dry_run", action: "dry_run", mode: "autonomous", description: "Dry-run publishing is always autonomous" },

  { id: "publish_module", action: "publish_module", mode: "approval_required", description: "Publishing requires admin approval", conditions: ["admin_role_required"] },
  { id: "delete_module", action: "delete_module", mode: "approval_required", description: "Deleting modules requires approval", conditions: ["admin_role_required", "cascade_check"] },
  { id: "delete_entity", action: "delete_entity", mode: "approval_required", description: "Deleting entities requires approval", conditions: ["admin_role_required", "dependency_check"] },
  { id: "delete_field", action: "delete_field", mode: "approval_required", description: "Deleting fields requires approval", conditions: ["dependency_check"] },
  { id: "manage_permissions", action: "manage_permissions", mode: "approval_required", description: "Permission changes require approval" },
  { id: "manage_api_keys", action: "manage_api_keys", mode: "approval_required", description: "API key management requires approval" },
  { id: "bulk_delete", action: "bulk_delete", mode: "approval_required", description: "Bulk deletions always require approval", conditions: ["admin_role_required"] },
  { id: "modify_active_module", action: "modify_active", mode: "approval_required", description: "Modifying active/published modules requires approval", conditions: ["version_check"] },

  { id: "direct_db_access", action: "direct_db_access", mode: "blocked", description: "Direct database access is never allowed" },
  { id: "system_config_change", action: "system_config_change", mode: "blocked", description: "System-level configuration changes are blocked" },
  { id: "user_management", action: "user_management", mode: "blocked", description: "User management operations are blocked for Claude" },
];

router.get("/claude/execution-policy/rules", async (_req, res) => {
  const autonomous = EXECUTION_RULES.filter((r) => r.mode === "autonomous");
  const approvalRequired = EXECUTION_RULES.filter((r) => r.mode === "approval_required");
  const blocked = EXECUTION_RULES.filter((r) => r.mode === "blocked");

  res.json({
    rules: EXECUTION_RULES,
    summary: {
      autonomous: autonomous.length,
      approvalRequired: approvalRequired.length,
      blocked: blocked.length,
      total: EXECUTION_RULES.length,
    },
    byMode: { autonomous, approvalRequired, blocked },
  });
});

router.post("/claude/execution-policy/evaluate", async (req, res) => {
  const { action, role, targetType, targetId } = req.body;

  if (!action) {
    res.status(400).json({ error: "action is required" });
    return;
  }

  const rule = EXECUTION_RULES.find((r) => r.action === action);
  if (!rule) {
    res.json({
      action,
      decision: "blocked",
      reason: "no_policy_defined",
      message: `No execution policy found for action "${action}". Default is blocked.`,
    });
    return;
  }

  if (rule.mode === "blocked") {
    res.json({
      action,
      decision: "blocked",
      reason: "policy_blocked",
      message: rule.description,
    });
    return;
  }

  if (rule.mode === "approval_required") {
    res.json({
      action,
      decision: "approval_required",
      reason: "policy_requires_approval",
      message: rule.description,
      conditions: rule.conditions || [],
      approverRole: "admin",
    });
    return;
  }

  res.json({
    action,
    decision: "autonomous",
    reason: "policy_allows",
    message: rule.description,
  });
});

router.get("/claude/execution-policy/can-execute", async (req, res) => {
  const action = req.query.action as string;
  const role = req.query.role as string || "developer";

  if (!action) {
    res.status(400).json({ error: "action query parameter is required" });
    return;
  }

  const rule = EXECUTION_RULES.find((r) => r.action === action);

  if (!rule) {
    res.json({ canExecute: false, reason: "unknown_action" });
    return;
  }

  if (rule.mode === "blocked") {
    res.json({ canExecute: false, reason: "blocked", description: rule.description });
    return;
  }

  if (rule.mode === "approval_required") {
    res.json({
      canExecute: false,
      reason: "needs_approval",
      description: rule.description,
      conditions: rule.conditions,
    });
    return;
  }

  res.json({ canExecute: true, reason: "autonomous", description: rule.description });
});

export default router;
