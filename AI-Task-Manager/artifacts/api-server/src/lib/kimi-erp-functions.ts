import { SYSTEM_PROMPTS, extractJSON } from "./kimi-prompt-engine";
import { getExamplesForTaskType } from "./kimi-examples";

let _kimiAsk: ((prompt: string, opts?: { system?: string }) => Promise<string>) | null = null;
let _kimiAskJSON: (<T>(prompt: string, opts?: { system?: string }) => Promise<T | null>) | null = null;

export function initErpFunctions(
  ask: (prompt: string, opts?: { system?: string }) => Promise<string>,
  askJSON: <T>(prompt: string, opts?: { system?: string }) => Promise<T | null>
) {
  _kimiAsk = ask;
  _kimiAskJSON = askJSON;
}

function getAsk() {
  if (!_kimiAsk) throw new Error("ERP functions not initialized — call initErpFunctions first");
  return _kimiAsk;
}

function getAskJSON() {
  if (!_kimiAskJSON) throw new Error("ERP functions not initialized — call initErpFunctions first");
  return _kimiAskJSON;
}

export interface OrderRiskResult {
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  factors: Array<{ factor: string; weight: number; severity: "LOW" | "MEDIUM" | "HIGH" }>;
  recommendation: string;
  biggestRisk: string;
}

export interface NaturalToSQLResult {
  sql: string;
  explanation: string;
  tables: string[];
  isReadOnly: boolean;
}

export interface ReportResult {
  title: string;
  content: string;
  generatedAt: string;
  type: string;
}

export interface DebugResult {
  rootCause: string;
  fix: string;
  explanation: string;
  preventionTip: string;
}

export async function assessOrderRisk(
  orderId: string,
  orderData?: Record<string, unknown>
): Promise<OrderRiskResult> {
  const ask = getAsk();
  const examples = getExamplesForTaskType("order_analysis");

  const contextStr = orderData ? `\n\nנתוני הזמנה:\n${JSON.stringify(orderData, null, 2)}` : "";
  const examplesStr = examples
    .map((e, i) => `דוגמה ${i + 1}:\nקלט: ${e.input}\nפלט: ${e.output}`)
    .join("\n\n");

  const prompt = `נתח סיכון של הזמנה ${orderId}.${contextStr}

דוגמאות לפורמט הפלט:
${examplesStr}

החזר JSON בלבד עם השדות: riskScore (0-100), riskLevel (LOW/MEDIUM/HIGH/CRITICAL), factors (מערך), recommendation, biggestRisk.`;

  const result = await ask(prompt, { system: SYSTEM_PROMPTS.json_analyst });
  const parsed = extractJSON<OrderRiskResult>(result);

  if (!parsed) {
    return {
      riskScore: 50,
      riskLevel: "MEDIUM",
      factors: [{ factor: "לא ניתן לנתח — נתונים חסרים", weight: 50, severity: "MEDIUM" }],
      recommendation: "בדוק נתוני הזמנה ידנית",
      biggestRisk: "חוסר מידע לניתוח",
    };
  }

  return parsed;
}

