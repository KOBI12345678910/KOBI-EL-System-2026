import { Route, Redirect } from "wouter";
import { lazyPage } from "@/routes/lazy-utils";

const CrmDashboard = lazyPage(() => import("@/pages/crm/crm-dashboard"));
const SegmentationDashboardPage = lazyPage(() => import("@/pages/crm/segmentation-dashboard"));
const FieldAgentsPage = lazyPage(() => import("@/pages/crm/field-agents"));
const LeadsManagement = lazyPage(() => import("@/pages/crm/leads-management"));
const DynamicPricingPage = lazyPage(() => import("@/pages/crm/dynamic-pricing"));
const CollectionsPage = lazyPage(() => import("@/pages/crm/collections"));
const DailyProfitabilityPage = lazyPage(() => import("@/pages/crm/daily-profitability"));
const SlaManagementPage = lazyPage(() => import("@/pages/crm/sla-management"));
const SmartRoutingPage = lazyPage(() => import("@/pages/crm/smart-routing"));
const CrmAutomationsPage = lazyPage(() => import("@/pages/crm/crm-automations"));
const CrmActivitiesPage = lazyPage(() => import("@/pages/crm/crm-activities"));
const CrmMessagingPage = lazyPage(() => import("@/pages/crm/crm-messaging"));
const CrmCommunicationsHubPage = lazyPage(() => import("@/pages/crm/crm-communications-hub"));
const ContractorDecisionPage = lazyPage(() => import("@/pages/crm/contractor-decision"));
const CrmLeadScoringPage = lazyPage(() => import("@/pages/crm/ai/lead-scoring"));
const NextActionPage = lazyPage(() => import("@/pages/crm/ai/next-action"));
const PredictivePage = lazyPage(() => import("@/pages/crm/ai/predictive"));
const AnomalyPage = lazyPage(() => import("@/pages/crm/ai/anomaly"));
const AuditTrailPage = lazyPage(() => import("@/pages/crm/security/audit"));
const RowSecurityPage = lazyPage(() => import("@/pages/crm/security/row-security"));
const EncryptionPage = lazyPage(() => import("@/pages/crm/security/encryption"));
const SSOPage = lazyPage(() => import("@/pages/crm/security/sso"));
const LiveFeedsPage = lazyPage(() => import("@/pages/crm/realtime/feeds"));
const NotificationsMgmtPage = lazyPage(() => import("@/pages/crm/realtime/notifications"));
const TriggersPage = lazyPage(() => import("@/pages/crm/realtime/triggers"));
const SyncPage = lazyPage(() => import("@/pages/crm/realtime/sync"));
const CustomReportsPage = lazyPage(() => import("@/pages/crm/analytics/custom-reports"));
const TrendsPage = lazyPage(() => import("@/pages/crm/analytics/trends"));
const CohortPage = lazyPage(() => import("@/pages/crm/analytics/cohort"));
const FiltersPage = lazyPage(() => import("@/pages/crm/analytics/filters"));
const RestApiPage = lazyPage(() => import("@/pages/crm/integrations/rest-api"));
const MobileSyncPage = lazyPage(() => import("@/pages/crm/integrations/mobile"));
const CloudStoragePage = lazyPage(() => import("@/pages/crm/integrations/cloud"));
const WebhooksPage = lazyPage(() => import("@/pages/crm/integrations/webhooks"));
const EmailSyncPage = lazyPage(() => import("@/pages/crm/email-sync"));
const WhatsAppSMSPage = lazyPage(() => import("@/pages/crm/whatsapp-sms"));
const AIInsightsPage = lazyPage(() => import("@/pages/crm/ai-insights"));
const PredictiveAnalyticsCRMPage = lazyPage(() => import("@/pages/crm/predictive-analytics"));
const LeadQualityPage = lazyPage(() => import("@/pages/crm/lead-quality"));
const RealtimeFeedPage = lazyPage(() => import("@/pages/crm/realtime-feed"));
const AdvancedSearchPage = lazyPage(() => import("@/pages/crm/advanced-search"));
const CollaborationPage = lazyPage(() => import("@/pages/crm/collaboration"));
const TerritoryManagementPage = lazyPage(() => import("@/pages/crm/territory-management"));
const NurtureSequencesPage = lazyPage(() => import("@/pages/crm/nurture-sequences"));
const AgentControlTowerPage = lazyPage(() => import("@/pages/crm/agent-control-tower"));
const CampaignAnalyticsPage = lazyPage(() => import("@/pages/crm/campaign-analytics"));
const CommissionManagementPage = lazyPage(() => import("@/pages/crm/commission-management"));
const CrmContractManagementPage = lazyPage(() => import("@/pages/crm/contract-management"));
const CrmUltimateDashboardPage = lazyPage(() => import("@/pages/crm/crm-ultimate-dashboard"));
const LeadProfilePage = lazyPage(() => import("@/pages/crm/lead-profile"));
const LeadsUltimatePage = lazyPage(() => import("@/pages/crm/leads-ultimate"));
const CustomerManagementPage = lazyPage(() => import("@/pages/sales/customer-management"));
const CustomerPortalPage = lazyPage(() => import("@/pages/sales/customer-portal"));
const CustomerServicePage = lazyPage(() => import("@/pages/sales/ai-customer-service"));
const CrmPipelinePage = lazyPage(() => import("@/pages/sales/crm-pipeline"));
const HRMeetingsPage = lazyPage(() => import("@/pages/hr/hr-meetings"));

