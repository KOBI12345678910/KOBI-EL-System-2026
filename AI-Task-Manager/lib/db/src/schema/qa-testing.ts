import { pgTable, serial, text, integer, date, timestamp } from "drizzle-orm/pg-core";

export const qaTestPlansTable = pgTable("qa_test_plans", {
  id: serial("id").primaryKey(),
  planNumber: text("plan_number").notNull().unique(),
  name: text("name").notNull(),
  productFeature: text("product_feature"),
  version: text("version"),
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const qaTestCasesTable = pgTable("qa_test_cases", {
  id: serial("id").primaryKey(),
  caseNumber: text("case_number").notNull().unique(),
  planId: integer("plan_id").notNull(),
  title: text("title").notNull(),
  steps: text("steps"),
  expectedResult: text("expected_result"),
  actualResult: text("actual_result"),
  status: text("status").notNull().default("not-run"),
  tester: text("tester"),
  runDate: date("run_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
