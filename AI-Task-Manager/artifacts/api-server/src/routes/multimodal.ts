/**
 * TechnoKoluzi ERP - Multi-Modal AI API Routes
 * נתיבי API ל-Vision, Voice, OCR
 */

import { Router } from "express";
import { analyzeImage, processDocument, transcribeVoice, textToSpeech, processMultiModalInput } from "../lib/multimodal-ai";

const router = Router();

/** POST /api/multimodal/vision - ניתוח תמונה */
router.post("/vision", async (req, res, next) => {
  try {
    const { image, mediaType, context } = req.body;
    if (!image) return res.status(400).json({ error: "image (base64) נדרש" });
    const result = await analyzeImage(image, mediaType || "image/jpeg", context);
    res.json(result);
  } catch (e) { next(e); }
});

/** POST /api/multimodal/document - עיבוד מסמך מלא (Vision + OCR + יצירת רשומה) */
router.post("/document", async (req, res, next) => {
  try {
    const { image, mediaType, autoCreate, targetTable, userId } = req.body;
    if (!image) return res.status(400).json({ error: "image (base64) נדרש" });
    const result = await processDocument(image, mediaType || "image/jpeg", { autoCreate, targetTable, userId });
    res.json(result);
  } catch (e) { next(e); }
});

/** POST /api/multimodal/voice - תמלול קול */
router.post("/voice", async (req, res, next) => {
  try {
    const { audio, format } = req.body;
    if (!audio) return res.status(400).json({ error: "audio (base64) נדרש" });
    const result = await transcribeVoice(audio, format || "webm");
    res.json(result);
  } catch (e) { next(e); }
});

/** POST /api/multimodal/tts - טקסט לדיבור */
router.post("/tts", async (req, res, next) => {
  try {
    const { text, voice } = req.body;
    if (!text) return res.status(400).json({ error: "text נדרש" });
    const result = await textToSpeech(text, voice || "alloy");
    if (!result) return res.status(503).json({ error: "TTS לא זמין - OPENAI_API_KEY לא מוגדר" });
    res.json(result);
  } catch (e) { next(e); }
});

/** POST /api/multimodal/process - עיבוד כללי (auto-detect type) */
router.post("/process", async (req, res, next) => {
  try {
    const result = await processMultiModalInput(req.body);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
