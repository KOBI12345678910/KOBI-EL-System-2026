import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { moduleEntitiesTable } from "./module-entities";

export const systemFormSectionsTable = pgTable("system_form_sections", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  formId: integer("form_id"),
  name: text("name").notNull(),
  nameHe: text("name_he"),
  nameEn: text("name_en"),
  slug: text("slug").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isCollapsible: boolean("is_collapsible").notNull().default(false),
  isCollapsed: boolean("is_collapsed").notNull().default(false),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemFormFieldsTable = pgTable("system_form_fields", {
  id: serial("id").primaryKey(),
  sectionId: integer("section_id").notNull().references(() => systemFormSectionsTable.id, { onDelete: "cascade" }),
  fieldId: integer("field_id").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  width: text("width").notNull().default("full"),
  isVisible: boolean("is_visible").notNull().default(true),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemViewColumnsTable = pgTable("system_view_columns", {
  id: serial("id").primaryKey(),
  viewId: integer("view_id").notNull(),
  fieldId: integer("field_id").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  width: text("width"),
  isVisible: boolean("is_visible").notNull().default(true),
  isSortable: boolean("is_sortable").notNull().default(true),
  isFilterable: boolean("is_filterable").notNull().default(false),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemDetailPagesTable = pgTable("system_detail_pages", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const systemDetailSectionsTable = pgTable("system_detail_sections", {
  id: serial("id").primaryKey(),
  detailPageId: integer("detail_page_id").notNull().references(() => systemDetailPagesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  sectionType: text("section_type").notNull().default("fields"),
  sortOrder: integer("sort_order").notNull().default(0),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemButtonsTable = pgTable("system_buttons", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  buttonType: text("button_type").notNull(),
  icon: text("icon"),
  color: text("color"),
  actionType: text("action_type"),
  actionConfig: jsonb("action_config").default({}),
  conditions: jsonb("conditions").default({}),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemCategoriesTable = pgTable("system_categories", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  nameHe: text("name_he"),
  nameEn: text("name_en"),
  slug: text("slug").notNull(),
  parentId: integer("parent_id"),
  color: text("color"),
  icon: text("icon"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemStatusSetsTable = pgTable("system_status_sets", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemStatusValuesTable = pgTable("system_status_values", {
  id: serial("id").primaryKey(),
  statusSetId: integer("status_set_id").notNull().references(() => systemStatusSetsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  nameHe: text("name_he"),
  nameEn: text("name_en"),
  slug: text("slug").notNull(),
  color: text("color").notNull().default("gray"),
  icon: text("icon"),
  sortOrder: integer("sort_order").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  isFinal: boolean("is_final").notNull().default(false),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemPermissionsTable = pgTable("system_permissions", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id"),
  moduleId: integer("module_id"),
  role: text("role").notNull(),
  action: text("action").notNull(),
  isAllowed: boolean("is_allowed").notNull().default(true),
  conditions: jsonb("conditions").default({}),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemMenuItemsTable = pgTable("system_menu_items", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id"),
  entityId: integer("entity_id"),
  parentId: integer("parent_id"),
  label: text("label").notNull(),
  labelHe: text("label_he"),
  labelEn: text("label_en"),
  icon: text("icon"),
  path: text("path"),
  section: text("section"),
  roles: jsonb("roles").default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemDashboardPagesTable = pgTable("system_dashboard_pages", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  layout: jsonb("layout").default({}),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const systemDashboardWidgetsTable = pgTable("system_dashboard_widgets", {
  id: serial("id").primaryKey(),
  dashboardId: integer("dashboard_id").notNull().references(() => systemDashboardPagesTable.id, { onDelete: "cascade" }),
  widgetType: text("widget_type").notNull(),
  title: text("title").notNull(),
  entityId: integer("entity_id"),
  config: jsonb("config").default({}),
  position: integer("position").default(0),
  size: text("size").default("medium"),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemValidationsTable = pgTable("system_validations", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  fieldId: integer("field_id"),
  validationType: text("validation_type").notNull(),
  rule: jsonb("rule").notNull().default({}),
  errorMessage: text("error_message"),
  errorMessageHe: text("error_message_he"),
  errorMessageEn: text("error_message_en"),
  isActive: boolean("is_active").notNull().default(true),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemTemplatesTable = pgTable("system_templates", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id"),
  moduleId: integer("module_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  templateType: text("template_type").notNull(),
  content: jsonb("content").default({}),
  isActive: boolean("is_active").notNull().default(true),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const systemVersionsTable = pgTable("system_versions", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  versionNumber: integer("version_number").notNull().default(1),
  data: jsonb("data").notNull().default({}),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const systemPublishLogsTable = pgTable("system_publish_logs", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id"),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  action: text("action").notNull(),
  previousVersion: integer("previous_version"),
  newVersion: integer("new_version"),
  publishedBy: text("published_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
