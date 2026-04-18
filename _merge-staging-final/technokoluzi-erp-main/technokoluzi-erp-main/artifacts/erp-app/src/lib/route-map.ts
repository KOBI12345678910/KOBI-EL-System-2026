/**
 * Route Map Utility
 *
 * Maps Base44 page names to TechnoKoluzi route paths.
 * Used during migration to convert createPageUrl('PageName') calls
 * to actual wouter-compatible paths.
 */

const PAGE_ROUTES: Record<string, string> = {
  // Dashboards
  Dashboard: "/",
  CEODashboardV2: "/executive/ceo-dashboard",
  CEOSuperDashboard: "/executive/ceo-dashboard",
  DashboardBuilder: "/builder/dashboards",
  AdminDashboard: "/executive/ceo-dashboard",
  MobileDashboard: "/",
  SalesPersonDashboard: "/sales/dashboard",
  SalesDashboard: "/sales/dashboard",
  HRDashboard: "/hr/dashboard",
  FinanceDashboard: "/finance/dashboard",
  FinancialDashboard: "/finance/dashboard",
  AccountingDashboard: "/finance/accounting-portal",
  SecurityDashboard: "/settings/security",
  SupportDashboard: "/support/dashboard",

  // CRM
  CRMDashboard: "/crm/dashboard",
  CRMDashboardAdvanced: "/crm/dashboard",
  CRMPipeline: "/crm/pipeline",
  CRMProfessional: "/crm/dashboard",
  CRMUltraPro: "/crm/dashboard",
  CRMAdvancedDashboard: "/crm/dashboard",
  CRMAnalytics: "/crm/analytics",
  CRMFlowVisualization: "/crm/flow",
  CRMCalendar: "/calendar",
  CRMNotes: "/crm/notes",
  CRMTeamStatus: "/crm/team-status",
  CRMSettingsCenter: "/crm/settings",
  CRMUserManagement: "/crm/user-management",

  // Leads
  Leads: "/crm/leads-management",
  LeadDetail: "/crm/lead-profile",
  LeadDetailPro: "/crm/lead-profile",
  LeadsByStatus: "/crm/leads-by-status",
  LeadsPipeline: "/crm/pipeline",
  LeadsProfessional: "/crm/leads-management",
  LeadsKanban: "/crm/leads-kanban",
  LeadsList: "/crm/leads-management",
  LeadNew: "/crm/lead-new",
  LeadCreation: "/crm/lead-new",
  LeadIntake: "/crm/lead-intake",
  LeadIntakeFull: "/crm/lead-intake",
  LeadPipeline: "/crm/pipeline",
  LeadScoringDashboard: "/crm/lead-scoring",
  LeadScoringBuilder: "/crm/lead-scoring-builder",
  LeadRoutingManager: "/crm/lead-routing",
  LeadAutomationBuilder: "/crm/lead-automation",
  LeadConversionStats: "/crm/conversion-stats",
  LeadManagementCRM: "/crm/leads-management",
  LeadsSettings: "/crm/settings",
  ManagerLeadQueue: "/crm/manager-queue",

  // Sales
  SalesOrders: "/sales/orders",
  SalesAgentTracking: "/sales/agent-tracking",
  SalesMetricsDashboard: "/sales/metrics",
  SalesForecastingCenter: "/sales/forecasting",
  PipelineKanban: "/crm/pipeline",
  DealsKanban: "/crm/deals-kanban",
  Deals: "/crm/deals",
  DealDetail: "/crm/deal-detail",
  DealsPipeline: "/crm/pipeline",
  DealClosureESign: "/crm/deal-closure",
  Opportunities: "/crm/opportunities",
  Quotes: "/sales/quotes",
  Customers: "/sales/customers",
  CustomerDetail: "/sales/customer-detail",
  Customer360: "/sales/customer-360",
  CustomerProfile: "/sales/customer-profile",
  CustomerPortal: "/portal/customer",
  CustomerSegmentation: "/crm/segmentation",
  CustomerLoyalty: "/crm/loyalty",
  Companies: "/crm/companies",
  CompanyDetail: "/crm/company-detail",
  Contacts: "/crm/contacts",
  ContactDetail: "/crm/contact-detail",
  Activities: "/crm/activities",
  ActivityDetail: "/crm/activity-detail",

  // Finance
  Invoices: "/finance/invoices",
  InvoiceDetail: "/finance/invoice-detail",
  Payments: "/finance/payments",
  PaymentAutomation: "/finance/payment-automation",
  PaymentGateway: "/finance/payment-gateway",
  Expenses: "/finance/expense-claims",
  Budgets: "/finance/budgets",
  BudgetPlanning: "/finance/budget-planning",
  BudgetingForecasting: "/finance/budgeting-forecasting",
  ProfitAndLoss: "/finance/profit-loss",
  FinancialStatements: "/finance/statements",
  FinancialReportsAdvanced: "/finance/reports-advanced",
  FinancialKPIs: "/finance/kpis",
  FinancialModels: "/finance/models",
  FinancialAnalyticsDashboard: "/finance/analytics",
  FinancialIntelligence: "/finance/intelligence",
  AccountingLedger: "/finance/ledger",
  CashFlowPage: "/finance/cash-flow",
  Contracts: "/finance/contracts",
  ContractsManagement: "/finance/contracts",
  TreasuryManager: "/finance/treasury",
  FPADashboard: "/finance/fpa",
  JobCosting: "/finance/job-costing",
  RentabilityAnalysis: "/finance/rentability",
  DailyProfitEngine: "/finance/daily-profit",

  // HR
  Employees: "/hr/employees",
  EmployeeDetail: "/hr/employee-detail",
  EmployeePortfolio: "/hr/employee-portfolio",
  ProfessionalEmployeeFile: "/hr/employee-file",
  Departments: "/hr/departments",
  DepartmentDetail: "/hr/department-detail",
  Attendance: "/hr/attendance",
  AttendanceBoard: "/hr/attendance-board",
  AttendanceRules: "/hr/attendance-rules",
  AttendanceAlerts: "/hr/attendance-alerts",
  TimeTracking: "/hr/time-tracking",
  TimeOffRequests: "/hr/time-off",
  PayrollEngine: "/hr/payroll",
  Trainings: "/hr/trainings",
  GoalsOKR: "/hr/goals-okr",
  Goals: "/hr/goals",
  AdvancedHR: "/hr/advanced",
  HRManagementHub: "/hr/management-hub",
  PeopleLayer: "/hr/people-layer",

  // Production & Manufacturing
  ProductionOrders: "/production/orders",
  ProductionOrderDetail: "/production/order-detail",
  ProductionBoard: "/production/board",
  ProductionDepartment: "/production/department",
  ProductionFloorV2: "/production/floor",
  ProductionMetricsDashboard: "/production/metrics",
  ManufacturingExecutionSystem: "/production/mes",
  ManufacturingExecution: "/production/mes",
  ManufacturingOEE: "/production/oee",
  ManufacturingSupplyChain: "/production/supply-chain",
  SCADA: "/production/scada",
  SCADAAlertSettings: "/production/scada-alerts",
  FactoryFloorMonitor: "/production/floor-monitor",
  QualityControl: "/production/quality-control",
  BOMs: "/production/boms",
  WorkCenters: "/production/work-centers",
  Drawings: "/production/drawings",
  ChangeOrders: "/production/change-orders",
  MRPPlanningCenter: "/production/mrp",

  // Inventory & Warehouse
  Inventory: "/inventory",
  InventoryOptimization: "/inventory/optimization",
  Products: "/product-catalog",
  ProductManagement: "/product-catalog",
  ProductDetailAdvanced: "/product-catalog/detail",
  ProductVariants: "/product-catalog/variants",
  WarehouseManagement: "/inventory/warehouse",
  WMS: "/inventory/wms",
  WMSRealtime: "/inventory/wms-realtime",
  Assets: "/inventory/assets",
  AssetsManagement: "/inventory/assets",

  // Procurement & Supply Chain
  Suppliers: "/suppliers",
  PurchaseOrders: "/purchase-orders",
  RFQs: "/modules/rfqs",
  SCMDashboard: "/modules/scm-dashboard",
  SupplyChainAlerts: "/modules/supply-chain-alerts",
  SupplyPlanning: "/modules/supply-planning",
  SupplyRiskManagement: "/modules/supply-risk",
  LogisticsTracking: "/modules/logistics-tracking",
  RawMaterialsAdvanced: "/modules/raw-materials",
  DemandPlanning: "/modules/demand-planning",
  SubcontractorManagement: "/modules/subcontractors",
  PLM: "/modules/plm",
  ImportManagement: "/import-management",
  SupplierPerformance: "/modules/supplier-performance",
  SupplierPortal: "/portal/supplier",
  SupplierIntelligence: "/modules/supplier-intelligence",
  Logistics: "/modules/logistics",
  LogisticsHub: "/modules/logistics-hub",
  TransportManagement: "/modules/transport",

  // Projects
  Projects: "/projects/dashboard",
  ProjectManagement: "/projects/dashboard",
  ProjectCosting: "/projects/costing",
  ProjectCostEngineV2: "/projects/cost-engine",
  ProjectLifecycle: "/projects/lifecycle",
  Tasks: "/projects/tasks",
  GanttChart: "/projects/gantt",

  // AI
  AIHub: "/ai-engine/hub",
  AIMainTerminal: "/ai-engine/terminal",
  AITerminal: "/ai-engine/terminal",
  AIAgents: "/ai-engine/agents",
  AITeam: "/ai-engine/team",
  AIAssistant: "/ai-engine/assistant",
  AICopilot: "/ai-engine/copilot",
  AIWorkflows: "/ai-engine/workflows",
  AIAutomationHub: "/ai-engine/automation",
  AIReportingDashboard: "/ai-engine/reporting",
  AIAnalyticsDashboard: "/ai-engine/analytics",
  AIPredictions: "/ai-engine/predictions",
  AIEnhancedCRM: "/ai-engine/crm",
  AICustomerSupport: "/ai-engine/support",
  AISalesForecast: "/ai-engine/sales-forecast",
  AIQuoteGenerator: "/ai-engine/quote-generator",
  AIMeetingSummarizer: "/ai-engine/meeting-summarizer",
  AIPersonalAssistant: "/ai-engine/personal-assistant",
  AISettings: "/ai-engine/settings",
  RAGInsights: "/ai-engine/rag",
  WhatsAppSalesAgent: "/ai-engine/whatsapp-agent",

  // Reports & Analytics
  Reports: "/reports/center",
  ReportBuilder: "/report-builder",
  BIDashboards: "/reports/bi-dashboards",
  BICenter: "/reports/bi-center",
  AdvancedAnalytics: "/reports/advanced-analytics",
  AdvancedAnalyticsEngine: "/reports/analytics-engine",
  AnalyticsDashboard: "/reports/analytics",
  AdvancedReporting: "/reports/advanced",
  ReportingCenter: "/reports/center",
  HistoricalDataAnalytics: "/reports/historical",

  // Automations & Workflows
  Automations: "/builder/automations",
  AutomationCenter: "/builder/automation-dashboard",
  AutomationTemplatesGallery: "/builder/automation-templates",
  AutomationExecutionMonitor: "/builder/automation-monitor",
  WorkflowBuilder: "/builder/workflows",
  WorkflowAutomation: "/builder/automations",
  Workflows: "/builder/workflows",
  SmartAutomationEngine: "/builder/automations",

  // Support & Tickets
  SupportTickets: "/support/tickets",
  KnowledgeBase: "/support/knowledge-base",
  EmailManagement: "/support/email",
  Feedback: "/support/feedback",

  // Approvals
  Approvals: "/modules/approvals",
  ApprovalBuilder: "/builder/approval-builder",
  ApprovalsSystem: "/modules/approvals",

  // Settings & System
  SystemSettings: "/settings/system",
  SystemSettingsAdvanced: "/settings/advanced",
  CompanySettings: "/settings/company",
  EnterpriseSettings: "/settings/enterprise",
  UserManagement: "/settings/users",
  RoleManagement: "/settings/roles",
  Roles: "/settings/roles",
  PermissionsManager: "/settings/permissions",
  AuditLog: "/audit-log",
  IntegrationsManagement: "/integrations-hub",
  IntegrationsManager: "/integrations-hub",
  N8NIntegrations: "/integrations-hub/n8n",
  WebhookManagement: "/settings/webhooks",
  CustomFieldManager: "/builder/fields",
  ModuleBuilder: "/builder",
  ModelBuilder: "/builder/module",
  ModelManagement: "/builder",
  SystemMap: "/system/map",
  SystemSpecification: "/system/specification",
  SystemInspection: "/system/inspection",
  DataImportExport: "/settings/import-export",
  OnboardingCenter: "/settings/onboarding",
  TemplatesManager: "/settings/templates",
  Plugins: "/settings/plugins",
  PluginsMarketplace: "/settings/marketplace",

  // Notifications & Alerts
  Notifications: "/notifications",
  AlertBuilder: "/alerts/builder",
  AlertsCenter: "/alerts/center",
  NotificationRules: "/alerts/rules",
  NotificationLog: "/alerts/log",
  SmartAlerts: "/alerts/smart",

  // Calendar & Meetings
  CalendarReminders: "/calendar",
  Meetings: "/meetings",
  MeetingsCalendar: "/meetings/calendar",
  MeetingSummaryAI: "/meetings/summary-ai",
  RemindersCalendar: "/calendar/reminders",

  // Documents
  DocumentManagement: "/documents/management",
  DocumentCenter: "/documents/center",
  DocumentSigning: "/documents/signing",
  DocumentDistribution: "/documents/distribution",
  CMMS: "/documents/cmms",

  // Compliance & Safety
  ComplianceDashboard: "/safety/compliance",
  ComplianceManagement: "/safety/compliance-management",
  RiskManagement: "/risk-management",
  RiskManagementPlatform: "/risk-management/platform",
  Risks: "/risk-management",
  SafetyManagement: "/safety/management",
  HSEDashboard: "/safety/hse",
  EHSIncidents: "/safety/incidents",
  ESGSustainability: "/safety/esg",
  QMS: "/production/qms",
  Sustainability: "/safety/sustainability",
  InsuranceManagement: "/safety/insurance",
  LegalCenter: "/safety/legal",

  // Installations
  Installations: "/installations",
  InstallerView: "/installations/view",
  MobileInstallerView: "/installations/mobile",
  InstallationFieldOps: "/installations/field-ops",

  // Marketing
  Campaigns: "/marketing/campaigns",
  CampaignDetail: "/marketing/campaign-detail",
  CampaignsManagement: "/marketing/management",
  DigitalMarketing: "/marketing/digital",
  CompetitorIntelligence: "/marketing/competitor-intelligence",

  // Special Pages
  PersonalWorkspace: "/workspace",
  OrganizationChat: "/chat",
  TeamCollaboration: "/chat/collaboration",
  ConversionStats: "/crm/conversion-stats",
  OperationsCenter: "/operations-control-center",
  ControlCenter: "/operations-control-center",
  ControlTowerDashboard: "/operations-control-center",
  CompanyStatusReport: "/executive/company-health",
  CompanyDemoGuide: "/system/demo",
  VisionRoadmap: "/strategy/roadmap",
  StrategicPlanning: "/strategy/planning",

  // Auth
  TwoFactorAuthSetup: "/settings/2fa",
  UserActivityLog: "/audit-log",
  UserActivityTracking: "/audit-log",

  // Misc
  EquipmentMaintenance: "/production/maintenance",
  MaintenanceOrders: "/production/maintenance-orders",
  MaintenanceManager: "/production/maintenance-manager",
  POSTerminal: "/sales/pos",
  MonteCarloEngine: "/reports/monte-carlo",
  TestGenerator: "/system/test-generator",
  AdvancedSearch: "/search",
  RecordSharingCenter: "/settings/sharing",
  AccessRequestsCenter: "/settings/access-requests",
  FieldLevelSecurityManager: "/settings/field-security",
  RoleAndPermissionManagement: "/settings/roles",
  VehicleFleetManager: "/modules/fleet",
  TenderManagement: "/modules/tenders",
  SubscriptionManagement: "/finance/subscriptions",
  FieldAgentControl: "/crm/field-agents",
  CustomerRiskCollections: "/finance/collections",
  PowderCoatManagement: "/production/powder-coat",

  // Login
  Login: "/login",
};

/**
 * Convert a Base44 page name to a TechnoKoluzi route path.
 * Falls back to kebab-case conversion if no mapping exists.
 */
export function createPageUrl(pageName: string): string {
  if (PAGE_ROUTES[pageName]) {
    return PAGE_ROUTES[pageName];
  }
  // Fallback: convert PascalCase to kebab-case route
  const kebab = pageName
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase()
    .replace(/^-/, "");
  return `/${kebab}`;
}

/**
 * Get all registered route mappings
 */
export function getAllRoutes(): Record<string, string> {
  return { ...PAGE_ROUTES };
}
