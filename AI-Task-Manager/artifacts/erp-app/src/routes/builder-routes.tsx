import { Route } from "wouter";
import { lazyPage } from "@/routes/lazy-utils";

const Dashboard = lazyPage(() => import("@/pages/dashboard"));
const BuilderDashboard = lazyPage(() => import("@/pages/builder/builder-dashboard"));
const ModuleEditor = lazyPage(() => import("@/pages/builder/module-editor"));
const EntityEditor = lazyPage(() => import("@/pages/builder/entity-editor"));
const DynamicDataView = lazyPage(() => import("@/pages/builder/dynamic-data-view"));
const BuilderSection = lazyPage(() => import("@/pages/builder/builder-section"));
const MenuBuilderPage = lazyPage(() => import("@/pages/menu-builder"));
const DashboardBuilderPage = lazyPage(() => import("@/pages/builder/dashboard-builder"));
const TemplateBuilderPage = lazyPage(() => import("@/pages/builder/template-builder"));
const WorkflowBuilderPage = lazyPage(() => import("@/pages/builder/workflow-builder"));
const AutomationBuilderPage = lazyPage(() => import("@/pages/builder/automation-builder"));
const AutomationDashboardPage = lazyPage(() => import("@/pages/builder/automation-dashboard"));
const BusinessRulesBuilderPage = lazyPage(() => import("@/pages/builder/business-rules-builder"));
const WebhookManagementPage = lazyPage(() => import("@/pages/builder/webhook-management"));
const ScheduledTasksPage = lazyPage(() => import("@/pages/builder/scheduled-tasks"));
const FormBuilderPage = lazyPage(() => import("@/pages/builder/form-builder"));
const ViewBuilderPage = lazyPage(() => import("@/pages/builder/view-builder"));
const DetailPageBuilderPage = lazyPage(() => import("@/pages/builder/detail-page-builder"));
const ButtonsBuilderPage = lazyPage(() => import("@/pages/builder/buttons-builder"));
const PermissionsBuilderPage = lazyPage(() => import("@/pages/builder/permissions-builder"));
const VersioningBuilderPage = lazyPage(() => import("@/pages/builder/versioning-builder"));
const ModuleVersionHistory = lazyPage(() => import("@/pages/builder/module-version-history"));
const ToolBuilderPage = lazyPage(() => import("@/pages/builder/tool-builder"));
const ContextBuilderPage = lazyPage(() => import("@/pages/builder/context-builder"));
const WidgetBuilderPage = lazyPage(() => import("@/pages/builder/widget-builder"));
const DataFlowAutomationsPage = lazyPage(() => import("@/pages/platform/data-flow-automations"));
const ApprovalChainsPage = lazyPage(() => import("@/pages/platform/approval-chains"));
const SlaDashboardPage = lazyPage(() => import("@/pages/platform/sla-dashboard"));
const RecycleBinPage = lazyPage(() => import("@/pages/platform/recycle-bin"));
const ReportBuilderPage = lazyPage(() => import("@/pages/report-builder"));
const DocumentBuilderPage = lazyPage(() => import("@/pages/document-builder"));
const IntegrationBuilderPage = lazyPage(() => import("@/pages/integration-builder"));
const IntegrationsHubPage = lazyPage(() => import("@/pages/integrations-hub"));
const IntegrationSettingsPage = lazyPage(() => import("@/pages/integration-settings"));
const AiBuilderPage = lazyPage(() => import("@/pages/ai-builder"));
const ModuleView = lazyPage(() => import("@/pages/module-view"));
const AuditLogPage = lazyPage(() => import("@/pages/audit-log"));

export const BuilderRoutes = (

    <>
      <Route path="/builder" component={BuilderDashboard} />
      <Route path="/builder/modules" component={BuilderDashboard} />
      <Route path="/builder/module/:id/versions" component={ModuleVersionHistory} />
      <Route path="/builder/module/:id" component={ModuleEditor} />
      <Route path="/builder/entity/:id" component={EntityEditor} />
      <Route path="/builder/data/:entityId" component={DynamicDataView} />
      <Route path="/module/:entityId" component={ModuleView} />
      <Route path="/builder/entities" component={() => <BuilderSection section="entities" />} />
      <Route path="/builder/fields" component={() => <BuilderSection section="fields" />} />
      <Route path="/builder/relations" component={() => <BuilderSection section="relations" />} />
      <Route path="/builder/forms" component={FormBuilderPage} />
      <Route path="/builder/views" component={ViewBuilderPage} />
      <Route path="/builder/details" component={DetailPageBuilderPage} />
      <Route path="/builder/categories" component={() => <BuilderSection section="categories" />} />
      <Route path="/builder/statuses" component={() => <BuilderSection section="statuses" />} />
      <Route path="/builder/buttons" component={ButtonsBuilderPage} />
      <Route path="/builder/actions" component={() => <BuilderSection section="actions" />} />
      <Route path="/builder/validations" component={() => <BuilderSection section="validations" />} />
      <Route path="/builder/permissions" component={PermissionsBuilderPage} />
      <Route path="/builder/menus" component={MenuBuilderPage} />
      <Route path="/builder/dashboards" component={DashboardBuilderPage} />
      <Route path="/builder/widgets" component={WidgetBuilderPage} />
      <Route path="/builder/workflows" component={WorkflowBuilderPage} />
      <Route path="/builder/automations" component={AutomationBuilderPage} />
      <Route path="/builder/automation-dashboard" component={AutomationDashboardPage} />
      <Route path="/builder/business-rules" component={BusinessRulesBuilderPage} />
      <Route path="/builder/webhook-management" component={WebhookManagementPage} />
      <Route path="/builder/scheduled-tasks" component={ScheduledTasksPage} />
      <Route path="/platform/data-flow-automations" component={DataFlowAutomationsPage} />
      <Route path="/platform/approval-chains" component={ApprovalChainsPage} />
      <Route path="/platform/sla-dashboard" component={SlaDashboardPage} />
      <Route path="/platform/recycle-bin" component={RecycleBinPage} />
      <Route path="/builder/templates" component={TemplateBuilderPage} />
      <Route path="/builder/tools" component={ToolBuilderPage} />
      <Route path="/builder/contexts" component={ContextBuilderPage} />
      <Route path="/builder/publish" component={VersioningBuilderPage} />
      <Route path="/menu-builder" component={MenuBuilderPage} />
      <Route path="/audit-log" component={AuditLogPage} />
      <Route path="/report-builder" component={ReportBuilderPage} />
      <Route path="/document-builder" component={DocumentBuilderPage} />
      <Route path="/integration-builder" component={IntegrationBuilderPage} />
      <Route path="/integrations-hub" component={IntegrationsHubPage} />
      <Route path="/integrations-hub/:slug" component={IntegrationSettingsPage} />
      <Route path="/ai-builder" component={AiBuilderPage} />
    </>
);
