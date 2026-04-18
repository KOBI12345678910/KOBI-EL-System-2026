/**
 * TechnoKoluzi ERP - Multi-Modal AI Engine
 * מנוע AI רב-מודלי: Vision (תמונות), Voice (קול), OCR (מסמכים)
 *
 * Features:
 * - Vision: Analyze photos of invoices, products, damage reports
 * - OCR: Extract text from document images → auto-create ERP records
 * - Voice-to-Text: Hebrew speech recognition (Web Speech API + Whisper fallback)
 * - Text-to-Speech: AI responses read aloud in Hebrew
 * - Document Classification: Auto-detect document type and route to correct module
 */

import { pool } from "@workspace/db";

// ============== Types ==============

export interface VisionAnalysis {
  description: string;
  documentType?: "invoice" | "receipt" | "delivery_note" | "purchase_order" | "quote" | "contract" | "id_card" | "photo" | "blueprint" | "unknown";
  extractedFields: Record<string, any>;
  confidence: number;
  rawText?: string;
  suggestedAction?: string;
  erpModule?: string;
}

export interface OCRResult {
  fullText: string;
  blocks: Array<{
    text: string;
    confidence: number;
    boundingBox?: { x: number; y: number; width: number; height: number };
  }>;
  language: string;
  documentType: string;
}

export interface VoiceTranscription {
  text: string;
  language: string;
  confidence: number;
  duration: number;
  segments?: Array<{ text: string; start: number; end: number }>;
}

export interface DocumentProcessingResult {
  visionAnalysis: VisionAnalysis;
  ocrResult?: OCRResult;
  extractedRecord?: Record<string, any>;
  suggestedTable?: string;
  autoCreated?: boolean;
  recordId?: number;
}

// ============== Vision Analysis ==============

/**
 * Analyze an image using Claude Vision API.
 * Supports: invoices, receipts, products, damage photos, blueprints
 */
