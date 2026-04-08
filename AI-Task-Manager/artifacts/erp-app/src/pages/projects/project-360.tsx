import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Building2, DollarSign, TrendingUp, Clock, AlertTriangle, CheckCircle, Shield, Users, FileText,
  Eye, Brain, Package, ClipboardList, Activity, CircleDot, Target, Zap, Search,
  ChevronLeft, Star, Percent, BadgeAlert, Banknote, Factory, HardHat, FileCheck,
  GitBranch, MessageSquare, Lightbulb
} from "lucide-react";

const FALLBACK_360_PROJECT = {
  id: "PRJ-2024-0087", name: "מגדל מגורים הרצליה — חלונות אלומיניום", customer: "אאורה נדל\"ן בע\"מ",
  status: "פעיל", stage: "ייצור והתקנה", stageIndex: 11, risk: "בינוני", healthScore: 74,
  pm: "אורי כהן", startDate: "2025-09-01", endDate: "2026-07-15", contractValue: 4850000, lastUpdate: "2026-04-07",
};

const FALLBACK_360_KPIS = [
  { label: "ערך חוזה", value: "₪4,850,000", icon: Banknote, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "עלות בפועל", value: "₪3,180,000", icon: DollarSign, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "מרווח גולמי", value: "34.4%", icon: Percent, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "התקדמות", value: "62%", icon: Target, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "סטיית לו\"ז", value: "+8 ימים", icon: Clock, color: "text-orange-400", bg: "bg-orange-500/10" },
  { label: "סיכונים פתוחים", value: "6", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "משימות חסומות", value: "2", icon: BadgeAlert, color: "text-rose-400", bg: "bg-rose-500/10" },
  { label: "גבייה", value: "58%", icon: Banknote, color: "text-teal-400", bg: "bg-teal-500/10" },
  { label: "ציון AI", value: "74", icon: Brain, color: "text-purple-400", bg: "bg-purple-500/10" },
];
const FALLBACK_360_STAGES = ["ליד","הצעת מחיר","משא ומתן","חוזה חתום","מקדמה","מדידות שטח","תכנון הנדסי","אישור לקוח","הזמנת חומרים","קבלת חומרים","חיתוך","ייצור והתקנה","התקנה באתר","בדיקות איכות","מסירה","אחריות","סגירה"];

const FALLBACK_360_TEAM = [
  { name: "אורי כהן", role: "מנהל פרויקט", avatar: "א.כ" }, { name: "דנה לוי", role: "מהנדסת ביצוע", avatar: "ד.ל" },
  { name: "יוסי מרקוביץ", role: "מנהל רכש", avatar: "י.מ" }, { name: "מירי אביטל", role: "מנהלת איכות", avatar: "מ.א" },
  { name: "רועי שמש", role: "ראש צוות התקנות", avatar: "ר.ש" },
];
const FALLBACK_360_EVENTS = [
  { time: "07/04 14:30", text: "התקבלה אלומיניום פרופיל מ-אלובין — 2.4 טון", icon: Package },
  { time: "06/04 10:15", text: "עודכן שינוי הנדסי CO-004 — תוספת חלון פנורמי קומה 18", icon: GitBranch },
  { time: "05/04 16:00", text: "סיום התקנה קומות 8–10 — אישור לקוח התקבל", icon: CheckCircle },
  { time: "04/04 09:45", text: "סיכון R-003 הועלה לרמה גבוהה — עיכוב זכוכית מיובאת", icon: AlertTriangle },
  { time: "03/04 11:20", text: "חשבונית #INV-087-05 — ₪420,000 נשלחה ללקוח", icon: FileText },
];

const FALLBACK_360_FINANCE = {
  contractValue: 4850000, budgetApproved: 3200000, actualCost: 3180000, invoiced: 3400000,
  collected: 2813000, remaining: 2037000, grossMargin: 34.4, netMargin: 21.2, cashGap: 367000,
  budgetLines: [
    { item: "חומרי גלם — אלומיניום", budget: 1200000, actual: 1150000 }, { item: "חומרי גלם — זכוכית", budget: 680000, actual: 720000 },
    { item: "עבודה — ייצור", budget: 480000, actual: 510000 }, { item: "עבודה — התקנה", budget: 350000, actual: 320000 },
    { item: "קבלני משנה", budget: 280000, actual: 290000 }, { item: "הובלה ומנוף", budget: 120000, actual: 110000 },
    { item: "תקורות", budget: 90000, actual: 80000 },
  ],
};

