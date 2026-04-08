import { useState, useMemo, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  Zap, Play, Pause, Search, Plus, Mail, MessageSquare, Bell,
  ArrowRight, Clock, CheckCircle, RefreshCw, AlertTriangle,
  Send, BarChart3, Calendar, Bot, List, XCircle, Filter, Eye, X
} from "lucide-react";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import ActivityLog from "@/components/activity-log";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

type Automation = {
  id: number;
  name: string;
  description: string;
  trigger: string;
  actions: string[];
  category: string;
  active: boolean;
  runCount: number;
  lastRun?: string;
  isTemplate: boolean;
  tags: string[];
};

const CATEGORIES = ["הכל", "לידים", "מכירות", "שירות לקוחות", "מעקב", "התראות", "תקשורת", "אוטומציה כספית"];

const ALL_AUTOMATIONS: Automation[] = [
  { id: 1, name: "תגובה אוטומטית לליד חדש", description: "בעת יצירת ליד חדש — שלח מייל ברכה ותאם פגישה ראשונה תוך שעה", trigger: "ליד חדש נוצר", actions: ["שלח מייל קבלת פנים", "צור משימת מעקב לנציג", "שלח WhatsApp להודעה"], category: "לידים", active: true, runCount: 284, lastRun: "לפני 3 דקות", isTemplate: false, tags: ["ליד", "מייל", "WhatsApp"] },
  { id: 2, name: "מעקב אחרי ליד לא מגיב", description: "אם ליד לא מגיב תוך 48 שעות — שלח תזכורת אוטומטית וסמן לנציג", trigger: "ליד ללא תגובה 48 שעות", actions: ["שלח מייל תזכורת", "הגבר עדיפות", "התראה לנציג"], category: "מעקב", active: true, runCount: 127, lastRun: "לפני שעה", isTemplate: false, tags: ["ליד", "תזכורת"] },
  { id: 3, name: "ניתוב ליד VIP אוטומטי", description: "לידים עם ערך מוערך > 50,000₪ — נתב מיד לנציג בכיר", trigger: "ליד חדש נוצר (ערך > 50K)", actions: ["נתב לנציג בכיר", "שלח התראה דחופה", "פתח אופורטוניטי בצנרת"], category: "לידים", active: true, runCount: 43, lastRun: "לפני 4 שעות", isTemplate: false, tags: ["ניתוב", "VIP"] },
  { id: 4, name: "עדכון סטטוס אוטומטי — הצעה נשלחה", description: "לאחר שליחת הצעת מחיר — עדכן סטטוס ליד ותזמן מעקב", trigger: "הצעת מחיר נשלחה", actions: ["שנה סטטוס: הצעה נשלחה", "צור תזכורת מעקב ב-3 ימים", "עדכן אחוז הצלחה"], category: "מכירות", active: true, runCount: 198, lastRun: "לפני 2 שעות", isTemplate: false, tags: ["סטטוס", "הצעת מחיר"] },
  { id: 5, name: "ברכת יום הולדת ללקוח", description: "ביום ההולדת של לקוח — שלח ברכה אישית עם קופון", trigger: "יום הולדת לקוח", actions: ["שלח מייל ברכה", "הוסף קופון הנחה", "עדכן ב-CRM"], category: "תקשורת", active: true, runCount: 67, lastRun: "אתמול", isTemplate: false, tags: ["לקוח", "ברכה"] },
  { id: 6, name: "התראה חוזה פג תוקף", description: "30 ימים לפני פקיעת חוזה — שלח התראה לנציג ולמנהל", trigger: "חוזה פג תוקף בעוד 30 ימים", actions: ["התראה לנציג", "שלח מייל ללקוח", "פתח הזדמנות חידוש"], category: "התראות", active: true, runCount: 89, lastRun: "לפני יומיים", isTemplate: false, tags: ["חוזה", "התראה"] },
  { id: 7, name: "הזדמנות ממש ממש אבוד — העבר", description: "אם הזדמנות לא מתקדמת 30 ימים — העבר לנציג אחר", trigger: "הזדמנות ללא פעילות 30 ימים", actions: ["העבר לנציג אחר", "שלח סיכום לנציג החדש", "רשום סיבה"], category: "מכירות", active: true, runCount: 31, lastRun: "לפני 3 ימים", isTemplate: false, tags: ["הזדמנות", "העברה"] },
  { id: 8, name: "יצירת משימה אוטומטית לאחר פגישה", description: "לאחר פגישה עם לקוח — צור משימות מעקב אוטומטיות", trigger: "פגישה הסתיימה", actions: ["צור משימת מעקב", "שלח סיכום פגישה ללקוח", "עדכן CRM"], category: "מעקב", active: true, runCount: 156, lastRun: "לפני 30 דקות", isTemplate: false, tags: ["פגישה", "משימה"] },
  { id: 9, name: "שלח WhatsApp ללידים חדשים", description: "כשמגיע ליד מהאתר — שלח WhatsApp תוך דקה", trigger: "ליד נוצר מהאתר", actions: ["שלח WhatsApp מיידי", "הוסף לרשימת מעקב", "התראה לנציג"], category: "תקשורת", active: true, runCount: 412, lastRun: "לפני 8 דקות", isTemplate: false, tags: ["WhatsApp", "ליד"] },
  { id: 10, name: "חישוב Lead Score אוטומטי", description: "עדכון ניקוד ליד אוטומטי בכל שינוי מידע", trigger: "שינוי בנתוני ליד", actions: ["חשב Lead Score", "עדכן עדיפות", "שלח התראה אם VIP"], category: "לידים", active: true, runCount: 891, lastRun: "לפני דקה", isTemplate: false, tags: ["Lead Score", "ניקוד"] },
  { id: 11, name: "סגירת עסקה — צור חשבונית", description: "כשעסקה מסומנת כ'נסגרה' — צור חשבונית אוטומטית", trigger: "עסקה נסגרה (Won)", actions: ["צור חשבונית", "שלח מייל ללקוח", "עדכן פיפליין", "התראה לכספים"], category: "אוטומציה כספית", active: true, runCount: 78, lastRun: "לפני 5 שעות", isTemplate: false, tags: ["עסקה", "חשבונית"] },
  { id: 12, name: "תזכורת תשלום עומד", description: "חשבונית לא שולמה תוך 14 יום — שלח תזכורת אוטומטית", trigger: "חשבונית לא שולמה 14 יום", actions: ["שלח מייל תזכורת", "שלח WhatsApp", "התראה לצוות גבייה"], category: "אוטומציה כספית", active: true, runCount: 134, lastRun: "היום", isTemplate: false, tags: ["תשלום", "גבייה"] },
  { id: 13, name: "סקר שביעות רצון אוטומטי", description: "7 ימים אחרי סגירת פנייה — שלח סקר שביעות רצון", trigger: "פנייה נסגרה", actions: ["שלח סקר NPS", "עדכן ציון לקוח", "צור משימה אם NPS < 7"], category: "שירות לקוחות", active: true, runCount: 215, lastRun: "אתמול", isTemplate: false, tags: ["NPS", "שביעות רצון"] },
  { id: 14, name: "הסלמת פנייה דחופה", description: "פנייה בעדיפות דחוף ללא תגובה תוך שעה — הסלם למנהל", trigger: "פנייה דחופה ללא תגובה שעה", actions: ["הסלם למנהל", "שלח WhatsApp דחוף", "עדכן סטטוס"], category: "שירות לקוחות", active: true, runCount: 56, lastRun: "לפני 2 שעות", isTemplate: false, tags: ["הסלמה", "דחוף"] },
  { id: 15, name: "ליד אבוד — שלח סקר עזיבה", description: "כשליד מסומן 'אבוד' — שלח סקר לבדיקת סיבת העזיבה", trigger: "ליד שינה סטטוס: אבוד", actions: ["שלח סקר אנונימי", "שמור תשובות ב-CRM", "ניתוח מגמות"], category: "לידים", active: false, runCount: 44, lastRun: "לפני שבוע", isTemplate: false, tags: ["ליד אבוד", "סקר"] },
  { id: 16, name: "דוח שבועי לנציגים", description: "כל יום ראשון — שלח לכל נציג דוח ביצועים שבועי", trigger: "כל יום ראשון 08:00", actions: ["הכן דוח ביצועים", "שלח מייל לנציג", "עדכן לוח מנהלים"], category: "התראות", active: true, runCount: 48, lastRun: "לפני 3 ימים", isTemplate: false, tags: ["דוח", "נציג"] },
  { id: 17, name: "ליד מלינקדאין — ניחוש תחום", description: "ליד מלינקדאין — ניתוח פרופיל וציון Lead Score גבוה", trigger: "ליד נוצר ממקור: לינקדאין", actions: ["נתח פרופיל", "הגדר Lead Score", "שלח WhatsApp מותאם"], category: "לידים", active: true, runCount: 73, lastRun: "לפני 6 שעות", isTemplate: false, tags: ["לינקדאין", "Lead Score"] },
  { id: 18, name: "הצעה שלא נענתה — הורד מחיר", description: "הצעה שלא נענתה תוך 7 ימים — הצע הנחה קטנה", trigger: "הצעת מחיר ללא תגובה 7 ימים", actions: ["שלח הצעה חדשה עם הנחה", "עדכן מחיר", "התראה לנציג"], category: "מכירות", active: false, runCount: 27, lastRun: "לפני שבועיים", isTemplate: false, tags: ["הצעה", "הנחה"] },
  { id: 19, name: "עדכון ערוץ הגעה אוטומטי", description: "ניתוח מקור הגעה ועדכון אוטומטי של UTM parameters", trigger: "ליד חדש נוצר", actions: ["ניתוח מקור", "עדכן שדות UTM", "שייך לקמפיין"], category: "לידים", active: true, runCount: 503, lastRun: "לפני 5 דקות", isTemplate: false, tags: ["UTM", "מקור"] },
  { id: 20, name: "לקוח חוזר — הטב הצעה", description: "לקוח שקנה בעבר עוזב — שלח הצעה מיוחדת", trigger: "לקוח קיים יצר ליד חדש", actions: ["שלח הצעת Win-Back", "הוסף הנחת נאמנות", "שייך לנציג הקודם"], category: "מכירות", active: true, runCount: 89, lastRun: "אתמול", isTemplate: false, tags: ["Win-Back", "לקוח חוזר"] },
  { id: 21, name: "עדכון CRM מג'ימייל", description: "מייל שנשלח/נקבל — עדכן אוטומטית את CRM", trigger: "אינטגרציית Gmail/Outlook", actions: ["עדכן היסטוריית CRM", "קשר לליד/לקוח", "עדכן תאריך קשר אחרון"], category: "תקשורת", active: true, runCount: 1243, lastRun: "לפני שנייה", isTemplate: false, tags: ["מייל", "Gmail"] },
  { id: 22, name: "קמפיין ניקור לידים קרים", description: "לידים ללא פעילות 90 יום — קמפיין הפעלה מחדש", trigger: "ליד לא פעיל 90 ימים", actions: ["סמן כ'קר'", "שלח קמפיין Email", "צור משימה לנציג"], category: "מעקב", active: false, runCount: 18, lastRun: "לפני חודש", isTemplate: false, tags: ["ליד קר", "קמפיין"] },
  { id: 23, name: "SLA הפרה — הסלמה אוטומטית", description: "SLA הופר — הסלמה מיידית למנהל שירות", trigger: "הפרת SLA", actions: ["הסלם למנהל", "שלח WhatsApp", "שנה עדיפות: דחוף", "תעד הפרה"], category: "שירות לקוחות", active: true, runCount: 67, lastRun: "לפני 4 שעות", isTemplate: false, tags: ["SLA", "הסלמה"] },
  { id: 24, name: "הצלחה — שלח ביקורת ב-Google", description: "לאחר סגירת עסקה מוצלחת — בקש ביקורת Google", trigger: "חשבונית שולמה", actions: ["שלח בקשת ביקורת", "עדכן ציון לקוח", "שלח קישור Google"], category: "מכירות", active: true, runCount: 52, lastRun: "לפני 3 ימים", isTemplate: false, tags: ["ביקורת", "Google"] },
  { id: 25, name: "ניהול קמפיין Drip אוטומטי", description: "ליד חדש — סדרת 5 מיילים בפרקי זמן מחושבים", trigger: "ליד חדש מהאתר", actions: ["שלח מייל 1 מיידי", "שלח מייל 2 אחרי 3 ימים", "שלח מייל 3 אחרי שבוע", "שלח מייל 4-5 בהמשך"], category: "תקשורת", active: true, runCount: 341, lastRun: "לפני 20 דקות", isTemplate: false, tags: ["Drip", "אימייל מרקטינג"] },
  { id: 26, name: "יצירת ליד מטופס אינטרנט", description: "הגשת טופס באתר — יצירה אוטומטית של ליד ב-CRM", trigger: "טופס נשלח באתר", actions: ["צור ליד חדש", "קשר לקמפיין", "שלח תגובה אוטומטית", "נתב לנציג"], category: "לידים", active: true, runCount: 728, lastRun: "לפני 15 דקות", isTemplate: false, tags: ["טופס", "אתר"] },
  { id: 27, name: "עדכון שלב פיפליין אוטומטי", description: "לאחר שיחת מכירה — עדכן שלב פיפליין ותאריך סגירה", trigger: "שיחת מכירה נסגרה", actions: ["עדכן שלב", "חשב תאריך סגירה חדש", "עדכן הסתברות"], category: "מכירות", active: true, runCount: 267, lastRun: "לפני שעה", isTemplate: false, tags: ["פיפליין", "שלב"] },
  { id: 28, name: "התראת לקוח בסיכון", description: "לקוח ללא רכישה 6 חודשים — התראה לנציג ויצירת ליד עזיבה", trigger: "לקוח ללא רכישה 180 ימים", actions: ["צור ליד חזרה", "התראה לנציג", "שלח מייל 'חסרת אותנו'"], category: "התראות", active: true, runCount: 39, lastRun: "לפני שבוע", isTemplate: false, tags: ["לקוח בסיכון", "retention"] },
  { id: 29, name: "חלוקת עמלות אוטומטית", description: "סגירת עסקה — חישוב עמלת נציג אוטומטית", trigger: "עסקה נסגרה ושולמה", actions: ["חשב עמלה", "צור רשומה בשכר", "שלח אישור לנציג"], category: "אוטומציה כספית", active: true, runCount: 78, lastRun: "לפני 2 ימים", isTemplate: false, tags: ["עמלה", "שכר"] },
  { id: 30, name: "סיכום יומי לצוות מכירות", description: "בסוף כל יום — שלח סיכום ביצועים לצוות", trigger: "כל יום ב-18:00", actions: ["הכן סיכום יומי", "שלח ל-WhatsApp קבוצתי", "עדכן לוח מנהלים"], category: "התראות", active: true, runCount: 240, lastRun: "אתמול בערב", isTemplate: false, tags: ["סיכום", "ביצועים"] },
  { id: 31, name: "חיבור אוטומטי ליד-לקוח", description: "ליד שהמיר — חבר אוטומטית לכרטיס לקוח קיים", trigger: "ליד שינה סטטוס: הומר", actions: ["חפש לקוח קיים", "חבר או צור לקוח חדש", "העבר היסטוריה"], category: "לידים", active: true, runCount: 156, lastRun: "לפני 3 שעות", isTemplate: false, tags: ["המרה", "לקוח"] },
  { id: 32, name: "ביצועי פרסום — עדכון Lead Score", description: "ליד ממודעת Google/Facebook — הגדל Lead Score", trigger: "ליד ממקור ממומן", actions: ["הגדל Lead Score +10", "סמן כ'מעניין'", "שלח ל-CRM"], category: "לידים", active: true, runCount: 392, lastRun: "לפני 10 דקות", isTemplate: false, tags: ["פרסום", "Lead Score"] },
  { id: 33, name: "תזכורת חידוש מנוי", description: "60 יום לפני סיום מנוי — מסע פרסום חידוש", trigger: "סיום מנוי בעוד 60 ימים", actions: ["שלח מייל חידוש", "צור הצעה", "שלח WhatsApp"], category: "מכירות", active: true, runCount: 47, lastRun: "לפני 4 ימים", isTemplate: false, tags: ["חידוש", "מנוי"] },
  { id: 34, name: "אינטגרציית Slack — התראות CRM", description: "כל אירוע חשוב ב-CRM — עדכון ב-Slack", trigger: "אירועי CRM מרכזיים", actions: ["שלח ל-Slack", "עדכן ערוץ צוות", "תעד בלוג"], category: "תקשורת", active: false, runCount: 3420, lastRun: "לפני שבוע", isTemplate: false, tags: ["Slack", "אינטגרציה"] },
];

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "מייל": Mail, "WhatsApp": MessageSquare, "התראה": Bell, "עדכן": RefreshCw, "צור": Plus,
  "שלח": Send, "נתב": ArrowRight, "הסלם": AlertTriangle, "חשב": BarChart3,
  "סמן": CheckCircle, "פגישה": Calendar,
};

