/**
 * BASH44 Automation Factory
 *
 * Generates automation templates dynamically from entity × trigger × severity matrix.
 * Instead of writing 2,000 automations manually, this factory generates them.
 */

// ═══════════════════════════════════════════════════════════════
// DIMENSIONS
// ═══════════════════════════════════════════════════════════════
export const ENTITIES = [
  { code: "customer", nameHe: "לקוח", domain: "sales" },
  { code: "vendor", nameHe: "ספק", domain: "procurement" },
  { code: "item", nameHe: "פריט", domain: "inventory" },
  { code: "warehouse", nameHe: "מחסן", domain: "inventory" },
  { code: "purchase_requisition", nameHe: "דרישת רכש", domain: "procurement" },
  { code: "purchase_order", nameHe: "הזמנת רכש", domain: "procurement" },
  { code: "goods_receipt", nameHe: "קליטת סחורה", domain: "procurement" },
  { code: "ap_invoice", nameHe: "חשבונית ספק", domain: "finance" },
  { code: "sales_order", nameHe: "הזמנת מכירה", domain: "sales" },
  { code: "ar_invoice", nameHe: "חשבונית לקוח", domain: "finance" },
  { code: "project", nameHe: "פרויקט", domain: "projects" },
  { code: "boq_line", nameHe: "שורת כתב כמויות", domain: "projects" },
  { code: "work_order", nameHe: "פקודת עבודה", domain: "production" },
  { code: "journal_entry", nameHe: "פקודת יומן", domain: "finance" },
  { code: "payment", nameHe: "תשלום", domain: "finance" },
  { code: "quotation", nameHe: "הצעת מחיר", domain: "sales" },
  { code: "lead", nameHe: "ליד", domain: "sales" },
  { code: "ticket", nameHe: "פנייה", domain: "service" },
  { code: "employee", nameHe: "עובד", domain: "hr" },
  { code: "bom", nameHe: "עץ מוצר", domain: "production" },
] as const;

export const TRIGGERS = [
  { code: "on_create", nameHe: "ביצירה", category: "event" },
  { code: "on_update", nameHe: "בעדכון", category: "event" },
  { code: "on_status_change", nameHe: "בשינוי סטטוס", category: "event" },
  { code: "on_threshold_breach", nameHe: "בחריגת סף", category: "event" },
  { code: "on_overdue", nameHe: "באיחור", category: "event" },
  { code: "on_missing_data", nameHe: "בחוסר נתונים", category: "event" },
  { code: "on_approve", nameHe: "באישור", category: "event" },
  { code: "on_post", nameHe: "בפוסט", category: "event" },
  { code: "scheduled_daily", nameHe: "יומי", category: "schedule" },
  { code: "scheduled_weekly", nameHe: "שבועי", category: "schedule" },
  { code: "scheduled_monthly", nameHe: "חודשי", category: "schedule" },
] as const;

export const SEVERITY_BANDS = [
  { code: "critical", nameHe: "קריטי", color: "red", autoEscalate: true },
  { code: "high", nameHe: "גבוה", color: "orange", autoEscalate: false },
  { code: "medium", nameHe: "בינוני", color: "yellow", autoEscalate: false },
  { code: "low", nameHe: "נמוך", color: "blue", autoEscalate: false },
] as const;

export const ACTIONS = [
  { code: "alert", nameHe: "התראה" },
  { code: "create_task", nameHe: "יצירת משימה" },
  { code: "draft", nameHe: "טיוטה" },
  { code: "suggest_only", nameHe: "המלצה בלבד" },
  { code: "send_notification", nameHe: "שליחת התראה" },
  { code: "escalate", nameHe: "הסלמה" },
  { code: "generate_report", nameHe: "יצירת דוח" },
  { code: "block_if_invalid", nameHe: "חסימה אם לא תקין" },
  { code: "execute_if_rule_allows", nameHe: "ביצוע אם מותר" },
] as const;