const FALLBACK_360_TASKS = [
  { id: "T-001", name: "ייצור מסגרות קומות 11-14", st: "בביצוע", pr: "גבוה", who: "דנה לוי", due: "2026-04-15", pct: 72, par: null },
  { id: "T-002", name: "חיתוך פרופילים — קומות 15-18", st: "בביצוע", pr: "גבוה", who: "צוות ייצור א׳", due: "2026-04-20", pct: 45, par: null },
  { id: "T-003", name: "הזמנת זכוכית מחוסמת — ערכת 3", st: "ממתין", pr: "קריטי", who: "יוסי מרקוביץ", due: "2026-04-10", pct: 10, par: null },
  { id: "T-004", name: "התקנה קומות 11-12", st: "מתוכנן", pr: "בינוני", who: "רועי שמש", due: "2026-05-02", pct: 0, par: "T-001" },
  { id: "T-005", name: "בדיקת אטימות קומות 8-10", st: "הושלם", pr: "גבוה", who: "מירי אביטל", due: "2026-04-03", pct: 100, par: null },
  { id: "T-006", name: "תיאום מנוף לקומות 13-14", st: "ממתין", pr: "בינוני", who: "רועי שמש", due: "2026-04-14", pct: 0, par: "T-001" },
  { id: "T-007", name: "עדכון שרטוטי ביצוע — שינוי CO-004", st: "בביצוע", pr: "גבוה", who: "דנה לוי", due: "2026-04-12", pct: 60, par: null },
  { id: "T-008", name: "אישור דגם זכוכית מלקוח", st: "חסום", pr: "קריטי", who: "אורי כהן", due: "2026-04-08", pct: 30, par: "T-003" },
  { id: "T-009", name: "הכנת חשבון חלקי #6", st: "בביצוע", pr: "בינוני", who: "אורי כהן", due: "2026-04-10", pct: 50, par: null },
  { id: "T-010", name: "בדיקת איכות פרופילים — אצווה 14", st: "חסום", pr: "גבוה", who: "מירי אביטל", due: "2026-04-09", pct: 20, par: "T-002" },
];

const FALLBACK_360_PROCUREMENT = [
  { id: "PO-301", mat: "פרופיל אלומיניום 6063-T5", qty: "2,400 מ\"א", sup: "אלובין בע\"מ", status: "התקבל", urg: "רגיל", due: "2026-04-05", cost: 380000 },
  { id: "PO-302", mat: "זכוכית מחוסמת 10 מ\"מ", qty: "850 מ\"ר", sup: "פניציה ישראל", status: "בהזמנה", urg: "דחוף", due: "2026-04-18", cost: 290000 },
  { id: "PO-303", mat: "אטמי EPDM", qty: "5,000 מ\"א", sup: "גומי-טק", status: "התקבל", urg: "רגיל", due: "2026-03-28", cost: 42000 },
  { id: "PO-304", mat: "ברגים ואביזרי חיבור", qty: "12,000 יח׳", sup: "בורג סנטר", status: "התקבל", urg: "רגיל", due: "2026-03-30", cost: 28000 },
  { id: "PO-305", mat: "זכוכית LOW-E", qty: "320 מ\"ר", sup: "גארדיאן", status: "ייצור אצל ספק", urg: "קריטי", due: "2026-04-25", cost: 195000 },
  { id: "PO-306", mat: "ידיות ומנגנוני נעילה", qty: "680 יח׳", sup: "רוטו ישראל", status: "בהזמנה", urg: "בינוני", due: "2026-04-20", cost: 86000 },
  { id: "PO-307", mat: "סיליקון מבני", qty: "800 שפורפרות", sup: "דאו קורנינג", status: "ממתין לאישור", urg: "בינוני", due: "2026-04-22", cost: 34000 },
  { id: "PO-308", mat: "רשתות יתושים", qty: "420 יח׳", sup: "מגן-רשת", status: "מתוכנן", urg: "נמוך", due: "2026-05-10", cost: 21000 },
];

const FALLBACK_360_PRODUCTION = [
  { id: "WO-501", desc: "חיתוך פרופילים — אצווה 14", wc: "מסור CNC-1", status: "בביצוע", planned: 48, actual: 38, scrap: 1.2 },
  { id: "WO-502", desc: "הרכבת מסגרות — קומות 11-12", wc: "קו הרכבה A", status: "ממתין", planned: 64, actual: 0, scrap: 0 },
  { id: "WO-503", desc: "הדבקת זכוכית — קומות 8-10", wc: "קו זיגוג", status: "הושלם", planned: 40, actual: 42, scrap: 0.8 },
  { id: "WO-504", desc: "חיתוך פרופילים — אצווה 15", wc: "מסור CNC-2", status: "מתוכנן", planned: 52, actual: 0, scrap: 0 },
  { id: "WO-505", desc: "עיבוד CNC — חלונות פנורמיים", wc: "CNC מרכז", status: "בביצוע", planned: 32, actual: 24, scrap: 2.1 },
  { id: "WO-506", desc: "בדיקת אטימות מסגרות", wc: "מעבדת QC", status: "בביצוע", planned: 16, actual: 10, scrap: 0 },
];
const FALLBACK_360_INSTALLATIONS = [
  { id: "INS-01", type: "התקנה ראשית", team: "צוות א׳ — רועי", date: "2026-03-18", floors: "קומות 5-7", outcome: "הושלם בהצלחה", signoff: true },
  { id: "INS-02", type: "התקנה ראשית", team: "צוות א׳ — רועי", date: "2026-04-02", floors: "קומות 8-10", outcome: "הושלם — תיקון קל בקומה 9", signoff: true },
  { id: "INS-03", type: "תיקון", team: "צוות ב׳ — שמעון", date: "2026-04-06", floors: "קומה 6 — דירה 12", outcome: "החלפת אטם — הושלם", signoff: true },
  { id: "INS-04", type: "התקנה ראשית", team: "צוות א׳ — רועי", date: "2026-04-18", floors: "קומות 11-12", outcome: "מתוכנן", signoff: false },
  { id: "INS-05", type: "ביקורת איכות", team: "מירי אביטל", date: "2026-04-22", floors: "קומות 5-10", outcome: "מתוכנן", signoff: false },
];

