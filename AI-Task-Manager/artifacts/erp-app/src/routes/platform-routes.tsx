import { Route, Redirect } from "wouter";
import { lazyPage } from "@/routes/lazy-utils";

const SecurityDashboardPage = lazyPage(() => import("@/pages/security/security-dashboard"));
const GdprCenterPage = lazyPage(() => import("@/pages/security/gdpr-center"));
const DataRetentionPage = lazyPage(() => import("@/pages/security/data-retention"));
const ComplianceReportsPage = lazyPage(() => import("@/pages/security/compliance-reports"));
const EncryptionMgmtPage = lazyPage(() => import("@/pages/security/encryption-management"));
const BackupDRPage = lazyPage(() => import("@/pages/security/backup-dr"));
const SecurityApiKeysPage = lazyPage(() => import("@/pages/security/tabs/api-keys-security"));
const SecurityCorsPage = lazyPage(() => import("@/pages/security/tabs/cors-management"));
const SecurityGeoBlockingPage = lazyPage(() => import("@/pages/security/tabs/geo-blocking"));
const SecurityIpManagementPage = lazyPage(() => import("@/pages/security/tabs/ip-management"));
const SecurityRateLimitPage = lazyPage(() => import("@/pages/security/tabs/rate-limit-config"));
const SecurityVulnerabilityPage = lazyPage(() => import("@/pages/security/tabs/vulnerability-tracker"));
const SecurityWebhookSecretsPage = lazyPage(() => import("@/pages/security/tabs/webhook-secrets"));
const PermissionsPage = lazyPage(() => import("@/pages/permissions"));
const GovernancePage = lazyPage(() => import("@/pages/governance"));
const ApiKeysPage = lazyPage(() => import("@/pages/api-keys"));
const ModelsPage = lazyPage(() => import("@/pages/models"));
const ProvidersPage = lazyPage(() => import("@/pages/providers"));
const QueriesPage = lazyPage(() => import("@/pages/queries"));
const RecommendationsPage = lazyPage(() => import("@/pages/recommendations"));
const ResponsesPage = lazyPage(() => import("@/pages/responses"));
const UsageLogsPage = lazyPage(() => import("@/pages/usage-logs"));
const PromptTemplatesPage = lazyPage(() => import("@/pages/prompt-templates"));
const SettingsHub = lazyPage(() => import("@/pages/settings/settings-hub"));
const SettingsDepartmentsPage = lazyPage(() => import("@/pages/settings/departments"));
const SettingsRolesPage = lazyPage(() => import("@/pages/settings/roles"));
const SettingsTriggersPage = lazyPage(() => import("@/pages/settings/triggers"));
const SettingsWebhooksPage = lazyPage(() => import("@/pages/settings/webhooks"));
const SettingsApiKeysPage = lazyPage(() => import("@/pages/settings/api-keys"));
const SettingsApiConnectionHubPage = lazyPage(() => import("@/pages/settings/api-connection-hub"));
const ApiHubPage = lazyPage(() => import("@/pages/ApiHub"));
const IntegrationHubPage = lazyPage(() => import("@/pages/IntegrationHub"));
const SettingsIsraeliIntegrationsPage = lazyPage(() => import("@/pages/settings/israeli-integrations"));
const ImportExportPage = lazyPage(() => import("@/pages/settings/import-export"));
const BackupsPage = lazyPage(() => import("@/pages/settings/backups"));
const SupportTicketsPage = lazyPage(() => import("@/pages/support/tickets"));
const NotificationsPage = lazyPage(() => import("@/pages/notifications"));
const NotificationPreferencesPage = lazyPage(() => import("@/pages/notification-preferences"));
const AlertTerminalPage = lazyPage(() => import("@/pages/alert-terminal"));
const NotificationRoutingPage = lazyPage(() => import("@/pages/notification-routing"));
const EmailTemplatesPage = lazyPage(() => import("@/pages/notification-settings/email-templates"));
const DeliveryDashboardPage = lazyPage(() => import("@/pages/notification-settings/delivery-dashboard"));
const SystemAuditLogPage = lazyPage(() => import("@/pages/system/audit-log"));
const ModelCatalogPage = lazyPage(() => import("@/pages/system/model-catalog"));
const AnalyticsEnginePage = lazyPage(() => import("@/pages/analytics-engine"));
const WhatsAppAIPage = lazyPage(() => import("@/pages/whatsapp-ai"));
const CompanyFinancialsPage = lazyPage(() => import("@/pages/company-financials"));
const ProductCatalogPage = lazyPage(() => import("@/pages/modules/product-catalog"));

