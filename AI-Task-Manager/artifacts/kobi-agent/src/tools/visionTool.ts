import * as fs from "fs";
import * as path from "path";
import { callLLMWithVision, callLLMWithMultipleImages } from "../llm/client";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

function getMediaType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
  };
  return map[ext] || "image/png";
}

function resolveImagePath(imagePath: string): string {
  if (path.isAbsolute(imagePath)) return imagePath;
  return path.resolve(WORKSPACE, imagePath);
}

function loadImageAsBase64(imagePath: string): { base64: string; mediaType: string } {
  const resolved = resolveImagePath(imagePath);
  if (!fs.existsSync(resolved)) throw new Error(`Image not found: ${resolved}`);
  const buffer = fs.readFileSync(resolved);
  const maxSize = 20 * 1024 * 1024;
  if (buffer.length > maxSize) throw new Error(`Image too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Max 20MB`);
  return { base64: buffer.toString("base64"), mediaType: getMediaType(resolved) };
}

function extractText(content: Array<{ type: string; text?: string }>): string {
  return content.filter(b => b.type === "text").map(b => b.text || "").join("\n");
}

export async function analyzeImage(params: { imagePath: string; prompt?: string }): Promise<{ success: boolean; output: string }> {
  try {
    const { base64, mediaType } = loadImageAsBase64(params.imagePath);
    const prompt = params.prompt || "נתח את התמונה בפירוט. תאר מה אתה רואה, כולל טקסט, עיצוב, צבעים, פריסה, ואלמנטים חשובים. ענה בעברית.";
    const result = await callLLMWithVision({
      system: "אתה מנתח תמונות מומחה. נתח תמונות בפירוט רב, כולל טקסט, עיצוב, מבנה, צבעים, ואלמנטים ויזואליים. ענה תמיד בעברית.",
      imageBase64: base64,
      mediaType,
      prompt,
    });
    return { success: true, output: extractText(result.content) };
  } catch (err: any) {
    return { success: false, output: `Error analyzing image: ${err.message}` };
  }
}

export async function extractTextFromImage(params: { imagePath: string; language?: string }): Promise<{ success: boolean; output: string; extractedText?: string }> {
  try {
    const { base64, mediaType } = loadImageAsBase64(params.imagePath);
    const lang = params.language || "Hebrew and English";
    const result = await callLLMWithVision({
      system: "אתה מומחה OCR. חלץ את כל הטקסט מהתמונה בצורה מדויקת. שמור על המבנה והפורמט המקורי.",
      imageBase64: base64,
      mediaType,
      prompt: `חלץ את כל הטקסט הנראה בתמונה הזו. שפות צפויות: ${lang}. שמור על סדר הקריאה, מבנה, ופורמט מקורי. אם יש טבלאות — שמור על מבנה טבלאי. החזר את הטקסט בלבד, ללא הסברים נוספים.`,
    });
    const text = extractText(result.content);
    return { success: true, output: text, extractedText: text };
  } catch (err: any) {
    return { success: false, output: `Error extracting text: ${err.message}` };
  }
}

export async function analyzeUIScreenshot(params: { imagePath: string; context?: string }): Promise<{ success: boolean; output: string }> {
  try {
    const { base64, mediaType } = loadImageAsBase64(params.imagePath);
    const ctx = params.context ? `\nהקשר נוסף: ${params.context}` : "";
    const result = await callLLMWithVision({
      system: "אתה מומחה UX/UI. נתח צילומי מסך של ממשקים ותן משוב מפורט על עיצוב, שימושיות, נגישות, ובעיות פוטנציאליות. ענה בעברית.",
      imageBase64: base64,
      mediaType,
      prompt: `נתח את צילום המסך הזה כמומחה UX/UI. תן ניתוח מפורט של:${ctx}

1. **פריסה ומבנה** — האם הפריסה ברורה ולוגית?
2. **היררכיה חזותית** — האם יש סדר עדיפויות ברור?
3. **צבעים וניגודיות** — האם הצבעים מתאימים? ניגודיות מספקת?
4. **טיפוגרפיה** — גדלים, פונטים, קריאות
5. **RTL** — האם יש בעיות בתמיכת RTL?
6. **רספונסיביות** — האם נראה שיעבוד במסכים שונים?
7. **נגישות** — בעיות נגישות פוטנציאליות
8. **שיפורים** — הצעות ספציפיות לשיפור

ענה בעברית.`,
    });
    return { success: true, output: extractText(result.content) };
  } catch (err: any) {
    return { success: false, output: `Error analyzing UI: ${err.message}` };
  }
}

