import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Trophy, TrendingUp, Clock, Send, DollarSign, Search,
  Users, CheckCircle2, XCircle, AlertCircle, FileCheck, FilePlus,
  Download, Eye, BarChart3, Calendar, Target, Briefcase, Shield,
  ClipboardList, FolderOpen, Hash, Building2, User, Percent
} from "lucide-react";

const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);

const kpis = [
  { label: "סה\"כ הגשות", value: "47", icon: FileText, color: "text-blue-400", border: "border-blue-500/30" },
  { label: "אחוז זכייה", value: "34%", icon: Trophy, color: "text-emerald-400", border: "border-emerald-500/30" },
  { label: "הצעות פעילות", value: "8", icon: Target, color: "text-purple-400", border: "border-purple-500/30" },
  { label: "ממוצע הצעה", value: fmt(1850000), icon: DollarSign, color: "text-amber-400", border: "border-amber-500/30" },
  { label: "ממתין להחלטה", value: "5", icon: Clock, color: "text-cyan-400", border: "border-cyan-500/30" },
  { label: "הגשות רבעון נוכחי", value: "12", icon: Send, color: "text-rose-400", border: "border-rose-500/30" },
];

type TenderStatus = "טיוטה" | "הוגש" | "בבדיקה" | "זכייה" | "הפסד" | "בוטל";
type TenderType = "ציבורי" | "פרטי" | "מסגרת";

interface Submission {
  id: string; project: string; client: string; type: TenderType;
  deadline: string; value: number; status: TenderStatus; lead: string; competitors: number;
}

const submissions: Submission[] = [
  { id: "TND-401", project: "חלונות אלומיניום — מגדל רמת גן", client: "שיכון ובינוי", type: "ציבורי", deadline: "2026-04-18", value: 3200000, status: "הוגש", lead: "יוסי אברהם", competitors: 5 },
  { id: "TND-402", project: "מעקות בטיחות — מתחם צבאי", client: "משרד הביטחון", type: "ציבורי", deadline: "2026-04-22", value: 5100000, status: "בבדיקה", lead: "דני כהן", competitors: 4 },
  { id: "TND-403", project: "חזיתות זכוכית — מגדל משרדים TLV", client: "קבוצת אלון", type: "פרטי", deadline: "2026-05-01", value: 4800000, status: "טיוטה", lead: "מיכל לוי", competitors: 3 },
  { id: "TND-404", project: "דלתות פלדה — בית ספר חדש", client: "משרד החינוך", type: "ציבורי", deadline: "2026-04-12", value: 980000, status: "זכייה", lead: "שרה גולד", competitors: 6 },
  { id: "TND-405", project: "פרגולות אלומיניום — פארק תעשייה", client: "חברת נכסים בע\"מ", type: "פרטי", deadline: "2026-04-28", value: 1450000, status: "הוגש", lead: "רון דוד", competitors: 3 },
  { id: "TND-406", project: "ויטרינות חנויות — קניון הנגב", client: "קבוצת עזריאלי", type: "פרטי", deadline: "2026-05-10", value: 2100000, status: "טיוטה", lead: "מיכל לוי", competitors: 4 },
  { id: "TND-407", project: "תריסים חשמליים — פרויקט מגורים", client: "אפריקה ישראל", type: "מסגרת", deadline: "2026-04-15", value: 1100000, status: "הפסד", lead: "שרה גולד", competitors: 7 },
  { id: "TND-408", project: "מסגרות פלדה — גשר מעבר", client: "נתיבי ישראל", type: "ציבורי", deadline: "2026-05-20", value: 6200000, status: "בבדיקה", lead: "דני כהן", competitors: 5 },
  { id: "TND-409", project: "חלונות עץ-אלומיניום — שימור", client: "רשות העתיקות", type: "ציבורי", deadline: "2026-04-30", value: 890000, status: "הוגש", lead: "יוסי אברהם", competitors: 2 },
  { id: "TND-410", project: "מחיצות זכוכית — מרכז רפואי", client: "כללית", type: "מסגרת", deadline: "2026-05-15", value: 1750000, status: "בבדיקה", lead: "רון דוד", competitors: 4 },
  { id: "TND-411", project: "דלתות אש — מלון חדש", client: "רשת פתאל", type: "פרטי", deadline: "2026-04-25", value: 2300000, status: "בוטל", lead: "שרה גולד", competitors: 3 },
  { id: "TND-412", project: "קירוי מתכת — אצטדיון", client: "עיריית באר שבע", type: "ציבורי", deadline: "2026-06-01", value: 8500000, status: "טיוטה", lead: "דני כהן", competitors: 6 },
];

