import { pgTable, serial, text, integer, boolean, timestamp, bigint, jsonb } from "drizzle-orm/pg-core";

export const documentFoldersTable = pgTable("document_folders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  color: text("color").default("#6366f1"),
  icon: text("icon").default("folder"),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  isTrashed: boolean("is_trashed").notNull().default(false),
  createdBy: text("created_by").default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const documentTagsTable = pgTable("document_tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").default("#6366f1"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const documentFilesTable = pgTable("document_files", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  originalName: text("original_name").notNull(),
  folderId: integer("folder_id"),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: bigint("size", { mode: "number" }).notNull().default(0),
  filePath: text("file_path").notNull(),
  thumbnailPath: text("thumbnail_path"),
  tags: text("tags").array().default([]),
  description: text("description"),
  uploadedBy: text("uploaded_by").default("system"),
  isTrashed: boolean("is_trashed").notNull().default(false),
  currentVersion: integer("current_version").notNull().default(1),
  classification: text("classification").default("internal"),
  module: text("module"),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  ocrText: text("ocr_text"),
  ocrStatus: text("ocr_status").default("none"),
  isLegalHold: boolean("is_legal_hold").notNull().default(false),
  legalHoldCase: text("legal_hold_case"),
  legalHoldAt: timestamp("legal_hold_at"),
  legalHoldBy: text("legal_hold_by"),
  approvalStatus: text("approval_status").default("none"),
  approvalWorkflowId: integer("approval_workflow_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const documentVersionsTable = pgTable("document_versions", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").notNull().references(() => documentFilesTable.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull().default(1),
  filePath: text("file_path").notNull(),
  originalName: text("original_name").notNull(),
  size: bigint("size", { mode: "number" }).notNull().default(0),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  changeNote: text("change_note"),
  createdBy: text("created_by").notNull().default("system"),
  diffSummary: text("diff_summary"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const documentApprovalWorkflowsTable = pgTable("document_approval_workflows", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  steps: jsonb("steps").notNull().default([]),
  routingRules: jsonb("routing_rules").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").notNull().default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const dmsDocumentApprovalsTable = pgTable("dms_document_approvals", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").notNull().references(() => documentFilesTable.id, { onDelete: "cascade" }),
  workflowId: integer("workflow_id"),
  stepNumber: integer("step_number").notNull().default(1),
  stepName: text("step_name").notNull().default(""),
  assignedTo: text("assigned_to"),
  status: text("status").notNull().default("pending"),
  comments: text("comments"),
  actionAt: timestamp("action_at"),
  actionBy: text("action_by"),
  dueDate: timestamp("due_date"),
  requestedBy: text("requested_by").notNull().default("system"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const documentShareLinksTable = pgTable("document_share_links", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").notNull().references(() => documentFilesTable.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  createdBy: text("created_by").notNull().default("system"),
  expiresAt: timestamp("expires_at"),
  allowDownload: boolean("allow_download").notNull().default(true),
  requireWatermark: boolean("require_watermark").notNull().default(false),
  maxViews: integer("max_views"),
  viewCount: integer("view_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  accessLog: jsonb("access_log").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const documentLegalHoldsTable = pgTable("document_legal_holds", {
  id: serial("id").primaryKey(),
  caseName: text("case_name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  createdBy: text("created_by").notNull().default("system"),
  releasedBy: text("released_by"),
  releasedAt: timestamp("released_at"),
  releaseNote: text("release_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
