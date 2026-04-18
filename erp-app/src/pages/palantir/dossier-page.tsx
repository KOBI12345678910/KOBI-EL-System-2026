import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  FileText, User, Building2, Clock, Link2,
  BarChart3, MapPin, Edit3, Activity, Share2, Printer, Download,
  Shield, Star, Flag, Users, Briefcase, ShoppingCart, AlertTriangle,
  CheckCircle2, DollarSign, Calendar, Phone, Mail, Globe,
  TrendingUp, Plus, Eye, MessageSquare, Sparkles,
  Tag, Lock, ChevronRight, ExternalLink, Folder, Zap, Target,
  PieChart, Layers,
} from "lucide-react";

type TimelineEvent = {
  id: string;
  date: string;
  time: string;
  type: "create" | "payment" | "order" | "meeting" | "alert" | "note" | "update" | "call";
  title: string;
  description: string;
  actor: string;
  amount?: string;
};

type LinkedEntity = {
  id: string;
  name: string;
  type: "project" | "invoice" | "order" | "employee" | "supplier" | "contact";
  relationship: string;
  value?: string;
  status: string;
};

type Document = {
  id: string;
  name: string;
  type: string;
  size: string;
  uploaded: string;
  author: string;
  preview: string;
};

type Note = {
  id: string;
  author: string;
  date: string;
  content: string;
  classification: "public" | "internal" | "confidential";
};

const FALLBACK_SUBJECT = {
  id: "C-10021",
  name: "אלקטרה בנייה בע״מ",
  type: "customer",
  classification: "INTERNAL" as const,
  taxId: "514872341",
  investigator: "דני כהן",
  investigatorRole: "מנהל תיק לקוח",
  status: "active",
  priority: "high" as const,
  tags: ["VIP", "Gold Tier", "בנייה", "תל-אביב", "אסטרטגי"],
  createdAt: "2023-02-14",
  lastActivity: "לפני 2 שעות",
  summary: "אלקטרה בנייה בע״מ הינה לקוחה אסטרטגית מובילה בתחום הנדל״ן והבנייה הציבורית. החברה פועלת מול הארגון החל משנת 2023, וצברה מאז מחזור עסקים של ₪12.4M עם 48 הזמנות פעילות. הלקוחה מסווגת כ-Gold Tier בשל היקף הפעילות, היציבות הפיננסית ותדירות ההזמנות. מומלץ להמשיך בטיפול VIP ולבחון הגדלת מסגרת אשראי בהתאם לתחזית הפרויקטים לרבעון הקרוב.",
  aiSummary: "ניתוח AI: הלקוחה מציגה דפוסי רכישה צפויים עם צמיחה של 18% ביחס לשנה קודמת. זוהו 2 פרויקטים גדולים בביצוע פעיל (מגדלי ת״א, בית מלון רמת-גן) בשווי כולל של ₪12.9M. סיכון אשראי נמוך (ציון 15/100). המלצה: לשמר את הקשר עם דגש על שירות טכני ומענה מהיר.",
  metrics: {
    totalRevenue: "₪12.4M",
    openOrders: 48,
    avgOrderValue: "₪258K",
    outstandingBalance: "₪325K",
    creditLimit: "₪2.5M",
    creditUsed: 18,
    onTimePayments: 94,
    riskScore: 15,
    npsScore: 9.2,
    yearsActive: 3,
  },
  location: {
    city: "תל-אביב",
    address: "יגאל אלון 65, תל-אביב 6744321",
    coords: { lat: 32.0664, lng: 34.7905 },
  },
  contact: {
    phone: "03-6123456",
    email: "office@electra-build.co.il",
    website: "www.electra-build.co.il",
    primaryContact: "יעקב שלום",
    primaryRole: "סמנכ״ל רכש",
  },
};