const preparations = [
  { id: "TND-403", project: "חזיתות זכוכית — מגדל TLV", progress: 35, docs: 4, docsRequired: 8, specs: "מפרט טכני חלקי", pricing: "בהכנה", team: ["מיכל לוי", "אורי טכני", "נועם מחיר"], dueDate: "2026-05-01",
    checklist: [{ item: "מסמכי רישום חברה", done: true }, { item: "ערבות מכרז", done: false }, { item: "מפרט טכני", done: true }, { item: "כתב כמויות מתומחר", done: false }, { item: "לוח זמנים", done: false }, { item: "רשימת פרויקטים", done: true }, { item: "אישורי ISO", done: false }, { item: "הצעה מסחרית", done: false }] },
  { id: "TND-406", project: "ויטרינות — קניון הנגב", progress: 20, docs: 2, docsRequired: 7, specs: "טרם התחיל", pricing: "המתנה לכמויות", team: ["מיכל לוי", "שרה גולד"], dueDate: "2026-05-10",
    checklist: [{ item: "רישום חברה", done: true }, { item: "ערבות מכרז", done: false }, { item: "מפרט טכני", done: false }, { item: "כתב כמויות", done: false }, { item: "לוח זמנים", done: false }, { item: "אישורי ISO", done: true }, { item: "הצעה מסחרית", done: false }] },
  { id: "TND-412", project: "קירוי מתכת — אצטדיון", progress: 10, docs: 1, docsRequired: 10, specs: "טרם התחיל", pricing: "טרם התחיל", team: ["דני כהן", "אורי טכני", "נועם מחיר", "גלית לוגיסטיקה"], dueDate: "2026-06-01",
    checklist: [{ item: "רישום חברה", done: true }, { item: "ערבות מכרז", done: false }, { item: "מפרט טכני", done: false }, { item: "חישובי קונסטרוקציה", done: false }, { item: "כתב כמויות", done: false }, { item: "קבלני משנה", done: false }, { item: "פוליסת ביטוח", done: false }, { item: "אישורי ISO", done: false }, { item: "הצעה מסחרית", done: false }] },
];

const results = [
  { id: "TND-404", project: "דלתות פלדה — בית ספר", client: "משרד החינוך", value: 980000, result: "זכייה", reason: "מחיר תחרותי ולו\"ז מהיר", ourBid: 980000, winningBid: 980000, competitors: 6, date: "2026-03-28" },
  { id: "TND-407", project: "תריסים חשמליים — מגורים", client: "אפריקה ישראל", value: 1100000, result: "הפסד", reason: "מחיר גבוה ב-12% מהזוכה", ourBid: 1100000, winningBid: 968000, competitors: 7, date: "2026-03-25" },
  { id: "TND-380", project: "מעקות למרפסות — פנינת הים", client: "חברת מגורים", value: 920000, result: "זכייה", reason: "ניסיון מוכח בפרויקטים דומים", ourBid: 920000, winningBid: 920000, competitors: 5, date: "2026-03-15" },
  { id: "TND-375", project: "דלתות כניסה — בית חולים", client: "משרד הבריאות", value: 4100000, result: "הפסד", reason: "לו\"ז אספקה ארוך מדי", ourBid: 4100000, winningBid: 3950000, competitors: 6, date: "2026-03-10" },
  { id: "TND-370", project: "חלונות — מגדל מגורים B", client: "שיכון ובינוי", value: 2800000, result: "זכייה", reason: "איכות טכנית מעולה", ourBid: 2800000, winningBid: 2800000, competitors: 4, date: "2026-02-28" },
  { id: "TND-365", project: "מחיצות פנים — בניין משרדים", client: "אמות השקעות", value: 1600000, result: "הפסד", reason: "קבלן מועדף של הלקוח", ourBid: 1600000, winningBid: 1650000, competitors: 3, date: "2026-02-20" },
  { id: "TND-360", project: "שערי חניון — מרכז מסחרי", client: "קבוצת עזריאלי", value: 750000, result: "זכייה", reason: "מחיר נמוך ואחריות מורחבת", ourBid: 750000, winningBid: 750000, competitors: 4, date: "2026-02-15" },
  { id: "TND-355", project: "קירוי פלדה — מפעל", client: "תעשיות כימיות", value: 5500000, result: "הפסד", reason: "חוסר ניסיון בתחום כימי", ourBid: 5500000, winningBid: 5200000, competitors: 5, date: "2026-02-01" },
];