export const CRMRoutes = (

    <>
      <Route path="/crm" component={CrmDashboard} />
      <Route path="/crm/field-agents" component={FieldAgentsPage} />
      <Route path="/crm/leads" component={LeadsManagement} />
      <Route path="/crm/segmentation" component={SegmentationDashboardPage} />
      <Route path="/crm/pricing" component={DynamicPricingPage} />
      <Route path="/crm/collections" component={CollectionsPage} />
      <Route path="/crm/profitability" component={DailyProfitabilityPage} />
      <Route path="/crm/sla" component={SlaManagementPage} />
      <Route path="/crm/smart-routing" component={SmartRoutingPage} />
      <Route path="/crm/automations" component={CrmAutomationsPage} />
      <Route path="/crm/contractor-decision" component={ContractorDecisionPage} />
      <Route path="/crm/ai/lead-scoring" component={CrmLeadScoringPage} />
      <Route path="/crm/ai/next-action" component={NextActionPage} />
      <Route path="/crm/ai/predictive" component={PredictivePage} />
      <Route path="/crm/ai/anomaly" component={AnomalyPage} />
      <Route path="/crm/security/audit" component={AuditTrailPage} />
      <Route path="/crm/security/row-security" component={RowSecurityPage} />
      <Route path="/crm/security/encryption" component={EncryptionPage} />
      <Route path="/crm/security/sso" component={SSOPage} />
      <Route path="/crm/realtime/feeds" component={LiveFeedsPage} />
      <Route path="/crm/realtime/notifications" component={NotificationsMgmtPage} />
      <Route path="/crm/realtime/triggers" component={TriggersPage} />
      <Route path="/crm/realtime/sync" component={SyncPage} />
      <Route path="/crm/analytics/custom-reports" component={CustomReportsPage} />
      <Route path="/crm/analytics/trends" component={TrendsPage} />
      <Route path="/crm/analytics/cohort" component={CohortPage} />
      <Route path="/crm/analytics/filters" component={FiltersPage} />
      <Route path="/crm/integrations/rest-api" component={RestApiPage} />
      <Route path="/crm/integrations/mobile" component={MobileSyncPage} />
      <Route path="/crm/integrations/cloud" component={CloudStoragePage} />
      <Route path="/crm/integrations/webhooks" component={WebhooksPage} />
      <Route path="/crm/email-sync" component={EmailSyncPage} />
      <Route path="/crm/whatsapp-sms" component={WhatsAppSMSPage} />
      <Route path="/crm/communications" component={CrmCommunicationsHubPage} />
      <Route path="/crm/ai-insights" component={AIInsightsPage} />
      <Route path="/crm/predictive-analytics" component={PredictiveAnalyticsCRMPage} />
      <Route path="/crm/lead-quality" component={LeadQualityPage} />
      <Route path="/crm/realtime-feed" component={RealtimeFeedPage} />
      <Route path="/crm/advanced-search" component={AdvancedSearchPage} />
      <Route path="/crm/collaboration" component={CollaborationPage} />
      <Route path="/crm/territory-management" component={TerritoryManagementPage} />
      <Route path="/crm/nurture" component={NurtureSequencesPage} />
      <Route path="/crm/contacts" component={CustomerManagementPage} />
      <Route path="/crm/pipeline" component={CrmPipelinePage} />
      <Route path="/crm/activities" component={CrmActivitiesPage} />
      <Route path="/crm/service" component={CustomerServicePage} />
      <Route path="/crm/meetings" component={HRMeetingsPage} />
      <Route path="/crm/messaging" component={CrmMessagingPage} />
      <Route path="/crm/portal" component={CustomerPortalPage} />
      <Route path="/crm/automation" component={CrmAutomationsPage} />
      <Route path="/crm/real-time" component={LiveFeedsPage} />
      <Route path="/crm/search" component={AdvancedSearchPage} />
      <Route path="/crm/agent-control-tower" component={AgentControlTowerPage} />
      <Route path="/crm/campaign-analytics" component={CampaignAnalyticsPage} />
      <Route path="/crm/commission-management" component={CommissionManagementPage} />
      <Route path="/crm/contract-management" component={CrmContractManagementPage} />
      <Route path="/crm/crm-ultimate-dashboard" component={CrmUltimateDashboardPage} />
      <Route path="/crm/lead-profile" component={LeadProfilePage} />
      <Route path="/crm/leads-ultimate" component={LeadsUltimatePage} />
      <Route path="/crm/leads-management"><Redirect to="/crm/leads" /></Route>
      <Route path="/crm/customers"><Redirect to="/sales/customers" /></Route>
      <Route path="/crm/quotations"><Redirect to="/sales/quotations" /></Route>
      <Route path="/crm/sales-orders"><Redirect to="/sales/orders" /></Route>
    </>
);