const FALLBACK_TIMELINE: TimelineEvent[] = [
  { id: "t1", date: "2026-04-08", time: "14:32", type: "payment", title: "תשלום התקבל", description: "חשבונית INV-7820 שולמה במלואה", actor: "מערכת", amount: "₪184,500" },
  { id: "t2", date: "2026-04-08", time: "11:05", type: "call", title: "שיחה עם יעקב שלום", description: "דיון על תוספת הזמנה למגדלי ת״א", actor: "דני כהן" },
  { id: "t3", date: "2026-04-07", time: "16:48", type: "order", title: "הזמנת רכש חדשה", description: "PO-4645 - 45 פריטי אלומיניום 6063", actor: "יעקב שלום", amount: "₪56,300" },
  { id: "t4", date: "2026-04-07", time: "09:20", type: "meeting", title: "פגישת סטטוס שבועית", description: "סקירת התקדמות פרויקט מגדלי ת״א מתחם 7", actor: "יוסי אברהם" },
  { id: "t5", date: "2026-04-05", time: "13:15", type: "note", title: "הערת מנהל תיק", description: "הלקוח ביקש הקדמת אספקה לפרויקט בית מלון רמת-גן", actor: "דני כהן" },
  { id: "t6", date: "2026-04-05", time: "10:30", type: "update", title: "עדכון מסגרת אשראי", description: "אישור הגדלת מסגרת ל-₪2.5M", actor: "CFO - רונן אילון" },
  { id: "t7", date: "2026-04-03", time: "17:22", type: "order", title: "הזמנת רכש", description: "PO-4534 - רכיבי אלקטרוניקה", actor: "יעקב שלום", amount: "₪89,400" },
  { id: "t8", date: "2026-04-02", time: "14:10", type: "payment", title: "תשלום התקבל", description: "חשבונית INV-7812", actor: "מערכת", amount: "₪245,000" },
  { id: "t9", date: "2026-04-01", time: "11:45", type: "alert", title: "התראה אוטומטית", description: "יתרה פתוחה חורגת מ-₪300K", actor: "מערכת" },
  { id: "t10", date: "2026-03-28", time: "15:30", type: "meeting", title: "פגישת תיאום הנדסי", description: "תיאום מפרטים טכניים עם מחלקת ההנדסה", actor: "מיכל ברק" },
  { id: "t11", date: "2026-03-25", time: "09:00", type: "order", title: "הזמנה גדולה", description: "PO-4489 - חומרי גלם לבית מלון", actor: "יעקב שלום", amount: "₪412,000" },
  { id: "t12", date: "2026-03-22", time: "12:15", type: "call", title: "שיחת שירות", description: "בקשה לעדכון סטטוס אספקה", actor: "דני כהן" },
  { id: "t13", date: "2026-03-20", time: "16:00", type: "note", title: "פגישה עם CEO הלקוח", description: "סיכום פגישה עם ענת אלקטרה - שיחה על שיתוף פעולה ארוך טווח", actor: "דני כהן" },
  { id: "t14", date: "2026-03-18", time: "10:20", type: "payment", title: "תשלום התקבל", description: "חשבוניות מרץ מרוכזות", actor: "מערכת", amount: "₪680,000" },
  { id: "t15", date: "2026-03-15", time: "14:45", type: "update", title: "עדכון פרטי לקוח", description: "עדכון כתובת למשרד חדש", actor: "מערכת" },
  { id: "t16", date: "2026-03-12", time: "11:30", type: "order", title: "הזמנת ניסיון", description: "PO-4412 - בדיקת קצף PU חדש", actor: "יעקב שלום", amount: "₪12,800" },
  { id: "t17", date: "2026-03-10", time: "09:15", type: "meeting", title: "סיור שטח", description: "ביקור באתר מגדלי ת״א לבחינת התקדמות", actor: "יוסי אברהם" },
  { id: "t18", date: "2026-03-05", time: "13:40", type: "note", title: "הערת איכות", description: "התקבל משוב חיובי על פרויקט הושלם", actor: "יעל מנחם" },
  { id: "t19", date: "2026-03-02", time: "15:20", type: "call", title: "שיחת תיאום", description: "תיאום לוחות זמנים רבעון הבא", actor: "דני כהן" },
  { id: "t20", date: "2026-02-28", time: "10:00", type: "payment", title: "תשלום התקבל", description: "חשבוניות פברואר", actor: "מערכת", amount: "₪540,000" },
  { id: "t21", date: "2026-02-25", time: "14:30", type: "order", title: "הזמנה גדולה", description: "PO-4312 - חומרי בידוד", actor: "יעקב שלום", amount: "₪234,500" },
  { id: "t22", date: "2026-02-20", time: "11:10", type: "alert", title: "התראה: שליש מסגרת", description: "ניצול אשראי חצה 33%", actor: "מערכת" },
  { id: "t23", date: "2026-02-15", time: "16:00", type: "meeting", title: "פגישה רבעונית", description: "סיכום Q4 2025 ותכנון Q1 2026", actor: "דני כהן" },
  { id: "t24", date: "2026-02-10", time: "09:30", type: "update", title: "שדרוג ל-Gold Tier", description: "העלאה לדירוג Gold לאחר הערכה שנתית", actor: "רונן אילון" },
  { id: "t25", date: "2026-02-05", time: "13:15", type: "order", title: "הזמנה", description: "PO-4278", actor: "יעקב שלום", amount: "₪167,300" },
  { id: "t26", date: "2026-01-28", time: "10:45", type: "note", title: "הערה מסחרית", description: "הלקוח מראה עניין בקו מוצרים חדש", actor: "דני כהן" },
  { id: "t27", date: "2026-01-25", time: "15:00", type: "payment", title: "תשלום שוטף", description: "חשבוניות ינואר", actor: "מערכת", amount: "₪720,000" },
  { id: "t28", date: "2026-01-20", time: "11:20", type: "call", title: "שיחה טכנית", description: "פתרון בעיית איכות בהזמנה קודמת", actor: "מיכל ברק" },
  { id: "t29", date: "2026-01-15", time: "14:00", type: "meeting", title: "אסיפה שנתית", description: "פגישת אסטרטגיה שנתית", actor: "CEO - איתי לוי" },
  { id: "t30", date: "2026-01-10", time: "09:45", type: "order", title: "הזמנת פתיחת שנה", description: "PO-4156", actor: "יעקב שלום", amount: "₪345,000" },
  { id: "t31", date: "2026-01-05", time: "16:30", type: "update", title: "עדכון חוזה שנתי", description: "חוזה שנתי חודש ב-12%", actor: "רונן אילון" },
  { id: "t32", date: "2025-12-28", time: "10:00", type: "payment", title: "תשלום סוף שנה", description: "סגירת שנת 2025", actor: "מערכת", amount: "₪1,280,000" },
];

