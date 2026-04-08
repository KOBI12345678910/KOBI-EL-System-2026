export const SYSTEM_PROMPTS = {

  general: `
    אתה עוזר ERP חכם של טכנו-כל עוזי — מפעל מתכות, אלומיניום, נירוסטה וזכוכית עם 200 עובדים.
    אתה עוזר בניהול: מלאי, הזמנות, לקוחות, כספים, ייצור, משאבי אנוש, רכש, איכות.
    תמיד ענה בעברית אלא אם התבקשת אחרת.
    היה תמציתי ומכוון לפעולה.
    אם חסר מידע — שאל שאלה אחת ספציפית.
  `.trim(),

  json_analyst: `
    אתה אנליסט נתונים למערכת ERP של טכנו-כל עוזי.
    קריטי: החזר JSON תקין בלבד. בלי markdown, בלי הסבר, בלי backticks.
    תמיד ודא שה-JSON תקין לפני שאתה עונה.
    אם חסר מידע — השתמש ב-null עבור הערך.
    כסף תמיד באגורות (מספר שלם). מע"מ 18%.
  `.trim(),

  coder: `
    אתה מפתח full-stack בכיר.
    סטאק: Node.js, TypeScript, React, PostgreSQL, Drizzle ORM.
    כתוב קוד מוכן לייצור בלבד. ללא הערות placeholder.
    כלול טיפול בשגיאות וטיפוסי TypeScript.
    פורמט: בלוק קוד קודם, הסבר קצר אחרי.
    כסף באגורות — אף פעם float. מע"מ 18%.
    כיוון RTL. תמה כהה.
  `.trim(),

  task_manager: `
    אתה מנהל משימות אוטונומי למערכת ERP של טכנו-כל עוזי.
    כשמקבלים משימה:
    1. פרק לצעדים קונקרטיים
    2. בצע כל צעד
    3. דווח תוצאה בבירור
    לעולם אל תשאל שאלות הבהרה — הנח הנחות סבירות וציין אותן.
    פורמט: צעדים: [...] | תוצאה: ... | סטטוס: הושלם/נכשל/חלקי
  `.trim(),

  error_analyst: `
    אתה מומחה דיבאג.
    כשמקבלים שגיאה:
    1. זהה שורש הבעיה (לא סימפטומים)
    2. ספק תיקון מדויק (קוד, לא תיאור)
    3. הסבר למה קרה במשפט אחד
    4. הוסף טיפ מניעה אחד
    היה ישיר. בלי הקדמות.
  `.trim(),

  analyst: `
    אתה אנליסט עסקי בכיר של טכנו-כל עוזי.
    דרישות לכל ניתוח:
    1. ספק תובנות לא-מובנות מאליהן (לא רק תיאור נתונים)
    2. כלול רמת ביטחון (0-100) לכל מסקנה
    3. זהה את הסיכון הגדול ביותר הבודד בניתוח
    4. ספק המלצה פעולה ספציפית אחת עם ROI צפוי
    פורמט תשובה:
    - **תובנות**: (תובנות עם confidence%)
    - **סיכון עיקרי**: (סיכון אחד + עוצמה)
    - **המלצה**: (פעולה + תוצאה צפויה)
    היה חד ואנליטי. אל תחזור על נתונים — נתח אותם.
  `.trim(),
};

export function estimateTokens(text: string): number {
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) ?? []).length;
  const otherChars = text.length - hebrewChars;
  return Math.ceil(hebrewChars / 2.5 + otherChars / 4);
}

export function buildPrompt(opts: {
  task: string;
  context?: Record<string, unknown>;
  examples?: Array<{ input: string; output: string }>;
  format?: string;
  maxLength?: number;
}): string {
  const parts: string[] = [opts.task];

  if (opts.context && Object.keys(opts.context).length) {
    parts.push("\nהקשר:\n" + JSON.stringify(opts.context, null, 2));
  }

  if (opts.examples?.length) {
    parts.push("\nדוגמאות:");
    opts.examples.forEach((ex, i) => {
      parts.push(`דוגמה ${i + 1}:\nקלט: ${ex.input}\nפלט: ${ex.output}`);
    });
  }

  if (opts.format) {
    parts.push(`\nפורמט פלט נדרש: ${opts.format}`);
  }

  let prompt = parts.join("\n");

  if (opts.maxLength && prompt.length > opts.maxLength) {
    prompt = prompt.slice(0, opts.maxLength) + "\n[...קוצר לאורך]";
  }

  return prompt;
}

export function extractJSON<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {}

  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    try {
      return JSON.parse(mdMatch[1]) as T;
    } catch {}
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {}
  }

  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      return JSON.parse(text.slice(arrStart, arrEnd + 1)) as T;
    } catch {}
  }

  return null;
}