export async function compareImages(params: { imagePaths: string[]; prompt?: string }): Promise<{ success: boolean; output: string }> {
  try {
    if (params.imagePaths.length < 2) return { success: false, output: "At least 2 images required for comparison" };
    if (params.imagePaths.length > 5) return { success: false, output: "Maximum 5 images for comparison" };
    const images = params.imagePaths.map(p => loadImageAsBase64(p));
    const prompt = params.prompt || "השווה בין התמונות. מצא דמיון, הבדלים, ותן ניתוח מפורט. ענה בעברית.";
    const result = await callLLMWithMultipleImages({
      system: "אתה מומחה בניתוח והשוואת תמונות. השווה תמונות בפירוט רב ותן ניתוח מקיף. ענה בעברית.",
      images: images.map(img => ({ base64: img.base64, mediaType: img.mediaType })),
      prompt: `${prompt}\n\nמספר תמונות להשוואה: ${images.length}`,
    });
    return { success: true, output: extractText(result.content) };
  } catch (err: any) {
    return { success: false, output: `Error comparing images: ${err.message}` };
  }
}

export async function analyzeDocument(params: { imagePath: string; documentType?: string }): Promise<{ success: boolean; output: string }> {
  try {
    const { base64, mediaType } = loadImageAsBase64(params.imagePath);
    const docType = params.documentType || "מסמך כללי";
    const result = await callLLMWithVision({
      system: "אתה מומחה בניתוח מסמכים עסקיים. חלץ מידע מובנה מתמונות של מסמכים כגון חשבוניות, הזמנות, תעודות, דוחות וכו'. ענה בעברית.",
      imageBase64: base64,
      mediaType,
      prompt: `נתח את המסמך הזה (סוג: ${docType}). חלץ את כל המידע המובנה:

1. **סוג המסמך** — זיהוי סוג המסמך
2. **נתונים עיקריים** — תאריכים, מספרים, שמות, סכומים
3. **טבלאות** — אם יש טבלאות, חלץ את הנתונים בפורמט טבלאי
4. **סיכום** — תקציר המסמך
5. **פעולות נדרשות** — אם יש פעולות הנדרשות מהמסמך

אם זו חשבונית — חלץ: מספר חשבונית, תאריך, ספק/לקוח, פריטים, סכומים, מע"מ, סה"כ.
אם זו הזמנה — חלץ: מספר הזמנה, פריטים, כמויות, מחירים.

ענה בעברית בפורמט מובנה.`,
    });
    return { success: true, output: extractText(result.content) };
  } catch (err: any) {
    return { success: false, output: `Error analyzing document: ${err.message}` };
  }
}

