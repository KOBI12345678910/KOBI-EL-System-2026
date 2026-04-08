import * as Speech from "expo-speech";
import { router } from "expo-router";

export interface VoiceCommand {
  keywords: string[];
  label: string;
  description: string;
  category: "warehouse" | "production" | "crm" | "navigation" | "general";
  action: () => void;
}

const COMMANDS: VoiceCommand[] = [
  {
    keywords: ["קבלת סחורה", "קבלה", "קבלת חומרים"],
    label: "קבלת סחורה",
    description: "פתיחת מסך קבלת סחורה למחסן",
    category: "warehouse",
    action: () => router.push("/warehouse/scan-receipt"),
  },
  {
    keywords: ["בדיקת מלאי", "מלאי", "בדוק מלאי", "כמה יש"],
    label: "בדיקת מלאי",
    description: "פתיחת מסך חומרי גלם ומלאי",
    category: "warehouse",
    action: () => router.push("/procurement/raw-materials"),
  },
  {
    keywords: ["סריקה", "סרוק", "סורק ברקוד"],
    label: "סריקה",
    description: "פתיחת סורק ברקוד / QR",
    category: "warehouse",
    action: () => router.push("/field-ops/scanner"),
  },
  {
    keywords: ["הזמנות עבודה", "הזמנות", "פקודות עבודה"],
    label: "הזמנות עבודה",
    description: "הצגת הזמנות עבודה פעילות",
    category: "production",
    action: () => router.push("/production/work-orders"),
  },
  {
    keywords: ["דווח תפוקה", "דיווח תפוקה", "תפוקה", "דיווח ייצור"],
    label: "דיווח תפוקה",
    description: "פתיחת מסך דיווח ייצור",
    category: "production",
    action: () => router.push("/field-ops/production-report"),
  },
  {
    keywords: ["בדיקת איכות", "איכות", "בקרת איכות"],
    label: "בדיקת איכות",
    description: "פתיחת מסך בדיקות איכות",
    category: "production",
    action: () => router.push("/production/quality"),
  },
  {
    keywords: ["תחזוקה", "הזמנות תחזוקה", "תקלה"],
    label: "תחזוקה",
    description: "פתיחת הזמנות תחזוקה",
    category: "production",
    action: () => router.push("/maintenance/work-orders"),
  },
  {
    keywords: ["לקוחות", "רשימת לקוחות", "מאגר לקוחות"],
    label: "לקוחות",
    description: "פתיחת רשימת לקוחות",
    category: "crm",
    action: () => router.push("/crm/customers"),
  },
  {
    keywords: ["ביקור לקוח", "ביקורים", "ביקורי שטח"],
    label: "ביקורי לקוחות",
    description: "פתיחת מסך ביקורי שטח",
    category: "crm",
    action: () => router.push("/field-ops/crm-visits"),
  },
  {
    keywords: ["הצעות מחיר", "הצעה", "הצעת מחיר"],
    label: "הצעות מחיר",
    description: "פתיחת מסך הצעות מחיר",
    category: "crm",
    action: () => router.push("/crm/quotes"),
  },
  {
    keywords: ["דשבורד", "מסך ראשי", "בית"],
    label: "מסך ראשי",
    description: "חזרה למסך הראשי",
    category: "navigation",
    action: () => router.push("/(tabs)"),
  },
  {
    keywords: ["הודעות", "התראות", "נוטיפיקציות"],
    label: "הודעות",
    description: "פתיחת מסך הודעות",
    category: "navigation",
    action: () => router.push("/(tabs)/notifications"),
  },
  {
    keywords: ["ג'י פי אס", "מיקום", "מעקב", "מעקב GPS"],
    label: "מעקב GPS",
    description: "פתיחת מסך מעקב GPS",
    category: "navigation",
    action: () => router.push("/field-ops/gps-tracking"),
  },
  {
    keywords: ["ליקוט", "לקט", "ליקוט הזמנה"],
    label: "ליקוט",
    description: "פתיחת מסך ליקוט הזמנות",
    category: "warehouse",
    action: () => router.push("/warehouse/scan-receipt" as never),
  },
  {
    keywords: ["אריזה", "ארוז", "אריזת הזמנה"],
    label: "אריזה",
    description: "פתיחת מסך אריזה",
    category: "warehouse",
    action: () => router.push("/warehouse/scan-receipt" as never),
  },
  {
    keywords: ["משלוח", "שלח", "שליחה", "הפצה"],
    label: "משלוח",
    description: "פתיחת מסך משלוחים",
    category: "warehouse",
    action: () => router.push("/warehouse/scan-receipt" as never),
  },
  {
    keywords: ["דיווח השבתה", "השבתה", "דווח השבתה", "תקלת מכונה", "עצירת מכונה"],
    label: "דיווח השבתה",
    description: "דיווח על השבתת מכונה או קו ייצור",
    category: "production",
    action: () => router.push("/maintenance/work-orders" as never),
  },
  {
    keywords: ["סנכרון", "סנכרן", "עדכן נתונים"],
    label: "סנכרון נתונים",
    description: "פתיחת מסך סנכרון נתונים",
    category: "general",
    action: () => router.push("/sync-status" as never),
  },
];

export function getVoiceCommands(): VoiceCommand[] {
  return COMMANDS;
}

export function matchCommand(transcript: string): VoiceCommand | null {
  const normalized = transcript.trim().toLowerCase();
  if (!normalized) return null;

  for (const cmd of COMMANDS) {
    for (const kw of cmd.keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        return cmd;
      }
    }
  }

  let bestMatch: VoiceCommand | null = null;
  let bestScore = 0;
  for (const cmd of COMMANDS) {
    for (const kw of cmd.keywords) {
      const words = kw.toLowerCase().split(" ");
      let score = 0;
      for (const w of words) {
        if (normalized.includes(w)) score++;
      }
      const pct = score / words.length;
      if (pct > bestScore && pct >= 0.5) {
        bestScore = pct;
        bestMatch = cmd;
      }
    }
  }

  return bestMatch;
}

export async function speakHebrew(text: string): Promise<void> {
  return new Promise((resolve) => {
    Speech.speak(text, {
      language: "he-IL",
      rate: 0.9,
      onDone: resolve,
      onError: () => resolve(),
    });
  });
}

export function stopSpeaking() {
  Speech.stop();
}

export function getCommandsByCategory(): Record<string, VoiceCommand[]> {
  const result: Record<string, VoiceCommand[]> = {};
  for (const cmd of COMMANDS) {
    if (!result[cmd.category]) result[cmd.category] = [];
    result[cmd.category].push(cmd);
  }
  return result;
}

export const CATEGORY_LABELS: Record<string, string> = {
  warehouse: "מחסן",
  production: "ייצור",
  crm: "לקוחות ומכירות",
  navigation: "ניווט",
  general: "כללי",
};
