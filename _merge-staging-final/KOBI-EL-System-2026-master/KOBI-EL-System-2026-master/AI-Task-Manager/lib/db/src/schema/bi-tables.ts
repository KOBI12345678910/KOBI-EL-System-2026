import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const biDashboardsTable = pgTable("bi_dashboards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  layoutConfig: jsonb("layout_config").notNull().default({}),
  roleAssignments: jsonb("role_assignments").notNull().default([]),
  isDefault: boolean("is_default").notNull().default(false),
  isPublic: boolean("is_public").notNull().default(false),
  createdBy: integer("created_by"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const biWidgetsTable = pgTable("bi_widgets", {
  id: serial("id").primaryKey(),
  dashboardId: integer("dashboard_id").notNull().references(() => biDashboardsTable.id, { onDelete: "cascade" }),
  widgetType: text("widget_type").notNull().default("kpi"),
  title: text("title").notNull(),
  reportId: integer("report_id"),
  dataSourceConfig: jsonb("data_source_config").notNull().default({}),
  displayConfig: jsonb("display_config").notNull().default({}),
  positionX: integer("position_x").notNull().default(0),
  positionY: integer("position_y").notNull().default(0),
  sizeW: integer("size_w").notNull().default(4),
  sizeH: integer("size_h").notNull().default(3),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const biConditionalFormattingTable = pgTable("bi_conditional_formatting", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => biDashboardsTable.id, { onDelete: "cascade" }),
  fieldSlug: text("field_slug").notNull(),
  conditionType: text("condition_type").notNull().default("value"),
  operator: text("operator").notNull().default("gt"),
  thresholdValue: text("threshold_value"),
  thresholdValue2: text("threshold_value2"),
  backgroundColor: text("background_color"),
  textColor: text("text_color"),
  icon: text("icon"),
  label: text("label"),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