export async function analyzeChartOrDiagram(params: { imagePath: string }): Promise<{ success: boolean; output: string }> {
  try {
    const { base64, mediaType } = loadImageAsBase64(params.imagePath);
    const result = await callLLMWithVision({
      system: "אתה מומחה בניתוח גרפים, תרשימים ודיאגרמות. תרגם ויזואליזציות לנתונים ותובנות. ענה בעברית.",
      imageBase64: base64,
      mediaType,
      prompt: `נתח את הגרף/תרשים/דיאגרמה בתמונה:

1. **סוג** — מה סוג הוויזואליזציה? (עוגה, עמודות, קווי, זרימה, ER, ארגוני וכו')
2. **נתונים** — מה הנתונים המוצגים? חלץ ערכים מספריים אם אפשר
3. **צירים/מקרא** — מה מייצג כל ציר או צבע
4. **מגמות** — מה המגמות או הדפוסים הבולטים
5. **תובנות** — מסקנות עיקריות מהנתונים
6. **נתונים בפורמט JSON** — אם אפשר לחלץ, תן JSON עם הנתונים

ענה בעברית.`,
    });
    return { success: true, output: extractText(result.content) };
  } catch (err: any) {
    return { success: false, output: `Error analyzing chart: ${err.message}` };
  }
}

export async function analyzeErrorScreenshot(params: { imagePath: string }): Promise<{ success: boolean; output: string }> {
  try {
    const { base64, mediaType } = loadImageAsBase64(params.imagePath);
    const result = await callLLMWithVision({
      system: "אתה מומחה DevOps ודיבאגינג. נתח צילומי מסך של שגיאות ותן פתרונות. ענה בעברית.",
      imageBase64: base64,
      mediaType,
      prompt: `נתח את צילום המסך של השגיאה:

1. **סוג השגיאה** — מה סוג השגיאה? (runtime, build, network, DB, auth וכו')
2. **הודעת השגיאה** — חלץ את הודעת השגיאה המלאה
3. **Stack Trace** — אם יש stack trace, חלץ אותו
4. **סיבה** — מה הסיבה הסבירה לשגיאה
5. **פתרון** — הצע פתרון ספציפי עם קוד אם צריך
6. **מניעה** — איך למנוע שגיאה דומה בעתיד

ענה בעברית.`,
    });
    return { success: true, output: extractText(result.content) };
  } catch (err: any) {
    return { success: false, output: `Error analyzing error screenshot: ${err.message}` };
  }
}

export async function describeImageForAlt(params: { imagePath: string }): Promise<{ success: boolean; output: string; altText?: string }> {
  try {
    const { base64, mediaType } = loadImageAsBase64(params.imagePath);
    const result = await callLLMWithVision({
      system: "Generate concise, descriptive alt text for images. Keep it short but meaningful for accessibility.",
      imageBase64: base64,
      mediaType,
      prompt: "Generate alt text for this image in both Hebrew and English. Keep each version under 125 characters. Format:\nHE: [Hebrew alt text]\nEN: [English alt text]",
    });
    const text = extractText(result.content);
    return { success: true, output: text, altText: text };
  } catch (err: any) {
    return { success: false, output: `Error generating alt text: ${err.message}` };
  }
}

export async function analyzeImageFromBase64(params: { base64: string; mediaType?: string; prompt?: string }): Promise<{ success: boolean; output: string }> {
  try {
    const mediaType = params.mediaType || "image/png";
    const prompt = params.prompt || "נתח את התמונה בפירוט. תאר מה אתה רואה. ענה בעברית.";
    const result = await callLLMWithVision({
      system: "אתה מנתח תמונות מומחה. נתח תמונות בפירוט רב. ענה תמיד בעברית.",
      imageBase64: params.base64,
      mediaType,
      prompt,
    });
    return { success: true, output: extractText(result.content) };
  } catch (err: any) {
    return { success: false, output: `Error: ${err.message}` };
  }
}

