export interface FewShotExample {
  input: string;
  output: string;
}

export type TaskType =
  | "order_analysis"
  | "sql_generation"
  | "report_formatting"
  | "error_debugging"
  | "general";

export const FEW_SHOT_EXAMPLES: Record<TaskType, FewShotExample[]> = {
  order_analysis: [
    {
      input: "נתח סיכון של הזמנה #SO-1042 — לקוח חדש, סכום 85,000 ₪, מסירה תוך 3 ימים",
      output: JSON.stringify({
        riskScore: 72,
        riskLevel: "HIGH",
        factors: [
          { factor: "לקוח חדש ללא היסטוריה", weight: 30, severity: "HIGH" },
          { factor: "מסירה אגרסיבית (3 ימים)", weight: 25, severity: "HIGH" },
          { factor: "סכום גבוה יחסית", weight: 17, severity: "MEDIUM" },
        ],
        recommendation: "דרוש אישור מנהל מכירות + מקדמה של 50% לפני ייצור",
        biggestRisk: "לקוח חדש ללא אשראי מאושר",
      }, null, 2),
    },
    {
      input: "נתח סיכון של הזמנה #SO-2001 — לקוח קיים 5 שנים, סכום 12,000 ₪, מסירה תוך 14 ימים",
      output: JSON.stringify({
        riskScore: 12,
        riskLevel: "LOW",
        factors: [
          { factor: "לקוח ותיק עם היסטוריית תשלום טובה", weight: -20, severity: "LOW" },
          { factor: "סכום בינוני", weight: 8, severity: "LOW" },
          { factor: "זמן מסירה סביר", weight: 4, severity: "LOW" },
        ],
        recommendation: "ניתן לאשר ישירות",
        biggestRisk: "אין סיכון מהותי",
      }, null, 2),
    },
  ],

  sql_generation: [
    {
      input: "הצג את 10 הלקוחות עם ההכנסה הגבוהה ביותר החודש",
      output: `SELECT c.name, c.phone, SUM(ci.total_amount) AS total_revenue
FROM customers c
JOIN customer_invoices ci ON ci.customer_id = c.id
WHERE ci.invoice_date >= date_trunc('month', CURRENT_DATE)
  AND ci.status = 'paid'
GROUP BY c.id, c.name, c.phone
ORDER BY total_revenue DESC
LIMIT 10;`,
    },
    {
      input: "מה המלאי הנמוך מרמת מינימום בכל המחסנים?",
      output: `SELECT rm.name, rm.sku, rm.current_stock, rm.min_stock_level,
       (rm.min_stock_level - rm.current_stock) AS shortage
FROM raw_materials rm
WHERE rm.current_stock < rm.min_stock_level
ORDER BY shortage DESC;`,
    },
    {
      input: "כמה הזמנות ייצור פתוחות יש לפי עדיפות?",
      output: `SELECT priority, COUNT(*) AS order_count, SUM(quantity) AS total_qty
FROM production_work_orders
WHERE status IN ('pending', 'in_progress')
GROUP BY priority
ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END;`,
    },
  ],

  report_formatting: [
    {
      input: "צור דוח מלאי קצר עם 3 פריטים: ברזל 100 ק\"ג (min 50), נירוסטה 20 ק\"ג (min 30), אלומיניום 80 ק\"ג (min 40)",
      output: `## דוח מלאי — ${new Date().toLocaleDateString("he-IL")}

| פריט | מלאי נוכחי | מינימום | סטטוס |
|------|------------|---------|-------|
| ברזל | 100 ק"ג | 50 ק"ג | ✅ תקין |
| נירוסטה | 20 ק"ג | 30 ק"ג | ⚠️ חסר 10 ק"ג |
| אלומיניום | 80 ק"ג | 40 ק"ג | ✅ תקין |

**סה"כ פריטים**: 3 | **דורשים פעולה**: 1
**המלצה**: הזמן נירוסטה בהקדם.`,
    },
    {
      input: "צור דוח מכירות חודשי עם הכנסות 250,000 ₪, 18 הזמנות, ממוצע 13,888 ₪",
      output: `## דוח מכירות — ${new Date().toLocaleDateString("he-IL", { month: "long", year: "numeric" })}

**סיכום חודשי**:
- סה"כ הכנסות: **₪250,000**
- מספר הזמנות: **18**
- ממוצע להזמנה: **₪13,888**
- מע"מ (18%): **₪42,500**
- סה"כ כולל מע"מ: **₪292,500**

📈 **מגמה**: עלייה של 12% לעומת החודש הקודם`,
    },
  ],

  error_debugging: [
    {
      input: "TypeError: Cannot read properties of undefined (reading 'id') at sales_orders route",
      output: `**שורש הבעיה**: גישה לשדה \`id\` על אובייקט undefined — הנתון לא נמצא ב-DB.

**תיקון**:
\`\`\`typescript
// לפני:
const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, id) });
return order.id; // קורסת אם order === undefined

// אחרי:
const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, id) });
if (!order) return res.status(404).json({ error: "הזמנה לא נמצאה" });
return order.id;
\`\`\`

**למה**: שאילתת findFirst מחזירה undefined כשאין תוצאות.
**מניעה**: הוסף optional chaining (\`order?.id\`) ובדיקת null לפני שימוש.`,
    },
    {
      input: "Error: duplicate key value violates unique constraint customers_email_key",
      output: `**שורש הבעיה**: ניסיון ליצור לקוח עם אימייל שכבר קיים ב-DB.

**תיקון**:
\`\`\`typescript
// בדוק קיים לפני הכנסה:
const existing = await db.query.customers.findFirst({
  where: eq(customers.email, email)
});
if (existing) {
  return res.status(409).json({ error: "לקוח עם אימייל זה כבר קיים", customerId: existing.id });
}
// המשך יצירה...
\`\`\`

**למה**: constraint UNIQUE על עמודת email.
**מניעה**: השתמש ב-INSERT ... ON CONFLICT DO UPDATE לאפסרט.`,
    },
  ],

  general: [
    {
      input: "מה מצב המערכת?",
      output: `מערכת ERP טכנו-כל עוזי — פעילה ✅

**מצב כללי**: תקין
**מודולים פעילים**: 23
**סוכני AI**: 189
**DB**: מחובר

לפרטים נוספים — ציין את המודול הספציפי שברצונך לבדוק.`,
    },
  ],
};

export function getExamplesForTaskType(taskType: TaskType): FewShotExample[] {
  return FEW_SHOT_EXAMPLES[taskType] ?? FEW_SHOT_EXAMPLES.general;
}

export function detectTaskType(prompt: string, systemPrompt?: string): TaskType {
  const lower = (prompt + " " + (systemPrompt ?? "")).toLowerCase();

  if (lower.includes("sql") || lower.includes("שאילתה") || lower.includes("select") || lower.includes("query")) {
    return "sql_generation";
  }
  if (lower.includes("סיכון") || lower.includes("risk") || lower.includes("הזמנה") && lower.includes("נתח")) {
    return "order_analysis";
  }
  if (lower.includes("דוח") || lower.includes("report") || lower.includes("סיכום") && lower.includes("חודש")) {
    return "report_formatting";
  }
  if (lower.includes("שגיאה") || lower.includes("error") || lower.includes("debug") || lower.includes("bug")) {
    return "error_debugging";
  }
  return "general";
}