export async function analyzeImage(
  imageBase64: string,
  mediaType: string = "image/jpeg",
  context?: string
): Promise<VisionAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY לא מוגדר");

  const systemPrompt = `אתה מנתח מסמכים ותמונות עבור מערכת ERP של מפעל מתכת/אלומיניום בישראל.
נתח את התמונה וספק:
1. תיאור מה שנראה בתמונה
2. סוג המסמך (חשבונית, קבלה, תעודת משלוח, הזמנה, הצעת מחיר, חוזה, תעודה, צילום, שרטוט)
3. שדות שחולצו (מספר מסמך, תאריך, סכום, שם ספק/לקוח, פריטים, כתובת וכו')
4. רמת ביטחון (0-1)
5. הצעה לפעולה ב-ERP (יצירת רשומה, עדכון מלאי, וכו')
6. באיזה מודול ב-ERP לנתב (finance, inventory, procurement, sales, hr, production)

ענה בפורמט JSON בלבד.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          {
            type: "text",
            text: context || "נתח את התמונה הזו והחזר JSON עם כל המידע שחולץ",
          },
        ],
      }],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vision API error: ${res.status} ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as any;
  const textContent = data.content?.find((b: any) => b.type === "text")?.text || "";

  // Parse JSON response
  try {
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        description: parsed.description || parsed.תיאור || textContent.slice(0, 500),
        documentType: mapDocumentType(parsed.documentType || parsed.סוג_מסמך || "unknown"),
        extractedFields: parsed.extractedFields || parsed.שדות || {},
        confidence: parsed.confidence || parsed.ביטחון || 0.5,
        rawText: parsed.rawText || parsed.טקסט_גולמי,
        suggestedAction: parsed.suggestedAction || parsed.פעולה_מוצעת,
        erpModule: parsed.erpModule || parsed.מודול,
      };
    }
  } catch {}

  return {
    description: textContent.slice(0, 500),
    documentType: "unknown",
    extractedFields: {},
    confidence: 0.3,
    rawText: textContent,
  };
}

function mapDocumentType(type: string): VisionAnalysis["documentType"] {
  const map: Record<string, VisionAnalysis["documentType"]> = {
    invoice: "invoice", חשבונית: "invoice",
    receipt: "receipt", קבלה: "receipt",
    delivery_note: "delivery_note", תעודת_משלוח: "delivery_note",
    purchase_order: "purchase_order", הזמנת_רכש: "purchase_order",
    quote: "quote", הצעת_מחיר: "quote",
    contract: "contract", חוזה: "contract",
    id_card: "id_card", תעודה: "id_card",
    photo: "photo", צילום: "photo",
    blueprint: "blueprint", שרטוט: "blueprint",
  };
  return map[type] || "unknown";
}

// ============== Smart Document Processing ==============

/**
 * Full document processing pipeline:
 * Image → Vision Analysis → OCR → Field Extraction → ERP Record Creation
 */
export async function processDocument(
  imageBase64: string,
  mediaType: string = "image/jpeg",
  options: {
    autoCreate?: boolean;
    targetTable?: string;
    userId?: string;
  } = {}
): Promise<DocumentProcessingResult> {
  // Step 1: Vision Analysis
  const visionAnalysis = await analyzeImage(imageBase64, mediaType);

  const result: DocumentProcessingResult = {
    visionAnalysis,
    suggestedTable: getTargetTable(visionAnalysis.documentType || "unknown"),
  };

  // Step 2: Extract structured record from analysis
  if (visionAnalysis.extractedFields && Object.keys(visionAnalysis.extractedFields).length > 0) {
    result.extractedRecord = visionAnalysis.extractedFields;
  }

  // Step 3: Auto-create record if enabled
  if (options.autoCreate && result.extractedRecord && result.suggestedTable) {
    try {
      const targetTable = options.targetTable || result.suggestedTable;
      const record = result.extractedRecord;

      // Add audit fields
      record.created_by = options.userId || "ai-agent";
      record.source = "ai-document-processing";
      record.ai_confidence = visionAnalysis.confidence;

      const fields = Object.keys(record);
      const values = Object.values(record);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");

      const insertRes = await pool.query(
        `INSERT INTO "${targetTable}" (${fields.map(f => `"${f}"`).join(", ")}) VALUES (${placeholders}) RETURNING id`,
        values
      );

      result.autoCreated = true;
      result.recordId = insertRes.rows[0]?.id;
    } catch (e: any) {
      console.warn(`[MultiModal] Auto-create failed: ${e.message}`);
      result.autoCreated = false;
    }
  }

  // Log processing
  try {
    await pool.query(
      `INSERT INTO ai_agent_logs (rule_id, rule_name, action, status, details, affected_records)
       VALUES ('document-processing', 'עיבוד מסמך AI', $1, 'success', $2, $3)`,
      [
        visionAnalysis.documentType || "unknown",
        `סוג: ${visionAnalysis.documentType}, ביטחון: ${(visionAnalysis.confidence * 100).toFixed(0)}%, שדות: ${Object.keys(visionAnalysis.extractedFields).length}`,
        result.autoCreated ? 1 : 0,
      ]
    );
  } catch {}

  return result;
}

function getTargetTable(docType: string): string | undefined {
  const tableMap: Record<string, string> = {
    invoice: "customer_invoices",
    receipt: "payments",
    delivery_note: "delivery_notes",
    purchase_order: "purchase_orders",
    quote: "quotations",
    contract: "contracts",
    blueprint: "production_blueprints",
  };
  return tableMap[docType];
}

// ============== Voice Processing ==============

/**
 * Process voice audio using Whisper API (OpenAI-compatible).
 * Falls back to returning empty if no API key.
 */
export async function transcribeVoice(
  audioBase64: string,
  audioFormat: string = "webm"
): Promise<VoiceTranscription> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.WHISPER_API_KEY;

  if (!apiKey) {
    // Return indication to use browser Web Speech API
    return {
      text: "",
      language: "he",
      confidence: 0,
      duration: 0,
      segments: [],
    };
  }

  const baseUrl = process.env.WHISPER_BASE_URL || "https://api.openai.com/v1";

  // Convert base64 to Blob for form data
  const audioBuffer = Buffer.from(audioBase64, "base64");
  const blob = new Blob([audioBuffer], { type: `audio/${audioFormat}` });

  const formData = new FormData();
  formData.append("file", blob, `audio.${audioFormat}`);
  formData.append("model", process.env.WHISPER_MODEL || "whisper-1");
  formData.append("language", "he");
  formData.append("response_format", "verbose_json");

  const res = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    throw new Error(`Whisper API error: ${res.status}`);
  }

  const data = (await res.json()) as any;

  return {
    text: data.text || "",
    language: data.language || "he",
    confidence: data.segments?.[0]?.avg_logprob ? Math.exp(data.segments[0].avg_logprob) : 0.8,
    duration: data.duration || 0,
    segments: data.segments?.map((s: any) => ({
      text: s.text,
      start: s.start,
      end: s.end,
    })),
  };
}

/**
 * Text-to-Speech using OpenAI TTS API.
 * Returns base64-encoded audio.
 */
export async function textToSpeech(
  text: string,
  voice: string = "alloy"
): Promise<{ audioBase64: string; format: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.TTS_BASE_URL || "https://api.openai.com/v1";

  const res = await fetch(`${baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.TTS_MODEL || "tts-1",
      input: text,
      voice,
      response_format: "mp3",
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) return null;

  const buffer = await res.arrayBuffer();
  return {
    audioBase64: Buffer.from(buffer).toString("base64"),
    format: "mp3",
  };
}

// ============== Multi-Modal Routes Helper ==============

export async function processMultiModalInput(input: {
  type: "image" | "voice" | "document";
  data: string; // base64
  mediaType?: string;
  context?: string;
  autoCreate?: boolean;
  userId?: string;
}): Promise<Record<string, any>> {
  switch (input.type) {
    case "image":
      return await analyzeImage(input.data, input.mediaType || "image/jpeg", input.context);

    case "document":
      return await processDocument(input.data, input.mediaType || "image/jpeg", {
        autoCreate: input.autoCreate,
        userId: input.userId,
      });

    case "voice":
      return await transcribeVoice(input.data, input.mediaType || "webm");

    default:
      throw new Error(`סוג קלט לא נתמך: ${input.type}`);
  }
}
