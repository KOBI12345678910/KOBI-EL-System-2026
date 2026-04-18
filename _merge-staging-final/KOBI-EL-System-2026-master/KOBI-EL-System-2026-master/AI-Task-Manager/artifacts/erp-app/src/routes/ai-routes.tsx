import { Route, Redirect } from "wouter";
import { lazyPage } from "@/routes/lazy-utils";

const AIEngineHubPage = lazyPage(() => import("@/pages/ai-engine/ai-engine-hub"));
const LeadScoringPage = lazyPage(() => import("@/pages/ai-engine/lead-scoring"));
const CallNLPAnalysisPage = lazyPage(() => import("@/pages/ai-engine/call-nlp-analysis"));
const PredictiveAnalyticsPage = lazyPage(() => import("@/pages/ai-engine/predictive-analytics"));
const AIChatbotSettingsPage = lazyPage(() => import("@/pages/ai-engine/ai-chatbot-settings"));
const KimiTerminalPage = lazyPage(() => import("@/pages/ai-engine/kimi-terminal"));
const KobiTerminalPage = lazyPage(() => import("@/pages/ai-engine/kobi-terminal"));
const KobiIDEPage = lazyPage(() => import("@/pages/ai-engine/kobi-ide"));
const KobiPromptsPage = lazyPage(() => import("@/pages/ai-engine/kobi-prompts"));
const CrossModuleTransactionsPage = lazyPage(() => import("@/pages/ai-engine/cross-module-transactions"));
const SuperAgentDashboardPage = lazyPage(() => import("@/pages/ai-engine/SuperAgentPage"));
const AIAuditLogPage = lazyPage(() => import("@/pages/ai-engine/ai-audit-log"));
const MLTrainingPipelinePage = lazyPage(() => import("@/pages/ai-engine/ml-training-pipeline"));
const AIAdminSettingsPage = lazyPage(() => import("@/pages/ai-engine/ai-admin-settings"));
const EmployeeChatbotPage = lazyPage(() => import("@/pages/ai-engine/employee-chatbot"));
const SentimentAnalysisPage = lazyPage(() => import("@/pages/ai-engine/sentiment-analysis"));
const AIRecommendationEnginePage = lazyPage(() => import("@/pages/ai-engine/ai-recommendation-engine"));
const AIAutomatedReportsPage = lazyPage(() => import("@/pages/ai-engine/ai-automated-reports"));
const AIAnomalyDetectionPage = lazyPage(() => import("@/pages/ai-engine/ai-anomaly-detection"));
const NLQueryPage = lazyPage(() => import("@/pages/ai-engine/nl-query"));
const AICustomerServicePage = lazyPage(() => import("@/pages/ai-engine/ai-customer-service"));
const AICustomerServiceProPage = lazyPage(() => import("@/pages/ai-engine/ai-customer-service-pro"));
const AIExecutiveInsightsPage = lazyPage(() => import("@/pages/ai-engine/ai-executive-insights"));
const AIFollowUpPage = lazyPage(() => import("@/pages/ai-engine/ai-follow-up"));
const AILeadScoringProPage = lazyPage(() => import("@/pages/ai-engine/ai-lead-scoring-pro"));
const AIProcurementOptimizerPage = lazyPage(() => import("@/pages/ai-engine/ai-procurement-optimizer"));
const AIProductionInsightsPage = lazyPage(() => import("@/pages/ai-engine/ai-production-insights"));
const AIQuotationAssistantPage = lazyPage(() => import("@/pages/ai-engine/ai-quotation-assistant"));
const AISalesAssistantPage = lazyPage(() => import("@/pages/ai-engine/ai-sales-assistant"));
const AISettingsPage = lazyPage(() => import("@/pages/modules/ai-settings"));
const AIDocumentProcessorPage = lazyPage(() => import("@/pages/modules/ai-document-processor"));
const KimiTaskChallengesPage = lazyPage(() => import("@/pages/kimi-task-challenges"));
const ClaudeChatPage = lazyPage(() => import("@/pages/modules/claude-chat"));
const HiTechDashboardPage = lazyPage(() => import("@/pages/modules/hi-tech-dashboard"));
const ProjectAnalysesPage = lazyPage(() => import("@/pages/modules/project-analyses"));
const ProjectAnalysisDetailPage = lazyPage(() => import("@/pages/modules/project-analysis-detail"));
const AiSalesAssistantPage = lazyPage(() => import("@/pages/ai/ai-sales-assistant"));
const AiLeadScoringPage = lazyPage(() => import("@/pages/ai/ai-lead-scoring"));
const AiCustomerServiceProPage = lazyPage(() => import("@/pages/ai/ai-customer-service-pro"));
const AiFollowUpPage = lazyPage(() => import("@/pages/ai/ai-follow-up"));
const AiQuotationAssistantPage = lazyPage(() => import("@/pages/ai/ai-quotation-assistant"));
const AiProcurementOptimizerPage = lazyPage(() => import("@/pages/ai/ai-procurement-optimizer"));
const AiProductionInsightsPage = lazyPage(() => import("@/pages/ai/ai-production-insights"));
const AiAnomalyDetectionPage = lazyPage(() => import("@/pages/ai/ai-anomaly-detection"));
const AiExecutiveInsightsPage = lazyPage(() => import("@/pages/ai/ai-executive-insights"));