export const PlatformRoutes = (

    <>
      <Route path="/permissions" component={PermissionsPage} />
      <Route path="/governance" component={GovernancePage} />
      <Route path="/security" component={SecurityDashboardPage} />
      <Route path="/security/gdpr" component={GdprCenterPage} />
      <Route path="/security/retention" component={DataRetentionPage} />
      <Route path="/security/compliance-reports" component={ComplianceReportsPage} />
      <Route path="/security/encryption" component={EncryptionMgmtPage} />
      <Route path="/security/backups" component={BackupDRPage} />
      <Route path="/security/api-keys" component={SecurityApiKeysPage} />
      <Route path="/security/cors" component={SecurityCorsPage} />
      <Route path="/security/geo-blocking" component={SecurityGeoBlockingPage} />
      <Route path="/security/ip-management" component={SecurityIpManagementPage} />
      <Route path="/security/rate-limiting" component={SecurityRateLimitPage} />
      <Route path="/security/vulnerabilities" component={SecurityVulnerabilityPage} />
      <Route path="/security/webhook-secrets" component={SecurityWebhookSecretsPage} />
      <Route path="/ai/api-keys" component={ApiKeysPage} />
      <Route path="/ai/models" component={ModelsPage} />
      <Route path="/ai/providers" component={ProvidersPage} />
      <Route path="/ai/queries" component={QueriesPage} />
      <Route path="/ai/recommendations" component={RecommendationsPage} />
      <Route path="/ai/responses" component={ResponsesPage} />
      <Route path="/ai/usage-logs" component={UsageLogsPage} />
      <Route path="/ai/prompt-templates" component={PromptTemplatesPage} />
      <Route path="/settings/departments" component={SettingsDepartmentsPage} />
      <Route path="/settings/roles" component={SettingsRolesPage} />
      <Route path="/settings/triggers" component={SettingsTriggersPage} />
      <Route path="/settings/webhooks" component={SettingsWebhooksPage} />
      <Route path="/settings/api-keys" component={SettingsApiKeysPage} />
      <Route path="/settings/api-connection-hub" component={SettingsApiConnectionHubPage} />
      <Route path="/settings/integration-hub" component={IntegrationHubPage} />
      <Route path="/settings/api-hub" component={ApiHubPage} />
      <Route path="/settings/israeli-integrations" component={SettingsIsraeliIntegrationsPage} />
      <Route path="/settings/import-export" component={ImportExportPage} />
      <Route path="/settings/backups" component={BackupsPage} />
      <Route path="/settings" component={SettingsHub} />
      <Route path="/support/tickets" component={SupportTicketsPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/notification-preferences" component={NotificationPreferencesPage} />
      <Route path="/alert-terminal" component={AlertTerminalPage} />
      <Route path="/notification-routing" component={NotificationRoutingPage} />
      <Route path="/notification-settings/email-templates" component={EmailTemplatesPage} />
      <Route path="/notification-settings/delivery-dashboard" component={DeliveryDashboardPage} />
      <Route path="/system/audit-log" component={SystemAuditLogPage} />
      <Route path="/system/model-catalog" component={ModelCatalogPage} />
      <Route path="/analytics" component={AnalyticsEnginePage} />
      <Route path="/whatsapp-ai" component={WhatsAppAIPage} />
      <Route path="/company-financials" component={CompanyFinancialsPage} />
      <Route path="/inventory/products" component={ProductCatalogPage} />
    </>
);