type RunStatus = "success" | "error" | "skipped";

type HistoryEntry = {
  id: number;
  automationId: number;
  automationName: string;
  category: string;
  triggeredBy: string;
  status: RunStatus;
  actionsCompleted: number;
  actionsTotal: number;
  duration: number;
  timestamp: string;
  errorMessage?: string;
};

const INITIAL_HISTORY: HistoryEntry[] = [
  { id: 1, automationId: 1, automationName: "תגובה אוטומטית לליד חדש", category: "לידים", triggeredBy: "ליד: אבי כהן (03:44)", status: "success", actionsCompleted: 3, actionsTotal: 3, duration: 1.2, timestamp: "2026-03-17 03:44:11" },
  { id: 2, automationId: 4, automationName: "עדכון סטטוס אוטומטי — הצעה נשלחה", category: "מכירות", triggeredBy: "הצעה #PRO-881 (02:30)", status: "success", actionsCompleted: 3, actionsTotal: 3, duration: 0.8, timestamp: "2026-03-17 02:30:55" },
  { id: 3, automationId: 2, automationName: "מעקב אחרי ליד לא מגיב", category: "מעקב", triggeredBy: "ליד: חברה הולכת (01:15)", status: "error", actionsCompleted: 1, actionsTotal: 3, duration: 0.3, timestamp: "2026-03-17 01:15:02", errorMessage: "כתובת מייל לא תקינה — שליחה נכשלה" },
  { id: 4, automationId: 32, automationName: "ביצועי פרסום — עדכון Lead Score", category: "לידים", triggeredBy: "ליד ממקור Google Ads (00:58)", status: "success", actionsCompleted: 3, actionsTotal: 3, duration: 0.5, timestamp: "2026-03-17 00:58:33" },
  { id: 5, automationId: 11, automationName: "SLA הפרה — התראה אוטומטית", category: "שירות לקוחות", triggeredBy: "כרטיס TKT-1023 (00:41)", status: "success", actionsCompleted: 2, actionsTotal: 2, duration: 0.4, timestamp: "2026-03-17 00:41:18" },
  { id: 6, automationId: 5, automationName: "ברכת יום הולדת ללקוח", category: "תקשורת", triggeredBy: "לקוח: ציפי לוי (00:01)", status: "success", actionsCompleted: 3, actionsTotal: 3, duration: 1.0, timestamp: "2026-03-17 00:01:00" },
  { id: 7, automationId: 6, automationName: "התראה חוזה פג תוקף", category: "התראות", triggeredBy: "חוזה #CNT-340 (אתמול 23:59)", status: "success", actionsCompleted: 3, actionsTotal: 3, duration: 0.9, timestamp: "2026-03-16 23:59:47" },
  { id: 8, automationId: 3, automationName: "ניתוב ליד VIP אוטומטי", category: "לידים", triggeredBy: "ליד: בנק פועלים (אתמול 21:10)", status: "skipped", actionsCompleted: 0, actionsTotal: 3, duration: 0.1, timestamp: "2026-03-16 21:10:05", errorMessage: "לא עמד בתנאי ערך מינימלי (45K < 50K)" },
  { id: 9, automationId: 20, automationName: "עדכון CRM ממיטינג — סיכום GPT", category: "מכירות", triggeredBy: "פגישה: אביב תעשיות (אתמול 19:00)", status: "success", actionsCompleted: 3, actionsTotal: 3, duration: 2.3, timestamp: "2026-03-16 19:00:14" },
  { id: 10, automationId: 8, automationName: "דוח ביצועי מכירות שבועי", category: "אוטומציה כספית", triggeredBy: "שיגור מתוזמן (אתמול 08:00)", status: "success", actionsCompleted: 2, actionsTotal: 2, duration: 4.1, timestamp: "2026-03-16 08:00:00" },
  { id: 11, automationId: 1, automationName: "תגובה אוטומטית לליד חדש", category: "לידים", triggeredBy: "ליד: גדי נחמיאס (אתמול 07:23)", status: "success", actionsCompleted: 3, actionsTotal: 3, duration: 1.1, timestamp: "2026-03-16 07:23:44" },
  { id: 12, automationId: 14, automationName: "אינטגרציית חשבונאות — עדכון לחשבשבת", category: "אוטומציה כספית", triggeredBy: "עסקה #TXN-9912 (שלשום 16:45)", status: "error", actionsCompleted: 0, actionsTotal: 2, duration: 0.2, timestamp: "2026-03-15 16:45:33", errorMessage: "חיבור ל-API חשבשבת נכשל — timeout" },
];