const documents = [
  { id: "DOC-101", tender: "TND-403", name: "חבילת מכרז — חזיתות זכוכית", type: "חבילת מכרז", pages: 42, lastUpdate: "2026-04-05", status: "בעבודה" },
  { id: "DOC-102", tender: "TND-403", name: "הצעה טכנית — חזיתות זכוכית", type: "הצעה טכנית", pages: 28, lastUpdate: "2026-04-06", status: "בעבודה" },
  { id: "DOC-103", tender: "TND-403", name: "הצעה מסחרית — חזיתות זכוכית", type: "הצעה מסחרית", pages: 12, lastUpdate: "2026-04-03", status: "טיוטה" },
  { id: "DOC-104", tender: "TND-412", name: "חבילת מכרז — קירוי אצטדיון", type: "חבילת מכרז", pages: 56, lastUpdate: "2026-04-07", status: "בעבודה" },
  { id: "DOC-105", tender: "TND-412", name: "הצעה טכנית — קירוי אצטדיון", type: "הצעה טכנית", pages: 0, lastUpdate: "—", status: "טרם התחיל" },
  { id: "DOC-106", tender: "TND-406", name: "חבילת מכרז — ויטרינות קניון", type: "חבילת מכרז", pages: 30, lastUpdate: "2026-04-04", status: "בעבודה" },
  { id: "DOC-107", tender: "TND-406", name: "הצעה טכנית — ויטרינות קניון", type: "הצעה טכנית", pages: 0, lastUpdate: "—", status: "טרם התחיל" },
  { id: "DOC-108", tender: "TND-401", name: "הצעה טכנית — חלונות מגדל", type: "הצעה טכנית", pages: 35, lastUpdate: "2026-04-08", status: "מוכן" },
  { id: "DOC-109", tender: "TND-401", name: "הצעה מסחרית — חלונות מגדל", type: "הצעה מסחרית", pages: 14, lastUpdate: "2026-04-08", status: "מוכן" },
];

const SC: Record<string, string> = {
  "טיוטה": "bg-slate-500/20 text-slate-300 border-slate-500/30", "הוגש": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "בבדיקה": "bg-amber-500/20 text-amber-300 border-amber-500/30", "זכייה": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "הפסד": "bg-red-500/20 text-red-300 border-red-500/30", "בוטל": "bg-gray-500/20 text-gray-400 border-gray-500/30",
};
const TC: Record<string, string> = { "ציבורי": "bg-blue-500/15 text-blue-300 border-blue-500/30", "פרטי": "bg-purple-500/15 text-purple-300 border-purple-500/30", "מסגרת": "bg-teal-500/15 text-teal-300 border-teal-500/30" };
const DC: Record<string, string> = { "מוכן": "bg-emerald-500/20 text-emerald-300", "בעבודה": "bg-amber-500/20 text-amber-300", "טיוטה": "bg-blue-500/20 text-blue-300", "טרם התחיל": "bg-slate-600/30 text-slate-400" };
const statusColor = (s: string) => SC[s] || "bg-slate-500/20 text-slate-300 border-slate-500/30";
const typeColor = (t: string) => TC[t] || "bg-slate-500/15 text-slate-300";
const docStatusColor = (s: string) => DC[s] || "bg-slate-500/20 text-slate-300";

