/**
 * TechnoKoluzi ERP - Voice Engine (Frontend)
 * מנוע קולי: פקודות קוליות בעברית, הקראת תשובות AI
 *
 * Features:
 * - Hebrew voice recognition (Web Speech API)
 * - Voice command parsing ("הי קובי, ...")
 * - Dictation mode for notes/comments
 * - Text-to-Speech for AI responses
 * - Voice-activated navigation
 */

// ============== Types ==============

export interface VoiceCommand {
  raw: string;
  intent: "navigate" | "search" | "create" | "query" | "action" | "dictation" | "unknown";
  target?: string;
  params?: Record<string, string>;
}

export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

export type VoiceEventHandler = (event: {
  type: "state_change" | "transcript" | "command" | "error";
  data: any;
}) => void;

// ============== Voice Recognition ==============

let recognition: any = null;
let currentState: VoiceState = "idle";
let eventHandler: VoiceEventHandler | null = null;

const SpeechRecognition = typeof window !== "undefined"
  ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  : null;

/**
 * Initialize the voice engine.
 */
export function initVoiceEngine(handler: VoiceEventHandler): boolean {
  if (!SpeechRecognition) {
    console.warn("[VoiceEngine] Web Speech API not supported");
    return false;
  }

  eventHandler = handler;
  recognition = new SpeechRecognition();
  recognition.lang = "he-IL";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  recognition.onstart = () => {
    setState("listening");
  };

  recognition.onresult = (event: any) => {
    const last = event.results[event.results.length - 1];
    const transcript = last[0].transcript;
    const isFinal = last.isFinal;

    eventHandler?.({
      type: "transcript",
      data: { text: transcript, isFinal, confidence: last[0].confidence },
    });

    if (isFinal) {
      const command = parseCommand(transcript);
      eventHandler?.({ type: "command", data: command });
    }
  };

  recognition.onerror = (event: any) => {
    setState("error");
    eventHandler?.({ type: "error", data: { error: event.error } });
  };

  recognition.onend = () => {
    if (currentState === "listening") {
      setState("idle");
    }
  };

  return true;
}

/**
 * Start listening for voice input.
 */
export function startListening(): boolean {
  if (!recognition) return false;
  try {
    recognition.start();
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop listening.
 */
export function stopListening() {
  if (recognition) {
    try { recognition.stop(); } catch {}
  }
  setState("idle");
}

function setState(state: VoiceState) {
  currentState = state;
  eventHandler?.({ type: "state_change", data: { state } });
}

export function getVoiceState(): VoiceState {
  return currentState;
}

// ============== Command Parsing ==============

const WAKE_WORDS = ["הי קובי", "קובי", "היי קובי", "שלום קובי"];

const NAVIGATION_MAP: Record<string, string> = {
  "דשבורד": "/",
  "לוח בקרה": "/",
  "לקוחות": "/sales/customers",
  "ספקים": "/procurement/suppliers",
  "חשבוניות": "/finance/invoices",
  "הזמנות": "/sales/orders",
  "עובדים": "/hr/employees",
  "מלאי": "/procurement/raw-materials",
  "ייצור": "/production",
  "פרויקטים": "/projects",
  "דוחות": "/reports",
  "הגדרות": "/settings",
  "צאט": "/ai-engine/kobi-terminal",
  "בילדר": "/builder",
  "כספים": "/finance",
  "משאבי אנוש": "/hr",
  "רכש": "/procurement",
  "מכירות": "/sales",
};

/**
 * Parse a voice transcript into a structured command.
 */
export function parseCommand(transcript: string): VoiceCommand {
  let text = transcript.trim();

  // Remove wake word
  for (const wake of WAKE_WORDS) {
    if (text.startsWith(wake)) {
      text = text.slice(wake.length).trim();
      // Remove connecting words
      text = text.replace(/^(בוא |תן |תראה |לי |את |ה)/, "").trim();
      break;
    }
  }

  const lower = text;

  // Navigation commands
  if (lower.includes("תעבור ל") || lower.includes("פתח") || lower.includes("לך ל") || lower.includes("נווט ל")) {
    for (const [keyword, path] of Object.entries(NAVIGATION_MAP)) {
      if (lower.includes(keyword)) {
        return { raw: transcript, intent: "navigate", target: path, params: { page: keyword } };
      }
    }
  }

  // Direct page name
  for (const [keyword, path] of Object.entries(NAVIGATION_MAP)) {
    if (lower === keyword || lower === `ה${keyword}`) {
      return { raw: transcript, intent: "navigate", target: path, params: { page: keyword } };
    }
  }

  // Search commands
  if (lower.includes("חפש") || lower.includes("מצא") || lower.includes("תחפש")) {
    const searchTerm = lower.replace(/^(חפש|מצא|תחפש)\s*/, "").trim();
    return { raw: transcript, intent: "search", target: searchTerm };
  }

  // Create commands
  if (lower.includes("צור") || lower.includes("הוסף") || lower.includes("תיצור") || lower.includes("חדש")) {
    return { raw: transcript, intent: "create", target: text };
  }

  // Query commands (questions)
  if (lower.includes("מה") || lower.includes("כמה") || lower.includes("איפה") || lower.includes("מתי") || lower.includes("מי")) {
    return { raw: transcript, intent: "query", target: text };
  }

  // Action commands
  if (lower.includes("שלח") || lower.includes("עדכן") || lower.includes("מחק") || lower.includes("אשר")) {
    return { raw: transcript, intent: "action", target: text };
  }

  // Default: treat as dictation or query
  return { raw: transcript, intent: text.length > 20 ? "dictation" : "query", target: text };
}

// ============== Text-to-Speech ==============

/**
 * Speak text using browser TTS (no API needed).
 */
export function speak(text: string, options?: { rate?: number; pitch?: number; voice?: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error("TTS not supported"));
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "he-IL";
    utterance.rate = options?.rate || 1.0;
    utterance.pitch = options?.pitch || 1.0;

    // Try to find Hebrew voice
    const voices = window.speechSynthesis.getVoices();
    const hebrewVoice = voices.find(v => v.lang.startsWith("he"));
    if (hebrewVoice) utterance.voice = hebrewVoice;

    utterance.onstart = () => setState("speaking");
    utterance.onend = () => {
      setState("idle");
      resolve();
    };
    utterance.onerror = (e) => {
      setState("error");
      reject(e);
    };

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Stop speaking.
 */
export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (currentState === "speaking") setState("idle");
}

// ============== Voice Engine Status ==============

export function isVoiceSupported(): boolean {
  return !!SpeechRecognition;
}

export function isTTSSupported(): boolean {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}

export function getAvailableVoices(): Array<{ name: string; lang: string }> {
  if (!window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices()
    .filter(v => v.lang.startsWith("he") || v.lang.startsWith("en"))
    .map(v => ({ name: v.name, lang: v.lang }));
}