function getActionIcon(action: string) {
  for (const [key, Icon] of Object.entries(ACTION_ICONS)) {
    if (action.includes(key)) return Icon;
  }
  return Zap;
}

const STATUS_LABELS: Record<RunStatus, string> = { success: "הצלחה", error: "שגיאה", skipped: "דולג" };
const DETAIL_TABS = [{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}];
const STATUS_COLORS: Record<RunStatus, string> = {
  success: "bg-green-500/20 text-green-400 border-green-500/30",
  error: "bg-red-500/20 text-red-400 border-red-500/30",
  skipped: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};
const STATUS_ICONS: Record<RunStatus, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle,
  error: XCircle,
  skipped: AlertTriangle,
};

export default function CrmAutomations() {
  const API = "/api";
  const token = () => document.cookie.match(/token=([^;]+)/)?.[1] || localStorage.getItem("erp_token") || "";
  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${token()}` };

  const [automations, setAutomations] = useState<Automation[]>(ALL_AUTOMATIONS);
  const [history, setHistory] = useState<HistoryEntry[]>(INITIAL_HISTORY);
  const [activeTab, setActiveTab] = useState<"library" | "history">("library");
  const [activeCategory, setActiveCategory] = useState("הכל");
  const [search, setSearch] = useState("");
  const [showActive, setShowActive] = useState<"all" | "active" | "inactive">("all");
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState<"all" | RunStatus>("all");
  const [viewAutoDetail, setViewAutoDetail] = useState<Automation | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const loadData = useCallback(() => {
    authFetch(`${API}/crm-automations`, { headers: hdrs }).then(r => r.json()).then((d: unknown) => {
      if (Array.isArray(d) && d.length > 0) {
        setAutomations((d as Record<string, unknown>[]).map(x => ({
          id: Number(x.id), name: String(x.name || ""), description: String(x.description || ""),
          category: String(x.category || ""), trigger: String(x.trigger || ""),
          actions: Array.isArray(x.actions) ? x.actions.map(String) : [],
          active: Boolean(x.active), runCount: Number(x.run_count || 0),
          lastRun: x.last_run ? String(x.last_run) : undefined,
          avgDuration: String(x.avg_duration || "—"), tags: Array.isArray(x.tags) ? x.tags.map(String) : [],
        })));
      }
    }).catch(() => null);
    authFetch(`${API}/crm-automation-history`, { headers: hdrs }).then(r => r.json()).then((d: unknown) => {
      if (Array.isArray(d) && d.length > 0) {
        setHistory((d as Record<string, unknown>[]).map(x => ({
          id: Number(x.id), automationId: Number(x.automation_id || 0),
          automationName: String(x.automation_name || ""), status: (x.status as RunStatus) || "success",
          triggeredBy: String(x.triggered_by || ""), duration: String(x.duration || ""),
          recordsAffected: Number(x.records_affected || 0), message: String(x.message || ""),
          startedAt: String(x.started_at || ""),
        })));
      }
    }).catch(() => null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    return automations.filter(a => {
      if (activeCategory !== "הכל" && a.category !== activeCategory) return false;
      if (showActive === "active" && !a.active) return false;
      if (showActive === "inactive" && a.active) return false;
      if (search && !a.name.includes(search) && !a.description.includes(search) && !a.tags.some(t => t.includes(search))) return false;
      return true;
    });
  }, [automations, activeCategory, search, showActive]);

  const filteredHistory = useMemo(() => {
    return history.filter(h => {
      if (historyStatus !== "all" && h.status !== historyStatus) return false;
      if (historySearch && !h.automationName.includes(historySearch) && !h.triggeredBy.includes(historySearch)) return false;
      return true;
    });
  }, [history, historySearch, historyStatus]);

  const stats = useMemo(() => ({
    total: automations.length,
    active: automations.filter(a => a.active).length,
    totalRuns: automations.reduce((s, a) => s + a.runCount, 0),
  }), [automations]);

  const toggleAuto = async (id: number) => {
    await authFetch(`${API}/crm-automations/${id}/toggle`, { method: "PATCH", headers: hdrs }).catch(() => null);
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a));
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Zap className="w-7 h-7 text-primary" />ספריית אוטומציות CRM</h1>
          <p className="text-sm text-muted-foreground">{stats.total} אוטומציות מוכנות — הפעל וכבה ברגע</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "סה\"כ אוטומציות", value: stats.total, icon: Bot, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "פעילות", value: stats.active, icon: Play, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "הרצות כולל", value: stats.totalRuns.toLocaleString("he-IL"), icon: RefreshCw, color: "text-purple-400", bg: "bg-purple-500/10" },
        ].map((k, i) => (
          <div key={i} className="bg-card border rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${k.bg} flex items-center justify-center`}>
              <k.icon className={`w-5 h-5 ${k.color}`} />
            </div>
            <div>
              <div className={`text-lg sm:text-2xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-border">
        {(
          [
            { id: "library", label: "ספריית אוטומציות", icon: Zap },
            { id: "history", label: "היסטוריית הרצות", icon: List },
          ] as const
        ).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {activeTab === "library" && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <input className="input input-bordered w-full pr-9 h-9 text-sm" placeholder="חיפוש לפי שם, תגית..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="select select-bordered select-sm" value={showActive} onChange={e => setShowActive(e.target.value as "all" | "active" | "inactive")}>
              <option value="all">הכל</option>
              <option value="active">פעילות בלבד</option>
              <option value="inactive">לא פעילות</option>
            </select>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${activeCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"}`}>
                {cat}
                {cat !== "הכל" && <span className="mr-1 opacity-60">({automations.filter(a => a.category === cat).length})</span>}
              </button>
            ))}
          </div>

          <div className="text-sm text-muted-foreground">מציג {filtered.length} מתוך {automations.length} אוטומציות</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(auto => (
              <div key={auto.id} className={`bg-card border rounded-xl p-4 transition-all hover:border-primary/30 cursor-pointer ${!auto.active ? "opacity-70" : ""}`} onClick={() => setViewAutoDetail(auto)}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{auto.name}</span>
                      <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">{auto.category}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{auto.description}</p>
                  </div>
                  <div className="flex items-center gap-1 mr-2">
                    <button
                      onClick={() => toggleAuto(auto.id)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${auto.active ? "bg-primary" : "bg-muted"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-card transition-transform ${auto.active ? "translate-x-[-18px]" : "translate-x-[-4px]"}`} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 mb-3">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span className="font-medium">טריגר:</span> {auto.trigger}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {auto.actions.map((action, i) => {
                      const Icon = getActionIcon(action);
                      return (
                        <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted border">
                          <Icon className="w-3 h-3 text-primary" />
                          {action}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" />{auto.runCount.toLocaleString("he-IL")} הרצות</span>
                    {auto.lastRun && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{auto.lastRun}</span>}
                  </div>
                  <div className="flex gap-1">
                    {auto.tags.slice(0, 2).map((tag, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>לא נמצאו אוטומציות התואמות לחיפוש</p>
            </div>
          )}

          {viewAutoDetail && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setViewAutoDetail(null); setDetailTab("details"); }}>
              <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-border flex justify-between items-center">
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Zap className="w-5 h-5 text-primary" />{viewAutoDetail.name}</h2>
                  <button onClick={() => { setViewAutoDetail(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex border-b border-border/50">
                  {DETAIL_TABS.map(t => (
                    <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                  ))}
                </div>
                {detailTab === "details" && (
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-xs text-muted-foreground block">שם</span><span className="font-medium">{viewAutoDetail.name}</span></div>
                      <div><span className="text-xs text-muted-foreground block">קטגוריה</span><span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">{viewAutoDetail.category}</span></div>
                      <div><span className="text-xs text-muted-foreground block">מצב</span><span className={viewAutoDetail.active ? "text-green-400" : "text-muted-foreground"}>{viewAutoDetail.active ? "פעיל" : "לא פעיל"}</span></div>
                      <div><span className="text-xs text-muted-foreground block">הרצות</span><span>{viewAutoDetail.runCount.toLocaleString("he-IL")}</span></div>
                      <div className="col-span-2"><span className="text-xs text-muted-foreground block">תיאור</span><span>{viewAutoDetail.description}</span></div>
                      <div className="col-span-2"><span className="text-xs text-muted-foreground block">טריגר</span><span>{viewAutoDetail.trigger}</span></div>
                      <div className="col-span-2"><span className="text-xs text-muted-foreground block">פעולות</span><div className="flex flex-wrap gap-1 mt-1">{viewAutoDetail.actions.map((a, i) => <span key={i} className="px-2 py-0.5 rounded text-xs bg-muted border">{a}</span>)}</div></div>
                    </div>
                  </div>
                )}
                {detailTab === "related" && (
                  <div className="p-5"><RelatedRecords tabs={[{key:"triggers",label:"טריגרים",endpoint:`${API}/crm-automations/${viewAutoDetail.id}/triggers`,columns:[{key:"event",label:"אירוע"},{key:"condition",label:"תנאי"},{key:"count",label:"כמות"}]},{key:"actions",label:"פעולות",endpoint:`${API}/crm-automations/${viewAutoDetail.id}/actions`,columns:[{key:"type",label:"סוג"},{key:"target",label:"יעד"},{key:"status",label:"סטטוס"}]},{key:"logs",label:"לוגים",endpoint:`${API}/crm-automations/${viewAutoDetail.id}/logs`,columns:[{key:"timestamp",label:"זמן"},{key:"status",label:"סטטוס"},{key:"message",label:"הודעה"}]}]} /></div>
                )}
                {detailTab === "docs" && (
                  <div className="p-5"><AttachmentsSection entityType="automation" entityId={viewAutoDetail.id} /></div>
                )}
                {detailTab === "history" && (
                  <div className="p-5"><ActivityLog entityType="automation" entityId={viewAutoDetail.id} /></div>
                )}
                <div className="p-5 border-t border-border flex justify-end"><button onClick={() => { setViewAutoDetail(null); setDetailTab("details"); }} className="btn btn-outline btn-sm">סגור</button></div>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "history" && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <input className="input input-bordered w-full pr-9 h-9 text-sm" placeholder="חיפוש לפי שם אוטומציה או טריגר..." value={historySearch} onChange={e => setHistorySearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-1">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select className="select select-bordered select-sm" value={historyStatus} onChange={e => setHistoryStatus(e.target.value as "all" | RunStatus)}>
                <option value="all">כל הסטטוסים</option>
                <option value="success">הצלחה</option>
                <option value="error">שגיאה</option>
                <option value="skipped">דולג</option>
              </select>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">מציג {filteredHistory.length} הרצות</div>

          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">אוטומציה</th>
                  <th className="px-4 py-3 text-right font-medium">טריגר</th>
                  <th className="px-4 py-3 text-right font-medium">סטטוס</th>
                  <th className="px-4 py-3 text-right font-medium">פעולות</th>
                  <th className="px-4 py-3 text-right font-medium">משך</th>
                  <th className="px-4 py-3 text-right font-medium">זמן</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredHistory.map(entry => {
                  const StatusIcon = STATUS_ICONS[entry.status];
                  return (
                    <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{entry.automationName}</div>
                        <div className="text-xs text-muted-foreground">{entry.category}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-muted-foreground">{entry.triggeredBy}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${STATUS_COLORS[entry.status]}`}>
                          <StatusIcon className="w-3 h-3" />
                          {STATUS_LABELS[entry.status]}
                        </div>
                        {entry.errorMessage && (
                          <div className="text-xs text-red-400 mt-1 max-w-[160px]">{entry.errorMessage}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">{entry.actionsCompleted}/{entry.actionsTotal}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">{entry.duration}ש"</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">{entry.timestamp}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredHistory.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">אין הרצות התואמות לסינון</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