export default function TenderSubmissionsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tab, setTab] = useState("submissions");

  const filtered = submissions.filter(s => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.id.toLowerCase().includes(q) || s.project.includes(search) || s.client.includes(search) || s.lead.includes(search);
    }
    return true;
  });

  const wonCount = results.filter(r => r.result === "זכייה").length;
  const lostCount = results.filter(r => r.result === "הפסד").length;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Send className="h-6 w-6 text-blue-400" />
            ניהול הגשות מכרזים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב הגשות, הכנה, תוצאות ומסמכים — טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-primary"><FilePlus className="w-4 h-4 ml-1" />הגשה חדשה</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`bg-card/50 border ${kpi.border}`}>
              <CardContent className="p-4 text-center">
                <Icon className={`w-5 h-5 mx-auto mb-1 ${kpi.color}`} />
                <div className="text-xl font-bold text-foreground">{kpi.value}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="submissions" className="gap-1"><FileText className="w-3.5 h-3.5" />הגשות</TabsTrigger>
          <TabsTrigger value="preparation" className="gap-1"><ClipboardList className="w-3.5 h-3.5" />הכנה</TabsTrigger>
          <TabsTrigger value="results" className="gap-1"><BarChart3 className="w-3.5 h-3.5" />תוצאות</TabsTrigger>
          <TabsTrigger value="documents" className="gap-1"><FolderOpen className="w-3.5 h-3.5" />מסמכים</TabsTrigger>
        </TabsList>

        {/* Tab 1: Submissions */}
        <TabsContent value="submissions" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש לפי מספר, פרויקט, לקוח..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל הסטטוסים</option>
                  {(["טיוטה", "הוגש", "בבדיקה", "זכייה", "הפסד", "בוטל"] as TenderStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground">
                      <th className="text-right py-2 px-3 font-medium">מס׳ מכרז</th>
                      <th className="text-right py-2 px-3 font-medium">שם הפרויקט</th>
                      <th className="text-right py-2 px-3 font-medium">לקוח</th>
                      <th className="text-right py-2 px-3 font-medium">סוג</th>
                      <th className="text-right py-2 px-3 font-medium">מועד הגשה</th>
                      <th className="text-right py-2 px-3 font-medium">סכום הצעה</th>
                      <th className="text-right py-2 px-3 font-medium">סטטוס</th>
                      <th className="text-right py-2 px-3 font-medium">אחראי</th>
                      <th className="text-center py-2 px-3 font-medium">מתחרים</th>
                      <th className="text-center py-2 px-3 font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => (
                      <tr key={s.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-xs text-blue-400">{s.id}</td>
                        <td className="py-2.5 px-3 font-medium text-foreground">{s.project}</td>
                        <td className="py-2.5 px-3 text-muted-foreground flex items-center gap-1"><Building2 className="w-3.5 h-3.5 shrink-0" />{s.client}</td>
                        <td className="py-2.5 px-3"><Badge className={typeColor(s.type) + " text-[10px]"}>{s.type}</Badge></td>
                        <td className="py-2.5 px-3 text-muted-foreground flex items-center gap-1"><Calendar className="w-3.5 h-3.5 shrink-0" />{s.deadline}</td>
                        <td className="py-2.5 px-3 font-semibold text-foreground">{fmt(s.value)}</td>
                        <td className="py-2.5 px-3"><Badge className={statusColor(s.status) + " text-[10px]"}>{s.status}</Badge></td>
                        <td className="py-2.5 px-3 text-muted-foreground">{s.lead}</td>
                        <td className="py-2.5 px-3 text-center"><Badge variant="outline" className="text-[10px]"><Users className="w-3 h-3 ml-0.5" />{s.competitors}</Badge></td>
                        <td className="py-2.5 px-3 text-center"><Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Eye className="w-3.5 h-3.5" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">מציג {filtered.length} מתוך {submissions.length} הגשות</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Preparation */}
        <TabsContent value="preparation" className="space-y-4">
          {preparations.map(p => (
            <Card key={p.id} className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Hash className="w-4 h-4 text-blue-400" />{p.id} — {p.project}
                  </CardTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />מועד הגשה: {p.dueDate}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground min-w-[80px]">התקדמות כוללת:</span>
                  <Progress value={p.progress} className="flex-1 h-2.5" />
                  <span className="text-sm font-bold text-foreground">{p.progress}%</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1"><FileCheck className="w-3.5 h-3.5" />מסמכים נדרשים</h4>
                    <div className="text-lg font-bold text-foreground">{p.docs} / {p.docsRequired}</div>
                    <Progress value={(p.docs / p.docsRequired) * 100} className="h-1.5" />
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Shield className="w-3.5 h-3.5" />מפרט טכני</h4>
                    <div className="text-sm font-semibold text-foreground">{p.specs}</div>
                    <h4 className="text-xs font-medium text-muted-foreground mt-2">תמחור</h4>
                    <div className="text-sm font-semibold text-foreground">{p.pricing}</div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Users className="w-3.5 h-3.5" />צוות</h4>
                    <div className="flex flex-wrap gap-1">
                      {p.team.map((m, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]"><User className="w-2.5 h-2.5 ml-0.5" />{m}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">צ׳קליסט הכנה:</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {p.checklist.map((c, i) => (
                      <div key={i} className={`flex items-center gap-1.5 text-xs rounded px-2 py-1.5 ${c.done ? "bg-emerald-500/10 text-emerald-300" : "bg-muted/20 text-muted-foreground"}`}>
                        {c.done ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                        {c.item}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Tab 3: Results */}
        <TabsContent value="results" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-card/50 border-emerald-500/30">
              <CardContent className="p-4 text-center">
                <Trophy className="w-5 h-5 mx-auto text-emerald-400 mb-1" />
                <div className="text-2xl font-bold text-emerald-400">{wonCount}</div>
                <p className="text-xs text-muted-foreground">זכיות</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-red-500/30">
              <CardContent className="p-4 text-center">
                <XCircle className="w-5 h-5 mx-auto text-red-400 mb-1" />
                <div className="text-2xl font-bold text-red-400">{lostCount}</div>
                <p className="text-xs text-muted-foreground">הפסדים</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-blue-500/30">
              <CardContent className="p-4 text-center">
                <Percent className="w-5 h-5 mx-auto text-blue-400 mb-1" />
                <div className="text-2xl font-bold text-blue-400">{Math.round((wonCount / results.length) * 100)}%</div>
                <p className="text-xs text-muted-foreground">אחוז זכייה</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-purple-500/30">
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-5 h-5 mx-auto text-purple-400 mb-1" />
                <div className="text-2xl font-bold text-purple-400">{fmt(results.filter(r => r.result === "זכייה").reduce((a, r) => a + r.value, 0))}</div>
                <p className="text-xs text-muted-foreground">סה״כ זכיות</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">תוצאות אחרונות — ניתוח זכייה/הפסד</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {results.map(r => (
                  <div key={r.id} className={`rounded-lg p-3 border ${r.result === "זכייה" ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {r.result === "זכייה" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                        <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                        <span className="font-medium text-foreground">{r.project}</span>
                      </div>
                      <Badge className={r.result === "זכייה" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}>
                        {r.result}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">לקוח: </span>
                        <span className="text-foreground">{r.client}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">ההצעה שלנו: </span>
                        <span className="text-foreground font-medium">{fmt(r.ourBid)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">הצעה זוכה: </span>
                        <span className="text-foreground font-medium">{fmt(r.winningBid)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">מתחרים: </span>
                        <span className="text-foreground">{r.competitors}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">תאריך: </span>
                        <span className="text-foreground">{r.date}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs">
                      <span className="text-muted-foreground">סיבה: </span>
                      <span className={r.result === "זכייה" ? "text-emerald-300" : "text-red-300"}>{r.reason}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Documents */}
        <TabsContent value="documents" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><FolderOpen className="w-4 h-4 text-amber-400" />מסמכי מכרזים</CardTitle>
                <Button size="sm" variant="outline"><FilePlus className="w-4 h-4 ml-1" />העלאת מסמך</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground">
                      <th className="text-right py-2 px-3 font-medium">מזהה</th>
                      <th className="text-right py-2 px-3 font-medium">מכרז</th>
                      <th className="text-right py-2 px-3 font-medium">שם מסמך</th>
                      <th className="text-right py-2 px-3 font-medium">סוג</th>
                      <th className="text-center py-2 px-3 font-medium">עמודים</th>
                      <th className="text-right py-2 px-3 font-medium">עדכון אחרון</th>
                      <th className="text-right py-2 px-3 font-medium">סטטוס</th>
                      <th className="text-center py-2 px-3 font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map(d => (
                      <tr key={d.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-xs text-blue-400">{d.id}</td>
                        <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">{d.tender}</td>
                        <td className="py-2.5 px-3 font-medium text-foreground">{d.name}</td>
                        <td className="py-2.5 px-3">
                          <Badge variant="outline" className="text-[10px]">
                            {d.type === "חבילת מכרז" ? <Briefcase className="w-3 h-3 ml-0.5" /> : d.type === "הצעה טכנית" ? <Shield className="w-3 h-3 ml-0.5" /> : <DollarSign className="w-3 h-3 ml-0.5" />}
                            {d.type}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-center text-muted-foreground">{d.pages || "—"}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{d.lastUpdate}</td>
                        <td className="py-2.5 px-3"><Badge className={docStatusColor(d.status) + " text-[10px]"}>{d.status}</Badge></td>
                        <td className="py-2.5 px-3 text-center flex justify-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Eye className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Download className="w-3.5 h-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">סה״כ {documents.length} מסמכים</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}