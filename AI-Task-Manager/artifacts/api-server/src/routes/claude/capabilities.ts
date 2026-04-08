import { Router, type IRouter } from "express";

const router: IRouter = Router();

interface Capability {
  id: string;
  name: string;
  description: string;
  category: string;
  endpoint: string;
  method: string;
  requiredRole: string;
  isEnabled: boolean;
  requiresApproval: boolean;
}

const CAPABILITIES: Capability[] = [
  { id: "read_modules", name: "Read Modules", description: "List and read platform module metadata", category: "system_read", endpoint: "/claude/system/modules", method: "GET", requiredRole: "viewer", isEnabled: true, requiresApproval: false },
  { id: "read_entities", name: "Read Entities", description: "List and read entity metadata", category: "system_read", endpoint: "/claude/system/entities", method: "GET", requiredRole: "viewer", isEnabled: true, requiresApproval: false },
  { id: "read_fields", name: "Read Fields", description: "List and read entity field definitions", category: "system_read", endpoint: "/claude/system/fields", method: "GET", requiredRole: "viewer", isEnabled: true, requiresApproval: false },
  { id: "read_relations", name: "Read Relations", description: "List and read entity relations", category: "system_read", endpoint: "/claude/system/relations", method: "GET", requiredRole: "viewer", isEnabled: true, requiresApproval: false },
  { id: "read_forms", name: "Read Forms", description: "List form definitions", category: "system_read", endpoint: "/claude/system/forms", method: "GET", requiredRole: "viewer", isEnabled: true, requiresApproval: false },
  { id: "read_views", name: "Read Views", description: "List view definitions", category: "system_read", endpoint: "/claude/system/views", method: "GET", requiredRole: "viewer", isEnabled: true, requiresApproval: false },

  { id: "knowledge_schema", name: "Schema Summary", description: "Get semantic schema summary", category: "knowledge", endpoint: "/claude/knowledge/schema-summary", method: "GET", requiredRole: "viewer", isEnabled: true, requiresApproval: false },
  { id: "knowledge_entity_map", name: "Entity Map", description: "Get semantic entity map", category: "knowledge", endpoint: "/claude/knowledge/entity-map", method: "GET", requiredRole: "viewer", isEnabled: true, requiresApproval: false },
  { id: "knowledge_relation_graph", name: "Relation Graph", description: "Get relation graph", category: "knowledge", endpoint: "/claude/knowledge/relation-graph", method: "GET", requiredRole: "viewer", isEnabled: true, requiresApproval: false },

  { id: "context_resolve", name: "Resolve Context", description: "Resolve runtime context for a user location", category: "context", endpoint: "/claude/context/resolve", method: "POST", requiredRole: "viewer", isEnabled: true, requiresApproval: false },

  { id: "create_module", name: "Create Module", description: "Create a new platform module (draft)", category: "builder", endpoint: "/claude/builder/modules", method: "POST", requiredRole: "developer", isEnabled: true, requiresApproval: false },
  { id: "update_module", name: "Update Module", description: "Update an existing module", category: "builder", endpoint: "/claude/builder/modules/:id", method: "PUT", requiredRole: "developer", isEnabled: true, requiresApproval: false },
  { id: "create_entity", name: "Create Entity", description: "Create a new entity in a module (draft)", category: "builder", endpoint: "/claude/builder/entities", method: "POST", requiredRole: "developer", isEnabled: true, requiresApproval: false },
  { id: "update_entity", name: "Update Entity", description: "Update an existing entity", category: "builder", endpoint: "/claude/builder/entities/:id", method: "PUT", requiredRole: "developer", isEnabled: true, requiresApproval: false },
  { id: "create_field", name: "Create Field", description: "Create a new field on an entity (draft)", category: "builder", endpoint: "/claude/builder/fields", method: "POST", requiredRole: "developer", isEnabled: true, requiresApproval: false },
  { id: "update_field", name: "Update Field", description: "Update an existing field", category: "builder", endpoint: "/claude/builder/fields/:id", method: "PUT", requiredRole: "developer", isEnabled: true, requiresApproval: false },
  { id: "create_form", name: "Create Form", description: "Create a new form definition", category: "builder", endpoint: "/claude/builder/forms", method: "POST", requiredRole: "developer", isEnabled: true, requiresApproval: false },
  { id: "create_view", name: "Create View", description: "Create a new view definition", category: "builder", endpoint: "/claude/builder/views", method: "POST", requiredRole: "developer", isEnabled: true, requiresApproval: false },
  { id: "create_relation", name: "Create Relation", description: "Create a new entity relation", category: "builder", endpoint: "/claude/builder/relations", method: "POST", requiredRole: "developer", isEnabled: true, requiresApproval: false },
  { id: "create_status", name: "Create Status", description: "Create a new entity status", category: "builder", endpoint: "/claude/builder/statuses", method: "POST", requiredRole: "developer", isEnabled: true, requiresApproval: false },
  { id: "create_workflow", name: "Create Workflow", description: "Create a new workflow", category: "builder", endpoint: "/claude/builder/workflows", method: "POST", requiredRole: "developer", isEnabled: true, requiresApproval: false },

  { id: "governance_validate", name: "Validate", description: "Run validation checks", category: "governance", endpoint: "/claude/governance/validate", method: "POST", requiredRole: "developer", isEnabled: true, requiresApproval: false },
  { id: "governance_publish", name: "Publish", description: "Publish draft changes", category: "governance", endpoint: "/claude/governance/publish", method: "POST", requiredRole: "admin", isEnabled: true, requiresApproval: true },
  { id: "governance_lint", name: "Lint", description: "Run linting checks on metadata", category: "governance", endpoint: "/claude/governance/lint", method: "POST", requiredRole: "developer", isEnabled: true, requiresApproval: false },

  { id: "preview_module_impact", name: "Module Impact", description: "Preview impact of module changes", category: "preview", endpoint: "/claude/preview/module-impact", method: "POST", requiredRole: "developer", isEnabled: true, requiresApproval: false },
  { id: "preview_dry_run", name: "Dry Run Publish", description: "Simulate publishing changes", category: "preview", endpoint: "/claude/preview/dry-run-publish", method: "POST", requiredRole: "developer", isEnabled: true, requiresApproval: false },

  { id: "management_status", name: "System Status", description: "View system management status", category: "management", endpoint: "/claude/management/status", method: "GET", requiredRole: "viewer", isEnabled: true, requiresApproval: false },
  { id: "management_health", name: "System Health", description: "View system health diagnostics", category: "management", endpoint: "/claude/management/health", method: "GET", requiredRole: "viewer", isEnabled: true, requiresApproval: false },

  { id: "dataflow_graph", name: "System Graph", description: "View full data flow system graph", category: "dataflow", endpoint: "/claude/dataflow/system-graph", method: "GET", requiredRole: "viewer", isEnabled: true, requiresApproval: false },

  { id: "audit_logs", name: "Audit Logs", description: "Query audit logs", category: "audit", endpoint: "/claude/audit/logs", method: "GET", requiredRole: "viewer", isEnabled: true, requiresApproval: false },
  { id: "audit_export", name: "Export Audit Logs", description: "Export audit logs", category: "audit", endpoint: "/claude/audit/export", method: "GET", requiredRole: "admin", isEnabled: true, requiresApproval: false },
];