const FALLBACK_360_RISKS = [
  { id: "R-001", desc: "עיכוב באספקת זכוכית LOW-E מחו\"ל", prob: 4, impact: 5, score: 20, status: "פתוח", mit: "הזמנת ספק חלופי — גארדיאן הונגריה" },
  { id: "R-002", desc: "עליית מחיר אלומיניום ב-LME", prob: 3, impact: 3, score: 9, status: "פתוח", mit: "גידור מחיר עד סוף Q2" },
  { id: "R-003", desc: "חוסר מנוף באתר — תיאום קבלן ראשי", prob: 3, impact: 4, score: 12, status: "פתוח", mit: "הזמנת מנוף עצמאי כגיבוי" },
  { id: "R-004", desc: "שינוי דרישות לקוח באמצע ייצור", prob: 2, impact: 4, score: 8, status: "ממותן", mit: "הגדרת freeze date בחוזה" },
  { id: "R-005", desc: "תאונת עבודה באתר התקנה", prob: 2, impact: 5, score: 10, status: "פתוח", mit: "הדרכת בטיחות שבועית + ציוד מגן" },
  { id: "R-006", desc: "פגם באצווה פרופילים — דרוש בדיקת QC", prob: 3, impact: 3, score: 9, status: "פתוח", mit: "בדיקת מדגם 10% בקבלה" },
];
const FALLBACK_360_CHANGE_ORDERS = [
  { id: "CO-001", desc: "תוספת חלון ויטרינה — לובי כניסה", date: "2026-01-15", revenue: 85000, cost: 52000, days: 5, status: "מאושר" },
  { id: "CO-002", desc: "שדרוג זכוכית לLOW-E בקומות 15-18", date: "2026-02-20", revenue: 120000, cost: 78000, days: 8, status: "מאושר" },
  { id: "CO-003", desc: "הוספת רשתות יתושים — כל הדירות", date: "2026-03-10", revenue: 65000, cost: 42000, days: 3, status: "ממתין לאישור" },
  { id: "CO-004", desc: "חלון פנורמי קומה 18 — שינוי אדריכלי", date: "2026-04-06", revenue: 95000, cost: 68000, days: 12, status: "בבדיקה" },
];

const documents = [
  { name: "חוזה חתום — אאורה נדל\"ן", type: "חוזה", ver: "v2.1", date: "2025-09-01", size: "2.4 MB" },
  { name: "מפרט טכני — חלונות אלומיניום", type: "מפרט", ver: "v3.0", date: "2026-01-10", size: "4.8 MB" },
  { name: "שרטוטי ביצוע — קומות 1-10", type: "שרטוט", ver: "v2.2", date: "2026-02-28", size: "18.2 MB" },
  { name: "שרטוטי ביצוע — קומות 11-18", type: "שרטוט", ver: "v1.4", date: "2026-03-20", size: "15.6 MB" },
  { name: "דוח בדיקת אטימות — קומות 5-7", type: "דוח איכות", ver: "v1.0", date: "2026-03-22", size: "1.1 MB" },
  { name: "אישור תקן ישראלי — ת\"י 1281", type: "תעודה", ver: "v1.0", date: "2025-10-15", size: "0.8 MB" },
  { name: "הצעת מחיר מעודכנת — CO-002", type: "הצעת מחיר", ver: "v1.1", date: "2026-02-22", size: "0.5 MB" },
  { name: "פרוטוקול ישיבה #14", type: "פרוטוקול", ver: "v1.0", date: "2026-04-03", size: "0.3 MB" },
];
const auditEvents = [
  { time: "07/04 14:30", user: "יוסי מרקוביץ", act: "קבלת חומר", detail: "PO-301 — פרופיל אלומיניום 2,400 מ\"א התקבל במלואו" },
  { time: "07/04 11:00", user: "אורי כהן", act: "עדכון משימה", detail: "T-009 — הכנת חשבון חלקי #6 — התקדמות 50%" },
  { time: "06/04 16:45", user: "דנה לוי", act: "שינוי הנדסי", detail: "CO-004 — חלון פנורמי קומה 18 נוסף" },
  { time: "06/04 10:15", user: "מערכת", act: "התראת AI", detail: "סיכון עיכוב באספקת זכוכית LOW-E עלה לרמה קריטית" },
  { time: "05/04 16:00", user: "רועי שמש", act: "סיום התקנה", detail: "INS-02 — קומות 8-10 הושלמו — חתימת לקוח התקבלה" },
  { time: "05/04 14:20", user: "מירי אביטל", act: "בדיקת איכות", detail: "T-005 — אטימות קומות 8-10 עברה בהצלחה" },
  { time: "04/04 09:45", user: "מערכת", act: "עדכון סיכון", detail: "R-003 — עיכוב מנוף — ציון סיכון עלה ל-12" },
  { time: "03/04 11:20", user: "אורי כהן", act: "חשבונית", detail: "INV-087-05 — ₪420,000 הונפקה ונשלחה" },
  { time: "02/04 15:30", user: "יוסי מרקוביץ", act: "הזמנת רכש", detail: "PO-306 — ידיות ומנגנוני נעילה — 680 יח׳" },
  { time: "01/04 10:00", user: "דנה לוי", act: "עדכון שרטוט", detail: "שרטוטי ביצוע קומות 11-18 — גרסה v1.4" },
  { time: "31/03 16:20", user: "מערכת", act: "תחזית AI", detail: "צפי סיום מעודכן: 22/07/2026 (+8 ימים מהמתוכנן)" },
  { time: "30/03 12:00", user: "רועי שמש", act: "תכנון התקנה", detail: "INS-04 — תוכנן ל-18/04 — קומות 11-12" },
  { time: "29/03 09:30", user: "אורי כהן", act: "ישיבת פרויקט", detail: "פרוטוקול ישיבה #14 — 8 משתתפים" },
  { time: "28/03 14:45", user: "מערכת", act: "גבייה", detail: "תשלום ₪280,000 התקבל מלקוח — חשבונית INV-087-04" },
  { time: "27/03 11:10", user: "מירי אביטל", act: "NCR", detail: "אי-התאמה באצווה 13 — 3 מסגרות נדחו" },
];

