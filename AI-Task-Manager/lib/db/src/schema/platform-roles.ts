import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const platformRolesTable = pgTable("platform_roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  nameHe: text("name_he"),
  nameEn: text("name_en"),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  color: text("color").notNull().default("blue"),
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  parentRoleId: integer("parent_role_id"),
  priority: integer("priority").notNull().default(0),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const roleAssignmentsTable = pgTable("role_assignments", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull().references(() => platformRolesTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  assignedBy: text("assigned_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