router.get("/claude/capabilities/registry", async (_req, res) => {
  const categories = [...new Set(CAPABILITIES.map((c) => c.category))];

  const grouped = categories.map((cat) => ({
    category: cat,
    capabilities: CAPABILITIES.filter((c) => c.category === cat),
  }));

  res.json({
    totalCapabilities: CAPABILITIES.length,
    categories: grouped,
  });
});

router.get("/claude/capabilities/discover", async (req, res) => {
  const role = (req.query.role as string) || (req as any).claudeRole || "developer";
  const category = req.query.category as string;

  const roleHierarchy: Record<string, string[]> = {
    admin: ["admin", "developer", "viewer"],
    developer: ["developer", "viewer"],
    viewer: ["viewer"],
  };

  const allowedRoles = roleHierarchy[role] || ["viewer"];

  let available = CAPABILITIES.filter((c) => c.isEnabled && allowedRoles.includes(c.requiredRole));
  if (category) {
    available = available.filter((c) => c.category === category);
  }

  res.json({
    role,
    availableCapabilities: available.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      category: c.category,
      endpoint: c.endpoint,
      method: c.method,
      requiresApproval: c.requiresApproval,
    })),
    totalAvailable: available.length,
  });
});

router.get("/claude/capabilities/:capabilityId", async (req, res) => {
  const cap = CAPABILITIES.find((c) => c.id === req.params.capabilityId);
  if (!cap) {
    res.status(404).json({ error: "Capability not found" });
    return;
  }
  res.json(cap);
});

router.post("/claude/capabilities/:capabilityId/toggle", async (req, res) => {
  const cap = CAPABILITIES.find((c) => c.id === req.params.capabilityId);
  if (!cap) {
    res.status(404).json({ error: "Capability not found" });
    return;
  }

  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled (boolean) is required" });
    return;
  }

  cap.isEnabled = enabled;
  res.json({ id: cap.id, isEnabled: cap.isEnabled, message: `Capability "${cap.name}" ${enabled ? "enabled" : "disabled"}` });
});

export default router;