const aiScores = [
  { label: "בריאות כללית", score: 74, color: "bg-amber-500" }, { label: "סיכון עיכוב", score: 62, color: "bg-orange-500" },
  { label: "שימור מרווח", score: 81, color: "bg-emerald-500" }, { label: "סיכוי גבייה", score: 72, color: "bg-blue-500" },
  { label: "מורכבות", score: 58, color: "bg-purple-500" },
];
const aiPredictions = [
  { text: "צפי סיום מעודכן: 22/07/2026 — עיכוב של 8 ימים מהמתוכנן בשל אספקת זכוכית", type: "warning" },
  { text: "סיכוי לחריגת תקציב: 18% — עליית מחיר אלומיניום וזכוכית LOW-E", type: "warning" },
  { text: "גבייה צפויה עד סוף אפריל: ₪520,000 — מבוסס על קצב התקדמות נוכחי", type: "info" },
  { text: "הזמנת PO-305 (זכוכית LOW-E) היא צוואר הבקבוק הקריטי — 85% השפעה על לו\"ז", type: "critical" },
];
const aiRecommendations = [
  "להאיץ הזמנת זכוכית LOW-E מספק חלופי באירופה — חיסכון של 5-7 ימים",
  "להגדיל צוות התקנה ב-2 עובדים לחודש אפריל-מאי לקיצור פער הלו\"ז",
  "לבקש מקדמה על CO-003 ו-CO-004 לצמצום פער מזומנים (₪367K)",
  "לתזמן בדיקת QC לאצווה 14 לפני המשך ייצור — חשד לפגם בחומר גלם",
  "להעביר ישיבת תיאום עם קבלן ראשי לנושא זמינות מנוף עד 10/04",
];