export const AIRoutes = (

    <>
      <Route path="/ai-engine" component={AIEngineHubPage} />
      <Route path="/ai-engine/lead-scoring" component={LeadScoringPage} />
      <Route path="/ai-engine/call-nlp" component={CallNLPAnalysisPage} />
      <Route path="/ai-engine/predictive-analytics" component={PredictiveAnalyticsPage} />
      <Route path="/ai-engine/chatbot-settings" component={AIChatbotSettingsPage} />
      <Route path="/ai-engine/kimi" component={KimiTerminalPage} />
      <Route path="/ai-engine/kobi" component={KobiTerminalPage} />
      <Route path="/ai-engine/kobi-ide" component={KobiIDEPage} />
      <Route path="/ai-engine/kobi-prompts" component={KobiPromptsPage} />
      <Route path="/ai-engine/cross-module" component={CrossModuleTransactionsPage} />
      <Route path="/ai-engine/super-agent" component={SuperAgentDashboardPage} />
      <Route path="/ai-engine/kimi-challenges" component={KimiTaskChallengesPage} />
      <Route path="/ai-engine/ai-audit-log" component={AIAuditLogPage} />
      <Route path="/ai-engine/ml-pipeline" component={MLTrainingPipelinePage} />
      <Route path="/ai-engine/admin-settings" component={AIAdminSettingsPage} />
      <Route path="/ai-engine/employee-chatbot" component={EmployeeChatbotPage} />
      <Route path="/ai-engine/sentiment-analysis" component={SentimentAnalysisPage} />
      <Route path="/ai-engine/recommendations" component={AIRecommendationEnginePage} />
      <Route path="/ai-engine/automated-reports" component={AIAutomatedReportsPage} />
      <Route path="/ai-engine/anomaly-detection" component={AIAnomalyDetectionPage} />
      <Route path="/ai-engine/nl-query" component={NLQueryPage} />
      <Route path="/ai-engine/customer-service" component={AICustomerServicePage} />
      <Route path="/ai-engine/customer-service-pro" component={AICustomerServiceProPage} />
      <Route path="/ai-engine/executive-insights" component={AIExecutiveInsightsPage} />
      <Route path="/ai-engine/follow-up" component={AIFollowUpPage} />
      <Route path="/ai-engine/lead-scoring-pro" component={AILeadScoringProPage} />
      <Route path="/ai-engine/procurement-optimizer" component={AIProcurementOptimizerPage} />
      <Route path="/ai-engine/production-insights" component={AIProductionInsightsPage} />
      <Route path="/ai-engine/quotation-assistant" component={AIQuotationAssistantPage} />
      <Route path="/ai-engine/sales-assistant" component={AISalesAssistantPage} />
      <Route path="/ai-settings" component={AISettingsPage} />
      <Route path="/ai-document-processor" component={AIDocumentProcessorPage} />
      <Route path="/claude-chat" component={ClaudeChatPage} />
      <Route path="/hi-tech-dashboard" component={HiTechDashboardPage} />
      <Route path="/project-analyses" component={ProjectAnalysesPage} />
      <Route path="/project-analysis/:id" component={ProjectAnalysisDetailPage} />
      <Route path="/kimi"><Redirect to="/ai-engine/kimi" /></Route>
      <Route path="/kimi2"><Redirect to="/ai-engine/kimi" /></Route>
      <Route path="/kobi"><Redirect to="/ai-engine/kobi" /></Route>
      <Route path="/ai-engine/kimi-terminal"><Redirect to="/ai-engine/kimi" /></Route>
      <Route path="/ai-engine/super-agent-dashboard"><Redirect to="/ai-engine/super-agent" /></Route>
      <Route path="/ai-engine/call-nlp-analysis"><Redirect to="/ai-engine/call-nlp" /></Route>
      <Route path="/ai-engine/predictive"><Redirect to="/ai-engine/predictive-analytics" /></Route>
      <Route path="/ai-engine/ai-chatbot-settings"><Redirect to="/ai-engine/chatbot-settings" /></Route>
      <Route path="/ai-ops/:rest*"><Redirect to="/ai-engine" /></Route>
      <Route path="/ai-engine/transactions"><Redirect to="/ai-engine/cross-module" /></Route>
      <Route path="/ai-engine/chatbot"><Redirect to="/ai-engine/chatbot-settings" /></Route>
      <Route path="/ai/sales-assistant" component={AiSalesAssistantPage} />
      <Route path="/ai/lead-scoring" component={AiLeadScoringPage} />
      <Route path="/ai/customer-service-pro" component={AiCustomerServiceProPage} />
      <Route path="/ai/follow-up" component={AiFollowUpPage} />
      <Route path="/ai/quotation-assistant" component={AiQuotationAssistantPage} />
      <Route path="/ai/procurement-optimizer" component={AiProcurementOptimizerPage} />
      <Route path="/ai/production-insights" component={AiProductionInsightsPage} />
      <Route path="/ai/anomaly-detection" component={AiAnomalyDetectionPage} />
      <Route path="/ai/executive-insights" component={AiExecutiveInsightsPage} />
    </>
);