export async function analyzeImageFromURL(params: { url: string; prompt?: string }): Promise<{ success: boolean; output: string }> {
  try {
    const response = await fetch(params.url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/png";
    const base64 = buffer.toString("base64");
    const prompt = params.prompt || "נתח את התמונה בפירוט. תאר מה אתה רואה. ענה בעברית.";
    const result = await callLLMWithVision({
      system: "אתה מנתח תמונות מומחה. נתח תמונות בפירוט רב. ענה תמיד בעברית.",
      imageBase64: base64,
      mediaType: contentType,
      prompt,
    });
    return { success: true, output: extractText(result.content) };
  } catch (err: any) {
    return { success: false, output: `Error: ${err.message}` };
  }
}

export const VISION_TOOLS = [
  {
    name: "analyze_image",
    description: "ניתוח תמונה מקובץ — זיהוי תוכן, טקסט, עיצוב, צבעים, אלמנטים ויזואליים",
    input_schema: { type: "object" as const, properties: { imagePath: { type: "string", description: "Path to image file" }, prompt: { type: "string", description: "Custom analysis prompt (optional)" } }, required: ["imagePath"] as string[] },
  },
  {
    name: "extract_text_from_image",
    description: "OCR — חילוץ טקסט מתמונה. תומך בעברית ואנגלית. שומר על מבנה טבלאות",
    input_schema: { type: "object" as const, properties: { imagePath: { type: "string", description: "Path to image file" }, language: { type: "string", description: "Expected languages (default: Hebrew and English)" } }, required: ["imagePath"] as string[] },
  },
  {
    name: "analyze_ui_screenshot",
    description: "ניתוח UX/UI של צילום מסך — פריסה, צבעים, RTL, נגישות, הצעות שיפור",
    input_schema: { type: "object" as const, properties: { imagePath: { type: "string", description: "Path to screenshot" }, context: { type: "string", description: "Additional context about the UI" } }, required: ["imagePath"] as string[] },
  },
  {
    name: "compare_images",
    description: "השוואה בין 2-5 תמונות — מציאת דמיון, הבדלים, ניתוח מפורט",
    input_schema: { type: "object" as const, properties: { imagePaths: { type: "array", items: { type: "string" }, description: "Array of image paths (2-5)" }, prompt: { type: "string", description: "Custom comparison prompt" } }, required: ["imagePaths"] as string[] },
  },
  {
    name: "analyze_document",
    description: "ניתוח מסמך עסקי (חשבונית, הזמנה, תעודה) — חילוץ נתונים מובנים",
    input_schema: { type: "object" as const, properties: { imagePath: { type: "string", description: "Path to document image" }, documentType: { type: "string", description: "Document type: חשבונית, הזמנה, תעודת משלוח, דוח" } }, required: ["imagePath"] as string[] },
  },
  {
    name: "analyze_chart",
    description: "ניתוח גרף/תרשים/דיאגרמה — חילוץ נתונים, מגמות, תובנות, JSON",
    input_schema: { type: "object" as const, properties: { imagePath: { type: "string", description: "Path to chart/diagram image" } }, required: ["imagePath"] as string[] },
  },
  {
    name: "analyze_error_screenshot",
    description: "ניתוח צילום מסך של שגיאה — זיהוי סוג, סיבה, פתרון מוצע",
    input_schema: { type: "object" as const, properties: { imagePath: { type: "string", description: "Path to error screenshot" } }, required: ["imagePath"] as string[] },
  },
  {
    name: "describe_image_for_alt",
    description: "יצירת alt text נגיש לתמונה בעברית ואנגלית",
    input_schema: { type: "object" as const, properties: { imagePath: { type: "string", description: "Path to image file" } }, required: ["imagePath"] as string[] },
  },
  {
    name: "analyze_image_base64",
    description: "ניתוח תמונה מ-base64 string — כשהתמונה מגיעה מ-API או upload",
    input_schema: { type: "object" as const, properties: { base64: { type: "string", description: "Base64 encoded image data" }, mediaType: { type: "string", description: "MIME type (default: image/png)" }, prompt: { type: "string", description: "Custom analysis prompt" } }, required: ["base64"] as string[] },
  },
  {
    name: "analyze_image_url",
    description: "ניתוח תמונה מ-URL — הורדה וניתוח אוטומטי",
    input_schema: { type: "object" as const, properties: { url: { type: "string", description: "Image URL" }, prompt: { type: "string", description: "Custom analysis prompt" } }, required: ["url"] as string[] },
  },
];