const fmt = (n: number) => "₪" + n.toLocaleString("he-IL");
const healthColor = (s: number) => s >= 80 ? "text-emerald-400" : s >= 60 ? "text-amber-400" : "text-red-400";
const stMap: Record<string, string> = { "הושלם": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", "בביצוע": "bg-blue-500/20 text-blue-400 border-blue-500/30", "ממתין": "bg-amber-500/20 text-amber-400 border-amber-500/30", "מתוכנן": "bg-gray-500/20 text-gray-400 border-gray-500/30", "חסום": "bg-red-500/20 text-red-400 border-red-500/30" };
const taskStatusColor = (s: string) => stMap[s] || "bg-gray-500/20 text-gray-400";
const prMap: Record<string, string> = { "קריטי": "bg-red-500/20 text-red-400 border-red-500/30", "גבוה": "bg-orange-500/20 text-orange-400 border-orange-500/30", "בינוני": "bg-blue-500/20 text-blue-400 border-blue-500/30", "נמוך": "bg-gray-500/20 text-gray-400 border-gray-500/30" };
const priorityColor = (p: string) => prMap[p] || "bg-gray-500/20 text-gray-400";
const riskColor = (s: number) => s >= 15 ? "bg-red-500/20 text-red-400" : s >= 9 ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400";
const poStMap: Record<string, string> = { "התקבל": "bg-emerald-500/20 text-emerald-400", "בהזמנה": "bg-blue-500/20 text-blue-400", "ייצור אצל ספק": "bg-purple-500/20 text-purple-400", "ממתין לאישור": "bg-amber-500/20 text-amber-400" };
const urgMap: Record<string, string> = { "קריטי": "bg-red-500/20 text-red-400", "דחוף": "bg-orange-500/20 text-orange-400", "בינוני": "bg-blue-500/20 text-blue-400" };
const coStMap: Record<string, string> = { "מאושר": "bg-emerald-500/20 text-emerald-400", "ממתין לאישור": "bg-amber-500/20 text-amber-400", "בבדיקה": "bg-blue-500/20 text-blue-400" };

export default function Project360Page() {
  const { data: api360 } = useQuery({
    queryKey: ["project-360"],
    queryFn: async () => { const r = await authFetch("/api/projects/360"); return r.json(); },
  });
  const project = api360?.project ?? api360?.data?.project ?? FALLBACK_360_PROJECT;
  const kpis = api360?.kpis ?? api360?.data?.kpis ?? FALLBACK_360_KPIS;
  const stages = api360?.stages ?? api360?.data?.stages ?? FALLBACK_360_STAGES;
  const team = api360?.team ?? api360?.data?.team ?? FALLBACK_360_TEAM;
  const recentEvents = api360?.recentEvents ?? api360?.data?.recentEvents ?? FALLBACK_360_EVENTS;
  const finance = api360?.finance ?? api360?.data?.finance ?? FALLBACK_360_FINANCE;
  const tasks = api360?.tasks ?? api360?.data?.tasks ?? FALLBACK_360_TASKS;
  const procurement = api360?.procurement ?? api360?.data?.procurement ?? FALLBACK_360_PROCUREMENT;
  const production = api360?.production ?? api360?.data?.production ?? FALLBACK_360_PRODUCTION;
  const installations = api360?.installations ?? api360?.data?.installations ?? FALLBACK_360_INSTALLATIONS;
  const risks = api360?.risks ?? api360?.data?.risks ?? FALLBACK_360_RISKS;
  const changeOrders = api360?.changeOrders ?? api360?.data?.changeOrders ?? FALLBACK_360_CHANGE_ORDERS;

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button variant="ghost" size="sm" className="gap-1 px-2"><ChevronLeft className="h-4 w-4" /> חזרה לפרויקטים</Button>
            <span className="text-muted-foreground/50">|</span>
            <span>{project.id}</span>
          </div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className="gap-1"><Building2 className="h-3 w-3" />{project.customer}</Badge>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">{project.status}</Badge>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">{project.stage}</Badge>
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">סיכון: {project.risk}</Badge>
            <div className={`flex items-center gap-1.5 font-bold text-lg ${healthColor(project.healthScore)}`}>
              <Activity className="h-4 w-4" />
              {project.healthScore}
              <span className="text-xs font-normal text-muted-foreground">/100</span>
            </div>
            <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" />{project.pm}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><FileText className="h-4 w-4 ml-1" />דוח</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700"><MessageSquare className="h-4 w-4 ml-1" />עדכון</Button>
        </div>
      </div>

      {/* ─── KPI Strip ─── */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="border-border/40">
            <CardContent className="p-3 text-center space-y-1">
              <div className={`mx-auto w-8 h-8 rounded-lg ${k.bg} flex items-center justify-center`}>
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <div className="text-lg font-bold">{k.value}</div>
              <div className="text-[11px] text-muted-foreground">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── 11 Tabs ─── */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/30 p-1 rounded-lg">
          <TabsTrigger value="overview" className="text-xs gap-1"><Eye className="h-3 w-3" />סקירה</TabsTrigger>
          <TabsTrigger value="finance" className="text-xs gap-1"><DollarSign className="h-3 w-3" />כספים</TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs gap-1"><ClipboardList className="h-3 w-3" />משימות</TabsTrigger>
          <TabsTrigger value="procurement" className="text-xs gap-1"><Package className="h-3 w-3" />רכש</TabsTrigger>
          <TabsTrigger value="production" className="text-xs gap-1"><Factory className="h-3 w-3" />ייצור</TabsTrigger>
          <TabsTrigger value="installation" className="text-xs gap-1"><HardHat className="h-3 w-3" />התקנות</TabsTrigger>
          <TabsTrigger value="risks" className="text-xs gap-1"><Shield className="h-3 w-3" />סיכונים</TabsTrigger>
          <TabsTrigger value="changes" className="text-xs gap-1"><GitBranch className="h-3 w-3" />שינויים</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs gap-1"><FileText className="h-3 w-3" />מסמכים</TabsTrigger>
          <TabsTrigger value="events" className="text-xs gap-1"><Activity className="h-3 w-3" />אירועים</TabsTrigger>
          <TabsTrigger value="ai" className="text-xs gap-1"><Brain className="h-3 w-3" />תובנות AI</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Overview ─── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 border-border/40">
              <CardHeader className="pb-2"><CardTitle className="text-sm">צינור שלבים — 17 שלבי פרויקט</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {stages.map((s, i) => (
                    <div key={i} className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                      i < project.stageIndex ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                      i === project.stageIndex ? "bg-blue-500/30 text-blue-300 border-blue-400 ring-1 ring-blue-400/50" :
                      "bg-muted/30 text-muted-foreground border-border/40"
                    }`}>
                      {i === project.stageIndex && <CircleDot className="inline h-3 w-3 ml-1" />}
                      {s}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/40">
              <CardHeader className="pb-2"><CardTitle className="text-sm">תאריכים מרכזיים</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">התחלה:</span><span>{project.startDate}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">סיום מתוכנן:</span><span>{project.endDate}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">סיום צפוי (AI):</span><span className="text-amber-400">22/07/2026</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">עדכון אחרון:</span><span>{project.lastUpdate}</span></div>
                <Progress value={62} className="h-2 mt-2" />
                <div className="text-center text-xs text-muted-foreground">62% הושלם</div>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/40">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />צוות פרויקט</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {team.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">{t.avatar}</div>
                    <div><div className="text-sm font-medium">{t.name}</div><div className="text-xs text-muted-foreground">{t.role}</div></div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-border/40">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />אירועים אחרונים</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {recentEvents.map((e, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-muted/20">
                    <e.icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div><div className="text-sm">{e.text}</div><div className="text-xs text-muted-foreground">{e.time}</div></div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Finance */}
        <TabsContent value="finance" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "ערך חוזה", value: fmt(finance.contractValue), color: "text-emerald-400" },
              { label: "חשבוניות שהונפקו", value: fmt(finance.invoiced), color: "text-blue-400" },
              { label: "נגבה בפועל", value: fmt(finance.collected), color: "text-teal-400" },
              { label: "פער מזומנים", value: fmt(finance.cashGap), color: "text-red-400" },
            ].map((f, i) => (
              <Card key={i} className="border-border/40">
                <CardContent className="p-3 text-center">
                  <div className={`text-xl font-bold ${f.color}`}>{f.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{f.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/40">
              <CardHeader className="pb-2"><CardTitle className="text-sm">תקציב מול ביצוע</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {finance.budgetLines.map((b, i) => {
                    const pct = Math.round((b.actual / b.budget) * 100);
                    const over = b.actual > b.budget;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{b.item}</span>
                          <span className={over ? "text-red-400" : "text-muted-foreground"}>
                            {fmt(b.actual)} / {fmt(b.budget)} ({pct}%)
                          </span>
                        </div>
                        <Progress value={Math.min(pct, 100)} className={`h-1.5 ${over ? "[&>div]:bg-red-500" : ""}`} />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/40">
              <CardHeader className="pb-2"><CardTitle className="text-sm">דוח רווח והפסד</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { l: "הכנסות (חוזה + שינויים)", v: fmt(finance.contractValue + 365000), c: "text-emerald-400", bg: "bg-muted/20" },
                  { l: "עלות ישירה", v: `(${fmt(finance.actualCost)})`, c: "text-red-400", bg: "bg-muted/20" },
                  { l: "רווח גולמי", v: `${fmt(finance.contractValue + 365000 - finance.actualCost)} (${finance.grossMargin}%)`, c: "text-emerald-400", bg: "bg-emerald-500/10", bold: true },
                  { l: "תקורות", v: `(${fmt(680000)})`, c: "text-red-400", bg: "bg-muted/20" },
                  { l: "רווח נקי", v: `${fmt(1355000)} (${finance.netMargin}%)`, c: "text-blue-400", bg: "bg-blue-500/10", bold: true },
                  { l: "פער גבייה", v: fmt(finance.cashGap), c: "text-red-400", bg: "bg-red-500/10" },
                ].map((row, i) => (
                  <div key={i} className={`flex justify-between p-2 rounded ${row.bg} ${row.bold ? "font-bold" : "text-sm"}`}><span>{row.l}</span><span className={row.c}>{row.v}</span></div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {/* Tab 3: Tasks */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="חיפוש משימות..." className="pr-9" /></div>
            <Badge variant="outline">סה״כ: {tasks.length}</Badge>
            <Badge className="bg-red-500/20 text-red-400">חסומות: {tasks.filter(t => t.st === "חסום").length}</Badge>
          </div>
          <Card className="border-border/40 overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted/30 text-xs text-muted-foreground">
                    <th className="p-2 text-right">#</th><th className="p-2 text-right">משימה</th><th className="p-2 text-center">סטטוס</th>
                    <th className="p-2 text-center">עדיפות</th><th className="p-2 text-right">אחראי</th>
                    <th className="p-2 text-center">תאריך יעד</th><th className="p-2 text-center">התקדמות</th>
                  </tr></thead>
                  <tbody>
                    {tasks.map((t) => (
                      <tr key={t.id} className={`border-t border-border/20 hover:bg-muted/10 ${t.par ? "bg-muted/5" : ""}`}>
                        <td className="p-2 text-xs text-muted-foreground">{t.par && "└ "}{t.id}</td>
                        <td className="p-2 font-medium">{t.name}</td>
                        <td className="p-2 text-center"><Badge className={`text-[10px] ${taskStatusColor(t.st)}`}>{t.st}</Badge></td>
                        <td className="p-2 text-center"><Badge className={`text-[10px] ${priorityColor(t.pr)}`}>{t.pr}</Badge></td>
                        <td className="p-2">{t.who}</td>
                        <td className="p-2 text-center text-xs">{t.due}</td>
                        <td className="p-2 w-28"><div className="flex items-center gap-2"><Progress value={t.pct} className="h-1.5 flex-1" /><span className="text-xs">{t.pct}%</span></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ─── Tab 4: Procurement ─── */}
        <TabsContent value="procurement" className="space-y-4">
          <Card className="border-border/40 overflow-hidden">
            <CardHeader className="pb-2"><CardTitle className="text-sm">הזמנות רכש — {procurement.length} פריטים</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted/30 text-xs text-muted-foreground">
                    <th className="p-2 text-right">#</th><th className="p-2 text-right">חומר</th><th className="p-2 text-center">כמות</th>
                    <th className="p-2 text-right">ספק</th><th className="p-2 text-center">סטטוס</th>
                    <th className="p-2 text-center">דחיפות</th><th className="p-2 text-center">תאריך</th><th className="p-2 text-left">עלות</th>
                  </tr></thead>
                  <tbody>
                    {procurement.map((p) => (
                      <tr key={p.id} className="border-t border-border/20 hover:bg-muted/10">
                        <td className="p-2 text-xs text-muted-foreground">{p.id}</td>
                        <td className="p-2 font-medium">{p.mat}</td>
                        <td className="p-2 text-center">{p.qty}</td>
                        <td className="p-2">{p.sup}</td>
                        <td className="p-2 text-center"><Badge className={`text-[10px] ${poStMap[p.status] || "bg-gray-500/20 text-gray-400"}`}>{p.status}</Badge></td>
                        <td className="p-2 text-center"><Badge className={`text-[10px] ${urgMap[p.urg] || "bg-gray-500/20 text-gray-400"}`}>{p.urg}</Badge></td>
                        <td className="p-2 text-center text-xs">{p.due}</td>
                        <td className="p-2 text-left">{fmt(p.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ─── Tab 5: Production ─── */}
        <TabsContent value="production" className="space-y-4">
          <Card className="border-border/40 overflow-hidden">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Factory className="h-4 w-4" />הוראות ייצור — {production.length} פקודות</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted/30 text-xs text-muted-foreground">
                    <th className="p-2 text-right">#</th><th className="p-2 text-right">תיאור</th><th className="p-2 text-right">עמדת עבודה</th>
                    <th className="p-2 text-center">סטטוס</th><th className="p-2 text-center">שעות מתוכננות</th>
                    <th className="p-2 text-center">שעות בפועל</th><th className="p-2 text-center">פחת %</th>
                  </tr></thead>
                  <tbody>
                    {production.map((p) => (
                      <tr key={p.id} className="border-t border-border/20 hover:bg-muted/10">
                        <td className="p-2 text-xs text-muted-foreground">{p.id}</td>
                        <td className="p-2 font-medium">{p.desc}</td>
                        <td className="p-2">{p.wc}</td>
                        <td className="p-2 text-center"><Badge className={`text-[10px] ${taskStatusColor(p.status)}`}>{p.status}</Badge></td>
                        <td className="p-2 text-center">{p.planned}</td>
                        <td className="p-2 text-center">{p.actual}</td>
                        <td className="p-2 text-center"><span className={p.scrap > 1.5 ? "text-red-400 font-bold" : ""}>{p.scrap}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ─── Tab 6: Installation ─── */}
        <TabsContent value="installation" className="space-y-4">
          <Card className="border-border/40 overflow-hidden">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><HardHat className="h-4 w-4" />ביקורי התקנה — {installations.length} ביקורים</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted/30 text-xs text-muted-foreground">
                    <th className="p-2 text-right">#</th><th className="p-2 text-center">סוג</th><th className="p-2 text-right">צוות</th>
                    <th className="p-2 text-center">תאריך</th><th className="p-2 text-right">קומות</th>
                    <th className="p-2 text-right">תוצאה</th><th className="p-2 text-center">חתימת לקוח</th>
                  </tr></thead>
                  <tbody>
                    {installations.map((ins) => (
                      <tr key={ins.id} className="border-t border-border/20 hover:bg-muted/10">
                        <td className="p-2 text-xs text-muted-foreground">{ins.id}</td>
                        <td className="p-2 text-center"><Badge className={`text-[10px] ${ins.type === "התקנה ראשית" ? "bg-blue-500/20 text-blue-400" : ins.type === "תיקון" ? "bg-amber-500/20 text-amber-400" : "bg-purple-500/20 text-purple-400"}`}>{ins.type}</Badge></td>
                        <td className="p-2">{ins.team}</td>
                        <td className="p-2 text-center text-xs">{ins.date}</td>
                        <td className="p-2">{ins.floors}</td>
                        <td className="p-2">{ins.outcome}</td>
                        <td className="p-2 text-center">{ins.signoff ? <CheckCircle className="h-4 w-4 text-emerald-400 mx-auto" /> : <Clock className="h-4 w-4 text-muted-foreground mx-auto" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ─── Tab 7: Risks ─── */}
        <TabsContent value="risks" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 border-border/40 overflow-hidden">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" />רישום סיכונים — {risks.length} סיכונים</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-muted/30 text-xs text-muted-foreground">
                      <th className="p-2 text-right">#</th><th className="p-2 text-right">תיאור</th>
                      <th className="p-2 text-center">הסתברות</th><th className="p-2 text-center">השפעה</th>
                      <th className="p-2 text-center">ציון</th><th className="p-2 text-center">סטטוס</th>
                    </tr></thead>
                    <tbody>
                      {risks.map((r) => (
                        <tr key={r.id} className="border-t border-border/20 hover:bg-muted/10">
                          <td className="p-2 text-xs text-muted-foreground">{r.id}</td>
                          <td className="p-2 font-medium">{r.desc}</td>
                          <td className="p-2 text-center">{r.prob}/5</td>
                          <td className="p-2 text-center">{r.impact}/5</td>
                          <td className="p-2 text-center"><Badge className={`text-[10px] ${riskColor(r.score)}`}>{r.score}</Badge></td>
                          <td className="p-2 text-center"><Badge variant="outline" className="text-[10px]">{r.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/40">
              <CardHeader className="pb-2"><CardTitle className="text-sm">תוכניות מיטיגציה</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {risks.map((r) => (
                  <div key={r.id} className="p-2 rounded-lg bg-muted/20 space-y-1">
                    <div className="flex items-center gap-2"><Badge className={`text-[10px] ${riskColor(r.score)}`}>{r.id}</Badge><span className="text-xs font-medium">{r.desc.slice(0, 35)}...</span></div>
                    <div className="text-xs text-muted-foreground">{r.mit}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {/* ─── Tab 8: Change Orders ─── */}
        <TabsContent value="changes" className="space-y-4">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Card className="border-border/40"><CardContent className="p-3 text-center"><div className="text-lg font-bold text-emerald-400">{fmt(changeOrders.reduce((s, c) => s + c.revenue, 0))}</div><div className="text-xs text-muted-foreground">תוספת הכנסה</div></CardContent></Card>
            <Card className="border-border/40"><CardContent className="p-3 text-center"><div className="text-lg font-bold text-red-400">{fmt(changeOrders.reduce((s, c) => s + c.cost, 0))}</div><div className="text-xs text-muted-foreground">תוספת עלות</div></CardContent></Card>
            <Card className="border-border/40"><CardContent className="p-3 text-center"><div className="text-lg font-bold text-amber-400">+{changeOrders.reduce((s, c) => s + c.days, 0)} ימים</div><div className="text-xs text-muted-foreground">השפעה על לו״ז</div></CardContent></Card>
          </div>
          <Card className="border-border/40 overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted/30 text-xs text-muted-foreground">
                    <th className="p-2 text-right">#</th><th className="p-2 text-right">תיאור</th><th className="p-2 text-center">תאריך</th>
                    <th className="p-2 text-left">תוספת הכנסה</th><th className="p-2 text-left">תוספת עלות</th>
                    <th className="p-2 text-center">ימים</th><th className="p-2 text-center">סטטוס</th>
                  </tr></thead>
                  <tbody>
                    {changeOrders.map((co) => (
                      <tr key={co.id} className="border-t border-border/20 hover:bg-muted/10">
                        <td className="p-2 text-xs text-muted-foreground">{co.id}</td>
                        <td className="p-2 font-medium">{co.desc}</td>
                        <td className="p-2 text-center text-xs">{co.date}</td>
                        <td className="p-2 text-left text-emerald-400">+{fmt(co.revenue)}</td>
                        <td className="p-2 text-left text-red-400">+{fmt(co.cost)}</td>
                        <td className="p-2 text-center">+{co.days}</td>
                        <td className="p-2 text-center"><Badge className={`text-[10px] ${coStMap[co.status] || "bg-blue-500/20 text-blue-400"}`}>{co.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 9: Documents ─── */}
        <TabsContent value="documents" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="חיפוש מסמכים..." className="pr-9" /></div>
            <Badge variant="outline">{documents.length} מסמכים</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {documents.map((d, i) => (
              <Card key={i} className="border-border/40 hover:border-blue-500/30 transition-colors cursor-pointer">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <FileCheck className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-sm font-medium leading-tight">{d.name}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{d.type}</Badge>
                    <Badge className="bg-muted/30 text-muted-foreground text-[10px]">{d.ver}</Badge>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{d.date}</span><span>{d.size}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ─── Tab 10: Events ─── */}
        <TabsContent value="events" className="space-y-4">
          <Card className="border-border/40">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" />ציר זמן אירועים — {auditEvents.length} אירועים אחרונים</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                {auditEvents.map((e, i) => (
                  <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/10 border-b border-border/10 last:border-0">
                    <div className="w-16 text-xs text-muted-foreground shrink-0 pt-0.5">{e.time}</div>
                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-blue-400">{e.user}</span>
                        <Badge variant="outline" className="text-[10px]">{e.act}</Badge>
                      </div>
                      <div className="text-sm mt-0.5">{e.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 11: AI Insights ─── */}
        <TabsContent value="ai" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="border-border/40">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4 text-purple-400" />ציוני AI — 5 מדדים</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {aiScores.map((s, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-sm"><span>{s.label}</span><span className="font-bold">{s.score}/100</span></div>
                    <div className="w-full h-2 rounded-full bg-muted/30"><div className={`h-full rounded-full ${s.color}`} style={{ width: `${s.score}%` }} /></div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-border/40">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" />תחזיות</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {aiPredictions.map((p, i) => (
                  <div key={i} className={`p-2.5 rounded-lg text-sm ${
                    p.type === "critical" ? "bg-red-500/10 border border-red-500/20" :
                    p.type === "warning" ? "bg-amber-500/10 border border-amber-500/20" :
                    "bg-blue-500/10 border border-blue-500/20"
                  }`}>
                    <div className="flex items-start gap-2">
                      {p.type === "critical" ? <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" /> :
                       p.type === "warning" ? <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" /> :
                       <TrendingUp className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />}
                      <span>{p.text}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-border/40">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Lightbulb className="h-4 w-4 text-emerald-400" />המלצות</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {aiRecommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/20 text-sm">
                    <Star className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>{r}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