export async function naturalToSQL(question: string): Promise<NaturalToSQLResult> {
  const askJSON = getAskJSON();
  const examples = getExamplesForTaskType("sql_generation");

  const examplesStr = examples
    .map((e, i) => `דוגמה ${i + 1}:\nשאלה: ${e.input}\nSQL: ${e.output}`)
    .join("\n\n");

  const prompt = `המר שאלה טבעית ל-SQL לקריאה בלבד (SELECT בלבד) עבור מסד הנתונים של מערכת ERP טכנו-כל עוזי.

שאלה: ${question}

דוגמאות:
${examplesStr}

כללים חשובים:
1. רק SELECT — בלי INSERT, UPDATE, DELETE, DROP, CREATE
2. השתמש בשמות טבלה אמיתיים (customers, sales_orders, raw_materials, employees וכו')
3. LIMIT 1000 תמיד
4. הוסף WHERE רלוונטי

החזר JSON עם השדות: sql (string), explanation (string בעברית), tables (string[]), isReadOnly (boolean).`;

  const result = await askJSON<NaturalToSQLResult>(prompt, { system: SYSTEM_PROMPTS.json_analyst });

  if (!result) {
    return {
      sql: "SELECT 1 -- שגיאה בהמרה",
      explanation: "לא ניתן להמיר את השאלה ל-SQL",
      tables: [],
      isReadOnly: true,
    };
  }

  const UNSAFE_PATTERN = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|EXECUTE|EXEC|CALL|MERGE|REPLACE|UPSERT)\b/i;
  const MUST_START_SELECT = /^\s*SELECT\b/i;

  if (UNSAFE_PATTERN.test(result.sql) || !MUST_START_SELECT.test(result.sql)) {
    console.warn("[naturalToSQL] Generated SQL contains unsafe tokens — rejecting:", result.sql.slice(0, 100));
    return {
      sql: "SELECT 1 -- SQL לא בטוח נדחה",
      explanation: "הSQL שנוצר נדחה מסיבות אבטחה. הבקשה חייבת להניב SELECT בלבד.",
      tables: [],
      isReadOnly: false,
    };
  }

  const sqlWithLimit = /\bLIMIT\b/i.test(result.sql)
    ? result.sql
    : result.sql.trimEnd().replace(/;?\s*$/, "") + " LIMIT 1000";

  result.sql = sqlWithLimit;
  result.isReadOnly = true;
  return result;
}

export async function generateReport(
  type: "inventory" | "sales" | "finance" | "hr" | "production" | string,
  filters?: Record<string, unknown>
): Promise<ReportResult> {
  const ask = getAsk();
  const examples = getExamplesForTaskType("report_formatting");

  const filtersStr = filters ? `\n\nפילטרים: ${JSON.stringify(filters, null, 2)}` : "";
  const examplesStr = examples
    .map((e, i) => `דוגמה ${i + 1}:\nבקשה: ${e.input}\nפלט: ${e.output}`)
    .join("\n\n");

  const typeLabels: Record<string, string> = {
    inventory: "מלאי",
    sales: "מכירות",
    finance: "כספים",
    hr: "משאבי אנוש",
    production: "ייצור",
  };

  const typeLabel = typeLabels[type] ?? type;

  const prompt = `צור דוח ${typeLabel} מקצועי למערכת ERP טכנו-כל עוזי.${filtersStr}

דוגמאות לפורמט:
${examplesStr}

הדוח צריך לכלול: כותרת, תאריך, נתונים בטבלה, סיכום, המלצות.
ענה בעברית עם פורמט Markdown.`;

  const content = await ask(prompt, { system: SYSTEM_PROMPTS.analyst });

  return {
    title: `דוח ${typeLabel} — ${new Date().toLocaleDateString("he-IL")}`,
    content,
    generatedAt: new Date().toISOString(),
    type,
  };
}

export async function debugError(
  error: string,
  code?: string
): Promise<DebugResult> {
  const askJSON = getAskJSON();
  const examples = getExamplesForTaskType("error_debugging");

  const codeStr = code ? `\n\nקוד:\n\`\`\`\n${code}\n\`\`\`` : "";
  const examplesStr = examples
    .map((e, i) => `דוגמה ${i + 1}:\nשגיאה: ${e.input}\nניתוח: ${e.output}`)
    .join("\n\n");

  const prompt = `נתח שגיאה:
${error}${codeStr}

דוגמאות:
${examplesStr}

החזר JSON עם: rootCause (string), fix (string — קוד TypeScript), explanation (string), preventionTip (string).`;

  const result = await askJSON<DebugResult>(prompt, { system: SYSTEM_PROMPTS.error_analyst });

  if (!result) {
    return {
      rootCause: "לא ניתן לנתח",
      fix: "// בדוק את השגיאה ידנית",
      explanation: "הניתוח האוטומטי נכשל",
      preventionTip: "הוסף טיפול בשגיאות מקיף",
    };
  }

  return result;
}
