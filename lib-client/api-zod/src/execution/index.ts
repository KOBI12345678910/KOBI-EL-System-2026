// ============================================================
// Execution domain — Zod barrel
// Generated: 2026-04-18
// 29 entities covering the execution domain per
// _master-registry/domains/execution.md §1.
// ============================================================

export * from "./_shared";

// --- Project entity cluster (6)
export * as Projects from "./projects";
export * as ProjectPhases from "./project-phases";
export * as ProjectMilestones from "./project-milestones";
export * as ProjectRisks from "./project-risks";
export * as ProjectBlockers from "./project-blockers";
export * as ProjectCostPlans from "./project-cost-plans";
export * as ProjectResources from "./project-resources";

// --- Task cluster (4)
export * as Tasks from "./tasks";
export * as TaskDependencies from "./task-dependencies";
export * as TaskComments from "./task-comments";
export * as TaskAttachments from "./task-attachments";

// --- Work Order cluster (4)
export * as WorkOrders from "./work-orders";
export * as WorkOrderTasks from "./work-order-tasks";
export * as WorkOrderQaChecklists from "./work-order-qa-checklists";
export * as WorkOrderQaItems from "./work-order-qa-items";

// --- Field operations (3)
export * as DeliveryEvents from "./delivery-events";
export * as InstallationEvents from "./installation-events";
export * as LogisticsOrders from "./logistics-orders";

// --- Common (2)
export * as Signatures from "./signatures";
export * as Alerts from "./alerts";

// --- Dependency graph (1)
export * as Dependencies from "./dependencies";

// --- Production cluster (3)
export * as ProductionOrders from "./production-orders";
export * as WorkCenters from "./work-centers";
export * as LaborLogs from "./labor-logs";

// --- Installation cluster (3)
export * as InstallationTeams from "./installation-teams";
export * as SiteVisits from "./site-visits";
export * as PunchLists from "./punch-lists";

// --- Engineering cluster (3)
export * as Drawings from "./drawings";
export * as BomHeaders from "./bom-headers";
export * as RevisionControl from "./revision-control";
