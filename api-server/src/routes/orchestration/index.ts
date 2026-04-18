// ============================================================
// Orchestration domain aggregator router — mounted at /api/orchestration
// All sub-routers install authMiddleware. Admin-sensitive operations
// additionally install adminMiddleware at the handler level.
// ============================================================
import { Router } from "express";

import workflowDefinitionsRouter from "./workflow-definitions";
import workflowRunsRouter from "./workflow-runs";
import workflowTriggersRouter from "./workflow-triggers";
import jobQueueRouter from "./job-queue";
import universalInboxRouter from "./universal-inbox";
import notificationsRouter from "./notifications";

const orchestrationRouter = Router();

orchestrationRouter.use("/workflows", workflowDefinitionsRouter);
orchestrationRouter.use("/workflow-runs", workflowRunsRouter);
orchestrationRouter.use("/workflow-triggers", workflowTriggersRouter);
orchestrationRouter.use("/job-queue", jobQueueRouter);
orchestrationRouter.use("/universal-inbox", universalInboxRouter);
orchestrationRouter.use("/notifications", notificationsRouter);

export default orchestrationRouter;