export const LIFECYCLE_STAGES = [
  { code: "draft", nameHe: "טיוטה" },
  { code: "pending_approval", nameHe: "ממתין לאישור" },
  { code: "approved", nameHe: "מאושר" },
  { code: "in_progress", nameHe: "בביצוע" },
  { code: "completed", nameHe: "הושלם" },
  { code: "closed", nameHe: "סגור" },
  { code: "cancelled", nameHe: "בוטל" },
  { code: "overdue", nameHe: "באיחור" },
] as const;

export const AGENT_MAP: Record<string, string> = {
  finance: "FINANCE_AI",
  procurement: "PROCUREMENT_AI",
  inventory: "INVENTORY_AI",
  production: "PRODUCTION_AI",
  projects: "PROJECT_AI",
  sales: "SALES_AI",
  service: "SERVICE_AI",
  hr: "HR_AI",
  ceo: "CEO_AI",
};

// ═══════════════════════════════════════════════════════════════
// AUTOMATION TEMPLATE
// ═══════════════════════════════════════════════════════════════
export interface GeneratedAutomation {
  code: string;
  name: string;
  nameHe: string;
  domain: string;
  entityType: string;
  triggerType: string;
  severity: string;
  agentCode: string;
  action: string;
  lifecycleStage?: string;
  executionMode: string;
  approvalRequired: boolean;
  auditRequired: boolean;
  isActive: boolean;
}

// ═══════════════════════════════════════════════════════════════
// FACTORY RULES — which combinations make sense
// ═══════════════════════════════════════════════════════════════
const VALID_COMBINATIONS: Array<{
  entityCodes: string[];
  triggerCodes: string[];
  severityCodes: string[];
  actionCode: string;
  nameTemplate: string;
  nameHeTemplate: string;
}> = [
  // Missing data on any entity
  { entityCodes: ["*"], triggerCodes: ["on_missing_data"], severityCodes: ["medium"], actionCode: "suggest_only", nameTemplate: "{entity} missing data scan", nameHeTemplate: "סריקת שדות חסרים — {entityHe}" },
  // Overdue on time-sensitive entities
  { entityCodes: ["purchase_order", "sales_order", "work_order", "project", "quotation", "ticket", "payment"], triggerCodes: ["on_overdue"], severityCodes: ["high"], actionCode: "alert", nameTemplate: "{entity} overdue alert", nameHeTemplate: "התראת איחור — {entityHe}" },
  // Status change audit on all entities
  { entityCodes: ["*"], triggerCodes: ["on_status_change"], severityCodes: ["low"], actionCode: "create_task", nameTemplate: "{entity} status change audit", nameHeTemplate: "ביקורת שינוי סטטוס — {entityHe}" },
  // Threshold breach — financial entities
  { entityCodes: ["ap_invoice", "ar_invoice", "payment", "journal_entry", "project"], triggerCodes: ["on_threshold_breach"], severityCodes: ["high"], actionCode: "escalate", nameTemplate: "{entity} threshold breach", nameHeTemplate: "חריגת סף — {entityHe}" },
  // Approval flow
  { entityCodes: ["purchase_requisition", "purchase_order", "payment", "journal_entry", "quotation"], triggerCodes: ["on_approve"], severityCodes: ["medium"], actionCode: "send_notification", nameTemplate: "{entity} approval notification", nameHeTemplate: "התראת אישור — {entityHe}" },
  // Post validation
  { entityCodes: ["journal_entry", "ap_invoice", "ar_invoice", "goods_receipt"], triggerCodes: ["on_post"], severityCodes: ["critical"], actionCode: "block_if_invalid", nameTemplate: "{entity} post validation", nameHeTemplate: "בדיקת פוסט — {entityHe}" },
  // Daily reports
  { entityCodes: ["project", "work_order", "sales_order", "purchase_order"], triggerCodes: ["scheduled_daily"], severityCodes: ["low"], actionCode: "generate_report", nameTemplate: "{entity} daily summary", nameHeTemplate: "סיכום יומי — {entityHe}" },
  // Weekly reports
  { entityCodes: ["customer", "vendor", "item", "warehouse", "employee"], triggerCodes: ["scheduled_weekly"], severityCodes: ["low"], actionCode: "generate_report", nameTemplate: "{entity} weekly review", nameHeTemplate: "סקירה שבועית — {entityHe}" },
  // Create validation
  { entityCodes: ["*"], triggerCodes: ["on_create"], severityCodes: ["medium"], actionCode: "suggest_only", nameTemplate: "{entity} creation validation", nameHeTemplate: "בדיקת יצירה — {entityHe}" },
];

