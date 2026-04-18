// ============================================================
// Execution domain — route aggregator
// Mounts all 29 execution-entity sub-routers under /api/execution/*
// Generated: 2026-04-18
// ============================================================
import { Router } from "express";

import projectsRouter from "./projects";
import projectPhasesRouter from "./project-phases";
import projectMilestonesRouter from "./project-milestones";
import projectRisksRouter from "./project-risks";
import projectBlockersRouter from "./project-blockers";
import projectCostPlansRouter from "./project-cost-plans";
import projectResourcesRouter from "./project-resources";
import tasksRouter from "./tasks";
import taskDependenciesRouter from "./task-dependencies";
import taskCommentsRouter from "./task-comments";
import taskAttachmentsRouter from "./task-attachments";
import workOrdersRouter from "./work-orders";
import workOrderTasksRouter from "./work-order-tasks";
import workOrderQaChecklistsRouter from "./work-order-qa-checklists";
import workOrderQaItemsRouter from "./work-order-qa-items";
import deliveryEventsRouter from "./delivery-events";
import installationEventsRouter from "./installation-events";
import logisticsOrdersRouter from "./logistics-orders";
import signaturesRouter from "./signatures";
import alertsRouter from "./alerts";
import dependenciesRouter from "./dependencies";
import productionOrdersRouter from "./production-orders";
import workCentersRouter from "./work-centers";
import laborLogsRouter from "./labor-logs";
import installationTeamsRouter from "./installation-teams";
import siteVisitsRouter from "./site-visits";
import punchListsRouter from "./punch-lists";
import drawingsRouter from "./drawings";
import bomHeadersRouter from "./bom-headers";
import revisionControlRouter from "./revision-control";

const router = Router();

router.use("/projects", projectsRouter);
router.use("/project-phases", projectPhasesRouter);
router.use("/project-milestones", projectMilestonesRouter);
router.use("/project-risks", projectRisksRouter);
router.use("/project-blockers", projectBlockersRouter);
router.use("/project-cost-plans", projectCostPlansRouter);
router.use("/project-resources", projectResourcesRouter);
router.use("/tasks", tasksRouter);
router.use("/task-dependencies", taskDependenciesRouter);
router.use("/task-comments", taskCommentsRouter);
router.use("/task-attachments", taskAttachmentsRouter);
router.use("/work-orders", workOrdersRouter);
router.use("/work-order-tasks", workOrderTasksRouter);
router.use("/work-order-qa-checklists", workOrderQaChecklistsRouter);
router.use("/work-order-qa-items", workOrderQaItemsRouter);
router.use("/delivery-events", deliveryEventsRouter);
router.use("/installation-events", installationEventsRouter);
router.use("/logistics-orders", logisticsOrdersRouter);
router.use("/signatures", signaturesRouter);
router.use("/alerts", alertsRouter);
router.use("/dependencies", dependenciesRouter);
router.use("/production-orders", productionOrdersRouter);
router.use("/work-centers", workCentersRouter);
router.use("/labor-logs", laborLogsRouter);
router.use("/installation-teams", installationTeamsRouter);
router.use("/site-visits", siteVisitsRouter);
router.use("/punch-lists", punchListsRouter);
router.use("/drawings", drawingsRouter);
router.use("/bom-headers", bomHeadersRouter);
router.use("/revision-control", revisionControlRouter);

export default router;
