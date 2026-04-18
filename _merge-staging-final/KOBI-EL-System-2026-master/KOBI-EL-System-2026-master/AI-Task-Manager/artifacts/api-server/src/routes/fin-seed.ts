import { db } from "@workspace/db";
import {
  finStatusesTable,
  finDocumentTypesTable,
  finPaymentMethodsTable,
  finCategoriesTable,
} from "@workspace/db/schema";
import { sql } from "drizzle-orm";

export async function seedFinancialModule() {
  // Seed Statuses
  const existingStatuses = await db.select().from(finStatusesTable).limit(1);
  if (existingStatuses.length === 0) {
    await db.insert(finStatusesTable).values([
      { name: "draft", label: "Draft", labelHe: "טיוטה", color: "#9CA3AF", entityType: "all", sortOrder: 1, isDefault: true },
      { name: "pending", label: "Pending", labelHe: "ממתין", color: "#F59E0B", entityType: "all", sortOrder: 2 },
      { name: "open", label: "Open", labelHe: "פתוח", color: "#3B82F6", entityType: "all", sortOrder: 3 },
      { name: "paid", label: "Paid", labelHe: "שולם", color: "#10B981", entityType: "all", sortOrder: 4, isFinal: true },
      { name: "partially_paid", label: "Partially Paid", labelHe: "שולם חלקית", color: "#8B5CF6", entityType: "all", sortOrder: 5 },
      { name: "cancelled", label: "Cancelled", labelHe: "בוטל", color: "#EF4444", entityType: "all", sortOrder: 6, isFinal: true },
      { name: "archived", label: "Archived", labelHe: "בארכיון", color: "#6B7280", entityType: "all", sortOrder: 7, isFinal: true },
      { name: "failed", label: "Failed", labelHe: "נכשל", color: "#DC2626", entityType: "all", sortOrder: 8 },
      { name: "recurring_active", label: "Recurring Active", labelHe: "מחזורי פעיל", color: "#059669", entityType: "recurring", sortOrder: 9 },
      { name: "recurring_paused", label: "Recurring Paused", labelHe: "מחזורי מושהה", color: "#D97706", entityType: "recurring", sortOrder: 10 },
    ]);
    console.log("[fin-seed] Statuses seeded");
  }

  // Seed Document Types
  const existingDocTypes = await db.select().from(finDocumentTypesTable).limit(1);
  if (existingDocTypes.length === 0) {
    await db.insert(finDocumentTypesTable).values([
      { name: "receipt", label: "Receipt", labelHe: "קבלה", direction: "income", prefix: "RCP", nextNumber: 1, sortOrder: 1 },
      { name: "invoice", label: "Invoice", labelHe: "חשבונית מס", direction: "income", prefix: "INV", nextNumber: 1, sortOrder: 2 },
      { name: "invoice_receipt", label: "Invoice Receipt", labelHe: "חשבונית מס / קבלה", direction: "income", prefix: "IVR", nextNumber: 1, sortOrder: 3 },
      { name: "payment_request", label: "Payment Request", labelHe: "דרישת תשלום", direction: "income", prefix: "PRQ", nextNumber: 1, sortOrder: 4 },
      { name: "expense_invoice", label: "Expense Invoice", labelHe: "חשבונית הוצאה", direction: "expense", prefix: "EXI", nextNumber: 1, sortOrder: 5 },
      { name: "expense_receipt", label: "Expense Receipt", labelHe: "קבלת הוצאה", direction: "expense", prefix: "EXR", nextNumber: 1, sortOrder: 6 },
      { name: "credit_note", label: "Credit Note", labelHe: "זיכוי", direction: "both", prefix: "CRN", nextNumber: 1, sortOrder: 7 },
      { name: "other_document", label: "Other Document", labelHe: "מסמך אחר", direction: "both", prefix: "OTH", nextNumber: 1, sortOrder: 8 },
      { name: "recurring_document_template", label: "Recurring Template", labelHe: "תבנית מחזורית", direction: "both", prefix: "RCT", nextNumber: 1, sortOrder: 9 },
    ]);
    console.log("[fin-seed] Document types seeded");
  }

  // Seed Payment Methods
  const existingMethods = await db.select().from(finPaymentMethodsTable).limit(1);
  if (existingMethods.length === 0) {
    await db.insert(finPaymentMethodsTable).values([
      { name: "cash", label: "Cash", labelHe: "מזומן", icon: "banknote", sortOrder: 1 },
      { name: "credit_card", label: "Credit Card", labelHe: "כרטיס אשראי", icon: "credit-card", sortOrder: 2 },
      { name: "bank_transfer", label: "Bank Transfer", labelHe: "העברה בנקאית", icon: "building-2", sortOrder: 3 },
      { name: "check", label: "Check", labelHe: "צ'ק", icon: "file-check", sortOrder: 4 },
      { name: "standing_order", label: "Standing Order", labelHe: "הוראת קבע", icon: "repeat", sortOrder: 5 },
      { name: "masav", label: "Masav", labelHe: 'מס"ב', icon: "database", sortOrder: 6 },
      { name: "other", label: "Other", labelHe: "אחר", icon: "circle-dot", sortOrder: 7 },
    ]);
    console.log("[fin-seed] Payment methods seeded");
  }

  // Seed Categories
  const existingCategories = await db.select().from(finCategoriesTable).limit(1);
  if (existingCategories.length === 0) {
    await db.insert(finCategoriesTable).values([
      // Income categories
      { name: "sales", nameHe: "מכירות", direction: "income", sortOrder: 1 },
      { name: "services", nameHe: "שירותים", direction: "income", sortOrder: 2 },
      { name: "consulting", nameHe: "ייעוץ", direction: "income", sortOrder: 3 },
      { name: "subscriptions", nameHe: "מנויים", direction: "income", sortOrder: 4 },
      { name: "other_income", nameHe: "הכנסות אחרות", direction: "income", sortOrder: 5 },
      // Expense categories
      { name: "materials", nameHe: "חומרים", direction: "expense", sortOrder: 6 },
      { name: "labor", nameHe: "עבודה", direction: "expense", sortOrder: 7 },
      { name: "rent", nameHe: "שכירות", direction: "expense", sortOrder: 8 },
      { name: "utilities", nameHe: "חשמל / מים / גז", direction: "expense", sortOrder: 9 },
      { name: "office", nameHe: "ציוד משרדי", direction: "expense", sortOrder: 10 },
      { name: "marketing", nameHe: "שיווק ופרסום", direction: "expense", sortOrder: 11 },
      { name: "insurance", nameHe: "ביטוח", direction: "expense", sortOrder: 12 },
      { name: "transportation", nameHe: "הובלה", direction: "expense", sortOrder: 13 },
      { name: "professional_services", nameHe: "שירותים מקצועיים", direction: "expense", sortOrder: 14 },
      { name: "other_expense", nameHe: "הוצאות אחרות", direction: "expense", sortOrder: 15 },
    ]);
    console.log("[fin-seed] Categories seeded");
  }

  console.log("[fin-seed] Financial module seed complete");
}