const FALLBACK_LINKED: LinkedEntity[] = [
  { id: "PRJ-2024-A", name: "מגדלי תל-אביב מתחם 7", type: "project", relationship: "בעלים", value: "₪4.2M", status: "פעיל" },
  { id: "PRJ-2024-B", name: "בית מלון רמת-גן", type: "project", relationship: "בעלים", value: "₪8.7M", status: "פעיל" },
  { id: "INV-7821", name: "INV-7821", type: "invoice", relationship: "חשבונית", value: "₪325,000", status: "ממתין" },
  { id: "INV-7834", name: "INV-7834", type: "invoice", relationship: "חשבונית", value: "₪780,000", status: "פעיל" },
  { id: "INV-7812", name: "INV-7812", type: "invoice", relationship: "חשבונית", value: "₪184,500", status: "שולם" },
  { id: "INV-7791", name: "INV-7791", type: "invoice", relationship: "חשבונית", value: "₪245,000", status: "שולם" },
  { id: "PO-4645", name: "PO-4645", type: "order", relationship: "הזמנת רכש", value: "₪56,300", status: "פעיל" },
  { id: "PO-4534", name: "PO-4534", type: "order", relationship: "הזמנת רכש", value: "₪89,400", status: "פעיל" },
  { id: "PO-4489", name: "PO-4489", type: "order", relationship: "הזמנת רכש", value: "₪412,000", status: "בביצוע" },
  { id: "PO-4412", name: "PO-4412", type: "order", relationship: "הזמנת רכש", value: "₪12,800", status: "הושלם" },
  { id: "EMP-4421", name: "יוסי אברהם", type: "employee", relationship: "מנהל פרויקט", status: "מוקצה" },
  { id: "EMP-4478", name: "דני כהן", type: "employee", relationship: "מנהל תיק", status: "מוקצה" },
  { id: "EMP-4502", name: "מיכל ברק", type: "employee", relationship: "מהנדסת אחראית", status: "מוקצה" },
  { id: "CONTACT-1", name: "יעקב שלום", type: "contact", relationship: "איש קשר ראשי", status: "פעיל" },
  { id: "CONTACT-2", name: "ענת אלקטרה", type: "contact", relationship: "CEO", status: "פעיל" },
];

const FALLBACK_DOCUMENTS: Document[] = [
  { id: "doc1", name: "חוזה מסגרת 2026.pdf", type: "pdf", size: "2.4 MB", uploaded: "2026-01-05", author: "רונן אילון", preview: "chart" },
  { id: "doc2", name: "הסכם סודיות NDA.pdf", type: "pdf", size: "890 KB", uploaded: "2023-02-14", author: "מחלקת משפטי", preview: "doc" },
  { id: "doc3", name: "תכניות מגדלי ת״א.dwg", type: "dwg", size: "18.2 MB", uploaded: "2024-02-01", author: "יוסי אברהם", preview: "design" },
  { id: "doc4", name: "מפרט טכני בית מלון.docx", type: "docx", size: "1.1 MB", uploaded: "2024-05-15", author: "מיכל ברק", preview: "doc" },
  { id: "doc5", name: "אישור מסגרת אשראי.pdf", type: "pdf", size: "340 KB", uploaded: "2026-04-05", author: "CFO", preview: "doc" },
  { id: "doc6", name: "דוח איכות Q4.xlsx", type: "xlsx", size: "680 KB", uploaded: "2026-01-15", author: "יעל מנחם", preview: "chart" },
  { id: "doc7", name: "תעודת עוסק מורשה.pdf", type: "pdf", size: "120 KB", uploaded: "2023-02-14", author: "מערכת", preview: "doc" },
  { id: "doc8", name: "דוח אשראי BDI.pdf", type: "pdf", size: "540 KB", uploaded: "2026-02-10", author: "מערכת", preview: "chart" },
];

const FALLBACK_NOTES: Note[] = [
  { id: "n1", author: "דני כהן", date: "2026-04-08", classification: "internal", content: "# פגישת סטטוס 08/04\n\nהלקוח מרוצה מקצב האספקה ברבעון. ביקש **תוספת הזמנה** של 200 יחידות לפרופיל אלומיניום למגדלי ת״א. צריך לבדוק זמינות מלאי." },
  { id: "n2", author: "דני כהן", date: "2026-03-20", classification: "confidential", content: "# פגישה עם ענת אלקטרה (CEO)\n\nשיחה חיובית מאוד. החברה מתכננת **הרחבת פעילות** לפרויקטים נוספים בצפון. מומלץ להכין הצעה מיוחדת." },
  { id: "n3", author: "יוסי אברהם", date: "2026-03-10", classification: "internal", content: "# סיור שטח מגדלי ת״א\n\nהפרויקט מתקדם לפי לו״ז. זוהו 2 נקודות שדורשות תשומת לב בהנדסה. הלקוח מעריך את המקצועיות." },
  { id: "n4", author: "מיכל ברק", date: "2026-02-25", classification: "internal", content: "# בעיית איכות\n\nדיווח על פגם קל בפרופיל מ-PO-4312. **פתרנו** עם החלפה תוך 24 שעות. הלקוח הביע הוקרה." },
  { id: "n5", author: "רונן אילון", date: "2026-02-10", classification: "confidential", content: "# הערכה שנתית\n\nהמלצה לשדרוג ל-**Gold Tier** מבוסס על:\n- מחזור > ₪10M\n- תשלומים בזמן 94%\n- צמיחה יציבה" },
  { id: "n6", author: "דני כהן", date: "2026-01-15", classification: "public", content: "# פתיחת 2026\n\nפגישת פתיחת שנה עם ההנהלה. הוסכם על **יעדי צמיחה של 20%** ב-2026." },
];

