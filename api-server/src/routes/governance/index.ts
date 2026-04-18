// ============================================================
// Governance domain aggregator router — mounted at /api/governance
// All sub-routers install authMiddleware + adminMiddleware.
// ============================================================
import { Router } from "express";

import usersRouter from "./users";
import rolesRouter from "./roles";
import permissionsRouter from "./permissions";
import rolePermissionsRouter from "./role-permissions";
import userRolesRouter from "./user-roles";
import auditLogsRouter from "./audit-logs";
import stateHistoryRouter from "./state-history";
import domainEventsRouter from "./domain-events";
import webhooksRouter from "./webhooks";
import webhookDeliveriesRouter from "./webhook-deliveries";
import integrationsRouter from "./integrations";
import integrationSyncLogsRouter from "./integration-sync-logs";
import featureFlagsRouter from "./feature-flags";
import savedFiltersRouter from "./saved-filters";
import userPreferencesRouter from "./user-preferences";
import configEntriesRouter from "./config-entries";
import queueJobsRouter from "./queue-jobs";
import slaTimersRouter from "./sla-timers";
import escalationRulesRouter from "./escalation-rules";
import healthChecksRouter from "./health-checks";
import validationsLogRouter from "./validations-log";
import securityEventsRouter from "./security-events";
import commandLogsRouter from "./command-logs";

const governanceRouter = Router();

governanceRouter.use("/users", usersRouter);
governanceRouter.use("/roles", rolesRouter);
governanceRouter.use("/permissions", permissionsRouter);
governanceRouter.use("/role-permissions", rolePermissionsRouter);
governanceRouter.use("/user-roles", userRolesRouter);
governanceRouter.use("/audit-logs", auditLogsRouter);
governanceRouter.use("/state-history", stateHistoryRouter);
governanceRouter.use("/domain-events", domainEventsRouter);
governanceRouter.use("/webhooks", webhooksRouter);
governanceRouter.use("/webhook-deliveries", webhookDeliveriesRouter);
governanceRouter.use("/integrations", integrationsRouter);
governanceRouter.use("/integration-sync-logs", integrationSyncLogsRouter);
governanceRouter.use("/feature-flags", featureFlagsRouter);
governanceRouter.use("/saved-filters", savedFiltersRouter);
governanceRouter.use("/user-preferences", userPreferencesRouter);
governanceRouter.use("/config", configEntriesRouter);
governanceRouter.use("/queue-jobs", queueJobsRouter);
governanceRouter.use("/sla-timers", slaTimersRouter);
governanceRouter.use("/escalation-rules", escalationRulesRouter);
governanceRouter.use("/health-checks", healthChecksRouter);
governanceRouter.use("/validations-log", validationsLogRouter);
governanceRouter.use("/security-events", securityEventsRouter);
governanceRouter.use("/command-logs", commandLogsRouter);

export default governanceRouter;
