import { pgTable, serial, text, integer, boolean, timestamp, jsonb, varchar, numeric, date } from "drizzle-orm/pg-core";

export const actionDefinitionsTable = pgTable("action_definitions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const aiApiKeysTable = pgTable("ai_api_keys", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const aiBuilderConfigsTable = pgTable("ai_builder_configs", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const aiBuilderExecutionLogsTable = pgTable("ai_builder_execution_logs", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const aiModelsTable = pgTable("ai_models", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const aiPermissionsTable = pgTable("ai_permissions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const aiPromptTemplatesTable = pgTable("ai_prompt_templates", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const aiProvidersTable = pgTable("ai_providers", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const aiQueriesTable = pgTable("ai_queries", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const aiRecommendationsTable = pgTable("ai_recommendations", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const aiResponsesTable = pgTable("ai_responses", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const aiUsageLogsTable = pgTable("ai_usage_logs", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const approvalRequestsTable = pgTable("approval_requests", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const automationExecutionLogsTable = pgTable("automation_execution_logs", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const autoNumberCountersTable = pgTable("auto_number_counters", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const bscObjectivesTable = pgTable("bsc_objectives", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const budgetsTable = pgTable("budgets", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const businessPlanSectionsTable = pgTable("business_plan_sections", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const buttonDefinitionsTable = pgTable("button_definitions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const calendarEventsTable = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const categoryDefinitionsTable = pgTable("category_definitions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const categoryItemsTable = pgTable("category_items", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const claudeAuditLogsTable = pgTable("claude_audit_logs", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const claudeConnectionTestsTable = pgTable("claude_connection_tests", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const claudeSessionsTable = pgTable("claude_sessions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const competitiveAnalysesTable = pgTable("competitive_analyses", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const complianceCertificatesTable = pgTable("compliance_certificates", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const contentCalendarTable = pgTable("content_calendar", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const contextEvaluationLogsTable = pgTable("context_evaluation_logs", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const currencyExposuresTable = pgTable("currency_exposures", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const customsClearancesTable = pgTable("customs_clearances", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const dataScopeRulesTable = pgTable("data_scope_rules", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const detailDefinitionsTable = pgTable("detail_definitions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const detailPageDefinitionsTable = pgTable("detail_page_definitions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const documentFilesTable = pgTable("document_files", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const documentFoldersTable = pgTable("document_folders", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  color: varchar("color", { length: 50 }),
  icon: varchar("icon", { length: 100 }),
  isSystem: boolean("is_system").default(false),
  createdBy: varchar("created_by", { length: 100 }),
  parentId: integer("parent_id"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const documentSendHistoryTable = pgTable("document_send_history", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const documentTagsTable = pgTable("document_tags", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const documentTemplatesTable = pgTable("document_templates", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const emailMarketingTable = pgTable("email_marketing", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const entityCategoriesTable = pgTable("entity_categories", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const entityFieldsTable = pgTable("entity_fields", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id"),
  name: varchar("name", { length: 255 }),
  slug: varchar("slug", { length: 255 }),
  fieldType: varchar("field_type", { length: 50 }),
  sortOrder: integer("sort_order").default(0),
  showInList: boolean("show_in_list").default(true),
  showInForm: boolean("show_in_form").default(true),
  isRequired: boolean("is_required").default(false),
  isSearchable: boolean("is_searchable").default(true),
  isFilterable: boolean("is_filterable").default(false),
  isSortable: boolean("is_sortable").default(true),
  groupName: varchar("group_name", { length: 255 }),
  placeholder: varchar("placeholder", { length: 255 }),
  options: jsonb("options"),
  fieldWidth: varchar("field_width", { length: 50 }),
  helpText: text("help_text"),
  defaultValue: text("default_value"),
  relatedEntityId: integer("related_entity_id"),
  relatedDisplayField: varchar("related_display_field", { length: 255 }),
  relationType: varchar("relation_type", { length: 50 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const entityRecordsTable = pgTable("entity_records", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const entityRelationsTable = pgTable("entity_relations", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const entityStatusesTable = pgTable("entity_statuses", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const exchangeRatesTable = pgTable("exchange_rates", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const foreignSuppliersTable = pgTable("foreign_suppliers", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const formDefinitionsTable = pgTable("form_definitions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const generatedDocumentsTable = pgTable("generated_documents", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const goodsReceiptItemsTable = pgTable("goods_receipt_items", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const goodsReceiptsTable = pgTable("goods_receipts", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const hedgingContractsTable = pgTable("hedging_contracts", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const importCostCalculationsTable = pgTable("import_cost_calculations", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const importOrderItemsTable = pgTable("import_order_items", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const importOrdersTable = pgTable("import_orders", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const integrationConnectionsTable = pgTable("integration_connections", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const integrationMessagesTable = pgTable("integration_messages", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const integrationSyncLogsTable = pgTable("integration_sync_logs", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const inventoryAlertsTable = pgTable("inventory_alerts", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const inventoryTransactionsTable = pgTable("inventory_transactions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const journalEntryLinesTable = pgTable("journal_entry_lines", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const kimiAgentsTable = pgTable("kimi_agents", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const kimiConversationsTable = pgTable("kimi_conversations", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const kimiMessagesTable = pgTable("kimi_messages", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const lcAmendmentsTable = pgTable("lc_amendments", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const lettersOfCreditTable = pgTable("letters_of_credit", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const marketingBudgetTable = pgTable("marketing_budget", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const marketingCampaignsTable = pgTable("marketing_campaigns", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const materialCategoriesTable = pgTable("material_categories", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const menuDefinitionsTable = pgTable("menu_definitions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const moduleEntitiesTable = pgTable("module_entities", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id"),
  name: varchar("name", { length: 255 }),
  namePlural: varchar("name_plural", { length: 255 }),
  nameHe: varchar("name_he", { length: 255 }),
  slug: varchar("slug", { length: 255 }),
  description: text("description"),
  icon: varchar("icon", { length: 100 }),
  entityType: varchar("entity_type", { length: 50 }),
  hasStatus: boolean("has_status").default(false),
  hasCategories: boolean("has_categories").default(false),
  hasAttachments: boolean("has_attachments").default(true),
  hasNotes: boolean("has_notes").default(true),
  hasAudit: boolean("has_audit").default(true),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const notificationDeliveryLogTable = pgTable("notification_delivery_log", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const notificationPreferencesTable = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const notificationRoutingRulesTable = pgTable("notification_routing_rules", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const platformAutomationsTable = pgTable("platform_automations", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id"),
  name: varchar("name", { length: 255 }),
  triggerType: varchar("trigger_type", { length: 100 }),
  triggerConfig: jsonb("trigger_config"),
  actionType: varchar("action_type", { length: 100 }),
  actionConfig: jsonb("action_config"),
  isActive: boolean("is_active").default(true),
  runCount: integer("run_count").default(0),
  lastRunAt: timestamp("last_run_at"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const platformContextsTable = pgTable("platform_contexts", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const platformLocalesTable = pgTable("platform_locales", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const platformModulesTable = pgTable("platform_modules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  nameHe: varchar("name_he", { length: 255 }),
  nameEn: varchar("name_en", { length: 255 }),
  slug: varchar("slug", { length: 255 }),
  description: text("description"),
  icon: varchar("icon", { length: 100 }),
  color: varchar("color", { length: 50 }),
  category: varchar("category", { length: 100 }),
  status: varchar("status", { length: 50 }).default("active"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const platformRolesTable = pgTable("platform_roles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  nameHe: varchar("name_he", { length: 255 }),
  nameEn: varchar("name_en", { length: 255 }),
  slug: varchar("slug", { length: 255 }),
  description: text("description"),
  color: varchar("color", { length: 50 }),
  isSystem: boolean("is_system").default(false),
  isActive: boolean("is_active").default(true),
  settings: jsonb("settings"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const platformSettingsTable = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const platformToolsTable = pgTable("platform_tools", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const platformTranslationsTable = pgTable("platform_translations", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const platformWidgetsTable = pgTable("platform_widgets", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const platformWorkflowsTable = pgTable("platform_workflows", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id"),
  name: varchar("name", { length: 255 }),
  triggerType: varchar("trigger_type", { length: 100 }),
  triggerConfig: jsonb("trigger_config"),
  actions: jsonb("actions"),
  isActive: boolean("is_active").default(true),
  runCount: integer("run_count").default(0),
  lastRunAt: timestamp("last_run_at"),
  scheduleExpression: varchar("schedule_expression", { length: 255 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const priceQuoteItemsTable = pgTable("price_quote_items", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const priceQuotesTable = pgTable("price_quotes", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const productCategoriesTable = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const productMaterialsTable = pgTable("product_materials", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const projectBudgetLinesTable = pgTable("project_budget_lines", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const projectResourcesTable = pgTable("project_resources", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const projectRisksTable = pgTable("project_risks", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const purchaseOrderItemsTable = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const purchaseRequestApprovalsTable = pgTable("purchase_request_approvals", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const purchaseRequestItemsTable = pgTable("purchase_request_items", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const purchaseRequestsTable = pgTable("purchase_requests", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const purchaseReturnItemsTable = pgTable("purchase_return_items", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const purchaseReturnsTable = pgTable("purchase_returns", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const rawMaterialsTable = pgTable("raw_materials", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const recordAuditLogTable = pgTable("record_audit_log", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const recordVersionsTable = pgTable("record_versions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const reportDefinitionsTable = pgTable("report_definitions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const reportSnapshotsTable = pgTable("report_snapshots", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const roleAssignmentsTable = pgTable("role_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  roleId: integer("role_id"),
  assignedBy: integer("assigned_by"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const rolePermissionsTable = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const shipmentStatusUpdatesTable = pgTable("shipment_status_updates", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const shipmentTrackingTable = pgTable("shipment_tracking", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const socialMediaTable = pgTable("social_media", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const statusTransitionsTable = pgTable("status_transitions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const strategicGoalsTable = pgTable("strategic_goals", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const supplierCommunicationsTable = pgTable("supplier_communications", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const supplierContractsTable = pgTable("supplier_contracts", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const supplierEvaluationsTable = pgTable("supplier_evaluations", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const supplierMaterialsTable = pgTable("supplier_materials", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const supplierPriceHistoryTable = pgTable("supplier_price_history", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const swotItemsTable = pgTable("swot_items", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemButtonsTable = pgTable("system_buttons", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemDashboardPagesTable = pgTable("system_dashboard_pages", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemDashboardWidgetsTable = pgTable("system_dashboard_widgets", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemMenuItemsTable = pgTable("system_menu_items", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemPermissionsTable = pgTable("system_permissions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemTemplatesTable = pgTable("system_templates", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const templateDefinitionsTable = pgTable("template_definitions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const timesheetEntriesTable = pgTable("timesheet_entries", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const toolExecutionLogsTable = pgTable("tool_execution_logs", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const userSessionsTable = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  token: text("session_token"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
  lastActivity: timestamp("last_activity"),
  created_at: timestamp("created_at").defaultNow(),
});

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }),
  email: varchar("email", { length: 255 }),
  fullName: varchar("full_name", { length: 255 }),
  fullNameHe: varchar("full_name_he", { length: 255 }),
  passwordHash: text("password_hash"),
  phone: varchar("phone", { length: 50 }),
  department: varchar("department", { length: 100 }),
  jobTitle: varchar("job_title", { length: 200 }),
  isSuperAdmin: boolean("is_super_admin").default(false),
  isActive: boolean("is_active").default(true),
  avatarUrl: text("avatar_url"),
  lastLoginAt: timestamp("last_login"),
  loginCount: integer("login_count").default(0),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
  googleId: text("google_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const validationRulesTable = pgTable("validation_rules", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const viewDefinitionsTable = pgTable("view_definitions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const workflowInstancesTable = pgTable("workflow_instances", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id"),
  recordId: integer("record_id"),
  status: varchar("status", { length: 50 }).default("active"),
  currentStep: integer("current_step").default(0),
  context: jsonb("context"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const workflowStepLogsTable = pgTable("workflow_step_logs", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const workflowStepsTable = pgTable("workflow_steps", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const workflowTransitionsTable = pgTable("workflow_transitions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const moduleVersionsTable = pgTable("module_versions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const chatChannelMembersTable = pgTable("chat_channel_members", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id"),
  userId: integer("user_id"),
  role: varchar("role", { length: 50 }).default("member"),
  joinedAt: timestamp("joined_at").defaultNow(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const chatChannelsTable = pgTable("chat_channels", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  type: varchar("type", { length: 50 }),
  department: varchar("department", { length: 100 }),
  icon: varchar("icon", { length: 100 }),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const chatDirectConversationsTable = pgTable("chat_direct_conversations", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const chatReadReceiptsTable = pgTable("chat_read_receipts", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const claudeChatConversationsTable = pgTable("claude_chat_conversations", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const claudeChatMessagesTable = pgTable("claude_chat_messages", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const claudeGovernanceLogsTable = pgTable("claude_governance_logs", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const commodityRisksTable = pgTable("commodity_risks", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const competitorPricesTable = pgTable("competitor_prices", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const competitorsTable = pgTable("competitors", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const costCalculationsTable = pgTable("cost_calculations", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const externalApiKeysTable = pgTable("external_api_keys", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const externalUserSessionsTable = pgTable("external_user_sessions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const externalUsersTable = pgTable("external_users", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const installerMonthlyTable = pgTable("installer_monthly", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const installersTable = pgTable("installers", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const integrationEndpointsTable = pgTable("integration_endpoints", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const integrationTemplatesTable = pgTable("integration_templates", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const integrationWebhooksTable = pgTable("integration_webhooks", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const leaveRequestsTable = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const portalInvitationsTable = pgTable("portal_invitations", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const productionMonthlyTable = pgTable("production_monthly", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const productionWorkersTable = pgTable("production_workers", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const projectAnalysesTable = pgTable("project_analyses", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const projectAnalysisCostsTable = pgTable("project_analysis_costs", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const projectAnalysisMaterialsTable = pgTable("project_analysis_materials", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const projectAnalysisSimulationsTable = pgTable("project_analysis_simulations", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const reimbursementRequestsTable = pgTable("reimbursement_requests", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const salariedEmployeesTable = pgTable("salaried_employees", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const salariedKpisTable = pgTable("salaried_kpis", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const salariedTasksTable = pgTable("salaried_tasks", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const salesAgentsTable = pgTable("sales_agents", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const salesDealsTable = pgTable("sales_deals", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const supplierContactsTable = pgTable("supplier_contacts", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const supplierDocumentsTable = pgTable("supplier_documents", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const supplierNotesTable = pgTable("supplier_notes", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const supplierPerformanceTable = pgTable("supplier_performance", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const supportTicketsTable = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemCategoriesTable = pgTable("system_categories", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemDetailPagesTable = pgTable("system_detail_pages", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemDetailSectionsTable = pgTable("system_detail_sections", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemFormFieldsTable = pgTable("system_form_fields", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemFormSectionsTable = pgTable("system_form_sections", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemPublishLogsTable = pgTable("system_publish_logs", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemStatusSetsTable = pgTable("system_status_sets", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemStatusValuesTable = pgTable("system_status_values", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemValidationsTable = pgTable("system_validations", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemVersionsTable = pgTable("system_versions", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const systemViewColumnsTable = pgTable("system_view_columns", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const versionChangesTable = pgTable("version_changes", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const webhookConfigsTable = pgTable("webhook_configs", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const webhookLogsTable = pgTable("webhook_logs", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const baCurrencyExposuresTable = pgTable("ba_currency_exposures", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