// ═══════════════════════════════════════════════════════════════
// GENERATOR
// ═══════════════════════════════════════════════════════════════
export function generateAutomations(): GeneratedAutomation[] {
  const automations: GeneratedAutomation[] = [];
  let counter = 1;

  for (const rule of VALID_COMBINATIONS) {
    const entities = rule.entityCodes.includes("*")
      ? ENTITIES
      : ENTITIES.filter((e) => rule.entityCodes.includes(e.code));

    for (const entity of entities) {
      for (const triggerCode of rule.triggerCodes) {
        for (const severityCode of rule.severityCodes) {
          const code = `AUTO_${String(counter).padStart(4, "0")}`;
          const name = rule.nameTemplate
            .replace("{entity}", entity.code)
            .replace("{entityHe}", entity.nameHe);
          const nameHe = rule.nameHeTemplate
            .replace("{entity}", entity.code)
            .replace("{entityHe}", entity.nameHe);

          automations.push({
            code,
            name,
            nameHe,
            domain: entity.domain,
            entityType: entity.code,
            triggerType: triggerCode,
            severity: severityCode,
            agentCode: AGENT_MAP[entity.domain] || "FIELD_COMPLETION",
            action: rule.actionCode,
            executionMode: rule.actionCode === "block_if_invalid" ? "block_if_invalid" : "suggest_only",
            approvalRequired: severityCode === "critical" || severityCode === "high",
            auditRequired: true,
            isActive: true,
          });

          counter++;
        }
      }
    }
  }

  return automations;
}

// ═══════════════════════════════════════════════════════════════
// LIFECYCLE AUTOMATIONS — per entity per stage
// ═══════════════════════════════════════════════════════════════
export function generateLifecycleAutomations(): GeneratedAutomation[] {
  const automations: GeneratedAutomation[] = [];
  let counter = 5000;

  const lifecycleEntities = ENTITIES.filter((e) =>
    ["purchase_order", "sales_order", "work_order", "project", "quotation", "ap_invoice", "ar_invoice"].includes(e.code)
  );

  for (const entity of lifecycleEntities) {
    for (const stage of LIFECYCLE_STAGES) {
      const code = `LIFE_${String(counter).padStart(4, "0")}`;
      automations.push({
        code,
        name: `${entity.code} entered ${stage.code}`,
        nameHe: `${entity.nameHe} — ${stage.nameHe}`,
        domain: entity.domain,
        entityType: entity.code,
        triggerType: "on_status_change",
        severity: stage.code === "overdue" ? "high" : stage.code === "cancelled" ? "medium" : "low",
        agentCode: AGENT_MAP[entity.domain] || "AUDIT_GUARD",
        action: stage.code === "overdue" ? "escalate" : "send_notification",
        lifecycleStage: stage.code,
        executionMode: "execute_if_rule_allows",
        approvalRequired: false,
        auditRequired: true,
        isActive: true,
      });
      counter++;
    }
  }

  return automations;
}

// ═══════════════════════════════════════════════════════════════
// FULL GENERATION — returns all automations
// ═══════════════════════════════════════════════════════════════
export function generateAllAutomations() {
  const base = generateAutomations();
  const lifecycle = generateLifecycleAutomations();
  const total = [...base, ...lifecycle];

  return {
    automations: total,
    stats: {
      baseAutomations: base.length,
      lifecycleAutomations: lifecycle.length,
      total: total.length,
      byDomain: countBy(total, "domain"),
      byTrigger: countBy(total, "triggerType"),
      bySeverity: countBy(total, "severity"),
      byAction: countBy(total, "action"),
    },
  };
}

function countBy(arr: any[], key: string): Record<string, number> {
  return arr.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