type Section = "summary" | "timeline" | "links" | "documents" | "metrics" | "map" | "notes" | "activity";

export default function DossierPage() {
  const [section, setSection] = useState<Section>("summary");

  const { data } = useQuery({
    queryKey: ["palantir-dossier", "C-10021"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/palantir/dossier/C-10021");
        if (!res.ok) throw new Error();
        return await res.json();
      } catch {
        return {
          subject: FALLBACK_SUBJECT,
          timeline: FALLBACK_TIMELINE,
          links: FALLBACK_LINKED,
          documents: FALLBACK_DOCUMENTS,
          notes: FALLBACK_NOTES,
        };
      }
    },
  });

  const subject = data?.subject || FALLBACK_SUBJECT;
  const timeline: TimelineEvent[] = data?.timeline || FALLBACK_TIMELINE;
  const links: LinkedEntity[] = data?.links || FALLBACK_LINKED;
  const documents: Document[] = data?.documents || FALLBACK_DOCUMENTS;
  const notes: Note[] = data?.notes || FALLBACK_NOTES;

  const sections: { id: Section; label: string; icon: any; count?: number }[] = [
    { id: "summary", label: "סיכום", icon: FileText },
    { id: "timeline", label: "ציר זמן", icon: Clock, count: timeline.length },
    { id: "links", label: "קשרים", icon: Link2, count: links.length },
    { id: "documents", label: "מסמכים", icon: Folder, count: documents.length },
    { id: "metrics", label: "מדדים", icon: BarChart3 },
    { id: "map", label: "מיקום", icon: MapPin },
    { id: "notes", label: "הערות", icon: Edit3, count: notes.length },
    { id: "activity", label: "יומן פעילות", icon: Activity },
  ];

  const timelineIcon = (type: string) => {
    switch (type) {
      case "payment": return { icon: DollarSign, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
      case "order": return { icon: ShoppingCart, color: "text-blue-400 bg-blue-500/10 border-blue-500/30" };
      case "meeting": return { icon: Users, color: "text-violet-400 bg-violet-500/10 border-violet-500/30" };
      case "alert": return { icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/30" };
      case "note": return { icon: Edit3, color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
      case "update": return { icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" };
      case "call": return { icon: Phone, color: "text-pink-400 bg-pink-500/10 border-pink-500/30" };
      case "create": return { icon: Plus, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
      default: return { icon: Activity, color: "text-slate-400 bg-slate-500/10 border-slate-500/30" };
    }
  };

  const linkIcon = (type: string) => {
    switch (type) {
      case "project": return Briefcase;
      case "invoice": return FileText;
      case "order": return ShoppingCart;
      case "employee": return User;
      case "supplier": return Building2;
      case "contact": return User;
      default: return Tag;
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-slate-200">
      {/* TOP - Subject Header */}
      <div className="border-b border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-900/30 backdrop-blur">
        <div className="px-6 py-5">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl border-2 border-blue-500/50 bg-gradient-to-br from-blue-500/20 to-violet-500/20 shadow-lg shadow-blue-500/10">
              <Building2 className="h-10 w-10 text-blue-400" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500 uppercase">Dossier</span>
                  <span className="text-[10px] font-mono text-blue-400">{subject.id}</span>
                </div>
                <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px] uppercase tracking-wider">
                  <Lock className="ml-0.5 h-2.5 w-2.5" />
                  {subject.classification}
                </Badge>
                <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] uppercase">
                  <Flag className="ml-0.5 h-2.5 w-2.5" />
                  {subject.priority} priority
                </Badge>
              </div>

              <h1 className="mt-1 text-3xl font-bold text-white">{subject.name}</h1>
              <p className="text-sm text-slate-400">לקוח אסטרטגי · מ.עוסק {subject.taxId} · חבר משנת {new Date(subject.createdAt).getFullYear()}</p>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {subject.tags.map((t) => (
                  <Badge key={t} className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">
                    <Tag className="ml-0.5 h-2.5 w-2.5" />
                    {t}
                  </Badge>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-5 text-xs">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700">
                    <User className="h-3.5 w-3.5 text-slate-300" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">חוקר / מנהל</div>
                    <div className="text-slate-200 font-medium">{subject.investigator}</div>
                  </div>
                </div>
                <div className="h-8 w-px bg-slate-700"></div>
                <div>
                  <div className="text-[10px] text-slate-500">סטטוס</div>
                  <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">פעיל</Badge>
                </div>
                <div className="h-8 w-px bg-slate-700"></div>
                <div>
                  <div className="text-[10px] text-slate-500">פעילות אחרונה</div>
                  <div className="text-slate-200">{subject.lastActivity}</div>
                </div>
                <div className="h-8 w-px bg-slate-700"></div>
                <div>
                  <div className="text-[10px] text-slate-500">ציון סיכון</div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-16 rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${subject.metrics.riskScore}%` }}></div>
                    </div>
                    <span className="font-mono text-emerald-400">{subject.metrics.riskScore}/100</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-9 border-slate-700 bg-slate-900/50 hover:bg-slate-800">
                <Share2 className="ml-1.5 h-4 w-4" />
                שתף
              </Button>
              <Button size="sm" variant="outline" className="h-9 border-slate-700 bg-slate-900/50 hover:bg-slate-800">
                <Printer className="ml-1.5 h-4 w-4" />
                הדפס
              </Button>
              <Button size="sm" variant="outline" className="h-9 border-slate-700 bg-slate-900/50 hover:bg-slate-800">
                <Download className="ml-1.5 h-4 w-4" />
                ייצוא
              </Button>
              <Button size="sm" className="h-9 bg-blue-600 hover:bg-blue-700">
                <Sparkles className="ml-1.5 h-4 w-4" />
                ניתוח AI
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-172px)]">
        {/* LEFT SIDEBAR - Sections */}
        <aside className="w-56 flex-shrink-0 border-l border-slate-800 bg-slate-900/30 overflow-y-auto">
          <div className="border-b border-slate-800 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">ניווט בתיק</p>
          </div>
          <nav className="p-2">
            {sections.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`mb-0.5 flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-right transition-all ${
                    active
                      ? "bg-blue-500/15 border border-blue-500/30"
                      : "hover:bg-slate-800/60 border border-transparent"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-blue-400" : "text-slate-400"}`} />
                  <span className={`flex-1 text-sm ${active ? "text-white font-medium" : "text-slate-300"}`}>{s.label}</span>
                  {s.count != null && (
                    <span className={`text-[10px] font-mono ${active ? "text-blue-400" : "text-slate-500"}`}>{s.count}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 overflow-y-auto">
          {/* SUMMARY */}
          {section === "summary" && (
            <div className="p-6 space-y-4">
              <Card className="border-slate-800 bg-slate-900/40">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-4 w-4 text-blue-400" />
                    <h3 className="text-sm font-semibold text-white">סיכום כללי</h3>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">{subject.summary}</p>
                </CardContent>
              </Card>

              <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-violet-500/5">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <h3 className="text-sm font-semibold text-blue-300">סיכום AI אוטומטי</h3>
                    <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-[10px]">GPT-4</Badge>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">{subject.aiSummary}</p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-4 gap-3">
                <Card className="border-slate-800 bg-slate-900/40">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">הכנסות כוללות</span>
                      <DollarSign className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="mt-1 text-2xl font-bold text-white">{subject.metrics.totalRevenue}</div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-400">
                      <TrendingUp className="h-3 w-3" />
                      +18% שנתי
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900/40">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">הזמנות פעילות</span>
                      <ShoppingCart className="h-4 w-4 text-blue-400" />
                    </div>
                    <div className="mt-1 text-2xl font-bold text-white">{subject.metrics.openOrders}</div>
                    <div className="mt-1 text-[10px] text-slate-400">ממוצע: {subject.metrics.avgOrderValue}</div>
                  </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900/40">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">יתרה פתוחה</span>
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                    </div>
                    <div className="mt-1 text-2xl font-bold text-white">{subject.metrics.outstandingBalance}</div>
                    <div className="mt-1 text-[10px] text-slate-400">ניצול: {subject.metrics.creditUsed}%</div>
                  </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900/40">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">NPS Score</span>
                      <Star className="h-4 w-4 text-violet-400" />
                    </div>
                    <div className="mt-1 text-2xl font-bold text-white">{subject.metrics.npsScore}</div>
                    <div className="mt-1 text-[10px] text-emerald-400">גבוה · ממליצים</div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-slate-800 bg-slate-900/40">
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold text-white mb-3">פרטי קשר</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
                      <Phone className="h-4 w-4 text-blue-400" />
                      <div>
                        <div className="text-[10px] text-slate-500">טלפון</div>
                        <div className="text-sm text-slate-200 font-mono">{subject.contact.phone}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
                      <Mail className="h-4 w-4 text-blue-400" />
                      <div>
                        <div className="text-[10px] text-slate-500">אימייל</div>
                        <div className="text-sm text-slate-200 font-mono">{subject.contact.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
                      <Globe className="h-4 w-4 text-blue-400" />
                      <div>
                        <div className="text-[10px] text-slate-500">אתר</div>
                        <div className="text-sm text-slate-200 font-mono">{subject.contact.website}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
                      <User className="h-4 w-4 text-blue-400" />
                      <div>
                        <div className="text-[10px] text-slate-500">איש קשר ראשי</div>
                        <div className="text-sm text-slate-200">{subject.contact.primaryContact} · {subject.contact.primaryRole}</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TIMELINE */}
          {section === "timeline" && (
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">ציר זמן פעילות</h2>
                  <p className="text-xs text-slate-400">{timeline.length} אירועים לאורך 3 שנים</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-8 border-slate-700 bg-slate-900/50 text-xs">
                    <Calendar className="ml-1 h-3 w-3" />
                    סנן תאריך
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 border-slate-700 bg-slate-900/50 text-xs">
                    <Download className="ml-1 h-3 w-3" />
                    ייצא
                  </Button>
                </div>
              </div>
              <div className="relative">
                <div className="absolute right-5 top-0 bottom-0 w-px bg-slate-800"></div>
                <div className="space-y-3">
                  {timeline.map((e) => {
                    const { icon: Icon, color } = timelineIcon(e.type);
                    return (
                      <div key={e.id} className="relative flex gap-4">
                        <div className={`relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border ${color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <Card className="flex-1 border-slate-800 bg-slate-900/40">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-white">{e.title}</h4>
                                {e.amount && <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">{e.amount}</Badge>}
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono">{e.date} · {e.time}</span>
                            </div>
                            <p className="text-xs text-slate-400">{e.description}</p>
                            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500">
                              <User className="h-2.5 w-2.5" />
                              {e.actor}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* LINKS */}
          {section === "links" && (
            <div className="p-6">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-white">ישויות מקושרות</h2>
                <p className="text-xs text-slate-400">{links.length} קשרים בין הלקוח לישויות אחרות במערכת</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {links.map((l) => {
                  const Icon = linkIcon(l.type);
                  return (
                    <Card key={l.id} className="border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/50">
                            <Icon className="h-4 w-4 text-blue-400" />
                          </div>
                          <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">{l.status}</Badge>
                        </div>
                        <div className="font-mono text-[10px] text-slate-500">{l.id}</div>
                        <h4 className="text-sm font-semibold text-white mt-0.5">{l.name}</h4>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                          <Link2 className="h-3 w-3" />
                          {l.relationship}
                        </div>
                        {l.value && (
                          <div className="mt-2 pt-2 border-t border-slate-800">
                            <div className="text-[10px] text-slate-500">שווי</div>
                            <div className="font-mono text-sm font-semibold text-emerald-400">{l.value}</div>
                          </div>
                        )}
                        <Button size="sm" variant="ghost" className="mt-2 h-6 w-full text-[10px] text-blue-400">
                          <ExternalLink className="ml-1 h-2.5 w-2.5" />
                          פתח
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* DOCUMENTS */}
          {section === "documents" && (
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">מסמכים מצורפים</h2>
                  <p className="text-xs text-slate-400">{documents.length} קבצים בתיק</p>
                </div>
                <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700">
                  <Plus className="ml-1 h-3 w-3" />
                  העלה קובץ
                </Button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {documents.map((d) => (
                  <Card key={d.id} className="border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 cursor-pointer">
                    <CardContent className="p-3">
                      <div className={`mb-2 h-28 rounded-md border border-slate-800 bg-slate-800/40 flex items-center justify-center ${
                        d.preview === "chart" ? "bg-gradient-to-br from-blue-500/10 to-violet-500/10" : d.preview === "design" ? "bg-gradient-to-br from-emerald-500/10 to-cyan-500/10" : ""
                      }`}>
                        {d.preview === "chart" ? <BarChart3 className="h-8 w-8 text-blue-400/60" /> : d.preview === "design" ? <Layers className="h-8 w-8 text-emerald-400/60" /> : <FileText className="h-8 w-8 text-slate-500" />}
                      </div>
                      <div className="flex items-start gap-2">
                        <div className={`flex h-7 w-7 items-center justify-center rounded text-[9px] font-bold uppercase ${
                          d.type === "pdf" ? "bg-red-500/20 text-red-400" :
                          d.type === "docx" ? "bg-blue-500/20 text-blue-400" :
                          d.type === "xlsx" ? "bg-emerald-500/20 text-emerald-400" :
                          "bg-violet-500/20 text-violet-400"
                        }`}>
                          {d.type}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-semibold text-white truncate">{d.name}</h4>
                          <div className="text-[10px] text-slate-500">{d.size} · {d.uploaded}</div>
                        </div>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">
                        <User className="h-2.5 w-2.5" /> {d.author}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* METRICS */}
          {section === "metrics" && (
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-bold text-white">מדדי ביצוע</h2>

              <div className="grid grid-cols-4 gap-3">
                <Card className="border-slate-800 bg-slate-900/40">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs text-slate-400">הכנסות</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{subject.metrics.totalRevenue}</div>
                    <Progress value={85} className="mt-2 h-1" />
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span>יעד: ₪15M</span>
                      <span className="text-emerald-400">82%</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900/40">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-400" />
                      <span className="text-xs text-slate-400">תשלום בזמן</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{subject.metrics.onTimePayments}%</div>
                    <Progress value={subject.metrics.onTimePayments} className="mt-2 h-1" />
                  </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900/40">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs text-slate-400">ציון סיכון</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{subject.metrics.riskScore}</div>
                    <div className="mt-1 text-[10px] text-emerald-400">סיכון נמוך</div>
                  </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900/40">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-violet-400" />
                      <span className="text-xs text-slate-400">ניצול אשראי</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{subject.metrics.creditUsed}%</div>
                    <div className="mt-1 text-[10px] text-slate-500">מ-{subject.metrics.creditLimit}</div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-slate-800 bg-slate-900/40">
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold text-white mb-3">הכנסות חודשיות - 12 חודשים אחרונים</h3>
                  <div className="flex items-end gap-2 h-32">
                    {[620, 780, 540, 890, 720, 680, 950, 1100, 820, 1240, 1050, 1180].map((v, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-blue-500/40 to-blue-400/60 hover:from-blue-500/60 hover:to-blue-400/80 transition-all"
                          style={{ height: `${(v / 1240) * 100}%` }}
                        ></div>
                        <span className="text-[9px] text-slate-500">{["ינ", "פב", "מר", "אפ", "מא", "יו", "יל", "או", "ספ", "אק", "נו", "דצ"][i]}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card className="border-slate-800 bg-slate-900/40">
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-white mb-3">פילוח הזמנות לפי סוג</h3>
                    <div className="space-y-2">
                      {[
                        { label: "חומרי גלם", v: 45, c: "bg-blue-400" },
                        { label: "רכיבים", v: 28, c: "bg-emerald-400" },
                        { label: "שירותים", v: 18, c: "bg-violet-400" },
                        { label: "אחר", v: 9, c: "bg-amber-400" },
                      ].map((r, i) => (
                        <div key={i}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-400">{r.label}</span>
                            <span className="font-mono text-slate-200">{r.v}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-800">
                            <div className={`h-full rounded-full ${r.c}`} style={{ width: `${r.v}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-800 bg-slate-900/40">
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold text-white mb-3">KPIs נוספים</h3>
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between p-2 rounded bg-slate-800/40">
                        <span className="text-slate-400">ערך ממוצע להזמנה</span>
                        <span className="font-mono text-white">{subject.metrics.avgOrderValue}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-slate-800/40">
                        <span className="text-slate-400">שנים כלקוח</span>
                        <span className="font-mono text-white">{subject.metrics.yearsActive}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-slate-800/40">
                        <span className="text-slate-400">NPS</span>
                        <span className="font-mono text-emerald-400">{subject.metrics.npsScore}/10</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-slate-800/40">
                        <span className="text-slate-400">LTV חזוי</span>
                        <span className="font-mono text-white">₪42.6M</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* MAP */}
          {section === "map" && (
            <div className="p-6">
              <h2 className="text-lg font-bold text-white mb-4">מיקום גיאוגרפי</h2>
              <Card className="border-slate-800 bg-slate-900/40">
                <CardContent className="p-0">
                  <div className="relative h-[500px] rounded-md overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950">
                    {/* Map placeholder with grid */}
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 500">
                      <defs>
                        <pattern id="mapgrid" width="40" height="40" patternUnits="userSpaceOnUse">
                          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" />
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#mapgrid)" />
                      {/* Mock coastline */}
                      <path d="M 100 100 Q 150 150, 120 250 T 180 400" stroke="#334155" strokeWidth="2" fill="none" />
                      <path d="M 600 50 Q 650 200, 680 350 T 720 480" stroke="#334155" strokeWidth="2" fill="none" />
                      {/* Pin for subject */}
                      <g transform="translate(400 250)">
                        <circle r="30" fill="#3b82f6" opacity="0.2">
                          <animate attributeName="r" values="30;50;30" dur="2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
                        </circle>
                        <circle r="8" fill="#3b82f6" />
                        <circle r="8" fill="none" stroke="#fff" strokeWidth="2" />
                      </g>
                      <g transform="translate(400 250)">
                        <rect x="-60" y="-45" width="120" height="28" rx="4" fill="#0a0e1a" stroke="#3b82f6" />
                        <text y="-27" textAnchor="middle" fontSize="11" fill="#fff" fontWeight="600">אלקטרה בנייה</text>
                      </g>
                      {/* Related pins */}
                      <g transform="translate(320 180)">
                        <circle r="5" fill="#a78bfa" />
                        <text y="-10" textAnchor="middle" fontSize="8" fill="#a78bfa">מגדלי ת״א</text>
                      </g>
                      <g transform="translate(480 210)">
                        <circle r="5" fill="#a78bfa" />
                        <text y="-10" textAnchor="middle" fontSize="8" fill="#a78bfa">בית מלון ר״ג</text>
                      </g>
                    </svg>
                    <div className="absolute top-4 right-4 rounded-md border border-slate-700 bg-slate-900/80 backdrop-blur p-3 text-xs">
                      <div className="text-[10px] text-slate-500 mb-1">כתובת ראשית</div>
                      <div className="text-slate-200">{subject.location.address}</div>
                      <div className="mt-1 font-mono text-[10px] text-slate-500">
                        {subject.location.coords.lat}°N, {subject.location.coords.lng}°E
                      </div>
                    </div>
                    <div className="absolute bottom-4 left-4 rounded-md border border-slate-700 bg-slate-900/80 backdrop-blur p-2 flex items-center gap-2 text-xs">
                      <div className="h-2 w-2 rounded-full bg-blue-400"></div>
                      <span className="text-slate-300">לקוח</span>
                      <span className="text-slate-600">·</span>
                      <div className="h-2 w-2 rounded-full bg-violet-400"></div>
                      <span className="text-slate-300">פרויקטים</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* NOTES */}
          {section === "notes" && (
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">הערות חוקר</h2>
                  <p className="text-xs text-slate-400">{notes.length} הערות בתיק</p>
                </div>
                <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700">
                  <Plus className="ml-1 h-3 w-3" />
                  הערה חדשה
                </Button>
              </div>
              <div className="space-y-3">
                {notes.map((n) => (
                  <Card key={n.id} className="border-slate-800 bg-slate-900/40">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700">
                            <User className="h-3 w-3 text-slate-300" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-slate-200">{n.author}</div>
                            <div className="text-[10px] text-slate-500">{n.date}</div>
                          </div>
                        </div>
                        <Badge className={`text-[10px] ${
                          n.classification === "confidential" ? "bg-red-500/15 text-red-400 border-red-500/30" :
                          n.classification === "internal" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                          "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        }`}>
                          <Lock className="ml-0.5 h-2.5 w-2.5" />
                          {n.classification}
                        </Badge>
                      </div>
                      <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed prose prose-invert max-w-none">
                        {n.content.split('\n').map((line, i) => {
                          if (line.startsWith('# ')) return <h4 key={i} className="text-sm font-bold text-white mt-1 mb-1">{line.slice(2)}</h4>;
                          if (line.startsWith('- ')) return <div key={i} className="flex gap-2"><span className="text-slate-500">•</span><span>{line.slice(2)}</span></div>;
                          return <div key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>') }} />;
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ACTIVITY */}
          {section === "activity" && (
            <div className="p-6">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-white">יומן פעילות מערכת</h2>
                <p className="text-xs text-slate-400">מי ביצע מה במערכת על ישות זו</p>
              </div>
              <Card className="border-slate-800 bg-slate-900/40">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                        <th className="py-2 px-3 text-right font-medium">תאריך/שעה</th>
                        <th className="py-2 px-3 text-right font-medium">משתמש</th>
                        <th className="py-2 px-3 text-right font-medium">פעולה</th>
                        <th className="py-2 px-3 text-right font-medium">פרטים</th>
                        <th className="py-2 px-3 text-right font-medium">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeline.slice(0, 20).map((e) => (
                        <tr key={e.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                          <td className="py-2 px-3 font-mono text-[10px] text-slate-400">{e.date} {e.time}</td>
                          <td className="py-2 px-3 text-slate-200">{e.actor}</td>
                          <td className="py-2 px-3">
                            <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">{e.type}</Badge>
                          </td>
                          <td className="py-2 px-3 text-xs text-slate-300 truncate max-w-[300px]">{e.title}</td>
                          <td className="py-2 px-3 font-mono text-[10px] text-slate-500">192.168.1.{Math.floor(Math.random() * 255)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}
        </main>

        {/* RIGHT SIDEBAR - Related dossiers & sharing */}
        <aside className="w-64 flex-shrink-0 border-r border-slate-800 bg-slate-900/30 overflow-y-auto">
          <div className="border-b border-slate-800 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">תיקים קשורים</p>
            <div className="space-y-1">
              {[
                { id: "C-10045", name: "שיכון ובינוי", type: "customer" },
                { id: "C-10234", name: "טבע תעשיות", type: "customer" },
                { id: "PRJ-2024-A", name: "מגדלי ת״א", type: "project" },
                { id: "PRJ-2024-B", name: "בית מלון ר״ג", type: "project" },
                { id: "S-2011", name: "אל-יוניון פלדות", type: "supplier" },
              ].map((r) => (
                <button key={r.id} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-800 text-right">
                  <div className="flex h-6 w-6 items-center justify-center rounded border border-slate-700 bg-slate-800">
                    <FileText className="h-3 w-3 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[9px] text-slate-600">{r.id}</div>
                    <div className="text-slate-300 truncate">{r.name}</div>
                  </div>
                  <ChevronRight className="h-3 w-3 text-slate-600" />
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-slate-800 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">תגיות</p>
            <div className="flex flex-wrap gap-1">
              {subject.tags.map((t) => (
                <Badge key={t} className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">{t}</Badge>
              ))}
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-slate-500 hover:bg-slate-800">
                <Plus className="ml-0.5 h-2.5 w-2.5" />
                הוסף
              </Button>
            </div>
          </div>

          <div className="border-b border-slate-800 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">שיתוף ועבודה</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/20 text-[10px] text-blue-400 font-semibold">ד.כ</div>
                <div className="flex-1">
                  <div className="text-slate-200">דני כהן</div>
                  <div className="text-[9px] text-slate-500">בעלים · צפייה + עריכה</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-400 font-semibold">י.א</div>
                <div className="flex-1">
                  <div className="text-slate-200">יוסי אברהם</div>
                  <div className="text-[9px] text-slate-500">משתף · עריכה</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 text-[10px] text-violet-400 font-semibold">מ.ב</div>
                <div className="flex-1">
                  <div className="text-slate-200">מיכל ברק</div>
                  <div className="text-[9px] text-slate-500">משתפת · קריאה</div>
                </div>
              </div>
              <Button size="sm" variant="outline" className="w-full h-7 border-slate-700 bg-slate-900/50 text-[10px]">
                <Plus className="ml-1 h-2.5 w-2.5" />
                הוסף משתפים
              </Button>
            </div>
          </div>

          <div className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">פעולות מהירות</p>
            <div className="space-y-1">
              <Button size="sm" variant="ghost" className="w-full h-7 justify-start text-xs hover:bg-slate-800">
                <MessageSquare className="ml-2 h-3 w-3" />
                שלח הודעה
              </Button>
              <Button size="sm" variant="ghost" className="w-full h-7 justify-start text-xs hover:bg-slate-800">
                <Eye className="ml-2 h-3 w-3" />
                פתח ב-Graph
              </Button>
              <Button size="sm" variant="ghost" className="w-full h-7 justify-start text-xs hover:bg-slate-800">
                <PieChart className="ml-2 h-3 w-3" />
                דוח מלא
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
