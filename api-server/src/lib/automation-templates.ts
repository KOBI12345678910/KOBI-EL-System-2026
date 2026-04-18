export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  categoryLabel: string;
  icon: string;
  triggerType: string;
  triggerEntitySlug: string;
  conditions: any[];
  actions: any[];
  tags: string[];
}

export const automationTemplates: AutomationTemplate[] = [
  {
    id: "order-to-cash-approval",
    name: "אישור הזמנת מכירה",
    description: "כאשר הזמנת מכירה נוצרת, שלח לאישור מנהל. לאחר אישור, שנה סטטוס ושלח התראה ללקוח.",
    category: "order-to-cash",
    categoryLabel: "הזמנה עד תשלום",
    icon: "ShoppingCart",
    triggerType: "on_create",
    triggerEntitySlug: "sales_order",
    conditions: [],
    actions: [
      {
        type: "send_notification",
        label: "התראה למנהל",
        config: {
          title: "הזמנת מכירה חדשה לאישור",
          message: "הזמנה #{{id}} מלקוח {{customer_name}} בסך ₪{{total}} ממתינה לאישור",
          targetRole: "manager",
          priority: "high",
        },
      },
      {
        type: "approval",
        label: "אישור מנהל",
        config: {
          approverRole: "manager",
          title: "אישור הזמנת מכירה",
          message: "האם לאשר הזמנה #{{id}}?",
          onApprove: [
            { type: "set_status", config: { status: "approved" } },
            {
              type: "send_notification",
              config: {
                title: "הזמנה אושרה",
                message: "הזמנה #{{id}} אושרה בהצלחה",
              },
            },
          ],
          onReject: [
            { type: "set_status", config: { status: "rejected" } },
            {
              type: "send_notification",
              config: {
                title: "הזמנה נדחתה",
                message: "הזמנה #{{id}} נדחתה",
              },
            },
          ],
        },
      },
    ],
    tags: ["מכירות", "אישור", "הזמנה"],
  },
  {
    id: "order-to-cash-invoice",
    name: "יצירת חשבונית מהזמנה מאושרת",
    description: "כאשר הזמנת מכירה מאושרת, צור חשבונית אוטומטית ושלח התראה לצוות הכספים.",
    category: "order-to-cash",
    categoryLabel: "הזמנה עד תשלום",
    icon: "Receipt",
    triggerType: "on_status_change",
    triggerEntitySlug: "sales_order",
    conditions: [{ field: "status", operator: "equals", value: "approved" }],
    actions: [
      {
        type: "create_record",
        label: "צור חשבונית",
        config: {
          entitySlug: "invoice",
          fieldMappings: {
            customer_name: "{{customer_name}}",
            customer_id: "{{customer_id}}",
            amount: "{{total}}",
            source_order_id: "{{id}}",
          },
          status: "draft",
        },
      },
      {
        type: "send_notification",
        label: "התראה לכספים",
        config: {
          title: "חשבונית חדשה נוצרה",
          message: "חשבונית נוצרה אוטומטית מהזמנה #{{id}} ({{customer_name}})",
          targetRole: "finance",
        },
      },
    ],
    tags: ["מכירות", "חשבוניות", "כספים"],
  },
  {
    id: "order-to-cash-payment",
    name: "עדכון תשלום התקבל",
    description: "כאשר חשבונית מסומנת כשולמה, עדכן את סטטוס ההזמנה המקורית ושלח אישור.",
    category: "order-to-cash",
    categoryLabel: "הזמנה עד תשלום",
    icon: "CreditCard",
    triggerType: "on_status_change",
    triggerEntitySlug: "invoice",
    conditions: [{ field: "status", operator: "equals", value: "paid" }],
    actions: [
      {
        type: "send_notification",
        label: "אישור תשלום",
        config: {
          title: "תשלום התקבל",
          message: "תשלום עבור חשבונית #{{id}} מ-{{customer_name}} התקבל בהצלחה (₪{{amount}})",
        },
      },
      {
        type: "update_field",
        label: "עדכן תאריך תשלום",
        config: {
          fieldSlug: "payment_date",
          value: "{{__now__}}",
        },
      },
    ],
    tags: ["מכירות", "תשלום", "כספים"],
  },

  {
    id: "procure-to-pay-request",
    name: "בקשת רכש לאישור",
    description: "כאשר בקשת רכש נוצרת, שלח לאישור מנהל רכש. אם הסכום מעל 10,000₪ דרוש אישור מנכ״ל.",
    category: "procure-to-pay",
    categoryLabel: "רכש עד תשלום",
    icon: "Package",
    triggerType: "on_create",
    triggerEntitySlug: "purchase_order",
    conditions: [],
    actions: [
      {
        type: "condition_check",
        label: "בדיקת סכום",
        config: {
          conditions: [{ field: "total", operator: "gt", value: 10000 }],
          ifActions: [
            {
              type: "approval",
              label: "אישור מנכ״ל",
              config: {
                approverRole: "ceo",
                title: "אישור הזמנת רכש מעל ₪10,000",
                message: "הזמנת רכש #{{id}} בסך ₪{{total}} דורשת אישור מנכ״ל",
                onApprove: [
                  { type: "set_status", config: { status: "approved" } },
                ],
                onReject: [
                  { type: "set_status", config: { status: "rejected" } },
                ],
              },
            },
          ],
          elseActions: [
            {
              type: "approval",
              label: "אישור מנהל רכש",
              config: {
                approverRole: "procurement_manager",
                title: "אישור הזמנת רכש",
                message: "הזמנת רכש #{{id}} בסך ₪{{total}} ממתינה לאישור",
                onApprove: [
                  { type: "set_status", config: { status: "approved" } },
                ],
                onReject: [
                  { type: "set_status", config: { status: "rejected" } },
                ],
              },
            },
          ],
        },
      },
    ],
    tags: ["רכש", "אישור", "הזמנה"],
  },
  {
    id: "procure-to-pay-goods-receipt",
    name: "קבלת סחורה ועדכון מלאי",
    description: "כאשר הזמנת רכש מסומנת כהתקבלה, עדכן מלאי ושלח התראה.",
    category: "procure-to-pay",
    categoryLabel: "רכש עד תשלום",
    icon: "Truck",
    triggerType: "on_status_change",
    triggerEntitySlug: "purchase_order",
    conditions: [{ field: "status", operator: "equals", value: "received" }],
    actions: [
      {
        type: "send_notification",
        label: "התראת קבלת סחורה",
        config: {
          title: "סחורה התקבלה",
          message: "הזמנת רכש #{{id}} מ-{{supplier_name}} התקבלה במלואה",
          targetRole: "warehouse",
        },
      },
      {
        type: "update_field",
        label: "עדכון תאריך קבלה",
        config: {
          fieldSlug: "received_date",
          value: "{{__now__}}",
        },
      },
    ],
    tags: ["רכש", "מלאי", "קבלת סחורה"],
  },
  {
    id: "procure-to-pay-invoice-match",
    name: "התאמת חשבונית ספק",
    description: "כאשר חשבונית ספק נוצרת, צור רשומת חשבון זכאים ושלח לאישור תשלום.",
    category: "procure-to-pay",
    categoryLabel: "רכש עד תשלום",
    icon: "FileCheck",
    triggerType: "on_create",
    triggerEntitySlug: "supplier_invoice",
    conditions: [],
    actions: [
      {
        type: "send_notification",
        label: "התראת חשבונית חדשה",
        config: {
          title: "חשבונית ספק חדשה",
          message: "חשבונית #{{invoice_number}} מ-{{supplier_name}} בסך ₪{{amount}} התקבלה",
          targetRole: "finance",
          priority: "normal",
        },
      },
      {
        type: "approval",
        label: "אישור תשלום",
        config: {
          approverRole: "finance_manager",
          title: "אישור תשלום חשבונית ספק",
          message: "האם לאשר תשלום חשבונית #{{invoice_number}} בסך ₪{{amount}}?",
          onApprove: [
            { type: "set_status", config: { status: "approved_for_payment" } },
          ],
          onReject: [
            { type: "set_status", config: { status: "disputed" } },
          ],
        },
      },
    ],
    tags: ["רכש", "חשבוניות", "ספקים"],
  },

  {
    id: "hire-to-retire-onboarding",
    name: "תהליך קליטת עובד",
    description: "כאשר עובד חדש נוסף, הפעל תהליך קליטה: שלח הודעות לצוותים רלוונטיים, הגדר הרשאות, ותזמן הדרכה.",
    category: "hire-to-retire",
    categoryLabel: "גיוס עד פרישה",
    icon: "UserPlus",
    triggerType: "on_create",
    triggerEntitySlug: "employee",
    conditions: [],
    actions: [
      {
        type: "set_status",
        label: "סטטוס: בקליטה",
        config: { status: "onboarding" },
      },
      {
        type: "send_notification",
        label: "התראה למשאבי אנוש",
        config: {
          title: "עובד חדש לקליטה",
          message: "עובד חדש {{name}} ({{position}}) נוסף למערכת. יש להתחיל תהליך קליטה.",
          targetRole: "hr",
          priority: "high",
        },
      },
      {
        type: "send_notification",
        label: "התראה ל-IT",
        config: {
          title: "הקמת חשבון עובד חדש",
          message: "נא להקים חשבון עבור עובד חדש: {{name}} ({{email}})",
          targetRole: "it",
        },
      },
      {
        type: "update_field",
        label: "עדכון תאריך תחילת עבודה",
        config: {
          fieldSlug: "onboarding_started_at",
          value: "{{__now__}}",
        },
      },
    ],
    tags: ["משאבי אנוש", "קליטה", "עובדים"],
  },
  {
    id: "hire-to-retire-termination",
    name: "תהליך סיום העסקה",
    description: "כאשר עובד מסומן כמפוטר/התפטר, בטל הרשאות, שלח התראה למחלקות ותזמן ראיון פרישה.",
    category: "hire-to-retire",
    categoryLabel: "גיוס עד פרישה",
    icon: "UserMinus",
    triggerType: "on_status_change",
    triggerEntitySlug: "employee",
    conditions: [
      { field: "status", operator: "in", value: ["terminated", "resigned", "fired"] },
    ],
    actions: [
      {
        type: "send_notification",
        label: "התראה דחופה — IT",
        config: {
          title: "⚠️ ביטול הרשאות עובד",
          message: "עובד {{name}} סיים העסקה. יש לבטל כל הרשאות גישה באופן מיידי.",
          targetRole: "it",
          priority: "critical",
        },
      },
      {
        type: "send_notification",
        label: "התראה — כספים",
        config: {
          title: "גמר חשבון עובד",
          message: "עובד {{name}} סיים העסקה. נא להכין גמר חשבון.",
          targetRole: "finance",
          priority: "high",
        },
      },
      {
        type: "update_field",
        label: "תאריך סיום",
        config: {
          fieldSlug: "termination_date",
          value: "{{__now__}}",
        },
      },
    ],
    tags: ["משאבי אנוש", "סיום העסקה", "עובדים"],
  },
  {
    id: "hire-to-retire-leave",
    name: "ניהול חופשות",
    description: "כאשר בקשת חופשה נוצרת, שלח לאישור מנהל ישיר ועדכן את יתרת הימים.",
    category: "hire-to-retire",
    categoryLabel: "גיוס עד פרישה",
    icon: "Calendar",
    triggerType: "on_create",
    triggerEntitySlug: "leave_request",
    conditions: [],
    actions: [
      {
        type: "approval",
        label: "אישור מנהל",
        config: {
          approverRole: "manager",
          title: "בקשת חופשה מ-{{employee_name}}",
          message: "{{employee_name}} מבקש/ת חופשה מ-{{start_date}} עד {{end_date}} ({{days}} ימים)",
          onApprove: [
            { type: "set_status", config: { status: "approved" } },
            {
              type: "send_notification",
              config: {
                title: "חופשה אושרה",
                message: "בקשת החופשה שלך מ-{{start_date}} עד {{end_date}} אושרה",
              },
            },
          ],
          onReject: [
            { type: "set_status", config: { status: "rejected" } },
            {
              type: "send_notification",
              config: {
                title: "חופשה נדחתה",
                message: "בקשת החופשה שלך מ-{{start_date}} עד {{end_date}} נדחתה",
              },
            },
          ],
        },
      },
    ],
    tags: ["משאבי אנוש", "חופשות", "אישור"],
  },

  {
    id: "lead-qualification",
    name: "סיווג ליד אוטומטי",
    description: "כאשר ליד חדש נוצר, בדוק את הנתונים וסווג אוטומטית (חם/קר/חמים) לפי קריטריונים.",
    category: "crm",
    categoryLabel: "ניהול לקוחות",
    icon: "Target",
    triggerType: "on_create",
    triggerEntitySlug: "lead",
    conditions: [],
    actions: [
      {
        type: "condition_check",
        label: "בדיקת גודל עסקה",
        config: {
          conditions: [{ field: "deal_value", operator: "gt", value: 50000 }],
          ifActions: [
            { type: "update_field", config: { fieldSlug: "priority", value: "hot" } },
            {
              type: "send_notification",
              config: {
                title: "🔥 ליד חם חדש",
                message: "ליד {{name}} עם פוטנציאל ₪{{deal_value}} — נא ליצור קשר מיידית",
                targetRole: "sales",
                priority: "high",
              },
            },
          ],
          elseActions: [
            { type: "update_field", config: { fieldSlug: "priority", value: "warm" } },
          ],
        },
      },
    ],
    tags: ["CRM", "לידים", "סיווג"],
  },
  {
    id: "lead-follow-up",
    name: "מעקב לידים",
    description: "כאשר ליד עובר לסטטוס 'בטיפול', שלח תזכורת מעקב ועדכן תאריך קשר אחרון.",
    category: "crm",
    categoryLabel: "ניהול לקוחות",
    icon: "Phone",
    triggerType: "on_status_change",
    triggerEntitySlug: "lead",
    conditions: [{ field: "status", operator: "equals", value: "in_progress" }],
    actions: [
      {
        type: "update_field",
        label: "עדכון תאריך קשר",
        config: {
          fieldSlug: "last_contact_date",
          value: "{{__now__}}",
        },
      },
      {
        type: "send_notification",
        label: "תזכורת מעקב",
        config: {
          title: "מעקב ליד — {{name}}",
          message: "הליד {{name}} עבר לטיפול. יש ליצור קשר תוך 24 שעות.",
          targetRole: "sales",
        },
      },
    ],
    tags: ["CRM", "לידים", "מעקב"],
  },

  {
    id: "quality-check",
    name: "בקרת איכות ייצור",
    description: "כאשר הוראת עבודה מסתיימת, שלח לבדיקת איכות לפני אישור סופי.",
    category: "production",
    categoryLabel: "ייצור",
    icon: "ClipboardCheck",
    triggerType: "on_status_change",
    triggerEntitySlug: "work_order",
    conditions: [{ field: "status", operator: "equals", value: "completed" }],
    actions: [
      {
        type: "set_status",
        label: "העבר לבדיקת איכות",
        config: { status: "quality_check" },
      },
      {
        type: "send_notification",
        label: "התראה לצוות איכות",
        config: {
          title: "הוראת עבודה לבדיקת איכות",
          message: "הוראת עבודה #{{id}} ({{product_name}}) הסתיימה ומחכה לבדיקת איכות",
          targetRole: "quality",
        },
      },
    ],
    tags: ["ייצור", "איכות", "בקרה"],
  },
];

export function getTemplatesByCategory(): Record<string, { label: string; templates: AutomationTemplate[] }> {
  const categories: Record<string, { label: string; templates: AutomationTemplate[] }> = {};
  for (const template of automationTemplates) {
    if (!categories[template.category]) {
      categories[template.category] = { label: template.categoryLabel, templates: [] };
    }
    categories[template.category].templates.push(template);
  }
  return categories;
}

export function getTemplateById(id: string): AutomationTemplate | undefined {
  return automationTemplates.find((t) => t.id === id);
}
